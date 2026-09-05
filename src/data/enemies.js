/**
 * 敵データ。
 *
 * ★敵を1種増やす＝この配列にオブジェクトを1つ足すだけ。
 *   描画（InstancedMesh）・湧き・戦闘は visual / ai / 数値を読んで自動で追従する。
 *   新しい ai を使うときだけ combat/EnemyAI.js に挙動を1つ足す。
 *
 * ★見た目の言語（自機の設定画に合わせる）
 *   黒に近い装甲 ＋ **深紅の発光核** ＋ 骨の角。原色の体は使わない。
 *   核があるおかげで「これは敵」と一目で判り、金と寒色の自機と混ざらない。
 *
 *   visual.pal が src/scene/enemyShapes.js の ENEMY_PAL を上書きする。
 *   body/edge が体、core が発光核、bone が角と牙、metal が金具。
 *   visual.color は足元に敷く光の色（＝その敵の識別色）にだけ使う。
 */
export const ENEMIES = [
  {
    id: 'en_slime', name: '屍蟲', tier: 1,
    hp: 30, atk: 6, speed: 2.5, radius: 0.55,
    reward: { xp: 3, gems: 1 },
    ai: 'chase',
    element: 'none',
    resist: { fire: -0.25, ice: 0.20 },      // 正=耐性 / 負=弱点
    visual: { geom: 'sphere', color: 0xff4a52, scale: 1.0, glow: 0xff5a62,
              pal: { body: 0x27313a, edge: 0x39454f, core: 0xff2c3e, bone: 0xc9c0a6 } },
  },
  {
    id: 'en_bat', name: '影蝠', tier: 1,
    hp: 18, atk: 5, speed: 5.0, radius: 0.40,
    reward: { xp: 4, gems: 1 },
    ai: 'strafe',                            // 直進せず回り込む。囲まれる圧を作る
    element: 'none',
    resist: { thunder: -0.30 },
    // 飛行。浮かせて区別する
    visual: { geom: 'octa', color: 0xa15cff, scale: 0.95, hover: 0.75, glow: 0xb87dff,
              pal: { body: 0x241f33, edge: 0x342b48, core: 0xc65cff, bone: 0xd6cbb0 } },
  },
  {
    id: 'en_brute', name: '鬼武者', tier: 2,
    hp: 95, atk: 15, speed: 1.9, radius: 0.90,
    reward: { xp: 11, gems: 3 },
    ai: 'chase',
    element: 'none',
    resist: { ice: -0.25, dark: 0.25 },
    visual: { geom: 'box', color: 0xff3a2a, scale: 1.0, glow: 0xff6a4a,
              pal: { body: 0x2b2126, edge: 0x40323a, core: 0xff2c2c, bone: 0xd8ccae, metal: 0xc79a3e } },
  },

  {
    id: 'en_stinger', name: '針魔', tier: 2,
    hp: 34, atk: 8, speed: 2.2, radius: 0.48,
    reward: { xp: 7, gems: 2 },
    ai: 'shooter',                           // 距離を取って撃つ。近寄るだけでは倒せない相手
    shoot: { range: 13, cd: 2.2, speed: 15, dmg: 9, radius: 0.34, keep: 8.5 },
    element: 'none',
    resist: { fire: -0.2 },
    visual: { geom: 'cone', color: 0xffa028, scale: 0.95, glow: 0xffb452,
              pal: { body: 0x2e2a20, edge: 0x413a2b, core: 0xff9a1e, bone: 0xe0d4b2 } },
  },
  {
    id: 'en_charger', name: '角鬼', tier: 2,
    hp: 55, atk: 19, speed: 2.6, radius: 0.6,
    reward: { xp: 9, gems: 2 },
    ai: 'charger',                           // 溜めてから突進する。予備動作で読ませる
    charge: { windup: 0.7, dash: 0.45, speedMul: 5.2, cd: 2.4, range: 11 },
    element: 'none',
    resist: { ice: -0.3 },
    visual: { geom: 'wedge', color: 0xff2f62, scale: 0.95, glow: 0xff5c86,
              pal: { body: 0x2f2028, edge: 0x452e39, core: 0xff2a58, bone: 0xdccfae } },
  },
  {
    id: 'en_blob', name: '肉塊', tier: 2,
    hp: 60, atk: 9, speed: 2.0, radius: 0.75,
    reward: { xp: 8, gems: 2 },
    ai: 'chase',
    split: { id: 'en_blobling', count: 2 },  // 倒すと分裂する
    element: 'none',
    resist: { dark: 0.25 },
    visual: { geom: 'blob', color: 0x8de03a, scale: 1.0, glow: 0xa8e85a,
              pal: { body: 0x27302a, edge: 0x36413a, core: 0x9cff3c, bone: 0xd0cba8 } },
  },
  {
    id: 'en_blobling', name: '肉片', tier: 1,
    hp: 20, atk: 6, speed: 3.4, radius: 0.4,
    reward: { xp: 3, gems: 0 },
    ai: 'chase',
    element: 'none',
    resist: {},
    visual: { geom: 'sphere', color: 0xa8e85a, scale: 1.0, glow: 0xc4f07a,
              pal: { body: 0x2b332b, edge: 0x3c453c, core: 0x9cff3c, bone: 0xd0cba8 } },
  },

  {
    id: 'en_revenant', name: '剣鬼', tier: 3,
    hp: 78, atk: 17, speed: 3.1, radius: 0.55,
    reward: { xp: 12, gems: 3 },
    // 短い溜めから踏み込む。近接の間合いを覚えていないと必ず食らう
    ai: 'charger',
    charge: { windup: 0.42, dash: 0.30, speedMul: 6.4, cd: 1.8, range: 9 },
    element: 'none',
    resist: { dark: 0.20, fire: -0.20 },
    visual: { geom: 'revenant', color: 0xff3a4e, scale: 1.05, glow: 0xff5566,
              pal: { body: 0x1f2029, edge: 0x333644, core: 0xff2c3e, bone: 0xe2d8bc, metal: 0xc99b3a } },
  },
  {
    id: 'en_lantern', name: '火霊', tier: 2,
    hp: 42, atk: 10, speed: 1.7, radius: 0.46,
    reward: { xp: 8, gems: 2 },
    ai: 'shooter',
    shoot: { range: 15, cd: 1.9, speed: 12, dmg: 11, radius: 0.38, keep: 10 },
    element: 'fire',
    resist: { fire: 0.35, ice: -0.35 },
    // 浮遊。核がむき出しなので、遠くからでも「撃ってくる奴」だと判る
    visual: { geom: 'lantern', color: 0xffae3a, scale: 1.0, hover: 0.95, glow: 0xffc46a,
              pal: { body: 0x2a2420, edge: 0x3d342c, core: 0xffa42a, bone: 0xe0d6bc, metal: 0xc79a3e } },
  },
  {
    id: 'en_serpent', name: '蛟', tier: 3,
    hp: 120, atk: 14, speed: 3.6, radius: 0.72,
    reward: { xp: 16, gems: 4 },
    ai: 'strafe',                            // 回り込みながら間合いを詰める
    element: 'thunder',
    resist: { thunder: 0.35, ice: -0.25 },
    visual: { geom: 'serpent', color: 0x3ad8ff, scale: 1.05, hover: 0.35, glow: 0x6ae4ff,
              pal: { body: 0x1c2a33, edge: 0x2b3d49, core: 0x3ad8ff, bone: 0xd8cfb4 } },
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
    // boss は BossView が使う専用の形（src/scene/bossShapes.js）
    visual: { geom: 'box', boss: 'gorehorn', color: 0xff3020, scale: 1.0, glow: 0xff5a3c,
              pal: { body: 0x2a1a1a, edge: 0x412828, core: 0xff2418, bone: 0xe2d4b0, metal: 0xd0a13c } },
  },
  {
    id: 'bs_thunderdrake', name: '雷龍', tier: 4, boss: true,
    hp: 4600, atk: 30, speed: 3.4, radius: 2.3,
    reward: { xp: 430, gems: 95, tickets: 1 },
    ai: 'boss_drake',
    // 空へ逃げず、回り込みながら雷を吐き、隙を見て突っ込んでくる
    charge: { windup: 0.55, dash: 0.55, speedMul: 5.4, cd: 4.2, range: 22 },
    shoot: { range: 22, cd: 1.7, speed: 20, dmg: 18, radius: 0.42, keep: 12, spread: 3 },
    slam: { cd: 6.5, radius: 7.5, dmg: 34, windup: 0.8 },
    phases: [
      { hpPct: 1.00, speedMul: 1.0, cdMul: 1.0 },
      { hpPct: 0.55, speedMul: 1.2, cdMul: 0.72 },
      { hpPct: 0.25, speedMul: 1.4, cdMul: 0.52 },
    ],
    element: 'thunder',
    resist: { thunder: 0.45, ice: -0.25 },
    visual: { geom: 'serpent', boss: 'drake', color: 0x4ad8ff, scale: 1.0, glow: 0x7ae8ff,
              pal: { body: 0x1b2731, edge: 0x2c3f4c, core: 0x5ce0ff, bone: 0xdcd2b6, metal: 0xc9a83c } },
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
    visual: { geom: 'octa', boss: 'voidmaw', color: 0xa858ff, scale: 1.0, glow: 0xc86bff,
              hover: 1.0,                              // 脚を持たない。浮かせる
              pal: { body: 0x1d1630, edge: 0x2e2247, core: 0xc44cff, bone: 0xd8cdc0 } },
  },
];

export const ENEMY_BY_ID = new Map(ENEMIES.map(e => [e.id, e]));

/** InstancedMesh は配列順に1つずつ作るので、添字を固定しておく。 */
ENEMIES.forEach((e, i) => { e.index = i; });
