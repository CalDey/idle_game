// 新手体验（feat/newbie-ux）：引导存档与旧档不触发、当前目标推进、红点条件、装备对比正负号、弹窗 Esc/遮罩关闭、自走棋站位固定。
// 用法：node tools/newbie-ux.test.js
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

function loadRuntime(storage, extra) {
  const sandbox = Object.assign({ window: {}, console, localStorage: storage || memoryStorage(), setTimeout, clearTimeout }, extra || {});
  sandbox.globalThis = sandbox.window;
  ['js/config.js', 'js/equip.js', 'js/battle.js', 'js/state.js', 'js/newbie.js'].forEach((rel) => {
    vm.runInNewContext(text(rel), sandbox, { filename: rel });
  });
  return { CFG: sandbox.window.GameConfig, GS: sandbox.window.GameState, Battle: sandbox.window.Battle, NB: sandbox.window.Newbie, sandbox };
}

// ---------- P1-1 引导存档 ----------
{
  const { GS } = loadRuntime(memoryStorage());
  const res = GS.loadGame();
  assert.strictEqual(res.isNew, true);
  assert.deepStrictEqual(plain(GS.state.guide), { v: 1, step: 0, done: false, taps: 0, gearPopup: false, gearVisited: false });
}

function oldSave(fields) {
  return JSON.stringify(Object.assign({ version: 3, realmIndex: 0, qi: 10, stones: 30, lastSaveTime: Date.now() }, fields));
}

// 有进度的旧档（没有 guide 字段）：不触发引导，也不弹法宝解锁提示、不点法宝红点
[
  { realmIndex: 5 },
  { realmIndex: 0, totalClicks: 40 },
  { realmIndex: 0, playTimeMs: 5 * 60 * 1000 },
  { realmIndex: 0, reincarnationCount: 1, totalDaoGuo: 3 },
  { realmIndex: 0, stage: { best: 3, cur: 4 } }
].forEach((fields) => {
  const { GS, NB } = loadRuntime(memoryStorage({ [SAVE_KEY]: oldSave(fields) }));
  const res = GS.loadGame();
  assert.strictEqual(res.isNew, false);
  const g = plain(GS.state.guide);
  assert.strictEqual(g.done, true, `旧档不应触发引导：${JSON.stringify(fields)}`);
  assert.strictEqual(g.gearPopup, true);
  assert.strictEqual(g.gearVisited, true);
  assert.strictEqual(NB.guideTarget(g, { realmIndex: GS.state.realmIndex }), null);
});

// v1 旧档（迁移链路）也不报错、不触发
{
  const raw = JSON.stringify({ realmIndex: 4, qi: 100, stones: 50, lastSaveTime: Date.now() - 5000 });
  const { GS } = loadRuntime(memoryStorage({ [SAVE_KEY]: raw }));
  const res = GS.loadGame();
  assert.strictEqual(res.isNew, false);
  assert.strictEqual(GS.state.guide.done, true);
}

// 几乎没动过的旧档按新玩家处理
{
  const { GS } = loadRuntime(memoryStorage({ [SAVE_KEY]: oldSave({ totalClicks: 1, playTimeMs: 2000 }) }));
  GS.loadGame();
  assert.strictEqual(GS.state.guide.done, false);
  assert.strictEqual(GS.state.guide.step, 0);
}

// 已有 guide 的存档：原样恢复，坏值收敛
{
  const saved = oldSave({ realmIndex: 1, guide: { step: 2, done: false, taps: 7, gearPopup: true, gearVisited: false } });
  const { GS } = loadRuntime(memoryStorage({ [SAVE_KEY]: saved }));
  GS.loadGame();
  assert.deepStrictEqual(plain(GS.state.guide), { v: 1, step: 2, done: false, taps: 7, gearPopup: true, gearVisited: false });
  const bad = GS.normalizeGuide({ step: 'x', taps: -3, done: 0 }, {});
  assert.strictEqual(bad.step, 0);
  assert.strictEqual(bad.taps, 0);
  assert.strictEqual(bad.done, false);
  assert.strictEqual(GS.normalizeGuide({ step: 9 }, {}).done, true);
}

// 损坏存档：不抛错，回到新档
{
  const { GS } = loadRuntime(memoryStorage({ [SAVE_KEY]: '{not json' }), { console: { ...console, warn() {} } });
  const res = GS.loadGame();
  assert.strictEqual(res.isNew, true);
  assert.strictEqual(GS.state.guide.step, 0);
}

// 轮回保留引导进度，不会重新弹引导
{
  const { GS } = loadRuntime(memoryStorage({ [SAVE_KEY]: oldSave({ realmIndex: 30 }) }));
  GS.loadGame();
  const r = GS.performReincarnation();
  assert.ok(r.ok);
  assert.strictEqual(GS.state.realmIndex, 0);
  assert.strictEqual(GS.state.guide.done, true);
  assert.strictEqual(GS.state.guide.gearPopup, true);
}

