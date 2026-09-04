/**
 * 共有テキストの生成とコピー。
 *
 * ★短尺動画のオチに使えるよう、
 *   「何をして」「どこまで行って」「何を装備していたか」が一目で判る形にする。
 */
import { WEAPON_BY_ID } from '../data/weapons.js';
import { STAGE_BY_ID } from '../data/stages.js';
import { RARITY_COLOR } from '../data/gacha.js';
import { SKILL_BY_ID } from '../data/skills.js';

const RARITY_MARK = { N: '', R: '★', SR: '★★', SSR: '★★★' };

const mmss = (sec) => {
  const t = Math.max(0, Math.floor(sec));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

/**
 * 装備ビルドの1行表記。
 * @returns {string} 例: 「★★★ フレアブレード Lv.7 限4」
 */
export function buildLine(inventory) {
  const id = inventory.equippedId;
  const def = WEAPON_BY_ID.get(id);
  const own = inventory.entry(id);
  if (!def) return '';
  const mark = RARITY_MARK[def.rarity] || '';
  const lb = own && own.lb > 0 ? ` 限${own.lb}` : '';
  const lv = own ? ` Lv.${own.lv}` : '';
  return `${mark ? mark + ' ' : ''}${def.name}${lv}${lb}`;
}

/** 習得スキルの短い一覧。 */
export function skillLine(skills) {
  const parts = [];
  for (const [sid, lv] of skills.levels) {
    const sk = SKILL_BY_ID.get(sid);
    if (sk) parts.push(`${sk.icon}${lv}`);
  }
  return parts.join(' ');
}

/**
 * 共有テキスト本文。
 * @param {object} o
 * @param {boolean} o.cleared クリアか力尽きたか
 */
export function shareText({ cleared, stageId, elapsed, kills, runLv, damage, inventory, skills, save }) {
  const stage = STAGE_BY_ID.get(stageId);
  const stageName = stage ? `ステージ${stage.id} ${stage.name}` : `ステージ${stageId}`;
  const head = cleared ? `${stageName} クリア！` : `${stageName} で力尽きた…`;

  const lines = [
    'ドパゲーム DOPA ARENA',
    head,
    `時間 ${mmss(elapsed)} / 撃破 ${kills} / 到達Lv.${runLv}`,
    `総ダメージ ${Math.round(damage).toLocaleString('ja-JP')}`,
    `装備 ${buildLine(inventory)}`,
  ];

  const sk = skillLine(skills);
  if (sk) lines.push(`スキル ${sk}`);

  const ssr = save?.data?.stats?.ssrCount || 0;
  if (ssr > 0) lines.push(`SSR所持 ${ssr}本`);

  return lines.join('\n');
}

/**
 * クリップボードへコピー。
 * ★navigator.clipboard は https / localhost 以外では使えない。
 *   失敗したときのために古い手段へ落とす。
 * @returns {Promise<boolean>}
 */
export async function copyText(text) {
  try {
    if (navigator.clipboard && globalThis.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* 下のフォールバックへ */ }

  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    // 画面外に置く。display:none だと選択できない
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export { RARITY_COLOR };
