/**
 * 人型キャラクターのシルエット生成。
 *
 * ★デザインの基準（設定画に合わせる）
 *   - チビ体型。頭が全高の約4割を占める。頭が小さいと途端に「ただの人形」になる
 *   - 逆立った髪。**上から見て一番面積を取るのはここ**なので、
 *     見下ろし視点のゲームでは髪型がそのままキャラの識別子になる
 *   - 立ち襟 → 肩 → 裾の広がるコート、という「上すぼまり・下広がり」の三角形
 *   - 黒レザーの外側と**深紅の裏地**。裏地が見えないと、ただの黒い塊になる
 *   - 金具（バックル・留め具）で黒の中に硬い点を打つ
 *
 * ★色は頂点カラーで焼き込み、1体を2メッシュ（マット／金属）に収める。
 *   素直にマテリアルを分けると 黒・赤・金・肌・髪 で5 draw call になる。
 *
 * ★暗い体色で自機の視認性が落ちる問題について：
 *   床の輝度を38前後まで上げたので、黒い体は「中間色の床に落ちた影」として読める。
 *   そのうえでリムライト・深紅・金・足元のオーラで輪郭を保証している。
 *   床が真っ黒だった頃にこの配色をやると自機を見失う。順番が逆にできない。
 */
import * as THREE from '../../vendor/three/three.module.min.js';
import { mergeParts } from './geometry.js';

/** 既定の配色。data/characters.js の visual がこれを上書きする。 */
export const CHAR_STYLE = {
  hair: 0x16171f,        // ほぼ黒。真っ黒にすると陰影が死ぬ
  hairTip: 0xc7b193,     // 毛先の明るい筋。上から見たときの識別に効く
  skin: 0xf0d6ba,
  eye: 0x3a2118,
  coat: 0x22242f,        // 黒レザー（わずかに青寄り）
  lining: 0x8e1522,      // 深紅の裏地
  cloth: 0x15161d,       // シャツ・ズボン
  metal: 0xd0a03c,       // 金具
  hairStyle: 'spiky',
  coatLen: 1.0,
};

// ───────────────────────── 髪 ─────────────────────────

/**
 * 逆立った髪。錐を放射状に生やす。
 * ★真上から見えるので、本数と傾きがキャラの見分けを決める。
 */
function spikyHair(S, out, cy, r) {
  // 地髪。★頭と同心に置くと顔まで覆って「黒い塊」になる（実際そうなった）。
  //   上へ 0.10・後ろへ 0.08 ずらし、目の高さでは髪より前に顔が出るようにする。
  out.push({ geo: new THREE.SphereGeometry(r * 1.16, 12, 8), pos: [0, cy + 0.12, -0.08],
             scale: [1.04, 0.88, 1.02], color: S.hair });
  // 後頭部から襟足へ
  out.push({ geo: new THREE.SphereGeometry(r * 0.88, 10, 7), pos: [0, cy - 0.12, -0.16],
             scale: [1.0, 0.86, 0.80], color: S.hair });
  // もみあげ。頬の横に落として輪郭を締める
  for (const sx of [-1, 1]) {
    out.push({ geo: new THREE.ConeGeometry(r * 0.15, r * 0.75, 3),
               pos: [sx * r * 0.92, cy - 0.02, r * 0.30],
               rot: [Math.PI * 0.96, 0, sx * -0.18], color: S.hair });
  }

  // 前髪。額の上から目の手前まで垂らす。目にはかからない高さで止める
  for (let i = 0; i < 4; i++) {
    const x = (i - 1.5) * r * 0.44;
    out.push({
      geo: new THREE.ConeGeometry(r * 0.22, r * 0.80, 3),
      pos: [x, cy + 0.24, r * 0.58],
      rot: [Math.PI * (0.86 + (i % 2) * 0.05), i * 0.7, x > 0 ? -0.2 : 0.2],
      color: i === 1 ? S.hairTip : S.hair,
    });
  }

  // 逆立てた房。3本だけ毛先を明るくして、上から見たときの目印にする
  const SPIKES = [
    [0.00, 0.42, -0.10, 0.64, -0.22, 0],
    [0.30, 0.40, 0.02, 0.56, -0.08, 0.48],
    [-0.32, 0.39, 0.00, 0.58, -0.10, -0.52],
    [0.16, 0.44, -0.26, 0.60, -0.58, 0.22],
    [-0.18, 0.43, -0.24, 0.54, -0.54, -0.24],
    [0.44, 0.26, -0.18, 0.46, -0.32, 0.82],
    [-0.46, 0.24, -0.16, 0.44, -0.30, -0.84],
    [0.08, 0.38, 0.26, 0.46, 0.62, 0.12],
    [-0.12, 0.36, 0.28, 0.40, 0.66, -0.16],
    [0.26, 0.34, -0.34, 0.50, -0.85, 0.30],
    [-0.28, 0.33, -0.32, 0.48, -0.82, -0.32],
  ];
  SPIKES.forEach(([x, y, z, len, tiltX, tiltZ], i) => {
    out.push({
      geo: new THREE.ConeGeometry(r * 0.21, len, 4),
      pos: [x * r * 2.4, cy + y, z * r * 2.0],
      rot: [tiltX, 0, tiltZ],
      // ★上から見て一番面積を取るのが毛先。ここを明るくしないと
      //   暗い床の上で自機が消える
      color: i % 2 === 0 ? S.hairTip : S.hair,
    });
  });
}

