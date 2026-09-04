/**
 * レベルアップ時のスキル3択。
 *
 * ★選択中はゲームを止める。動きながら選ばせると、選択が「作業」になる。
 * ★カードのDOMは毎回作り直す（レベルアップは頻度が低いので許容できる）。
 */
export class LevelUpUI {
  /** @param {(id:string)=>void} onPick */
  constructor(onPick) {
    this.root = document.getElementById('levelup');
    this.num = document.getElementById('lvNum');
    this.cards = document.getElementById('lvCards');
    this.onPick = onPick;
    this._locked = false;
  }

  get visible() { return !this.root.hidden; }

  /**
   * @param {number} level
   * @param {Array<{id,name,icon,desc,nextLv,maxLv,isNew}>} choices
   */
  show(level, choices) {
    this.num.textContent = level;
    this.cards.replaceChildren();
    this._locked = false;

    for (const c of choices) {
      const btn = document.createElement('button');
      btn.className = `lv-card${c.isNew ? ' is-new' : ''}`;
      btn.type = 'button';

      const icon = document.createElement('div');
      icon.className = 'lv-icon';
      icon.textContent = c.icon;

      const name = document.createElement('div');
      name.className = 'lv-name';
      name.textContent = c.name;

      const lv = document.createElement('div');
      lv.className = 'lv-lv';
      lv.textContent = c.isNew ? 'NEW' : `Lv.${c.nextLv} / ${c.maxLv}`;

      const desc = document.createElement('div');
      desc.className = 'lv-desc';
      desc.textContent = c.desc;

      btn.append(icon, name, lv, desc);
      // 連打で2枚選ばれるのを防ぐ
      btn.addEventListener('click', () => {
        if (this._locked) return;
        this._locked = true;
        this.onPick(c.id);
      });
      this.cards.appendChild(btn);
    }

    this.root.hidden = false;
    // キーボードでも選べるように先頭にフォーカスを置く
    this.cards.firstElementChild?.focus?.();
  }

  hide() { this.root.hidden = true; }
}
