/**
 * セーブデータの互換性検査。ブラウザ不要（node だけで走る）。
 *
 * ★ここが守りたいこと
 *   1. 古いセーブを読んでも、足りないフィールドが必ず埋まる
 *   2. 壊れた・改竄されたセーブでゲームが起動しなくなることが無い
 *   3. データから消えたコンテンツ（武器・キャラ・実績）を指す参照が残らない
 *   4. 新しいビルドで作られたセーブを古いビルドが読んでも、進行を削らない
 *
 * ★セーブの形を変えたら、その版の実物をここに1件足すこと。
 *   「昔のセーブが読めるか」は、実物を通す以外に確かめようがない。
 */
import {
  parseSave, sanitize, deepMerge, runMigrations, freshSave, clone,
} from '../src/save/migrate.js';
import { SAVE_VERSION, INITIAL_SAVE } from '../src/save/schema.js';
import { WEAPON_BY_ID, STARTER_WEAPON } from '../src/data/weapons.js';
import { CHARACTER_BY_ID, DEFAULT_CHARACTER } from '../src/data/characters.js';
import { UPGRADE_BY_ID } from '../src/data/upgrades.js';
import { ACHIEVEMENTS } from '../src/data/achievements.js';
import { GACHA } from '../src/data/gacha.js';
import { STAGES } from '../src/data/stages.js';
import { BALANCE } from '../src/data/balance.js';

let failed = 0;
const ok = (name, detail = '') => console.log(` OK   ${name}${detail ? '  — ' + detail : ''}`);
const ng = (name, detail = '') => { failed++; console.log(`FAIL  ${name}${detail ? '  — ' + detail : ''}`); };
const check = (cond, name, detail = '') => (cond ? ok(name, detail) : ng(name, detail));

const J = (o) => JSON.stringify(o);

/** 読み込み結果が「そのまま遊べる形」になっているかを機械的に確かめる。 */
function assertPlayable(label, data) {
  const bad = [];
  const t = (cond, msg) => { if (!cond) bad.push(msg); };

  t(Object.getPrototypeOf(data) === Object.prototype, 'プロトタイプが差し替わっている');

  for (const k of Object.keys(INITIAL_SAVE)) t(data[k] !== undefined, `${k} が無い`);

  t(Number.isFinite(data.profile.playTimeMs) && data.profile.playTimeMs >= 0, 'playTimeMs が不正');

  for (const k of ['gems', 'tickets', 'dust']) {
    const v = data.wallet[k];
    t(Number.isInteger(v) && v >= 0, `wallet.${k} が非負整数でない (${J(v)})`);
  }

  const m = data.meta;
  t(Number.isInteger(m.accountLv) && m.accountLv >= 1 && m.accountLv <= BALANCE.accountLevel.maxLevel,
    `accountLv が範囲外 (${J(m.accountLv)})`);
  t(CHARACTER_BY_ID.has(m.character), `キャラクター ${J(m.character)} が存在しない`);
  const chDef = CHARACTER_BY_ID.get(m.character);
  t(!chDef?.unlock || m.unlocks.includes(chDef.unlock), `未解放キャラ ${m.character} が選択されている`);
  t(Array.isArray(m.unlocks) && m.unlocks.every(f => typeof f === 'string'), 'unlocks が文字列配列でない');
  t(new Set(m.unlocks).size === m.unlocks.length, 'unlocks に重複がある');
  for (const [id, lv] of Object.entries(m.upgrades)) {
    const def = UPGRADE_BY_ID.get(id);
    if (!def) continue;                    // 未来バージョン由来は許す。levelOf は知らないIDを読まない
    t(Number.isInteger(lv) && lv >= 0 && lv <= def.max, `拠点強化 ${id} が範囲外 (${J(lv)})`);
  }

  const inv = data.inventory;
  t(!!inv.weapons[STARTER_WEAPON], '初期武器を持っていない');
  t(!!inv.weapons[inv.equipped], `装備 ${J(inv.equipped)} を所持していない`);
  t(WEAPON_BY_ID.has(inv.equipped), `装備 ${J(inv.equipped)} がデータに無い`);
  for (const [id, e] of Object.entries(inv.weapons)) {
    t(Number.isInteger(e.lv) && e.lv >= 1 && e.lv <= GACHA.enhance.maxLevel, `${id}.lv が範囲外 (${J(e.lv)})`);
    t(Number.isInteger(e.lb) && e.lb >= 0 && e.lb <= GACHA.limitBreak.maxLB, `${id}.lb が範囲外 (${J(e.lb)})`);
    t(Number.isInteger(e.shards) && e.shards >= 0, `${id}.shards が非負整数でない`);
  }

  const g = data.gacha;
  t(Number.isInteger(g.sinceSSR) && g.sinceSSR >= 0 && g.sinceSSR <= GACHA.pity.hard,
    `天井カウンタが範囲外 (${J(g.sinceSSR)})`);
  t(typeof g.lostFiftyFifty === 'boolean', 'lostFiftyFifty が真偽値でない');
  t(Array.isArray(g.history) && g.history.length <= 50, `履歴が ${g.history?.length} 件`);

  const st = data.settings;
  t(st.sfx >= 0 && st.sfx <= 1 && st.bgm >= 0 && st.bgm <= 1, '音量が 0..1 の外');
  t(['auto', 'high', 'mid', 'low'].includes(st.quality), `画質 ${J(st.quality)} が不正`);
  t(typeof st.autoFire === 'boolean', 'autoFire が真偽値でない');

  // 実績の判定関数を全部通す。セーブの形が崩れていれば例外で判る
  for (const a of ACHIEVEMENTS) {
    try { a.check(data, WEAPON_BY_ID.size); }
    catch (err) { bad.push(`実績 ${a.id} の判定が例外 (${err.message})`); }
  }

  check(bad.length === 0, label, bad.length ? bad.join(' / ') : '全項目が健全');
  return bad.length === 0;
}

