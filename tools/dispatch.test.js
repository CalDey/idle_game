// 仙姬派遣：悬赏榜按日期确定性刷新、真实时间计时（刷新/离线后仍有效）、奖励折算与上限、
// 不发灵气/道果（不影响转世）、轮回保留与灵石封顶、旧存档迁移与坏数据修复、出战队伍与派遣互斥（不重复占用），
// 以及洞府入口 + 派遣弹窗的无浏览器冒烟（vm + 极简假 DOM，不使用 getImageData / 浏览器自动化）。
// 用法：node tools/dispatch.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const text = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const H = 3600 * 1000;
const T0 = new Date(2026, 10, 15, 9, 0, 0).getTime(); // 本地 2026-11-15 09:00

function memoryStorage(initial) {
  const data = Object.assign({}, initial || {});
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    _data: data
  };
}

function makeClock(start) {
  const clock = { now: start };
  class FakeDate extends Date {
    constructor(...a) { if (a.length) super(...a); else super(clock.now); }
    static now() { return clock.now; }
  }
  clock.Date = FakeDate;
  return clock;
}

// 逻辑运行时（无 DOM）：config/equip/state/titles/battle/bonds/dispatch
function runtime(opts) {
  const o = opts || {};
  const clock = o.clock || makeClock(T0);
  const sandbox = { window: {}, console, localStorage: o.storage || memoryStorage(), Date: clock.Date };
  sandbox.globalThis = sandbox.window;
  sandbox.window.Date = clock.Date;
  ['config', 'equip', 'state', 'titles', 'battle', 'bonds', 'dispatch'].forEach((f) => vm.runInNewContext(text(`js/${f}.js`), sandbox, { filename: `${f}.js` }));
  return { W: sandbox.window, clock, storage: sandbox.localStorage };
}

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const R0 = runtime();
const D = R0.W.Dispatch;
const CFG = R0.W.GameConfig;
const ALL = CFG.HEROES.map((h) => h.id);
const SQUAD = ['lanyi', 'cloak', 'saintess', 'miko', 'shuanghua', 'sweetmaid'];

function freshState(W, best) {
  const GS = W.GameState;
  GS.loadGame();
  const s = GS.state;
  s.stage.best = best == null ? 30 : best;
  s.stage.cur = s.stage.best + 1;
  s.squad = SQUAD.slice();
  s.unlockedHeroes = ALL.slice();
  s.createdAt = 123456789;
  return s;
}

function pickFor(s, mission) {
  const avail = D.availableHeroes(s);
  const ok = avail.filter((id) => D.meetsQuality(id, mission.minQ));
  const ids = [ok[0]];
  if (mission.need === 2) ids.push(avail.find((id) => id !== ok[0]));
  return ids;
}

check('悬赏榜：每日 4 条、模板不重复、时长 2~8 小时（不超过离线上限）、同日期同存档结果一致', () => {
  const cap = CFG.OFFLINE_CAP_SECONDS || 12 * 3600;
  const seen = new Set();
  for (let day = 0; day < 60; day++) {
    const key = D.todayKey(T0 + day * 24 * H);
    const a = D.buildBoard(key, 42);
    const b = D.buildBoard(key, 42);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), '确定性');
    assert.strictEqual(a.length, 4);
    assert.strictEqual(new Set(a.map((m) => m.tpl)).size, 4);
    a.forEach((m) => {
      assert.ok([2, 4, 6, 8].includes(m.h) && m.h * 3600 <= cap);
      assert.strictEqual(m.need, m.h >= 6 ? 2 : 1);
      assert.ok(D.TPL_MAP[m.tpl].tags.includes(m.tag));
      assert.ok(m.minQ === null || m.minQ === 'di' || m.minQ === 'tian');
    });
    assert.ok(a.reduce((n, m) => n + m.need, 0) <= 8, '最多同时占用 8 人，不需要 6+ 人以外的额外角色');
    seen.add(JSON.stringify(a.map((m) => m.tpl)));
  }
  assert.ok(seen.size >= 40, `60 天内悬赏榜组合足够多样：${seen.size}`);
  assert.notDeepStrictEqual(JSON.parse(JSON.stringify(D.buildBoard('2026-11-15', 1))), JSON.parse(JSON.stringify(D.buildBoard('2026-11-15', 2))), '不同存档种子不同');
});

