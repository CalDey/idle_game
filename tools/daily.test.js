// 每日功课与七日签到：本地日界重置、进度钩子、宝箱/签到只领一次、累计签到、旧档迁移。
// 用法：node tools/daily.test.js
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

function loadRuntime(storage) {
  const sandbox = {
    window: {},
    console,
    localStorage: storage || memoryStorage(),
    document: { readyState: 'loading', addEventListener() {}, getElementById() { return null; } }
  };
  sandbox.globalThis = sandbox.window;
  sandbox.window.document = sandbox.document;
  ['js/config.js', 'js/equip.js', 'js/battle.js', 'js/state.js', 'js/daily.js'].forEach((rel) => {
    vm.runInNewContext(text(rel), sandbox, { filename: rel });
  });
  return { W: sandbox.window, GS: sandbox.window.GameState, Daily: sandbox.window.Daily, CFG: sandbox.window.GameConfig, storage: sandbox.localStorage };
}

function atLocal(y, m, d, hh, mm, ss) {
  return new Date(y, m - 1, d, hh || 0, mm || 0, ss || 0, 0).getTime();
}

function host(v) {
  return JSON.parse(JSON.stringify(v));
}

function same(a, b, msg) {
  assert.deepStrictEqual(host(a), host(b), msg);
}

function freshState(extra) {
  const { GS } = loadRuntime();
  const s = JSON.parse(JSON.stringify(GS.state));
  s.tree = s.tree || { peaches: 0 };
  s.stage = s.stage || { best: 0, cur: 1 };
  return Object.assign(s, extra || {});
}

const env = { qiPerSec: 10, stonePerSec: 2 };

// ---------- 日界重置 ----------
{
  const { Daily } = loadRuntime();
  const s = freshState();
  const t0 = atLocal(2026, 11, 14, 23, 59, 59);
  Daily.ensure(s, t0);
  Daily.note(s, 'breakthrough', 1, t0);
  Daily.note(s, 'home_upgrade', 1, t0);
  const c20 = Daily.claimChest(s, 'c20', env, t0);
  assert.ok(c20.ok, '日界前应能领 20 活跃箱');
  const cin = Daily.claimCheckin(s, env, t0);
  assert.ok(cin.ok && cin.day === 1, '日界前可签到第 1 日');
  const pointsBefore = s.daily.points;
  assert.ok(pointsBefore >= 40, '两件功课应给 40 活跃');
  assert.strictEqual(s.daily.date, '2026-11-14');
  assert.strictEqual(s.daily.chests.c20, true);

  const t1 = atLocal(2026, 11, 15, 0, 0, 0);
  Daily.ensure(s, t1);
  assert.strictEqual(s.daily.date, '2026-11-15', '本地 0 点应切到新的日历日');
  assert.strictEqual(s.daily.points, 0, '新的一天活跃度清零');
  same(s.daily.tasks, {}, '功课进度清零');
  same(s.daily.chests, {}, '宝箱领取记录清零');
  assert.strictEqual(s.daily.checkin.cycleDay, 1, '签到进度在日界后保留');
  assert.strictEqual(s.daily.checkin.last, '2026-11-14');
  assert.strictEqual(s.daily.checkin.total, 1);
  assert.ok(Daily.checkinAvailable(s, t1), '新的一天可再签到');
  assert.ok(!Daily.claimChest(s, 'c20', env, t1).ok, '新一天点数不够不可领箱');
}

{
  const { Daily } = loadRuntime();
  const s = freshState();
  const justBefore = atLocal(2026, 11, 15, 0, 0, 0) - 1;
  Daily.note(s, 'breakthrough', 1, justBefore);
  assert.strictEqual(s.daily.date, Daily.todayKey(justBefore));
  assert.strictEqual(s.daily.tasks.breakthrough, 1);
  Daily.ensure(s, atLocal(2026, 11, 15, 0, 0, 0));
  assert.strictEqual(s.daily.date, '2026-11-15');
  assert.ok(!s.daily.tasks.breakthrough, '跨过 0 点后功课进度应清空');
}

