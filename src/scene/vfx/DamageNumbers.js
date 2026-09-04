/**
 * ダメージ数字。
 *
 * ★3Dのスプライトではなく、WebGLの上に重ねた2Dキャンバスに描く。
 *   - 文字がぼやけない（テクスチャを経由しない）
 *   - draw call が増えない（WebGL側の描画数に影響しない）
 *   - 数字ごとにテクスチャを作らなくて済む
 *   代わりに世界座標→画面座標の投影を自分でやる。
 */
import * as THREE from '../../../vendor/three/three.module.min.js';

const _v = new THREE.Vector3();      // ★毎フレーム new しない

const LIFE = 0.85;
const RISE = 2.4;

export class DamageNumbers {
  /** @param {number} cap 同時表示数の上限 */
  constructor(cap = 48) {
    this.cap = cap;
    this.count = 0;

    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.z = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.val = new Int32Array(cap);
    // ★表示文字列は push のときに1回だけ作る。
    //   毎フレーム `${値}` を組み立てると、乱戦でゴミが大量に出る。
    this.text = new Array(cap).fill('');
    this.crit = new Uint8Array(cap);
    this.kind = new Uint8Array(cap);   // 0=敵への与ダメ 1=自機の被ダメ 2=回復

    // フォント指定も毎フレーム組み立てると文字列ゴミになる。整数サイズで引ける表にする
    this._fontCache = new Map();

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'vfx-layer';
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    // ★品質を落としても数字は消さない。
    //   ダメージ数字は「装飾」ではなく「攻撃が通っているか」の情報なので、
    //   消すと弱い端末だけ手応えが判らなくなる。減らすのは同時表示数と縁取り。
    this.limit = cap;
    this.outline = true;
    this._dpr = 1;
    this._resize();
    this._onResize = () => this._resize();
    addEventListener('resize', this._onResize);
    addEventListener('orientationchange', this._onResize);
  }

  _resize() {
    // 文字だけなのでDPRは2で頭打ちにする。3にしても読みやすさは変わらない
    this._dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(innerWidth * this._dpr);
    this.canvas.height = Math.floor(innerHeight * this._dpr);
    this.canvas.style.width = `${innerWidth}px`;
    this.canvas.style.height = `${innerHeight}px`;
  }

  applyQuality(tier) {
    this.limit = Math.max(10, Math.round(this.cap * tier.particles));
    this.outline = tier.particles > 0.5;      // 縁取りは1文字あたり2回描くので重い
    if (this.count > this.limit) this.count = this.limit;
  }

  /** @param {number} kind 0=与ダメ 1=被ダメ 2=回復 */
  push(x, y, z, value, isCrit, kind = 0) {
    // 満杯なら一番古いものを押し出す（新しい数字の方が知りたい情報なので）
    const i = this.count < this.limit ? this.count++ : (this._rr = (this._rr + 1 | 0) % this.limit);
    this.x[i] = x; this.y[i] = y; this.z[i] = z;
    this.life[i] = LIFE;
    this.val[i] = value | 0;
    this.text[i] = kind === 2 ? `+${value | 0}` : `${value | 0}`;
    this.crit[i] = isCrit ? 1 : 0;
    this.kind[i] = kind;
    this._rr = this._rr | 0;
  }

  clear() {
    this.count = 0;
    if (this.ctx) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** @param {THREE.Camera} camera */
  update(dt, camera) {
    const c = this.ctx;
    c.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    c.clearRect(0, 0, innerWidth, innerHeight);
    if (this.count === 0) return;

    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';

    const halfW = innerWidth * 0.5;
    const halfH = innerHeight * 0.5;

    let n = 0;
    for (let i = 0; i < this.count; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) continue;

      const t = this.life[i] / LIFE;               // 1 → 0
      this.y[i] += RISE * dt * t;                  // 上へ、だんだん減速

      if (n !== i) {
        this.x[n] = this.x[i]; this.y[n] = this.y[i]; this.z[n] = this.z[i];
        this.life[n] = this.life[i]; this.val[n] = this.val[i];
        this.text[n] = this.text[i];
        this.crit[n] = this.crit[i]; this.kind[n] = this.kind[i];
      }

      _v.set(this.x[n], this.y[n], this.z[n]).project(camera);
      n++;
      if (_v.z > 1) continue;                      // カメラの後ろ

      const sx = halfW + _v.x * halfW;
      const sy = halfH - _v.y * halfH;

      const k = this.kind[i];
      const crit = this.crit[i];
      const size = crit ? 30 : k === 0 ? 20 : 24;
      // 出た瞬間だけ少し大きく見せる（ヒットの手応え）
      const pop = 1 + (1 - t) * 0 + Math.max(0, t - 0.82) * 1.6;

      c.globalAlpha = Math.min(1, t * 2.2);
      c.font = this._font(Math.round(size * pop));
      c.fillStyle = k === 1 ? '#ff5a6e' : k === 2 ? '#6ef0c8' : crit ? '#ffd24d' : '#ffffff';
      const text = this.text[i];
      if (this.outline) {
        c.strokeStyle = 'rgba(3,4,12,0.85)';
        c.lineWidth = crit ? 5 : 4;
        c.strokeText(text, sx, sy);
      }
      c.fillText(text, sx, sy);
    }
    c.globalAlpha = 1;
    this.count = n;
  }

  /** 整数フォントサイズ → CSS font 文字列。作るのは初回だけ。 */
  _font(px) {
    let f = this._fontCache.get(px);
    if (!f) { f = `900 ${px}px system-ui, sans-serif`; this._fontCache.set(px, f); }
    return f;
  }

  dispose() {
    removeEventListener('resize', this._onResize);
    removeEventListener('orientationchange', this._onResize);
    this.canvas.remove();
  }
}
