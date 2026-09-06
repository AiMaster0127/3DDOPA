/**
 * 敵のシルエット。
 *
 * ★デザインの言語（自機の設定画に合わせる）
 *   - 黒に近い装甲。派手な原色は使わない
 *   - **深紅の発光核**。生きているのが判る一点を必ず持たせる。
 *     これが敵の共通記号になり、自機（金と寒色）と一目で見分けが付く
 *   - 骨・角は生成りの白。黒の中で刃物のように効く
 *   - 直線と稜線。丸い塊のままにしない
 *
 * ★色は頂点カラーで焼く。InstancedMesh の instanceColor は
 *   被弾フラッシュ専用にして、1体の中の塗り分けをジオメトリ側に持たせている。
 *
 * ★三角形の予算は見た目の2倍で効く（敵150体＋影のパス）。
 *   1体あたり130三角形までに収めること。countEnemyTriangles() で確認できる。
 */
import * as THREE from '../../vendor/three/three.module.min.js';
import { mergeParts } from './geometry.js';

/** 既定の配色。data/enemies.js の visual.pal が上書きする。 */
export const ENEMY_PAL = {
  body: 0x23252d,   // 黒い装甲
  edge: 0x3a3e4c,   // 面の切り替え。少し明るくして稜線を立てる
  core: 0xff2c3e,   // 深紅の発光核
  bone: 0xcabfa4,   // 骨・角・牙
  metal: 0xb8903c,  // 金具
};

/** 発光核。1を超える倍率を掛けて「光っている」ように見せる */
const CORE_MUL = 2.3;

/**
 * ★全体の高さがおおよそ1になるよう作る。InstanceLayer が半径に合わせて拡縮する。
 */
