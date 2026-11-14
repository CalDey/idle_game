// 洞府 / 功法回本时间：v2 跨资源折算公式隔离在 paybackSeconds，UI 只消费 paybackForUpgrade。
// 只改显示，不改任何平衡数值。
// 用法：node tools/payback.test.js
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

function load() {
  const sandbox = {
    window: {},
    console,
    localStorage: memoryStorage(),
    document: { readyState: 'loading', addEventListener() {}, getElementById() { return null; } }
  };
  sandbox.globalThis = sandbox.window;
  sandbox.window.document = sandbox.document;
  ['js/config.js', 'js/equip.js', 'js/state.js', 'js/titles.js'].forEach((rel) => {
    vm.runInNewContext(text(rel), sandbox, { filename: rel });
  });
  return sandbox.window;
}

const W = load();
const GS = W.GameState;
const CFG = W.GameConfig;
GS.loadGame();

assert.ok(typeof GS.paybackSeconds === 'function', 'paybackSeconds 必须单独导出，便于整函数替换');
assert.ok(typeof GS.formatPayback === 'function');
assert.ok(typeof GS.paybackTone === 'function');
assert.ok(typeof GS.timeToNextBreakthrough === 'function');
assert.ok(typeof GS.ratesAfterUpgrade === 'function');
assert.ok(typeof GS.paybackForUpgrade === 'function');
assert.ok(typeof GS.gongfaIncrementalQiPerSec === 'function');
assert.ok(typeof GS.dongfuIncrementalStonePerSec === 'function');

// 纯公式：payback = cost / ((s1-s0) + s0*(q1-q0)/q0)
assert.strictEqual(GS.paybackSeconds(100, 10, 5, 12, 5), 100);
assert.strictEqual(GS.paybackSeconds(100, 10, 5, 10, 7), 50);
assert.strictEqual(GS.paybackSeconds(100, 10, 5, 15, 8), 100 / 5.5);
assert.strictEqual(GS.paybackSeconds(0, 10, 5, 12, 5), 0);

// 花费为灵气时先折成等效灵石：cost_qi * s0 / q0
assert.strictEqual(GS.paybackSeconds(20, 10, 5, 10, 7, 'qi'), 10 / 2);

// 分母 <= 0 或非有限则隐藏
assert.strictEqual(GS.paybackSeconds(10, 10, 5, 10, 5), null); // 无增量
assert.strictEqual(GS.paybackSeconds(10, 0, 5, 1, 5), null); // q0=0 无法折算灵气增量
assert.strictEqual(GS.paybackSeconds(100, 0, 5, 0, 7), 50); // q 不变，只用灵石增量
assert.strictEqual(GS.paybackSeconds(10, 10, 5, 10, 4), null); // 分母为负
assert.strictEqual(GS.paybackSeconds(-1, 10, 5, 12, 5), null);
assert.strictEqual(GS.paybackSeconds(NaN, 10, 5, 12, 5), null);
assert.strictEqual(GS.paybackSeconds(10, 10, 5, 12, Infinity), null);
assert.strictEqual(GS.paybackSeconds(10, 10, 5, 12, 5, 'qi') == null || typeof GS.paybackSeconds(10, 10, 5, 12, 5, 'qi') === 'number', true);
assert.strictEqual(GS.paybackSeconds(20, 0, 5, 0, 7, 'qi'), null); // 灵气花费但 q0=0

assert.strictEqual(GS.formatPayback(null), '');
assert.strictEqual(GS.formatPayback(0), '');
assert.strictEqual(GS.formatPayback(-3), '');
assert.strictEqual(GS.formatPayback(1), '回本 1秒');
assert.strictEqual(GS.formatPayback(59.4), '回本 59秒');
assert.strictEqual(GS.formatPayback(60), '回本 1分');
assert.strictEqual(GS.formatPayback(3.4 * 60), '回本 3分');
assert.strictEqual(GS.formatPayback(3600), '回本 1时');
assert.strictEqual(GS.formatPayback(2.4 * 3600), '回本 2时');

// 颜色阈值：绿 <= max(300,tNext)；黄 <= max(1800,4*tNext)；其余灰；>43200 一律灰
assert.strictEqual(GS.paybackTone(100, 0), 'green');
assert.strictEqual(GS.paybackTone(300, 0), 'green');
assert.strictEqual(GS.paybackTone(301, 0), 'yellow');
assert.strictEqual(GS.paybackTone(1800, 0), 'yellow');
assert.strictEqual(GS.paybackTone(1801, 0), 'grey');
assert.strictEqual(GS.paybackTone(400, 500), 'green'); // 400 <= max(300, 500)
assert.strictEqual(GS.paybackTone(501, 500), 'yellow');
assert.strictEqual(GS.paybackTone(2000, 500), 'yellow'); // 2000 <= max(1800, 2000)
assert.strictEqual(GS.paybackTone(2001, 500), 'grey');
assert.strictEqual(GS.paybackTone(43200, 10800), 'yellow'); // 等于 43200 且卡在黄档上限，仍为黄
assert.strictEqual(GS.paybackTone(43200.1, 1e9), 'grey'); // 超过 43200 即使 tNext 很大也一律灰
assert.strictEqual(GS.paybackTone(100000, 0), 'grey');
assert.strictEqual(GS.timeToNextBreakthrough(10, 80, 100), 2);
assert.strictEqual(GS.timeToNextBreakthrough(10, 100, 100), 0);
assert.strictEqual(GS.timeToNextBreakthrough(10, 120, 100), 0);
assert.strictEqual(GS.timeToNextBreakthrough(0, 80, 100), 0);

