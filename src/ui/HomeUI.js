/**
 * 拠点（ホーム）画面。
 *
 * 出撃・ガチャ・装備への入口と、所持通貨・装備・記録の表示だけを持つ。
 * 永続強化やアンロックはフェーズ6でここに足す。
 */
import { WEAPON_BY_ID } from '../data/weapons.js';

export class HomeUI {
  /**
   * @param {object} o
   * @param {import('../gacha/Inventory.js').Inventory} o.inventory
   * @param {import('../save/SaveManager.js').SaveManager} o.save
   * @param {import('../progression/MetaSystem.js').MetaSystem} o.meta
   */
  constructor({ inventory, save, meta, audio, onSortie, onGacha, onInventory, onStages,
                onCharacters, onUpgrade, onAchievements }) {
    this.inv = inventory;
    this.save = save;
    this.meta = meta;
    this.audio = audio;

    this.root = document.getElementById('home');
    this.elGems = document.getElementById('wGems');
    this.elTickets = document.getElementById('wTickets');
    this.elDust = document.getElementById('wDust');
    this.elAcct = document.getElementById('hAcct');
    this.elEquip = document.getElementById('hEquip');
    this.elEquipAtk = document.getElementById('hEquipAtk');
    this.elBest = document.getElementById('hBest');
    this.elChar = document.getElementById('hChar');
    this.elStage = document.getElementById('hStage');
    this.stage = null;

    document.getElementById('btnSortie').addEventListener('click', onSortie);
    document.getElementById('btnGacha').addEventListener('click', onGacha);
    document.getElementById('btnInv').addEventListener('click', onInventory);
    document.getElementById('btnStages').addEventListener('click', onStages);
    document.getElementById('btnChar').addEventListener('click', onCharacters);
    document.getElementById('btnUpgrade').addEventListener('click', onUpgrade);
    document.getElementById('btnAch').addEventListener('click', onAchievements);
    this.elAch = document.getElementById('hAch');

    // 音のオン/オフ。設定はセーブに残す
    this.btnSfx = document.getElementById('btnSfx');
    this.btnBgm = document.getElementById('btnBgm');
    this.btnSfx.addEventListener('click', () => this._toggleSound('sfx'));
    this.btnBgm.addEventListener('click', () => this._toggleSound('bgm'));
    this._syncSound();
  }

  _toggleSound(kind) {
    const st = this.save.data.settings;
    const defaults = { sfx: 0.8, bgm: 0.5 };
    st[kind] = st[kind] > 0 ? 0 : defaults[kind];
    this.audio.setVolumes({ [kind]: st[kind] });
    if (kind === 'bgm' && st.bgm === 0) this.audio.stopBgm();
    this.save.markDirty();
    this._syncSound();
    if (st[kind] > 0) this.audio.ui();
  }

  _syncSound() {
    const st = this.save.data.settings;
    this.btnSfx.classList.toggle('on', st.sfx > 0);
    this.btnBgm.classList.toggle('on', st.bgm > 0);
    this.btnSfx.textContent = st.sfx > 0 ? '🔊 SE' : '🔇 SE';
    this.btnBgm.textContent = st.bgm > 0 ? '🎵 BGM' : '🔇 BGM';
  }

  setAchievementProgress(text) { this.elAch.textContent = text; }

  /** 出撃ボタンに、いま選んでいるステージを出す。 */
  setStage(stage) {
    this.stage = stage;
    this.elStage.textContent = stage ? `${stage.id}. ${stage.name}` : '';
  }

  get visible() { return !this.root.hidden; }

  show() { this.root.hidden = false; this.refresh(); }
  hide() { this.root.hidden = true; }

  refresh() {
    this._syncSound();
    const w = this.save.data.wallet;
    this.elGems.textContent = w.gems;
    this.elTickets.textContent = w.tickets;
    this.elDust.textContent = w.dust;
    this.elAcct.textContent = `Lv.${this.meta.level}`;

    const ch = this.meta.character;
    this.elChar.textContent = `${ch.icon} ${ch.name}（${ch.tag}）`;

    const id = this.inv.equippedId;
    const def = WEAPON_BY_ID.get(id);
    this.elEquip.textContent = def ? def.name : id;
    this.elEquipAtk.textContent = def ? `（攻 ${Math.round(this.inv.atkOf(id))}）` : '';

    const st = this.save.data.stats;
    const col = this.inv.collection();
    const cleared = Object.keys(this.save.data.meta.clearedStages || {}).length;
    const t = Math.floor(st.bestTimeMs / 1000);
    this.elBest.textContent = st.totalRuns
      ? `攻略ステージ ${cleared} ／ 最高Lv.${st.bestRunLv} ／ 累計撃破 ${st.totalKills} ／ ` +
        `討伐ボス ${st.totalBosses} ／ 図鑑 ${col.have}/${col.total}`
      : `図鑑 ${col.have}/${col.total}`;
    void t;
  }
}
