/**
 * 敵の行動。
 *
 * ★data/enemies.js の `ai` 文字列がそのままここのキーになる。
 *   新しい挙動を足したいときは、この表に関数を1つ追加するだけでよい。
 *
 * 各関数は e.vx / e.vz（希望する移動速度）を書き込むだけにする。
 * 実際の積分・ノックバック・減速・壁処理は EnemyPool.update がまとめて行う。
 *
 * ctx は外の世界への口（EnemyPool.ctx）。
 *   ctx.fire(e, dirX, dirZ, shoot)  敵弾を撃つ
 *   ctx.summon(e, id, count)        取り巻きを呼ぶ
 */

/**
 * ★毎フレーム、敵の数だけ呼ばれる。
 *   ここでオブジェクトを作って返すと、150体×毎秒15回＝毎秒2000個のゴミになり、
 *   GCがフレームを削り始める。使い回しの1個に書き込んで返す。
 *   （呼び出し側は即座に読むだけで、保持しないこと）
 */
const _t = { dx: 0, dz: 0, d: 1, nx: 0, nz: 1 };
const toPlayer = (e, player) => {
  const dx = player.x - e.x, dz = player.z - e.z;
  const d = Math.hypot(dx, dz) || 1;
  _t.dx = dx; _t.dz = dz; _t.d = d; _t.nx = dx / d; _t.nz = dz / d;
  return _t;
};

const stop = (e) => { e.vx = 0; e.vz = 0; };

/** 追いかけるだけ。数で押す雑魚の基本形。 */
function chase(e, player) {
  const t = toPlayer(e, player);
  e.vx = t.nx * e.speed;
  e.vz = t.nz * e.speed;
}

/**
 * 回り込み。
 * 遠いときは接近し、近いと横に流れる。正面から突っ込んでこないので
 * 「気付いたら囲まれている」圧が生まれる。
 */
function strafe(e, player) {
  const t = toPlayer(e, player);
  const approach = t.d > 7 ? 1 : t.d > 3.2 ? 0.35 : -0.25;
  const orbit = t.d < 11 ? 0.85 : 0.2;
  e.vx = (t.nx * approach + -t.nz * orbit * e.aiSide) * e.speed;
  e.vz = (t.nz * approach + t.nx * orbit * e.aiSide) * e.speed;
}

/**
 * 射撃。
 * 一定距離を保ちながら撃つ。「近寄って殴る」だけでは処理できない相手を作り、
 * プレイヤーに動く理由を与える。
 */
function shooter(e, player, dt, ctx) {
  const s = e.arch.shoot;
  const t = toPlayer(e, player);

  // 近すぎたら下がり、遠すぎたら寄る。ちょうどよければ横に流れる
  if (t.d < s.keep * 0.75) {
    e.vx = -t.nx * e.speed; e.vz = -t.nz * e.speed;
  } else if (t.d > s.keep) {
    e.vx = t.nx * e.speed; e.vz = t.nz * e.speed;
  } else {
    e.vx = -t.nz * e.speed * 0.5 * e.aiSide;
    e.vz = t.nx * e.speed * 0.5 * e.aiSide;
  }

  if (e.shootCd <= 0 && t.d <= s.range) {
    e.shootCd = s.cd;
    ctx.fire(e, t.nx, t.nz, s);
  }
}

/**
 * 突進。
 * 溜め（動きが止まる）→ 突進（直線・高速）→ 硬直。
 * ★溜めの間はっきり止まることが重要。予備動作が無い突進はただの理不尽になる。
 */
function charger(e, player, dt) {
  const c = e.arch.charge;
  const t = toPlayer(e, player);

  if (e.aiState === 1) {                       // 溜め中：止まる
    stop(e);
    if (e.aiT <= 0) {
      e.aiState = 2;
      e.aiT = c.dash;
      e.dashX = t.nx; e.dashZ = t.nz;          // 方向はここで固定。追尾させない
    }
    return;
  }
  if (e.aiState === 2) {                       // 突進中：固定方向へ高速移動
    e.vx = e.dashX * e.speed * c.speedMul;
    e.vz = e.dashZ * e.speed * c.speedMul;
    if (e.aiT <= 0) { e.aiState = 0; e.aiCd = c.cd; }
    return;
  }

  // 通常：射程に入ったら溜めに入る
  if (e.aiCd <= 0 && t.d < c.range && t.d > 2.2) {
    e.aiState = 1;
    e.aiT = c.windup;
    stop(e);
    return;
  }
  e.vx = t.nx * e.speed;
  e.vz = t.nz * e.speed;
}

// ─────────── ボス ───────────

/** 現在のフェーズを更新し、そのフェーズの倍率を返す。 */
const _noPhase = { speedMul: 1, cdMul: 1 };
function updatePhase(e) {
  const phases = e.arch.phases;
  if (!phases) return _noPhase;
  const pct = e.maxHp > 0 ? e.hp / e.maxHp : 0;

  let idx = 0;
  for (let i = 0; i < phases.length; i++) if (pct <= phases[i].hpPct) idx = i;
  e.phase = idx;
  return phases[idx];
}

/**
 * ゴアホーン：突進と地面叩きつけ。
 * 半分を切ると速く・短い間隔で仕掛けてくる。
 */
