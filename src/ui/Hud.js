/**
 * HUD。DOMの書き換えは「値が変化したときだけ」行う。
 * 毎フレーム textContent を書くとレイアウト再計算でフレームを落とす。
 */
export class Hud {
  constructor() {
    this.root = document.getElementById('hud');
    this.elFps = document.getElementById('fps');
    this.elTier = document.getElementById('tier');
    this.elDraws = document.getElementById('draws');
    this.elHint = document.getElementById('hint');

    this._fps = -1; this._tier = ''; this._draws = -1;

    // fpsは瞬間値だと読めないので0.25秒ぶんを平均する
    this._acc = 0; this._frames = 0;
    this._hintHidden = false;
  }

  show() { this.root.hidden = false; }

  /** 入力があったらチュートリアル文言を1度だけ消す */
  dismissHint() {
    if (this._hintHidden) return;
    this._hintHidden = true;
    this.elHint.classList.add('fade');
  }

  update(dt, tierName, drawCalls) {
    this._acc += dt;
    this._frames++;
    if (this._acc < 0.25) return;

    const fps = Math.round(this._frames / this._acc);
    this._acc = 0; this._frames = 0;

    if (fps !== this._fps) { this._fps = fps; this.elFps.textContent = fps; }
    if (tierName !== this._tier) {
      this._tier = tierName;
      this.elTier.textContent = TIER_LABEL[tierName] ?? tierName;
    }
    if (drawCalls !== this._draws) { this._draws = drawCalls; this.elDraws.textContent = drawCalls; }
  }
}

const TIER_LABEL = { high: '高', mid: '中', low: '低' };
