/**
 * ガチャ確率の監査。
 *
 * 「表示している確率」と「実際に出る確率」が一致することを大量試行で確認する。
 * 天井が必ず効くこと、10連保証が必ず効くことも検証する。
 *
 *   node tools/gacha-audit.mjs [試行回数]
 *
 * ★確率テーブル(src/data/gacha.js)を編集したら、必ずこれを流すこと。
 */
import { chromium } from 'playwright';

const N = Number(process.argv[2] || 200000);
const BASE = process.env.BASE_URL || 'http://localhost:8080/';

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await (await browser.newContext({ viewport: { width: 900, height: 700 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(BASE, { waitUntil: 'load' });
await page.click('#startBtn');
await page.waitForTimeout(300);

const r = await page.evaluate(async (N) => {
  const { GACHA, RARITIES, RARITY_RANK } = await import('/src/data/gacha.js');
  const g = __DOPA.game;

  // 検証中はセーブに触らない（実プレイの進行を壊さないため）
  const realSave = g.save.saveNow;
  g.save.saveNow = () => true;

  const counts = { N: 0, R: 0, SR: 0, SSR: 0 };
  let maxGapSSR = 0, gap = 0, ssrTotal = 0;
  const gaps = [];

  g.save.data.wallet.gems = Number.MAX_SAFE_INTEGER;
  g.save.data.gacha.sinceSSR = 0;
  g.save.data.gacha.totalPulls = 0;

  for (let i = 0; i < N; i++) {
    const res = g.gacha.pullSingle();
    const rar = res[0].rarity;
    counts[rar]++;
    gap++;
    if (rar === 'SSR') { ssrTotal++; gaps.push(gap); maxGapSSR = Math.max(maxGapSSR, gap); gap = 0; }
  }

  // 10連保証：SR以上が必ず1つ以上入るか
  let tenFail = 0;
  const TEN = 3000;
  for (let i = 0; i < TEN; i++) {
    const out = g.gacha.pullTen();
    if (!out.some(x => RARITY_RANK[x.rarity] >= RARITY_RANK[GACHA.pity.tenPullFloor])) tenFail++;
  }

  // ── 上級バナー（Nを排出しない）の実効確率も検証する ──
  // ★UIが出す実効値と、実際の排出が一致していないと「表示詐欺」になる
  g.save.data.meta.unlocks = ['banner_prime'];
  let prime = null;
  if (g.gacha.setBanner('prime')) {
    const pc = { N: 0, R: 0, SR: 0, SSR: 0 };
    const M = Math.min(N, 60000);
    for (let i = 0; i < M; i++) pc[g.gacha.pullSingle()[0].rarity]++;

    // GachaSystem と同じ配り直し方で期待値を出す
    const skip = ['N'];
    const rest = 1 - GACHA.baseRates.SSR;
    let restSum = 0;
    for (const r of RARITIES) if (r !== 'SSR' && !skip.includes(r)) restSum += GACHA.baseRates[r];
    const expect = { SSR: GACHA.baseRates.SSR };
    for (const r of RARITIES) {
      if (r === 'SSR') continue;
      expect[r] = skip.includes(r) ? 0 : (GACHA.baseRates[r] / restSum) * rest;
    }
    prime = { counts: pc, M, expect, restSum };
    g.gacha.setBanner('standard');
  }

  g.save.saveNow = realSave;
  const avgGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;

  return { counts, N, ssrTotal, maxGapSSR, avgGap, tenFail, TEN, prime,
           declared: GACHA.baseRates, hard: GACHA.pity.hard,
           softStart: GACHA.pity.softStart, floor: GACHA.pity.tenPullFloor,
           rarities: RARITIES };
}, N);

console.log(`単発 ${r.N.toLocaleString('ja-JP')} 回の実測\n`);

// ★天井があるぶんSSRは表示確率より必ず高く出る。
//   そして増えた確率質量は下位レアから「元の比率どおりに」差し引かれる。
//   したがって N/R/SR を表示確率とそのまま比べると必ず低く出て、
//   正常なのに失敗する。実測のSSR率を踏まえた期待値と比べること。
const actualSSR = r.counts.SSR / r.N;
const baseRestSum = r.rarities.reduce((a, x) => a + (x === 'SSR' ? 0 : r.declared[x]), 0);
const expected = {};
for (const rar of r.rarities) {
  expected[rar] = rar === 'SSR'
    ? actualSSR
    : (r.declared[rar] / baseRestSum) * (1 - actualSSR);
}

console.log('レア   表示確率  天井込み期待   実測      差       判定');
console.log('──────────────────────────────────────────────────────────');

const fails = [];
for (const rar of r.rarities) {
  const declared = r.declared[rar];
  const exp = expected[rar];
  const actual = r.counts[rar] / r.N;
  const diff = actual - exp;

  // 期待値からの許容幅。標本誤差(3σ)より少し広く取る
  const sigma = Math.sqrt(Math.max(exp * (1 - exp), 1e-9) / r.N);
  const tol = Math.max(4 * sigma, 0.0015);
  const ok = rar === 'SSR' ? (actualSSR >= declared - 0.001) : Math.abs(diff) < tol;

  if (!ok) fails.push(`${rar}: 期待 ${(exp * 100).toFixed(2)}% に対し実測 ${(actual * 100).toFixed(2)}%（許容 ±${(tol * 100).toFixed(2)}pt）`);
  console.log(
    `${rar.padEnd(5)} ${(declared * 100).toFixed(1).padStart(6)}%  ${(exp * 100).toFixed(2).padStart(9)}%  ` +
    `${(actual * 100).toFixed(2).padStart(6)}%  ${(diff * 100 >= 0 ? '+' : '')}${(diff * 100).toFixed(2).padStart(5)}pt  ${ok ? 'OK' : 'NG'}`
  );
}
console.log(`\n  SSR実測 ${(actualSSR * 100).toFixed(2)}% は表示 ${(r.declared.SSR * 100).toFixed(1)}% を上回る（天井があるので正しい）。`);
console.log('  N/R/SR は、増えたSSRぶんを元の比率で差し引いた期待値と比較している。');

console.log('');
console.log(`SSR の実効排出間隔 : 平均 ${r.avgGap.toFixed(1)} 回 / 最悪 ${r.maxGapSSR} 回`);
console.log(`ハード天井         : ${r.hard} 回（ソフト天井 ${r.softStart} 回から上昇）`);
if (r.maxGapSSR > r.hard) fails.push(`天井を超えた: ${r.maxGapSSR} > ${r.hard}`);
else console.log(`  → 最悪ケースでも天井 ${r.hard} 回以内に収まっている`);

console.log('');
console.log(`10連保証（${r.floor}以上）: ${r.TEN.toLocaleString('ja-JP')} 回中 ${r.tenFail} 回が保証割れ`);
if (r.tenFail > 0) fails.push(`10連保証が働いていない (${r.tenFail} 件)`);

if (r.prime) {
  console.log('');
  console.log(`上級バナー「プライム」（N除外）— ${r.prime.M.toLocaleString('ja-JP')} 回`);
  // こちらも天井ぶんを織り込んだ期待値で比べる
  const pSSR = r.prime.counts.SSR / r.prime.M;
  for (const rar of r.rarities) {
    const act = r.prime.counts[rar] / r.prime.M;
    const exp = rar === 'SSR' ? pSSR
              : rar === 'N'   ? 0
              : (r.declared[rar] / r.prime.restSum) * (1 - pSSR);
    const sig = Math.sqrt(Math.max(exp * (1 - exp), 1e-9) / r.prime.M);
    const ok = rar === 'SSR' ? (pSSR >= r.declared.SSR - 0.002)
             : rar === 'N'   ? act === 0
             : Math.abs(act - exp) < Math.max(4 * sig, 0.002);
    if (!ok) fails.push(`プライム ${rar}: 期待 ${(exp * 100).toFixed(1)}% に対し実測 ${(act * 100).toFixed(2)}%`);
    console.log(`  ${rar.padEnd(4)} 期待 ${(exp * 100).toFixed(1).padStart(5)}%  実測 ${(act * 100).toFixed(2).padStart(6)}%  ${ok ? 'OK' : 'NG'}`);
  }
} else {
  console.log('\n上級バナーを検証できなかった（解放に失敗）');
  fails.push('上級バナーの検証ができない');
}

if (errors.length) fails.push(`ページエラー: ${errors.join(' | ')}`);
await browser.close();

console.log('');
if (fails.length) { console.error('失敗:\n  - ' + fails.join('\n  - ')); process.exit(1); }
console.log('確率テーブルと実測が一致している');
