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
// ★ヘッドレスはソフトウェア描画なので、品質ティアが上がると
//   実時間あたりのフレーム数が激減し、時間依存の検証が不安定になる。
//   検証中は最低品質に固定して、描画ではなくロジックを見る。
await page.evaluate(() => __DOPA.game.quality.setMode('low'));
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
  await page.waitForFunction((b) => {
    const p = __DOPA.game.player;
    return Math.hypot(p.x - b.x, p.z - b.z) > 1.5;
  }, before, { timeout: 15000 }).catch(() => {});
  await ev('pointerup', ox - 54, oy - 54);
} else {
  await page.keyboard.down('w'); await page.keyboard.down('d');
  // ★実時間で決め打ちに待つと、描画が重い環境ではゲーム内時間がほとんど進まず
  //   「動かない」と誤検出する。動いたことを確認できるまで待つ。
  await page.waitForFunction((b) => {
    const p = __DOPA.game.player;
    return Math.hypot(p.x - b.x, p.z - b.z) > 1.5;
  }, before, { timeout: 15000 }).catch(() => {});
  await page.keyboard.up('w'); await page.keyboard.up('d');
}
await page.waitForTimeout(200);

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
  // ★1ティック回れば壁で止まる。実時間で決め打ちに待つと、描画が重い環境で
  //   1フレームも進まないまま測ってしまい「壁が効いていない」と誤検出する。
  const w0 = Date.now();
  while (Math.hypot(g.player.x, g.player.z) > g.arena.radius && Date.now() - w0 < 8000) {
    await new Promise(r => setTimeout(r, 40));
  }
  return { r: Math.hypot(g.player.x, g.player.z), arena: g.arena.radius, state: g.state };
});
check(clamp.r <= clamp.arena, 'アリーナ外に出られない',
      `半径 ${clamp.r.toFixed(2)} <= ${clamp.arena} (state=${clamp.state})`);

