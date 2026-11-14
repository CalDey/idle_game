// 挂机随机事件（机缘）：境界资格、资源不足禁用、先扣后发、折算上限、冷却、存档迁移。
// 用法：node tools/idle-events.test.js
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
  const sandbox = { window: {}, console, localStorage: storage || memoryStorage() };
  sandbox.globalThis = sandbox.window;
  ['js/config.js', 'js/equip.js', 'js/battle.js', 'js/state.js', 'js/events-data.js', 'js/idle-events.js'].forEach((rel) => {
    vm.runInNewContext(text(rel), sandbox, { filename: rel });
  });
  return { W: sandbox.window, GS: sandbox.window.GameState, IE: sandbox.window.IdleEvents, CFG: sandbox.window.GameConfig };
}

const { W, GS, IE, CFG } = loadRuntime();
const R = IE.RULES;
const events = IE.allEvents();
const fixedRng = (v) => () => v;
const host = (v) => JSON.parse(JSON.stringify(v));

// ---------- 数据完整性 ----------
assert.strictEqual(events.length, 24, '应有 24 个事件');
assert.strictEqual(new Set(events.map((e) => e.id)).size, 24, '事件 id 唯一');
const ALLOWED = new Set(['qi', 'stone', 'jade', 'peach', 'daoguo', 'equip']);
events.forEach((e) => {
  const pools = Array.isArray(e.pool) ? e.pool : [e.pool];
  assert.ok(pools.includes('idle'), `${e.id} 应仍属于挂机池`);
  assert.ok(Array.isArray(e.tags) && e.tags.length > 0);
  assert.ok(e.minRealmStage >= 0 && e.minRealmStage < CFG.REALM_STAGES.length, `${e.id} minRealmStage 越界`);
  assert.ok(e.name && e.text);
  assert.ok(e.options.length >= 2 && e.options.length <= 3, `${e.id} 选项数`);
  e.options.forEach((o) => {
    assert.ok(o.label && o.resultText);
    ['cost', 'reward'].forEach((k) => {
      Object.keys(o[k]).forEach((res) => assert.ok(ALLOWED.has(res), `${e.id} 出现未知资源 ${res}`));
    });
    if (o.reward.equip) assert.ok(CFG.QUALITIES.some((q) => q.id === o.reward.equip.quality), `${e.id} 装备品阶不存在`);
    if (o.reward.daoguo || o.cost.daoguo) assert.ok(e.minRealmStage >= CFG.REINCARNATION_MIN_STAGE, `${e.id} 道果早于天神初`);
  });
});

// ---------- 境界资格 ----------
function fresh(extra) {
  const s = JSON.parse(JSON.stringify(GS.state));
  return Object.assign(s, extra || {});
}
[0, 1, 5, 6, 14, 15, 27, 39, 41].forEach((realm) => {
  const s = fresh({ realmIndex: realm });
  const ids = host(IE.eligibleEvents(s, 'idle').map((e) => e.id));
  const expected = host(events.filter((e) => realm >= e.minRealmStage).map((e) => e.id));
  assert.deepStrictEqual(ids, expected, `realm ${realm} 可抽事件不对`);
  assert.ok(ids.length > 0);
});
assert.deepStrictEqual(host(IE.eligibleEvents(fresh({ realmIndex: 0 }), 'idle').map((e) => e.id).sort()), ['evt_blood_debt', 'evt_village_ash']);
assert.ok(IE.eligibleEvents(fresh({ realmIndex: 41 }), 'home').length > 0, '洞府机缘可复用已标记的事件');
assert.ok(IE.eligibleEvents(fresh({ realmIndex: 41 }), 'idle').length === events.length, '挂机池仍含全部 24 条');
for (let i = 0; i < 200; i++) {
  const s = fresh({ realmIndex: 7 });
  const e = IE.drawEvent(s, 'idle', Math.random);
  assert.ok(e.minRealmStage <= 7);
}

