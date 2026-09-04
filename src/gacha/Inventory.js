/**
 * 所持武器の管理。装備・限界突破・強化。
 *
 * 実データは save.data.inventory に置く（＝そのまま永続化される）。
 * このクラスは「操作」だけを持ち、状態を二重に持たない。
 */
import { GACHA } from '../data/gacha.js';
import { WEAPON_BY_ID, STARTER_WEAPON } from '../data/weapons.js';

export class Inventory {
  /** @param {import('../save/SaveManager.js').SaveManager} save */
  constructor(save) {
    this.save = save;
    this._ensureStarter();
  }

  get inv() { return this.save.data.inventory; }
  get wallet() { return this.save.data.wallet; }
  get owned() { return this.inv.weapons; }

  _ensureStarter() {
    if (!this.owned[STARTER_WEAPON]) {
      this.owned[STARTER_WEAPON] = { lv: 1, lb: 0, shards: 0, obtainedAt: Date.now() };
    }
    // 装備が壊れていたら初期装備へ戻す（セーブ破損やデータ削除への保険）
    if (!this.owned[this.inv.equipped] || !WEAPON_BY_ID.has(this.inv.equipped)) {
      this.inv.equipped = STARTER_WEAPON;
    }
  }

  has(id) { return !!this.owned[id]; }
  entry(id) { return this.owned[id] || null; }
  get equippedId() { return this.inv.equipped; }

  /** 所持一覧。レアリティ降順 → 攻撃力降順で並べる。 */
  list() {
    const rank = { SSR: 3, SR: 2, R: 1, N: 0 };
    return Object.keys(this.owned)
      .map(id => ({ id, def: WEAPON_BY_ID.get(id), own: this.owned[id] }))
      .filter(e => e.def)
      .sort((a, b) => (rank[b.def.rarity] - rank[a.def.rarity]) ||
                      (this.atkOf(b.id) - this.atkOf(a.id)));
  }

  /** 図鑑の進捗（未所持も含めた総数に対する所持数） */
  collection() {
    const total = WEAPON_BY_ID.size;
    const have = Object.keys(this.owned).filter(id => WEAPON_BY_ID.has(id)).length;
    return { have, total };
  }

  /**
   * 排出処理。新規なら所持に追加、ダブりならかけら＋強化粉に変換。
   * @returns {{weapon, rarity, dupe:boolean, shards:number, dust:number}}
   */
  grant(weapon, rarity) {
    const existing = this.owned[weapon.id];
    if (!existing) {
      this.owned[weapon.id] = { lv: 1, lb: 0, shards: 0, obtainedAt: Date.now() };
      return { weapon, rarity, dupe: false, shards: 0, dust: 0 };
    }

    const shards = GACHA.dupe.shards;
    const dust = GACHA.dupe.dust[rarity] ?? 0;
    existing.shards += shards;
    this.wallet.dust += dust;
    return { weapon, rarity, dupe: true, shards, dust };
  }

  equip(id) {
    if (!this.has(id) || !WEAPON_BY_ID.has(id)) return false;
    this.inv.equipped = id;
    this.save.saveNow();
    return true;
  }

  // ---- 限界突破 ----

  /** 次の段階に必要なかけら。上限なら null。 */
  lbCost(id) {
    const own = this.entry(id);
    if (!own || own.lb >= GACHA.limitBreak.maxLB) return null;
    return GACHA.limitBreak.costs[own.lb];
  }

  canLimitBreak(id) {
    const cost = this.lbCost(id);
    return cost !== null && this.entry(id).shards >= cost;
  }

  limitBreak(id) {
    if (!this.canLimitBreak(id)) return false;
    const own = this.entry(id);
    own.shards -= this.lbCost(id);
    own.lb++;
    this.save.saveNow();
    return true;
  }

  // ---- 強化（強化粉でレベルを上げる） ----

  enhanceCost(id) {
    const own = this.entry(id);
    const def = WEAPON_BY_ID.get(id);
    if (!own || !def || own.lv >= GACHA.enhance.maxLevel) return null;
    return GACHA.enhance.costFor(def.rarity, own.lv);
  }

  canEnhance(id) {
    const cost = this.enhanceCost(id);
    return cost !== null && this.wallet.dust >= cost;
  }

  enhance(id) {
    if (!this.canEnhance(id)) return false;
    this.wallet.dust -= this.enhanceCost(id);
    this.entry(id).lv++;
    this.save.saveNow();
    return true;
  }

  /**
   * 表示用の攻撃力（武器レベル成長 + 限界突破）。
   * ★戦闘側の WeaponSystem.effectiveAtk と同じ式にすること。
   */
  atkOf(id) {
    const def = WEAPON_BY_ID.get(id);
    const own = this.entry(id);
    if (!def || !own) return 0;
    const base = def.base.atk + def.growth.atk * (own.lv - 1);
    return base * (1 + GACHA.limitBreak.atkPerLB * own.lb);
  }
}
