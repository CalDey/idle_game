// 绝技 / 称号图标：每个 HERO_SKILLS id、TITLES id 都有 128 与 @64 文件；渲染代码按约定引用。
// 用法：node tools/skill-title-icons.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const text = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(root, rel));

const sandbox = { window: {}, console };
sandbox.globalThis = sandbox.window;
vm.runInNewContext(text('js/config.js'), sandbox);
const C = sandbox.window.GameConfig;

const skillIds = Object.values(C.HERO_SKILLS || {}).map((s) => s && s.id).filter(Boolean);
const heroSkillIds = (C.HEROES || []).map((h) => h.skill && h.skill.id).filter(Boolean);
const titleIds = (C.TITLES || []).map((t) => t.id).filter(Boolean);

function listIconIds(prefix) {
  const dir = path.join(root, 'assets/icons');
  const ids = new Set();
  fs.readdirSync(dir).forEach((name) => {
    const m = name.match(new RegExp(`^${prefix}([a-z0-9_]+)(?:@64)?\\.webp$`));
    if (m) ids.add(m[1]);
  });
  return ids;
}

function pairPaths(prefix, id) {
  return [`assets/icons/${prefix}${id}.webp`, `assets/icons/${prefix}${id}@64.webp`];
}

function collectMismatches(kind, prefix, expectedIds) {
  const missing = [];
  const expected = new Set(expectedIds);
  expectedIds.forEach((id) => {
    pairPaths(prefix, id).forEach((rel) => {
      if (!exists(rel)) missing.push(rel);
    });
  });
  const onDisk = listIconIds(prefix);
  const unexpected = [...onDisk].filter((id) => !expected.has(id)).sort();
  return { missing, unexpected, expected: [...expected].sort(), onDisk: [...onDisk].sort() };
}

const skills = collectMismatches('skill', 'sk_', skillIds);
const titles = collectMismatches('title', 'tt_', titleIds);

const mismatchLines = [];
if (skills.missing.length) mismatchLines.push(`绝技缺文件: ${skills.missing.join(', ')}`);
if (skills.unexpected.length) mismatchLines.push(`绝技多余 id: ${skills.unexpected.join(', ')}`);
if (titles.missing.length) mismatchLines.push(`称号缺文件: ${titles.missing.join(', ')}`);
if (titles.unexpected.length) mismatchLines.push(`称号多余 id: ${titles.unexpected.join(', ')}`);

assert.strictEqual(
  mismatchLines.length,
  0,
  `图标与 config 不一致：\n${mismatchLines.join('\n')}\n` +
    `HERO_SKILLS ids=${skills.expected.join(',')}\n` +
    `TITLES ids=${titles.expected.join(',')}`
);

assert.deepStrictEqual([...new Set(skillIds)].sort(), [...new Set(heroSkillIds)].sort(), 'HERO_SKILLS 与 HEROES[].skill 的 id 不一致');
assert.strictEqual(new Set(skillIds).size, 16, `期望 16 个绝技 id，实际 ${new Set(skillIds).size}`);
assert.strictEqual(new Set(titleIds).size, 15, `期望 15 个称号 id，实际 ${new Set(titleIds).size}`);

const stage = text('js/stage-ui.js');
const titlesJs = text('js/titles.js');
const css = text('css/style.css');
const html = text('index.html');

assert.ok(
  /assets\/icons\/sk_\$\{skillId\}@64\.webp/.test(stage) && /assets\/icons\/sk_\$\{skillId\}\.webp/.test(stage),
  'stage-ui.js 应按 sk_<skillId> 约定引用绝技图标'
);
assert.ok(stage.includes('function skillIconHtml'), 'stage-ui.js 应有 skillIconHtml');
assert.ok(stage.includes('srcset='), '绝技图标应使用 srcset');
assert.strictEqual((stage.match(/\$\{skillIcon\}<span>绝技 · \$\{skillName\}<\/span>/g) || []).length, 2, '已解锁/未解锁编队卡片都应在 .squad-hero-skill 旁显示图标');
assert.ok(stage.includes("skillTagEl.innerHTML = `${skillIconHtml(skillId, 'ult-skill-icon', 28)}"), '#ult-skill-tag 应接入绝技图标');
assert.ok(/onerror="this\.remove\(\)"/.test(stage), '绝技缺图时应移除 img，避免裂图');

assert.ok(
  /assets\/icons\/tt_\$\{titleId\}@64\.webp/.test(titlesJs) && /assets\/icons\/tt_\$\{titleId\}\.webp/.test(titlesJs),
  'titles.js 应按 tt_<titleId> 约定引用称号图标'
);
assert.ok(titlesJs.includes('function titleIconHtml'), 'titles.js 应有 titleIconHtml');
assert.ok(titlesJs.includes('${titleIconHtml(title.id)}'), '称号列表 .title-row 左侧应插入图标');
assert.ok(titlesJs.includes('title-row-icon-wrap'), '称号图标应放在 40-52px 的 icon wrap 中');
assert.ok(/onerror=/.test(titlesJs) && titlesJs.includes('.remove()'), '称号缺图时应移除图标，避免裂图');

assert.ok(/\.squad-hero-skill \.squad-skill-icon/.test(css), 'css 应有编队绝技图标样式');
assert.ok(/\.title-row-icon-wrap/.test(css) && /width:\s*52px/.test(css.match(/\.title-row-icon-wrap\s*\{[^}]+\}/)[0]), '称号图标井应为 52px');
assert.ok(/\.title-row-icon\s*\{[^}]*width:\s*44px/.test(css), '称号图标本体应为 44px');
assert.ok(/\.ult-skill-icon/.test(css), 'css 应有绝技演出标签图标样式');

assert.ok(html.includes('assets/icons/ui_title@64.webp'), '不应覆盖通用称号头标 ui_title');
assert.ok(exists('assets/icons/ui_title.webp') && exists('assets/icons/ui_title@64.webp'), 'ui_title 原文件应仍在');
assert.ok(!exists('assets/icons/preview_dark.jpg'), '不应提交 preview_dark.jpg');
assert.ok(!exists('assets/icons/src512') && !exists('assets/icons/sk_jianyi_powang.src512.webp'), '不应提交 src512 源文件');
assert.ok(!html.includes('assets/ui/skills/') && !stage.includes('assets/ui/skills/'), '图标路径应落在 assets/icons/，而非 assets/ui/skills/');

console.log(
  `skill-title-icons.test.js ok: ${skillIds.length} skills, ${titleIds.length} titles, ` +
    `${skillIds.length * 2 + titleIds.length * 2} files`
);
