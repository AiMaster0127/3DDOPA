/**
 * 装備画面。所持武器の一覧・装備変更・限界突破・強化。
 */
import { RARITY_COLOR, GACHA } from '../data/gacha.js';

const EFFECT_LABEL = {
  burn:    (e) => `炎上：${Math.round(e.chance * 100)}%で ${Math.round(e.power * 100)}%/秒 を ${e.dur}秒`,
  freeze:  (e) => `凍結：${Math.round(e.chance * 100)}%で ${Math.round(e.power * 100)}% 減速 ${e.dur}秒`,
  explode: (e) => `爆発：${Math.round(e.chance * 100)}%で 半径${e.radius} に ${Math.round(e.power * 100)}%`,
};

const ELEMENT_LABEL = { none: '無', fire: '火', ice: '氷', thunder: '雷', dark: '闇' };
const TYPE_LABEL = {
  sword: '剣', axe: '斧', blunt: '鈍器', spear: '槍',
  bow: '弓', gun: '銃', staff: '杖', fist: '拳',
};

export class InventoryUI {
  /**
   * @param {object} o
   * @param {import('../gacha/Inventory.js').Inventory} o.inventory
   * @param {(id:string)=>void} o.onEquip
   * @param {()=>void} o.onBack
   */
  constructor({ inventory, onEquip, onBack }) {
    this.inv = inventory;
    this.onEquip = onEquip;

    this.root = document.getElementById('inv');
    this.listEl = document.getElementById('invList');
    this.detailEl = document.getElementById('invDetail');
    this.dustEl = document.getElementById('iDust');
    this.colEl = document.getElementById('iCollection');

    this.selected = null;
    document.getElementById('invBack').addEventListener('click', onBack);
  }

  get visible() { return !this.root.hidden; }

  show() {
    this.root.hidden = false;
    this.selected = this.selected && this.inv.has(this.selected) ? this.selected : this.inv.equippedId;
    this.refresh();
  }

  hide() { this.root.hidden = true; }

  refresh() {
    this.dustEl.textContent = this.inv.wallet.dust;
    const col = this.inv.collection();
    this.colEl.textContent = `図鑑 ${col.have}/${col.total}`;
    this._renderList();
    this._renderDetail();
  }

  _renderList() {
    this.listEl.replaceChildren();
    for (const { id, def, own } of this.inv.list()) {
      const c = RARITY_COLOR[def.rarity];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `inv-card${id === this.selected ? ' selected' : ''}`;
      btn.style.setProperty('--rc', c.css);
      btn.style.setProperty('--rc-glow', `${c.css}66`);

      const top = document.createElement('div');
      top.className = 'ic-top';
      const r = document.createElement('span');
      r.className = 'ic-r';
      r.textContent = def.rarity;
      top.appendChild(r);
      if (id === this.inv.equippedId) {
        const eq = document.createElement('span');
        eq.className = 'ic-eq';
        eq.textContent = '装備中';
        top.appendChild(eq);
      }

      const name = document.createElement('div');
      name.className = 'ic-n';
      name.textContent = def.name;

      const sub = document.createElement('div');
      sub.className = 'ic-s';
      sub.textContent = `攻 ${Math.round(this.inv.atkOf(id))} ・ Lv.${own.lv}` +
                        (own.lb > 0 ? ` ・ 限${own.lb}` : '');

      btn.append(top, name, sub);
      btn.addEventListener('click', () => { this.selected = id; this.refresh(); });
      this.listEl.appendChild(btn);
    }
  }

  _renderDetail() {
    const id = this.selected;
    this.detailEl.replaceChildren();
    if (!id || !this.inv.has(id)) return;

    const def = this.inv.list().find(e => e.id === id)?.def;
    const own = this.inv.entry(id);
    if (!def) return;

    const c = RARITY_COLOR[def.rarity];
    this.detailEl.style.setProperty('--rc', c.css);

    const rar = document.createElement('div');
    rar.className = 'd-r';
    rar.textContent = `${def.rarity} ・ ${ELEMENT_LABEL[def.element] ?? def.element}属性 ・ ${TYPE_LABEL[def.type] ?? def.type}`;

    const h = document.createElement('h3');
    h.textContent = def.name;

    const stats = document.createElement('dl');
    stats.className = 'd-stats';
    const rows = [
      ['攻撃力', Math.round(this.inv.atkOf(id))],
      ['攻撃速度', `${def.base.rate.toFixed(1)} /秒`],
      ['射程', def.base.range.toFixed(1)],
      ['クリティカル', `${Math.round(def.base.crit * 100)}%`],
      ['形式', def.attack.kind === 'melee_arc' ? `近接 ${def.attack.arcDeg}°` : `射撃 ${def.attack.count}発 貫通${def.attack.pierce}`],
      ['強化', `Lv.${own.lv} / ${GACHA.enhance.maxLevel}`],
      ['限界突破', `${own.lb} / ${GACHA.limitBreak.maxLB}（かけら ${own.shards}）`],
    ];
    for (const [k, v] of rows) {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      stats.append(dt, dd);
    }

    this.detailEl.append(rar, h, stats);

    if (def.effects.length) {
      const fx = document.createElement('div');
      fx.className = 'd-effects';
      for (const e of def.effects) {
        const line = document.createElement('div');
        line.textContent = EFFECT_LABEL[e.id] ? EFFECT_LABEL[e.id](e) : e.id;
        fx.appendChild(line);
      }
      this.detailEl.appendChild(fx);
    }

    const flavor = document.createElement('p');
    flavor.className = 'd-flavor';
    flavor.textContent = def.flavor;
    this.detailEl.appendChild(flavor);

    // ---- 操作 ----
    const acts = document.createElement('div');
    acts.className = 'd-actions';

    const eq = document.createElement('button');
    eq.className = 'home-btn primary';
    eq.type = 'button';
    eq.textContent = id === this.inv.equippedId ? '装備中' : '装備する';
    eq.disabled = id === this.inv.equippedId;
    eq.addEventListener('click', () => { this.onEquip(id); this.refresh(); });

    const enhCost = this.inv.enhanceCost(id);
    const enh = document.createElement('button');
    enh.className = 'home-btn';
    enh.type = 'button';
    enh.textContent = enhCost === null ? '強化 最大' : `強化（✨${enhCost}）`;
    enh.disabled = !this.inv.canEnhance(id);
    enh.addEventListener('click', () => { this.inv.enhance(id); this.refresh(); });

    const lbCost = this.inv.lbCost(id);
    const lb = document.createElement('button');
    lb.className = 'home-btn';
    lb.type = 'button';
    lb.textContent = lbCost === null ? '限界突破 最大' : `限界突破（かけら${lbCost}）`;
    lb.disabled = !this.inv.canLimitBreak(id);
    lb.addEventListener('click', () => { this.inv.limitBreak(id); this.refresh(); });

    acts.append(eq, enh, lb);
    this.detailEl.appendChild(acts);
  }
}
