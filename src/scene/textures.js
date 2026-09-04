/**
 * 手続き的テクスチャ生成。
 *
 * ★画像ファイルは一切同梱しない。全部その場でキャンバスに描く。
 *   - 容量ゼロ・読み込み待ちゼロ・外部通信ゼロ（本作の前提）
 *   - 色や粗さをコードで動かせるので、後から調整が効く
 *
 * ★生成は起動時に1回だけ。ゲーム中は呼ばない。
 */
import * as THREE from '../../vendor/three/three.module.min.js';

// ───────────────────────── ノイズ ─────────────────────────

/** 決定的なハッシュ（0..1）。座標を入れると同じ値が返る。 */
function hash2(x, y, seed) {
  let h = x * 374761393 + y * 668265263 + seed * 1274126177;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const smooth = (t) => t * t * (3 - 2 * t);

/**
 * タイル状に繰り返せる値ノイズ。
 * ★格子を period で巻き戻すことで、テクスチャの継ぎ目が出ないようにする。
 */
function tileNoise(x, y, period, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const w = (v) => ((v % period) + period) % period;

  const a = hash2(w(xi), w(yi), seed);
  const b = hash2(w(xi + 1), w(yi), seed);
  const c = hash2(w(xi), w(yi + 1), seed);
  const d = hash2(w(xi + 1), w(yi + 1), seed);

  const u = smooth(xf), v = smooth(yf);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/** 複数の周波数を重ねた雲状ノイズ。 */
function fbm(x, y, period, seed, octaves = 4) {
  let sum = 0, amp = 0.5, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += tileNoise(x * freq, y * freq, period * freq, seed + i * 17) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

function newCanvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  return cv;
}

// ───────────────────────── 床 ─────────────────────────

/**
 * アリーナの床。金属パネル + 継ぎ目の発光 + 摩耗。
 *
 * ★「グリッドが主役」にならないよう、線は細く暗く、
 *   面の質感（ノイズと擦り傷）で情報量を稼ぐ。
 */
export function makeFloorTexture(size = 512) {
  const cv = newCanvas(size, size);
  const g = cv.getContext('2d');

  // --- 下地 ---
  g.fillStyle = '#8b93c4';
  g.fillRect(0, 0, size, size);

  // --- 雲状のムラ。均一な面はプラスチックに見える ---
  const img = g.getImageData(0, 0, size, size);
  const d = img.data;
  const P = 8;                       // ノイズ格子の周期（タイル境界と一致させる）
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm((x / size) * P, (y / size) * P, P, 11, 4);
      const fine = tileNoise((x / size) * P * 8, (y / size) * P * 8, P * 8, 29);
      const k = 0.78 + n * 0.34 + (fine - 0.5) * 0.09;
      const i = (y * size + x) * 4;
      d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
    }
  }
  g.putImageData(img, 0, 0);

  // --- パネル分割。1タイルを2x2の板に見せる ---
  const half = size / 2;
  g.strokeStyle = 'rgba(20, 24, 46, 0.85)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(half, 0); g.lineTo(half, size);
  g.moveTo(0, half); g.lineTo(size, half);
  g.stroke();

  // 面取りのハイライト。溝の片側だけ明るくすると厚みが出る
  g.strokeStyle = 'rgba(210, 225, 255, 0.30)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(half - 2.5, 0); g.lineTo(half - 2.5, size);
  g.moveTo(0, half - 2.5); g.lineTo(size, half - 2.5);
  g.stroke();

  // --- タイル外周の太い溝 ---
  g.strokeStyle = 'rgba(16, 19, 38, 0.95)';
  g.lineWidth = 5;
  g.strokeRect(0, 0, size, size);
  g.strokeStyle = 'rgba(190, 208, 250, 0.34)';
  g.lineWidth = 2;
  g.strokeRect(3, 3, size - 6, size - 6);

  // --- 小物（グリーブル）。板の中に機械的な凹凸を散らす ---
  for (let i = 0; i < 26; i++) {
    const rx = hash2(i, 3, 71), ry = hash2(i, 7, 73), rw = hash2(i, 11, 79);
    const px = rx * (size - 60) + 20;
    const py = ry * (size - 60) + 20;
    const w = 14 + rw * 52;
    const h = 6 + hash2(i, 13, 83) * 16;
    g.fillStyle = hash2(i, 17, 89) > 0.5
      ? 'rgba(28, 33, 60, 0.5)'
      : 'rgba(200, 215, 255, 0.10)';
    g.fillRect(px, py, w, h);
  }

  // --- 擦り傷。方向をそろえるとヘアライン仕上げに見える ---
  g.lineWidth = 1;
  for (let i = 0; i < 90; i++) {
    const px = hash2(i, 23, 97) * size;
    const py = hash2(i, 29, 101) * size;
    const len = 8 + hash2(i, 31, 103) * 46;
    const bright = hash2(i, 37, 107) > 0.55;
    g.strokeStyle = bright ? 'rgba(225, 235, 255, 0.13)' : 'rgba(18, 21, 42, 0.22)';
    g.beginPath();
    g.moveTo(px, py);
    g.lineTo(px + len * 0.96, py + (hash2(i, 41, 109) - 0.5) * 5);
    g.stroke();
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * 床の発光ライン（別レイヤ）。加算合成で薄く重ねる。
 * ★床本体に焼き込まず分けておくと、明滅させたり色を変えたりできる。
 */
export function makeFloorSeamTexture(size = 512) {
  const cv = newCanvas(size, size);
  const g = cv.getContext('2d');
  g.clearRect(0, 0, size, size);

  const line = (x0, y0, x1, y1, w, a) => {
    g.strokeStyle = `rgba(90, 220, 255, ${a})`;
    g.lineWidth = w;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  };

  // タイル外周にだけ光を通す。中央の十字は光らせない（うるさくなる）
  const b = 2;
  line(b, b, size - b, b, 2, 0.5);
  line(b, size - b, size - b, size - b, 2, 0.5);
  line(b, b, b, size - b, 2, 0.5);
  line(size - b, b, size - b, size - b, 2, 0.5);

  // 角に短いアクセント
  const c = size * 0.18;
  line(0, c, c, 0, 3, 0.75);
  line(size, size - c, size - c, size, 3, 0.75);

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ───────────────────────── 空 ─────────────────────────

/**
 * 背景。上が濃く、地平が少し明るいグラデーション + 星 + 星雲。
 * ★単色の背景は「箱の中」に見える。奥行きを1枚で作る。
 */
export function makeSkyTexture(w = 1024, h = 512) {
  const cv = newCanvas(w, h);
  const g = cv.getContext('2d');

  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0.00, '#04040c');
  grad.addColorStop(0.42, '#0a0a1c');
  grad.addColorStop(0.68, '#141330');
  grad.addColorStop(0.86, '#241a44');
  grad.addColorStop(1.00, '#3a2352');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);

  // 星雲。大きく薄い塊を数個だけ置く
  for (let i = 0; i < 7; i++) {
    const px = hash2(i, 2, 211) * w;
    const py = hash2(i, 5, 223) * h * 0.75;
    const r = 90 + hash2(i, 9, 227) * 230;
    const hue = hash2(i, 13, 229) > 0.5 ? '120, 90, 255' : '60, 190, 255';
    const rg = g.createRadialGradient(px, py, 0, px, py, r);
    rg.addColorStop(0, `rgba(${hue}, 0.16)`);
    rg.addColorStop(1, `rgba(${hue}, 0)`);
    g.fillStyle = rg;
    g.fillRect(px - r, py - r, r * 2, r * 2);
  }

  // 星。上ほど密に（地平近くは霞んで見えない、という理屈）
  for (let i = 0; i < 620; i++) {
    const px = hash2(i, 31, 233) * w;
    const t = hash2(i, 37, 239);
    const py = t * t * h * 0.92;
    const a = 0.25 + hash2(i, 41, 241) * 0.75;
    const s = hash2(i, 43, 251) > 0.94 ? 1.9 : 0.9;
    g.fillStyle = `rgba(255, 255, 255, ${a * (1 - py / h * 0.7)})`;
    g.fillRect(px, py, s, s);
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
export function makeBarrierTexture(w = 256, h = 256) {
  const cv = newCanvas(w, h);
  const g = cv.getContext('2d');
  g.clearRect(0, 0, w, h);

  // 下端が最も濃い縦グラデーション
  const grad = g.createLinearGradient(0, h, 0, 0);
  grad.addColorStop(0.00, 'rgba(90, 220, 255, 0.55)');
  grad.addColorStop(0.25, 'rgba(70, 190, 255, 0.22)');
  grad.addColorStop(0.70, 'rgba(60, 150, 255, 0.05)');
  grad.addColorStop(1.00, 'rgba(60, 150, 255, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);

  // 縦のリブ。等間隔だと機械的すぎるので太さを散らす
  for (let i = 0; i < 26; i++) {
    const px = (i / 26) * w;
    const lw = 1 + hash2(i, 3, 307) * 2.5;
    g.fillStyle = `rgba(160, 240, 255, ${0.05 + hash2(i, 7, 311) * 0.10})`;
    g.fillRect(px, 0, lw, h);
  }

  // 横の走査線
  for (let y = 0; y < h; y += 6) {
    g.fillStyle = `rgba(190, 245, 255, ${0.05 * (1 - y / h)})`;
    g.fillRect(0, y, w, 1);
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ───────────────────────── 金属パネル ─────────────────────────

/** 壁・装飾用。ヘアライン仕上げの金属。 */
export function makeMetalTexture(size = 256) {
  const cv = newCanvas(size, size);
  const g = cv.getContext('2d');

  g.fillStyle = '#a8b0d8';
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

// ───────────────────────── 発光 ─────────────────────────

/**
 * 加算合成の光球。中心が白く飛び、外へ滑らかに消える。
 * ★ポストプロセスのブルームは重いので、光り物の周りにこれを重ねて代用する。
 */
export function makeGlowTexture(size = 128, core = 0.14) {
  const cv = newCanvas(size, size);
  const g = cv.getContext('2d');
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0.0, 'rgba(255,255,255,1)');
  grad.addColorStop(core, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.34)');
  grad.addColorStop(0.65, 'rgba(255,255,255,0.09)');
  grad.addColorStop(1.0, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(cv);
}

/** 中心が濃く外周が透ける円。簡易影に使う。 */
export function makeBlobTexture(size = 64) {
  const cv = newCanvas(size, size);
  const g = cv.getContext('2d');
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0.0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1.0, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(cv);
}
