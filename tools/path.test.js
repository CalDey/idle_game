// 本命道途：开放与节点境界门槛、择道/参悟（灵石按产出分钟折算 + 下限）、圆满上限、重定（花费/免费/层数保留）、
// 转世行为（保留道途、层数清零、赠免费重定、不改道果）、收益倍率、战斗 mods（无层数时战斗与原版一致）、
// 秘境/关卡预测合并、旧存档迁移与坏数据修复，以及境界卡入口 + 弹窗的无浏览器冒烟（vm + 极简假 DOM）。
// 用法：node tools/path.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const text = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function memoryStorage(initial) {
  const data = Object.assign({}, initial || {});
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    _data: data
  };
}

function runtime(opts) {
  const o = opts || {};
  const files = o.files || ['config', 'equip', 'state', 'titles', 'battle', 'bonds', 'path'];
  const sandbox = { window: {}, console, localStorage: o.storage || memoryStorage() };
  sandbox.globalThis = sandbox.window;
  files.forEach((f) => vm.runInNewContext(text(`js/${f}.js`), sandbox, { filename: `${f}.js` }));
  return sandbox.window;
}

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const W0 = runtime();
const P = W0.Path;
const CFG = W0.GameConfig;
const ALL = CFG.HEROES.map((h) => h.id);
const SQUAD = ['saintess', 'miko', 'shuanghua', 'sweetmaid', 'jianghua', 'qingkui'];

function freshState(W, realmIndex) {
  const GS = W.GameState;
  GS.loadGame();
  const s = GS.state;
  s.realmIndex = realmIndex;
  s.stage.best = 60;
  s.stage.cur = 61;
  s.squad = SQUAD.slice();
  s.heroId = SQUAD[0];
  s.unlockedHeroes = ALL.slice();
  return s;
}

check('规则常量：化灵初开放，三节点依次 化灵初/尊者初/天神初，每节点 3 层，花费按产出分钟数', () => {
  assert.strictEqual(P.RULES.UNLOCK_REALM, 6);
  assert.strictEqual(CFG.REALM_STAGES[6].fullName, '化灵初');
  assert.deepStrictEqual(Array.from(P.RULES.TIER_REALMS), [6, 15, 27]);
  assert.ok(/^尊者/.test(CFG.REALM_STAGES[15].fullName) && /^天神/.test(CFG.REALM_STAGES[27].fullName));
  assert.strictEqual(P.PATHS.length, 3);
  P.PATHS.forEach((p) => {
    assert.strictEqual(p.nodes.length, 3);
    assert.ok(fs.existsSync(path.join(root, `${p.icon}.webp`)), `${p.icon}.webp`);
    assert.ok(fs.existsSync(path.join(root, `${p.icon}@64.webp`)), `${p.icon}@64.webp`);
  });
  assert.deepStrictEqual(Array.from(P.PATHS, (p) => p.name), ['剑道', '体道', '符道']);
});

check('开放门槛：化灵之前不能择道，入口不提示', () => {
  const W = runtime();
  const s = freshState(W, 5);
  assert.strictEqual(P.isUnlocked(s), false);
  const r = W.Path.choose(s, 'jian');
  assert.ok(!r.ok && r.reason === 'locked');
  assert.strictEqual(W.Path.hasAction(s), false);
  s.realmIndex = 6;
  assert.strictEqual(W.Path.hasAction(s), true, '已开放未择道时提示');
  assert.ok(W.Path.choose(s, 'jian').ok);
  assert.strictEqual(s.path.id, 'jian');
  const again = W.Path.choose(s, 'ti');
  assert.ok(!again.ok && again.reason === 'already_chosen', '已择道只能重定');
  assert.ok(!W.Path.choose(s, 'nope').ok);
});

