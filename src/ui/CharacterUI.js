/**
 * キャラクター選択。
 *
 * 一覧は data/characters.js から生成する。UIに性能を直書きしない。
 */
import { CHARACTERS } from '../data/characters.js';

/** 解放条件の説明。実績IDと対応させる。 */
const UNLOCK_HINT = {
  char_ranger: '実績「初討伐」（ボスを1体撃破）で解放',
  char_bulwark: '実績「飛躍」（ラン中にLv.20へ到達）で解放',
  char_arcanist: '実績「蒐集家」（SSRを5本入手）で解放',
};

export class CharacterUI {
  /**
   * @param {object} o
   * @param {import('../progression/MetaSystem.js').MetaSystem} o.meta
   * @param {(id:string)=>void} o.onSelect
   * @param {()=>void} o.onBack
   */
  constructor({ meta, onSelect, onBack }) {
    this.meta = meta;
    this.onSelect = onSelect;

    this.root = document.getElementById('chars');
    this.listEl = document.getElementById('charList');
    this.progEl = document.getElementById('cProgress');

    document.getElementById('charBack').addEventListener('click', onBack);
  }

  get visible() { return !this.root.hidden; }

  show() { this.root.hidden = false; this.refresh(); }
  hide() { this.root.hidden = true; }

  refresh() {
    const available = this.meta.availableCharacters();
    this.progEl.textContent = `${available.length}/${CHARACTERS.length}`;

    const current = this.meta.character.id;
    this.listEl.replaceChildren();

    for (const c of CHARACTERS) {
      const unlocked = this.meta.isCharacterUnlocked(c);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `char-card${c.id === current ? ' selected' : ''}`;
      btn.disabled = !unlocked;
      btn.style.setProperty('--cc', `#${c.visual.accent.toString(16).padStart(6, '0')}`);

      const icon = document.createElement('div');
      icon.className = 'cc-icon';
      icon.textContent = unlocked ? c.icon : '🔒';

      const body = document.createElement('div');
      body.className = 'cc-body';

      const head = document.createElement('div');
      head.className = 'cc-head';
      const name = document.createElement('span');
      name.className = 'cc-name';
      name.textContent = unlocked ? c.name : '???';
      const tag = document.createElement('span');
      tag.className = 'cc-tag';
      tag.textContent = c.tag;
      head.append(name, tag);
      if (c.id === current) {
        const b = document.createElement('span');
        b.className = 'cc-badge';
        b.textContent = '選択中';
        head.appendChild(b);
      }

      const desc = document.createElement('div');
      desc.className = 'cc-desc';
      desc.textContent = c.desc;

      body.append(head, desc);

      if (unlocked) {
        const detail = document.createElement('div');
        detail.className = 'cc-detail';
        detail.textContent = c.detail;
        body.appendChild(detail);
      } else {
        const lock = document.createElement('div');
        lock.className = 'cc-lock';
        lock.textContent = UNLOCK_HINT[c.unlock] || '実績で解放';
        body.appendChild(lock);
      }

      btn.append(icon, body);
      if (unlocked) btn.addEventListener('click', () => { this.onSelect(c.id); this.refresh(); });
      this.listEl.appendChild(btn);
    }
  }
}
