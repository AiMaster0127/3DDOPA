/**
 * アリーナの静的な見た目（地面・外周壁・装飾）。
 *
 * 静的オブジェクトは可能な限り InstancedMesh にまとめ、
 * 何個置いても draw call が増えないようにする。
 */
import * as THREE from '../../vendor/three/three.module.min.js';
import { BALANCE } from '../data/balance.js';
import { RNG } from '../core/RNG.js';

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

    // 装飾配置はシード固定。リロードしても同じ地形になり、見た目のデバッグができる
    this.rng = new RNG(0xa4e7a);

    this._buildGround();
    this._buildWalls();
    this._buildDecor();
  }

  _buildGround() {
    const r = this.radius;

    this.gridTex = makeGridTexture();
    this.gridTex.wrapS = this.gridTex.wrapT = THREE.RepeatWrapping;
    this.gridTex.repeat.set(r * 2 / 8, r * 2 / 8);      // 1タイル = 8ユニット
    this.gridTex.anisotropy = 4;
    this.gridTex.colorSpace = THREE.SRGBColorSpace;

    // ★グリッド模様は見た目の装飾ではなく機能。無地の床だと自分が動いているか判らない
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(r, 72),
      new THREE.MeshLambertMaterial({ color: 0x3a4070, map: this.gridTex })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.group.add(ground);

    // 中心の目印リング。位置感覚の基準になる
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(5.8, 6.0, 64),
      new THREE.MeshBasicMaterial({ color: 0x43e8ff, transparent: true, opacity: 0.16, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    this.group.add(ring);
  }

  /** 外周をぐるりと囲むブロック。1つの InstancedMesh = 1 draw call。 */
  _buildWalls() {
    const { wallCount, wallHeight } = BALANCE.arena;
    const r = this.radius;

    const im = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({ color: 0x545a94 }),
      wallCount
    );
    im.castShadow = true;
    im.receiveShadow = true;
    im.frustumCulled = false;      // アリーナ全体が常に視界内。境界球の判定を省く

    const seg = (Math.PI * 2) / wallCount;
    const width = (Math.PI * 2 * r) / wallCount * 1.06;   // 少し重ねて隙間を消す

    for (let i = 0; i < wallCount; i++) {
      const a = i * seg;
      const h = wallHeight * this.rng.range(0.75, 1.35);
      _p.set(Math.sin(a) * (r + 0.9), h / 2 - 0.3, Math.cos(a) * (r + 0.9));
      _e.set(0, a, 0);
      _q.setFromEuler(_e);
      _s.set(width, h, 1.9);
      im.setMatrixAt(i, _m.compose(_p, _q, _s));
    }
    im.instanceMatrix.needsUpdate = true;
    this.group.add(im);
    this.walls = im;
  }

  /** 内部に散らす岩。動かないのでこちらも1コールに畳む。 */
  _buildDecor() {
    const n = BALANCE.arena.decorCount;
    const im = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({ color: 0x4d5288 }),
      n
    );
    im.castShadow = true;
    im.receiveShadow = true;
    im.frustumCulled = false;

    const inner = 8;                       // 中央のスポーン地帯は空けておく
    const outer = this.radius - 3.5;

    for (let i = 0; i < n; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      // sqrt を挟むと半径方向に均一に散る（挟まないと中心に寄る）
      const d = Math.sqrt(this.rng.range((inner / outer) ** 2, 1)) * outer;
      const sc = this.rng.range(0.7, 2.1);
      const hy = sc * this.rng.range(0.5, 1.1);

      // ★中心Yは高さの半分。先に高さを決めないと地面から浮く／沈む
      _p.set(Math.sin(a) * d, hy * 0.5, Math.cos(a) * d);
      _e.set(0, this.rng.range(0, Math.PI * 2), 0);
      _q.setFromEuler(_e);
      _s.set(sc, hy, sc);
      im.setMatrixAt(i, _m.compose(_p, _q, _s));
    }
    im.instanceMatrix.needsUpdate = true;
    this.group.add(im);
    this.decor = im;
  }
}

/**
 * グリッド床のテクスチャを canvas で生成する。
 * 画像ファイルを同梱しないので容量ゼロ、外部通信ゼロ。
 */
function makeGridTexture(size = 128) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');

  // ★テクスチャは material.color に「乗算」される。
  //   ベースを暗くしすぎると線だけが浮いてワイヤーフレームに見えるので、
  //   ベースは明るめ(0.6程度)・線は白、というコントラスト差1.6倍程度に抑える。
  g.fillStyle = '#9aa2d0';
  g.fillRect(0, 0, size, size);

  g.strokeStyle = '#ffffff';
  g.lineWidth = 2;
  g.strokeRect(1, 1, size - 2, size - 2);

  const tex = new THREE.CanvasTexture(cv);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}