// ---------- 进度钩子 ----------
{
  const { Daily } = loadRuntime();
  const s = freshState({ realmIndex: 5, stage: { best: 20, cur: 21 } });
  const now = atLocal(2026, 11, 15, 10, 0, 0);

  const r1 = Daily.note(s, 'stage_clear', 1, now);
  assert.ok(r1.ok && r1.progress === 1 && !r1.completed);
  assert.strictEqual(s.daily.points, 0, '未达目标不加活跃');
  const r2 = Daily.note(s, 'stage_clear', 1, now);
  assert.ok(r2.ok && r2.completed);
  assert.strictEqual(s.daily.points, 20, '达成目标一次加分');
  const r3 = Daily.note(s, 'stage_clear', 1, now);
  assert.ok(!r3.ok && r3.reason === 'already_done');
  assert.strictEqual(s.daily.tasks.stage_clear, 2);
  assert.strictEqual(s.daily.points, 20, '超额不再加分');

  const locked = freshState({ realmIndex: 0, stage: { best: 0, cur: 1 } });
  const bad = Daily.note(locked, 'stage_clear', 1, now);
  assert.ok(!bad.ok && bad.reason === 'locked', '未开启闯关的角色不能记闯关功课');
  const peachLocked = Daily.note(locked, 'peach_pick', 1, now);
  assert.ok(!peachLocked.ok && peachLocked.reason === 'locked');
  const mijingLocked = Daily.note(locked, 'mijing_run', 1, now);
  assert.ok(!mijingLocked.ok && mijingLocked.reason === 'locked');

  assert.ok(Daily.note(s, 'peach_pick', 1, now).ok);
  assert.ok(Daily.note(s, 'mijing_run', 1, now).ok);
  assert.ok(Daily.note(s, 'event_choice', 1, now).ok);
  assert.ok(Daily.note(s, 'breakthrough', 1, now).ok);
  assert.ok(Daily.note(s, 'home_upgrade', 1, now).ok);
  assert.strictEqual(s.daily.points, 120, '六项功课合计 120 活跃');

  const { GS } = loadRuntime();
  GS.state.realmIndex = 3;
  GS.state.stones = 10000;
  const beforePts = (Daily.ensure(GS.state, now).points) || 0;
  const bought = GS.buyDongfu('dongtian_fudi', 1) || GS.buyDongfu(Object.keys(GS.state.dongfu)[0], 1);
  // 若默认第一座洞府买得动，应已记 hook
  if (bought > 0) {
    assert.ok((GS.state.daily.tasks.home_upgrade || 0) >= 1, 'buyDongfu 应记参悟扩建功课');
    assert.ok(GS.state.daily.points >= beforePts + 20 || GS.state.daily.points >= 20);
  }
  Daily.ensure(GS.state, now);
  const prevBreak = GS.state.daily.tasks.breakthrough || 0;
  GS.applyBreakthroughAttempt(0);
  assert.strictEqual(GS.state.daily.tasks.breakthrough, Math.min(1, prevBreak + 1), '突破结算应记尝试突破功课');
}

// ---------- 领取一次 ----------
{
  const { Daily } = loadRuntime();
  const s = freshState({ realmIndex: 5, stage: { best: 20, cur: 21 }, daoGuo: 7, totalDaoGuo: 11, lingyu: 0, qi: 0, stones: 0, tree: { peaches: 0 } });
  const now = atLocal(2026, 11, 15, 12, 0, 0);
  Daily.TASKS.forEach((t) => Daily.note(s, t.id, t.target, now));
  assert.ok(s.daily.points >= 100);

  const first = Daily.claimChest(s, 'c100', env, now);
  assert.ok(first.ok, '达到 100 活跃应能领终箱');
  assert.ok(first.reward, '终箱应有奖励');
  assert.ok(!first.reward.daoguo, '功课宝箱不得发放道果');
  const dao1 = s.daoGuo;
  const total1 = s.totalDaoGuo;
  const qi1 = s.qi;
  const peach1 = s.tree.peaches;
  const again = Daily.claimChest(s, 'c100', env, now);
  assert.ok(!again.ok && again.reason === 'already_claimed');
  assert.strictEqual(s.daoGuo, dao1);
  assert.strictEqual(s.totalDaoGuo, total1);
  assert.strictEqual(s.qi, qi1, '重复领取不得再发灵气');
  assert.strictEqual(s.tree.peaches, peach1);

  const mid = Daily.claimChest(s, 'c40', env, now);
  assert.ok(mid.ok);
  assert.ok(!Daily.claimChest(s, 'c40', env, now).ok);

  const ck1 = Daily.claimCheckin(s, env, now);
  assert.ok(ck1.ok && ck1.day === 1);
  assert.ok(!ck1.reward.daoguo, '签到不得发放道果');
  const dao2 = s.daoGuo;
  const ck2 = Daily.claimCheckin(s, env, now);
  assert.ok(!ck2.ok && ck2.reason === 'already_claimed');
  assert.strictEqual(s.daoGuo, dao2);
  assert.strictEqual(s.totalDaoGuo, 11, '签到与宝箱都不得抬高累计道果');
}

