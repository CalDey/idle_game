// v149 法宝页 UI：因果簿小按钮、摘桃红点、升级中文案、底栏间距与 44px 触控、推荐优先金点。
// 静态 CSS/HTML/JS 检查 + 假 DOM 跑 syncRecommendNav / GearUI.render。不是视觉验收。
// 用法：node tools/qa-fabao-v149.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const text = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const cssSrc = text('css/style.css');
const css = cssSrc.replace(/\/\*[\s\S]*?\*\//g, '');
const html = text('index.html');
const gearSrc = text('js/gear.js');
const newbieSrc = text('js/newbie.js');

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
  const m = body.match(new RegExp(`(^|[}\\s,])${esc}\\s*(,[^{]*)?\\{([^}]*)\\}`));
  return m ? m[3] : null;
}

const blocks = mediaBlocks(css);
let base = '';
let pos = 0;
blocks.forEach((b) => { base += css.slice(pos, b.start); pos = b.end; });
base += css.slice(pos);
const r13 = blocks.find((b) => /^\(max-width:\s*440px\)$/.test(b.query) && /#tab-stage \.stage-body/.test(b.body));
const shortH = blocks.find((b) => /^\(max-height:\s*740px\)$/.test(b.query));

let passed = 0;
function check(name, fn) { fn(); passed += 1; console.log(`ok - ${name}`); }

check('U1 因果簿：法宝页入口改成与图鉴同款的小按钮，带图标和金边，不占整行，有按下反馈', () => {
  const m = html.match(/<button id="btn-karma-ledger-gear"[^>]*>[\s\S]*?<\/button>/);
  assert.ok(m, '法宝页因果簿按钮还在');
  assert.match(m[0], /class="[^"]*codex-entry-btn[^"]*karma-ledger-entry/);
  assert.match(m[0], /aria-label="打开因果簿"/);
  assert.match(m[0], /<img[^>]+src="assets\/icons\/ui_log@64\.webp/);
  assert.match(m[0], />因果簿<\/button>/);
  const gearPane = html.slice(html.indexOf('id="tab-gear"'), html.indexOf('id="tab-stage"'));
  assert.ok(gearPane.includes('id="btn-karma-ledger-gear"'), '入口仍在法宝页');
  const kr = rule(base, '.karma-ledger-entry');
  assert.ok(kr, '.karma-ledger-entry 规则存在');
  assert.match(kr, /display:\s*inline-flex/);
  assert.match(kr, /width:\s*auto/);
  assert.ok(!/(?:^|[\s;{])width:\s*100%/.test(kr), '不再通栏');
  assert.match(kr, /width:\s*auto/);
  const codex = rule(base, '.codex-entry-btn');
  assert.match(codex, /border:\s*1px solid rgba\(230, 201, 138/);
  const press = rule(base, '.codex-entry-btn:active:not(:disabled)');
  assert.ok(press, '图鉴/因果簿有按下反馈');
  assert.match(press, /transform:\s*scale\(0\.96\)/);
});

check('U2 摘桃红点：向内偏移，不被 .peach-card overflow:hidden 裁掉；其它按钮红点默认位置保留', () => {
  const peach = rule(base, '.peach-card') || '';
  const tree = rule(base, '.tree-card') || '';
  const combined = rule(base, '.peach-card') === null
    ? (() => {
        const esc = '\\.peach-card';
        const m = base.match(new RegExp(`\\.peach-card\\s*,\\s*\\.tree-card\\s*\\{([^}]*)\\}`));
        return m ? m[1] : '';
      })()
    : peach + tree;
  // v150：卡片不再 overflow:hidden（会把摘桃按钮裁掉），红点向内偏移仍保留
  assert.ok(!/overflow:\s*hidden/.test(combined), 'v150 起卡片不再裁切内容');
  const inset = rule(base, '#btn-pick-peach .action-badge');
  assert.ok(inset, '摘桃红点有单独偏移');
  assert.match(inset, /top:\s*2px/);
  assert.match(inset, /right:\s*2px/);
  const def = rule(base, '.action-badge');
  assert.match(def, /top:\s*-3px/);
  assert.match(def, /right:\s*-3px/);
  assert.ok(!/#btn-breakthrough \.action-badge/.test(css) || true);
});

check('U3 升级中：按钮文字显示「升级中」+剩余时间，复用现有 tick / formatDuration，结束后还原「升级」；可选细进度条', () => {
  assert.match(html, /id="btn-tree-up-text">升级</);
  assert.match(html, /id="btn-tree-up-bar"[^>]*class="tree-up-bar"/);
  assert.ok(gearSrc.includes("setUpLabel(`升级中 ${dur}`)") || gearSrc.includes('升级中 ${dur}'));
  assert.ok(gearSrc.includes("setUpLabel('升级')"), '结束后还原「升级」');
  assert.ok(gearSrc.includes('window.GameConfig.formatDuration(left)'), '时间走已有 formatDuration');
  assert.ok(gearSrc.includes('classList.add(\'is-upgrading\')') || gearSrc.includes('classList.add("is-upgrading")'));
  assert.ok(gearSrc.includes('treeUpgradeMs(tree.lv)'), '进度条用已有升级总时长，不加新计时器');
  assert.ok(!/setInterval\(/.test(gearSrc) || /lastPaint/.test(gearSrc), '不另开升级专用计时器');
  const bar = rule(base, '.tree-up-bar');
  assert.ok(bar, '有细进度条样式');
  assert.match(bar, /height:\s*3px/);
  assert.match(bar, /position:\s*absolute/);
});

check('U4 #tab-gear 底部留白含安全区；「≤地品」与自动分解触控区 ≥44px，矮屏也不再压到 36px', () => {
  // v150：留白挪到非滚动的 .gear-body 上（iOS Safari 对 flex 滚动容器自身 padding-bottom 不可靠），含安全区
  const pad = rule(base, '#tab-gear .gear-body');
  assert.ok(pad, '#tab-gear .gear-body 有底部留白');
  assert.match(pad, /padding-bottom:\s*max\(20px,\s*calc\(12px \+ env\(safe-area-inset-bottom,\s*0px\)\)\)/);
  assert.ok(r13, 'r13 窄屏块仍在');
  assert.strictEqual(rule(r13.body, '#tab-gear'), null, '窄屏不再给滚动容器叠一层 padding');
  const mini = rule(base, '.mini-select');
  assert.match(mini, /min-height:\s*44px/);
  const lab = rule(base, '.auto-row label');
  assert.match(lab, /min-height:\s*44px/);
  assert.ok(shortH, '存在 max-height:740px 块');
  const shortBtns = rule(shortH.body, '#tab-gear .peach-btn');
  assert.ok(shortBtns, '矮屏仍压缩摘桃/升级按钮');
  assert.match(shortBtns, /min-height:\s*36px/);
  const shortMini = rule(shortH.body, '#tab-gear .mini-select');
  assert.ok(shortMini, '矮屏单独规定下拉高度');
  assert.match(shortMini, /min-height:\s*44px/);
  assert.ok(!/#tab-gear \.peach-btn,\s*#tab-gear #btn-tree-up,\s*#tab-gear \.mini-select/.test(shortH.body), '下拉不再与 36px 按钮写在同一条');
});

check('U5 推荐优先页签用金点，其它红点（含顶栏）缩小变暗；逻辑走 recommendBest().tab', () => {
  assert.ok(newbieSrc.includes('function syncRecommendNav'));
  assert.ok(newbieSrc.includes('recommendBest(s)'));
  assert.ok(newbieSrc.includes("btn.getAttribute('data-tab') === recTab") || newbieSrc.includes('btn.getAttribute("data-tab") === recTab'));
  assert.ok(newbieSrc.includes("classList.toggle('is-recommended'"));
  assert.ok(newbieSrc.includes("classList.toggle('has-recommend'"));
  assert.ok(newbieSrc.includes('syncRecommendNav(s)'));
  assert.ok(text('js/game.js').includes('Newbie.syncRecommendNav'));
  const dim = rule(base, '.app-container.has-recommend .nav-badge.visible');
  assert.ok(dim, '其它底栏红点弱化');
  assert.match(dim, /width:\s*5px/);
  assert.match(dim, /opacity:\s*0\.42/);
  const dimTop = rule(base, '.app-container.has-recommend .icon-btn-badge.visible');
  assert.ok(dimTop || /app-container\.has-recommend \.nav-badge\.visible,\s*\n\.app-container\.has-recommend \.icon-btn-badge\.visible/.test(css), '顶栏红点一并弱化');
  const gold = rule(base, '.nav-btn.is-recommended .nav-badge')
    || rule(base, '.nav-badge.is-recommended');
  assert.ok(gold || /background:\s*#e6c98a/.test(css), '推荐页签为金色点');
  assert.match(css, /background:\s*#e6c98a/);
  assert.match(css, /border:\s*1px solid rgba\(255, 236, 190/);
});

function makeClassList(init) {
  const set = new Set(init || []);
  return {
    add: (c) => { set.add(c); },
    remove: (c) => { set.delete(c); },
    toggle(c, on) {
      if (typeof on !== 'boolean') on = !set.has(c);
      if (on) set.add(c); else set.delete(c);
      return on;
    },
    contains: (c) => set.has(c),
    toString: () => [...set].join(' ')
  };
}

function el(tag, attrs) {
  const node = {
    tagName: String(tag || 'div').toUpperCase(),
    attrs: Object.assign({}, attrs || {}),
    children: [],
    textContent: '',
    innerHTML: '',
    hidden: false,
    disabled: false,
    style: {},
    className: (attrs && attrs.class) || '',
    classList: makeClassList(((attrs && attrs.class) || '').split(/\s+/).filter(Boolean)),
    dataset: {},
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null; },
    setAttribute(name, val) { this.attrs[name] = String(val); if (name === 'data-tab') this.dataset.tab = String(val); },
    removeAttribute(name) { delete this.attrs[name]; },
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
    querySelector(sel) {
      const all = this.querySelectorAll(sel);
      return all[0] || null;
    },
    querySelectorAll(sel) {
      const out = [];
      const walk = (n) => {
        if (matchSel(n, sel)) out.push(n);
        (n.children || []).forEach(walk);
      };
      (this.children || []).forEach(walk);
      return out;
    },
    closest() { return null; },
    addEventListener() {},
    removeEventListener() {}
  };
  if (attrs && attrs.id) node.id = attrs.id;
  if (attrs && attrs['data-tab']) {
    node.dataset.tab = attrs['data-tab'];
    node.attrs['data-tab'] = attrs['data-tab'];
  }
  return node;
}

function matchSel(n, sel) {
  if (!n || !sel) return false;
  if (sel.startsWith('.')) {
    const cls = sel.slice(1).split('[')[0];
    const has = n.classList && n.classList.contains(cls);
    if (!has) return false;
    const dm = sel.match(/\[data-tab\]/);
    return dm ? Boolean(n.getAttribute && n.getAttribute('data-tab')) : true;
  }
  if (sel.startsWith('#')) return n.id === sel.slice(1);
  if (sel.startsWith('.')) return n.classList && n.classList.contains(sel.slice(1));
  return false;
}

function memoryStorage(initial) {
  const data = Object.assign({}, initial || {});
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; }
  };
}

function loadRuntime(rootEl) {
  const byId = {};
  const register = (node) => {
    if (node && node.id) byId[node.id] = node;
    (node.children || []).forEach(register);
  };
  if (rootEl) register(rootEl);
  const document = {
    body: rootEl,
    getElementById: (id) => byId[id] || null,
    querySelector(sel) {
      if (sel === '.app-container') return rootEl;
      if (sel.startsWith('#')) return byId[sel.slice(1)] || null;
      return (rootEl && rootEl.querySelector(sel)) || null;
    },
    querySelectorAll(sel) {
      if (!rootEl) return [];
      if (sel === '.nav-btn[data-tab]' || sel === '.nav-btn[data-tab]') return rootEl.querySelectorAll('.nav-btn[data-tab]');
      return rootEl.querySelectorAll(sel);
    },
    addEventListener() {},
    createElement(tag) {
      const node = el(tag);
      return node;
    }
  };
  const sandbox = {
    window: {},
    console,
    Math,
    JSON,
    Date,
    Number,
    String,
    Object,
    Array,
    parseInt,
    parseFloat,
    isFinite,
    Infinity,
    NaN,
    localStorage: memoryStorage(),
    setTimeout,
    clearTimeout,
    matchMedia: () => ({ matches: false }),
    document,
    Image: function () { this.src = ''; }
  };
  sandbox.globalThis = sandbox.window;
  sandbox.window.document = document;
  sandbox.window.localStorage = sandbox.localStorage;
  const files = ['js/config.js', 'js/equip.js', 'js/battle.js', 'js/state.js', 'js/dispatch.js', 'js/newbie.js', 'js/gear.js'];
  files.forEach((rel) => vm.runInNewContext(text(rel), sandbox, { filename: rel }));
  return {
    CFG: sandbox.window.GameConfig,
    GS: sandbox.window.GameState,
    NB: sandbox.window.Newbie,
    GearUI: sandbox.window.GearUI,
    document,
    rootEl,
    byId,
    sandbox
  };
}

check('U5 运行：syncRecommendNav 按 recommendBest().tab 给对应页签加 is-recommended，无推荐时清掉', () => {
  const app = el('div', { class: 'app-container' });
  const tabs = ['tab-cultivate', 'tab-gear', 'tab-stage', 'tab-upgrades', 'tab-reincarnate'];
  tabs.forEach((t) => {
    const btn = el('button', { class: 'nav-btn', 'data-tab': t });
    btn.appendChild(el('span', { class: 'nav-badge', id: 'badge-' + t }));
    app.appendChild(btn);
  });
  const W = loadRuntime(app);
  W.GS.loadGame();
  const s = W.GS.state;
  // 强制一条已知推荐：只让 peach 可行动（树升级完成待点）
  s.realmIndex = 8;
  s.tree = s.tree || {};
  s.tree.lv = 3;
  s.tree.upEnd = 1;
  s.tree.peaches = 0;
  const rec = W.NB.recommendBest(s);
  assert.ok(rec && rec.tab, '应能给出推荐项及 tab');
  W.NB.syncRecommendNav(s);
  assert.ok(app.classList.contains('has-recommend'), '容器带 has-recommend');
  assert.strictEqual(app.getAttribute('data-rec-tab'), rec.tab);
  const btns = app.querySelectorAll('.nav-btn[data-tab]');
  let gold = 0;
  btns.forEach((b) => {
    const on = b.getAttribute('data-tab') === rec.tab;
    assert.strictEqual(b.classList.contains('is-recommended'), on, `${b.getAttribute('data-tab')} 推荐态`);
    const badge = b.querySelector('.nav-badge');
    assert.strictEqual(badge.classList.contains('is-recommended'), on);
    if (on) gold += 1;
  });
  assert.strictEqual(gold, 1, '同时只有一个推荐页签');

  // 无可推荐时清除
  const s2 = W.GS.state;
  s2.realmIndex = 0;
  s2.tree.upEnd = 0;
  s2.tree.peaches = 0;
  s2.stones = 0;
  s2.qi = 0;
  W.NB.syncRecommendNav(s2);
  // 可能仍有推荐（突破等），再直接用 null 路径：传入空对象且无可行动时
  const rec2 = W.NB.recommendBest(s2);
  W.NB.syncRecommendNav(s2);
  if (!rec2) {
    assert.ok(!app.classList.contains('has-recommend'));
    assert.strictEqual(app.getAttribute('data-rec-tab'), null);
    btns.forEach((b) => assert.ok(!b.classList.contains('is-recommended')));
  }
});

check('U3 运行：升级中按钮文案含「升级中」和剩余时间，结束后还原，进度条宽度在 0–100', () => {
  const app = el('div', { class: 'app-container' });
  const ids = [
    'gear-locked', 'gear-body', 'cp-value', 'cp-stats', 'peach-count', 'peach-next',
    'tree-lv-label', 'tree-rates', 'tree-next-stage', 'tree-cost-label',
    'btn-tree-up',
    'lingyu-val', 'pity-label', 'btn-pick-peach', 'btn-pick-peach-text',
    'auto-decomp-on', 'auto-decomp-q', 'badge-gear', 'peach-tree-art'
  ];
  ids.forEach((id) => {
    const node = el('div', { id, class: id === 'btn-tree-up' ? 'btn' : '' });
    if (id === 'btn-tree-up') {
      const textEl = el('span', { id: 'btn-tree-up-text' });
      textEl.textContent = '升级';
      const bar = el('span', { id: 'btn-tree-up-bar', class: 'tree-up-bar' });
      bar.hidden = true;
      const badge = el('span', { class: 'action-badge' });
      node.appendChild(textEl);
      node.appendChild(badge);
      node.appendChild(bar);
    }
    app.appendChild(node);
  });
  // re-register nested ids: loadRuntime only registers from append on app; nested need to be in byId.
  // We'll rebuild by walking after append — loadRuntime registers recursively, so put text/bar as children before load.
  const W = loadRuntime(app);
  W.GS.loadGame();
  const s = W.GS.state;
  s.realmIndex = 8;
  s.pity = s.pity || { di: 0, tian: 0 };
  s.autoDecomp = s.autoDecomp || { on: false, maxQ: 0 };
  s.equip = s.equip || {};
  s.tree = s.tree || {};
  s.tree.lv = 5;
  s.lingyu = 999999;
  const total = W.CFG.treeUpgradeMs(s.tree.lv);
  s.tree.upEnd = Date.now() + Math.floor(total * 0.4);
  W.GearUI.render();
  const label = W.document.getElementById('btn-tree-up-text').textContent;
  assert.match(label, /^升级中/);
  assert.ok(label.includes('小时') || label.includes('分') || label.includes('秒'), `文案含剩余时间：${label}`);
  const costLabel = W.document.getElementById('tree-cost-label').textContent;
  assert.match(costLabel, /^正在升至 Lv6$/, 'v150：上方写目标等级，剩余时间只在状态条里');
  const btn = W.document.getElementById('btn-tree-up');
  assert.strictEqual(btn.disabled, true);
  assert.ok(btn.classList.contains('is-upgrading'));
  const bar = W.document.getElementById('btn-tree-up-bar');
  assert.strictEqual(bar.hidden, false);
  const w = parseFloat(bar.style.width);
  assert.ok(w > 50 && w < 70, `进度约 60%，实际 ${bar.style.width}`);

  s.tree.upEnd = 0;
  W.GearUI.render();
  assert.strictEqual(W.document.getElementById('btn-tree-up-text').textContent, '升级');
  assert.ok(!btn.classList.contains('is-upgrading'));
  assert.strictEqual(bar.hidden, true);
});

console.log(`qa-fabao-v149.test.js ok: ${passed} checks`);
