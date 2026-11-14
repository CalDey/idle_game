// QA 第 3 批（低优）：D1 图鉴领桃走 addPeaches、D2 对比无差异提示、D3 战后刷新同一目标源、D4 图鉴 tab 边缘渐隐与定高。
// 用法：node tools/qa-round3.test.js
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

function runtime(scripts) {
  const sandbox = {
    window: {},
    console,
    localStorage: memoryStorage(),
    document: { readyState: 'loading', addEventListener() {}, getElementById() { return null; } }
  };
  sandbox.globalThis = sandbox.window;
  sandbox.window.document = sandbox.document;
  scripts.forEach((rel) => {
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

check('D1 图鉴精通领桃走 addPeaches：满档只补到上限，57/52 老档保留且不再增长，其它奖励仍发', () => {
  const W = runtime([
    'js/config.js', 'js/equip.js', 'js/state.js', 'js/titles.js', 'js/grow.js',
    'js/battle.js', 'js/codex-data.js', 'js/codex.js'
  ]);
  W.GameState.loadGame();
  const s = W.GameState.state;
  const CX = W.Codex;
  const cap = W.GameConfig.peachCap(1);
  assert.strictEqual(cap, 52);
  s.tree.lv = 1;
  s.tree.peaches = 57;
  s.qi = 0;
  s.stones = 0;
  s.lingyu = 0;
  s.daoGuo = 3;
  s.stage = s.stage || {};
  s.stage.best = 20;
  CX.ensureState(s);
  const id = 'boss_heifeng';
  s.codex.kills[id] = 10;
  s.codex.seen[id] = 1;
  s.codex.claimed[id] = 1; // 下一阶 10 含仙桃
  const env = { qiPerSec: 10, stonePerSec: 2 };
  const r = CX.claimNext(s, id, env);
  assert.ok(r.ok && r.tier === 10, '应能领取含桃的精通奖');
  assert.ok((r.reward && r.reward.peach) > 0, '该阶配置含桃');
  assert.strictEqual(s.tree.peaches, 57, '溢出老档不得再涨也不得扣');
  assert.ok((s.lingyu || 0) > 0 || (s.qi || 0) > 0, '其它奖励仍应发放');
  assert.strictEqual(s.daoGuo, 3, '不得发放道果');

  s.tree.peaches = cap - 1;
  s.codex.claimed[id] = 1;
  const r2 = CX.claimNext(s, id, env);
  assert.ok(r2.ok && r2.tier === 10);
  assert.strictEqual(s.tree.peaches, cap, '未溢出时只补到上限');

  const src = text('js/codex.js');
  assert.ok(src.includes('addPeachesTo') || src.includes('addPeaches('), '图鉴领桃应走 addPeaches');
  assert.ok(!/s\.tree\.peaches = \(Number\(s\.tree\.peaches\) \|\| 0\) \+ rw\.peach/.test(src));
});

check('D2 属性完全相同的掉落对比展示「无差异」，不静默自动分解', () => {
  const W = runtime(['js/config.js', 'js/equip.js', 'js/newbie.js']);
  const same = W.Newbie.compareDiff(1200, 1200);
  assert.strictEqual(same.sign, 'same');
  assert.strictEqual(same.better, false);
  assert.strictEqual(same.delta, 0);
  assert.strictEqual(same.text, '无差异');
  const up = W.Newbie.compareDiff(1000, 1100);
  assert.ok(up.text.includes('战力'));
  assert.ok(up.text.includes('+100'));

  const gear = text('js/gear.js');
  assert.ok(gear.includes("delta === 0 ? '无差异'") || gear.includes("'无差异'"));
  assert.ok(gear.includes('const worse = newCp <= oldCp'), '自动分解规则保持「弱于或等于」且仍看 autoDecomp 设置');
  assert.ok(/auto\.on && worse && item\.q <= \(auto\.maxQ/.test(gear));
  assert.ok(!/if\s*\(\s*newCp\s*===\s*oldCp\s*\)\s*\{[\s\S]{0,200}自动分解/.test(gear), '相等时不另外静默分解');
});

check('D3 打坐与闯关目标同源；通关 1-1 后目标切到参悟，战后刷新目标条', () => {
  const W = runtime(['js/config.js', 'js/equip.js', 'js/battle.js', 'js/state.js', 'js/newbie.js']);
  W.GameState.loadGame();
  const s = W.GameState.state;
  s.realmIndex = 2;
  s.peachesPicked = 1;
  s.stage.best = 0;
  assert.strictEqual(W.Newbie.currentGoal(s).text, '通关1-1');
  s.stage.best = 1;
  assert.strictEqual(W.Newbie.currentGoal(s).text, '去洞府参悟一层功法', '通关 1-1 后两边应读到同一条目标');
  assert.strictEqual(W.Newbie.currentGoal(s).tab, 'tab-upgrades');

  const game = text('js/game.js');
  assert.ok(/StageUI\.init\([\s\S]*onChange\(\)\s*\{[\s\S]*Newbie\.tick/.test(game), '闯关结算 onChange 应立刻刷新目标条');
});

check('D4 图鉴 tab 右侧渐隐、隐藏滚动条保留、切换 tab 内容区定高', () => {
  const css = text('css/style.css');
  const html = text('index.html');
  const js = text('js/codex.js');
  assert.ok(html.includes('id="codex-tabs-wrap"') && html.includes('id="codex-tabs"'));
  assert.ok(css.includes('.codex-tabs-wrap') && css.includes('is-fade-right') && css.includes('is-fade-left'));
  assert.ok(/codex-tabs-wrap::after[\s\S]{0,160}linear-gradient/.test(css), '右侧边缘渐隐');
  assert.ok(/\.codex-tabs\s*\{[\s\S]*?overflow-x:\s*auto/.test(css), '仍可横滑');
  assert.ok(/\.codex-tabs::-webkit-scrollbar\s*\{[\s\S]*?display:\s*none/.test(css), '隐藏滚动条保留');
  assert.ok(/\.codex-dialog\s*\{[\s\S]*?height:\s*min\(620px,\s*calc\(100dvh - 32px\)\)/.test(css) || css.includes('height: min(620px, calc(100dvh - 32px))'));
  assert.ok(/\.codex-list\s*\{[\s\S]*?min-height:\s*min\(\s*240px/.test(css) || css.includes('min-height: min(240px, 40vh)'));
  assert.ok(js.includes('syncTabsFade') && js.includes('is-fade-right'));
  assert.ok(!/getImageData/.test(js + css));
});

console.log(`qa-round3.test.js ok: ${passed} checks`);
