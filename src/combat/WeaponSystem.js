/**
 * 自機の攻撃。
 *
 * 装備中の武器データ（data/weapons.js）を読んで、クールダウン管理と
 * 攻撃の実行だけを行う。武器が増えても、attack.kind の分岐を1つ足すだけで済む。
 */
import { WEAPON_BY_ID, STARTER_WEAPON } from '../data/weapons.js';
import { GACHA } from '../data/gacha.js';

export class WeaponSystem {
  /**
   * @param {object} o
   * @param {import('../gacha/Inventory.js').Inventory} o.inventory
   *   武器レベルと限界突破の実体はインベントリ（＝セーブ）にある。
   *   ここで二重に持つと、強化した直後に戦闘へ反映されない事故が起きる。
   */
  constructor({ projectiles, combat, autoAim, inventory }) {
    this.projectiles = projectiles;
    this.combat = combat;
    this.autoAim = autoAim;
    this.inventory = inventory;

    this.weapon = null;
    this.cooldown = 0;

    this.equip(inventory ? inventory.equippedId : STARTER_WEAPON);
  }

  equip(id) {
    const w = WEAPON_BY_ID.get(id);
    if (!w) { console.warn(`未知の武器ID: ${id}`); return false; }
    this.weapon = w;
    this.cooldown = 0;
    return true;
  }

  reset() {
    // 拠点で装備を変えていた場合に備え、ラン開始時に読み直す
    if (this.inventory) this.equip(this.inventory.equippedId);
    this.cooldown = 0;
  }

  /** 所持データ（強化レベル・限界突破）。未所持なら素の状態として扱う。 */
  get own() {
    return (this.inventory && this.inventory.entry(this.weapon.id)) || { lv: 1, lb: 0 };
  }

  /**
   * 武器レベル・限界突破・キャラ倍率を乗せた最終攻撃力。
   * ★Inventory.atkOf と同じ式にすること（UIの表示と実戦力がズレないように）。
   */
  effectiveAtk(player) {
    const w = this.weapon;
    const own = this.own;
    const base = w.base.atk + w.growth.atk * (own.lv - 1);

    // ★キャラクターの得手不得手。近接と射撃で別々に乗る。
    //   ★|| 0 は保険。stats に欠けがあると NaN が伝播して
    //     「敵が絶対に死なない」という原因の追いにくい壊れ方をする。
    const kindBonus = (w.attack.kind === 'melee_arc'
      ? player.stats.meleeAtkPct
      : player.stats.rangedAtkPct) || 0;

    return base
      * (1 + GACHA.limitBreak.atkPerLB * own.lb)
      * (1 + (player.stats.atkPct || 0) + kindBonus);
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
          element: w.element, effects: w.effects,
          pierce: a.pierce, visualIndex: 0,
        }
      );
    }
  }
}