/** 短髪。房を寝かせる。落ち着いた印象になる */
function shortHair(S, out, cy, r) {
  out.push({ geo: new THREE.SphereGeometry(r * 1.04, 12, 8), pos: [0, cy + 0.11, -0.07],
             scale: [1.03, 0.84, 1.0], color: S.hair });
  for (let i = 0; i < 3; i++) {
    out.push({ geo: new THREE.ConeGeometry(r * 0.20, r * 0.62, 3),
               pos: [(i - 1) * r * 0.52, cy + 0.24, r * 0.56],
               rot: [Math.PI * 0.90, 0, 0], color: S.hair });
  }
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    out.push({
      geo: new THREE.ConeGeometry(r * 0.20, r * 0.5, 4),
      pos: [Math.cos(a) * r * 0.72, cy + 0.16, Math.sin(a) * r * 0.72],
      rot: [Math.cos(a) * 1.15, 0, -Math.sin(a) * 1.15],
      color: i === 1 ? S.hairTip : S.hair,
    });
  }
}

/** 長髪。背中まで伸ばした板を足す */
function longHair(S, out, cy, r) {
  spikyHair(S, out, cy, r);
  out.push({ geo: new THREE.BoxGeometry(r * 1.5, r * 2.4, r * 0.5), pos: [0, cy - r * 1.25, -r * 0.78],
             rot: [0.10, 0, 0], color: S.hair });
  out.push({ geo: new THREE.ConeGeometry(r * 0.72, r * 0.9, 4), pos: [0, cy - r * 2.5, -r * 0.72],
             rot: [Math.PI, Math.PI / 4, 0], color: S.hairTip });
}

const HAIR = { spiky: spikyHair, short: shortHair, long: longHair };

/** 用意されている髪型の一覧（データ側の指定ミスを検査するのに使う）。 */
export const HAIR_STYLES = Object.keys(HAIR);

// ───────────────────────── 本体 ─────────────────────────

/**
 * 人型1体分のジオメトリを作る。
 * @param {object} style CHAR_STYLE を上書きする配色・髪型
 * @returns {{matte: THREE.BufferGeometry, metal: THREE.BufferGeometry}}
 */
