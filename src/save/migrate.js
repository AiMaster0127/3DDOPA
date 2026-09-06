/**
 * セーブデータの読み込みロジック（DOM に触れない純粋関数だけ）。
 *
 * ★ここに置く理由：ブラウザ無しでテストできるようにするため。
 *   localStorage の読み書きは SaveManager が持つ。この層は「文字列 → 正しい形の状態」だけを担う。
 *   tools/save-check.mjs が古い・壊れた・改竄されたセーブをここに流して検証する。
 *
 * ★方針
 *   1. 絶対に例外でゲームを止めない。JSONとして読めない時だけ throw（呼び出し側がバックアップへ退避する）。
 *   2. 「無い」は deepMerge が埋める。「型がおかしい」は sanitize が直す。
 *   3. 消えたコンテンツを指すIDは落とす。ただし未来バージョンのセーブからは落とさない（後述）。
 */
import { SAVE_VERSION, INITIAL_SAVE, MIGRATIONS } from './schema.js';
import { WEAPON_BY_ID, STARTER_WEAPON } from '../data/weapons.js';
import { CHARACTER_BY_ID, DEFAULT_CHARACTER, CHARACTERS } from '../data/characters.js';
import { UPGRADE_BY_ID } from '../data/upgrades.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { STAGES } from '../data/stages.js';
import { GACHA, RARITIES } from '../data/gacha.js';
import { BALANCE } from '../data/balance.js';

/** 上限。ここを超える値は改竄か破損とみなして丸める。 */
const MAX_CURRENCY = 1e12;
const MAX_COUNT = 1e12;
/** 時刻は Date が表せる上限まで許す。★カウンタと同じ上限にすると現在時刻が丸められる */
const MAX_TIME = 8.64e15;
const HISTORY_MAX = 50;
const QUALITY_MODES = ['auto', 'high', 'mid', 'low'];

/**
 * マージで踏んではいけないキー。
 * ★JSON.parse は "__proto__" を「普通の自前プロパティ」として作るが、
 *   それを out[k] = ... で代入すると out のプロトタイプが差し替わる。
 *   ゲームは壊れないが、以後その枝の挙動が説明できなくなるので入口で捨てる。
 */
const DANGEROUS = new Set(['__proto__', 'constructor', 'prototype']);

/** 実データの最深は inventory.weapons.<id>.lv の4段。深すぎる入力は再帰で落ちる前に切る。 */
const MAX_DEPTH = 12;

/** 実績・バナー・キャラが要求する解放フラグの全体集合 */
const KNOWN_FLAGS = new Set([
  ...ACHIEVEMENTS.map(a => a.unlock),
  ...GACHA.banners.map(b => b.unlock),
  ...CHARACTERS.map(c => c.unlock),
].filter(Boolean));

const KNOWN_STAGES = new Set(STAGES.map(s => String(s.id)));
const RARITY_SET = new Set(RARITIES);

export const clone = (o) => JSON.parse(JSON.stringify(o));

/** 初期値を土台に、保存値を上書きする。旧セーブに無いフィールドが自動で埋まる。 */
export function deepMerge(base, patch, depth = 0) {
  if (patch === null || patch === undefined) return base;
  if (depth >= MAX_DEPTH) return base;                 // 深すぎる枝は採用しない
  if (typeof base !== 'object' || Array.isArray(base) || base === null) return patch;
  if (typeof patch !== 'object' || Array.isArray(patch)) return patch;

  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const k of Object.keys(patch)) {
    if (DANGEROUS.has(k)) continue;
    out[k] = deepMerge(base[k], patch[k], depth + 1);
  }
  return out;
}

// ─────────── 型を直す小物 ───────────
// どれも「不正なら既定値」に落とすだけ。NaN / Infinity / "12" / null / {} を等しく吸収する。

const isPlain = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

function num(v, def, min, max) {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return def;
  return n < min ? min : (n > max ? max : n);
}
function int(v, def, min, max) { return Math.floor(num(v, def, min, max)); }
function bool(v, def) { return typeof v === 'boolean' ? v : (v === undefined ? def : !!v); }
function pick(v, allowed, def) { return allowed.includes(v) ? v : def; }

