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
    this.elAcct = document.getElementById('acctVal');
    this.elStage = document.getElementById('stageVal');

    this.bossEl = document.getElementById('bossBar');
    this.bossName = document.getElementById('bossName');
    this.bossFill = document.getElementById('bossFill');

    this.elRunLv = document.getElementById('runLv');
    this.elXpFill = document.getElementById('xpFill');
    this.elChips = document.getElementById('skillChips');

    this._fps = -1; this._tier = ''; this._draws = -1; this._enemies = -1;
    this._hp = -1; this._maxHp = -1; this._hpClass = '';
    this._time = -1; this._kills = -1; this._acct = -1;
    this._runLv = -1; this._xp01 = -1; this._chipKey = '';
    this._stage = -1; this._bossName = ''; this._boss01 = -1;

    // fpsは瞬間値だと読めないので0.25秒ぶんを平均する
    this._acc = 0; this._frames = 0;
    this._hintHidden = false;
  }

  show() { this.root.hidden = false; }

  hide() { this.root.hidden = true; }

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

  /** ランレベルと経験値バー。 */
  syncLevel(level, xp01) {
    if (level !== this._runLv) { this._runLv = level; this.elRunLv.textContent = `Lv.${level}`; }
    // 0.5%刻みでしか書かない。毎フレームstyleを触るとレイアウトが走る
    const q = Math.round(xp01 * 200);
    if (q !== this._xp01) { this._xp01 = q; this.elXpFill.style.width = `${(q / 2).toFixed(1)}%`; }
  }

  /** 習得済みスキルのチップ。中身が変わったときだけ作り直す。 */
  syncSkills(entries) {
    const key = entries.map(e => `${e.icon}${e.lv}`).join('|');
    if (key === this._chipKey) return;
    this._chipKey = key;

    this.elChips.replaceChildren();
    for (const e of entries) {
      const el = document.createElement('span');
      el.className = 'skill-chip';
      el.append(document.createTextNode(e.icon));
      const b = document.createElement('b');
      b.textContent = e.lv;
      el.appendChild(b);
      el.title = e.name;
      this.elChips.appendChild(el);
    }
  }

  syncAccount(level) {
    if (level === this._acct) return;
    this._acct = level;
    this.elAcct.textContent = `Lv.${level}`;
  }

  /** @param {number} remainSec ステージの残り時間 */
  syncRun(remainSec, kills, stageId) {
    const t = Math.max(0, Math.ceil(remainSec));
    if (t !== this._time) {
      this._time = t;
      this.elTime.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    }
    if (kills !== this._kills) { this._kills = kills; this.elKills.textContent = kills; }
    if (stageId !== this._stage) { this._stage = stageId; this.elStage.textContent = stageId; }
  }

  /**
   * ボスHPバー。boss が null なら隠す。
   * ★残りHPが見えないボスは「あとどれくらいか」が判らず、ただ長いだけになる。
   */
  syncBoss(boss) {
    if (!boss) {
      if (!this.bossEl.hidden) { this.bossEl.hidden = true; this._boss01 = -1; this._bossName = ''; }
      return;
    }
    this.bossEl.hidden = false;

    if (boss.arch.name !== this._bossName) {
      this._bossName = boss.arch.name;
      this.bossName.textContent = boss.arch.name;
    }
    const r = boss.maxHp > 0 ? Math.max(0, boss.hp / boss.maxHp) : 0;
    const q = Math.round(r * 400);              // 0.25%刻み
    if (q !== this._boss01) {
      this._boss01 = q;
      this.bossFill.style.width = `${(q / 4).toFixed(2)}%`;
    }
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
