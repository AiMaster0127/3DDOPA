# DOPA ARENA

three.js 製の 3DアクションRPG（アリーナ型ハクスラ）。
**3D描画 × レベル上げ × ガチャ** の3軸で「装備を引く → 強くなる → 上の敵に挑む」を回す収集・育成ゲーム。

> **現在の進捗：フェーズ1（動く3D）完了 / フェーズ2（戦闘コア）着手待ち**
> 設計の全文は **[docs/PHASE0_DESIGN.md](docs/PHASE0_DESIGN.md)** を参照。

---

## 特徴（完成時）

- **外部通信ゼロ**：three.js を含む全アセットをローカル同梱。CDN不使用。
- **完全オフライン**：PWA（manifest + Service Worker）でインストール後はネット不要。
- **課金要素なし**：ガチャ通貨はプレイ報酬のみ。排出確率はデータで公開・改変可能。
- **60fps 死守**：InstancedMesh + オブジェクトプールで、敵200体でもフレームを落とさない。
- **スマホ/PC 両対応**：仮想スティック＋オートエイム / WASD＋マウス。

---

## 実装済みの範囲（フェーズ1）

3Dアリーナに自機を置いて動かすところまで。**戦闘・敵・ガチャはまだ入っていない。**

- 円形アリーナ（地面グリッド・外周ブロック・散乱する装飾）
- 自機の移動（加速・減速・向きの追従・壁でのクランプ）
- カメラ追従（進行方向の先読み・注視点の遅延・シェイク用API）
- 仮想スティック（触れた位置に出現）／ WASD・矢印キー
- 適応品質（高／中／低の自動切替。低ティアでは実影を簡易影に置換）
- 縦持ち補正（垂直FOVを広げて水平視界の潰れを抑える）
- HUD（FPS／品質ティア／draw call）

### 検証結果

| 項目 | 実測 |
|---|---|
| draw call | 13〜17（予算100） |
| 三角形数 | 2,286〜4,068（予算60,000） |
| JSフレームコスト | 0.001 ms（予算4 ms） |
| 600フレームのヒープ増加 | **0.0 KB**（ループ内アロケーションなし） |
| 対応ビューポート | 1280x800 ／ 390x844（縦） ／ 844x390（横） |

---

## 起動方法

ES Modules と Service Worker はブラウザ仕様上 `file://` から動かないため、
**ローカルHTTPサーバ経由で開く必要がある**。

```bash
# いずれか
python3 -m http.server 8080
npx serve -l 8080
```

→ ブラウザで `http://localhost:8080` を開く。

### 開発ツール（ゲーム本体には含まれない）

ブラウザ実機での回帰確認用。**ゲームの配信物は three.js 以外に依存しない。**
`package.json` の devDependencies（Playwright）はこのツール専用。

```bash
npm install          # Playwright のみ
npm run serve        # 別ターミナルで起動しておく
npm run smoke        # 起動・移動・壁・draw call・HUD・コンソール汚染を3ビューポートで確認
npm run perf         # JSフレームコストとループ内アロケーションを計測
```

---

## ディレクトリ構成

```
src/
├── core/         ゲームループ・状態機械・RNG・オブジェクトプール
├── scene/        three.js に触れてよい唯一の層（描画・カメラ・品質制御）
├── entities/     論理エンティティ（three.js を import しない）
├── combat/       ダメージ算出・当たり判定・湧き制御
├── progression/  レベル・スキル・メタ進行
├── gacha/        抽選・インベントリ・演出制御
├── data/         ★武器/敵/スキル/ガチャ確率/ステージの定義（ここを編集して増やす）
├── save/         localStorage 永続化・バージョン管理
├── ui/           HUD・各画面・入力の正規化
└── audio/        Web Audio による音の合成
vendor/three/     three.js r185.1（MIT）を同梱（module + core の2ファイル）
```

**依存の向きは一方通行**：`data/` `core/` ← ロジック層 ← `scene/` ← `ui/`。
ロジック層（`entities/` `combat/` `progression/` `gacha/`）は three.js を import しない。

---

## 拡張手順（データを足すだけで増える）

### 武器を追加する

`src/data/weapons.js` の配列にオブジェクトを1つ追加するだけ。
ガチャプール・インベントリ・図鑑・戦闘挙動はすべて自動で追従する。

```js
{
  id: 'wp_frost_bow', name: 'フロストボウ', rarity: 'SR',
  type: 'bow', element: 'ice',
  base:   { atk: 24, rate: 2.4, range: 9.0, crit: 0.10, critDmg: 0.7, knock: 0.2 },
  growth: { atk: 2.6 },
  attack: { kind: 'projectile', count: 1, pierce: 1, speed: 22, life: 0.9, radius: 0.3 },
  effects: [{ id: 'freeze', chance: 0.2, power: 0.5, dur: 1.5 }],
  visual: { model: 'bow', color: 0x7fd4ff, emissive: 0x1a6aa0, trail: 'frost', scale: 1.0 },
  flavor: '射抜かれた獣は、走る姿勢のまま凍りついた。',
}
```

