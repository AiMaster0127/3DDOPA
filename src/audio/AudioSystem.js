/**
 * 効果音とBGM。
 *
 * ★音源ファイルは同梱しない。Web Audio API で全部その場で合成する。
 *   - 容量ゼロ・読み込み待ちゼロ・外部通信ゼロ
 *   - 音程やフィルタをコードで動かせる（レア度で音を変える等）
 *
 * ★AudioContext はユーザー操作から起こす必要がある（ブラウザの自動再生制限）。
 *   起動ボタンのタップで resume() する。
 */
export class AudioSystem {
  constructor(settings) {
    this.settings = settings || { sfx: 0.8, bgm: 0.5 };
    this.ctx = null;
    this.ready = false;
    this.failed = false;

    this._bgmTimer = 0;
    this._bgmStep = 0;
    this.bgmPlaying = false;

    // ★ノイズ用のバッファは毎回作ると重い（44.1kHz×0.06秒でも1万バイト超）。
    //   長さごとに1本だけ作って使い回す。
    this._noiseCache = new Map();

    // ★同じ音を短時間に何十発も鳴らすと、音が濁るうえに
    //   AudioNode の生成でヒープが膨らむ。種類ごとに最小間隔を設ける。
    this._lastPlay = new Map();
  }

  /** @returns {boolean} 鳴らしてよいか */
  _throttle(key, minGap) {
    const t = this.ctx ? this.ctx.currentTime : 0;
    const last = this._lastPlay.get(key);
    if (last !== undefined && t - last < minGap) return false;
    this._lastPlay.set(key, t);
    return true;
  }

  /** 長さごとに1本だけノイズバッファを作って使い回す。 */
  _noiseBuffer(dur) {
    // 10ms刻みに丸めて種類を絞る
    const key = Math.max(1, Math.round(dur * 100));
    let buf = this._noiseCache.get(key);
    if (buf) return buf;

    const len = Math.max(1, Math.floor(this.ctx.sampleRate * (key / 100)));
    buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    this._noiseCache.set(key, buf);
    return buf;
  }

  /** ユーザー操作の中から呼ぶこと。 */
  unlock() {
    if (this.ready || this.failed) return this.ready;
    try {
      const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Ctx) { this.failed = true; return false; }
      this.ctx = new Ctx();

      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx.destination);

      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = this.settings.sfx;
      this.sfxBus.connect(this.master);

      this.bgmBus = this.ctx.createGain();
      this.bgmBus.gain.value = this.settings.bgm * 0.5;
      this.bgmBus.connect(this.master);