function boss_gorehorn(e, player, dt, ctx) {
  const ph = updatePhase(e);
  const c = e.arch.charge;
  const sl = e.arch.slam;
  const t = toPlayer(e, player);

  if (e.aiState === 1) {                       // 突進の溜め
    stop(e);
    if (e.aiT <= 0) { e.aiState = 2; e.aiT = c.dash; e.dashX = t.nx; e.dashZ = t.nz; }
    return;
  }
  if (e.aiState === 2) {                       // 突進
    e.vx = e.dashX * e.speed * c.speedMul * ph.speedMul;
    e.vz = e.dashZ * e.speed * c.speedMul * ph.speedMul;
    if (e.aiT <= 0) { e.aiState = 0; e.aiCd = c.cd * ph.cdMul; }
    return;
  }
  if (e.aiState === 3) {                       // 叩きつけの溜め
    stop(e);
    if (e.aiT <= 0) {
      ctx.slam(e, sl.radius, sl.dmg);
      e.aiState = 0;
      e.aiCd = sl.cd * ph.cdMul;
    }
    return;
  }

  if (e.aiCd <= 0) {
    // 近ければ叩きつけ、遠ければ突進。距離で技を選ぶ
    if (t.d < sl.radius * 0.8) { e.aiState = 3; e.aiT = sl.windup; stop(e); return; }
    if (t.d < c.range) { e.aiState = 1; e.aiT = c.windup; stop(e); return; }
  }
  e.vx = t.nx * e.speed * ph.speedMul;
  e.vz = t.nz * e.speed * ph.speedMul;
}

/**
 * ヴォイドモウ：距離を取って弾をばらまき、取り巻きを呼ぶ。
 * フェーズが進むほど手数が増える。
 */
function boss_voidmaw(e, player, dt, ctx) {
  const ph = updatePhase(e);
  const s = e.arch.shoot;
  const sm = e.arch.summon;
  const t = toPlayer(e, player);

  if (t.d < s.keep * 0.8) {
    e.vx = -t.nx * e.speed * ph.speedMul;
    e.vz = -t.nz * e.speed * ph.speedMul;
  } else if (t.d > s.keep * 1.4) {
    e.vx = t.nx * e.speed * ph.speedMul;
    e.vz = t.nz * e.speed * ph.speedMul;
  } else {
    e.vx = -t.nz * e.speed * 0.7 * e.aiSide * ph.speedMul;
    e.vz = t.nx * e.speed * 0.7 * e.aiSide * ph.speedMul;
  }

  if (e.shootCd <= 0 && t.d <= s.range) {
    e.shootCd = s.cd * ph.cdMul;
    // 扇状にばらまく。避ける場所を残すため隙間は空ける
    const n = s.spread || 1;
    const spread = 0.5;
    const base = Math.atan2(t.nx, t.nz);
    for (let i = 0; i < n; i++) {
      const a = base + (n > 1 ? (i / (n - 1) - 0.5) * spread : 0);
      ctx.fire(e, Math.sin(a), Math.cos(a), s);
    }
  }

  if (sm && e.summonCd <= 0) {
    e.summonCd = sm.cd * ph.cdMul;
    ctx.summon(e, sm.id, sm.count);
  }
}

/**
 * 雷龍：回り込みながら雷を吐き、隙を見て突っ込み、近ければ落雷。
 *
 * ★ゴアホーン（詰めて殴る）とヴォイドモウ（下がって撒く）の中間に置く。
 *   同じ土俵に3体並べると、後から出た方が「同じ動きの数値違い」に見える。
 */
function boss_drake(e, player, dt, ctx) {
  const ph = updatePhase(e);
  const c = e.arch.charge;
  const s = e.arch.shoot;
  const sl = e.arch.slam;
  const t = toPlayer(e, player);

  if (e.aiState === 1) {                       // 突進の溜め
    stop(e);
    if (e.aiT <= 0) { e.aiState = 2; e.aiT = c.dash; e.dashX = t.nx; e.dashZ = t.nz; }
    return;
  }
  if (e.aiState === 2) {                       // 突進
    e.vx = e.dashX * e.speed * c.speedMul * ph.speedMul;
    e.vz = e.dashZ * e.speed * c.speedMul * ph.speedMul;
    if (e.aiT <= 0) { e.aiState = 0; e.aiCd = c.cd * ph.cdMul; }
    return;
  }
  if (e.aiState === 3) {                       // 落雷の溜め
    stop(e);
    if (e.aiT <= 0) { ctx.slam(e, sl.radius, sl.dmg); e.aiState = 0; e.aiCd = sl.cd * ph.cdMul; }
    return;
  }

  // 技の選択。近い＝落雷／中距離＝突進
  if (e.aiCd <= 0) {
    if (t.d < sl.radius * 0.7) { e.aiState = 3; e.aiT = sl.windup; stop(e); return; }
    if (t.d < c.range) { e.aiState = 1; e.aiT = c.windup; stop(e); return; }
  }

  // 平常時は間合いを保ちながら横へ回る
  if (t.d < s.keep * 0.85) {
    e.vx = -t.nx * e.speed * 0.8 * ph.speedMul;
    e.vz = -t.nz * e.speed * 0.8 * ph.speedMul;
  } else {
    e.vx = (t.nx * 0.35 - t.nz * e.aiSide) * e.speed * ph.speedMul;
    e.vz = (t.nz * 0.35 + t.nx * e.aiSide) * e.speed * ph.speedMul;
  }

  if (e.shootCd <= 0 && t.d <= s.range) {
    e.shootCd = s.cd * ph.cdMul;
    const n = s.spread || 1;
    const base = Math.atan2(t.nx, t.nz);
    for (let i = 0; i < n; i++) {
      const a = base + (n > 1 ? (i / (n - 1) - 0.5) * 0.42 : 0);
      ctx.fire(e, Math.sin(a), Math.cos(a), s);
    }
  }
}

export const AI = { chase, strafe, shooter, charger, boss_gorehorn, boss_drake, boss_voidmaw };
