/**
 * ダメージ算出と当たり判定の解決。
 *
 * ★判定はすべて距離の二乗で行う（sqrt はダメージ方向を出すときだけ）。
 * ★このファイルは three.js を import しない。
 */
import { BALANCE } from '../data/balance.js';
import { EV } from '../core/Events.js';

export class CombatSystem {
  constructor({ grid, enemies, projectiles, events, rng }) {
    this.grid = grid;
    this.enemies = enemies;
    this.projectiles = projectiles;
    this.events = events;
    this.rng = rng;

    this.kills = 0;
    this.damageDealt = 0;
  }

  reset() { this.kills = 0; this.damageDealt = 0; }

  /**
   * 属性倍率。
   * 相性表（攻撃属性→防御属性）と、敵ごとの耐性値（正=耐性 / 負=弱点）を掛ける。
   */
  elementMul(element, arch) {
    let m = 1;
    const chart = BALANCE.combat.elementChart[element];
    if (chart) {
      const v = chart[arch.element];
      if (v !== undefined) m *= v;
    }
    const r = arch.resist && arch.resist[element];
    if (r !== undefined) m *= 1 - r;
    return m;
  }

  /**
   * @param {number} atk      武器＋キャラ倍率まで乗せた攻撃力
   * @param {number} critRate 0..1
   * @param {number} critDmg  クリティカル時の追加倍率
   */
  computeDamage(atk, critRate, critDmg, element, enemy) {
    let dmg = atk * this.elementMul(element, enemy.arch);

    const isCrit = this.rng.next() < (critRate > 0.85 ? 0.85 : critRate);
    if (isCrit) dmg *= 1 + critDmg;

    const amount = Math.max(BALANCE.combat.minDamage, Math.floor(dmg));
    return { amount, isCrit };
  }

  /**
   * 敵にダメージを与える。ノックバックの向きは (fromX, fromZ) → 敵。
   * @returns {boolean} 撃破したか
   */
  hitEnemy(e, amount, isCrit, fromX, fromZ, knock) {
    e.hp -= amount;
    e.flash = 1;
    this.damageDealt += amount;

    if (knock > 0) {
      const dx = e.x - fromX, dz = e.z - fromZ;
      const d = Math.hypot(dx, dz) || 1;
      // 大きい敵ほど動かない。半径を質量の代用にする
      const mass = e.radius / 0.55;
      const power = (knock * 26) / mass;
      e.kx += (dx / d) * power;
      e.kz += (dz / d) * power;
    }

    this.events.emit(EV.ENEMY_HIT, e, amount);

    if (e.hp <= 0) {
      e.dead = true;
      this.kills++;
      this.events.emit(EV.ENEMY_KILLED, e, e.arch);
      this.enemies.despawn(e);
      return true;
    }
    return false;
  }

  /** 弾 × 敵。貫通弾は同じ敵に二度当たらないよう hitMask で記録する。 */
  resolveProjectiles() {
    const projs = this.projectiles;
    const list = this.enemies.list;

    for (let i = 0; i < projs.cap; i++) {
      const p = projs.list[i];
      if (!p.active) continue;

      const n = this.grid.query(p.x, p.z, p.radius + 1.0);
      const res = this.grid.result;

      for (let k = 0; k < n; k++) {
        const idx = res[k];
        const e = list[idx];
        if (!e.active || e.dead || p.hitMask.has(idx)) continue;

        const dx = e.x - p.x, dz = e.z - p.z;
        const r = e.radius + p.radius;
        if (dx * dx + dz * dz > r * r) continue;      // ★sqrtを使わない

        p.hitMask.add(idx);
        const { amount, isCrit } = this.computeDamage(p.damage, p.crit, p.critDmg, p.element, e);
        this.hitEnemy(e, amount, isCrit, p.px, p.pz, p.knock);

        if (--p.pierce < 0) { projs.despawn(p); break; }
      }
    }
  }

  /**
   * 近接の扇形攻撃。弾を出さず、その場で範囲内の敵を判定する。
   * @returns {number} 当てた数
   */
  resolveMeleeArc(player, weapon, atk, critRate, critDmg, element) {
    const a = weapon.attack;
    const range = weapon.base.range;
    const halfArc = (a.arcDeg * Math.PI) / 360;      // 度→ラジアンの半角
    const list = this.enemies.list;

    const n = this.grid.query(player.x, player.z, range + 1.2);
    const res = this.grid.result;

    let hits = 0;
    for (let k = 0; k < n && hits <= a.pierce; k++) {
      const e = list[res[k]];
      if (!e.active || e.dead) continue;

      const dx = e.x - player.x, dz = e.z - player.z;
      const reach = range + e.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 > reach * reach) continue;

      // 扇の内側か。正規化した方向ベクトルの内積で角度を見る
      const d = Math.sqrt(d2) || 1;
      const dot = (dx * player.dirX + dz * player.dirZ) / d;
      if (dot < Math.cos(halfArc)) continue;

      const { amount, isCrit } = this.computeDamage(atk, critRate, critDmg, element, e);
      this.hitEnemy(e, amount, isCrit, player.x, player.z, weapon.base.knock);
      hits++;
    }
    return hits;
  }

  /** 敵 × 自機の接触ダメージ。 */
  resolveContact(player) {
    if (player.dead) return;

    const list = this.enemies.list;
    const n = this.grid.query(player.x, player.z, player.radius + 1.6);
    const res = this.grid.result;

    for (let k = 0; k < n; k++) {
      const e = list[res[k]];
      if (!e.active || e.dead || e.contactCd > 0) continue;

      const dx = e.x - player.x, dz = e.z - player.z;
      const r = e.radius + player.radius;
      if (dx * dx + dz * dz > r * r) continue;

      e.contactCd = BALANCE.combat.contactCd;
      if (player.takeDamage(e.atk)) {
        this.events.emit(EV.PLAYER_HIT, e.atk);
        if (player.dead) this.events.emit(EV.PLAYER_DIED);
        return;               // 1フレームに複数回被弾させない
      }
    }
  }

  /**
   * 敵同士の重なり回避。
   * これがないと全部が1点に重なって「1体しかいないように見える」。
   *
   * ★2フレームに1回だけ、押し出しを2倍にして実行する（見た目は変わらず負荷は半分）。
   */
  separate(frame) {
    if (frame & 1) return;

    const list = this.enemies.list;
    for (let i = 0; i < this.enemies.cap; i++) {
      const e = list[i];
      if (!e.active) continue;

      const n = this.grid.query(e.x, e.z, e.radius * 2 + 0.6);
      const res = this.grid.result;

      let pushed = 0;
      for (let k = 0; k < n && pushed < 4; k++) {    // 近傍4体までで打ち切る
        const idx = res[k];
        if (idx === i) continue;
        const o = list[idx];
        if (!o.active) continue;

        const dx = e.x - o.x, dz = e.z - o.z;
        const r = e.radius + o.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r || d2 === 0) continue;

        const d = Math.sqrt(d2);
        const push = (r - d) * 0.5;                 // 2フレームに1回なので0.25ではなく0.5
        e.x += (dx / d) * push;
        e.z += (dz / d) * push;
        pushed++;
      }
    }
  }
}
