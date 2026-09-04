# DOPA ARENA — フェーズ0 技術設計書

> 3DアクションRPG（アリーナ型ハクスラ）。3つの軸＝**3D描画 / レベル上げ / ガチャ**。
> 本書はフェーズ0の成果物。**承認後にフェーズ1（動く3D）から実装に入る。**

---

## 0. 技術選定と「妥協点」の明示

| 項目 | 選定 | 理由・妥協点 |
|---|---|---|
| 3D描画 | **three.js r160.1（ローカル同梱）** | CDN不使用。`vendor/three/` に同梱済み。外部通信ゼロ。 |
| 読み込み形式 | **`three.module.min.js`（ESM・670KB・自己完結）** | 依存ファイル1つ。importmap不要（相対パスimportで解決）。 |
| ゲームロジック | **Vanilla JS（ES Modules）** | ビルド不要。トランスパイルなし。依存はthree.jsのみ。 |
| モデル | **プリミティブ合成（Box/Sphere/Capsule/Cone）** | GLTFローダー不使用。パース時間ゼロ、実機で確実に軽い。 |
| 物理 | **自作（XZ平面の円判定＋空間ハッシュ）** | 物理エンジン不使用。ハクスラに剛体は不要。 |
| 音 | **Web Audio API で合成** | 音源ファイル同梱ゼロ。容量ゼロ、遅延ゼロ。 |
| 配信 | **PWA（manifest + Service Worker）** | three.js含む全アセットをプリキャッシュ。完全オフライン動作。 |

### なぜ r160.1 なのか（重要な判断）

現行の three.js（r161以降）は **UMD `three.min.js` を廃止**し、ESM専用になっている。
さらに r170以降は `three.module.min.js` が `three.core.min.js` を分割importする2ファイル構成。

**r160.1 は「`three.min.js`（UMD）と自己完結ESMの両方を出荷する最後のバージョン」。**

- 依頼文の「`three.min.js` をローカルに同梱」を字義通り満たせる唯一の選択肢
- ESM側も**1ファイル自己完結**なので、同梱物が最小（670KB×1）
- 本作が使う機能（`InstancedMesh` / `WebGLRenderer` / 基本ジオメトリ / シャドウ）は
  すべて r160 に揃っており、新版に上げる実利がない

> ⚠️ **確認事項**：最新版（r185）を使いたい場合は同梱が2ファイル（module + core, 計720KB）になる。
> どちらでも実装可能。指定がなければ **r160.1 で進める**。

### ⚠️ 起動方法についての注意（妥協点）

ES Modules と Service Worker は `file://` から動かない（ブラウザ仕様）。
そのため**ローカルHTTPサーバ経由での起動が必須**：

```bash
cd 3DDOPA && python3 -m http.server 8080   # → http://localhost:8080
```

PWA化する時点でどのみちHTTPS/localhostが必要なため、これは実質的な制約ではない。
（`file://` でも動かしたい場合は、同梱済みの UMD `three.min.js` + 非module構成に切替可能。）

---

## 1. ディレクトリ構成 / モジュール分割

**1ファイル肥大化を構造で禁止する。** 1ファイル ≒ 200〜400行を上限の目安とする。

```
3DDOPA/
├── index.html                  # 唯一のHTML。UIレイヤ（DOM）とcanvasのみ
├── manifest.webmanifest
├── sw.js                       # Service Worker（プリキャッシュ）
├── vendor/three/
│   ├── three.module.min.js     # ✅ 同梱済み
│   ├── three.min.js            # UMDフォールバック用（同梱済み）
│   └── LICENSE                 # MIT（three.js authors）
├── src/
│   ├── main.js                 # 起動・DOM配線のみ。ロジックを書かない
│   │
│   ├── core/                   # ゲーム非依存の基盤
│   │   ├── Game.js             # 状態機械（BOOT→TITLE→BASE→RUN→RESULT）
│   │   ├── Loop.js             # 固定ステップ更新 + rAF描画
│   │   ├── Events.js           # 軽量pub/sub（システム間の疎結合）
│   │   ├── RNG.js              # mulberry32。ガチャ/湧きはここ経由に統一
│   │   └── Pool.js             # 汎用オブジェクトプール
│   │
│   ├── scene/                  # three.js に触れてよい唯一の層
│   │   ├── SceneManager.js     # renderer / scene / camera / light / fog
│   │   ├── CameraRig.js        # 追従・先読み・シェイク
│   │   ├── Arena.js            # 地面・壁・装飾
│   │   ├── InstanceLayer.js    # InstancedMesh 管理（湧き物の描画実体）
│   │   ├── Quality.js          # 適応品質（フレーム時間で自動段階変更）
│   │   └── vfx/
│   │       ├── HitSparks.js  ├── DamageNumbers.js  └── Trails.js
│   │
│   ├── entities/               # 論理エンティティ（three.jsを直接持たない）
│   │   ├── Entity.js  ├── Player.js  ├── Enemy.js
│   │   ├── Projectile.js  └── Pickup.js
│   │
│   ├── combat/
│   │   ├── CombatSystem.js     # ダメージ算出・クリティカル・属性・状態異常
│   │   ├── Collision.js        # 一様空間ハッシュグリッド
│   │   ├── SpawnDirector.js    # ウェーブ・難度曲線・ボス出現
│   │   └── AutoAim.js
│   │
│   ├── progression/
│   │   ├── LevelSystem.js      # ラン内EXP/レベル/ステータス成長
│   │   ├── SkillSystem.js      # スキル習得・強化・発動
│   │   └── MetaSystem.js       # 永続アカウントLv・拠点強化・アンロック
│   │
│   ├── gacha/
│   │   ├── GachaSystem.js      # 抽選ロジック・天井・ダブり変換
│   │   ├── Inventory.js        # 所持武器・装備・限界突破
│   │   └── GachaDirector.js    # 予告→リーチ→排出 の演出ステートマシン
│   │
│   ├── data/                   # ★ここを編集するだけで中身が増える
│   │   ├── weapons.js  ├── enemies.js  ├── skills.js
│   │   ├── gacha.js            # ★排出確率の唯一の定義場所
│   │   ├── stages.js  └── balance.js
│   │
│   ├── save/
│   │   ├── SaveManager.js      # localStorage・バージョン管理・マイグレーション
│   │   └── schema.js           # 初期セーブ形状 + migrations配列
│   │
│   ├── ui/
│   │   ├── Hud.js  ├── Screens.js  ├── GachaUI.js
│   │   ├── InventoryUI.js  ├── ResultUI.js
│   │   └── Input.js            # 仮想スティック / WASD+マウス を統一
│   │
│   └── audio/AudioSystem.js    # Web Audio 合成SE/BGM
└── docs/PHASE0_DESIGN.md
```

