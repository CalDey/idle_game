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
  // P0：摘 1 枚不再算完成（旧版只拿 1 件装备就被引去打 1-1，实战 0%）；赠桃摘完或桃已摘空且有装备才算
  s.peachesPicked = 1;
  assert.strictEqual(goal().id, 'peach');
  assert.strictEqual(goal().text, '去法宝页摘桃（1/30）');
  s.realmIndex = 2;
  assert.strictEqual(goal().id, 'peach', '已到搬血后但赠桃未摘完：仍先摘桃，不引去通关1-1');
  s.tree.peaches = 0;
  s.equip.weapon = { id: 1, s: 'weapon', q: 0, lv: 1, m: 8, sub: [] };
  s.pending = null;
  assert.strictEqual(NB.peachGoalDone(s), true, '桃已摘空且有装备');
  s.equip.weapon = null;
  s.tree.peaches = 29;
  s.realmIndex = 1;
  s.peachesPicked = 30;
  assert.strictEqual(goal().id, 'realm2');
  s.realmIndex = 2;
  assert.strictEqual(goal().text, '通关1-1');
  assert.strictEqual(goal().tab, 'tab-stage');
  s.stage.best = 1;
  assert.strictEqual(goal().id, 'gongfa');
  s.gongfa[Object.keys(s.gongfa)[0]] = 2;
  // 参悟一层之后若灵石还买得起，先提醒把灵石花掉；花完才进入下一重突破。
  if (NB.canAffordUpgrade(s)) {
    assert.strictEqual(goal().id, 'spend');
    s.stones = 0;
  }
  assert.strictEqual(goal().id, 'realm3');
  s.realmIndex = 3;
  assert.strictEqual(goal().text, '突破至洞天中', '洞天初之后继续逐重显示突破，不跳到通关1-10');
  s.stage.best = 10;
  assert.strictEqual(goal().text, '突破至洞天中');
  s.realmIndex = 8;
  s.stage.best = 5;
  assert.strictEqual(goal().text, '击败第1章首领【山魈娘娘】');
  assert.strictEqual(NB.blockingBoss(s).cur, 6, '未到第 10 关时跳到 best+1');
  s.stage.best = 9;
  assert.strictEqual(goal().text, '击败第1章首领【山魈娘娘】');
  assert.strictEqual(NB.blockingBoss(s).cur, 10, '已到关口则可跳到挡路 Boss');
  s.stage.best = 12;
  assert.strictEqual(goal().text, '击败第2章首领【赤瞳狼后】');
  s.stage.best = 29;
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
  s.peachesPicked = 0;
  s.tree.peaches = 30;
  assert.strictEqual(NB.stageDot(s, { playerStats: () => ({ cp: 1000 }), enemyFor: () => ({ cp: 600 }) }, now), false, 'P0：赠桃未摘完不点闯关红点');
  s.peachesPicked = 30;
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
  assert.ok(/els\.badgeUpgrade\.classList\.toggle\('visible', anyAffordable/.test(text('js/game.js')));
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
  assert.ok(nb.includes('ensureGuide(s).gearPopup = true'), '解锁提示只弹一次并写入存档');
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
  assert.strictEqual(same.text, '无差异');
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

// ---------- P2-5 新手突破保底 / 失败损耗 / 后台收益 ----------
function breakAt(GS, roll) {
  const st = GS.getCurrentStage();
  GS.state.qi = st.reqQi * 100; // 远超所需，验证损耗按 reqQi 封顶
  return GS.applyBreakthroughAttempt(roll);
}
{
  const { GS } = loadRuntime(memoryStorage());
  GS.loadGame();
  assert.strictEqual(GS.GUARANTEED_BREAKS, 3);
  assert.strictEqual(GS.state.breakAttempts, 0);
  assert.strictEqual(GS.state.flags.breakFailTipShown, false);
  for (let i = 0; i < 3; i += 1) {
    assert.strictEqual(GS.isBreakGuaranteed(), true);
    const r = breakAt(GS, 0.99999);
    assert.strictEqual(r.success, true, `新档第 ${i + 1} 次突破必成`);
    assert.strictEqual(r.guaranteed, true);
  }
  assert.strictEqual(GS.state.realmIndex, 3);
  assert.strictEqual(GS.state.breakAttempts, 3);
  assert.strictEqual(GS.isBreakGuaranteed(), false);
  // 第 4 次按正常成功率（上限 0.98）判定
  const st = GS.getCurrentStage();
  const rate = GS.getBreakthroughSuccessRate();
  assert.ok(rate <= 0.98);
  const qiBefore = st.reqQi * 100;
  const r4 = breakAt(GS, 0.99999);
  assert.strictEqual(r4.success, false, '第 4 次不再保底');
  assert.strictEqual(r4.loss, Math.floor(st.reqQi * st.failureLossRatio), '损耗按 min(qi, reqQi)×比例');
  assert.ok(r4.loss <= st.reqQi * st.failureLossRatio);
  assert.strictEqual(GS.state.qi, qiBefore - r4.loss);
  assert.strictEqual(r4.firstFailTip, true, '首次失败弹说明');
  assert.strictEqual(GS.state.flags.breakFailTipShown, true);
  assert.ok(Math.abs(GS.state.pityBonus - 0.04) < 1e-9, '原有气运补偿 +4% 不变');
  const r5 = breakAt(GS, 0.99999);
  assert.strictEqual(r5.success, false);
  assert.strictEqual(r5.firstFailTip, false, '说明只弹一次');
  for (let i = 0; i < 20; i += 1) breakAt(GS, 0.99999);
  assert.ok(Math.abs(GS.state.pityBonus - 0.35) < 1e-9, '补偿上限 35%');
  assert.ok(GS.getBreakthroughSuccessRate() <= 0.98, '总上限 98%');
  const okRoll = breakAt(GS, 0);
  assert.strictEqual(okRoll.success, true);
  assert.strictEqual(GS.state.pityBonus, 0);
  // 存读档后标记保留
  GS.saveGame();
  const saved = JSON.parse(GS.state && JSON.stringify(GS.state));
  assert.strictEqual(saved.flags.breakFailTipShown, true);
  // 小于 reqQi 时按当前灵气算（防御性）
  const st2 = GS.getCurrentStage();
  GS.state.qi = Math.floor(st2.reqQi / 2);
  const rLow = GS.applyBreakthroughAttempt(0.99999);
  assert.strictEqual(rLow.loss, Math.floor(Math.floor(st2.reqQi / 2) * st2.failureLossRatio));
}
// 旧档迁移：洞天及以上或失败过 → 99（无保底）；否则按 realmIndex 计；坏值不报错
[
  [{ realmIndex: 5 }, 99, false],
  [{ realmIndex: 3 }, 99, false],
  [{ realmIndex: 0, failBreakthroughs: 1 }, 99, true],
  [{ realmIndex: 2, failBreakthroughs: 2 }, 99, true],
  [{ realmIndex: 1 }, 1, false],
  [{ realmIndex: 0, breakAttempts: 'abc' }, 0, false],
  [{ realmIndex: 2, breakAttempts: 2, flags: { breakFailTipShown: true } }, 2, true]
].forEach(([fields, attempts, tip]) => {
  const { GS } = loadRuntime(memoryStorage({ [SAVE_KEY]: oldSave(fields) }), { console: Object.assign({}, console, { warn() {} }) });
  const res = GS.loadGame();
  assert.strictEqual(res.isNew, false, JSON.stringify(fields));
  assert.strictEqual(GS.state.breakAttempts, attempts, JSON.stringify(fields));
  assert.strictEqual(GS.state.flags.breakFailTipShown, tip, JSON.stringify(fields));
  if (attempts >= 3) {
    assert.strictEqual(GS.isBreakGuaranteed(), false);
    assert.strictEqual(breakAt(GS, 0.99999).success, false, '旧档无保底');
  }
});
// 轮回保留两个字段
{
  const { GS } = loadRuntime(memoryStorage());
  GS.loadGame();
  GS.state.realmIndex = 27;
  GS.state.breakAttempts = 30;
  GS.state.flags.breakFailTipShown = true;
  GS.performReincarnation();
  assert.strictEqual(GS.state.realmIndex, 0);
  assert.strictEqual(GS.state.breakAttempts, 30);
  assert.strictEqual(GS.state.flags.breakFailTipShown, true);
}
// 后台切回：只结算一次
{
  const storage = memoryStorage();
  const { GS } = loadRuntime(storage);
  GS.loadGame();
  GS.state.realmIndex = 6;
  const now = Date.now();
  GS.state.lastSaveTime = now - 120 * 1000;
  const hiddenAt = GS.state.lastSaveTime;
  const qps = GS.getQiPerSec();
  const qi0 = GS.state.qi;
  const idleAt0 = GS.state.stage && GS.state.stage.idleAt;
  const rep = GS.resumeFromBackground(hiddenAt, now);
  assert.ok(rep && rep.effectiveSeconds === 120);
  assert.ok(Math.abs(GS.state.qi - qi0 - qps * 120) < 1e-6, '后台 120 秒灵气补发');
  assert.ok(GS.state.lastSaveTime >= now);
  assert.strictEqual(GS.state.stage && GS.state.stage.idleAt, idleAt0, '闯关挂机计时不重置（由领取结算）');
  const qi1 = GS.state.qi;
  const again = GS.resumeFromBackground(GS.state.lastSaveTime, now);
  assert.strictEqual(again, null, '重复切回不重复发放');
  assert.strictEqual(GS.state.qi, qi1);
  assert.ok(JSON.parse(storage._data[SAVE_KEY]).lastSaveTime >= now, '结算后立即存档');
}
{
  const game = text('js/game.js');
  assert.ok(game.includes('GameState.applyBreakthroughAttempt(Math.random())'));
  assert.ok(!game.includes('Math.floor(s.qi * stage.failureLossRatio)'), '旧损耗公式已移除');
  assert.ok(/visibilitychange[\s\S]*GameState\.resumeFromBackground\(from, Date\.now\(\)\)/.test(game));
  const html = text('index.html');
  assert.ok(html.includes('id="break-tip-modal"'));
  assert.ok(html.includes('突破失败会损失部分灵气；下次成功率+4%，可叠加，最高+35%。'));
}

// ---------- P2-6 固定站位 + 突进；挑战主按钮 ----------
{
  const { GS, Battle, sandbox } = loadRuntime(memoryStorage());
  vm.runInNewContext(text('js/stage-ui.js'), sandbox, { filename: 'js/stage-ui.js' });
  const F = sandbox.window.StageUI._formation;
  // 纯函数：我方显示在阵位格；敌方逻辑格与我方阵位冲突时挪开
  const units = [
    { id: 'p1', side: 'player', c: 2, r: 2, alive: true },
    { id: 'e1', side: 'enemy', c: 2, r: 4, alive: true },
    { id: 'e2', side: 'enemy', c: 3, r: 3, alive: true }
  ];
  const anchors = { p1: { c: 2, r: 4 }, e1: { c: 2, r: 1 }, e2: { c: 3, r: 1 } };
  const logical = { p1: { c: 2, r: 2 }, e1: { c: 2, r: 4 }, e2: { c: 3, r: 3 } };
  const d = F.computeDisplayCells(units, anchors, logical);
  assert.deepStrictEqual(plain(d.p1), { c: 2, r: 4 }, '我方钉在阵位');
  assert.deepStrictEqual(plain(d.e2), { c: 3, r: 3 }, '无冲突的敌方显示在逻辑格');
  assert.notDeepStrictEqual(plain(d.e1), { c: 2, r: 4 }, '敌方不与我方阵位重叠');
  assert.strictEqual(Math.max(Math.abs(d.e1.c - 2), Math.abs(d.e1.r - 4)), 1, '挪到最近空格');
  assert.ok(d.e1.r < 4, '优先靠近其出生格一侧');
  // 突进向量：朝目标方向，长度在 [8px, 1.5 格]
  const v = F.lungeVector({ c: 2, r: 4 }, { c: 2, r: 1 }, 50, 50);
  assert.strictEqual(v.x, 0);
  assert.ok(v.y < 0 && -v.y <= 75 && -v.y >= 8);
  const adj = F.lungeVector({ c: 2, r: 4 }, { c: 3, r: 4 }, 50, 50);
  assert.ok(adj.x >= 8 && adj.x <= 25 && adj.y === 0, '相邻目标轻冲');
  assert.deepStrictEqual(plain(F.lungeVector({ c: 1, r: 1 }, { c: 1, r: 1 }, 50, 50)), { x: 0, y: -6 });

  // 真实战斗回放：我方显示格全程不变，任意时刻存活单位不重叠
  GS.loadGame();
  GS.state.realmIndex = 9;
  const s = GS.state;
  for (let seed = 1; seed <= 6; seed += 1) {
    const session = Battle.createSession(s, Battle.enemyFor(5 + seed), seed);
    const anc = {};
    const lg = {};
    session.units.forEach((u) => { anc[u.id] = { c: u.c, r: u.r }; lg[u.id] = { c: u.c, r: u.r }; });
    let moved = 0;
    for (let guard = 0; guard < 400 && !session.finished; guard += 1) {
      const evs = session.step({ autoUlt: true }) || [];
      evs.forEach((ev) => { if (ev.type === 'move') { lg[ev.unitId] = { c: ev.toC, r: ev.toR }; moved += 1; } });
      const disp = F.computeDisplayCells(session.units, anc, lg);
      const seen = {};
      session.units.forEach((u) => {
        const c = disp[u.id];
        if (u.side === 'player') assert.deepStrictEqual(plain(c), plain(anc[u.id]), '我方显示格不漂移');
        if (u.alive) {
          const k = `${c.c},${c.r}`;
          assert.ok(!seen[k], `存活单位显示重叠 seed=${seed} ${k}`);
          seen[k] = true;
        }
      });
    }
    assert.ok(session.finished, '战斗能结束');
  }
  const ui = text('js/stage-ui.js');
  assert.ok(ui.includes('pulseAttackAndHit(mainEv.attackerId, mainEv.targetId, fromCell, toCell)'));
  assert.ok(ui.includes('layoutAllUnits()'), '移动事件按显示格重排');
  const css = text('css/style.css');
  assert.ok(/@keyframes unitLunge/.test(css), '突进-弹回动画');
  assert.ok(/\.stage-action-row \.stage-btn-main \{[^}]*height: 46px[^}]*font-size: 18px/.test(css), '挑战按钮放大为主按钮');
}

