// 手机第 13/14 轮（v143）：≤440px 专用规则（图鉴分类两行、触控区 ≥44、仙缘/轮回字号、底栏间距、
// 首页道途入口「道途 + 状态」、灵兽左移、说明左右安全边距）+ 全宽度：载入 20 秒内不出机缘。
// 静态 CSS 检查 + 假 DOM 跑 idle-events / home-fortune 的载入宽限期。不是视觉验收。
// 用法：node tools/mobile-r13.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const text = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const css = text('css/style.css').replace(/\/\*[\s\S]*?\*\//g, '');
const html = text('index.html');
const pathJs = text('js/path.js');

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
const narrow = blocks.filter((b) => /^\(max-width:\s*440px\)$/.test(b.query));
const r13 = narrow.find((b) => /\.codex-tabs\s*\{/.test(b.body));
const home = narrow.find((b) => /--bt-panel-h/.test(b.body));

let passed = 0;
function check(name, fn) { fn(); passed += 1; console.log(`ok - ${name}`); }

check('r13 规则在 (max-width: 440px) 块里（440 含在内），写在文件末尾', () => {
  assert.ok(r13, '找到 r13 窄屏块');
  assert.ok(home, '找到首屏窄屏块');
  assert.ok(r13.start > css.indexOf('.codex-tabs {'));
  assert.ok(r13.start > css.indexOf('.setting-check {'));
});

check('桌面基础规则不变（图鉴/按钮/关闭/勾选/仙缘/闯关/轮回/道途）', () => {
  const ct = rule(base, '.codex-tabs');
  assert.match(ct, /overflow-x:\s*auto/);
  assert.match(ct, /scrollbar-width:\s*none/);
  assert.ok(!/flex-wrap/.test(ct));
  assert.match(rule(base, '.codex-tab'), /font-size:\s*13px/);
  assert.match(rule(base, '.codex-tab'), /padding:\s*4px 10px/);
  assert.match(rule(base, '.btn.btn-sm'), /min-height:\s*32px/);
  assert.match(rule(base, '.home-modal-close'), /width:\s*32px/);
  assert.match(rule(base, '.home-modal-close'), /height:\s*32px/);
  assert.ok(!/min-height/.test(rule(base, '.setting-check')));
  assert.match(rule(base, '.setting-check input'), /width:\s*18px/);
  assert.match(rule(base, '.stage-bond-row'), /height:\s*18px/);
  assert.match(rule(base, '.bond-chip'), /height:\s*16px/);
  assert.match(rule(base, '.bond-chip'), /font-size:\s*10px/);
  assert.ok(!/padding-bottom/.test(rule(base, '.stage-body')));
  assert.match(rule(base, '.gear-locked-text'), /font-size:\s*13px/);
  assert.match(rule(base, '.lock-chain'), /font-size:\s*10\.5px/);
  assert.match(rule(base, '.upgrade-desc'), /font-size:\s*11px/);
  assert.match(rule(base, '.path-entry .path-entry-short'), /display:\s*none/, '新增的窄屏标签在桌面隐藏');
  assert.match(rule(base, '.path-entry .home-upgrade-badge'), /top:\s*2px/);
  assert.match(rule(base, '.beast-companion'), /right:\s*4px/);
  assert.ok(!/\.codex-tabs-wrap[^{]*\{[^}]*\}/.test(r13.body), 'r13 不改渐隐层（仍在溢出时由 JS 打开）');
});

check('P1 图鉴分类：窄屏换两行、全部可见、不显示滚动条', () => {
  const ct = rule(r13.body, '.codex-tabs');
  assert.match(ct, /flex-wrap:\s*wrap/);
  assert.match(ct, /overflow-x:\s*visible/);
  assert.match(rule(r13.body, '.codex-tab'), /font-size:\s*12px/);
  assert.match(css, /\.codex-tabs::-webkit-scrollbar\s*\{\s*display:\s*none/);
});

check('P1 触控区 ≥44：择此道途/改道按钮、关闭 ×（::before inset -6px → 44）、设置勾选框', () => {
  assert.match(rule(r13.body, '.path-card .btn'), /min-height:\s*44px/);
  assert.match(rule(r13.body, '.modal-dialog .home-modal-close::before'), /inset:\s*-6px/);
  const sc = rule(r13.body, '.setting-check');
  assert.match(sc, /min-height:\s*44px/);
  assert.match(sc, /min-width:\s*44px/);
  assert.match(html, /<label class="setting-check">\s*<input id="chk-music"/);
});

check('P2 仙缘标签/轮回说明加大；挑战与领取离底栏留安全距离', () => {
  assert.match(rule(r13.body, '.stage-bond-row .bond-chip'), /font-size:\s*11\.5px/);
  assert.match(rule(r13.body, '#tab-reincarnate .gear-locked-text'), /font-size:\s*14px/);
  assert.match(rule(r13.body, '#tab-reincarnate .breakthrough-info'), /font-size:\s*13px/);
  assert.match(rule(r13.body, '#tab-stage .stage-body'), /padding-bottom:\s*max\(10px,\s*env\(safe-area-inset-bottom/);
  assert.match(rule(r13.body, '#tab-stage .stage-action-row'), /margin-bottom:\s*4px/);
});

check('A 首页道途入口：窄屏只显示「道途」+ 状态小字，nowrap、固定最小宽，红点在右上角外侧', () => {
  const b = home.body;
  const pe = rule(b, '#tab-cultivate>.gufeng-card .path-entry');
  assert.match(pe, /white-space:\s*nowrap/);
  assert.match(pe, /min-width:\s*64px/);
  assert.ok(!/white-space:\s*normal/.test(pe));
  assert.match(rule(b, '#tab-cultivate>.gufeng-card .path-entry #path-entry-text'), /display:\s*none/);
  assert.match(rule(b, '#tab-cultivate>.gufeng-card .path-entry .path-entry-short'), /display:\s*inline-flex/);
  assert.match(rule(b, '#tab-cultivate>.gufeng-card .path-entry .path-entry-status'), /white-space:\s*nowrap/);
  const badge = rule(b, '#tab-cultivate>.gufeng-card .path-entry .home-upgrade-badge');
  assert.match(badge, /top:\s*-4px/);
  assert.match(badge, /right:\s*-4px/);
  assert.ok(!/word-break|overflow-wrap:\s*anywhere/.test(pe));
  assert.match(html, /<span id="path-entry-text">本命道途<\/span><span class="path-entry-short" aria-hidden="true"><span class="path-entry-short-label">道途<\/span><span id="path-entry-status" class="path-entry-status"><\/span><\/span>/);
});

check('A path.js：状态取「 · 」后的部分；完整文字写进 title / aria-label', () => {
  const src = pathJs.slice(pathJs.indexOf('  function entryStatusOf'), pathJs.indexOf('  function setEntryStatus'));
  const f = vm.runInNewContext(`(function(){${src}; return entryStatusOf;})()`);
  assert.strictEqual(f('本命道途 · 待择道'), '待择道');
  assert.strictEqual(f('本命道途 · 剑道 5/9'), '剑道 5/9');
  assert.strictEqual(f('化灵初开启'), '化灵初开启');
  assert.match(pathJs, /els\.entry\.setAttribute\('title', text\)/);
  assert.match(pathJs, /els\.entry\.setAttribute\('aria-label', text\)/);
});

check('B/C 灵兽左移 10px 且在说明两行之上；说明左右各留 ≥16px', () => {
  const beast = rule(home.body, '#tab-cultivate .beast-companion');
  assert.match(beast, /right:\s*calc\(max\(6px,\s*env\(safe-area-inset-right,\s*0px\)\)\s*\+\s*10px\)/);
  assert.match(beast, /\+\s*38px\)/);
  const cap = rule(home.body, '#tab-cultivate .meditation-caption');
  assert.match(cap, /padding-left:\s*max\(16px/);
  assert.match(cap, /padding-right:\s*max\(16px/);
});

// ---------- D：载入宽限期（全宽度） ----------
function fakeEl() {
  const classes = new Set();
  const listeners = {};
  return {
    hidden: true, textContent: '', innerHTML: '',
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c), toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) },
    setAttribute() {}, appendChild() {},
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    fire: (t) => (listeners[t] || []).forEach((fn) => fn({ target: null })),
  };
}

check('D idle-events：载入 20 秒内不刷出、不显示、不打开；过后照常', () => {
  let now = 5_000_000;
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { super(...(a.length ? a : [now])); }
    static now() { return now; }
  }
  const ids = ['btn-idle-event', 'idle-event-modal', 'idle-event-title', 'idle-event-text', 'idle-event-options', 'idle-event-result', 'btn-close-idle-event'];
  const els = {};
  ids.forEach((id) => { els[id] = fakeEl(); });
  const timers = [];
  const state = { realmIndex: 30, playTimeMs: 99 * 60 * 60 * 1000, stage: { best: 200, cur: 200 }, lifeBestStage: 200, idleEvents: { v: 1, nextAt: 0, pending: null, recent: [] } };
  const sandbox = {
    Date: FakeDate, console, Math,
    setInterval: (fn) => { timers.push(fn); return timers.length; },
    document: { readyState: 'complete', visibilityState: 'visible', getElementById: (id) => els[id] || null, addEventListener() {}, createElement: () => fakeEl() },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  ['js/config.js', 'js/events-data.js'].forEach((rel) => vm.runInNewContext(text(rel), sandbox, { filename: rel }));
  sandbox.GameState = { state, saveGame() {}, getQiPerSec: () => 1, getStonePerSec: () => 1 };
  vm.runInNewContext(text('js/idle-events.js'), sandbox, { filename: 'idle-events.js' });
  assert.strictEqual(sandbox.IdleEvents.LOAD_GRACE_MS, 20000);
  const tick = timers[0];
  assert.ok(typeof tick === 'function');
  assert.strictEqual(state.idleEvents.pending, null, '载入当下不刷出');
  assert.strictEqual(els['btn-idle-event'].hidden, true);
  for (let t = 0; t < 19; t += 1) { now += 1000; tick(); }
  assert.strictEqual(state.idleEvents.pending, null, '19 秒内不刷出');
  assert.strictEqual(els['btn-idle-event'].hidden, true);
  els['btn-idle-event'].fire('click');
  assert.ok(!els['idle-event-modal'].classList.contains('active'), '宽限期内点不开');
  now += 1500; tick();
  assert.ok(state.idleEvents.pending, '20 秒后照常刷出');
  assert.strictEqual(els['btn-idle-event'].hidden, false);
});

check('D idle-events：旧档带待处理机缘，20 秒内也不显示入口', () => {
  let now = 7_000_000;
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { super(...(a.length ? a : [now])); }
    static now() { return now; }
  }
  const ids = ['btn-idle-event', 'idle-event-modal', 'idle-event-title', 'idle-event-text', 'idle-event-options', 'idle-event-result', 'btn-close-idle-event'];
  const els = {};
  ids.forEach((id) => { els[id] = fakeEl(); });
  const timers = [];
  const sandbox = {
    Date: FakeDate, console, Math,
    setInterval: (fn) => { timers.push(fn); return timers.length; },
    document: { readyState: 'complete', visibilityState: 'visible', getElementById: (id) => els[id] || null, addEventListener() {}, createElement: () => fakeEl() },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  ['js/config.js', 'js/events-data.js'].forEach((rel) => vm.runInNewContext(text(rel), sandbox, { filename: rel }));
  const state = { realmIndex: 30, playTimeMs: 1000, stage: { best: 200 }, idleEvents: { v: 1, nextAt: 10 ** 12, pending: null, recent: [] } };
  sandbox.GameState = { state, saveGame() {}, getQiPerSec: () => 1, getStonePerSec: () => 1 };
  vm.runInNewContext(text('js/idle-events.js'), sandbox, { filename: 'idle-events.js' });
  const id = sandbox.IdleEvents.allEvents()[0].id;
  state.idleEvents.pending = { id, pool: 'idle', at: 1 };
  timers[0]();
  assert.strictEqual(els['btn-idle-event'].hidden, true);
  now += 20001; timers[0]();
  assert.strictEqual(els['btn-idle-event'].hidden, false);
});

check('D home-fortune：同样有 20 秒载入宽限（刷出/入口/打开都受限）', () => {
  const hf = text('js/home-fortune.js');
  assert.match(hf, /const LOAD_GRACE_MS = 20 \* 1000;/);
  assert.match(hf, /const has = !inLoadGrace\(\) && /);
  assert.match(hf, /function openModal\(\) \{\n\s*if \(inLoadGrace\(\)\) return;/);
  assert.match(hf, /if \(inLoadGrace\(\)\) \{\n\s*renderMarker\(\);\n\s*return;\n\s*\}/);
  assert.match(hf, /loadedAt = Date\.now\(\);/);
});

console.log(`\n${passed} checks passed`);