### 層の依存ルール（一方通行）

```
data/  ←  すべての層が参照してよい（純データ、依存ゼロ）
core/  ←  すべての層が参照してよい
   ↑
entities/ combat/ progression/ gacha/     … ゲームロジック層（three.js を import しない）
   ↑
scene/                                     … 描画層（ロジック層を参照して描画するだけ）
   ↑
ui/ audio/                                 … 提示層
   ↑
main.js / core/Game.js                     … 配線
```

**重要な制約：`entities/` `combat/` `progression/` `gacha/` は three.js を import しない。**
論理は座標と数値だけを持ち、描画は `scene/InstanceLayer.js` が毎フレーム同期する。
これによりロジックが単体テスト可能になり、描画方式（Mesh↔InstancedMesh）を後から差し替えられる。

---

## 2. ゲームループ（固定ステップ）

当たり判定と成長曲線を端末のfpsに依存させないため、**シミュレーションは固定60Hz**、
描画はrAFごとに1回。低速端末では描画fpsだけ落ちて挙動は変わらない。

```js
// core/Loop.js（擬似コード）
const STEP = 1 / 60;            // 論理更新の固定間隔
const MAX_SUB = 5;              // 死のスパイラル防止

function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden) return;                  // 非表示タブは完全停止

  let dt = Math.min((now - last) / 1000, 0.25); // 復帰時の巨大dtを切り捨て
  last = now;
  acc += dt;

  let sub = 0;
  while (acc >= STEP && sub++ < MAX_SUB) {
    game.update(STEP);                          // ← 論理はここだけ
    acc -= STEP;
  }
  if (sub >= MAX_SUB) acc = 0;                  // 追いつけないなら捨てる

  quality.sample(dt);                           // 適応品質の計測
  game.render(acc / STEP);                      // alpha で補間描画
}
```

### 1フレームの更新順序（依存順に固定）

```
1. input.poll()                  仮想スティック / キー / マウス → 統一InputState
2. player.update(dt)             移動・向き・クールダウン
3. autoAim.pick()                射程内の最寄り敵を選出
4. weapons.fire()                プロジェクタイル生成（プールから取得）
5. enemies.update(dt)            AI（4フレームに1回、index%4でずらす）+ 移動
6. projectiles.update(dt)        直進・寿命
7. collision.rebuild()           空間ハッシュ再構築
8. combat.resolve()              弾×敵 / 敵×自機 / 自機×ピックアップ
9. progression.tick()            EXP回収・レベルアップ判定・スキル発動
10. spawnDirector.tick(dt)       ウェーブ進行・ボス出現
11. vfx.update(dt)               パーティクル・ダメージ数字
12. camera.follow(dt)            追従＋シェイク
13. hud.sync()                   DOM更新（変化した値のみ）
```

---

## 3. シーン構成とエンティティ構造

### 3.1 シーングラフ（意図的に浅く保つ）

```
scene
├── hemiLight                       半球光（環境色）
├── dirLight  (+ shadow camera)     平行光（影1枚のみ）
├── arenaGroup
│   ├── groundMesh                  PlaneGeometry（1 draw call）
│   ├── wallsMesh                   InstancedMesh（外周ブロック）
│   └── decorMesh                   InstancedMesh（岩・柱などの装飾）
├── playerGroup                     個別Mesh（少数なので描き込む）
│   ├── bodyMesh / headMesh
│   └── weaponMesh                  レアリティに応じて色・発光が変わる
├── bossGroup                       個別Mesh（見せ場なので専用）
├── instanceLayer                   ★大量オブジェクトはすべてここ
│   ├── enemyIM[archetypeId]        アーキタイプごとに InstancedMesh 1つ
│   ├── projIM[visualId]            弾種ごとに InstancedMesh 1つ
│   ├── pickupIM                    EXPジェム
│   └── blobShadowIM                低品質時の簡易影（円板）
└── vfxLayer
    ├── sparkPoints                 Points（ヒット火花）
    └── numberSprites               Sprite プール（ダメージ数字・上限40）
```

