/**
 * localStorage への永続化。
 *
 * ★書き込みは遅延集約する。毎フレーム JSON.stringify するとフレームを落とす。
 * ★ただし「失うと痛いもの」（ガチャ排出・レベルアップ・ラン終了）は即時 flush する。
 * ★localStorage は落ちる前提で書く（プライベートモード・容量超過）。
 *   保存に失敗してもゲームは絶対に止めない。
 *
 * ★このクラスはストレージ入出力だけを持つ。
 *   「文字列 → 正しい形の状態」への変換は migrate.js（DOM非依存・単体テスト可能）にある。
 */
import { SAVE_KEY, BACKUP_KEY } from './schema.js';
import { parseSave, freshSave } from './migrate.js';

const DEBOUNCE_MS = 800;

export class SaveManager {
  constructor() {
    /** 読み込み時に直した内容。設定画面やデバッグから覗ける（ゲーム進行は読まない） */
    this.repairs = [];
    this.data = this.load();
    this._dirty = false;
    this._timer = 0;
    this.available = true;      // localStorage が使えるか

    this._onHide = () => { if (document.hidden) this.flush(); };
    addEventListener('pagehide', () => this.flush());
    document.addEventListener('visibilitychange', this._onHide);
  }

  load() {
    let raw = null;
    try { raw = localStorage.getItem(SAVE_KEY); }
    catch { return freshSave(Date.now()); }          // ストレージ自体が触れない環境

    if (!raw) return freshSave(Date.now());

    try {
      return this._accept(parseSave(raw));
    } catch (err) {
      console.warn('セーブが壊れている。バックアップを試す', err);
      try {
        const bk = localStorage.getItem(BACKUP_KEY);
        if (bk) return this._accept(parseSave(bk), 'バックアップから復旧した');
      } catch { /* バックアップも駄目なら初期値へ */ }
      return freshSave(Date.now());
    }
  }

  _accept(res, note) {
    this.repairs = res.repairs;
    if (note) this.repairs.unshift(note);
    if (this.repairs.length) console.info('セーブを補正した:', this.repairs);
    return res.data;
  }

  /** 変更あり。しばらくして書く。 */
  markDirty() {
    this._dirty = true;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), DEBOUNCE_MS);
  }

  /** 今すぐ書く。★ガチャ排出は演出を再生する「前」にこれを呼ぶこと。 */
  flush() {
    if (!this._dirty) return true;
    clearTimeout(this._timer);

    try {
      const prev = localStorage.getItem(SAVE_KEY);
      if (prev) localStorage.setItem(BACKUP_KEY, prev);   // 1世代だけ残す
      this.data.profile.lastPlayed = Date.now();
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
      this._dirty = false;
      this.available = true;
      return true;
    } catch (err) {
      // 容量超過・プライベートモード。通知だけしてゲームは続行する
      if (this.available) console.warn('セーブに失敗した（進行は保存されない）', err);
      this.available = false;
      return false;
    }
  }

  /** 変更を確定させて即座に書く。失うと痛い節目で使う。 */
  saveNow() {
    this._dirty = true;
    return this.flush();
  }

  /**
   * デバッグ・設定画面からの初期化用。
   * ★バックアップも消す。残したままだと、次に保存が壊れた時に初期化前のデータが蘇る。
   */
  reset() {
    this.data = freshSave(Date.now());
    this.repairs = [];
    this._dirty = true;
    const wrote = this.flush();
    // ★必ず flush の「後」に消す。先に消しても flush が直前の本体をバックアップへ書き戻してしまう
    try { localStorage.removeItem(BACKUP_KEY); } catch { /* 触れなくても続行 */ }
    return wrote;
  }
}
