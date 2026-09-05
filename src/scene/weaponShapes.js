/**
 * 武器のシルエット。
 *
 * ★デザインの基準は設定画の刀。
 *   - 黒い柄・棹（haft）
 *   - **深紅の柄巻き**（wrap）
 *   - **金の鍔・金具**（guard）
 *   - 明るい鋼の刃（blade）と、刃先だけさらに明るい刃文（edge）
 *   これを全種に通すと、形が違っても「同じ武器庫の品」に見える。
 *
 * ★色は頂点カラーで焼く。1本の中で刃・柄巻き・鍔を塗り分けたいが、
 *   マテリアルを3枚に分けると装備するだけで draw call が3倍になる。
 *
 * ★引いた武器が違って見えないと、ガチャの意味が半分になる。
 *   刃・柄・鍔まで作らなくても、輪郭が違えば別物として認識される。
 */
import * as THREE from '../../vendor/three/three.module.min.js';
import { mergeParts } from './geometry.js';

export const WEAPON_PAL = {
  blade: 0xc8d4e2,   // 鋼
  edge: 0xf4f8ff,    // 刃文。刃先だけ明るくすると「切れそう」に見える
  wrap: 0x8e1522,    // 柄巻き（深紅）
  guard: 0xc9992f,   // 鍔・金具（金）
  haft: 0x241f22,    // 柄・棹（黒）
  core: 0xff2c3e,    // 発光部
};

const CORE_MUL = 2.2;

/** 柄。黒い芯に深紅の巻きと金の縁金具を通す共通パーツ */
function grip(P, len, z, r = 0.055) {
  return [
    { geo: new THREE.BoxGeometry(r * 2, r * 2, len), pos: [0, 0, z], color: P.haft },
    // 柄巻き。菱に見せるため小さな箱を等間隔で並べる
    ...Array.from({ length: Math.max(2, Math.round(len / 0.11)) }, (_, i) => ({
      geo: new THREE.BoxGeometry(r * 2.2, r * 2.2, 0.045),
      pos: [0, 0, z - len / 2 + 0.055 + i * 0.11],
      rot: [0, 0, Math.PI / 4],
      color: P.wrap,
    })),
    // 柄頭
    { geo: new THREE.BoxGeometry(r * 2.5, r * 2.5, 0.06), pos: [0, 0, z - len / 2], color: P.guard },
  ];
}

