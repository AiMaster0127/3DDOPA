/**
 * 自機の見た目。プリミティブ（カプセル・球・円錐・箱）の合成で作る。
 * GLTFを読まないのでパース待ちがなく、起動が速い。
 *
 * Player（論理）を毎フレーム読んで同期するだけで、状態は持たない。
 */
import * as THREE from '../../vendor/three/three.module.min.js';
import { BALANCE } from '../data/balance.js';
import { lerp, wrapAngle, damp } from '../core/math.js';
import { withRim, makeGlowSprite } from './materials.js';
import { makeGlowTexture, makeBlobTexture } from './textures.js';

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
    this.torsoMat = withRim(new THREE.MeshStandardMaterial({
      color: 0xe4ebf7, roughness: 0.42, metalness: 0.25,
      emissive: 0xff2b2b, emissiveIntensity: 0,      // 被弾時だけ光らせる
    }), { color: 0x9fd8ff, power: 2.6, strength: 0.85 });
    const torso = new THREE.Mesh(
      new THREE.CapsuleGeometry(p.radius, p.height * 0.5, 4, 12), this.torsoMat
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

    // 武器。フェーズ4で装備中の武器データに応じて色・形を差し替える
    this.weaponPivot = new THREE.Group();             // 振り回すための回転軸
    this.weaponPivot.position.y = p.height * 0.55;
    this.weaponMat = withRim(
      new THREE.MeshStandardMaterial({ color: 0xc9d4e2, roughness: 0.3, metalness: 0.65 }),
      { color: 0xbfe8ff, power: 2.2, strength: 0.9 }
    );
    this.weapon = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.3), this.weaponMat);
    this.weapon.position.set(p.radius + 0.14, 0, 0.15);
    this.weapon.rotation.x = -0.28;
    this.weapon.castShadow = true;
    this.weaponPivot.add(this.weapon);

    this.body.add(torso, core, head, nose, this.weaponPivot);

    // キャラ切り替えで色を差し替えるために持っておく
    this.coreMat = core.material;
    this.noseMat = nose.material;

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

    // ★足元の発光。敵が群がったときに「自分がどこか」を保証する。
    //   単なるリングより、中心が明るく外へ滲む板の方が「立っている」感じが出る。
    this.glowTex = makeGlowTexture(128, 0.0);
    this.aura = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: this.glowTex, color: ACCENT, transparent: true, opacity: 0.55,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    this.aura.rotation.x = -Math.PI / 2;
    this.aura.position.y = 0.05;
    this.aura.scale.setScalar(p.radius * 9);
    this.group.add(this.aura);

    // 足元を締める細いリング。滲みだけだと輪郭が無く締まらない
    this.auraRing = new THREE.Mesh(
      new THREE.RingGeometry(p.radius * 1.5, p.radius * 1.72, 40),
      new THREE.MeshBasicMaterial({
        color: ACCENT, transparent: true, opacity: 0.7,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    this.auraRing.rotation.x = -Math.PI / 2;
    this.auraRing.position.y = 0.06;
    this.group.add(this.auraRing);

    // ★足元に向きの三角を描く。見下ろしでは、体の傾きより
    //   床に落ちた印の方が速く読める（乱戦で特に効く）。
    const arrowShape = new THREE.BufferGeometry();
    arrowShape.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 1.15,  -0.42, 0, 0.35,   0.42, 0, 0.35,
    ], 3));
    arrowShape.computeVertexNormals();
    this.dirMat = new THREE.MeshBasicMaterial({
      color: ACCENT, transparent: true, opacity: 0.75,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.dirMark = new THREE.Mesh(arrowShape, this.dirMat);
    this.dirMark.position.y = 0.07;
    this.dirMark.scale.setScalar(1.35);
    this.group.add(this.dirMark);

    // 外側にもう一枚、薄く広いリング。存在感の底上げ
    this.auraOuter = new THREE.Mesh(
      new THREE.RingGeometry(p.radius * 2.6, p.radius * 2.78, 48),
      new THREE.MeshBasicMaterial({
        color: ACCENT, transparent: true, opacity: 0.3,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    this.auraOuter.rotation.x = -Math.PI / 2;
    this.auraOuter.position.y = 0.055;
    this.group.add(this.auraOuter);

    // 胸のコアの光。自機の位置を点で示す
    this.coreGlow = makeGlowSprite(this.glowTex, ACCENT, 2.1, 0.85);
    this.coreGlow.position.set(0, p.height * 0.66, 0);
    this.group.add(this.coreGlow);

    // ★近接攻撃の斬撃範囲。装飾ではなく「どこまで届くか」を示す機能。
    //   これが無いと近接武器の間合いが体で覚えられない
    this.arcMat = new THREE.MeshBasicMaterial({
      color: ACCENT, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.arc = new THREE.Mesh(new THREE.RingGeometry(0.4, 1, 20, 1), this.arcMat);
    this.arc.rotation.x = Math.PI / 2;    // 局所+Y を ワールド+Z（正面）へ寝かせる
    this.arc.position.y = 0.12;
    this.arc.visible = false;
    this.group.add(this.arc);

    this._bob = 0;
    this._arcGeoKey = '';
  }

  /**
   * キャラクターの配色を反映する。
   * ★白い体は「床に溶けないこと」が目的なので、キャラで変えるのは
   *   明度ではなく色味に留める。暗い体色にすると乱戦で自機を見失う。
   */
  setCharacter(character) {
    const v = character.visual;
    this.torsoMat.color.setHex(v.body);
    this.coreMat.color.setHex(v.accent);
    this.coreMat.emissive.setHex(v.accent);
    this.noseMat.color.setHex(v.nose);
    this.noseMat.emissive.setHex(v.nose);
    this.aura.material.color.setHex(v.accent);
    this.auraRing.material.color.setHex(v.accent);
    this.auraOuter.material.color.setHex(v.accent);
    this.dirMat.color.setHex(v.accent);
    this.coreGlow.material.color.setHex(v.accent);
    this.arcMat.color.setHex(v.accent);
  }

  /** 装備武器が変わったら見た目と斬撃範囲を作り直す（頻度が低いので毎回作ってよい）。 */
  setWeapon(weapon) {
    this.weaponMat.color.setHex(weapon.visual.color);
    this.weaponMat.emissive.setHex(weapon.visual.emissive || 0x000000);
    this.weaponMat.emissiveIntensity = weapon.visual.emissive ? 0.8 : 0;

    const isMelee = weapon.attack.kind === 'melee_arc';
    this.arc.visible = false;
    this.arcMat.opacity = 0;
    if (!isMelee) { this._arcGeoKey = ''; return; }

    const key = `${weapon.base.range}/${weapon.attack.arcDeg}`;
    if (key === this._arcGeoKey) return;
    this._arcGeoKey = key;

    const r = weapon.base.range;
    const half = (weapon.attack.arcDeg * Math.PI) / 360;
    this.arc.geometry.dispose();
    // ringのθは +X から +Y 方向。回転後は +X から +Z(正面) 方向になるので、
    // 正面(θ=PI/2)を中心にするには PI/2 - half から始める
    this.arc.geometry = new THREE.RingGeometry(r * 0.28, r, 24, 1, Math.PI / 2 - half, half * 2);
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
    this.aura.material.opacity = 0.42 + player.speed01 * 0.34;
    this.auraRing.material.opacity = 0.55 + player.speed01 * 0.4;
    this.coreGlow.material.opacity = 0.7 + player.speed01 * 0.3;

    // 外周リングはゆっくり脈打たせる。静止していても「生きている」感じが出る
    this._pulse = (this._pulse || 0) + dt;
    this.auraOuter.material.opacity = 0.22 + Math.sin(this._pulse * 2.4) * 0.10;
    this.auraOuter.scale.setScalar(1 + Math.sin(this._pulse * 2.4) * 0.06);
    this.dirMat.opacity = 0.55 + player.speed01 * 0.35;

    // ---- 近接の振り。swing は 武器のlife秒 → 0 へ落ちる ----
    const t = player.swing > 0 ? player.swing / player.swingDur : 0;   // 1→0
    if (t > 0) {
      this.arc.visible = true;
      this.arcMat.opacity = t * 0.5;
      this.weaponPivot.rotation.y = lerp(-1.15, 0.75, 1 - t);          // 右から左へ薙ぐ
    } else {
      this.arc.visible = false;
      this.weaponPivot.rotation.y = damp(this.weaponPivot.rotation.y, 0, 12, dt);
    }

    // ---- 被弾中の赤い明滅。無敵時間が視覚的に判る ----
    const inv = player.iframe > 0;
    this.torsoMat.emissiveIntensity = inv ? 0.35 + Math.sin(performance.now() * 0.05) * 0.3 : 0;

    // ---- 死亡：倒れる ----
    this.body.rotation.z = damp(this.body.rotation.z, player.dead ? Math.PI * 0.42 : 0, 6, dt);
    this.aura.visible = !player.dead;
    this.auraRing.visible = !player.dead;
    this.auraOuter.visible = !player.dead;
    this.dirMark.visible = !player.dead;
    this.coreGlow.visible = !player.dead;
  }
}