- `rarity` … `N` / `R` / `SR` / `SSR`
- `attack.kind` … `melee_arc` / `projectile` / `orbit` / `beam` / `aoe`
- `visual.model` … プリミティブ合成の型名。GLTFは読み込まない。

### 敵を追加する

`src/data/enemies.js` に追加し、`src/data/stages.js` のウェーブから `id` で参照する。

```js
{
  id: 'en_bat', name: 'ケイブバット', tier: 2,
  hp: 45, atk: 9, speed: 4.2, radius: 0.4,
  reward: { xp: 6, gems: 2 },
  ai: 'strafe',                       // chase | strafe | charger | shooter | splitter | orbit
  element: 'none', resist: { thunder: -0.3 },   // 正=耐性 / 負=弱点
  visual: { geom: 'box', color: 0x6a4fa8, scale: 0.8 },
}
```

ボスは `boss: true` と `phases` を足す。新しい `ai` を使う場合のみ
`src/combat/` に挙動関数を1つ追加する。

### ガチャ確率を変更する

**`src/data/gacha.js` の1箇所のみ**。他のどこにも確率は書かない。

```js
baseRates: { N: 0.530, R: 0.320, SR: 0.110, SSR: 0.040 },
pity: { softStart: 50, softAdd: 0.050, hard: 70, tenPullFloor: 'SR' },
```

起動時に `validateGacha()` が合計値 1.0 を検証する（ズレていればコンソールに警告）。

### スキル・ステージを追加する

`src/data/skills.js` / `src/data/stages.js` に同様に追加する。

---

## セーブデータ構造

- **保存先**：`localStorage`
- **キー**：`dopa_arena_save`（バックアップ：`dopa_arena_save_backup`）
- **バージョン管理**：`v` フィールド。`MIGRATIONS` を段階適用して前進させる。
- **破損時**：バックアップ→初期値の順にフォールバックし、ゲームは続行する。

```jsonc
{
  "v": 1,
  "profile":   { "createdAt": 0, "playTimeMs": 0, "lastPlayed": 0 },
  "meta":      { "accountLv": 1, "accountXp": 0,
                 "upgrades": { "hp": 0, "atk": 0, "speed": 0, "gachaLuck": 0, "startLv": 0 },
                 "unlocks": [] },
  "wallet":    { "gems": 0, "tickets": 3, "dust": 0 },
  "inventory": { "weapons": { "wp_iron_sword": { "lv": 1, "lb": 0, "shards": 0 } },
                 "equipped": "wp_iron_sword" },
  "gacha":     { "totalPulls": 0, "sinceSSR": 0, "lostFiftyFifty": false, "history": [] },
  "stats":     { "bestStage": 0, "bestTimeMs": 0, "totalKills": 0, "totalBosses": 0, "ssrCount": 0 },
  "achievements": {},
  "settings":  { "sfx": 0.8, "bgm": 0.5, "quality": "auto", "stickSide": "left", "autoFire": true }
}
```

書き込みは 800ms のデバウンスで集約する。ただし
**ガチャ排出・レベルアップ・ステージクリアは即時 flush**（演出の再生よりも前に確定させる）。
`pagehide` と `visibilitychange` でも必ず保存する。

---

## パフォーマンス指針

これに反する実装は入れない。

| 指標 | 目標 |
|---|---|
| フレーム時間 | 16.6ms 以下（JS 4ms / 描画 8ms） |
| draw call | 100 以下 |
| 三角形数 | 60,000 以下 |
| 同時敵数 | 高200 / 中120 / 低70 |
| フレーム内アロケーション | **0** |

**守るべきルール**

1. **ゲームループ内で `new` しない。** `Vector3` / `Matrix4` はモジュールスコープで使い回す。
2. **大量オブジェクトは `InstancedMesh`。** アーキタイプごとに1 draw call。
   被弾フラッシュは `instanceColor` で表現し、マテリアルを増やさない。
3. **プールから取り、プールに返す。** 起動時に敵300/弾400/ピックアップ300/VFX64を確保。
4. **ライトは2つまで**（`DirectionalLight` + `HemisphereLight`）。点光源は使わない。
5. **ポストプロセス不使用。** ブルームは `emissive` と加算スプライトで偽装する。
6. **`sqrt` を使わない距離判定。** 距離の二乗で比較する。
7. **HUDは変化時のみ更新。** 毎フレームの `innerHTML` は禁止。
8. **重い処理は間引く。** 敵AIは4フレームに1回（インデックスで分散）、分離は2フレームに1回。

品質は `src/scene/Quality.js` が直近90フレームの中央値から自動で高/中/低を切り替える
（DPR・影・パーティクル量・敵上限を段階変更）。設定画面から手動固定も可能。

---

## ライセンス

- 本ゲーム本体：このリポジトリの規定に従う
- [three.js](https://threejs.org/) r185.1 — MIT License（`vendor/three/LICENSE`）
