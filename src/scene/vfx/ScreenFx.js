/**
 * 全画面の演出（フラッシュ・見せ場のバナー）。
 *
 * ★3Dではなくオーバーレイでやる。
 *   ポストプロセスを入れるとモバイルで確実に重くなるので、
 *   「派手さ」はDOMのアニメーションで作る。
 */
export class ScreenFx {
  constructor() {
    this.flash = document.getElementById('flash');
    this.banner = document.getElementById('bigBanner');
    this.bannerText = document.getElementById('bigBannerText');
    this.bannerSub = document.getElementById('bigBannerSub');
    this._bannerTimer = 0;
  }

  /**
   * 画面を一瞬光らせる。
   * @param {string} color CSSの色
   * @param {number} strength 0..1
   * @param {number} ms
   */
  hit(color = '#ffffff', strength = 0.5, ms = 220) {
    this.flash.style.setProperty('--flash-color', color);
    this.flash.style.setProperty('--flash-alpha', String(strength));
    this.flash.style.setProperty('--flash-ms', `${ms}ms`);
    // アニメーションを頭から流し直す
    this.flash.classList.remove('on');
    void this.flash.offsetWidth;
    this.flash.classList.add('on');
  }

  /**
   * 見せ場の全画面テロップ。
   * @param {string} text
   * @param {string} sub
   * @param {string} cls 'ssr' | 'boss' | 'level' | 'clear'
   */
  bannerShow(text, sub, cls, ms = 1500) {
    this.bannerText.textContent = text;
    this.bannerSub.textContent = sub || '';
    this.banner.className = `big-banner ${cls}`;
    this.banner.hidden = false;

    this.banner.classList.remove('in');
    void this.banner.offsetWidth;
    this.banner.classList.add('in');

    clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => { this.banner.hidden = true; }, ms);
  }

  hideBanner() {
    clearTimeout(this._bannerTimer);
    this.banner.hidden = true;
  }
}
