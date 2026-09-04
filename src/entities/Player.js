/**
 * 自機の「論理」。
 *
 * ★このファイルは three.js を import しない。
 *   保持するのは座標・速度・向きだけで、見た目は scene/PlayerView.js が同期する。
 *   これによりロジックを単体で検証でき、描画方式を後から差し替えられる。
 */
import { BALANCE } from '../data/balance.js';
import { clamp, dampAngle } from '../core/math.js';

export class Player {
  constructor() {
    const p = BALANCE.player;

    this.x = 0; this.z = 0;
    this.vx = 0; this.vz = 0;

    // 描画補間用の前フレーム座標
    this.px = 0; this.pz = 0;

    this.facing = 0;      // Y軸まわりの向き（ラジアン）
    this.pFacing = 0;

    this.radius = p.radius;
    this.maxSpeed = p.maxSpeed;
    this.speed01 = 0;     // 最高速に対する現在速度の比。演出やHUDが参照する

    // フェーズ3以降で成長値が乗る器。今は素の値のまま
    this.stats = { maxHpPct: 0, atkPct: 0, speedPct: 0 };
  }

  /**
   * @param {number} dt        固定ステップ（秒）
   * @param {{moveX:number, moveZ:number}} input  正規化済みの移動入力
   * @param {number} arenaRadius
   */
  update(dt, input, arenaRadius) {
    const p = BALANCE.player;

    this.px = this.x; this.pz = this.z;
    this.pFacing = this.facing;

    const ix = input.moveX, iz = input.moveZ;
    const mag = Math.hypot(ix, iz);
    const max = this.maxSpeed * (1 + this.stats.speedPct);

    if (mag > 0.001) {
      // 入力方向へ加速。入力の大きさ（スティックの倒し量）が最高速に比例する
      const nx = ix / mag, nz = iz / mag;
      this.vx += nx * p.accel * dt;
      this.vz += nz * p.accel * dt;

      const cap = max * Math.min(mag, 1);
      const sp = Math.hypot(this.vx, this.vz);
      if (sp > cap) { const k = cap / sp; this.vx *= k; this.vz *= k; }

      // 移動方向を向く。dampAngle は ±PI 跨ぎでも最短回りになる
      this.facing = dampAngle(this.facing, Math.atan2(nx, nz), p.turnRate, dt);
    } else {
      // 入力なし → 指数減衰で停止（毎フレーム同じ割合だけ減らすので dt に依存しない）
      const k = Math.exp(-p.friction * dt);
      this.vx *= k; this.vz *= k;
      if (Math.abs(this.vx) < 0.01) this.vx = 0;
      if (Math.abs(this.vz) < 0.01) this.vz = 0;
    }

    this.x += this.vx * dt;
    this.z += this.vz * dt;

    // 円形アリーナの壁で止める（すり抜けさせない）
    const lim = arenaRadius - this.radius;
    const d2 = this.x * this.x + this.z * this.z;
    if (d2 > lim * lim) {
      const d = Math.sqrt(d2);
      this.x = (this.x / d) * lim;
      this.z = (this.z / d) * lim;
      // 壁に押し付けても速度が溜まり続けないよう法線成分を抜く
      const nx = this.x / lim, nz = this.z / lim;
      const vn = this.vx * nx + this.vz * nz;
      if (vn > 0) { this.vx -= nx * vn; this.vz -= nz * vn; }
    }

    this.speed01 = clamp(Math.hypot(this.vx, this.vz) / max, 0, 1);
  }

  /** 進行方向の単位ベクトル（カメラの先読みが使う） */
  get dirX() { return Math.sin(this.facing); }
  get dirZ() { return Math.cos(this.facing); }
}