/** JSON文字列を通して読み込む。読めなければ null（＝呼び出し側がバックアップへ退避する状況）。 */
function load(raw) {
  try { return parseSave(raw); } catch { return null; }
}

console.log('── セーブ互換性 ──\n');

// ── 1. 新規・空 ──
assertPlayable('新規セーブがそのまま遊べる', freshSave(Date.now()));
assertPlayable('空オブジェクトのセーブを埋められる', load('{}').data);

// ── 2. 読めない入力は例外にして、呼び出し側にバックアップ退避を促す ──
{
  const bad = ['', 'null', '3', '"x"', '[]', '{', 'undefined', '[1,2,3]'];
  const rejected = bad.filter(r => load(r) === null);
  check(rejected.length === bad.length, 'オブジェクトでない入力を弾く',
    `${rejected.length}/${bad.length} 件を拒否`);
}

// ── 3. 旧バージョンのセーブ（実物） ──
// ★セーブの形を変えたらここに1件足す。
const OLD_SAVES = [
  {
    label: 'v1 初期リリース相当（拠点強化が3種しか無かった頃）',
    raw: {
      v: 1,
      profile: { createdAt: 1700000000000, playTimeMs: 3600000, lastPlayed: 1700003600000 },
      meta: {
        accountLv: 7, accountXp: 420,
        upgrades: { hp: 3, atk: 2, speed: 1, gachaLuck: 4 },  // gachaLuck は廃止済み
        unlocks: ['char_ranger'], clearedStages: { 1: true, 2: true }, lastStage: 3,
      },
      wallet: { gems: 1200, tickets: 2, dust: 340 },
      inventory: {
        weapons: { wp_iron_sword: { lv: 4, lb: 1, shards: 2, obtainedAt: 1700000000000 } },
        equipped: 'wp_iron_sword',
      },
      gacha: { totalPulls: 31, sinceSSR: 12, lostFiftyFifty: true, history: [] },
      stats: { bestStage: 2, bestTimeMs: 92000, bestRunLv: 11, totalKills: 830, totalBosses: 1, totalRuns: 6, ssrCount: 1 },
      achievements: { kill_100: true, boss_1: true, stage_1: true },
      settings: { sfx: 0.8, bgm: 0.5, quality: 'auto', autoFire: true },
    },
  },
  {
    // v がそもそも無かった時代のセーブ（0 とみなして前進させる）
    label: 'バージョン欄の無い最古のセーブ',
    raw: { wallet: { gems: 500 }, stats: { totalKills: 12 } },
  },
];

