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
import { withRim } from './materials.js';
import { makeGlowTexture } from './textures.js';
import { makeEnemyGeometry } from './enemyShapes.js';

// ★毎フレーム new しない。全部モジュールスコープで使い回す
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);
const _bill = new THREE.Quaternion();   // 光の板をカメラへ向ける回転
const WHITE = new THREE.Color(1, 1, 1);

/**
 * ★リムライトは曲面では綺麗に出るが、平面には向かない。
 *   箱の側面はひとつの面全体が同じ角度なので、面まるごとが白く光ってしまう。
 *   形ごとに強さを変えて、平面主体の敵は控えめにする。
 */
const RIM_BY_GEOM = {
  sphere:  { color: 0xdcf0ff, power: 3.4, strength: 0.55 },
  blob:    { color: 0xdcf0ff, power: 3.4, strength: 0.55 },
  octa:    { color: 0xdcf0ff, power: 3.0, strength: 0.42 },
  cone:    { color: 0xdcf0ff, power: 3.2, strength: 0.38 },
  capsule: { color: 0xdcf0ff, power: 3.4, strength: 0.55 },
  box:      { color: 0xbcd8ff, power: 4.5, strength: 0.24 },
  wedge:    { color: 0xbcd8ff, power: 4.5, strength: 0.24 },
  revenant: { color: 0xbcd8ff, power: 4.2, strength: 0.28 },
  lantern:  { color: 0xffd0a8, power: 3.2, strength: 0.44 },
  serpent:  { color: 0xbcd8ff, power: 4.0, strength: 0.30 },
};

/**
 * ★被弾フラッシュの行き先。
 *   頂点カラーで塗るようにしたので instanceColor の平常値は白（＝素通し）。
 *   白へ寄せても何も起きないので、1を超える値まで持ち上げて白飛びさせる。
 */
const FLASH = new THREE.Color(3.0, 3.0, 3.0);

