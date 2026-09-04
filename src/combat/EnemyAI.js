/**
 * 敵の行動。
 *
 * ★data/enemies.js の `ai` 文字列がそのままここのキーになる。
 *   新しい挙動を足したいときは、この表に関数を1つ追加するだけでよい。
 *
 * 各関数は e.vx / e.vz（希望する移動速度）を書き込むだけにする。
 * 実際の積分・ノックバック・壁処理は EnemyPool.update がまとめて行う。
 */

/** 追いかけるだけ。数で押す雑魚の基本形。 */
function chase(e, player) {
  const dx = player.x - e.x, dz = player.z - e.z;
  const d = Math.hypot(dx, dz) || 1;
  e.vx = (dx / d) * e.speed;
  e.vz = (dz / d) * e.speed;
}

/**
 * 回り込み。
 * 遠いときは接近し、近いと横に流れる。正面から突っ込んでこないので
 * 「気付いたら囲まれている」圧が生まれる。
 */
function strafe(e, player) {
  const dx = player.x - e.x, dz = player.z - e.z;
  const d = Math.hypot(dx, dz) || 1;
  const nx = dx / d, nz = dz / d;

  // 接近成分：遠いほど強く、至近では負（張り付きすぎず離れ直す）
  const approach = d > 7 ? 1 : d > 3.2 ? 0.35 : -0.25;
  // 旋回成分：法線方向 (-nz, nx) へ e.aiSide 側に流れる
  const orbit = d < 11 ? 0.85 : 0.2;

  e.vx = (nx * approach + -nz * orbit * e.aiSide) * e.speed;
  e.vz = (nz * approach + nx * orbit * e.aiSide) * e.speed;
}

export const AI = { chase, strafe };
