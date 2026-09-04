/**
 * ゲーム全体の配線。
 *
 * 各システムを保持し、1フレームの更新順序を1箇所で決める。
 * ここに個別のゲームロジックを書かない（システム側に置く）。
 */
import { Loop } from './Loop.js';
import { Events, EV } from './Events.js';
import { RNG } from './RNG.js';

import { Quality, TIERS } from '../scene/Quality.js';
import { SceneManager } from '../scene/SceneManager.js';
import { CameraRig } from '../scene/CameraRig.js';
import { Arena } from '../scene/Arena.js';
import { PlayerView } from '../scene/PlayerView.js';
import { InstanceLayer } from '../scene/InstanceLayer.js';

import { Player } from '../entities/Player.js';
import { EnemyPool } from '../entities/Enemy.js';
import { ProjectilePool } from '../entities/Projectile.js';
import { PickupPool } from '../entities/Pickup.js';

import { SaveManager } from '../save/SaveManager.js';
import { Inventory } from '../gacha/Inventory.js';
import { GachaSystem } from '../gacha/GachaSystem.js';
import { GachaDirector } from '../gacha/GachaDirector.js';
import { MetaSystem } from '../progression/MetaSystem.js';
import { SkillSystem } from '../progression/SkillSystem.js';
import { LevelSystem } from '../progression/LevelSystem.js';

import { SpatialGrid } from '../combat/Collision.js';
import { CombatSystem } from '../combat/CombatSystem.js';
import { AutoAim } from '../combat/AutoAim.js';
import { WeaponSystem } from '../combat/WeaponSystem.js';
import { SpawnDirector } from '../combat/SpawnDirector.js';

import { Input } from '../ui/Input.js';
import { Hud } from '../ui/Hud.js';
import { Screens } from '../ui/Screens.js';
import { LevelUpUI } from '../ui/LevelUpUI.js';
import { HomeUI } from '../ui/HomeUI.js';
import { GachaUI } from '../ui/GachaUI.js';
import { InventoryUI } from '../ui/InventoryUI.js';

import { SKILL_BY_ID } from '../data/skills.js';
import { validateGacha } from '../data/gacha.js';

export const STATE = {
  HOME: 'home',           // 拠点。ガチャ・装備・出撃
  PLAYING: 'playing',
  LEVELUP: 'levelup',     // スキル3択。update を止める
  DEAD: 'dead',
};

export class Game {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    // ★antialias は renderer 生成時にしか決められないため、実測より先に推定する
    const initialTier = Quality.detect();

    this.events = new Events();
    this.rng = new RNG();

    // ★確率テーブルの自己検証。データを壊したらここで気付ける
    validateGacha();

    // ★セーブは最初に読む。永続強化がステータス計算の土台になる
    this.save = new SaveManager();
    this.meta = new MetaSystem(this.save);
    this.inventory = new Inventory(this.save);
    this.gacha = new GachaSystem({ save: this.save, inventory: this.inventory, rng: this.rng });

    // ---- 描画 ----
    this.scene = new SceneManager(canvas, TIERS[initialTier].aa);
    this.arena = new Arena(this.scene.scene);
    this.playerView = new PlayerView(this.scene.scene);
    this.cameraRig = new CameraRig(this.scene.camera);

    // ---- 論理（three.js を知らない層） ----
    this.player = new Player();
    this.enemies = new EnemyPool();
    this.projectiles = new ProjectilePool();
    this.pickups = new PickupPool();

    // グリッドはアリーナより少し広く取る（境界の敵が端セルに集中しないように）
    this.grid = new SpatialGrid(this.arena.radius + 6, 4, this.enemies.cap);

    this.combat = new CombatSystem({
      grid: this.grid, enemies: this.enemies, projectiles: this.projectiles,
      events: this.events, rng: this.rng,
    });
    this.autoAim = new AutoAim(this.grid, this.enemies);
    this.weapons = new WeaponSystem({
      projectiles: this.projectiles, combat: this.combat, autoAim: this.autoAim,
      inventory: this.inventory,
    });
    this.spawner = new SpawnDirector({
      enemies: this.enemies, rng: this.rng, arenaRadius: this.arena.radius,
    });

    // ---- 成長 ----
    this.skills = new SkillSystem({
      player: this.player, combat: this.combat, enemies: this.enemies,
      grid: this.grid, rng: this.rng, metaBonus: () => this.meta.bonus(),
    });
    this.levels = new LevelSystem({
      player: this.player, skills: this.skills, events: this.events,
    });

    // 論理と描画をつなぐ層
    this.instances = new InstanceLayer(
      this.scene.scene, this.enemies, this.projectiles, this.pickups
    );