check('参悟：花费 = 当前灵石产出 × 分钟数（下限 200），扣灵石、记累计；节点境界门槛；圆满上限；灵石不足不扣', () => {
  const W = runtime();
  const s = freshState(W, 6);
  W.Path.choose(s, 'ti');
  const env = { stonePerSec: 100 };
  assert.strictEqual(W.Path.nodeCost(s, 0, env), 100 * 60 * 5);
  assert.strictEqual(W.Path.nodeCost(s, 0, { stonePerSec: 0.1 }), 200, '下限');
  s.stones = 1e9;
  const r1 = W.Path.upgrade(s, 0, env);
  assert.ok(r1.ok && r1.cost === 30000 && r1.lv === 1);
  assert.strictEqual(s.stones, 1e9 - 30000);
  assert.strictEqual(W.Path.nodeCost(s, 0, env), 100 * 60 * 10);
  assert.ok(W.Path.upgrade(s, 0, env).ok);
  assert.strictEqual(W.Path.nodeCost(s, 0, env), 100 * 60 * 20);
  assert.ok(W.Path.upgrade(s, 0, env).ok);
  assert.strictEqual(W.Path.nodeCost(s, 0, env), null);
  const mx = W.Path.upgrade(s, 0, env);
  assert.ok(!mx.ok && mx.reason === 'maxed');
  assert.strictEqual(s.path.spent, 100 * 60 * (5 + 10 + 20));
  // 第 2 节点尊者初开放
  const lk = W.Path.upgrade(s, 1, env);
  assert.ok(!lk.ok && lk.reason === 'tier_locked' && /尊者/.test(lk.message));
  s.realmIndex = 15;
  assert.ok(W.Path.upgrade(s, 1, env).ok);
  assert.ok(!W.Path.upgrade(s, 2, env).ok);
  s.realmIndex = 27;
  // 灵石不足
  s.stones = 10;
  const poor = W.Path.upgrade(s, 2, env);
  assert.ok(!poor.ok && poor.reason === 'insufficient');
  assert.strictEqual(s.stones, 10);
  assert.deepStrictEqual(Array.from(s.path.lv), [3, 1, 0]);
  // 默认取 GameState 当前产出
  const sps = W.GameState.getStonePerSec();
  assert.strictEqual(W.Path.nodeCost(s, 2), Math.max(200, Math.round(sps * 60 * 5)));
  // 未择道不能参悟
  const s2 = freshState(runtime(), 8);
  assert.strictEqual(P.upgrade(s2, 0, env).reason, 'no_path');
});

check('重定：花费 30 分钟产出；层数按节点位置保留；同道途拒绝；免费次数优先使用', () => {
  const W = runtime();
  const s = freshState(W, 27);
  W.Path.choose(s, 'jian');
  s.stones = 1e12;
  const env = { stonePerSec: 50 };
  [0, 0, 1, 2].forEach((t) => assert.ok(W.Path.upgrade(s, t, env).ok));
  assert.deepStrictEqual(Array.from(s.path.lv), [2, 1, 1]);
  assert.strictEqual(W.Path.respecCost(s, env), 50 * 60 * 30);
  assert.strictEqual(W.Path.respec(s, 'jian', env).reason, 'same_path');
  const before = s.stones;
  const r = W.Path.respec(s, 'fu', env);
  assert.ok(r.ok && r.cost === 90000 && !r.free);
  assert.strictEqual(s.stones, before - 90000);
  assert.strictEqual(s.path.id, 'fu');
  assert.deepStrictEqual(Array.from(s.path.lv), [2, 1, 1], '层数保留');
  assert.strictEqual(s.path.respecs, 1);
  s.stones = 5;
  assert.strictEqual(W.Path.respec(s, 'ti', env).reason, 'insufficient');
  assert.strictEqual(s.path.id, 'fu');
  s.path.freeRespec = 1;
  assert.strictEqual(W.Path.respecCost(s, env), 0);
  const f = W.Path.respec(s, 'ti', env);
  assert.ok(f.ok && f.free);
  assert.strictEqual(s.stones, 5);
  assert.strictEqual(s.path.freeRespec, 0);
});

check('收益：符道 聚灵符/摄石符 乘入 getQiPerSec / getStonePerSec；其他道途不影响收益', () => {
  const W = runtime();
  const s = freshState(W, 27);
  const GS = W.GameState;
  const q0 = GS.getQiPerSec();
  const st0 = GS.getStonePerSec();
  s.path = { id: 'fu', lv: [3, 3, 3] };
  assert.ok(Math.abs(GS.getQiPerSec() / q0 - 1.15) < 1e-9, '灵气 +15%');
  assert.ok(Math.abs(GS.getStonePerSec() / st0 - 1.24) < 1e-9, '灵石 +24%');
  s.path = { id: 'jian', lv: [3, 3, 3] };
  assert.strictEqual(GS.getQiPerSec(), q0);
  assert.strictEqual(GS.getStonePerSec(), st0);
  s.path = { id: 'fu', lv: [0, 0, 0] };
  assert.strictEqual(GS.getQiPerSec(), q0);
});

