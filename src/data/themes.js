/**
 * ステージの見た目（テーマ）。
 *
 * ★8ステージが全部同じ景色なのは手抜き。名前が「獣の巣」なのに
 *   「崩れた闘技場」と同じ床では、進んだ実感が出ない。
 *   ここを1件足すだけで舞台がまるごと変わるようにしてある。
 *
 * ★形の方針：**丸を使わない。**
 *   円柱・球・真円のリングは「置いただけ」に見える。
 *   多角形・面取り・斜めに切った角で、硬いシルエットを作る。
 *
 * 使う側：src/scene/Arena.js（床・構造物・空）と
 *         src/scene/SceneManager.js（霧・ライト）。
 */

/**
 * @typedef {object} Theme
 * @property {string} id
 * @property {object} sky      背景の色構成
 * @property {object} fog      霧。色は sky.horizon と揃える（ずれると遠景に帯が出る）
 * @property {object} light    環境光と主光源の色
 * @property {object} floor    床の色・質感
 * @property {object} frame    構造物（外周・段・尖塔）の色
 * @property {object} barrier  結界の色
 * @property {object} decor    場内に散らす構造物
 * @property {object} horizon  遠景のシルエット
 * @property {object} ember    漂う粒子
 */

/** 全テーマ共通の下敷き。各テーマは違うところだけ書く。 */
const BASE = {
  sky: {
    stops: ['#04040c', '#0a0a1c', '#141330', '#241a44', '#3a2352'],
    nebula: ['120, 90, 255', '60, 190, 255'],
    nebulaCount: 7, nebulaAlpha: 0.16,
    stars: 620,
    // ★地平に硬いシルエットを焼き込む。ジオメトリ0で「遠くに何かある」を作れる。
    //   色は持たせない。空を一定量“暗く落とす”ので、どのテーマでも
    //   空より暗く・穴にはならない（固定色にすると明るい空で黒い板になる）
    silhouette: { height: 0.16, teeth: 46, jag: 0.55, spires: 5 },
    band: null,
  },
  fog: { color: 0x241a44, density: 0.0145 },
  light: { sky: 0xb6c0fa, ground: 0x3a2350, hemi: 1.59, dir: 0xfff7eb, dirI: 2.2 },
  floor: {
    base: 0x6982e7, tint: '#8b93c4', accent: 0x3f6cff,
    seam: '90, 220, 255', hazard: '#c8a23c', wear: 1.0, crack: 0.0,
  },
  frame: { base: 0x9bb3ff, tint: '#a8b0d8', accent: 0xffc98a, cap: 0x43e8ff },
  barrier: { rgb: '90, 220, 255', color: 0x5ad8ff, opacity: 0.85 },
  decor: { kind: 'slab', color: 0x5e71c2, glow: 0x4a90ff },
  horizon: { color: 0x25367a, count: 76, height: 1.0 },
  ember: { color: 0x9fc4ff, count: 220, rise: 0.55, size: 0.5 },
};

const merge = (over) => {
  const out = {};
  for (const k of Object.keys(BASE)) out[k] = { ...BASE[k], ...(over[k] || {}) };
  out.id = over.id;
  out.name = over.name;
  return out;
};

