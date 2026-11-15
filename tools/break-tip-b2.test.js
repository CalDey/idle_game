// v140-B2：「破境未成」说明的「知道了」/ Enter 能关；有旁白或其它弹窗时排队；真正弹出才写 breakFailTipShown。
// 用 vm 抽出 game.js 里这一段函数，在假 DOM 上跑。不是浏览器验收。
// 用法：node tools/break-tip-b2.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const gameJs = fs.readFileSync(path.join(root, 'js/game.js'), 'utf8');
const stateJs = fs.readFileSync(path.join(root, 'js/state.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const start = gameJs.indexOf("  const BREAK_FAIL_TIP = ");
const end = gameJs.indexOf('  // 境界门槛「还差X重」');
assert.ok(start > 0 && end > start, '找到 showBreakFailTip 代码段');
const snippet = gameJs.slice(start, end);

function makeEl(id, cls) {
  const classes = new Set(cls || []);
  const attrs = {};
  const listeners = {};
  return {
    id,
    textContent: '',
    focused: false,
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
    },
    setAttribute: (k, v) => { attrs[k] = String(v); },
    getAttribute: (k) => (k in attrs ? attrs[k] : null),
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    fire: (t, e) => (listeners[t] || []).forEach((fn) => fn(e || {})),
    focus() { this.focused = true; },
  };
}

function setup() {
  const story = makeEl('story-modal', ['modal-backdrop']);
  const unlock = makeEl('unlock-modal', ['modal-backdrop']);
  const tip = makeEl('break-tip-modal', ['modal-backdrop']);
  const btn = makeEl('btn-close-break-tip');
  const msg = makeEl('break-tip-message');
  const byId = { 'break-tip-modal': tip, 'btn-close-break-tip': btn, 'break-tip-message': msg };
  const order = [story, unlock, tip]; // DOM 顺序
  const docListeners = {};
  const timers = [];
  let saves = 0;
  let storyOpen = false;
  const document = {
    getElementById: (id) => byId[id] || null,
    querySelector: (sel) => (sel === '.modal-backdrop.active' ? order.find((m) => m.classList.contains('active')) || null : null),
    querySelectorAll: (sel) => (sel === '.modal-backdrop.active' ? order.filter((m) => m.classList.contains('active')) : []),
    addEventListener: (t, fn) => { (docListeners[t] = docListeners[t] || []).push(fn); },
  };
  const state = { flags: { breakFailTipShown: false } };
  const sandbox = {
    document,
    window: {
      Story: { isOpen: () => storyOpen },
      Newbie: { anyModalOpen: () => order.some((m) => m.classList.contains('active')) },
    },
    GameState: { state, saveGame: () => { saves += 1; } },
    addLog: () => {},
    setInterval: (fn) => { timers.push(fn); return timers.length; },
    clearInterval: (id) => { timers[id - 1] = null; },
  };
  vm.runInNewContext(`${snippet}\nthis.api = { showBreakFailTip, closeBreakFailTip, initBreakFailTip };`, sandbox);
  sandbox.api.initBreakFailTip();
  const keydown = (key) => {
    const e = { key, code: key, defaultPrevented: false, isComposing: false, preventDefault() { this.defaultPrevented = true; } };
    (docListeners.keydown || []).forEach((fn) => fn(e));
    return e;
  };
  const tickTimers = () => timers.forEach((fn) => fn && fn());
  return {
    story, unlock, tip, btn, state, api: sandbox.api, keydown, tickTimers,
    setStoryOpen(v) { storyOpen = v; if (v) story.classList.add('active'); else story.classList.remove('active'); },
    saves: () => saves,
  };
}

let passed = 0;
function check(name, fn) { fn(); passed += 1; console.log(`ok - ${name}`); }

check('index.html：弹窗默认 aria-hidden=true，按钮仍在', () => {
  assert.match(html, /<div id="break-tip-modal" class="modal-backdrop" aria-hidden="true">/);
  assert.match(html, /id="btn-close-break-tip"[^>]*data-modal-close/);
});

check('state.js 不再在失败结算时写 breakFailTipShown；成功率/保底/损耗代码不动', () => {
  const seg = stateJs.slice(stateJs.indexOf('const firstFailTip'), stateJs.indexOf('const firstFailTip') + 200);
  assert.ok(!/breakFailTipShown\s*=\s*true/.test(seg));
  assert.match(stateJs, /state\.pityBonus = Math\.min\(0\.35, \(state\.pityBonus \|\| 0\) \+ 0\.04\);/);
  assert.match(stateJs, /const loss = Math\.floor\(Math\.min\(state\.qi, stage\.reqQi\) \* stage\.failureLossRatio\);/);
});

check('无其它弹窗：立即弹出，aria-hidden=false，写标记并存档，按钮获焦', () => {
  const t = setup();
  t.api.showBreakFailTip();
  assert.ok(t.tip.classList.contains('active'));
  assert.strictEqual(t.tip.getAttribute('aria-hidden'), 'false');
  assert.strictEqual(t.state.flags.breakFailTipShown, true);
  assert.strictEqual(t.saves(), 1);
  assert.ok(t.btn.focused);
});

check('点「知道了」关闭并设 aria-hidden=true', () => {
  const t = setup();
  t.api.showBreakFailTip();
  t.btn.fire('click');
  assert.ok(!t.tip.classList.contains('active'));
  assert.strictEqual(t.tip.getAttribute('aria-hidden'), 'true');
});

check('Enter / NumpadEnter 在它是最上层时关闭', () => {
  const t = setup();
  t.api.showBreakFailTip();
  const e = t.keydown('Enter');
  assert.ok(e.defaultPrevented);
  assert.ok(!t.tip.classList.contains('active'));
  t.api.showBreakFailTip();
  t.keydown('NumpadEnter');
  assert.ok(!t.tip.classList.contains('active'));
});

check('旁白打开时：说明排队、不写标记；旁白关后才弹', () => {
  const t = setup();
  t.setStoryOpen(true);
  t.api.showBreakFailTip();
  assert.ok(!t.tip.classList.contains('active'));
  assert.strictEqual(t.state.flags.breakFailTipShown, false, '排队期间不写标记，刷新后还能看到');
  t.tickTimers();
  assert.ok(!t.tip.classList.contains('active'));
  t.setStoryOpen(false);
  t.tickTimers();
  assert.ok(t.tip.classList.contains('active'));
  assert.strictEqual(t.state.flags.breakFailTipShown, true);
});

check('其它弹窗（机缘卡）打开时排队；重复调用不叠多个计时器', () => {
  const t = setup();
  t.unlock.classList.add('active');
  t.api.showBreakFailTip();
  t.api.showBreakFailTip();
  assert.ok(!t.tip.classList.contains('active'));
  t.unlock.classList.remove('active');
  t.tickTimers();
  assert.ok(t.tip.classList.contains('active'));
  assert.strictEqual(t.saves(), 1);
});

check('旁白盖在说明上时 Enter 不关说明', () => {
  const t = setup();
  t.api.showBreakFailTip();
  t.setStoryOpen(true);
  t.keydown('Enter');
  assert.ok(t.tip.classList.contains('active'));
  t.setStoryOpen(false);
  t.btn.fire('click');
  assert.ok(!t.tip.classList.contains('active'), '旁白关掉后「知道了」有效');
});

check('game.js init 里绑定了说明的关闭', () => {
  assert.match(gameJs, /initBreakthroughPanelVar\(\);\n\s*initBreakFailTip\(\);/);
  assert.ok(!/getImageData/.test(gameJs));
});

console.log(`\n${passed} checks passed`);
