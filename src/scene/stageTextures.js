/**
 * 舞台の外側のテクスチャ（空・結界・金属パネル）。
 */
import * as THREE from '../../vendor/three/three.module.min.js';
import { hash2, fbm, newCanvas, chamferPoly } from './textures.js';

// ───────────────────────── 空 ─────────────────────────

const SKY_DEF = {
  stops: ['#04040c', '#0a0a1c', '#141330', '#241a44', '#3a2352'],
  nebula: ['120, 90, 255', '60, 190, 255'],
  nebulaCount: 7, nebulaAlpha: 0.16, stars: 620,
  silhouette: { color: '#05060f', height: 0.16, teeth: 46, jag: 0.55, spires: 5 },
};

/**
 * 背景。グラデーション + 星雲 + 星 + **地平のシルエット**。
 *
 * ★単色の背景は「箱の中」に見える。奥行きを1枚で作る。
 * ★地平にギザギザの構造物を焼き込むのが効く。ジオメトリ0で
 *   「アリーナの外にも世界がある」が出せて、draw call も三角形も増えない。
 */
export function makeSkyTexture(sky = {}, w = 1024, h = 512) {
  const S = { ...SKY_DEF, ...sky };
  const SIL = { ...SKY_DEF.silhouette, ...(sky.silhouette || {}) };
  const cv = newCanvas(w, h);
  const g = cv.getContext('2d');

  const grad = g.createLinearGradient(0, 0, 0, h);
  const st = S.stops;
  for (let i = 0; i < st.length; i++) grad.addColorStop(i / (st.length - 1), st[i]);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);

  // 星雲。大きく薄い塊を数個だけ置く
  for (let i = 0; i < S.nebulaCount; i++) {
    const px = hash2(i, 2, 211) * w;
    const py = hash2(i, 5, 223) * h * 0.76;
    const r = 90 + hash2(i, 9, 227) * 230;
    const hue = S.nebula[i % S.nebula.length];
    const rg = g.createRadialGradient(px, py, 0, px, py, r);
    rg.addColorStop(0, `rgba(${hue}, ${S.nebulaAlpha})`);
    rg.addColorStop(1, `rgba(${hue}, 0)`);
    g.fillStyle = rg;
    g.fillRect(px - r, py - r, r * 2, r * 2);
  }

  // 星。上ほど密に（地平近くは霞んで見えない、という理屈）
  for (let i = 0; i < S.stars; i++) {
    const px = hash2(i, 31, 233) * w;
    const t = hash2(i, 37, 239);
    const py = t * t * h * 0.77;
    const a = 0.25 + hash2(i, 41, 241) * 0.75;
    const s = hash2(i, 43, 251) > 0.94 ? 1.9 : 0.9;
    g.fillStyle = `rgba(255, 255, 255, ${a * (1 - py / h * 0.9)})`;
    g.fillRect(px, py, s, s);
  }

  // 地平の光。シルエットの根元を明るくして、逆光に見せる
  // ★見下ろしのゲームカメラでは、画面の上端でも水平より約35度下を向いている。
  //   つまり真の水平線(v=0.5)は一生映らない。空に何を描いても
  //   v≈0.70〜0.78 に無ければ見えない。ここを外すと「描いたのに出ない」になる。
  const HZ = h * 0.775;
  const hg = g.createLinearGradient(0, HZ - h * SIL.height * 1.4, 0, HZ);
  hg.addColorStop(0, `rgba(${S.nebula[0]}, 0)`);
  hg.addColorStop(1, `rgba(${S.nebula[0]}, 0.30)`);
  g.fillStyle = hg;
  g.fillRect(0, HZ - h * SIL.height * 1.4, w, h * SIL.height * 1.4);

  // --- 遠景のシルエット（2層）。手前ほど暗く大きく ---
  const skyline = (baseY, scale, color, seed) => {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, h);
    g.lineTo(0, baseY);
    const teeth = SIL.teeth;
    const step = w / teeth;
    for (let i = 0; i <= teeth; i++) {
      const x = i * step;
      // 折れ線の稜線。角柱の塔が並んでいるように、頂点は水平に切る
      const n = fbm(i * 0.55, seed * 0.1, teeth, seed, 3);
      let top = baseY - h * SIL.height * scale * (0.25 + n * SIL.jag);
      // 数本だけ突き抜ける尖塔
      if (SIL.spires && i % Math.max(2, Math.floor(teeth / SIL.spires)) === 1) {
        top -= h * SIL.height * scale * (0.5 + hash2(i, seed, 313) * 0.9);
      }
      g.lineTo(x, top);
      g.lineTo(x + step, top);
    }
    g.lineTo(w, baseY);
    g.lineTo(w, h);
    g.closePath();
    g.fill();
  };
  // ★シルエットは「暗い色で塗る」のではなく「空を暗く落とす」。
  //   固定色で塗ると、空が明るいテーマでは画面に開いた黒い穴に見える。
  //   実際に一度そうなった（拠点の背景に真っ黒な板が立った）。
  //   奥ほど薄く、手前ほど濃く落とすと、空気遠近が自然に出る。
  skyline(HZ - h * 0.012, 0.72, 'rgba(3, 4, 12, 0.30)', 7);
  skyline(HZ, 1.0, 'rgba(3, 4, 12, 0.55)', 19);

  // シルエットの縁に灯り。窓のつもりの点を散らす
  for (let i = 0; i < 140; i++) {
    const px = hash2(i, 3, 317) * w;
    const py = HZ - hash2(i, 7, 331) * h * SIL.height * 0.8;
    if (py > HZ - 2) continue;
    g.fillStyle = `rgba(${S.nebula[i % S.nebula.length]}, ${0.25 + hash2(i, 11, 337) * 0.5})`;
    g.fillRect(px, py, 1.6, 1.2);
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}

