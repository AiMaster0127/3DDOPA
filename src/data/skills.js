/**
 * スキルデータ。
 *
 * ★スキルを1つ増やす＝この配列にオブジェクトを1つ足すだけ。
 *   レベルアップ時の3択・効果適用・HUD表示はすべてここを読む。
 *
 * kind:
 *   'passive' … apply(stats, lv) で player.stats を書き換える（常時効果）
 *   'active'  … cooldown(lv) 秒ごとに cast(ctx, lv) が呼ばれる
 *
 * ctx（active用）が使えるもの:
 *   ctx.player                       自機
 *   ctx.aoe(x, z, radius, damage)    範囲ダメージ
 *   ctx.bolt(count, damage)          最寄りの敵を撃つ
 *   ctx.heal(amount)                 回復
 */
export const SKILLS = [
  // ---- パッシブ ----
  {
    id: 'sk_vital', name: '生命増強', kind: 'passive', maxLv: 5, icon: '❤️',
    desc: lv => `最大HP +${lv * 14}%`,
    apply: (s, lv) => { s.maxHpPct += lv * 0.14; },
  },
  {
    id: 'sk_power', name: '剛力', kind: 'passive', maxLv: 5, icon: '⚔️',
    desc: lv => `攻撃力 +${lv * 12}%`,
    apply: (s, lv) => { s.atkPct += lv * 0.12; },
  },
  {
    id: 'sk_swift', name: '疾走', kind: 'passive', maxLv: 5, icon: '💨',
    desc: lv => `移動速度 +${lv * 8}%`,
    apply: (s, lv) => { s.speedPct += lv * 0.08; },
  },
  {
    id: 'sk_keen', name: '急所狙い', kind: 'passive', maxLv: 5, icon: '🎯',
    desc: lv => `クリティカル率 +${lv * 5}%`,
    apply: (s, lv) => { s.critAdd += lv * 0.05; },
  },
  {
    id: 'sk_haste', name: '連撃', kind: 'passive', maxLv: 5, icon: '⚡',
    desc: lv => `攻撃速度 +${lv * 11}%`,
    apply: (s, lv) => { s.rateAdd += lv * 0.11; },
  },
  {
    id: 'sk_magnet', name: '磁力', kind: 'passive', maxLv: 3, icon: '🧲',
    desc: lv => `経験値の回収範囲 +${lv * 60}%`,
    apply: (s, lv) => { s.pickupPct += lv * 0.6; },
  },
  {
    id: 'sk_guard', name: '硬化', kind: 'passive', maxLv: 4, icon: '🛡️',
    desc: lv => `被ダメージ -${lv * 7}%`,
    apply: (s, lv) => { s.drAdd += lv * 0.07; },
  },

  // ---- アクティブ ----
  {
    id: 'sk_nova', name: 'ノヴァ', kind: 'active', maxLv: 5, icon: '💥',
    desc: lv => `${(5.5 - lv * 0.5).toFixed(1)}秒ごとに周囲へ ${18 + lv * 14} ダメージ`,
    cooldown: lv => 5.5 - lv * 0.5,
    cast: (ctx, lv) => ctx.aoe(ctx.player.x, ctx.player.z, 4.2 + lv * 0.7, 18 + lv * 14),
  },
  {
    id: 'sk_bolt', name: '追尾雷', kind: 'active', maxLv: 5, icon: '🌩️',
    desc: lv => `2.6秒ごとに ${lv} 体の敵へ ${22 + lv * 12} ダメージ`,
    cooldown: () => 2.6,
    cast: (ctx, lv) => ctx.bolt(lv, 22 + lv * 12),
  },
  {
    id: 'sk_regen', name: '再生', kind: 'active', maxLv: 4, icon: '✚',
    desc: lv => `6秒ごとにHPを ${lv * 5} 回復`,
    cooldown: () => 6,
    cast: (ctx, lv) => ctx.heal(lv * 5),
  },
];

export const SKILL_BY_ID = new Map(SKILLS.map(s => [s.id, s]));
