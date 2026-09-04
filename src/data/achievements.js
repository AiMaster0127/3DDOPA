/**
 * 実績。
 *
 * ★実績を1つ増やす＝この配列に1件足すだけ。
 *   達成判定は check(save) が true を返すかどうかだけで決まる。
 *   達成した瞬間に報酬が自動で入る（受け取り操作を挟まない）。
 *
 * unlock を持つ実績は、達成するとその機能が解放される。
 */
export const ACHIEVEMENTS = [
  // ---- 撃破 ----
  { id: 'kill_100',   name: '露払い',       icon: '🗡️', desc: '累計100体を撃破',
    check: s => s.stats.totalKills >= 100,    reward: { gems: 100 } },
  { id: 'kill_1000',  name: '掃討者',       icon: '⚔️', desc: '累計1,000体を撃破',
    check: s => s.stats.totalKills >= 1000,   reward: { gems: 400, tickets: 1 } },
  { id: 'kill_10000', name: '殲滅者',       icon: '💀', desc: '累計10,000体を撃破',
    check: s => s.stats.totalKills >= 10000,  reward: { gems: 1500, tickets: 5 } },

  // ---- ボス ----
  { id: 'boss_1',  name: '初討伐',   icon: '🏆', desc: 'ボスを1体撃破',
    check: s => s.stats.totalBosses >= 1,   reward: { gems: 200, tickets: 1 } },
  { id: 'boss_5',  name: '猛者',     icon: '🥇', desc: 'ボスを5体撃破',
    check: s => s.stats.totalBosses >= 5,   reward: { gems: 500, tickets: 2 } },
  { id: 'boss_20', name: '討伐王',   icon: '👑', desc: 'ボスを20体撃破',
    check: s => s.stats.totalBosses >= 20,  reward: { gems: 2000, tickets: 5 } },

  // ---- 攻略 ----
  { id: 'stage_1', name: '第一歩',   icon: '🚩', desc: 'ステージ1をクリア',
    check: s => !!s.meta.clearedStages[1], reward: { gems: 100 } },
  { id: 'stage_4', name: '中堅',     icon: '🏳️', desc: 'ステージ4をクリア',
    check: s => !!s.meta.clearedStages[4], reward: { gems: 600, tickets: 2 } },
  // ★上級ガチャの解放条件。強い装備を「攻略の先」に置く
  { id: 'stage_8', name: '深淵踏破', icon: '🌌', desc: 'ステージ8をクリア',
    check: s => !!s.meta.clearedStages[8],
    reward: { gems: 3000, tickets: 10 }, unlock: 'banner_prime' },

  // ---- 育成 ----
  { id: 'runlv_10', name: '成長',   icon: '📈', desc: 'ラン中にLv.10へ到達',
    check: s => s.stats.bestRunLv >= 10, reward: { gems: 150 } },
  { id: 'runlv_20', name: '飛躍',   icon: '🚀', desc: 'ラン中にLv.20へ到達',
    check: s => s.stats.bestRunLv >= 20, reward: { gems: 500, tickets: 1 } },
  { id: 'acct_10',  name: '歴戦',   icon: '🎖️', desc: 'アカウントLv.10に到達',
    check: s => s.meta.accountLv >= 10,  reward: { gems: 800, tickets: 2 } },

  // ---- 収集 ----
  { id: 'pull_100', name: '常連',   icon: '🎰', desc: 'ガチャを累計100回引く',
    check: s => s.gacha.totalPulls >= 100, reward: { gems: 300, tickets: 1 } },
  { id: 'ssr_1',    name: '初SSR',  icon: '✨', desc: 'SSRを1本入手',
    check: s => s.stats.ssrCount >= 1,     reward: { gems: 300 } },
  { id: 'ssr_5',    name: '蒐集家', icon: '💎', desc: 'SSRを5本入手',
    check: s => s.stats.ssrCount >= 5,     reward: { gems: 1000, tickets: 3 } },
  { id: 'collect_10', name: '武器庫', icon: '🗃️', desc: '武器を10種類そろえる',
    check: s => Object.keys(s.inventory.weapons).length >= 10, reward: { gems: 500 } },
  { id: 'collect_all', name: '図鑑完成', icon: '📚', desc: '全ての武器をそろえる',
    check: (s, total) => Object.keys(s.inventory.weapons).length >= total,
    reward: { gems: 5000, tickets: 10 } },

  // ---- 強化 ----
  { id: 'lb_5', name: '限界の先', icon: '🔥', desc: 'いずれかの武器を限界突破5まで上げる',
    check: s => Object.values(s.inventory.weapons).some(w => w.lb >= 5),
    reward: { gems: 1200, tickets: 3 } },
];

export const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map(a => [a.id, a]));
