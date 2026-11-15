// 章节条不可锁死高度，避免「往事回溯」与秘境药丸两行溢出压到战斗顶栏。
// 用法：node tools/chapter-bar.test.js
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

assert.ok(html.includes('class="stage-chapter-bar"'), '须有章节条');
assert.ok(html.includes('id="btn-story-recall"') && html.includes('class="story-recall-entry"'), '须有往事回溯入口');
assert.ok(!html.includes('class="stage-trial-pills"') && !html.includes('btn-mijing-entry') && !html.includes('btn-tower-entry'), '秘境/镇妖塔药丸应已挪出章节条');
assert.ok(html.includes('id="nav-btn-more"') && html.includes('id="more-modal"'), '底栏应有更多入口和面板');
assert.ok(html.includes('id="mijing-run-card"'), '闯关页须保留进行中的秘境进度卡');

const bar = css.match(/\.stage-chapter-bar\s*\{[^}]*\}/);
assert.ok(bar, '缺少 .stage-chapter-bar 规则');
assert.ok(/min-height:\s*36px/.test(bar[0]), '章节条应为 min-height: 36px，以便叠行时增高');
assert.ok(!/(^|[^\w-])height:\s*36px/.test(bar[0]), '章节条不得再锁死 height: 36px');

const entry = css.match(/\.story-recall-entry\s*\{[^}]*\}/);
assert.ok(entry, '缺少 .story-recall-entry 规则');
assert.ok(/font-size:\s*12px/.test(entry[0]), '往事回溯入口字号应为 12px');
assert.ok(!/font-size:\s*11px/.test(entry[0]), '往事回溯入口不得停留在 11px');

console.log('chapter-bar.test.js ok: min-height 36px, recall entry 12px');
