/**
 * 経験値ジェムの論理。★three.js を import しない。
 *
 * 敵を倒した位置に落ち、自機が近づくと吸い寄せられる。
 * 「拾う」ではなく「近づくと寄ってくる」ことで、戦闘中に足を止めさせない。
 */
import { Pool } from '../core/Pool.js';
import { BALANCE } from '../data/balance.js';

function makePickup() {
  return {
    active: false, slot: -1,
    x: 0, z: 0, px: 0, pz: 0,
    vx: 0, vz: 0,
    xp: 0,
    life: 0,
    spin: 0,
    attracted: false,
  };
}

export class PickupPool {
  constructor() {
    this.pool = new Pool(BALANCE.pools.pickups, makePickup);
    this.list = this.pool.list;
    this.cap = this.pool.cap;
  }

  get count() { return this.pool.count; }

  spawn(x, z, xp) {
    const g = this.pool.spawn();
    if (!g) return null;
    g.x = g.px = x;
    g.z = g.pz = z;
    // 落下時に少し散らす。同じ場所で重なって1個に見えるのを防ぐ
    g.vx = (Math.random() * 2 - 1) * 2.2;
    g.vz = (Math.random() * 2 - 1) * 2.2;
    g.xp = xp;
    g.life = BALANCE.pickup.life;
    g.spin = Math.random() * 6.28;
    g.attracted = false;
    return g;
  }

  despawn(g) { this.pool.despawn(g); }
  despawnAll() { this.pool.despawnAll(); }

  /**
   * @returns {number} このフレームで回収した経験値の合計
   */
  update(dt, player) {
    const p = BALANCE.pickup;
    const range = p.baseRange * (1 + player.stats.pickupPct);
    const range2 = range * range;
    const collect2 = p.collectRange * p.collectRange;
    const drag = Math.exp(-6 * dt);

    let gained = 0;

    for (let i = 0; i < this.cap; i++) {
      const g = this.list[i];
      if (!g.active) continue;

      g.px = g.x; g.pz = g.z;
      g.spin += dt * 3;

      const dx = player.x - g.x, dz = player.z - g.z;
      const d2 = dx * dx + dz * dz;

      // 一度吸い寄せに入ったら範囲外に出ても追い続ける（取りこぼしを無くす）
      if (d2 < range2) g.attracted = true;

      if (g.attracted) {
        const d = Math.sqrt(d2) || 1;
        g.vx += (dx / d) * p.attract * dt;
        g.vz += (dz / d) * p.attract * dt;
      } else {
        g.vx *= drag; g.vz *= drag;
        g.life -= dt;
        if (g.life <= 0) { this.despawn(g); continue; }
      }

      g.x += g.vx * dt;
      g.z += g.vz * dt;

      if (d2 < collect2) { gained += g.xp; this.despawn(g); }
    }

    return gained;
  }
}
