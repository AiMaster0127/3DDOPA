/**
 * データ全体の自己検査。
 *
 * ★このゲームは「データを1件足すだけで増える」設計なので、
 *   壊れ方も「データの矛盾」に集中する。存在しない敵IDを湧かせる、
 *   未実装の効果IDを書く、レアリティと強さが逆転する——どれも
 *   **実際に遊ぶまで気づけない**。ここで機械的に潰す。
 *
 * ★data/ は他の層に依存しない（一方通行の原則）。
 *   なので「visual.geom に対応する形が scene/ にあるか」のような
 *   層をまたぐ検査は tools/data-check.mjs が受け持つ。
 *   ここはデータの中だけで確かめられることに徹する。
 *
 * 使い方：
 *   起動時に Game が呼ぶ（壊れていれば console.error に出る）
 *   npm run data-check でCIとしても回る
 */
import { WEAPONS, WEAPON_BY_ID, STARTER_WEAPON } from './weapons.js';
import { ENEMIES, ENEMY_BY_ID } from './enemies.js';
import { STAGES } from './stages.js';
import { CHARACTERS, CHARACTER_BY_ID, DEFAULT_CHARACTER } from './characters.js';
import { SKILLS } from './skills.js';
import { UPGRADES } from './upgrades.js';
import { ACHIEVEMENTS } from './achievements.js';
import { THEMES, STAGE_THEME } from './themes.js';
import { RARITIES, GACHA, validateGacha } from './gacha.js';
import { ELEMENTS, ELEMENT_FX, HOSTILE_FX } from './elements.js';
/** 実装済みの攻撃の種類（combat/WeaponSystem.js） */
export const ATTACK_KINDS = ['melee_arc', 'projectile'];
/** 実装済みの武器効果（combat/CombatSystem.js の applyEffects） */
export const EFFECT_IDS = ['burn', 'freeze', 'explode'];
/** 実装済みのスキル種別（progression/SkillSystem.js） */
export const SKILL_KINDS = ['passive', 'active'];

/**
 * 武器の強さの目安。
 *
 * ★単発火力だけで測ってはいけない。この作品は群れを相手にするので、
 *   「1振りで何体に当たるか」が効きの大半を占める。
 * ★近接と射撃を同じ物差しで比べてもいけない。近接は範囲内の全員に当たる
 *   （pierce 99）ので、射撃は必ず負ける。比較は同じ攻撃種別の中だけで行う。
 */
export function weaponPower(w) {
  const b = w.base, a = w.attack;
  const pierce = Math.max(1, Math.min(a.pierce || 1, 6));
  const hits = a.kind === 'melee_arc'
    ? pierce * Math.min(1.6, (a.arcDeg || 90) / 140)
    : (a.count || 1) * pierce;

  let eff = 1;
  for (const e of w.effects || []) {
    if (e.id === 'burn') eff += e.chance * e.power * (e.dur || 0) * 0.5;
    else if (e.id === 'explode') eff += e.chance * e.power * 1.5;
    else if (e.id === 'freeze') eff += e.chance * 0.25;
  }
  return b.atk * b.rate * (1 + b.crit * b.critDmg) * hits * eff;
}

// ───────────────────────── 小道具 ─────────────────────────

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** 同じ id が2件あると、片方が黙って無視されて原因が判らなくなる */
function dupIds(list, label, errors) {
  const seen = new Set();
  for (const x of list) {
    if (!x.id) { errors.push(`${label}: id の無い項目がある`); continue; }
    if (seen.has(x.id)) errors.push(`${label}: id が重複している「${x.id}」`);
    seen.add(x.id);
  }
}

// ───────────────────────── 本体 ─────────────────────────

/**
 * @returns {{errors: string[], warnings: string[], stats: object}}
 *   errors   … 直さないと壊れる
 *   warnings … 壊れはしないが、意図しない可能性が高い
 */