// ---------- 累计签到（漏签不重置） ----------
{
  const { Daily } = loadRuntime();
  const s = freshState({ stage: { best: 0, cur: 1 }, tree: { peaches: 0 }, lingyu: 0, qi: 0, stones: 0 });
  const d1 = atLocal(2026, 11, 1, 8, 0, 0);
  const a = Daily.claimCheckin(s, env, d1);
  assert.strictEqual(a.day, 1);
  // 漏掉 11-02
  const d3 = atLocal(2026, 11, 3, 8, 0, 0);
  const b = Daily.claimCheckin(s, env, d3);
  assert.strictEqual(b.day, 2, '漏签后下一次应领第 2 日，而不是退回第 1 日');
  assert.strictEqual(s.daily.checkin.cycleDay, 2);
  assert.strictEqual(s.daily.checkin.total, 2);

  // 连续领到第 7 日（11-04 ... 11-08）
  for (let i = 3; i <= 7; i++) {
    const t = atLocal(2026, 11, 1 + i, 8, 0, 0); // 11-04 for i=3 ... 11-08 for i=7
    const r = Daily.claimCheckin(s, env, t);
    assert.strictEqual(r.day, i, `应领第 ${i} 日`);
    if (i === 7) {
      assert.ok(r.notable, '第 7 日应为较丰厚但不破局的奖励');
      assert.ok((r.reward.peach || 0) >= 1, '第 7 日应有仙桃');
      assert.ok((r.reward.peach || 0) <= Daily.DAY7_PEACH_CAP, '第 7 日仙桃须封顶');
      assert.ok(!r.reward.daoguo, '第 7 日不得发道果');
    }
  }
  assert.strictEqual(s.daily.checkin.cycleDay, 7);

  // 再隔一天，开启新一轮第 1 日
  const nextCycle = atLocal(2026, 11, 10, 8, 0, 0);
  const again = Daily.claimCheckin(s, env, nextCycle);
  assert.strictEqual(again.day, 1, '满 7 日后下一轮从第 1 日重新开始');
  assert.strictEqual(s.daily.checkin.cycleDay, 1);
  assert.strictEqual(s.daily.checkin.total, 8);

  // 奖励封顶：低产出时灵玉至少能发（若文档值 >0），高产出时不超过 cap
  const rich = freshState({ stage: { best: 200, cur: 201 } });
  const fatEnv = { qiPerSec: 1e6, stonePerSec: 1e6 };
  Daily.ensure(rich, d1);
  // 连签到第 7 日
  for (let i = 0; i < 7; i++) {
    const t = atLocal(2026, 11, 1 + i, 9, 0, 0);
    const r = Daily.claimCheckin(rich, fatEnv, t);
    if (i === 6) {
      const capMin = Daily.DAY7_QI_STONE_CAP_MINUTES;
      assert.ok(r.reward.qi <= Math.round(1e6 * 60 * capMin), '第 7 日灵气按分钟封顶');
      assert.ok(r.reward.stone <= Math.round(1e6 * 60 * capMin), '第 7 日灵石按分钟封顶');
      assert.ok(r.reward.jade <= Daily.jadeCapFor(rich, Daily.DAY7_JADE_CAP_HOURS), '第 7 日灵玉按 1 小时挂机产出封顶');
      assert.ok(r.reward.peach <= Daily.DAY7_PEACH_CAP);
    }
  }
}

// ---------- 旧档迁移 ----------
{
  const raw = {
    version: 3,
    heroId: 'lanyi',
    realmIndex: 2,
    qi: 100,
    stones: 50,
    lingyu: 3,
    daoGuo: 0,
    totalDaoGuo: 0,
    gongfa: {},
    dongfu: {},
    talents: {},
    flags: {},
    lastSaveTime: atLocal(2026, 11, 15, 10, 0, 0)
  };
  const storage = memoryStorage();
  const first = loadRuntime(storage);
  storage.setItem(first.GS.SAVE_KEY, JSON.stringify(raw));
  const { GS, Daily } = loadRuntime(storage);
  const loaded = GS.loadGame();
  assert.ok(loaded, '缺 daily 字段的旧档应能读入');
  assert.ok(GS.state.daily, '读档后应补上 daily');
  const d = Daily.ensure(GS.state, atLocal(2026, 11, 15, 10, 0, 0));
  assert.strictEqual(d.points, 0);
  same(d.tasks, {});
  same(d.chests, {});
  assert.strictEqual(d.checkin.cycleDay, 0);
  assert.strictEqual(d.checkin.last, '');
  assert.ok(Daily.claimCheckin(GS.state, env, atLocal(2026, 11, 15, 10, 0, 0)).ok, '迁移后应能正常签到');

  const junk = freshState();
  junk.daily = { points: 'abc', tasks: null, chests: 1, checkin: 'bad', date: 20261115, streak: 99 };
  const fixed = Daily.ensure(junk, atLocal(2026, 11, 15, 11, 0, 0));
  assert.strictEqual(fixed.points, 0);
  same(fixed.tasks, {});
  same(fixed.chests, {});
  assert.strictEqual(typeof fixed.checkin, 'object');
  assert.strictEqual(fixed.checkin.cycleDay, 0);
  assert.ok(!('streak' in fixed.checkin), '旧的连续签到字段不得当作累计进度');
  assert.strictEqual(fixed.date, '2026-11-15');
}

// 派遣未进主线，任务表不应出现派遣
{
  const { Daily } = loadRuntime();
  assert.ok(!Daily.TASKS.some((t) => /dispatch|派遣/.test(t.id + t.name)));
  assert.ok(Daily.TASKS.length >= 4 && Daily.TASKS.length <= 6, '功课数量应在 4–6 项');
  const totalPts = Daily.TASKS.reduce((n, t) => n + t.points, 0);
  assert.ok(totalPts >= 100, '全部完成应能开满活跃箱');
  assert.ok(totalPts > 100, '总活跃略高于 100，允许跳过部分功课仍能拿满箱');
}

console.log('daily.test.js: ok');