check('战斗 mods：未择道/无层数为 null（战斗逐帧一致）；各道途效果正确进入单位属性', () => {
  const W = runtime();
  const B = W.Battle;
  const s = freshState(W, 27);
  assert.strictEqual(P.battleMods(s), null);
  s.path = { id: 'ti', lv: [0, 0, 0] };
  assert.strictEqual(P.battleMods(s), null);
  s.path = { id: 'fu', lv: [3, 3, 0] };
  assert.strictEqual(P.battleMods(s), null, '符道前两节点只影响收益');
  const ps = B.playerStats(s);
  for (const seed of [1, 7, 42]) {
    assert.strictEqual(JSON.stringify(B.createSession(ps, 40, seed, P.battleMods(s)).runToEnd(true)), JSON.stringify(B.createSession(ps, 40, seed, null).runToEnd(true)));
  }
  const base = B.createSession(ps, 40, 1, null);
  s.path = { id: 'ti', lv: [3, 3, 3] };
  const tm = P.battleMods(s);
  assert.ok(Math.abs(tm.hpMult - 1.09) < 1e-9 && Math.abs(tm.defMult - 1.12) < 1e-9 && Math.abs(tm.frontDmgTakenMult - 0.91) < 1e-9);
  const ti = B.createSession(ps, 40, 1, tm);
  ti.playerUnits.forEach((u, i) => assert.ok(Math.abs(u.maxHp / base.playerUnits[i].maxHp - 1.09) < 1e-9, '体道 生命 +9%'));
  s.path = { id: 'jian', lv: [3, 2, 1] };
  const jm = P.battleMods(s);
  assert.ok(Math.abs(jm.critAdd - 0.09) < 1e-9 && Math.abs(jm.ultDmgMult - 1.14) < 1e-9 && Math.abs(jm.bossDmgMult - 1.08) < 1e-9);
  const jian = B.createSession(ps, 40, 1, jm);
  jian.playerUnits.forEach((u, i) => assert.ok(Math.abs(u.crit - Math.min(1, base.playerUnits[i].crit + 0.09)) < 1e-9, '剑道 暴击 +9%'));
  s.path = { id: 'fu', lv: [0, 0, 3] };
  const fu = B.createSession(ps, 40, 1, P.battleMods(s));
  fu.playerUnits.forEach((u, i) => assert.strictEqual(u.rage - base.playerUnits[i].rage, 24, '符道 开战怒气 +24'));
});

check('与仙缘羁绊合并：Bonds.modsForState 统一并入道途（mult 按增量叠加，只计一次）；秘境 combinedMods 与关卡预测都包含道途', () => {
  const W = runtime({ files: ['config', 'equip', 'state', 'titles', 'battle', 'bonds', 'mijing', 'path'] });
  const s = freshState(W, 27);
  const team = ['saintess', 'qingkui', 'jianghua', 'molan', 'sweetmaid', 'lanyi'];
  s.squad = team.slice();
  const bm = W.Bonds.modsForState(s);
  assert.ok(bm && bm.hpMult > 1, '此阵容有灵愈生命加成');
  assert.strictEqual(JSON.stringify(W.Bonds.buildMods(W.Battle.getSquadIds(s))), JSON.stringify(bm), '未择道时与原版羁绊 mods 完全一致');
  s.path = { id: 'ti', lv: [3, 0, 0] };
  const withPath = W.Bonds.modsForState(s);
  assert.ok(Math.abs(withPath.hpMult - (bm.hpMult + 0.09)) < 1e-9, '道途只叠加一次');
  const cm = W.Mijing.combinedMods(s, {});
  assert.ok(Math.abs(cm.hpMult - (bm.hpMult + 0.09)) < 1e-9, '秘境包含道途且不重复');
  s.path = { id: 'ti', lv: [0, 0, 0] };
  assert.strictEqual(JSON.stringify(W.Bonds.modsForState(s)), JSON.stringify(bm), '无层数时回到原版');
  // 无羁绊阵容：只有道途也能生效
  s.squad = ['saintess'];
  s.path = { id: 'jian', lv: [2, 0, 0] };
  const solo = W.Bonds.modsForState(s);
  assert.ok(solo && Math.abs(solo.critAdd - 0.06) < 1e-9);
  // 源码：stage-ui / mijing 不再各自合并（避免重复计）；预测缓存键含道途签名
  const su = text('js/stage-ui.js');
  const mj = text('js/mijing.js');
  assert.ok(!/Path\.battleMods/.test(su) && !/Path\.battleMods/.test(mj), '只在 Bonds.modsForState 合并一处');
  assert.ok(/function beastKey[\s\S]{0,400}P\.signature\(state\)/.test(su), '胜率/秘境预测缓存键包含道途签名');
  assert.strictEqual(P.signature({ path: { id: 'jian', lv: [3, 0, 0] } }), 'jian300');
  assert.strictEqual(P.signature({}), '-');
});