/**
 * バージョンを現在まで前進させる。
 *
 * ★移行関数が「歯抜け」でも止まらないこと。
 *   v1 のセーブに対して MIGRATIONS[2] が無く MIGRATIONS[3] だけある場合でも、
 *   2 を素通りして 3 を必ず適用する（＝フィールド追加だけの版を挟める）。
 */
export function runMigrations(save, log, target = SAVE_VERSION, table = MIGRATIONS) {
  let s = save;
  let guard = 0;

  while ((s.v | 0) < target) {
    const from = s.v | 0;
    const next = from + 1;
    const fn = table[next];

    if (fn) {
      s = fn(s);
      if (!isPlain(s)) throw new Error(`マイグレーション v${next} がオブジェクトを返さない`);
      log.push(`v${from} → v${next} に移行`);
    }
    // 移行関数の有無に関わらず1つだけ進める。
    // ★関数側が v を書き忘れても必ず前進させる（無限ループを構造的に潰す）。
    s.v = next;

    if (++guard > 64) throw new Error('マイグレーションが収束しない');
  }
  return s;
}

// ─────────── 各セクションの掃除 ───────────

function fixProfile(p, log) {
  const o = isPlain(p) ? p : {};
  if (!isPlain(p) && p !== undefined) log.push('profile の形が壊れていたので作り直した');
  return {
    createdAt: int(o.createdAt, 0, 0, MAX_TIME),
    playTimeMs: int(o.playTimeMs, 0, 0, MAX_COUNT),
    lastPlayed: int(o.lastPlayed, 0, 0, MAX_TIME),
  };
}

function fixWallet(w, log) {
  const o = isPlain(w) ? w : {};
  if (!isPlain(w) && w !== undefined) log.push('wallet の形が壊れていたので作り直した');
  const out = {
    gems: int(o.gems, 0, 0, MAX_CURRENCY),
    tickets: int(o.tickets, 0, 0, MAX_CURRENCY),
    dust: int(o.dust, 0, 0, MAX_CURRENCY),
  };
  for (const k of ['gems', 'tickets', 'dust']) {
    if (out[k] !== o[k]) log.push(`wallet.${k} が不正（${JSON.stringify(o[k])}）なので ${out[k]} にした`);
  }
  return out;
}

function fixMeta(m, log, dropUnknown) {
  const o = isPlain(m) ? m : {};
  if (!isPlain(m) && m !== undefined) log.push('meta の形が壊れていたので作り直した');

  // 拠点強化：知らないIDは落とし、レベルは max で頭打ちにする
  const upgrades = {};
  const rawUp = isPlain(o.upgrades) ? o.upgrades : {};
  for (const id of Object.keys(rawUp)) {
    const def = UPGRADE_BY_ID.get(id);
    if (!def) {
      if (dropUnknown) { log.push(`未知の拠点強化 ${id} を削除`); continue; }
      upgrades[id] = int(rawUp[id], 0, 0, MAX_COUNT);
      continue;
    }
    const lv = int(rawUp[id], 0, 0, def.max);
    if (lv !== rawUp[id]) log.push(`拠点強化 ${id} のレベルを ${JSON.stringify(rawUp[id])} → ${lv} に補正`);
    upgrades[id] = lv;
  }

  // 解放フラグ：文字列だけ・重複なし
  const unlocks = [];
  const seen = new Set();
  for (const f of (Array.isArray(o.unlocks) ? o.unlocks : [])) {
    if (typeof f !== 'string' || seen.has(f)) continue;
    if (dropUnknown && !KNOWN_FLAGS.has(f)) { log.push(`未知の解放フラグ ${f} を削除`); continue; }
    seen.add(f);
    unlocks.push(f);
  }

  // クリア済みステージ：知らないステージIDは落とす
  const clearedStages = {};
  const rawCl = isPlain(o.clearedStages) ? o.clearedStages : {};
  for (const id of Object.keys(rawCl)) {
    if (!rawCl[id]) continue;
    if (dropUnknown && !KNOWN_STAGES.has(String(id))) {
      log.push(`未知のステージ ${id} のクリア記録を削除`);
      continue;
    }
    clearedStages[id] = true;
  }

  // キャラクター：存在しない／未解放なら既定へ。
  // ★ここだけは未来バージョンのセーブでも必ず補正する。
  //   知らないIDのまま PlayerView.setCharacter に渡すと描画が落ちる。
  let character = typeof o.character === 'string' ? o.character : DEFAULT_CHARACTER;
  const chDef = CHARACTER_BY_ID.get(character);
  if (!chDef) {
    if (character !== DEFAULT_CHARACTER) log.push(`存在しないキャラクター ${character} → ${DEFAULT_CHARACTER}`);
    character = DEFAULT_CHARACTER;
  } else if (chDef.unlock && !seen.has(chDef.unlock)) {
    log.push(`未解放のキャラクター ${character} が選択されていた → ${DEFAULT_CHARACTER}`);
    character = DEFAULT_CHARACTER;
  }

  // 最後に選んだステージ。★解放していないステージを指していたら手前へ戻す。
  //   Game は meta.lastStage をそのまま出撃先にするので、ここが緩いと攻略順を飛ばせてしまう。
  const unlocked = STAGES.filter(st => st.unlock === 0 || clearedStages[st.unlock]).map(st => st.id);
  const highest = unlocked.length ? unlocked[unlocked.length - 1] : (STAGES[0]?.id ?? 1);
  let lastStage = int(o.lastStage, highest, 1, highest);
  if (!unlocked.includes(lastStage)) lastStage = highest;
  if (o.lastStage !== undefined && lastStage !== o.lastStage) {
    log.push(`未解放のステージ ${JSON.stringify(o.lastStage)} が選ばれていた → ${lastStage}`);
  }

  return {
    accountLv: int(o.accountLv, 1, 1, BALANCE.accountLevel.maxLevel),
    accountXp: int(o.accountXp, 0, 0, MAX_COUNT),
    upgrades, unlocks, clearedStages,
    lastStage,
    character,
  };
}