// 升 1 级前后的 get*PerSec 必须与浅拷模拟一致，且不得改真实 state
{
  const s = GS.state;
  s.realmIndex = 6;
  s.qi = 1000;
  s.gongfa = s.gongfa || {};
  s.dongfu = s.dongfu || {};
  const gf = CFG.GONGFA_LIST[0];
  const df = CFG.DONGFU_LIST[0];
  const jul = CFG.DONGFU_LIST.find((d) => d.id === 'julingshi');
  s.gongfa[gf.id] = 3;
  s.dongfu[df.id] = 5;
  if (jul) s.dongfu.julingshi = 9;
  const qi0 = GS.getQiPerSec();
  const stone0 = GS.getStonePerSec();
  const gfLv = s.gongfa[gf.id];
  const dfLv = s.dongfu[df.id];
  const julLv = s.dongfu.julingshi;

  const afterGf = GS.ratesAfterUpgrade('gongfa', gf);
  assert.strictEqual(s.gongfa[gf.id], gfLv, '模拟功法升级不得改真实等级');
  assert.strictEqual(GS.getQiPerSec(), qi0, '模拟后灵气产出应恢复');
  assert.strictEqual(GS.getStonePerSec(), stone0, '模拟后灵石产出应恢复');

  s.gongfa[gf.id] = gfLv + 1;
  const qi1gf = GS.getQiPerSec();
  const stone1gf = GS.getStonePerSec();
  s.gongfa[gf.id] = gfLv;
  assert.ok(Math.abs(afterGf.q - qi1gf) < 1e-9, `功法 q1 应等于真实升 1 级后产出 ${afterGf.q} vs ${qi1gf}`);
  assert.ok(Math.abs(afterGf.s - stone1gf) < 1e-9);

  const costGf = GS.getGongfaCost(gf);
  const expectedGf = GS.paybackSeconds(costGf, qi0, stone0, afterGf.q, afterGf.s);
  const viewGf = GS.paybackForUpgrade('gongfa', gf);
  assert.ok(Math.abs(viewGf.seconds - expectedGf) < 1e-9);
  assert.ok(viewGf.text.startsWith('回本 '));
  assert.ok(['green', 'yellow', 'grey'].includes(viewGf.tone));
  assert.strictEqual(s.gongfa[gf.id], gfLv);

  const afterDf = GS.ratesAfterUpgrade('dongfu', df);
  s.dongfu[df.id] = dfLv + 1;
  const qi1df = GS.getQiPerSec();
  const stone1df = GS.getStonePerSec();
  s.dongfu[df.id] = dfLv;
  assert.ok(Math.abs(afterDf.q - qi1df) < 1e-9);
  assert.ok(Math.abs(afterDf.s - stone1df) < 1e-9);
  const costDf = GS.getDongfuCost(df);
  const viewDf = GS.paybackForUpgrade('dongfu', df);
  assert.ok(Math.abs(viewDf.seconds - GS.paybackSeconds(costDf, qi0, stone0, afterDf.q, afterDf.s)) < 1e-9);
  assert.ok(viewDf.text.startsWith('回本 '));
  assert.strictEqual(s.dongfu[df.id], dfLv);

  // 聚灵石跨过 10 级会同时改灵气乘区，模拟必须抓住两侧产出
  if (jul) {
    const afterJul = GS.ratesAfterUpgrade('dongfu', jul);
    assert.strictEqual(s.dongfu.julingshi, julLv);
    s.dongfu.julingshi = julLv + 1;
    const qi1jul = GS.getQiPerSec();
    const stone1jul = GS.getStonePerSec();
    s.dongfu.julingshi = julLv;
    assert.ok(Math.abs(afterJul.q - qi1jul) < 1e-9, '聚灵石跨 10 级后 q1 应对齐');
    assert.ok(Math.abs(afterJul.s - stone1jul) < 1e-9);
    assert.ok(qi1jul > qi0, '聚灵石从 9 升到 10 应提高灵气产出');
    const viewJul = GS.paybackForUpgrade('dongfu', jul);
    assert.ok(viewJul.seconds != null);
    assert.strictEqual(s.dongfu.julingshi, julLv);
  }
}

const game = text('js/game.js');
assert.ok(game.includes('paybackView('), '功法/洞府 UI 应调用 paybackView');
assert.ok(game.includes('paybackForUpgrade'), 'UI 应走 v2 汇总函数');
assert.ok(game.includes('payback-label'), '功法按钮旁须有回本标签');
assert.ok(game.includes('home-up-payback'), '洞府升级按钮旁须有回本标签');
assert.ok(game.includes('payback-green') && game.includes('payback-yellow') && game.includes('payback-grey'));
assert.ok(!game.includes('paybackText('), '旧的单资源 paybackText 应已移除');

const css = text('css/style.css');
assert.ok(css.includes('.payback-label'));
assert.ok(/\.payback-label\[hidden\]/.test(css), '不可计算时隐藏标签');
assert.ok(css.includes('.payback-label.payback-green'), '须有绿色档样式');
assert.ok(css.includes('.payback-label.payback-yellow'), '须有黄色档样式');
assert.ok(css.includes('.payback-label.payback-grey'), '须有灰色档样式');

const html = text('index.html');
assert.ok(!/payback.*\.(png|jpg|webp)/.test(html));
assert.ok(html.includes('css/style.css?v=122'));
assert.ok(html.includes('js/state.js?v=122'));
assert.ok(html.includes('js/game.js?v=122'));

console.log('payback.test.js ok');
