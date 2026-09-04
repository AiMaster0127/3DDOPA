/**
 * 敵の湧き制御。
 *
 * フェーズ2は「時間経過で密度と強さが上がる連続湧き」。
 * ステージ制・ウェーブ・ボスはフェーズ5でこのクラスを拡張する。
 *
 * ★湧く敵の種類も解禁時刻も data/balance.js の spawn.unlocks に書いてある。
 *   敵を増やす＝データを1行足すだけ。
 */
import { BALANCE } from '../data/balance.js';
import { ENEMY_BY_ID } from '../data/enemies.js';

export class SpawnDirector {
  constructor({ enemies, rng, arenaRadius }) {
    this.enemies = enemies;
    this.rng = rng;
    this.arenaRadius = arenaRadius;

    this.elapsed = 0;
    this._budget = 0;        // 端数を持ち越して、湧き数がfpsに依存しないようにする
    this._table = [];        // 解禁済みの敵（重み付き）
    this._weightSum = 0;

    this.reset();
  }

  reset() {
    this.elapsed = 0;
    this._budget = 0;
    this._rebuildTable();
  }

  /** 経過時間で解禁された敵だけを抽選表に載せ直す。 */
  _rebuildTable() {
    this._table.length = 0;
    this._weightSum = 0;
    for (const u of BALANCE.spawn.unlocks) {
      if (this.elapsed < u.at) continue;
      const arch = ENEMY_BY_ID.get(u.id);
      if (!arch) { console.warn(`未知の敵ID: ${u.id}`); continue; }
      this._table.push(u);
      this._weightSum += u.weight;
    }
  }

  get hpMul()  { return 1 + BALANCE.spawn.hpRamp * this.elapsed; }
  get atkMul() { return 1 + BALANCE.spawn.atkRamp * this.elapsed; }

  tick(dt, player) {
    const s = BALANCE.spawn;
    const before = this._table.length;
    this.elapsed += dt;

    // 解禁は秒単位で変わるので、毎フレームではなく変化しうるときだけ組み直す
    this._rebuildTable();
    if (this._table.length !== before && before > 0) {
      // 新種の解禁。演出フックはフェーズ7で足す
    }

    const rate = Math.min(s.startRate + s.rampPerSec * this.elapsed, s.maxRate);
    this._budget += rate * dt;

    while (this._budget >= 1) {
      this._budget -= 1;
      if (!this._spawnOne(player)) break;     // プール満杯なら以降も無駄なので抜ける
    }
  }

  /**
   * 指定した位置に1体湧かせる。
   * ウェーブの決め打ち配置（フェーズ5）と負荷試験で使う。
   * @param {string} id data/enemies.js の敵ID
   */
  spawnAt(id, x, z) {
    const arch = ENEMY_BY_ID.get(id);
    if (!arch) { console.warn(`未知の敵ID: ${id}`); return null; }
    return this.enemies.spawn(arch, x, z, this.hpMul, this.atkMul);
  }

  /**
   * 自機を囲むリング上にまとめて湧かせる。
   * @param {number} n
   * @param {number} [dist] 半径。省略時は通常の湧き距離
   * @returns {number} 実際に湧いた数（プール上限で足りなければ少なくなる）
   */
  spawnBurst(n, player, dist) {
    let spawned = 0;
    for (let i = 0; i < n; i++) {
      const ok = dist === undefined
        ? this._spawnOne(player)
        : this._spawnRing(player, dist, (i / n) * Math.PI * 2);
      if (!ok) break;
      spawned++;
    }
    return spawned;
  }

  _spawnRing(player, dist, ang) {
    if (this._weightSum <= 0) return false;
    let r = this.rng.next() * this._weightSum;
    let pick = this._table[0];
    for (const u of this._table) { r -= u.weight; if (r <= 0) { pick = u; break; } }
    return this.spawnAt(pick.id, player.x + Math.sin(ang) * dist, player.z + Math.cos(ang) * dist) !== null;
  }

  _spawnOne(player) {
    if (this._weightSum <= 0) return true;

    // 重み付き抽選
    let r = this.rng.next() * this._weightSum;
    let pick = this._table[0];
    for (const u of this._table) { r -= u.weight; if (r <= 0) { pick = u; break; } }

    const s = BALANCE.spawn;
    const arch = ENEMY_BY_ID.get(pick.id);

    // ★自機の周りのリング上に湧かせる。画面内に湧くと理不尽なので最小距離を切る
    const ang = this.rng.range(0, Math.PI * 2);
    const dist = this.rng.range(s.minDist, s.maxDist);
    let x = player.x + Math.sin(ang) * dist;
    let z = player.z + Math.cos(ang) * dist;

    // アリーナ外にはみ出したら内側へ折り返す
    const lim = this.arenaRadius - 1.5;
    const d2 = x * x + z * z;
    if (d2 > lim * lim) {
      const d = Math.sqrt(d2);
      x = (x / d) * lim;
      z = (z / d) * lim;
    }

    return this.enemies.spawn(arch, x, z, this.hpMul, this.atkMul) !== null;
  }
}
