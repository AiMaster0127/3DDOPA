/**
 * 全画面のオーバーレイ（死亡画面など）。
 * リザルトの作り込みと共有ボタンはフェーズ7。ここでは最低限の表示と再挑戦だけ。
 */
export class Screens {
  /** @param {() => void} onRetry */
  constructor(onRetry) {
    this.over = document.getElementById('over');
    this.ovTime = document.getElementById('ovTime');
    this.ovKills = document.getElementById('ovKills');
    this.ovDamage = document.getElementById('ovDamage');
    this.ovLevel = document.getElementById('ovLevel');
    this.ovXp = document.getElementById('ovXp');
    this.ovLevelUp = document.getElementById('ovLevelUp');
    this.ovAcct = document.getElementById('ovAcct');

    document.getElementById('retryBtn').addEventListener('click', () => {
      this.hideGameOver();
      onRetry();
    });
  }

  showGameOver({ elapsed, kills, damage, runLv, xpGained, levelsGained, newAccountLv }) {
    const t = Math.floor(elapsed);
    this.ovTime.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    this.ovKills.textContent = kills;
    this.ovLevel.textContent = runLv;
    this.ovDamage.textContent = Math.round(damage).toLocaleString('ja-JP');
    this.ovXp.textContent = `+${xpGained}`;

    // 永続レベルが上がったときだけ見せる。毎回出すと価値が薄れる
    this.ovLevelUp.hidden = !levelsGained;
    if (levelsGained) this.ovAcct.textContent = newAccountLv;

    this.over.hidden = false;
  }

  hideGameOver() { this.over.hidden = true; }
}
