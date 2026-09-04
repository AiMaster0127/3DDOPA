/** ゲーム全体で使う小さな数学ヘルパ。three.js に依存しない。 */

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export const lerp = (a, b, t) => a + (b - a) * t;

/**
 * フレームレート非依存の指数減衰スムージング。
 *
 * lerp(a, b, 0.1) を毎フレーム回す書き方は dt が変わると追従速度が変わって破綻する。
 * damp は「1秒あたりどれだけ縮まるか」を rate で指定するので fps に左右されない。
 */
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

/** 角度を -PI..PI に正規化 */
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** 最短回り（±PI跨ぎを考慮）で角度を補間する */
export function dampAngle(a, b, rate, dt) {
  return a + wrapAngle(b - a) * (1 - Math.exp(-rate * dt));
}

/** 距離の二乗。sqrt を避けるため判定では常にこちらを使う。 */
export const dist2 = (ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az;
  return dx * dx + dz * dz;
};

/** 配列の中央値（破壊的でない。品質判定用なので長さは高々100程度） */
export function median(arr) {
  const s = Array.prototype.slice.call(arr).sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) * 0.5;
}
