/**
 * 敵データ。
 *
 * ★敵を1種増やす＝この配列にオブジェクトを1つ足すだけ。
 *   描画（InstancedMesh）・湧き・戦闘は visual / ai / 数値を読んで自動で追従する。
 *   新しい ai を使うときだけ combat/EnemyAI.js に挙動を1つ足す。
 *
 * フェーズ2は接触ダメージの3種のみ。射撃敵・分裂敵・ボスはフェーズ5。
 */
export const ENEMIES = [
  {
    id: 'en_slime', name: 'スライム', tier: 1,
    hp: 30, atk: 6, speed: 2.5, radius: 0.55,
    reward: { xp: 3, gems: 1 },
    ai: 'chase',
    element: 'none',
    resist: { fire: -0.25, ice: 0.20 },      // 正=耐性 / 負=弱点
    visual: { geom: 'sphere', color: 0x5ed17f, scale: 1.0 },
  },
  {
    id: 'en_bat', name: 'ケイブバット', tier: 1,
    hp: 18, atk: 5, speed: 5.0, radius: 0.40,
    reward: { xp: 4, gems: 1 },
    ai: 'strafe',                            // 直進せず回り込む。囲まれる圧を作る
    element: 'none',
    resist: { thunder: -0.30 },
    visual: { geom: 'octa', color: 0xa878e8, scale: 0.95, hover: 0.75 },   // 飛行。浮かせて区別する
  },
  {
    id: 'en_brute', name: 'ブルート', tier: 2,
    hp: 95, atk: 15, speed: 1.9, radius: 0.90,
    reward: { xp: 11, gems: 3 },
    ai: 'chase',
    element: 'none',
    resist: { ice: -0.25, dark: 0.25 },
    visual: { geom: 'box', color: 0xd9564e, scale: 1.0 },
  },

  {
    id: 'en_stinger', name: 'スティンガー', tier: 2,
    hp: 34, atk: 8, speed: 2.2, radius: 0.48,
    reward: { xp: 7, gems: 2 },
    ai: 'shooter',                           // 距離を取って撃つ。近寄るだけでは倒せない相手
    shoot: { range: 13, cd: 2.2, speed: 15, dmg: 9, radius: 0.34, keep: 8.5 },
    element: 'none',
    resist: { fire: -0.2 },
    visual: { geom: 'cone', color: 0xffb648, scale: 0.95 },
  },
  {
    id: 'en_charger', name: 'チャージャー', tier: 2,
    hp: 55, atk: 19, speed: 2.6, radius: 0.6,
    reward: { xp: 9, gems: 2 },
    ai: 'charger',                           // 溜めてから突進する。予備動作で読ませる
    charge: { windup: 0.7, dash: 0.45, speedMul: 5.2, cd: 2.4, range: 11 },
    element: 'none',
    resist: { ice: -0.3 },
    visual: { geom: 'box', color: 0xff6a8a, scale: 0.95 },
  },
  {
    id: 'en_blob', name: 'ブロブ', tier: 2,
    hp: 60, atk: 9, speed: 2.0, radius: 0.75,
    reward: { xp: 8, gems: 2 },
    ai: 'chase',
    split: { id: 'en_blobling', count: 2 },  // 倒すと分裂する
    element: 'none',
    resist: { dark: 0.25 },
    visual: { geom: 'sphere', color: 0xc0e85e, scale: 1.0 },
  },
  {
    id: 'en_blobling', name: 'ブロブの欠片', tier: 1,
    hp: 20, atk: 6, speed: 3.4, radius: 0.4,
    reward: { xp: 3, gems: 0 },
    ai: 'chase',
    element: 'none',
    resist: {},
    visual: { geom: 'sphere', color: 0xd8f08a, scale: 1.0 },
  },

  // ─────────── ボス ───────────
  {
    id: 'bs_gorehorn', name: 'ゴアホーン', tier: 3, boss: true,
    hp: 2600, atk: 26, speed: 2.9, radius: 2.1,
    reward: { xp: 260, gems: 60, tickets: 1 },
    ai: 'boss_gorehorn',
    charge: { windup: 0.85, dash: 0.7, speedMul: 4.6, cd: 3.0, range: 30 },
    slam: { cd: 4.5, radius: 6.5, dmg: 30, windup: 0.7 },
    phases: [
      { hpPct: 1.00, speedMul: 1.0, cdMul: 1.0 },
      { hpPct: 0.50, speedMul: 1.3, cdMul: 0.7 },   // 半分を切ると激しくなる
    ],
    element: 'none',
    resist: { ice: -0.2, dark: 0.2 },
    visual: { geom: 'box', color: 0x8b1a1a, scale: 1.0 },
  },
  {
    id: 'bs_voidmaw', name: 'ヴォイドモウ', tier: 5, boss: true,
    hp: 7200, atk: 34, speed: 2.2, radius: 2.5,
    reward: { xp: 700, gems: 150, tickets: 2 },
    ai: 'boss_voidmaw',
    shoot: { range: 26, cd: 1.5, speed: 14, dmg: 16, radius: 0.5, keep: 11, spread: 5 },
    summon: { id: 'en_bat', count: 4, cd: 8.0 },
    phases: [
      { hpPct: 1.00, speedMul: 1.0, cdMul: 1.0 },
      { hpPct: 0.65, speedMul: 1.15, cdMul: 0.75 },
      { hpPct: 0.30, speedMul: 1.35, cdMul: 0.55 },
    ],
    element: 'dark',
    resist: { dark: 0.4, thunder: -0.25 },
    visual: { geom: 'octa', color: 0x6a2ea8, scale: 1.0 },
  },
];

export const ENEMY_BY_ID = new Map(ENEMIES.map(e => [e.id, e]));

/** InstancedMesh は配列順に1つずつ作るので、添字を固定しておく。 */
ENEMIES.forEach((e, i) => { e.index = i; });