export const THEMES = {
  // 1. 崩れた闘技場 — 夜の石造。青紫の月明かりに砂色の床
  ruin: merge({
    id: 'ruin', name: '崩れた闘技場',
    sky: { stops: ['#05050f', '#0b0b1e', '#171634', '#2b1f4a', '#43305c'], stars: 700 },
    floor: { base: 0x9292b3, tint: '#9a9080', accent: 0x8a7bd0, seam: '150, 190, 255',
             wear: 1.35, crack: 0.9 },
    frame: { base: 0xbabaff, tint: '#9d99b4', accent: 0xffc98a, cap: 0x9fb4ff },
    decor: { kind: 'slab', color: 0x7777a7, glow: 0x6f8bff },
    barrier: { rgb: '120, 170, 255', color: 0x86b4ff, opacity: 0.7 },
    horizon: { color: 0x293074, count: 80, height: 1.05 },
    ember: { color: 0xb9c6e8, count: 180, rise: 0.35 },
  }),

  // 2. 砕けた回廊 — 割れた大理石。冷たい白青、長い影
  hall: merge({
    id: 'hall', name: '砕けた回廊',
    sky: { stops: ['#03060f', '#071026', '#0d1c3c', '#153055', '#22496e'],
           nebula: ['80, 170, 255', '150, 210, 255'], stars: 540,
           silhouette: { height: 0.20, teeth: 30, jag: 0.35, spires: 7 } },
    fog: { color: 0x153055, density: 0.0138 },
    light: { sky: 0xcae0ff, ground: 0x2a3a60, hemi: 1.65, dir: 0xffffff, dirI: 2.35 },
    floor: { base: 0x4e6094, tint: '#b2bcd4', accent: 0x5fa8ff, seam: '120, 220, 255',
             wear: 0.8, crack: 0.55 },
    frame: { base: 0xb3e1ff, tint: '#bcc6de', accent: 0xffd9a8, cap: 0x6fe0ff },
    decor: { kind: 'column', color: 0x748fd8, glow: 0x5fb4ff },
    horizon: { color: 0x224488, count: 66, height: 1.35 },
    ember: { color: 0xcfe4ff, count: 150, rise: 0.28 },
  }),

  // 3. 獣の巣 — 土と骨。赤褐色、低く垂れ込めた空
  den: merge({
    id: 'den', name: '獣の巣',
    sky: { stops: ['#0a0405', '#170707', '#2a0f0c', '#411a12', '#5c2a18'],
           nebula: ['255, 110, 60', '180, 60, 40'], nebulaCount: 5, nebulaAlpha: 0.20,
           stars: 240,
           silhouette: { height: 0.22, teeth: 62, jag: 0.85, spires: 3 } },
    fog: { color: 0x411a12, density: 0.0172 },
    light: { sky: 0xffd6be, ground: 0x40160e, hemi: 1.42, dir: 0xffe2c1, dirI: 2.3 },
    floor: { base: 0xb79a8c, tint: '#8a6a52', accent: 0xd06a30, seam: '255, 150, 70',
             hazard: '#a8551f', wear: 1.6, crack: 1.0 },
    frame: { base: 0xcf9370, tint: '#a08066', accent: 0x86c8ff, cap: 0xffb060 },
    barrier: { rgb: '255, 140, 70', color: 0xff9450, opacity: 0.72 },
    decor: { kind: 'fang', color: 0x9d745c, glow: 0xff8a3c },
    horizon: { color: 0x52221b, count: 88, height: 0.85 },
    ember: { color: 0xffb070, count: 260, rise: 0.7 },
  }),

  // 4. 腐食の沼 — 酸化した鉄と毒の緑
  mire: merge({
    id: 'mire', name: '腐食の沼',
    sky: { stops: ['#03080a', '#07161a', '#0d2a26', '#173d2c', '#265237'],
           nebula: ['110, 255, 150', '40, 180, 130'], nebulaCount: 6, nebulaAlpha: 0.18,
           stars: 300,
           silhouette: { height: 0.18, teeth: 52, jag: 0.7, spires: 4 } },
    fog: { color: 0x173d2c, density: 0.0186 },
    light: { sky: 0xcaf7dc, ground: 0x1e3c2c, hemi: 1.47, dir: 0xf0ffe6, dirI: 2.05 },
    floor: { base: 0x5c8e76, tint: '#7d8c6e', accent: 0x54d67a, seam: '120, 255, 160',
             hazard: '#7fbf3f', wear: 1.5, crack: 0.7 },
    frame: { base: 0x93cfa9, tint: '#8c9c7c', accent: 0xc38cff, cap: 0x8fffb0 },
    barrier: { rgb: '120, 255, 160', color: 0x76ec9c, opacity: 0.78 },
    decor: { kind: 'girder', color: 0x678f6c, glow: 0x5cd47a },
    horizon: { color: 0x1b5244, count: 72, height: 0.95 },
    ember: { color: 0xa8ffc0, count: 240, rise: 0.45 },
  }),

  // 5. 雷鳴の尖塔 — 嵐。紫と白、鋭い鉄塔
  spire: merge({
    id: 'spire', name: '雷鳴の尖塔',
    sky: { stops: ['#06030f', '#0e0722', '#1c0f3e', '#2f1a5c', '#4a2a7a'],
           nebula: ['180, 130, 255', '90, 200, 255'], nebulaCount: 8, nebulaAlpha: 0.22,
           stars: 420,
           silhouette: { height: 0.26, teeth: 26, jag: 0.9, spires: 9 } },
    fog: { color: 0x2f1a5c, density: 0.0152 },
    light: { sky: 0xdccfff, ground: 0x2c1a52, hemi: 1.71, dir: 0xf5f0ff, dirI: 2.5 },
    floor: { base: 0x8a83b3, tint: '#9a92c8', accent: 0xa070ff, seam: '190, 150, 255',
             wear: 0.9, crack: 0.4 },
    frame: { base: 0xb093ff, tint: '#a89ed0', accent: 0x8fe6ff, cap: 0xd8b0ff },
    barrier: { rgb: '190, 150, 255', color: 0xb894ff, opacity: 0.9 },
    decor: { kind: 'spike', color: 0x7461d8, glow: 0xa878ff },
    horizon: { color: 0x2c1874, count: 60, height: 1.6 },
    ember: { color: 0xd4b8ff, count: 280, rise: 0.9 },
  }),

  // 6. 灰の平原 — 燠火。橙と鉄錆、低い空
  ash: merge({
    id: 'ash', name: '灰の平原',
    sky: { stops: ['#0a0808', '#171210', '#2c1f16', '#43301c', '#5e4526'],
           nebula: ['255, 160, 70', '200, 90, 40'], nebulaCount: 5, nebulaAlpha: 0.19,
           stars: 180,
           silhouette: { height: 0.14, teeth: 74, jag: 0.45, spires: 2 } },
    fog: { color: 0x43301c, density: 0.0195 },
    light: { sky: 0xffe5cb, ground: 0x3c2c18, hemi: 1.53, dir: 0xffebcc, dirI: 2.15 },
    floor: { base: 0x787168, tint: '#8f8880', accent: 0xff9040, seam: '255, 180, 90',
             hazard: '#d8a030', wear: 1.7, crack: 0.85 },
    frame: { base: 0xccbea9, tint: '#a89c90', accent: 0x7fb4ff, cap: 0xffc070 },
    barrier: { rgb: '255, 170, 90', color: 0xffae60, opacity: 0.68 },
    decor: { kind: 'girder', color: 0x8f8271, glow: 0xff9040 },
    horizon: { color: 0x443629, count: 92, height: 0.7 },
    ember: { color: 0xffc080, count: 320, rise: 1.1, size: 0.62 },
  }),

  // 7. 虚無の縁 — 真空。黒とシアン、幾何だけの世界
  voidedge: merge({
    id: 'voidedge', name: '虚無の縁',
    sky: { stops: ['#000004', '#02030c', '#041018', '#062028', '#0a3440'],
           nebula: ['0, 255, 240', '80, 120, 255'], nebulaCount: 4, nebulaAlpha: 0.14,
           stars: 900,
           silhouette: { height: 0.10, teeth: 18, jag: 1.0, spires: 6 } },
    fog: { color: 0x062028, density: 0.0120 },
    light: { sky: 0xb9f2ff, ground: 0x0a2632, hemi: 1.36, dir: 0xe6fcff, dirI: 2.0 },
    floor: { base: 0x95aabb, tint: '#6e8898', accent: 0x00e6ff, seam: '150, 244, 255',
             hazard: '#00b8cc', wear: 0.45, crack: 0.15 },
    frame: { base: 0x4d7ea5, tint: '#7c94a4', accent: 0xffb45c, cap: 0x60f4ff },
    barrier: { rgb: '0, 240, 255', color: 0x30e8ff, opacity: 0.95 },
    decor: { kind: 'shard', color: 0x31566f, glow: 0x00d8ff },
    horizon: { color: 0x0a2c44, count: 52, height: 1.25 },
    ember: { color: 0x9ff4ff, count: 200, rise: 0.2, size: 0.42 },
  }),

  // 8. 深淵の顎 — 深紅と黒。最終ステージ、肋骨のような構造
  abyss: merge({
    id: 'abyss', name: '深淵の顎',
    sky: { stops: ['#060003', '#12030a', '#240614', '#3c0c1e', '#561428'],
           nebula: ['255, 40, 90', '140, 20, 200'], nebulaCount: 7, nebulaAlpha: 0.21,
           stars: 380,
           silhouette: { height: 0.24, teeth: 34, jag: 0.95, spires: 8 } },
    fog: { color: 0x3c0c1e, density: 0.0168 },
    light: { sky: 0xffc2d4, ground: 0x3a0a1a, hemi: 1.51, dir: 0xffe0e6, dirI: 2.25 },
    floor: { base: 0xbb95ab, tint: '#8a6070', accent: 0xff2e60, seam: '255, 148, 158',
             hazard: '#c02040', wear: 1.45, crack: 0.95 },
    frame: { base: 0xc4548c, tint: '#a07084', accent: 0x4fe0ff, cap: 0xff6e94 },
    barrier: { rgb: '255, 70, 120', color: 0xff5c88, opacity: 0.92 },
    decor: { kind: 'fang', color: 0x7f3b5c, glow: 0xff3a68 },
    horizon: { color: 0x440a1f, count: 70, height: 1.45 },
    ember: { color: 0xff9ab4, count: 300, rise: 0.8 },
  }),
};

/** ステージID → テーマ。ステージを増やしたらここに1行足す。 */
export const STAGE_THEME = {
  1: 'ruin', 2: 'hall', 3: 'den', 4: 'mire',
  5: 'spire', 6: 'ash', 7: 'voidedge', 8: 'abyss',
};

/** @returns {Theme} 未知のIDでも必ずテーマを返す（画面が真っ黒になるより良い） */
export function themeForStage(stageId) {
  return THEMES[STAGE_THEME[stageId]] || THEMES.ruin;
}
