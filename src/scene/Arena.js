/**
 * アリーナの静的な見た目（空・床・結界・外周壁・装飾）。
 *
 * ★静的オブジェクトは可能な限り InstancedMesh にまとめ、
 *   何個置いても draw call が増えないようにする。
 * ★テクスチャは全て手続き生成（scene/textures.js）。画像ファイルは同梱しない。
 */
import * as THREE from '../../vendor/three/three.module.min.js';
import { BALANCE } from '../data/balance.js';
import { RNG } from '../core/RNG.js';
import { withRim } from './materials.js';
import {
  makeFloorTexture, makeFloorSeamTexture, makeSkyTexture,
  makeBarrierTexture, makeMetalTexture, makeGlowTexture,
} from './textures.js';

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

export class Arena {
  constructor(scene) {
    this.radius = BALANCE.arena.radius;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.scene = scene;

    // 装飾配置はシード固定。リロードしても同じ地形になり、見た目のデバッグができる
    this.rng = new RNG(0xa4e7a);
    this.time = 0;

    this._buildSky();
    this._buildGround();
    this._buildBarrier();
    this._buildWalls();
    this._buildDecor();
  }

  /**
   * 背景。単色だと「箱の中」に見えるので、グラデーションと星で奥行きを作る。
   * ★内側を向けた巨大な球1つ。ライティング不要なので Basic で十分安い。
   */
  _buildSky() {
    this.skyTex = makeSkyTexture();
    // ★半径は camera.far より内側にすること。外に置くと丸ごとクリップされて
    //   背景が真っ黒になる（＝空を描いたつもりで何も出ない）。
    //   代わりに毎フレームカメラへ追従させ、無限遠のように見せる。
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(78, 32, 16),
      new THREE.MeshBasicMaterial({ map: this.skyTex, side: THREE.BackSide, fog: false, depthWrite: false })
    );
    sky.frustumCulled = false;
    sky.renderOrder = -1;
    this.sky = sky;
    this.scene.add(sky);
  }

  _buildGround() {
    const r = this.radius;
    const TILE = 5;                       // 1タイルのワールドサイズ。小さいほど密な質感になる

    this.floorTex = makeFloorTexture();
    this.floorTex.repeat.set((r * 2) / TILE, (r * 2) / TILE);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(r, 96),
      // ★床は思い切り暗くする。ここが明るいと自機も敵も浮かず、
      //   画面全体がのっぺりする。明暗差こそが「かっこよさ」の実体。
      withRim(
        new THREE.MeshLambertMaterial({ color: 0x1e2542, map: this.floorTex }),
        { color: 0x3f6cff, power: 4.5, strength: 0.16 }
      )
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.group.add(ground);

    // 発光する継ぎ目。床本体と分けておくと明滅させられる
    this.seamTex = makeFloorSeamTexture();
    this.seamTex.repeat.copy(this.floorTex.repeat);
    this.seamMat = new THREE.MeshBasicMaterial({
      map: this.seamTex, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
    });
    const seams = new THREE.Mesh(new THREE.CircleGeometry(r, 96), this.seamMat);
    seams.rotation.x = -Math.PI / 2;
    seams.position.y = 0.012;
    this.group.add(seams);

    // 中心の目印。円形の舞台であることを床に描く
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(5.8, 6.1, 96),
      new THREE.MeshBasicMaterial({
        color: 0x43e8ff, transparent: true, opacity: 0.20,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    this.group.add(ring);

    // 外周を縁取る光の輪。戦場の広さを一目で掴ませる
    const edge = new THREE.Mesh(
      new THREE.RingGeometry(r - 0.5, r, 128),
      new THREE.MeshBasicMaterial({
        color: 0x5ad8ff, transparent: true, opacity: 0.55,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    edge.rotation.x = -Math.PI / 2;
    edge.position.y = 0.03;
    this.group.add(edge);
  }

  /**
   * 外周のエネルギー壁。
   * ★「どこまでが戦場か」を線ではなく面で伝える。加算合成で軽く、1 draw call。
   */
  _buildBarrier() {
    this.barrierTex = makeBarrierTexture();
    this.barrierTex.repeat.set(9, 1);

    this.barrierMat = new THREE.MeshBasicMaterial({
      map: this.barrierTex, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.BackSide, fog: false,
    });

    const h = 13;
    const barrier = new THREE.Mesh(
      new THREE.CylinderGeometry(this.radius + 1.2, this.radius + 1.2, h, 96, 1, true),
      this.barrierMat
    );
    barrier.position.y = h / 2 - 0.4;
    barrier.frustumCulled = false;
    this.group.add(barrier);
  }

  /** 外周をぐるりと囲むブロック。1つの InstancedMesh = 1 draw call。 */
  _buildWalls() {
    const { wallCount, wallHeight } = BALANCE.arena;
    const r = this.radius;

    this.metalTex = makeMetalTexture();
    this.metalTex.repeat.set(1, 1);

    const im = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      withRim(
        new THREE.MeshLambertMaterial({ color: 0x2c3358, map: this.metalTex }),
        // ★平面が主体の物にリムを強く掛けると、面まるごとが白く飛ぶ。
        //   特にカメラのすぐ手前に来たときに巨大な白い板になって画面を壊す。
        { color: 0x69b4ff, power: 4.2, strength: 0.26 }
      ),
      wallCount
    );
    im.castShadow = true;
    im.receiveShadow = true;
    im.frustumCulled = false;      // アリーナ全体が常に視界内。境界球の判定を省く

    const seg = (Math.PI * 2) / wallCount;
    const width = (Math.PI * 2 * r) / wallCount * 1.06;   // 少し重ねて隙間を消す

    for (let i = 0; i < wallCount; i++) {
      const a = i * seg;
      const h = wallHeight * this.rng.range(0.75, 1.55);
      _p.set(Math.sin(a) * (r + 0.9), h / 2 - 0.3, Math.cos(a) * (r + 0.9));
      _e.set(0, a, 0);
      _q.setFromEuler(_e);
      _s.set(width, h, 1.9);
      im.setMatrixAt(i, _m.compose(_p, _q, _s));
    }
    im.instanceMatrix.needsUpdate = true;
    this.group.add(im);
    this.walls = im;

    // 壁の頭に走る発光帯。外周のシルエットを締める
    const cap = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0x43e8ff, fog: true }),
      wallCount
    );
    cap.frustumCulled = false;
    for (let i = 0; i < wallCount; i++) {
      const a = i * seg;
      const h = wallHeight * this.rng.range(0.75, 1.55);
      _p.set(Math.sin(a) * (r + 0.9), h - 0.3, Math.cos(a) * (r + 0.9));
      _e.set(0, a, 0);
      _q.setFromEuler(_e);
      _s.set(width * 0.92, 0.16, 2.05);
      cap.setMatrixAt(i, _m.compose(_p, _q, _s));
    }
    cap.instanceMatrix.needsUpdate = true;
    this.group.add(cap);
  }

  /**
   * 内部に散らす構造物。
   * ★ただの箱を並べると「置いてあるだけ」に見える。
   *   傾けた角柱にして、根本に光を仕込むと遺跡らしくなる。
   */
  _buildDecor() {
    const n = BALANCE.arena.decorCount;

    const im = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.62, 0.86, 1, 6),   // 六角柱。箱より情報量がある
      withRim(
        new THREE.MeshLambertMaterial({ color: 0x232a48, map: this.metalTex }),
        { color: 0x7f9cff, power: 4.2, strength: 0.24 }
      ),
      n
    );
    im.castShadow = true;
    im.receiveShadow = true;
    im.frustumCulled = false;

    // 根本の発光リング
    const glowTex = makeGlowTexture(128, 0.05);
    const gi = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: glowTex, color: 0x4a90ff, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
      }),
      n
    );
    gi.frustumCulled = false;

    const inner = 9;                       // 中央のスポーン地帯は空けておく
    const outer = this.radius - 3.5;

    for (let i = 0; i < n; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      // sqrt を挟むと半径方向に均一に散る（挟まないと中心に寄る）
      const d = Math.sqrt(this.rng.range((inner / outer) ** 2, 1)) * outer;
      // ★見下ろし視点では、高く細い物ほど画面端で大きく傾いて見え
      //   「倒れかけている」ように読めてしまう。低めの台座に留める。
      const sc = this.rng.range(0.7, 1.5);
      const hy = this.rng.range(1.0, 2.6);
      const px = Math.sin(a) * d, pz = Math.cos(a) * d;

      _p.set(px, hy * 0.5, pz);
      // 向きだけ散らす。傾けると見下ろしでは浮いて見えるので水平に保つ
      _e.set(0, this.rng.range(0, Math.PI * 2), 0);
      _q.setFromEuler(_e);
      _s.set(sc, hy, sc);
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
    this.decor = im;
  }

  /** 品質に応じて重ね物を間引く。 */
  applyQuality(tier) {
    // 低品質では加算レイヤを減らす。塗り面積（フィルレート）がモバイルの効きどころ
    this.seamMat.opacity = tier.particles > 0.4 ? 0.5 : 0.28;
    this.barrierMat.opacity = tier.particles > 0.4 ? 0.85 : 0.5;
  }

  /** ゆっくり明滅させて、止まった絵に見えないようにする。 */
  update(dt, camera) {
    this.time += dt;

    // ★空はカメラに追従させる。置きっぱなしだと、
    //   自機が端へ寄ったときに球の内壁が近づいて背景が歪む
    if (camera) this.sky.position.copy(camera.position);
    this.seamMat.opacity = 0.42 + Math.sin(this.time * 1.1) * 0.10;
    // 結界を横に流す。動きがあるだけで「生きている場」に見える
    this.barrierTex.offset.x = (this.time * 0.035) % 1;
  }
}
