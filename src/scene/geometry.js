/**
 * 形の合成（mergeParts）と、場内装飾のシルエット。
 * 敵は enemyShapes.js、武器は weaponShapes.js、人型は character.js にある。
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
const _c = new THREE.Color();

/**
 * パーツを1つのジオメトリに合成する。
 * ★part に color を付けると頂点カラーとして焼き込む。
 *   キャラクターのように「1体の中で色が何種類も要る」ものを、
 *   マテリアルを増やさずに1メッシュで描くための仕掛け。
 *   （黒レザー・深紅の裏地・金具・肌・髪で5マテリアル＝5 draw call になるのを避ける）
 *
 * @param {Array<{geo:THREE.BufferGeometry, pos?:number[], rot?:number[], scale?:number[],
 *                 color?:number, mul?:number}>} parts
 */
export function mergeParts(parts) {
  const baked = [];
  const colors = [];
  const hasColor = parts.some(p => p.color !== undefined);
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
    if (hasColor) {
      // ★mul>1 を許す。頂点カラーは 0..1 に縛られないので、
      //   ここを 2 前後にすると Lambert のままでも「発光している核」に見える。
      //   emissive のためだけにマテリアルを分けずに済む。
      const c = _c.setHex(p.color ?? 0xffffff).clone();
      if (p.mul) c.multiplyScalar(p.mul);
      colors.push(c);
    }
    total += g.attributes.position.count;
  }

  const pos = new Float32Array(total * 3);
  const nrm = new Float32Array(total * 3);
  const col = hasColor ? new Float32Array(total * 3) : null;
  let o = 0;
  for (let i = 0; i < baked.length; i++) {
    const g = baked[i];
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nrm.set(g.attributes.normal.array, o * 3);
    if (col) {
      // ★setHex は既定で sRGB → リニアへ変換する。頂点カラーはリニアで持つのが正しい
      const c = colors[i];
      for (let k = 0; k < n; k++) {
        col[(o + k) * 3] = c.r; col[(o + k) * 3 + 1] = c.g; col[(o + k) * 3 + 2] = c.b;
      }
    }
    o += n;
    g.dispose();
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

// ───────────────────────── 舞台の装飾 ─────────────────────────

/**
 * テーマごとの装飾の形。
 * ★見下ろし視点では、高く細い物ほど画面端で大きく傾いて見え「倒れかけている」
 *   ように読める。どれも高さ3程度までに抑え、面で見せる。
 */
const DECOR_BUILDERS = {
  // 崩れた石板。倒れたまま風化している
  slab: () => mergeParts([
    { geo: new THREE.BoxGeometry(2.4, 0.44, 1.5), pos: [0, 0.22, 0], rot: [0, 0, 0.05] },
    { geo: new THREE.BoxGeometry(1.5, 1.0, 1.0), pos: [0.45, 0.62, 0.12], rot: [0.12, 0.42, -0.16] },
    { geo: new THREE.BoxGeometry(0.72, 0.34, 0.72), pos: [-1.15, 0.17, 0.42], rot: [0, 0.8, 0.18] },
  ]),
  // 折れた角柱。台座を残して上が欠けている
  column: () => mergeParts([
    { geo: new THREE.BoxGeometry(1.6, 0.3, 1.6), pos: [0, 0.15, 0] },
    { geo: new THREE.CylinderGeometry(0.5, 0.62, 2.0, 8), pos: [0, 1.3, 0] },
    { geo: new THREE.CylinderGeometry(0.3, 0.52, 0.62, 8), pos: [0.12, 2.5, 0.05], rot: [0.18, 0, 0.16] },
  ]),
  // 牙。四角錐なので、どの角度から見ても稜線が立つ
  fang: () => mergeParts([
    { geo: new THREE.BoxGeometry(1.8, 0.28, 1.5), pos: [0, 0.14, 0], rot: [0, 0.3, 0] },
    { geo: new THREE.ConeGeometry(0.6, 2.5, 4), pos: [0, 1.4, 0], rot: [0.14, 0.4, 0.1] },
    { geo: new THREE.ConeGeometry(0.33, 1.3, 4), pos: [0.72, 0.72, 0.3], rot: [-0.18, 0, -0.26] },
  ]),
  // 鉄骨。斜めに突き刺さった梁
  girder: () => mergeParts([
    { geo: new THREE.BoxGeometry(2.1, 0.22, 0.75), pos: [0.35, 0.11, 0.2], rot: [0, 0.5, 0] },
    { geo: new THREE.BoxGeometry(0.3, 2.7, 0.85), pos: [0, 1.35, 0], rot: [0, 0, 0.22] },
    { geo: new THREE.BoxGeometry(1.0, 0.24, 0.24), pos: [-0.32, 2.4, 0], rot: [0, 0, 0.22] },
  ]),
  // 尖塔。低い台座に鋭い四角錐
  spike: () => mergeParts([
    { geo: new THREE.CylinderGeometry(0.85, 1.05, 0.42, 4), pos: [0, 0.21, 0] },
    { geo: new THREE.ConeGeometry(0.5, 2.9, 4), pos: [0, 1.7, 0] },
  ]),
  // 破片。地面から突き出た結晶
  shard: () => mergeParts([
    { geo: new THREE.BoxGeometry(1.4, 0.14, 1.4), pos: [0, 0.07, 0], rot: [0, 0.4, 0] },
    { geo: new THREE.OctahedronGeometry(0.95, 0), pos: [0, 1.5, 0], scale: [0.5, 1.7, 0.5], rot: [0.2, 0.4, 0.14] },
    { geo: new THREE.OctahedronGeometry(0.55, 0), pos: [0.72, 0.62, 0.3], scale: [0.55, 1.3, 0.55], rot: [-0.3, 0, 0.4] },
  ]),
};

/** @param {string} kind data/themes.js の decor.kind */
export function makeDecorGeometry(kind) {
  const build = DECOR_BUILDERS[kind];
  if (!build) {
    console.warn(`未知の decor.kind: ${kind}。slab で代用する`);
    return DECOR_BUILDERS.slab();
  }
  return build();
}
