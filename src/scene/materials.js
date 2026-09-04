/**
 * マテリアルの拡張。
 *
 * ★リムライト（輪郭光）を全キャラ・敵・構造物に乗せる。
 *   これが有るか無いかで「立体に見えるか」「べたっとした塗りに見えるか」が決まる。
 *   ポストプロセス無しで質感を上げる、いちばん費用対効果の高い一手。
 *
 * 実装方針：
 *   three の標準マテリアルのシェーダに onBeforeCompile で数行差し込む。
 *   ★色や強さは uniform ではなく GLSL のリテラルとして埋める。
 *     uniform にすると、同じシェーダを共有する複数マテリアル間で
 *     値が混ざる事故が起きやすい。パラメータごとに別プログラムにしてしまう方が安全。
 */
import * as THREE from '../../vendor/three/three.module.min.js';

const f = (v) => {
  const s = Number(v).toFixed(4);
  return s.includes('.') ? s : s + '.0';
};

/**
 * @param {THREE.Material} material 対象（Lambert / Standard など光を受けるもの）
 * @param {object} o
 * @param {number} o.color    輪郭光の色
 * @param {number} o.power    輪郭の締まり。大きいほど縁だけが光る
 * @param {number} o.strength 明るさ
 * @returns {THREE.Material} 同じマテリアル（連結して書けるように返す）
 */
export function withRim(material, { color = 0x7fd8ff, power = 2.6, strength = 0.55 } = {}) {
  const c = new THREE.Color(color);
  const key = `rim|${c.getHexString()}|${power}|${strength}`;

  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `#include <opaque_fragment>
      {
        // vViewPosition はフラグメントからカメラへ向くベクトル（ビュー空間）
        float rimDot = 1.0 - clamp( dot( normalize( normal ), normalize( vViewPosition ) ), 0.0, 1.0 );
        float rimAmt = pow( rimDot, ${f(power)} );
        gl_FragColor.rgb += vec3( ${f(c.r)}, ${f(c.g)}, ${f(c.b)} ) * rimAmt * ${f(strength)};
      }`
    );
  };

  // ★パラメータが違えば別プログラムとして扱わせる。
  //   これをやらないと、最初にコンパイルされた色が他のマテリアルにも適用されうる。
  material.customProgramCacheKey = () => key;
  return material;
}

/**
 * 発光する板（加算合成のビルボード）を作る。
 * ★ブルームの代用。光り物の周りにこれを重ねると、
 *   全画面のポストプロセス（モバイルで致命的に重い）無しで滲みが出る。
 */
export function makeGlowSprite(texture, color, size, opacity = 0.9) {
  const mat = new THREE.SpriteMaterial({
    map: texture,
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    // ★奥行きテストは残す。切ると敵の後ろの光が手前に抜けて安っぽくなる
    depthTest: true,
    fog: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(size);
  return s;
}
