// QA 第 1 批：B3 闯关文案、B4 挂机桃上限、B7 推荐战力/胜率/失败提示一致、
// B8 回前台离线补算、S2 formatNumber、S4 坏档备份与数值字段强制转换。
// 用法：node tools/qa-round1.test.js
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
  const sandbox = { window: {}, console, localStorage: o.storage || memoryStorage() };
  sandbox.globalThis = sandbox.window;
  vm.runInNewContext(text('js/config.js'), sandbox);
  vm.runInNewContext(text('js/equip.js'), sandbox);
  vm.runInNewContext(text('js/battle.js'), sandbox);
  vm.runInNewContext(text('js/mijing.js'), sandbox);
  vm.runInNewContext(text('js/state.js'), sandbox);
  return sandbox.window;
}

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

check('B3 底部导航与锁定文案改为搬血后，不再出现练气三', () => {
  const index = text('index.html');
  const stageUi = text('js/stage-ui.js');
  assert.ok(index.includes('突破至搬血后开启闯关'));
  assert.ok(index.includes('闯关·搬血后'));
  assert.ok(index.includes('突破至搬血后开启闯关。'));
  assert.ok(stageUi.includes("navBtn.title = isUnlocked ? '闯关' : '突破至搬血后开启闯关'"));
  assert.ok(stageUi.includes("navText.textContent = isUnlocked ? '闯关' : '闯关·搬血后'"));
  assert.ok(!index.includes('练气三'));
  assert.ok(!stageUi.includes('练气三'));
});

check('B4 挂机桃补到上限；已溢出的存量不裁掉', () => {
  const W = runtime();
  const cap = W.GameConfig.peachCap(1);
  assert.strictEqual(cap, 52);
  W.GameState.loadGame();
  const s = W.GameState.state;
  s.stage.best = 50;
  s.tree.lv = 1;

  s.tree.peaches = cap;
  const atCap = W.GameState.applyIdleStageRewards(2 * 3600);
  assert.strictEqual(atCap.peaches, 0);
  assert.strictEqual(s.tree.peaches, cap);

  s.tree.peaches = cap + 4;
  const over = W.GameState.applyIdleStageRewards(2 * 3600);
  assert.strictEqual(over.peaches, 0);
  assert.strictEqual(s.tree.peaches, cap + 4);

  s.tree.peaches = cap - 2;
  const near = W.GameState.applyIdleStageRewards(2 * 3600);
  assert.strictEqual(near.peaches, 2);
  assert.strictEqual(s.tree.peaches, cap);

  s.tree.peaches = 0;
  const fromEmpty = W.GameState.applyIdleStageRewards(2 * 3600);
  const raw = Math.floor((1 + Math.floor(50 / 50)) * 2);
  assert.strictEqual(fromEmpty.peaches, raw);
  assert.strictEqual(s.tree.peaches, raw);
  assert.ok(s.tree.peaches <= cap);
});

check('B7 推荐战力、胜率标签与失败缺口同源且不再互相矛盾', () => {
  const W = runtime();
  W.GameState.loadGame();
  const s = W.GameState.state;
  const p = W.Battle.playerStats(s);
  const e = W.Battle.enemyFor(1);
  const rate = W.Battle.winRate(s, 1, 40);
  const label = W.Battle.winRateLabel(rate);
  const rec = W.Battle.recommendedCp(s, 1);
  const gap = W.Battle.failPowerGap(p.cp, rec);
  assert.ok(rec >= 1);
  if (label === '不敌') {
    assert.ok(rec > p.cp, `不敌时推荐战力应高于我方：player=${p.cp} rec=${rec} enemy=${e.cp} rate=${rate}`);
    assert.ok(gap > 1, `不敌时失败缺口不应是约 1：gap=${gap} player=${Math.round(p.cp)} rec=${rec}`);
  }
  if (p.cp >= rec) {
    assert.notStrictEqual(label, '不敌', `我方战力已达推荐值时不应显示不敌：player=${p.cp} rec=${rec} rate=${rate}`);
    assert.strictEqual(gap, 0);
  }
  assert.strictEqual(gap, Math.max(0, Math.round(rec) - Math.round(p.cp)));
  // 旧逻辑：敌方战力 600、我方更高时会提示「还差约 1 战力稳胜」
  const staleGap = Math.max(1, Math.round(e.cp * 1.05 - p.cp));
  if (p.cp >= e.cp && label === '不敌') {
    assert.ok(gap !== staleGap || staleGap !== 1, '不得再出现推荐已落后却提示差约 1 战力');
  }

  // 给满编加一套装备后，推荐与标签仍需自洽
  const C = W.GameConfig;
  const E = W.Equip;
  const equip = E.emptyEquip();
  C.EQUIP_SLOTS.forEach((slot, idx) => {
    const raw = slot.base * Math.pow(slot.growth, 8) * C.QUALITIES[2].mult;
    equip[slot.id] = { id: idx + 1, s: slot.id, q: 2, lv: 8, m: Math.round(raw), sub: [] };
  });
  s.equip = equip;
  const p2 = W.Battle.playerStats(s);
  const rate2 = W.Battle.winRate(s, 1, 40);
  const label2 = W.Battle.winRateLabel(rate2);
  const rec2 = W.Battle.recommendedCp(s, 1);
  const gap2 = W.Battle.failPowerGap(p2.cp, rec2);
  if (p2.cp >= rec2) assert.notStrictEqual(label2, '不敌');
  if (label2 === '不敌') assert.ok(rec2 > p2.cp);
  assert.strictEqual(gap2, Math.max(0, Math.round(rec2) - Math.round(p2.cp)));
});

