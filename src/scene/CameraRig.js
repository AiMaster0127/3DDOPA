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

/**
 * 拠点の据え方。
 *
 * ★距離を数字で決め打ちにしない。垂直FOVは画面の縦横比で変わる
 *   （_applyFov が縦持ちで 52°→70° まで広げる）ので、固定距離だと
 *   縦持ちだけ被写体が小さくなる。「画面高さの何割を占めるか」から距離を逆算する。
 *
 * frac   : 台座＋キャラが画面高さに占める割合
 * shiftX : 注視点を右へ逃がす量（画面**横**半分に対する割合）→ 被写体は左へ
 * shiftY : 注視点を下へ逃がす量（画面**縦**半分に対する割合）→ 被写体は上へ
 */
/**
 * 被写体（台座＋キャラ）の全高。★実測値。
 * 台座 0.98 ＋ 髪の角の先まで 2.30。目分量で置くと頭が画面外へ出る。
 */
const SUBJ_H = 3.30;

const SHOW = {
  // 横長：UIは右半分。被写体を左へ逃がす
  wide: { frac: 0.50, shiftX: 0.42, shiftY: 0.24 },
  // 縦長：UIは下半分。被写体を上へ逃がす
  tall: { frac: 0.40, shiftX: 0.00, shiftY: 0.40 },
};

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

  /**
   * 拠点で「主役」を見せるカメラ。
   *
   * ★戦闘の見下ろし視点では、キャラは頭と肩しか映らない（俯角62度）。
   *   引いた武器も選んだキャラも見えないままなので、拠点だけ寄って撮る。
   * ★被写体を画面の中央に置かない。中央はUIが占めるので、
   *   横長では左へ、縦長では上へ寄せる。
   *   カメラを平行移動させると背景まで一緒にズレるので、
   *   **注視点だけ**をカメラの右方向へ逃がして被写体を反対側へ追い出す。
   * ★アリーナと遠景も画に残す。台座だけ大写しにすると、
   *   作り込んだ景色を拠点でも見せられなくなる。
   *
   * @param {number} dt
   * @param {number} aspect 画面のアスペクト比
   */
  showcase(dt, aspect) {
    const focusY = SUBJ_H * 0.5;
    this.orbit = (this.orbit || 0) + dt * 0.10;

    const S = aspect >= 1.05 ? SHOW.wide : SHOW.tall;

    // 画面の縦半分に写る世界の高さ → そこから距離を逆算する
    const half = SUBJ_H / (2 * S.frac);
    const d = half / Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);

    // 正面付近を±22度だけ往復する。一周させると背中を向ける時間が長すぎる
    const a = Math.sin(this.orbit) * 0.38;
    const cx = Math.sin(a) * d;
    const cz = Math.cos(a) * d;
    this.camera.position.set(cx, focusY + d * 0.15, cz);

    // 注視点をカメラの右へ逃がす → 被写体は画面の左へ寄る。
    // 縦長では横に逃がす余地が無いので、代わりに下へ逃がして被写体を上げる。
    // カメラ→原点 の水平右ベクトル（Y軸まわりに90度回すだけ）
    const rx = cz / d, rz = -cx / d;
    const sx = S.shiftX * half * aspect;
    this.camera.lookAt(rx * sx, focusY - S.shiftY * half, rz * sx);
    this._init = false;          // 出撃時に追従を撮り直させる
  }

  /** 被弾・爆発などから呼ぶ（フェーズ2以降で使用） */
  shake(power = 0.4) {
    this.shakeX += (Math.random() * 2 - 1) * power;
    this.shakeY += (Math.random() * 2 - 1) * power * 0.6;
  }

  /** ラン開始時などに追従を即座に合わせる */
  reset() { this._init = false; }
}
