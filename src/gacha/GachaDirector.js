/**
 * ガチャ演出の進行管理（予告 → リーチ → 排出）。
 *
 * ★結果は GachaSystem がすでに確定・保存している。ここは「見せ方」だけ。
 *   途中で閉じても引いた武器は消えない。
 *
 * ★常にMAXにしない。
 *   予告の色は結果と「弱い相関」に留め、白予告からSSRが出る逆転も、
 *   金予告がSRで止まる空振りも混ぜる。毎回確定演出だと期待が死ぬ。
 */
import { GACHA, RARITY_RANK } from '../data/gacha.js';

export const PHASE = { IDLE: 'idle', PORTENT: 'portent', REACH: 'reach', REVEAL: 'reveal', SUMMARY: 'summary' };

/** 予告のランク。0=白 1=青 2=金 3=虹 */
export const OMEN = ['white', 'blue', 'gold', 'rainbow'];

export class GachaDirector {
  /**
   * @param {object} o
   * @param {import('../core/RNG.js').RNG} o.rng
   * @param {(phase:string, info:object)=>void} o.onPhase 表示側への通知
   */
  constructor({ rng, onPhase }) {
    this.rng = rng;
    this.onPhase = onPhase;

    this.phase = PHASE.IDLE;
    this.results = null;
    this.index = 0;
    this._t = 0;
    this.omen = 'white';
    this.skipRequested = false;
  }

  get running() { return this.phase !== PHASE.IDLE; }

  /** @param {Array} results GachaSystem が返した確定済みの結果 */
  play(results) {
    if (!results || results.length === 0) return;
    this.results = results;
    this.index = 0;
    this.skipRequested = false;
    this._beginItem();
  }

  /** 演出を飛ばして結果一覧へ。長押し・タップで呼ぶ。 */
  skip() {
    if (!this.running) return;
    this.skipRequested = true;
    this._toSummary();
  }

  _beginItem() {
    const r = this.results[this.index];
    this.omen = this._rollOmen(r.rarity);
    this._setPhase(PHASE.PORTENT, GACHA.stage.portent);
  }

  /**
   * 予告の色を決める。
   * 結果のレアリティに引っ張られるが、確定ではない。
   */
  _rollOmen(rarity) {
    const rank = RARITY_RANK[rarity];
    const roll = this.rng.next();

    if (rank >= 3) {                       // SSR：ほとんど派手だが、たまに白から逆転
      if (roll < 0.55) return 'rainbow';
      if (roll < 0.88) return 'gold';
      return roll < 0.97 ? 'blue' : 'white';
    }
    if (rank === 2) {                      // SR：金が出ることもあるが基本は青
      if (roll < 0.14) return 'gold';
      return roll < 0.85 ? 'blue' : 'white';
    }
    // N/R：ごく稀に金を出して空振りを作る（これが無いと金＝確定になってしまう）
    if (roll < 0.04) return 'gold';
    return roll < 0.24 ? 'blue' : 'white';
  }

  _setPhase(phase, duration) {
    this.phase = phase;
    this._t = duration;
    this.onPhase(phase, {
      omen: this.omen,
      index: this.index,
      total: this.results ? this.results.length : 0,
      result: this.results ? this.results[this.index] : null,
      results: this.results,
    });
  }

  _toSummary() {
    this.phase = PHASE.SUMMARY;
    this._t = 0;
    this.onPhase(PHASE.SUMMARY, { results: this.results, total: this.results.length });
  }

  /** 実時間で進める（論理の固定ステップとは別でよい。演出なので）。 */
  update(dt) {
    if (this.phase === PHASE.IDLE || this.phase === PHASE.SUMMARY) return;

    this._t -= dt;
    if (this._t > 0) return;

    if (this.phase === PHASE.PORTENT) {
      // 白予告のときはリーチを挟まない（テンポを落とさない）
      if (this.omen === 'white') this._setPhase(PHASE.REVEAL, GACHA.stage.reveal);
      else this._setPhase(PHASE.REACH, GACHA.stage.reach);

    } else if (this.phase === PHASE.REACH) {
      this._setPhase(PHASE.REVEAL, GACHA.stage.reveal);

    } else if (this.phase === PHASE.REVEAL) {
      this.index++;
      if (this.index >= this.results.length) this._toSummary();
      else this._beginItem();
    }
  }

  close() {
    this.phase = PHASE.IDLE;
    this.results = null;
    this.index = 0;
    this.onPhase(PHASE.IDLE, {});
  }
}
