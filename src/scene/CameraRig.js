/**
 * カメラ追従。背後〜見下ろしの中間。
 *
 * 追従は damp（指数減衰）で行う。lerp(a, b, 0.1) を毎フレーム回す実装は
 * fps が変わると追従速度まで変わってしまうため使わない。
 */
import * as THREE from '../../vendor/three/three.module.min.js';
import { BALANCE } from '../data/balance.js';
import { damp } from '../core/math.js';

const _desired = new THREE.Vector3();   // ★毎フレーム new しない
const _look = new THREE.Vector3();

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.shakeX = 0;
    this.shakeY = 0;

    const c = BALANCE.camera;
    this.offX = c.offset.x; this.offY = c.offset.y; this.offZ = c.offset.z;

    this.lookX = 0; this.lookZ = 0;
    this._init = false;
  }

  /**
   * @param {{x:number,z:number,dirX:number,dirZ:number,speed01:number}} target
   * @param {number} dt 実フレーム時間
   */
  follow(target, dt) {
    const c = BALANCE.camera;

    // 進行方向を先読みして画面の「進む先」を広く見せる。速度に比例させる
    const lead = c.lead * target.speed01;
    _desired.set(
      target.x + target.dirX * lead + this.offX,
      this.offY,
      target.z + target.dirZ * lead + this.offZ
    );

    if (!this._init) { this.camera.position.copy(_desired); this._init = true; }

    const k = 1 - Math.exp(-c.followRate * dt);
    this.camera.position.x += (_desired.x - this.camera.position.x) * k;
    this.camera.position.y += (_desired.y - this.camera.position.y) * k;
    this.camera.position.z += (_desired.z - this.camera.position.z) * k;

    // シェイクは加算オフセット。位置そのものを揺らすと追従が壊れる
    this.camera.position.x += this.shakeX;
    this.camera.position.y += this.shakeY;
    this.shakeX *= Math.exp(-9 * dt);
    this.shakeY *= Math.exp(-9 * dt);

    // 注視点も遅らせると、急な方向転換でも画が破綻しない
    this.lookX = damp(this.lookX, target.x, c.followRate * 1.35, dt);
    this.lookZ = damp(this.lookZ, target.z, c.followRate * 1.35, dt);
    _look.set(this.lookX, c.lookAtHeight, this.lookZ);
    this.camera.lookAt(_look);
  }

  /** 被弾・爆発などから呼ぶ（フェーズ2以降で使用） */
  shake(power = 0.4) {
    this.shakeX += (Math.random() * 2 - 1) * power;
    this.shakeY += (Math.random() * 2 - 1) * power * 0.6;
  }

  /** ラン開始時などに追従を即座に合わせる */
  reset() { this._init = false; }
}
