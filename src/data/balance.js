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

  /** 自機の戦闘能力 */
  combatPlayer: {
    maxHp: 120,
    iframe: 0.55,        // 被弾後の無敵秒数。囲まれて即溶けるのを防ぐ
    pickupRange: 2.2,    // フェーズ3のEXP回収で使用
  },

  /** ダメージ計算 */
  combat: {
    minDamage: 1,
    // 属性相性。attacker属性 → defender属性 の倍率（未定義は1.0）
    // 敵側の resist（正=耐性 / 負=弱点）と乗算される
    elementChart: {
      fire:    { ice: 1.25, thunder: 0.85 },
      ice:     { thunder: 1.25, fire: 0.85 },
      thunder: { fire: 1.25, ice: 0.85 },
      dark:    { none: 1.15 },
    },
    knockDecay: 11,      // ノックバック速度の減衰率
    hitFlash: 0.16,      // 被弾時の白フラッシュ持続秒
    contactCd: 0.7,      // 敵1体が連続で接触ダメージを与える間隔
  },

  /** 湧き（フェーズ2は単純な連続湧き。ウェーブ/ステージ制はフェーズ5） */
  spawn: {
    startRate: 1.6,      // 秒あたりの湧き数（開始時）
    rampPerSec: 0.035,   // 経過1秒ごとの増加量
    maxRate: 9.0,
    // 画面内に湧くと理不尽なので最小距離を切る。
    // 水平方向の可視半径は約14ユニットなので、17あれば画面外に出せる。
    minDist: 17,
    maxDist: 24,
    hpRamp: 0.010,       // 経過1秒ごとの敵HP倍率の増加
    atkRamp: 0.005,
    // 経過秒数に応じて解禁される敵。データを足すだけで増える
    unlocks: [
      { at: 0,   id: 'en_slime', weight: 10 },
      { at: 25,  id: 'en_bat',   weight: 7 },
      { at: 60,  id: 'en_brute', weight: 4 },
    ],
  },

  /** プール容量。起動時に確保し、ゲーム中は new しない */
  pools: {
    enemies: 320,
    projectiles: 420,
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
