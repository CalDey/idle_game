// 体验官第 7 批：页签红点落到具体按钮、补洞天纳神篇/仙姬派遣机缘卡、
// 渡劫门槛提示覆盖搬血后→洞天初、首次进闯关前先弹法宝卡。
// 用法：node tools/batch7.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const text = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const SAVE_KEY = 'xiuxian_idle_save_v1';
const plain = (v) => JSON.parse(JSON.stringify(v));

function memoryStorage(initial) {
  const data = Object.assign({}, initial || {});
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    _data: data
  };
}

function oldSave(fields) {
  return JSON.stringify(Object.assign({ version: 3, realmIndex: 0, qi: 10, stones: 30, lastSaveTime: Date.now() }, fields));
}

function loadRuntime(storage, extraFiles) {
  const sandbox = {
    window: {},
    console,
    localStorage: storage || memoryStorage(),
    setTimeout,
    clearTimeout,
    matchMedia: () => ({ matches: false }),
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} }
  };
  sandbox.globalThis = sandbox.window;
  const files = ['js/config.js', 'js/equip.js', 'js/battle.js', 'js/state.js', 'js/dispatch.js', 'js/newbie.js'].concat(extraFiles || []);
  files.forEach((rel) => vm.runInNewContext(text(rel), sandbox, { filename: rel }));
  return {
    CFG: sandbox.window.GameConfig,
    GS: sandbox.window.GameState,
    NB: sandbox.window.Newbie,
    Dispatch: sandbox.window.Dispatch,
    sandbox
  };
}

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