// ---------- 冷却与生成 ----------
{
  const s = fresh({ realmIndex: 10, playTimeMs: 0 });
  delete s.idleEvents;
  const st = IE.ensureState(s);
  assert.strictEqual(st.pending, null);
  assert.strictEqual(st.nextAt, R.COOLDOWN_MIN_MS, '新档首个事件在 10 分钟游戏时长后');
  assert.strictEqual(IE.maybeSpawn(s, { rng: fixedRng(0) }), null, '冷却中不生成');
  s.playTimeMs = R.COOLDOWN_MIN_MS;
  const e1 = IE.maybeSpawn(s, { rng: fixedRng(0), now: 1 });
  assert.ok(e1, '冷却结束生成');
  assert.strictEqual(s.idleEvents.pending.id, e1.id);
  s.playTimeMs += 10 * 3600 * 1000; // 模拟离线很久
  assert.strictEqual(IE.maybeSpawn(s, { rng: fixedRng(0) }), null, '已有待处理事件时不再生成（最多 1 个）');
  // 冷却范围 10–20 分钟
  assert.strictEqual(IE.randomCooldown(fixedRng(0)), R.COOLDOWN_MIN_MS);
  assert.strictEqual(IE.randomCooldown(fixedRng(1)), R.COOLDOWN_MAX_MS);
  for (let i = 0; i < 100; i++) {
    const c = IE.randomCooldown(Math.random);
    assert.ok(c >= 10 * 60000 && c <= 20 * 60000);
  }
  // 结算后冷却从当前游戏时长起算
  const idx = e1.options.findIndex((o) => Object.keys(o.cost).length === 0);
  const res = IE.settle(s, idx, { qiPerSec: 10, stonePerSec: 5, now: 1 }, { rng: fixedRng(0.5) });
  assert.ok(res.ok);
  assert.strictEqual(s.idleEvents.pending, null);
  assert.strictEqual(s.idleEvents.nextAt, s.playTimeMs + 15 * 60000);
  assert.strictEqual(IE.maybeSpawn(s, { rng: fixedRng(0) }), null, '刚结算处于冷却');
  assert.ok(s.idleEvents.recent.includes(e1.id));
  s.playTimeMs += 15 * 60000;
  const e2 = IE.maybeSpawn(s, { rng: fixedRng(0) });
  assert.ok(e2 && e2.id !== e1.id, '近期出现过的事件优先回避');
}

// ---------- 折算与上限 ----------
const ENV = { qiPerSec: 1000, stonePerSec: 100, now: Date.UTC(2026, 10, 15, 4) };
events.forEach((e) => {
  e.options.forEach((o) => {
    const s = fresh({ realmIndex: 41, qi: 1e15, stones: 1e15, lingyu: 1e9, daoGuo: 99 });
    s.tree.peaches = 999;
    s.stage.best = 100;
    const q = IE.scaleQuote(s, e, o, ENV);
    if (q.reward.qi) assert.ok(q.reward.qi >= 1 && q.reward.qi <= ENV.qiPerSec * 60 * R.REWARD_CAP_MINUTES, `${e.id} 灵气奖励超上限`);
    if (q.reward.stone) assert.ok(q.reward.stone >= 1 && q.reward.stone <= ENV.stonePerSec * 60 * R.REWARD_CAP_MINUTES, `${e.id} 灵石奖励超上限`);
    if (q.cost.qi) assert.ok(q.cost.qi <= ENV.qiPerSec * 60 * R.COST_CAP_MINUTES);
    if (q.cost.stone) assert.ok(q.cost.stone <= ENV.stonePerSec * 60 * R.COST_CAP_MINUTES);
    if (q.reward.peach) assert.ok(q.reward.peach <= R.PEACH_REWARD_CAP && q.reward.peach <= o.reward.peach);
    if (q.reward.jade) assert.ok(q.reward.jade <= o.reward.jade && q.reward.jade <= Math.max(R.JADE_CAP_MIN, Math.ceil((6 + 0.4 * 100) * R.JADE_CAP_HOURS)));
    if (q.reward.daoguo) assert.strictEqual(q.reward.daoguo, 1);
    // 文档有的键折算后也存在（道果在每日上限内）
    ['qi', 'stone', 'jade', 'peach', 'daoguo'].forEach((k) => {
      if (o.reward[k]) assert.ok(q.reward[k] > 0, `${e.id} 缺奖励 ${k}`);
      if (o.cost[k]) assert.ok(q.cost[k] > 0, `${e.id} 缺代价 ${k}`);
    });
  });
});
{
  // 示例：血债讨还「吸走他的精血」 文档 灵气120（段中位数260）→ 3×120/260≈1.385 分钟
  const e = IE.findEvent('evt_blood_debt');
  const q = IE.scaleQuote(fresh(), e, e.options[0], { qiPerSec: 10, stonePerSec: 2 });
  assert.strictEqual(IE.tierRefs().qi[0], 260);
  assert.strictEqual(IE.tierRefs().stone[0], 25);
  assert.strictEqual(q.reward.qi, Math.round(10 * 60 * (3 * 120) / 260));
  assert.strictEqual(q.reward.stone, Math.round(2 * 60 * (3 * 15) / 25));
  // 产出翻倍，折算翻倍（与当前产出成比例）
  const q2 = IE.scaleQuote(fresh(), e, e.options[0], { qiPerSec: 20, stonePerSec: 4 });
  assert.ok(Math.abs(q2.reward.qi - 2 * q.reward.qi) <= 1);
  // 上限：洞天漏风「反吞神精」灵气 1200 → 13.8 分钟，封顶 8 分钟
  const leak = IE.findEvent('evt_dongtian_leak');
  const q3 = IE.scaleQuote(fresh(), leak, leak.options[2], { qiPerSec: 10, stonePerSec: 1 });
  assert.strictEqual(q3.reward.qi, 10 * 60 * R.REWARD_CAP_MINUTES);
  // 零产出时仍至少 1
  const q4 = IE.scaleQuote(fresh(), e, e.options[0], { qiPerSec: 0, stonePerSec: 0 });
  assert.strictEqual(q4.reward.qi, 1);
}