for (const c of OLD_SAVES) {
  const res = load(JSON.stringify(c.raw));
  if (!res) { ng(c.label, '読み込みに失敗した'); continue; }
  assertPlayable(c.label, res.data);
}

// 旧セーブの「進行」が消えていないこと。互換性の本体はこれ
{
  const res = load(JSON.stringify(OLD_SAVES[0].raw));
  const d = res.data;
  const keep = d.wallet.gems === 1200 && d.meta.accountLv === 7 &&
               d.meta.upgrades.hp === 3 && d.stats.totalKills === 830 &&
               d.inventory.weapons.wp_iron_sword.lv === 4 &&
               d.meta.clearedStages[2] === true && d.achievements.boss_1 === true;
  check(keep, '旧セーブの進行が失われない',
    `ジェム${d.wallet.gems} / Lv${d.meta.accountLv} / 撃破${d.stats.totalKills} / 武器Lv${d.inventory.weapons.wp_iron_sword.lv}`);

  // 新しく増えたフィールドが自動で生えていること
  const grown = d.meta.character === DEFAULT_CHARACTER &&
                UPGRADE_BY_ID.has('crit') && d.meta.upgrades.crit === 0 &&
                d.settings.autoFire === true;
  check(grown, '旧セーブに新フィールドが自動で生える', `character=${d.meta.character} / crit=${d.meta.upgrades.crit}`);

  // 廃止したIDは残らない
  check(d.meta.upgrades.gachaLuck === undefined, '廃止した拠点強化IDが残らない');
}

// ── 4. マイグレーション連鎖 ──
// ★歯抜けでも止まらないこと。フィールド追加だけの版（移行関数なし）を挟めるようにするため。
{
  const log = [];
  const table = {
    // 2 は意図的に用意しない（＝追加のみの版）
    3: (s) => { s.mark3 = true; return s; },
    4: (s) => { s.mark4 = true; return s; },
  };
  const out = runMigrations({ v: 1 }, log, 4, table);
  check(out.v === 4 && out.mark3 === true && out.mark4 === true,
    '移行関数が歯抜けでも後続が適用される', `v=${out.v} / mark3=${out.mark3} / mark4=${out.mark4}`);
}
{
  // v を書き忘れた移行関数でも無限ループしない
  const out = runMigrations({ v: 0 }, [], 3, { 1: (s) => s, 2: (s) => s, 3: (s) => s });
  check(out.v === 3, '移行関数が v を書き忘れても前進する', `v=${out.v}`);
}
{
  // v を巻き戻す移行関数を書いてしまっても、必ず終わること。
  // ★呼び出し側で v を上書きしているので構造的に回り続けない（guard は最後の保険）
  const out = runMigrations({ v: 0 }, [], 3, { 1: (s) => { s.v = -100; return s; }, 2: (s) => s, 3: (s) => s });
  check(out.v === 3, '移行関数が v を巻き戻しても無限ループしない', `v=${out.v}`);
}
{
  // オブジェクトを返さない移行関数は例外にする。壊れたまま先に進ませない
  let threw = false;
  try { runMigrations({ v: 0 }, [], 1, { 1: () => undefined }); }
  catch { threw = true; }
  check(threw, 'オブジェクトを返さない移行関数を例外にする');
}
{
  const already = runMigrations({ v: SAVE_VERSION, x: 1 }, []);
  check(already.v === SAVE_VERSION && already.x === 1, '現行バージョンのセーブは素通しする');
}

