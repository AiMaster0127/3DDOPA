/**
 * 操作キャラクター。
 *
 * ★キャラを1人増やす＝この配列に1件足すだけ。
 *   選択UI・解放判定・ステータス反映・見た目はすべてここを読む。
 *
 * apply(stats) が player.stats に乗る（MetaSystem.bonus が土台に合算する）。
 * ★得手不得手をはっきり付けること。全部が少しずつ違うだけだと選ぶ理由が生まれない。
 *
 * unlock: null なら最初から使える。文字列なら実績で解放されるフラグ名。
 */
export const CHARACTERS = [
  {
    id: 'ch_vanguard', name: 'ヴァンガード', icon: '🛡️',
    tag: 'バランス',
    desc: '近接攻撃力 +12% ／ 素直に強い',
    detail: '扱いに癖がない。近接武器を振り回すぶんには誰よりも堅実。',
    unlock: null,
    apply: (s) => { s.meleeAtkPct += 0.12; },
    visual: { body: 0xe4ebf7, accent: 0x43e8ff, nose: 0xff3ea5 },
  },
  {
    id: 'ch_ranger', name: 'レンジャー', icon: '🏹',
    tag: '手数と機動',
    desc: '射撃攻撃力 +18% ／ 移動速度 +10% ／ 最大HP -12%',
    detail: '当たらなければどうということはない、を地で行く。近接を持たせると脆い。',
    unlock: 'char_ranger',
    apply: (s) => { s.rangedAtkPct += 0.18; s.speedPct += 0.10; s.maxHpPct -= 0.12; },
    visual: { body: 0xc8f0d0, accent: 0x6ef0c8, nose: 0xffd24d },
  },
  {
    id: 'ch_bulwark', name: 'バルワーク', icon: '🗿',
    tag: '重装',
    desc: '最大HP +30% ／ 被ダメージ -10% ／ 移動速度 -10%',
    detail: '避けるのではなく耐える。囲まれてからが本番。',
    unlock: 'char_bulwark',
    apply: (s) => { s.maxHpPct += 0.30; s.drAdd += 0.10; s.speedPct -= 0.10; },
    visual: { body: 0xd9c9a8, accent: 0xffb648, nose: 0xff6a3c },
  },
  {
    id: 'ch_arcanist', name: 'アーカニスト', icon: '🔮',
    tag: '一撃特化',
    desc: 'クリティカル率 +10% ／ 攻撃力 +10% ／ 最大HP -18%',
    detail: '当たれば消し飛ぶ。当たられても消し飛ぶ。',
    unlock: 'char_arcanist',
    apply: (s) => { s.critAdd += 0.10; s.atkPct += 0.10; s.maxHpPct -= 0.18; },
    visual: { body: 0xe0d0f8, accent: 0xb06bff, nose: 0x43e8ff },
  },
];

export const CHARACTER_BY_ID = new Map(CHARACTERS.map(c => [c.id, c]));
export const DEFAULT_CHARACTER = 'ch_vanguard';