const BUILDERS = {
  /** 屍の塊。丸い体に骨板と核を埋める */
  sphere: (P) => mergeParts([
    { geo: new THREE.SphereGeometry(0.5, 8, 6), pos: [0, 0.46, 0], scale: [1, 0.9, 1], color: P.body },
    // 背の骨板。上から見たときの識別になる
    { geo: new THREE.BoxGeometry(0.14, 0.30, 0.44), pos: [0, 0.74, -0.06], rot: [0.3, 0, 0], color: P.bone },
    { geo: new THREE.BoxGeometry(0.10, 0.22, 0.34), pos: [0.24, 0.66, -0.10], rot: [0.3, 0, 0.5], color: P.bone },
    { geo: new THREE.BoxGeometry(0.10, 0.22, 0.34), pos: [-0.24, 0.66, -0.10], rot: [0.3, 0, -0.5], color: P.bone },
    // 深紅の核
    { geo: new THREE.OctahedronGeometry(0.17, 0), pos: [0, 0.44, 0.34], color: P.core, mul: CORE_MUL },
  ]),

  /** こぶだらけの肉塊。核を2つ持たせて「増える」印象にする */
  blob: (P) => mergeParts([
    { geo: new THREE.SphereGeometry(0.46, 8, 5), pos: [0, 0.42, 0], scale: [1.1, 0.86, 1], color: P.body },
    { geo: new THREE.OctahedronGeometry(0.26, 0), pos: [0.30, 0.60, -0.06], color: P.body },
    { geo: new THREE.OctahedronGeometry(0.22, 0), pos: [-0.28, 0.54, 0.10], color: P.body },
    { geo: new THREE.OctahedronGeometry(0.20, 0), pos: [0.04, 0.74, 0.14], color: P.edge },
    { geo: new THREE.OctahedronGeometry(0.13, 0), pos: [0.16, 0.40, 0.36], color: P.core, mul: CORE_MUL },
    { geo: new THREE.OctahedronGeometry(0.10, 0), pos: [-0.20, 0.56, 0.30], color: P.core, mul: CORE_MUL },
  ]),

  /** 重装。肩当てと胸の核 */
  box: (P) => mergeParts([
    { geo: new THREE.BoxGeometry(0.62, 0.56, 0.46), pos: [0, 0.40, 0], color: P.body },
    { geo: new THREE.BoxGeometry(0.86, 0.20, 0.50), pos: [0, 0.66, -0.02], color: P.edge },
    { geo: new THREE.BoxGeometry(0.22, 0.26, 0.24), pos: [0.44, 0.60, 0], rot: [0, 0, 0.3], color: P.body },
    { geo: new THREE.BoxGeometry(0.22, 0.26, 0.24), pos: [-0.44, 0.60, 0], rot: [0, 0, -0.3], color: P.body },
    { geo: new THREE.BoxGeometry(0.34, 0.26, 0.30), pos: [0, 0.86, 0.02], color: P.body },
    // 兜の角
    { geo: new THREE.ConeGeometry(0.07, 0.30, 4), pos: [0.16, 1.02, -0.02], rot: [-0.2, 0, 0.4], color: P.bone },
    { geo: new THREE.ConeGeometry(0.07, 0.30, 4), pos: [-0.16, 1.02, -0.02], rot: [-0.2, 0, -0.4], color: P.bone },
    { geo: new THREE.BoxGeometry(0.20, 0.14, 0.08), pos: [0, 0.44, 0.25], color: P.core, mul: CORE_MUL },
  ]),

  /** 刺突。前に長い穂先 */
  cone: (P) => mergeParts([
    { geo: new THREE.ConeGeometry(0.34, 0.72, 4), pos: [0, 0.36, 0], color: P.body },
    { geo: new THREE.ConeGeometry(0.13, 0.62, 4), pos: [0, 0.50, 0.34], rot: [Math.PI / 2, 0, 0], color: P.bone },
    { geo: new THREE.BoxGeometry(0.06, 0.30, 0.26), pos: [0.24, 0.34, -0.14], rot: [0, 0, -0.4], color: P.edge },
    { geo: new THREE.BoxGeometry(0.06, 0.30, 0.26), pos: [-0.24, 0.34, -0.14], rot: [0, 0, 0.4], color: P.edge },
    { geo: new THREE.OctahedronGeometry(0.13, 0), pos: [0, 0.52, 0.02], color: P.core, mul: CORE_MUL },
  ]),

  /** 翼。飛行する影 */
  octa: (P) => mergeParts([
    { geo: new THREE.OctahedronGeometry(0.34, 0), pos: [0, 0.50, 0], scale: [1, 0.9, 1.2], color: P.body },
    { geo: new THREE.BoxGeometry(0.60, 0.05, 0.34), pos: [0.44, 0.56, -0.06], rot: [0, 0.3, 0.34], color: P.edge },
    { geo: new THREE.BoxGeometry(0.60, 0.05, 0.34), pos: [-0.44, 0.56, -0.06], rot: [0, -0.3, -0.34], color: P.edge },
    // 翼端の爪
    { geo: new THREE.ConeGeometry(0.06, 0.26, 3), pos: [0.74, 0.64, -0.10], rot: [0, 0, -1.1], color: P.bone },
    { geo: new THREE.ConeGeometry(0.06, 0.26, 3), pos: [-0.74, 0.64, -0.10], rot: [0, 0, 1.1], color: P.bone },
    { geo: new THREE.ConeGeometry(0.13, 0.34, 4), pos: [0, 0.46, 0.34], rot: [Math.PI / 2, 0, 0], color: P.body },
    { geo: new THREE.BoxGeometry(0.22, 0.07, 0.05), pos: [0, 0.56, 0.26], color: P.core, mul: CORE_MUL },
  ]),

  /** 角のある突進体。前傾させて「来る」感じを出す */
  wedge: (P) => mergeParts([
    { geo: new THREE.BoxGeometry(0.60, 0.42, 0.76), pos: [0, 0.34, 0], rot: [-0.12, 0, 0], color: P.body },
    { geo: new THREE.BoxGeometry(0.46, 0.24, 0.30), pos: [0, 0.30, 0.44], rot: [-0.25, 0, 0], color: P.edge },
    { geo: new THREE.ConeGeometry(0.09, 0.44, 4), pos: [0.20, 0.44, 0.44], rot: [1.15, 0, 0.22], color: P.bone },
    { geo: new THREE.ConeGeometry(0.09, 0.44, 4), pos: [-0.20, 0.44, 0.44], rot: [1.15, 0, -0.22], color: P.bone },
    { geo: new THREE.BoxGeometry(0.50, 0.16, 0.34), pos: [0, 0.58, -0.16], rot: [0.22, 0, 0], color: P.edge },
    { geo: new THREE.BoxGeometry(0.16, 0.10, 0.06), pos: [0, 0.30, 0.56], color: P.core, mul: CORE_MUL },
  ]),

  /** 剣鬼。刀を提げた小柄な人型。自機と同じ言語で「敵側の剣士」 */
  revenant: (P) => mergeParts([
    { geo: new THREE.BoxGeometry(0.34, 0.42, 0.24), pos: [0, 0.52, 0], color: P.body },
    { geo: new THREE.CylinderGeometry(0.26, 0.40, 0.36, 6, 1, true), pos: [0, 0.22, 0], color: P.body },
    { geo: new THREE.BoxGeometry(0.44, 0.14, 0.26), pos: [0, 0.74, 0], color: P.edge },
    { geo: new THREE.BoxGeometry(0.28, 0.26, 0.24), pos: [0, 0.92, 0.01], color: P.body },
    // 面。横一文字の紅い眼
    { geo: new THREE.BoxGeometry(0.22, 0.05, 0.04), pos: [0, 0.93, 0.14], color: P.core, mul: CORE_MUL },
    { geo: new THREE.ConeGeometry(0.05, 0.24, 4), pos: [0.11, 1.10, -0.02], rot: [-0.2, 0, 0.3], color: P.bone },
    { geo: new THREE.ConeGeometry(0.05, 0.24, 4), pos: [-0.11, 1.10, -0.02], rot: [-0.2, 0, -0.3], color: P.bone },
    // 刀
    { geo: new THREE.BoxGeometry(0.05, 0.04, 0.72), pos: [0.28, 0.52, 0.10], rot: [0.3, 0, 0], color: P.bone },
    { geo: new THREE.BoxGeometry(0.07, 0.06, 0.16), pos: [0.28, 0.40, -0.22], rot: [0.3, 0, 0], color: P.metal },
  ]),

  /** 火霊。浮かぶ提灯。核をむき出しにした射手 */
  lantern: (P) => mergeParts([
    { geo: new THREE.OctahedronGeometry(0.30, 0), pos: [0, 0.56, 0], scale: [1, 1.25, 1], color: P.body },
    { geo: new THREE.CylinderGeometry(0.34, 0.34, 0.06, 6, 1, true), pos: [0, 0.56, 0], color: P.metal },
    { geo: new THREE.OctahedronGeometry(0.17, 0), pos: [0, 0.56, 0], color: P.core, mul: CORE_MUL },
    // 吊り下がった鉤爪
    { geo: new THREE.ConeGeometry(0.06, 0.34, 3), pos: [0.18, 0.20, 0.10], rot: [Math.PI, 0, 0.2], color: P.bone },
    { geo: new THREE.ConeGeometry(0.06, 0.34, 3), pos: [-0.16, 0.22, -0.10], rot: [Math.PI, 0, -0.2], color: P.bone },
    { geo: new THREE.ConeGeometry(0.06, 0.30, 3), pos: [0.02, 0.18, -0.18], rot: [Math.PI, 0, 0], color: P.bone },
    { geo: new THREE.ConeGeometry(0.10, 0.26, 4), pos: [0, 0.94, 0], color: P.edge },
  ]),

  /** 蛇。節で繋いだ胴。設定画の龍のモチーフをそのまま敵にした */
  serpent: (P) => mergeParts([
    { geo: new THREE.BoxGeometry(0.34, 0.26, 0.34), pos: [0, 0.44, -0.42], rot: [0, 0.4, 0], color: P.body },
    { geo: new THREE.BoxGeometry(0.38, 0.30, 0.34), pos: [0, 0.40, -0.10], rot: [0, -0.3, 0], color: P.edge },
    { geo: new THREE.BoxGeometry(0.36, 0.30, 0.34), pos: [0, 0.44, 0.22], rot: [0, 0.25, 0], color: P.body },
    { geo: new THREE.ConeGeometry(0.22, 0.44, 4), pos: [0, 0.46, 0.52], rot: [Math.PI / 2, Math.PI / 4, 0], color: P.body },
    { geo: new THREE.ConeGeometry(0.06, 0.32, 4), pos: [0.13, 0.62, 0.36], rot: [-0.5, 0, 0.3], color: P.bone },
    { geo: new THREE.ConeGeometry(0.06, 0.32, 4), pos: [-0.13, 0.62, 0.36], rot: [-0.5, 0, -0.3], color: P.bone },
    { geo: new THREE.BoxGeometry(0.18, 0.06, 0.05), pos: [0, 0.48, 0.60], color: P.core, mul: CORE_MUL },
    { geo: new THREE.OctahedronGeometry(0.11, 0), pos: [0, 0.50, -0.20], color: P.core, mul: CORE_MUL },
  ]),
};

/** 用意されている形の一覧（データ側の指定ミスを検査するのに使う）。 */
export const ENEMY_SHAPES = Object.keys(BUILDERS);

/**
 * @param {string} kind data/enemies.js の visual.geom
 * @param {object} pal  data/enemies.js の visual.pal（ENEMY_PAL を上書き）
 */
export function makeEnemyGeometry(kind, pal) {
  const build = BUILDERS[kind];
  const P = pal ? { ...ENEMY_PAL, ...pal } : ENEMY_PAL;
  if (!build) {
    console.warn(`未知の visual.geom: ${kind}。box で代用する`);
    return BUILDERS.box(P);
  }
  return build(P);
}

/**
 * 敵1体あたりの三角形数を数える。
 * ★敵は最大150体、影のパスでもう一度描かれるので、ここが2倍で効く。
 *   形を足したら必ずこの数字を見ること（tools/perf.mjs が総数を検証する）。
 */
export function countEnemyTriangles() {
  const out = {};
  for (const kind of Object.keys(BUILDERS)) {
    const g = makeEnemyGeometry(kind);
    out[kind] = g.attributes.position.count / 3;
    g.dispose();
  }
  return out;
}