function fixInventory(inv, log, dropUnknown) {
  const o = isPlain(inv) ? inv : {};
  if (!isPlain(inv) && inv !== undefined) log.push('inventory の形が壊れていたので作り直した');

  const weapons = {};
  const raw = isPlain(o.weapons) ? o.weapons : {};
  for (const id of Object.keys(raw)) {
    const def = WEAPON_BY_ID.get(id);
    if (!def && dropUnknown) { log.push(`消えた武器 ${id} を所持から削除`); continue; }
    const e = isPlain(raw[id]) ? raw[id] : {};
    weapons[id] = {
      lv: int(e.lv, 1, 1, GACHA.enhance.maxLevel),
      lb: int(e.lb, 0, 0, GACHA.limitBreak.maxLB),
      shards: int(e.shards, 0, 0, MAX_COUNT),
      obtainedAt: int(e.obtainedAt, 0, 0, MAX_TIME),
    };
  }

  // 初期武器は必ず持っている（＝装備できるものが常に1つある）
  if (!weapons[STARTER_WEAPON]) {
    weapons[STARTER_WEAPON] = { lv: 1, lb: 0, shards: 0, obtainedAt: 0 };
    log.push('初期武器を持っていなかったので補填');
  }

  let equipped = typeof o.equipped === 'string' ? o.equipped : STARTER_WEAPON;
  if (!weapons[equipped] || !WEAPON_BY_ID.has(equipped)) {
    if (equipped !== STARTER_WEAPON) log.push(`装備できない武器 ${equipped} → ${STARTER_WEAPON}`);
    equipped = STARTER_WEAPON;
  }
  return { weapons, equipped };
}

function fixGacha(g, log, dropUnknown) {
  const o = isPlain(g) ? g : {};
  if (!isPlain(g) && g !== undefined) log.push('gacha の形が壊れていたので作り直した');

  const history = [];
  for (const h of (Array.isArray(o.history) ? o.history : [])) {
    if (!isPlain(h) || typeof h.id !== 'string') continue;
    if (dropUnknown && !WEAPON_BY_ID.has(h.id)) continue;    // 履歴は失っても痛くない。黙って捨てる
    history.push({
      id: h.id,
      rarity: RARITY_SET.has(h.rarity) ? h.rarity : 'N',
      at: int(h.at, 0, 0, MAX_TIME),
    });
  }
  // 保存が肥大化しないよう、読み込み時にも直近ぶんだけに切り詰める
  if (history.length > HISTORY_MAX) history.splice(0, history.length - HISTORY_MAX);

  const sinceSSR = int(o.sinceSSR, 0, 0, GACHA.pity.hard);
  if (o.sinceSSR !== undefined && sinceSSR !== o.sinceSSR) {
    log.push(`天井カウンタが範囲外（${JSON.stringify(o.sinceSSR)}）なので ${sinceSSR} にした`);
  }
  return {
    totalPulls: int(o.totalPulls, 0, 0, MAX_COUNT),
    sinceSSR,
    lostFiftyFifty: bool(o.lostFiftyFifty, false),
    history,
  };
}