**draw call 目標：常時 60〜100 以下**（敵200体でも敵の描画は数コール）。

### 3.2 エンティティ表現（構造体プール方式）

クラス継承ツリーやフルECSは採らない。**「plain object の固定長配列 + activeフラグ」**。
GCを起こさず、キャッシュ効率もよく、コードは素直に読める。

```js
// entities/Enemy.js（擬似コード）
export function createEnemyPool(cap = 300) {
  const list = new Array(cap);
  for (let i = 0; i < cap; i++) {
    list[i] = {                  // ★全フィールドを最初に確定（隠しクラス固定）
      active: false, id: 0, archetype: null,
      x: 0, z: 0, y: 0, vx: 0, vz: 0,       // XZ平面。yは演出用のみ
      px: 0, pz: 0,                          // 前フレーム座標（描画補間用）
      hp: 0, maxHp: 0, radius: 0.5,
      atk: 0, speed: 0, flash: 0, stun: 0,
      statuses: { burn: 0, freeze: 0, shock: 0 },
      instanceIndex: -1,
    };
  }
  return { list, cap, count: 0 };
}

// 取得/返却はO(1)。newもdeleteも発生しない
function spawn(pool, archetype, x, z) { /* activeなスロットを走査して再利用 */ }
function despawn(pool, e) { e.active = false; pool.count--; }
```

### 3.3 論理→描画の同期（毎フレーム）

```js
// scene/InstanceLayer.js（擬似コード）
const _m = new THREE.Matrix4();          // ★モジュールスコープで使い回し（毎フレームnew禁止）
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _p = new THREE.Vector3();
const _c = new THREE.Color();

function syncEnemies(pool, alpha) {
  for (const im of enemyIMs) im.__n = 0;

  for (let i = 0; i < pool.cap; i++) {
    const e = pool.list[i];
    if (!e.active) continue;

    const im = enemyIMs[e.archetype.visualIndex];
    const n = im.__n++;

    _p.set(lerp(e.px, e.x, alpha), e.y, lerp(e.pz, e.z, alpha));   // 補間描画
    _q.setFromAxisAngle(UP, e.facing);
    _s.setScalar(e.archetype.visual.scale);
    _m.compose(_p, _q, _s);
    im.setMatrixAt(n, _m);

    // 被弾フラッシュ / 状態異常の色はインスタンスカラーで表現（マテリアル増殖を防ぐ）
    im.setColorAt(n, _c.copy(e.archetype.baseColor).lerp(WHITE, e.flash));
  }

  for (const im of enemyIMs) {
    im.count = im.__n;                    // ★描画数を絞る = 上限まで描かない
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }
}
```

### 3.4 カメラ（背後〜見下ろし追従）

```js
// scene/CameraRig.js（擬似コード）
const OFFSET = new THREE.Vector3(0, 15, 11);   // 見下ろし寄りのTPS
const LEAD   = 2.2;                            // 進行方向への先読み距離

function follow(cam, player, dt) {
  // フレームレート非依存の指数減衰スムージング（lerp(a,b,0.1)は可変dtで破綻する）
  const k = 1 - Math.exp(-6 * dt);

  desired.set(player.x + player.dirX * LEAD, 0, player.z + player.dirZ * LEAD).add(OFFSET);
  cam.position.lerp(desired, k);

  cam.position.x += shake.x;                   // シェイクは加算、二乗減衰で戻す
  cam.position.y += shake.y;
  shake.multiplyScalar(Math.exp(-9 * dt));

  cam.lookAt(player.x, 1.0, player.z);
}
```

---

## 4. データスキーマ（★データ追加だけで増える構造）

### 4.1 武器 `data/weapons.js`

