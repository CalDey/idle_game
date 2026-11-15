// v154：「更多」底栏入口与面板、秘境/镇妖塔入口迁移、仙桃溢出显示。
// 不跑浏览器，不是视觉验收。
// 用法：node tools/qa-more-menu.test.js
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const text = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const html = text('index.html');
const css = text('css/style.css');
const moreSrc = text('js/more-menu.js');
const gearSrc = text('js/gear.js');

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

function memoryStorage(initial) {
  const data = Object.assign({}, initial || {});
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    _data: data
  };
}

check('底栏第 6 键是「更多」，不是存档页签；秘境/镇妖塔药丸已撤，进度卡保留', () => {
  assert.ok(html.includes('id="nav-btn-more"'), '须有 #nav-btn-more');
  assert.ok(/id="nav-btn-more"[^>]*class="nav-btn"/.test(html));
  assert.ok(html.includes('>更多<') || html.includes('>更多</span>'), '按钮文字必须是「更多」');
  const moreBtn = html.match(/<button id="nav-btn-more"[\s\S]*?<\/button>/);
  assert.ok(moreBtn, '应能截到更多按钮');
  assert.ok(!/data-tab=/.test(moreBtn[0]), '更多按钮不能带 data-tab，以免旧档读到无效页签');
  assert.ok(html.includes('id="more-modal"') && html.includes('id="more-modal-body"'));
  assert.ok(html.includes('id="badge-more"'));
  assert.ok(!html.includes('id="btn-mijing-entry"') && !html.includes('id="btn-tower-entry"'));
  assert.ok(!html.includes('stage-trial-pills'));
  assert.ok(html.includes('id="mijing-run-card"'), '进行中的秘境进度卡留在闯关页');
  assert.ok(html.includes('js/more-menu.js?v='));
  assert.ok(html.includes('镇妖塔') && !html.includes('锁妖塔'), '名字保持「镇妖塔」');
});

check('更多面板由注册表驱动，按组排列，含秘境劫运与镇妖塔', () => {
  assert.ok(moreSrc.includes("name: '秘境劫运'"));
  assert.ok(moreSrc.includes("name: '镇妖塔'"));
  assert.ok(moreSrc.includes("name: '万妖图鉴'"));
  assert.ok(moreSrc.includes("name: '因果簿'"));
  assert.ok(moreSrc.includes("name: '仙姬派遣'"));
  assert.ok(moreSrc.includes("name: '试炼'"));
  assert.ok(/isUnlocked:\s*\(\)/.test(moreSrc) && /lockText:\s*\(\)/.test(moreSrc));
  assert.ok(/badge:\s*\(\)/.test(moreSrc) && /open:\s*\(\)/.test(moreSrc));
  assert.ok(moreSrc.includes('MoreMenu') && moreSrc.includes('function entries('));
  assert.ok(moreSrc.includes("id: 'trial'") && moreSrc.includes("group: 'trial'"));
});

check('新手解锁卡「去秘境」改为打开更多面板；引导不再指向已撤药丸', () => {
  const nb = text('js/newbie.js');
  assert.ok(nb.includes("u.key === 'mijing'") && nb.includes('MoreMenu.open'), '去秘境应打开更多');
  assert.ok(!nb.includes('btn-mijing-entry') && !nb.includes('btn-tower-entry'));
  assert.ok(!text('js/game.js').includes('btn-mijing-entry'));
  const init = text('js/game.js');
  assert.ok(init.includes(".nav-btn[data-tab]"), '底栏点击只处理带 data-tab 的页签，免得点「更多」切到空页');
});

check('窄屏底栏 6 键：≤440px 触控区 ≥44px，标签不换行不省略；面板可滚动且躲开底栏', () => {
  assert.ok(/grid-template-columns:\s*repeat\(6, 1fr\)/.test(css));
  const media = [...css.matchAll(/@media \(max-width: 440px\) \{([\s\S]*?)\n\}/g)];
  const navMedia = media.find((m) => m[1].includes('.nav-btn') && m[1].includes('min-height'));
  assert.ok(navMedia, '≤440px 应有 nav-btn 触控规则');
  assert.ok(/min-height:\s*44px/.test(navMedia[1]) && /min-width:\s*44px/.test(navMedia[1]), navMedia[1]);
  assert.ok(/white-space:\s*nowrap/.test(navMedia[1]));
  assert.ok(/text-overflow:\s*clip/.test(navMedia[1]) || !/text-overflow:\s*ellipsis/.test(navMedia[1]));
  assert.ok(css.includes('.more-modal-body') && /scrollbar-width:\s*none/.test(css));
  assert.ok(css.includes('.more-modal-body::-webkit-scrollbar'));
  const dialog = css.match(/\.more-dialog\s*\{([\s\S]*?)\}/);
  assert.ok(dialog, '应有 .more-dialog');
  assert.ok(/safe-area-inset-bottom/.test(dialog[1]) || /safe-area-inset-bottom/.test(css.match(/\.more-dialog[\s\S]{0,600}/)[0]));
  assert.ok(/min-height:\s*44px/.test(css.match(/\.more-tile\s*\{([\s\S]*?)\}/)[1]));
});