// ---------- 资源不足禁用 / 先扣后发 ----------
{
  const s = fresh({ realmIndex: 3, qi: 0, stones: 0, playTimeMs: 0 });
  s.idleEvents = { pending: { id: 'evt_dongtian_leak', pool: 'idle', at: 1 }, nextAt: 0 };
  const e = IE.findEvent('evt_dongtian_leak');
  const env = { qiPerSec: 10, stonePerSec: 2, now: 1 };
  const q = IE.scaleQuote(s, e, e.options[1], env); // 代价灵气 400 → 3×400/260 分钟
  assert.strictEqual(q.affordable, false);
  assert.deepStrictEqual(host(q.lacking), ['灵气']);
  const bad = IE.settle(s, 1, env, {});
  assert.strictEqual(bad.ok, false);
  assert.strictEqual(bad.reason, 'insufficient');
  assert.strictEqual(s.qi, 0, '不足时不扣除');
  assert.strictEqual(s.stones, 0, '不足时不发放');
  assert.ok(s.idleEvents.pending, '不足时事件保留');
  // 刚好够：先扣后发
  s.qi = q.cost.qi;
  const ok = IE.settle(s, 1, env, { rng: fixedRng(0) });
  assert.ok(ok.ok);
  assert.strictEqual(s.qi, 0, '灵气先扣到 0');
  assert.strictEqual(s.stones, q.reward.stone, '再发放灵石');
  assert.strictEqual(s.idleEvents.pending, null);
  assert.strictEqual(IE.settle(s, 0, env, {}).reason, 'no_pending');
}
{
  // 同一选项 cost 与 reward 都有灵气：借火过夜「炼化这团火」先扣 qi 后加 qi
  const s = fresh({ realmIndex: 18 });
  const e = IE.findEvent('evt_borrow_fire');
  const env = { qiPerSec: 100, stonePerSec: 10, now: 1 };
  const q = IE.scaleQuote(s, e, e.options[2], env);
  s.qi = q.cost.qi;
  s.idleEvents = { pending: { id: e.id }, nextAt: 0 };
  const res = IE.settle(s, 2, env, {});
  assert.ok(res.ok);
  assert.strictEqual(s.qi, q.reward.qi, '刚好够时先扣到 0 再加奖励');
}
{
  // 仙桃代价 / 道果代价
  const s = fresh({ realmIndex: 30, daoGuo: 0 });
  const e = IE.findEvent('evt_xudao_name');
  const q = IE.scaleQuote(s, e, e.options[1], ENV);
  assert.strictEqual(q.cost.daoguo, 1);
  assert.strictEqual(q.affordable, false);
  s.daoGuo = 1;
  s.idleEvents = { pending: { id: e.id }, nextAt: 0 };
  const lingyuBefore = s.lingyu || 0;
  assert.ok(IE.settle(s, 1, ENV, {}).ok);
  assert.strictEqual(s.daoGuo, 0);
  assert.ok(s.lingyu > lingyuBefore);
  const s2 = fresh({ realmIndex: 6 });
  s2.tree.peaches = 0;
  const beg = IE.findEvent('evt_canling_beg');
  assert.strictEqual(IE.scaleQuote(s2, beg, beg.options[1], ENV).affordable, false);
  s2.tree.peaches = 1;
  s2.idleEvents = { pending: { id: beg.id }, nextAt: 0 };
  assert.ok(IE.settle(s2, 1, ENV, {}).ok);
  assert.strictEqual(s2.tree.peaches, 0);
}
{
  // 道果每日上限 2，且只进可用道果，不计入累计
  const s = fresh({ realmIndex: 33, daoGuo: 0, totalDaoGuo: 5 });
  const tea = IE.findEvent('evt_reincarnate_tea');
  for (let i = 0; i < 3; i++) {
    s.idleEvents = Object.assign(IE.ensureState(s), { pending: { id: tea.id } });
    const res = IE.settle(s, 0, ENV, {});
    assert.ok(res.ok);
    if (i < 2) assert.strictEqual(res.reward.daoguo, 1);
    else {
      assert.ok(!res.reward.daoguo, '超过每日上限不再给道果');
      assert.ok(res.notes.length > 0);
    }
  }
  assert.strictEqual(s.daoGuo, 2);
  assert.strictEqual(s.totalDaoGuo, 5, '机缘道果不计入累计倍率');
  // 第二天重置
  s.idleEvents.pending = { id: tea.id };
  const next = IE.settle(s, 0, Object.assign({}, ENV, { now: ENV.now + 24 * 3600 * 1000 }), {});
  assert.strictEqual(next.reward.daoguo, 1);
}
{
  // 装备奖励走 hooks（真实界面用 Equip.rollItem 生成地品）
  const s = fresh({ realmIndex: 15 });
  const e = IE.findEvent('evt_jiao_scale');
  s.idleEvents = { pending: { id: e.id }, nextAt: 0 };
  let granted = null;
  const res = IE.settle(s, 0, ENV, {
    makeEquip: (st, q) => ({ id: 1, s: 'weapon', q, lv: 1, m: 1, sub: [] }),
    grantEquip: (st, item) => { granted = item; return 'ok'; }
  });
  assert.ok(res.ok);
  assert.strictEqual(granted.q, CFG.QUALITIES.findIndex((q) => q.id === 'di'));
  // 用真实 Equip.rollItem 按界面同样的临时保底方式生成，结果必为地品
  for (let i = 0; i < 50; i++) {
    const st = fresh({ realmIndex: 15 });
    const tmp = Object.assign({}, st, { tree: Object.assign({}, st.tree, { lv: 1 }), pity: { di: 50, tian: 0 } });
    const item = W.Equip.rollItem(tmp);
    assert.strictEqual(item.q, 3);
    assert.strictEqual(item.sub.length, CFG.QUALITIES[3].subs);
  }
}