// ───────────────────────── 結界 ─────────────────────────

/**
 * アリーナ外周のエネルギー壁。下が濃く上へ消える。
 * ★「どこまでが戦場か」を線ではなく面で伝える。加算合成で使う。
 */
export function makeBarrierTexture(barrier = {}, w = 256, h = 256) {
  const rgb = barrier.rgb || '90, 220, 255';
  const cv = newCanvas(w, h);
  const g = cv.getContext('2d');
  g.clearRect(0, 0, w, h);

  // 下端が最も濃い縦グラデーション
  const grad = g.createLinearGradient(0, h, 0, 0);
  grad.addColorStop(0.00, `rgba(${rgb}, 0.55)`);
  grad.addColorStop(0.25, `rgba(${rgb}, 0.22)`);
  grad.addColorStop(0.70, `rgba(${rgb}, 0.05)`);
  grad.addColorStop(1.00, `rgba(${rgb}, 0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);

  // 縦のリブ。等間隔だと機械的すぎるので太さを散らす
  for (let i = 0; i < 26; i++) {
    const px = (i / 26) * w;
    const lw = 1 + hash2(i, 3, 307) * 2.5;
    g.fillStyle = `rgba(${rgb}, ${0.05 + hash2(i, 7, 311) * 0.10})`;
    g.fillRect(px, 0, lw, h);
  }

  // 六角の網目。エネルギー壁が「板」ではなく「膜」に見える
  const cell = 32;
  g.strokeStyle = `rgba(${rgb}, 0.13)`;
  g.lineWidth = 1;
  for (let y = 0; y < h + cell; y += cell * 0.75) {
    for (let x = 0; x < w + cell; x += cell) {
      const ox = (Math.round(y / (cell * 0.75)) % 2) * cell * 0.5;
      chamferPoly(g, x + ox, y, cell * 0.46, 6, 0.0, Math.PI / 6);
      g.stroke();
    }
  }

  // 横の走査線
  for (let y = 0; y < h; y += 6) {
    g.fillStyle = `rgba(${rgb}, ${0.05 * (1 - y / h)})`;
    g.fillRect(0, y, w, 1);
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ───────────────────────── 金属パネル ─────────────────────────

/** 壁・装飾用。ヘアライン仕上げの金属＋リベット。 */
export function makeMetalTexture(frame = {}, size = 256) {
  const tint = frame.tint || '#a8b0d8';
  const cv = newCanvas(size, size);
  const g = cv.getContext('2d');

  g.fillStyle = tint;
  g.fillRect(0, 0, size, size);

  const img = g.getImageData(0, 0, size, size);
  const d = img.data;
  const P = 6;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // 横方向に伸ばしたノイズ＝ヘアライン
      const n = fbm((x / size) * P * 0.6, (y / size) * P * 9, P * 9, 53, 3);
      const blot = fbm((x / size) * P, (y / size) * P, P, 59, 3);
      const k = 0.72 + n * 0.22 + blot * 0.24;
      const i = (y * size + x) * 4;
      d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
    }
  }
  g.putImageData(img, 0, 0);

  // 縦のリブ。柱や壁に貼ったとき、面の中に「厚み」の情報が入る
  for (let i = 0; i < 5; i++) {
    const px = (i + 0.5) * (size / 5);
    g.fillStyle = 'rgba(16, 20, 40, 0.42)';
    g.fillRect(px - 4, 0, 8, size);
    g.fillStyle = 'rgba(226, 236, 255, 0.16)';
    g.fillRect(px + 4, 0, 2, size);
  }

  // リベット（六角）。上下の端に並べる
  for (let i = 0; i < 10; i++) {
    const px = (i + 0.5) * (size / 10);
    for (const py of [10, size - 10]) {
      chamferPoly(g, px, py, 3.4, 6, 0, 0.3);
      g.fillStyle = 'rgba(210, 224, 255, 0.26)'; g.fill();
    }
  }

  // 縁の陰影で「板」に見せる
  g.strokeStyle = 'rgba(18, 22, 44, 0.7)';
  g.lineWidth = 4;
  g.strokeRect(0, 0, size, size);
  g.strokeStyle = 'rgba(220, 232, 255, 0.22)';
  g.lineWidth = 1.5;
  g.strokeRect(3, 3, size - 6, size - 6);

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

