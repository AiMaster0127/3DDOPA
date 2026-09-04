/**
 * 固定長オブジェクトプール。
 *
 * ★本作の60fps維持は「ゲーム中に new しない」という一点に懸かっている。
 *   敵も弾も起動時に全数を確保し、以後は active フラグの付け替えだけで回す。
 *   これでGCが走らず、フレーム時間のスパイクが消える。
 *
 * 空きスロットはスタックで持つので spawn / despawn はどちらもO(1)。
 */
export class Pool {
  /**
   * @param {number} cap                 容量（これ以上は湧かない）
   * @param {(i:number)=>object} factory スロット1つ分のオブジェクトを作る。
   *   ★使う可能性のあるフィールドは全部ここで初期化すること。
   *     後から生やすとV8の隠しクラスが遷移して遅くなる。
   */
  constructor(cap, factory) {
    this.cap = cap;
    this.count = 0;
    this.list = new Array(cap);
    this._free = new Int32Array(cap);
    this._freeN = cap;

    for (let i = 0; i < cap; i++) {
      const o = factory(i);
      o.active = false;
      o.slot = i;
      this.list[i] = o;
      this._free[i] = cap - 1 - i;      // 逆順に積んで0番から払い出す
    }
  }

  /** 空きがなければ null。呼び出し側で「湧きを諦める」判断をする。 */
  spawn() {
    if (this._freeN === 0) return null;
    const o = this.list[this._free[--this._freeN]];
    o.active = true;
    this.count++;
    return o;
  }

  despawn(o) {
    if (!o.active) return;
    o.active = false;
    this._free[this._freeN++] = o.slot;
    this.count--;
  }

  despawnAll() {
    for (let i = 0; i < this.cap; i++) if (this.list[i].active) this.despawn(this.list[i]);
  }

  get free() { return this._freeN; }
}