// ---------- P3-7 所有弹窗 Esc / 点遮罩关闭（含 QA B1：修仙日志、设置、更换角色） ----------
{
  const { NB } = loadRuntime(memoryStorage());
  function fakeEl(id, opts) {
    const cls = new Set((opts && opts.cls) || []);
    const attrs = Object.assign({}, (opts && opts.attrs) || {});
    const el = {
      id,
      children: [],
      clicks: 0,
      disabled: false,
      classList: {
        contains: (c) => cls.has(c),
        add: (c) => cls.add(c),
        remove: (c) => cls.delete(c)
      },
      hasAttribute: (k) => Object.prototype.hasOwnProperty.call(attrs, k),
      setAttribute: (k, v) => { attrs[k] = String(v); },
      getAttribute: (k) => attrs[k],
      querySelector: (sel) => (sel === '[data-modal-close]' ? el.children.find((c) => c.hasAttribute('data-modal-close')) || null : null),
      click() { el.clicks += 1; if (opts && opts.onClick) opts.onClick(); }
    };
    return el;
  }
  function modal(id, withClose, ariaHidden) {
    const m = fakeEl(id, { cls: ['modal-backdrop'], attrs: ariaHidden ? { 'aria-hidden': 'true' } : {} });
    if (withClose) {
      const btn = fakeEl(`${id}-close`, { attrs: { 'data-modal-close': '' }, onClick: () => m.classList.remove('active') });
      m.children.push(btn);
      m.btn = btn;
    }
    return m;
  }
  const settings = modal('settings-modal', true);
  const confirm = modal('confirm-modal', true);
  const compare = modal('compare-modal', false, true);
  const all = [settings, confirm, compare];
  const doc = { querySelectorAll: () => all.filter((m) => m.classList.contains('active') && m.classList.contains('modal-backdrop')) };
  const esc = () => {
    const ev = { key: 'Escape', defaultPrevented: false, preventDefault() { ev.defaultPrevented = true; } };
    return { ev, closed: NB.handleEscKey(ev, doc) };
  };
  assert.strictEqual(esc().closed, false, '无弹窗时 Esc 不处理');
  settings.classList.add('active');
  confirm.classList.add('active');
  let r = esc();
  assert.strictEqual(r.closed, true);
  assert.strictEqual(r.ev.defaultPrevented, true);
  assert.strictEqual(confirm.btn.clicks, 1, '只关最上层，并走它自己的关闭按钮');
  assert.strictEqual(settings.classList.contains('active'), true, '下层弹窗保持打开');
  r = esc();
  assert.strictEqual(settings.btn.clicks, 1);
  assert.strictEqual(settings.classList.contains('active'), false);
  // 已被其他模块处理（defaultPrevented）的 Esc 不重复关闭
  settings.classList.add('active');
  assert.strictEqual(NB.handleEscKey({ key: 'Escape', defaultPrevented: true }, doc), false);
  assert.strictEqual(NB.handleEscKey({ key: 'Enter', defaultPrevented: false }, doc), false);
  assert.strictEqual(settings.classList.contains('active'), true);
  // 没有关闭按钮的弹窗：直接移除 active，并恢复 aria-hidden
  compare.classList.add('active');
  compare.setAttribute('aria-hidden', 'false');
  esc();
  assert.strictEqual(compare.classList.contains('active'), false);
  assert.strictEqual(compare.getAttribute('aria-hidden'), 'true');
  // 点遮罩：只有点在遮罩本身才关闭，点对话框内部不关
  assert.strictEqual(NB.handleBackdropClick({ target: settings.btn }), false);
  assert.strictEqual(NB.handleBackdropClick({ target: settings }), true);
  assert.strictEqual(settings.classList.contains('active'), false);
  assert.strictEqual(NB.handleBackdropClick({ target: settings }), false, '已关闭的遮罩不处理');

  // index.html：每个弹窗都有关闭按钮标记（装备对比弹窗除外：关掉后用「处理掉落」重开）
  const html = text('index.html');
  const modalIds = [...html.matchAll(/<div id="([^"]+)" class="modal-backdrop/g)].map((m) => m[1]);
  assert.ok(modalIds.length >= 15, `弹窗数 ${modalIds.length}`);
  modalIds.forEach((id, i) => {
    const start = html.indexOf(`<div id="${id}" class="modal-backdrop`);
    const end = i + 1 < modalIds.length ? html.indexOf(`<div id="${modalIds[i + 1]}" class="modal-backdrop`) : html.length;
    const chunk = html.slice(start, end);
    if (id === 'compare-modal') return;
    assert.ok(/data-modal-close/.test(chunk), `${id} 缺少 data-modal-close`);
  });
  ['btn-close-log', 'btn-close-settings', 'btn-close-role'].forEach((id) => {
    assert.ok(html.includes(`<button id="${id}" data-modal-close `), `QA B1：${id}`);
  });
  const nb = text('js/newbie.js');
  assert.ok(nb.includes("document.addEventListener('keydown', (e) => handleEscKey(e, document), true)"), 'Esc 在捕获阶段统一处理');
  assert.ok(nb.includes("document.addEventListener('click', handleBackdropClick)"));
}

