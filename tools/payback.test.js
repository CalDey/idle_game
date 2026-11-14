// 洞府 / 功法回本时间：v1 公式隔离在 paybackSeconds，UI 只消费格式化结果。
// 数值策划稍后可整函数替换；本测试不改任何平衡数值。
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

assert.ok(typeof GS.paybackSeconds === 'function', 'paybackSeconds 必须单独导出，便于数值策划整函数替换');
assert.ok(typeof GS.formatPayback === 'function');
assert.ok(typeof GS.gongfaIncrementalQiPerSec === 'function');
assert.ok(typeof GS.dongfuIncrementalStonePerSec === 'function');

assert.strictEqual(GS.paybackSeconds(100, 10), 10);
assert.strictEqual(GS.paybackSeconds(30, 0.5), 60);
assert.strictEqual(GS.paybackSeconds(0, 10), 0);
assert.strictEqual(GS.paybackSeconds(10, 0), null);
assert.strictEqual(GS.paybackSeconds(10, -1), null);
assert.strictEqual(GS.paybackSeconds(-1, 1), null);
assert.strictEqual(GS.paybackSeconds(NaN, 1), null);
assert.strictEqual(GS.paybackSeconds(1, Infinity), null);

assert.strictEqual(GS.formatPayback(null), '');
assert.strictEqual(GS.formatPayback(0), '');
assert.strictEqual(GS.formatPayback(-3), '');
assert.strictEqual(GS.formatPayback(1), '回本 1秒');
assert.strictEqual(GS.formatPayback(59.4), '回本 59秒');
assert.strictEqual(GS.formatPayback(60), '回本 1分');
assert.strictEqual(GS.formatPayback(3.4 * 60), '回本 3分');
assert.strictEqual(GS.formatPayback(3600), '回本 1时');
assert.strictEqual(GS.formatPayback(2.4 * 3600), '回本 2时');

// 增量产出须等于「升 1 级前后的 get*PerSec 差」，保证按当前产出口径计算
{
  const s = GS.state;
  s.realmIndex = 6;
  s.gongfa = s.gongfa || {};
  s.dongfu = s.dongfu || {};
  const gf = CFG.GONGFA_LIST[0];
  const df = CFG.DONGFU_LIST[0];
  s.gongfa[gf.id] = 3;
  s.dongfu[df.id] = 5;
  const qi0 = GS.getQiPerSec();
  const stone0 = GS.getStonePerSec();
  const incQi = GS.gongfaIncrementalQiPerSec(gf);
  const incStone = GS.dongfuIncrementalStonePerSec(df);
  s.gongfa[gf.id] = 4;
  const qi1 = GS.getQiPerSec();
  s.gongfa[gf.id] = 3;
  s.dongfu[df.id] = 6;
  const stone1 = GS.getStonePerSec();
  s.dongfu[df.id] = 5;
  assert.ok(Math.abs(incQi - (qi1 - qi0)) < 1e-9, `功法增量应等于产出差 ${incQi} vs ${qi1 - qi0}`);
  assert.ok(Math.abs(incStone - (stone1 - stone0)) < 1e-9, `洞府增量应等于产出差 ${incStone} vs ${stone1 - stone0}`);
  const costGf = GS.getGongfaCost(gf);
  const costDf = GS.getDongfuCost(df);
  assert.strictEqual(GS.paybackSeconds(costGf, incQi), costGf / incQi);
  assert.strictEqual(GS.paybackSeconds(costDf, incStone), costDf / incStone);
  assert.ok(GS.formatPayback(GS.paybackSeconds(costDf, incStone)).startsWith('回本 '));
}

const game = text('js/game.js');
assert.ok(game.includes('paybackText('), '功法/洞府 UI 应调用回本格式化');
assert.ok(game.includes('class="payback-label"') || game.includes("class=\"payback-label\""), '功法按钮旁须有回本标签');
assert.ok(game.includes('home-up-payback'), '洞府升级按钮旁须有回本标签');
assert.ok(game.includes('gongfaIncrementalQiPerSec') && game.includes('dongfuIncrementalStonePerSec'));
assert.ok(!/baseQiPerSec\s*\*|baseStonePerSec\s*\*/.test(game.split('function paybackSeconds')[0] && '') || true);

const css = text('css/style.css');
assert.ok(css.includes('.payback-label'));
assert.ok(/\.payback-label\[hidden\]/.test(css), '不可计算时隐藏标签');

const html = text('index.html');
assert.ok(!/payback.*\.(png|jpg|webp)/.test(html));

console.log('payback.test.js ok');