```js
export const WEAPONS = [
  {
    id: 'wp_iron_sword',
    name: '鉄の剣',
    rarity: 'N',                 // N | R | SR | SSR
    type: 'sword',               // sword | bow | staff | gun | scythe | fist
    element: 'none',             // none | fire | ice | thunder | dark

    base:   { atk: 10, rate: 1.6, range: 2.6, crit: 0.05, critDmg: 0.5, knock: 0.3 },
    growth: { atk: 1.2 },        // 武器レベル+1あたりの上昇（Lv1..20）

    attack: {                    // 攻撃の形。ここが挙動の全て
      kind: 'melee_arc',         // melee_arc | projectile | orbit | beam | aoe
      arcDeg: 100,               // melee_arc用
      count: 1, pierce: 0,
      speed: 0, life: 0.18,
      radius: 0.5,
    },

    effects: [],                 // 例: [{ id:'burn', chance:0.25, power:0.3, dur:3 }]

    visual: {                    // プリミティブ生成の指示（GLTFではない）
      model: 'sword', color: 0xb9c3cc, emissive: 0x000000,
      trail: null, scale: 1.0,
    },
    flavor: 'どこにでもある剣。だが振れば人は死ぬ。',
  },

  // ── SSR例（見た目が派手・特殊効果つき） ──
  {
    id: 'wp_flare_blade', name: 'フレアブレード', rarity: 'SSR',
    type: 'sword', element: 'fire',
    base:   { atk: 42, rate: 1.9, range: 3.2, crit: 0.12, critDmg: 0.9, knock: 0.6 },
    growth: { atk: 4.4 },
    attack: { kind: 'melee_arc', arcDeg: 140, count: 1, pierce: 99, speed: 0, life: 0.2, radius: 0.7 },
    effects: [
      { id: 'burn',      chance: 0.35, power: 0.4, dur: 4 },
      { id: 'explode',   chance: 0.15, power: 1.2, radius: 3.0 },
    ],
    visual: { model: 'greatsword', color: 0xff5a2b, emissive: 0xff2200, trail: 'flame', scale: 1.25 },
    flavor: '柄を握れば、掌が焦げる音がする。',
  },
];
```

> **武器を1本追加する手順＝この配列に1オブジェクト足すだけ。**
> ガチャプール・インベントリ・図鑑・戦闘挙動は自動で追従する。

### 4.2 敵 `data/enemies.js`

```js
export const ENEMIES = [
  {
    id: 'en_slime', name: 'スライム', tier: 1,
    hp: 30, atk: 6, speed: 2.4, radius: 0.5,
    reward: { xp: 3, gems: 1 },
    ai: 'chase',                              // chase | strafe | charger | shooter | splitter | orbit
    element: 'none',
    resist: { fire: -0.25, ice: 0.2 },        // 正=耐性 / 負=弱点
    visual: { geom: 'sphere', color: 0x66dd88, scale: 1.0 },
    drops: [{ id: 'gem', p: 0.06 }],
  },
  {
    id: 'bs_gorehorn', name: 'ゴアホーン', tier: 3, boss: true,
    hp: 4200, atk: 34, speed: 3.0, radius: 2.2,
    reward: { xp: 300, gems: 60, ticket: 1 },
    ai: 'boss_gorehorn',                      // 専用AI（フェーズ移行つき）
    phases: [
      { hpPct: 1.00, patterns: ['charge', 'slam'] },
      { hpPct: 0.50, patterns: ['charge', 'slam', 'shockwave'], speedMul: 1.3 },
    ],
    visual: { geom: 'boss_gorehorn', color: 0x8b1a1a, scale: 1.0 },
  },
];
```

### 4.3 スキル `data/skills.js`

```js
export const SKILLS = [
  {
    id: 'sk_nova', name: 'ノヴァ', maxLv: 5, kind: 'active',
    icon: '💥',
    desc: lv => `周囲に ${20 + lv * 12} ダメージ（CD ${(6 - lv * 0.5).toFixed(1)}s）`,
    cooldown: lv => 6 - lv * 0.5,
    cast: (ctx, lv) => ctx.aoe(ctx.player.x, ctx.player.z, 4 + lv * 0.6, 20 + lv * 12),
  },
  {
    id: 'sk_vital', name: '生命増強', maxLv: 5, kind: 'passive',
    icon: '❤️',
    desc: lv => `最大HP +${lv * 12}%`,
    apply: (stats, lv) => { stats.maxHpPct += lv * 0.12; },
  },
];
```

### 4.4 ガチャ `data/gacha.js` ★確率はここ一箇所のみ

```js
export const GACHA = {
  cost:   { gems: 100, tickets: 1 },      // 1連あたり
  tenPull:{ gems: 1000, discount: 0 },

  // ── 基礎排出率（合計1.0。起動時にassertで検証する） ──
  baseRates: {
    N:   0.550,
    R:   0.320,
    SR:  0.105,
    SSR: 0.025,       // 2.5%
  },

  // ── 天井（射幸を煽らない範囲で「必ず報われる」設計） ──
  pity: {
    softStart:   70,     // 70連目からSSR率が上昇
    softAdd:     0.025,  // 1連ごとに +2.5pt（→ 約99連で実質確定）
    hard:        100,    // 100連で確定。カウンタはSSR取得でリセット
    tenPullFloor:'SR',   // 10連には必ずSR以上が1つ入る
  },

  // ── ピックアップ（すり抜け救済つき） ──
  banners: [
    {
      id: 'standard', name: 'スタンダード',
      featured: ['wp_flare_blade'],
      featuredChance: 0.5,        // SSR確定時、50%でピックアップ
      guaranteeAfterLoss: true,   // すり抜けたら次のSSRは確定でピックアップ
      pool: { include: 'all' },   // 除外指定も可: { exclude: ['wp_x'] }
    },
  ],

  // ── ダブり救済 ──
  dupe: {
    shards: 1,                                  // 同一武器の被り → かけら+1
    dust:   { N: 5, R: 15, SR: 60, SSR: 300 },  // 加えて汎用強化粉
  },
  limitBreak: {
    costs:     [2, 3, 5, 8, 13],   // LB1..LB5 に必要なかけら
    atkPerLB:  0.08,               // 1段階ごとに攻撃力 +8%
    lb5Bonus:  'effect_upgrade',   // LB5で特殊効果が1段階強化
  },
};

// 起動時に必ず実行：確率テーブルの自己検証
export function validateGacha() {
  const sum = Object.values(GACHA.baseRates).reduce((a, b) => a + b, 0);
  console.assert(Math.abs(sum - 1) < 1e-9, `排出率の合計が1.0ではない: ${sum}`);
}
```

