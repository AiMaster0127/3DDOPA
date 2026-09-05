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
import { makeWeaponGeometry } from './weaponShapes.js';
import { makeCharacterGeometry } from './character.js';

/**
 * ★自機の信号色。キャラを変えても**これだけは変えない**。
 *   敵は深紅・琥珀・翠・紫の発光核を持つ。自機の足元まで同じ色にすると、
 *   乱戦で自分と敵が混ざる（実際、深紅にしたら見分けが付かなくなった）。
 *   金白は敵のどの核とも被らず、設定画の金の装飾とも揃う。
 */
const SIGNAL = 0xffd86a;
const ACCENT = SIGNAL;

export class PlayerView {
  constructor(scene) {
    this.group = new THREE.Group();      // 位置と向き。Yは常に0でブレさせない
    this.body = new THREE.Group();       // 上下動と傾き。演出はこちらに乗せる
    this.group.add(this.body);
    scene.add(this.group);

    const p = BALANCE.player;

    // ★体は頂点カラーで塗る。黒レザー・深紅の裏地・肌・髪・金具を
    //   1体2メッシュ（マット／金属）に収めるため。素直に分けると5 draw call になる。
    // ★リムライトを強めに掛ける。暗い衣装なので、輪郭光が無いと
    //   乱戦で自機が床の影と区別できなくなる。
    this.matteMat = withRim(new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.62, metalness: 0.08,
      side: THREE.DoubleSide,          // コートの裏地を内側から見せるため
      emissive: 0xff2b2b, emissiveIntensity: 0,      // 被弾時だけ光らせる
      // ★リムは弱く、鋭く。強く掛けると黒レザーが全面白飛びして
      //   「光る人形」になり、衣装の質感が丸ごと消える（実際そうなった）
    }), { color: 0x9fd8ff, power: 3.6, strength: 0.30 });

    this.metalMat = withRim(new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.28, metalness: 0.85,
      emissive: 0xff2b2b, emissiveIntensity: 0,
    }), { color: 0xffe6b0, power: 2.6, strength: 0.34 });

    const geo = makeCharacterGeometry();
    this.charMatte = new THREE.Mesh(geo.matte, this.matteMat);
    this.charMetal = new THREE.Mesh(geo.metal, this.metalMat);
    this.charMatte.castShadow = true;
    this.charMetal.castShadow = true;

    // 武器。フェーズ4で装備中の武器データに応じて色・形を差し替える
    this.weaponPivot = new THREE.Group();             // 振り回すための回転軸
    this.weaponPivot.position.y = 0.72;      // チビ体型の手の高さ
    // ★刃・柄巻き・鍔の塗り分けは頂点カラーで持つ。マテリアルは白1枚。
    //   3枚に分けると、装備するだけで draw call が3倍になる。
    this.weaponMat = withRim(
      new THREE.MeshStandardMaterial({
        color: 0xffffff, vertexColors: true, roughness: 0.34, metalness: 0.6,
      }),
      { color: 0xbfe8ff, power: 2.6, strength: 0.5 }
    );
    this.weapon = new THREE.Mesh(makeWeaponGeometry('sword'), this.weaponMat);
    this.weapon.position.set(0.42, -0.06, 0.16);
    // 設定画に合わせて斜めに提げる。真正面から見ると刀身が奥へ潰れるので、
    // 少し外へ振っておく
    this.weapon.rotation.set(-0.42, -0.30, 0);
    this.weapon.castShadow = true;
    this.weaponPivot.add(this.weapon);
    this._weaponKey = '';

    // ★主役は雑魚より一回り大きく。等倍だとスライムに埋もれる
    this.charMatte.scale.setScalar(1.18);
    this.charMetal.scale.setScalar(1.18);
    this.body.add(this.charMatte, this.charMetal, this.weaponPivot);

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
    this.coreGlow.position.set(0, 1.02, 0);
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
    // ★キャラごとに造形から作り直す。色替えだけでは
    //   「同じ人形の色違い」にしか見えず、選ぶ理由が生まれない。
    //   選択は拠点でしか起きないので、その都度作ってよい。
    this.charMatte.geometry.dispose();
    this.charMetal.geometry.dispose();
    const geo = makeCharacterGeometry(v);
    this.charMatte.geometry = geo.matte;
    this.charMetal.geometry = geo.metal;

    // ★足元の光・向きの三角・斬撃範囲の色は変えない。
    //   ここはキャラの個性ではなく「自分がどこにいるか」を伝える計器。
  }

  /** 装備武器が変わったら見た目と斬撃範囲を作り直す（頻度が低いので毎回作ってよい）。 */
  setWeapon(weapon) {
    this.weaponMat.emissive.setHex(weapon.visual.emissive || 0x000000);
    this.weaponMat.emissiveIntensity = weapon.visual.emissive ? 0.8 : 0;

    // ★武器ごとに形と配色を作り直す。引いた武器が違って見えないと
    //   ガチャの意味が半減する。装備変更は頻度が低いので、その都度作ってよい。
    const model = weapon.visual.model || 'sword';
    const geoKey = model + '|' + JSON.stringify(weapon.visual.pal || 0);
    if (geoKey !== this._weaponKey) {
      this._weaponKey = geoKey;
      this.weapon.geometry.dispose();
      this.weapon.geometry = makeWeaponGeometry(model, weapon.visual.pal);
    }
    // ★自機を1.18倍にしたので、武器も同じ倍率を掛けないと手だけ小さく見える
    this.weapon.scale.setScalar((weapon.visual.scale || 1) * 1.18);

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
    this.aura.material.opacity = 0.55 + player.speed01 * 0.34;
    this.auraRing.material.opacity = 0.72 + player.speed01 * 0.28;
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
    const flash = inv ? 0.35 + Math.sin(performance.now() * 0.05) * 0.3 : 0;
    this.matteMat.emissiveIntensity = flash;
    this.metalMat.emissiveIntensity = flash;

    // ---- 死亡：倒れる ----
    this.body.rotation.z = damp(this.body.rotation.z, player.dead ? Math.PI * 0.42 : 0, 6, dt);
    this.aura.visible = !player.dead;
    this.auraRing.visible = !player.dead;
    this.auraOuter.visible = !player.dead;
    this.dirMark.visible = !player.dead;
    this.coreGlow.visible = !player.dead;
  }
}
