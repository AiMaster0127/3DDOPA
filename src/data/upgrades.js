/**
 * 拠点の永続強化。
 *
 * ★強化を1つ増やす＝この配列に1件足すだけ。
 *   購入UI・費用計算・ステータス反映はすべてここを読む。
 *
 * apply(stats, lv) が player.stats に乗る（SkillSystem.recompute が土台にする）。
 * 効果がステータス以外に及ぶもの（ガチャ効率など）は `special` で識別する。
 */
export const UPGRADES = [
  {
    id: 'hp', name: '生命の器', icon: '❤️', max: 10,
    desc: lv => `最大HP +${(lv * 3)}%`,
    cost: lv => 120 + lv * 110,
    apply: (s, lv) => { s.maxHpPct += lv * 0.03; },
  },
  {
    id: 'atk', name: '闘気', icon: '⚔️', max: 10,
    desc: lv => `攻撃力 +${(lv * 2.5).toFixed(1)}%`,
    cost: lv => 140 + lv * 130,
    apply: (s, lv) => { s.atkPct += lv * 0.025; },
  },
  {
    id: 'speed', name: '健脚', icon: '💨', max: 5,
    desc: lv => `移動速度 +${lv * 2}%`,
    cost: lv => 180 + lv * 160,
    apply: (s, lv) => { s.speedPct += lv * 0.02; },
  },
  {
    id: 'crit', name: '眼力', icon: '🎯', max: 5,
    desc: lv => `クリティカル率 +${lv}%`,
    cost: lv => 200 + lv * 180,
    apply: (s, lv) => { s.critAdd += lv * 0.01; },
  },
  {
    id: 'pickup', name: '引力', icon: '🧲', max: 5,
    desc: lv => `経験値の回収範囲 +${lv * 12}%`,
    cost: lv => 150 + lv * 120,
    apply: (s, lv) => { s.pickupPct += lv * 0.12; },
  },
  {
    id: 'guard', name: '不屈', icon: '🛡️', max: 5,
    desc: lv => `被ダメージ -${lv * 2}%`,
    cost: lv => 240 + lv * 200,
    apply: (s, lv) => { s.drAdd += lv * 0.02; },
  },
  {
    id: 'startLv', name: '先達の記憶', icon: '📖', max: 3,
    desc: lv => `ランの開始レベル +${lv}`,
    cost: lv => 600 + lv * 700,
    special: 'startLv',
    apply: () => {},                 // ステータスではなく開始レベルに効く
  },
  {
    id: 'dust', name: '錬成', icon: '✨', max: 5,
    desc: lv => `ガチャのダブりで得る強化粉 +${lv * 15}%`,
    cost: lv => 260 + lv * 220,
    special: 'dustBonus',
    apply: () => {},
  },
];

export const UPGRADE_BY_ID = new Map(UPGRADES.map(u => [u.id, u]));
