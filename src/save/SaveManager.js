/**
 * localStorage への永続化。
 *
 * ★書き込みは遅延集約する。毎フレーム JSON.stringify するとフレームを落とす。
 * ★ただし「失うと痛いもの」（ガチャ排出・レベルアップ・ラン終了）は即時 flush する。
 * ★localStorage は落ちる前提で書く（プライベートモード・容量超過）。
 *   保存に失敗してもゲームは絶対に止めない。
 */
import { SAVE_KEY, BACKUP_KEY, SAVE_VERSION, INITIAL_SAVE, MIGRATIONS } from './schema.js';

const DEBOUNCE_MS = 800;

/** 初期値を土台に、保存値を上書きする。旧セーブに無いフィールドが自動で埋まる。 */
function deepMerge(base, patch) {
  if (patch === null || patch === undefined) return base;
  if (typeof base !== 'object' || Array.isArray(base) || base === null) return patch;
  if (typeof patch !== 'object' || Array.isArray(patch)) return patch;

  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const k of Object.keys(patch)) out[k] = deepMerge(base[k], patch[k]);
  return out;
}

const clone = (o) => JSON.parse(JSON.stringify(o));

export class SaveManager {
  constructor() {
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
    catch { return clone(INITIAL_SAVE); }          // ストレージ自体が触れない環境

    if (!raw) return clone(INITIAL_SAVE);

    try {
      return this._parse(raw);
    } catch (err) {
      console.warn('セーブが壊れている。バックアップを試す', err);
      try {
        const bk = localStorage.getItem(BACKUP_KEY);
        if (bk) return this._parse(bk);
      } catch { /* バックアップも駄目なら初期値へ */ }
      return clone(INITIAL_SAVE);
    }
  }

  _parse(raw) {
    let s = JSON.parse(raw);
    if (typeof s !== 'object' || s === null) throw new Error('セーブがオブジェクトではない');

    // 古い形式を順に前進させる
    let guard = 0;
    while ((s.v | 0) < SAVE_VERSION) {
      const next = (s.v | 0) + 1;
      const fn = MIGRATIONS[next];
      if (!fn) { s.v = SAVE_VERSION; break; }     // 移行関数が無ければ追加のみとみなす
      s = fn(s);
      if (++guard > 64) throw new Error('マイグレーションが収束しない');
    }

    return deepMerge(clone(INITIAL_SAVE), s);
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

  /** デバッグ・設定画面からの初期化用。 */
  reset() {
    this.data = clone(INITIAL_SAVE);
    this.data.profile.createdAt = Date.now();
    this._dirty = true;
    return this.flush();
  }
}
