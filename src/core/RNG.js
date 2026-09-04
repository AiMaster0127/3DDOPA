/**
 * 決定的な擬似乱数（mulberry32）。
 *
 * ガチャ・敵の湧き・装飾配置はすべてこれを経由させる。
 * シードを固定すれば同じ結果を再現でき、確率設計の検証やデバッグができる。
 * Math.random() をゲームロジックから直接呼ばないこと。
 */
export class RNG {
  constructor(seed = (Date.now() ^ 0x9e3779b9) >>> 0) {
    this.seed(seed);
  }

  seed(s) {
    this.state = s >>> 0;
    return this;
  }

  /** 0以上1未満 */
  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** min以上max未満の実数 */
  range(min, max) { return min + this.next() * (max - min); }

  /** min以上max以下の整数 */
  int(min, max) { return Math.floor(this.range(min, max + 1)); }

  /** 配列から1つ選ぶ */
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }

  /** 確率 p で true */
  chance(p) { return this.next() < p; }
}

/** 装飾配置など「見た目の再現性が欲しい」用途の共有インスタンス。 */
export const worldRng = new RNG(0xd09a5eed);
