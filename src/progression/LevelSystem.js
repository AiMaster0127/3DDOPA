/**
 * ラン内のレベル。
 *
 * 経験値ジェムを回収 → レベルアップ → スキル3択。
 * このレベルはラン終了で失われる（永続成長は MetaSystem 側）。
 */
import { BALANCE } from '../data/balance.js';
import { EV } from '../core/Events.js';

export class LevelSystem {
  constructor({ player, skills, events, startLevel }) {
    this.player = player;
    this.skills = skills;
    this.events = events;
    /** 拠点強化「先達の記憶」ぶんの開始レベル。Game が関数で差し込む。 */
    this.startLevel = startLevel || (() => 1);

    this.level = 1;
    this.xp = 0;
    this.xpNeed = BALANCE.runLevel.xpFor(1);
    /** 未消化のレベルアップ回数（連続で上がったぶんを順に選ばせる） */
    this.pending = 0;

    this.reset();
  }

  /**
   * ★HPには触らない。
   *   player.reset() が stats から maxHp を決め直すので、
   *   ここで足しても上書きされる。開始レベルぶんのHPは applyStartHp() で
   *   player.reset() の「後に」乗せること。
   */
  reset() {
    // 開始レベルは拠点強化「先達の記憶」で上がる
    this.level = Math.max(1, this.startLevel() | 0);
    this.xp = 0;
    this.xpNeed = BALANCE.runLevel.xpFor(this.level);
    this.pending = 0;
    this.player.runLv = this.level;
  }

  /**
   * player.reset() の後に呼ぶ。開始レベルぶんのHPを上乗せし、
   * ★runLv を最終的に確定させる（reset順の入れ替えに強くしておく）。
   */
  applyStartHp() {
    this.player.runLv = this.level;
    const add = BALANCE.runLevel.perLevel.maxHp * (this.level - 1);
    if (add <= 0) return;
    this.player.maxHp += add;
    this.player.hp = this.player.maxHp;
  }

  get xp01() { return this.xpNeed > 0 ? this.xp / this.xpNeed : 0; }

  /**
   * 経験値を加算する。
   * @returns {boolean} レベルアップが発生したか
   */
  gain(amount) {
    if (amount <= 0) return false;
    const max = BALANCE.runLevel.maxLevel;
    let leveled = false;

    this.xp += amount;
    while (this.level < max && this.xp >= this.xpNeed) {
      this.xp -= this.xpNeed;
      this.level++;
      this.pending++;
      leveled = true;
      this.xpNeed = BALANCE.runLevel.xpFor(this.level);
    }

    if (leveled) {
      this.player.runLv = this.level;

      // ★HPの伸びは「最大値も現在値も」上げる。
      //   最大値だけ上げると、レベルアップしたのに割合HPが下がって損した感じになる
      const add = BALANCE.runLevel.perLevel.maxHp;
      const gainedLevels = this.pending;
      this.player.maxHp += add * gainedLevels;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + add * gainedLevels);

      this.skills.recompute();
      this.events.emit(EV.LEVEL_UP, this.level);
    }
    return leveled;
  }

  /** 選択を1つ消化する。@returns {boolean} まだ残っているか */
  consume() {
    if (this.pending > 0) this.pending--;
    return this.pending > 0;
  }
}
