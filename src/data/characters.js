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
 *
 * visual は src/scene/character.js の CHAR_STYLE を上書きする。
 * ★色だけ変えても「同じ人形の色違い」にしかならない。
 *   髪型（hairStyle）とコートの長さ（coatLen）を必ず変えて、
 *   上から見たシルエットで見分けが付くようにすること。
 *
 * ★足元の光・向きの三角の色はここでは決められない（PlayerView が固定している）。
 *   あれは個性ではなく「自分がどこにいるか」を伝える計器で、
 *   敵の発光核と色が被った瞬間に乱戦で自機を見失う。
 */
export const CHARACTERS = [
  {
    id: 'ch_vanguard', name: 'ヴァンガード', icon: '🛡️',
    tag: 'バランス',
    desc: '近接攻撃力 +12% ／ 素直に強い',
    detail: '扱いに癖がない。近接武器を振り回すぶんには誰よりも堅実。',
    unlock: null,
    apply: (s) => { s.meleeAtkPct += 0.12; },
    visual: {
      hairStyle: 'spiky', hair: 0x16171f, hairTip: 0xe3d0ac, skin: 0xf0d6ba,
      coat: 0x22242f, lining: 0x8e1522, cloth: 0x15161d, metal: 0xd0a03c, coatLen: 1.0,
    },
  },
  {
    id: 'ch_ranger', name: 'レンジャー', icon: '🏹',
    tag: '手数と機動',
    desc: '射撃攻撃力 +18% ／ 移動速度 +10% ／ 最大HP -12%',
    detail: '当たらなければどうということはない、を地で行く。近接を持たせると脆い。',
    unlock: 'char_ranger',
    apply: (s) => { s.rangedAtkPct += 0.18; s.speedPct += 0.10; s.maxHpPct -= 0.12; },
    visual: {
      hairStyle: 'short', hair: 0x1b2430, hairTip: 0xa8e6f2, skin: 0xefd3b4,
      coat: 0x1e2a33, lining: 0x1d6f7a, cloth: 0x121a20, metal: 0xb9c6cf, coatLen: 0.62,
    },
  },
  {
    id: 'ch_bulwark', name: 'バルワーク', icon: '🗿',
    tag: '重装',
    desc: '最大HP +30% ／ 被ダメージ -10% ／ 移動速度 -10%',
    detail: '避けるのではなく耐える。囲まれてからが本番。',
    unlock: 'char_bulwark',
    apply: (s) => { s.maxHpPct += 0.30; s.drAdd += 0.10; s.speedPct -= 0.10; },
    visual: {
      hairStyle: 'short', hair: 0x2a2016, hairTip: 0xe8c68e, skin: 0xe8c49c,
      coat: 0x2c2820, lining: 0x7a4a12, cloth: 0x1a1710, metal: 0xd8a63c, coatLen: 0.78,
    },
  },
  {
    id: 'ch_arcanist', name: 'アーカニスト', icon: '🔮',
    tag: '一撃特化',
    desc: 'クリティカル率 +10% ／ 攻撃力 +10% ／ 最大HP -18%',
    detail: '当たれば消し飛ぶ。当たられても消し飛ぶ。',
    unlock: 'char_arcanist',
    apply: (s) => { s.critAdd += 0.10; s.atkPct += 0.10; s.maxHpPct -= 0.18; },
    visual: {
      hairStyle: 'long', hair: 0x241c33, hairTip: 0xdcc8ff, skin: 0xf2dcc8,
      coat: 0x241f33, lining: 0x5b2a8c, cloth: 0x16121f, metal: 0xc0a8e0, coatLen: 1.12,
    },
  },
];

export const CHARACTER_BY_ID = new Map(CHARACTERS.map(c => [c.id, c]));
export const DEFAULT_CHARACTER = 'ch_vanguard';
