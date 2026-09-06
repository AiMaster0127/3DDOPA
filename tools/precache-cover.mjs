/**
 * sw.js のプリキャッシュ一覧と、実際に同梱しているファイルの照合。
 *
 * ★ファイルを足したのに sw.js へ書き忘れると、オンラインでは動くのに
 *   オフラインだけ壊れる。原因が判りにくい事故なので機械的に照合する。
 *
 * ★実装をここに置いて data-check（数百ms）と pwa-check（ブラウザ）で共有する。
 *   同じ検査を2箇所に書くと、片方だけ直して食い違う。
 */
import fs from 'node:fs';
import path from 'node:path';

/** @returns {string[]} sw.js に登録されていない同梱ファイル */
export function missingFromPrecache() {
  const sw = fs.readFileSync('sw.js', 'utf8');
  const listed = new Set([...sw.matchAll(/'(\.\/[^']+)'/g)].map(m => m[1]));

  const walk = (dir, out = []) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else out.push('./' + p.split(path.sep).join('/'));
    }
    return out;
  };

  const shipped = [
    ...walk('src'),
    ...walk('assets'),
    './vendor/three/three.module.min.js',
    './vendor/three/three.core.min.js',
    './index.html',
    './manifest.webmanifest',
  ].filter(f => /\.(js|css|html|webmanifest|svg|png)$/.test(f));

  return shipped.filter(f => !listed.has(f));
}
