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

    document.getElementById('retryBtn').addEventListener('click', () => {
      this.hideGameOver();
      onRetry();
    });
  }

  showGameOver({ elapsed, kills, damage }) {
    const t = Math.floor(elapsed);
    this.ovTime.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    this.ovKills.textContent = kills;
    this.ovDamage.textContent = Math.round(damage).toLocaleString('ja-JP');
    this.over.hidden = false;
  }

  hideGameOver() { this.over.hidden = true; }
}
