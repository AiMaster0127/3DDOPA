/**
 * ステージ定義。
 *
 * ★ステージを1つ増やす＝この配列に1件足すだけ。
 *   湧き・難度・ボス・報酬・解禁条件はすべてここに書く。
 *
 * clear条件: duration 秒を生き延びる。boss があればボス撃破が必須。
 *
 * ★難度曲線の意図：
 *   敵のHPはステージ番号の二次で伸びる。ラン内のレベル上げだけでは追いつかず、
 *   「もっと強い武器を引く／強化する」が必要になるように設計している。
 *   ここが緩いとガチャと育成の動機が消える。
 */
export const STAGES = [
  {
    id: 1, name: '崩れた闘技場', duration: 120,
    waves: [
      { at: 0,  spawn: [['en_slime', 10]],                        rate: 1.6, cap: 45 },
      { at: 40, spawn: [['en_slime', 8], ['en_bat', 5]],          rate: 2.2, cap: 65 },
      { at: 80, spawn: [['en_slime', 6], ['en_bat', 6]],          rate: 2.8, cap: 85 },
    ],
    boss: null,
    scaling: { hp: 1.00, atk: 1.00 },
    reward: { gems: 60, firstClear: { gems: 200, tickets: 1 } },
    unlock: 0,
  },
  {
    id: 2, name: '砕けた回廊', duration: 140,
    waves: [
      { at: 0,  spawn: [['en_slime', 8], ['en_bat', 6]],                    rate: 2.0, cap: 60 },
      { at: 45, spawn: [['en_bat', 8], ['en_stinger', 4]],                  rate: 2.6, cap: 85 },
      { at: 95, spawn: [['en_bat', 6], ['en_stinger', 5], ['en_lantern', 3], ['en_brute', 3]], rate: 3.2, cap: 105 },
    ],
    boss: null,
    scaling: { hp: 1.35, atk: 1.22 },
    reward: { gems: 90, firstClear: { gems: 260, tickets: 1 } },
    unlock: 1,
  },
  {
    id: 3, name: '獣の巣', duration: 160,
    waves: [
      { at: 0,   spawn: [['en_slime', 6], ['en_brute', 4]],                     rate: 2.2, cap: 65 },
      { at: 50,  spawn: [['en_brute', 6], ['en_charger', 5]],                   rate: 2.8, cap: 90 },
      { at: 105, spawn: [['en_charger', 6], ['en_revenant', 4], ['en_bat', 5]],  rate: 3.4, cap: 110 },
    ],
    // ★最初のボス。ここで「装備が足りない」を体感させる
    boss: { id: 'bs_gorehorn', at: 150 },
    scaling: { hp: 1.80, atk: 1.46 },
    reward: { gems: 130, firstClear: { gems: 400, tickets: 2 } },
    unlock: 2,
  },
  {
    id: 4, name: '腐食の沼', duration: 170,
    waves: [
      { at: 0,   spawn: [['en_blob', 8], ['en_slime', 5]],                      rate: 2.4, cap: 75 },
      { at: 55,  spawn: [['en_blob', 8], ['en_stinger', 6]],                    rate: 3.0, cap: 100 },
      { at: 115, spawn: [['en_blob', 7], ['en_lantern', 5], ['en_brute', 5]],   rate: 3.6, cap: 120 },
    ],
    boss: null,
    scaling: { hp: 2.35, atk: 1.70 },
    reward: { gems: 170, firstClear: { gems: 480, tickets: 2 } },
    unlock: 3,
  },
  {
    id: 5, name: '雷鳴の尖塔', duration: 180,
    waves: [
      { at: 0,   spawn: [['en_stinger', 9], ['en_bat', 6]],                     rate: 2.6, cap: 85 },
      { at: 60,  spawn: [['en_stinger', 7], ['en_serpent', 4], ['en_charger', 6]], rate: 3.4, cap: 110 },
      { at: 125, spawn: [['en_serpent', 6], ['en_revenant', 6], ['en_brute', 5]], rate: 4.0, cap: 135 },
    ],
    // ★ここが3面と同じゴアホーンだった。ボスが使い回しだと進んだ実感が消える
    boss: { id: 'bs_thunderdrake', at: 170 },
    scaling: { hp: 3.00, atk: 1.94 },
    reward: { gems: 220, firstClear: { gems: 600, tickets: 2 } },
    unlock: 4,
  },
  {
    id: 6, name: '灰の平原', duration: 190,
    waves: [
      { at: 0,   spawn: [['en_brute', 8], ['en_charger', 6]],                   rate: 2.8, cap: 95 },
      { at: 65,  spawn: [['en_brute', 8], ['en_blob', 7], ['en_stinger', 6]],   rate: 3.6, cap: 120 },
      { at: 135, spawn: [['en_revenant', 8], ['en_brute', 8], ['en_lantern', 5]], rate: 4.4, cap: 145 },
    ],
    boss: null,
    scaling: { hp: 3.75, atk: 2.18 },
    reward: { gems: 280, firstClear: { gems: 720, tickets: 3 } },
    unlock: 5,
  },
  {
    id: 7, name: '虚無の縁', duration: 200,
    waves: [
      { at: 0,   spawn: [['en_bat', 8], ['en_stinger', 8]],                     rate: 3.0, cap: 100 },
      { at: 70,  spawn: [['en_serpent', 7], ['en_blob', 7], ['en_lantern', 6]], rate: 3.8, cap: 130 },
      { at: 145, spawn: [['en_revenant', 9], ['en_serpent', 8], ['en_brute', 7]],rate: 4.6, cap: 155 },
    ],
    boss: null,
    scaling: { hp: 4.60, atk: 2.42 },
    reward: { gems: 340, firstClear: { gems: 850, tickets: 3 } },
    unlock: 6,
  },
  {
    id: 8, name: '深淵の顎', duration: 220,
    waves: [
      { at: 0,   spawn: [['en_brute', 8], ['en_stinger', 7], ['en_bat', 6]],    rate: 3.2, cap: 110 },
      { at: 75,  spawn: [['en_charger', 9], ['en_blob', 8], ['en_brute', 8]],   rate: 4.2, cap: 140 },
      { at: 160, spawn: [['en_revenant', 10], ['en_serpent', 9], ['en_lantern', 7]], rate: 5.0, cap: 170 },
    ],
    // ★最終ボス。SSR装備 + 限界突破が前提の難度
    boss: { id: 'bs_voidmaw', at: 205 },
    scaling: { hp: 5.55, atk: 2.66 },
    reward: { gems: 420, firstClear: { gems: 1200, tickets: 5 } },
    unlock: 7,
  },
];

export const STAGE_BY_ID = new Map(STAGES.map(s => [s.id, s]));

/** 経過時間に応じた追加スケーリング（ステージ内の時間経過ぶん）。 */
export const TIME_SCALING = {
  hpPerSec: 0.004,
  atkPerSec: 0.0018,
};