// ---------- batch2 P1-2 卡 Boss 自动再战一次 / 离线「可挑战」 ----------
{
  const { sandbox } = loadRuntime(memoryStorage());
  vm.runInNewContext(text('js/stage-ui.js'), sandbox, { filename: 'js/stage-ui.js' });
  const decide = sandbox.window.StageUI._bossRetryDecision;
  const b = { armed: true, stageNum: 30, recCp: 1000, notified: false };
  const ctx = (o) => Object.assign({ isPlaying: false, mijing: false, unlocked: true, halted: true, curStage: 30, cp: 1200, onStageTab: true }, o);
  assert.strictEqual(decide(b, ctx()), 'retry', '战力超推荐且在闯关页 → 自动再战');
  assert.strictEqual(decide(b, ctx({ cp: 999 })), null, '未达推荐不重试');
  assert.strictEqual(decide(b, ctx({ onStageTab: false })), 'notify', '不在闯关页先提示');
  assert.strictEqual(decide(Object.assign({}, b, { notified: true }), ctx({ onStageTab: false })), null, '提示只一次');
  assert.strictEqual(decide(Object.assign({}, b, { armed: false }), ctx()), null, '只自动重试一次');
  assert.strictEqual(decide(b, ctx({ curStage: 31 })), null, '已过关不再重试');
  assert.strictEqual(decide(b, ctx({ isPlaying: true })), null);
  assert.strictEqual(decide(b, ctx({ mijing: true })), null);
  assert.strictEqual(decide(b, ctx({ halted: false })), null);
  const ui = text('js/stage-ui.js');
  assert.ok(ui.includes('bossRetry.armed = false;'), '触发后解除，避免循环');
  assert.ok(/enemy && enemy\.isBoss && !enemy\.mijingWave/.test(ui), '只对闯关 Boss 生效');
  const html = text('index.html');
  assert.ok(html.includes('id="btn-offline-challenge"'));
  const game = text('js/game.js');
  assert.ok(game.includes('StageUI.challengeReadiness()') && game.includes('StageUI.challengeNow()'));
}
// ---------- batch2 P1-3 失败后「去摘桃/去参悟功法/去突破」与最大增益标记 ----------
{
  const { GS, NB } = loadRuntime(memoryStorage());
  GS.loadGame();
  const s = GS.state;
  s.realmIndex = 6;
  s.stones = 5000;
  s.qi = 1e12;
  s.tree.peaches = 8;
  const snap = JSON.stringify(s);
  const opts = NB.cpGainOptions(s);
  assert.strictEqual(JSON.stringify(s), snap, '估算后存档完全还原');
  assert.deepStrictEqual(plain(opts.map((o) => o.key)), ['break', 'peach', 'gongfa'], '按固定优先级，不按立即战力');
  assert.strictEqual(opts.filter((o) => o.best).length, 1);
  assert.strictEqual(opts[0].best, true, '优先级最高的一项标 ★');
  assert.strictEqual(opts[0].key, 'break');
  assert.deepStrictEqual(plain(NB.cpGainOptions(s)).map((o) => o.key), plain(opts).map((o) => o.key), '估算确定（固定种子）');
  // 不可用的隐藏
  s.stones = 0; s.qi = 0; s.tree.peaches = 0;
  assert.deepStrictEqual(plain(NB.cpGainOptions(s)), []);
  s.tree.peaches = 3;
  assert.deepStrictEqual(plain(NB.cpGainOptions(s).map((o) => o.key)), ['peach']);
  s.tree.peaches = 0;
  s.qi = 1e12;
  s.realmIndex = 8; // 渡劫门槛（需先败 Boss）
  s.stage.best = 0;
  const locked = NB.cpGainOptions(s);
  assert.deepStrictEqual(plain(locked.map((o) => o.key)), ['gate'], '被渡劫门槛挡住时改为先通关，不显示去突破');
  assert.ok(locked[0].label.includes('先通关') && locked[0].label.includes('才能突破'));
  assert.ok(!locked.some((o) => o.key === 'break' || o.key === 'wait'));
  s.realmIndex = 0;
  s.tree.peaches = 5;
  assert.ok(!NB.cpGainOptions(s).some((o) => o.key === 'peach'), '法宝未开启不显示去摘桃');
  const html = text('index.html');
  ['btn-goto-peach', 'btn-goto-gongfa', 'btn-goto-break', 'btn-goto-pending', 'btn-goto-wait', 'btn-goto-gate'].forEach((id) => assert.ok(html.includes(`id="${id}"`), id));
  assert.ok(html.includes('去参悟功法'));
  const ui = text('js/stage-ui.js');
  assert.ok(ui.includes('renderFailGainActions(actionsEl)'));
}