export function validateData() {
  const errors = [];
  const warnings = [];

  // ---- 一意性 ----
  dupIds(WEAPONS, '武器', errors);
  dupIds(ENEMIES, '敵', errors);
  dupIds(STAGES, 'ステージ', errors);
  dupIds(CHARACTERS, 'キャラ', errors);
  dupIds(SKILLS, 'スキル', errors);
  dupIds(UPGRADES, '拠点強化', errors);
  dupIds(ACHIEVEMENTS, '実績', errors);

  // ---- 武器 ----
  for (const w of WEAPONS) {
    const at = `武器「${w.name || w.id}」`;
    if (!RARITIES.includes(w.rarity)) errors.push(`${at}: 未知のレアリティ ${w.rarity}`);
    if (!ELEMENTS.includes(w.element)) errors.push(`${at}: 未知の属性 ${w.element}`);
    if (!ATTACK_KINDS.includes(w.attack?.kind)) {
      errors.push(`${at}: 未実装の attack.kind ${w.attack?.kind}`);
    }
    const b = w.base || {};
    for (const k of ['atk', 'rate', 'range', 'crit', 'critDmg', 'knock']) {
      if (!isNum(b[k])) errors.push(`${at}: base.${k} が数値でない`);
    }
    if (b.atk <= 0) errors.push(`${at}: base.atk が0以下`);
    if (b.rate <= 0) errors.push(`${at}: base.rate が0以下`);
    if (b.range <= 0) errors.push(`${at}: base.range が0以下`);
    if (b.crit < 0 || b.crit > 1) errors.push(`${at}: base.crit が0〜1の外 (${b.crit})`);
    if (!isNum(w.growth?.atk)) errors.push(`${at}: growth.atk が数値でない`);

    const a = w.attack || {};
    if (a.kind === 'melee_arc') {
      if (!(a.arcDeg > 0 && a.arcDeg <= 360)) errors.push(`${at}: arcDeg が0〜360の外 (${a.arcDeg})`);
    } else if (a.kind === 'projectile') {
      if (!(a.speed > 0)) errors.push(`${at}: 弾の speed が0以下`);
      if (!(a.life > 0)) errors.push(`${at}: 弾の life が0以下`);
      if (!(a.count >= 1)) errors.push(`${at}: attack.count が1未満`);
    }
    for (const e of w.effects || []) {
      if (!EFFECT_IDS.includes(e.id)) errors.push(`${at}: 未実装の効果 ${e.id}`);
      if (!(e.chance > 0 && e.chance <= 1)) errors.push(`${at}: 効果 ${e.id} の chance が0〜1の外`);
    }
    if (!w.visual?.model) errors.push(`${at}: visual.model が無い`);
    if (!w.flavor) warnings.push(`${at}: flavor が無い（図鑑が寂しくなる）`);
  }
  if (!WEAPON_BY_ID.has(STARTER_WEAPON)) errors.push(`初期武器 ${STARTER_WEAPON} が存在しない`);

  // ---- レアリティと強さの単調性（攻撃種別ごと）----
  // ★引いたのに前より弱い、が起きると「引く→強くなる」の芯が折れる
  const power = {};
  for (const kind of ATTACK_KINDS) {
    power[kind] = {};
    for (const r of RARITIES) {
      const list = WEAPONS.filter(w => w.rarity === r && w.attack?.kind === kind)
                          .map(weaponPower).sort((x, y) => x - y);
      if (!list.length) continue;
      power[kind][r] = {
        n: list.length, min: list[0], max: list[list.length - 1],
        med: list[Math.floor(list.length / 2)],
      };
    }
    const have = RARITIES.filter(r => power[kind][r]);
    for (let i = 1; i < have.length; i++) {
      const lo = power[kind][have[i - 1]], hi = power[kind][have[i]];
      const ratio = hi.min / lo.max;
      const where = `${kind} の ${have[i - 1]}→${have[i]}`;
      if (ratio < 0.95) {
        errors.push(`${where}: 下のレアリティの方が強い武器がある` +
                    `（${have[i]}最弱 ${hi.min.toFixed(0)} < ${have[i - 1]}最強 ${lo.max.toFixed(0)}）`);
      } else if (ratio < 1.10) {
        warnings.push(`${where}: 強さの差が薄い（比 ${ratio.toFixed(2)}）。` +
                      `どちらかを触ると簡単に逆転する`);
      }
      if (hi.med <= lo.med) {
        errors.push(`${where}: 中央値が上がっていない（${lo.med.toFixed(0)} → ${hi.med.toFixed(0)}）`);
      }
    }
  }

  // ---- 敵 ----
  for (const e of ENEMIES) {
    const at = `敵「${e.name || e.id}」`;
    if (!ELEMENTS.includes(e.element)) errors.push(`${at}: 未知の属性 ${e.element}`);
    for (const k of Object.keys(e.resist || {})) {
      if (!ELEMENTS.includes(k)) errors.push(`${at}: resist に未知の属性 ${k}`);
    }
    for (const k of ['hp', 'atk', 'speed', 'radius']) {
      if (!isNum(e[k])) errors.push(`${at}: ${k} が数値でない`);
    }
    if (e.hp <= 0) errors.push(`${at}: hp が0以下`);
    if (e.radius <= 0) errors.push(`${at}: radius が0以下`);
    if (!isNum(e.reward?.xp)) errors.push(`${at}: reward.xp が数値でない`);
    if (!e.visual?.geom) errors.push(`${at}: visual.geom が無い`);
    // ★発光核はこの作品の「敵である」という共通の記号。無いと敵に見えない
    if (!e.visual?.pal?.core) warnings.push(`${at}: visual.pal.core が無い（発光核が出ない）`);
    if (e.split && !ENEMY_BY_ID.has(e.split.id)) errors.push(`${at}: split の相手 ${e.split.id} が存在しない`);
    if (e.summon && !ENEMY_BY_ID.has(e.summon.id)) errors.push(`${at}: summon の相手 ${e.summon.id} が存在しない`);
    if (e.ai === 'shooter' && !e.shoot) errors.push(`${at}: ai が shooter なのに shoot が無い`);
    if (e.ai === 'charger' && !e.charge) errors.push(`${at}: ai が charger なのに charge が無い`);
    if (e.boss) {
      if (!e.visual.boss) errors.push(`${at}: ボスなのに visual.boss（専用の形）が無い`);
      if (!e.phases?.length) warnings.push(`${at}: ボスなのに phases が無い（最後まで同じ動きになる）`);
    }
  }

  // ---- ステージ ----
  STAGES.forEach((s, i) => {
    const at = `ステージ${s.id}「${s.name}」`;
    if (s.id !== i + 1) errors.push(`${at}: id が並び順と一致しない（${i + 1} のはず）`);
    if (!(s.duration > 0)) errors.push(`${at}: duration が0以下`);
    if (!s.waves?.length) errors.push(`${at}: waves が空`);
    let prevAt = -1;
    for (const w of s.waves || []) {
      if (!(w.at >= 0 && w.at < s.duration)) errors.push(`${at}: wave.at がステージ長の外 (${w.at})`);
      if (w.at <= prevAt) errors.push(`${at}: wave.at が昇順でない (${w.at})`);
      prevAt = w.at;
      if (!(w.rate > 0)) errors.push(`${at}: wave.rate が0以下`);
      if (!(w.cap > 0)) errors.push(`${at}: wave.cap が0以下`);
      for (const [id] of w.spawn || []) {
        if (!ENEMY_BY_ID.has(id)) errors.push(`${at}: 存在しない敵 ${id} を湧かせている`);
        else if (ENEMY_BY_ID.get(id).boss) errors.push(`${at}: ボス ${id} を雑魚として湧かせている`);
      }
    }
    if (s.boss) {
      const b = ENEMY_BY_ID.get(s.boss.id);
      if (!b) errors.push(`${at}: 存在しないボス ${s.boss.id}`);
      else if (!b.boss) errors.push(`${at}: ${s.boss.id} は boss:true ではない`);
      if (!(s.boss.at < s.duration)) errors.push(`${at}: boss.at がステージ長を超えている`);
    }
    // 解禁の鎖。1面だけが unlock 0 で、以降は前の面
    const wantUnlock = i === 0 ? 0 : STAGES[i - 1].id;
    if (s.unlock !== wantUnlock) {
      errors.push(`${at}: unlock が ${s.unlock}。解禁の鎖が切れている（${wantUnlock} のはず）`);
    }
    if (i > 0 && !(s.scaling.hp > STAGES[i - 1].scaling.hp)) {
      errors.push(`${at}: 敵HP倍率が前の面より上がっていない`);
    }
  });

  // ★同じボスが複数の面に出ると「進んだ実感」が消える
  const bossUse = STAGES.filter(s => s.boss).map(s => s.boss.id);
  const bossDup = bossUse.filter((id, i) => bossUse.indexOf(id) !== i);
  if (bossDup.length) errors.push(`ボスが使い回されている: ${[...new Set(bossDup)].join(', ')}`);

  // ---- テーマ ----
  for (const s of STAGES) {
    const key = STAGE_THEME[s.id];
    if (!key) errors.push(`ステージ${s.id}: テーマが割り当てられていない`);
    else if (!THEMES[key]) errors.push(`ステージ${s.id}: 未定義のテーマ ${key}`);
  }
  const usedThemes = new Set(Object.values(STAGE_THEME));
  for (const k of Object.keys(THEMES)) {
    if (!usedThemes.has(k)) warnings.push(`テーマ ${k} はどのステージからも使われていない`);
  }

  // ---- キャラ・実績 ----
  const unlockFlags = new Set(ACHIEVEMENTS.filter(a => a.unlock).map(a => a.unlock));
  for (const c of CHARACTERS) {
    const at = `キャラ「${c.name || c.id}」`;
    if (typeof c.apply !== 'function') errors.push(`${at}: apply が関数でない`);
    if (c.unlock && !unlockFlags.has(c.unlock)) {
      errors.push(`${at}: 解放フラグ ${c.unlock} を出す実績が無い（永久に使えない）`);
    }
    if (!c.visual?.hairStyle) errors.push(`${at}: visual.hairStyle が無い`);
  }
  if (!CHARACTER_BY_ID.has(DEFAULT_CHARACTER)) errors.push(`既定キャラ ${DEFAULT_CHARACTER} が存在しない`);
  if (!CHARACTERS.some(c => !c.unlock)) errors.push('最初から使えるキャラが1人もいない');

  for (const a of ACHIEVEMENTS) {
    if (typeof a.check !== 'function') errors.push(`実績「${a.name || a.id}」: check が関数でない`);
    if (!a.reward) warnings.push(`実績「${a.name || a.id}」: reward が無い`);
  }

  // ---- スキル・拠点強化 ----
  for (const s of SKILLS) {
    if (!SKILL_KINDS.includes(s.kind)) errors.push(`スキル「${s.name || s.id}」: 未知の kind ${s.kind}`);
    if (!(s.maxLv >= 1)) errors.push(`スキル「${s.name || s.id}」: maxLv が1未満`);
    if (typeof s.desc !== 'function') errors.push(`スキル「${s.name || s.id}」: desc が関数でない`);
  }
  for (const u of UPGRADES) {
    if (!(u.max >= 1)) errors.push(`拠点強化「${u.name || u.id}」: max が1未満`);
    if (typeof u.cost !== 'function') errors.push(`拠点強化「${u.name || u.id}」: cost が関数でない`);
    if (u.cost(0) <= 0) errors.push(`拠点強化「${u.name || u.id}」: 初期費用が0以下`);
  }

  // ---- 属性 ----
  // ★属性を足して色を足し忘れると、弾が真っ黒になる（気づきにくい）
  ELEMENTS.forEach((e, i) => {
    for (const [label, tbl] of [['自機弾', ELEMENT_FX], ['敵弾', HOSTILE_FX]]) {
      if (!tbl[i]) { errors.push(`属性 ${e}: ${label}の色が無い`); continue; }
      if (!isNum(tbl[i].bullet) || !isNum(tbl[i].glow)) {
        errors.push(`属性 ${e}: ${label}の色が数値でない`);
      }
    }
    // ★敵弾は寒色にしてはいけない。この作品では寒色＝味方側の信号なので、
    //   氷や雷だからと水色にした瞬間「避けるべき物」に見えなくなる。
    //   赤が十分に乗っていること・緑が支配的でないことを機械的に確かめる。
    const c = HOSTILE_FX[i];
    if (c && isNum(c.bullet)) {
      const r = (c.bullet >> 16) & 255, g = (c.bullet >> 8) & 255, b = c.bullet & 255;
      if (r < Math.max(g, b) * 0.7) {
        errors.push(`属性 ${e}: 敵弾が寒色になっている（#${c.bullet.toString(16).padStart(6, '0')}）。` +
                    `赤が最大チャネルの7割を下回ると危険信号として読めない`);
      }
      if (g > Math.max(r, b)) {
        errors.push(`属性 ${e}: 敵弾の緑が支配的（#${c.bullet.toString(16).padStart(6, '0')}）。` +
                    `緑は回復・拾い物の色なので敵弾に使わない`);
      }
    }
  });

  // ---- ガチャ ----
  for (const p of validateGacha()) errors.push(`ガチャ: ${p}`);
  for (const r of RARITIES) {
    if (!WEAPONS.some(w => w.rarity === r)) errors.push(`ガチャ: レアリティ ${r} の武器が1本も無い`);
  }
  for (const b of GACHA.banners) {
    for (const id of b.featured || []) {
      if (!WEAPON_BY_ID.has(id)) errors.push(`バナー「${b.name}」: 存在しない目玉 ${id}`);
    }
    if (!(b.featuredChance >= 0 && b.featuredChance <= 1)) {
      errors.push(`バナー「${b.name}」: featuredChance が0〜1の外`);
    }
    if (b.unlock && !unlockFlags.has(b.unlock)) {
      errors.push(`バナー「${b.name}」: 解放フラグ ${b.unlock} を出す実績が無い`);
    }
    // 除外した結果、引けるものが無くなる組み合わせを弾く
    const ex = new Set(b.exclude || []);
    const exR = new Set(b.excludeRarity || []);
    for (const r of RARITIES) {
      if (exR.has(r)) continue;
      const pool = WEAPONS.filter(w => w.rarity === r && !ex.has(w.id));
      if (!pool.length) errors.push(`バナー「${b.name}」: 除外の結果 ${r} のプールが空`);
    }
  }

  return {
    errors, warnings,
    stats: {
      weapons: WEAPONS.length, enemies: ENEMIES.length, stages: STAGES.length,
      characters: CHARACTERS.length, skills: SKILLS.length,
      achievements: ACHIEVEMENTS.length, themes: Object.keys(THEMES).length,
      bosses: ENEMIES.filter(e => e.boss).length,
      power,
    },
  };
}
