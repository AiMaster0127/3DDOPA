/**
 * 属性と、そのエフェクト色。
 *
 * ★属性を1つ増やす＝ここに1件足す。武器・敵・耐性・弾の色が同時に追従する。
 *   validate.js が「未知の属性」と「色の抜け」を検出する。
 *
 * ★色の決め方には**役割のルール**がある。
 *   - 自機の弾  … 属性そのままの色。自分の武器が何をしているか判る
 *   - 敵の弾    … **必ず暖色（赤・橙・琥珀・赤紫）に留める。**
 *     氷でも雷でも寒色にしてはいけない。この作品では寒色＝味方側の信号で、
 *     敵弾を水色にした瞬間「避けるべき物」に見えなくなる。
 *     属性の違いは色ではなく**形と大きさ**で伝える（敵弾は棘、自機弾は流線）。
 */
export const ELEMENTS = ['none', 'fire', 'ice', 'thunder', 'dark'];

/** 属性名 → 添字。弾は数値1つだけ持てばよくなる（毎フレームの文字列比較を避ける） */
export const ELEMENT_INDEX = Object.fromEntries(ELEMENTS.map((e, i) => [e, i]));

/** 自機の弾。属性の色をそのまま出す */
export const ELEMENT_FX = [
  { bullet: 0xffe9a8, glow: 0xfff2cc },   // none    金
  { bullet: 0xff8a3c, glow: 0xffb070 },   // fire    橙
  { bullet: 0x8fdcff, glow: 0xc8f0ff },   // ice     水色
  { bullet: 0xffe23a, glow: 0xfff59a },   // thunder 黄
  { bullet: 0xc07bff, glow: 0xdcb0ff },   // dark    紫
];

/** 敵の弾。★属性が何であれ暖色に留める（危険信号を壊さない） */
export const HOSTILE_FX = [
  { bullet: 0xff5a6e, glow: 0xff8fa0 },   // none    赤
  { bullet: 0xff6a2a, glow: 0xff9a5c },   // fire    朱
  { bullet: 0xff7fa8, glow: 0xffaecb },   // ice     赤紫（水色にはしない）
  { bullet: 0xffb02a, glow: 0xffd070 },   // thunder 琥珀（水色にはしない）
  { bullet: 0xe04cff, glow: 0xefa0ff },   // dark    赤紫
];

/** @returns {number} 未知の属性でも落ちない。0（無属性）に倒す */
export function elementIndex(name) {
  const i = ELEMENT_INDEX[name];
  return i === undefined ? 0 : i;
}
