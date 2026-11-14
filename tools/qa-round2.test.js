// QA 第 2 批：C2 首通桃上限（溢出老档不裁不涨）、C3 挡路 Boss 同源、C4 后台补算去重、C5 羁绊满档显示。
// 用法：node tools/qa-round2.test.js
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
  const sandbox = { window: {}, console, localStorage: (opts && opts.storage) || memoryStorage() };
  sandbox.globalThis = sandbox.window;
  ['js/config.js', 'js/equip.js', 'js/battle.js', 'js/state.js', 'js/bonds.js', 'js/newbie.js'].forEach((rel) => {
    vm.runInNewContext(text(rel), sandbox, { filename: rel });
  });
  return sandbox.window;
}

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

check('C2 首通仙桃走 addPeaches：满档只补到上限，57/52 老档保留且不再增长', () => {
  const W = runtime();
  W.GameState.loadGame();
  const s = W.GameState.state;
  const cap = W.GameConfig.peachCap(1);
  assert.strictEqual(cap, 52);
  s.tree.lv = 1;

  s.tree.peaches = cap - 2;
  assert.strictEqual(W.GameState.addPeaches(5), 2);
  assert.strictEqual(s.tree.peaches, cap);

  s.tree.peaches = cap;
  assert.strictEqual(W.GameState.addPeaches(5), 0);
  assert.strictEqual(s.tree.peaches, cap);

  // QA 实测：57/52 首通后涨到 79/52。溢出老档必须保留 57，不得再涨，也不得往下扣。
  s.tree.peaches = 57;
  assert.strictEqual(W.GameState.addPeaches(22), 0);
  assert.strictEqual(s.tree.peaches, 57);

  const idleOver = W.GameState.applyIdleStageRewards(2 * 3600);
  assert.strictEqual(idleOver.peaches, 0);
  assert.strictEqual(s.tree.peaches, 57);

  const stageUi = text('js/stage-ui.js');
  assert.ok(stageUi.includes('GameState.addPeaches(rw.peaches)'));
  assert.ok(!/s\.tree\.peaches = \(s\.tree\.peaches \|\| 0\) \+ rw\.peaches/.test(stageUi));
});

check('C3 目标条与「先败」按钮共用挡路 Boss，并跳到可到达的关卡', () => {
  const W = runtime();
  W.GameState.loadGame();
  const s = W.GameState.state;
  s.realmIndex = 8;
  s.qi = 1e12;
  s.stage.best = 5;
  s.stage.cur = 6;

  const block = W.Newbie.blockingBoss(s);
  assert.strictEqual(block.name, '山魈娘娘');
  assert.strictEqual(block.stage, 10);
  assert.strictEqual(block.cur, 6);
  assert.strictEqual(block.reachable, false);
  assert.strictEqual(W.Newbie.currentGoal(s).text, '击败第1章首领【山魈娘娘】');

  W.Newbie.focusBlockingBoss(s);
  assert.strictEqual(s.stage.cur, 6);

  s.stage.best = 9;
  s.stage.cur = 10;
  const atGate = W.Newbie.blockingBoss(s);
  assert.strictEqual(atGate.name, '山魈娘娘');
  assert.strictEqual(atGate.cur, 10);
  W.Newbie.focusBlockingBoss(s);
  assert.strictEqual(s.stage.cur, 10);

  s.stage.best = 12;
  const mid = W.Newbie.blockingBoss(s);
  assert.strictEqual(mid.name, '赤瞳狼后');
  assert.strictEqual(mid.stage, 20);
  assert.strictEqual(W.Newbie.currentGoal(s).text, '击败第2章首领【赤瞳狼后】');

  s.stage.best = 29;
  const final = W.Newbie.blockingBoss(s);
  assert.strictEqual(final.name, '黑风寨主');
  assert.strictEqual(final.stage, 30);
  assert.strictEqual(W.Newbie.currentGoal(s).text, '击败第3章首领【黑风寨主】');

  const gameJs = text('js/game.js');
  assert.ok(gameJs.includes('Newbie.focusBlockingBoss'));
  assert.ok(gameJs.includes('Newbie.blockingBoss'));
  assert.ok(gameJs.includes("switchToTab('tab-stage')"));
});

check('C4 后台补算：tick 停了只补缺口，tick 仍在跑则不再发一遍', () => {
  const W = runtime();
  W.GameState.loadGame();
  const s = W.GameState.state;
  s.qi = 1000;
  s.stones = 100;
  s.tree.regenAt = 1e15;
  const rate = W.GameState.getQiPerSec();
  assert.ok(rate > 0);

  const hideAt = 2_000_000;
  W.GameState.markTick(hideAt);
  const now = hideAt + 10 * 1000;
  const qi1 = s.qi;
  const reportPaused = W.GameState.resumeFromBackground(hideAt, now);
  assert.ok(reportPaused, 'tick 停摆时应补算');
  assert.strictEqual(reportPaused.effectiveSeconds, 10);
  assert.ok(Math.abs(reportPaused.qiGain - rate * 10) < 1e-6);
  assert.ok(Math.abs(s.qi - (qi1 + rate * 10)) < 1e-6);

  s.qi = 1000;
  s.stones = 100;
  s.tree.regenAt = 1e15;
  W.GameState.markTick(hideAt);
  const hiddenSec = 10;
  s.qi += rate * hiddenSec;
  s.stones += W.GameState.getStonePerSec() * hiddenSec;
  const already = s.qi;
  W.GameState.markTick(hideAt + hiddenSec * 1000);
  const reportRan = W.GameState.resumeFromBackground(hideAt, hideAt + hiddenSec * 1000);
  assert.strictEqual(reportRan, null, 'tick 已覆盖隐藏时段时不再补算');
  assert.ok(Math.abs(s.qi - already) < 1e-6, '已由 tick 发放的灵气不能再加一遍');
});

check('C5 羁绊满档显示 3/3（满），人数与加成仍按实际/上限计算', () => {
  const W = runtime();
  const ming = W.Bonds.evaluate(['cloak', 'ziling', 'honglian', 'molan']).find((x) => x.id === 'ming');
  assert.ok(ming.maxed);
  assert.strictEqual(ming.count, 4);
  assert.strictEqual(ming.countLabel, '3/3（满）');
  assert.strictEqual(ming.progressText, '幽冥 3/3（满）');

  const stageUi = text('js/stage-ui.js');
  assert.ok(stageUi.includes('b.countLabel'));
  assert.ok(stageUi.includes('r.countLabel'));
});

console.log(`qa-round2.test.js ok: ${passed} checks`);