// ---------- 存档迁移 ----------
{
  // 旧档（无 idleEvents）正常读取，默认值安全
  const storage = memoryStorage();
  const rt = loadRuntime(storage);
  rt.GS.loadGame();
  const old = JSON.parse(JSON.stringify(rt.GS.state));
  delete old.idleEvents;
  old.realmIndex = 8;
  old.playTimeMs = 3600 * 1000;
  old.lastSaveTime = Date.now();
  storage.setItem('xiuxian_idle_save_v1', JSON.stringify(old));
  const rt2 = loadRuntime(storage);
  const r = rt2.GS.loadGame();
  assert.strictEqual(r.isNew, false);
  const st = rt2.IE.ensureState(rt2.GS.state);
  assert.strictEqual(st.pending, null);
  assert.strictEqual(st.nextAt, rt2.GS.state.playTimeMs + R.COOLDOWN_MIN_MS);
  // 待处理事件随存档保存与读取
  rt2.GS.state.playTimeMs = st.nextAt;
  const spawned = rt2.IE.maybeSpawn(rt2.GS.state, { rng: fixedRng(0) });
  assert.ok(spawned);
  rt2.GS.saveGame();
  const rt3 = loadRuntime(storage);
  rt3.GS.loadGame();
  assert.strictEqual(rt3.IE.ensureState(rt3.GS.state).pending.id, spawned.id);
  // 损坏字段被修复
  ['bad', 42, [], { pending: { id: 'evt_not_exist' }, nextAt: 'x', recent: 'y', dgDay: 5 }, { nextAt: 1e18 }].forEach((bad) => {
    const s = fresh({ playTimeMs: 1000 });
    s.idleEvents = bad;
    const fixed = IE.ensureState(s);
    assert.strictEqual(fixed.pending, null);
    assert.ok(Number.isFinite(fixed.nextAt) && fixed.nextAt <= 1000 + R.COOLDOWN_MAX_MS);
    assert.ok(Array.isArray(fixed.recent));
    assert.strictEqual(typeof fixed.dgDay.n, 'number');
  });
  // 离线回来：游戏时长跨过多个冷却也只会有 1 个待处理事件
  const old2 = JSON.parse(JSON.stringify(rt3.GS.state));
  old2.idleEvents = { pending: null, nextAt: old2.playTimeMs + 60000 };
  old2.lastSaveTime = Date.now() - 8 * 3600 * 1000;
  storage.setItem('xiuxian_idle_save_v1', JSON.stringify(old2));
  const rt4 = loadRuntime(storage);
  const r4 = rt4.GS.loadGame();
  assert.ok(r4.offlineReport && r4.offlineReport.effectiveSeconds > 3600);
  assert.ok(rt4.IE.maybeSpawn(rt4.GS.state, { rng: fixedRng(0) }));
  for (let i = 0; i < 5; i++) assert.strictEqual(rt4.IE.maybeSpawn(rt4.GS.state, { rng: fixedRng(0) }), null);
}

