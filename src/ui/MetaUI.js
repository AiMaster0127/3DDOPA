/**
 * 拠点強化・実績・達成トースト。
 *
 * 一覧はどちらも data/ の配列から生成する。UIに項目を直書きしない。
 */
import { UPGRADES } from '../data/upgrades.js';
import { ACHIEVEMENTS } from '../data/achievements.js';

const TOAST_MS = 2600;
const TOAST_MAX = 3;      // 同時に出す上限
const TOAST_GAP = 260;    // 次を出すまでの間隔(ms)

export class MetaUI {
  /**
   * @param {object} o
   * @param {import('../progression/MetaSystem.js').MetaSystem} o.meta
   * @param {import('../save/SaveManager.js').SaveManager} o.save
   * @param {()=>void} o.onBack
   * @param {()=>void} o.onChanged  強化を買ったあと（ステータス再計算などに使う）
   */
  constructor({ meta, save, onBack, onChanged }) {
    this.meta = meta;
    this.save = save;
    this.onChanged = onChanged || (() => {});

    this.upRoot = document.getElementById('upgrade');
    this.upList = document.getElementById('upList');
    this.upGems = document.getElementById('uGems');

    this.achRoot = document.getElementById('achieve');
    this.achList = document.getElementById('achList');
    this.achProg = document.getElementById('aProgress');

    this.toasts = document.getElementById('toasts');
    this._toastQueue = [];
    this._toastShown = 0;

    document.getElementById('upBack').addEventListener('click', onBack);
    document.getElementById('achBack').addEventListener('click', onBack);
  }

  // ---- 拠点強化 ----

  showUpgrades() { this.upRoot.hidden = false; this.refreshUpgrades(); }
  hideUpgrades() { this.upRoot.hidden = true; }

  refreshUpgrades() {
    this.upGems.textContent = this.save.data.wallet.gems;
    this.upList.replaceChildren();

    for (const u of UPGRADES) {
      const lv = this.meta.levelOf(u.id);
      const cost = this.meta.upgradeCost(u.id);
      const maxed = cost === null;

      const card = document.createElement('div');
      card.className = 'up-card';

      const icon = document.createElement('div');
      icon.className = 'up-icon';
      icon.textContent = u.icon;

      const body = document.createElement('div');
      body.className = 'up-body';

      const name = document.createElement('div');
      name.className = 'up-name';
      name.textContent = `${u.name}  Lv.${lv}/${u.max}`;

      const desc = document.createElement('div');
      desc.className = 'up-desc';
      // 現在値 → 次の段階の値。何がどれだけ増えるかを常に見せる
      desc.textContent = maxed ? u.desc(lv) : `${u.desc(lv)}  →  ${u.desc(lv + 1)}`;

      const pips = document.createElement('div');
      pips.className = 'up-pips';
      for (let i = 0; i < u.max; i++) {
        const p = document.createElement('span');
        p.className = `up-pip${i < lv ? ' on' : ''}`;
        pips.appendChild(p);
      }

      body.append(name, desc, pips);

      const buy = document.createElement('button');
      buy.type = 'button';
      buy.className = `up-buy${maxed ? ' max' : ''}`;
      buy.textContent = maxed ? '最大' : `💎${cost}`;
      buy.disabled = maxed || !this.meta.canBuy(u.id);
      buy.addEventListener('click', () => {
        if (!this.meta.buyUpgrade(u.id)) return;
        this.meta.checkAchievements();
        this.refreshUpgrades();
        this.onChanged();
      });

      card.append(icon, body, buy);
      this.upList.appendChild(card);
    }
  }

  // ---- 実績 ----

  showAchievements() { this.achRoot.hidden = false; this.refreshAchievements(); }
  hideAchievements() { this.achRoot.hidden = true; }

  refreshAchievements() {
    const done = this.save.data.achievements;
    const p = this.meta.achievementProgress();
    this.achProg.textContent = `${p.have}/${p.total}`;

    this.achList.replaceChildren();
    for (const a of ACHIEVEMENTS) {
      const got = !!done[a.id];
      const card = document.createElement('div');
      card.className = `ach-card${got ? ' done' : ''}`;

      const icon = document.createElement('div');
      icon.className = 'ach-icon';
      icon.textContent = a.icon;

      const body = document.createElement('div');
      body.className = 'ach-body';
      const name = document.createElement('div');
      name.className = 'ach-name';
      name.textContent = a.name;
      const desc = document.createElement('div');
      desc.className = 'ach-desc';
      desc.textContent = a.desc;
      const rw = document.createElement('div');
      rw.className = 'ach-reward';
      rw.textContent = rewardText(a);
      body.append(name, desc, rw);

      card.append(icon, body);
      if (got) {
        const ck = document.createElement('div');
        ck.className = 'ach-check';
        ck.textContent = '✓';
        card.appendChild(ck);
      }
      this.achList.appendChild(card);
    }
  }

  /** 拠点の実績ボタンに出す進捗。 */
  progressText() {
    const p = this.meta.achievementProgress();
    return `${p.have}/${p.total}`;
  }

  // ---- トースト ----

  /**
   * 実績達成の通知。
   * ★一度に大量に達成することがある（初回クリアで5個など）。
   *   全部同時に出すと画面が埋まって操作できなくなるので、
   *   同時表示を絞って順番に流す。
   */
  toast(a) {
    this._toastQueue.push(a);
    this._pumpToasts();
  }

  _pumpToasts() {
    while (this._toastShown < TOAST_MAX && this._toastQueue.length) {
      const a = this._toastQueue.shift();
      this._toastShown++;
      // 束で来たときに1枚ずつずらして出す（同時に3枚パッと出ると読めない）
      setTimeout(() => this._showToast(a), this._toastShown * TOAST_GAP);
    }
  }

  _showToast(a) {
    const el = document.createElement('div');
    el.className = 'toast';

    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.textContent = a.icon;

    const body = document.createElement('span');
    body.className = 'toast-body';
    const k = document.createElement('span');
    k.className = 'toast-kicker';
    k.textContent = 'ACHIEVEMENT';
    const n = document.createElement('span');
    n.className = 'toast-name';
    n.textContent = a.name;
    const r = document.createElement('span');
    r.className = 'toast-reward';
    r.textContent = rewardText(a);
    body.append(k, n, r);

    el.append(icon, body);
    this.toasts.appendChild(el);

    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => {
        el.remove();
        this._toastShown--;
        this._pumpToasts();          // 空いた枠に次を流す
      }, 400);
    }, TOAST_MS);
  }
}

function rewardText(a) {
  if (!a.reward) return '';
  const parts = [];
  if (a.reward.gems) parts.push(`💎${a.reward.gems}`);
  if (a.reward.tickets) parts.push(`🎟${a.reward.tickets}`);
  if (a.unlock) parts.push('新バナー解放');
  return parts.join(' ・ ');
}
