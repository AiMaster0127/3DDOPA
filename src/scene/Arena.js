/**
 * アリーナの静的な見た目（空・舞台・段・尖塔・結界・装飾・遠景）。
 *
 * ★静的オブジェクトは可能な限り InstancedMesh にまとめ、
 *   何個置いても draw call が増えないようにする。
 * ★テクスチャは全て手続き生成（deckTextures.js / stageTextures.js）。
 *   画像ファイルは同梱しない。形は geometry.js に置く。
 *
 * ★形の方針：**丸をやめる。**
 *   円い床・円柱・真円のリングは「仮組み」に見える。
 *   舞台は12角形。縁・段・尖塔・結界まで同じ12面で揃えると、
 *   ばらばらの飾りではなく「一つの建造物」として読める。
 *
 * ★テーマ（src/data/themes.js）でステージごとに景色が変わる。
 *   色だけでなく、装飾の形・遠景の輪郭・霧の濃さまで差し替わる。
 */
import * as THREE from '../../vendor/three/three.module.min.js';
import { BALANCE } from '../data/balance.js';
import { THEMES } from '../data/themes.js';
import { RNG } from '../core/RNG.js';
import { withRim } from './materials.js';
import { mergeParts, makeDecorGeometry } from './geometry.js';
import { makeGlowTexture } from './textures.js';
import {
  makeFloorTexture, makeFloorSeamTexture,
  makeDeckDecalTexture, makeDeckShadeTexture, makeHazardTexture,
} from './deckTextures.js';
import { makeSkyTexture, makeBarrierTexture, makeMetalTexture } from './stageTextures.js';

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

/** 舞台の面数。ここを変えると床・縁・段・尖塔・結界が全部追従する。 */
const SIDES = 12;
const SEG = (Math.PI * 2) / SIDES;
/** 12角形の内接半径の比。外接半径×これ＝辺の中央までの距離 */
const INR = Math.cos(SEG / 2);

export class Arena {
  constructor(scene, theme = THEMES.ruin) {
    this.radius = BALANCE.arena.radius;
    // 内接半径が遊べる半径を上回るように外接半径を決める。
    // ★ここを詰めすぎると、自機が端に立ったとき床の外が見える
    this.outR = (this.radius + 1.8) / INR;
    this.scene = scene;

    this.group = new THREE.Group();
    scene.add(this.group);

    this.theme = theme;
    this.time = 0;
    this._disposables = [];

    this._build();
  }

  /** ステージ選択時に呼ぶ。舞台をまるごと差し替える。 */
  setTheme(theme) {
    if (!theme || theme === this.theme) return;
    this.theme = theme;
    this._teardown();
    this._build();
    if (this._tier) this.applyQuality(this._tier);
  }

  // ───────────────────── 生成 ─────────────────────

  _build() {
    // 配置はシード固定。リロードしても同じ地形になり、見た目のデバッグができる
    this.rng = new RNG(0xa4e7a);

    const T = this.theme;
    this.metalTex = this._keep(makeMetalTexture(T.frame));

    this._buildSky();
    this._buildDeck();
    this._buildRim();
    this._buildTerrace();
    this._buildPylons();
    this._buildBarrier();
    this._buildDecor();
    this._buildHorizon();
    this._buildEmbers();
  }

  /** 破棄対象として登録しつつ、そのまま返す。 */
  _keep(res) { this._disposables.push(res); return res; }

  _teardown() {
    // ★InstancedMesh はジオメトリもマテリアルも自分では解放しない。
    //   テーマを切り替えるたびに積み上がると、数回でGPUメモリを食い潰す。
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    this.group.clear();
    if (this.sky) {
      this.scene.remove(this.sky);
      this.sky.geometry.dispose();
      this.sky.material.dispose();
      this.sky = null;
    }
    for (const d of this._disposables) d.dispose?.();
    this._disposables.length = 0;
  }