// ── 5. 型が壊れている・改竄されている ──
const HOSTILE = [
  { label: '数値であるべき場所が文字列', raw: { v: 1, wallet: { gems: 'abc', tickets: '5', dust: '' } } },
  { label: 'NaN / Infinity 相当', raw: { v: 1, wallet: { gems: 1e999 }, settings: { sfx: 1e999, bgm: -1e999 } } },
  { label: '負の値', raw: { v: 1, wallet: { gems: -500, tickets: -3 }, meta: { accountLv: -9 } } },
  { label: 'オブジェクトであるべき場所が配列', raw: { v: 1, meta: [], inventory: [], gacha: [], settings: [] } },
  { label: '配列であるべき場所がオブジェクト', raw: { v: 1, meta: { unlocks: { a: 1 } }, gacha: { history: { a: 1 } } } },
  { label: 'すべて null', raw: { v: 1, profile: null, meta: null, wallet: null, inventory: null, gacha: null, stats: null, achievements: null, settings: null } },
  { label: '通貨の桁あふれ', raw: { v: 1, wallet: { gems: 1e300, tickets: 9e99, dust: 1e30 } } },
  { label: '上限を超えた強化', raw: { v: 1, meta: { accountLv: 9999, upgrades: { hp: 9999, atk: -5 } }, inventory: { weapons: { wp_iron_sword: { lv: 999, lb: 99, shards: -1 } } } } },
  { label: '天井カウンタの改竄', raw: { v: 1, gacha: { sinceSSR: 99999, totalPulls: -1, lostFiftyFifty: 'yes' } } },
  { label: '設定値の異常', raw: { v: 1, settings: { sfx: 99, bgm: -99, quality: 'ultra', autoFire: 'no' } } },
  { label: '未知のトップレベルキー', raw: { v: 1, hacked: true, __proto__: { pwned: 1 } } },
  { label: '入れ子が深すぎる', raw: (() => { const o = { v: 1 }; let n = o; for (let i = 0; i < 400; i++) { n.a = {}; n = n.a; } return o; })() },
];
for (const c of HOSTILE) assertPlayable(c.label, load(JSON.stringify(c.raw))?.data ?? freshSave(0));

// プロトタイプ汚染がグローバルに漏れていないこと
{
  load('{"v":1,"__proto__":{"pwned":1},"meta":{"__proto__":{"accountLv":99}}}');
  check({}.pwned === undefined && Object.prototype.pwned === undefined,
    'プロトタイプ汚染が漏れない');
}

// ── 6. 消えたコンテンツへの参照 ──
{
  const raw = {
    v: 1,
    meta: {
      character: 'ch_deleted',
      upgrades: { hp: 2, ghost_upgrade: 9 },
      unlocks: ['char_ranger', 'flag_that_no_longer_exists', 'char_ranger'],
      clearedStages: { 1: true, 99: true },
    },
    inventory: { weapons: { wp_iron_sword: { lv: 2 }, wp_deleted_blade: { lv: 9 } }, equipped: 'wp_deleted_blade' },
    gacha: { history: [{ id: 'wp_deleted_blade', rarity: 'SSR', at: 1 }, { id: 'wp_iron_sword', rarity: 'N', at: 2 }] },
    achievements: { kill_100: true, achievement_that_was_removed: true },
  };
  const res = load(JSON.stringify(raw));
  assertPlayable('消えたコンテンツを指すセーブが遊べる', res.data);

  const d = res.data;
  const cleaned =
    d.meta.character === DEFAULT_CHARACTER &&
    d.meta.upgrades.ghost_upgrade === undefined &&
    !d.meta.unlocks.includes('flag_that_no_longer_exists') &&
    d.meta.unlocks.filter(f => f === 'char_ranger').length === 1 &&
    d.meta.clearedStages[99] === undefined &&
    d.inventory.weapons.wp_deleted_blade === undefined &&
    d.inventory.equipped === STARTER_WEAPON &&
    d.gacha.history.length === 1 &&
    d.achievements.achievement_that_was_removed === undefined;
  check(cleaned, '消えたコンテンツへの参照が残らない',
    `装備=${d.inventory.equipped} / 履歴${d.gacha.history.length}件 / 解放${d.meta.unlocks.length}件`);

  // 生きている進行まで巻き添えで消していないこと
  check(d.meta.upgrades.hp === 2 && d.achievements.kill_100 === true && d.meta.clearedStages[1] === true,
    '掃除が生きている進行を巻き込まない');
}

