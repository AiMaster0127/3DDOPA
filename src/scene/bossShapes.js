/**
 * ボスのシルエット。
 *
 * ★ボスは1体しか出ない見せ場なので、雑魚の形を流用しない。
 *   三角形の予算も雑魚（1体130まで）とは桁が違ってよい。
 *
 * ★迫力の作り方（見下ろし視点で効くもの）
 *   1. **上面に情報を置く。** 画面に映るのはボスの上半分だけ。
 *      肩当て・背の棘・角の張り出し・発光核を上から読めるように配置する。
 *      腹や脚をいくら作っても見えない。
 *   2. **一枚板にしない。** 装甲を重ねてズラすと、同じ体積でも重く見える。
 *   3. **前傾させる。** 垂直に立たせると置物になる。少し前へ倒すだけで「来る」。
 *   4. **横へ張り出させる。** 角・翼・肩で幅を稼ぐと、実寸以上に大きく見える。
 *      ★ただし当たり判定に合わせる基準は「胴の幅」（hitHalf）にすること。
 *        最大幅に合わせると、翼や角を伸ばすほど全体が縮んで小さく見える
 *        （実際、翼を付けた雷龍が自機と同じ大きさになった）。
 *        角の先や翼端は判定の外へはみ出してよい。中身が痩せる方が問題。
 *
 * ★配色は敵と同じ言語（黒い装甲＋深紅の発光核＋骨の角＋金具）を使う。
 *   色は頂点カラーで焼き、BossView は1マテリアルのまま
 *   「溜め＝黄／突進＝赤」の状態色を全体に乗せられるようにしている。
 */
import * as THREE from '../../vendor/three/three.module.min.js';
import { mergeParts } from './geometry.js';

export const BOSS_PAL = {
  body: 0x24242c,
  edge: 0x3a3a48,
  core: 0xff2c2c,
  bone: 0xe0d4b4,
  metal: 0xd0a13c,
};

const CORE_MUL = 2.6;

/**
 * 胴の半幅を記録する。BossView がこれを当たり判定に合わせる。
 * ★境界箱の最大値を使ってはいけない。角や翼まで含めてしまい、
 *   派手な形ほど縮む。
 */
function tag(geo, hitHalf) { geo.userData.hitHalf = hitHalf; return geo; }

/** 背骨に沿って棘を並べる。上から見たときの「背中」の情報量になる */
function spine(P, out, n, y0, z0, dz, len, r) {
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    out.push({
      geo: new THREE.ConeGeometry(r * (1 - t * 0.45), len * (1 - t * 0.4), 4),
      pos: [0, y0 - t * 0.25, z0 + dz * i],
      rot: [-0.55 - t * 0.3, 0, 0],
      color: P.bone,
    });
  }
}

