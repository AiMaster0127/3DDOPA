/**
 * 敵の論理。★three.js を import しない。
 *
 * 描画は scene/InstanceLayer.js が毎フレーム読み取って InstancedMesh に流す。
 */
import { Pool } from '../core/Pool.js';
import { BALANCE } from '../data/balance.js';
import { ENEMIES } from '../data/enemies.js';
import { AI } from '../combat/EnemyAI.js';

/** プール1スロット分。★フィールドはここで全部作りきる（隠しクラスを固定する） */
function makeEnemy() {
  return {
    active: false, slot: -1,
    arch: null,          // ENEMIES の要素への参照
    archIndex: 0,        // InstancedMesh の添字

    x: 0, z: 0, px: 0, pz: 0,
    vx: 0, vz: 0,        // AIによる移動速度
    kx: 0, kz: 0,        // ノックバック速度（別に持って減衰させる）
    facing: 0, pFacing: 0,

    hp: 0, maxHp: 0,
    atk: 0, speed: 0, radius: 0.5,

    flash: 0,            // 被弾フラッシュ（1→0）
    contactCd: 0,        // 接触ダメージのクールダウン

    // 状態異常（武器の特殊効果）
    burnT: 0, burnDps: 0,      // 継続ダメージ
    slowT: 0, slowMul: 0,      // 減速（0.4 = 40%遅く）
    tickAcc: 0,                // 継続ダメージの端数
    aiTimer: 0,          // AIごとの自由な位相
    aiSide: 1,           // 回り込み方向
    aiState: 0,          // 0=通常 1=溜め 2=突進 …（AIごとに意味が違う）
    aiT: 0,              // 現在の状態の残り秒数
    aiCd: 0,             // 次の行動までのクールダウン
    dashX: 0, dashZ: 0,  // 突進の固定方向（溜め終わりに確定する）

    isBoss: false,
    phase: 0,            // ボスのフェーズ番号
    shootCd: 0,
    summonCd: 0,
    dead: false,
  };
}

export class EnemyPool {
  constructor() {
    this.pool = new Pool(BALANCE.pools.enemies, makeEnemy);
    this.list = this.pool.list;
    this.cap = this.pool.cap;

    /**
     * AIが外の世界に働きかけるための口。Game が中身を差し込む。
     * ★ここを介させることで、AIから three.js にも戦闘システムにも直接触らせない。
     */
    this.ctx = {
      fire: () => {},      // (e, dirX, dirZ, shoot) 敵弾を撃つ
      summon: () => {},    // (e, id, count)         取り巻きを呼ぶ
      slam: () => {},      // (e, radius, dmg)       周囲を叩きつける
    };
  }

  /** 生きているボスを1体返す（いなければ null）。HUDのボスHPバーが使う。 */
  findBoss() {
    for (let i = 0; i < this.cap; i++) {
      const e = this.list[i];
      if (e.active && e.isBoss) return e;
    }
    return null;
  }

  get count() { return this.pool.count; }

  /**
   * @param {object} arch  ENEMIES の要素
   * @param {number} hpMul 経過時間による強化倍率
   * @param {number} atkMul
   */
  spawn(arch, x, z, hpMul = 1, atkMul = 1) {
    const e = this.pool.spawn();
    if (!e) return null;                     // 満杯なら湧きを諦める（落とさない方が大事）

    e.arch = arch;
    e.archIndex = arch.index;
    e.x = e.px = x;
    e.z = e.pz = z;
    e.vx = e.vz = e.kx = e.kz = 0;
    e.facing = e.pFacing = 0;
    e.maxHp = e.hp = arch.hp * hpMul;
    e.atk = arch.atk * atkMul;
    e.speed = arch.speed;
    e.radius = arch.radius;
    e.flash = 0;
    e.contactCd = 0;
    e.burnT = 0; e.burnDps = 0;
    e.slowT = 0; e.slowMul = 0;
    e.tickAcc = 0;
    e.aiTimer = Math.random() * 6.28;
    e.aiSide = Math.random() < 0.5 ? -1 : 1;
    e.aiState = 0; e.aiT = 0; e.aiCd = Math.random() * 1.2;
    e.dashX = 0; e.dashZ = 0;
    e.isBoss = !!arch.boss;
    e.phase = 0;
    e.shootCd = arch.shoot ? arch.shoot.cd * (0.4 + Math.random() * 0.6) : 0;
    e.summonCd = arch.summon ? arch.summon.cd * 0.5 : 0;
    e.dead = false;
    return e;
  }

  despawn(e) { this.pool.despawn(e); }
  despawnAll() { this.pool.despawnAll(); }

  /**
   * AI・移動・ノックバック・各種タイマーの更新。
   *
   * @param {number} frame  フレーム番号。AIを間引くために使う
   */
  update(dt, player, arenaRadius, frame) {
    const c = BALANCE.combat;
    const kDecay = Math.exp(-c.knockDecay * dt);
    const lim = arenaRadius;

    for (let i = 0; i < this.cap; i++) {
      const e = this.list[i];
      if (!e.active) continue;

      e.px = e.x; e.pz = e.z;
      e.pFacing = e.facing;

      // ★AIは4フレームに1回。添字でずらして、同じフレームに集中させない。
      //   ただしボスは見せ場なので毎フレーム動かす（数が少ないので負荷にならない）
      if (e.isBoss) AI[e.arch.ai](e, player, dt, this.ctx);
      else if (((i + frame) & 3) === 0) AI[e.arch.ai](e, player, dt * 4, this.ctx);

      e.aiTimer += dt;
      if (e.aiT > 0) e.aiT -= dt;
      if (e.aiCd > 0) e.aiCd -= dt;
      if (e.shootCd > 0) e.shootCd -= dt;
      if (e.summonCd > 0) e.summonCd -= dt;

      // 移動 = AI速度（減速を掛ける）+ ノックバック（減速の影響を受けない）
      const slow = e.slowT > 0 ? 1 - e.slowMul : 1;
      e.x += (e.vx * slow + e.kx) * dt;
      e.z += (e.vz * slow + e.kz) * dt;
      e.kx *= kDecay; e.kz *= kDecay;

      if (e.slowT > 0) e.slowT -= dt;

      // 向きは移動方向。止まっているときは前の向きを保つ
      if (e.vx || e.vz) e.facing = Math.atan2(e.vx, e.vz);

      // アリーナ外へ出さない
      const d2 = e.x * e.x + e.z * e.z;
      if (d2 > lim * lim) {
        const d = Math.sqrt(d2) || 1;
        e.x = (e.x / d) * lim;
        e.z = (e.z / d) * lim;
      }

      if (e.flash > 0) e.flash -= dt / c.hitFlash;
      if (e.contactCd > 0) e.contactCd -= dt;
    }
  }
}