check('跨日刷新：本地日期变化才刷新；已派出的任务跨日保留；刷新/读档前后榜单不变', () => {
  const { W, clock } = runtime();
  const s = freshState(W);
  const d0 = D.ensureState(s, clock.now);
  const board0 = JSON.stringify(d0.board);
  const m = d0.board[0];
  assert.ok(W.Dispatch.start(s, m.slot, pickFor(s, m), { now: clock.now, stonePerSec: 10 }).ok);
  // 当日再 ensure（例如每秒 tick、读档）不改变榜单，已接标记保留
  const again = W.Dispatch.ensureState(JSON.parse(JSON.stringify(s)), clock.now + 5 * H);
  assert.strictEqual(JSON.stringify(again.board.map((b) => Object.assign({}, b, { taken: false }))), JSON.stringify(JSON.parse(board0).map((b) => Object.assign({}, b, { taken: false }))));
  assert.ok(again.board[0].taken);
  // 次日刷新
  const next = new Date(2026, 10, 16, 0, 0, 1).getTime();
  const d1 = W.Dispatch.ensureState(s, next);
  assert.strictEqual(d1.date, '2026-11-16');
  assert.notStrictEqual(JSON.stringify(d1.board), board0);
  assert.ok(d1.board.every((b) => !b.taken), '新一天的悬赏都可接');
  assert.strictEqual(d1.active.length, 1, '昨日任务保留');
  assert.strictEqual(JSON.stringify(d1.board), JSON.stringify(W.Dispatch.buildBoard('2026-11-16', s.createdAt)));
});

check('计时：真实时间到点才可领取；存档→读档（离线 9 小时）后直接可领；时钟回拨重新计时', () => {
  const storage = memoryStorage();
  const clock = makeClock(T0);
  const A = runtime({ storage, clock });
  const s = freshState(A.W);
  const d = A.W.Dispatch.ensureState(s, clock.now);
  const m = d.board.find((b) => b.h >= 4) || d.board[0];
  const res = A.W.Dispatch.start(s, m.slot, pickFor(s, m), { now: clock.now, stonePerSec: 5 });
  assert.ok(res.ok, res.message);
  const id = res.mission.id;
  assert.strictEqual(res.mission.endAt - res.mission.startAt, m.h * H);
  clock.now = T0 + m.h * H - 1000;
  const early = A.W.Dispatch.claim(s, id, { now: clock.now, stonePerSec: 5 });
  assert.ok(!early.ok && early.reason === 'not_ready' && early.remainingMs === 1000);
  A.W.GameState.saveGame();
  // 离线 9 小时后重新打开游戏：新运行时读同一份 localStorage
  clock.now = T0 + 9 * H;
  const B = runtime({ storage, clock });
  B.W.GameState.loadGame();
  const s2 = B.W.GameState.state;
  const sum = B.W.Dispatch.summary(s2, clock.now);
  assert.strictEqual(sum.done, 1);
  const stonesBefore = s2.stones;
  const got = B.W.Dispatch.claim(s2, id, { now: clock.now, stonePerSec: 5 });
  assert.ok(got.ok);
  if (got.reward.stone) assert.strictEqual(s2.stones, stonesBefore + got.reward.stone);
  assert.strictEqual(s2.dispatch.active.length, 0);
  assert.strictEqual(s2.dispatch.total, 1);
  assert.ok(!B.W.Dispatch.claim(s2, id, { now: clock.now }).ok, '不能重复领取');
  // 时钟回拨：startAt 在「未来」超过 1 分钟 → 从当前时间重新计时
  const s3 = JSON.parse(JSON.stringify(s));
  const d3 = B.W.Dispatch.ensureState(s3, T0);
  const m3 = d3.board.find((b) => !b.taken);
  B.W.Dispatch.start(s3, m3.slot, pickFor(s3, m3), { now: T0 + 5 * H, stonePerSec: 5 });
  const back = B.W.Dispatch.ensureState(s3, T0);
  const a3 = back.active.find((a) => a.slot === m3.slot);
  assert.strictEqual(a3.startAt, T0);
  assert.strictEqual(a3.endAt, T0 + m3.h * H);
});