const BUILDERS = {
  /**
   * 業角（ゴアホーン）：突進する鬼。質量で押す。
   * 前傾した重い胴に、前へ薙ぐ大角と張り出した肩当て。
   */
  gorehorn: (P) => {
    const m = [];
    // ★横幅は当たり判定に合わせて縮められるので、幅を稼いでも大きく見えない。
    //   迫力は「高さ」で作る。腕は内側へ寄せ、角と頭を上へ伸ばす。
    // 腰の装甲。自機のコートと同じ「上すぼまり・下広がり」で系統を揃える
    m.push({ geo: new THREE.CylinderGeometry(0.74, 1.10, 0.86, 8, 1, true), pos: [0, 0.62, 0], color: P.body });
    m.push({ geo: new THREE.CylinderGeometry(0.66, 0.99, 0.82, 8, 1, true), pos: [0, 0.62, 0], color: P.core, mul: 0.9 });

    // 脚
    for (const sx of [-1, 1]) {
      m.push({ geo: new THREE.BoxGeometry(0.48, 0.86, 0.56), pos: [sx * 0.40, 0.42, -0.06], color: P.body });
      m.push({ geo: new THREE.BoxGeometry(0.54, 0.20, 0.66), pos: [sx * 0.40, 0.10, 0.02], color: P.edge });
    }

    // 胴。上段を前へ倒して「のしかかる」姿勢にする
    m.push({ geo: new THREE.BoxGeometry(1.30, 0.90, 1.20), pos: [0, 1.22, 0.02], color: P.body });
    m.push({ geo: new THREE.BoxGeometry(1.38, 0.94, 1.08), pos: [0, 1.92, 0.10], rot: [0.20, 0, 0], color: P.edge });
    // 胸当てと発光核
    m.push({ geo: new THREE.BoxGeometry(0.96, 0.72, 0.24), pos: [0, 1.88, 0.62], rot: [0.20, 0, 0], color: P.body });
    m.push({ geo: new THREE.BoxGeometry(0.42, 0.34, 0.14), pos: [0, 1.86, 0.74], rot: [0.20, 0, 0], color: P.core, mul: CORE_MUL });
    // 装甲の割れ目から漏れる光。★上から見える位置に置くこと
    m.push({ geo: new THREE.BoxGeometry(0.84, 0.06, 0.10), pos: [0, 2.34, 0.02], color: P.core, mul: CORE_MUL });
    m.push({ geo: new THREE.BoxGeometry(0.10, 0.60, 0.06), pos: [0, 1.55, 0.62], color: P.core, mul: CORE_MUL * 0.7 });

    // 肩当て
    for (const sx of [-1, 1]) {
      m.push({ geo: new THREE.BoxGeometry(0.62, 0.58, 0.94), pos: [sx * 0.84, 2.06, 0.02], rot: [0, 0, sx * -0.30], color: P.body });
      m.push({ geo: new THREE.BoxGeometry(0.54, 0.16, 0.82), pos: [sx * 0.90, 2.34, 0.02], rot: [0, 0, sx * -0.30], color: P.edge });
      // 鋲（金）。上面に打つので見下ろしでも光る
      for (let i = -1; i <= 1; i++) {
        m.push({ geo: new THREE.ConeGeometry(0.09, 0.20, 4), pos: [sx * 0.90, 2.42, i * 0.28], rot: [0, 0, sx * -0.30], color: P.metal });
      }
      // 腕と拳。内側へ寄せて、幅ではなく厚みで見せる
      m.push({ geo: new THREE.BoxGeometry(0.40, 1.24, 0.44), pos: [sx * 0.88, 1.30, 0.16], rot: [0, 0, sx * -0.06], color: P.body });
      m.push({ geo: new THREE.BoxGeometry(0.54, 0.48, 0.60), pos: [sx * 0.92, 0.52, 0.28], color: P.edge });
      m.push({ geo: new THREE.ConeGeometry(0.10, 0.32, 4), pos: [sx * 0.92, 0.52, 0.60], rot: [Math.PI / 2, Math.PI / 4, 0], color: P.bone });
    }

    // 首と頭。胴に埋めて猪首にする
    m.push({ geo: new THREE.BoxGeometry(0.76, 0.62, 0.70), pos: [0, 2.52, 0.40], rot: [0.14, 0, 0], color: P.body });
    m.push({ geo: new THREE.BoxGeometry(0.64, 0.24, 0.48), pos: [0, 2.28, 0.60], rot: [0.14, 0, 0], color: P.bone });
    for (const sx of [-1, 1]) {
      m.push({ geo: new THREE.BoxGeometry(0.19, 0.09, 0.06), pos: [sx * 0.19, 2.58, 0.74], color: P.core, mul: CORE_MUL });
    }

    // 大角。★輪郭はほぼこれで決まる。前へ倒しすぎると幅の計算に効いて
    //   全体が縮むので、上へ立てる
    for (const sx of [-1, 1]) {
      m.push({ geo: new THREE.ConeGeometry(0.26, 2.05, 5), pos: [sx * 0.40, 2.86, 0.22], rot: [0.52, 0, sx * 0.26], color: P.bone });
      m.push({ geo: new THREE.ConeGeometry(0.15, 1.02, 5), pos: [sx * 0.60, 2.62, -0.14], rot: [0.14, 0, sx * 0.66], color: P.bone });
      m.push({ geo: new THREE.CylinderGeometry(0.18, 0.18, 0.12, 6), pos: [sx * 0.40, 2.56, 0.06], rot: [0.52, 0, sx * 0.26], color: P.metal });
    }

    // 背の棘
    spine(P, m, 5, 2.46, -0.30, -0.20, 0.70, 0.16);
    return tag(mergeParts(m), 1.21);        // 胴＋肩当ての幅
  },

  /**
   * 虚喰い（ヴォイドモウ）：浮かぶ顎。脚を持たない。
   * 牙の並んだ顎と、下に垂れる裂けた衣。
   */
  voidmaw: (P) => {
    const m = [];
    // 裂けた衣。下へ広がって「浮いている大きさ」を作る
    m.push({ geo: new THREE.CylinderGeometry(0.52, 1.34, 1.34, 8, 1, true), pos: [0, 0.80, 0], color: P.body });
    m.push({ geo: new THREE.CylinderGeometry(0.46, 1.20, 1.30, 8, 1, true), pos: [0, 0.80, 0], color: P.core, mul: 0.7 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.3;
      // 裾の裂け目
      m.push({ geo: new THREE.ConeGeometry(0.20, 0.80, 3),
               pos: [Math.cos(a) * 1.14, 0.02, Math.sin(a) * 1.14],
               rot: [Math.PI, 0, 0], color: P.body });
      // 縦のリブ。一枚の円錐のままだと「傘」に見える
      m.push({ geo: new THREE.BoxGeometry(0.10, 1.30, 0.08),
               pos: [Math.cos(a) * 0.98, 0.82, Math.sin(a) * 0.98],
               rot: [Math.cos(a) * 0.30, -a, -Math.sin(a) * 0.30], color: P.edge });
    }

    // 顎。上下に分けて開いた口にする
    m.push({ geo: new THREE.OctahedronGeometry(0.92, 0), pos: [0, 1.72, -0.10], scale: [1.05, 0.78, 1.0], color: P.body });
    // ★上下の顎を開く。閉じたままだと核も牙も見えず、ただの棘の塊になる
    m.push({ geo: new THREE.BoxGeometry(1.44, 0.34, 1.10), pos: [0, 2.06, 0.34], rot: [-0.30, 0, 0], color: P.edge });
    m.push({ geo: new THREE.BoxGeometry(1.24, 0.28, 0.92), pos: [0, 1.22, 0.40], rot: [0.34, 0, 0], color: P.edge });

    // 牙
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * 0.28;
      m.push({ geo: new THREE.ConeGeometry(0.11, 0.50, 4), pos: [x, 1.82, 0.62], rot: [Math.PI + 0.30, 0, 0], color: P.bone });
      if (i < 4) m.push({ geo: new THREE.ConeGeometry(0.10, 0.44, 4), pos: [x + 0.14, 1.42, 0.68], rot: [0.34, 0, 0], color: P.bone });
    }

    // 喉の奥の核。口を開けているので上からも見える
    m.push({ geo: new THREE.OctahedronGeometry(0.52, 0), pos: [0, 1.62, 0.24], color: P.core, mul: CORE_MUL });

    // 眼。顎の上に一対
    for (const sx of [-1, 1]) {
      m.push({ geo: new THREE.BoxGeometry(0.32, 0.11, 0.08), pos: [sx * 0.36, 2.26, 0.58], rot: [-0.30, 0, sx * 0.18], color: P.core, mul: CORE_MUL });
    }

    // 冠の棘。上へ大きく張り出させる
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const big = i % 2 === 0;
      m.push({
        geo: new THREE.ConeGeometry(big ? 0.15 : 0.10, big ? 1.25 : 0.80, 4),
        pos: [Math.cos(a) * 0.62, 2.34, Math.sin(a) * 0.62 - 0.10],
        rot: [Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55],
        color: P.bone,
      });
    }

    // 浮遊する破片。ぐるりと囲ませると「制御している」感じが出る
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.5;
      m.push({ geo: new THREE.OctahedronGeometry(0.22, 0),
               pos: [Math.cos(a) * 1.62, 1.42 + Math.sin(i * 2.1) * 0.25, Math.sin(a) * 1.62],
               scale: [0.7, 1.3, 0.7], color: P.edge });
    }
    return tag(mergeParts(m), 1.34);        // 衣の裾の幅（破片は外して測る）
  },

  /**
   * 雷龍（ライリュウ）：立ち上がった蛇。設定画の龍の紋章を実体にした。
   * 高さと翼で幅を取り、他の2体と輪郭で被らないようにしている。
   */
  drake: (P) => {
    const m = [];
    // ★とぐろは螺旋に置く。真上へ積むと蛇ではなく「箱を積んだ塔」になる
    //   （実際そうなった）。角度と半径を少しずつ変えて巻き上げる。
    const N = 9;                               // ★重ねる。間が空くと積み木に見える
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const a2 = i * 0.86;                       // 巻き角
      const rad = 0.80 * (1 - t * 0.72);         // 上へ行くほど内へ
      const w = 1.12 * (1 - t * 0.44);           // 上へ行くほど細く
      const x = Math.cos(a2) * rad, z = Math.sin(a2) * rad;
      const y = 0.40 + t * 1.62;
      m.push({ geo: new THREE.BoxGeometry(w, w * 0.86, w * 1.15), pos: [x, y, z], rot: [0, -a2 + Math.PI / 2, 0],
               color: i % 2 ? P.edge : P.body });
      // 腹の板
      m.push({ geo: new THREE.BoxGeometry(w * 0.62, 0.10, w * 1.18), pos: [x, y - w * 0.40, z], rot: [0, -a2 + Math.PI / 2, 0],
               color: P.bone });
      // 鱗の隙間から漏れる雷。★上面に置いて見下ろしでも読めるようにする
      m.push({ geo: new THREE.BoxGeometry(w * 0.40, 0.09, w * 1.02), pos: [x, y + w * 0.42, z], rot: [0, -a2 + Math.PI / 2, 0],
               color: P.core, mul: CORE_MUL * 0.8 });
    }
    // 尾。巻きの外へ流す
    m.push({ geo: new THREE.ConeGeometry(0.40, 1.35, 4), pos: [0.92, 0.34, -0.62], rot: [1.35, -0.7, 0], color: P.body });

    // 翼。板を左右に大きく張り出させる。幅は判定より外へ出てよい
    for (const sx of [-1, 1]) {
      m.push({ geo: new THREE.BoxGeometry(2.05, 0.10, 1.00), pos: [sx * 1.30, 1.86, -0.18], rot: [0, sx * 0.26, sx * 0.34], color: P.edge });
      m.push({ geo: new THREE.BoxGeometry(1.85, 0.06, 0.36), pos: [sx * 1.30, 1.96, 0.20], rot: [0, sx * 0.26, sx * 0.34], color: P.core, mul: 1.7 });
      m.push({ geo: new THREE.ConeGeometry(0.13, 0.66, 3), pos: [sx * 2.32, 2.26, -0.36], rot: [0, 0, sx * -1.15], color: P.bone });
      m.push({ geo: new THREE.ConeGeometry(0.10, 0.50, 3), pos: [sx * 2.02, 1.54, 0.24], rot: [0, 0, sx * -1.35], color: P.bone });
      m.push({ geo: new THREE.BoxGeometry(0.56, 0.15, 0.20), pos: [sx * 0.52, 1.90, -0.12], rot: [0, 0, sx * 0.34], color: P.bone });
    }

    // 首と頭。巻きの頂点から前へ伸ばす
    m.push({ geo: new THREE.BoxGeometry(0.58, 0.50, 0.68), pos: [0.02, 2.52, 0.34], rot: [0.42, 0, 0], color: P.body });
    m.push({ geo: new THREE.BoxGeometry(0.68, 0.48, 0.88), pos: [0, 2.92, 0.86], rot: [0.20, 0, 0], color: P.edge });
    m.push({ geo: new THREE.ConeGeometry(0.33, 0.74, 4), pos: [0, 2.85, 1.34], rot: [Math.PI / 2, Math.PI / 4, 0], color: P.body });
    // 口の中の雷
    m.push({ geo: new THREE.BoxGeometry(0.30, 0.11, 0.38), pos: [0, 2.76, 1.32], color: P.core, mul: CORE_MUL });
    for (const sx of [-1, 1]) {
      m.push({ geo: new THREE.BoxGeometry(0.22, 0.09, 0.08), pos: [sx * 0.21, 3.02, 1.16], color: P.core, mul: CORE_MUL });
      m.push({ geo: new THREE.ConeGeometry(0.12, 1.05, 4), pos: [sx * 0.26, 3.22, 0.56], rot: [-0.85, 0, sx * 0.28], color: P.bone });
      m.push({ geo: new THREE.ConeGeometry(0.08, 0.56, 3), pos: [sx * 0.37, 2.98, 0.86], rot: [-0.4, 0, sx * 0.75], color: P.bone });
      m.push({ geo: new THREE.BoxGeometry(0.05, 0.05, 0.78), pos: [sx * 0.28, 2.74, 1.30], rot: [0.5, sx * 0.3, 0], color: P.bone });
    }

    // 背びれ
    spine(P, m, 5, 2.20, -0.10, -0.28, 0.62, 0.15);
    return tag(mergeParts(m), 1.30);        // とぐろの幅（翼は外して測る）
  },
};

/**
 * @param {string} kind data/enemies.js の visual.boss（ボス専用の形の名前）
 * @param {object} pal  visual.pal（BOSS_PAL を上書き）
 */
export function makeBossGeometry(kind, pal) {
  const build = BUILDERS[kind];
  const P = pal ? { ...BOSS_PAL, ...pal } : BOSS_PAL;
  if (!build) {
    console.warn(`未知の boss 形状: ${kind}。gorehorn で代用する`);
    return BUILDERS.gorehorn(P);
  }
  return build(P);
}

export const BOSS_SHAPES = Object.keys(BUILDERS);

/** 三角形数（予算確認用）。ボスは1体しか出ないので雑魚より緩くてよい。 */
export function countBossTriangles() {
  const out = {};
  for (const k of BOSS_SHAPES) {
    const g = makeBossGeometry(k);
    out[k] = g.attributes.position.count / 3;
    g.dispose();
  }
  return out;
}