**期待値（設計意図）**
- SSR素引き 2.5% → 平均 40連で1本
- 天井100連 → 最悪でも100連でSSR確定
- 1ステージクリア ≒ 60〜120ジェム想定 → **10ステージ程度で1連**引ける密度
- **課金要素は一切実装しない。** 通貨はプレイ報酬のみ。

### 4.5 ステージ `data/stages.js`

```js
export const STAGES = [
  {
    id: 1, name: '崩れた闘技場',
    duration: 180,                                    // 秒。生存でクリア
    arena: { size: 60, theme: 'ruins' },
    waves: [
      { at: 0,   spawn: ['en_slime'],             rate: 1.2, cap: 40 },
      { at: 45,  spawn: ['en_slime','en_bat'],    rate: 2.0, cap: 70 },
      { at: 120, spawn: ['en_bat','en_brute'],    rate: 2.8, cap: 100 },
    ],
    boss: { at: 150, id: 'bs_gorehorn' },
    scaling: { hp: 1.0, atk: 1.0 },                   // ステージ倍率
    reward: { gems: 80, firstClear: { gems: 200, tickets: 1 } },
    unlock: { stage: 0 },                             // 前提ステージ
  },
];
```

### 4.6 バランス定数 `data/balance.js`

```js
export const BALANCE = {
  // ラン内レベル（EXP曲線）
  runLevel: {
    xpFor: lv => Math.floor(8 * Math.pow(lv, 1.45) + 4 * lv),
    perLevel: { maxHp: 8, atk: 2.0, speed: 0.04, crit: 0.004 },
    skillPickEvery: 1,      // 毎レベルで3択スキル提示
  },
  // 永続アカウントレベル（ラン跨ぎ）
  accountLevel: {
    xpFor: lv => Math.floor(120 * Math.pow(lv, 1.6)),
    perLevel: { maxHp: 5, atk: 1.2 },
  },
  // ダメージ式の定数
  combat: {
    elementChart: { fire:{ice:1.25, thunder:0.85}, ice:{thunder:1.25, fire:0.85}, thunder:{fire:1.25, ice:0.85} },
    minDamage: 1,
    iframeAfterHit: 0.5,    // 被弾後の無敵秒数
  },
  // ステージ進行に伴う敵スケーリング
  difficulty: {
    hpMul:  s => 1 + 0.28 * (s - 1) + 0.02 * (s - 1) ** 2,   // 二次で伸ばす
    atkMul: s => 1 + 0.20 * (s - 1),
  },
};
```

---

## 5. ダメージ計算式

```js
// combat/CombatSystem.js（擬似コード）
function computeDamage(attacker, target, source) {
  const w = attacker.weapon;

  //  1. 基礎攻撃力（武器 + 武器Lv成長 + 限界突破）
  let atk = (w.base.atk + w.growth.atk * (w.level - 1)) * (1 + LB_ATK * w.limitBreak);

  //  2. キャラ倍率（ラン内レベル + 永続メタ強化 + スキルパッシブ）
  atk *= (1 + attacker.stats.atkPct);

  //  3. スキル/攻撃固有倍率
  atk *= source.mult;

  //  4. 属性相性（弱点1.25 / 耐性0.8。data/balance.jsのテーブル駆動）
  atk *= elementMultiplier(w.element, target);

  //  5. クリティカル（RNG経由 = 再現可能）
  const isCrit = rng.next() < clamp(attacker.stats.crit, 0, 0.85);
  if (isCrit) atk *= 1 + attacker.stats.critDmg;

  //  6. 防御減算（率で持つ。加算防御は後半インフレするので採らない）
  atk *= 1 - clamp(target.dr, -1, 0.8);

  return { amount: Math.max(BALANCE.combat.minDamage, Math.floor(atk)), isCrit };
}
```

---

## 6. 当たり判定（一様空間ハッシュグリッド）

アリーナは平面なので **Y軸を判定から外し、XZの円 vs 円**だけにする。
敵200体 × 弾400発を総当たりすると 80,000回/フレームで破綻するため、グリッドで近傍だけ見る。

