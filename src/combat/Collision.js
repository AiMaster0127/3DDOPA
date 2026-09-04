/**
 * 一様空間ハッシュグリッド（当たり判定の近傍検索）。
 *
 * 敵200体 × 弾400発を総当たりすると毎フレーム80,000回の判定になって破綻する。
 * グリッドで近傍セルだけを見れば、実際の判定は数十回で済む。
 *
 * ★アリーナは有界なので Map は使わず、固定長の配列＋連結リストで持つ。
 *   clear() が heads.fill(-1) だけで済み、アロケーションが一切発生しない。
 *
 * ★判定は常にXZ平面の円 vs 円。Yは無視し、sqrt も使わない（距離の二乗で比較）。
 */
export class SpatialGrid {
  /**
   * @param {number} halfExtent ワールドの半径（アリーナ半径 + 余裕）
   * @param {number} cell       セルの一辺。最大の問い合わせ半径と同程度にする
   * @param {number} capacity   格納しうる要素数（＝敵プールの容量）
   */
  constructor(halfExtent, cell, capacity) {
    this.cell = cell;
    this.half = halfExtent;
    this.dim = Math.ceil((halfExtent * 2) / cell) + 1;

    this.heads = new Int32Array(this.dim * this.dim);
    this.next = new Int32Array(capacity);

    /** query() の結果。★呼ぶたびに上書きされるので入れ子で使わないこと。 */
    this.result = new Int32Array(capacity);
    this.count = 0;

    this.clear();
  }

  clear() { this.heads.fill(-1); }

  _cell(v) {
    const c = ((v + this.half) / this.cell) | 0;
    return c < 0 ? 0 : c >= this.dim ? this.dim - 1 : c;
  }

  /** @param {number} i 呼び出し側の添字（敵プールのスロット番号） */
  insert(i, x, z) {
    const c = this._cell(z) * this.dim + this._cell(x);
    this.next[i] = this.heads[c];
    this.heads[c] = i;
  }

  /**
   * (x, z) から半径 r 以内に「いる可能性がある」要素の添字を this.result に集める。
   * セル単位の粗い絞り込みなので、正確な距離判定は呼び出し側で行う。
   * @returns {number} 件数
   */
  query(x, z, r) {
    const x0 = this._cell(x - r), x1 = this._cell(x + r);
    const z0 = this._cell(z - r), z1 = this._cell(z + r);

    let n = 0;
    for (let cz = z0; cz <= z1; cz++) {
      const row = cz * this.dim;
      for (let cx = x0; cx <= x1; cx++) {
        for (let i = this.heads[row + cx]; i !== -1; i = this.next[i]) {
          this.result[n++] = i;
        }
      }
    }
    this.count = n;
    return n;
  }

  /** 敵プールの生存個体を全部入れ直す。毎フレーム先頭で1回だけ呼ぶ。 */
  rebuild(enemies) {
    this.clear();
    const list = enemies.list;
    for (let i = 0; i < enemies.cap; i++) {
      const e = list[i];
      if (e.active) this.insert(i, e.x, e.z);
    }
  }
}