check('奖励：按产出折算、仙缘标签每人 +25%、单条上限；只发灵石/灵玉/仙桃，不发灵气与道果', () => {
  const { W } = runtime();
  const s = freshState(W, 120);
  const jadeRate = 6 + 0.4 * 120;
  const sps = 100;
  D.TEMPLATES.forEach((tpl) => {
    [2, 4, 6, 8].forEach((h) => {
      tpl.tags.forEach((tag) => {
        const m = { tpl: tpl.id, h, need: h >= 6 ? 2 : 1, tag, minQ: null };
        const holders = ALL.filter((id) => W.Bonds.tagsOf(id).includes(tag));
        const q0 = W.Dispatch.quote(s, m, [], { stonePerSec: sps });
        const q2 = W.Dispatch.quote(s, m, holders.slice(0, 2), { stonePerSec: sps });
        const q3 = W.Dispatch.quote(s, m, holders.slice(0, 3), { stonePerSec: sps });
        assert.strictEqual(q0.matched, 0);
        assert.strictEqual(q2.matched, Math.min(2, holders.length));
        assert.strictEqual(q3.matched, 2, '最多 2 人计入加成');
        Object.keys(q2.reward).forEach((k) => assert.ok(['stone', 'jade', 'peach'].includes(k), `奖励种类 ${k}`));
        Object.keys(q2.reward).forEach((k) => assert.ok(q2.reward[k] >= q0.reward[k], '加成不减少奖励'));
        if (q2.reward.stone) assert.ok(q2.reward.stone <= sps * 60 * 60, '灵石 ≤ 60 分钟产出');
        if (q2.reward.jade) assert.ok(q2.reward.jade <= Math.round(jadeRate * 3), '灵玉 ≤ 3 小时挂机灵玉');
        if (q2.reward.peach) assert.ok(q2.reward.peach <= 5, '仙桃 ≤ 5');
      });
    });
  });
  // 具体数值：8 小时单灵玉任务
  const mj = { tpl: 'gudong', h: 8, need: 2, tag: 'ming', minQ: null };
  assert.strictEqual(W.Dispatch.quote(s, mj, [], {}).reward.jade, Math.round(jadeRate * 1.6));
  assert.strictEqual(W.Dispatch.quote(s, mj, ['ziling'], {}).reward.jade, Math.round(jadeRate * 2.0));
  assert.strictEqual(W.Dispatch.quote(s, mj, ['ziling', 'honglian'], {}).reward.jade, Math.round(jadeRate * 2.4));
  // 2 小时灵石任务：12 分钟产出
  const ms = { tpl: 'xunshan', h: 2, need: 1, tag: 'jian', minQ: null };
  assert.strictEqual(W.Dispatch.quote(s, ms, [], { stonePerSec: 10 }).reward.stone, 10 * 60 * 12);

  // 领取不改变灵气/道果/转世收益
  const d = W.Dispatch.ensureState(s, T0);
  const before = { qi: s.qi, daoGuo: s.daoGuo, totalDaoGuo: s.totalDaoGuo, lifetimeQi: s.lifetimeQi, pending: W.GameState.getPendingDaoGuo() };
  d.board.forEach((b) => assert.ok(W.Dispatch.start(s, b.slot, pickFor(s, b), { now: T0, stonePerSec: 10 }).ok));
  const all = W.Dispatch.claimAll(s, { now: T0 + 9 * H, stonePerSec: 10 });
  assert.strictEqual(all.count, 4);
  assert.deepStrictEqual({ qi: s.qi, daoGuo: s.daoGuo, totalDaoGuo: s.totalDaoGuo, lifetimeQi: s.lifetimeQi, pending: W.GameState.getPendingDaoGuo() }, before);
  assert.ok(!/qi|daoguo|daoGuo/.test(Object.keys(all.reward).join(',')));
});