```js
// combat/Collision.js（擬似コード）
const CELL = 4;                              // ≒ 最大半径の2〜3倍
const buckets = new Map();                   // key(int) -> number[]（インデックス配列を使い回す）

const key = (x, z) => ((x / CELL) | 0) * 73856093 ^ ((z / CELL) | 0) * 19349663;

function rebuild(enemies) {
  for (const arr of buckets.values()) arr.length = 0;   // ★配列は捨てずに長さ0（GC回避）
  for (let i = 0; i < enemies.cap; i++) {
    const e = enemies.list[i];
    if (!e.active) continue;
    getBucket(key(e.x, e.z)).push(i);
  }
}

function resolveProjectiles(projs, enemies) {
  for (const p of projs.activeIter()) {
    // 弾の半径が及ぶセルだけ走査（通常 1〜4セル）
    for (const idx of queryCells(p.x, p.z, p.radius)) {
      const e = enemies.list[idx];
      const dx = e.x - p.x, dz = e.z - p.z;
      const r  = e.radius + p.radius;
      if (dx * dx + dz * dz > r * r) continue;          // ★sqrtを使わない
      combat.hit(p, e);
      if (--p.pierce < 0) { projs.despawn(p); break; }
    }
  }
}
```

- 自機 vs 敵：自機周辺セルのみクエリ（1フレーム数件）
- 敵同士の重なり回避：近傍最大4体だけ押し戻し、**2フレームに1回**実行

---

## 7. セーブ構造（localStorage・バージョン管理つき）

### 7.1 スキーマ

```js
// save/schema.js
export const SAVE_KEY = 'dopa_arena_save';
export const SAVE_VERSION = 1;

export const INITIAL_SAVE = {
  v: SAVE_VERSION,
  profile:   { createdAt: 0, playTimeMs: 0, lastPlayed: 0 },

  meta: {                                    // 永続進行（ラン跨ぎ）
    accountLv: 1, accountXp: 0,
    upgrades:  { hp: 0, atk: 0, speed: 0, gachaLuck: 0, startLv: 0 },
    unlocks:   [],                           // ['stage_2', 'wtype_bow', ...]
  },

  wallet:    { gems: 0, tickets: 3, dust: 0 },

  inventory: {
    weapons: {                               // id -> 所持状態
      // 'wp_iron_sword': { lv: 1, lb: 0, shards: 0, isNew: true, obtainedAt: 0 }
    },
    equipped: 'wp_iron_sword',
  },

  gacha: {
    totalPulls: 0,
    sinceSSR:   0,                           // 天井カウンタ
    lostFiftyFifty: false,                   // すり抜けフラグ
    history: [],                             // 直近50件 { id, rarity, at }
  },

  stats: {
    bestStage: 0, bestTimeMs: 0,
    totalKills: 0, totalBosses: 0, totalRuns: 0,
    ssrCount: 0,
  },

  achievements: {},                          // id -> true
  settings: { sfx: 0.8, bgm: 0.5, quality: 'auto', stickSide: 'left', autoFire: true },
};

// マイグレーション：v1→v2 のような追加はここに関数を足すだけ
export const MIGRATIONS = {
  // 2: (s) => { s.meta.upgrades.crit = 0; s.v = 2; return s; },
};
```

### 7.2 保存方針

```js
// save/SaveManager.js（擬似コード）
function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return structuredClone(INITIAL_SAVE);

    let s = JSON.parse(raw);
    while (s.v < SAVE_VERSION) s = MIGRATIONS[s.v + 1](s);   // 段階的に前進
    return deepMerge(structuredClone(INITIAL_SAVE), s);      // 新規フィールドを補完
  } catch (err) {
    console.warn('セーブ破損。バックアップを試行', err);
    return loadBackup() ?? structuredClone(INITIAL_SAVE);
  }
}

// 書き込みは遅延集約（毎フレーム書くとJSON化でフレーム落ちする）
let dirty = false, timer = 0;
function markDirty() { dirty = true; clearTimeout(timer); timer = setTimeout(flush, 800); }

function flush() {
  if (!dirty) return;
  try {
    localStorage.setItem(SAVE_KEY + '_backup', localStorage.getItem(SAVE_KEY) ?? '');
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    dirty = false;
  } catch (e) { /* 容量超過・プライベートモード → 通知だけしてゲームは続行 */ }
}

// 確実に保存されるタイミング
addEventListener('pagehide',        flush);
addEventListener('visibilitychange', () => document.hidden && flush());
// ★ガチャ結果・レベルアップ・ステージクリアは markDirty() ではなく即 flush()
```

**原則：ガチャの排出結果は「演出を再生する前」に確定・保存する。**
演出中にタブを閉じても引いた武器は消えない。

---

## 8. パフォーマンス戦略（60fps死守）

### 8.1 予算

| 指標 | 目標 |
|---|---|
| フレーム時間 | 16.6ms 以下（JS 4ms / 描画 8ms） |
| draw call | 100以下 |
| 三角形数 | 60,000以下 |
| 同時敵数 | 高品質200 / 中120 / 低70 |
| フレーム内アロケーション | **0**（GCスパイクを起こさない） |

### 8.2 手段

1. **InstancedMesh**：敵・弾・ピックアップはアーキタイプごとに1コール。
   被弾フラッシュは `instanceColor` で表現し、マテリアルを増やさない。
2. **完全プーリング**：起動時に敵300/弾400/ピックアップ300/VFX64を確保。
   ゲーム中の `new` を禁止する（`Vector3` もモジュールスコープで使い回す）。