export class InstanceLayer {
  /**
   * @param {THREE.Scene} scene
   * @param {import('../entities/Enemy.js').EnemyPool} enemies
   * @param {import('../entities/Projectile.js').ProjectilePool} projectiles
   */
  constructor(scene, enemies, projectiles, pickups) {
    this.enemies = enemies;
    this.projectiles = projectiles;
    this.pickups = pickups;

    this.group = new THREE.Group();
    scene.add(this.group);

    // ---- 敵：アーキタイプごとに1つ ----
    this.enemyIMs = ENEMIES.map(arch => {
      const im = new THREE.InstancedMesh(
        makeEnemyGeometry(arch.visual.geom, arch.visual.pal),
        // ★1体の中の塗り分け（黒い装甲・深紅の核・骨の角）は頂点カラーで持つ。
        //   instanceColor は被弾フラッシュ専用にした。
        //   素直にマテリアルを分けると、アーキタイプごとに何枚も要る。
        // ★リムライトで輪郭を起こす。暗い床の上で敵の形が読めるかどうかは
        //   ここで決まる（塗りだけだとシルエットが潰れる）。
        withRim(
          new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true }),
          RIM_BY_GEOM[arch.visual.geom] || RIM_BY_GEOM.box
        ),
        enemies.cap
      );
      im.frustumCulled = false;      // アリーナ全体が視界内。境界球の再計算を省く
      im.castShadow = true;
      im.receiveShadow = false;      // 雑魚に落ちる影は見えない。描画負荷だけ増える
      im.count = 0;
      // 平常時は素通し（白）。塗りはジオメトリの頂点カラーが持っている
      im.__color = new THREE.Color(1, 1, 1);
      im.__scale = arch.visual.scale;
      im.__hover = arch.visual.hover || 0;
      im.__glow = new THREE.Color(arch.visual.glow || arch.visual.color);

      // ★接地オフセットはジオメトリの下端から求める。
      //   球・箱・八面体で下端が違うので、決め打ちの 0.5 だと浮く／沈む
      im.geometry.computeBoundingBox();
      im.__yOff = -im.geometry.boundingBox.min.y;
      this.group.add(im);
      return im;
    });

    // ★敵のまわりに淡い光を敷く。暗い床の上でシルエットが浮き、
    //   「ただの色つきの球」から「エネルギー体」に見え方が変わる。
    this.glowTex0 = makeGlowTexture(128, 0.02);
    this.enemyGlows = ENEMIES.map(() => {
      const gi = new THREE.InstancedMesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          map: this.glowTex0, color: 0xffffff, transparent: true, opacity: 0.6,
          blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
        }),
        enemies.cap
      );
      gi.frustumCulled = false;
      gi.count = 0;
      this.group.add(gi);
      return gi;
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
    this.projIM.__hostileColor = new THREE.Color(0xff5a6e);   // 敵弾は赤。避けるべき物だと一目で判る
    this.group.add(this.projIM);

    // ★弾のまわりに加算の光を重ねる。全画面ブルームの代用で、
    //   これがあると「発光している」と読めるようになる。
    this.glowTex = makeGlowTexture(128, 0.10);
    this.projGlow = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: this.glowTex, color: 0xffffff, transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
      }),
      projectiles.cap
    );
    this.projGlow.frustumCulled = false;
    this.projGlow.count = 0;
    this.group.add(this.projGlow);

    // ---- 経験値ジェム ----
    // ★Basic（無照明）だと八面体が真上から見て「ただの四角」に見えてしまう。
    //   Lambert にして陰影を付けると、小さくても立体の宝石として読める。
    //   emissive を少し入れて暗い床の上でも沈まないようにする。
    this.pickupIM = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(0.28, 0),
      new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x1d7a60 }),
      pickups.cap
    );
    this.pickupIM.frustumCulled = false;
    this.pickupIM.count = 0;
    this.pickupIM.__color = new THREE.Color(0x6ef0c8);
    this.group.add(this.pickupIM);

    this.pickupGlow = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: this.glowTex, color: 0x6ef0c8, transparent: true, opacity: 0.7,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
      }),
      pickups.cap
    );
    this.pickupGlow.frustumCulled = false;
    this.pickupGlow.count = 0;
    this.group.add(this.pickupGlow);
  }

  /** 敵の影は高品質時のみ。中/低では影パスから外して描画量を半減させる。 */
  applyQuality(tier) {
    const cast = tier.shadows && tier.shadowMap >= 1024;
    for (const im of this.enemyIMs) im.castShadow = cast;

    // ★加算の光は塗り面積が大きい。低品質では薄くして負荷を落とす
    this.projGlow.material.opacity = tier.particles > 0.4 ? 0.85 : 0.45;
    this.pickupGlow.material.opacity = tier.particles > 0.4 ? 0.7 : 0.35;
    // ★敵の光の輪は「敵の数ぶん、体より大きい半透明の板」を重ねる。
    //   これは塗り面積（フィルレート）を強く食う。ヘッドレスの計測には出ないが
    //   実機のGPUでは効くので、低品質では丸ごと消す。
    for (const gi of this.enemyGlows) {
      gi.visible = tier.particles > 0.45;
      gi.material.opacity = tier.particles > 0.8 ? 0.6 : 0.4;
    }
  }

  /**
   * @param {number} alpha 前フレームからの補間係数
   * @param {THREE.Camera} [camera] 光の板をカメラへ向けるために使う
   */
  sync(alpha, camera) {
    // ★光の板は全部同じ向き（カメラの向き）でよい。
    //   カメラは十分遠いので、1つの回転を全インスタンスで使い回して問題ない。
    if (camera) _bill.copy(camera.quaternion);
    this._syncEnemies(alpha);
    this._syncProjectiles(alpha);
    this._syncPickups(alpha);
  }

  _syncEnemies(alpha) {
    const ims = this.enemyIMs;
    for (let i = 0; i < ims.length; i++) ims[i].__n = 0;

    const list = this.enemies.list;
    for (let i = 0; i < this.enemies.cap; i++) {
      const e = list[i];
      if (!e.active || e.isBoss) continue;      // ボスは BossView が個別に描く

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
      im.setColorAt(n, _c.copy(im.__color).lerp(FLASH, f * f * 0.7));

      // 足元に敷く光。被弾すると強くなる
      const gi = this.enemyGlows[e.archIndex];
      _p.y = sc * 0.45 + im.__hover;
      _s.setScalar(sc * (2.4 + f * 1.6));
      gi.setMatrixAt(n, _m.compose(_p, _bill, _s));
      gi.setColorAt(n, _c.copy(im.__glow).lerp(WHITE, f * f));
    }

    for (let i = 0; i < ims.length; i++) {
      const im = ims[i];
      im.count = im.__n;                       // ★描画数を実数に絞る
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;

      const gi = this.enemyGlows[i];
      gi.count = im.__n;
      gi.instanceMatrix.needsUpdate = true;
      if (gi.instanceColor) gi.instanceColor.needsUpdate = true;
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
      // 敵弾は大きめ＋赤。自分の弾と混ざると避けようがない
      _s.setScalar(p.hostile ? 1.5 : 1);
      im.setMatrixAt(n, _m.compose(_p, _q, _s));
      im.setColorAt(n, p.hostile ? im.__hostileColor : im.__color);

      // 光の板。弾そのものより一回り大きく、カメラを向ける
      _s.setScalar(p.hostile ? 3.0 : 2.1);
      this.projGlow.setMatrixAt(n, _m.compose(_p, _bill, _s));
      this.projGlow.setColorAt(n, p.hostile ? im.__hostileColor : im.__color);
      n++;
    }

    im.count = n;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;

    this.projGlow.count = n;
    this.projGlow.instanceMatrix.needsUpdate = true;
    if (this.projGlow.instanceColor) this.projGlow.instanceColor.needsUpdate = true;
  }

  _syncPickups(alpha) {
    const im = this.pickupIM;
    let n = 0;

    const list = this.pickups.list;
    for (let i = 0; i < this.pickups.cap; i++) {
      const g = list[i];
      if (!g.active) continue;

      // くるくる回して光って見せる。静止した多面体は床の模様に埋もれる
      _p.set(lerp(g.px, g.x, alpha), 0.55 + Math.sin(g.spin) * 0.12, lerp(g.pz, g.z, alpha));
      _e.set(g.spin * 0.7, g.spin, 0);
      _q.setFromEuler(_e);
      _s.setScalar(1);
      im.setMatrixAt(n, _m.compose(_p, _q, _s));
      im.setColorAt(n, im.__color);

      // 拾える物だと判るように、宝石にも光をまとわせる
      _s.setScalar(1.5 + Math.sin(g.spin * 2) * 0.18);
      this.pickupGlow.setMatrixAt(n, _m.compose(_p, _bill, _s));
      n++;
    }

    im.count = n;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;

    this.pickupGlow.count = n;
    this.pickupGlow.instanceMatrix.needsUpdate = true;
  }
}
