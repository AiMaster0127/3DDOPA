/**
 * 甲板まわりのテクスチャ。
 *
 * ★床は3枚重ねで作る。1枚では必ずどこかが破綻する。
 *   1. タイル      … 近くで見たときの密度（繰り返す）
 *   2. 汚れ        … 繰り返しを殺す大きなムラ・ひび（繰り返さない）
 *   3. 見取り図    … 外周リング・主線・紋章（繰り返さない）
 *
 * ★繰り返す面にひびを描いてはいけない。同じひびが等間隔に並び、
 *   一目で「タイルを敷いた床」だと判る。ひびは 2. に持たせる。
 */
import * as THREE from '../../vendor/three/three.module.min.js';
import { hash2, tileNoise, fbm, newCanvas, chamferPoly } from './textures.js';

// ───────────────────────── 床 ─────────────────────────

const FLOOR_DEF = {
  tint: '#8b93c4', seam: '90, 220, 255', hazard: '#c8a23c', wear: 1.0, crack: 0.0,
};

/**
 * アリーナの床。装甲板 + 面取りの溝 + ボルト + 摩耗 + ひび。
 *
 * ★「グリッドが主役」にならないよう、線は細く暗く、
 *   面の質感（ノイズ・擦り傷・ひび）で情報量を稼ぐ。
 * ★丸いボルトは打たない。六角ボルトと角穴で、硬い面に見せる。
 */
