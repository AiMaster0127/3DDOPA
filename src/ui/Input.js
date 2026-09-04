/**
 * 入力の正規化層。
 *
 * タッチ（仮想スティック）とPC（WASD + マウス）を1つの構造体に畳み込み、
 * ゲームロジックからは入力デバイスの違いが見えないようにする。
 */
import { clamp } from '../core/math.js';

const STICK_MAX = 56;       // ノブが動ける半径(px)。CSSの stick-base と対応
const STICK_DEAD = 0.14;    // デッドゾーン（指の微振動を無視する）

export class Input {
  /**
   * @param {HTMLElement} surface  入力を受けるDOM（canvas）
   * @param {{root:HTMLElement, knob:HTMLElement}} stickEls
   */
  constructor(surface, stickEls) {
    this.surface = surface;
    this.stickRoot = stickEls.root;
    this.stickKnob = stickEls.knob;

    /** ★ゲームロジックが見る唯一の入力状態 */
    this.state = {
      moveX: 0, moveZ: 0,     // -1..1（大きさが倒し量）
      aimX: 0, aimZ: 1,       // 単位ベクトル（フェーズ2のオートエイムが使う）
      firing: false,
      skills: [false, false, false],
    };

    this.usingTouch = false;
    this._keys = new Set();
    this._stickId = -1;         // スティックを掴んでいる pointerId
    this._ox = 0; this._oy = 0; // スティック原点

    this._bind();
  }

  _bind() {
    const s = this.surface;
    s.addEventListener('pointerdown', e => this._onDown(e));
    s.addEventListener('pointermove', e => this._onMove(e));
    s.addEventListener('pointerup', e => this._onUp(e));
    s.addEventListener('pointercancel', e => this._onUp(e));
    // ブラウザ既定のスクロール／ズームを抑止する
    s.addEventListener('contextmenu', e => e.preventDefault());

    addEventListener('keydown', e => this._onKey(e, true));
    addEventListener('keyup', e => this._onKey(e, false));
    // フォーカスを失ったらキーを離した扱いにする（押しっぱなし暴走の防止）
    addEventListener('blur', () => this._keys.clear());
  }

  _onKey(e, down) {
    // 修飾キー付きはブラウザのショートカットなので触らない
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (KEY_MAP[k] === undefined) return;
    e.preventDefault();
    if (down) this._keys.add(KEY_MAP[k]); else this._keys.delete(KEY_MAP[k]);
    this.usingTouch = false;
  }

  _onDown(e) {
    if (e.pointerType === 'mouse') { this.state.firing = e.button === 0; return; }
    if (this._stickId !== -1) return;                 // 既に1本掴んでいる
    // フェーズ1では画面のどこを触ってもスティックが出る。
    // スキルボタンが増えるフェーズ2以降で、スティック側の半分に制限する。

    this._stickId = e.pointerId;
    this._ox = e.clientX; this._oy = e.clientY;
    this.usingTouch = true;
    this.surface.setPointerCapture?.(e.pointerId);

    // 触れた位置にスティックを出現させる（固定位置にしない＝親指の場所を選ばない）
    this.stickRoot.style.transform = `translate(${this._ox}px, ${this._oy}px)`;
    this.stickKnob.style.transform = 'translate(-50%, -50%)';
    this.stickRoot.hidden = false;
    this._apply(0, 0);
  }

  _onMove(e) {
    if (e.pointerId !== this._stickId) return;

    let dx = e.clientX - this._ox;
    let dy = e.clientY - this._oy;

    // 掴める半径を超えたら原点を引きずる（指を離さず遠くまで倒せる）
    const len = Math.hypot(dx, dy);
    if (len > STICK_MAX) {
      const over = len - STICK_MAX;
      this._ox += (dx / len) * over;
      this._oy += (dy / len) * over;
      dx = (dx / len) * STICK_MAX;
      dy = (dy / len) * STICK_MAX;
      this.stickRoot.style.transform = `translate(${this._ox}px, ${this._oy}px)`;
    }

    this.stickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    this._apply(dx / STICK_MAX, dy / STICK_MAX);
  }

  _onUp(e) {
    if (e.pointerType === 'mouse') { this.state.firing = false; return; }
    if (e.pointerId !== this._stickId) return;
    this._stickId = -1;
    this.stickRoot.hidden = true;
    this._apply(0, 0);
  }

  /** スティックの生の倒し量(-1..1)をデッドゾーン処理して state に入れる */
  _apply(nx, ny) {
    const mag = Math.hypot(nx, ny);
    if (mag < STICK_DEAD) { this.state.moveX = 0; this.state.moveZ = 0; return; }

    // デッドゾーン分を差し引いて 0..1 に張り直す（境界で急に動き出さない）
    const k = ((mag - STICK_DEAD) / (1 - STICK_DEAD)) / mag;
    this.state.moveX = clamp(nx * k, -1, 1);
    // 画面下方向(+y)がワールドの手前(+z)に対応する
    this.state.moveZ = clamp(ny * k, -1, 1);
  }

  /** 毎フレーム、論理更新の前に呼ぶ。キーボード入力をここで畳み込む。 */
  poll() {
    if (this._stickId !== -1) return this.state;    // タッチ中はスティックが優先

    let x = 0, z = 0;
    if (this._keys.has('L')) x -= 1;
    if (this._keys.has('R')) x += 1;
    if (this._keys.has('U')) z -= 1;
    if (this._keys.has('D')) z += 1;

    // 斜め入力が速くならないよう正規化する
    if (x !== 0 && z !== 0) { const k = Math.SQRT1_2; x *= k; z *= k; }

    this.state.moveX = x;
    this.state.moveZ = z;
    return this.state;
  }

  /** 入力があったか（チュートリアル表示の消去判定などに使う） */
  get isActive() {
    return this._stickId !== -1 || this._keys.size > 0;
  }
}

const KEY_MAP = {
  w: 'U', a: 'L', s: 'D', d: 'R',
  ArrowUp: 'U', ArrowLeft: 'L', ArrowDown: 'D', ArrowRight: 'R',
};
