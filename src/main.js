/**
 * 起動エントリ。DOMの配線と失敗時の表示だけを担当し、ゲームロジックは書かない。
 */
import { Game } from './core/Game.js';

const canvas  = document.getElementById('gl');
const boot    = document.getElementById('boot');
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

let game = null;

try {
  if (!hasWebGL()) throw new Error('no-webgl');

  game = new Game(canvas);

  bootMsg.textContent = 'READY';
  startBtn.hidden = false;

  // タップで開始する。フェーズ7で AudioContext を起こすのもこのジェスチャに乗せる
  startBtn.addEventListener('click', () => {
    boot.classList.add('gone');
    setTimeout(() => { boot.hidden = true; }, 480);
    game.start();
  }, { once: true });

} catch (err) {
  if (err?.message === 'no-webgl') {
    fail('WebGL が利用できません。ブラウザのハードウェアアクセラレーションを有効にしてください。', err);
  } else {
    fail('初期化に失敗しました。ローカルHTTPサーバ経由で開いていますか？\n（file:// では ES Modules が読み込めません）', err);
  }
}

// デバッグ用。コンソールから状態を覗けるようにしておく
globalThis.__DOPA = { get game() { return game; } };
