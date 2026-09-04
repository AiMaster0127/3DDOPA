/**
 * 固定ステップのゲームループ。
 *
 * シミュレーションは常に 60Hz で回し、描画は requestAnimationFrame ごとに1回だけ行う。
 * 端末の描画fpsが落ちても当たり判定・移動距離・成長曲線は変化しない。
 * render() には補間係数 alpha（0..1）を渡し、描画側で前フレーム座標との間を埋める。
 */
export class Loop {
  /**
   * @param {object}   o
   * @param {(dt:number)=>void}    o.update  固定間隔で呼ばれる論理更新
   * @param {(alpha:number, dt:number)=>void} o.render  毎フレームの描画
   * @param {number}  [o.step=1/60]  論理更新の間隔（秒）
   * @param {number}  [o.maxSub=5]   1フレームあたりの最大サブステップ数
   */
  constructor({ update, render, step = 1 / 60, maxSub = 5 }) {
    this.update = update;
    this.render = render;
    this.step = step;
    this.maxSub = maxSub;

    this.running = false;
    this.acc = 0;
    this.last = 0;
    this.rafId = 0;

    /** 直近フレームの実時間（秒）。品質制御が参照する。 */
    this.frameDt = step;

    this._frame = this._frame.bind(this);
    this._onVisibility = this._onVisibility.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    document.addEventListener('visibilitychange', this._onVisibility);
    this.rafId = requestAnimationFrame(this._frame);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    document.removeEventListener('visibilitychange', this._onVisibility);
  }

  /** 復帰時に巨大な dt が入らないよう時計を打ち直す。 */
  _onVisibility() {
    if (!document.hidden) {
      this.last = performance.now();
      this.acc = 0;
    }
  }

  _frame(now) {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this._frame);

    // 非表示タブでは論理も描画も完全に止める（バッテリーとCPUを食わない）
    if (document.hidden) { this.last = now; return; }

    // 0.25秒でクランプ。ブレークポイント復帰などの巨大 dt を切り捨てる
    const dt = Math.min((now - this.last) / 1000, 0.25);
    this.last = now;
    this.frameDt = dt;
    this.acc += dt;

    let sub = 0;
    while (this.acc >= this.step && sub < this.maxSub) {
      this.update(this.step);
      this.acc -= this.step;
      sub++;
    }
    // 追いつけないほど遅い端末では余りを捨てる（死のスパイラル防止）
    if (sub >= this.maxSub) this.acc = 0;

    this.render(this.acc / this.step, dt);
  }
}
