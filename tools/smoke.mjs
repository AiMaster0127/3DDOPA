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
await page.waitForTimeout(1000);

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
const clamp = await page.evaluate(async () => {
  const g = __DOPA.game;
  g.player.x = 500; g.player.z = 500;
  await new Promise(r => setTimeout(r, 300));
  return { r: Math.hypot(g.player.x, g.player.z), arena: g.arena.radius };
});
check(clamp.r <= clamp.arena, 'アリーナ外に出られない', `半径 ${clamp.r.toFixed(2)} <= ${clamp.arena}`);

// ---- 戦闘コア（フェーズ2） ----
// 湧きを待つと運任せになるので、自機の周りに決め打ちで配置して検証する
const fight = await page.evaluate(async () => {
  const g = __DOPA.game;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const out = {};

  const trial = async (weaponId, dist, ms) => {
    g.startRun();
    g.equip(weaponId);
    g.player.takeDamage = () => false;              // 攻撃性能だけを見たいので不死にする
    const placed = g.spawner.spawnBurst(24, g.player, dist);
    await wait(ms);
    return { placed, kills: g.combat.kills, dmg: Math.round(g.combat.damageDealt) };
  };

  out.melee = await trial('wp_iron_sword', 2.6, 4000);
  out.ranged = await trial('wp_short_bow', 8.0, 4000);

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
