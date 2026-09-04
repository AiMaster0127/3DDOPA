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
import { BossView } from '../scene/BossView.js';
import { Sparks } from '../scene/vfx/Sparks.js';
import { DamageNumbers } from '../scene/vfx/DamageNumbers.js';
import { ScreenFx } from '../scene/vfx/ScreenFx.js';
import { AudioSystem } from '../audio/AudioSystem.js';

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
import { SpawnDirector, STAGE_RESULT } from '../combat/SpawnDirector.js';

import { Input } from '../ui/Input.js';
import { Hud } from '../ui/Hud.js';
import { Screens } from '../ui/Screens.js';
import { LevelUpUI } from '../ui/LevelUpUI.js';
import { HomeUI } from '../ui/HomeUI.js';
import { GachaUI } from '../ui/GachaUI.js';
import { InventoryUI } from '../ui/InventoryUI.js';
import { StageUI } from '../ui/StageUI.js';
import { MetaUI } from '../ui/MetaUI.js';

import { SKILL_BY_ID } from '../data/skills.js';
import { validateGacha } from '../data/gacha.js';
import { STAGE_BY_ID, STAGES } from '../data/stages.js';
import { RARITY_COLOR } from '../data/gacha.js';
import { shareText, buildLine } from '../ui/share.js';

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
    // 実績の達成通知はUI生成後に届くので、参照を遅延させる
    this.meta = new MetaSystem(this.save, (a) => this.metaUI?.toast(a));
    this.inventory = new Inventory(this.save);
    this.inventory.dustBonus = () => this.meta.dustBonus;
    this.gacha = new GachaSystem({
      save: this.save, inventory: this.inventory, rng: this.rng, meta: this.meta,
    });

    // ---- 描画 ----
    this.scene = new SceneManager(canvas, TIERS[initialTier].aa);
    this.arena = new Arena(this.scene.scene);
    this.playerView = new PlayerView(this.scene.scene);
    this.bossView = new BossView(this.scene.scene);
    this.cameraRig = new CameraRig(this.scene.camera);

    // ---- 演出 ----
    this.sparks = new Sparks(this.scene.scene);
    this.damageNumbers = new DamageNumbers();
    this.screenFx = new ScreenFx();
    this.audio = new AudioSystem(this.save.data.settings);

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
      onBossSpawn: (e) => this._onBossSpawn(e),
    });

    // ★AIから外の世界へ働きかける唯一の口。
    //   ここを介させることで、AI は three.js にも戦闘システムにも直接触らない。
    this.enemies.ctx.fire = (e, dx, dz, shoot) => this._enemyFire(e, dx, dz, shoot);
    this.enemies.ctx.summon = (e, id, count) => this._enemySummon(e, id, count);
    this.enemies.ctx.slam = (e, radius, dmg) =>
      this.combat.enemySlam(e, radius, dmg * this.spawner.atkMul, this.player);

    // ---- 成長 ----
    this.skills = new SkillSystem({
      player: this.player, combat: this.combat, enemies: this.enemies,
      grid: this.grid, rng: this.rng, metaBonus: () => this.meta.bonus(),
    });
    this.levels = new LevelSystem({
      player: this.player, skills: this.skills, events: this.events,
      startLevel: () => this.meta.startLevel,
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
      onPhase: (phase, info) => {
        this.gachaUI.onPhase(phase, info);
        this._gachaFx(phase, info);
      },
    });
    this.homeUI = new HomeUI({
      inventory: this.inventory, save: this.save, meta: this.meta, audio: this.audio,
      onSortie: () => this.startRun(),
      onGacha: () => { this.homeUI.hide(); this.gachaUI.show(); },
      onInventory: () => { this.homeUI.hide(); this.inventoryUI.show(); },
      onStages: () => { this.homeUI.hide(); this.stageUI.show(); },
      onUpgrade: () => { this.homeUI.hide(); this.metaUI.showUpgrades(); },
      onAchievements: () => { this.homeUI.hide(); this.metaUI.showAchievements(); },
    });
    this.gachaUI = new GachaUI({
      gacha: this.gacha, director: this.gachaDirector,
      onBack: () => { this.gachaUI.hide(); this.homeUI.show(); },
      onClosed: () => { this.meta.checkAchievements(); this.homeUI.refresh(); },
    });
    this.inventoryUI = new InventoryUI({
      inventory: this.inventory,
      onEquip: (id) => this.equip(id),
      onBack: () => { this.inventoryUI.hide(); this.homeUI.show(); },
    });
    this.metaUI = new MetaUI({
      meta: this.meta, save: this.save,
      onBack: () => { this.metaUI.hideUpgrades(); this.metaUI.hideAchievements(); this.homeUI.show(); },
      // 強化を買ったら、次のランを待たずにステータスを組み直す
      onChanged: () => { this.skills.recompute(); this.homeUI.refresh(); },
    });
    this.stageUI = new StageUI({
      save: this.save,
      onSelect: (id) => { this.selectStage(id); this.stageUI.hide(); this.homeUI.show(); },
      onBack: () => { this.stageUI.hide(); this.homeUI.show(); },
      onNext: () => this._startNextStage(),
      onHome: () => this.goHome(),
    });

    // 最後に遊んだステージ（未解禁なら遊べる中で一番進んだところ）
    this.stageId = this.save.data.meta.lastStage || 1;
    if (!this.stageUI.isUnlocked(STAGE_BY_ID.get(this.stageId) || STAGES[0])) {
      this.stageId = this.stageUI.highestUnlocked();
    }
    this.spawner.setStage(this.stageId);

    // 品質が変わったら描画側にまとめて反映する
    this.quality = new Quality((tier) => {
      this.scene.applyQuality(tier);
      this.playerView.applyQuality(tier);
      this.instances.applyQuality(tier);
      this.sparks.applyQuality(tier);
      this.damageNumbers.applyQuality(tier);
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
    this.events.on(EV.PLAYER_HIT, (amount) => {
      this.cameraRig.shake(0.55);
      this.screenFx.hit('#ff2b4d', 0.34, 240);
      this.damageNumbers.push(this.player.x, 2.1, this.player.z, Math.round(amount), false, 1);
      this.audio.playerHit();
    });

    // 命中：数字と火花。手応えの9割はここで決まる
    this.events.on(EV.ENEMY_HIT, (e, amount, isCrit) => {
      this.damageNumbers.push(e.x, e.radius * 2 + 0.4, e.z, amount, isCrit, 0);
      this.sparks.burst(e.x, e.radius + 0.3, e.z, isCrit ? 9 : 4,
                        isCrit ? 0xffd24d : 0xfff0c0, isCrit ? 8 : 5);
      this.audio.hit(isCrit);
    });

    // 倒した位置に経験値ジェムを落とす
    this.events.on(EV.ENEMY_KILLED, (e, arch) => {
      this.pickups.spawn(e.x, e.z, arch.reward.xp);
      this.runGems += arch.reward.gems || 0;
    });

    this.events.on(EV.LEVEL_UP, (lv) => {
      this.cameraRig.shake(0.3);
      this.screenFx.hit('#43e8ff', 0.32, 300);
      this.screenFx.bannerShow(`LEVEL ${lv}`, 'スキルを選べ', 'level', 1100);
      this.sparks.burst(this.player.x, 1.0, this.player.z, 34, 0x43e8ff, 9);
      this.audio.levelUp();
    });

    // ボス撃破。ステージのクリア条件に直結する
    this.events.on(EV.ENEMY_KILLED, (e, arch) => {
      if (e.isBoss) {
        this.spawner.notifyBossDefeated();
        this.bossView.detach();
        this.cameraRig.shake(1.4);
        this.save.data.stats.totalBosses++;

        // ★ボス撃破はクリップの見せ場。全画面で派手にやる
        this.screenFx.hit('#ffffff', 0.85, 420);
        this.screenFx.bannerShow('BOSS DOWN', arch.name, 'boss', 1700);
        this.sparks.burst(e.x, e.radius, e.z, 130, 0xff6a4d, 15);
        this.sparks.burst(e.x, e.radius, e.z, 70, 0xffe08a, 9);
        this.audio.bossDown();
      } else {
        // 撃破の破片。倒した実感がないと手応えが消える
        this.sparks.burst(e.x, e.radius + 0.2, e.z, 10, arch.visual.color, 6);
        this.audio.kill();
      }
      // 分裂する敵は、倒れた位置に欠片を残す
      if (arch.split) {
        for (let i = 0; i < arch.split.count; i++) {
          const a = (i / arch.split.count) * Math.PI * 2;
          this.spawner.spawnAt(arch.split.id, e.x + Math.sin(a) * 1.1, e.z + Math.cos(a) * 1.1);
        }
      }
    });

    this.events.on(EV.PLAYER_DIED, () => {
      this.state = STATE.DEAD;
      this.cameraRig.shake(1.2);
      this.levelUpUI.hide();          // 選択中に死んだ場合に残さない

      // ★ラン終了の精算。ここで永続経験値が入り、即座に保存される
      const res = this.meta.finishRun({
        kills: this.combat.kills, elapsed: this.elapsed,
        runLv: this.levels.level, gems: this.runGems,
      });

      this.screenFx.hit('#ff2b4d', 0.7, 520);
      this.audio.stopBgm();

      this.screens.showGameOver({
        elapsed: this.elapsed, kills: this.combat.kills, damage: this.combat.damageDealt,
        runLv: this.levels.level,
        xpGained: res.xpGained, levelsGained: res.levelsGained, newAccountLv: res.newLevel,
        build: buildLine(this.inventory),
        share: this._shareText(false),
      });
    });
  }

  /**
   * ガチャ演出の音と全画面効果。
   * ★SSRだけは全画面で殴る。ここが動画のオチになる。
   */
  _gachaFx(phase, info) {
    if (phase === 'portent') {
      this.audio.gachaOmen(info.omen);
      if (info.omen === 'rainbow') this.screenFx.hit('#ff6ad5', 0.3, 320);

    } else if (phase === 'reach') {
      this.audio.gachaReach();
      this.screenFx.hit('#ffc24d', 0.22, 260);

    } else if (phase === 'reveal') {
      const r = info.result;
      if (!r) return;
      this.audio.gachaReveal(r.rarity);

      if (r.rarity === 'SSR') {
        this.screenFx.hit('#ffffff', 0.95, 520);
        this.screenFx.bannerShow('SSR', r.weapon.name, 'ssr', 1500);
      } else if (r.rarity === 'SR') {
        this.screenFx.hit(RARITY_COLOR.SR.css, 0.4, 300);
      }
    }
  }

  _onBossSpawn(e) {
    this.bossView.attach(e);
    this.cameraRig.shake(0.9);
    this.screenFx.hit('#ff2b4d', 0.4, 400);
    this.screenFx.bannerShow('WARNING', e.arch.name, 'boss', 1600);
    this.audio.bossSpawn();
  }

  /** 敵が弾を撃つ。味方弾と同じプールを hostile フラグで共用する。 */
  _enemyFire(e, dirX, dirZ, shoot) {
    this.projectiles.spawn(
      e.x + dirX * e.radius, e.z + dirZ * e.radius,
      dirX, dirZ, shoot.speed,
      {
        radius: shoot.radius,
        life: shoot.range / shoot.speed,
        damage: shoot.dmg * this.spawner.atkMul,
        crit: 0, critDmg: 0, knock: 0,
        element: 'none', effects: null,
        hostile: true, pierce: 0, visualIndex: 0,
      }
    );
  }

  /** ボスが取り巻きを呼ぶ。 */
  _enemySummon(e, id, count) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + this.rng.next();
      this.spawner.spawnAt(id, e.x + Math.sin(a) * 4.5, e.z + Math.cos(a) * 4.5);
    }
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

  /** 遊ぶステージを選ぶ。 */
  selectStage(id) {
    this.stageId = id;
    this.save.data.meta.lastStage = id;
    this.save.markDirty();
    this.spawner.setStage(id);
    this.homeUI.setStage(STAGE_BY_ID.get(id));
  }

  /** 拠点へ。ランは止め、HUDを隠す。 */
  goHome() {
    this.state = STATE.HOME;
    this.screens.hideGameOver();
    this.stageUI.hideClear();
    this.stageUI.hide();
    this.metaUI.hideUpgrades();
    this.metaUI.hideAchievements();
    this.levelUpUI.hide();
    this.hud.hide();
    this.bossView.detach();
    this.sparks.clear();
    this.damageNumbers.clear();
    this.screenFx.hideBanner();
    this.audio.stopBgm();

    // 拠点で装備を変えられるので、次の出撃に備えて敵を片付けておく
    this.enemies.despawnAll();
    this.projectiles.despawnAll();
    this.pickups.despawnAll();
    this.grid.clear();

    // 拠点に入るたびに実績を見直す（強化やガチャで条件を満たしている場合がある）
    this.meta.checkAchievements();
    this.homeUI.setStage(STAGE_BY_ID.get(this.stageId));
    this.homeUI.setAchievementProgress(this.metaUI.progressText());
    this.homeUI.show();
  }

  /** ラン（1回の挑戦）を初期化する。死亡後の再挑戦もここを通る。 */
  startRun() {
    this.homeUI.hide();
    this.gachaUI.hide();
    this.inventoryUI.hide();
    this.stageUI.hide();
    this.stageUI.hideClear();
    this.metaUI.hideUpgrades();
    this.metaUI.hideAchievements();
    this.screens.hideGameOver();
    this.hud.show();
    this.bossView.detach();

    this.state = STATE.PLAYING;
    this.elapsed = 0;
    this.frame = 0;

    this.runGems = 0;

    // ★順序が重要。入れ替えると開始レベルぶんのHPが消える。
    //   1. スキルを消す
    //   2. 開始レベルを決める（runLv が入る。HPには触らない）
    //   3. runLv と永続強化からステータスを組み直す
    //   4. そのステータスで maxHp を決める
    //   5. 開始レベルぶんのHPを上乗せする
    this.skills.reset();
    this.levels.reset();
    this.skills.recompute();
    this.player.reset();
    this.levels.applyStartHp();

    this.enemies.despawnAll();
    this.projectiles.despawnAll();
    this.pickups.despawnAll();
    this.grid.clear();

    this.combat.reset();
    this.spawner.setStage(this.stageId);
    this.autoAim.reset();
    this.weapons.reset();
    this.cameraRig.reset();
    this.levelUpUI.hide();
    this.sparks.clear();
    this.damageNumbers.clear();
    this.screenFx.hideBanner();
    if (this.save.data.settings.bgm > 0) this.audio.startBgm();

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
    if (xp > 0) {
      this.audio.pickup();
      if (this.levels.gain(xp)) this._showLevelUp();
    }

    // 9. 敵弾 × 自機
    this.combat.resolveHostileProjectiles(this.player);

    // 10. ステージ進行（湧き・ボス出現・クリア判定）
    if (this.spawner.tick(dt, this.player) === STAGE_RESULT.CLEAR) this._onStageClear();
  }

  /** ステージクリア。報酬・解禁・永続経験値をここで精算する。 */
  _onStageClear() {
    if (this.state !== STATE.PLAYING) return;
    this.state = STATE.DEAD;          // 入力と湧きを止める（死亡と同じ扱いでよい）

    const stage = STAGE_BY_ID.get(this.stageId);
    const meta = this.save.data.meta;
    const first = !meta.clearedStages[this.stageId];

    let gems = stage.reward.gems + this.runGems;
    let firstReward = null;
    if (first) {
      meta.clearedStages[this.stageId] = true;
      firstReward = stage.reward.firstClear;
      if (firstReward) {
        gems += firstReward.gems || 0;
        this.save.data.wallet.tickets += firstReward.tickets || 0;
      }
    }
    this.save.data.stats.bestStage = Math.max(this.save.data.stats.bestStage, this.stageId);

    const res = this.meta.finishRun({
      kills: this.combat.kills, elapsed: this.elapsed,
      runLv: this.levels.level, gems,
    });

    // 次のステージが解禁されたか
    const next = STAGES.find(s => s.unlock === this.stageId);
    const unlocked = first && next ? `${next.id}: ${next.name}` : null;
    this._nextStageId = next && this.stageUI.isUnlocked(next) ? next.id : null;

    this.screenFx.hit('#6ef0c8', 0.6, 500);
    this.screenFx.bannerShow('CLEAR', stage.name, 'clear', 1600);
    this.audio.stopBgm();

    this.stageUI.showClear({
      stage: this.stageId, elapsed: this.elapsed, kills: this.combat.kills,
      runLv: this.levels.level, gems,
      first: firstReward, unlocked, hasNext: !!this._nextStageId,
      build: buildLine(this.inventory),
      share: this._shareText(true),
    });
    void res;
  }

  _shareText(cleared) {
    return shareText({
      cleared, stageId: this.stageId, elapsed: this.elapsed,
      kills: this.combat.kills, runLv: this.levels.level, damage: this.combat.damageDealt,
      inventory: this.inventory, skills: this.skills, save: this.save,
    });
  }

  _startNextStage() {
    if (this._nextStageId) this.selectStage(this._nextStageId);
    this.startRun();
  }

  /** 毎フレームの描画。alpha は前フレームからの補間係数。 */
  render(alpha, dt) {
    // 演出は実時間で進める（論理の固定ステップとは独立でよい）
    if (this.gachaDirector.running) this.gachaDirector.update(dt);

    this.playerView.sync(this.player, alpha, dt);
    this.instances.sync(alpha);

    const boss = this.spawner.bossAlive ? this.enemies.findBoss() : null;
    this.bossView.sync(boss, alpha, dt);

    this.sparks.update(dt);
    this.cameraRig.follow(this.player, dt);
    this.scene.syncShadow(this.player.x, this.player.z);

    this.scene.render();
    this.damageNumbers.update(dt, this.scene.camera);

    this.quality.sample(dt);

    // 拠点にいる間はHUDを更新しない（隠れているのでDOMを触るだけ無駄）
    if (this.state === STATE.HOME) return;

    this.hud.syncHp(this.player.hp, this.player.maxHp);
    this.hud.syncLevel(this.levels.level, this.levels.xp01);
    this.hud.syncSkills(this._skillChips());
    this.hud.syncAccount(this.meta.level);
    this.hud.syncRun(this.spawner.remaining, this.combat.kills, this.stageId);
    this.hud.syncBoss(boss);
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