check('B8 回前台按离线规则补算，低于阈值不结算且不会重复发放', () => {
  const storage = memoryStorage();
  const W = runtime({ storage });
  const first = W.GameState.loadGame();
  assert.strictEqual(first.isNew, true);
  const s = W.GameState.state;
  s.qi = 100;
  s.stones = 20;
  s.stage.best = 50;
  s.tree.peaches = 0;
  s.tree.lv = 1;
  s.tree.regenAt = Date.now();
  W.GameState.saveGame();

  const savedAt = s.lastSaveTime;
  s.lastSaveTime = savedAt - 30 * 1000;
  const skipped = W.GameState.settleAwayProgress(savedAt, { minSeconds: 60 });
  assert.strictEqual(skipped, null);
  assert.strictEqual(s.qi, 100);

  s.lastSaveTime = savedAt - 2 * 3600 * 1000;
  const qiBefore = s.qi;
  const stoneBefore = s.stones;
  const report = W.GameState.settleAwayProgress(savedAt, { minSeconds: 60 });
  assert.ok(report, '离开 2 小时应结算离线收益');
  assert.strictEqual(report.effectiveSeconds, 2 * 3600);
  assert.ok(report.qiGain > 0);
  assert.ok(s.qi > qiBefore);
  assert.ok(s.stones >= stoneBefore);
  const qiAfter = s.qi;
  const peachAfter = s.tree.peaches;
  const stoneAfter = s.stones;
  const again = W.GameState.settleAwayProgress(savedAt + 1000, { minSeconds: 60 });
  assert.strictEqual(again, null);
  assert.strictEqual(s.qi, qiAfter);
  assert.strictEqual(s.tree.peaches, peachAfter);
  assert.strictEqual(s.stones, stoneAfter);

  const gameJs = text('js/game.js');
  assert.ok(gameJs.includes('resumeFromBackground'));
  assert.ok(gameJs.includes('effectiveSeconds >= 60'));
  assert.ok(gameJs.includes('showOfflineModal(report)'));
  assert.ok(gameJs.includes('lastTickTime = performance.now()'));
});

check('S2 formatNumber 对非有限值返回 0', () => {
  const W = runtime();
  const fmt = W.GameConfig.formatNumber;
  assert.strictEqual(fmt(Infinity), '0');
  assert.strictEqual(fmt(-Infinity), '0');
  assert.strictEqual(fmt(NaN), '0');
  assert.strictEqual(fmt(undefined), '0');
  assert.strictEqual(fmt(null), '0');
  assert.strictEqual(fmt('abc'), '0');
  assert.strictEqual(fmt(0), '0');
  assert.strictEqual(fmt(1234), '1234');
  assert.ok(fmt(1e8).includes('亿'));
  assert.ok(!String(fmt(Infinity)).includes('兆'));
});

check('S4 损坏存档先备份再重置；字符串灵气被安全转为数字', () => {
  const SAVE = 'xiuxian_idle_save_v1';
  const CORRUPT = 'xiuxian_idle_save_v1_corrupt';

  const badRaw = '{not-json';
  const storage1 = memoryStorage({ [SAVE]: badRaw });
  const W1 = runtime({ storage: storage1 });
  const r1 = W1.GameState.loadGame();
  assert.strictEqual(r1.isNew, true);
  assert.strictEqual(storage1.getItem(CORRUPT), badRaw);
  assert.strictEqual(W1.GameState.state.qi, 0);

  const valid = {
    version: 3,
    heroId: 'lanyi',
    realmIndex: 0,
    qi: '100',
    stones: '25',
    lingyu: '3',
    lastSaveTime: Date.now(),
    tree: { lv: '1', peaches: '10', gifted: true, regenAt: Date.now() }
  };
  const storage2 = memoryStorage({ [SAVE]: JSON.stringify(valid) });
  const W2 = runtime({ storage: storage2 });
  const r2 = W2.GameState.loadGame();
  assert.strictEqual(r2.isNew, false);
  assert.strictEqual(typeof W2.GameState.state.qi, 'number');
  assert.ok(Number.isFinite(W2.GameState.state.qi));
  const qiBefore = W2.GameState.state.qi;
  W2.GameState.state.qi += 15;
  assert.strictEqual(W2.GameState.state.qi, qiBefore + 15);
  assert.strictEqual(typeof W2.GameState.state.stones, 'number');
  assert.strictEqual(typeof W2.GameState.state.tree.peaches, 'number');
  assert.strictEqual(typeof W2.GameState.state.tree.lv, 'number');
});

console.log(`qa-round1.test.js ok: ${passed} checks`);
