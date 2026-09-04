/**
 * ステージ進行と敵の湧き。
 *
 * ★湧く敵・密度・難度・ボスの出現時刻はすべて data/stages.js に書いてある。
 *   ステージを増やす＝データを1件足すだけ。ここのコードは触らない。
 *
 * クリア条件：duration 秒を生き延びる。boss があればボス撃破が必須。
 */
import { BALANCE } from '../data/balance.js';
import { ENEMY_BY_ID } from '../data/enemies.js';
import { STAGES, STAGE_BY_ID, TIME_SCALING } from '../data/stages.js';

export const STAGE_RESULT = { RUNNING: 'running', CLEAR: 'clear' };

export class SpawnDirector {
  constructor({ enemies, rng, arenaRadius, onBossSpawn }) {
    this.enemies = enemies;
    this.rng = rng;
    this.arenaRadius = arenaRadius;
    this.onBossSpawn = onBossSpawn || (() => {});

    this.stage = STAGES[0];
    this.elapsed = 0;
    this._budget = 0;
    this._wave = null;
    this._waveIndex = -1;
    this._bossSpawned = false;
    this.bossAlive = false;
    this.timeUp = false;
    this.cleared = false;

    this.reset();
  }

  /** @param {number} stageId */
  setStage(stageId) {
    this.stage = STAGE_BY_ID.get(stageId) || STAGES[0];
    this.reset();
  }

  reset() {
    this.elapsed = 0;
    this._budget = 0;
    this._waveIndex = -1;
    this._wave = null;
    this._bossSpawned = false;
    this.bossAlive = false;
    this.timeUp = false;
    this.cleared = false;
    this._selectWave();
  }

  get duration() { return this.stage.duration; }
  get remaining() { return Math.max(0, this.stage.duration - this.elapsed); }
  get hasBoss() { return !!this.stage.boss; }

  /** ステージ倍率 × 経過時間の倍率。 */
  get hpMul() { return this.stage.scaling.hp * (1 + TIME_SCALING.hpPerSec * this.elapsed); }
  get atkMul() { return this.stage.scaling.atk * (1 + TIME_SCALING.atkPerSec * this.elapsed); }

  /** 経過時間に対応するウェーブを選ぶ。変わったときだけ抽選表を作り直す。 */
  _selectWave() {
    const waves = this.stage.waves;
    let idx = 0;
    for (let i = 0; i < waves.length; i++) if (this.elapsed >= waves[i].at) idx = i;
    if (idx === this._waveIndex) return;

    this._waveIndex = idx;
    const w = waves[idx];
    let sum = 0;
    const table = [];
    for (const [id, weight] of w.spawn) {
      if (!ENEMY_BY_ID.has(id)) { console.warn(`未知の敵ID: ${id}`); continue; }
      table.push({ id, weight });
      sum += weight;
    }
    this._wave = { ...w, table, weightSum: sum };
  }

  /**
   * @returns {string} STAGE_RESULT
   */
  tick(dt, player) {
    if (this.cleared) return STAGE_RESULT.CLEAR;

    this.elapsed += dt;
    this._selectWave();

    // ボスの出現
    const boss = this.stage.boss;
    if (boss && !this._bossSpawned && this.elapsed >= boss.at) {
      // ★プールが満杯だとボスが湧けない。湧けなければステージは永遠にクリアできないので、
      //   一番遠い雑魚を1体片付けて必ず場所を空ける。
      if (this.enemies.pool.free === 0) this._makeRoomForBoss(player);

      const e = this.spawnAt(boss.id, player.x, player.z + 16);
      if (e) {
        // ★湧けたときだけフラグを立てる。失敗したまま立てると二度と出現しない
        this._bossSpawned = true;
        this.bossAlive = true;
        this.onBossSpawn(e);
      }
    }

    if (this.elapsed >= this.stage.duration) this.timeUp = true;

    // クリア判定：時間経過＋（ボスがいるなら）撃破
    if (this.timeUp && (!boss || (this._bossSpawned && !this.bossAlive))) {
      this.cleared = true;
      return STAGE_RESULT.CLEAR;
    }

    // 通常の湧き。上限に達していたら止める
    const w = this._wave;
    if (w && this.enemies.count < w.cap) {
      this._budget += w.rate * dt;
      while (this._budget >= 1) {
        this._budget -= 1;
        if (this.enemies.count >= w.cap) { this._budget = 0; break; }
        if (!this._spawnOne(player)) break;
      }
    } else {
      this._budget = 0;
    }

    return STAGE_RESULT.RUNNING;
  }

  /** ボスが倒されたときに Game から呼ぶ。 */
  notifyBossDefeated() { this.bossAlive = false; }

  /** 自機から最も遠い雑魚を1体消して、ボスのスロットを空ける。 */
  _makeRoomForBoss(player) {
    let far = null, farD = -1;
    for (let i = 0; i < this.enemies.cap; i++) {
      const e = this.enemies.list[i];
      if (!e.active || e.isBoss) continue;
      const d = (e.x - player.x) ** 2 + (e.z - player.z) ** 2;
      if (d > farD) { farD = d; far = e; }
    }
    if (far) this.enemies.despawn(far);
  }

  /**
   * 指定した位置に1体湧かせる。
   * ウェーブの決め打ち配置・取り巻きの召喚・負荷試験で使う。
   */
  spawnAt(id, x, z) {
    const arch = ENEMY_BY_ID.get(id);
    if (!arch) { console.warn(`未知の敵ID: ${id}`); return null; }

    // アリーナ外に湧かせない
    const lim = this.arenaRadius - 1.5;
    const d2 = x * x + z * z;
    if (d2 > lim * lim) {
      const d = Math.sqrt(d2) || 1;
      x = (x / d) * lim;
      z = (z / d) * lim;
    }
    return this.enemies.spawn(arch, x, z, this.hpMul, this.atkMul);
  }

  /**
   * 自機を囲むリング上にまとめて湧かせる。
   * @param {number} [dist] 半径。省略時は通常の湧き距離
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

  _pickId() {
    const w = this._wave;
    if (!w || w.weightSum <= 0) return null;
    let r = this.rng.next() * w.weightSum;
    for (const t of w.table) { r -= t.weight; if (r <= 0) return t.id; }
    return w.table[0].id;
  }

  _spawnRing(player, dist, ang) {
    const id = this._pickId();
    if (!id) return false;
    return this.spawnAt(id, player.x + Math.sin(ang) * dist, player.z + Math.cos(ang) * dist) !== null;
  }

  _spawnOne(player) {
    const id = this._pickId();
    if (!id) return true;

    const s = BALANCE.spawn;
    // ★自機の周りのリング上に湧かせる。画面内に湧くと理不尽なので最小距離を切る
    const ang = this.rng.range(0, Math.PI * 2);
    const dist = this.rng.range(s.minDist, s.maxDist);
    return this.spawnAt(id, player.x + Math.sin(ang) * dist, player.z + Math.cos(ang) * dist) !== null;
  }
}
