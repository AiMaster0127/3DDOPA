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

  g.save.saveNow = realSave;
  const avgGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;

  return { counts, N, ssrTotal, maxGapSSR, avgGap, tenFail, TEN,
           declared: GACHA.baseRates, hard: GACHA.pity.hard,
           softStart: GACHA.pity.softStart, floor: GACHA.pity.tenPullFloor,
           rarities: RARITIES };
}, N);

console.log(`単発 ${r.N.toLocaleString('ja-JP')} 回の実測\n`);
console.log('レア   表示確率    実測      差       備考');
console.log('─────────────────────────────────────────────────────');

const fails = [];
for (const rar of r.rarities) {
  const declared = r.declared[rar];
  const actual = r.counts[rar] / r.N;
  const diff = actual - declared;
  // 天井があるぶんSSRは表示確率より必ず高く出る。それ以外は表示どおりであるべき
  const note = rar === 'SSR' ? '天井ぶん上振れするのが正しい' : '';
  const tol = rar === 'SSR' ? 0.02 : 0.006;
  const ok = rar === 'SSR' ? (diff >= -0.001 && diff < 0.02) : Math.abs(diff) < tol;
  if (!ok) fails.push(`${rar}: 表示 ${(declared * 100).toFixed(1)}% に対し実測 ${(actual * 100).toFixed(2)}%`);
  console.log(
    `${rar.padEnd(5)} ${(declared * 100).toFixed(1).padStart(6)}%  ${(actual * 100).toFixed(2).padStart(6)}%  ` +
    `${(diff * 100 >= 0 ? '+' : '')}${(diff * 100).toFixed(2).padStart(5)}pt  ${ok ? 'OK ' : 'NG '} ${note}`
  );
}

console.log('');
console.log(`SSR の実効排出間隔 : 平均 ${r.avgGap.toFixed(1)} 回 / 最悪 ${r.maxGapSSR} 回`);
console.log(`ハード天井         : ${r.hard} 回（ソフト天井 ${r.softStart} 回から上昇）`);
if (r.maxGapSSR > r.hard) fails.push(`天井を超えた: ${r.maxGapSSR} > ${r.hard}`);
else console.log(`  → 最悪ケースでも天井 ${r.hard} 回以内に収まっている`);

console.log('');
console.log(`10連保証（${r.floor}以上）: ${r.TEN.toLocaleString('ja-JP')} 回中 ${r.tenFail} 回が保証割れ`);
if (r.tenFail > 0) fails.push(`10連保証が働いていない (${r.tenFail} 件)`);

if (errors.length) fails.push(`ページエラー: ${errors.join(' | ')}`);
await browser.close();

console.log('');
if (fails.length) { console.error('失敗:\n  - ' + fails.join('\n  - ')); process.exit(1); }
console.log('確率テーブルと実測が一致している');
