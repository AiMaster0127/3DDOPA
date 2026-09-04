/**
 * オートエイム。
 *
 * スマホで親指1本で遊べるようにするための必須機能。
 * 「一番近い敵」を毎フレーム選び直すと、敵が並んだときに照準が細かく往復して
 * 画面が酔うので、一度選んだ相手には少しの間だけ張り付く。
 */
import { BALANCE } from '../data/balance.js';

const STICK_TIME = 0.35;     // ターゲットを維持する秒数
const FACING_PENALTY = 2.2;  // 背後の敵を選びにくくする重み（距離換算）

export class AutoAim {
  /**
   * @param {import('./Collision.js').SpatialGrid} grid
   * @param {import('../entities/Enemy.js').EnemyPool} enemies
   */
  constructor(grid, enemies) {
    this.grid = grid;
    this.enemies = enemies;
    this.target = null;
    this._hold = 0;
  }

  reset() { this.target = null; this._hold = 0; }

  /**
   * @param {number} range 武器の射程
   * @returns {object|null} 狙うべき敵
   */
  pick(player, range, dt) {
    this._hold -= dt;

    // 現在のターゲットが生きていて射程内なら維持する
    const t = this.target;
    if (t && t.active && !t.dead && this._hold > 0) {
      const dx = t.x - player.x, dz = t.z - player.z;
      const reach = range + t.radius;
      if (dx * dx + dz * dz <= reach * reach) return t;
    }

    const list = this.enemies.list;
    const n = this.grid.query(player.x, player.z, range + 1.2);
    const res = this.grid.result;

    let best = null, bestScore = Infinity;
    for (let k = 0; k < n; k++) {
      const e = list[res[k]];
      if (!e.active || e.dead) continue;

      const dx = e.x - player.x, dz = e.z - player.z;
      const reach = range + e.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 > reach * reach) continue;

      const d = Math.sqrt(d2);
      // 正面(1) → 背後(-1)。背後ほどスコアを悪くする
      const dot = d > 0 ? (dx * player.dirX + dz * player.dirZ) / d : 1;
      const score = d + (1 - dot) * FACING_PENALTY;

      if (score < bestScore) { bestScore = score; best = e; }
    }

    if (best) { this.target = best; this._hold = STICK_TIME; }
    else { this.target = null; }
    return best;
  }
}