// 未解放キャラを選んでいるセーブ（改竄・データ変更）
{
  const locked = [...CHARACTER_BY_ID.values()].find(c => c.unlock);
  const res = load(JSON.stringify({ v: 1, meta: { character: locked.id, unlocks: [] } }));
  check(res.data.meta.character === DEFAULT_CHARACTER,
    '未解放キャラの選択を既定へ戻す', `${locked.id} → ${res.data.meta.character}`);

  // 解放済みなら維持する
  const res2 = load(JSON.stringify({ v: 1, meta: { character: locked.id, unlocks: [locked.unlock] } }));
  check(res2.data.meta.character === locked.id, '解放済みキャラの選択は維持する', locked.id);
}

// ── 6.5. 攻略順を飛ばせないこと ──
// ★Game は meta.lastStage をそのまま出撃先にする。ここが緩いと改竄で最終面に直行できる。
{
  const last = STAGES[STAGES.length - 1].id;
  const a = load(JSON.stringify({ v: 1, meta: { lastStage: last, clearedStages: {} } })).data;
  check(a.meta.lastStage === STAGES[0].id, '未クリアで最終面を選んでいたら手前へ戻す',
    `${last} → ${a.meta.lastStage}`);

  // 1面クリア済みなら2面までは許す
  const b = load(JSON.stringify({ v: 1, meta: { lastStage: last, clearedStages: { 1: true } } })).data;
  const expect = STAGES.filter(s => s.unlock === 0 || s.unlock === 1).map(s => s.id).pop();
  check(b.meta.lastStage === expect, '解放済みの範囲までは維持する', `${last} → ${b.meta.lastStage}`);

  // 正当な進行は動かさない
  const cleared = {};
  for (const s of STAGES) cleared[s.id] = true;
  const c = load(JSON.stringify({ v: 1, meta: { lastStage: last, clearedStages: cleared } })).data;
  check(c.meta.lastStage === last, '全クリア済みなら最終面の選択を維持する', `${c.meta.lastStage}`);
}

// ── 7. 未来のビルドで作られたセーブ ──
// SW が古いビルドを返した時などに起きる。知らないIDを消すと、新しいビルドに戻った時に進行が消える。
{
  const raw = {
    v: SAVE_VERSION + 5,
    meta: { upgrades: { hp: 3, future_upgrade: 4 }, unlocks: ['char_ranger', 'future_flag'], character: 'ch_future' },
    inventory: { weapons: { wp_iron_sword: { lv: 3 }, wp_future_blade: { lv: 7, lb: 2 } }, equipped: 'wp_future_blade' },
    achievements: { future_achievement: true },
    wallet: { gems: 'nope' },
  };
  const res = load(JSON.stringify(raw));
  assertPlayable('未来バージョンのセーブでも遊べる', res.data);

  const d = res.data;
  const kept = d.inventory.weapons.wp_future_blade !== undefined &&
               d.meta.upgrades.future_upgrade === 4 &&
               d.meta.unlocks.includes('future_flag') &&
               d.achievements.future_achievement === true;
  check(kept, '未来バージョンの未知IDを消さない', `武器${Object.keys(d.inventory.weapons).length}種 / 解放${d.meta.unlocks.length}件`);

  // それでも「壊れる参照」だけは直す
  check(d.meta.character === DEFAULT_CHARACTER && d.inventory.equipped === STARTER_WEAPON && d.wallet.gems === 0,
    '未来バージョンでも描画が落ちる参照は直す', `character=${d.meta.character} / 装備=${d.inventory.equipped}`);
  check(res.fromFuture === true, '未来バージョンであることを呼び出し側に伝える');
}

