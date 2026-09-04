/**
 * PWAの検証。
 *
 * ★「オフラインで動く」は口で言うだけでは意味がない。
 *   Service Worker を登録 → ネットワークを切断 → 再読み込み → 実際に遊べるか、
 *   を本物のブラウザで確かめる。
 *
 *   node tools/pwa-check.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:8080/';

/**
 * ★プリキャッシュ一覧の「取りこぼし」検出。
 *   ファイルを足したのに sw.js へ書き忘れると、オンラインでは動くのに
 *   オフラインだけ壊れる。原因が判りにくい事故なので機械的に照合する。
 */
function checkPrecacheCoverage() {
  const sw = fs.readFileSync('sw.js', 'utf8');
  const listed = new Set([...sw.matchAll(/'(\.\/[^']+)'/g)].map(m => m[1]));

  const walk = (dir, out = []) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else out.push('./' + p.split(path.sep).join('/'));
    }
    return out;
  };

  const shipped = [
    ...walk('src'),
    ...walk('assets'),
    './vendor/three/three.module.min.js',
    './vendor/three/three.core.min.js',
    './index.html',
    './manifest.webmanifest',
  ].filter(f => /\.(js|css|html|webmanifest|svg|png)$/.test(f));

  return shipped.filter(f => !listed.has(f));
}


const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const ctx = await browser.newContext({ viewport: { width: 1024, height: 700 } });
const page = await ctx.newPage();

const fails = [];
const check = (ok, label, detail) => {
  console.log(`${ok ? ' OK ' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
  if (!ok) fails.push(label);
};

const uncovered = checkPrecacheCoverage();
check(uncovered.length === 0, 'sw.js のプリキャッシュ一覧に取りこぼしがない',
      uncovered.length ? `未登録: ${uncovered.join(', ')}` : '同梱ファイルは全て登録済み');

// ---- 1回目：普通に読み込んで Service Worker を登録させる ----
await page.goto(BASE, { waitUntil: 'load' });
const reg = await page.evaluate(async () => {
  if (!('serviceWorker' in navigator)) return { supported: false };
  const r = await navigator.serviceWorker.ready.catch(() => null);
  return { supported: true, scope: r ? r.scope : null, active: !!(r && r.active) };
});
check(reg.supported && reg.active, 'Service Worker が登録される', reg.scope || '登録されず');

// プリキャッシュが終わるのを待つ
await page.waitForTimeout(2500);
const cached = await page.evaluate(async () => {
  const names = await caches.keys();
  if (!names.length) return { names, count: 0 };
  const c = await caches.open(names[0]);
  const keys = await c.keys();
  return { names, count: keys.length, hasThree: keys.some(k => k.url.includes('three.module.min.js')),
           hasCore: keys.some(k => k.url.includes('three.core.min.js')) };
});
check(cached.count > 50 && cached.hasThree && cached.hasCore,
      'three.js を含む全アセットがキャッシュされる',
      `${cached.names.join(',')} に ${cached.count} 件（three.module=${cached.hasThree} / three.core=${cached.hasCore}）`);

// ---- 2回目：ネットワークを切ってから読み直す ----
await ctx.setOffline(true);
const errs = [];
page.on('pageerror', e => errs.push(String(e)));

await page.reload({ waitUntil: 'load' }).catch(e => errs.push('reload: ' + e.message));
await page.waitForFunction(() => {
  const m = document.getElementById('bootMsg');
  return m && m.textContent.trim() === 'READY';
}, { timeout: 15000 }).catch(() => {});

const offlineBoot = await page.evaluate(() => document.getElementById('bootMsg').textContent.trim());
check(offlineBoot === 'READY', 'オフラインでも起動する', `bootMsg = "${offlineBoot}"`);

// 実際に遊べるところまで行くか
await page.click('#startBtn').catch(() => {});
// ★ヘッドレスはソフトウェア描画。品質ティアが上がると実時間あたりのフレーム数が
//   激減し、キーを押しても「ゲーム内時間が進まないので動かない」状態になる。
//   ここで見たいのは描画性能ではなく「オフラインでも遊べるか」なので最低品質に固定する。
await page.waitForFunction(() => !!globalThis.__DOPA?.game, null, { timeout: 15000 }).catch(() => {});
await page.evaluate(() => __DOPA.game.quality.setMode('low'));
// ★input.state を直接書いても Input.poll() が毎フレーム作り直すので効かない。
//   実際のキー入力で動かすこと。
await page.evaluate(() => __DOPA.game.startRun());
await page.waitForFunction(() => __DOPA.game.state === 'playing', null, { timeout: 15000 }).catch(() => {});
const before = await page.evaluate(() => ({ x: __DOPA.game.player.x, z: __DOPA.game.player.z }));
await page.keyboard.down('w'); await page.keyboard.down('d');
// ★実時間で決め打ちに待つと、描画が重い環境ではゲーム内時間がほとんど進まず
//   「動かない」と誤検出する。動いたことを確認できるまで待つ。
await page.waitForFunction((b) => {
  const g = __DOPA.game, p = g.player;
  return Math.hypot(p.x - b.x, p.z - b.z) > 1.5 || g.state !== 'playing';
}, before, { timeout: 20000 }).catch(() => {});
await page.keyboard.up('w'); await page.keyboard.up('d');
const playable = await page.evaluate((b) => {
  const g = globalThis.__DOPA?.game;
  if (!g) return null;
  return { state: g.state, moved: Math.hypot(g.player.x - b.x, g.player.z - b.z),
           enemies: g.enemies.count, draws: g.scene.drawCalls };
}, before);
check(!!playable && playable.moved > 0.5 && playable.state === 'playing',
      'オフラインで実際に遊べる',
      playable ? `移動 ${playable.moved.toFixed(2)} / 敵 ${playable.enemies} / draw ${playable.draws}` : 'ゲームが起動しなかった');

const noisy = errs.filter(e => !/Failed to fetch|net::ERR_INTERNET_DISCONNECTED/.test(e));
check(noisy.length === 0, 'オフライン時にページエラーが出ない', noisy.join(' | ') || 'なし');

await ctx.setOffline(false);
await browser.close();

console.log('');
if (fails.length) { console.error('失敗:\n  - ' + fails.join('\n  - ')); process.exit(1); }
console.log('オフラインで動作する');
