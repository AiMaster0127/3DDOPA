/**
 * 敵と武器のシルエット生成。
 *
 * ★プリミティブを1つ置くだけだと「色つきの図形」に見えて、生き物にも武器にも見えない。
 *   複数のプリミティブを合成して1つのジオメトリに焼き込み、形で語らせる。
 *
 * ★合成しても InstancedMesh は1つのまま＝draw call は増えない。
 *   増えるのは頂点数だけなので、1体あたり200三角形程度に抑える
 *   （敵150体で3万三角形。予算6万の半分）。
 *
 * three の BufferGeometryUtils は examples 側にあり同梱していないので、
 * 必要な最小限（インデックスを剥がしての連結）だけ自前で持つ。
 */
import * as THREE from '../../vendor/three/three.module.min.js';

const _m = new THREE.Matrix4();
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

/**
 * パーツを1つのジオメトリに合成する。
 * @param {Array<{geo:THREE.BufferGeometry, pos?:number[], rot?:number[], scale?:number[]}>} parts
 */
export function mergeParts(parts) {
  const baked = [];
  let total = 0;

  for (const p of parts) {
    // ★インデックスを剥がしてから連結する。付いたままだと
    //   結合時に番号の付け替えが要り、間違えると別の形になる。
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();

    _v.fromArray(p.pos || [0, 0, 0]);
    _e.fromArray(p.rot || [0, 0, 0]);
    _q.setFromEuler(_e);
    _s.fromArray(p.scale || [1, 1, 1]);
    g.applyMatrix4(_m.compose(_v, _q, _s));

    baked.push(g);
    total += g.attributes.position.count;
  }

  const pos = new Float32Array(total * 3);
  const nrm = new Float32Array(total * 3);
  let o = 0;
  for (const g of baked) {
    pos.set(g.attributes.position.array, o * 3);
    nrm.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
    g.dispose();
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

// ───────────────────────── 敵 ─────────────────────────

/**
 * data/enemies.js の visual.geom → シルエット。
 * ★全体の高さがおおよそ1になるよう作る。InstanceLayer が半径に合わせて拡縮する。
 */
const BUILDERS = {
  /**
   * スライム：潰れた球に小さな瘤。「ぷるん」とした塊に見せる。
   * ★分割数は切り詰める。敵は最大150体、しかも影のパスでもう一度描かれるので
   *   1体あたりの三角形がそのまま2倍で効いてくる。
   */
  sphere: () => mergeParts([
    { geo: new THREE.SphereGeometry(0.5, 8, 6), pos: [0, -0.04, 0], scale: [1, 0.82, 1] },
    { geo: new THREE.SphereGeometry(0.19, 5, 4), pos: [0.16, 0.3, 0.24] },
    { geo: new THREE.SphereGeometry(0.13, 4, 3), pos: [-0.2, 0.26, 0.14] },
  ]),

  /** コウモリ：八面体の胴に薄い翼。飛んでいる形が一目で判る */
  octa: () => mergeParts([
    { geo: new THREE.OctahedronGeometry(0.34, 0), scale: [1, 1.25, 0.85] },
    { geo: new THREE.BoxGeometry(0.62, 0.05, 0.34), pos: [0.42, 0.06, -0.04], rot: [0, 0, 0.32] },
    { geo: new THREE.BoxGeometry(0.62, 0.05, 0.34), pos: [-0.42, 0.06, -0.04], rot: [0, 0, -0.32] },
    { geo: new THREE.ConeGeometry(0.09, 0.22, 4), pos: [0, 0.06, 0.4], rot: [Math.PI / 2, 0, 0] },
  ]),

  /** ブルート：胴＋肩当て＋小さな頭。重量級の輪郭 */
  box: () => mergeParts([
    { geo: new THREE.BoxGeometry(0.78, 0.66, 0.7), pos: [0, -0.05, 0] },
    { geo: new THREE.BoxGeometry(0.26, 0.3, 0.36), pos: [0.5, 0.16, 0], rot: [0, 0, -0.22] },
    { geo: new THREE.BoxGeometry(0.26, 0.3, 0.36), pos: [-0.5, 0.16, 0], rot: [0, 0, 0.22] },
    { geo: new THREE.BoxGeometry(0.42, 0.3, 0.36), pos: [0, 0.44, 0.08] },
  ]),

  /** スティンガー：円錐の胴に前へ伸びる針と尾びれ。「撃ってくる」形 */
  cone: () => mergeParts([
    { geo: new THREE.ConeGeometry(0.42, 0.86, 6), pos: [0, -0.06, 0] },
    { geo: new THREE.ConeGeometry(0.1, 0.5, 4), pos: [0, 0.02, 0.44], rot: [Math.PI / 2, 0, 0] },
    { geo: new THREE.BoxGeometry(0.06, 0.34, 0.3), pos: [0.26, -0.2, -0.18], rot: [0, 0, -0.3] },
    { geo: new THREE.BoxGeometry(0.06, 0.34, 0.3), pos: [-0.26, -0.2, -0.18], rot: [0, 0, 0.3] },
  ]),

  /** チャージャー：楔形の胴に2本の角。突っ込んでくる形 */
  wedge: () => mergeParts([
    { geo: new THREE.BoxGeometry(0.66, 0.5, 0.86), pos: [0, -0.06, 0] },
    { geo: new THREE.ConeGeometry(0.11, 0.42, 4), pos: [0.2, 0.14, 0.44], rot: [1.25, 0, 0] },
    { geo: new THREE.ConeGeometry(0.11, 0.42, 4), pos: [-0.2, 0.14, 0.44], rot: [1.25, 0, 0] },
    { geo: new THREE.BoxGeometry(0.5, 0.18, 0.3), pos: [0, 0.28, -0.2] },
  ]),

  /** ブロブ：本体に小さな塊が付いた、分裂しそうな形 */
  blob: () => mergeParts([
    { geo: new THREE.SphereGeometry(0.46, 8, 6), scale: [1, 0.9, 1] },
    { geo: new THREE.SphereGeometry(0.22, 5, 4), pos: [0.34, 0.16, 0.12] },
    { geo: new THREE.SphereGeometry(0.19, 5, 4), pos: [-0.3, 0.1, -0.2] },
    { geo: new THREE.SphereGeometry(0.16, 4, 3), pos: [0.06, 0.42, -0.16] },
  ]),

  capsule: () => new THREE.CapsuleGeometry(0.42, 0.6, 3, 8),
};

/** @param {string} kind data/enemies.js の visual.geom */
export function makeEnemyGeometry(kind) {
  const build = BUILDERS[kind];
  if (!build) {
    console.warn(`未知の visual.geom: ${kind}。box で代用する`);
    return BUILDERS.box();
  }
  return build();
}

// ───────────────────────── 武器 ─────────────────────────

/**
 * data/weapons.js の visual.model → 手に持つ武器の形。
 * ★引いた武器が違って見えないと、ガチャの意味が半分になる。
 *   刃・柄・鍔まで作らなくても、輪郭が違えば別物として認識される。
 */
const WEAPON_BUILDERS = {
  sword: () => mergeParts([
    { geo: new THREE.BoxGeometry(0.09, 0.05, 1.0), pos: [0, 0, 0.3] },       // 刀身
    { geo: new THREE.ConeGeometry(0.06, 0.2, 4), pos: [0, 0, 0.88], rot: [Math.PI / 2, 0, 0] },
    { geo: new THREE.BoxGeometry(0.26, 0.06, 0.07), pos: [0, 0, -0.24] },    // 鍔
    { geo: new THREE.BoxGeometry(0.06, 0.06, 0.26), pos: [0, 0, -0.4] },     // 柄
  ]),
  greatsword: () => mergeParts([
    { geo: new THREE.BoxGeometry(0.17, 0.06, 1.35), pos: [0, 0, 0.42] },
    { geo: new THREE.ConeGeometry(0.11, 0.32, 4), pos: [0, 0, 1.22], rot: [Math.PI / 2, 0, 0] },
    { geo: new THREE.BoxGeometry(0.42, 0.08, 0.1), pos: [0, 0, -0.3] },
    { geo: new THREE.BoxGeometry(0.08, 0.08, 0.34), pos: [0, 0, -0.5] },
  ]),
  dagger: () => mergeParts([
    { geo: new THREE.BoxGeometry(0.07, 0.04, 0.5), pos: [0, 0, 0.18] },
    { geo: new THREE.ConeGeometry(0.05, 0.16, 4), pos: [0, 0, 0.5], rot: [Math.PI / 2, 0, 0] },
    { geo: new THREE.BoxGeometry(0.18, 0.05, 0.06), pos: [0, 0, -0.12] },
    { geo: new THREE.BoxGeometry(0.05, 0.05, 0.2), pos: [0, 0, -0.24] },
  ]),
  axe: () => mergeParts([
    { geo: new THREE.BoxGeometry(0.07, 0.07, 1.0), pos: [0, 0, 0.18] },      // 柄
    { geo: new THREE.BoxGeometry(0.34, 0.06, 0.4), pos: [0.14, 0, 0.6] },    // 刃
    { geo: new THREE.ConeGeometry(0.1, 0.26, 3), pos: [0, 0, 0.82], rot: [Math.PI / 2, 0, 0] },
  ]),
  club: () => mergeParts([
    { geo: new THREE.BoxGeometry(0.08, 0.08, 0.7), pos: [0, 0, 0.02] },
    { geo: new THREE.CylinderGeometry(0.2, 0.15, 0.44, 6), pos: [0, 0, 0.58], rot: [Math.PI / 2, 0, 0] },
    { geo: new THREE.BoxGeometry(0.3, 0.09, 0.09), pos: [0, 0, 0.58] },
  ]),
  spear: () => mergeParts([
    { geo: new THREE.CylinderGeometry(0.04, 0.04, 1.5, 5), pos: [0, 0, 0.28], rot: [Math.PI / 2, 0, 0] },
    { geo: new THREE.ConeGeometry(0.1, 0.44, 4), pos: [0, 0, 1.15], rot: [Math.PI / 2, 0, 0] },
    { geo: new THREE.BoxGeometry(0.16, 0.05, 0.14), pos: [0, 0, 0.86] },
  ]),
  bow: () => mergeParts([
    { geo: new THREE.TorusGeometry(0.42, 0.035, 4, 10, Math.PI * 1.25), pos: [0, 0, 0.2], rot: [0, Math.PI / 2, 0] },
    { geo: new THREE.BoxGeometry(0.012, 0.012, 0.78), pos: [0, 0, 0.2], rot: [0, 0, 0] },
  ]),
  gun: () => mergeParts([
    { geo: new THREE.BoxGeometry(0.12, 0.14, 0.62), pos: [0, 0.02, 0.24] },
    { geo: new THREE.CylinderGeometry(0.055, 0.055, 0.5, 6), pos: [0, 0.04, 0.6], rot: [Math.PI / 2, 0, 0] },
    { geo: new THREE.BoxGeometry(0.09, 0.24, 0.1), pos: [0, -0.14, -0.02], rot: [0.25, 0, 0] },
  ]),
  cannon: () => mergeParts([
    { geo: new THREE.CylinderGeometry(0.17, 0.13, 0.9, 7), pos: [0, 0.04, 0.5], rot: [Math.PI / 2, 0, 0] },
    { geo: new THREE.CylinderGeometry(0.21, 0.21, 0.14, 7), pos: [0, 0.04, 0.92], rot: [Math.PI / 2, 0, 0] },
    { geo: new THREE.BoxGeometry(0.14, 0.26, 0.14), pos: [0, -0.12, 0.06] },
  ]),
  wand: () => mergeParts([
    { geo: new THREE.CylinderGeometry(0.035, 0.045, 0.9, 5), pos: [0, 0, 0.2], rot: [Math.PI / 2, 0, 0] },
    { geo: new THREE.OctahedronGeometry(0.14, 0), pos: [0, 0.02, 0.72] },
  ]),
  sling: () => mergeParts([
    { geo: new THREE.BoxGeometry(0.06, 0.06, 0.42), pos: [0, 0, 0.0] },
    { geo: new THREE.BoxGeometry(0.04, 0.3, 0.04), pos: [0.1, 0.14, 0.2], rot: [0, 0, -0.4] },
    { geo: new THREE.BoxGeometry(0.04, 0.3, 0.04), pos: [-0.1, 0.14, 0.2], rot: [0, 0, 0.4] },
    { geo: new THREE.SphereGeometry(0.09, 5, 4), pos: [0, 0.26, 0.24] },
  ]),
};

/** @param {string} model data/weapons.js の visual.model */
export function makeWeaponGeometry(model) {
  const build = WEAPON_BUILDERS[model];
  if (!build) {
    console.warn(`未知の visual.model: ${model}。sword で代用する`);
    return WEAPON_BUILDERS.sword();
  }
  return build();
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