// 引导推进：立绘 → 突破按钮 → 法宝页签
{
  const { NB } = loadRuntime();
  let g = { step: 0, done: false, taps: 0, gearVisited: false };
  assert.strictEqual(NB.guideTarget(g, { realmIndex: 0 }), 'portrait');
  g = NB.advanceGuide({ ...g, taps: 2 }, { realmIndex: 0, qiReady: false });
  assert.strictEqual(g.step, 0);
  g = NB.advanceGuide({ ...g, taps: 3 }, { realmIndex: 0, qiReady: false });
  assert.strictEqual(g.step, 1);
  assert.strictEqual(NB.guideTarget(g, { realmIndex: 0 }), 'breakthrough');
  // 灵气自然积满也直接进入第 2 步
  assert.strictEqual(NB.advanceGuide({ step: 0, taps: 0 }, { realmIndex: 0, qiReady: true }).step, 1);
  g = NB.advanceGuide(g, { realmIndex: 1 });
  assert.strictEqual(g.step, 2);
  assert.strictEqual(NB.guideTarget(g, { realmIndex: 1 }), 'gear-tab');
  assert.strictEqual(NB.guideTarget(g, { realmIndex: 0 }), null, '法宝未解锁不高亮页签');
  g = NB.advanceGuide({ ...g, gearVisited: true }, { realmIndex: 1 });
  assert.strictEqual(g.step, 3);
  assert.strictEqual(g.done, true);
  assert.strictEqual(NB.guideTarget(g, { realmIndex: 1 }), null);
  // 首次突破失败（境界不变）停在突破按钮
  assert.strictEqual(NB.advanceGuide({ step: 1, taps: 5 }, { realmIndex: 0, qiReady: false }).step, 1);
}

// ---------- 当前目标 ----------
{
  const { GS, NB } = loadRuntime();
  GS.loadGame();
  const s = GS.state;
  const seq = [];
  const goal = () => NB.currentGoal(s);
  seq.push(goal().id);
  assert.strictEqual(goal().text, '突破至搬血中');
  assert.strictEqual(goal().tab, 'tab-cultivate');
  s.realmIndex = 1;
  assert.strictEqual(goal().text, '去法宝页摘桃');
  assert.strictEqual(goal().tab, 'tab-gear');
  assert.strictEqual(NB.isGoalDone({ id: 'realm1', realm: 1 }, s), true);
  s.peachesPicked = 1;
  assert.strictEqual(goal().id, 'realm2');
  s.realmIndex = 2;
  assert.strictEqual(goal().text, '通关1-1');
  assert.strictEqual(goal().tab, 'tab-stage');
  s.stage.best = 1;
  assert.strictEqual(goal().id, 'gongfa');
  s.gongfa[Object.keys(s.gongfa)[0]] = 2;
  assert.strictEqual(goal().id, 'realm3');
  s.realmIndex = 3;
  assert.strictEqual(goal().id, 'stage10');
  s.stage.best = 10;
  assert.strictEqual(goal().text, '突破至洞天中');
  s.realmIndex = 8;
  s.stage.best = 12;
  assert.strictEqual(goal().text, '击败第3章首领【黑风寨主】');
  s.stage.best = 30;
  assert.strictEqual(goal().text, '突破至铭纹初');
  s.realmIndex = 41;
  assert.strictEqual(goal().id, 'reincarnate');
  // 进度只在下一重突破时显示
  s.realmIndex = 0;
  s.qi = 25;
  const st0 = GS.getCurrentStage();
  assert.strictEqual(NB.goalProgress(NB.currentGoal(s), s, st0), `灵气 ${Math.floor((25 / st0.reqQi) * 100)}%`);
  assert.strictEqual(NB.stageLabel(1), '1-1');
  assert.strictEqual(NB.stageLabel(10), '1-10');
  assert.strictEqual(NB.stageLabel(31), '4-1');
}

