/**
 * 単一HTMLビルドの検証。dist/dopa-arena.html を実ブラウザで開いて、
 * 起動・操作・描画・保存まで通るかを確かめる。
 *
 * ★バンドラは「構文が通る」だけでは足りない。モジュールの評価順が狂うと
 *   参照だけ undefined になり、静かに一部の機能が死ぬ。実際に遊んで確かめる。
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = resolve(ROOT, 'dist/dopa-arena.html');
const PORT = 8099;

const fails = [];
const check = (ok, label, detail) => {
  console.log(`${ok ? ' OK ' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
  if (!ok) fails.push(label);
};

let html;
try { html = readFileSync(FILE); }
catch { console.error(`${FILE} が無い。先に npm run build を実行すること`); process.exit(1); }

// ★1ファイルだけを返す。他のパスは404にして「実は外部ファイルを読んでいた」を暴く
const server = createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } else if (req.url === '/favicon.ico') {
    res.writeHead(204).end();       // ブラウザが勝手に取りに来るぶん。配布先ではアイコンが付く
  } else {
    res.writeHead(404).end('not found');
  }
});
await new Promise(r => server.listen(PORT, r));

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();

const errors = [], requests = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(`[error] ${m.text()}`); });
page.on('requestfailed', r => errors.push(`REQ FAIL ${r.url()}`));
page.on('request', r => requests.push(r.url()));

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(
  () => document.getElementById('bootMsg')?.textContent.trim() === 'READY',
  null, { timeout: 30000 }).catch(() => {});

const boot = (await page.textContent('#bootMsg')).trim();
check(boot === 'READY', '1ファイルだけで起動する', boot);
if (boot !== 'READY') { console.log(errors.join('\n')); await browser.close(); server.close(); process.exit(1); }

// 外部ファイルを一切取りに行っていないこと
const outside = requests.filter(u => !u.endsWith(`:${PORT}/`) && !u.endsWith('/favicon.ico') &&
                                     !u.startsWith('data:') && !u.startsWith('blob:'));
check(outside.length === 0, '外部ファイルを読みに行かない', outside.join(', ') || 'リクエストは本体のみ');

await page.click('#startBtn');
await page.waitForTimeout(600);
await page.evaluate(() => __DOPA.game.quality.setMode('low'));

// 拠点：台座の上にキャラが立ち、描画が出ているか
const home = await page.evaluate(() => {
  const g = __DOPA.game;
  return { state: g.state, podium: g.podium.group.visible, draws: g.scene.drawCalls,
           weapon: g.weapons.weapon?.name, chars: g.characterUI ? true : false };
});
check(home.state === 'home' && home.podium && home.draws > 5,
      '拠点が描画される', `state=${home.state} / 台座=${home.podium} / draw=${home.draws}`);

// 出撃して実際に動かす
await page.evaluate(() => __DOPA.game.startRun());
await page.waitForFunction(() => __DOPA.game.state === 'playing', null, { timeout: 20000 }).catch(() => {});
const from = await page.evaluate(() => ({ x: __DOPA.game.player.x, z: __DOPA.game.player.z }));
await page.keyboard.down('d');
await page.waitForFunction((b) => {
  const p = __DOPA.game.player;
  return Math.hypot(p.x - b.x, p.z - b.z) > 1.5;
}, from, { timeout: 20000 }).catch(() => {});
await page.keyboard.up('d');

const play = await page.evaluate(async (b) => {
  const g = __DOPA.game;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  // 敵を並べて実際に倒せるか（当たり判定・ダメージ・撃破まで通す）
  const k0 = g.combat.kills;
  for (let i = 0; i < 12; i++) {
    g.spawner.spawnAt('en_slime', g.player.x + Math.cos(i) * 2.2, g.player.z + Math.sin(i) * 2.2);
  }
  const t0 = g.elapsed, w0 = Date.now();
  while (g.elapsed - t0 < 4 && Date.now() - w0 < 25000) await wait(40);
  return {
    moved: Math.hypot(g.player.x - b.x, g.player.z - b.z),
    kills: g.combat.kills - k0,
    draws: g.scene.drawCalls,
    tris: g.scene.renderer.info.render.triangles,
    lv: g.levels.level,
  };
}, from);

check(play.moved > 0.5, '入力で自機が動く', `${play.moved.toFixed(2)} ユニット`);
check(play.kills > 0, '敵を倒せる', `${play.kills} 体`);
check(play.draws > 5 && play.tris > 1000, '3Dが描かれている', `draw ${play.draws} / 三角形 ${play.tris}`);

// ガチャ・保存まで通す（データ層とセーブ層がバンドル後も繋がっているか）
const gacha = await page.evaluate(() => {
  const g = __DOPA.game;
  g.goHome();
  g.save.data.wallet.gems = 5000;
  const before = g.inventory.list().length;
  const got = g.gacha.pullTen();
  const saved = JSON.parse(localStorage.getItem('dopa_arena_save'));
  return { got: got?.length ?? 0, before, after: g.inventory.list().length,
           pulls: saved?.gacha?.totalPulls ?? 0, themes: g.arena.theme?.floor?.base !== undefined };
});
check(gacha.got === 10 && gacha.after >= gacha.before, 'ガチャが引ける', `${gacha.got} 連 / 所持 ${gacha.before}→${gacha.after}`);
check(gacha.pulls >= 10, 'localStorage に保存される', `累計 ${gacha.pulls} 回`);
check(gacha.themes, 'ステージのテーマが読める');

check(errors.length === 0, 'エラーが出ない', errors.join(' | ') || 'なし');

const size = statSync(FILE).size;
check(size < 16 * 1024 * 1024, 'ファイルサイズが配布できる範囲', `${(size / 1024 / 1024).toFixed(2)} MB`);

await page.screenshot({ path: resolve(ROOT, 'dist/single-check.png') });
await browser.close();
server.close();

if (fails.length) { console.error(`\n失敗 ${fails.length} 件: ${fails.join(', ')}`); process.exit(1); }
console.log('\n単一HTML: すべて合格');
