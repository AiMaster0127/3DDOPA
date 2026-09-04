/**
 * HUD。
 *
 * ★DOMの書き換えは「値が変化したときだけ」行う。
 *   毎フレーム textContent を書くとレイアウト再計算でフレームを落とす。
 */
export class Hud {
  constructor() {
    this.root = document.getElementById('hud');
    this.elFps = document.getElementById('fps');
    this.elTier = document.getElementById('tier');
    this.elDraws = document.getElementById('draws');
    this.elEnemies = document.getElementById('enemies');
    this.elHint = document.getElementById('hint');

    this.elHpFill = document.getElementById('hpFill');
    this.elHpText = document.getElementById('hpText');
    this.elTime = document.getElementById('timeVal');
    this.elKills = document.getElementById('killVal');

    this._fps = -1; this._tier = ''; this._draws = -1; this._enemies = -1;
    this._hp = -1; this._maxHp = -1; this._hpClass = '';
    this._time = -1; this._kills = -1;

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

  /** HPは即時反映したいので毎フレーム呼ぶが、変化がなければDOMに触らない。 */
  syncHp(hp, maxHp) {
    const h = Math.ceil(hp);
    if (h === this._hp && maxHp === this._maxHp) return;
    this._hp = h; this._maxHp = maxHp;

    const r = maxHp > 0 ? hp / maxHp : 0;
    this.elHpFill.style.width = `${(r * 100).toFixed(1)}%`;
    this.elHpText.textContent = `${h} / ${maxHp}`;

    const cls = r <= 0.25 ? 'crit' : r <= 0.5 ? 'low' : '';
    if (cls !== this._hpClass) {
      this.elHpFill.className = `hp-fill${cls ? ' ' + cls : ''}`;
      this._hpClass = cls;
    }
  }

  syncRun(elapsedSec, kills) {
    const t = Math.floor(elapsedSec);
    if (t !== this._time) {
      this._time = t;
      this.elTime.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    }
    if (kills !== this._kills) { this._kills = kills; this.elKills.textContent = kills; }
  }

  /** デバッグ指標。0.25秒ごとにまとめて更新する。 */
  syncDebug(dt, tierName, drawCalls, enemyCount) {
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
    if (enemyCount !== this._enemies) { this._enemies = enemyCount; this.elEnemies.textContent = enemyCount; }
  }
}

const TIER_LABEL = { high: '高', mid: '中', low: '低' };