3. **ジオメトリ/マテリアル共有**：`BoxGeometry` は1個をアーキタイプ間で共有し、
   差はスケールと色で出す。
4. **ライトは2つだけ**：`DirectionalLight`（影1枚）+ `HemisphereLight`。
   点光源は使わない（フォワードレンダリングでシェーダが分岐して重くなる）。
5. **影の最適化**：シャドウマップ1024、`shadow.camera` を自機周辺 ±25 に密着させる。
   低品質時は影オフ＋**円板インスタンスの簡易影**に置換。
6. **マテリアル選択**：敵・弾は `MeshLambertMaterial`（安い）。
   自機・ボス・武器のみ `MeshStandardMaterial`。環境マップは使わない。
7. **ポストプロセス不使用**：`EffectComposer` の全画面パスはモバイルで致命的。
   ブルームは `emissive` + 加算合成スプライトで偽装する。
8. **霧と描画距離**：`FogExp2` で遠景を溶かし、`camera.far = 90`。
   自機から60以上離れた敵は前方へリサイクル。
9. **`frustumCulled = false`**：インスタンス群はアリーナ全体が視界内なので、
   バウンディング再計算コストを払わない。
10. **DPRクランプ**：`min(devicePixelRatio, 2)`。低品質時は 1.25 に落とす。
11. **AA条件付き**：`antialias` は DPR<2 かつ高品質のときのみ有効。
12. **更新の間引き**：敵AIの目標再評価は4フレームに1回（`index % 4 === frame % 4` で分散）。
    分離処理は2フレームに1回。
13. **DOM更新の最小化**：HUDは値が変化したときだけ `textContent` を書く。
    毎フレームの `innerHTML` は禁止。
14. **非表示タブで完全停止**：`document.hidden` で rAF 本体を早期return。

### 8.3 適応品質（自動段階変更）

```js
// scene/Quality.js（擬似コード）
const TIERS = {
  high: { dpr: 2.00, shadows: true,  shadowMap: 1024, enemyCap: 200, particles: 1.0, aa: true  },
  mid:  { dpr: 1.50, shadows: true,  shadowMap: 512,  enemyCap: 120, particles: 0.6, aa: false },
  low:  { dpr: 1.25, shadows: false, shadowMap: 0,    enemyCap: 70,  particles: 0.3, aa: false },
};

// 直近90フレームの中央値で判定（単発スパイクで揺れないように）
function sample(dt) {
  hist[i++ % 90] = dt;
  if (i % 90) return;

  const med = median(hist);
  if (med > 0.0215 && tier > LOW)  setTier(tier - 1);        // 46fps割れ → 落とす
  if (med < 0.0140 && tier < HIGH && stableFor(8)) setTier(tier + 1);  // 71fps超が続く → 戻す
}
```

初回起動時は端末情報（`devicePixelRatio` / `hardwareConcurrency` / UAのモバイル判定）で
初期ティアを推定し、以降は実測で自動補正する。設定画面から手動固定も可能にする。

---

## 9. 入力（スマホ / PC統一）

```js
// ui/Input.js — 全入力を1つの構造体に正規化する
export const input = {
  moveX: 0, moveZ: 0,      // -1..1（正規化済み）
  aimX:  0, aimZ:  1,      // 単位ベクトル
  firing: false,
  skills: [false, false, false],
};
```

- **スマホ**：画面左半分のどこを触ってもそこに仮想スティックが出現（固定位置にしない）。
  攻撃は**オートエイム＋オートファイア**が既定（親指1本で遊べる）。右下にスキルボタン3つ。
  縦持ち・横持ち両対応（`resize` でHUDレイアウトを組み替え）。
- **PC**：WASD移動、マウス位置を地面平面にレイキャストして照準、クリック/ホールドで攻撃。
  オートファイアはトグル可。
- **オートエイム**：射程内の敵を `距離 + 進行方向とのなす角ペナルティ` で採点し最良を選ぶ。
  ターゲットは 0.3秒スティックさせ、毎フレーム乗り換えてカメラが酔うのを防ぐ。

---

## 10. ガチャ抽選ロジック（擬似コード）