check('转世：保留道途、参悟层数清零、赠 1 次免费重定；道果与未选道途的存档不受影响', () => {
  const W = runtime();
  const GS = W.GameState;
  const s = freshState(W, 30);
  s.qi = 1e9;
  W.Path.choose(s, 'jian');
  s.stones = 1e15;
  [0, 0, 1, 2].forEach((t) => W.Path.upgrade(s, t, { stonePerSec: 10 }));
  const pending = GS.getPendingDaoGuo();
  // 道途不改变道果：同存档去掉道途后道果一致
  const saved = s.path;
  s.path = undefined;
  assert.strictEqual(GS.getPendingDaoGuo(), pending, '择道参悟不影响道果（剑道无灵气加成）');
  s.path = saved;
  const dg = s.totalDaoGuo;
  assert.ok(GS.performReincarnation().ok);
  const n = GS.state;
  assert.strictEqual(n.totalDaoGuo, dg + pending);
  assert.strictEqual(n.path.id, 'jian');
  assert.deepStrictEqual(Array.from(n.path.lv), [0, 0, 0]);
  assert.strictEqual(n.path.freeRespec, 1);
  assert.strictEqual(n.path.spent, 0);
  // 转世后境界回到起点，道途未开放；到化灵后可免费改道
  assert.strictEqual(P.isUnlocked(n), false);
  n.realmIndex = 6;
  n.stones = 0;
  assert.ok(W.Path.respec(n, 'ti', { stonePerSec: 1e6 }).ok);
  assert.strictEqual(n.path.freeRespec, 0);
  // 从未择道：转世后仍为未择道、无免费次数
  const W2 = runtime();
  const s2 = freshState(W2, 30);
  s2.qi = 1e9;
  assert.ok(W2.GameState.performReincarnation().ok);
  const p2 = W2.Path.peek(W2.GameState.state);
  assert.strictEqual(p2.id, null);
  assert.strictEqual(p2.freeRespec, 0);
  // 免费次数不叠加
  assert.strictEqual(P.onReincarnate({ id: 'fu', lv: [1, 1, 1], freeRespec: 1 }).freeRespec, 1);
});

