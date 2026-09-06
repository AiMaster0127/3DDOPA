/**
 * 単一HTMLビルド。ES Modules 一式を1ファイルに畳んで dist/dopa-arena.html を出す。
 *
 * ★用途：HTTPサーバを立てられない場所（配布・共有・アーティファクト）で遊べる形にする。
 *   ゲーム本体は普段どおり素の ES Modules で開発する。これは出力形式を変えるだけの道具。
 *
 * ★方針：**解釈できない書き方に出会ったら必ず落とす。** 黙って読み飛ばすと、
 *   壊れたバンドルが「動いているように見えて一部だけ死ぬ」形になる。
 *   このプロジェクトの import/export は下の6形だけに揃えてあるので、それ以外は異常。
 *
 *   import * as NS from '...'      import { a, b as c } from '...'
 *   export const|let|var X         export class X         export function X
 *   export async function X        export { a, b as c }
 *   export { a, b as c } from '...'   （three.js の再エクスポート）
 *
 * 出力の検証は tools/single-check.mjs（実ブラウザで起動・操作・描画まで確認）。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { Script } from 'node:vm';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = resolve(ROOT, 'src/main.js');
const OUT = resolve(ROOT, 'dist/dopa-arena.html');

const rel = (p) => relative(ROOT, p);
const die = (msg) => { console.error(`ビルド中止: ${msg}`); process.exit(1); };

// ── 1モジュールを読んで、import/export を剥がす ──

// ★minify 済みの three.js は `import{A as e,...}from"..."` と空白が無い。
//   import\s+ にすると一致せず、剥がし残しに気付かないまま壊れたバンドルが出る（実際そうなった）。
const IMPORT_RE = /(^|\n)import(?=[\s{*])\s*([^;]*?)\s*from\s*(['"])([^'"]+)\3\s*;/g;
// ★再エクスポート（export{...}from"..."）を先に食う。
//   後回しにすると export{...} だけ剥がされ、from"..." が文の途中に取り残される。
const EXPORT_FROM_RE = /(^|[;}\n])export\s*\{([^}]*)\}\s*from\s*(['"])([^'"]+)\3\s*;?/g;
const EXPORT_LIST_RE = /(^|[;}\n])export\s*\{([^}]*)\}\s*;?/g;
const EXPORT_DECL_RE = /(^|\n)export\s+(async\s+function|function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g;

function parseModule(file) {
  let code = readFileSync(file, 'utf8');
  const deps = [];          // { spec, file, kind:'ns'|'named', name?, names?[] }
  const exports = [];       // { kind:'local', local, exported } | { kind:'re', file, imported, exported }

  const specifiers = (list) => list.split(',').map(x => x.trim()).filter(Boolean).map((s) => {
    const as = s.split(/\s+as\s+/);
    if (as.length === 2) return { from: as[0].trim(), to: as[1].trim() };
    if (as.length === 1) return { from: s, to: s };
    return die(`${rel(file)}: 解釈できない指定 "${s}"`);
  });

  code = code.replace(EXPORT_FROM_RE, (_m, lead, list, _q, spec) => {
    const dep = resolve(dirname(file), spec);
    deps.push({ spec, file: dep, kind: 're' });
    for (const sp of specifiers(list)) {
      exports.push({ kind: 're', file: dep, imported: sp.from, exported: sp.to });
    }
    return `${lead}/*export from ${spec}*/;`;
  });

  code = code.replace(IMPORT_RE, (_m, lead, clause, _q, spec) => {
    const dep = resolve(dirname(file), spec);
    const ns = clause.match(/^\*\s+as\s+([A-Za-z_$][\w$]*)$/);
    if (ns) {
      deps.push({ spec, file: dep, kind: 'ns', name: ns[1] });
    } else if (clause.startsWith('{') && clause.endsWith('}')) {
      const names = specifiers(clause.slice(1, -1))
        .map(sp => ({ imported: sp.from, local: sp.to }));
      deps.push({ spec, file: dep, kind: 'named', names });
    } else {
      die(`${rel(file)}: 解釈できない import 文 "import ${clause} from '${spec}'"`);
    }
    // ★末尾に ; を残す。minify 済みの three.js は import の直後に export{...} が続くので、
    //   区切りを消すと次の export を「文の先頭」として認識できなくなる（実際そうなった）。
    return `${lead}/*import ${spec}*/;`;
  });

  code = code.replace(EXPORT_LIST_RE, (_m, lead, list) => {
    for (const sp of specifiers(list)) {
      exports.push({ kind: 'local', local: sp.from, exported: sp.to });
    }
    return `${lead};`;
  });

  code = code.replace(EXPORT_DECL_RE, (_m, lead, kind, name) => {
    exports.push({ kind: 'local', local: name, exported: name });
    return `${lead}${kind} ${name}`;
  });

  // 剥がし残しの検出。★ここを素通しさせない。
  //   残ったまま関数で包むと構文エラーになるか、最悪「一部だけ動く」バンドルになる。
  const left = code.match(/(?:^|[;}\n])\s*(import|export)\s*[{*'"]|(?:^|\n)\s*(import|export)\s+[A-Za-z_$]/);
  if (left) die(`${rel(file)}: 処理できなかった ${left[1] || left[2]} が残っている（"${left[0].trim().slice(0, 40)}"）`);

  return { file, code, deps, exports };
}

// ── 依存グラフを深さ優先でたどって評価順を決める ──

const mods = new Map();
const order = [];
const visiting = new Set();
// ★連番は専用のカウンタで振る。mods.size から作ると、
//   依存を先にたどる間に同じ番号が複数のモジュールに付く（実際そうなった）。
let nextId = 0;

function walk(file) {
  if (mods.has(file)) return mods.get(file);
  if (visiting.has(file)) die(`循環参照: ${rel(file)}`);
  visiting.add(file);

  const m = parseModule(file);
  m.id = `__m${nextId++}`;
  for (const d of m.deps) walk(d.file);

  visiting.delete(file);
  mods.set(file, m);
  order.push(m);
  return m;
}

walk(ENTRY);

// ── 1つのスコープに畳む ──

const q = (s) => JSON.stringify(s);

const chunks = order.map((m) => {
  const head = m.deps.map((d) => {
    const dep = mods.get(d.file);
    if (d.kind === 're') return '';                 // 参照は return 側で直接引く
    if (d.kind === 'ns') return `const ${d.name} = ${dep.id};`;
    for (const n of d.names) {
      if (!dep.exports.some(e => e.exported === n.imported)) {
        die(`${rel(m.file)}: ${rel(d.file)} に ${n.imported} が無い`);
      }
    }
    const pairs = d.names.map(n => `${q(n.imported)}: ${n.local}`).join(', ');
    return pairs ? `const { ${pairs} } = ${dep.id};` : '';
  }).filter(Boolean).join('\n');

  const tail = m.exports.map((e) => {
    if (e.kind === 'local') return `${q(e.exported)}: ${e.local}`;
    const dep = mods.get(e.file);
    if (!dep.exports.some(x => x.exported === e.imported)) {
      die(`${rel(m.file)}: 再エクスポートしようとした ${e.imported} が ${rel(e.file)} に無い`);
    }
    return `${q(e.exported)}: ${dep.id}[${q(e.imported)}]`;
  }).join(', ');

  return `/* ── ${rel(m.file)} ── */\nconst ${m.id} = (() => {\n${head}\n${m.code}\nreturn { ${tail} };\n})();`;
});

// ★組み立てた JS を構文解析して確かめる。
//   剥がし損ねた import が関数の中に残ると、ここで必ず落ちる。
const script = chunks.join('\n\n');
try { new Script(script); }
catch (err) {
  // 失敗した中間結果を残す。行番号から原因のモジュールを追えるようにする
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT.replace(/\.html$/, '.debug.js'), script);
  die(`畳んだJSが構文エラー: ${err.message}\n  中間結果: ${rel(OUT.replace(/\.html$/, '.debug.js'))}`);
}

// ── HTML を組み立てる ──

const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
const css = readFileSync(resolve(ROOT, 'src/ui/styles.css'), 'utf8');

const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/);
if (!body) die('index.html の <body> が見つからない');

// 元の <script type="module" src="..."> と <link rel="stylesheet"> は畳んだので落とす
const markup = body[1]
  .replace(/<script[^>]*type=["']module["'][^>]*><\/script>/g, '')
  .replace(/<script[^>]*src=["'][^"']*["'][^>]*><\/script>/g, '')
  .trim();

const title = (html.match(/<title>([^<]*)<\/title>/) || [, 'DOPA ARENA'])[1];

const out = `<title>${title}</title>
<style>
${css}
</style>
${markup}
<script type="module">
// ★単一HTMLビルド。Service Worker は使えないので登録を止める（登録先のファイルが無い）
globalThis.__DOPA_SINGLE__ = true;
${script}
</script>
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, out);

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log(`${rel(OUT)} を書き出した`);
console.log(`  モジュール ${order.length} 件 / ${kb(Buffer.byteLength(out))}`);
console.log(`  エントリ ${rel(ENTRY)}`);
