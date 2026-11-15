// 关前对白层（主线剧情对话）静态检查：用户 iPhone 真机反馈「界面太烂」后的重做（v151）。
// 遮罩近不透明 / 虚化、说话人名签、无黑色胶囊占位、按钮 ≥44px、两侧人物同高同底线。不跑浏览器。
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const text = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const css = text('css/style.css');
const html = text('index.html');
const js = text('js/story.js');

function block(sel) {
  const re = new RegExp('\\n' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{([\\s\\S]*?)\\n\\}');
  const m = css.match(re);
  assert.ok(m, `缺少 CSS 块 ${sel}`);
  return m[1];
}

// 1. 遮罩：背景色 alpha ≥ 0.92，且带 backdrop-filter 虚化
const modal = block('.story-modal');
const bg = /background(?:-color)?:\s*rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/.exec(modal);
assert.ok(bg && Number(bg[1]) >= 0.92, `对白层遮罩不透明度应 ≥0.92，实际 ${bg && bg[1]}`);
assert.ok(/(^|\n)\s*backdrop-filter:\s*blur\(/.test(modal) && /-webkit-backdrop-filter:\s*blur\(/.test(modal), '遮罩需 backdrop-filter 虚化（含 -webkit- 前缀）');
assert.ok(/58px/.test(modal) && /safe-area-inset-bottom/.test(modal) && /safe-area-inset-top/.test(modal), '对白框避开底栏与安全区');

// 2. 名签：DOM 存在、CSS 为骑边名签、JS 无名时显示「旁白」
assert.ok(html.includes('id="story-speaker" class="story-speaker"'), '名签元素存在');
const sp = block('.story-speaker');
assert.ok(/position:\s*absolute/.test(sp) && /border:\s*1px solid/.test(sp), '名签为带边框的骑边标签');
assert.ok(/function speakerLabel/.test(js) && /return '旁白'/.test(js), '无说话人时名签显示「旁白」');
global.window = {};
require(path.join(root, 'js/story.js'));
const S = window.Story;
assert.strictEqual(S.speakerLabel({ who: 'narrator', name: '' }), '旁白');
assert.strictEqual(S.speakerLabel({ who: 'boss', name: '枯木树娘' }), '枯木树娘');
assert.strictEqual(S.speakerLabel({ who: 'codex', name: '' }), '图鉴');
assert.ok(/\.story-modal\.is-opening \.story-speaker \{\s*display:\s*none/.test(css), '开篇五屏不显示名签');

// 3. 不再是黑色胶囊占位：.story-boss 本体不带胶囊圆角和纯黑径向填充；无图时有烟雾暗影结构
const boss = block('.story-boss');
assert.ok(!/border-radius/.test(boss), 'Boss 框不得再是胶囊圆角');
assert.ok(!/#000 0 \d+%/.test(css.slice(css.indexOf('.story-boss'), css.indexOf('.story-box {'))), '不得再用纯黑径向渐变画胶囊');
assert.ok(html.includes('class="story-boss-shade"') && html.includes('class="story-boss-mist"'), '无图时的烟雾暗影 DOM');
const shade = block('.story-boss-shade::before');
assert.ok(/clip-path:\s*polygon\(/.test(shade), '暗影有人形轮廓');
assert.ok(!/brightness\(0\)/.test(css.slice(css.indexOf('/* === 新手体验 batch3 P1-1'), css.indexOf('/* === 洞府机缘'))), '对白层不得用 brightness(0) 涂黑块');
assert.ok(/\.story-boss\.has-img \.story-boss-shade/.test(css), '有图时隐藏暗影');
assert.ok(!/\.design\/enemies_all/.test(js + html), '不用被否决的 .design/enemies_all 旧图');

// 4. 两侧人物同高同底线、说话者高亮
const both = block('.story-hero,\n.story-boss');
assert.ok(/bottom:\s*0/.test(both) && /height:\s*100%/.test(both) && /width:\s*56%/.test(both), '主角与 Boss 同宽同高同底线');
assert.ok(/object-position:\s*50% 0%/.test(block('.story-hero')), '立绘顶部对齐，头饰完整');
assert.ok(/\.story-modal\[data-who="hero"\] \.story-boss/.test(css) && /\.story-modal\[data-who="boss"\] \.story-hero/.test(css), '非说话一方压暗');

// 5. 按钮 ≥44px、金边风格
const btn = block('.story-actions .btn');
const mh = /min-height:\s*(\d+)px/.exec(btn);
assert.ok(mh && Number(mh[1]) >= 44, `对白按钮点击区应 ≥44px，实际 ${mh && mh[1]}`);
assert.ok(/var\(--accent-gold\)/.test(block('.story-box')), '对白框用项目金边变量');
assert.ok(/#ffe7b0/.test(block('.story-actions .story-next')), '「下一句」为金色主按钮');

// 不动对白内容：按钮 / 结构 id 保留
['btn-story-skip', 'btn-story-next', 'story-text', 'story-hero-img', 'story-boss-img', 'story-box'].forEach((id) => {
  assert.ok(html.includes(`id="${id}"`), `保留 #${id}`);
});

console.log('qa-dialog-layer.test.js ok');
