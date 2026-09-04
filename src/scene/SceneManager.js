/**
 * three.js のライフサイクルを持つ唯一の場所。
 * renderer / scene / camera / ライト / 霧 / リサイズ / 品質適用をここに閉じ込める。
 */
import * as THREE from '../../vendor/three/three.module.min.js';
import { BALANCE } from '../data/balance.js';
import { clamp } from '../core/math.js';

const BG = 0x0a0a12;

export class SceneManager {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {boolean} antialias  ★renderer生成時にしか決められないので初期ティアから渡す
   */
  constructor(canvas, antialias) {
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias,
      powerPreference: 'high-performance',
      stencil: false,          // 使わない機能はバッファごと切る
      alpha: false,
    });
    this.renderer.setSize(innerWidth, innerHeight, false);
    // r185 で PCFSoftShadowMap は非推奨。PCFShadowMap の方が安く、
    // 低ポリのハードエッジな影とも相性がよい
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.info.autoReset = false;   // draw call を毎フレーム自分でリセットする

    this.scene = new THREE.Scene();
    // ★背景色は置かない。Arena が張る空（グラデーション＋星）が担当する。
    //   霧の色は空の地平と揃える。ここがずれると遠景に不自然な帯が出る。
    this.scene.fog = new THREE.FogExp2(0x241a44, 0.0145);

    const c = BALANCE.camera;
    this.camera = new THREE.PerspectiveCamera(c.fov, innerWidth / innerHeight, c.near, c.far);
    this.camera.position.set(c.offset.x, c.offset.y, c.offset.z);
    this.camera.lookAt(0, 0, 0);
    this._applyFov();

    this._buildLights();

    this._onResize = this._onResize.bind(this);
    addEventListener('resize', this._onResize);
    addEventListener('orientationchange', this._onResize);

    // モバイルでは端末のスリープ復帰などでコンテキストを失うことがある
    this.contextLost = false;
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.contextLost = true; });
    canvas.addEventListener('webglcontextrestored', () => { this.contextLost = false; });
  }

  /** ★ライトは2つだけ。点光源は使わない（フォワードレンダリングでシェーダが重くなる）。 */
  _buildLights() {
    // 環境光の代わり。空の色と地面の照り返しを1つで表現する。
    // ★空を紫寄りにしたので、環境光もそちらへ寄せて画面全体の色を揃える
    // ★強すぎると Lambert の出力が1を超えて色が白へ寄る。
    //   暗い舞台なので environment は控えめにし、明暗差で見せる
    this.hemi = new THREE.HemisphereLight(0x7a8cf5, 0x3a2350, 1.35);
    this.scene.add(this.hemi);

    // 主光源。やや暖色にして、青い環境光との対比で立体感を出す
    this.dir = new THREE.DirectionalLight(0xfff2e0, 2.2);
    this.dir.position.set(18, 30, 14);
    this.dir.castShadow = true;

    // 影カメラは自機周辺に密着させる。広げるほど1テクセルあたりの解像度が落ちる
    const s = this.dir.shadow;
    s.camera.left = -26; s.camera.right = 26;
    s.camera.top = 26;   s.camera.bottom = -26;
    s.camera.near = 1;   s.camera.far = 78;
    s.bias = -0.0009;                 // アクネ（縞模様）対策
    s.normalBias = 0.022;             // ピーターパン（影の浮き）対策
    s.mapSize.set(1024, 1024);

    this.scene.add(this.dir);
    this.scene.add(this.dir.target);  // target は明示的に scene に入れないと行列が更新されない
  }

  /** Quality から呼ばれる。DPR・影の有無・シャドウマップ解像度を切り替える。 */
  applyQuality(tier) {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, tier.dpr));
    this.renderer.setSize(innerWidth, innerHeight, false);

    this.renderer.shadowMap.enabled = tier.shadows;
    this.dir.castShadow = tier.shadows;

    if (tier.shadows && this.dir.shadow.mapSize.width !== tier.shadowMap) {
      this.dir.shadow.mapSize.set(tier.shadowMap, tier.shadowMap);
      // 解像度変更を反映するには既存のシャドウマップを破棄する必要がある
      this.dir.shadow.map?.dispose();
      this.dir.shadow.map = null;
    }
    this.renderer.shadowMap.needsUpdate = true;
  }

  /** 影カメラを自機に追従させる。動かさないと遠くで影が切れる。 */
  syncShadow(targetX, targetZ) {
    this.dir.position.set(targetX + 18, 30, targetZ + 14);
    this.dir.target.position.set(targetX, 0, targetZ);
    this.dir.target.updateMatrixWorld();
  }

  /**
   * 縦持ち補正。
   *
   * PerspectiveCamera.fov は「垂直」FOV なので、画面が縦長になるほど水平視界が狭まる。
   * 縦持ちのスマホで敵が真横から見えないのは致命的なので、
   * 基準アスペクトの水平FOVを保つ方向へ垂直FOVを広げる（上限 fovMax でクランプ）。
   */
  _applyFov() {
    const c = BALANCE.camera;
    const aspect = innerWidth / innerHeight;

    const halfHTan = Math.tan(THREE.MathUtils.degToRad(c.fov) / 2) * c.refAspect;
    const wanted = THREE.MathUtils.radToDeg(2 * Math.atan(halfHTan / aspect));

    this.camera.aspect = aspect;
    // 広げすぎると魚眼になるので上限を切る。横長画面では基準FOVのまま
    this.camera.fov = clamp(wanted, c.fov, c.fovMax);
    this.camera.updateProjectionMatrix();
  }

  _onResize() {
    this._applyFov();
    this.renderer.setSize(innerWidth, innerHeight, false);
  }

  render() {
    if (this.contextLost) return;
    this.renderer.info.reset();
    this.renderer.render(this.scene, this.camera);
  }

  /** 直近フレームの draw call 数（HUDのデバッグ表示用） */
  get drawCalls() { return this.renderer.info.render.calls; }

  dispose() {
    removeEventListener('resize', this._onResize);
    removeEventListener('orientationchange', this._onResize);
    this.renderer.dispose();
  }
}
