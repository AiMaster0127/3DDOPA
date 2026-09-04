/**
 * 武器データ。
 *
 * ★武器を1本増やす＝この配列にオブジェクトを1つ足すだけ。
 *   ガチャプール・インベントリ・図鑑・戦闘挙動はすべてここを参照する。
 *
 * attack.kind:
 *   'melee_arc'  正面の扇を薙ぐ。arcDeg 内の敵すべてに当たる（密集に強い）
 *   'projectile' 弾を飛ばす。pierce 体まで貫通（射程で安全に削る）
 *
 * effects（特殊効果。装備すると戦闘に反映される）:
 *   { id:'burn',    chance, power, dur }  power = 与ダメージに対する毎秒割合
 *   { id:'freeze',  chance, power, dur }  power = 減速率（0.4 = 40%遅く）
 *   { id:'explode', chance, power, radius } power = 与ダメージに対する倍率
 */
export const WEAPONS = [
  // ─────────── N ───────────
  {
    id: 'wp_iron_sword', name: '鉄の剣', rarity: 'N', type: 'sword', element: 'none',
    base: { atk: 12, rate: 1.7, range: 3.1, crit: 0.05, critDmg: 0.5, knock: 0.45 },
    growth: { atk: 1.2 },
    attack: { kind: 'melee_arc', arcDeg: 115, count: 1, pierce: 99, speed: 0, life: 0.16, radius: 0.6 },
    effects: [],
    visual: { model: 'sword', color: 0xb9c3cc, emissive: 0x000000, scale: 1.0 },
    flavor: 'どこにでもある剣。だが振れば敵は死ぬ。',
  },
  {
    id: 'wp_wood_club', name: '木の棍棒', rarity: 'N', type: 'blunt', element: 'none',
    base: { atk: 19, rate: 1.0, range: 2.9, crit: 0.03, critDmg: 0.5, knock: 1.1 },
    growth: { atk: 1.6 },
    attack: { kind: 'melee_arc', arcDeg: 95, count: 1, pierce: 99, speed: 0, life: 0.22, radius: 0.7 },
    effects: [],
    visual: { model: 'club', color: 0x9a7048, emissive: 0x000000, scale: 1.15 },
    flavor: '遅い。重い。当たれば飛ぶ。',
  },
  {
    id: 'wp_rusty_dagger', name: '錆びた短剣', rarity: 'N', type: 'sword', element: 'none',
    base: { atk: 7, rate: 3.2, range: 2.3, crit: 0.10, critDmg: 0.6, knock: 0.15 },
    growth: { atk: 0.8 },
    attack: { kind: 'melee_arc', arcDeg: 80, count: 1, pierce: 99, speed: 0, life: 0.1, radius: 0.45 },
    effects: [],
    visual: { model: 'dagger', color: 0x8f8a7a, emissive: 0x000000, scale: 0.85 },
    flavor: '刃こぼれしているが、速さは錆びない。',
  },
  {
    id: 'wp_sling', name: 'スリング', rarity: 'N', type: 'gun', element: 'none',
    base: { atk: 8, rate: 2.2, range: 9.0, crit: 0.05, critDmg: 0.5, knock: 0.2 },
    growth: { atk: 0.9 },
    attack: { kind: 'projectile', arcDeg: 0, count: 1, pierce: 0, speed: 22, life: 0.8, radius: 0.28 },
    effects: [],
    visual: { model: 'sling', color: 0xa9a08c, emissive: 0x000000, scale: 1.0 },
    flavor: '石を投げる。原始的だが、届く。',
  },
  {
    id: 'wp_apprentice_wand', name: '見習いの杖', rarity: 'N', type: 'staff', element: 'none',
    base: { atk: 10, rate: 1.9, range: 10.0, crit: 0.05, critDmg: 0.5, knock: 0.1 },
    growth: { atk: 1.1 },
    attack: { kind: 'projectile', arcDeg: 0, count: 1, pierce: 1, speed: 18, life: 1.0, radius: 0.32 },
    effects: [],
    visual: { model: 'wand', color: 0xc0b2e0, emissive: 0x3b2c66, scale: 0.95 },
    flavor: '教本の1ページ目にある呪文しか撃てない。',
  },

  // ─────────── R ───────────
  {
    id: 'wp_short_bow', name: 'ショートボウ', rarity: 'R', type: 'bow', element: 'none',
    base: { atk: 11, rate: 3.0, range: 11.0, crit: 0.08, critDmg: 0.6, knock: 0.18 },
    growth: { atk: 1.0 },
    attack: { kind: 'projectile', arcDeg: 0, count: 1, pierce: 2, speed: 26, life: 0.9, radius: 0.3 },
    effects: [],
    visual: { model: 'bow', color: 0x9ad8a0, emissive: 0x2f7a3a, scale: 1.0 },
    flavor: '間合いの外から一方的に削る。臆病は生存戦略だ。',
  },
  {
    id: 'wp_steel_blade', name: 'スチールブレード', rarity: 'R', type: 'sword', element: 'none',
    base: { atk: 20, rate: 1.8, range: 3.4, crit: 0.08, critDmg: 0.6, knock: 0.5 },
    growth: { atk: 2.0 },
    attack: { kind: 'melee_arc', arcDeg: 125, count: 1, pierce: 99, speed: 0, life: 0.16, radius: 0.65 },
    effects: [],
    visual: { model: 'sword', color: 0xd6dee8, emissive: 0x000000, scale: 1.1 },
    flavor: '鉄の剣の、あるべき姿。',
  },
  {
    id: 'wp_frost_shard', name: 'フロストシャード', rarity: 'R', type: 'staff', element: 'ice',
    base: { atk: 15, rate: 2.1, range: 10.5, crit: 0.07, critDmg: 0.6, knock: 0.15 },
    growth: { atk: 1.5 },
    attack: { kind: 'projectile', arcDeg: 0, count: 1, pierce: 2, speed: 20, life: 1.0, radius: 0.34 },
    effects: [{ id: 'freeze', chance: 0.30, power: 0.45, dur: 1.6 }],
    visual: { model: 'wand', color: 0x7fd4ff, emissive: 0x1a6aa0, scale: 1.0 },
    flavor: '射抜かれた獣は、走る姿勢のまま鈍る。',
  },
  {
    id: 'wp_twin_fang', name: 'ツインファング', rarity: 'R', type: 'sword', element: 'none',
    base: { atk: 10, rate: 3.6, range: 2.7, crit: 0.14, critDmg: 0.7, knock: 0.2 },
    growth: { atk: 1.1 },
    attack: { kind: 'melee_arc', arcDeg: 100, count: 1, pierce: 99, speed: 0, life: 0.1, radius: 0.5 },
    effects: [],
    visual: { model: 'dagger', color: 0xe8b0c8, emissive: 0x60203c, scale: 0.95 },
    flavor: '二本の牙。噛み跡は必ず二つ残る。',
  },
  {
    id: 'wp_ember_axe', name: 'エンバーアクス', rarity: 'R', type: 'axe', element: 'fire',
    base: { atk: 26, rate: 1.2, range: 3.2, crit: 0.06, critDmg: 0.7, knock: 0.85 },
    growth: { atk: 2.4 },
    attack: { kind: 'melee_arc', arcDeg: 110, count: 1, pierce: 99, speed: 0, life: 0.2, radius: 0.7 },
    effects: [{ id: 'burn', chance: 0.25, power: 0.25, dur: 3 }],
    visual: { model: 'axe', color: 0xff8a5c, emissive: 0x7a2a00, scale: 1.2 },
    flavor: '刃の熱が、傷口を焼いて塞がせない。',
  },

  // ─────────── SR ───────────
  {
    id: 'wp_storm_lance', name: 'ストームランス', rarity: 'SR', type: 'spear', element: 'thunder',
    base: { atk: 24, rate: 2.6, range: 13.0, crit: 0.12, critDmg: 0.8, knock: 0.3 },
    growth: { atk: 2.6 },
    attack: { kind: 'projectile', arcDeg: 0, count: 1, pierce: 5, speed: 34, life: 1.0, radius: 0.36 },
    effects: [],
    visual: { model: 'spear', color: 0x8be0ff, emissive: 0x2a7fd0, scale: 1.15 },
    flavor: '雷は一直線に、並んだ全員を貫く。',
  },
  {
    id: 'wp_glacier_maul', name: 'グレイシャーモール', rarity: 'SR', type: 'blunt', element: 'ice',
    base: { atk: 44, rate: 1.0, range: 3.8, crit: 0.07, critDmg: 0.8, knock: 1.3 },
    growth: { atk: 4.0 },
    attack: { kind: 'melee_arc', arcDeg: 165, count: 1, pierce: 99, speed: 0, life: 0.24, radius: 0.85 },
    effects: [{ id: 'freeze', chance: 0.45, power: 0.55, dur: 2.2 }],
    visual: { model: 'club', color: 0xa8e8ff, emissive: 0x1f5c8a, scale: 1.35 },
    flavor: '振り抜いた軌跡に、白い息だけが残る。',
  },
  {
    id: 'wp_venom_repeater', name: 'ヴェノムリピーター', rarity: 'SR', type: 'gun', element: 'dark',
    base: { atk: 13, rate: 4.2, range: 11.5, crit: 0.10, critDmg: 0.7, knock: 0.12 },
    growth: { atk: 1.4 },
    attack: { kind: 'projectile', arcDeg: 16, count: 3, pierce: 1, speed: 30, life: 0.8, radius: 0.26 },
    effects: [{ id: 'burn', chance: 0.30, power: 0.18, dur: 4 }],
    visual: { model: 'gun', color: 0x9ce87a, emissive: 0x2c6a1e, scale: 1.05 },
    flavor: '三発同時。避けきれる者はいない。',
  },
  {
    id: 'wp_shadow_edge', name: 'シャドウエッジ', rarity: 'SR', type: 'sword', element: 'dark',
    base: { atk: 28, rate: 2.2, range: 3.3, crit: 0.30, critDmg: 1.1, knock: 0.4 },
    growth: { atk: 2.9 },
    attack: { kind: 'melee_arc', arcDeg: 120, count: 1, pierce: 99, speed: 0, life: 0.14, radius: 0.6 },
    effects: [],
    visual: { model: 'sword', color: 0x8a6ad0, emissive: 0x3a1a6a, scale: 1.1 },
    flavor: '影から伸びる刃には、予告がない。',
  },

  // ─────────── SSR ───────────
  {
    id: 'wp_flare_blade', name: 'フレアブレード', rarity: 'SSR', type: 'sword', element: 'fire',
    base: { atk: 46, rate: 1.9, range: 3.9, crit: 0.14, critDmg: 0.95, knock: 0.7 },
    growth: { atk: 4.6 },
    attack: { kind: 'melee_arc', arcDeg: 150, count: 1, pierce: 99, speed: 0, life: 0.2, radius: 0.8 },
    effects: [
      { id: 'burn', chance: 0.40, power: 0.40, dur: 4 },
      { id: 'explode', chance: 0.18, power: 1.1, radius: 3.2 },
    ],
    visual: { model: 'greatsword', color: 0xff5a2b, emissive: 0xff2200, scale: 1.3 },
    flavor: '柄を握れば、掌が焦げる音がする。',
  },
  {
    id: 'wp_ruin_cannon', name: 'ルインキャノン', rarity: 'SSR', type: 'gun', element: 'dark',
    base: { atk: 62, rate: 0.9, range: 14.0, crit: 0.10, critDmg: 1.0, knock: 1.0 },
    growth: { atk: 6.0 },
    attack: { kind: 'projectile', arcDeg: 0, count: 1, pierce: 9, speed: 24, life: 1.3, radius: 0.7 },
    effects: [{ id: 'explode', chance: 0.55, power: 0.8, radius: 4.0 }],
    visual: { model: 'cannon', color: 0xc06bff, emissive: 0x5a1a9a, scale: 1.35 },
    flavor: '一発。その先の全員ぶん。',
  },
  {
    id: 'wp_thunder_god', name: '雷神ノ牙', rarity: 'SSR', type: 'spear', element: 'thunder',
    base: { atk: 26, rate: 4.6, range: 12.0, crit: 0.22, critDmg: 1.0, knock: 0.25 },
    growth: { atk: 2.8 },
    attack: { kind: 'projectile', arcDeg: 22, count: 3, pierce: 4, speed: 40, life: 0.9, radius: 0.3 },
    effects: [{ id: 'freeze', chance: 0.20, power: 0.35, dur: 1.2 }],
    visual: { model: 'spear', color: 0xfff06a, emissive: 0xd0a000, scale: 1.25 },
    flavor: '瞬きの間に、三本。撃たれた側は音を後から聞く。',
  },
];

export const WEAPON_BY_ID = new Map(WEAPONS.map(w => [w.id, w]));

/** レアリティ別の索引。ガチャの抽選で使う。 */
export const WEAPONS_BY_RARITY = WEAPONS.reduce((m, w) => {
  (m[w.rarity] ||= []).push(w);
  return m;
}, {});

export const STARTER_WEAPON = 'wp_iron_sword';