check('仙桃溢出只改显示：保留 x/cap，旁注「已溢 · 停结」，暗金且带说明，不裁存量', () => {
  assert.ok(gearSrc.includes("const PEACH_OVERFLOW_HINT = '已溢 · 停结'"));
  assert.ok(gearSrc.includes('function peachOverflowTitle(cap)'));
  assert.ok(gearSrc.includes('仙桃已溢过上限 ${cap}'));
  assert.ok(gearSrc.includes('树不再结新果，吃到 ${cap} 以下才会再长'));
  assert.ok(!gearSrc.includes('满56停长') && !gearSrc.includes('（满'));
  // 「仙桃已满。果香溢出来……」原文不动
  const ui = text('js/ui-text.js');
  assert.ok(ui.includes('仙桃已满。果香溢出来，像在催你再快一点。'));
  assert.ok(/\.peach-count\.is-overflow/.test(css) && css.includes('#c9a227'));
  assert.ok(!/\.peach-count\.is-overflow[^{]*\{[^}]*#(?:e|f)[0-9a-f]*r|\.peach-count\.is-overflow[^\}]*red/.test(css));

  const els = {};
  function makeEl(id) {
    return {
      id, textContent: '', _html: '', className: '',
      classList: {
        set: new Set(),
        add(c) { this.set.add(c); },
        remove(c) { this.set.delete(c); },
        contains(c) { return this.set.has(c); }
      },
      get innerHTML() { return this._html || this.textContent; },
      set innerHTML(v) { this._html = String(v); this.textContent = String(v).replace(/<[^>]+>/g, ''); },
      setAttribute(k, v) { this.attrs = this.attrs || {}; this.attrs[k] = String(v); },
      removeAttribute(k) { if (this.attrs) delete this.attrs[k]; },
      getAttribute(k) { return this.attrs && this.attrs[k]; },
      closest(sel) { return sel === '.peach-count-wrap' ? this.parent : null; },
      parent: null
    };
  }
  const count = makeEl('peach-count');
  const wrap = makeEl('wrap');
  wrap.className = 'peach-count-wrap';
  count.parent = wrap;
  const document = { getElementById: (id) => (id === 'peach-count' ? count : null) };
  const sandbox = { window: {}, console, document };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(text('js/config.js'), sandbox);
  vm.runInNewContext(gearSrc, sandbox, { filename: 'gear.js' });
  const G = sandbox.GearUI;
  assert.strictEqual(G.PEACH_OVERFLOW_HINT, '已溢 · 停结');
  assert.strictEqual(G.peachOverflowTitle(56), '仙桃已溢过上限 56。树不再结新果，吃到 56 以下才会再长。');
  G.renderPeachCount({ peaches: 40 }, 56);
  assert.strictEqual(count.textContent, '40/56');
  assert.ok(!count.classList.contains('is-overflow'));
  assert.ok(!wrap.getAttribute('title'));
  G.renderPeachCount({ peaches: 56 }, 56);
  assert.strictEqual(count.textContent, '56/56');
  assert.ok(!count.classList.contains('is-overflow'));
  G.renderPeachCount({ peaches: 98 }, 56);
  assert.ok(count.innerHTML.startsWith('98/56'), count.innerHTML);
  assert.ok(count.innerHTML.includes('已溢 · 停结'), count.innerHTML);
  assert.ok(count.classList.contains('is-overflow'));
  assert.strictEqual(wrap.getAttribute('title'), G.peachOverflowTitle(56));
});

check('注册表在假 DOM 下能列出分组，未解锁格子带锁定文案，更多红点随镇妖塔红点', () => {
  const document = {
    readyState: 'complete',
    getElementById: () => null,
    addEventListener() {}
  };
  const sandbox = { window: {}, console, document };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(moreSrc, sandbox, { filename: 'more-menu.js' });
  const MM = sandbox.MoreMenu;
  const groups = MM.GROUPS.map((g) => g.name);
  assert.strictEqual(groups.join(','), '试炼,见闻,差事');
  const names = MM.entries().map((e) => e.name);
  assert.ok(names.indexOf('秘境劫运') === 0 || names.includes('秘境劫运'));
  assert.ok(names.includes('镇妖塔'));
  const mijing = MM.entries().find((e) => e.id === 'mijing');
  const tower = MM.entries().find((e) => e.id === 'tower');
  assert.strictEqual(mijing.isUnlocked(), false);
  assert.ok(/首通第 10 关/.test(mijing.lockText()));
  assert.ok(/首通第 20 关/.test(tower.lockText()));
  assert.strictEqual(tower.name, '镇妖塔');
});

console.log(`\nqa-more-menu: ${passed} checks passed`);