check('存档：旧存档无 path 字段时默认未择道；保存/读档往返；坏数据被修正', () => {
  const storage = memoryStorage();
  const W = runtime({ storage });
  const s = freshState(W, 10);
  delete s.path;
  assert.deepStrictEqual(JSON.parse(JSON.stringify(W.Path.peek(s))), { v: 1, id: null, lv: [0, 0, 0], freeRespec: 0, respecs: 0, spent: 0 });
  W.Path.choose(s, 'fu');
  s.stones = 1e9;
  W.Path.upgrade(s, 0, { stonePerSec: 1 });
  W.GameState.saveGame();
  const W2 = runtime({ storage });
  W2.GameState.loadGame();
  const p = W2.Path.peek(W2.GameState.state);
  assert.strictEqual(p.id, 'fu');
  assert.deepStrictEqual(Array.from(p.lv), [1, 0, 0]);
  [null, 'x', 7, [], { id: 'evil', lv: [9, 9, 9] }, { id: 'jian', lv: [-1, 'a', 99], freeRespec: 5, spent: -3 }].forEach((bad) => {
    const n = P.normalize(bad);
    assert.ok(n.id === null || n.id === 'jian');
    n.lv.forEach((v) => assert.ok(Number.isInteger(v) && v >= 0 && v <= 3));
    assert.ok(n.freeRespec >= 0 && n.freeRespec <= 1 && n.spent >= 0);
  });
  assert.deepStrictEqual(Array.from(P.normalize({ id: 'jian', lv: [-1, 'a', 99] }).lv), [0, 0, 3]);
  assert.deepStrictEqual(Array.from(P.normalize({ id: 'evil', lv: [2, 2, 2] }).lv), [0, 0, 0], '无效道途清零');
  const obj = { path: { id: 'ti', lv: [1, 0, 0], junk: 1 } };
  const ref = obj.path;
  P.ensureState(obj);
  assert.strictEqual(obj.path, ref, '原地修复保持引用');
  assert.ok(!('junk' in obj.path));
});

// ---------------- 假 DOM ----------------
function fakeDom() {
  function makeEl(id) {
    return {
      id, children: [], style: {}, dataset: {}, attributes: {}, hidden: false, disabled: false, textContent: '', _html: '', listeners: {},
      classList: {
        set: new Set(),
        add(...c) { c.forEach((x) => this.set.add(x)); },
        remove(...c) { c.forEach((x) => this.set.delete(x)); },
        toggle(c, on) { const v = on === undefined ? !this.set.has(c) : Boolean(on); if (v) this.set.add(c); else this.set.delete(c); return v; },
        contains(c) { return this.set.has(c); }
      },
      get innerHTML() { return this._html; },
      set innerHTML(v) { this._html = String(v); },
      setAttribute(k, v) { this.attributes[k] = String(v); },
      getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null; },
      removeAttribute(k) { delete this.attributes[k]; },
      addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
    };
  }
  const els = {};
  const docListeners = {};
  const document = {
    readyState: 'complete',
    getElementById(id) { if (!els[id]) els[id] = makeEl(id); return els[id]; },
    addEventListener(t, fn) { (docListeners[t] = docListeners[t] || []).push(fn); }
  };
  return { els, document, docListeners };
}
const fire = (el, type, ev) => (el.listeners[type] || []).forEach((fn) => fn(ev));
function clickData(container, attr, value) {
  const re = new RegExp(`<button[^>]*data-${attr}="${value == null ? '[^"]*' : value}"[^>]*>`);
  const m = container.innerHTML.match(re);
  assert.ok(m, `应存在按钮 data-${attr}=${value}`);
  const dataset = {};
  m[0].replace(/data-([a-z-]+)="([^"]*)"/g, (_, k, v) => { dataset[k.replace(/-([a-z])/g, (x, c) => c.toUpperCase())] = v; });
  const btn = { dataset, disabled: /\sdisabled(\s|>|=)/.test(m[0]) };
  btn.closest = () => btn;
  fire(container, 'click', { target: btn });
}

check('文案对象：E2–E5 新界面字符串集中在 Path.TEXT，不散落在 HTML', () => {
  const T = P.TEXT;
  assert.ok(T && typeof T === 'object');
  assert.strictEqual(T.entryLocked, '化灵初开启');
  assert.strictEqual(T.combatNote, '加成在战斗内生效，不计入面板战力');
  assert.strictEqual(T.respecNoRefund, '已投入灵石不退还');
  assert.ok(T.chooseConfirmTitle && T.chooseConfirm.includes('{name}'));
  assert.ok(T.respecConfirmTitle && T.respecConfirm.includes('{name}'));
  assert.strictEqual(T.respecConfirmTitle, '改道确认');
  assert.ok(T.flashChosen.includes('{name}') && T.flashChosen.includes('已把本命押在'));
  Object.keys(T).forEach((k) => {
    assert.ok(!String(T[k]).includes('重定'), `TEXT.${k} 不应再出现「重定」`);
  });
  assert.ok(T.confirmYes && T.confirmNo);
  const src = text('js/path.js');
  ['化灵初开启', '加成在战斗内生效，不计入面板战力', '已投入灵石不退还'].forEach((str) => {
    const n = src.split(str).length - 1;
    assert.ok(n === 1, `${str} 应只出现在 TEXT 中一次，实际 ${n}`);
  });
  assert.ok(!text('index.html').includes('化灵初开启'));
});