    // ---- UI ----
    this.input = new Input(canvas, {
      root: document.getElementById('stick'),
      knob: document.getElementById('stickKnob'),
    });
    this.hud = new Hud();
    this.screens = new Screens(() => this.startRun(), () => this.goHome());
    this.levelUpUI = new LevelUpUI((id) => this._pickSkill(id));

    // ---- 拠点・ガチャ・装備 ----
    this.gachaDirector = new GachaDirector({
      rng: this.rng,
      onPhase: (phase, info) => this.gachaUI.onPhase(phase, info),
    });
    this.homeUI = new HomeUI({
      inventory: this.inventory, save: this.save, meta: this.meta,
      onSortie: () => this.startRun(),
      onGacha: () => { this.homeUI.hide(); this.gachaUI.show(); },
      onInventory: () => { this.homeUI.hide(); this.inventoryUI.show(); },
    });
    this.gachaUI = new GachaUI({
      gacha: this.gacha, director: this.gachaDirector,
      onBack: () => { this.gachaUI.hide(); this.homeUI.show(); },
      onClosed: () => this.homeUI.refresh(),
    });
    this.inventoryUI = new InventoryUI({
      inventory: this.inventory,
      onEquip: (id) => this.equip(id),
      onBack: () => { this.inventoryUI.hide(); this.homeUI.show(); },
    });

    // 品質が変わったら描画側にまとめて反映する
    this.quality = new Quality((tier) => {
      this.scene.applyQuality(tier);
      this.playerView.applyQuality(tier);
      this.instances.applyQuality(tier);
    }, initialTier);

    this.state = STATE.HOME;
    this.frame = 0;
    this.elapsed = 0;
    this.runGems = 0;

    this.playerView.setWeapon(this.weapons.weapon);
    this._wireEvents();

