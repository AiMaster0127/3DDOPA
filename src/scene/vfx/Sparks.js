/**
 * ヒット火花・撃破の破片。
 *
 * ★1つの THREE.Points に全粒子を詰めて1 draw call で描く。
 *   粒子ごとに Mesh を作ると、乱戦で一瞬にして draw call が溢れる。
 * ★バッファは起動時に確保し、以後 new しない。
 */
import * as THREE from '../../../vendor/three/three.module.min.js';

const GRAVITY = -14;

export class Sparks {
  /** @param {number} cap 同時に存在できる粒子数 */
  constructor(scene, cap = 420) {
    this.cap = cap;
    this.count = 0;

    // 位置・色は毎フレーム書き換えるので属性として持つ
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.vz = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.maxLife = new Float32Array(cap);
    this.r = new Float32Array(cap);
    this.g = new Float32Array(cap);
    this.b = new Float32Array(cap);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setDrawRange(0, 0);

    // ★テクスチャを与えないと四角いベタ塗りになり、破片ではなく紙片に見える。
    //   中心が明るく外へ透ける円をキャンバスで作って貼る。
    const mat = new THREE.PointsMaterial({
      size: 0.26, map: makeSparkTexture(), vertexColors: true,
      transparent: true, opacity: 0.95, alphaTest: 0.02,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);

    this.scale = 1;      // 品質ティアによる粒子量の倍率
  }

  applyQuality(tier) { this.scale = tier.particles; }

  /**
   * 破片を撒く。
   * @param {number} n     基本の粒子数（品質で間引かれる）
   * @param {number} speed 初速
   */
  burst(x, y, z, n, color, speed = 6) {
    const num = Math.max(1, Math.round(n * this.scale));
    const r = ((color >> 16) & 255) / 255;
    const g = ((color >> 8) & 255) / 255;
    const b = (color & 255) / 255;

    for (let i = 0; i < num; i++) {
      // 満杯なら一番古い粒子を上書きする（詰まって出なくなるより良い）
      const idx = this.count < this.cap ? this.count++ : (this._rr = (this._rr + 1 | 0) % this.cap);

      const a = Math.random() * Math.PI * 2;
      const up = 0.35 + Math.random() * 0.9;
      const sp = speed * (0.5 + Math.random() * 0.8);

      this.pos[idx * 3] = x;
      this.pos[idx * 3 + 1] = y;
      this.pos[idx * 3 + 2] = z;
      this.vx[idx] = Math.cos(a) * sp;
      this.vy[idx] = up * sp;
      this.vz[idx] = Math.sin(a) * sp;
      this.r[idx] = r; this.g[idx] = g; this.b[idx] = b;
      this.maxLife[idx] = this.life[idx] = 0.35 + Math.random() * 0.4;
    }
    this._rr = this._rr | 0;
  }

  update(dt) {
    let n = 0;
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;

      this.life[i] -= dt;
      if (this.life[i] <= 0) continue;

      this.vy[i] += GRAVITY * dt;
      const p = i * 3;
      this.pos[p] += this.vx[i] * dt;
      this.pos[p + 1] += this.vy[i] * dt;
      this.pos[p + 2] += this.vz[i] * dt;

      // 床で跳ねずに消える。跳ねさせると床下に潜って見苦しい
      if (this.pos[p + 1] < 0.05) { this.life[i] = 0; continue; }

      // 生きている粒子を配列の前へ詰め直す（描画範囲を最小にする）
      if (n !== i) {
        const q = n * 3;
        this.pos[q] = this.pos[p]; this.pos[q + 1] = this.pos[p + 1]; this.pos[q + 2] = this.pos[p + 2];
        this.vx[n] = this.vx[i]; this.vy[n] = this.vy[i]; this.vz[n] = this.vz[i];
        this.life[n] = this.life[i]; this.maxLife[n] = this.maxLife[i];
        this.r[n] = this.r[i]; this.g[n] = this.g[i]; this.b[n] = this.b[i];
      }
      // 消えぎわを暗くする（急に消えるとチカチカする）
      const t = this.life[n] / this.maxLife[n];
      const q = n * 3;
      this.col[q] = this.r[n] * t;
      this.col[q + 1] = this.g[n] * t;
      this.col[q + 2] = this.b[n] * t;
      n++;
    }

    this.count = n;
    this.points.geometry.setDrawRange(0, n);
    if (n > 0) {
      this.points.geometry.attributes.position.needsUpdate = true;
      this.points.geometry.attributes.color.needsUpdate = true;
    }
  }

  clear() {
    this.count = 0;
    this.points.geometry.setDrawRange(0, 0);
  }
}


/** 中心が明るく外周が透ける円。破片1粒ぶんのテクスチャ。 */
function makeSparkTexture(size = 32) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0.0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.75)');
  grad.addColorStop(1.0, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(cv);
}
