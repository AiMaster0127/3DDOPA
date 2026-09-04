/**
 * 弾の論理。★three.js を import しない。
 *
 * 直進 + 寿命 + 貫通数だけの単純な実体。曲がる弾やホーミングは
 * ここに挙動フラグを足す形で拡張する（フェーズ4以降）。
 */
import { Pool } from '../core/Pool.js';
import { BALANCE } from '../data/balance.js';

function makeProjectile() {
  return {
    active: false, slot: -1,
    x: 0, z: 0, px: 0, pz: 0,
    vx: 0, vz: 0,
    facing: 0,
    radius: 0.3,
    life: 0,
    damage: 0, crit: 0, critDmg: 0, knock: 0,
    element: 'none',
    pierce: 0,
    visualIndex: 0,      // InstancedMesh の添字（弾の見た目の種類）
    hitMask: null,       // 貫通中に同じ敵へ二重ヒットしないための記録
  };
}

export class ProjectilePool {
  constructor() {
    this.pool = new Pool(BALANCE.pools.projectiles, makeProjectile);
    this.list = this.pool.list;
    this.cap = this.pool.cap;
    // 貫通弾が同じ敵を二度打たないよう、弾ごとにヒット済みSetを使い回す
    for (let i = 0; i < this.cap; i++) this.list[i].hitMask = new Set();
  }

  get count() { return this.pool.count; }

  spawn(x, z, dirX, dirZ, speed, opts) {
    const p = this.pool.spawn();
    if (!p) return null;

    p.x = p.px = x;
    p.z = p.pz = z;
    p.vx = dirX * speed;
    p.vz = dirZ * speed;
    p.facing = Math.atan2(dirX, dirZ);
    p.radius = opts.radius;
    p.life = opts.life;
    p.damage = opts.damage;
    p.crit = opts.crit;
    p.critDmg = opts.critDmg;
    p.knock = opts.knock;
    p.element = opts.element;
    p.pierce = opts.pierce;
    p.visualIndex = opts.visualIndex | 0;
    p.hitMask.clear();
    return p;
  }

  despawn(p) { this.pool.despawn(p); }
  despawnAll() { this.pool.despawnAll(); }

  update(dt, arenaRadius) {
    const lim2 = arenaRadius * arenaRadius;
    for (let i = 0; i < this.cap; i++) {
      const p = this.list[i];
      if (!p.active) continue;

      p.px = p.x; p.pz = p.z;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.life -= dt;

      // 寿命切れ or 場外で回収
      if (p.life <= 0 || p.x * p.x + p.z * p.z > lim2) this.despawn(p);
    }
  }
}
