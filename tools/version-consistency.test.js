// 本地 css/js 的 ?v= 必须全部一致，且不低于本批统一后的基准；洞府背景三处对齐。
// 用法：node tools/version-consistency.test.js
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const text = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const BASELINE = 128;
const html = text('index.html');
const game = text('js/game.js');
const css = text('css/style.css');

const cssJs = [...html.matchAll(/\b(?:href|src)="((?:css|js)\/[^\?"]+)\?v=(\d+)"/g)];
assert.ok(cssJs.length >= 2, 'index.html 应引用本地 css/js 并带 ?v=');
const vers = cssJs.map((m) => Number(m[2]));
const unique = [...new Set(vers)];
assert.strictEqual(
  unique.length,
  1,
  `index.html 本地 css/js 的 ?v= 必须全部一致，当前: ${cssJs.map((m) => m[1] + '?v=' + m[2]).join(', ')}`
);
assert.ok(unique[0] >= BASELINE, `统一版本 ${unique[0]} 应 >= ${BASELINE}`);

function sceneVers(src, name) {
  const re = new RegExp('assets/home/scene_' + name + '\\.webp\\?v=(\\d+)', 'g');
  const all = [...src.matchAll(re)];
  assert.ok(all.length, '缺少 scene_' + name + '.webp?v=');
  const vs = [...new Set(all.map((m) => m[1]))];
  assert.strictEqual(vs.length, 1, 'scene_' + name + ' 在同一文件内版本不一致: ' + vs.join(','));
  return vs[0];
}

['base', 'xuan', 'xian'].forEach((name) => {
  const gv = sceneVers(game, name);
  const cv = sceneVers(css, name);
  assert.strictEqual(cv, gv, 'style.css 与 game.js 的 scene_' + name + ' 版本须一致');
  if (name === 'base') {
    const hv = sceneVers(html, name);
    assert.strictEqual(hv, gv, 'index.html 与 game.js 的 scene_base 版本须一致');
  }
});

console.log('version-consistency.test.js ok: css/js ?v=' + unique[0] + ' x' + cssJs.length + ', scenes aligned');