// ---------- 轮回保留挂机机缘进度（冷却、待处理、最近记录、当日道果上限、次数） ----------
{
  const storage = memoryStorage();
  const rt = loadRuntime(storage);
  const s = rt.GS.state;
  const evId = events[0].id;
  const evRecent = events[1].id;
  s.realmIndex = rt.CFG.REINCARNATION_MIN_STAGE || 27;
  s.daoGuo = 10;
  s.totalDaoGuo = 10;
  s.playTimeMs = 12 * 60 * 1000;
  s.idleEvents = {
    v: 1,
    pending: { id: evId, pool: 'idle', at: 123 },
    nextAt: s.playTimeMs + 8 * 60 * 1000,
    recent: [evRecent, evId],
    dgDay: { date: '2026-11-15', n: 2 },
    count: 7
  };
  const before = host(s.idleEvents);
  const rec = rt.GS.performReincarnation();
  assert.ok(rec && rec.ok, '应能轮回以验证挂机机缘保留');
  const after = host(rt.IE.ensureState(rt.GS.state));
  assert.strictEqual(after.pending && after.pending.id, before.pending.id, '轮回应保留待处理机缘');
  assert.strictEqual(after.nextAt, before.nextAt, '轮回应保留冷却');
  assert.deepStrictEqual(after.recent, before.recent, '轮回应保留最近记录');
  assert.deepStrictEqual(after.dgDay, before.dgDay, '轮回应保留当日道果上限计数');
  assert.strictEqual(after.count, before.count, '轮回应保留累计次数');
}

// ---------- 页面接线 ----------
const index = text('index.html');
assert.ok(/<script src="js\/events-data\.js\?v=\d+"><\/script>/.test(index));
assert.ok(/<script src="js\/idle-events\.js\?v=\d+"><\/script>/.test(index));
assert.ok(index.indexOf('js/events-data.js') < index.indexOf('js/idle-events.js'));
assert.ok(index.indexOf('js/game.js') < index.indexOf('js/idle-events.js'), 'idle-events 在 game.js 之后初始化');
['btn-idle-event', 'idle-event-modal', 'idle-event-title', 'idle-event-text', 'idle-event-options', 'idle-event-result', 'btn-close-idle-event'].forEach((id) => {
  assert.ok(index.includes(`id="${id}"`), `缺少 #${id}`);
});
assert.ok(/id="btn-idle-event"[^>]*hidden/.test(index), '入口默认隐藏，有事件才亮起（不强制弹窗）');
assert.ok(!/getImageData/.test(text('js/idle-events.js')));

console.log(`idle-events.test.js ok: ${events.length} events`);