// ── 8. 肥大化 ──
{
  const history = [];
  for (let i = 0; i < 5000; i++) history.push({ id: STARTER_WEAPON, rarity: 'N', at: i });
  const res = load(JSON.stringify({ v: 1, gacha: { history } }));
  const h = res.data.gacha.history;
  check(h.length === 50 && h[49].at === 4999, 'ガチャ履歴が読み込み時に切り詰められる',
    `${history.length} → ${h.length} 件（直近を残す）`);

  const size = JSON.stringify(res.data).length;
  check(size < 40000, 'セーブが肥大化しない', `${size} バイト`);
}

// 満載のセーブ（全武器・全実績・全強化）でも上限を割らない
{
  const weapons = {};
  const now = Date.now();
  for (const id of WEAPON_BY_ID.keys()) weapons[id] = { lv: 20, lb: 5, shards: 13, obtainedAt: now };
  const achievements = {};
  for (const a of ACHIEVEMENTS) achievements[a.id] = true;
  const upgrades = {};
  for (const [id, u] of UPGRADE_BY_ID) upgrades[id] = u.max;
  const res = load(JSON.stringify({ v: 1, inventory: { weapons, equipped: STARTER_WEAPON }, achievements, meta: { upgrades } }));
  assertPlayable('全解放セーブが遊べる', res.data);
  check(Object.keys(res.data.inventory.weapons).length === WEAPON_BY_ID.size,
    '全武器が所持のまま残る', `${Object.keys(res.data.inventory.weapons).length}/${WEAPON_BY_ID.size} 種`);
  // ★取得時刻がカウンタ上限に丸められていないこと（現在時刻は 1e12 を超える）
  check(res.data.inventory.weapons[STARTER_WEAPON].obtainedAt === now,
    '取得時刻が丸められない', `${now}`);
  const size = JSON.stringify(res.data).length;
  check(size < 80000, '全解放でもセーブが localStorage の上限に遠い', `${size} バイト（上限の目安 5MB）`);
}

// ── 9. 冪等性 ──
// 読んで書いて読み直しても変わらないこと。ズレると保存のたびに値が動く
{
  const first = load(JSON.stringify(OLD_SAVES[0].raw)).data;
  const second = load(JSON.stringify(first)).data;
  check(J(first) === J(second), '読み込みが冪等（読み直しても変わらない）');

  const s3 = sanitize(sanitize(clone(INITIAL_SAVE)));
  check(J(s3) === J(sanitize(clone(INITIAL_SAVE))), 'sanitize が冪等');
}

// deepMerge が土台を書き換えないこと（INITIAL_SAVE が汚染されると次の読み込みが壊れる）
{
  const before = J(INITIAL_SAVE);
  load(JSON.stringify({ v: 1, meta: { unlocks: ['x'] }, inventory: { weapons: { wp_iron_sword: { lv: 9 } } } }));
  check(J(INITIAL_SAVE) === before, 'INITIAL_SAVE が読み込みで汚染されない');
}

// ── 10. schema と data のずれ ──
{
  const bad = Object.keys(INITIAL_SAVE.meta.upgrades).filter(id => !UPGRADE_BY_ID.has(id));
  check(bad.length === 0, '初期セーブの拠点強化IDがマスタと一致する', bad.length ? `不明: ${bad.join(', ')}` : `${UPGRADE_BY_ID.size}種`);

  check(WEAPON_BY_ID.has(INITIAL_SAVE.inventory.equipped), '初期装備がマスタに存在する', INITIAL_SAVE.inventory.equipped);
  check(CHARACTER_BY_ID.has(INITIAL_SAVE.meta.character), '初期キャラがマスタに存在する', INITIAL_SAVE.meta.character);
  const ch = CHARACTER_BY_ID.get(INITIAL_SAVE.meta.character);
  check(!ch.unlock, '初期キャラに解放条件が付いていない');
}

