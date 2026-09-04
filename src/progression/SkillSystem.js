/**
 * スキルの習得・強化・発動と、ステータスへの反映。
 *
 * ★player.stats は「毎回ゼロから作り直す」。
 *   差分を足し引きすると、レベルアップのたびに誤差と抜けが溜まる。
 */
import { SKILLS, SKILL_BY_ID } from '../data/skills.js';
import { BALANCE } from '../data/balance.js';

/** 成長値ゼロの状態。ここに定義が無い項目は使わない。 */
function baseStats() {
  return {
    maxHpPct: 0,
    atkPct: 0,
    speedPct: 0,
    critAdd: 0,
    rateAdd: 0,      // 攻撃速度
    pickupPct: 0,    // 経験値の回収範囲
    drAdd: 0,        // 被ダメージ軽減
  };
}

export class SkillSystem {
  /**
   * @param {object} o
   * @param {() => object} o.metaBonus 永続強化ぶんの stats を返す関数
   */
  constructor({ player, combat, enemies, grid, rng, metaBonus }) {
    this.player = player;
    this.combat = combat;
    this.enemies = enemies;
    this.grid = grid;
    this.rng = rng;
    this.metaBonus = metaBonus;

    /** id → 現在のレベル */
    this.levels = new Map();
    /** アクティブスキルの残りクールダウン */
    this._cd = new Map();

    // active の cast に渡す文脈。★毎回作らず使い回す
    this.ctx = {
      player,
      aoe: (x, z, r, dmg) => this._aoe(x, z, r, dmg),
      bolt: (n, dmg) => this._bolt(n, dmg),
      heal: (amount) => this._heal(amount),
    };

    this.reset();
  }

  reset() {
    this.levels.clear();
    this._cd.clear();
    this.recompute();
  }

  levelOf(id) { return this.levels.get(id) || 0; }

  /** そのスキルをこれ以上伸ばせるか */
  canTake(skill) { return this.levelOf(skill.id) < skill.maxLv; }

  /** 習得／強化。 */
  take(id) {
    const sk = SKILL_BY_ID.get(id);
    if (!sk) { console.warn(`未知のスキルID: ${id}`); return false; }
    const lv = this.levelOf(id);
    if (lv >= sk.maxLv) return false;

    this.levels.set(id, lv + 1);
    if (sk.kind === 'active' && !this._cd.has(id)) this._cd.set(id, 0.6);   // 少し溜めてから初回
    this.recompute();
    return true;
  }

  /**
   * レベルアップ時の選択肢を作る。
   * 上限に達したスキルは出さない。全部上限なら空配列（呼び出し側で握る）。
   */
  roll(count = BALANCE.runLevel.skillChoices) {
    const pool = SKILLS.filter(s => this.canTake(s));
    // Fisher-Yates。RNG経由なのでシード固定で再現できる
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng.next() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, count).map(s => ({
      id: s.id, name: s.name, icon: s.icon, kind: s.kind,
      nextLv: this.levelOf(s.id) + 1, maxLv: s.maxLv,
      desc: s.desc(this.levelOf(s.id) + 1),
      isNew: this.levelOf(s.id) === 0,
    }));
  }

  /** ★player.stats をゼロから組み直す。順序は 永続強化 → ランレベル → スキル。 */
  recompute() {
    const s = baseStats();

    const meta = this.metaBonus ? this.metaBonus() : null;
    if (meta) for (const k of Object.keys(s)) if (meta[k]) s[k] += meta[k];

    // ランレベルの素の伸び（レベル1では加算なし）
    const per = BALANCE.runLevel.perLevel;
    const n = Math.max(0, (this.player.runLv || 1) - 1);
    s.atkPct += per.atkPct * n;
    s.speedPct += per.speedPct * n;
    s.critAdd += per.critAdd * n;

    for (const [id, lv] of this.levels) {
      const sk = SKILL_BY_ID.get(id);
      if (sk && sk.kind === 'passive') sk.apply(s, lv);
    }

    Object.assign(this.player.stats, s);
  }

  /** アクティブスキルのクールダウン処理。毎フレーム呼ぶ。 */
  update(dt) {
    if (this.player.dead) return;
    for (const [id, lv] of this.levels) {
      const sk = SKILL_BY_ID.get(id);
      if (!sk || sk.kind !== 'active') continue;

      let cd = this._cd.get(id) - dt;
      if (cd <= 0) {
        sk.cast(this.ctx, lv);
        cd += sk.cooldown(lv);
      }
      this._cd.set(id, cd);
    }
  }

  // ---- ctx の実装 ----

  _aoe(x, z, radius, damage) {
    const list = this.enemies.list;
    const n = this.grid.query(x, z, radius + 1.0);
    const res = this.grid.result;
    for (let k = 0; k < n; k++) {
      const e = list[res[k]];
      if (!e.active || e.dead) continue;
      const dx = e.x - x, dz = e.z - z;
      const r = radius + e.radius;
      if (dx * dx + dz * dz > r * r) continue;
      this.combat.hitEnemy(e, Math.floor(damage), false, x, z, 0.3);
    }
  }

  _bolt(count, damage) {
    const p = this.player;
    const list = this.enemies.list;
    const n = this.grid.query(p.x, p.z, 14);
    const res = this.grid.result;

    // 近い順に count 体。数が少ないので部分選択で十分
    let taken = 0;
    const used = this._boltUsed || (this._boltUsed = new Set());
    used.clear();

    while (taken < count) {
      let best = -1, bestD = Infinity;
      for (let k = 0; k < n; k++) {
        const idx = res[k];
        if (used.has(idx)) continue;
        const e = list[idx];
        if (!e.active || e.dead) continue;
        const d = (e.x - p.x) ** 2 + (e.z - p.z) ** 2;
        if (d < bestD) { bestD = d; best = idx; }
      }
      if (best < 0) break;
      used.add(best);
      this.combat.hitEnemy(list[best], Math.floor(damage), false, p.x, p.z, 0.2);
      taken++;
    }
  }

  _heal(amount) {
    const p = this.player;
    if (p.dead) return;
    p.hp = Math.min(p.maxHp, p.hp + amount);
  }
}
