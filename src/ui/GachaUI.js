/**
 * ガチャ画面と排出演出の表示。
 *
 * ★確率表は data/gacha.js から生成する。UIに数値を直書きしない。
 *   データを書き換えたら表示も自動で追従する。
 */
import { GACHA, RARITIES, RARITY_COLOR } from '../data/gacha.js';
import { WEAPON_BY_ID } from '../data/weapons.js';
import { PHASE } from '../gacha/GachaDirector.js';

export class GachaUI {
  /**
   * @param {object} o
   * @param {import('../gacha/GachaSystem.js').GachaSystem} o.gacha
   * @param {import('../gacha/GachaDirector.js').GachaDirector} o.director
   * @param {() => void} o.onBack
   * @param {() => void} o.onClosed  演出終了後（所持状況が変わったのでUI更新に使う）
   */
  constructor({ gacha, director, onBack, onClosed }) {
    this.gacha = gacha;
    this.director = director;
    this.onClosed = onClosed;

    this.root = document.getElementById('gacha');
    this.reveal = document.getElementById('reveal');
    this.stage = document.getElementById('revealStage');
    this.omenEl = document.getElementById('revealOmen');
    this.card = document.getElementById('revealCard');
    this.rcRarity = document.getElementById('rcRarity');
    this.rcName = document.getElementById('rcName');
    this.rcSub = document.getElementById('rcSub');
    this.skipEl = document.getElementById('revealSkip');
    this.summary = document.getElementById('revealSummary');
    this.grid = document.getElementById('summaryGrid');

    this.elRates = document.getElementById('gRates');
    this.elPity = document.getElementById('gPity');
    this.elGems = document.getElementById('gGems');
    this.elTickets = document.getElementById('gTickets');
    this.btn1 = document.getElementById('btnPull1');
    this.btn10 = document.getElementById('btnPull10');

    document.getElementById('gachaBack').addEventListener('click', onBack);
    this.btn1.addEventListener('click', () => this._pull('single'));
    this.btn10.addEventListener('click', () => this._pull('ten'));

    // 演出中はどこを触ってもスキップできる
    this.stage.addEventListener('pointerdown', () => this.director.skip());
    document.getElementById('revealClose').addEventListener('click', () => this._close());

    this._buildStatic();
  }

  get visible() { return !this.root.hidden; }

  _buildStatic() {
    document.getElementById('gBannerName').textContent = this.gacha.banner.name;
    const feat = this.gacha.banner.featured
      .map(id => WEAPON_BY_ID.get(id)?.name || id).join('・');
    document.getElementById('gFeatured').textContent = feat || '—';

    // ★確率表はデータから生成する
    this.elRates.replaceChildren();
    for (const r of RARITIES) {
      const tr = document.createElement('tr');
      const td1 = document.createElement('td');
      td1.textContent = `${r}（${RARITY_COLOR[r].name}）`;
      td1.style.color = RARITY_COLOR[r].css;
      const td2 = document.createElement('td');
      td2.textContent = `${(GACHA.baseRates[r] * 100).toFixed(1)}%`;
      tr.append(td1, td2);
      this.elRates.appendChild(tr);
    }

    document.getElementById('gCost1').textContent = `💎${GACHA.cost.single} / 🎟1`;
    document.getElementById('gCost10').textContent = `💎${GACHA.cost.ten}`;
  }

  show() { this.root.hidden = false; this.refresh(); }
  hide() { this.root.hidden = true; }