// ── 11. SaveManager の入出力 ──
// ★localStorage と document を最小限だけ偽装して、保存・復旧・初期化の道筋を通す。
//   ここを通しておかないと「バックアップから復旧できているつもり」で気付けない。
{
  const makeStore = (throwing = false) => {
    const map = new Map();
    return {
      map,
      getItem: (k) => { if (throwing) throw new Error('storage disabled'); return map.has(k) ? map.get(k) : null; },
      setItem: (k, v) => { if (throwing) throw new Error('storage disabled'); map.set(k, String(v)); },
      removeItem: (k) => { if (throwing) throw new Error('storage disabled'); map.delete(k); },
    };
  };

  globalThis.document = { hidden: false, addEventListener() {} };
  globalThis.addEventListener = () => {};

  const { SAVE_KEY, BACKUP_KEY } = await import('../src/save/schema.js');
  const { SaveManager } = await import('../src/save/SaveManager.js');

  // 保存 → 読み直しで一致する
  {
    globalThis.localStorage = makeStore();
    const a = new SaveManager();
    a.data.wallet.gems = 777;
    a.data.meta.accountLv = 12;
    check(a.saveNow() === true, '保存できる');
    const b = new SaveManager();
    check(b.data.wallet.gems === 777 && b.data.meta.accountLv === 12,
      '保存した内容を読み直せる', `ジェム${b.data.wallet.gems} / Lv${b.data.meta.accountLv}`);
  }

  // 本体が壊れたらバックアップから復旧する
  {
    const store = makeStore();
    globalThis.localStorage = store;
    const a = new SaveManager();
    a.data.wallet.gems = 4200;
    a.saveNow();                                  // 1回目：本体だけ
    a.data.wallet.gems = 4300;
    a.saveNow();                                  // 2回目：1回目ぶんがバックアップへ回る
    check(store.map.get(BACKUP_KEY) !== undefined, 'バックアップが1世代残る');

    store.map.set(SAVE_KEY, '{"wallet":{');       // 本体を破壊
    const b = new SaveManager();
    check(b.data.wallet.gems === 4200, '本体が壊れたらバックアップから復旧する', `ジェム${b.data.wallet.gems}`);
    check(b.repairs[0]?.includes('バックアップ'), '復旧したことを記録に残す', b.repairs[0] || '(記録なし)');
  }

  // 両方壊れていたら初期値で起動する（絶対に起動不能にしない）
  {
    const store = makeStore();
    globalThis.localStorage = store;
    store.map.set(SAVE_KEY, 'not json');
    store.map.set(BACKUP_KEY, 'also not json');
    const a = new SaveManager();
    assertPlayable('本体もバックアップも壊れていたら初期値で起動する', a.data);
  }

  // 初期化はバックアップも消す。★残すと次に壊れた時に初期化前のデータが蘇る
  {
    const store = makeStore();
    globalThis.localStorage = store;
    const a = new SaveManager();
    a.data.wallet.gems = 9999; a.saveNow();
    a.data.wallet.gems = 8888; a.saveNow();
    check(store.map.has(BACKUP_KEY), '初期化前にバックアップがある');

    a.reset();
    check(!store.map.has(BACKUP_KEY), '初期化がバックアップも消す');

    store.map.set(SAVE_KEY, '{broken');            // 初期化後に本体だけ壊す
    const b = new SaveManager();
    check(b.data.wallet.gems === 0, '初期化したデータが蘇らない', `ジェム${b.data.wallet.gems}`);
  }

  // localStorage が触れない環境（プライベートモード・容量超過）でも起動して遊べる
  {
    globalThis.localStorage = makeStore(true);
    let a = null;
    try { a = new SaveManager(); } catch (err) { ng('ストレージが使えなくても起動する', err.message); }
    if (a) {
      assertPlayable('ストレージが使えなくても起動する', a.data);
      a.data.wallet.gems = 10;
      check(a.saveNow() === false && a.available === false,
        '保存に失敗しても例外を投げずに続行する', `available=${a.available}`);
      check(a.data.wallet.gems === 10, '保存に失敗してもメモリ上の進行は生きている');
    }
  }
}

console.log('');
if (failed) { console.log(`失敗 ${failed} 件`); process.exit(1); }
console.log('セーブ互換性: すべて合格');
