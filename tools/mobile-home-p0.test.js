// P0 手机首屏（v141）：窄屏 ≤440px 才改突破面板/打坐说明/灵兽/本命道途按钮，桌面规则保持原样。
// 只做静态检查（CSS 规则存在与作用域），不是视觉验收。
// 用法：node tools/mobile-home-p0.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const gameJs = fs.readFileSync(path.join(root, 'js/game.js'), 'utf8');

// 取出所有顶层 @media 块：[{ query, body, start, end }]
function mediaBlocks(src) {
  const out = [];
  const re = /@media\s*([^{]+)\{/g;
  let m;
  while ((m = re.exec(src))) {
    let depth = 1;
    let i = re.lastIndex;
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth += 1;
      else if (src[i] === '}') depth -= 1;
      i += 1;
    }
    out.push({ query: m[1].trim(), body: src.slice(re.lastIndex, i - 1), start: m.index, end: i });
    re.lastIndex = i;
  }
  return out;
}

function rule(body, selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = body.match(new RegExp(`(^|[}\\s])${esc}\\s*\\{([^}]*)\\}`));
  return m ? m[2] : null;
}

const blocks = mediaBlocks(css);
const narrow = blocks.filter((b) => /^\(max-width:\s*440px\)$/.test(b.query));
const narrowShort = blocks.filter((b) => /^\(max-width:\s*440px\)\s*and\s*\(max-height:\s*700px\)$/.test(b.query));
// 去掉所有 @media 块后的「基础（桌面）」样式
let base = '';
let pos = 0;
blocks.forEach((b) => { base += css.slice(pos, b.start); pos = b.end; });
base += css.slice(pos);

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

check('存在窄屏 (max-width: 440px) 首屏块（含 --bt-panel-h），和一个窄且矮块', () => {
  assert.ok(narrow.length >= 1);
  assert.strictEqual(narrow.filter((b) => /--bt-panel-h/.test(b.body)).length, 1);
  assert.strictEqual(narrowShort.length, 1);
});

const homeBlock = narrow.find((b) => /--bt-panel-h/.test(b.body));
const nb = homeBlock.body;

check('--bt-panel-h 只在窄屏媒体查询里被使用，基础样式不读', () => {
  assert.ok(!/var\(--bt-panel-h/.test(base), '基础样式不应使用 --bt-panel-h');
  blocks.forEach((b) => {
    if (/var\(--bt-panel-h/.test(b.body)) assert.ok(b === homeBlock, `--bt-panel-h 出现在 @media ${b.query}`);
  });
});

check('桌面基础规则未改：说明 156px、灵兽 164px、描述省略号；道途不再用 9.5em 省略', () => {
  assert.match(rule(base, '.meditation-caption'), /bottom:\s*156px/);
  assert.match(rule(base, '.beast-companion'), /bottom:\s*164px/);
  assert.match(rule(base, '.beast-companion'), /width:\s*min\(26%,\s*108px\)/);
  assert.match(rule(base, '.card-subtitle'), /text-overflow:\s*ellipsis/);
  const pe = rule(base, '.path-entry');
  assert.match(pe, /max-width:\s*none/);
  assert.match(pe, /overflow:\s*visible/);
  assert.ok(!/max-width:\s*9\.5em/.test(pe), '节奏 v2：入口不得再用 9.5em 把「化灵初开启」裁成「化…」');
  assert.match(rule(base, '#tab-cultivate>.gufeng-card'), /position:\s*absolute/);
  assert.match(rule(base, '#tab-cultivate>.gufeng-card'), /padding:\s*9px 12px 10px/);
  assert.match(rule(base, '.cultivate-codex-row'), /margin:\s*-2px 0 8px/);
});

check('窄屏：打坐说明与灵兽按面板高度放到面板之上', () => {
  assert.match(rule(nb, '#tab-cultivate .meditation-caption'), /bottom:\s*calc\(var\(--bt-panel-h,\s*150px\)\s*\+\s*var\(--bt-safe-gap\)\)/);
  const beast = rule(nb, '#tab-cultivate .beast-companion');
  assert.match(beast, /bottom:\s*calc\(var\(--bt-panel-h,\s*150px\)/);
  assert.match(beast, /env\(safe-area-inset-right/);
});

check('窄屏：本命道途入口不换行、不省略（v143 改为「道途」+ 状态小字，详见 mobile-r13.test.js）', () => {
  const btn = rule(nb, '#tab-cultivate>.gufeng-card .path-entry');
  assert.match(btn, /white-space:\s*nowrap/);
  assert.match(rule(nb, '#tab-cultivate>.gufeng-card .path-entry #path-entry-text'), /display:\s*none/);
  assert.ok(!/text-overflow:\s*ellipsis/.test(nb), '窄屏块里不应出现 ellipsis');
});

check('窄屏：境界突破描述换行；图鉴并入标题行；面板仍为叠加层', () => {
  const sub = rule(nb, '#tab-cultivate>.gufeng-card .card-subtitle');
  assert.match(sub, /white-space:\s*normal/);
  assert.match(rule(nb, '#tab-cultivate>.gufeng-card .cultivate-codex-row'), /position:\s*absolute/);
  assert.ok(!/#tab-cultivate>\.gufeng-card\s*\{[^}]*position:\s*(static|relative)/.test(nb), '面板不能改成文档流（会让立绘舞台高度跳）');
  assert.ok(!/\.hero-stage\s*\{/.test(nb), '窄屏块不改立绘舞台尺寸');
});

check('窄屏块写在全局 .path-entry 之后（层叠顺序）', () => {
  assert.ok(homeBlock.start > css.indexOf('.path-entry {'));
});

check('game.js：ResizeObserver 写 --bt-panel-h，高度 0 时不覆盖', () => {
  assert.match(gameJs, /function initBreakthroughPanelVar\(\)/);
  assert.match(gameJs, /setProperty\('--bt-panel-h'/);
  assert.match(gameJs, /if \(h <= 0 \|\| h === last\) return;/);
  assert.match(gameJs, /initHeroStage\(\);\n\s*initBreakthroughPanelVar\(\);/);
  assert.ok(!/getImageData/.test(gameJs));
});

console.log(`\n${passed} checks passed`);
