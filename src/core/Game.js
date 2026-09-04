/**
 * ゲーム全体の配線。
 *
 * 各システムを保持し、1フレームの更新順序を1箇所で決める。
 * ここに個別のゲームロジックを書かない（システム側に置く）。
 */
import { Loop } from './Loop.js';
import { Quality, TIERS } from '../scene/Quality.js';
import { SceneManager } from '../scene/SceneManager.js';
import { CameraRig } from '../scene/CameraRig.js';
import { Arena } from '../scene/Arena.js';
import { PlayerView } from '../scene/PlayerView.js';
import { Player } from '../entities/Player.js';
import { Input } from '../ui/Input.js';
import { Hud } from '../ui/Hud.js';

export class Game {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    // ★antialias は renderer 生成時にしか決められないため、実測より先に推定する
    const initialTier = Quality.detect();

    this.scene = new SceneManager(canvas, TIERS[initialTier].aa);
    this.arena = new Arena(this.scene.scene);
    this.playerView = new PlayerView(this.scene.scene);
    this.cameraRig = new CameraRig(this.scene.camera);

    this.player = new Player();

    this.input = new Input(canvas, {
      root: document.getElementById('stick'),
      knob: document.getElementById('stickKnob'),
    });
    this.hud = new Hud();

    // 品質が変わったら描画側にまとめて反映する
    this.quality = new Quality((tier) => {
      this.scene.applyQuality(tier);
      this.playerView.applyQuality(tier);
    }, initialTier);

    this.loop = new Loop({
      update: (dt) => this.update(dt),
      render: (alpha, dt) => this.render(alpha, dt),
    });
  }

  start() {
    this.hud.show();
    this.loop.start();
  }

  /** 固定ステップ（1/60秒）で呼ばれる論理更新。 */
  update(dt) {
    const input = this.input.poll();
    this.player.update(dt, input, this.arena.radius);
  }

  /** 毎フレームの描画。alpha は前フレームからの補間係数。 */
  render(alpha, dt) {
    this.playerView.sync(this.player, alpha, dt);
    this.cameraRig.follow(this.player, dt);
    this.scene.syncShadow(this.player.x, this.player.z);

    this.scene.render();

    this.quality.sample(dt);
    this.hud.update(dt, this.quality.name, this.scene.drawCalls);
    if (this.input.isActive) this.hud.dismissHint();
  }
}
