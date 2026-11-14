// bump-version：--auto 只统计全局管理的 css/js 与 scene_*.webp，单图 ?v= 不抬高版本号。
// 用法：node tools/bump-version.test.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const bump = require('./bump-version.js');

const root = path.join(__dirname, '..');
const text = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const sample = [
  '<link rel="icon" href="assets/icons/favicon-32.png?v=16" />',
  '<meta property="og:image" content="assets/icons/app_icon_512.webp" />',
  '<link rel="stylesheet" href="css/style.css?v=128" />',
  '<script src="js/game.js?v=128"></script>',
  '<img src="assets/icons/res_peach@64.webp?v=999" alt="">',
  'assets/home/scene_base.webp?v=128',
  'assets/ui/unlock_gear.webp?v=119'
].join('\n');

const managed = bump.versionsFromManaged(sample);
assert.deepStrictEqual(managed.sort((a, b) => a - b), [128, 128, 128], '只收下 css/js 与 scene，不含 16/999/119');
assert.ok(!managed.includes(999), '单图 ?v=999 不得进入 --auto');
assert.ok(!managed.includes(16), 'favicon 不得进入 --auto');
assert.ok(!managed.includes(119), 'unlock 卡单图不得进入 --auto');

const html = text('index.html');
assert.ok(/property="og:image"/.test(html), '应有 og:image');
assert.ok(!/property="og:image"[^>]*\?v=/.test(html), 'og:image 不加 ?v=，不纳入全局缓存号');
assert.ok(text('tools/bump-version.js').includes('og:image'), '脚本注释须写明排除 og:image');

const fromFiles = ['index.html', 'js/game.js', 'css/style.css']
  .reduce((arr, rel) => arr.concat(bump.versionsFromManaged(text(rel))), []);
assert.strictEqual(bump.repoMaxVersion(), Math.max.apply(null, fromFiles), 'repoMax 等于三处全局引用的最高号');
const raw = [];
const re = /\?v=(\d+)/g;
['index.html', 'js/game.js', 'css/style.css'].forEach((rel) => {
  const src = text(rel);
  let m;
  const r = new RegExp(re.source, 'g');
  while ((m = r.exec(src))) raw.push(Number(m[1]));
});
if (raw.length) {
  const rawMax = Math.max.apply(null, raw);
  assert.ok(bump.repoMaxVersion() <= rawMax);
  // 若仓库里单图版本高于全局号，--auto 也不得跟着跳
  assert.strictEqual(bump.repoMaxVersion(), Math.max.apply(null, fromFiles));
}

const bumped = bump.bumpIndexCssJs(html, 129);
assert.ok(/href="css\/style.css\?v=129"/.test(bumped));
assert.ok(/href="assets\/icons\/favicon-32.png\?v=16"/.test(bumped), 'favicon 保持原单图版本');
assert.ok(/property="og:image" content="assets\/icons\/app_icon_512.webp"/.test(bumped), 'og:image 不被改写');

const sceneIn = 'url("assets/home/scene_base.webp?v=128") and assets/home/scene_xuan.webp?v=128';
assert.strictEqual(
  bump.bumpHomeScenes(sceneIn, 129),
  'url("assets/home/scene_base.webp?v=129") and assets/home/scene_xuan.webp?v=129'
);

console.log('bump-version.test.js ok');
