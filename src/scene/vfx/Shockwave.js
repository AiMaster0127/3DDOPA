/**
 * 衝撃波と光柱。
 *
 * ★「当たった」を床に描く役。
 *   ボスの叩きつけも爆発も、これまで判定とダメージだけで**画に何も出ていなかった**。
 *   数字が減るだけの攻撃は、避け方を体で覚えられない。
 *
 * ★2つの InstancedMesh だけで済ませる（輪＝1／光柱＝1）。
 *   1発ごとに Mesh を作ると、乱戦の爆発で draw call が溢れる。
 * ★加算合成なので、消すときは色を黒へ寄せればよい。
 *   インスタンスごとの不透明度は持てないが、加算では黒＝透明と同じ。
 * ★バッファは起動時に確保し、以後 new しない。
 */
import * as THREE from '../../../vendor/three/three.module.min.js';

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const FLAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));

export class Shockwave {
  /**
   * @param {number} ringCap  同時に出せる輪の数
   * @param {number} pillarCap 同時に出せる光柱の数
   */
  constructor(scene, ringCap = 14, pillarCap = 6) {
    this.ringCap = ringCap;
    this.pillarCap = pillarCap;

    // ---- 床を走る輪 ----
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    // 内径0.66＝やや太い輪。細すぎると床の模様に紛れて見えない
    this.rings = new THREE.InstancedMesh(
      new THREE.RingGeometry(0.66, 1.0, 44), this.ringMat, ringCap
    );
    this.rings.frustumCulled = false;
    this.rings.count = 0;
    scene.add(this.rings);

    // ---- 落雷などの光柱 ----
    this.pillarMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.pillars = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(1, 1, 1, 10, 1, true), this.pillarMat, pillarCap
    );
    this.pillars.frustumCulled = false;
    this.pillars.count = 0;
    scene.add(this.pillars);

    // ---- 着弾の閃光（塗りつぶしの円）----
    // ★輪だけだと「線が広がった」で終わる。一瞬だけ面で光らせると衝撃になる
    this.discMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.discs = new THREE.InstancedMesh(
      new THREE.CircleGeometry(1, 32), this.discMat, ringCap
    );
    this.discs.frustumCulled = false;
    this.discs.count = 0;
    scene.add(this.discs);