      this.ctx.resume?.();
      this.ready = true;
      return true;
    } catch (err) {
      // 音が出なくてもゲームは続行する
      console.warn('AudioContext を作れなかった。無音で続行する', err);
      this.failed = true;
      return false;
    }
  }

  setVolumes({ sfx, bgm }) {
    if (sfx !== undefined) this.settings.sfx = sfx;
    if (bgm !== undefined) this.settings.bgm = bgm;
    if (!this.ready) return;
    this.sfxBus.gain.value = this.settings.sfx;
    this.bgmBus.gain.value = this.settings.bgm * 0.5;
  }

  get time() { return this.ctx ? this.ctx.currentTime : 0; }

  /**
   * 基本の1音。
   * @param {object} o freq/type/dur/gain/sweep/bus
   */
  _tone({ freq = 440, type = 'square', dur = 0.1, gain = 0.3, sweep = 0, delay = 0, bus }) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + sweep), t + dur);

    // クリックノイズを避けるため、立ち上がりと減衰を必ず付ける
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(g);
    g.connect(bus || this.sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** ノイズ（打撃・爆発の芯） */
  _noise({ dur = 0.12, gain = 0.25, freq = 1200, q = 1, delay = 0 }) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(dur);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(filter); filter.connect(g); g.connect(this.sfxBus);
    src.start(t);
  }

  // ─────────── 効果音 ───────────

  hit(isCrit) {
    // 乱戦では毎フレーム何十発も当たる。間引かないと音が潰れる
    if (!this._throttle(isCrit ? 'crit' : 'hit', isCrit ? 0.05 : 0.035)) return;
    this._noise({ dur: 0.06, gain: isCrit ? 0.3 : 0.16, freq: isCrit ? 2600 : 1500, q: 1.4 });
    if (isCrit) this._tone({ freq: 900, type: 'square', dur: 0.09, gain: 0.16, sweep: 700 });
  }

  kill() {
    if (!this._throttle('kill', 0.045)) return;
    this._noise({ dur: 0.14, gain: 0.2, freq: 700, q: 0.8 });
    this._tone({ freq: 260, type: 'triangle', dur: 0.14, gain: 0.14, sweep: -160 });
  }

  playerHit() {
    if (!this._throttle('phit', 0.12)) return;
    this._tone({ freq: 220, type: 'sawtooth', dur: 0.22, gain: 0.3, sweep: -140 });
    this._noise({ dur: 0.18, gain: 0.22, freq: 400, q: 0.7 });
  }

  levelUp() {
    // 上行アルペジオ。上がった感じは音程を上げるのが一番速く伝わる
    [523, 659, 784, 1047].forEach((f, i) =>
      this._tone({ freq: f, type: 'triangle', dur: 0.22, gain: 0.22, delay: i * 0.07 }));
  }

  pickup() {
    if (!this._throttle('pickup', 0.06)) return;
    this._tone({ freq: 1180, type: 'sine', dur: 0.05, gain: 0.07, sweep: 320 });
  }

  bossSpawn() {
    this._tone({ freq: 90, type: 'sawtooth', dur: 1.1, gain: 0.34, sweep: -35 });
    this._noise({ dur: 0.8, gain: 0.2, freq: 180, q: 0.5 });
  }

  bossDown() {
    this._noise({ dur: 0.9, gain: 0.4, freq: 320, q: 0.4 });
    [392, 330, 262].forEach((f, i) =>
      this._tone({ freq: f, type: 'sawtooth', dur: 0.5, gain: 0.26, sweep: -70, delay: i * 0.1 }));
  }

  /** ガチャの予告。レア度が高いほど高く・明るい音にする。 */
  gachaOmen(omen) {
    const map = { white: 330, blue: 440, gold: 587, rainbow: 784 };
    const f = map[omen] ?? 330;
    this._tone({ freq: f, type: 'triangle', dur: 0.5, gain: 0.2, sweep: f * 0.35 });
  }

  /** ガチャのリーチ。鼓動のような連打で「溜め」を作る。 */
  gachaReach() {
    for (let i = 0; i < 6; i++) {
      this._tone({ freq: 160 + i * 22, type: 'square', dur: 0.07, gain: 0.16, delay: i * 0.11 });
    }
  }

  gachaReveal(rarity) {
    if (rarity === 'SSR') {
      [523, 659, 784, 1047, 1319].forEach((f, i) =>
        this._tone({ freq: f, type: 'triangle', dur: 0.6, gain: 0.28, delay: i * 0.06 }));
      this._noise({ dur: 0.5, gain: 0.18, freq: 3200, q: 0.8 });
    } else if (rarity === 'SR') {
      [523, 784].forEach((f, i) =>
        this._tone({ freq: f, type: 'triangle', dur: 0.3, gain: 0.2, delay: i * 0.07 }));
    } else {
      this._tone({ freq: 420, type: 'sine', dur: 0.16, gain: 0.14 });
    }
  }

  ui() { this._tone({ freq: 660, type: 'sine', dur: 0.05, gain: 0.09 }); }

  // ─────────── BGM ───────────

  /**
   * 簡易BGM。短いベースラインをループさせるだけ。
   * ★曲を鳴らすことより「無音でない」ことが目的なので、控えめに。
   */
  startBgm() {
    if (!this.ready || this.bgmPlaying) return;
    this.bgmPlaying = true;
    this._bgmStep = 0;
    this._tickBgm();
  }

  stopBgm() {
    this.bgmPlaying = false;
    clearTimeout(this._bgmTimer);
  }

  _tickBgm() {
    if (!this.bgmPlaying || !this.ready) return;
    const scale = [110, 110, 146.8, 110, 130.8, 110, 98, 110];
    const f = scale[this._bgmStep % scale.length];

    this._tone({ freq: f, type: 'triangle', dur: 0.34, gain: 0.16, bus: this.bgmBus });
    if (this._bgmStep % 4 === 0) {
      this._tone({ freq: f * 3, type: 'sine', dur: 0.22, gain: 0.05, bus: this.bgmBus });
    }

    this._bgmStep++;
    this._bgmTimer = setTimeout(() => this._tickBgm(), 380);
  }
}
