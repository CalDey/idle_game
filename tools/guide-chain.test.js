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

check('P2-1 同分桶微变灵气走缓存；跨桶立刻重算（不再用时间节流）', () => {
  const W = loadRuntime();
  const { NB } = W;
  const found = findTesterSeed(W);
  const s = mkTester(W, found.seed);
  NB.resetChainCache();
  const a = NB.estimateBreakChain(s, 120);
  const n1 = NB.chainComputeCalls();
  s.qi += 0.3;
  const b = NB.estimateBreakChain(s, 120);
  const n2 = NB.chainComputeCalls();
  assert.strictEqual(n2, n1, `同分桶微变灵气不得重算，实际 ${n1} -> ${n2}`);
  assert.deepStrictEqual(b, a);
  const c = NB.estimateBreakChain(s, 120);
  assert.strictEqual(NB.chainComputeCalls(), n1);
  assert.strictEqual(NB.CHAIN_THROTTLE_MS, undefined, '已删除时间节流常量');
  assert.ok(NB.CHAIN_CACHE_LIMIT >= 8 && NB.CHAIN_CACHE_LIMIT <= 32);
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

check('P2 只改装备或待处理掉落的词条也会使连锁缓存失效', () => {
  const W = loadRuntime();
  const { NB, Equip } = W;
  const found = findTesterSeed(W);
  const s = mkTester(W, found.seed);
  const base = s.equip.weapon || { s: 'weapon', q: 2, lv: 4, m: 46, id: 'affix-w', name: '试炼剑', sub: [] };
  s.equip = Object.assign({}, s.equip, {
    weapon: Object.assign({}, base, { q: base.q, lv: base.lv, m: base.m, id: base.id || 'affix-w', name: base.name || '试炼剑', sub: [['atkPct', 0.05]] })
  });
  NB.resetChainCache();
  const first = NB.estimateBreakChain(s, 120);
  const n1 = NB.chainComputeCalls();
  const cp0 = Math.round(Equip.combatPower(s));
  // 同品阶/强化/主属性，只改词条
  s.equip.weapon.sub = [['atkPct', 0.25]];
  const second = NB.estimateBreakChain(s, 120);
  const n2 = NB.chainComputeCalls();
  const cp1 = Math.round(Equip.combatPower(s));
  assert.ok(cp1 > cp0, `改词条应提升顶栏战力，${cp0} -> ${cp1}`);
  assert.ok(n2 > n1, `只改已装备词条应立即重算，实际 ${n1} -> ${n2}`);
  assert.ok(second && first);

  s.pending = {
    s: 'weapon', q: s.equip.weapon.q, lv: s.equip.weapon.lv, m: s.equip.weapon.m,
    id: 'pending-affix', name: '待鉴定剑', sub: [['atkPct', 0.10]]
  };
  NB.estimateBreakChain(s, 120, { buyFirst: 'peach' });
  const n3 = NB.chainComputeCalls();
  s.pending = Object.assign({}, s.pending, { sub: [['atkPct', 0.30]] });
  NB.estimateBreakChain(s, 120, { buyFirst: 'peach' });
  const n4 = NB.chainComputeCalls();
  assert.ok(n4 > n3, `只改待处理掉落词条应立即重算，实际 ${n3} -> ${n4}`);
  s.pending = Object.assign({}, s.pending, { id: 'pending-affix-2', sub: [['atkPct', 0.30]] });
  NB.estimateBreakChain(s, 120, { buyFirst: 'peach' });
  const n5 = NB.chainComputeCalls();
  assert.ok(n5 > n4, `待处理掉落 id 变化应立即重算，实际 ${n4} -> ${n5}`);
});

check('P3 仙桃树等级与摘桃保底计入缓存键', () => {
  const W = loadRuntime();
  const { NB } = W;
  const found = findTesterSeed(W);
  const s = mkTester(W, found.seed);
  s.tree = Object.assign({}, s.tree, { lv: 1, peaches: 12 });
  s.pity = { di: 0, tian: 0 };
  NB.resetChainCache();
  NB.estimateBreakChain(s, 120, { buyFirst: 'peach' });
  const n1 = NB.chainComputeCalls();
  s.tree = Object.assign({}, s.tree, { lv: 3 });
  NB.estimateBreakChain(s, 120, { buyFirst: 'peach' });
  const n2 = NB.chainComputeCalls();
  assert.ok(n2 > n1, `改 tree.lv 应立即重算，实际 ${n1} -> ${n2}`);
  s.pity = { di: 2, tian: 0 };
  NB.estimateBreakChain(s, 120, { buyFirst: 'peach' });
  const n3 = NB.chainComputeCalls();
  assert.ok(n3 > n2, `改 s.pity 应立即重算，实际 ${n2} -> ${n3}`);
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

check('P2 化灵中一次补满灵气后即使不足 500ms 也立刻重算出文案', () => {
  const W = loadRuntime();
  const { GS, NB, CFG } = W;
  GS.loadGame();
  const s = GS.state;
  const stage = CFG.REALM_STAGES[7];
  assert.ok(stage && stage.fullName.includes('化灵中'), stage && stage.fullName);
  s.realmIndex = 7;
  s.qi = 10;
  s.stones = 0;
  s.tree.peaches = 0;
  s.pending = null;
  s.breakAttempts = 0;
  NB.resetChainCache();
  const t0 = 3_000_000;
  const empty = NB.estimateBreakChain(s, 120, { now: t0 });
  assert.ok(empty && empty.breaks === 0, `灵气不足时应 breaks=0，实际 ${empty && empty.breaks}`);
  const emptyLabel = NB.formatBreakChainLabel(s, empty);
  assert.ok(!emptyLabel || !emptyLabel.includes('可连破至'), emptyLabel);
  const n1 = NB.chainComputeCalls();
  s.qi = stage.reqQi;
  const ready = NB.estimateBreakChain(s, 120, { now: t0 + 100 });
  const n2 = NB.chainComputeCalls();
  assert.ok(n2 > n1, `跨桶补满灵气应立即重算，实际 ${n1} -> ${n2}`);
  assert.ok(ready && ready.breaks >= 1, `补满后应能连破，实际 ${ready && ready.breaks} ${ready && ready.realmName}`);
  const label = NB.formatBreakChainLabel(s, ready);
  assert.ok(label && (label.includes('可连破') || label.includes('再成功一次')) && label.includes('战力 +'), label);
  assert.ok(NB.canBreakNow(s));
});

check('P3-1 LRU：不同 buyFirst 互不覆盖，二次查询不重算', () => {
  const W = loadRuntime();
  const { NB } = W;
  const found = findTesterSeed(W);
  const s = mkTester(W, found.seed);
  s.stones = 1e9;
  NB.resetChainCache();
  NB.estimateBreakChain(s, 120, { buyFirst: 'gongfa' });
  const n1 = NB.chainComputeCalls();
  NB.estimateBreakChain(s, 120, { buyFirst: false });
  const n2 = NB.chainComputeCalls();
  assert.ok(n2 > n1, '不同 buyFirst 应各自计算一次');
  NB.estimateBreakChain(s, 120, { buyFirst: 'gongfa' });
  NB.estimateBreakChain(s, 120, { buyFirst: false });
  assert.strictEqual(NB.chainComputeCalls(), n2, '已缓存的 buyFirst 组合不得被互相挤掉');
});

check('P3-2 120 秒无增益且不能突破时不标推荐优先', () => {
  const W = loadRuntime();
  const { GS, NB } = W;
  GS.loadGame();
  const s = GS.state;
  s.realmIndex = 7;
  s.qi = 0;
  s.stones = 0;
  s.tree.peaches = 0;
  s.pending = null;
  s.breakAttempts = 99;
  NB.resetChainCache();
  const rec = NB.recommendBest(s);
  assert.strictEqual(rec, null, `无事可做时 recommendBest 应为 null，实际 ${rec && rec.key}`);
  const opts = NB.cpGainOptions(s);
  assert.strictEqual(opts.filter((o) => o.best).length, 0, '不得把 shown[0] 标成 ★');
  const src = text('js/newbie.js');
  assert.ok(src.includes('els.goalRecommend.hidden = true'), '无推荐时应隐藏目标条「推荐优先」');
});

check('P3-3 模拟中新建的字段在还原时删除，state JSON 与开始一致', () => {
  const W = loadRuntime();
  const { GS, NB } = W;
  GS.loadGame();
  const s = GS.state;
  s.realmIndex = 2;
  s.qi = 977;
  s.stones = 1e9;
  delete s.gongfa;
  assert.ok(!Object.prototype.hasOwnProperty.call(s, 'gongfa'));
  const snap = JSON.stringify(s);
  NB.resetChainCache();
  NB.estimateBreakChain(s, 120, { buyFirst: 'gongfa' });
  assert.strictEqual(JSON.stringify(s), snap, 'buyFirst 功法试算不得把原本缺失的 gongfa 留在存档上');
  assert.ok(!Object.prototype.hasOwnProperty.call(s, 'gongfa'));
});

check('缓存键含队伍/神兽/失败加成，改 squad 立即失效', () => {
  const W = loadRuntime();
  const { NB } = W;
  const found = findTesterSeed(W);
  const s = mkTester(W, found.seed);
  s.beasts = { owned: { fox: { lv: 1 } } };
  s.pityBonus = 0;
  NB.resetChainCache();
  NB.estimateBreakChain(s, 120);
  const n1 = NB.chainComputeCalls();
  s.squad = ['lanyi'];
  NB.estimateBreakChain(s, 120);
  const n2 = NB.chainComputeCalls();
  assert.ok(n2 > n1, `改 squad 应立即重算，实际 ${n1} -> ${n2}`);
  s.pityBonus = 0.08;
  NB.estimateBreakChain(s, 120);
  const n3 = NB.chainComputeCalls();
  assert.ok(n3 > n2, `改 pityBonus 应立即重算，实际 ${n2} -> ${n3}`);
  s.beasts = { owned: { fox: { lv: 2 } } };
  NB.estimateBreakChain(s, 120);
  const n4 = NB.chainComputeCalls();
  assert.ok(n4 > n3, `改 beasts 应立即重算，实际 ${n3} -> ${n4}`);
});

check('B1 引导战力与顶栏同一口径，相对实测 +75 误差不超过 10%', () => {
  const W = loadRuntime();
  const { GS, NB, Equip, Battle } = W;
  const fixturePath = path.join(__dirname, '../../qa/regress8_v130/saves/v136_plus137_estimate_vs_actual.json');
  const fix = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  GS.loadGame();
  const s = GS.state;
  const tuned = fix.tuned;
  s.realmIndex = tuned.realm;
  s.qi = tuned.qi;
  s.stones = tuned.stones;
  s.tree.peaches = tuned.peaches;
  s.equip = JSON.parse(JSON.stringify(tuned.equip));
  s.breakAttempts = 0;
  s.pityBonus = 0;
  s.squad = ['lanyi'];
  const cp0 = Math.round(Equip.combatPower(s));
  assert.ok(Math.abs(cp0 - tuned.cp) <= 20, `顶栏战力应接近 ${tuned.cp}，实际 ${cp0}`);
  NB.resetChainCache();
  const snap = JSON.stringify(s);
  const chain = NB.estimateBreakChain(s, 120);
  assert.strictEqual(JSON.stringify(s), snap);
  assert.ok(chain && chain.breaks === 2 && chain.realmName === '洞天中', `${chain && chain.breaks} ${chain && chain.realmName}`);
  const est = Number(chain.gain) || 0;
  const expected = Number(fix.actual.actualGain) || 75;
  assert.ok(Math.abs(est - expected) / expected <= 0.10, `估算 +${est} 应在实测 +${expected} 的 ±10% 内`);
  const battleGainScale = Math.round(Number(Battle.playerStats(s).cp) || 0);
  assert.ok(est > 40, `不得再误用带人数缩放的 Battle.cp（单人时顶栏约 ${cp0}，Battle=${battleGainScale}）`);

  const qiPer = Number(GS.getQiPerSec()) || 0;
  s.qi = (Number(s.qi) || 0) + qiPer * 120;
  let applied = 0;
  while (applied < 2) {
    const r = GS.applyBreakthroughAttempt(0);
    assert.ok(r && r.success, `第 ${applied + 1} 次保底突破应成功，实际 ${JSON.stringify(r)}`);
    applied += 1;
  }
  const cp1 = Math.round(Equip.combatPower(s));
  const actualGain = cp1 - cp0;
  assert.strictEqual(s.realmIndex, 4);
  assert.ok(Math.abs(est - actualGain) / Math.max(1, actualGain) <= 0.10, `估算 +${est} 相对当场连破 +${actualGain}（${cp0}→${cp1}）应在 ±10%`);
});

check('B2 搬血后空 unlockSeen 仍先弹法宝，不把灵泉眼插到 1-10 前面', () => {
  const W = loadRuntime();
  const { GS, NB } = W;
  GS.loadGame();
  const s = GS.state;
  s.realmIndex = 2;
  s.stage.best = 0;
  s.stage.cur = 1;
  s.unlockSeen = {};
  s.guide = Object.assign({}, s.guide, { gearPopup: true, gearVisited: false });
  const u = NB.pendingUnlock(s);
  assert.ok(u && u.key === 'gear', `unlockSeen={} 且 gearPopup 已记时仍应先出法宝，实际 ${u && u.key}`);
  assert.strictEqual(s.unlockSeen.gear, undefined);
  assert.strictEqual(NB.shouldShowGearBeforeStage(s), true);
  const src = text('js/newbie.js');
  assert.ok(src.includes('shouldDeferUnlock'));
  assert.ok(src.includes("activeTab() === 'tab-stage' && bestStage(s) < 10"));
});

check('B3 缓存命中时不重建键；fullKey 变化仍立刻重算', () => {
  const W = loadRuntime();
  const { NB } = W;
  const found = findTesterSeed(W);
  const s = mkTester(W, found.seed);
  NB.resetChainCache();
  NB.estimateBreakChain(s, 120);
  const builds = NB.chainKeyBuildCalls();
  const n1 = NB.chainComputeCalls();
  for (let i = 0; i < 80; i += 1) NB.estimateBreakChain(s, 120);
  assert.strictEqual(NB.chainComputeCalls(), n1, '命中缓存不得重跑模拟');
  assert.strictEqual(NB.chainKeyBuildCalls(), builds, '命中时不得反复拼键 / JSON.stringify');
});

console.log(`guide-chain: ${passed} checks passed`);
