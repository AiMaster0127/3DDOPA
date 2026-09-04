/**
 * 永続進行（ラン跨ぎ）。
 *
 * ★「キャラのレベルはセーブに永続保存」の担当。
 *   ランが終わるたびに成績を永続経験値へ変換し、アカウントレベルを上げる。
 *   アカウントレベルは全ランに乗る恒久的なステータス補正になる。
 *
 * 拠点での強化購入・アンロック・実績はフェーズ6でここに足す。
 */
import { BALANCE } from '../data/balance.js';

export class MetaSystem {
  /** @param {import('../save/SaveManager.js').SaveManager} save */
  constructor(save) {
    this.save = save;
    if (!this.save.data.profile.createdAt) {
      this.save.data.profile.createdAt = Date.now();
      this.save.markDirty();
    }
  }

  get meta() { return this.save.data.meta; }
  get stats() { return this.save.data.stats; }
  get level() { return this.meta.accountLv; }
  get xp() { return this.meta.accountXp; }
  get xpNeed() { return BALANCE.accountLevel.xpFor(this.meta.accountLv); }
  get xp01() { return this.xpNeed > 0 ? this.xp / this.xpNeed : 0; }

  /**
   * 永続強化ぶんのステータス補正。SkillSystem.recompute がこれを土台にする。
   * ★アカウントレベル + 拠点強化（フェーズ6）の合算をここ1箇所で出す。
   */
  bonus() {
    const per = BALANCE.accountLevel.perLevel;
    const n = this.meta.accountLv - 1;
    const up = this.meta.upgrades;
    return {
      maxHpPct: per.maxHpPct * n + up.hp * 0.03,
      atkPct: per.atkPct * n + up.atk * 0.025,
      speedPct: up.speed * 0.02,
    };
  }

  /**
   * ラン終了時の精算。
   * @returns {{xpGained:number, levelsGained:number, newLevel:number}}
   */
  finishRun({ kills, elapsed, runLv, gems }) {
    const a = BALANCE.accountLevel;
    const xpGained = a.xpFromRun({ kills, elapsed, runLv });

    let levelsGained = 0;
    this.meta.accountXp += xpGained;
    while (this.meta.accountLv < a.maxLevel && this.meta.accountXp >= this.xpNeed) {
      this.meta.accountXp -= this.xpNeed;
      this.meta.accountLv++;
      levelsGained++;
    }

    const st = this.stats;
    st.totalRuns++;
    st.totalKills += kills;
    st.bestTimeMs = Math.max(st.bestTimeMs, Math.floor(elapsed * 1000));
    st.bestRunLv = Math.max(st.bestRunLv, runLv);

    if (gems) this.save.data.wallet.gems += gems;
    this.save.data.profile.playTimeMs += Math.floor(elapsed * 1000);

    // ★ラン終了は失うと痛い。遅延ではなく即時書き込む
    this.save.saveNow();

    return { xpGained, levelsGained, newLevel: this.meta.accountLv };
  }
}
