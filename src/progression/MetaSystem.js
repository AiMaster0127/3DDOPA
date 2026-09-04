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
import { UPGRADES, UPGRADE_BY_ID } from '../data/upgrades.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { WEAPON_BY_ID } from '../data/weapons.js';
import { CHARACTERS, CHARACTER_BY_ID, DEFAULT_CHARACTER } from '../data/characters.js';

export class MetaSystem {
  /**
   * @param {import('../save/SaveManager.js').SaveManager} save
   * @param {(a:object)=>void} [onAchievement] 実績達成の通知
   */
  constructor(save, onAchievement) {
    this.save = save;
    this.onAchievement = onAchievement || (() => {});
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
   * ★アカウントレベル + 拠点強化の合算をここ1箇所で出す。
   *   強化の効果式は data/upgrades.js の apply() にしか書かない。
   */
  bonus() {
    const per = BALANCE.accountLevel.perLevel;
    const n = this.meta.accountLv - 1;

    const s = {
      maxHpPct: per.maxHpPct * n,
      atkPct: per.atkPct * n,
      speedPct: 0, critAdd: 0, rateAdd: 0, pickupPct: 0, drAdd: 0,
      meleeAtkPct: 0, rangedAtkPct: 0,
    };
    for (const u of UPGRADES) {
      const lv = this.levelOf(u.id);
      if (lv > 0) u.apply(s, lv);
    }
    // ★キャラクターの得手不得手も同じ器に足す。
    //   効果式は data/characters.js の apply() にしか書かない。
    this.character.apply(s);
    return s;
  }

  // ─────────── キャラクター ───────────

  /** 選択中のキャラ。壊れた保存値でも必ず既定へ落とす。 */
  get character() {
    const c = CHARACTER_BY_ID.get(this.meta.character);
    if (c && this.isCharacterUnlocked(c)) return c;
    return CHARACTER_BY_ID.get(DEFAULT_CHARACTER);
  }

  isCharacterUnlocked(c) { return !c.unlock || this.isUnlocked(c.unlock); }

  availableCharacters() { return CHARACTERS.filter(c => this.isCharacterUnlocked(c)); }

  selectCharacter(id) {
    const c = CHARACTER_BY_ID.get(id);
    if (!c || !this.isCharacterUnlocked(c)) return false;
    this.meta.character = id;
    this.save.saveNow();
    return true;
  }

  // ─────────── 拠点強化 ───────────

  levelOf(id) { return this.meta.upgrades[id] | 0; }

  /** 次の段階の費用。上限なら null。 */
  upgradeCost(id) {
    const u = UPGRADE_BY_ID.get(id);
    if (!u) return null;
    const lv = this.levelOf(id);
    return lv >= u.max ? null : u.cost(lv);
  }

  canBuy(id) {
    const c = this.upgradeCost(id);
    return c !== null && this.save.data.wallet.gems >= c;
  }

  buyUpgrade(id) {
    if (!this.canBuy(id)) return false;
    this.save.data.wallet.gems -= this.upgradeCost(id);
    this.meta.upgrades[id] = this.levelOf(id) + 1;
    this.save.saveNow();
    return true;
  }

  /** ランの開始レベル（強化 'startLv' ぶん）。 */
  get startLevel() { return 1 + this.levelOf('startLv'); }

  /** ガチャのダブりで得る強化粉の倍率（強化 'dust' ぶん）。 */
  get dustBonus() { return 1 + this.levelOf('dust') * 0.15; }

  // ─────────── 実績 ───────────

  isUnlocked(flag) { return this.meta.unlocks.includes(flag); }

  /**
   * 達成判定。達成した瞬間に報酬を入れる（受け取り操作は挟まない）。
   * ★節目（ラン終了・ガチャ・強化）でだけ呼ぶ。毎フレーム呼ぶものではない。
   * @returns {Array} 新たに達成した実績
   */
  checkAchievements() {
    const done = this.save.data.achievements;
    const total = WEAPON_BY_ID.size;
    const gained = [];

    for (const a of ACHIEVEMENTS) {
      if (done[a.id]) continue;
      let ok = false;
      try { ok = !!a.check(this.save.data, total); }
      catch (err) { console.warn(`実績 ${a.id} の判定で例外`, err); continue; }
      if (!ok) continue;

      done[a.id] = true;
      if (a.reward) {
        this.save.data.wallet.gems += a.reward.gems || 0;
        this.save.data.wallet.tickets += a.reward.tickets || 0;
      }
      if (a.unlock && !this.meta.unlocks.includes(a.unlock)) this.meta.unlocks.push(a.unlock);
      gained.push(a);
      this.onAchievement(a);
    }

    if (gained.length) this.save.saveNow();
    return gained;
  }

  /** 達成数 / 総数 */
  achievementProgress() {
    const done = this.save.data.achievements;
    return { have: ACHIEVEMENTS.filter(a => done[a.id]).length, total: ACHIEVEMENTS.length };
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

    // 実績は節目でだけ判定する
    const achievements = this.checkAchievements();

    return { xpGained, levelsGained, newLevel: this.meta.accountLv, achievements };
  }
}