function fixStats(s, log) {
  const o = isPlain(s) ? s : {};
  if (!isPlain(s) && s !== undefined) log.push('stats の形が壊れていたので作り直した');
  const out = {};
  for (const k of Object.keys(INITIAL_SAVE.stats)) out[k] = int(o[k], 0, 0, MAX_COUNT);
  return out;
}

function fixAchievements(a, log, dropUnknown) {
  const o = isPlain(a) ? a : {};
  if (!isPlain(a) && a !== undefined) log.push('achievements の形が壊れていたので作り直した');
  const known = new Set(ACHIEVEMENTS.map(x => x.id));
  const out = {};
  for (const id of Object.keys(o)) {
    if (!o[id]) continue;
    if (dropUnknown && !known.has(id)) { log.push(`未知の実績 ${id} を削除`); continue; }
    out[id] = true;
  }
  return out;
}

function fixSettings(s, log) {
  const o = isPlain(s) ? s : {};
  if (!isPlain(s) && s !== undefined) log.push('settings の形が壊れていたので作り直した');
  const d = INITIAL_SAVE.settings;
  return {
    sfx: num(o.sfx, d.sfx, 0, 1),
    bgm: num(o.bgm, d.bgm, 0, 1),
    quality: pick(o.quality, QUALITY_MODES, d.quality),
    autoFire: bool(o.autoFire, d.autoFire),
  };
}

/**
 * 全フィールドの型と参照先を正す。
 *
 * @param {object} s  マイグレーション済みのセーブ
 * @param {string[]} log 直した内容の記録（デバッグ用。ゲームは読まない）
 * @param {boolean} dropUnknown
 *   知らないIDを削除してよいか。
 *   ★新しいビルドで作られたセーブを古いビルドが読んだ場合（v > SAVE_VERSION）は false。
 *     こちらが知らないだけの武器や実績を消してしまうと、新しいビルドに戻った時に進行が失われる。
 *     知らないIDが混ざっていても、参照側はすべてマスタ側から引くので実害は無い。
 */
export function sanitize(s, log = [], dropUnknown = true) {
  const out = deepMerge(clone(INITIAL_SAVE), isPlain(s) ? s : {});

  out.v = int(s && s.v, SAVE_VERSION, 0, 1e6);
  out.profile = fixProfile(out.profile, log);
  out.meta = fixMeta(out.meta, log, dropUnknown);
  out.wallet = fixWallet(out.wallet, log);
  out.inventory = fixInventory(out.inventory, log, dropUnknown);
  out.gacha = fixGacha(out.gacha, log, dropUnknown);
  out.stats = fixStats(out.stats, log);
  out.achievements = fixAchievements(out.achievements, log, dropUnknown);
  out.settings = fixSettings(out.settings, log);
  return out;
}

/**
 * 保存文字列 → 遊べる状態。
 *
 * JSONとして読めない場合だけ throw する（呼び出し側がバックアップに退避できるように）。
 * それ以外は、どれだけ壊れていても必ず遊べる形を返す。
 *
 * @returns {{data: object, repairs: string[], fromFuture: boolean}}
 */
export function parseSave(raw) {
  const parsed = JSON.parse(raw);
  if (!isPlain(parsed)) throw new Error('セーブがオブジェクトではない');

  const repairs = [];
  const fromFuture = (parsed.v | 0) > SAVE_VERSION;
  if (fromFuture) {
    repairs.push(`新しいビルドのセーブ（v${parsed.v | 0} > v${SAVE_VERSION}）。未知のIDは保持する`);
  }

  const migrated = runMigrations(parsed, repairs);
  const data = sanitize(migrated, repairs, !fromFuture);
  return { data, repairs, fromFuture };
}

/** 新規セーブ。 */
export function freshSave(now = 0) {
  const s = clone(INITIAL_SAVE);
  s.profile.createdAt = now;
  return s;
}
