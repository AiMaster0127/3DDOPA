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

    this.baseColor = new THREE.Color(0x8b1a1a);

    this.mat = withRim(new THREE.MeshStandardMaterial({
      color: 0x8b1a1a, roughness: 0.5, metalness: 0.25,
      emissive: 0x000000, emissiveIntensity: 0,
    }), { color: 0xffb090, power: 2.2, strength: 1.0 });

    // 胴・頭・角。プリミティブの合成だけで「大きくて怖い」を作る
    this.body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.5, 1.9), this.mat);
    this.body.position.y = 0.95;
    this.body.castShadow = true;

    this.head = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.9, 0.9), this.mat);
    this.head.position.set(0, 1.5, 1.2);
    this.head.castShadow = true;

    const hornMat = withRim(
      new THREE.MeshStandardMaterial({ color: 0xf0e6d0, roughness: 0.6 }),
      { color: 0xfff0d0, power: 2.0, strength: 1.1 }
    );
    const hornGeo = new THREE.ConeGeometry(0.17, 0.9, 6);
    for (const sx of [-1, 1]) {
      const h = new THREE.Mesh(hornGeo, hornMat);
      h.position.set(0.36 * sx, 1.9, 1.35);
      h.rotation.x = 0.7;
      h.castShadow = true;
      this.rig.add(h);
    }

    this.rig.add(this.body, this.head);

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
    this.baseColor.setHex(e.arch.visual.color);
    this.mat.color.copy(this.baseColor);
    this.mat.emissive.setHex(e.arch.visual.color);

    // ★見た目を当たり判定に合わせる。
    //   胴の半幅は素で0.8なので、半径の0.9倍になるよう丸ごと拡大する。
    //   これをやらないと「見えていない所で殴られる」理不尽になる。
    this.rig.scale.setScalar((e.radius * 0.9) / 0.8);
    this.ring.scale.setScalar(e.radius);
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
