/**
 * ラン内のレベル。
 *
 * 経験値ジェムを回収 → レベルアップ → スキル3択。
 * このレベルはラン終了で失われる（永続成長は MetaSystem 側）。
 */
import { BALANCE } from '../data/balance.js';
import { EV } from '../core/Events.js';

export class LevelSystem {
  constructor({ player, skills, events }) {
    this.player = player;
    this.skills = skills;
    this.events = events;

    this.level = 1;
    this.xp = 0;
    this.xpNeed = BALANCE.runLevel.xpFor(1);
    /** 未消化のレベルアップ回数（連続で上がったぶんを順に選ばせる） */
    this.pending = 0;

    this.reset();
  }

  reset() {
    this.level = 1;
    this.xp = 0;
    this.xpNeed = BALANCE.runLevel.xpFor(1);
    this.pending = 0;
    this.player.runLv = 1;
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