export function makeFloorTexture(floor = {}, size = 512) {
  const F = { ...FLOOR_DEF, ...floor };
  const cv = newCanvas(size, size);
  const g = cv.getContext('2d');

  // --- 下地 ---
  g.fillStyle = F.tint;
  g.fillRect(0, 0, size, size);

  // --- 雲状のムラ。均一な面はプラスチックに見える ---
  const img = g.getImageData(0, 0, size, size);
  const d = img.data;
  const P = 8;                       // ノイズ格子の周期（タイル境界と一致させる）
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm((x / size) * P, (y / size) * P, P, 11, 4);
      const fine = tileNoise((x / size) * P * 8, (y / size) * P * 8, P * 8, 29);
      const k = 0.78 + n * 0.34 * F.wear + (fine - 0.5) * 0.09 * F.wear;
      const i = (y * size + x) * 4;
      d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
    }
  }
  g.putImageData(img, 0, 0);

  // --- パネル分割。1タイルを非対称に割る（等分は「壁紙」に見える） ---
  const cutX = size * 0.42, cutY = size * 0.56;
  const groove = (x0, y0, x1, y1) => {
    g.strokeStyle = 'rgba(14, 17, 32, 0.88)';
    g.lineWidth = 4;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    // 面取りのハイライト。溝の片側だけ明るくすると厚みが出る
    const nx = (y1 - y0), ny = -(x1 - x0);
    const l = Math.hypot(nx, ny) || 1;
    const ox = (nx / l) * 2.6, oy = (ny / l) * 2.6;
    g.strokeStyle = 'rgba(215, 228, 255, 0.34)';
    g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(x0 + ox, y0 + oy); g.lineTo(x1 + ox, y1 + oy); g.stroke();
  };
  groove(cutX, 0, cutX, size);
  groove(0, cutY, size, cutY);
  // 斜めに走る補強線。直交だけだと工業製品というより方眼紙になる
  groove(cutX, cutY, size, cutY - size * 0.30);

  // --- タイル外周の太い溝 ---
  g.strokeStyle = 'rgba(12, 15, 30, 0.95)';
  g.lineWidth = 6;
  g.strokeRect(0, 0, size, size);
  g.strokeStyle = 'rgba(190, 208, 250, 0.32)';
  g.lineWidth = 2;
  g.strokeRect(4, 4, size - 8, size - 8);

  // --- 六角ボルト。パネルの四隅に打つ ---
  const bolt = (x, y, r) => {
    chamferPoly(g, x, y, r, 6, 0.0, 0.3);
    g.fillStyle = 'rgba(196, 210, 245, 0.30)'; g.fill();
    chamferPoly(g, x, y, r * 0.6, 6, 0.0, 0.3);
    g.fillStyle = 'rgba(14, 17, 34, 0.55)'; g.fill();
  };
  for (const [bx, by] of [[cutX, cutY], [cutX, 0], [0, cutY], [cutX, size], [size, cutY]]) {
    for (const [dx, dy] of [[-16, -16], [16, -16], [-16, 16], [16, 16]]) bolt(bx + dx, by + dy, 5);
  }

  // --- 小物（グリーブル）。板の中に機械的な凹凸を散らす ---
  for (let i = 0; i < 30; i++) {
    const rx = hash2(i, 3, 71), ry = hash2(i, 7, 73), rw = hash2(i, 11, 79);
    const px = rx * (size - 70) + 24;
    const py = ry * (size - 70) + 24;
    const w = 14 + rw * 56;
    const h = 6 + hash2(i, 13, 83) * 16;
    const bright = hash2(i, 17, 89) > 0.5;
    g.fillStyle = bright ? 'rgba(200, 215, 255, 0.10)' : 'rgba(24, 29, 54, 0.52)';
    // 角を斜めに落とした矩形。ただの長方形より「作られた物」に見える
    const c = Math.min(h * 0.5, 5);
    g.beginPath();
    g.moveTo(px + c, py); g.lineTo(px + w, py); g.lineTo(px + w, py + h - c);
    g.lineTo(px + w - c, py + h); g.lineTo(px, py + h); g.lineTo(px, py + c);
    g.closePath(); g.fill();
  }

  // ★ひびはここには描かない。繰り返す面に描くと同じひびが等間隔に並び、
  //   一目で「タイルを敷いた床」だと判ってしまう。
  //   ひびは繰り返さない makeDeckShadeTexture 側に持たせている。

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
export function makeFloorSeamTexture(floor = {}, size = 512) {
  const F = { ...FLOOR_DEF, ...floor };
  const cv = newCanvas(size, size);
  const g = cv.getContext('2d');
  g.clearRect(0, 0, size, size);

  const line = (x0, y0, x1, y1, w, a) => {
    g.strokeStyle = `rgba(${F.seam}, ${a})`;
    g.lineWidth = w;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  };

  // タイル外周にだけ光を通す。中央の割りは光らせない（うるさくなる）
  const b = 2;
  line(b, b, size - b, b, 2, 0.5);
  line(b, size - b, size - b, size - b, 2, 0.5);
  line(b, b, b, size - b, 2, 0.5);
  line(size - b, b, size - b, size - b, 2, 0.5);

  // 角に短いアクセント
  const c = size * 0.18;
  line(0, c, c, 0, 3, 0.75);
  line(size, size - c, size - c, size, 3, 0.75);

  // 走る導線。角で直角に折る（斜めに流すと配線ではなく傷に見える）
  line(size * 0.42, size * 0.06, size * 0.42, size * 0.30, 2, 0.42);
  line(size * 0.42, size * 0.30, size * 0.74, size * 0.30, 2, 0.42);
  line(size * 0.74, size * 0.30, size * 0.74, size * 0.56, 2, 0.42);
  // 端子
  g.fillStyle = `rgba(${F.seam}, 0.6)`;
  g.fillRect(size * 0.42 - 4, size * 0.30 - 4, 8, 8);
  g.fillRect(size * 0.74 - 4, size * 0.56 - 4, 8, 8);

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * 甲板の汚れ・溜まり・周辺減光。**黒＋アルファ**の板を1枚だけ重ねる。
 *
 * ★タイルを敷き詰めた床は、細部を描き込むほど「同じ柄の壁紙」に見える。
 *   繰り返さない大きなムラを上から掛けて、初めて「広い一枚の床」になる。
 *   細かい模様を足すより、こちらの方がずっと効く。
 *
 * ★MultiplyBlending は使わない。この環境では期待どおり暗くならず、
 *   逆に床が真っ白に飛んだ。黒い板のアルファで濃さを持たせれば
 *   dst*(1-a) になり、掛け算と同じことを確実にできる。
 */
export function makeDeckShadeTexture(floor = {}, size = 1024) {
  const F = { ...FLOOR_DEF, ...floor };
  const cv = newCanvas(size, size);
  const g = cv.getContext('2d');
  const c = size / 2;

  // ★ムラは低い周波数しか持たないので、小さく作って拡大する。
  //   1024x1024 を1画素ずつ回すと 270ms かかり、ステージを選ぶたびに固まる。
  //   1/4 で作って drawImage で伸ばせば、見た目は変わらず 20ms 程度で済む。
  //   ひびだけは輪郭が要るので、拡大した後に原寸で描く。
  const N = size >> 2;
  const small = newCanvas(N, N);
  const sg = small.getContext('2d');
  const img = sg.createImageData(N, N);
  const d = img.data;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      // 大きなムラ（周期は1枚ぶん。繰り返さないので継ぎ目を気にしなくてよい）
      const big = fbm((x / N) * 2.2, (y / N) * 2.2, 4, 401, 4);
      const mid = fbm((x / N) * 6.5, (y / N) * 6.5, 8, 409, 3);
      // a = 落とす量。0 で素通し
      let a = 0.20 - big * 0.30 + (0.5 - mid) * 0.16 * F.wear;

      // 周辺減光。外周を落とすと、視線が中央の紋章へ向く
      const dx = (x - N / 2) / (N / 2), dy = (y - N / 2) / (N / 2);
      const r = Math.max(Math.abs(dx), Math.abs(dy)) * 0.35 + Math.hypot(dx, dy) * 0.65;
      a += Math.max(0, r - 0.44) * 0.80;

      const i = (y * N + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 255;   // 色はマテリアルの color で決める
      d[i + 3] = Math.max(0, Math.min(255, Math.round(a * 255)));
    }
  }
  sg.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(small, 0, 0, size, size);

  // --- ひび。甲板いっぱいに1回だけ走らせるので、どこにも同じ形が出ない ---
  if (F.crack > 0) {
    g.lineCap = 'round';
    const branch = (px, py, ang, len, depth) => {
      let x = px, y = py, a = ang;
      const segs = 3 + Math.floor(hash2(depth * 7 + len, 73, 163) * 4);
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < segs; k++) {
        a += (hash2(depth * 31 + k, 79, 167) - 0.5) * 1.1;   // 折れ線。曲線だと「線」に見える
        x += Math.cos(a) * len; y += Math.sin(a) * len;
        g.lineTo(x, y);
      }
      g.stroke();
      // 枝分かれ。1本の線より、分岐がある方が「割れた」に見える
      if (depth > 0 && len > 6) {
        g.lineWidth = Math.max(1, g.lineWidth * 0.6);
        branch(x, y, a + (hash2(depth, 83, 173) - 0.5) * 2.2, len * 0.7, depth - 1);
      }
    };
    for (let i = 0; i < Math.round(22 * F.crack); i++) {
      const ang = hash2(i, 51, 131) * Math.PI * 2;
      const rad = Math.sqrt(hash2(i, 57, 137)) * size * 0.46;
      g.strokeStyle = `rgba(255, 255, 255, ${0.26 + hash2(i, 63, 149) * 0.24})`;
      g.lineWidth = 1.6 + hash2(i, 67, 151) * 2.4;      // 1024px＝1ワールド単位あたり14px
      branch(c + Math.cos(ang) * rad, c + Math.sin(ang) * rad,
             hash2(i, 61, 139) * Math.PI * 2, 14 + hash2(i, 71, 157) * 26, 2);
    }
    g.lineCap = 'butt';
  }

  // --- 引きずり傷。長く薄い筋を数本だけ。床の「歴史」になる ---
  for (let i = 0; i < 7; i++) {
    const ang = hash2(i, 91, 181) * Math.PI * 2;
    const rad = hash2(i, 93, 191) * size * 0.34;
    const len = size * (0.12 + hash2(i, 97, 193) * 0.26);
    const dir = hash2(i, 101, 197) * Math.PI * 2;
    g.strokeStyle = `rgba(255, 255, 255, ${0.09 + hash2(i, 103, 199) * 0.11})`;
    g.lineWidth = 8 + hash2(i, 107, 211) * 24;
    g.beginPath();
    g.moveTo(c + Math.cos(ang) * rad, c + Math.sin(ang) * rad);
    g.lineTo(c + Math.cos(ang) * rad + Math.cos(dir) * len,
             c + Math.sin(ang) * rad + Math.sin(dir) * len);
    g.stroke();
  }

  // 焼け跡。中央付近に数枚、はっきりした濃い染み
  for (let i = 0; i < 9; i++) {
    const ang = hash2(i, 3, 421) * Math.PI * 2;
    const rad = (0.10 + hash2(i, 7, 431) * 0.26) * size * 0.5;
    const px = c + Math.cos(ang) * rad, py = c + Math.sin(ang) * rad;
    const rr = 36 + hash2(i, 11, 433) * 108;
    const rg = g.createRadialGradient(px, py, 0, px, py, rr);
    rg.addColorStop(0, 'rgba(255, 255, 255, 0.40)');
    rg.addColorStop(1, 'rgba(255, 255, 255, 0)');
    g.fillStyle = rg;
    g.fillRect(px - rr, py - rr, rr * 2, rr * 2);
  }

  // ★色は白のまま。実際に乗る色はマテリアルの color（テーマの霧色）で決める。
  //   colorSpace は指定しない（マスクなので変換されると濃さが狂う）
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 8;
  return tex;
}

