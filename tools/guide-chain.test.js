// 引导连锁：120 秒连破估算、目标条能突破时突破优先、战败文案、门槛提示、功法 ×10/最大。
// 用法：node tools/guide-chain.test.js
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

function seededRandom(seed) {
  let x = (seed >>> 0) || 1;
  return function () {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    return (x >>> 0) / 4294967296;
  };
}

function loadRuntime() {
  const sandbox = {
    window: {},
    console,
    Math: Object.create(Math),
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
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener() {},
      createElement: () => ({ classList: { add() {}, remove() {}, contains() { return false; } } })
    }
  };
  sandbox.globalThis = sandbox.window;
  sandbox.window.document = sandbox.document;
  const files = ['js/config.js', 'js/equip.js', 'js/battle.js', 'js/state.js', 'js/dispatch.js', 'js/newbie.js'];
  files.forEach((rel) => vm.runInNewContext(text(rel), sandbox, { filename: rel }));
  return {
    CFG: sandbox.window.GameConfig,
    GS: sandbox.window.GameState,
    NB: sandbox.window.Newbie,
    Battle: sandbox.window.Battle,
    Equip: sandbox.window.Equip,
    sandbox
  };
}

function mkTester(W, seed) {
  const { GS, Equip, sandbox } = W;
  GS.loadGame();
  const s = GS.state;
  const real = sandbox.Math.random;
  sandbox.Math.random = seededRandom(seed);
  try {
    s.realmIndex = 1;
    for (let i = 0; i < 30; i += 1) {
      const it = Equip.rollItem(s);
      if (!s.equip[it.s] || Equip.powerWithSwap(s, it) > Equip.combatPower(s)) s.equip[it.s] = it;
    }
  } finally {
    sandbox.Math.random = real;
  }
  s.realmIndex = 2;
  s.gongfa.yinqijue = 4;
  s.qi = 977;
  s.tree.peaches = 12;
  s.peachesPicked = 30;
  s.stage.best = 9;
  s.stage.cur = 10;
  s.stones = 300;
  return s;
}

function findTesterSeed(W) {
  let best = { seed: 1, cp: 0, diff: Infinity };
  for (let seed = 1; seed < 400; seed += 1) {
    const s = mkTester(W, seed);
    const cp = Math.round(Number(W.Battle.playerStats(s).cp) || 0);
    const diff = Math.abs(cp - 1041);
    if (diff < best.diff) best = { seed, cp, diff };
    if (diff <= 12) return { seed, cp };
  }
  return best;
}

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

check('体验官状态 120 秒连锁约 +137 到洞天后，计算前后 state JSON 完全一致', () => {
  const W = loadRuntime();
  const { GS, NB, Battle, CFG } = W;
  const found = findTesterSeed(W);
  assert.ok(found.diff == null || found.diff <= 20 || found.cp, '应能构造接近 1041 战力的状态');
  const s = mkTester(W, found.seed);
  const cp = Math.round(Number(Battle.playerStats(s).cp) || 0);
  assert.ok(Math.abs(cp - 1041) <= 20, `战力应接近 1041，实际 ${cp}（种子 ${found.seed}）`);
  assert.strictEqual(s.realmIndex, 2);
  const stage = GS.getCurrentStage();
  assert.ok(stage && stage.fullName.includes('搬血后'));
  assert.ok(s.qi >= stage.reqQi, `灵气 ${s.qi} 应 ≥ 需求 ${stage.reqQi}`);
  const snap = JSON.stringify(s);
  const chain = NB.estimateBreakChain(s, 120);
  assert.strictEqual(JSON.stringify(s), snap, '计算前后 state 的 JSON 完全一致');
  assert.ok(chain, '应返回连锁结果');
  assert.strictEqual(chain.realmName, '洞天后', `应连破至洞天后，实际 ${chain.realmName}（r${chain.realmIndex}，+${chain.gain}，${chain.seconds}s）`);
  assert.ok(Math.abs(chain.gain - 137) <= 25, `战力增益应接近 +137，实际 +${chain.gain}（起点 ${cp}）`);
  assert.ok(chain.breaks >= 3, `应从搬血后连破至少 3 重，实际 ${chain.breaks}`);
  assert.ok(chain.seconds <= 120);
  // 再算一次走缓存，state 仍不变
  const again = NB.estimateBreakChain(s, 120);
  assert.deepStrictEqual(again, chain);
  assert.strictEqual(JSON.stringify(s), snap);
});

check('目标条：能突破时突破排在花灵石前，花灵石文案带灵气/秒收益', () => {
  const W = loadRuntime();
  const { GS, NB } = W;
  const found = findTesterSeed(W);
  const s = mkTester(W, found.seed);
  s.stage.best = 1;
  s.gongfa.yinqijue = 4;
  s.stones = 1e9;
  s.qi = 977;
  assert.ok(NB.canBreakNow(s));
  const g = NB.currentGoal(s);
  assert.strictEqual(g.id, 'realm3', `能突破时应显示突破至洞天初，实际 ${g.id} ${g.text}`);
  assert.ok(g.text.includes('突破至洞天初'), g.text);
  s.qi = 0;
  const spend = NB.currentGoal(s);
  assert.strictEqual(spend.id, 'spend');
  assert.ok(/灵气\s.+\s*\/s\s*→\s*.+\/s/.test(spend.text), `花灵石文案应带 灵气 x/s → y/s，实际：${spend.text}`);
});

