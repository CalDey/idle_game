// 统一「全局管理」的 ?v= 缓存版本：index.html 本地 css/js，以及洞府 scene_*.webp。
// 用法（在仓库根目录）：
//   node tools/bump-version.js <版本号>
//   node tools/bump-version.js --auto   // 取全局管理引用里已有 ?v= 的最高值 + 1
// 发版或合并冲突后重跑即可，不必手改各处版本号。
//
// --auto 只统计全局管理的引用，不算单图（favicon、图标、unlock 卡、og:image 等）的 ?v=，
// 避免个别素材的版本把全局号抬高导致跳号。
// og:image（index.html）不加 ?v=，也不纳入 bump：它是分享缩略图，不走游戏资源缓存失效。
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function write(rel, text) {
  fs.writeFileSync(path.join(root, rel), text);
}

const CSS_JS_VER_RE = /\b(?:href|src)="(?:css|js)\/[^"?]+\?v=(\d+)"/g;
const SCENE_VER_RE = /assets\/home\/scene_(?:base|xuan|xian)\.webp\?v=(\d+)/g;

function versionsFromManaged(text) {
  const out = [];
  if (!text) return out;
  let m;
  const cssJs = new RegExp(CSS_JS_VER_RE.source, 'g');
  while ((m = cssJs.exec(text))) out.push(Number(m[1]));
  const scene = new RegExp(SCENE_VER_RE.source, 'g');
  while ((m = scene.exec(text))) out.push(Number(m[1]));
  return out;
}

function repoMaxVersion() {
  // 只读会被 bump 改写的三处，避免扫到 js/css 里单图 ?v=。
  const files = ['index.html', 'js/game.js', 'css/style.css'];
  let max = 0;
  for (const rel of files) {
    let text;
    try { text = read(rel); } catch (err) { continue; }
    for (const n of versionsFromManaged(text)) if (n > max) max = n;
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

function applyBump(version, io) {
  const load = (io && io.read) || read;
  const save = (io && io.write) || write;
  const files = ['index.html', 'js/game.js', 'css/style.css'];
  const before = Object.fromEntries(files.map((f) => [f, load(f)]));
  let html = bumpIndexCssJs(before['index.html'], version);
  html = bumpHomeScenes(html, version);
  save('index.html', html);
  save('js/game.js', bumpHomeScenes(before['js/game.js'], version));
  save('css/style.css', bumpHomeScenes(before['css/style.css'], version));

  const cssJs = [...html.matchAll(/\b(?:href|src)="((?:css|js)\/[^"?]+)\?v=(\d+)"/g)];
  const vers = [...new Set(cssJs.map((m) => m[2]))];
  if (vers.length !== 1 || Number(vers[0]) !== version) {
    const err = new Error('index.html 本地 css/js 版本未统一到 ' + version + ' ' + vers.join(','));
    err.vers = vers;
    throw err;
  }
  return { version, count: cssJs.length };
}

function usage(msg) {
  if (msg) console.error(msg);
  console.error('用法: node tools/bump-version.js <版本号>  或  node tools/bump-version.js --auto');
  process.exit(1);
}

function main(argv) {
  const arg = argv[2];
  if (!arg) usage();
  let version;
  if (arg === '--auto') {
    version = repoMaxVersion() + 1;
  } else if (/^\d+$/.test(arg) && Number(arg) > 0) {
    version = Number(arg);
  } else {
    usage(`无效版本号: ${arg}`);
  }
  try {
    const res = applyBump(version);
    console.log(`bump-version: 已将 index.html 本地 css/js 与洞府 scene_*.webp 统一为 ?v=${res.version}（${res.count} 处脚本/样式）`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

const api = {
  versionsFromManaged,
  repoMaxVersion,
  bumpIndexCssJs,
  bumpHomeScenes,
  applyBump,
  main
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (require.main === module) main(process.argv);
