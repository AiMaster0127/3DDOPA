/**
 * ガチャの抽選ロジック。
 *
 * ★確率は data/gacha.js の baseRates だけを見る。ここには数値を書かない。
 * ★排出結果は「演出を再生する前」に確定・保存する。
 *   演出中にタブを閉じても、引いた武器は絶対に消えない。
 */
import { GACHA, RARITIES, RARITY_RANK } from '../data/gacha.js';
import { WEAPONS_BY_RARITY, WEAPON_BY_ID } from '../data/weapons.js';

export class GachaSystem {
  /**
   * @param {object} o
   * @param {import('../save/SaveManager.js').SaveManager} o.save
   * @param {import('./Inventory.js').Inventory} o.inventory
   * @param {import('../core/RNG.js').RNG} o.rng
   */
  constructor({ save, inventory, rng }) {
    this.save = save;
    this.inventory = inventory;
    this.rng = rng;
    this.banner = GACHA.banners[0];
  }

  get state() { return this.save.data.gacha; }
  get wallet() { return this.save.data.wallet; }

  /** 天井を織り込んだ、いま引いた場合のSSR率（UI表示にも使う）。 */
  currentSSRRate() {
    const p = GACHA.pity;
    const since = this.state.sinceSSR + 1;      // これから引く1回ぶん
    if (since >= p.hard) return 1;
    let r = GACHA.baseRates.SSR;
    if (since >= p.softStart) r += (since - p.softStart + 1) * p.softAdd;
    return Math.min(r, 1);
  }

  /** 天井まであと何回か */
  get pullsToPity() { return Math.max(0, GACHA.pity.hard - this.state.sinceSSR); }

  canPullSingle() { return this.wallet.gems >= GACHA.cost.single || this.wallet.tickets > 0; }
  canPullTen() { return this.wallet.gems >= GACHA.cost.ten; }

  /**
   * レアリティを決める。
   * SSR率が天井で押し上げられたぶんは、下位レアから元の比率に応じて差し引く。
   */
  _pickRarity(ssrRate) {
    const base = GACHA.baseRates;
    const rest = 1 - ssrRate;
    const baseRestSum = 1 - base.SSR;

    let r = this.rng.next();
    if (r < ssrRate) return 'SSR';
    r -= ssrRate;

    for (const rar of RARITIES) {
      if (rar === 'SSR') continue;
      // 元の比率を保ったまま残りの確率質量へ押し込める
      const w = baseRestSum > 0 ? (base[rar] / baseRestSum) * rest : 0;
      if (r < w) return rar;
      r -= w;
    }
    return 'N';
  }

  _pickWeapon(rarity) {
    const pool = (WEAPONS_BY_RARITY[rarity] || []).filter(w => !this.banner.exclude.includes(w.id));
    if (pool.length === 0) {
      console.warn(`レアリティ ${rarity} の武器がプールに無い。Nで代用する`);
      return WEAPONS_BY_RARITY.N[0];
    }
    return pool[Math.floor(this.rng.next() * pool.length)];
  }

  /**
   * 1回引く。★通貨の消費は呼び出し側（pullSingle / pullTen）が済ませている前提。
   * @returns {{weapon, rarity, dupe, shards, dust, featured, pityHit}}
   */
  _rollOne() {
    const st = this.state;
    const p = GACHA.pity;

    st.totalPulls++;
    st.sinceSSR++;

    const ssrRate = (() => {
      if (st.sinceSSR >= p.hard) return 1;
      let r = GACHA.baseRates.SSR;
      if (st.sinceSSR >= p.softStart) r += (st.sinceSSR - p.softStart + 1) * p.softAdd;
      return Math.min(r, 1);
    })();
    const pityHit = st.sinceSSR >= p.hard;

    const rarity = this._pickRarity(ssrRate);

    let weapon;
    let featured = false;
    if (rarity === 'SSR') {
      st.sinceSSR = 0;
      const forced = this.banner.guaranteeAfterLoss && st.lostFiftyFifty;
      if (forced || this.rng.next() < this.banner.featuredChance) {
        const id = this.banner.featured[Math.floor(this.rng.next() * this.banner.featured.length)];
        weapon = WEAPON_BY_ID.get(id) || this._pickWeapon(rarity);
        featured = true;
        st.lostFiftyFifty = false;
      } else {
        weapon = this._pickWeapon(rarity);
        st.lostFiftyFifty = true;
      }
      this.save.data.stats.ssrCount++;
    } else {
      weapon = this._pickWeapon(rarity);
    }

    const res = this.inventory.grant(weapon, rarity);
    res.featured = featured;
    res.pityHit = pityHit;

    // 直近50件だけ残す（履歴が無限に伸びてセーブが膨らむのを防ぐ）
    st.history.push({ id: weapon.id, rarity, at: Date.now() });
    if (st.history.length > 50) st.history.splice(0, st.history.length - 50);

    return res;
  }

  /**
   * 単発。チケットがあればチケットを優先して消費する。
   * @returns {?Array} 排出結果の配列（失敗時 null）
   */
  pullSingle() {
    const w = this.wallet;
    if (w.tickets > 0) w.tickets--;
    else if (w.gems >= GACHA.cost.single) w.gems -= GACHA.cost.single;
    else return null;

    const out = [this._rollOne()];
    this.save.saveNow();          // ★演出より先に保存する
    return out;
  }

  /**
   * 10連。SR以上が1つも無ければ、最後の1枠をSR以上で引き直す。
   * @returns {?Array}
   */
  pullTen() {
    const w = this.wallet;
    if (w.gems < GACHA.cost.ten) return null;
    w.gems -= GACHA.cost.ten;

    const out = [];
    for (let i = 0; i < 10; i++) out.push(this._rollOne());

    const floor = GACHA.pity.tenPullFloor;
    if (!out.some(r => RARITY_RANK[r.rarity] >= RARITY_RANK[floor])) {
      // 保証ぶんの引き直し。カウンタの二重進行を避けるため直接組み立てる
      const st = this.state;
      st.totalPulls++;              // 引き直しも1回として数える
      const weapon = this._pickWeapon(floor);
      const res = this.inventory.grant(weapon, floor);
      res.featured = false;
      res.pityHit = false;
      res.guaranteed = true;
      out[9] = res;
      st.history.push({ id: weapon.id, rarity: floor, at: Date.now() });
      if (st.history.length > 50) st.history.splice(0, st.history.length - 50);
    }

    this.save.saveNow();          // ★演出より先に保存する
    return out;
  }
}
