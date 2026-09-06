/**
 * 最小のpub/sub。
 *
 * 「敵を倒した」を戦闘システムが直接 経験値システム・HUD・演出 に伝えると
 * 全部が相互に依存してしまう。イベント1本を挟んで、増える側だけが購読する。
 *
 * ★毎フレーム大量に飛ぶイベント（ヒット判定など）には使わない。
 *   節目（撃破・被弾・死亡・レベルアップ・ガチャ排出）だけに限定する。
 */
export class Events {
  constructor() {
    /** @type {Map<string, Function[]>} */
    this._map = new Map();
  }

  /** @returns {() => void} 購読解除関数 */
  on(type, fn) {
    let arr = this._map.get(type);
    if (!arr) this._map.set(type, arr = []);
    arr.push(fn);
    return () => this.off(type, fn);
  }

  off(type, fn) {
    const arr = this._map.get(type);
    if (!arr) return;
    const i = arr.indexOf(fn);
    if (i >= 0) arr.splice(i, 1);
  }

  /**
   * 発火。引数は最大3つまで（可変長引数の配列生成を避けるため）。
   * ハンドラ内の例外で他のハンドラやゲームループを巻き込まない。
   */
  emit(type, a, b, c) {
    const arr = this._map.get(type);
    if (!arr) return;
    for (let i = 0; i < arr.length; i++) {
      try { arr[i](a, b, c); }
      catch (err) { console.error(`イベント "${type}" のハンドラで例外:`, err); }
    }
  }

  clear() { this._map.clear(); }
}

/** イベント名の定義。タイプミスを1箇所に集約する。 */
export const EV = {
  ENEMY_KILLED:  'enemy:killed',    // (enemy, archetype)
  ENEMY_HIT:     'enemy:hit',       // (enemy, amount, isCrit)
  PLAYER_HIT:    'player:hit',      // (amount)
  PLAYER_DIED:   'player:died',     // ()
  RUN_STARTED:   'run:started',     // ()
  LEVEL_UP:      'run:levelup',     // (newLevel)
  XP_GAINED:     'run:xp',          // (amount)
  // 爆発・叩きつけ。★引数は使い回しのオブジェクト1つ（emit は最大3引数、
  //   かつ毎フレームのアロケーションを避けるため）。受け取ったらその場で使い切ること
  BLAST:         'fx:blast',        // ({x, z, radius, color, pillar})
};
