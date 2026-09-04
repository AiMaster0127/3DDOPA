/**
 * 敵データ。
 *
 * ★敵を1種増やす＝この配列にオブジェクトを1つ足すだけ。
 *   描画（InstancedMesh）・湧き・戦闘は visual / ai / 数値を読んで自動で追従する。
 *   新しい ai を使うときだけ combat/EnemyAI.js に挙動を1つ足す。
 *
 * フェーズ2は接触ダメージの3種のみ。射撃敵・分裂敵・ボスはフェーズ5。
 */
export const ENEMIES = [
  {
    id: 'en_slime', name: 'スライム', tier: 1,
    hp: 30, atk: 6, speed: 2.5, radius: 0.55,
    reward: { xp: 3, gems: 1 },
    ai: 'chase',
    element: 'none',
    resist: { fire: -0.25, ice: 0.20 },      // 正=耐性 / 負=弱点
    visual: { geom: 'sphere', color: 0x5ed17f, scale: 1.0 },
  },
  {
    id: 'en_bat', name: 'ケイブバット', tier: 1,
    hp: 18, atk: 5, speed: 5.0, radius: 0.40,
    reward: { xp: 4, gems: 1 },
    ai: 'strafe',                            // 直進せず回り込む。囲まれる圧を作る
    element: 'none',
    resist: { thunder: -0.30 },
    visual: { geom: 'octa', color: 0xa878e8, scale: 0.95, hover: 0.75 },   // 飛行。浮かせて区別する
  },
  {
    id: 'en_brute', name: 'ブルート', tier: 2,
    hp: 95, atk: 15, speed: 1.9, radius: 0.90,
    reward: { xp: 11, gems: 3 },
    ai: 'chase',
    element: 'none',
    resist: { ice: -0.25, dark: 0.25 },
    visual: { geom: 'box', color: 0xd9564e, scale: 1.0 },
  },
];

export const ENEMY_BY_ID = new Map(ENEMIES.map(e => [e.id, e]));

/** InstancedMesh は配列順に1つずつ作るので、添字を固定しておく。 */
ENEMIES.forEach((e, i) => { e.index = i; });
