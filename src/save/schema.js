/**
 * セーブデータの形と、バージョン間の移行。
 *
 * ★フィールドを増やすときは INITIAL_SAVE に足すだけでよい。
 *   読み込み時に初期値とディープマージするので、旧セーブにも自動で生える。
 * ★形を「変える」ときだけ SAVE_VERSION を上げて MIGRATIONS に関数を足す。
 */
export const SAVE_KEY = 'dopa_arena_save';
export const BACKUP_KEY = 'dopa_arena_save_backup';
export const SAVE_VERSION = 1;

export const INITIAL_SAVE = {
  v: SAVE_VERSION,

  profile: { createdAt: 0, playTimeMs: 0, lastPlayed: 0 },

  /** 永続進行（ラン跨ぎで育つ） */
  meta: {
    accountLv: 1,
    accountXp: 0,
    upgrades: { hp: 0, atk: 0, speed: 0, gachaLuck: 0 },   // フェーズ6の拠点強化
    unlocks: [],
  },

  wallet: { gems: 0, tickets: 3, dust: 0 },

  /** 所持武器（フェーズ4のガチャで増える） */
  inventory: {
    weapons: { wp_iron_sword: { lv: 1, lb: 0, shards: 0, obtainedAt: 0 } },
    equipped: 'wp_iron_sword',
  },

  gacha: { totalPulls: 0, sinceSSR: 0, lostFiftyFifty: false, history: [] },

  stats: {
    bestStage: 0, bestTimeMs: 0, bestRunLv: 0,
    totalKills: 0, totalBosses: 0, totalRuns: 0, ssrCount: 0,
  },

  achievements: {},

  settings: { sfx: 0.8, bgm: 0.5, quality: 'auto', autoFire: true },
};

/**
 * v(n-1) → v(n) の変換。キーが移行後のバージョン。
 * 例: 2: (s) => { s.meta.upgrades.crit = 0; s.v = 2; return s; },
 */
export const MIGRATIONS = {};
