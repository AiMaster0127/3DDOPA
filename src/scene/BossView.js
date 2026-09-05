/**
 * ボスの見た目。
 *
 * 雑魚は InstancedMesh に畳むが、ボスは1体しかいない見せ場なので個別Meshで作る。
 * ★予備動作（溜め）が見えることが最重要。
 *   何が来るか判らない攻撃は理不尽になるだけなので、色と姿勢で必ず予告する。
 */
import * as THREE from '../../vendor/three/three.module.min.js';
import { lerp, wrapAngle, damp } from '../core/math.js';
import { withRim } from './materials.js';
import { makeBossGeometry } from './bossShapes.js';

const WINDUP_COLOR = new THREE.Color(0xffdd55);
const DASH_COLOR = new THREE.Color(0xff3b3b);

export class BossView {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    // ★体だけを入れる入れ物。当たり判定の半径に合わせて丸ごと拡縮する。
    //   床のリングや予告は実寸で置きたいので、group 直下とは分けておく。
    this.rig = new THREE.Group();
    this.group.add(this.rig);

    // ★平常時は白。塗り分けは頂点カラーが持っているので、
    //   ここを白にしておけば「溜め＝黄／突進＝赤」を全身に乗せられる。
    this.baseColor = new THREE.Color(1, 1, 1);

    this.mat = withRim(new THREE.MeshStandardMaterial({
      color: 0xffffff, vertexColors: true, roughness: 0.52, metalness: 0.22,
      side: THREE.DoubleSide,        // 腰の装甲や衣の内側を見せる
      emissive: 0x000000, emissiveIntensity: 0,
      // ★ボスは平面（箱）主体。リムを強く掛けると面がまるごと白飛びして、
      //   黒い装甲が薄茶色の塊に見える（実際そうなった）。鋭く弱くする
    }), { color: 0xffd0b0, power: 4.4, strength: 0.26 });

    // 形は attach() でボスごとに作り直す
    this.mesh = new THREE.Mesh(makeBossGeometry('gorehorn'), this.mat);
    this.mesh.castShadow = true;
    this.rig.add(this.mesh);
    this._shape = 'gorehorn';

    // 足元のリング。ボスの間合いを床に描く
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.0, 32),
      new THREE.MeshBasicMaterial({
        color: 0xff3b3b, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.06;
    this.group.add(this.ring);

    // 叩きつけの範囲予告。溜め中だけ広がって見える
    this.telegraph = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 1.0, 40),
      new THREE.MeshBasicMaterial({
        color: 0xffdd55, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    this.telegraph.rotation.x = -Math.PI / 2;
    this.telegraph.position.y = 0.08;
    this.telegraph.visible = false;
    this.group.add(this.telegraph);

    this._pulse = 0;
  }

  /** ボスが湧いたとき。アーキタイプごとに色と大きさを合わせる。 */
  attach(e) {
    const v = e.arch.visual;
    this.mat.color.copy(this.baseColor);
    this.mat.emissive.setHex(v.color);

    // ボスごとに形を作り直す。1ランに1回なので、その都度作ってよい
    const shape = v.boss || 'gorehorn';
    if (shape !== this._shape || v.pal !== this._pal) {
      this._shape = shape;
      this._pal = v.pal;
      this.mesh.geometry.dispose();
      this.mesh.geometry = makeBossGeometry(shape, v.pal);
    }

    // ★見た目を当たり判定に合わせる。
    //   基準は「胴の幅」。境界箱の最大値を使うと角や翼まで含めてしまい、
    //   派手な形ほど全体が縮んで小さく見える（雷龍が自機と同じ大きさになった）。
    //   角の先や翼端は判定の外へはみ出してよい。中身が痩せる方が問題。
    const halfW = this.mesh.geometry.userData.hitHalf || 1.0;
    this.rig.scale.setScalar((e.radius * 0.92) / halfW);
    this.ring.scale.setScalar(e.radius);
    this._hover = v.hover || 0;
    this.group.visible = true;
  }

  detach() { this.group.visible = false; }

  /** @param {object} e ボスの論理。null なら非表示 */
  sync(e, alpha, dt) {
    if (!e || !e.active) { this.group.visible = false; return; }
    this.group.visible = true;

    this.group.position.x = lerp(e.px, e.x, alpha);
    this.group.position.z = lerp(e.pz, e.z, alpha);
    this.group.rotation.y = e.pFacing + wrapAngle(e.facing - e.pFacing) * alpha;

    this._pulse += dt * 9;
    this._idle = (this._idle || 0) + dt;

    // ★待機中も微かに動かす。完全に静止したボスは置物に見える。
    //   浮遊するボス（hover>0）は上下に、地に立つボスは呼吸だけ。
    const breathe = Math.sin(this._idle * 1.6) * 0.012;
    // ★回転はさせない。ボスは口や角の向きで狙いを伝えているので、
    //   胴を回すと「どこを向いているか」が読めなくなる
    this.rig.position.y = this._hover ? Math.sin(this._idle * 1.1) * 0.22 : 0;
    this.rig.scale.y = this.rig.scale.x * (1 + breathe);

    // ★状態を色で伝える：溜め=黄 / 突進=赤 / 通常=素の色
    const windup = e.aiState === 1 || e.aiState === 3;
    const dashing = e.aiState === 2;
    const target = windup ? WINDUP_COLOR : dashing ? DASH_COLOR : this.baseColor;
    this.mat.color.lerp(target, 1 - Math.exp(-14 * dt));

    // 被弾フラッシュと溜めの明滅
    const flash = e.flash > 0 ? e.flash * e.flash : 0;
    const glow = windup ? 0.5 + Math.sin(this._pulse) * 0.35 : dashing ? 0.6 : 0;
    this.mat.emissiveIntensity = Math.max(flash * 0.9, glow);

    // 叩きつけ（aiState 3）は範囲を床に出す
    if (e.aiState === 3 && e.arch.slam) {
      const t = e.arch.slam.windup > 0 ? 1 - e.aiT / e.arch.slam.windup : 1;
      this.telegraph.visible = true;
      this.telegraph.scale.setScalar(e.arch.slam.radius * (0.4 + t * 0.6));
      this.telegraph.material.opacity = 0.25 + t * 0.45;
    } else {
      this.telegraph.visible = false;
    }

    this.ring.material.opacity = damp(this.ring.material.opacity, dashing ? 0.85 : 0.45, 8, dt);
  }
}