// ---------- batch2 P2-5 目标条：深底金字卷轴样式，且全站只有一个目标组件 ----------
{
  const html = text('index.html');
  assert.strictEqual((html.match(/class="goal-strip"/g) || []).length, 1, '只有一个目标条组件');
  const css = text('css/style.css');
  const i = css.indexOf('batch2 P2-5');
  assert.ok(i > 0);
  const block = css.slice(i);
  assert.ok(/\.goal-strip \{[^}]*background:[^}]*#0d0a06/.test(block), '深色底');
  assert.ok(/\.goal-text \{[^}]*color: #f1d48f/.test(block), '金色字');
  assert.ok(/\.goal-strip::before,\s*\.goal-strip::after/.test(block), '卷轴轴头');
  assert.ok(!/url\(/.test(block), '不引用新图片');
  assert.ok(/\.goal-strip \{[^}]*height: 22px/.test(block), '高度不变，不挤压竖屏布局');
}

// ---------- batch2 P2-6 「新机缘开启」通用解锁卡 + 秘境开启二次确认 ----------
{
  const { GS, NB, sandbox } = loadRuntime(memoryStorage());
  ['js/bonds.js', 'js/mijing.js'].forEach((rel) => vm.runInNewContext(text(rel), sandbox, { filename: rel }));
  GS.loadGame();
  const s = GS.state;
  assert.deepStrictEqual(plain(s.unlockSeen), {}, '新档默认未看过');
  assert.deepStrictEqual(plain(NB.UNLOCKS.map((u) => u.key)), ['gear', 'yaoyuan', 'mijing', 'bonds', 'dispatch']);
  assert.strictEqual(NB.pendingUnlock(s), null);
  s.realmIndex = 1;
  assert.strictEqual(NB.pendingUnlock(s).key, 'gear');
  s.unlockSeen.gear = true;
  assert.strictEqual(NB.pendingUnlock(s), null);
  s.realmIndex = 6;
  assert.strictEqual(NB.pendingUnlock(s).key, 'yaoyuan', '化灵初开启百草灵药园');
  s.unlockSeen.yaoyuan = true;
  // 化灵初同时会解锁功法等单项，先记为已看，以免挡住后面的功能卡断言
  NB.itemUnlocks().forEach((u) => { if (u.test(s)) s.unlockSeen[u.key] = true; });
  s.stage.best = 10;
  assert.strictEqual(NB.pendingUnlock(s).key, 'mijing', '首通第 10 关开启秘境');
  s.unlockSeen.mijing = true;
  const hasBond = sandbox.window.Bonds.activeBonds(sandbox.window.Battle.getSquadIds(s)).length > 0;
  assert.strictEqual(Boolean(NB.pendingUnlock(s) && NB.pendingUnlock(s).key === 'bonds'), hasBond, '队伍有激活羁绊才弹');
  NB.UNLOCKS.forEach((u) => { assert.ok(u.title && u.desc && u.go && u.tab && u.glyph, u.key); });
  // 轮回保留
  s.realmIndex = 27;
  s.unlockSeen = { gear: true, yaoyuan: true };
  GS.performReincarnation();
  assert.deepStrictEqual(plain(GS.state.unlockSeen), { gear: true, yaoyuan: true });
}
{
  // 旧档没有 unlockSeen：按已解锁补记，不补弹
  const { GS, NB } = loadRuntime(memoryStorage({ [SAVE_KEY]: oldSave({ realmIndex: 10, stage: { best: 20, cur: 21 } }) }));
  GS.loadGame();
  assert.strictEqual(GS.state.unlockSeen, null);
  assert.strictEqual(NB.pendingUnlock(GS.state), null, '老玩家不补弹');
  assert.strictEqual(GS.state.unlockSeen.gear, true);
  assert.strictEqual(GS.state.unlockSeen.yaoyuan, true);
  assert.strictEqual(GS.state.unlockSeen.mijing, true);
  // 之后新解锁仍会弹：模拟法宝没弹过（guide 记录未弹）的极早期旧档
  const r2 = loadRuntime(memoryStorage({ [SAVE_KEY]: oldSave({ realmIndex: 0, guide: { step: 1, done: false, taps: 3, gearPopup: false, gearVisited: false } }) }));
  r2.GS.loadGame();
  assert.strictEqual(r2.NB.pendingUnlock(r2.GS.state), null);
  r2.GS.state.realmIndex = 1;
  assert.strictEqual(r2.NB.pendingUnlock(r2.GS.state).key, 'gear');
  // 坏值不报错
  const r3 = loadRuntime(memoryStorage({ [SAVE_KEY]: oldSave({ realmIndex: 2, unlockSeen: 'x' }) }));
  r3.GS.loadGame();
  assert.doesNotThrow(() => r3.NB.pendingUnlock(r3.GS.state));
}
{
  const html = text('index.html');
  assert.ok(/class="unlock-art"[^>]*>.*<img alt=""/.test(html), '插画位');
  const css = text('css/style.css');
  assert.ok(/\.unlock-art \{[^}]*aspect-ratio: 16 \/ 9/.test(css), '插画位 16:9');
  assert.ok(/\.unlock-art img \{[^}]*object-fit: cover/.test(css));
  const nb = text('js/newbie.js');
  assert.ok(nb.includes('function unlockArtSrc') && nb.includes('UNLOCK_ART_KEYS'), '只对有图的 key 请求 unlock_<key>.webp');
  const ui = text('js/stage-ui.js');
  assert.ok(ui.includes('确认开启（消耗 1 次'), '开启秘境二次确认');
  assert.ok(/if \(!mijingStartArmed\) \{\s*mijingStartArmed = true;/.test(ui));
}

// ---------- batch3 P3-8 文案统一 ----------
{
  const all = ['index.html', 'js/game.js', 'js/stage-ui.js', 'js/newbie.js'].map(text).join('\n');
  assert.ok(!all.includes('看完整立绘') && !all.includes('隐藏境界突破'), '旧文案已移除');
  assert.strictEqual((text('index.html').match(/赏玩立绘模式/g) || []).length, 2);
  assert.ok(text('index.html').includes('胜算：<strong id="stage-winrate">'));
}

// ---------- batch3 P1-3 更换角色卡：品阶 + 简介 + 选中台词 ----------
{
  const { NB, CFG, sandbox } = loadRuntime(memoryStorage());
  ['js/codex-data.js', 'js/hero-lines-data.js'].forEach((rel) => vm.runInNewContext(text(rel), sandbox, { filename: rel }));
  const heroes = CFG.HEROES.filter((h) => h && h.id);
  assert.ok(heroes.length >= 10);
  heroes.forEach((h) => {
    const q = NB.heroQuality(h);
    assert.ok(q && q.name.endsWith('品'), `${h.id} 品阶`);
  });
  const intro = NB.heroIntro('lanyi');
  assert.strictEqual(intro, '替仙界斩叛仙的执剑仙。', '复用图鉴副标题并去掉品阶前缀');
  const withIntro = heroes.filter((h) => NB.heroIntro(h.id)).length;
  assert.ok(withIntro >= heroes.length - 2, `大多数角色有简介 ${withIntro}/${heroes.length}`);
  assert.strictEqual(NB.heroSelectLine('lanyi'), sandbox.window.HeroLinesData.voice.lanyi.tap, '复用点击台词');
  assert.strictEqual(NB.heroIntro('nope'), '');
  assert.strictEqual(NB.heroSelectLine('nope'), '');
  const game = text('js/game.js');
  assert.ok(game.includes('Newbie.sayHeroSelectLine(hero.id)'));
  assert.ok(/roleLineTimer = setTimeout\([\s\S]{0,160}\}, 2000\);/.test(text('js/newbie.js')), '约 2 秒');
  assert.ok(game.includes('${roleCardQualityTag(hero)}') && game.includes('${roleCardIntro(hero)}'));
}

// ---------- batch3 P2-4 羁绊说明图标列表 + 一次性「试试凑羁绊」 ----------
{
  const { GS, sandbox } = loadRuntime(memoryStorage());
  vm.runInNewContext(text('js/bonds.js'), sandbox, { filename: 'js/bonds.js' });
  vm.runInNewContext(text('js/stage-ui.js'), sandbox, { filename: 'js/stage-ui.js' });
  const rows = sandbox.window.StageUI._bondListRows(['lanyi', 'qinglan', 'shuanghua']);
  const Bd = sandbox.window.Bonds;
  assert.strictEqual(rows.length, Bd.BONDS.length, '每个标签一行');
  const jian = rows.find((r) => r.id === 'jian');
  const bing = rows.find((r) => r.id === 'bing');
  const yan = rows.find((r) => r.id === 'yan');
  const zuo = rows.find((r) => r.id === 'zuo');
  assert.strictEqual(jian.active, true);
  assert.strictEqual(jian.status, '已激活');
  assert.strictEqual(jian.desc, '剑修角色绝技伤害 +15%（3 人：剑修角色绝技伤害 +30%）');
  assert.strictEqual(bing.active, true);
  assert.strictEqual(bing.status, '已满阶', '冰霜 3 人满阶');
  assert.strictEqual(yan.active, false);
  assert.strictEqual(yan.status, '差 2 人');
  const ming1 = sandbox.window.StageUI._bondListRows(['cloak']).find((r) => r.id === 'ming');
  assert.strictEqual(ming1.status, '差 1 人');
  assert.strictEqual(zuo.lack, 2);
  rows.forEach((r) => assert.ok(r.icon && r.desc, r.id));
  GS.loadGame();
  assert.strictEqual(GS.state.flags.squadTagHintShown, false, '新档默认未提示');
  const old = loadRuntime(memoryStorage({ [SAVE_KEY]: oldSave({ realmIndex: 5, flags: { ling: true } }) }));
  old.GS.loadGame();
  assert.strictEqual(old.GS.state.flags.squadTagHintShown, false, '旧档缺字段时安全默认');
  const ui = text('js/stage-ui.js');
  assert.ok(ui.includes('bondPanel.innerHTML = bondListHtml(draftSquad)'));
  assert.ok(/if \(s\.flags\.squadTagHintShown\) return false;\s*s\.flags\.squadTagHintShown = true;/.test(ui), '只提示一次');
  assert.ok(/function onShow\(\) \{[\s\S]{0,160}maybeShowBondHint\(\);/.test(ui), '进闯关页时检查');
  assert.ok(text('index.html').includes('id="bond-hint"'));
  assert.ok(text('index.html').includes('试试凑羁绊'));
}

// ---------- batch3 P1-1 主线剧情对话 ----------
{
  const { GS, CFG, sandbox } = loadRuntime(memoryStorage());
  ['js/codex-data.js', 'js/story-data.js', 'js/story.js'].forEach((rel) => vm.runInNewContext(text(rel), sandbox, { filename: rel }));
  const SD = sandbox.window.StoryData;
  const ST = sandbox.window.Story;
  const BOSSES = CFG.BATTLE.BOSSES;
  assert.strictEqual(SD.chapters.length, 30, '第 1–30 章');
  const bossNames = BOSSES.map((b) => b.name).filter(Boolean);
  const nameById = {};
  BOSSES.forEach((b) => { if (b && b.id) nameById[b.id] = b.name; });
  const guoziChapters = new Set();
  SD.chapters.forEach((ch) => {
    assert.strictEqual(ch.chapter, SD.chapters.indexOf(ch) + 1, '章节连续');
    assert.strictEqual(ch.intro.length, 4, `第 ${ch.chapter} 章 intro 应为 4 句`);
    assert.strictEqual(ch.bosses.length, 1, '每章 1 个 Boss');
    const b = ch.bosses[0];
    assert.strictEqual(b.stage, ch.chapter * 10, 'Boss 在 10 的倍数关');
    assert.strictEqual(b.bossId, BOSSES[ch.chapter - 1].id, 'bossId 与 config 一致');
    assert.strictEqual(b.pre.length, 3, `第 ${ch.chapter} 章 pre 应为 3 句`);
    assert.strictEqual(b.post.length, 2, `第 ${ch.chapter} 章 post 应为 2 句`);
    assert.ok(b.lastWords);
    const lines = [...ch.intro, ...b.pre, ...b.post];
    lines.forEach((l) => {
      if (!['旁白', 'Boss', '无名修士'].includes(l.speaker)) assert.ok(l.fallback, `heroId 台词必带 fallback：${l.speaker}`);
    });
    const fields = [];
    lines.forEach((l) => {
      if (l && l.text) fields.push(l.text);
      if (l && l.fallback) fields.push(l.fallback);
    });
    if (b.lastWords) fields.push(b.lastWords);
    fields.forEach((t) => {
      assert.ok(!t.includes('收割'), `不应出现「收割」：第 ${ch.chapter} 章`);
      assert.ok(!t.includes('至高天'), `不应出现「至高天」：第 ${ch.chapter} 章`);
      if (t.includes('果子')) guoziChapters.add(ch.chapter);
      const ids = [];
      String(t).replace(/\{boss(?::([a-z0-9_]+))?\}/gi, (m, id) => { ids.push(id || b.bossId); return m; });
      const filled = ST.fill(t, b.bossId);
      assert.ok(!filled.includes('{'), `渲染后不应残留「{」：第 ${ch.chapter} 章 ${filled}`);
      ids.forEach((id) => {
        const name = nameById[id];
        assert.ok(name && bossNames.includes(name), `占位符应解析为真实 Boss 名：{boss${id ? ':' + id : ''}}`);
        assert.ok(filled.includes(name), `渲染结果应含 ${name}`);
      });
    });
  });
  assert.deepStrictEqual([...guoziChapters], [26], '「果子」只出现在第 26 章');
  assert.strictEqual(Object.keys(SD.lastWords).length, 30, '30 个 Boss 遗言');
  BOSSES.slice(0, 30).forEach((b) => assert.ok(SD.lastWords[b.id], `遗言 ${b.id}`));
  const raw = text('js/story-data.js');
  BOSSES.forEach((b) => assert.ok(!raw.includes(b.name), `剧情数据不硬编码 Boss 名：${b.name}`));
  assert.ok(raw.includes('{boss}'));
  // 运行时从 config 读名字（改名后自动跟随）
  const filled = ST.fill('{boss}倒下，{boss:heifeng}在等。', 'shanxiao');
  assert.strictEqual(filled, `${BOSSES[0].name}倒下，${BOSSES[2].name}在等。`);
  const old = BOSSES[0].name;
  BOSSES[0].name = '改名测试';
  assert.strictEqual(ST.fill('{boss}', 'shanxiao'), '改名测试');
  BOSSES[0].name = old;
  // 开场台词仍是图鉴 quote，遗言是新字段
  const lore = sandbox.window.CodexData.bossLore[BOSSES[0].name];
  assert.ok(lore && lore.quote, '图鉴开场台词还在');
  assert.notStrictEqual(ST.lastWordsFor('shanxiao', 10), lore.quote, '遗言不覆盖开场台词');
  // 触发时机
  assert.strictEqual(ST.pendingBefore(1, {})[0].key, 'c1:intro');
  assert.strictEqual(ST.pendingBefore(2, {}), null);
  assert.strictEqual(ST.pendingBefore(10, {})[0].key, 'b10:pre');
  assert.strictEqual(ST.pendingBefore(10, { 'b10:pre': true }), null, '看过不再播');
  assert.strictEqual(ST.pendingBefore(11, {})[0].key, 'c2:intro');
  assert.strictEqual(ST.pendingBefore(61, {})[0].key, 'c7:intro', '第 7 章章首在第 61 关播放');
  const after10 = ST.pendingAfter(10, {})[0];
  assert.strictEqual(after10.lines[0].kind, 'last', '先遗言');
  assert.strictEqual(after10.lines[after10.lines.length - 1].kind, 'codex', '最后提示图鉴已收录');
  assert.ok(after10.lines[after10.lines.length - 1].text.includes(`图鉴已收录【${BOSSES[0].name}】`));
  assert.ok(after10.lines.length > 2, '前 6 章有战后剧情');
  const after70 = ST.pendingAfter(70, {})[0];
  assert.strictEqual(after70.lines[0].kind, 'last', '第 7 章也先遗言');
  assert.strictEqual(after70.lines[after70.lines.length - 1].kind, 'codex');
  assert.strictEqual(after70.lines.length, 4, '第 7 章：遗言 + 战后 2 句 + 图鉴已收录');
  assert.strictEqual(ST.pendingAfter(15, {}), null, '非 Boss 关');
  assert.strictEqual(ST.pendingAfter(10, { 'b10:post': true }), null);
  // 说话人：不在队伍的角色用 fallback 改为旁白
  const lines = [{ speaker: 'qinglan', text: '甲', fallback: '乙' }, { speaker: 'molan', text: '丙' }, { speaker: 'Boss', text: '{boss}！' }];
  const out1 = ST.resolveLines(lines, { bossId: 'shanxiao', squad: [] });
  assert.deepStrictEqual(plain(out1.map((l) => [l.who, l.text])), [['narrator', '乙'], ['boss', `${BOSSES[0].name}！`]]);
  const out2 = ST.resolveLines(lines, { bossId: 'shanxiao', squad: ['qinglan', 'molan'], heroName: (id) => id.toUpperCase() });
  assert.deepStrictEqual(plain(out2.map((l) => [l.who, l.name, l.text])), [['hero', 'QINGLAN', '甲'], ['hero', 'MOLAN', '丙'], ['boss', BOSSES[0].name, `${BOSSES[0].name}！`]]);
  // 存档：新档 {}；旧档按进度补记；轮回保留
  GS.loadGame();
  assert.deepStrictEqual(plain(GS.state.storySeen), {});
  GS.state.realmIndex = 27;
  GS.state.storySeen = { 'c1:intro': true };
  GS.performReincarnation();
  assert.deepStrictEqual(plain(GS.state.storySeen), { 'c1:intro': true });
  const o = loadRuntime(memoryStorage({ [SAVE_KEY]: oldSave({ realmIndex: 9, stage: { best: 25, cur: 26 } }) }));
  o.GS.loadGame();
  assert.deepStrictEqual(Object.keys(plain(o.GS.state.storySeen)).sort(), ['b10:post', 'b10:pre', 'b20:post', 'b20:pre', 'c1:intro', 'c2:intro', 'c3:intro'].sort(), '旧档已过内容不补播');
  const o2 = loadRuntime(memoryStorage({ [SAVE_KEY]: oldSave({ realmIndex: 0, storySeen: 'bad' }) }));
  assert.doesNotThrow(() => o2.GS.loadGame());
  // 接线
  const ui = text('js/stage-ui.js');
  assert.ok(ui.includes('window.Story.beforeBattle(st.cur, () => startBattle(manual))'));
  assert.ok(ui.includes('window.Story.afterBossWin(stageNum, resumeAuto)'));
  assert.ok(!/if \(storyShown\) log\(`图鉴已收录/.test(ui), '剧情已含「图鉴已收录」时不再往战报重复写');
  assert.ok(/!towerBattle && !inMijing\(\) && window\.Story/.test(ui), '秘境/镇妖塔不播剧情');
  const html = text('index.html');
  assert.ok(html.includes('id="story-modal"') && html.includes('id="btn-story-skip" class="btn story-skip" type="button" data-modal-close'), '可跳过（含 Esc / 遮罩）');
  assert.ok(html.indexOf('js/story-data.js') < html.indexOf('js/story.js'));
}

// ---------- batch3 P2-7：音乐/音效，默认关，手势后才建 AudioContext，Web Audio 合成 ----------
{
  function fakeNode() {
    const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} });
    return { connect() {}, start() {}, stop() {}, gain: param(), frequency: param(), Q: param(), type: '', buffer: null };
  }
  function makeAudio(stored) {
    let created = 0;
    const listeners = {};
    class FakeCtx {
      constructor() { created += 1; this.currentTime = 0; this.sampleRate = 8000; this.state = 'running'; this.destination = {}; }
      createGain() { return fakeNode(); }
      createOscillator() { return fakeNode(); }
      createBiquadFilter() { return fakeNode(); }
      createBufferSource() { return fakeNode(); }
      createBuffer(c, len) { const d = new Float32Array(len); return { getChannelData: () => d }; }
      resume() {}
      suspend() {}
    }
    const storage = memoryStorage(stored || {});
    const document = { readyState: 'complete', hidden: false, getElementById: () => null, addEventListener: (t, fn) => { listeners[t] = fn; } };
    const sandbox = { console, Date, Math, JSON, setInterval: () => 1, clearInterval() {}, setTimeout, localStorage: storage, document, Float32Array };
    sandbox.window = sandbox;
    sandbox.AudioContext = FakeCtx;
    vm.runInNewContext(text('js/audio.js'), sandbox, { filename: 'js/audio.js' });
    return { A: sandbox.GameAudio, created: () => created, listeners, storage };
  }
  const a = makeAudio();
  assert.deepStrictEqual(plain(a.A.prefs()), { music: false, sfx: false, volume: 0.9, asked: false }, '默认全关，音量沿用原主音量');
  assert.strictEqual(a.A.play('tuna'), false);
  a.A.setSfx(true);
  assert.strictEqual(a.A.play('tuna'), false, '无手势不出声');
  assert.strictEqual(a.created(), 0, '手势前不创建 AudioContext');
  a.listeners.pointerdown();
  ['tuna', 'breakthrough', 'boss'].forEach((k) => assert.strictEqual(a.A.play(k), true, k));
  assert.strictEqual(a.created(), 1);
  assert.strictEqual(a.A.startMusic(), false, '音乐开关关着');
  a.A.setMusic(true);
  assert.strictEqual(a.A.startMusic(), true);
  // 偏好持久化 + 坏数据兜底
  const b = makeAudio({ xiuxian_audio: a.storage.getItem('xiuxian_audio') });
  assert.deepStrictEqual(plain(b.A.prefs()), { music: true, sfx: true, volume: 0.9, asked: true });
  assert.strictEqual(b.created(), 0, '已开启也要等手势');
  b.listeners.keydown();
  assert.strictEqual(b.created(), 1, '手势后自动起 BGM');
  const c = makeAudio({ xiuxian_audio: '{bad' });
  assert.deepStrictEqual(plain(c.A.prefs()), { music: false, sfx: false, volume: 0.9, asked: false });
  // 不含音频文件；来源许可写入仓库；接线
  const audioSrc = text('js/audio.js');
  assert.ok(!/\.(mp3|ogg|wav|m4a)\b/i.test(audioSrc), '纯合成，无外部音频');
  assert.ok(audioSrc.includes('resumeCtx') && audioSrc.includes('p.catch'), 'AudioContext.resume 的 Promise 带 catch');
  const lic = text('docs/AUDIO_SOURCES.md');
  assert.ok(lic.includes('Web Audio') && lic.includes('CC0') && lic.includes('默认关闭'));
  const html = text('index.html');
  assert.ok(html.includes('id="chk-music"') && html.includes('id="chk-sfx"'));
  assert.ok(html.includes('id="rng-volume"') && html.includes('id="btn-audio-preview"') && html.includes('试听'));
  assert.ok(text('js/stage-ui.js').includes("window.GameAudio.play('boss')"));
}

// ---------- 世界观 batch5：开篇五屏（只给全新存档；旧档视为已看；先开篇后章节剧情） ----------
{
  function fakeEl(id) {
    const cls = new Set();
    const attrs = {};
    const handlers = {};
    return {
      id, textContent: '', src: '',
      classList: { add: (...c) => c.forEach((x) => cls.add(x)), remove: (...c) => c.forEach((x) => cls.delete(x)), toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)), contains: (c) => cls.has(c) },
      setAttribute: (k, v) => { attrs[k] = String(v); }, getAttribute: (k) => attrs[k], removeAttribute: (k) => { delete attrs[k]; },
      addEventListener: (t, fn) => { handlers[t] = fn; }, click: () => handlers.click && handlers.click({ stopPropagation() {} })
    };
  }
  function boot(storage) {
    const rt = loadRuntime(storage);
    const elsById = {};
    rt.sandbox.document = { getElementById: (id) => (elsById[id] = elsById[id] || fakeEl(id)) };
    ['js/codex-data.js', 'js/story-data.js', 'js/story.js'].forEach((rel) => vm.runInNewContext(text(rel), rt.sandbox, { filename: rel }));
    return { ...rt, ST: rt.sandbox.window.Story, SD: rt.sandbox.window.StoryData, el: (id) => rt.sandbox.document.getElementById(id) };
  }
  const doc = text('docs/../js/story-data.js');
  const fresh = boot(memoryStorage());
  const r = fresh.GS.loadGame();
  assert.strictEqual(r.isNew, true);
  assert.strictEqual(fresh.GS.state.openingSeen, false, '全新存档待播');
  const screens = fresh.SD.opening.screens;
  assert.deepStrictEqual(plain(screens.map((x) => x.id)), ['open_1', 'open_2', 'open_3', 'open_4', 'open_5']);
  assert.ok(screens[0].text.startsWith('你在乱坟边醒来') && screens[4].text.includes('先活过搬血再说'));
  screens.forEach((x) => assert.ok(x.text.length <= 60, '每屏 ≤ 60 字'));
  assert.ok(doc.includes('开篇与新手引导.md'), '注明来源');
  // 播放：5 屏旁白，无立绘；跳过即记为已看并回调
  let logged = 0;
  assert.strictEqual(fresh.ST.playOpening(() => { logged += 1; }), true);
  assert.strictEqual(fresh.GS.state.openingSeen, true, '一开播即记已看');
  const modal = fresh.el('story-modal');
  assert.ok(modal.classList.contains('active') && modal.classList.contains('is-opening'));
  assert.strictEqual(fresh.el('story-text').textContent, screens[0].text);
  fresh.el('btn-story-skip').click();
  assert.strictEqual(logged, 1, '跳过后才写开局日志');
  assert.ok(!modal.classList.contains('active') && !modal.classList.contains('is-opening'));
  assert.strictEqual(fresh.ST.playOpening(), false, '只播一次');
  // 存档往返：已看过的不再播；没看完就关页的新档下次进来仍待播
  const st2 = memoryStorage();
  const n2 = boot(st2);
  n2.GS.loadGame();
  n2.GS.saveGame();
  const n3 = boot(st2);
  n3.GS.loadGame();
  assert.strictEqual(n3.GS.state.openingSeen, false, '新档未看过仍待播');
  // 旧档（无字段）一律视为已看
  const o = boot(memoryStorage({ [SAVE_KEY]: oldSave({ realmIndex: 0 }) }));
  o.GS.loadGame();
  assert.strictEqual(o.GS.state.openingSeen, true, '旧档不弹');
  assert.strictEqual(o.ST.playOpening(), false);
  // 轮回后也不再播
  fresh.GS.state.realmIndex = 27;
  fresh.GS.performReincarnation();
  assert.strictEqual(fresh.GS.state.openingSeen, true);
  // 与 P1-1 不冲突：开篇还没播时打第 1 关，先开篇再第 1 章开头，同一弹窗连播
  const c = boot(memoryStorage());
  c.GS.loadGame();
  let resumed = 0;
  assert.strictEqual(c.ST.beforeBattle(1, () => { resumed += 1; }), true);
  assert.ok(c.el('story-modal').classList.contains('is-opening'), '先开篇');
  for (let i = 0; i < 5; i += 1) c.el('btn-story-next').click();
  assert.ok(!c.el('story-modal').classList.contains('is-opening'), '接着章节剧情');
  assert.ok(c.el('story-modal').classList.contains('active'));
  assert.strictEqual(resumed, 0);
  c.el('btn-story-skip').click();
  assert.strictEqual(resumed, 1, '播完才开战');
  assert.ok(c.GS.state.storySeen['c1:intro'] && c.GS.state.openingSeen === true);
  // 接线
  const game = text('js/game.js');
  assert.ok(game.includes('window.Story.playOpening(firstLog)'), '新档：开篇后写开局日志');
  assert.ok(text('css/style.css').includes('.story-modal.is-opening .story-portraits'));
}

module.exports = { loadRuntime, memoryStorage, text };
if (require.main === module)

// ---------- batch4：当前目标纳入下一座锁定建筑；战败战力差 >15% 给出跳转 ----------
{
  const { GS, NB } = loadRuntime();
  GS.loadGame();
  const s = GS.state;
  s.peachesPicked = 30;
  s.gongfa[Object.keys(s.gongfa)[0]] = 2;
  s.realmIndex = 3;
  s.stage.best = 10;
  assert.strictEqual(NB.currentGoal(s).text, '突破至洞天中', '未到解锁重时主目标仍是下一重突破');
  assert.strictEqual(NB.currentGoal(s).buildingHint, '还差3重解锁百草灵药园');

  function qiProg(state) {
    const st = GS.getCurrentStage();
    const pct = Math.min(100, Math.floor(((state.qi || 0) / Math.max(1, st.reqQi)) * 100));
    return `灵气 ${pct}%`;
  }

  s.realmIndex = 8;
  s.stage.best = 30;
  assert.strictEqual(NB.currentGoal(s).text, '突破至铭纹初');
  assert.strictEqual(NB.currentGoal(s).tab, 'tab-cultivate');
  assert.strictEqual(NB.currentGoal(s).buildingHint, '还差7重解锁地底极品灵脉');
  assert.strictEqual(NB.goalProgress(NB.currentGoal(s), s, GS.getCurrentStage()), `${qiProg(s)} · 还差7重解锁地底极品灵脉`);
  assert.ok(NB.goalProgress(NB.currentGoal(s), s, GS.getCurrentStage()).startsWith('灵气 '), '建筑提示不得盖掉灵气百分比');

  s.realmIndex = 12;
  assert.strictEqual(NB.nextLockedBuilding(s).id, 'lingmai');
  assert.strictEqual(NB.buildingUnlockHint(s), '还差3重解锁地底极品灵脉');
  assert.strictEqual(NB.currentGoal(s).buildingHint, '还差3重解锁地底极品灵脉');
  assert.strictEqual(NB.goalProgress(NB.currentGoal(s), s, GS.getCurrentStage()), `${qiProg(s)} · 还差3重解锁地底极品灵脉`);

  s.realmIndex = 14;
  const g = NB.currentGoal(s);
  assert.ok(/^突破至/.test(g.text), '下一重恰好解锁建筑时主目标仍是突破');
  assert.strictEqual(g.tab, 'tab-cultivate', '应指向修行突破而不是洞府');
  assert.strictEqual(g.realm, 15);
  assert.strictEqual(g.buildingHint, '还差1重解锁地底极品灵脉');
  const prog = NB.goalProgress(g, s, GS.getCurrentStage());
  assert.ok(prog.startsWith('灵气 ') && prog.includes('还差1重解锁地底极品灵脉'), `进度应保留灵气百分比并附建筑提示，实际：${prog}`);
  s.realmIndex = 15;
  assert.ok(NB.nextLockedBuilding(s).id !== 'lingmai');

  assert.strictEqual(NB.enemyExceedsTeam(100, 115), false);
  assert.strictEqual(NB.enemyExceedsTeam(100, 116), true);
  assert.strictEqual(NB.enemyExceedsTeam(0, 100), false);
  assert.strictEqual(NB.recGapExceeds(100, 115), false, '相对推荐战力 15/115≈13%，不超过 15%');
  assert.strictEqual(NB.recGapExceeds(100, 118), true, '18/118≈15.3%，应出跳转按钮');
  assert.strictEqual(NB.recGapExceeds(562, 871), true, '与标题「还差约 35%」同一口径应出按钮');
  assert.strictEqual(NB.recGapExceeds(100, 100), false);
  assert.strictEqual(NB.powerJumpTab({ realmIndex: 0, qi: 1e15 }), 'tab-cultivate');
  assert.strictEqual(NB.powerJumpTab({ realmIndex: 0, qi: 0 }), 'tab-upgrades');

  const html = text('index.html');
  assert.ok(html.includes('id="btn-goto-power"') && html.includes('先回洞府/突破'));
  const ui = text('js/stage-ui.js');
  assert.ok(ui.includes('recGapExceeds') && ui.includes('btn-goto-power') && ui.includes('powerJumpTab'));
  assert.ok(!/btn-goto-power[\s\S]{0,400}enemyExceedsTeam/.test(ui), '跳转按钮不再按敌方战力口径');
  const css = text('css/style.css');
  const bossCss = css.slice(css.indexOf('.story-boss img'), css.indexOf('.story-modal[data-who="boss"]'));
  assert.ok(!bossCss.includes('brightness(0)'), '剧情剪影不得再用 brightness(0) 把不透明立绘涂成黑块');
  assert.ok(/mask-image:\s*radial-gradient/.test(bossCss), '剪影改用径向 mask 渐隐');
  const toast = css.slice(css.indexOf('.title-toast {'), css.indexOf('.title-toast.show'));
  assert.ok(/top:\s*max\(8px/.test(toast), '称号吐司挪到顶部，避免挡住目标条');
  assert.ok(text('js/titles.js').includes('modalOpen'), '有弹窗打开时延后显示称号吐司');
}

console.log('newbie-ux.test.js ok');
