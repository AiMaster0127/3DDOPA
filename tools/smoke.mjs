/**
 * ブラウザ実機スモークテスト。
 *
 * 「起動する / 動かせる / 壁で止まる / コンソールが汚れていない / HUDが収まる」を
 * 実際の Chromium で確認する。フェーズを追加するたびにここへ検証項目を足す。
 *
 *   node tools/smoke.mjs [desktop|mobile|landscape] [出力PNG]
 *
 * 事前に別ターミナルで `python3 -m http.server 8080` を起動しておくこと。
 */
import { chromium } from 'playwright';

const MODE = process.argv[2] || 'desktop';
const OUT  = process.argv[3] || `smoke-${MODE}.png`;
const BASE = process.env.BASE_URL || 'http://localhost:8080/';

const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 ' +
                  '(KHTML, like Gecko) Chrome/120 Mobile Safari/537.36';

const VIEWS = {
  desktop:   { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
  mobile:    { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: MOBILE_UA },
  landscape: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: MOBILE_UA },
};
const VIEW = VIEWS[MODE];
if (!VIEW) { console.error(`未知のモード: ${MODE}`); process.exit(2); }

const browser = await chromium.launch({
  // 環境に用意された Chromium を使う（Playwright同梱版のダウンロードを避ける）
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await (await browser.newContext(VIEW)).newPage();

const logs = [], errors = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => errors.push(String(e)));
page.on('requestfailed', r => errors.push(`REQ FAIL ${r.url()} :: ${r.failure()?.errorText}`));

const fails = [];
const check = (ok, label, detail) => {
  console.log(`${ok ? ' OK ' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
  if (!ok) fails.push(label);
};

await page.goto(BASE, { waitUntil: 'load' });
await page.waitForFunction(() => {
  const m = document.getElementById('bootMsg');
  return m && m.textContent.trim() && m.textContent !== '読み込み中…';
}, { timeout: 20000 }).catch(() => {});

const bootMsg = (await page.textContent('#bootMsg')).trim();
check(bootMsg === 'READY', '起動', bootMsg);
if (bootMsg !== 'READY') { console.log(errors.join('\n') || logs.join('\n')); await browser.close(); process.exit(1); }

await page.click('#startBtn');
await page.waitForTimeout(300);
// ★フェーズ4以降、起動直後は拠点(HOME)。操作の検証には出撃が要る
await page.evaluate(() => __DOPA.game.startRun());
await page.waitForTimeout(700);

// ---- 移動：入力で自機が動くか ----
const before = await page.evaluate(() => ({ x: __DOPA.game.player.x, z: __DOPA.game.player.z }));
if (VIEW.isMobile) {
  const vw = VIEW.viewport.width, vh = VIEW.viewport.height;
  const [ox, oy] = [vw * 0.3, vh * 0.72];
  const ev = (t, x, y) => page.dispatchEvent('#gl', t, { pointerId: 1, pointerType: 'touch', clientX: x, clientY: y, isPrimary: true, bubbles: true });
  await ev('pointerdown', ox, oy);
  for (let i = 1; i <= 6; i++) await ev('pointermove', ox - i * 9, oy - i * 9);
  await page.waitForTimeout(1000);
  await ev('pointerup', ox - 54, oy - 54);
} else {
  await page.keyboard.down('w'); await page.keyboard.down('d');
  await page.waitForTimeout(1000);
  await page.keyboard.up('w'); await page.keyboard.up('d');
}
await page.waitForTimeout(350);

const st = await page.evaluate(() => {
  const g = __DOPA.game, c = document.getElementById('gl');
  return {
    x: g.player.x, z: g.player.z,
    camX: g.scene.camera.position.x, camZ: g.scene.camera.position.z,
    tier: g.quality.name, draws: g.scene.drawCalls, tris: g.scene.renderer.info.render.triangles,
    fov: +g.scene.camera.fov.toFixed(1), dpr: devicePixelRatio,
    css: `${innerWidth}x${innerHeight}`, buf: `${c.width}x${c.height}`,
    hudFits: document.getElementById('statPanel').getBoundingClientRect().right < innerWidth,
  };
});

const moved = Math.hypot(st.x - before.x, st.z - before.z);
check(moved > 0.5, '入力で自機が移動する', `${moved.toFixed(2)} ユニット`);
// カメラは自機のXを追い、Zは自機+オフセット付近にいるはず
check(Math.abs(st.camX - st.x) < 3, 'カメラが自機に追従する', `camX=${st.camX.toFixed(2)} / playerX=${st.x.toFixed(2)}`);

// ---- 壁：場外に出られないか ----
// ★レベルアップ選択中は update() が止まる（仕様）。
//   startRun() で確実に PLAYING に戻してから測らないと、動かないのを壁のせいと誤認する。
const clamp = await page.evaluate(async () => {
  const g = __DOPA.game;
  g.startRun();
  g.player.x = 500; g.player.z = 500;
  await new Promise(r => setTimeout(r, 300));
  return { r: Math.hypot(g.player.x, g.player.z), arena: g.arena.radius, state: g.state };
});
check(clamp.r <= clamp.arena, 'アリーナ外に出られない',
      `半径 ${clamp.r.toFixed(2)} <= ${clamp.arena} (state=${clamp.state})`);

// ---- 戦闘コア（フェーズ2） ----
// 湧きを待つと運任せになるので、自機の周りに決め打ちで配置して検証する
const fight = await page.evaluate(async () => {
  const g = __DOPA.game;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const out = {};

  const trial = async (weaponId, dist, ms, count) => {
    g.startRun();
    g.equip(weaponId);
    g.player.takeDamage = () => false;              // 攻撃性能だけを見たいので不死にする
    const placed = g.spawner.spawnBurst(count, g.player, dist);
    await wait(ms);
    return { placed, kills: g.combat.kills, dmg: Math.round(g.combat.damageDealt) };
  };

  // 近接は扇の中の全員に当たるので密集させる。
  // ★射撃は貫通でダメージが分散するため、等距離に大量に置くと
  //   総ダメージは出るのに1体も落ちない、という紛れが起きる。
  //   「倒せるか」を見たいので的を絞る。
  out.melee = await trial('wp_iron_sword', 2.6, 4000, 24);
  out.ranged = await trial('wp_short_bow', 8.0, 5000, 8);

  // 敵同士が団子にならないか
  g.startRun();
  g.player.takeDamage = () => false;
  g.spawner.spawnBurst(40, g.player, 6);
  await wait(1500);
  const act = g.enemies.list.filter(e => e.active);
  let deep = 0;
  for (let i = 0; i < act.length; i++) for (let j = i + 1; j < act.length; j++) {
    const a = act[i], c = act[j];
    const need = a.radius + c.radius;
    if (Math.hypot(a.x - c.x, a.z - c.z) < need * 0.55) deep++;
  }
  out.separation = { alive: act.length, deepOverlaps: deep };

  // 被弾して死ぬか
  g.startRun();
  delete g.player.takeDamage;                        // プロトタイプの実装に戻す
  g.player.hp = 10;
  g.spawner.spawnBurst(12, g.player, 2.0);
  await wait(3000);
  out.death = { dead: g.player.dead, state: g.state, over: !document.getElementById('over').hidden };

  // 再挑戦で完全に初期化されるか
  document.getElementById('retryBtn').click();
  await wait(400);
  out.retry = { state: g.state, hp: g.player.hp, kills: g.combat.kills,
                enemies: g.enemies.count, projs: g.projectiles.count,
                elapsed: +g.elapsed.toFixed(1), over: document.getElementById('over').hidden };
  return out;
});

check(fight.melee.kills > 0, '近接武器で敵を倒せる',
      `配置 ${fight.melee.placed} 体 → 撃破 ${fight.melee.kills} / ダメージ ${fight.melee.dmg}`);
check(fight.ranged.kills > 0, '射撃武器で敵を倒せる',
      `配置 ${fight.ranged.placed} 体 → 撃破 ${fight.ranged.kills} / ダメージ ${fight.ranged.dmg}`);
check(fight.separation.deepOverlaps === 0, '敵同士が重ならない',
      `${fight.separation.alive} 体中 深い重なり ${fight.separation.deepOverlaps} ペア`);
check(fight.death.dead && fight.death.state === 'dead' && fight.death.over,
      '被弾して死ぬと死亡画面が出る', JSON.stringify(fight.death));
check(fight.retry.state === 'playing' && fight.retry.kills === 0 && fight.retry.projs === 0 &&
      fight.retry.elapsed < 1 && fight.retry.over,
      '再挑戦でランが初期化される', JSON.stringify(fight.retry));

// ---- 成長（フェーズ3） ----
const prog = await page.evaluate(async () => {
  const g = __DOPA.game;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const out = {};

  g.startRun();
  g.equip('wp_iron_sword');
  g.player.takeDamage = () => false;
  const lv0 = g.levels.level;

  // 敵を倒す → ジェムが落ちる → 吸い寄せて回収 → レベルアップ
  g.spawner.spawnBurst(30, g.player, 2.6);
  let sawGems = 0;
  for (let i = 0; i < 40; i++) {
    await wait(100);
    sawGems = Math.max(sawGems, g.pickups.count);
    if (g.state === 'levelup') break;
  }
  out.chain = { lv0, lv: g.levels.level, sawGems, kills: g.combat.kills,
                state: g.state, uiVisible: !document.getElementById('levelup').hidden,
                cards: document.querySelectorAll('.lv-card').length };

  // カードを押すと確定してゲームが再開するか
  document.querySelector('.lv-card')?.click();
  await wait(250);
  out.pick = { state: g.state, skillCount: g.skills.levels.size,
               uiHidden: document.getElementById('levelup').hidden };

  // ★パッシブとアクティブは効き方が違うので別々に確かめる。
  //   3択はランダムなので、ここは特定のスキルを直接習得させて決定的に検証する。
  const atk0 = g.player.stats.atkPct;
  g.skills.take('sk_power');
  out.passive = { before: +atk0.toFixed(4), after: +g.player.stats.atkPct.toFixed(4) };

  // アクティブ：武器の射程外・スキルの射程内に敵を固めて、武器と混ざらないようにする
  g.startRun();
  g.player.takeDamage = () => false;
  g.equip('wp_iron_sword');                 // 射程3.1（+敵半径0.55 = 3.65まで）
  g.skills.take('sk_nova');                 // 半径4.9
  g.spawner.spawnBurst(12, g.player, 4.2);
  for (const e of g.enemies.list) if (e.active) e.speed = 0;   // 近寄らせない
  const dmg0 = g.combat.damageDealt;
  await wait(1400);                         // ノヴァの初回は0.6秒後
  out.active = { dmg: g.combat.damageDealt - dmg0,
                 weaponTarget: !!g.autoAim.target };
  return out;
});

check(prog.chain.lv > prog.chain.lv0 && prog.chain.sawGems > 0,
      '撃破→経験値ジェム→回収→レベルアップ',
      `撃破 ${prog.chain.kills} / ジェム最大 ${prog.chain.sawGems} 個 / Lv.${prog.chain.lv0}→Lv.${prog.chain.lv}`);
check(prog.chain.state === 'levelup' && prog.chain.uiVisible && prog.chain.cards >= 2,
      'レベルアップでゲームが止まり選択肢が出る',
      `state=${prog.chain.state} / カード ${prog.chain.cards} 枚`);
check(prog.pick.skillCount > 0 && prog.pick.state === 'playing' && prog.pick.uiHidden,
      'スキルを選ぶとゲームが再開する',
      `習得 ${prog.pick.skillCount} 個 / state=${prog.pick.state}`);
check(prog.passive.after > prog.passive.before,
      'パッシブスキルがステータスに乗る',
      `攻撃力補正 +${(prog.passive.before * 100).toFixed(1)}% → +${(prog.passive.after * 100).toFixed(1)}%`);
check(prog.active.dmg > 0 && !prog.active.weaponTarget,
      'アクティブスキルが自動でダメージを出す',
      `武器の射程外でノヴァのみ ${prog.active.dmg} ダメージ（武器のターゲット: ${prog.active.weaponTarget}）`);

// ---- 永続保存（リロードを跨ぐか） ----
const beforeReload = await page.evaluate(async () => {
  const g = __DOPA.game;
  g.meta.meta.accountXp = 0;
  g.meta.meta.accountLv = 1;
  const res = g.meta.finishRun({ kills: 500, elapsed: 300, runLv: 12, gems: 77 });
  return { lv: g.meta.level, xp: g.meta.xp, gems: g.save.data.wallet.gems, res };
});
await page.reload({ waitUntil: 'load' });
await page.click('#startBtn');
await page.waitForTimeout(400);
const afterReload = await page.evaluate(() => {
  const g = __DOPA.game;
  return { lv: g.meta.level, xp: g.meta.xp, gems: g.save.data.wallet.gems,
           runs: g.save.data.stats.totalRuns, kills: g.save.data.stats.totalKills,
           bonusAtk: +g.meta.bonus().atkPct.toFixed(4) };
});
check(afterReload.lv === beforeReload.lv && afterReload.gems === beforeReload.gems &&
      afterReload.lv > 1,
      'リロードしても永続進行が残る',
      `Lv.${beforeReload.lv}→Lv.${afterReload.lv} / ジェム ${afterReload.gems} / 累計ラン ${afterReload.runs} / 永続攻撃補正 +${(afterReload.bonusAtk * 100).toFixed(1)}%`);

// ---- ガチャ・装備（フェーズ4） ----
const gear = await page.evaluate(async () => {
  const g = __DOPA.game;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const out = {};

  // 拠点に戻れるか
  g.goHome();
  await wait(150);
  out.home = { state: g.state, visible: !document.getElementById('home').hidden,
               hudHidden: document.getElementById('hud').hidden };

  // 引ける → 所持が増える → 保存される
  g.save.data.wallet.gems = 50000;
  const owned0 = Object.keys(g.inventory.owned).length;
  const gems0 = g.save.data.wallet.gems;
  g.gachaDirector.close();
  const res = g.gacha.pullTen();
  out.pull = { owned0, owned1: Object.keys(g.inventory.owned).length,
               got: res.length, spent: gems0 - g.save.data.wallet.gems,
               persisted: JSON.parse(localStorage.getItem('dopa_arena_save')).gacha.totalPulls };

  // ダブり → かけら → 限界突破
  const anyId = Object.keys(g.inventory.owned)[0];
  const own = g.inventory.entry(anyId);
  own.shards = 99;
  const lb0 = own.lb;
  const okLb = g.inventory.limitBreak(anyId);
  out.lb = { id: anyId, lb0, lb1: own.lb, ok: okLb, shardsLeft: own.shards };

  // 強化 → 攻撃力が上がる
  g.save.data.wallet.dust = 99999;
  const atk0 = g.inventory.atkOf(anyId);
  g.inventory.enhance(anyId);
  out.enh = { atk0: +atk0.toFixed(1), atk1: +g.inventory.atkOf(anyId).toFixed(1) };

  // 装備すると戦闘の攻撃力に反映される（表示と実戦力が一致するか）
  const strongest = g.inventory.list()[0];
  g.equip(strongest.id);
  g.startRun();
  await wait(120);
  const shown = g.inventory.atkOf(strongest.id);
  const actual = g.weapons.effectiveAtk({ stats: { atkPct: 0 } });
  out.equip = { id: strongest.id, equipped: g.inventory.equippedId,
                weapon: g.weapons.weapon.id,
                shown: +shown.toFixed(2), actual: +actual.toFixed(2) };

  // 特殊効果（炎上・凍結）が敵に乗るか
  // ★一撃で倒せる敵だと、炎上が乗る前に消えて検証にならない。
  //   硬くして動かない敵を並べ、効果が「生きている敵に乗る」ことを見る。
  const { WEAPON_BY_ID } = await import('/src/data/weapons.js');
  if (!g.inventory.has('wp_flare_blade')) g.inventory.grant(WEAPON_BY_ID.get('wp_flare_blade'), 'SSR');
  g.startRun();
  g.player.takeDamage = () => false;
  g.equip('wp_flare_blade');                 // 炎上40% / 爆発18%
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const e = g.spawner.spawnAt('en_brute', g.player.x + Math.sin(a) * 2.4, g.player.z + Math.cos(a) * 2.4);
    if (e) { e.maxHp = e.hp = 8000; e.speed = 0; }
  }
  await wait(2500);
  let burning = 0, alive = 0;
  for (const e of g.enemies.list) if (e.active) { alive++; if (e.burnT > 0) burning++; }
  out.effects = { burning, alive, weapon: g.weapons.weapon.id, dmg: Math.round(g.combat.damageDealt) };
  return out;
});

check(gear.home.state === 'home' && gear.home.visible && gear.home.hudHidden,
      '拠点に戻れる', `state=${gear.home.state}`);
check(gear.pull.owned1 > gear.pull.owned0 && gear.pull.got === 10 && gear.pull.spent === 1000,
      '10連で武器が増え通貨が減る',
      `所持 ${gear.pull.owned0}→${gear.pull.owned1} / 消費 💎${gear.pull.spent}`);
check(gear.pull.persisted > 0, 'ガチャ結果が即座に保存される',
      `localStorage の累計 ${gear.pull.persisted} 回`);
check(gear.lb.ok && gear.lb.lb1 > gear.lb.lb0,
      'ダブりのかけらで限界突破できる',
      `${gear.lb.id}: 限界突破 ${gear.lb.lb0}→${gear.lb.lb1} / 残りかけら ${gear.lb.shardsLeft}`);
check(gear.enh.atk1 > gear.enh.atk0, '強化粉で武器を強化できる',
      `攻撃力 ${gear.enh.atk0} → ${gear.enh.atk1}`);
check(gear.equip.equipped === gear.equip.id && gear.equip.weapon === gear.equip.id &&
      Math.abs(gear.equip.shown - gear.equip.actual) < 0.01,
      '装備が戦闘に反映され、表示攻撃力と一致する',
      `${gear.equip.id} 表示 ${gear.equip.shown} / 実戦 ${gear.equip.actual}`);
check(gear.effects.burning > 0, '武器の特殊効果が敵に乗る',
      `${gear.effects.weapon}: 生存 ${gear.effects.alive} 体中 炎上中 ${gear.effects.burning} 体 / 総ダメージ ${gear.effects.dmg}`);

// ---- ステージ・ボス（フェーズ5） ----
const stage = await page.evaluate(async () => {
  const g = __DOPA.game;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const out = {};

  // 解禁：最初は1しか遊べない
  g.save.data.meta.clearedStages = {};
  out.locked = { highest: g.stageUI.highestUnlocked() };

  // ステージ3（ボスあり）へ
  g.save.data.meta.clearedStages = { 1: true, 2: true };
  g.selectStage(3);
  g.startRun();
  g.player.takeDamage = () => false;
  await wait(250);
  out.run = { stage: g.stageId, dur: g.spawner.duration, hasBoss: g.spawner.hasBoss,
              hpMul: +g.spawner.hpMul.toFixed(2), atkMul: +g.spawner.atkMul.toFixed(2) };

  // 射撃敵の弾が飛ぶか。
  // ★敵弾の寿命は 射程/弾速 ＝ 1秒未満。一瞬だけ数えると見逃すので、
  //   窓の中を刻んで最大値を取る。
  g.spawner.spawnAt('en_stinger', g.player.x + 10, g.player.z);
  let hostile = 0;
  for (let i = 0; i < 30; i++) {
    await wait(100);
    let n = 0;
    for (const p of g.projectiles.list) if (p.active && p.hostile) n++;
    hostile = Math.max(hostile, n);
    if (hostile > 0) break;
  }
  out.hostile = hostile;

  // 分裂：倒すと欠片が残る
  const n0 = g.enemies.count;
  const blob = g.spawner.spawnAt('en_blob', g.player.x + 3, g.player.z);
  if (blob) g.combat.hitEnemy(blob, 999999, false, g.player.x, g.player.z, 0);
  await wait(60);
  out.split = { before: n0, after: g.enemies.count };

  // ボス出現 → HPバーと専用描画
  g.spawner.elapsed = 149.9;
  await wait(900);
  const boss = g.enemies.findBoss();
  out.boss = boss ? { id: boss.arch.id, hp: Math.round(boss.hp),
                      bar: !document.getElementById('bossBar').hidden,
                      view: g.bossView.group.visible } : null;

  // ★プールが満杯でもボスが湧くか（湧かないとステージが永遠にクリアできない）
  g.selectStage(3); g.startRun(); g.player.takeDamage = () => false;
  while (g.enemies.pool.free > 0) if (!g.spawner.spawnAt('en_slime', g.player.x + 20, g.player.z)) break;
  const free = g.enemies.pool.free;
  g.spawner.elapsed = 149.9;
  await wait(900);
  out.bossWhenFull = { free, spawned: !!g.enemies.findBoss() };

  // クリア → 報酬・解禁・記録
  const gems0 = g.save.data.wallet.gems;
  const b2 = g.enemies.findBoss();
  if (b2) g.combat.hitEnemy(b2, 999999, false, g.player.x, g.player.z, 0);
  g.spawner.elapsed = 9999;
  await wait(400);
  out.clear = { state: g.state, screen: !document.getElementById('clear').hidden,
                marked: !!g.save.data.meta.clearedStages[3],
                gained: g.save.data.wallet.gems - gems0,
                unlocked4: g.stageUI.isUnlocked(
                  (await import('/src/data/stages.js')).STAGE_BY_ID.get(4)) };
  return out;
});

check(stage.locked.highest === 1, '未クリアではステージ1しか遊べない',
      `解禁上限 ${stage.locked.highest}`);
check(stage.run.stage === 3 && stage.run.hasBoss && stage.run.hpMul > 1.5,
      'ステージごとに難度が上がる',
      `ステージ${stage.run.stage} / ${stage.run.dur}秒 / 敵HP ×${stage.run.hpMul} / 敵攻撃 ×${stage.run.atkMul}`);
check(stage.hostile > 0, '射撃敵が自機を狙って撃つ', `飛行中の敵弾 ${stage.hostile} 発`);
check(stage.split.after > stage.split.before - 1, '分裂する敵が欠片を残す',
      `${stage.split.before} 体 → 倒して ${stage.split.after} 体`);
check(!!stage.boss && stage.boss.bar && stage.boss.view, 'ボスが出現しHPバーと専用描画が出る',
      stage.boss ? `${stage.boss.id} HP${stage.boss.hp}` : '出現せず');
check(stage.bossWhenFull.spawned, 'プールが満杯でもボスが湧く',
      `空きスロット ${stage.bossWhenFull.free} で出現 ${stage.bossWhenFull.spawned}`);
check(stage.clear.state === 'dead' && stage.clear.screen && stage.clear.marked &&
      stage.clear.gained > 0 && stage.clear.unlocked4,
      'ボス撃破でクリア・報酬・次ステージ解禁',
      `報酬 💎${stage.clear.gained} / ステージ4解禁 ${stage.clear.unlocked4}`);

// ---- メタ進行（フェーズ6） ----
const metaRes = await page.evaluate(async () => {
  const g = __DOPA.game;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const out = {};

  g.goHome();
  await wait(120);

  // 拠点強化：買うとステータスに乗る
  g.save.data.wallet.gems = 200000;
  const atk0 = g.meta.bonus().atkPct;
  const gems0 = g.save.data.wallet.gems;
  const cost = g.meta.upgradeCost('atk');
  const bought = g.meta.buyUpgrade('atk');
  g.skills.recompute();
  out.upgrade = { bought, cost, spent: gems0 - g.save.data.wallet.gems,
                  before: +atk0.toFixed(4), after: +g.meta.bonus().atkPct.toFixed(4),
                  onPlayer: +g.player.stats.atkPct.toFixed(4) };

  // 開始レベルの強化 → ランがそのレベルで始まる
  g.meta.meta.upgrades.startLv = 2;
  g.startRun();
  await wait(120);
  out.startLv = { level: g.levels.level, runLv: g.player.runLv, maxHp: g.player.maxHp };
  g.meta.meta.upgrades.startLv = 0;

  // 実績：条件を満たすと自動で達成し報酬が入る
  g.save.data.achievements = {};
  g.save.data.stats.totalKills = 0;
  const w0 = g.save.data.wallet.gems;
  g.save.data.stats.totalKills = 1200;
  const got = g.meta.checkAchievements();
  out.ach = { gained: got.map(a => a.id), gems: g.save.data.wallet.gems - w0,
              progress: g.meta.achievementProgress() };

  // アンロック：ステージ8クリアで上級バナーが解放される
  const before = g.gacha.availableBanners().length;
  g.save.data.meta.clearedStages[8] = true;
  g.meta.checkAchievements();
  const after = g.gacha.availableBanners().length;
  out.unlock = { before, after, unlocked: g.meta.isUnlocked('banner_prime') };

  // 上級バナーは N を排出しない
  g.gacha.setBanner('prime');
  g.save.data.wallet.gems = 300000;
  let nCount = 0, total = 0;
  for (let i = 0; i < 300; i++) {
    const r = g.gacha.pullSingle();
    if (!r) break;
    total++;
    if (r[0].rarity === 'N') nCount++;
  }
  out.prime = { total, nCount, banner: g.gacha.banner.id };
  g.gacha.setBanner('standard');

  // 永続保存
  g.save.saveNow();
  const raw = JSON.parse(localStorage.getItem('dopa_arena_save'));
  out.saved = { atkUp: raw.meta.upgrades.atk, unlocks: raw.meta.unlocks,
                achCount: Object.keys(raw.achievements).length };
  return out;
});

check(metaRes.upgrade.bought && metaRes.upgrade.after > metaRes.upgrade.before &&
      Math.abs(metaRes.upgrade.onPlayer - metaRes.upgrade.after) < 1e-6,
      '拠点強化を買うと全ランに乗る',
      `💎${metaRes.upgrade.spent} で 攻撃補正 +${(metaRes.upgrade.before * 100).toFixed(1)}% → +${(metaRes.upgrade.after * 100).toFixed(1)}%`);
check(metaRes.startLv.level === 3 && metaRes.startLv.runLv === 3,
      '開始レベルの強化がランに反映される',
      `Lv.${metaRes.startLv.level} 開始 / 最大HP ${metaRes.startLv.maxHp}`);
check(metaRes.ach.gained.length >= 2 && metaRes.ach.gems > 0,
      '条件を満たすと実績が自動達成され報酬が入る',
      `${metaRes.ach.gained.join(', ')} / 💎${metaRes.ach.gems} / 進捗 ${metaRes.ach.progress.have}/${metaRes.ach.progress.total}`);
check(metaRes.unlock.after > metaRes.unlock.before && metaRes.unlock.unlocked,
      '実績で新バナーが解放される',
      `バナー ${metaRes.unlock.before} → ${metaRes.unlock.after} 種`);
check(metaRes.prime.nCount === 0 && metaRes.prime.total > 200,
      '上級バナーはNを排出しない',
      `${metaRes.prime.total}回中 N ${metaRes.prime.nCount}回`);
check(metaRes.saved.atkUp > 0 && metaRes.saved.unlocks.includes('banner_prime') &&
      metaRes.saved.achCount > 0,
      '強化・実績・解放がセーブに残る',
      `強化Lv.${metaRes.saved.atkUp} / 解放 ${metaRes.saved.unlocks.join(',')} / 実績 ${metaRes.saved.achCount}件`);

check(st.draws <= 100, 'draw call が予算内', `${st.draws} <= 100`);
check(st.tris <= 60000, '三角形数が予算内', `${st.tris} <= 60000`);
check(st.hudFits, 'HUDが画面内に収まる', `${st.css} / 描画バッファ ${st.buf} / DPR ${st.dpr} / 垂直FOV ${st.fov} / ティア ${st.tier}`);

const noisy = logs.filter(l => l.startsWith('[error]') || l.startsWith('[warning]'));
check(noisy.length === 0 && errors.length === 0, 'コンソールがクリーン',
      [...noisy, ...errors].join(' | ') || 'error/warning なし');

await page.evaluate(() => { __DOPA.game.player.x = 0; __DOPA.game.player.z = -6; });
await page.waitForTimeout(500);
await page.screenshot({ path: OUT });
console.log(`\nスクリーンショット: ${OUT}`);

await browser.close();
if (fails.length) { console.error(`\n失敗 ${fails.length} 件: ${fails.join(', ')}`); process.exit(1); }
console.log('\nすべて合格');