/**
 * 舞台の見取り図。甲板いっぱいに1枚だけ貼る（加算合成）。
 *
 * ★繰り返しタイルだけの床は、どこを見ても同じで「広い board」に見える。
 *   中心・区画・外周を1枚の図として描くと、初めて「設計された場所」になる。
 * ★真円は使わない。12角形と直線だけで組む。
 */
export function makeDeckDecalTexture(floor = {}, size = 1024) {
  const F = { ...FLOOR_DEF, ...floor };
  const cv = newCanvas(size, size);
  const g = cv.getContext('2d');
  const c = size / 2;
  const col = (a) => `rgba(${F.seam}, ${a})`;
  const R = (t) => size * t;          // 0..0.5 を半径に

  // --- 外周の二重リング（甲板の縁を図として締める）---
  g.lineJoin = 'miter';
  g.strokeStyle = col(0.34); g.lineWidth = 5;
  chamferPoly(g, c, c, R(0.468), 12, 0.0); g.stroke();
  g.strokeStyle = col(0.16); g.lineWidth = 2;
  chamferPoly(g, c, c, R(0.436), 12, 0.0); g.stroke();

  // --- 12本の主線。中心から頂点へ通す ---
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const big = i % 3 === 0;
    g.strokeStyle = col(big ? 0.24 : 0.11);
    g.lineWidth = big ? 4 : 2;
    g.beginPath();
    g.moveTo(c + Math.cos(a) * R(0.075), c + Math.sin(a) * R(0.075));
    g.lineTo(c + Math.cos(a) * R(0.436), c + Math.sin(a) * R(0.436));
    g.stroke();
    // 主線の先端に短い直交のかんぬき
    if (big) {
      const nx = -Math.sin(a), ny = Math.cos(a);
      const px = c + Math.cos(a) * R(0.40), py = c + Math.sin(a) * R(0.40);
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(px - nx * R(0.045), py - ny * R(0.045));
      g.lineTo(px + nx * R(0.045), py + ny * R(0.045));
      g.stroke();
    }
  }

  // --- 中区画のリング ---
  g.strokeStyle = col(0.22); g.lineWidth = 3;
  chamferPoly(g, c, c, R(0.215), 12, 0.10); g.stroke();
  g.strokeStyle = col(0.10); g.lineWidth = 1.5;
  chamferPoly(g, c, c, R(0.196), 12, 0.10); g.stroke();

  // --- 区画番号のかわりの目盛。12方向のあいだに刻む ---
  for (let i = 0; i < 24; i++) {
    if (i % 2 === 0) continue;
    const a = (i / 24) * Math.PI * 2;
    g.strokeStyle = col(0.13); g.lineWidth = 3;
    g.beginPath();
    g.moveTo(c + Math.cos(a) * R(0.395), c + Math.sin(a) * R(0.395));
    g.lineTo(c + Math.cos(a) * R(0.436), c + Math.sin(a) * R(0.436));
    g.stroke();
  }

  // --- 中央の紋章。向かい合う楔 ---
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const half = 0.10;
    const pt = (ang, r) => [c + Math.cos(ang) * r, c + Math.sin(ang) * r];
    const p0 = pt(a - half * 0.3, R(0.024)), p1 = pt(a - half, R(0.088));
    const p2 = pt(a + half, R(0.088)), p3 = pt(a + half * 0.3, R(0.024));
    g.fillStyle = col(i % 2 ? 0.07 : 0.14);
    g.beginPath();
    g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]);
    g.lineTo(p2[0], p2[1]); g.lineTo(p3[0], p3[1]);
    g.closePath(); g.fill();
  }
  g.strokeStyle = col(0.45); g.lineWidth = 4;
  chamferPoly(g, c, c, R(0.036), 6, 0.18); g.stroke();
  g.strokeStyle = col(0.20); g.lineWidth = 2;
  chamferPoly(g, c, c, R(0.128), 12, 0.12); g.stroke();

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * 外周の警戒帯。斜めの縞。
 * ★「ここから先は場外」を色で言い切る。線1本より、帯の方が遠くから読める。
 */
