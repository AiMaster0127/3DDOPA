/**
 * Service Worker。
 *
 * ★three.js を含む全アセットをプリキャッシュし、完全オフラインで動くようにする。
 *   同梱物しか扱わないので、外部への fetch は一切発生しない。
 *
 * ★リリースのたびに CACHE のバージョンを上げること。
 *   上げないと古いキャッシュが残り、更新が反映されない。
 */
const CACHE = 'dopa-arena-v5';

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/icons/icon.svg',
  './assets/icons/maskable.svg',

  // ★three.js は2ファイル構成。両方入れないとオフラインで起動しない
  './vendor/three/three.module.min.js',
  './vendor/three/three.core.min.js',

  './src/main.js',
  './src/ui/styles.css',

  './src/core/Game.js',
  './src/core/Loop.js',
  './src/core/Events.js',
  './src/core/Pool.js',
  './src/core/RNG.js',
  './src/core/math.js',

  './src/data/balance.js',
  './src/data/weapons.js',
  './src/data/enemies.js',
  './src/data/skills.js',
  './src/data/gacha.js',
  './src/data/stages.js',
  './src/data/themes.js',
  './src/data/elements.js',
  './src/data/validate.js',
  './src/data/upgrades.js',
  './src/data/achievements.js',
  './src/data/characters.js',

  './src/entities/Player.js',
  './src/entities/Enemy.js',
  './src/entities/Projectile.js',
  './src/entities/Pickup.js',

  './src/combat/CombatSystem.js',
  './src/combat/Collision.js',
  './src/combat/AutoAim.js',
  './src/combat/WeaponSystem.js',
  './src/combat/SpawnDirector.js',
  './src/combat/EnemyAI.js',

  './src/progression/LevelSystem.js',
  './src/progression/SkillSystem.js',
  './src/progression/MetaSystem.js',

  './src/gacha/GachaSystem.js',
  './src/gacha/Inventory.js',
  './src/gacha/GachaDirector.js',

  './src/save/SaveManager.js',
  './src/save/migrate.js',
  './src/save/schema.js',

  './src/scene/SceneManager.js',
  './src/scene/CameraRig.js',
  './src/scene/Arena.js',
  './src/scene/Podium.js',
  './src/scene/PlayerView.js',
  './src/scene/BossView.js',
  './src/scene/InstanceLayer.js',
  './src/scene/Quality.js',
  './src/scene/textures.js',
  './src/scene/stageTextures.js',
  './src/scene/deckTextures.js',
  './src/scene/materials.js',
  './src/scene/geometry.js',
  './src/scene/weaponShapes.js',
  './src/scene/character.js',
  './src/scene/enemyShapes.js',
  './src/scene/bossShapes.js',
  './src/scene/vfx/Sparks.js',
  './src/scene/vfx/Shockwave.js',
  './src/scene/vfx/DamageNumbers.js',
  './src/scene/vfx/ScreenFx.js',

  './src/ui/Input.js',
  './src/ui/Hud.js',
  './src/ui/Screens.js',
  './src/ui/LevelUpUI.js',
  './src/ui/HomeUI.js',
  './src/ui/GachaUI.js',
  './src/ui/InventoryUI.js',
  './src/ui/StageUI.js',
  './src/ui/MetaUI.js',
  './src/ui/CharacterUI.js',
  './src/ui/share.js',

  './src/audio/AudioSystem.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // ★1つでも失敗すると addAll 全体が落ちる。
    //   どれが欠けたか判るよう個別に入れて、残りは通す。
    const results = await Promise.allSettled(PRECACHE.map(u => cache.add(u)));
    const failed = results
      .map((r, i) => (r.status === 'rejected' ? PRECACHE[i] : null))
      .filter(Boolean);
    if (failed.length) console.warn('[sw] キャッシュできなかったファイル:', failed);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // 同一オリジンだけ扱う（そもそも外部への通信はしない）
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // cache-first。オフラインで確実に動くことを最優先する
  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.ok) {
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
      }
      return res;
    } catch {
      // オフラインで未キャッシュ → ナビゲーションなら index を返す
      if (req.mode === 'navigate') {
        const shell = await caches.match('./index.html');
        if (shell) return shell;
      }
      throw new Error('offline and not cached');
    }
  })());
});
