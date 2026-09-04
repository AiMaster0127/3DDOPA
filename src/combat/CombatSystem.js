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

    this.events.emit(EV.ENEMY_HIT, e, amount, isCrit);

    if (e.hp <= 0) {
      e.dead = true;
      this.kills++;
      this.events.emit(EV.ENEMY_KILLED, e, e.arch);
      this.enemies.despawn(e);
      return true;
    }
    return false;
  }

  /**
   * 武器の特殊効果を適用する。
   *
   * ★命中の瞬間に1回だけ呼ぶ。継続ダメージ自体は tickStatuses が処理する。
   * @param {Array} effects data/weapons.js の effects
   * @param {number} damage この一撃で与えたダメージ（割合系の基準になる）
   */
  applyEffects(effects, e, damage) {
    if (!effects || effects.length === 0) return;

    for (let i = 0; i < effects.length; i++) {
      const ef = effects[i];
      // 倒した相手に継続効果を乗せても意味がない。爆発だけは死体を起点にしてよい
      if (e.dead && ef.id !== 'explode') continue;
      if (this.rng.next() >= ef.chance) continue;

      if (ef.id === 'burn') {
        // 強い方で上書きする。弱い炎で強い炎を消させない
        const dps = damage * ef.power;
        if (dps >= e.burnDps || e.burnT <= 0) { e.burnDps = dps; e.burnT = ef.dur; }
        else e.burnT = Math.max(e.burnT, ef.dur);

      } else if (ef.id === 'freeze') {
        if (ef.power >= e.slowMul || e.slowT <= 0) { e.slowMul = ef.power; e.slowT = ef.dur; }
        else e.slowT = Math.max(e.slowT, ef.dur);

      } else if (ef.id === 'explode') {
        this._explode(e.x, e.z, ef.radius, damage * ef.power, e);

      } else {
        console.warn(`未実装の効果: ${ef.id}`);
      }
    }
  }

  /** 爆発。起点の敵自身には二重に入れない。 */
  _explode(x, z, radius, damage, source) {
    const list = this.enemies.list;
    const n = this.grid.query(x, z, radius + 1.0);
    const res = this.grid.result;
    const dmg = Math.max(1, Math.floor(damage));

    for (let k = 0; k < n; k++) {
      const o = list[res[k]];
      if (!o.active || o.dead || o === source) continue;
      const dx = o.x - x, dz = o.z - z;
      const r = radius + o.radius;
      if (dx * dx + dz * dz > r * r) continue;
      this.hitEnemy(o, dmg, false, x, z, 0.35);
    }
  }

  /**
   * 継続ダメージの処理。毎フレーム呼ぶ。
   * ★撃破の扱いを1箇所に集めたいので、burn の判定も hitEnemy を通す。
   */
  tickStatuses(dt) {
    const list = this.enemies.list;
    for (let i = 0; i < this.enemies.cap; i++) {
      const e = list[i];
      if (!e.active || e.burnT <= 0) continue;

      e.burnT -= dt;
      e.tickAcc += e.burnDps * dt;

      // 1以上たまったぶんだけ整数で入れる。端数は持ち越す
      if (e.tickAcc >= 1) {
        const dmg = Math.floor(e.tickAcc);
        e.tickAcc -= dmg;
        this.hitEnemy(e, dmg, false, e.x, e.z, 0);
      }
      if (e.burnT <= 0) { e.burnDps = 0; e.tickAcc = 0; }
    }
  }

  /** 弾 × 敵。貫通弾は同じ敵に二度当たらないよう hitMask で記録する。 */
  resolveProjectiles() {
    const projs = this.projectiles;
    const list = this.enemies.list;

    for (let i = 0; i < projs.cap; i++) {
      const p = projs.list[i];
      if (!p.active || p.hostile) continue;      // 敵弾は別処理

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
        const killed = this.hitEnemy(e, amount, isCrit, p.px, p.pz, p.knock);
        // ★倒した相手にも効果は乗せる（爆発は死体を起点に広がってよい）
        if (p.effects) this.applyEffects(p.effects, e, amount);
        void killed;

        if (--p.pierce < 0) { projs.despawn(p); break; }
      }
    }
  }

  /**
   * 近接の扇形攻撃。弾を出さず、その場で範囲内の敵を判定する。
   * @returns {number} 当てた数
   */
  resolveMeleeArc(player, weapon, atk, critRate, critDmg, element) {
    const effects = weapon.effects;
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
      if (effects) this.applyEffects(effects, e, amount);
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
   * 敵弾 × 自機。
   * 当たった弾は必ず消す（貫通させると弾幕が理不尽になる）。
   */
  resolveHostileProjectiles(player) {
    if (player.dead) return;
    const projs = this.projectiles;

    for (let i = 0; i < projs.cap; i++) {
      const p = projs.list[i];
      if (!p.active || !p.hostile) continue;

      const dx = player.x - p.x, dz = player.z - p.z;
      const r = player.radius + p.radius;
      if (dx * dx + dz * dz > r * r) continue;

      projs.despawn(p);
      if (player.takeDamage(p.damage)) {
        this.events.emit(EV.PLAYER_HIT, p.damage);
        if (player.dead) this.events.emit(EV.PLAYER_DIED);
        return;
      }
    }
  }

  /** ボスの叩きつけなど、敵側の範囲攻撃。 */
  enemySlam(source, radius, damage, player) {
    const dx = player.x - source.x, dz = player.z - source.z;
    const r = radius + player.radius;
    if (dx * dx + dz * dz > r * r) return;
    if (player.takeDamage(damage)) {
      this.events.emit(EV.PLAYER_HIT, damage);
      if (player.dead) this.events.emit(EV.PLAYER_DIED);
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
      if (!e.active || e.isBoss) continue;      // ボスは雑魚に押されない

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
