/**
 * 適応品質制御。
 *
 * 直近フレーム時間の「中央値」で判定する。平均だとGCや単発スパイクで揺れて
 * 品質がバタつくため、外れ値に強い中央値を使う。
 */
import { median } from '../core/math.js';

/** 品質ティア。数値を変えるだけで挙動が変わるようデータで持つ。 */
export const TIERS = {
  high: { dpr: 2.00, shadows: true,  shadowMap: 1024, enemyCap: 200, particles: 1.0,  aa: true  },
  mid:  { dpr: 1.50, shadows: true,  shadowMap: 512,  enemyCap: 120, particles: 0.6,  aa: false },
  low:  { dpr: 1.25, shadows: false, shadowMap: 0,    enemyCap: 70,  particles: 0.3,  aa: false },
};

const ORDER = ['low', 'mid', 'high'];

// ★判定の窓は「フレーム数」ではなく「実時間」で切る。
//   フレーム数で切ると、重い端末ほど判定が遅れる（20fpsなら90フレーム＝4.5秒）という
//   最も助けが要る場面で最も反応が鈍い挙動になってしまう。
const WINDOW_S   = 1.2;     // 判定の間隔（秒）
const MIN_SAMPLE = 12;      // 中央値を取るのに最低限必要なサンプル数
const CAP        = 150;     // リングバッファ容量（高fps端末で溢れないぶんだけ）
const DOWN_MS    = 21.5;    // これより遅い(≒46fps割れ)なら品質を落とす
const UP_MS      = 14.0;    // これより速い(≒71fps超)なら品質を戻す
const UP_STREAK  = 5;       // 上げるには余裕が続いていることを確認する（約6秒）

export class Quality {
  /**
   * @param {(tier:object, name:string)=>void} onChange ティア変更時の適用先
   * @param {string} initial
   */
  constructor(onChange, initial = 'high') {
    this.onChange = onChange;
    this.auto = true;

    this._hist = new Float32Array(CAP);
    this._n = 0;
    this._elapsed = 0;
    this._goodStreak = 0;

    this.name = initial;
    this.tier = TIERS[initial];
    this.onChange(this.tier, this.name);
  }

  /**
   * 起動時のティア推定。実測が溜まるまでの初期値であり、以降は sample() が補正する。
   * antialias は renderer 生成時にしか決められないので、この推定結果を使う。
   */
  static detect() {
    const dpr = globalThis.devicePixelRatio || 1;
    const cores = navigator.hardwareConcurrency || 4;
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
                   (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
    const mem = navigator.deviceMemory || (mobile ? 4 : 8);

    if (mobile && (cores <= 4 || mem <= 3)) return 'low';
    if (mobile) return 'mid';
    if (cores <= 2 || dpr > 2.5) return 'mid';
    return 'high';
  }

  /** 手動固定。設定画面から 'auto' | 'high' | 'mid' | 'low' で呼ぶ。 */
  setMode(mode) {
    this.auto = mode === 'auto';
    if (!this.auto) this.setTier(mode);
  }

  setTier(name) {
    if (name === this.name || !TIERS[name]) return;
    this.name = name;
    this.tier = TIERS[name];
    this._n = 0;               // 変更直後の数フレームは荒れるので計測をやり直す
    this._elapsed = 0;
    this._goodStreak = 0;
    this.onChange(this.tier, this.name);
  }

  /** 毎フレーム、実フレーム時間（秒）を渡す。 */
  sample(dt) {
    if (this._n < CAP) this._hist[this._n++] = dt * 1000;
    this._elapsed += dt;
    if (this._elapsed < WINDOW_S) return;

    const n = this._n;
    this._elapsed = 0;
    this._n = 0;
    if (!this.auto || n < MIN_SAMPLE) return;

    // 平均ではなく中央値。GCや単発スパイクで品質がバタつくのを防ぐ
    const med = median(this._hist.subarray(0, n));
    const idx = ORDER.indexOf(this.name);

    if (med > DOWN_MS && idx > 0) {
      this._goodStreak = 0;
      this.setTier(ORDER[idx - 1]);
    } else if (med < UP_MS && idx < ORDER.length - 1) {
      // 余裕が続いたときだけ上げる。上げ下げの往復（ハンチング）を防ぐ
      if (++this._goodStreak >= UP_STREAK) this.setTier(ORDER[idx + 1]);
    } else {
      this._goodStreak = 0;
    }
  }
}