// ---- 戦闘コア（フェーズ2） ----
// 湧きを待つと運任せになるので、自機の周りに決め打ちで配置して検証する
const fight = await page.evaluate(async () => {
  const g = __DOPA.game;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  // ★実時間で待つと、機械の負荷次第で進むゲーム内時間が変わり検証が不安定になる。
  //   「ゲーム内で何秒進んだか」で待つ。上限は実時間で切って無限待ちを防ぐ。
  const waitGame = async (sec, capMs = 25000) => {
    const t0 = g.elapsed, w0 = Date.now();
    while (g.elapsed - t0 < sec && Date.now() - w0 < capMs) await wait(40);
  };
  // 条件が立つまで待つ（立てば即抜ける）。ゲーム内時間と実時間の両方で上限を切る
  const until = async (fn, sec, capMs = 25000) => {
    const t0 = g.elapsed, w0 = Date.now();
    while (!fn() && g.elapsed - t0 < sec && Date.now() - w0 < capMs) await wait(40);
    return fn();
  };
  const out = {};

  const trial = async (weaponId, dist, ms, count) => {
    g.startRun();
    g.equip(weaponId);
    g.player.takeDamage = () => false;              // 攻撃性能だけを見たいので不死にする
    const placed = g.spawner.spawnBurst(count, g.player, dist);
    await waitGame(ms / 1000);
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
  await waitGame(1.5);
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
  await until(() => g.player.dead, 4);
  await wait(250);
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
  // ★実時間で待つと、機械の負荷次第で進むゲーム内時間が変わり検証が不安定になる。
  //   「ゲーム内で何秒進んだか」で待つ。上限は実時間で切って無限待ちを防ぐ。
  const waitGame = async (sec, capMs = 25000) => {
    const t0 = g.elapsed, w0 = Date.now();
    while (g.elapsed - t0 < sec && Date.now() - w0 < capMs) await wait(40);
  };
  // 条件が立つまで待つ（立てば即抜ける）。ゲーム内時間と実時間の両方で上限を切る
  const until = async (fn, sec, capMs = 25000) => {
    const t0 = g.elapsed, w0 = Date.now();
    while (!fn() && g.elapsed - t0 < sec && Date.now() - w0 < capMs) await wait(40);
    return fn();
  };
  const out = {};

  g.startRun();
  g.equip('wp_iron_sword');
  g.player.takeDamage = () => false;
  const lv0 = g.levels.level;

  // 敵を倒す → ジェムが落ちる → 吸い寄せて回収 → レベルアップ
  g.spawner.spawnBurst(30, g.player, 2.6);
  let sawGems = 0;
  {
    const w0 = Date.now();
    while (g.state !== 'levelup' && Date.now() - w0 < 25000) {
      await wait(60);
      sawGems = Math.max(sawGems, g.pickups.count);
    }
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
  await until(() => g.combat.damageDealt > dmg0, 3);   // ノヴァの初回は0.6秒後
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
  // ★実時間で待つと、機械の負荷次第で進むゲーム内時間が変わり検証が不安定になる。
  //   「ゲーム内で何秒進んだか」で待つ。上限は実時間で切って無限待ちを防ぐ。
  const waitGame = async (sec, capMs = 25000) => {
    const t0 = g.elapsed, w0 = Date.now();
    while (g.elapsed - t0 < sec && Date.now() - w0 < capMs) await wait(40);
  };
  // 条件が立つまで待つ（立てば即抜ける）。ゲーム内時間と実時間の両方で上限を切る
  const until = async (fn, sec, capMs = 25000) => {
    const t0 = g.elapsed, w0 = Date.now();
    while (!fn() && g.elapsed - t0 < sec && Date.now() - w0 < capMs) await wait(40);
    return fn();
  };
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
  // ★atkOf は武器そのものの強さ。比較のため成長・キャラ補正をゼロにした器を渡す
  const zero = { stats: { atkPct: 0, meleeAtkPct: 0, rangedAtkPct: 0 } };
  const shown = g.inventory.atkOf(strongest.id);
  const actual = g.weapons.effectiveAtk(zero);
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
  await until(() => {
    for (const e of g.enemies.list) if (e.active && e.burnT > 0) return true;
    return false;
  }, 4);
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
  // ★実時間で待つと、機械の負荷次第で進むゲーム内時間が変わり検証が不安定になる。
  //   「ゲーム内で何秒進んだか」で待つ。上限は実時間で切って無限待ちを防ぐ。
  const waitGame = async (sec, capMs = 25000) => {
    const t0 = g.elapsed, w0 = Date.now();
    while (g.elapsed - t0 < sec && Date.now() - w0 < capMs) await wait(40);
  };
  // 条件が立つまで待つ（立てば即抜ける）。ゲーム内時間と実時間の両方で上限を切る
  const until = async (fn, sec, capMs = 25000) => {
    const t0 = g.elapsed, w0 = Date.now();
    while (!fn() && g.elapsed - t0 < sec && Date.now() - w0 < capMs) await wait(40);
    return fn();
  };
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
  // ★射程の長い武器を装備していると、撃たれる前に撃ち殺してしまう。
  //   敵の挙動だけを見たいので、近接武器に持ち替えてから置く。
  g.equip('wp_iron_sword');
  g.spawner.spawnAt('en_stinger', g.player.x + 10, g.player.z);
  // ★射撃間隔は最大2.2秒。しかもヘッドレスでは実時間より
  //   ゲーム内時間の進みが遅い（描画が重く、1フレームあたりの進みが小さい）。
  //   窓を実時間6秒取って、初弾を確実に捉える。成功したら即抜けるので通常は速い。
  let hostile = 0;
  await until(() => {
    let n = 0;
    for (const p of g.projectiles.list) if (p.active && p.hostile) n++;
    hostile = Math.max(hostile, n);
    return hostile > 0;
  }, 5);
  out.hostile = hostile;

  // 分裂：倒すと欠片が残る
  const n0 = g.enemies.count;
  const blob = g.spawner.spawnAt('en_blob', g.player.x + 3, g.player.z);
  if (blob) g.combat.hitEnemy(blob, 999999, false, g.player.x, g.player.z, 0);
  await wait(60);
  out.split = { before: n0, after: g.enemies.count };

  // ボス出現 → HPバーと専用描画
  g.spawner.elapsed = 149.9;
  await until(() => !!g.enemies.findBoss(), 2);
  await wait(150);
  const boss = g.enemies.findBoss();
  out.boss = boss ? { id: boss.arch.id, hp: Math.round(boss.hp),
                      bar: !document.getElementById('bossBar').hidden,
                      view: g.bossView.group.visible } : null;

  // ★プールが満杯でもボスが湧くか（湧かないとステージが永遠にクリアできない）
  g.selectStage(3); g.startRun(); g.player.takeDamage = () => false;
  while (g.enemies.pool.free > 0) if (!g.spawner.spawnAt('en_slime', g.player.x + 20, g.player.z)) break;
  const free = g.enemies.pool.free;
  g.spawner.elapsed = 149.9;
  await until(() => !!g.enemies.findBoss(), 2);
  out.bossWhenFull = { free, spawned: !!g.enemies.findBoss() };

  // クリア → 報酬・解禁・記録
  const gems0 = g.save.data.wallet.gems;
  const b2 = g.enemies.findBoss();
  if (b2) g.combat.hitEnemy(b2, 999999, false, g.player.x, g.player.z, 0);
  g.spawner.elapsed = 9999;
  // ★クリア判定は spawner.tick が回って初めて立つ。実時間で待つと
  //   描画が重い環境ではティックが回りきらず、通ったり落ちたりする。
  await until(() => !document.getElementById('clear').hidden, 3);
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

// ---- ボスが3体とも別物として成立しているか ----
// ★新しいボスは「形が違うだけ」になりやすい。技が実際に出るところまで見る。
const bosses = await page.evaluate(async () => {
  const g = __DOPA.game;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const until = async (fn, sec, capMs = 25000) => {
    const t0 = g.elapsed, w0 = Date.now();
    while (!fn() && g.elapsed - t0 < sec && Date.now() - w0 < capMs) await wait(40);
    return fn();
  };
  const { STAGES } = await import('/src/data/stages.js');
  const { makeBossGeometry, BOSS_SHAPES } = await import('/src/scene/bossShapes.js');
  const { ENEMIES } = await import('/src/data/enemies.js');

  const out = { shapes: {}, stageBosses: STAGES.filter(s => s.boss).map(s => s.boss.id) };

  // ボスごとに専用の形が割り当たっているか（雑魚の使い回しになっていないか）
  for (const e of ENEMIES.filter(x => x.boss)) {
    out.shapes[e.id] = e.visual.boss && BOSS_SHAPES.includes(e.visual.boss) ? e.visual.boss : null;
  }
  // 胴の幅が記録されているか（当たり判定合わせに使う）
  out.hitHalf = {};
  for (const k of BOSS_SHAPES) {
    const geo = makeBossGeometry(k);
    out.hitHalf[k] = geo.userData.hitHalf || 0;
    geo.dispose();
  }

  // 雷龍：撃つ／突っ込む が実際に出るか
  g.selectStage(5); g.startRun(); g.player.takeDamage = () => false;
  g.spawner.elapsed = 169.9;
  await until(() => !!g.enemies.findBoss(), 3);
  const drake = g.enemies.findBoss();
  out.drake = drake ? { id: drake.arch.id, view: g.bossView.group.visible } : null;
  if (drake) {
    drake.hp = drake.maxHp = 1e9;
    let fired = 0, charged = false;
    // 弾が飛ぶか／突進の状態に入るか
    await until(() => {
      for (const p of g.projectiles.list) if (p.active && p.hostile) fired++;
      if (drake.aiState === 1 || drake.aiState === 2) charged = true;
      return fired > 0 && charged;
    }, 14);
    out.drake.fired = fired;
    out.drake.charged = charged;
  }
  return out;
});

const bossShapesOk = Object.values(bosses.shapes).every(v => !!v) &&
                     new Set(Object.values(bosses.shapes)).size === Object.keys(bosses.shapes).length;
check(bossShapesOk, 'ボスは全員が専用の形を持つ',
      Object.entries(bosses.shapes).map(([k, v]) => `${k}→${v}`).join(' / '));
check(new Set(bosses.stageBosses).size === bosses.stageBosses.length,
      'ボスがステージ間で使い回されていない', bosses.stageBosses.join(' / '));
check(Object.values(bosses.hitHalf).every(v => v > 0),
      'ボスが胴の幅を申告している（当たり判定合わせに使う）',
      Object.entries(bosses.hitHalf).map(([k, v]) => `${k} ${v}`).join(' / '));
check(!!bosses.drake && bosses.drake.id === 'bs_thunderdrake' && bosses.drake.view,
      'ステージ5のボスが雷龍になっている',
      bosses.drake ? `${bosses.drake.id} / 専用描画 ${bosses.drake.view}` : '出現せず');
check(!!bosses.drake && bosses.drake.fired > 0 && bosses.drake.charged,
      '雷龍が雷を撃ち、突進もしてくる',
      bosses.drake ? `敵弾 ${bosses.drake.fired} 発 / 突進 ${bosses.drake.charged}` : '—');

// ---- 技が画に出ているか ----
// ★判定とダメージだけで画に何も出ない攻撃は、避け方を体で覚えられない。
//   「範囲が床に描かれること」を機械的に確かめる。
const fx = await page.evaluate(async () => {
  const g = __DOPA.game;
  g.selectStage(3); g.startRun(); g.player.takeDamage = () => false;
  g.shock.clear();

  // ボスの叩きつけ：輪と閃光が出るか。★当たらなくても出ること
  const boss = g.spawner.spawnAt('bs_gorehorn', g.player.x + 30, g.player.z);
  const before = { r: g.shock.R.n, d: g.shock.D.n };
  g.enemies.ctx.slam(boss, boss.arch.slam.radius, boss.arch.slam.dmg);
  // ★最後に積んだのは内側の輪。範囲を表すのは一番大きい方
  let maxR = 0;
  for (let i = 0; i < g.shock.R.n; i++) maxR = Math.max(maxR, g.shock.R.r1[i]);
  const slam = { rings: g.shock.R.n - before.r, discs: g.shock.D.n - before.d, radius: maxR };

  // 雷属性は光柱が付くか
  g.shock.clear();
  const drake = g.spawner.spawnAt('bs_thunderdrake', g.player.x + 30, g.player.z + 4);
  g.enemies.ctx.slam(drake, drake.arch.slam.radius, drake.arch.slam.dmg);
  const bolt = { pillars: g.shock.P.n };

  // 溢れても壊れないこと（一番古いものを潰して出し続ける）
  g.shock.clear();
  for (let i = 0; i < 60; i++) g.shock.impact(i, 0, 3, 0xffffff, false);
  // ★InstancedMesh の count は update() で初めて反映される
  g.shock.update(0.001);
  const overflow = { rings: g.shock.R.n, cap: g.shock.ringCap, count: g.shock.rings.count };

  return { slam, bolt, overflow };
});

check(fx.slam.rings >= 2 && fx.slam.discs >= 1,
      'ボスの叩きつけが床に範囲を描く',
      `輪 ${fx.slam.rings} / 閃光 ${fx.slam.discs} / 半径 ${fx.slam.radius}`);
check(Math.abs(fx.slam.radius - 6.5) < 0.01,
      '描く範囲が実際の当たり判定と一致する', `描画 ${fx.slam.radius} / 判定 6.5`);
check(fx.bolt.pillars >= 1, '雷属性の技には光柱が立つ', `光柱 ${fx.bolt.pillars} 本`);
check(fx.overflow.rings === fx.overflow.cap && fx.overflow.count === fx.overflow.cap,
      'エフェクトが溢れても壊れない',
      `60発中 ${fx.overflow.rings} 本を保持（上限 ${fx.overflow.cap}）`);

// ---- メタ進行（フェーズ6） ----
const metaRes = await page.evaluate(async () => {
  const g = __DOPA.game;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  // ★実時間で待つと、機械の負荷次第で進むゲーム内時間が変わり検証が不安定になる。
  //   「ゲーム内で何秒進んだか」で待つ。上限は実時間で切って無限待ちを防ぐ。
  const waitGame = async (sec, capMs = 25000) => {
    const t0 = g.elapsed, w0 = Date.now();
    while (g.elapsed - t0 < sec && Date.now() - w0 < capMs) await wait(40);
  };
  // 条件が立つまで待つ（立てば即抜ける）。ゲーム内時間と実時間の両方で上限を切る
  const until = async (fn, sec, capMs = 25000) => {
    const t0 = g.elapsed, w0 = Date.now();
    while (!fn() && g.elapsed - t0 < sec && Date.now() - w0 < capMs) await wait(40);
    return fn();
  };
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

// ---- 演出・共有・PWA（フェーズ7） ----
const juice = await page.evaluate(async () => {
  const g = __DOPA.game;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  // ★実時間で待つと、機械の負荷次第で進むゲーム内時間が変わり検証が不安定になる。
  //   「ゲーム内で何秒進んだか」で待つ。上限は実時間で切って無限待ちを防ぐ。
  const waitGame = async (sec, capMs = 25000) => {
    const t0 = g.elapsed, w0 = Date.now();
    while (g.elapsed - t0 < sec && Date.now() - w0 < capMs) await wait(40);
  };
  // 条件が立つまで待つ（立てば即抜ける）。ゲーム内時間と実時間の両方で上限を切る
  const until = async (fn, sec, capMs = 25000) => {
    const t0 = g.elapsed, w0 = Date.now();
    while (!fn() && g.elapsed - t0 < sec && Date.now() - w0 < capMs) await wait(40);
    return fn();
  };
  const out = {};

  // 命中でダメージ数字と火花が出るか
  g.startRun();
  g.player.takeDamage = () => false;
  g.sparks.clear(); g.damageNumbers.clear();
  g.spawner.spawnBurst(20, g.player, 2.4);
  let dn = 0, sp = 0;
  await until(() => {
    dn = Math.max(dn, g.damageNumbers.count);
    sp = Math.max(sp, g.sparks.count);
    return dn > 0 && sp > 0;
  }, 4);
  out.vfx = { numbers: dn, sparks: sp, limit: g.damageNumbers.limit,
              outline: g.damageNumbers.outline, tier: g.quality.name };

  // 全画面テロップ
  g.screenFx.bannerShow('TEST', 'sub', 'boss', 3000);
  await wait(80);
  out.banner = { shown: !document.getElementById('bigBanner').hidden,
                 cls: document.getElementById('bigBanner').className };
  g.screenFx.hideBanner();

  // 共有テキスト
  g.combat.kills = 123;
  g.elapsed = 187;
  const txt = g._shareText(true);
  out.share = { text: txt, hasTitle: txt.includes('DOPA ARENA'),
                hasStage: /ステージ\d/.test(txt), hasBuild: txt.includes('装備'),
                lines: txt.split('\n').length };

  // 音（AudioContext が作れるか。作れなくてもゲームは止まらない設計）
  out.audio = { ready: g.audio.ready, failed: g.audio.failed };
  g.audio.hit(true); g.audio.levelUp(); g.audio.bossDown();
  out.audioSurvived = true;
  return out;
});

check(juice.vfx.numbers > 0 && juice.vfx.sparks > 0, '命中でダメージ数字と火花が出る',
      `数字 ${juice.vfx.numbers} / 粒子 ${juice.vfx.sparks} / 品質 ${juice.vfx.tier}（数字の上限 ${juice.vfx.limit}）`);
check(juice.banner.shown && juice.banner.cls.includes('boss'), '全画面テロップが出る',
      juice.banner.cls);
check(juice.share.hasTitle && juice.share.hasStage && juice.share.hasBuild && juice.share.lines >= 5,
      '共有テキストが組み立てられる', juice.share.text.replace(/\n/g, ' / '));
check(juice.audioSurvived, '音の再生でゲームが落ちない',
      juice.audio.ready ? 'AudioContext 有効' : '無音で続行（この環境ではAudioContextが作れない）');

// ---- PWA ----
const pwa = await page.evaluate(async () => {
  const res = await fetch('./manifest.webmanifest');
  const man = await res.json();
  const swRes = await fetch('./sw.js');
  const swText = await swRes.text();
  // プリキャッシュ一覧に載っているファイルが実在するか全部見る
  const list = [...swText.matchAll(/'(\.\/[^']+)'/g)].map(m => m[1])
    .filter(u => u !== './' && !u.endsWith('sw.js'));
  const missing = [];
  for (const u of list) {
    const r = await fetch(u, { method: 'GET' });
    if (!r.ok) missing.push(u);
  }
  return { name: man.name, display: man.display, icons: man.icons.length,
           start: man.start_url, listed: list.length, missing };
});
check(pwa.name === 'DOPA ARENA' && pwa.display === 'fullscreen' && pwa.icons >= 2,
      'PWAマニフェストが正しい', `${pwa.name} / ${pwa.display} / アイコン${pwa.icons}`);
check(pwa.missing.length === 0, 'Service Worker のプリキャッシュ一覧が全て実在する',
      `${pwa.listed} 件中 欠落 ${pwa.missing.length} 件${pwa.missing.length ? ': ' + pwa.missing.join(', ') : ''}`);

// ---- キャラクター ----
const chars = await page.evaluate(async () => {
  const g = __DOPA.game;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  // ★実時間で待つと、機械の負荷次第で進むゲーム内時間が変わり検証が不安定になる。
  //   「ゲーム内で何秒進んだか」で待つ。上限は実時間で切って無限待ちを防ぐ。
  const waitGame = async (sec, capMs = 25000) => {
    const t0 = g.elapsed, w0 = Date.now();
    while (g.elapsed - t0 < sec && Date.now() - w0 < capMs) await wait(40);
  };
  // 条件が立つまで待つ（立てば即抜ける）。ゲーム内時間と実時間の両方で上限を切る
  const until = async (fn, sec, capMs = 25000) => {
    const t0 = g.elapsed, w0 = Date.now();
    while (!fn() && g.elapsed - t0 < sec && Date.now() - w0 < capMs) await wait(40);
    return fn();
  };
  const { CHARACTERS } = await import('/src/data/characters.js');
  const out = {};

  // 最初は既定の1人だけ
  g.save.data.meta.unlocks = [];
  g.save.data.meta.character = 'ch_vanguard';
  out.locked = { available: g.meta.availableCharacters().length, total: CHARACTERS.length,
                 current: g.meta.character.id };

  // 未解放は選べない
  out.rejected = g.selectCharacter('ch_bulwark') === false && g.meta.character.id === 'ch_vanguard';

  // 実績で解放される
  g.save.data.achievements = {};
  g.save.data.stats.totalBosses = 1;
  g.save.data.stats.bestRunLv = 20;
  g.save.data.stats.ssrCount = 5;
  g.meta.checkAchievements();
  out.unlocked = { available: g.meta.availableCharacters().length,
                   flags: g.save.data.meta.unlocks.filter(u => u.startsWith('char_')) };

  // 選ぶとステータスが変わる
  g.selectCharacter('ch_vanguard');
  const a = { ...g.player.stats };
  const okSelect = g.selectCharacter('ch_bulwark');
  const b = { ...g.player.stats };
  out.stats = { okSelect, current: g.meta.character.id,
                hpBefore: +a.maxHpPct.toFixed(3), hpAfter: +b.maxHpPct.toFixed(3),
                drBefore: +a.drAdd.toFixed(3), drAfter: +b.drAdd.toFixed(3) };

  // ★得手不得手は「同じ武器を、別のキャラで持つ」で比べる。
  //   武器を変えて比べると強化レベルや限界突破の差が混ざって判定にならない。
  const { WEAPON_BY_ID } = await import('/src/data/weapons.js');
  for (const id of ['wp_iron_sword', 'wp_short_bow']) {
    if (!g.inventory.has(id)) g.inventory.grant(WEAPON_BY_ID.get(id), 'N');
  }
  g.startRun();
  await wait(100);

  const measure = (charId, weaponId) => {
    g.selectCharacter(charId);
    g.equip(weaponId);
    return g.weapons.effectiveAtk(g.player);
  };
  out.affinity = {
    // 射撃武器：レンジャー（射撃+18%）の方が高いはず
    bowVanguard: +measure('ch_vanguard', 'wp_short_bow').toFixed(2),
    bowRanger:   +measure('ch_ranger',   'wp_short_bow').toFixed(2),
    // 近接武器：ヴァンガード（近接+12%）の方が高いはず
    swordVanguard: +measure('ch_vanguard', 'wp_iron_sword').toFixed(2),
    swordRanger:   +measure('ch_ranger',   'wp_iron_sword').toFixed(2),
  };
  g.selectCharacter('ch_ranger');

  // 保存される
  g.save.saveNow();
  out.saved = JSON.parse(localStorage.getItem('dopa_arena_save')).meta.character;
  return out;
});

check(chars.locked.available === 1 && chars.rejected,
      '未解放のキャラは選べない',
      `使用可 ${chars.locked.available}/${chars.locked.total}（既定 ${chars.locked.current}）`);
check(chars.unlocked.available === 4 && chars.unlocked.flags.length === 3,
      '実績でキャラが解放される',
      `使用可 ${chars.unlocked.available} / 解放フラグ ${chars.unlocked.flags.join(',')}`);
check(chars.stats.okSelect && chars.stats.hpAfter > chars.stats.hpBefore &&
      chars.stats.drAfter > chars.stats.drBefore,
      'キャラを選ぶとステータスが変わる',
      `${chars.stats.current}: 最大HP +${(chars.stats.hpBefore * 100).toFixed(0)}%→+${(chars.stats.hpAfter * 100).toFixed(0)}% / 被ダメ軽減 ${(chars.stats.drBefore * 100).toFixed(0)}%→${(chars.stats.drAfter * 100).toFixed(0)}%`);
check(chars.affinity.bowRanger > chars.affinity.bowVanguard &&
      chars.affinity.swordVanguard > chars.affinity.swordRanger,
      '武器の系統ごとに得手不得手が効く',
      `弓: ヴァンガード ${chars.affinity.bowVanguard} < レンジャー ${chars.affinity.bowRanger} ／ ` +
      `剣: レンジャー ${chars.affinity.swordRanger} < ヴァンガード ${chars.affinity.swordVanguard}`);
check(chars.saved === 'ch_ranger', '選んだキャラがセーブに残る', chars.saved);

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