check('P2 红点：修行/法宝/洞府页签是可执行操作类；进页后仍亮时，具体按钮也有红点', () => {
  const { GS, NB } = loadRuntime();
  GS.loadGame();
  const s = GS.state;
  const now = Date.now();

  // 修行：badge-breakthrough 跟 canBreak，不是「进过就灭」
  const game = text('js/game.js');
  assert.ok(/badgeBreakthrough[\s\S]{0,80}canBreak/.test(game), '修行页签红点跟可突破');
  assert.ok(/setActionBadge\(els\.btnBreakthrough,\s*canBreak\)/.test(game), '可突破时突破按钮也打红点');
  assert.ok(text('index.html').includes('id="btn-breakthrough"') && text('index.html').includes('action-badge'), '突破按钮有红点节点');

  // 法宝：进过页签后，摘桃满 10 / 待处理掉落 / 树升级完成仍亮页签
  s.realmIndex = 1;
  s.guide.gearVisited = true;
  s.pending = null;
  s.tree.peaches = 3;
  s.tree.upEnd = 0;
  assert.strictEqual(NB.gearDot(s, now), false);
  assert.strictEqual(NB.gearPickDot(s), false);
  assert.strictEqual(NB.gearTreeDot(s, now), false);
  s.tree.peaches = 10;
  assert.strictEqual(NB.gearDot(s, now), true, '可摘桃时页签亮');
  assert.strictEqual(NB.gearPickDot(s), true, '摘桃按钮亮');
  assert.strictEqual(NB.gearTreeDot(s, now), false, '树升级按钮不亮');
  s.tree.peaches = 0;
  s.pending = { s: 'weapon', q: 0, lv: 1, m: 8, sub: [] };
  assert.strictEqual(NB.gearDot(s, now), true);
  assert.strictEqual(NB.gearPickDot(s), true, '待处理掉落时摘桃按钮亮');
  s.pending = null;
  s.tree.upEnd = now - 1;
  assert.strictEqual(NB.gearDot(s, now), true);
  assert.strictEqual(NB.gearPickDot(s), false);
  assert.strictEqual(NB.gearTreeDot(s, now), true, '树升级完成时升级按钮亮');

  const gearSrc = text('js/gear.js');
  assert.ok(gearSrc.includes('gearPickDot') && gearSrc.includes('gearTreeDot'), '法宝页把红点打到摘桃/升级按钮');
  assert.ok(text('index.html').includes('id="btn-pick-peach"') && text('index.html').includes('id="btn-tree-up"'));

  // 新解锁类：进过对应洞府/功法页签后清掉
  s.realmIndex = 3;
  s.unlockSeen = {};
  s.unlockVisited = {};
  assert.strictEqual(NB.unlockTabDot(s, 'gongfa'), true, '洞天纳神篇未去过时功法页签亮');
  assert.strictEqual(NB.unlockItemUnvisited(s, 'gongfa', 'taiqingjue'), true);
  NB.markUnlockPaneVisited(s, 'gongfa');
  assert.strictEqual(NB.unlockTabDot(s, 'gongfa'), false);
  assert.strictEqual(NB.unlockItemUnvisited(s, 'gongfa', 'taiqingjue'), false);

  // 洞府可买：页签保持亮，具体参悟/升级按钮也打红点
  assert.ok(/setActionBadge\([\s\S]*canAfford \|\| gongfaNew/.test(game), '买得起或新功法时参悟按钮打红点');
  assert.ok(/setActionBadge\([\s\S]*canAfford \|\| dongfuNew/.test(game), '买得起或新建筑时×1 按钮打红点');
  const css = text('css/style.css');
  assert.ok(/\.action-badge/.test(css) && /\.action-badge\.visible/.test(css));
  assert.ok(!/getImageData/.test(game + gearSrc + css + text('js/newbie.js')));
});

check('P2 新机缘：洞天纳神篇与仙姬派遣都会弹卡并跳到对应页；旧档不刷屏', () => {
  const { GS, NB, Dispatch } = loadRuntime();
  GS.loadGame();
  const s = GS.state;
  const items = NB.itemUnlocks();
  const nashen = items.find((u) => u.key === 'gongfa:taiqingjue');
  assert.ok(nashen, '洞天纳神篇在功法单项机缘里');
  assert.ok(nashen.title.includes('洞天纳神篇'));
  assert.strictEqual(nashen.tab, 'tab-upgrades');
  assert.strictEqual(nashen.pane, 'gongfa');
  assert.strictEqual(nashen.test({ realmIndex: 2 }), false, '搬血后未开');
  assert.strictEqual(nashen.test({ realmIndex: 3 }), true, '洞天初开启');

  s.unlockSeen = { gear: true };
  s.unlockVisited = {};
  s.realmIndex = 3;
  const first = NB.pendingUnlock(s);
  assert.ok(first && first.key === 'gongfa:taiqingjue', `洞天初应先弹洞天纳神篇，实际 ${first && first.key}`);

  const dispatch = NB.UNLOCKS.find((u) => u.key === 'dispatch');
  assert.ok(dispatch && dispatch.title.includes('仙姬派遣'));
  assert.strictEqual(dispatch.tab, 'tab-upgrades');
  assert.strictEqual(dispatch.go, '去派遣');
  assert.strictEqual(Dispatch.RULES.UNLOCK_BEST, 5);
  assert.strictEqual(dispatch.test({ stage: { best: 4 } }), false);
  assert.strictEqual(dispatch.test({ stage: { best: 5 } }), true);

  s.realmIndex = 2;
  s.unlockSeen = { gear: true };
  s.stage.best = 5;
  const dPending = NB.pendingUnlock(s);
  assert.ok(dPending && dPending.key === 'dispatch', `首通第 5 关应弹仙姬派遣，实际 ${dPending && dPending.key}`);

  const nb = text('js/newbie.js');
  const game = text('js/game.js');
  assert.ok(nb.includes("u.key === 'dispatch'") && nb.includes('openDispatch'), '去派遣会打开派遣界面');
  assert.ok(game.includes('openDispatch:') && game.includes('Dispatch.ui.open'), 'game 把 openDispatch 接到 Dispatch.ui.open');
  assert.strictEqual(NB.unlockArtSrc('dispatch'), '', '派遣卡无配图，用字标，不请求 404 图');
  assert.strictEqual(NB.unlockArtSrc('gongfa:taiqingjue'), '', '洞天纳神篇无配图，用字标');
  assert.ok(NB.unlockArtSrc('gear'), '已有配图的 key 仍请求图片');

  // 旧档：已解锁的直接记为已看，不刷屏
  const { GS: GS2, NB: NB2 } = loadRuntime(memoryStorage({
    [SAVE_KEY]: oldSave({ realmIndex: 6, stage: { best: 20, cur: 21 } })
  }));
  GS2.loadGame();
  assert.strictEqual(NB2.pendingUnlock(GS2.state), null, '中期旧档不把洞天纳神篇和派遣再弹一遍');
  assert.strictEqual(GS2.state.unlockSeen['gongfa:taiqingjue'], true);
  assert.strictEqual(GS2.state.unlockVisited['gongfa:taiqingjue'], true);
  assert.strictEqual(GS2.state.unlockSeen.dispatch, true);
});

check('P3 渡劫门槛提示：搬血后→洞天初算大境界会显示；同时纳入门槛 ≥5 倍', () => {
  const { CFG } = loadRuntime();
  const banxueHou = CFG.REALM_STAGES.find((st) => st.fullName === '搬血后');
  const dongtianChu = CFG.REALM_STAGES.find((st) => st.fullName === '洞天初');
  const banxueZhong = CFG.REALM_STAGES.find((st) => st.fullName === '搬血中');
  const liezhenHou = CFG.REALM_STAGES.find((st) => st.fullName === '列阵后');
  assert.ok(banxueHou && banxueHou.isMajorTribulation, '搬血后→洞天初本就是大境界渡劫');
  assert.strictEqual(dongtianChu.index, banxueHou.index + 1);
  const jump = dongtianChu.reqQi / banxueHou.reqQi;
  assert.ok(jump >= CFG.TRIB_HINT_COST_RATIO, `搬血后门槛倍数 ${jump} 应 ≥ ${CFG.TRIB_HINT_COST_RATIO}`);
  assert.strictEqual(CFG.shouldShowTribHint(banxueHou), true, '搬血后应显示提示');
  assert.strictEqual(CFG.shouldShowTribHint(banxueZhong), false, '搬血中是小突破，不显示');
  assert.ok(liezhenHou.isMajorTribulation);
  assert.ok(CFG.REALM_STAGES[liezhenHou.index + 1].reqQi / liezhenHou.reqQi < CFG.TRIB_HINT_COST_RATIO, '列阵后倍数不足 5');
  assert.strictEqual(CFG.shouldShowTribHint(liezhenHou), true, '大境界即使倍数不足 5 仍显示');
  const fake = { index: 0, reqQi: 100, isMajorTribulation: false, isMaxStage: false };
  const fakeNext = [{ index: 0, reqQi: 100 }, { index: 1, reqQi: 500 }];
  assert.strictEqual(CFG.shouldShowTribHint(fake, fakeNext), true, '非大境界但倍数 ≥5 也显示');
  assert.strictEqual(CFG.shouldShowTribHint({ ...fake, isMaxStage: true }, fakeNext), false);
  const game = text('js/game.js');
  assert.ok(game.includes('shouldShowTribHint'), 'game.js 用统一函数驱动提示显隐');
});

check('建议：首次进闯关前，若法宝卡还没弹过则先弹出；不与摘桃引导冲突', () => {
  const { GS, NB } = loadRuntime();
  GS.loadGame();
  const s = GS.state;
  assert.strictEqual(NB.shouldShowGearBeforeStage(s), false, '闯关未开不弹');
  s.realmIndex = 1;
  s.unlockSeen = {};
  assert.strictEqual(NB.shouldShowGearBeforeStage(s), false, '法宝已开但闯关未开，不在闯关页抢弹');
  s.realmIndex = 2;
  s.unlockSeen = {};
  s.peachesPicked = 0;
  s.tree.peaches = 30;
  assert.strictEqual(NB.shouldShowGearBeforeStage(s), true, '闯关已开且法宝卡未弹过');
  const api = { playerStats: () => ({ cp: 1000 }), enemyFor: () => ({ cp: 600 }) };
  assert.strictEqual(NB.peachGoalDone(s), false);
  assert.strictEqual(NB.stageDot(s, api, Date.now()), false, '赠桃未摘完仍不点闯关红点（ed7efa0）');
  s.unlockSeen.gear = true;
  assert.strictEqual(NB.shouldShowGearBeforeStage(s), false, '已经弹过就不再截闯关');
  assert.strictEqual(NB.stageDot(s, api, Date.now()), false, '弹过卡但桃没摘完，闯关红点仍不亮');

  const game = text('js/game.js');
  assert.ok(/targetId === 'tab-stage'[\s\S]{0,200}promptGearBeforeStage/.test(game), '第一次打开闯关页时触发');
  assert.ok(text('js/newbie.js').includes('shouldShowGearBeforeStage') && text('js/newbie.js').includes('promptGearBeforeStage'));
});


check('第5条 战败引导：优先级、买完后的 T、目标条、对比主按钮、自动分解不拆更强装备', () => {
  const { GS, NB, sandbox } = loadRuntime();
  GS.loadGame();
  const s = GS.state;
  const E = sandbox.window.Equip;

  // 待换更强法宝优先于突破/摘桃/功法
  s.realmIndex = 4;
  s.qi = 1e12;
  s.stones = 1e9;
  s.tree.peaches = 8;
  s.equip.weapon = { s: 'weapon', q: 0, lv: 1, m: 8, sub: [] };
  const better = { s: 'weapon', q: 4, lv: 8, m: 40, sub: [] };
  s.pending = better;
  assert.ok(E.powerWithSwap(s, better) > E.combatPower(s), '测试用装备确实更强');
  const snap = JSON.stringify(s);
  let opts = NB.cpGainOptions(s);
  assert.strictEqual(JSON.stringify(s), snap, '估算后存档还原');
  assert.strictEqual(opts[0].key, 'pending');
  assert.ok(opts[0].label.includes('有更好的法宝没换上'));
  assert.ok(opts.length <= 3);
  assert.strictEqual(opts.filter((o) => o.best).length, 1, '同时只有一颗 ★');

  // 没有待换时，灵气够突破排第一
  s.pending = null;
  opts = NB.cpGainOptions(s);
  assert.strictEqual(opts[0].key, 'break');
  assert.ok(opts[0].label.includes('可以突破') && opts[0].label.includes('2 分钟内可连破'));

  // 灵气不够时，有桃则摘桃优先于功法
  s.qi = 0;
  opts = NB.cpGainOptions(s);
  assert.strictEqual(opts[0].key, 'peach');
  assert.ok(opts[0].label.includes('还有 8 个仙桃没摘'));

  // 没桃、有闲置灵石：T 必须按买完后的灵气/秒
  s.tree.peaches = 0;
  s.stones = 1e9;
  s.qi = 0;
  const stage = GS.getCurrentStage();
  const qiBefore = GS.getQiPerSec();
  const tIfCurrent = Math.ceil(stage.reqQi / qiBefore);
  const detail = NB.estimateSpendDetail(s);
  assert.ok(detail, '应该能买功法/洞府');
  assert.ok(detail.qiPerSecAfter > qiBefore, '买完后灵气更快');
  const tAfter = Math.ceil(stage.reqQi / detail.qiPerSecAfter);
  assert.strictEqual(detail.eta, tAfter, 'T 用买完后的速度，不能用当前速度凑');
  assert.ok(detail.eta !== tIfCurrent || qiBefore === detail.qiPerSecAfter, '若速度快了，T 必须变短');
  opts = NB.cpGainOptions(s);
  assert.strictEqual(opts[0].key, 'gongfa');
  assert.ok(opts[0].label.includes('参悟功法') || opts[0].label.includes('灵石闲置'), opts[0].label);
  assert.ok(!/约\s*\d+\s*秒后能突破/.test(opts[0].label), `不应再用约 T 秒后能突破：${opts[0].label}`);
  if (opts[0].breaks >= 1) {
    assert.ok(opts[0].label.includes('参悟功法后 2 分钟内可连破至'), opts[0].label);
  }

  // 都买不起且再修炼不到 120 秒能突破
  s.stones = 0;
  s.tree.peaches = 0;
  s.pending = null;
  s.qi = Math.max(0, stage.reqQi - GS.getQiPerSec() * 30);
  opts = NB.cpGainOptions(s);
  assert.ok(opts[0] && opts[0].key === 'wait', `应出现再修炼，实际 ${opts[0] && opts[0].key}`);
  assert.ok(opts[0].label.includes('再修炼约'));
  assert.ok(opts[0].eta <= 120);

  // 目标条：参悟一层后补花灵石；洞天初后逐重突破
  GS.loadGame();
  const g = GS.state;
  g.realmIndex = 2;
  g.peachesPicked = 30;
  g.tree.peaches = 0;
  g.stage.best = 1;
  g.gongfa.yinqijue = 2;
  g.stones = 1e9;
  assert.strictEqual(NB.currentGoal(g).id, 'spend');
  assert.ok(NB.currentGoal(g).text.includes('把灵石用来参悟功法'), NB.currentGoal(g).text);
  g.stones = 0;
  assert.strictEqual(NB.currentGoal(g).id, 'realm3');
  g.realmIndex = 3;
  assert.strictEqual(NB.currentGoal(g).text, '突破至洞天中');
  g.realmIndex = 4;
  assert.strictEqual(NB.currentGoal(g).text, '突破至洞天后');

  const gear = text('js/gear.js');
  assert.ok(gear.includes("btnReplace.textContent = diff.better") && gear.includes('替换（战力 +'), '更强时替换为主按钮并写出战力');
  assert.ok(/const worse = newCp <= oldCp/.test(gear), '自动分解只处理不更强的装备');
  assert.ok(/auto\.on && worse && item\.q <= \(auto\.maxQ/.test(gear), '更强的装备不会被自动分解');

  const ui = text('js/stage-ui.js');
  assert.ok(ui.includes('openCompare') && ui.includes('btn-goto-pending'), '战败「换上更好法宝」打开对比弹窗');
  assert.ok(ui.includes('灵石闲置会拖慢突破，先参悟功法'));
});

check('不改平衡数值，且不用 getImageData / 浏览器自动化', () => {
  const src = ['js/config.js', 'js/newbie.js', 'js/game.js', 'js/gear.js', 'css/style.css']
    .map((rel) => text(rel))
    .join('\n');
  assert.ok(!/getImageData/.test(src));
  assert.ok(!/puppeteer|playwright|chromium/.test(src));
  // 功法与境界需求未改
  const { CFG } = loadRuntime();
  const nashen = CFG.GONGFA_LIST.find((g) => g.id === 'taiqingjue');
  assert.strictEqual(nashen.unlockRealmIndex, 3);
  assert.strictEqual(nashen.baseCost, 120);
  assert.strictEqual(nashen.baseQiPerSec, 18);
});

console.log(`\n${passed} checks passed`);