check('UI 冒烟：境界卡入口（化灵前锁定）、择道/重定需确认、参悟一键、Esc/遮罩/✕ 关闭', () => {
  const { els, document, docListeners } = fakeDom();
  const sandbox = { window: {}, console, document, localStorage: memoryStorage(), setInterval() { return 0; } };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  ['config', 'equip', 'state', 'titles', 'battle', 'bonds', 'path'].forEach((f) => {
    const src = text(`js/${f}.js`);
    assert.ok(!src.includes('getImageData'));
    vm.runInNewContext(src, sandbox, { filename: `${f}.js` });
  });
  const GS = sandbox.GameState;
  const TXT = sandbox.Path.TEXT;
  GS.loadGame();
  const st = GS.state;
  st.realmIndex = 3;
  const UI = sandbox.Path.ui;
  UI.tick();
  assert.strictEqual(els['btn-path-open'].hidden, false);
  assert.strictEqual(els['btn-path-open'].disabled, true);
  assert.ok(els['btn-path-open'].classList.contains('is-locked'));
  assert.strictEqual(els['path-entry-text'].textContent, TXT.entryLocked);
  assert.strictEqual(UI.open(), false);
  st.realmIndex = 6;
  st.stones = 0;
  UI.tick();
  assert.strictEqual(els['btn-path-open'].hidden, false);
  assert.strictEqual(els['btn-path-open'].disabled, false);
  assert.ok(!els['btn-path-open'].classList.contains('is-locked'));
  assert.strictEqual(els['path-entry-text'].textContent, '本命道途 · 待择道');
  assert.ok(els['badge-path'].classList.contains('visible'));
  fire(els['btn-path-open'], 'click', {});
  assert.ok(UI.isOpen());
  const body = els['path-modal-body'];
  const actions = els['path-modal-actions'];
  assert.strictEqual((body.innerHTML.match(/data-path-choose=/g) || []).length, 3);
  assert.ok(body.innerHTML.includes(TXT.combatNote), '弹窗注明战斗内生效');
  clickData(body, 'path-choose', 'jian');
  assert.ok(!st.path || !st.path.id, '择道需二次确认，不应立即生效');
  assert.ok(body.innerHTML.includes('data-path-confirm="yes"'));
  assert.ok(body.innerHTML.includes(TXT.chooseConfirmTitle));
  clickData(body, 'path-confirm', 'no');
  assert.ok(!st.path || !st.path.id, '取消确认后仍未择道');
  assert.ok(!body.innerHTML.includes('data-path-confirm="yes"'));
  clickData(body, 'path-choose', 'jian');
  clickData(body, 'path-confirm', 'yes');
  assert.strictEqual(st.path.id, 'jian');
  assert.ok(body.innerHTML.includes('已把本命押在剑道上'));
  assert.ok(body.innerHTML.includes('剑心锋芒') && body.innerHTML.includes('尊者初开放'));
  assert.ok(body.innerHTML.includes(TXT.combatNote));
  assert.ok(sandbox.localStorage._data.xiuxian_idle_save_v1.includes('"path"'), '择道后已存档');
  assert.ok(/data-path-up="0" disabled/.test(body.innerHTML), '灵石不足按钮禁用');
  st.stones = 1e9;
  UI.render();
  clickData(body, 'path-up', '0');
  assert.deepStrictEqual(Array.from(st.path.lv), [1, 0, 0]);
  assert.ok(body.innerHTML.includes('参悟【剑心锋芒】至 1 层'), '参悟仍是一键生效');
  assert.ok(!body.innerHTML.includes('data-path-confirm="yes"'), '参悟不加确认');
  UI.tick();
  assert.strictEqual(els['path-entry-text'].textContent, '本命道途 · 剑道 1/9');
  clickData(actions, 'path-torespec', '1');
  assert.strictEqual(UI._view(), 'respec');
  assert.ok(body.innerHTML.includes(TXT.respecNoRefund), '重定说明含不退还');
  assert.ok(!/data-path-respec="jian"/.test(body.innerHTML));
  clickData(body, 'path-respec', 'ti');
  assert.strictEqual(st.path.id, 'jian', '改修需二次确认');
  assert.ok(body.innerHTML.includes(TXT.respecConfirmTitle));
  clickData(body, 'path-confirm', 'yes');
  assert.strictEqual(st.path.id, 'ti');
  assert.deepStrictEqual(Array.from(st.path.lv), [1, 0, 0]);
  assert.strictEqual(UI._view(), 'main');
  assert.ok(body.innerHTML.includes('已改修体道'));
  (docListeners.keydown || []).forEach((fn) => fn({ key: 'Escape' }));
  assert.ok(!UI.isOpen());
  fire(els['btn-path-open'], 'click', {});
  fire(els['path-modal'], 'click', { target: els['path-modal'] });
  assert.ok(!UI.isOpen());
  fire(els['btn-path-open'], 'click', {});
  fire(els['btn-path-close'], 'click', {});
  assert.ok(!UI.isOpen());
});

