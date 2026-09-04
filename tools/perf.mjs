/**
 * パフォーマンス計測。
 *
 * ヘッドレス環境のfpsはソフトウェアラスタライザ由来なので実機の指標にならない。
 * そこで「ハードウェアに依存しない部分」＝ JSのフレームコストと
 * ループ内アロケーション量を測る。後者は本作の設計上いちばん重要な数値。
 *
 *   node tools/perf.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:8080/';
const JS_BUDGET_MS = 4.0;      // docs/PHASE0_DESIGN.md のフレーム予算
const HEAP_LIMIT_KB = 64;      // 600フレームで許容するヒープ増加

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--expose-gc'],
});
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));

await page.goto(BASE, { waitUntil: 'load' });
await page.click('#startBtn');
await page.waitForTimeout(800);

const r = await page.evaluate(async () => {
  const g = __DOPA.game;
  const STEP = 1 / 60;
  g.input.state.moveX = 0.7; g.input.state.moveZ = -0.7;   // 最悪ケース（常時入力あり）

  const bench = (fn, n) => {
    for (let i = 0; i < 2000; i++) fn();                   // JITを温める
    const t0 = performance.now();
    for (let i = 0; i < n; i++) fn();
    return (performance.now() - t0) / n * 1000;            // µs/呼び出し
  };

  const parts = {
    'update()':           bench(() => g.update(STEP), 20000),
    'playerView.sync()':  bench(() => g.playerView.sync(g.player, 0.5, STEP), 20000),
    'cameraRig.follow()': bench(() => g.cameraRig.follow(g.player, STEP), 20000),
  };

  // ---- ループ内アロケーション：600フレーム回してヒープ増加を見る ----
  globalThis.gc?.();
  await new Promise(res => setTimeout(res, 60));
  const h0 = performance.memory?.usedJSHeapSize ?? 0;
  for (let i = 0; i < 600; i++) {
    g.update(STEP);
    g.playerView.sync(g.player, 0.5, STEP);
    g.cameraRig.follow(g.player, STEP);
  }
  const h1 = performance.memory?.usedJSHeapSize ?? 0;

  const info = g.scene.renderer.info;
  return { parts, heapDelta: h1 - h0, measured: !!performance.memory,
           draws: g.scene.drawCalls, tris: info.render.triangles,
           geoms: info.memory.geometries, texs: info.memory.textures };
});

let total = 0;
for (const [k, v] of Object.entries(r.parts)) {
  total += v;
  console.log(`  ${k.padEnd(20)} ${v.toFixed(2).padStart(7)} µs / フレーム`);
}
const totalMs = total / 1000;
const heapKb = r.heapDelta / 1024;

console.log(`  ${'JS合計'.padEnd(18)} ${totalMs.toFixed(3).padStart(7)} ms / フレーム   (予算 ${JS_BUDGET_MS.toFixed(3)} ms)`);
console.log('');
console.log(`  600フレームのヒープ増加  ${heapKb.toFixed(1)} KB` + (r.measured ? '' : ' (performance.memory 利用不可)'));
console.log(`  draw calls ${r.draws} / triangles ${r.tris} / geometries ${r.geoms} / textures ${r.texs}`);
console.log('');

const fails = [];
if (totalMs > JS_BUDGET_MS) fails.push(`JSフレームコスト超過 (${totalMs.toFixed(3)} > ${JS_BUDGET_MS} ms)`);
if (r.measured && heapKb > HEAP_LIMIT_KB) fails.push(`ループ内アロケーション検出 (${heapKb.toFixed(1)} KB > ${HEAP_LIMIT_KB} KB)`);
if (r.draws > 100) fails.push(`draw call 超過 (${r.draws} > 100)`);
if (r.tris > 60000) fails.push(`三角形数 超過 (${r.tris} > 60000)`);
if (errors.length) fails.push(`ページエラー: ${errors.join(' | ')}`);

await browser.close();
if (fails.length) { console.error('失敗:\n  - ' + fails.join('\n  - ')); process.exit(1); }
console.log('すべて予算内');
