/**
 * ステージ選択とクリア画面。
 *
 * 解禁は「1つ前をクリアしていること」。data/stages.js の unlock を見る。
 */
import { STAGES, STAGE_BY_ID } from '../data/stages.js';
import { ENEMY_BY_ID } from '../data/enemies.js';

export class StageUI {
  /**
   * @param {object} o
   * @param {import('../save/SaveManager.js').SaveManager} o.save
   * @param {(id:number)=>void} o.onSelect
   * @param {()=>void} o.onBack
   * @param {()=>void} o.onNext   クリア画面「次のステージへ」
   * @param {()=>void} o.onHome   クリア画面「拠点へ戻る」
   */
  constructor({ save, onSelect, onBack, onNext, onHome }) {
    this.save = save;
    this.onSelect = onSelect;

    this.root = document.getElementById('stages');
    this.listEl = document.getElementById('stageList');
    this.progEl = document.getElementById('sProgress');

    this.clearEl = document.getElementById('clear');
    this.clTitle = document.getElementById('clTitle');
    this.clTime = document.getElementById('clTime');
    this.clKills = document.getElementById('clKills');
    this.clLevel = document.getElementById('clLevel');
    this.clReward = document.getElementById('clReward');
    this.clFirst = document.getElementById('clFirst');
    this.clFirstVal = document.getElementById('clFirstVal');
    this.clUnlock = document.getElementById('clUnlock');
    this.clUnlockVal = document.getElementById('clUnlockVal');
    this.btnNext = document.getElementById('clNext');

    document.getElementById('stagesBack').addEventListener('click', onBack);
    this.btnNext.addEventListener('click', () => { this.hideClear(); onNext(); });
    document.getElementById('clHome').addEventListener('click', () => { this.hideClear(); onHome(); });
  }

  get visible() { return !this.root.hidden; }
  get meta() { return this.save.data.meta; }

  isCleared(id) { return !!this.meta.clearedStages[id]; }

  /** 解禁済みか。unlock が 0 なら最初から遊べる。 */
  isUnlocked(stage) { return stage.unlock === 0 || this.isCleared(stage.unlock); }

  /** 遊べる中で最も進んだステージ（拠点の既定選択に使う）。 */
  highestUnlocked() {
    let best = STAGES[0].id;
    for (const s of STAGES) if (this.isUnlocked(s)) best = s.id;
    return best;
  }

  show() { this.root.hidden = false; this.refresh(); }
  hide() { this.root.hidden = true; }

  refresh() {
    const cleared = STAGES.filter(s => this.isCleared(s.id)).length;
    this.progEl.textContent = `攻略 ${cleared}/${STAGES.length}`;

    this.listEl.replaceChildren();
    for (const st of STAGES) {
      const unlocked = this.isUnlocked(st);
      const done = this.isCleared(st.id);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `stage-card${done ? ' cleared' : ''}${st.id === this.meta.lastStage ? ' selected' : ''}`;
      btn.disabled = !unlocked;

      const no = document.createElement('div');
      no.className = 'sc-no';
      no.textContent = unlocked ? st.id : '🔒';

      const body = document.createElement('div');
      body.className = 'sc-body';

      const name = document.createElement('div');
      name.className = 'sc-name';
      name.textContent = unlocked ? st.name : '???';

      const meta = document.createElement('div');
      meta.className = 'sc-meta';
      meta.textContent = unlocked
        ? `${st.duration}秒 ・ 敵HP ×${st.scaling.hp.toFixed(2)} ・ 敵攻撃 ×${st.scaling.atk.toFixed(2)} ・ 報酬 💎${st.reward.gems}`
        : `ステージ${st.unlock} をクリアで解放`;

      const tags = document.createElement('div');
      tags.className = 'sc-tags';
      if (st.boss) {
        const t = document.createElement('span');
        t.className = 'sc-tag sc-tag--boss';
        t.textContent = `BOSS ${ENEMY_BY_ID.get(st.boss.id)?.name ?? st.boss.id}`;
        tags.appendChild(t);
      }
      if (done) {
        const t = document.createElement('span');
        t.className = 'sc-tag sc-tag--done';
        t.textContent = 'クリア済み';
        tags.appendChild(t);
      }
      if (unlocked && !done && st.reward.firstClear) {
        const t = document.createElement('span');
        t.className = 'sc-tag';
        t.textContent = `初回 💎${st.reward.firstClear.gems}・🎟${st.reward.firstClear.tickets}`;
        tags.appendChild(t);
      }

      body.append(name, meta, tags);
      btn.append(no, body);
      if (unlocked) btn.addEventListener('click', () => this.onSelect(st.id));
      this.listEl.appendChild(btn);
    }
  }

  /**
   * クリア画面。
   * @param {object} o { stage, elapsed, kills, runLv, gems, first, unlocked, hasNext }
   */
  showClear(o) {
    const st = STAGE_BY_ID.get(o.stage);
    this.clTitle.textContent = st ? st.name : `ステージ${o.stage}`;
    const t = Math.floor(o.elapsed);
    this.clTime.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    this.clKills.textContent = o.kills;
    this.clLevel.textContent = o.runLv;
    this.clReward.textContent = `💎${o.gems}`;

    this.clFirst.hidden = !o.first;
    if (o.first) {
      this.clFirstVal.textContent =
        `💎${o.first.gems}${o.first.tickets ? ` ・ 🎟${o.first.tickets}` : ''}`;
    }
    this.clUnlock.hidden = !o.unlocked;
    if (o.unlocked) this.clUnlockVal.textContent = o.unlocked;

    this.btnNext.hidden = !o.hasNext;
    this.clearEl.hidden = false;
  }

  hideClear() { this.clearEl.hidden = true; }
}
