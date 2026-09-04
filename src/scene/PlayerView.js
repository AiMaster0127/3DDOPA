/**
 * 自機の見た目。プリミティブ（カプセル・球・円錐・箱）の合成で作る。
 * GLTFを読まないのでパース待ちがなく、起動が速い。
 *
 * Player（論理）を毎フレーム読んで同期するだけで、状態は持たない。
 */
import * as THREE from '../../vendor/three/three.module.min.js';
import { BALANCE } from '../data/balance.js';
import { lerp, wrapAngle, damp } from '../core/math.js';

const ACCENT = 0x43e8ff;
const ACCENT2 = 0xff3ea5;

export class PlayerView {
  constructor(scene) {
    this.group = new THREE.Group();      // 位置と向き。Yは常に0でブレさせない
    this.body = new THREE.Group();       // 上下動と傾き。演出はこちらに乗せる
    this.group.add(this.body);
    scene.add(this.group);

    const p = BALANCE.player;

    // ★床が濃紺なので、自機は「ほぼ白 + 発光アクセント」にして最大コントラストを取る。
    //   青系にすると床に溶けて、乱戦時に自分を見失う。
    const torso = new THREE.Mesh(
      new THREE.CapsuleGeometry(p.radius, p.height * 0.5, 4, 12),
      new THREE.MeshStandardMaterial({ color: 0xe4ebf7, roughness: 0.42, metalness: 0.25 })
    );
    torso.position.y = p.height * 0.5;
    torso.castShadow = true;

    // 胸のコア。発光させて暗所でも位置が判るようにする
    const core = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.26, 0.12),
      new THREE.MeshStandardMaterial({ color: ACCENT, emissive: ACCENT, emissiveIntensity: 1.6 })
    );
    core.position.set(0, p.height * 0.62, p.radius * 0.92);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(p.radius * 0.6, 14, 10),
      new THREE.MeshStandardMaterial({ color: 0xf6e6cf, roughness: 0.7 })
    );
    head.position.y = p.height * 1.02;
    head.castShadow = true;

    // ★向きの明示。見下ろし視点では体型だけだと正面が判らないので必ず入れる。
    //   床にも自機の白にも無い色（マゼンタ）を使い、一瞬で読み取れるようにする
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.19, 0.6, 8),
      new THREE.MeshStandardMaterial({ color: ACCENT2, emissive: ACCENT2, emissiveIntensity: 1.4 })
    );
    nose.rotation.x = Math.PI / 2;                    // +Z（正面）を向かせる
    nose.position.set(0, p.height * 0.82, p.radius + 0.24);

    // 武器。フェーズ4で装備中の武器データに応じて差し替える足場
    this.weapon = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.12, 1.3),
      new THREE.MeshStandardMaterial({ color: 0xc9d4e2, roughness: 0.3, metalness: 0.65 })
    );
    this.weapon.position.set(p.radius + 0.14, p.height * 0.55, 0.15);
    this.weapon.rotation.x = -0.28;
    this.weapon.castShadow = true;

    this.body.add(torso, core, head, nose, this.weapon);

    // 影オフのティア用の簡易影。シャドウマップより桁違いに安い
    this.blob = new THREE.Mesh(
      new THREE.CircleGeometry(p.radius * 1.5, 18),
      new THREE.MeshBasicMaterial({
        map: makeBlobTexture(), transparent: true, opacity: 0.5,
        depthWrite: false, color: 0x000000,
      })
    );
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.position.y = 0.03;
    this.blob.visible = false;
    this.group.add(this.blob);

    // ★足元の発光リング。敵が群がるフェーズ2以降で「自分がどこか」を保証する。
    //   加算合成なので暗い床の上でだけ光り、明るい場所では目立ちすぎない
    this.aura = new THREE.Mesh(
      new THREE.RingGeometry(p.radius * 1.15, p.radius * 1.75, 28),
      new THREE.MeshBasicMaterial({
        color: ACCENT, transparent: true, opacity: 0.55,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    this.aura.rotation.x = -Math.PI / 2;
    this.aura.position.y = 0.05;
    this.group.add(this.aura);

    this._bob = 0;
  }

  /** 品質ティアに応じて、実影 ⇄ 簡易影 を切り替える。 */
  applyQuality(tier) {
    this.blob.visible = !tier.shadows;
  }

  /**
   * @param {import('../entities/Player.js').Player} player
   * @param {number} alpha  前フレームからの補間係数（0..1）
   * @param {number} dt     実フレーム時間（演出のみに使う）
   */
  sync(player, alpha, dt) {
    this.group.position.x = lerp(player.px, player.x, alpha);
    this.group.position.z = lerp(player.pz, player.z, alpha);
    // ±PI跨ぎで一回転しないよう最短回りで補間する
    this.group.rotation.y = player.pFacing + wrapAngle(player.facing - player.pFacing) * alpha;

    // 走っているときだけ上下に弾ませ、前傾させる（速度が体感できる）
    this._bob += dt * 13 * player.speed01;
    this.body.position.y = Math.abs(Math.sin(this._bob)) * 0.11 * player.speed01;
    this.body.rotation.x = damp(this.body.rotation.x, player.speed01 * 0.13, 9, dt);

    // 走行中だけオーラを強める（速度のフィードバック）
    this.aura.material.opacity = 0.4 + player.speed01 * 0.35;
  }
}

/** 中心が濃く外周が透ける円のテクスチャ。簡易影に使う。 */
function makeBlobTexture(size = 64) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0.0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1.0, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(cv);
}