  refresh() {
    const w = this.gacha.wallet;
    this.elGems.textContent = w.gems;
    this.elTickets.textContent = w.tickets;

    const p = GACHA.pity;
    const st = this.gacha.state;
    this.elPity.innerHTML = '';
    const line1 = document.createElement('span');
    line1.textContent = `いまのSSR率 `;
    const b1 = document.createElement('b');
    b1.textContent = `${(this.gacha.currentSSRRate() * 100).toFixed(1)}%`;
    const line2 = document.createElement('span');
    line2.textContent = ` ／ 天井まであと `;
    const b2 = document.createElement('b');
    b2.textContent = `${this.gacha.pullsToPity}回`;
    const line3 = document.createElement('span');
    line3.textContent = ` ／ 累計 ${st.totalPulls}回`;
    this.elPity.append(line1, b1, line2, b2, line3);

    if (st.sinceSSR >= p.softStart) {
      const hint = document.createElement('div');
      hint.textContent = `${p.softStart}回を超えた。1回ごとにSSR率が上がっている。`;
      this.elPity.appendChild(hint);
    }
    if (st.lostFiftyFifty) {
      const hint = document.createElement('div');
      hint.textContent = '次のSSRはピックアップ確定。';
      this.elPity.appendChild(hint);
    }

    this.btn1.disabled = !this.gacha.canPullSingle();
    this.btn10.disabled = !this.gacha.canPullTen();
  }

  _pull(kind) {
    const results = kind === 'ten' ? this.gacha.pullTen() : this.gacha.pullSingle();
    if (!results) return;                 // 通貨不足。ボタンは既にdisabledのはず
    this.refresh();

    this.reveal.hidden = false;
    this.summary.hidden = true;
    this.skipEl.hidden = false;
    this.director.play(results);
  }

  /** GachaDirector からのフェーズ通知。 */
  onPhase(phase, info) {
    if (phase === PHASE.IDLE) { this.reveal.hidden = true; return; }

    if (phase === PHASE.SUMMARY) {
      this.card.hidden = true;
      this.omenEl.className = 'omen';
      this.stage.classList.remove('reach');
      this.skipEl.hidden = true;
      this._renderSummary(info.results);
      this.summary.hidden = false;
      return;
    }

    this.summary.hidden = true;

    if (phase === PHASE.PORTENT) {
      this.card.hidden = true;
      this.stage.classList.remove('reach');
      this.omenEl.className = `omen on ${info.omen}`;

    } else if (phase === PHASE.REACH) {
      this.stage.classList.add('reach');

    } else if (phase === PHASE.REVEAL) {
      this.stage.classList.remove('reach');
      this._renderCard(info.result);
    }
  }

  _renderCard(r) {
    const c = RARITY_COLOR[r.rarity];
    this.card.style.setProperty('--rc', c.css);
    this.card.style.setProperty('--rc-glow', `${c.css}80`);
    this.rcRarity.textContent = r.rarity;
    this.rcName.textContent = r.weapon.name;
    this.rcSub.textContent = r.dupe
      ? `ダブり → かけら+${r.shards} / 強化粉+${r.dust}`
      : `NEW! 攻撃力 ${r.weapon.base.atk} ・ ${r.weapon.flavor}`;

    // 再生成してアニメーションを頭から流し直す
    this.card.hidden = false;
    this.card.style.animation = 'none';
    void this.card.offsetWidth;
    this.card.style.animation = '';
  }

  _renderSummary(results) {
    this.grid.replaceChildren();
    for (const r of results) {
      const c = RARITY_COLOR[r.rarity];
      const el = document.createElement('div');
      el.className = `summary-item${r.dupe ? '' : ' is-new'}`;
      el.style.setProperty('--rc', c.css);
      el.style.setProperty('--rc-glow', `${c.css}80`);

      const rr = document.createElement('span');
      rr.className = 'si-r';
      rr.textContent = r.rarity;
      const nn = document.createElement('span');
      nn.className = 'si-n';
      nn.textContent = r.weapon.name;
      const dd = document.createElement('span');
      dd.className = 'si-d';
      dd.textContent = r.dupe ? `かけら+${r.shards}` : 'NEW';

      el.append(rr, nn, dd);
      this.grid.appendChild(el);
    }
  }

  _close() {
    this.director.close();
    this.reveal.hidden = true;
    this.refresh();
    this.onClosed?.();
  }
}