check('index.html 引用 path.js 且有入口/弹窗节点；样式存在', () => {
  const index = text('index.html');
  assert.match(index, /<script src="js\/path\.js\?v=\d+"><\/script>/);
  assert.ok(index.indexOf('js/path.js') > index.indexOf('js/state.js'));
  ['btn-path-open', 'path-entry-text', 'badge-path', 'path-modal', 'path-modal-body', 'path-modal-actions', 'btn-path-close'].forEach((id) => assert.ok(index.includes(`id="${id}"`), id));
  const row = index.slice(index.indexOf('class="breakthrough-row"'), index.indexOf('id="tab-gear"'));
  assert.ok(row.includes('id="btn-path-open"') && row.includes('class="breakthrough-actions"'), '入口应与突破按钮同一行');
  assert.ok(!/id="btn-path-open"[^>]*\shidden(?:\s|\/|>)/.test(row), '化灵前入口不再 hidden');
  const css = text('css/style.css');
  ['.path-entry', '.path-dialog', '.path-modal-body::-webkit-scrollbar', '.path-node', '.path-card', '.breakthrough-actions', '.path-entry.is-locked', '.path-confirm'].forEach((c) => assert.ok(css.includes(c), c));
  const hero = css.slice(css.indexOf('/* Hero stage */'));
  assert.ok(/min-height:\s*168px/.test(hero.slice(0, 400)), 'hero-stage 高度保持不变');
  assert.ok(fs.existsSync(path.join(root, 'assets/icons/gf_taiqingjue@64.webp')));
  ['path_jian', 'path_ti', 'path_fu'].forEach((id) => {
    assert.ok(fs.existsSync(path.join(root, `assets/ui/path/${id}.webp`)), id);
    assert.ok(fs.existsSync(path.join(root, `assets/ui/path/${id}@64.webp`)), `${id}@64`);
  });
  assert.ok(text('js/path.js').includes('assets/ui/path/path_jian'));
  assert.ok(css.includes('grayscale(1)'), '锁定入口用 CSS grayscale，不另出图');
  assert.ok(index.includes('id="path-modal-title-icon"'));
});

check('平衡抽样：灵石去处（分钟数）与收益加成保持温和', () => {
  const R = P.RULES;
  const perNode = R.COST_MINUTES.reduce((a, b) => a + b, 0);
  const full = perNode * 3;
  assert.ok(full >= 60 && full <= 240, `全部圆满约 ${full} 分钟产出`);
  const W = runtime();
  const s = freshState(W, 27);
  s.path = { id: 'fu', lv: [3, 3, 3] };
  assert.ok(P.stoneFactor(s) <= 1.25 && P.qiFactor(s) <= 1.2);
  console.log(`  圆满需约 ${full} 分钟灵石产出（单节点 ${perNode} 分钟），重定 ${R.RESPEC_MINUTES} 分钟；符道收益 灵气 ×${P.qiFactor(s).toFixed(2)} 灵石 ×${P.stoneFactor(s).toFixed(2)}`);
});

console.log(`path.test.js: ${passed} checks ok`);