const BUILDERS = {
  /** 刀。反りは頂点で作らず、峰側を薄く削いだ台形で「らしさ」を出す */
  sword: (P) => mergeParts([
    { geo: new THREE.BoxGeometry(0.085, 0.035, 1.02), pos: [0, 0.01, 0.34], color: P.blade },
    { geo: new THREE.BoxGeometry(0.030, 0.014, 1.02), pos: [0, -0.02, 0.34], color: P.edge },
    { geo: new THREE.ConeGeometry(0.055, 0.22, 4), pos: [0, 0.01, 0.94], rot: [Math.PI / 2, Math.PI / 4, 0], color: P.edge },
    // 鍔。八角にすると金物らしくなる
    { geo: new THREE.CylinderGeometry(0.14, 0.14, 0.035, 8), pos: [0, 0, -0.19], rot: [Math.PI / 2, 0, 0], color: P.guard },
    ...grip(P, 0.34, -0.37),
  ]),

  /** 大太刀。刀を一回り大きく、鍔も厚く */
  greatsword: (P) => mergeParts([
    { geo: new THREE.BoxGeometry(0.135, 0.05, 1.42), pos: [0, 0.012, 0.46], color: P.blade },
    { geo: new THREE.BoxGeometry(0.048, 0.02, 1.42), pos: [0, -0.028, 0.46], color: P.edge },
    { geo: new THREE.ConeGeometry(0.085, 0.32, 4), pos: [0, 0.012, 1.30], rot: [Math.PI / 2, Math.PI / 4, 0], color: P.edge },
    { geo: new THREE.CylinderGeometry(0.20, 0.20, 0.05, 8), pos: [0, 0, -0.26], rot: [Math.PI / 2, 0, 0], color: P.guard },
    ...grip(P, 0.50, -0.53, 0.07),
  ]),

  /** 短刀 */
  dagger: (P) => mergeParts([
    { geo: new THREE.BoxGeometry(0.07, 0.03, 0.50), pos: [0, 0.008, 0.18], color: P.blade },
    { geo: new THREE.BoxGeometry(0.026, 0.012, 0.50), pos: [0, -0.016, 0.18], color: P.edge },
    { geo: new THREE.ConeGeometry(0.045, 0.16, 4), pos: [0, 0.008, 0.50], rot: [Math.PI / 2, Math.PI / 4, 0], color: P.edge },
    { geo: new THREE.CylinderGeometry(0.09, 0.09, 0.028, 6), pos: [0, 0, -0.10], rot: [Math.PI / 2, 0, 0], color: P.guard },
    ...grip(P, 0.22, -0.22, 0.045),
  ]),

  /** 鉞。棹に大きな刃を片側だけ付ける */
  axe: (P) => mergeParts([
    { geo: new THREE.BoxGeometry(0.07, 0.07, 1.02), pos: [0, 0, 0.20], color: P.haft },
    { geo: new THREE.BoxGeometry(0.34, 0.05, 0.40), pos: [0.15, 0, 0.60], color: P.blade },
    { geo: new THREE.BoxGeometry(0.10, 0.03, 0.40), pos: [0.31, 0, 0.60], color: P.edge },
    { geo: new THREE.BoxGeometry(0.13, 0.10, 0.12), pos: [0, 0, 0.60], color: P.guard },
    { geo: new THREE.ConeGeometry(0.06, 0.22, 4), pos: [0, 0, 0.82], rot: [Math.PI / 2, Math.PI / 4, 0], color: P.guard },
    ...grip(P, 0.30, -0.20, 0.05),
  ]),

  /** 金棒。鋲を打った鉄の棍 */
  club: (P) => mergeParts([
    { geo: new THREE.CylinderGeometry(0.13, 0.19, 0.62, 6), pos: [0, 0, 0.52], rot: [Math.PI / 2, 0, 0], color: P.haft },
    ...Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2;
      return { geo: new THREE.ConeGeometry(0.045, 0.10, 4),
               pos: [Math.cos(a) * 0.155, Math.sin(a) * 0.155, 0.42 + (i % 2) * 0.22],
               rot: [0, 0, -a - Math.PI / 2], color: P.guard };
    }),
    { geo: new THREE.CylinderGeometry(0.20, 0.20, 0.05, 6), pos: [0, 0, 0.82], rot: [Math.PI / 2, 0, 0], color: P.guard },
    ...grip(P, 0.34, 0.02, 0.055),
  ]),

  /** 槍。長い棹に笹穂 */
  spear: (P) => mergeParts([
    { geo: new THREE.CylinderGeometry(0.042, 0.042, 1.5, 5), pos: [0, 0, 0.28], rot: [Math.PI / 2, 0, 0], color: P.haft },
    { geo: new THREE.ConeGeometry(0.10, 0.46, 4), pos: [0, 0, 1.16], rot: [Math.PI / 2, Math.PI / 4, 0], color: P.blade },
    { geo: new THREE.ConeGeometry(0.045, 0.30, 4), pos: [0, 0, 1.22], rot: [Math.PI / 2, Math.PI / 4, 0], color: P.edge },
    { geo: new THREE.CylinderGeometry(0.07, 0.07, 0.10, 6), pos: [0, 0, 0.90], rot: [Math.PI / 2, 0, 0], color: P.guard },
    ...Array.from({ length: 3 }, (_, i) => ({
      geo: new THREE.BoxGeometry(0.10, 0.10, 0.05), pos: [0, 0, 0.10 - i * 0.24],
      rot: [0, 0, Math.PI / 4], color: P.wrap,
    })),
  ]),

  /** 薙刀。棹の先に反った刃 */
  naginata: (P) => mergeParts([
    { geo: new THREE.CylinderGeometry(0.045, 0.045, 1.30, 5), pos: [0, 0, 0.10], rot: [Math.PI / 2, 0, 0], color: P.haft },
    { geo: new THREE.BoxGeometry(0.095, 0.035, 0.66), pos: [0.07, 0.01, 0.98], rot: [0, -0.22, 0], color: P.blade },
    { geo: new THREE.BoxGeometry(0.034, 0.016, 0.66), pos: [0.10, -0.02, 0.98], rot: [0, -0.22, 0], color: P.edge },
    { geo: new THREE.ConeGeometry(0.055, 0.22, 4), pos: [0.16, 0.01, 1.29], rot: [Math.PI / 2, Math.PI / 4, -0.22], color: P.edge },
    { geo: new THREE.CylinderGeometry(0.075, 0.075, 0.09, 8), pos: [0, 0, 0.68], rot: [Math.PI / 2, 0, 0], color: P.guard },
    ...Array.from({ length: 4 }, (_, i) => ({
      geo: new THREE.BoxGeometry(0.105, 0.105, 0.05), pos: [0, 0, -0.05 - i * 0.20],
      rot: [0, 0, Math.PI / 4], color: P.wrap,
    })),
  ]),

  /** 大鎌。柄と直交する長い刃 */
  scythe: (P) => mergeParts([
    { geo: new THREE.CylinderGeometry(0.05, 0.05, 1.34, 5), pos: [0, 0, 0.16], rot: [Math.PI / 2, 0, 0], color: P.haft },
    { geo: new THREE.BoxGeometry(0.72, 0.04, 0.11), pos: [0.36, 0, 0.80], rot: [0, 0, 0], color: P.blade },
    { geo: new THREE.BoxGeometry(0.72, 0.02, 0.04), pos: [0.36, -0.02, 0.755], color: P.edge },
    { geo: new THREE.ConeGeometry(0.07, 0.30, 4), pos: [0.80, 0, 0.72], rot: [0, 0, Math.PI / 2], color: P.edge },
    { geo: new THREE.BoxGeometry(0.13, 0.11, 0.13), pos: [0.02, 0, 0.80], color: P.guard },
    ...Array.from({ length: 4 }, (_, i) => ({
      geo: new THREE.BoxGeometry(0.115, 0.115, 0.05), pos: [0, 0, 0.02 - i * 0.20],
      rot: [0, 0, Math.PI / 4], color: P.wrap,
    })),
  ]),

  /** 和弓。上下非対称に握る */
  bow: (P) => mergeParts([
    { geo: new THREE.TorusGeometry(0.46, 0.032, 4, 10, Math.PI * 1.2), pos: [0, 0.06, 0.16], rot: [0, Math.PI / 2, 0.3], color: P.haft },
    { geo: new THREE.BoxGeometry(0.012, 0.012, 0.86), pos: [0, 0.06, 0.16], color: P.edge },
    { geo: new THREE.BoxGeometry(0.07, 0.07, 0.20), pos: [0, -0.06, 0.16], rot: [0, 0, Math.PI / 4], color: P.wrap },
    { geo: new THREE.ConeGeometry(0.045, 0.14, 4), pos: [0, 0.52, 0.16], color: P.guard },
  ]),

  /** 短筒。黒い銃身に金の飾り金具 */
  gun: (P) => mergeParts([
    { geo: new THREE.BoxGeometry(0.12, 0.14, 0.56), pos: [0, 0.02, 0.22], color: P.haft },
    { geo: new THREE.CylinderGeometry(0.05, 0.05, 0.50, 6), pos: [0, 0.04, 0.56], rot: [Math.PI / 2, 0, 0], color: P.blade },
    { geo: new THREE.CylinderGeometry(0.065, 0.065, 0.06, 6), pos: [0, 0.04, 0.80], rot: [Math.PI / 2, 0, 0], color: P.guard },
    { geo: new THREE.BoxGeometry(0.10, 0.24, 0.11), pos: [0, -0.14, -0.02], rot: [0.25, 0, 0], color: P.wrap },
    { geo: new THREE.BoxGeometry(0.13, 0.05, 0.10), pos: [0, 0.05, 0.06], color: P.guard },
  ]),

  /** 大筒。太い銃身に帯金 */
  cannon: (P) => mergeParts([
    { geo: new THREE.CylinderGeometry(0.16, 0.13, 0.88, 7), pos: [0, 0.04, 0.48], rot: [Math.PI / 2, 0, 0], color: P.haft },
    { geo: new THREE.CylinderGeometry(0.21, 0.21, 0.12, 7), pos: [0, 0.04, 0.90], rot: [Math.PI / 2, 0, 0], color: P.guard },
    { geo: new THREE.CylinderGeometry(0.18, 0.18, 0.06, 7), pos: [0, 0.04, 0.52], rot: [Math.PI / 2, 0, 0], color: P.guard },
    { geo: new THREE.BoxGeometry(0.14, 0.26, 0.14), pos: [0, -0.12, 0.04], color: P.wrap },
    { geo: new THREE.OctahedronGeometry(0.09, 0), pos: [0, 0.04, 0.16], color: P.core, mul: CORE_MUL },
  ]),

  /** 呪具。錫杖の先に浮く核 */
  wand: (P) => mergeParts([
    { geo: new THREE.CylinderGeometry(0.035, 0.045, 0.86, 5), pos: [0, 0, 0.18], rot: [Math.PI / 2, 0, 0], color: P.haft },
    { geo: new THREE.CylinderGeometry(0.09, 0.09, 0.06, 8), pos: [0, 0, 0.56], rot: [Math.PI / 2, 0, 0], color: P.guard },
    { geo: new THREE.OctahedronGeometry(0.15, 0), pos: [0, 0.02, 0.74], color: P.core, mul: CORE_MUL },
    ...Array.from({ length: 3 }, (_, i) => {
      const a = (i / 3) * Math.PI * 2;
      return { geo: new THREE.ConeGeometry(0.03, 0.20, 3),
               pos: [Math.cos(a) * 0.13, 0.02 + Math.sin(a) * 0.13, 0.66],
               rot: [Math.PI / 2, 0, -a], color: P.guard };
    }),
    ...Array.from({ length: 3 }, (_, i) => ({
      geo: new THREE.BoxGeometry(0.095, 0.095, 0.05), pos: [0, 0, 0.02 - i * 0.16],
      rot: [0, 0, Math.PI / 4], color: P.wrap,
    })),
  ]),

  /** 手裏剣束。投げ具。持ち手に苦無を束ねる */
  sling: (P) => mergeParts([
    { geo: new THREE.BoxGeometry(0.09, 0.09, 0.34), pos: [0, 0, -0.06], rot: [0, 0, Math.PI / 4], color: P.wrap },
    ...Array.from({ length: 3 }, (_, i) => {
      const x = (i - 1) * 0.09;
      return [
        { geo: new THREE.BoxGeometry(0.05, 0.02, 0.34), pos: [x, 0.01, 0.26], rot: [0, (i - 1) * 0.18, 0], color: P.blade },
        { geo: new THREE.ConeGeometry(0.035, 0.14, 4), pos: [x + (i - 1) * 0.03, 0.01, 0.48], rot: [Math.PI / 2, Math.PI / 4, 0], color: P.edge },
      ];
    }).flat(),
    { geo: new THREE.BoxGeometry(0.24, 0.05, 0.06), pos: [0, 0, 0.10], color: P.guard },
  ]),
};

/**
 * @param {string} model data/weapons.js の visual.model
 * @param {object} pal   data/weapons.js の visual.pal（WEAPON_PAL を上書き）
 */
export function makeWeaponGeometry(model, pal) {
  const build = BUILDERS[model];
  const P = pal ? { ...WEAPON_PAL, ...pal } : WEAPON_PAL;
  if (!build) {
    console.warn(`未知の visual.model: ${model}。sword で代用する`);
    return BUILDERS.sword(P);
  }
  return build(P);
}

/** 用意されている武器の形の一覧（データ側の指定ミスを検査するのに使う）。 */
export const WEAPON_MODELS = Object.keys(BUILDERS);
