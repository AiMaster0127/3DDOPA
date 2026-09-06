/**
 * 拠点の展示台。
 *
 * ★存在理由：作り込んだキャラと武器は、戦闘中の見下ろし視点では
 *   ほとんど見えない（頭と肩しか映らない）。引いて撮っても豆粒になる。
 *   ガチャで引いた武器も、選んだキャラも、見えなければ意味が無い。
 *   拠点にだけ台座を立て、そこに立たせて「見せる」。
 *
 * ★ステージのテーマ色を引き継ぐ。拠点だけ別世界の色になると、
 *   出撃した瞬間に景色が変わって同じ場所に見えなくなる。
 *
 * 描画コストは合計3 draw call（台座 / 光る縁 / 床の紋）。
 * 出撃中は group ごと非表示にするので、ランのコストは 0。
 */
import * as THREE from '../../vendor/three/three.module.min.js';
import { mergeParts } from './geometry.js';
import { withRim } from './materials.js';
import { makeGlowTexture } from './textures.js';

const SIDES = 12;                     // ★アリーナと同じ分割数。台座だけ丸いと浮く
const TOP_Y = 0.97;                   // 天面の高さ（＝キャラの足元）
const TOP_R = 1.00;                   // 天面の半径。★主役より大きくしない

/** 12角柱。下面 rBot、上面 rTop、高さ h。 */
function prism(rBot, rTop, h) {
  return new THREE.CylinderGeometry(rTop, rBot, h, SIDES, 1, false);
}

export class Podium {
  constructor(scene, theme) {
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    this._disposables = [];
    this._t = 0;
    this.theme = theme;
    this._build();
  }

  _keep(res) { this._disposables.push(res); return res; }

  setTheme(theme) {
    if (!theme || theme === this.theme) return;
    this.theme = theme;
    this._teardown();
    this._build();
  }

  _teardown() {
    for (const r of this._disposables) r.dispose();
    this._disposables.length = 0;
    this.group.clear();
  }

  _build() {
    const T = this.theme;
    // ★天面は暗く落とす。ここを明るくすると「白い皿」になって主役が皿に負ける。
    //   明るいのは見切りの金と縁の光だけ、という配分にする。
    // ★数字で決める。ここは半球光1.6＋指向光2.2を浴びるので、
    //   素の色に3倍近い明るさが乗る。0.2 を切らないと「白い置き台」になり主役を食う。
    const deck = new THREE.Color(T.frame.base).multiplyScalar(0.055).getHex();
    const side = new THREE.Color(T.frame.base).multiplyScalar(0.095).getHex();
    const step = new THREE.Color(T.frame.base).multiplyScalar(0.070).getHex();
    const trim = new THREE.Color(T.frame.accent).multiplyScalar(0.42).getHex();

    // ★縦に伸ばして幅を詰める。低くて広いと「皿」になり、主役が皿に乗った置物に見える
    const parts = [
      // 床に食い込む踏み段
      { geo: prism(1.40, 1.32, 0.16), pos: [0, 0.08, 0], color: step },
      // 本体。上へ向けて絞る
      { geo: prism(1.30, 1.06, 0.56), pos: [0, 0.44, 0], color: side },
      // 金の見切り
      { geo: prism(1.04, 1.02, 0.05), pos: [0, 0.745, 0], color: trim, mul: 1.6 },
      // 天面
      { geo: prism(1.02, TOP_R, 0.20), pos: [0, 0.87, 0], color: deck },
    ];

    // ---- 支柱（バットレス）。★丸い飾りを立てない。板を放射状に差し込む ----
    //   角があるほうがシルエットが締まり、真上から見ても台座の向きが判る。
    const blade = this._keep(new THREE.BoxGeometry(0.09, 0.66, 0.26));
    const tip = this._keep(new THREE.BoxGeometry(0.11, 0.05, 0.28));
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i + Math.PI / 6;
      // ★半径は本体の外へ出す。中に埋めると先端の金だけが浮いて見え、
      //   「縁に金塊が散っている」画になる（実際そうなった）。
      const x = Math.cos(a) * 1.31, z = Math.sin(a) * 1.31;
      parts.push({ geo: blade, pos: [x, 0.41, z], rot: [0, -a, 0], color: side });
      parts.push({ geo: tip, pos: [x, 0.745, z], rot: [0, -a, 0], color: trim, mul: 1.6 });
    }

    const geo = this._keep(mergeParts(parts));
    // ★リムは弱く、鋭く。面の多い多角柱に強く掛けると外周が一斉に白飛びし、
    //   台座が「発光する丸い塊」になって主役を食う（実際そうなった）。
    const mat = this._keep(withRim(new THREE.MeshLambertMaterial({ vertexColors: true }), {
      color: T.frame.cap, power: 4.6, strength: 0.16,
    }));
    const body = new THREE.Mesh(geo, mat);
    body.receiveShadow = true;
    this.group.add(body);

    // ---- 天面の縁光。立ち位置を示す細い輪 ----
    this.rimMat = this._keep(new THREE.MeshBasicMaterial({
      color: new THREE.Color(T.frame.cap).multiplyScalar(1.5),
      transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    // ★分割数を12にして多角形のまま見せる。滑らかな円にすると台座だけ別世界になる
    const rimGeo = this._keep(new THREE.RingGeometry(TOP_R - 0.035, TOP_R + 0.01, SIDES));
    const rim = new THREE.Mesh(rimGeo, this.rimMat);
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = TOP_Y + 0.005;
    rim.renderOrder = 2;
    this.group.add(rim);

    // ---- 床の紋。細い12角の輪。ゆっくり逆回転させて静止画でも動きを出す ----
    this.runeMat = this._keep(new THREE.MeshBasicMaterial({
      color: new THREE.Color(T.frame.accent).multiplyScalar(1.35),
      transparent: true, opacity: 0.3,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.rune = new THREE.Group();
    for (const [r0, r1] of [[1.80, 1.86], [2.42, 2.50]]) {
      const g = this._keep(new THREE.RingGeometry(r0, r1, SIDES));
      const m = new THREE.Mesh(g, this.runeMat);
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 1;
      this.rune.add(m);
    }
    this.rune.position.y = 0.03;
    this.group.add(this.rune);

    // 内側の輪だけ逆向きに回す（同じ向きだと1枚の絵に見える）
    this.rune.children[0].rotation.z = Math.PI / SIDES;
  }

  /** キャラの足元の高さ。PlayerView をここへ乗せる。 */
  get topY() { return TOP_Y; }

  show() { this.group.visible = true; }
  hide() { this.group.visible = false; }

  update(dt) {
    if (!this.group.visible) return;
    this._t += dt;
    this.rune.children[0].rotation.z += dt * 0.13;
    this.rune.children[1].rotation.z -= dt * 0.09;
    // 呼吸。★一定光度だと書き割りに見える
    this.rimMat.opacity = 0.46 + Math.sin(this._t * 1.5) * 0.12;
    this.runeMat.opacity = 0.22 + Math.sin(this._t * 1.1 + 1.2) * 0.08;
  }

  applyQuality(tier) {
    // 低品質でも台座そのものは残す（主役の足場なので消せない）。紋だけ落とす
    this.rune.visible = tier.particles > 0.4;
  }

  dispose() { this._teardown(); }
}
