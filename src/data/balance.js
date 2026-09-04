/**
 * バランス定数の一元管理。
 * 数値の調整はコードを追わずここだけを見れば済むようにする。
 * （フェーズが進むごとに combat / runLevel / difficulty などの節が増える）
 */
export const BALANCE = {
  /** アリーナ（フェーズ1で使うのはここまで） */
  arena: {
    radius: 34,          // 円形闘技場の半径（m相当）
    wallHeight: 3.2,
    wallCount: 64,       // 外周ブロックの個数
    decorCount: 46,      // 内部の装飾（岩・柱）
  },

  /** 自機の移動特性 */
  player: {
    radius: 0.55,
    height: 1.7,
    maxSpeed: 8.2,       // 最高速度（単位/秒）
    accel: 62,           // 加速度。大きいほどキビキビ動く
    friction: 14,        // 入力を離したときの減速率
    turnRate: 16,        // 向きの追従速度（damp の rate）
  },

  /** カメラ追従 */
  camera: {
    // 俯角は約62度。これより浅いと視界がアリーナ外へ抜けて「地平線」が見えてしまう
    offset: { x: 0, y: 15.8, z: 8.2 },
    lead: 2.4,           // 進行方向への先読み距離
    followRate: 7.5,     // 追従の速さ（damp の rate）
    lookAtHeight: 1.2,
    // fov は基準アスペクト(refAspect)における垂直FOV。
    // 縦持ちでは水平視界が潰れるので、垂直FOVを fovMax まで広げて補正する
    fov: 52,
    fovMax: 70,
    refAspect: 1.6,
    near: 0.5,
    far: 95,
  },
};