check('轮回：派遣与当日悬赏保留（不能靠轮回刷新）；前世高额灵石领取时按今生产出封顶', () => {
  const { W, clock } = runtime();
  const s = freshState(W, 200);
  s.realmIndex = CFG.REINCARNATION_MIN_STAGE + 2;
  const d = W.Dispatch.ensureState(s, clock.now);
  const m = d.board.find((b) => D.TPL_MAP[b.tpl].kinds.includes('stone')) || d.board[0];
  const hugeSps = 1e6;
  const res = W.Dispatch.start(s, m.slot, pickFor(s, m), { now: clock.now, stonePerSec: hugeSps });
  assert.ok(res.ok);
  const quotedStone = res.mission.reward.stone || 0;
  const boardBefore = JSON.stringify(s.dispatch.board);
  assert.ok(W.GameState.performReincarnation().ok);
  const s2 = W.GameState.state;
  assert.strictEqual(JSON.stringify(s2.dispatch.board), boardBefore, '悬赏榜（含已接标记）保留');
  assert.strictEqual(s2.dispatch.active.length, 1);
  const smallSps = 2;
  const got = W.Dispatch.claim(s2, res.mission.id, { now: clock.now + 9 * H, stonePerSec: smallSps });
  assert.ok(got.ok);
  if (quotedStone) {
    assert.ok(quotedStone > smallSps * 3600, '报价按前世产出');
    assert.strictEqual(got.reward.stone, smallSps * 60 * 60, '领取时按今生产出封顶 60 分钟');
  }
});

check('旧存档迁移：无 dispatch 字段正常读档；坏数据被修正（非法模板/时长、重复占用、非法奖励）', () => {
  const storage = memoryStorage();
  const A = runtime({ storage });
  A.W.GameState.loadGame();
  const old = JSON.parse(JSON.stringify(A.W.GameState.state));
  delete old.dispatch;
  old.stage.best = 12;
  storage.setItem('xiuxian_idle_save_v1', JSON.stringify(old));
  const B = runtime({ storage });
  const r = B.W.GameState.loadGame();
  assert.ok(!r.isNew);
  const s = B.W.GameState.state;
  assert.strictEqual(s.dispatch, undefined, '读档本身不强加字段');
  const d = B.W.Dispatch.ensureState(s, T0);
  assert.strictEqual(d.v, 1);
  assert.strictEqual(d.board.length, 4);
  assert.deepStrictEqual(Array.from(d.active), []);
  assert.ok(B.W.Dispatch.isUnlocked(s));

  const bad = {
    dispatch: {
      date: 42,
      board: 'oops',
      seq: -5,
      junk: true,
      active: [
        { id: 'a', tpl: 'nope', h: 4, heroes: ['ziling'], startAt: T0 },
        { id: 'b', tpl: 'xunshan', h: 3, heroes: ['ziling'], startAt: T0 },
        { id: 'c', tpl: 'xunshan', h: 2, heroes: ['ziling', 7, 'ziling'], startAt: T0, reward: { stone: -3, jade: 'x', qi: 1e9, daoguo: 9, peach: 2 } },
        { id: 'd', tpl: 'gudong', h: 8, heroes: ['ziling', 'qinglan'], startAt: T0 },
        { id: 'e', tpl: 'gudong', h: 8, heroes: [], startAt: T0 },
        { id: 'f', tpl: 'gudong', h: 8, heroes: ['molan'], startAt: 'never' }
      ]
    }
  };
  const fixed = B.W.Dispatch.ensureState(bad, T0);
  assert.ok(!('junk' in fixed));
  assert.strictEqual(fixed.seq, 0);
  assert.strictEqual(fixed.board.length, 4);
  assert.deepStrictEqual(Array.from(fixed.active.map((a) => a.id)), ['c', 'd']);
  assert.deepStrictEqual(Array.from(fixed.active[0].heroes), ['ziling']);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(fixed.active[0].reward)), { peach: 2 });
  assert.deepStrictEqual(Array.from(fixed.active[1].heroes), ['qinglan'], 'ziling 不能同时在两条任务中');
  assert.strictEqual(fixed.active[1].endAt, T0 + 8 * H);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(B.W.Dispatch.normalize('garbage'))), { v: 1, date: '', board: [], active: [], seq: 0, total: 0 });
});