export function makeCharacterGeometry(style = {}) {
  const S = { ...CHAR_STYLE, ...style };
  const m = [];        // マット（布・革・肌・髪）
  const g = [];        // 金属（金具。metalness を上げたいので分ける）

  const HEAD_Y = 1.20, HEAD_R = 0.37;
  const CL = S.coatLen;

  // ---- ブーツ。厚底で、足元を重くする ----
  for (const sx of [-1, 1]) {
    const x = sx * 0.16;
    m.push({ geo: new THREE.BoxGeometry(0.29, 0.24, 0.38), pos: [x, 0.15, 0.01], color: S.coat });
    m.push({ geo: new THREE.BoxGeometry(0.33, 0.07, 0.44), pos: [x, 0.045, 0.02], color: 0x101116 });
    m.push({ geo: new THREE.BoxGeometry(0.27, 0.10, 0.13), pos: [x, 0.11, 0.23], color: S.coat });
    // 留め具（金）。黒一色の足元に硬い点を打つ
    g.push({ geo: new THREE.BoxGeometry(0.31, 0.035, 0.05), pos: [x, 0.21, 0.18], color: S.metal });
    g.push({ geo: new THREE.BoxGeometry(0.31, 0.035, 0.05), pos: [x, 0.12, 0.20], color: S.metal });
  }

  // ---- 脚。コートの裾との間に必ず隙間を残す（脚が見えないと人形になる）----
  for (const sx of [-1, 1]) {
    m.push({ geo: new THREE.BoxGeometry(0.18, 0.36, 0.20), pos: [sx * 0.145, 0.42, 0], color: S.cloth });
  }

  // ---- コートの裾。上すぼまり・下広がりの八角錐台。正面を開ける ----
  // ★ここの広がりがシルエットの主役。細いと「黒い筒」にしか見えない
  const GAP = 1.05;                                  // 前を開ける角度
  const skirt = (rTop, rBot, h, cy, col, seg) => ({
    geo: new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, true, GAP / 2, Math.PI * 2 - GAP),
    pos: [0, cy, 0], color: col,
  });
  const HEM = 0.34, WAIST = 0.96;                    // 裾の下端／腰
  const hLen = (WAIST - HEM) * CL;
  m.push(skirt(0.30, 0.72 * CL, hLen, WAIST - hLen / 2, S.coat, 8));
  // ★裏地。外皮より一回り小さい同じ形を内側に入れる。
  //   これが無いと、どの角度から見ても「ただの黒い塊」になる
  m.push(skirt(0.26, 0.65 * CL, hLen * 0.97, WAIST - hLen / 2, S.lining, 8));

  // 前の垂れ（コートの合わせ）。左右2枚。裾より少し長く落とす
  for (const sx of [-1, 1]) {
    m.push({ geo: new THREE.BoxGeometry(0.22, hLen + 0.10, 0.05), pos: [sx * 0.24, WAIST - hLen / 2 - 0.05, 0.27],
             rot: [0, sx * -0.26, sx * 0.07], color: S.coat });
    m.push({ geo: new THREE.BoxGeometry(0.17, hLen + 0.06, 0.03), pos: [sx * 0.22, WAIST - hLen / 2 - 0.05, 0.24],
             rot: [0, sx * -0.26, sx * 0.07], color: S.lining });
  }

  // ---- 胴。シャツ ----
  m.push({ geo: new THREE.BoxGeometry(0.36, 0.40, 0.24), pos: [0, 0.80, 0], color: S.cloth });

  // ---- ベルトと金具 ----
  m.push({ geo: new THREE.BoxGeometry(0.46, 0.09, 0.30), pos: [0, 0.92, 0], color: S.coat });
  g.push({ geo: new THREE.BoxGeometry(0.13, 0.11, 0.06), pos: [0, 0.92, 0.16], color: S.metal });

  // ---- 肩とコートの上半身。頭の幅に負けないよう広く取る ----
  m.push({ geo: new THREE.BoxGeometry(0.62, 0.30, 0.32), pos: [0, 1.00, -0.01], color: S.coat });
  for (const sx of [-1, 1]) {
    // 肩当て。外へ張り出させて「上が広い」印象を作る
    m.push({ geo: new THREE.BoxGeometry(0.20, 0.20, 0.32), pos: [sx * 0.38, 1.03, -0.01],
             rot: [0, 0, sx * 0.26], color: S.coat });
    // 腕（袖）
    m.push({ geo: new THREE.BoxGeometry(0.16, 0.30, 0.20), pos: [sx * 0.40, 0.82, 0.01],
             rot: [0, 0, sx * 0.11], color: S.coat });
    // 手袋
    m.push({ geo: new THREE.BoxGeometry(0.17, 0.15, 0.21), pos: [sx * 0.42, 0.62, 0.02], color: S.cloth });
  }

  // ---- 立ち襟。設定画の一番の特徴。首の後ろで跳ね上げる ----
  for (const sx of [-1, 1]) {
    m.push({ geo: new THREE.BoxGeometry(0.09, 0.30, 0.32), pos: [sx * 0.22, 1.16, -0.05],
             rot: [-0.16, 0, sx * 0.30], color: S.coat });
    m.push({ geo: new THREE.BoxGeometry(0.05, 0.27, 0.28), pos: [sx * 0.18, 1.15, -0.05],
             rot: [-0.16, 0, sx * 0.30], color: S.lining });
  }
  m.push({ geo: new THREE.BoxGeometry(0.34, 0.26, 0.08), pos: [0, 1.15, -0.18],
           rot: [0.24, 0, 0], color: S.coat });
  m.push({ geo: new THREE.BoxGeometry(0.30, 0.23, 0.04), pos: [0, 1.14, -0.14],
           rot: [0.24, 0, 0], color: S.lining });

  // ---- 肩と襟の金トリム ----
  // ★見下ろし視点で見えるのは「肩の上面」と「襟の縁」だけ。
  //   胸や腰をいくら作り込んでも画面には出ない。金はここに通す。
  for (const sx of [-1, 1]) {
    g.push({ geo: new THREE.BoxGeometry(0.22, 0.03, 0.30), pos: [sx * 0.38, 1.135, -0.01],
             rot: [0, 0, sx * 0.26], color: S.metal });
    g.push({ geo: new THREE.BoxGeometry(0.05, 0.30, 0.04), pos: [sx * 0.255, 1.16, 0.10],
             rot: [-0.16, 0, sx * 0.30], color: S.metal });
  }
  g.push({ geo: new THREE.BoxGeometry(0.60, 0.03, 0.05), pos: [0, 1.155, 0.145], color: S.metal });

  // ---- 胸の十字。黒の中の小さな金 ----
  g.push({ geo: new THREE.BoxGeometry(0.04, 0.14, 0.03), pos: [0, 1.00, 0.17], color: S.metal });
  g.push({ geo: new THREE.BoxGeometry(0.10, 0.04, 0.03), pos: [0, 1.03, 0.17], color: S.metal });

  // ---- 頭 ----
  m.push({ geo: new THREE.SphereGeometry(HEAD_R, 14, 10), pos: [0, HEAD_Y, 0],
           scale: [1.0, 1.0, 0.95], color: S.skin });
  // 目と眉。見下ろしでは見えないが、拠点の寄りカメラでは効く。
  // ★球の表面より内側に置くと埋まって「顔に開いた穴」になる。
  //   x=0.135 の位置での球面は z≒0.33 なので、そこへ薄く貼り付ける
  for (const sx of [-1, 1]) {
    m.push({ geo: new THREE.BoxGeometry(0.085, 0.075, 0.03), pos: [sx * 0.135, HEAD_Y - 0.015, 0.335],
             rot: [0, sx * -0.20, sx * -0.10], color: S.eye });
    // 目の中の光。これが無いと「黒い点」で生気が出ない
    m.push({ geo: new THREE.BoxGeometry(0.028, 0.028, 0.02), pos: [sx * 0.152, HEAD_Y + 0.012, 0.347],
             rot: [0, sx * -0.20, 0], color: 0xf2f6ff });
    m.push({ geo: new THREE.BoxGeometry(0.105, 0.022, 0.025), pos: [sx * 0.142, HEAD_Y + 0.085, 0.325],
             rot: [0, sx * -0.20, sx * 0.20], color: S.hair });
  }

  // ---- 髪 ----
  (HAIR[S.hairStyle] || spikyHair)(S, m, HEAD_Y, HEAD_R);

  return { matte: mergeParts(m), metal: mergeParts(g) };
}

/** 三角形数を数える（予算確認用）。 */
export function countCharacterTriangles(style) {
  const { matte, metal } = makeCharacterGeometry(style);
  const n = {
    matte: matte.attributes.position.count / 3,
    metal: metal.attributes.position.count / 3,
  };
  n.total = n.matte + n.metal;
  matte.dispose(); metal.dispose();
  return n;
}
