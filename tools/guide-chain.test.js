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

check('战败引导用 120 秒连锁文案，去掉约 0 秒后能突破；★ 与目标条同一推荐', () => {
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
  assert.strictEqual(starred.length, 1, '同时只有一颗 ★');
  const rec = NB.recommendBest(s);
  assert.ok(rec, '应给出推荐优先项');
  const recKeys = rec.key === 'peach' ? ['peach', 'pending'] : [rec.key];
  assert.ok(recKeys.includes(starred[0].key), `战败页 ★ 应与目标条推荐 ${rec.key} 相同，实际 ${starred[0].key}`);
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

check('P2-1 节流窗口内重复调用不重跑连锁模拟', () => {
  const W = loadRuntime();
  const { NB } = W;
  const found = findTesterSeed(W);
  const s = mkTester(W, found.seed);
  NB.resetChainCache();
  const t0 = 1_000_000;
  const a = NB.estimateBreakChain(s, 120, { now: t0 });
  const n1 = NB.chainComputeCalls();
  s.qi += 0.3;
  const b = NB.estimateBreakChain(s, 120, { now: t0 + 100 });
  const n2 = NB.chainComputeCalls();
  assert.strictEqual(n2, n1, `500ms 内且输入未实质变化时不得重算，实际 ${n1} -> ${n2}`);
  assert.deepStrictEqual(b, a);
  const c = NB.estimateBreakChain(s, 120, { now: t0 + 200 });
  assert.strictEqual(NB.chainComputeCalls(), n1);
  assert.ok(NB.CHAIN_THROTTLE_MS >= 400 && NB.CHAIN_THROTTLE_MS <= 800);
});

check('P2-2 缓存键含装备/称号等，改装备或称号会失效重算', () => {
  const W = loadRuntime();
  const { NB } = W;
  const found = findTesterSeed(W);
  const s = mkTester(W, found.seed);
  if (!s.titles) s.titles = { owned: ['churu'], worn: 'churu', seen: ['churu'] };
  if (!s.talents) s.talents = {};
  s.totalDaoGuo = s.totalDaoGuo || 0;
  s.breakAttempts = s.breakAttempts || 0;
  NB.resetChainCache();
  const t0 = 2_000_000;
  NB.estimateBreakChain(s, 120, { now: t0 });
  const n1 = NB.chainComputeCalls();
  const snap = JSON.stringify(s);
  s.equip = Object.assign({}, s.equip, { ring: { s: 'ring', q: 4, lv: 8, m: 40, sub: [] } });
  NB.estimateBreakChain(s, 120, { now: t0 + 50 });
  const n2 = NB.chainComputeCalls();
  assert.ok(n2 > n1, `改装备应立即重算，实际 ${n1} -> ${n2}`);
  s.titles = Object.assign({}, s.titles, { worn: 'changed-title-for-cache' });
  NB.estimateBreakChain(s, 120, { now: t0 + 80 });
  const n3 = NB.chainComputeCalls();
  assert.ok(n3 > n2, `改称号应立即重算，实际 ${n2} -> ${n3}`);
  assert.ok(JSON.stringify(s) !== snap);
});

check('P2-3 保底覆盖整段连锁时文案不变；保底用尽后停在首次非保底并附再成功一次', () => {
  const W = loadRuntime();
  const { GS, NB } = W;
  const found = findTesterSeed(W);
  const s = mkTester(W, found.seed);
  s.tree.peaches = 0;
  s.pending = null;
  s.breakAttempts = 0;
  const snap0 = JSON.stringify(s);
  const covered = NB.estimateBreakChain(s, 120);
  assert.strictEqual(JSON.stringify(s), snap0);
  assert.ok(covered.breaks >= 3 && covered.realmName === '洞天后', `保底足够时应仍连到洞天后，实际 ${covered.realmName} +${covered.gain} ${covered.breaks}重`);
  assert.ok(!covered.nextRealmName, '保底覆盖整段时不应附加「再成功一次」');
  const label0 = NB.formatBreakChainLabel(s, covered);
  assert.ok(label0.includes('2 分钟内可连破至洞天后') && !label0.includes('再成功一次'), label0);

  s.breakAttempts = (GS.GUARANTEED_BREAKS || 3) - 1; // 只剩 1 次保底
  const snap1 = JSON.stringify(s);
  const truncated = NB.estimateBreakChain(s, 120);
  assert.strictEqual(JSON.stringify(s), snap1, '截断试算后 state JSON 不变');
  assert.strictEqual(truncated.breaks, 1, `只应计入保底的那一重，实际 ${truncated.breaks} 到 ${truncated.realmName}`);
  assert.strictEqual(truncated.realmName, '洞天初');
  assert.ok(truncated.nextRealmName, '应预览下一次成功');
  assert.strictEqual(truncated.nextRealmName, '洞天中');
  assert.ok(truncated.nextGain > truncated.gain, `再成功一次的战力应从起点计且高于保底段，${truncated.gain} vs ${truncated.nextGain}`);
  const rate = truncated.nextRate;
  assert.ok(rate > 0 && rate <= 0.98, `成功率应取自游戏公式，实际 ${rate}`);
  const pct = Math.round(rate * 100);
  const label1 = NB.formatBreakChainLabel(s, truncated);
  assert.ok(label1.includes('2 分钟内可连破至洞天初') && label1.includes(`再成功一次（约 ${pct}%）可至洞天中，战力 +`), label1);
  assert.ok(!label1.includes('期望') && !/期望|期望值|EV/i.test(label1));
});

check('P3-1 新档/读档重置 peachHold 与 lastGoal；P3-2 未解锁功法按钮禁用', () => {
  const W = loadRuntime();
  const { NB } = W;
  NB.onStateReload();
  const sess = NB.goalSession();
  assert.strictEqual(sess.lastGoal, null);
  assert.strictEqual(sess.peachHoldUntil, 0);
  const game = text('js/game.js');
  assert.ok(/loadGame\(\)[\s\S]{0,180}Newbie\.onStateReload/.test(game), '读档后应重置目标条停顿状态');
  assert.ok(/resetGame\(\)[\s\S]{0,180}Newbie\.onStateReload/.test(game), '新档后应重置目标条停顿状态');
  assert.ok(!/canAfford \|\| !unlocked \? '' : 'disabled'/.test(game), '锁定功法不得因为 !unlocked 而可点');
  assert.ok(/data-gongfa-buy="1"[\s\S]{0,80}canAfford \? '' : 'disabled'/.test(game));
  assert.ok(text('index.html').includes('id="goal-recommend"') && text('css/style.css').includes('.goal-recommend'));
});

check('目标条与战败页推荐同一项，且同时只有一颗星', () => {
  const W = loadRuntime();
  const { NB } = W;
  const found = findTesterSeed(W);
  const s = mkTester(W, found.seed);
  s.tree.peaches = 0;
  s.pending = null;
  const rec = NB.recommendBest(s);
  const opts = NB.cpGainOptions(s);
  assert.strictEqual(opts.filter((o) => o.best).length, 1);
  const star = opts.find((o) => o.best);
  assert.ok(rec && star);
  const recKeys = rec.key === 'peach' ? ['peach', 'pending'] : [rec.key];
  assert.ok(recKeys.includes(star.key), `推荐 ${rec.key}/${rec.name}，战败 ★ 为 ${star.key}`);
  assert.ok(['突破', '修行', '法宝', '洞府', '道途'].includes(rec.name), rec.name);
});

console.log(`guide-chain: ${passed} checks passed`);