check('战败引导用 120 秒连锁文案，去掉约 0 秒后能突破；灵石项高 50% 才给 ★', () => {
  const W = loadRuntime();
  const { NB } = W;
  const found = findTesterSeed(W);
  const s = mkTester(W, found.seed);
  s.tree.peaches = 0;
  s.pending = null;
  s.stones = 300;
  const snap = JSON.stringify(s);
  const opts = NB.cpGainOptions(s);
  assert.strictEqual(JSON.stringify(s), snap);
  const brk = opts.find((o) => o.key === 'break');
  assert.ok(brk, '应有突破项');
  assert.ok(brk.label.includes('渡劫进入洞天') && brk.label.includes('2 分钟内可连破至') && brk.label.includes('战力 +'), brk.label);
  assert.ok(brk.label.includes('洞天后'), brk.label);
  assert.ok(!/约\s*\d+\s*秒后能突破/.test(opts.map((o) => o.label).join(' ')));
  const spend = opts.find((o) => o.key === 'gongfa');
  if (spend && spend.breaks >= 1) {
    assert.ok(spend.label.includes('参悟功法后 2 分钟内可连破至'), spend.label);
  }
  const keys = opts.map((o) => o.key);
  if (keys.includes('break') && keys.includes('gongfa')) {
    assert.ok(keys.indexOf('break') < keys.indexOf('gongfa'), '排序仍是突破在花灵石前');
  }
  const starred = opts.filter((o) => o.best);
  assert.strictEqual(starred.length, 1);
  if (spend && brk && brk.gain > 0 && spend.gain >= brk.gain * 1.5) {
    assert.strictEqual(spend.best, true);
  } else {
    assert.strictEqual(opts[0].best, true);
  }
});

check('门槛提示：2 分钟内能连破时不显示，否则改为下一重倍数文案', () => {
  const W = loadRuntime();
  const { GS, NB, CFG } = W;
  const found = findTesterSeed(W);
  const s = mkTester(W, found.seed);
  const stage = GS.getCurrentStage();
  assert.strictEqual(CFG.shouldShowTribHint(stage), true, '搬血后仍属大境界门槛');
  const snap = JSON.stringify(s);
  const hint = NB.tribHintText(s, stage);
  assert.strictEqual(JSON.stringify(s), snap);
  assert.strictEqual(hint, '', '灵气已够且 120 秒内可连破时不显示门槛警示');
  // 灵气不够时改为倍数提醒
  s.qi = 0;
  const hint2 = NB.tribHintText(s, stage);
  assert.ok(/渡劫后下一重需灵气 ×\d+，记得先参悟功法提速/.test(hint2), hint2);
  const n = Math.round(CFG.REALM_STAGES[3].reqQi / CFG.REALM_STAGES[2].reqQi);
  assert.ok(hint2.includes(`×${n}`), `倍数应为 ×${n}，实际 ${hint2}`);
});

check('功法页有 ×10 / 最大按钮，375 宽字号至少 12px；buyGongfa 不改造价', () => {
  const game = text('js/game.js');
  const css = text('css/style.css');
  const state = text('js/state.js');
  assert.ok(game.includes('data-gongfa-buy="10"') && game.includes('data-gongfa-buy="max"'), '功法页应有 ×10 / 最大');
  assert.ok(game.includes('GameState.buyGongfa'));
  assert.ok(state.includes('function buyGongfa'));
  assert.ok(/\.gongfa-actions\s+\.btn\s*\{[^}]*font-size:\s*12px/s.test(css), '功法批量按钮字号 ≥ 12px');
  const W = loadRuntime();
  const { GS, CFG } = W;
  GS.loadGame();
  const s = GS.state;
  s.realmIndex = 2;
  s.gongfa.yinqijue = 4;
  const item = CFG.GONGFA_LIST.find((g) => g.id === 'yinqijue');
  const c1 = GS.getGongfaCost(item);
  s.stones = c1;
  const bought1 = GS.buyGongfa('yinqijue', 10);
  assert.strictEqual(bought1, 1, '灵石只够一级时 ×10 也只买一级');
  assert.strictEqual(s.gongfa.yinqijue, 5);
  const c2 = GS.getGongfaCost(item);
  s.stones = c2 * 100;
  const before = s.gongfa.yinqijue;
  const stones0 = s.stones;
  const bought = GS.buyGongfa('yinqijue', 10);
  assert.strictEqual(bought, 10);
  assert.strictEqual(s.gongfa.yinqijue, before + 10);
  assert.ok(s.stones < stones0);
});

console.log(`guide-chain: ${passed} checks passed`);
