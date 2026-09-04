/**
 * ガチャの設定。
 *
 * ★★ 排出確率はこのファイルの baseRates ただ1箇所にしか書かない。
 *    他のどこにも確率を散らさないこと。起動時に合計1.0を検証する。
 *
 * ★ 課金要素は実装しない。通貨はプレイ報酬のみ。
 */
export const RARITIES = ['N', 'R', 'SR', 'SSR'];

/** レアリティの序列（10連保証などの比較に使う） */
export const RARITY_RANK = { N: 0, R: 1, SR: 2, SSR: 3 };

/** 表示色。UIと3D演出の両方がここを見る */
export const RARITY_COLOR = {
  N:   { hex: 0x9aa3c0, css: '#9aa3c0', name: 'ノーマル' },
  R:   { hex: 0x4fa8ff, css: '#4fa8ff', name: 'レア' },
  SR:  { hex: 0xb06bff, css: '#b06bff', name: 'スーパーレア' },
  SSR: { hex: 0xffc24d, css: '#ffc24d', name: 'スーパースペシャルレア' },
};

export const GACHA = {
  /** 費用 */
  cost: { single: 100, ten: 1000 },     // ジェム。チケットは1枚で単発1回

  /** ── 基礎排出率（合計1.0） ── */
  baseRates: {
    N:   0.530,
    R:   0.320,
    SR:  0.110,
    SSR: 0.040,      // 4.0%
  },

  /** ── 天井 ── */
  pity: {
    softStart: 50,      // 50連目からSSR率が上昇
    softAdd: 0.050,     // 1連ごとに +5.0pt
    hard: 70,           // 70連で確定。SSR取得でカウンタはリセット
    tenPullFloor: 'SR', // 10連には必ずSR以上が1つ入る
  },

  /** ── ピックアップ（すり抜け救済つき） ── */
  banners: [
    {
      id: 'standard',
      name: 'スタンダード',
      featured: ['wp_flare_blade'],
      featuredChance: 0.5,        // SSR確定時、50%でピックアップ
      guaranteeAfterLoss: true,   // すり抜けたら次のSSRは確定でピックアップ
      exclude: [],
      unlock: null,               // 最初から引ける
    },
    {
      // ★実績「深淵踏破」（ステージ8クリア）で解放される上級バナー。
      //   N を排出プールから外すぶん、当たりの密度が上がる。
      //   確率テーブル自体は共通なので、公平性の検証は1つで足りる。
      id: 'prime',
      name: 'プライム',
      featured: ['wp_ruin_cannon', 'wp_thunder_god'],
      featuredChance: 0.6,
      guaranteeAfterLoss: true,
      exclude: [],
      excludeRarity: ['N'],       // Nを引かない（そのぶんRに寄る）
      unlock: 'banner_prime',
    },
  ],

  /** ── ダブり救済 ── */
  dupe: {
    shards: 1,                                   // 同一武器の被り → かけら+1
    dust: { N: 5, R: 15, SR: 60, SSR: 300 },     // 加えて汎用強化粉
  },

  /** ── 限界突破（かけらを使う） ── */
  limitBreak: {
    costs: [2, 3, 5, 8, 13],   // LB1..LB5 に必要なかけら
    atkPerLB: 0.08,            // 1段階ごとに攻撃力 +8%
    maxLB: 5,
  },

  /** ── 武器強化（強化粉を使う） ── */
  enhance: {
    maxLevel: 20,
    // Lv n → n+1 の費用。レアリティが高いほど重い
    costFor: (rarity, lv) => Math.floor((8 + lv * 6) * ({ N: 1, R: 1.6, SR: 2.6, SSR: 4.2 })[rarity]),
  },

  /** 演出の尺（秒）。フェーズ7で3D演出に差し替える */
  stage: { portent: 0.9, reach: 1.1, reveal: 0.7 },
};

/**
 * 起動時の自己検証。
 * 確率テーブルを編集して合計が1.0からズレたら、ここで気付けるようにする。
 */
export function validateGacha() {
  const problems = [];

  const sum = RARITIES.reduce((a, r) => a + (GACHA.baseRates[r] ?? 0), 0);
  if (Math.abs(sum - 1) > 1e-9) problems.push(`排出率の合計が1.0ではない: ${sum}`);

  for (const r of RARITIES) {
    const v = GACHA.baseRates[r];
    if (!(v >= 0 && v <= 1)) problems.push(`排出率が範囲外: ${r}=${v}`);
  }
  if (GACHA.pity.softStart >= GACHA.pity.hard) {
    problems.push('ソフト天井がハード天井以上になっている');
  }
  if (GACHA.limitBreak.costs.length !== GACHA.limitBreak.maxLB) {
    problems.push('限界突破の費用テーブルの長さが maxLB と一致しない');
  }

  for (const p of problems) console.error(`[gacha] ${p}`);
  return problems;
}
