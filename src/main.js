/**
 * 起動エントリ。DOMの配線と失敗時の表示だけを担当し、ゲームロジックは書かない。
 */
import { Game } from './core/Game.js';

const canvas = document.getElementById('gl');
const boot = document.getElementById('boot');
const bootMsg = document.getElementById('bootMsg');
const startBtn = document.getElementById('startBtn');

function fail(msg, err) {
  console.error(err ?? msg);
  bootMsg.className = 'boot-msg error';
  bootMsg.textContent = msg;
  startBtn.hidden = true;
}

// WebGL が使えない環境では three.js の生成時に例外が出る前に伝える
function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

/**
 * Service Worker の登録。
 * ★失敗してもゲームは動く（オフライン対応が効かないだけ）。
 *   file:// や非セキュアコンテキストでは登録できないので、静かに諦める。
 */
async function registerServiceWorker() {
  // ★単一HTMLビルド（tools/build-single.mjs）には sw.js が同梱されない。
  //   登録を試みても失敗するだけなので、最初から呼ばない。
  if (globalThis.__DOPA_SINGLE__) return null;
  if (!('serviceWorker' in navigator)) return null;
  if (!globalThis.isSecureContext) return null;
  try {
    return await navigator.serviceWorker.register('./sw.js', { scope: './' });
  } catch (err) {
    console.warn('Service Worker を登録できなかった（オフライン非対応で続行）', err);
    return null;
  }
}

let game = null;

try {
  if (!hasWebGL()) throw new Error('no-webgl');

  game = new Game(canvas);

  bootMsg.textContent = 'READY';
  startBtn.hidden = false;

  startBtn.addEventListener('click', () => {
    // ★AudioContext はユーザー操作の中でしか起こせない。ここで解錠する
    game.audio.unlock();

    boot.classList.add('gone');
    setTimeout(() => { boot.hidden = true; }, 480);
    game.start();
  }, { once: true });

  // 起動を待たせないよう、SWの登録は後追いにする
  registerServiceWorker();

} catch (err) {
  if (err?.message === 'no-webgl') {
    fail('WebGL が利用できません。ブラウザのハードウェアアクセラレーションを有効にしてください。', err);
  } else {
    fail('初期化に失敗しました。ローカルHTTPサーバ経由で開いていますか？\n（file:// では ES Modules が読み込めません）', err);
  }
}

// デバッグ用。コンソールから状態を覗けるようにしておく
globalThis.__DOPA = { get game() { return game; } };
