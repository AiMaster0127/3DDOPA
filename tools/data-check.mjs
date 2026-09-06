/**
 * データの自己検査。ブラウザを起動せずに走る一番安いテスト。
 *
 * ★このゲームは「データを1件足すだけで増える」設計なので、壊れ方も
 *   データの矛盾に集中する。存在しない敵IDを湧かせる、形の名前を打ち間違える、
 *   レアリティと強さが逆転する——どれも**実際に遊ぶまで気づけない**。
 *
 * ★2種類の検査を回す：
 *   1. data/validate.js … データの中だけで確かめられること
 *      （参照整合・列挙値・数値の正気・レアリティの単調性・解禁の鎖）
 *   2. ここ            … 層をまたぐ照合。データが書いた「形の名前」に
 *      対応する実体が scene/ や combat/ にあるか
 *
 *   data/ は他の層に依存しない決まりなので、2 をデータ側には置けない。
 *
 *   node tools/data-check.mjs
 */
import { validateData } from '../src/data/validate.js';
import { WEAPONS } from '../src/data/weapons.js';
import { ENEMIES } from '../src/data/enemies.js';
import { CHARACTERS } from '../src/data/characters.js';
import { THEMES } from '../src/data/themes.js';

import { ENEMY_SHAPES } from '../src/scene/enemyShapes.js';
import { BOSS_SHAPES } from '../src/scene/bossShapes.js';
import { WEAPON_MODELS } from '../src/scene/weaponShapes.js';
import { HAIR_STYLES } from '../src/scene/character.js';
import { DECOR_KINDS } from '../src/scene/geometry.js';
import { AI } from '../src/combat/EnemyAI.js';
import { missingFromPrecache } from './precache-cover.mjs';

const errors = [];
const warnings = [];

/**
 * データが指した名前に実体があるか。
 * @param {Array<[string, string]>} pairs [説明, 指した名前]
 */
function refs(label, pairs, known, kind) {
  const used = new Set();
  for (const [at, name] of pairs) {
    if (name == null) continue;
    used.add(name);
    if (!known.includes(name)) {
      errors.push(`${at}: ${kind} 「${name}」に対応する実体が無い（用意されているのは ${known.join(' / ')}）`);
    }
  }
  for (const k of known) {
    if (!used.has(k)) warnings.push(`${label}: ${kind} 「${k}」はどのデータからも使われていない`);
  }
}

refs('敵', ENEMIES.map(e => [`敵「${e.name}」`, e.visual?.geom]), ENEMY_SHAPES, 'visual.geom');
refs('ボス', ENEMIES.filter(e => e.boss).map(e => [`ボス「${e.name}」`, e.visual?.boss]), BOSS_SHAPES, 'visual.boss');
refs('武器', WEAPONS.map(w => [`武器「${w.name}」`, w.visual?.model]), WEAPON_MODELS, 'visual.model');
refs('キャラ', CHARACTERS.map(c => [`キャラ「${c.name}」`, c.visual?.hairStyle]), HAIR_STYLES, 'hairStyle');
refs('テーマ', Object.values(THEMES).map(t => [`テーマ「${t.name}」`, t.decor?.kind]), DECOR_KINDS, 'decor.kind');
refs('敵AI', ENEMIES.map(e => [`敵「${e.name}」`, e.ai]), Object.keys(AI), 'ai');

// ★オフラインだけ壊れる事故は原因が判りにくい。ブラウザを立てる前にここで落とす
for (const f of missingFromPrecache()) {
  errors.push(`sw.js のプリキャッシュ一覧に ${f} が無い（オンラインでは動くがオフラインで壊れる）`);
}

const res = validateData();
errors.push(...res.errors);
warnings.push(...res.warnings);

// ---- 出力 ----
const s = res.stats;
console.log(`武器 ${s.weapons} / 敵 ${s.enemies}（うちボス ${s.bosses}）/ ステージ ${s.stages} / ` +
            `キャラ ${s.characters} / スキル ${s.skills} / 実績 ${s.achievements} / テーマ ${s.themes}`);
for (const kind of Object.keys(s.power)) {
  const line = Object.entries(s.power[kind])
    .map(([r, v]) => `${r} ${v.min.toFixed(0)}〜${v.max.toFixed(0)}`).join(' → ');
  console.log(`  強さの帯（${kind}）: ${line}`);
}
console.log('');

for (const w of warnings) console.log(`警告  ${w}`);
if (warnings.length) console.log('');

if (errors.length) {
  for (const e of errors) console.error(`失敗  ${e}`);
  console.error(`\n${errors.length} 件のデータ不整合`);
  process.exit(1);
}
console.log('データに矛盾なし');