export function makeHazardTexture(floor = {}, w = 256, h = 64) {
  const F = { ...FLOOR_DEF, ...floor };
  const cv = newCanvas(w, h);
  const g = cv.getContext('2d');

  g.fillStyle = 'rgba(12, 14, 26, 0.92)';
  g.fillRect(0, 0, w, h);

  g.fillStyle = F.hazard;
  const step = 32;
  for (let x = -h; x < w + h; x += step) {
    g.beginPath();
    g.moveTo(x, 0); g.lineTo(x + step * 0.5, 0);
    g.lineTo(x + step * 0.5 - h, h); g.lineTo(x - h, h);
    g.closePath(); g.fill();
  }
  // 擦れ。真新しい標識は嘘くさい
  for (let i = 0; i < 60; i++) {
    const px = hash2(i, 5, 191) * w, py = hash2(i, 9, 193) * h;
    g.fillStyle = `rgba(10, 12, 22, ${0.10 + hash2(i, 11, 197) * 0.3})`;
    g.fillRect(px, py, 2 + hash2(i, 13, 199) * 22, 1 + hash2(i, 17, 211) * 4);
  }
  g.fillStyle = 'rgba(8, 10, 20, 0.85)';
  g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3);

  const tex = new THREE.CanvasTexture(cv);
  // ★両方向とも繰り返しにする。板を寝かせた後どちらの軸が辺に沿うかは
  //   ジオメトリ側の都合で決まるので、片方を Clamp にすると縞が伸び切る
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

