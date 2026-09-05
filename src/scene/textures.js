/**
 * 手続き的テクスチャの土台と、汎用の光り物。
 *
 * ★画像ファイルは一切同梱しない。全部その場でキャンバスに描く。
 *   - 容量ゼロ・読み込み待ちゼロ・外部通信ゼロ（本作の前提）
 *   - 色や粗さをコードで動かせるので、後から調整が効く
 *
 * ★生成は起動時（とステージ切替時）だけ。ゲーム中は呼ばない。
 *
 * 舞台の見た目そのものは deckTextures.js / stageTextures.js にある。
 * ここは両方が使う道具だけを置く。
 */
import * as THREE from '../../vendor/three/three.module.min.js';

// ───────────────────────── ノイズ ─────────────────────────

/**
 * 決定的なハッシュ（0..1）。座標を入れると同じ値が返る。
 *
 * ★Math.imul で32bit整数の掛け算にすること。
 *   素直に `x * 374761393` と書くと、積が倍精度の巨大な値になってから
 *   ビット演算のたびに整数へ落とされる。床テクスチャ1枚（512x512に
 *   ノイズを20回/画素）でこれが効いて、生成に1.2秒かかっていた。
 */
export function hash2(x, y, seed) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const smooth = (t) => t * t * (3 - 2 * t);

/**
 * タイル状に繰り返せる値ノイズ。
 * ★格子を period で巻き戻すことで、テクスチャの継ぎ目が出ないようにする。
 */
export function tileNoise(x, y, period, seed) {
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
export function fbm(x, y, period, seed, octaves = 4) {
  let sum = 0, amp = 0.5, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += tileNoise(x * freq, y * freq, period * freq, seed + i * 17) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

export function newCanvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  return cv;
}

// ───────────────────────── 形 ─────────────────────────

/**
 * 角を落とした多角形パス。
 * ★丸を使わずに「硬いのに角張りすぎない」形を作るための道具。
 *   円弧ではなく直線の面取りなので、輪郭にはっきり折れ線が出る。
 */
export function chamferPoly(g, cx, cy, r, sides, cut, rot = 0) {
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  g.beginPath();
  for (let i = 0; i < sides; i++) {
    const p = pts[i], n = pts[(i + 1) % sides], q = pts[(i - 1 + sides) % sides];
    const inA = [p[0] + (q[0] - p[0]) * cut, p[1] + (q[1] - p[1]) * cut];
    const outA = [p[0] + (n[0] - p[0]) * cut, p[1] + (n[1] - p[1]) * cut];
    if (i === 0) g.moveTo(inA[0], inA[1]); else g.lineTo(inA[0], inA[1]);
    g.lineTo(outA[0], outA[1]);
  }
  g.closePath();
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