check('互斥：出战队伍不能派遣、同一仙姬不能接两条、人数/品阶要求、召回无奖励且悬赏可重接、未开启时不能派', () => {
  const { W } = runtime();
  const s = freshState(W);
  const d = W.Dispatch.ensureState(s, T0);
  const avail = W.Dispatch.availableHeroes(s);
  assert.strictEqual(avail.length, ALL.length - SQUAD.length);
  assert.ok(SQUAD.every((id) => !avail.includes(id)));
  const one = d.board.find((b) => b.need === 1) || d.board[0];
  const ids = pickFor(s, one);
  assert.strictEqual(W.Dispatch.start(s, one.slot, [SQUAD[0]].concat(ids.slice(1)), { now: T0 }).reason, 'in_squad');
  assert.strictEqual(W.Dispatch.start(s, one.slot, ids.concat(ids).slice(0, one.need + 1), { now: T0 }).ok, false);
  assert.ok(W.Dispatch.start(s, one.slot, ids, { now: T0, stonePerSec: 1 }).ok);
  assert.strictEqual(W.Dispatch.start(s, one.slot, ids, { now: T0 }).reason, 'taken');
  const other = d.board.find((b) => !b.taken);
  const reuse = [ids[0]].concat(W.Dispatch.availableHeroes(s).slice(0, other.need - 1));
  assert.strictEqual(W.Dispatch.start(s, other.slot, reuse, { now: T0 }).reason, 'busy');
  assert.ok(!W.Dispatch.availableHeroes(s).includes(ids[0]));
  // 品阶：只派玄品不满足地品要求
  const qm = { slot: 99, tpl: 'gudong', h: 2, need: 1, tag: 'ming', minQ: 'di' };
  assert.strictEqual(W.Dispatch.checkHeroes(s, qm, ['molan']).reason, 'quality');
  assert.ok(W.Dispatch.checkHeroes(s, qm, ['ziling']).ok);
  assert.strictEqual(W.Dispatch.checkHeroes(s, Object.assign({}, qm, { minQ: 'tian' }), ['ziling']).reason, 'quality');
  // 召回
  const act = s.dispatch.active[0];
  const stones = s.stones;
  assert.ok(W.Dispatch.recall(s, act.id, { now: T0 + H }).ok);
  assert.strictEqual(s.stones, stones);
  assert.ok(!s.dispatch.board.find((b) => b.slot === one.slot).taken);
  assert.ok(W.Dispatch.availableHeroes(s).includes(ids[0]));
  // 全部 4 条都能由未上阵的 10 人同时接满
  s.dispatch.board.forEach((b) => assert.ok(W.Dispatch.start(s, b.slot, pickFor(s, b), { now: T0 }).ok, `接满 ${b.tpl}`));
  assert.strictEqual(new Set(W.Dispatch.busyIds(s)).size, W.Dispatch.busyIds(s).length, '无重复占用');
  assert.ok(W.Dispatch.busyIds(s).every((id) => !SQUAD.includes(id)));
  // 未开启
  const s2 = freshState(runtime().W, 2);
  assert.strictEqual(D.isUnlocked(s2), false);
});

// ---------------- 假 DOM ----------------
function fakeDom() {
  function makeEl(id) {
    const el = {
      id, tagName: 'DIV', children: [], style: { setProperty() {}, removeProperty() {} }, dataset: {}, attributes: {}, hidden: false, disabled: false,
      textContent: '', _html: '', listeners: {}, parentNode: null, className: '',
      classList: {
        set: new Set(),
        add(...c) { c.forEach((x) => this.set.add(x)); },
        remove(...c) { c.forEach((x) => this.set.delete(x)); },
        toggle(c, on) { const v = on === undefined ? !this.set.has(c) : Boolean(on); if (v) this.set.add(c); else this.set.delete(c); return v; },
        contains(c) { return this.set.has(c); }
      },
      get innerHTML() { return this._html; },
      set innerHTML(v) { this._html = String(v); this.children = []; },
      setAttribute(k, v) { this.attributes[k] = String(v); },
      getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null; },
      removeAttribute(k) { delete this.attributes[k]; },
      addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); },
      removeEventListener() {},
      appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
      removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; },
      remove() {},
      querySelector() { return makeEl(''); },
      querySelectorAll() { return []; },
      closest() { return null; },
      contains() { return false; },
      getBoundingClientRect() { return { left: 0, top: 0, width: 360, height: 480, right: 360, bottom: 480 }; },
      focus() {}, blur() {},
      offsetWidth: 360, offsetHeight: 480, clientWidth: 360, clientHeight: 480
    };
    return el;
  }
  const els = {};
  const docListeners = {};
  const document = {
    hidden: false, activeElement: null,
    getElementById(id) { if (!els[id]) els[id] = makeEl(id); return els[id]; },
    createElement(tag) { const e = makeEl(''); e.tagName = String(tag).toUpperCase(); return e; },
    querySelector() { return makeEl(''); },
    querySelectorAll() { return []; },
    addEventListener(t, fn) { (docListeners[t] = docListeners[t] || []).push(fn); },
    body: makeEl('body')
  };
  return { els, document, docListeners, makeEl };
}

