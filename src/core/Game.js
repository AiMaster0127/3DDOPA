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

import { SpatialGrid } from '../combat/Collision.js';
import { CombatSystem } from '../combat/CombatSystem.js';
import { AutoAim } from '../combat/AutoAim.js';
import { WeaponSystem } from '../combat/WeaponSystem.js';
import { SpawnDirector } from '../combat/SpawnDirector.js';

import { Input } from '../ui/Input.js';
import { Hud } from '../ui/Hud.js';
import { Screens } from '../ui/Screens.js';

export const STATE = { PLAYING: 'playing', DEAD: 'dead' };

export class Game {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    // ★antialias は renderer 生成時にしか決められないため、実測より先に推定する
    const initialTier = Quality.detect();

    this.events = new Events();
    this.rng = new RNG();

    // ---- 描画 ----
    this.scene = new SceneManager(canvas, TIERS[initialTier].aa);
    this.arena = new Arena(this.scene.scene);
    this.playerView = new PlayerView(this.scene.scene);
    this.cameraRig = new CameraRig(this.scene.camera);

    // ---- 論理（three.js を知らない層） ----
    this.player = new Player();
    this.enemies = new EnemyPool();
    this.projectiles = new ProjectilePool();

    // グリッドはアリーナより少し広く取る（境界の敵が端セルに集中しないように）
    this.grid = new SpatialGrid(this.arena.radius + 6, 4, this.enemies.cap);

    this.combat = new CombatSystem({
      grid: this.grid, enemies: this.enemies, projectiles: this.projectiles,
      events: this.events, rng: this.rng,
    });
    this.autoAim = new AutoAim(this.grid, this.enemies);
    this.weapons = new WeaponSystem({
      projectiles: this.projectiles, combat: this.combat, autoAim: this.autoAim,
    });
    this.spawner = new SpawnDirector({
      enemies: this.enemies, rng: this.rng, arenaRadius: this.arena.radius,
    });

    // 論理と描画をつなぐ層
    this.instances = new InstanceLayer(this.scene.scene, this.enemies, this.projectiles);

    // ---- UI ----
    this.input = new Input(canvas, {
      root: document.getElementById('stick'),
      knob: document.getElementById('stickKnob'),
    });
    this.hud = new Hud();
    this.screens = new Screens(() => this.startRun());

    // 品質が変わったら描画側にまとめて反映する
    this.quality = new Quality((tier) => {
      this.scene.applyQuality(tier);
      this.playerView.applyQuality(tier);
      this.instances.applyQuality(tier);
    }, initialTier);

    this.state = STATE.PLAYING;
    this.frame = 0;
    this.elapsed = 0;

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

    this.events.on(EV.PLAYER_DIED, () => {
      this.state = STATE.DEAD;
      this.cameraRig.shake(1.2);
      this.screens.showGameOver({
        elapsed: this.elapsed, kills: this.combat.kills, damage: this.combat.damageDealt,
      });
    });
  }

  start() {
    this.hud.show();
    this.startRun();
    this.loop.start();
  }

  /** ラン（1回の挑戦）を初期化する。死亡後の再挑戦もここを通る。 */
  startRun() {
    this.state = STATE.PLAYING;
    this.elapsed = 0;
    this.frame = 0;

    this.player.reset();
    this.enemies.despawnAll();
    this.projectiles.despawnAll();
    this.grid.clear();

    this.combat.reset();
    this.spawner.reset();
    this.autoAim.reset();
    this.weapons.reset();
    this.cameraRig.reset();

    this.events.emit(EV.RUN_STARTED);
  }

  /** 装備変更。見た目と斬撃範囲も一緒に切り替える（フェーズ4のUIから呼ぶ）。 */
  equip(weaponId) {
    if (!this.weapons.equip(weaponId)) return false;
    this.playerView.setWeapon(this.weapons.weapon);
    this.autoAim.reset();
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

    // 7. 湧き
    this.spawner.tick(dt, this.player);
  }

  /** 毎フレームの描画。alpha は前フレームからの補間係数。 */
  render(alpha, dt) {
    this.playerView.sync(this.player, alpha, dt);
    this.instances.sync(alpha);
    this.cameraRig.follow(this.player, dt);
    this.scene.syncShadow(this.player.x, this.player.z);

    this.scene.render();

    this.quality.sample(dt);
    this.hud.syncHp(this.player.hp, this.player.maxHp);
    this.hud.syncRun(this.elapsed, this.combat.kills);
    this.hud.syncDebug(dt, this.quality.name, this.scene.drawCalls, this.enemies.count);
    if (this.input.isActive) this.hud.dismissHint();
  }
}
