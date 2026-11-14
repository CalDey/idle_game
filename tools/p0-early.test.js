// P0 新档开局：赠桃 30 枚到账、引导先摘桃再闯关、按引导走（摘完赠桃换上法宝）时 1-1～1-3 稳赢，
// 闯关胜率预测（64 场、种子 0x51ed27+i*7919）与独立种子实战在容差内，胜率标签分档。
// 用法：node tools/p0-early.test.js（vm 加载真实 js，不用浏览器自动化 / getImageData）
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const text = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function memoryStorage() {
  const data = {};
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; }
  };
}

function runtime() {
  const quiet = { log() {}, warn() {}, error() {}, info() {} };
  const sandbox = { window: {}, console: quiet, localStorage: memoryStorage(), setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {} };
  sandbox.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} };
  sandbox.window.document = sandbox.document;
  sandbox.window.addEventListener = () => {};
  sandbox.globalThis = sandbox.window;
  ['config', 'beasts', 'equip', 'state', 'titles', 'grow', 'battle', 'bonds', 'codex-data', 'codex', 'path', 'newbie'].forEach((f) => {
    vm.runInNewContext(text(`js/${f}.js`), sandbox, { filename: `${f}.js` });
  });
  return sandbox.window;
}

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

function lcg(seed) {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    return ((x >>> 8) & 0xffffff) / 0x1000000;
  };
}

// 新档按引导：搬血中领赠桃并摘完（更好的就换上），再突破到搬血后
function guidedState(W, gearSeed) {
  const GS = W.GameState;
  const E = W.Equip;
  GS.loadGame();
  const s = GS.state;
  s.realmIndex = 1;
  GS.tickTimers(Date.now());
  const real = Math.random;
  Math.random = lcg(gearSeed);
  try {
    while ((s.tree.peaches || 0) >= 1) {
      s.tree.peaches -= 1;
      s.peachesPicked = (s.peachesPicked || 0) + 1;
      const item = E.rollItem(s);
      if (!s.equip[item.s] || E.powerWithSwap(s, item) > E.combatPower(s)) s.equip[item.s] = item;
    }
  } finally {
    Math.random = real;
  }
  s.realmIndex = 2;
  return s;
}

function actualRate(W, s, n, runs, salt) {
  const B = W.Battle;
  const mods = W.Bonds.modsForState(s);
  let wins = 0;
  for (let i = 0; i < runs; i++) {
    const seed = (Math.imul(i + 1 + salt * 4096, 0x9e3779b1) ^ 0x27d4eb2f) >>> 0;
    if (B.createSession(s, B.enemyFor(n), seed, mods).runToEnd(true).win) wins += 1;
  }
  return wins / runs;
}

const stageSeed = (i) => (0x51ed27 + i * 7919) >>> 0;

check('新档：突破到搬血中后赠桃 30 枚到账，存读档后仍在；闯关解锁（搬血后）晚于法宝（搬血中）', () => {
  const W = runtime();
  const C = W.GameConfig;
  assert.ok(C.PEACH.UNLOCK_REALM < C.BATTLE.UNLOCK_REALM, '法宝须先于闯关开启');
  const GS = W.GameState;
  GS.loadGame();
  const s = GS.state;
  assert.strictEqual(s.tree.peaches, 0);
  s.realmIndex = 1;
  GS.tickTimers(Date.now());
  assert.strictEqual(s.tree.peaches, C.PEACH.GIFT);
  assert.strictEqual(C.PEACH.GIFT, 30);
  GS.saveGame();
  GS.loadGame();
  assert.ok(GS.state.tree.peaches >= 30 && GS.state.tree.gifted);
});

check('引导：赠桃未摘完时目标停在摘桃、闯关不点红点；摘完后才是「开启闯关 / 通关1-1」', () => {
  const W = runtime();
  const NB = W.Newbie;
  const GS = W.GameState;
  GS.loadGame();
  const s = GS.state;
  s.realmIndex = 2;
  GS.tickTimers(Date.now());
  s.peachesPicked = 3;
  s.tree.peaches = 27;
  assert.strictEqual(NB.currentGoal(s).id, 'peach');
  const api = { playerStats: W.Battle.playerStats, enemyFor: W.Battle.enemyFor };
  assert.strictEqual(NB.stageDot(s, api, Date.now()), false);
  const g = guidedState(W, 7);
  assert.strictEqual(NB.currentGoal(g).text, '通关1-1');
  const game = text('js/game.js');
  assert.ok(/peachGoalDone\(s\)[\s\S]{0,120}先去法宝页摘桃/.test(game), '开闯关日志提示先摘桃');
});

