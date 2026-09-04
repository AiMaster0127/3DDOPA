/**
 * 武器データ。
 *
 * ★武器を1本増やす＝この配列にオブジェクトを1つ足すだけ。
 *   戦闘挙動・インベントリ・ガチャプール（フェーズ4）はすべてここを参照する。
 *
 * フェーズ2の時点では初期装備の2本のみ。残りはフェーズ4でガチャと一緒に追加する。
 */
export const WEAPONS = [
  {
    id: 'wp_iron_sword',
    name: '鉄の剣',
    rarity: 'N',
    type: 'sword',
    element: 'none',

    // rate = 秒あたりの攻撃回数 / range = 射程 / knock = ノックバック強度
    base: { atk: 12, rate: 1.7, range: 3.1, crit: 0.05, critDmg: 0.5, knock: 0.45 },
    growth: { atk: 1.2 },          // 武器レベル+1あたり（フェーズ4で使用）

    attack: {
      kind: 'melee_arc',           // 正面の扇形を薙ぎ払う。弾を出さない
      arcDeg: 115,
      count: 1,
      pierce: 99,                  // 扇内は貫通（当たった敵すべてに当たる）
      speed: 0,
      life: 0.16,                  // 斬撃エフェクトの表示時間
      radius: 0.6,
    },

    effects: [],
    visual: { model: 'sword', color: 0xb9c3cc, emissive: 0x000000, trail: null, scale: 1.0 },
    flavor: 'どこにでもある剣。だが振れば敵は死ぬ。',
  },

  {
    id: 'wp_short_bow',
    name: 'ショートボウ',
    rarity: 'R',
    type: 'bow',
    element: 'none',

    // R は N の上位。近接より瞬間火力は低いが、射程11で一方的に削れるのが売り。
    // （近接は扇内の全員に当たるので、密集時の総ダメージでは近接が上回る）
    base: { atk: 11, rate: 3.0, range: 11.0, crit: 0.08, critDmg: 0.6, knock: 0.18 },
    growth: { atk: 1.0 },

    attack: {
      kind: 'projectile',          // 弾を飛ばす。2体まで貫通
      arcDeg: 0,
      count: 1,
      pierce: 2,
      speed: 26,
      life: 0.9,
      radius: 0.3,
    },

    effects: [],
    visual: { model: 'bow', color: 0x9ad8a0, emissive: 0x2f7a3a, trail: null, scale: 1.0 },
    flavor: '間合いの外から一方的に削る。臆病は生存戦略だ。',
  },
];

/** id → 武器 の索引。毎フレーム find() しないための前計算。 */
export const WEAPON_BY_ID = new Map(WEAPONS.map(w => [w.id, w]));

export const STARTER_WEAPON = 'wp_iron_sword';