// ---------- P1-2 红点 ----------
{
  const { GS, NB, Battle } = loadRuntime();
  GS.loadGame();
  const s = GS.state;
  const now = Date.now();
  assert.strictEqual(NB.gearDot(s, now), false, '法宝未解锁不点红点');
  s.realmIndex = 1;
  s.guide.gearVisited = false;
  assert.strictEqual(NB.gearDot(s, now), true, '法宝刚解锁、未打开过页签时点红点');
  s.guide.gearVisited = true;
  s.tree.peaches = 3;
  s.tree.upEnd = 0;
  s.pending = null;
  assert.strictEqual(NB.gearDot(s, now), false);
  s.tree.peaches = 10;
  assert.strictEqual(NB.gearDot(s, now), true);
  s.tree.peaches = 0;
  s.tree.upEnd = now - 1;
  assert.strictEqual(NB.gearDot(s, now), true);
  s.tree.upEnd = 0;
  s.pending = { s: 'weapon', q: 0, lv: 1, m: 8, sub: [] };
  assert.strictEqual(NB.gearDot(s, now), true);

  const api = { playerStats: Battle.playerStats, enemyFor: Battle.enemyFor };
  s.realmIndex = 1;
  assert.strictEqual(NB.stageDot(s, api, now), false, '闯关未解锁不点红点');
  s.realmIndex = 2;
  s.stage.best = 0;
  s.stage.cur = 1;
  const strong = { playerStats: () => ({ cp: 1000 }), enemyFor: () => ({ cp: 600 }) };
  const weak = { playerStats: () => ({ cp: 100 }), enemyFor: () => ({ cp: 600 }) };
  assert.strictEqual(NB.stageDot(s, strong, now), true, '战力够推荐战力时可挑战');
  assert.strictEqual(NB.stageDot(s, weak, now), false);
  s.stage.best = 5;
  s.stage.idleAt = now - 2 * 3600 * 1000;
  assert.strictEqual(NB.stageDot(s, weak, now), true, '挂机满 1 小时可领取');
  s.stage.idleAt = now;
  s.stage.best = 300;
  assert.strictEqual(NB.stageDot(s, strong, now), false, '全部通关后不再提示挑战');
  s.stage.best = 0;
  assert.strictEqual(typeof NB.stageDot(s, api, now), 'boolean');

  // 洞府红点：与 game.js 同口径（买得起任一已解锁功法/洞府）
  const upApi = { getGongfaCost: GS.getGongfaCost, getDongfuCost: GS.getDongfuCost };
  s.realmIndex = 0;
  s.stones = 0;
  assert.strictEqual(NB.upgradeDot(s, upApi), false);
  s.stones = 1e9;
  assert.strictEqual(NB.upgradeDot(s, upApi), true);
  assert.ok(text('js/game.js').includes("els.badgeUpgrade.classList.toggle('visible', anyAffordable)"));
}

// 法宝文案与一次性解锁提示
{
  const html = text('index.html');
  assert.ok(html.includes('突破至搬血中后，仙桃树赠桃三十枚，摘桃可得法宝'));
  assert.ok(html.includes('id="unlock-modal"'));
  assert.ok(html.includes('法宝已开启'));
  assert.ok(html.includes('id="goal-strip"'));
  assert.ok(html.includes('id="badge-stage"'));
  const nb = text('js/newbie.js');
  assert.ok(nb.includes('g.gearPopup = true'), '解锁提示只弹一次并写入存档');
  assert.ok(text('js/gear.js').includes('window.Newbie.gearDot('));
}

// ---------- P1-3 装备对比 ----------
{
  const { NB } = loadRuntime();
  const up = NB.compareDiff(1000, 1234);
  assert.strictEqual(up.sign, 'up');
  assert.strictEqual(up.arrow, '↑');
  assert.strictEqual(up.better, true);
  assert.strictEqual(up.color, '#7ddea0');
  assert.strictEqual(up.text, '战力 ↑ +234');
  const down = NB.compareDiff(1000, 955);
  assert.strictEqual(down.sign, 'down');
  assert.strictEqual(down.arrow, '↓');
  assert.strictEqual(down.better, false);
  assert.strictEqual(down.color, '#f07167');
  assert.strictEqual(down.text, '战力 ↓ -45');
  const same = NB.compareDiff(500.2, 499.9);
  assert.strictEqual(same.sign, 'same');
  assert.strictEqual(same.better, false);
  const big = NB.compareDiff(10000, 35000);
  assert.strictEqual(big.text, '战力 ↑ +2.5万');
  const gear = text('js/gear.js');
  assert.ok(gear.includes('当前装备'));
  assert.ok(gear.includes('新获得'));
  assert.ok(gear.includes("btnReplace.classList.toggle('is-recommended', diff.better)"));
}

// ---------- P2-4 锁定内容 ----------
{
  const { NB } = loadRuntime();
  assert.strictEqual(NB.realmGap(0, 27), 27);
  assert.strictEqual(NB.realmGapText(0, 1), '还差1重');
  assert.strictEqual(NB.realmGapText(5, 3), '已达成');
  assert.strictEqual(NB.realmGateText(0, 27), '需突破至【天神初】· 还差27重');
  assert.strictEqual(NB.realmGateText(1, 2), '需突破至【搬血后】· 还差1重');
  const html = text('index.html');
  // 复用设置里的 42 重说明
  assert.ok(html.includes(`<div class="setting-sub">${NB.REALM_CHAIN_TEXT}</div>`), '境界说明须与设置一致');
  assert.ok(html.includes('共42重'));
  ['data-lock-realm="1"', 'data-lock-realm="2"', 'data-lock-realm="27"', 'id="reincarnate-locked"'].forEach((t) => assert.ok(html.includes(t), t));
  assert.strictEqual((html.match(/class="lock-silhouette"/g) || []).length, 3);
  const game = text('js/game.js');
  assert.ok(game.includes('realmGapText(s.realmIndex, item.unlockRealmIndex)'), '功法/洞府门槛显示还差X重');
  assert.ok(game.includes('role-card-cond'), '锁定角色卡显示解锁条件');
  assert.ok(game.includes("ref.badgeEl.classList.toggle('is-locked', !unlocked)"), '洞府锁定岛标注');
}

module.exports = { loadRuntime, memoryStorage, text };
if (require.main === module) console.log('newbie-ux.test.js ok');
