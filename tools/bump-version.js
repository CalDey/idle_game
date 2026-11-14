// 统一本地 css/js 与洞府背景的 ?v= 缓存版本。
// 用法（在仓库根目录）：
//   node tools/bump-version.js <版本号>
//   node tools/bump-version.js --auto   // 取 index.html、css/、js/ 中已有 ?v= 最高值 + 1
// 发版或合并冲突后重跑即可，不必手改各处版本号。
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const TEXT_EXT = new Set(['.html', '.css', '.js', '.md', '.txt', '.yml', '.yaml', '.svg']);
const SKIP_DIR = new Set(['.git', 'node_modules', '.design']);

function walk(dir, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith('.') && ent.name !== '.github') {
      if (SKIP_DIR.has(ent.name)) continue;
    }
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIR.has(ent.name)) continue;
      walk(abs, out);
    } else if (TEXT_EXT.has(path.extname(ent.name))) {
      out.push(abs);
    }
  }
  return out;
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function write(rel, text) {
  fs.writeFileSync(path.join(root, rel), text);
}

function versionsIn(text) {
  const out = [];
  const re = /\?v=(\d+)/g;
  let m;
  while ((m = re.exec(text))) out.push(Number(m[1]));
  return out;
}

function repoMaxVersion() {
  const targets = [path.join(root, 'index.html')];
  for (const dir of ['css', 'js']) {
    walk(path.join(root, dir), targets);
  }
  let max = 0;
  for (const abs of targets) {
    let text;
    try { text = fs.readFileSync(abs, 'utf8'); } catch (err) { continue; }
    for (const n of versionsIn(text)) if (n > max) max = n;
  }
  return max;
}

function bumpIndexCssJs(html, v) {
  return html.replace(
    /\b(href|src)="((?:css|js)\/[^"?]+)\?v=\d+"/g,
    (_, attr, file) => `${attr}="${file}?v=${v}"`
  );
}

function bumpHomeScenes(text, v) {
  return text.replace(
    /assets\/home\/scene_(base|xuan|xian)\.webp\?v=\d+/g,
    (_, name) => `assets/home/scene_${name}.webp?v=${v}`
  );
}

function usage(msg) {
  if (msg) console.error(msg);
  console.error('用法: node tools/bump-version.js <版本号>  或  node tools/bump-version.js --auto');
  process.exit(1);
}

const arg = process.argv[2];
if (!arg) usage();

let version;
if (arg === '--auto') {
  version = repoMaxVersion() + 1;
} else if (/^\d+$/.test(arg) && Number(arg) > 0) {
  version = Number(arg);
} else {
  usage(`无效版本号: ${arg}`);
}

const files = ['index.html', 'js/game.js', 'css/style.css'];
const before = Object.fromEntries(files.map((f) => [f, read(f)]));
let html = bumpIndexCssJs(before['index.html'], version);
html = bumpHomeScenes(html, version);
write('index.html', html);
write('js/game.js', bumpHomeScenes(before['js/game.js'], version));
write('css/style.css', bumpHomeScenes(before['css/style.css'], version));

const cssJs = [...html.matchAll(/\b(?:href|src)="((?:css|js)\/[^"?]+)\?v=(\d+)"/g)];
const vers = [...new Set(cssJs.map((m) => m[2]))];
if (vers.length !== 1 || Number(vers[0]) !== version) {
  console.error('index.html 本地 css/js 版本未统一到', version, vers);
  process.exit(1);
}

console.log(`bump-version: 已将 index.html 本地 css/js 与洞府 scene_*.webp 统一为 ?v=${version}（${cssJs.length} 处脚本/样式）`);
