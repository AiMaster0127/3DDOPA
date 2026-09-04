/**
 * 全画面のオーバーレイ（死亡画面など）。
 * リザルトの作り込みと共有ボタンはフェーズ7。ここでは最低限の表示と再挑戦だけ。
 */
import { copyText } from './share.js';

export class Screens {
  /**
   * @param {() => void} onRetry
   * @param {() => void} onHome
   */
  constructor(onRetry, onHome) {
    this.over = document.getElementById('over');
    this.ovTime = document.getElementById('ovTime');
    this.ovKills = document.getElementById('ovKills');
    this.ovDamage = document.getElementById('ovDamage');
    this.ovLevel = document.getElementById('ovLevel');
    this.ovXp = document.getElementById('ovXp');
    this.ovLevelUp = document.getElementById('ovLevelUp');
    this.ovAcct = document.getElementById('ovAcct');
    this.ovBuild = document.getElementById('ovBuild');
    this.ovShare = document.getElementById('ovShare');
    this.copyBtn = document.getElementById('ovCopy');

    this.copyBtn.addEventListener('click', async () => {
      const ok = await copyText(this.ovShare.textContent);
      this.copyBtn.textContent = ok ? 'コピーした！' : 'コピーできなかった';
      this.copyBtn.classList.toggle('copied', ok);
      setTimeout(() => {
        this.copyBtn.textContent = '結果をコピー';
        this.copyBtn.classList.remove('copied');
      }, 1800);
    });

    document.getElementById('retryBtn').addEventListener('click', () => {
      this.hideGameOver();
      onRetry();
    });
    document.getElementById('homeBtn').addEventListener('click', () => {
      this.hideGameOver();
      onHome();
    });
  }

  showGameOver({ elapsed, kills, damage, runLv, xpGained, levelsGained, newAccountLv, build, share }) {
    const t = Math.floor(elapsed);
    this.ovTime.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    this.ovKills.textContent = kills;
    this.ovLevel.textContent = runLv;
    this.ovDamage.textContent = Math.round(damage).toLocaleString('ja-JP');
    this.ovXp.textContent = `+${xpGained}`;

    // 永続レベルが上がったときだけ見せる。毎回出すと価値が薄れる
    this.ovLevelUp.hidden = !levelsGained;
    if (levelsGained) this.ovAcct.textContent = newAccountLv;

    this.ovBuild.textContent = build ? `装備 ${build}` : '';
    this.ovShare.textContent = share || '';

    this.over.hidden = false;
  }

  hideGameOver() { this.over.hidden = true; }
}