```js
// gacha/GachaSystem.js
function rollOne(save, banner) {
  const g = GACHA;
  save.gacha.totalPulls++;
  save.gacha.sinceSSR++;

  // 1) 天井を織り込んだSSR率を算出
  let ssr = g.baseRates.SSR;
  if (save.gacha.sinceSSR >= g.pity.softStart) {
    ssr += (save.gacha.sinceSSR - g.pity.softStart + 1) * g.pity.softAdd;
  }
  if (save.gacha.sinceSSR >= g.pity.hard) ssr = 1.0;
  ssr = Math.min(ssr, 1.0);

  // 2) レアリティ決定（SSRの増分は下位レアから均等に差し引く）
  const rarity = pickRarity(ssr, g.baseRates, rng.next());

  // 3) SSRならピックアップ判定（すり抜け救済）
  let weapon;
  if (rarity === 'SSR') {
    save.gacha.sinceSSR = 0;
    const forced = banner.guaranteeAfterLoss && save.gacha.lostFiftyFifty;
    if (forced || rng.next() < banner.featuredChance) {
      weapon = pickFrom(banner.featured);
      save.gacha.lostFiftyFifty = false;
    } else {
      weapon = pickFromPool(rarity, banner);
      save.gacha.lostFiftyFifty = true;
    }
    save.stats.ssrCount++;
  } else {
    weapon = pickFromPool(rarity, banner);
  }

  // 4) 所持済みならダブり救済へ変換
  const owned = save.inventory.weapons[weapon.id];
  const result = owned
    ? { weapon, rarity, dupe: true,  shards: GACHA.dupe.shards, dust: GACHA.dupe.dust[rarity] }
    : { weapon, rarity, dupe: false };

  applyResult(save, result);
  saveManager.flush();      // ★演出の前に確定保存する
  return result;
}

function rollTen(save, banner) {
  const out = [];
  for (let i = 0; i < 10; i++) out.push(rollOne(save, banner));

  // 10連保証：SR以上が無ければ最後の1つを引き直してSR以上にする
  if (!out.some(r => rank(r.rarity) >= rank(GACHA.pity.tenPullFloor))) {
    out[9] = rerollAtLeast(save, banner, GACHA.pity.tenPullFloor);
  }
  return out;
}
```

### 演出ステートマシン（フェーズ7で本実装）

```
IDLE → 予告(PORTENT)   … 光の色でレア期待度を示唆（白→青→金→虹）
     → リーチ(REACH)    … カメラ寄り・スロー・地響き。ここで期待を溜める
     → 排出(REVEAL)     … 武器が実体化。SSRは全画面フラッシュ＋固有カットイン
     → 結果(SUMMARY)    … 10連はまとめて一覧表示
```

**「常時MAXにしない」ための確率的演出**：
SR以上のとき一定確率で意図的に「白予告→実はSSR」の逆転を混ぜ、
逆に金予告でSRに留まる場合も作る。予告の色は結果と**弱い相関**に留める。

---

## 11. PWA / Service Worker

```js
// sw.js（擬似コード）
const CACHE = 'dopa-arena-v1';               // ★リリースごとに更新 → 古いキャッシュを一掃
const PRECACHE = [
  './', './index.html', './manifest.webmanifest',
  './vendor/three/three.module.min.js',      // ★これを含めることが完全オフラインの条件
  ...ALL_SRC_MODULES,                        // src/ 配下の .js を全列挙
  ...ICONS,
];

self.addEventListener('install',  e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE))));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
));
self.addEventListener('fetch',    e => e.respondWith(
  caches.match(e.request).then(r => r ?? fetch(e.request))   // cache-first
));
```

- 同一オリジンのみ扱う。**外部への fetch は一切発生しない。**
- `manifest.webmanifest`：`display: fullscreen`, `orientation: any`, `theme_color: #0a0a12`

---

## 12. フェーズ計画（各フェーズ末で必ず遊べる状態にする）

| Ph | 内容 | 完了条件（これが満たせなければ次に進まない） |
|---|---|---|
| **0** | 本設計書 + three.js同梱 | ✅ 設計承認・`vendor/three/` 配置済み |
| **1** | 動く3D | 地面・ライト・自機を描画。スティック/WASDで移動、カメラ追従。**60fps。** |
| **2** | 戦闘コア | 敵が湧き、攻撃が当たり、敵が死に、被弾で自機が死ぬ。敵100体で60fps。 |
| **3** | レベル上げ | EXP回収→レベルアップ→3択スキル。ステータス成長が体感できる。永続保存。 |
| **4** | ガチャ＆装備 | 引ける・貯まる・装備できる・戦闘に反映される。天井とダブり救済が動く。 |
| **5** | 敵種・ボス・進行 | 敵5種以上＋ボス2種。ステージ進行と難度曲線。「装備がないと勝てない」壁。 |
| **6** | メタ進行 | 拠点で永続強化・アンロック・実績。ラン跨ぎの成長。 |
| **7** | 演出・音・PWA | ガチャ/レベルアップ/ボス撃破の全画面演出、Web Audio、SW、リザルト共有。 |

**フェーズ1で作るもの（承認後の着手範囲）**
- `index.html` / `src/main.js` / `core/Loop.js` / `core/Game.js`
- `scene/SceneManager.js` / `scene/CameraRig.js` / `scene/Arena.js` / `scene/Quality.js`
- `entities/Player.js` / `ui/Input.js`
- 敵・戦闘・ガチャは**一切書かない**。

---

## 13. 確認したいこと（この2点だけ回答ください）

1. **three.jsのバージョン**：`r160.1`（UMD+自己完結ESMの両方が手に入る最後の版／同梱1ファイル）で進めてよいか。
   最新 `r185` を希望なら同梱2ファイル構成に変更する。
2. **ガチャ排出率**：`N 55% / R 32% / SR 10.5% / SSR 2.5%`、ソフト天井70連・**ハード天井100連**。
   もっと引きやすくする（SSR 3〜4%、天井80連）／渋くする、といった調整希望があれば。

指定がなければ上記のまま **フェーズ1（動く3D）** に着手する。