  /**
   * 背景。単色だと「箱の中」に見えるので、グラデーション・星・
   * 地平のシルエットで奥行きを作る。
   * ★内側を向けた球1つ。ライティング不要なので Basic で十分安い。
   */
  _buildSky() {
    const tex = this._keep(makeSkyTexture(this.theme.sky));
    // ★半径は camera.far より内側にすること。外に置くと丸ごとクリップされて
    //   背景が真っ黒になる（＝空を描いたつもりで何も出ない）。
    //   代わりに毎フレームカメラへ追従させ、無限遠のように見せる。
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(78, 32, 16),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false })
    );
    sky.frustumCulled = false;
    sky.renderOrder = -1;
    this.sky = sky;
    this.scene.add(sky);
  }

  /**
   * 舞台の甲板。12角形。
   * ★床は思い切り暗くする。ここが明るいと自機も敵も浮かず、画面がのっぺりする。
   *   明暗差こそが「かっこよさ」の実体。
   */
  _buildDeck() {
    const R = this.outR;
    const T = this.theme;
    // 1タイルのワールドサイズ。★大きくすると柄の繰り返しは目立たなくなるが、
    //   縦持ちでは視野が狭いぶん「巨大な板」に見える。6が両立点
    const TILE = 6;

    this.floorTex = this._keep(makeFloorTexture(T.floor));
    this.floorTex.repeat.set((R * 2) / TILE, (R * 2) / TILE);

    const deck = new THREE.Mesh(
      new THREE.CircleGeometry(R, SIDES),          // 分割12＝正十二角形
      withRim(
        new THREE.MeshLambertMaterial({ color: T.floor.base, map: this.floorTex }),
        { color: T.floor.accent, power: 4.5, strength: 0.16 }
      )
    );
    deck.rotation.x = -Math.PI / 2;
    deck.receiveShadow = true;
    this.group.add(deck);

    // 汚れと周辺減光。★これが無いと、細部を描き込むほど「同じ柄の壁紙」に見える。
    //   繰り返さない大きなムラを乗算で掛けて、一枚の広い床にする
    this.shadeTex = this._keep(makeDeckShadeTexture(T.floor));
    const shade = new THREE.Mesh(
      new THREE.PlaneGeometry(R * 2, R * 2),
      new THREE.MeshBasicMaterial({
        // ★真っ黒で落とすと「影」に見える。霧と同じ色で落とすと
        //   遠近と馴染んで「空気に沈んでいる」ように見える
        map: this.shadeTex, color: T.fog.color, transparent: true,
        depthWrite: false, fog: false,
      })
    );
    shade.rotation.x = -Math.PI / 2;
    shade.position.y = 0.008;
    // ★重ね順を明示する。同じ高さの半透明を3枚重ねるので、
    //   距離順に任せると回転のたびに前後が入れ替わってちらつく
    shade.renderOrder = 1;
    this.group.add(shade);

    // 発光する継ぎ目。床本体と分けておくと明滅させられる
    this.seamTex = this._keep(makeFloorSeamTexture(T.floor));
    this.seamTex.repeat.copy(this.floorTex.repeat);
    this.seamMat = new THREE.MeshBasicMaterial({
      map: this.seamTex, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
    });
    const seams = new THREE.Mesh(new THREE.CircleGeometry(R, SIDES), this.seamMat);
    seams.rotation.x = -Math.PI / 2;
    seams.position.y = 0.012;
    seams.renderOrder = 2;
    this.group.add(seams);

    // 甲板の見取り図。★タイルの繰り返しだけでは「広い board」にしか見えない。
    //   中心・区画・外周を1枚の図として重ねて、初めて設計された場所になる
    this.decalTex = this._keep(makeDeckDecalTexture(T.floor));
    this.decalMat = new THREE.MeshBasicMaterial({
      map: this.decalTex, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
    });
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(R * 2, R * 2), this.decalMat);
    decal.rotation.x = -Math.PI / 2;
    decal.position.y = 0.02;
    decal.renderOrder = 3;
    this.group.add(decal);
  }

  /**
   * 舞台の縁：警戒帯 → 低い胸壁 → 発光する笠木。
   * ★「ここから先は場外」を線1本ではなく帯で言い切る。遠くからでも読める。
   */
  _buildRim() {
    const T = this.theme;
    const R = this.outR;
    const inr = R * INR;                       // 辺の中央までの距離
    const edge = 2 * R * Math.sin(SEG / 2);    // 辺の長さ

    // --- 斜め縞の警戒帯（辺ごとに1枚の板）---
    this.hazardTex = this._keep(makeHazardTexture(T.floor));
    // ★縞が繰り返すのは「辺に沿う向き」。板を寝かせた後、UVのv が辺方向になる。
    //   u（帯の幅）側に繰り返しを入れると、縞が潰れてただの帯になる。
    //   256x64 の絵を歪めずに幅2.2mへ貼ると1枚あたり約8.8m→辺19mで約2.2回
    this.hazardTex.repeat.set(1, 2.2);
    // ★板を寝かせる回転は**ジオメトリに焼く**。インスタンス側で
    //   rotation.x と rotation.y を重ねると、オイラーの順序で軸が入れ替わり、
    //   辺に沿うはずの帯が放射状のスポークになる（実際に一度そうなった）。
    const hzGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const hz = new THREE.InstancedMesh(
      hzGeo,
      new THREE.MeshLambertMaterial({ map: this.hazardTex, transparent: true, opacity: 0.75 }),
      SIDES
    );
    hz.receiveShadow = true;
    hz.frustumCulled = false;
    const bandW = 2.2;
    for (let i = 0; i < SIDES; i++) {
      const a = (i + 0.5) * SEG;
      _p.set(Math.cos(a) * (inr - bandW / 2), 0.015, Math.sin(a) * (inr - bandW / 2));
      _e.set(0, -a, 0);                      // 胸壁とまったく同じ向きの決め方
      _q.setFromEuler(_e);
      _s.set(bandW, 1, edge * 1.02);         // X=半径方向の幅 / Z=辺に沿う長さ
      hz.setMatrixAt(i, _m.compose(_p, _q, _s));
    }
    hz.instanceMatrix.needsUpdate = true;
    this.group.add(hz);

    // --- 胸壁。低く、厚く。高い壁は視界を潰す ---
    const wallH = BALANCE.arena.wallHeight * 0.55;
    const wall = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      withRim(
        new THREE.MeshLambertMaterial({ color: T.frame.base, map: this.metalTex }),
        // ★平面が主体の物にリムを強く掛けると、面まるごとが白く飛ぶ。
        //   特にカメラのすぐ手前で巨大な白い板になって画面を壊す。
        { color: T.frame.accent, power: 4.2, strength: 0.24 }
      ),
      SIDES
    );
    wall.castShadow = true;
    wall.receiveShadow = true;
    wall.frustumCulled = false;
    for (let i = 0; i < SIDES; i++) {
      const a = (i + 0.5) * SEG;
      _p.set(Math.cos(a) * (inr + 0.55), wallH / 2 - 0.15, Math.sin(a) * (inr + 0.55));
      _e.set(0, -a, 0);
      _q.setFromEuler(_e);
      _s.set(1.5, wallH, edge * 1.02);
      wall.setMatrixAt(i, _m.compose(_p, _q, _s));
    }
    wall.instanceMatrix.needsUpdate = true;
    this.group.add(wall);

    // --- 笠木。外周のシルエットを一本の光で締める ---
    const cap = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: T.frame.cap, fog: true }),
      SIDES
    );
    cap.frustumCulled = false;
    for (let i = 0; i < SIDES; i++) {
      const a = (i + 0.5) * SEG;
      _p.set(Math.cos(a) * (inr + 0.55), wallH - 0.15, Math.sin(a) * (inr + 0.55));
      _e.set(0, -a, 0);
      _q.setFromEuler(_e);
      _s.set(1.62, 0.14, edge * 1.02);
      cap.setMatrixAt(i, _m.compose(_p, _q, _s));
    }
    cap.instanceMatrix.needsUpdate = true;
    this.group.add(cap);
  }

  /**
   * 外へ下る段。
   * ★これが無いと舞台が「空に浮いた板」に見える。
   *   下へ段を重ねるだけで、建造物としての重さが出る。
   */
  _buildTerrace() {
    const T = this.theme;
    const R = this.outR;
    const TIERS = [
      { dr: 2.6, y: -1.0, h: 1.9, w: 3.4 },
      { dr: 6.2, y: -2.9, h: 2.4, w: 4.6 },
      { dr: 11.0, y: -5.6, h: 3.4, w: 6.2 },
    ];

    // ★段は縁より暗く落とす。同じ明るさだと下の塊が舞台と同じ強さで主張して、
    //   どこが戦う場所なのか一目で判らなくなる
    const tierColor = new THREE.Color(T.frame.base).multiplyScalar(0.5);
    const im = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      withRim(
        new THREE.MeshLambertMaterial({ color: tierColor, map: this.metalTex }),
        { color: T.frame.accent, power: 4.6, strength: 0.20 }
      ),
      SIDES * TIERS.length
    );
    im.frustumCulled = false;      // アリーナ全体が常に視界内。境界球の判定を省く

    let k = 0;
    for (const t of TIERS) {
      const rr = (R + t.dr) * INR;
      const edge = 2 * (R + t.dr) * Math.sin(SEG / 2);
      for (let i = 0; i < SIDES; i++) {
        const a = (i + 0.5) * SEG;
        _p.set(Math.cos(a) * rr, t.y, Math.sin(a) * rr);
        _e.set(0, -a, 0);
        _q.setFromEuler(_e);
        _s.set(t.w, t.h, edge * 1.03);
        im.setMatrixAt(k++, _m.compose(_p, _q, _s));
      }
    }
    im.instanceMatrix.needsUpdate = true;
    this.group.add(im);
  }

  /**
   * 12の頂点に立てる尖塔。
   * ★舞台の輪郭を「縁取り」ではなく「柱の列」で決める。
   *   等間隔に立つ縦の要素があると、広さと形が一目で掴める。
   */
  _buildPylons() {
    const T = this.theme;
    const R = this.outR;

    // 角錐台の軸 + 帯 + 頭の錐。全部四角断面で稜線を立てる
    const geo = mergeParts([
      { geo: new THREE.CylinderGeometry(1.5, 2.3, 1.1, 4), pos: [0, 0.55, 0], rot: [0, Math.PI / 4, 0] },
      { geo: new THREE.CylinderGeometry(0.72, 1.28, 8.4, 4), pos: [0, 5.3, 0], rot: [0, Math.PI / 4, 0] },
      { geo: new THREE.BoxGeometry(2.3, 0.34, 2.3), pos: [0, 9.6, 0], rot: [0, Math.PI / 4, 0] },
      { geo: new THREE.ConeGeometry(1.05, 2.2, 4), pos: [0, 10.9, 0], rot: [0, Math.PI / 4, 0] },
    ]);

    const im = new THREE.InstancedMesh(
      geo,
      withRim(
        new THREE.MeshLambertMaterial({ color: T.frame.base, map: this.metalTex }),
        { color: T.frame.accent, power: 3.8, strength: 0.30 }
      ),
      SIDES
    );
    im.frustumCulled = false;

    // 頂部の灯り。板1枚だが、暗い遠景に点が並ぶだけで「施設」に見える
    const glowTex = this._keep(makeGlowTexture(128, 0.10));
    const bi = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: glowTex, color: T.frame.cap, transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
      }),
      SIDES
    );
    bi.frustumCulled = false;
    this.beacons = bi;

    for (let i = 0; i < SIDES; i++) {
      const a = i * SEG;                       // 頂点に立てる（辺の中央ではない）
      const px = Math.cos(a) * R, pz = Math.sin(a) * R;
      _p.set(px, -0.4, pz);
      _e.set(0, -a, 0);
      _q.setFromEuler(_e);
      _s.set(1, 1, 1);
      im.setMatrixAt(i, _m.compose(_p, _q, _s));

      _p.set(px, 11.7, pz);
      _q.identity();                            // 毎フレームカメラへ向け直す
      _s.setScalar(4.2);
      bi.setMatrixAt(i, _m.compose(_p, _q, _s));
    }
    im.instanceMatrix.needsUpdate = true;
    bi.instanceMatrix.needsUpdate = true;
    this.group.add(im, bi);
    this._beaconR = R;
  }

  /**
   * 外周のエネルギー壁。
   * ★「どこまでが戦場か」を線ではなく面で伝える。加算合成で軽く、1 draw call。
   * ★12面。円筒にすると舞台の12角形と輪郭がずれて、二重の縁に見える。
   */
  _buildBarrier() {
    const T = this.theme;
    this.barrierTex = this._keep(makeBarrierTexture(T.barrier));
    this.barrierTex.repeat.set(SIDES, 1);

    this.barrierMat = new THREE.MeshBasicMaterial({
      map: this.barrierTex, transparent: true, opacity: T.barrier.opacity,
      blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.BackSide, fog: false,
    });
    this.barrierBase = T.barrier.opacity;

    const h = 13;
    const barrier = new THREE.Mesh(
      new THREE.CylinderGeometry(this.outR, this.outR, h, SIDES, 1, true),
      this.barrierMat
    );
    barrier.position.y = h / 2 - 0.4;
    barrier.frustumCulled = false;
    this.group.add(barrier);

    // 各稜に縦のフレーム。膜が「張られている」ように見せる
    const fr = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({
        color: T.barrier.color, transparent: true, opacity: 0.35,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
      }),
      SIDES
    );
    fr.frustumCulled = false;
    for (let i = 0; i < SIDES; i++) {
      const a = i * SEG;
      _p.set(Math.cos(a) * this.outR, 3.2, Math.sin(a) * this.outR);
      _e.set(0, -a, 0);
      _q.setFromEuler(_e);
      _s.set(0.3, 7.0, 0.3);
      fr.setMatrixAt(i, _m.compose(_p, _q, _s));
    }
    fr.instanceMatrix.needsUpdate = true;
    this.group.add(fr);
  }

  /**
   * 場内に散らす構造物。テーマごとに形が変わる。
   * ★ただの箱を並べると「置いてあるだけ」に見える。
   *   複数のプリミティブを合成して、崩れた建材や牙として読ませる。
   */
  _buildDecor() {
    const T = this.theme;
    const n = BALANCE.arena.decorCount;

    const im = new THREE.InstancedMesh(
      makeDecorGeometry(T.decor.kind),
      withRim(
        new THREE.MeshLambertMaterial({ color: T.decor.color, map: this.metalTex }),
        { color: T.frame.accent, power: 4.0, strength: 0.26 }
      ),
      n
    );
    im.castShadow = true;
    im.receiveShadow = true;
    im.frustumCulled = false;

    // 根本の発光。暗い床の上で「そこに何かある」と判るようにする
    const glowTex = this._keep(makeGlowTexture(128, 0.05));
    const gi = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: glowTex, color: T.decor.glow, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
      }),
      n
    );
    gi.frustumCulled = false;

    const inner = 10;                      // 中央のスポーン地帯は空けておく
    const outer = this.radius - 3.0;

    // ★均等にばら撒くと「同じ物が等間隔に並んだ床」に見える。
    //   数カ所の塊に寄せると、崩れた場所らしい粗密が出て、
    //   ついでに開けた場所ができて戦いやすくもなる。
    const CLUSTERS = 9;
    const cx = new Float32Array(CLUSTERS), cz = new Float32Array(CLUSTERS);
    for (let k = 0; k < CLUSTERS; k++) {
      const a = (k / CLUSTERS) * Math.PI * 2 + this.rng.range(-0.35, 0.35);
      const d = this.rng.range(inner + 2, outer - 2);
      cx[k] = Math.cos(a) * d; cz[k] = Math.sin(a) * d;
    }

    for (let i = 0; i < n; i++) {
      let px, pz;
      if (i % 4 === 0) {
        // 4体に1体は塊から離して置く。全部が塊だと今度は「島」に見える
        const a = this.rng.range(0, Math.PI * 2);
        // sqrt を挟むと半径方向に均一に散る（挟まないと中心に寄る）
        const d = Math.sqrt(this.rng.range((inner / outer) ** 2, 1)) * outer;
        px = Math.cos(a) * d; pz = Math.sin(a) * d;
      } else {
        const k = i % CLUSTERS;
        const a = this.rng.range(0, Math.PI * 2);
        const d = Math.sqrt(this.rng.range(0, 1)) * this.rng.range(3.5, 9.0);
        px = cx[k] + Math.cos(a) * d; pz = cz[k] + Math.sin(a) * d;
        const r2 = Math.hypot(px, pz);
        if (r2 > outer) { px *= outer / r2; pz *= outer / r2; }
        if (r2 < inner) { px *= inner / (r2 || 1); pz *= inner / (r2 || 1); }
      }
      // ★大きさを揃えると「量産品を並べた」に見える。たまに大きいのを混ぜる
      const sc = this.rng.range(0, 1) < 0.16
        ? this.rng.range(1.7, 2.6)
        : this.rng.range(0.55, 1.35);

      _p.set(px, 0, pz);
      // ★向きは自由に散らす。傾けるのはごく僅かに留める
      //   （見下ろし視点では、傾いた物は浮いているように読める）
      _e.set(this.rng.range(-0.07, 0.07), this.rng.range(0, Math.PI * 2), this.rng.range(-0.07, 0.07));
      _q.setFromEuler(_e);
      _s.set(sc, sc * this.rng.range(0.75, 1.35), sc);
      im.setMatrixAt(i, _m.compose(_p, _q, _s));

      _p.set(px, 0.05, pz);
      _e.set(-Math.PI / 2, 0, 0);
      _q.setFromEuler(_e);
      _s.setScalar(sc * 5.0);
      gi.setMatrixAt(i, _m.compose(_p, _q, _s));
    }
    im.instanceMatrix.needsUpdate = true;
    gi.instanceMatrix.needsUpdate = true;
    this.group.add(im, gi);
    this.decorGlowMat = gi.material;
  }

  /**
   * 結界の外に立つ遠景の塔。
   * ★空に焼いたシルエットだけでは、動いても景色が変わらず「絵」に見える。
   *   実体を置くと視差が出て、初めて「外に世界がある」になる。
   * ★InstancedMesh。90本ぶんのジオメトリを毎回合成すると、
   *   ステージを選ぶたびに数百ms固まる（実際に固まった）。
   *   形は1つでよく、幅と高さの比を変えるだけで輪郭は十分ばらける。
   * ★影は落とさない（どうせ影カメラの外だし、三角形が2倍で効いてしまう）。
   */
  _buildHorizon() {
    const T = this.theme;
    const rng = new RNG(0x5eed17);
    const n = T.horizon.count;
    const mat = new THREE.MeshLambertMaterial({ color: T.horizon.color, fog: true });

    const towers = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.42, 0.5, 1, 4), mat, n
    );
    towers.frustumCulled = false;

    // 3本に1本だけ頭に尖りを足して、輪郭にリズムを作る
    const spikeN = Math.ceil(n / 3);
    const spikes = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.4, 1, 4), mat, spikeN
    );
    spikes.frustumCulled = false;

    const base = -18;
    let si = 0;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.range(-0.03, 0.03);
      // ★近すぎ・高すぎると「壁」になって空を塞ぐ。一度そうなった。
      //   拠点の見せカメラ（半径50前後）の外側でもある
      const d = rng.range(84, 116);
      const h = rng.range(10, 30) * T.horizon.height;
      const w = rng.range(3.6, 9.0);
      const px = Math.cos(a) * d, pz = Math.sin(a) * d;

      _p.set(px, base + h / 2, pz);
      _e.set(0, a, 0);
      _q.setFromEuler(_e);
      _s.set(w, h, w);
      towers.setMatrixAt(i, _m.compose(_p, _q, _s));

      if (i % 3 === 0 && si < spikeN) {
        _p.set(px, base + h + h * 0.22, pz);
        _s.set(w, h * 0.45, w);
        spikes.setMatrixAt(si++, _m.compose(_p, _q, _s));
      }
    }
    towers.instanceMatrix.needsUpdate = true;
    spikes.instanceMatrix.needsUpdate = true;
    spikes.count = si;
    this.group.add(towers, spikes);
  }

  /**
   * 漂う粒子。
   * ★止まった空気は「書き割り」に見える。ゆっくり上がる粒が数百あるだけで、
   *   同じ舞台が「その場所」になる。Points なので1 draw call。
   */
  _buildEmbers() {
    const T = this.theme;
    const n = T.ember.count;
    const pos = new Float32Array(n * 3);
    const spd = new Float32Array(n);
    const rng = new RNG(0xe3b17);
    const R = this.outR + 6;

    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = Math.sqrt(rng.range(0, 1)) * R;
      pos[i * 3] = Math.cos(a) * d;
      pos[i * 3 + 1] = rng.range(0, 18);
      pos[i * 3 + 2] = Math.sin(a) * d;
      spd[i] = rng.range(0.5, 1.6);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), R * 1.6);

    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
      map: this._keep(makeGlowTexture(64, 0.2)),
      color: T.ember.color, size: T.ember.size, sizeAttenuation: true,
      transparent: true, opacity: 0.75, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: true,
    }));
    pts.frustumCulled = false;
    this.group.add(pts);

    this.embers = pts;
    this._emberPos = pos;
    this._emberSpd = spd;
    this._emberRise = T.ember.rise;
    this._emberCount = n;
  }

  // ───────────────────── 毎フレーム ─────────────────────

  /** 品質に応じて重ね物を間引く。 */
  applyQuality(tier) {
    this._tier = tier;
    // 低品質では加算レイヤを減らす。塗り面積（フィルレート）がモバイルの効きどころ
    const rich = tier.particles > 0.4;
    this.seamMat.opacity = rich ? 0.5 : 0.28;
    this.decalMat.opacity = rich ? 0.55 : 0.30;
    this.barrierMat.opacity = rich ? this.barrierBase : this.barrierBase * 0.6;
    this.decorGlowMat.opacity = rich ? 0.5 : 0.26;
    // 粒子は数で効く。低品質では描く本数そのものを削る
    this.embers.geometry.setDrawRange(0, Math.round(this._emberCount * (rich ? 1 : 0.35)));
    this.embers.visible = tier.particles > 0.2;
  }

  /** ゆっくり明滅させて、止まった絵に見えないようにする。 */
  update(dt, camera) {
    this.time += dt;

    // ★空はカメラに追従させる。置きっぱなしだと、
    //   自機が端へ寄ったときに球の内壁が近づいて背景が歪む
    if (camera) {
      this.sky.position.copy(camera.position);
      // 尖塔の灯りは板1枚。常にカメラを向いていないと消えて見える
      for (let i = 0; i < SIDES; i++) {
        const a = i * SEG;
        _p.set(Math.cos(a) * this._beaconR, 11.7, Math.sin(a) * this._beaconR);
        _s.setScalar(4.2 + Math.sin(this.time * 2.2 + i) * 0.5);
        this.beacons.setMatrixAt(i, _m.compose(_p, camera.quaternion, _s));
      }
      this.beacons.instanceMatrix.needsUpdate = true;
    }

    this.seamMat.opacity = 0.42 + Math.sin(this.time * 1.1) * 0.10;
    // 結界を横に流す。動きがあるだけで「生きている場」に見える
    this.barrierTex.offset.x = (this.time * 0.035) % 1;

    // 粒子を上げる。★配列を作り直さず、確保済みの Float32Array に書く
    if (this.embers.visible) {
      const p = this._emberPos, s = this._emberSpd;
      const rise = this._emberRise * dt;
      for (let i = 0; i < this._emberCount; i++) {
        const y = i * 3 + 1;
        p[y] += s[i] * rise;
        if (p[y] > 20) p[y] -= 20;            // 上まで行ったら下から出し直す
      }
      this.embers.geometry.attributes.position.needsUpdate = true;
    }
  }
}
