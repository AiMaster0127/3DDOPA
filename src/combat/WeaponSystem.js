/**
 * 自機の攻撃。
 *
 * 装備中の武器データ（data/weapons.js）を読んで、クールダウン管理と
 * 攻撃の実行だけを行う。武器が増えても、attack.kind の分岐を1つ足すだけで済む。
 */
import { WEAPON_BY_ID, STARTER_WEAPON } from '../data/weapons.js';

export class WeaponSystem {
  constructor({ projectiles, combat, autoAim }) {
    this.projectiles = projectiles;
    this.combat = combat;
    this.autoAim = autoAim;

    this.weapon = null;
    this.level = 1;              // 武器レベル（フェーズ4の強化で使う）
    this.limitBreak = 0;         // 限界突破段階（同上）
    this.cooldown = 0;

    this.equip(STARTER_WEAPON);
  }

  equip(id) {
    const w = WEAPON_BY_ID.get(id);
    if (!w) { console.warn(`未知の武器ID: ${id}`); return false; }
    this.weapon = w;
    this.cooldown = 0;
    return true;
  }

  reset() { this.cooldown = 0; }

  /** 武器レベル・限界突破・キャラ倍率を乗せた最終攻撃力。 */
  effectiveAtk(player) {
    const w = this.weapon;
    const base = w.base.atk + w.growth.atk * (this.level - 1);
    return base * (1 + 0.08 * this.limitBreak) * (1 + player.stats.atkPct);
  }

  get range() { return this.weapon.base.range; }

  /**
   * @param {number} dt
   * @param {object} player
   * @param {?object} target オートエイムが選んだ敵。null なら攻撃しない
   */
  update(dt, player, target) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (player.dead || !target || this.cooldown > 0) return false;

    const w = this.weapon;
    // 攻撃速度の成長（sk_haste）はここで効く
    this.cooldown = 1 / (w.base.rate * (1 + player.stats.rateAdd));

    const atk = this.effectiveAtk(player);
    const crit = w.base.crit + player.stats.critAdd;
    const critDmg = w.base.critDmg;

    if (w.attack.kind === 'melee_arc') {
      player.swing = w.attack.life;
      player.swingDur = w.attack.life;
      this.combat.resolveMeleeArc(player, w, atk, crit, critDmg, w.element);
      return true;
    }

    if (w.attack.kind === 'projectile') {
      this._fireProjectiles(player, target, atk, crit, critDmg);
      return true;
    }

    console.warn(`未実装の attack.kind: ${w.attack.kind}`);
    return false;
  }

  _fireProjectiles(player, target, atk, crit, critDmg) {
    const w = this.weapon;
    const a = w.attack;

    // 狙点は敵の中心。弾速有限だが、雑魚相手に偏差射撃までは要らない
    let dx = target.x - player.x, dz = target.z - player.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d; dz /= d;

    // count が複数なら扇状にばらす
    const spread = a.count > 1 ? (a.arcDeg || 20) * Math.PI / 180 : 0;
    const base = Math.atan2(dx, dz);

    for (let i = 0; i < a.count; i++) {
      const t = a.count > 1 ? i / (a.count - 1) - 0.5 : 0;
      const ang = base + t * spread;
      this.projectiles.spawn(
        player.x, player.z,
        Math.sin(ang), Math.cos(ang), a.speed,
        {
          radius: a.radius, life: a.life,
          damage: atk, crit, critDmg, knock: w.base.knock,
          element: w.element, pierce: a.pierce, visualIndex: 0,
        }
      );
    }
  }
}