check('按引导走（摘完赠桃）：1-1～1-3 实战稳赢（≥90%）；无装备 1-1 仍为 0%（数值未改）', () => {
  const W = runtime();
  [11, 29, 47].forEach((seed) => {
    const s = guidedState(W, seed);
    [1, 2, 3].forEach((n) => {
      const r = actualRate(W, s, n, 60, seed + n);
      assert.ok(r >= 0.9, `gear seed ${seed} stage ${n}: ${r}`);
    });
  });
  const W2 = runtime();
  W2.GameState.loadGame();
  const bare = W2.GameState.state;
  bare.realmIndex = 2;
  assert.strictEqual(Math.round(W2.Battle.playerStats(bare).cp), 561);
  assert.strictEqual(actualRate(W2, bare, 1, 30, 1), 0);
  assert.strictEqual(W2.Battle.enemyFor(1).cp, 600, '敌人公式未改');
});

check('闯关胜率预测（64 场、种子 0x51ed27+i*7919）与独立种子实战误差 ≤ 0.15', () => {
  const W = runtime();
  const B = W.Battle;
  const E = W.Equip;
  const pts = [];
  [0, 3, 5, 8, 30].forEach((k, idx) => {
    W.GameState.loadGame();
    const s = W.GameState.state;
    s.realmIndex = 1;
    const real = Math.random;
    Math.random = lcg(1000 + idx);
    try {
      for (let i = 0; i < k; i++) {
        const it = E.rollItem(s);
        if (!s.equip[it.s] || E.powerWithSwap(s, it) > E.combatPower(s)) s.equip[it.s] = it;
      }
    } finally {
      Math.random = real;
    }
    s.realmIndex = 2;
    [1, 3, 10].forEach((n) => {
      const pred = B.winRate(s, n, 64, W.Bonds.modsForState(s), stageSeed);
      const act = actualRate(W, s, n, 160, idx * 10 + n);
      pts.push([k, n, pred, act]);
      assert.ok(Math.abs(pred - act) <= 0.15, `k=${k} stage ${n}: pred ${pred} actual ${act}`);
    });
  });
  // 默认种子行为不变（其它调用方 / 历史测试依赖 i+1）
  W.GameState.loadGame();
  const s0 = W.GameState.state;
  s0.realmIndex = 2;
  assert.strictEqual(B.winRate(s0, 1, 8), B.winRate(s0, 1, 8, null, (i) => i + 1));
});

check('胜率标签：≥95 必胜 / ≥80 大概率胜 / ≥60 稍占上风 / ≥40 五五开 / ≥10 凶险 / 其余不敌；闯关页 64 场与颜色分档', () => {
  const W = runtime();
  const L = W.Battle.winRateLabel;
  assert.strictEqual(L(0.95), '必胜');
  assert.strictEqual(L(0.94), '大概率胜');
  assert.strictEqual(L(0.8), '大概率胜');
  assert.strictEqual(L(0.79), '稍占上风');
  assert.strictEqual(L(0.6), '稍占上风');
  assert.strictEqual(L(0.59), '五五开');
  assert.strictEqual(L(0.4), '五五开');
  assert.strictEqual(L(0.1), '凶险');
  assert.strictEqual(L(0.09), '不敌');
  const ui = text('js/stage-ui.js');
  assert.ok(ui.includes('const STAGE_FORECAST_RUNS = 64;'));
  assert.ok(ui.includes('(0x51ed27 + i * 7919) >>> 0'));
  assert.ok(ui.includes("winRate(state, stageNum, STAGE_FORECAST_RUNS, bondModsFor(state), stageForecastSeed)"));
  assert.ok(ui.includes("rate >= 0.8 ? 'high' : rate >= 0.4 ? 'mid' : 'low'"));
});

console.log(`p0-early.test.js ok: ${passed} checks`);
