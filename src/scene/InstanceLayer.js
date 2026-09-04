/**
 * 大量オブジェクト（敵・弾）の描画。
 *
 * ★本作の描画設計の中核。
 *   アーキタイプごとに InstancedMesh を1つ作り、毎フレーム行列と色を流し込む。
 *   敵が200体いても敵の draw call はアーキタイプ数（＝3）で済む。
 *
 * 論理側（entities/）は three.js を知らない。ここが唯一の橋渡し。
 */
import * as THREE from '../../vendor/three/three.module.min.js';
import { ENEMIES } from '../data/enemies.js';
import { lerp, wrapAngle } from '../core/math.js';

// ★毎フレーム new しない。全部モジュールスコープで使い回す
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);
const WHITE = new THREE.Color(1, 1, 1);

/** data/enemies.js の visual.geom 文字列 → ジオメトリ。低ポリで揃える。 */
function makeGeometry(kind) {
  switch (kind) {
    case 'sphere':  return new THREE.SphereGeometry(0.5, 10, 8);
    case 'box':     return new THREE.BoxGeometry(0.95, 0.95, 0.95);
    case 'octa':    return new THREE.OctahedronGeometry(0.6, 0);
    case 'cone':    return new THREE.ConeGeometry(0.5, 1.1, 8);
    case 'capsule': return new THREE.CapsuleGeometry(0.42, 0.6, 3, 8);
    default:
      console.warn(`未知の visual.geom: ${kind}。box で代用する`);
      return new THREE.BoxGeometry(0.95, 0.95, 0.95);
  }
}

export class InstanceLayer {
  /**
   * @param {THREE.Scene} scene
   * @param {import('../entities/Enemy.js').EnemyPool} enemies
   * @param {import('../entities/Projectile.js').ProjectilePool} projectiles
   */
  constructor(scene, enemies, projectiles) {
    this.enemies = enemies;
    this.projectiles = projectiles;

    this.group = new THREE.Group();
    scene.add(this.group);

    // ---- 敵：アーキタイプごとに1つ ----
    this.enemyIMs = ENEMIES.map(arch => {
      const im = new THREE.InstancedMesh(
        makeGeometry(arch.visual.geom),
        // ★マテリアルの色は白にしておく。実際の色は instanceColor で与える。
        //   こうしないと「被弾で白く光らせる」ができない（乗算では明るくできない）
        new THREE.MeshLambertMaterial({ color: 0xffffff }),
        enemies.cap
      );
      im.frustumCulled = false;      // アリーナ全体が視界内。境界球の再計算を省く
      im.castShadow = true;
      im.receiveShadow = false;      // 雑魚に落ちる影は見えない。描画負荷だけ増える
      im.count = 0;
      im.__color = new THREE.Color(arch.visual.color);
      im.__scale = arch.visual.scale;
      im.__hover = arch.visual.hover || 0;

      // ★接地オフセットはジオメトリの下端から求める。
      //   球・箱・八面体で下端が違うので、決め打ちの 0.5 だと浮く／沈む
      im.geometry.computeBoundingBox();
      im.__yOff = -im.geometry.boundingBox.min.y;
      this.group.add(im);
      return im;
    });

    // ---- 弾：1種類ぶん（武器が増えたら visualIndex で分岐させる） ----
    const projGeo = new THREE.CapsuleGeometry(0.16, 0.34, 3, 6);
    projGeo.rotateX(Math.PI / 2);    // +Z（進行方向）に寝かせる
    this.projIM = new THREE.InstancedMesh(
      projGeo,
      // 弾は自発光に見せたいのでライティング不要。Basic がいちばん安い
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      projectiles.cap
    );
    this.projIM.frustumCulled = false;
    this.projIM.count = 0;
    this.projIM.__color = new THREE.Color(0xffe9a8);
    this.group.add(this.projIM);
  }

  /** 敵の影は高品質時のみ。中/低では影パスから外して描画量を半減させる。 */
  applyQuality(tier) {
    const cast = tier.shadows && tier.shadowMap >= 1024;
    for (const im of this.enemyIMs) im.castShadow = cast;
  }

  /** @param {number} alpha 前フレームからの補間係数 */
  sync(alpha) {
    this._syncEnemies(alpha);
    this._syncProjectiles(alpha);
  }

  _syncEnemies(alpha) {
    const ims = this.enemyIMs;
    for (let i = 0; i < ims.length; i++) ims[i].__n = 0;

    const list = this.enemies.list;
    for (let i = 0; i < this.enemies.cap; i++) {
      const e = list[i];
      if (!e.active) continue;

      const im = ims[e.archIndex];
      const n = im.__n++;

      const sc = e.radius * 2 * im.__scale;
      _p.set(lerp(e.px, e.x, alpha), sc * im.__yOff + im.__hover, lerp(e.pz, e.z, alpha));
      _q.setFromAxisAngle(UP, e.pFacing + wrapAngle(e.facing - e.pFacing) * alpha);
      _s.setScalar(sc);
      im.setMatrixAt(n, _m.compose(_p, _q, _s));

      // 被弾フラッシュ：基本色 → 白。マテリアルを増やさずに表現する。
      // ★真っ白まで飛ばすと敵の種類が読めなくなるので上限を抑え、
      //   二乗で減衰させて「一瞬光る」形にする
      const f = e.flash > 0 ? e.flash : 0;
      im.setColorAt(n, _c.copy(im.__color).lerp(WHITE, f * f * 0.7));
    }

    for (let i = 0; i < ims.length; i++) {
      const im = ims[i];
      im.count = im.__n;                       // ★描画数を実数に絞る
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }

  _syncProjectiles(alpha) {
    const im = this.projIM;
    let n = 0;

    const list = this.projectiles.list;
    for (let i = 0; i < this.projectiles.cap; i++) {
      const p = list[i];
      if (!p.active) continue;

      _p.set(lerp(p.px, p.x, alpha), 1.0, lerp(p.pz, p.z, alpha));
      _e.set(0, p.facing, 0);
      _q.setFromEuler(_e);
      _s.setScalar(1);
      im.setMatrixAt(n, _m.compose(_p, _q, _s));
      im.setColorAt(n, im.__color);
      n++;
    }

    im.count = n;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }
}