    this.loop = new Loop({
      update: (dt) => this.update(dt),
      render: (alpha, dt) => this.render(alpha, dt),
    });
  }

  _wireEvents() {
    // 被弾は必ず体で判るようにする。数値より画面が揺れる方が速く伝わる
    this.events.on(EV.PLAYER_HIT, () => this.cameraRig.shake(0.55));

    // 倒した位置に経験値ジェムを落とす
    this.events.on(EV.ENEMY_KILLED, (e, arch) => {
      this.pickups.spawn(e.x, e.z, arch.reward.xp);
      this.runGems += arch.reward.gems || 0;
    });

    this.events.on(EV.LEVEL_UP, () => this.cameraRig.shake(0.3));

    this.events.on(EV.PLAYER_DIED, () => {
      this.state = STATE.DEAD;
      this.cameraRig.shake(1.2);
      this.levelUpUI.hide();          // 選択中に死んだ場合に残さない

      // ★ラン終了の精算。ここで永続経験値が入り、即座に保存される
      const res = this.meta.finishRun({
        kills: this.combat.kills, elapsed: this.elapsed,
        runLv: this.levels.level, gems: this.runGems,
      });

      this.screens.showGameOver({
        elapsed: this.elapsed, kills: this.combat.kills, damage: this.combat.damageDealt,
        runLv: this.levels.level,
        xpGained: res.xpGained, levelsGained: res.levelsGained, newAccountLv: res.newLevel,
      });
    });
  }

  /** レベルアップ選択の確定。まだ残っていれば次の選択を出す。 */
  _pickSkill(id) {
    this.skills.take(id);
    const more = this.levels.consume();
    if (more) {
      this._showLevelUp();
    } else {
      this.levelUpUI.hide();
      this.state = STATE.PLAYING;
    }
  }

  _showLevelUp() {
    const choices = this.skills.roll();
    if (choices.length === 0) {
      // 全スキルが上限。選ばせるものが無いので素通しする
      this.levels.pending = 0;
      this.levelUpUI.hide();
      this.state = STATE.PLAYING;
      return;
    }
    this.state = STATE.LEVELUP;
    this.levelUpUI.show(this.levels.level, choices);
  }

  start() {
    this.loop.start();
    this.goHome();
  }

  /** 拠点へ。ランは止め、HUDを隠す。 */
  goHome() {
    this.state = STATE.HOME;
    this.screens.hideGameOver();
    this.levelUpUI.hide();
    this.hud.hide();

    // 拠点で装備を変えられるので、次の出撃に備えて敵を片付けておく
    this.enemies.despawnAll();
    this.projectiles.despawnAll();
    this.pickups.despawnAll();
    this.grid.clear();

    this.homeUI.show();
  }

  /** ラン（1回の挑戦）を初期化する。死亡後の再挑戦もここを通る。 */
  startRun() {
    this.homeUI.hide();
    this.gachaUI.hide();
    this.inventoryUI.hide();
    this.screens.hideGameOver();
    this.hud.show();

    this.state = STATE.PLAYING;
    this.elapsed = 0;
    this.frame = 0;

    this.runGems = 0;

    // ★順序が重要：スキルを消す → ステータスを組み直す → その値でHPを決める
    this.skills.reset();
    this.levels.reset();
    this.skills.recompute();
    this.player.reset();

    this.enemies.despawnAll();
    this.projectiles.despawnAll();
    this.pickups.despawnAll();
    this.grid.clear();

    this.combat.reset();
    this.spawner.reset();
    this.autoAim.reset();
    this.weapons.reset();
    this.cameraRig.reset();
    this.levelUpUI.hide();

    this.events.emit(EV.RUN_STARTED);
  }

  /** 装備変更。インベントリ（＝セーブ）と戦闘と見た目をまとめて切り替える。 */
  equip(weaponId) {
    if (!this.inventory.equip(weaponId)) return false;
    if (!this.weapons.equip(weaponId)) return false;
    this.playerView.setWeapon(this.weapons.weapon);
    this.autoAim.reset();
    this.homeUI.refresh();
    return true;
  }

  /**
   * 固定ステップ（1/60秒）で呼ばれる論理更新。
   *
   * ★順序に意味がある。
   *   敵と弾を動かす → その位置でグリッドを作り直す → 判定する、の順を崩さない。
   *   グリッドを作る前に判定すると1フレーム古い位置で当たることになる。
   */
  update(dt) {
    if (this.state !== STATE.PLAYING) return;

    this.frame++;
    this.elapsed += dt;

    const input = this.input.poll();

    // 1. 敵と弾を動かす
    this.enemies.update(dt, this.player, this.arena.radius, this.frame);
    this.projectiles.update(dt, this.arena.radius);

    // 2. 現在位置で近傍検索の索引を作り直す
    this.grid.rebuild(this.enemies);

    // 3. 敵同士の重なりを解く（2フレームに1回）
    this.combat.separate(this.frame);

    // 4. 狙う相手を決めてから自機を動かす（向きが照準に従うため）
    const target = this.autoAim.pick(this.player, this.weapons.range, dt);
    this.player.update(dt, input, this.arena.radius, target);

    // 5. 攻撃（近接はこの場で判定、射撃は弾を生成）
    this.weapons.update(dt, this.player, target);

    // 6. 判定
    this.combat.resolveProjectiles();
    this.combat.resolveContact(this.player);

    // 7. 状態異常（炎上など）とスキル（アクティブの発動）
    this.combat.tickStatuses(dt);
    this.skills.update(dt);

    // 8. 経験値の回収 → レベルアップ判定
    const xp = this.pickups.update(dt, this.player);
    if (xp > 0 && this.levels.gain(xp)) this._showLevelUp();

    // 9. 湧き
    this.spawner.tick(dt, this.player);
  }

  /** 毎フレームの描画。alpha は前フレームからの補間係数。 */
  render(alpha, dt) {
    // 演出は実時間で進める（論理の固定ステップとは独立でよい）
    if (this.gachaDirector.running) this.gachaDirector.update(dt);

    this.playerView.sync(this.player, alpha, dt);
    this.instances.sync(alpha);
    this.cameraRig.follow(this.player, dt);
    this.scene.syncShadow(this.player.x, this.player.z);

    this.scene.render();

    this.quality.sample(dt);

    // 拠点にいる間はHUDを更新しない（隠れているのでDOMを触るだけ無駄）
    if (this.state === STATE.HOME) return;

    this.hud.syncHp(this.player.hp, this.player.maxHp);
    this.hud.syncLevel(this.levels.level, this.levels.xp01);
    this.hud.syncSkills(this._skillChips());
    this.hud.syncAccount(this.meta.level);
    this.hud.syncRun(this.elapsed, this.combat.kills);
    this.hud.syncDebug(dt, this.quality.name, this.scene.drawCalls, this.enemies.count);
    if (this.input.isActive) this.hud.dismissHint();
  }

  /** HUDのスキルチップ用。中身が変わらなければHUD側でDOM更新を握り潰す。 */
  _skillChips() {
    const out = this._chipBuf || (this._chipBuf = []);
    out.length = 0;
    for (const [id, lv] of this.skills.levels) {
      const sk = SKILL_BY_ID.get(id);
      if (sk) out.push({ icon: sk.icon, lv, name: sk.name });
    }
    return out;
  }
}