function fire(el, type, ev) {
  (el.listeners[type] || []).forEach((fn) => fn(ev));
}

// 模拟点击 innerHTML 中的按钮：解析 data-* 属性生成假 target
function clickData(container, attr, value) {
  const re = new RegExp(`<button[^>]*data-${attr}="${value == null ? '[^"]*' : value}"[^>]*>`);
  const m = container.innerHTML.match(re);
  assert.ok(m, `应存在按钮 data-${attr}=${value}`);
  const tag = m[0];
  const dataset = {};
  tag.replace(/data-([a-z-]+)="([^"]*)"/g, (_, k, v) => {
    dataset[k.replace(/-([a-z])/g, (x, c) => c.toUpperCase())] = v;
  });
  const btn = { dataset, disabled: /\sdisabled(\s|>|=)/.test(tag) };
  btn.closest = () => btn;
  fire(container, 'click', { target: btn });
  return btn;
}

check('UI 冒烟：洞府「派遣」按钮、弹窗榜单、选人派遣、倒计时、领取、召回、Esc/遮罩关闭；队伍编辑拒绝派遣中的仙姬', () => {
  const { els, document, docListeners } = fakeDom();
  const clock = makeClock(T0);
  const sandbox = {
    window: {}, console, document, localStorage: memoryStorage(), navigator: { userAgent: 'node' }, Date: clock.Date,
    setTimeout() { return 0; }, clearTimeout() {}, setInterval() { return 0; }, clearInterval() {},
    requestAnimationFrame() { return 0; }, Image: function () {}, ResizeObserver: undefined,
    getComputedStyle() { return { getPropertyValue: () => '' }; }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.window.addEventListener = () => {};
  sandbox.window.innerWidth = 390;
  sandbox.window.innerHeight = 844;
  ['config', 'equip', 'state', 'titles', 'battle', 'bonds', 'mijing', 'stage-ui', 'dispatch'].forEach((f) => {
    const src = text(`js/${f}.js`);
    assert.ok(!src.includes('getImageData'), `${f}.js 不应使用 getImageData`);
    vm.runInNewContext(src, sandbox, { filename: `${f}.js` });
  });
  const GS = sandbox.GameState;
  GS.loadGame();
  const st = GS.state;
  st.stage.best = 3;
  st.squad = SQUAD.slice();
  st.unlockedHeroes = ALL.slice();
  st.createdAt = 777;
  const UI = sandbox.Dispatch.ui;
  UI.tick();
  assert.strictEqual(els['btn-dispatch-open'].hidden, true, '未开启时隐藏入口');
  assert.strictEqual(UI.open(), false);
  st.stage.best = 30;
  UI.tick();
  assert.strictEqual(els['btn-dispatch-open'].hidden, false);
  assert.strictEqual(els['dispatch-summary'].textContent, '派遣 4');

  fire(els['btn-dispatch-open'], 'click', {});
  assert.ok(UI.isOpen());
  assert.strictEqual(els['dispatch-modal'].getAttribute('aria-hidden'), 'false');
  const body = els['dispatch-modal-body'];
  assert.ok(body.innerHTML.includes('今日悬赏'));
  assert.strictEqual((body.innerHTML.match(/data-dispatch-pick=/g) || []).length, 4);
  const board = st.dispatch.board;
  board.forEach((b) => assert.ok(body.innerHTML.includes(sandbox.Dispatch.TPL_MAP[b.tpl].name)));

  // 选人：选第一条悬赏
  const b0 = board[0];
  clickData(body, 'dispatch-pick', String(b0.slot));
  assert.strictEqual(UI._state().view, 'pick');
  assert.ok(body.innerHTML.includes(`已选 0/${b0.need}`));
  SQUAD.forEach((id) => assert.ok(!body.innerHTML.includes(`data-dispatch-hero="${id}"`), '出战中的仙姬不在可选列表'));
  const actions = els['dispatch-modal-actions'];
  assert.ok(/data-dispatch-go="1" disabled/.test(actions.innerHTML), '未选满不能派遣');
  const ids = pickFor(st, b0);
  ids.forEach((id) => clickData(body, 'dispatch-hero', id));
  assert.ok(body.innerHTML.includes(`已选 ${b0.need}/${b0.need}`));
  assert.ok(!/data-dispatch-go="1" disabled/.test(actions.innerHTML));
  clickData(actions, 'dispatch-go', '1');
  assert.strictEqual(UI._state().view, 'board');
  assert.strictEqual(st.dispatch.active.length, 1);
  assert.ok(body.innerHTML.includes('已派出'));
  assert.ok(body.innerHTML.includes(sandbox.Dispatch.SETTLEMENT_HINT), '已派出任务应标明按派出时锁定、领取时封顶');
  assert.ok(body.innerHTML.includes(`剩余 ${b0.h}时00分`));
  assert.ok(body.innerHTML.includes('今日已接'));
  assert.ok(sandbox.localStorage._data.xiuxian_idle_save_v1.includes('"dispatch"'), '派遣后已存档');

  // 队伍编辑：派遣中的仙姬不能上阵
  sandbox.StageUI.init({ log() {}, onChange() {}, switchTab() {} });
  assert.ok(sandbox.StageUI.openSquadModal());
  assert.ok(els['squad-hero-list'].innerHTML.includes('派遣中 · 召回后可上阵'));
  assert.ok(els['squad-hero-list'].innerHTML.includes('is-dispatched'));
  sandbox.StageUI.toggleDraftHero(SQUAD[5]); // 先移出 1 人腾出位置
  const tg = sandbox.StageUI.toggleDraftHero(ids[0]);
  assert.strictEqual(tg.ok, false);
  assert.strictEqual(tg.reason, 'DISPATCHED');
  assert.ok(!sandbox.StageUI.getDraftSquad().includes(ids[0]));
  const rej = sandbox.StageUI.saveSquad(SQUAD.slice(0, 5).concat(ids[0]));
  assert.strictEqual(rej.ok, false);
  assert.strictEqual(rej.reason, 'DISPATCHED');
  assert.deepStrictEqual(Array.from(sandbox.Battle.getSquadIds(st)), SQUAD, '队伍不变');
  if (sandbox.StageUI.closeSquadModal) sandbox.StageUI.closeSquadModal();

  // 到点：按钮显示可领、红点亮起
  clock.now = T0 + b0.h * H + 1;
  UI.tick();
  assert.strictEqual(els['dispatch-summary'].textContent, '可领 1');
  assert.ok(els['badge-dispatch'].classList.contains('visible'));
  assert.ok(sandbox.Dispatch.hasClaimable(st, clock.now), '完成后可领取');
  assert.ok(els['badge-upgrade'].classList.contains('is-dispatch-claim'), '洞府页签应亮红点催领取');
  assert.ok(body.innerHTML.includes('已完成'));
  const lingyu = st.lingyu;
  const stones = st.stones;
  const peaches = st.tree.peaches;
  clickData(actions, 'dispatch-claimall', '1');
  assert.strictEqual(st.dispatch.active.length, 0);
  UI.tick();
  assert.ok(!sandbox.Dispatch.hasClaimable(st, clock.now));
  assert.ok(!els['badge-upgrade'].classList.contains('is-dispatch-claim'), '领完后洞府页签红点应灭');
  assert.ok(st.lingyu > lingyu || st.stones > stones || st.tree.peaches > peaches);
  assert.ok(body.innerHTML.includes('归来，获得'));

  // 召回
  const b1 = st.dispatch.board.find((b) => !b.taken);
  clickData(body, 'dispatch-pick', String(b1.slot));
  pickFor(st, b1).forEach((id) => clickData(body, 'dispatch-hero', id));
  clickData(actions, 'dispatch-go', '1');
  const aid = st.dispatch.active[0].id;
  clickData(body, 'dispatch-recall', aid);
  assert.strictEqual(st.dispatch.active.length, 0);
  assert.ok(body.innerHTML.includes('已召回'));

  // Esc 关闭
  (docListeners.keydown || []).forEach((fn) => fn({ key: 'Escape' }));
  assert.ok(!UI.isOpen());
  // 遮罩关闭
  fire(els['btn-dispatch-open'], 'click', {});
  assert.ok(UI.isOpen());
  fire(els['dispatch-modal'], 'click', { target: els['dispatch-modal'] });
  assert.ok(!UI.isOpen());
  // ✕ 关闭
  fire(els['btn-dispatch-open'], 'click', {});
  fire(els['btn-dispatch-close'], 'click', {});
  assert.ok(!UI.isOpen());
});

check('index.html 引用 dispatch.js 且有入口/弹窗节点；样式与图标存在', () => {
  const index = text('index.html');
  assert.match(index, /<script src="js\/dispatch\.js\?v=\d+"><\/script>/);
  ['btn-dispatch-open', 'dispatch-summary', 'badge-dispatch', 'dispatch-modal', 'dispatch-modal-body', 'dispatch-modal-actions', 'btn-dispatch-close'].forEach((id) => assert.ok(index.includes(`id="${id}"`), id));
  const css = text('css/style.css');
  ['.home-dispatch-btn', '.dispatch-dialog', '.dispatch-modal-body::-webkit-scrollbar', '.dispatch-hero-grid', '.squad-hero-card.is-dispatched'].forEach((c) => assert.ok(css.includes(c), c));
  ['ui_role', 'res_stone', 'res_lingyu', 'res_peach'].forEach((ic) => assert.ok(fs.existsSync(path.join(root, `assets/icons/${ic}@64.webp`)), ic));
});

// 平衡抽样：每日 4 条全接、仙缘满加成时的总收益，对比当日挂机/产出
check('平衡抽样：每日派遣收益相对挂机/产出保持温和', () => {
  const { W } = runtime();
  const lines = [];
  [10, 60, 150, 280].forEach((best) => {
    const s = freshState(W, best);
    const jadeRate = 6 + 0.4 * best;
    const sps = 100;
    let maxJ = 0;
    let maxS = 0;
    let maxP = 0;
    let avgJ = 0;
    let avgS = 0;
    let avgP = 0;
    const days = 120;
    for (let day = 0; day < days; day++) {
      const board = W.Dispatch.buildBoard(D.todayKey(T0 + day * 24 * H), 99);
      let j0 = 0; let s0 = 0; let p0 = 0; let j2 = 0; let s2 = 0; let p2 = 0;
      board.forEach((m) => {
        const holders = ALL.filter((id) => W.Bonds.tagsOf(id).includes(m.tag));
        const q0 = W.Dispatch.quote(s, m, [], { stonePerSec: sps }).reward;
        const q2 = W.Dispatch.quote(s, m, holders.slice(0, m.need), { stonePerSec: sps }).reward;
        j0 += q0.jade || 0; s0 += q0.stone || 0; p0 += q0.peach || 0;
        j2 += q2.jade || 0; s2 += q2.stone || 0; p2 += q2.peach || 0;
      });
      avgJ += j0 / days; avgS += s0 / days; avgP += p0 / days;
      maxJ = Math.max(maxJ, j2); maxS = Math.max(maxS, s2); maxP = Math.max(maxP, p2);
    }
    const jadeHours = maxJ / jadeRate;
    const stoneMin = maxS / sps / 60;
    lines.push(`第${best}关：日均(无加成) 灵玉 ${avgJ.toFixed(0)}≈挂机${(avgJ / jadeRate).toFixed(1)}h · 灵石≈${(avgS / sps / 60).toFixed(0)}分钟产出 · 仙桃 ${avgP.toFixed(1)}；单日最高(满加成) 灵玉≈挂机${jadeHours.toFixed(1)}h · 灵石≈${stoneMin.toFixed(0)}分钟 · 仙桃 ${maxP}`);
    assert.ok(jadeHours <= 8, '单日灵玉 ≤ 8 小时挂机灵玉（挂机每日最多可领 24 小时）');
    assert.ok(stoneMin <= 180, '单日灵石 ≤ 3 小时产出（离线上限 12 小时）');
    assert.ok(maxP <= 16, '单日仙桃 ≤ 16（自然回复每小时 20 枚）');
  });
  lines.forEach((l) => console.log(`  ${l}`));
});

console.log(`dispatch.test.js ok: ${passed} checks`);