    // 状態は型付き配列で持つ（毎フレームのアロケーションを避ける）
    const mk = (n) => ({
      x: new Float32Array(n), z: new Float32Array(n),
      r0: new Float32Array(n), r1: new Float32Array(n),
      t: new Float32Array(n), dur: new Float32Array(n),
      cr: new Float32Array(n), cg: new Float32Array(n), cb: new Float32Array(n),
      n: 0,
    });
    this.R = mk(ringCap);
    this.P = mk(pillarCap);
    this.D = mk(ringCap);
    this.scale = 1;      // 品質ティア
  }

  applyQuality(tier) {
    this.scale = tier.particles;
    // 低品質でも輪は消さない。これは装飾ではなく「どこまで届いたか」の情報
    this.ringMat.opacity = tier.particles > 0.4 ? 0.9 : 0.62;
    this.discMat.opacity = tier.particles > 0.4 ? 0.85 : 0.5;
    this.pillars.visible = tier.particles > 0.25;
  }

  /** 満杯なら一番古いものを上書きする（詰まって出なくなるより良い） */
  _slot(S, cap) {
    if (S.n < cap) return S.n++;
    let worst = 0, best = -1;
    for (let i = 0; i < cap; i++) {
      const p = S.t[i] / S.dur[i];
      if (p > best) { best = p; worst = i; }
    }
    return worst;
  }

  /**
   * 床を走る輪。
   * @param {number} r1 最終半径（＝技の当たる範囲）。★実際の判定と揃えること
   */
  ring(x, z, r1, color, dur = 0.42, r0 = 0.2) {
    const i = this._slot(this.R, this.ringCap);
    const S = this.R;
    S.x[i] = x; S.z[i] = z; S.r0[i] = r0; S.r1[i] = r1;
    S.t[i] = 0; S.dur[i] = dur;
    // ★1を超える値を入れる。加算合成なので、これで初めて床の上で「光」になる
    _c.setHex(color).multiplyScalar(2.4);
    S.cr[i] = _c.r; S.cg[i] = _c.g; S.cb[i] = _c.b;
  }

  /** 着弾の閃光。太く短く */
  flash(x, z, radius, color, dur = 0.20) {
    const i = this._slot(this.D, this.ringCap);
    const S = this.D;
    S.x[i] = x; S.z[i] = z; S.r0[i] = radius * 0.5; S.r1[i] = radius;
    S.t[i] = 0; S.dur[i] = dur;
    _c.setHex(color).multiplyScalar(1.5);
    S.cr[i] = _c.r; S.cg[i] = _c.g; S.cb[i] = _c.b;
  }

  /** 落雷の柱。上から降ってきたように見せる */
  pillar(x, z, radius, color, dur = 0.34) {
    const i = this._slot(this.P, this.pillarCap);
    const S = this.P;
    S.x[i] = x; S.z[i] = z; S.r0[i] = radius; S.r1[i] = radius;
    S.t[i] = 0; S.dur[i] = dur;
    _c.setHex(color).multiplyScalar(2.6);
    S.cr[i] = _c.r; S.cg[i] = _c.g; S.cb[i] = _c.b;
  }

  /** 叩きつけ・落雷の一式。閃光＋輪（＋柱）をまとめて出す */
  impact(x, z, radius, color, withPillar = false) {
    this.flash(x, z, radius * 0.9, color, 0.22);
    this.ring(x, z, radius, color, 0.46);
    this.ring(x, z, radius * 0.55, color, 0.30, 0.1);   // 内側にもう一本。速度が出る
    if (withPillar) this.pillar(x, z, radius * 0.22, color, 0.38);
  }

  update(dt) {
    this._step(this.R, this.rings, dt, 'ring');
    this._step(this.D, this.discs, dt, 'disc');
    this._step(this.P, this.pillars, dt, 'pillar');
  }

  _step(S, im, dt, kind) {
    let out = 0;
    for (let i = 0; i < S.n; i++) {
      S.t[i] += dt;
      const p = S.t[i] / S.dur[i];
      if (p >= 1) continue;                       // 寿命切れ。詰め直しは下でまとめて

      // 立ち上がりは速く、後半は減速させる。等速だと「輪が移動しただけ」に見える
      const e = 1 - (1 - p) * (1 - p);
      const fade = (1 - p) * (1 - p);

      if (kind === 'pillar') {
        // 柱は上から降りてくる：高さを縮めながら細くする
        const h = 26 * (1 - e * 0.75);
        _p.set(S.x[i], h * 0.5, S.z[i]);
        _q.identity();
        _s.set(S.r0[i] * (1 - p * 0.5), h, S.r0[i] * (1 - p * 0.5));
      } else if (kind === 'disc') {
        // 閃光は素早く広がって消える。輪より内側・下に敷く
        _p.set(S.x[i], 0.075, S.z[i]);
        _q.copy(FLAT);
        const r = S.r0[i] + (S.r1[i] - S.r0[i]) * e;
        _s.set(r, r, 1);
      } else {
        _p.set(S.x[i], 0.10, S.z[i]);
        _q.copy(FLAT);
        const r = S.r0[i] + (S.r1[i] - S.r0[i]) * e;
        _s.set(r, r, 1);
      }
      im.setMatrixAt(out, _m.compose(_p, _q, _s));
      im.setColorAt(out, _c.setRGB(S.cr[i] * fade, S.cg[i] * fade, S.cb[i] * fade));

      // 生きているものを前へ詰める（穴を作らない）
      if (out !== i) {
        S.x[out] = S.x[i]; S.z[out] = S.z[i];
        S.r0[out] = S.r0[i]; S.r1[out] = S.r1[i];
        S.t[out] = S.t[i]; S.dur[out] = S.dur[i];
        S.cr[out] = S.cr[i]; S.cg[out] = S.cg[i]; S.cb[out] = S.cb[i];
      }
      out++;
    }
    S.n = out;
    im.count = out;
    if (out > 0) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }

  clear() {
    this.R.n = 0; this.P.n = 0; this.D.n = 0;
    this.rings.count = 0; this.pillars.count = 0; this.discs.count = 0;
  }
}
