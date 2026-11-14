// 洞府机缘：在线刷新间隔、每日上限、离线补积上限、奖励封顶、旧档迁移；
// 轮回保留当日次数；不发道果；计入已有「机缘抉择」功课且不新增第 7 项。
// 用法：node tools/home.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const text = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const host = (v) => JSON.parse(JSON.stringify(v));

function memoryStorage(initial) {
  const data = Object.assign({}, initial || {});
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    _data: data
  };
}

function atLocal(y, m, d, hh, mm, ss) {
  return new Date(y, m - 1, d, hh || 0, mm || 0, ss || 0, 0).getTime();
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
  [
    'js/config.js',
    'js/equip.js',
    'js/state.js',
    'js/titles.js',
    'js/events-data.js',
    'js/idle-events.js',
    'js/daily.js',
    'js/home-fortune.js'
  ].forEach((rel) => {
    vm.runInNewContext(text(rel), sandbox, { filename: rel });
  });
  return {
    W: sandbox.window,
    GS: sandbox.window.GameState,
    HF: sandbox.window.HomeFortune,
    IE: sandbox.window.IdleEvents,
    Daily: sandbox.window.Daily,
    CFG: sandbox.window.GameConfig,
    storage: sandbox.localStorage
  };
}

const { W, GS, HF, IE, Daily, CFG } = loadRuntime();
const fixedRng = (v) => () => v;

function fresh(extra, now) {
  const s = JSON.parse(JSON.stringify(GS.state));
  Object.assign(s, extra || {});
  HF.ensure(s, now || atLocal(2026, 11, 15, 10, 0, 0));
  return s;
}

const HOME_IDS = [
  'evt_peach_under_tree',
  'evt_dongtian_leak',
  'evt_canling_beg',
  'evt_array_eye',
  'evt_reincarnate_tea',
  'evt_ledger_name'
];

// ---------- 事件池：复用原文，洞府向事件双池，其余回落到挂机池 ----------
{
  const events = IE.allEvents();
  assert.strictEqual(events.length, 24);
  HOME_IDS.forEach((id) => {
    const e = IE.findEvent(id);
    assert.ok(e, id);
    assert.ok(IE.eventPools(e).includes('idle') && IE.eventPools(e).includes('home'), `${id} 应同时属于 idle/home`);
  });
  const onlyIdle = events.filter((e) => !HOME_IDS.includes(e.id));
  onlyIdle.forEach((e) => {
    assert.ok(IE.eventPools(e).includes('idle'));
    assert.ok(!IE.eventPools(e).includes('home'), `${e.id} 不应误标为洞府池`);
  });
  const r0 = host(HF.eligibleList(fresh({ realmIndex: 0 })).map((e) => e.id).sort());
  assert.deepStrictEqual(r0, ['evt_blood_debt', 'evt_village_ash'], '搬血初尚无洞府向事件时应回落到挂机池');
  const r1 = host(HF.eligibleList(fresh({ realmIndex: 1 })).map((e) => e.id).sort());
  assert.deepStrictEqual(r1, ['evt_peach_under_tree']);
  const r3 = host(HF.eligibleList(fresh({ realmIndex: 3 })).map((e) => e.id).sort());
  assert.deepStrictEqual(r3, ['evt_dongtian_leak', 'evt_peach_under_tree']);
  const late = fresh({ realmIndex: 41 });
  assert.ok(HF.eligibleList(late).length >= 6);
}

// ---------- 在线刷新：20–40 分钟，冷却内不刷，待处理时进队列 ----------
{
  const now = atLocal(2026, 11, 15, 10, 0, 0);
  const s = fresh({ realmIndex: 5 }, now);
  s.homeFortune.onlineMs = 0;
  s.homeFortune.nextOnlineAt = HF.SPAWN_MIN_MS;
  assert.strictEqual(HF.maybeSpawnOnline(s, { now, onlineMs: HF.SPAWN_MIN_MS - 1, rng: fixedRng(0) }), null, '未到间隔不刷出');
  const first = HF.maybeSpawnOnline(s, { now, onlineMs: HF.SPAWN_MIN_MS, rng: fixedRng(0) });
  assert.ok(first && first.id, '到达下限应刷出');
  assert.ok(s.homeFortune.pending && s.homeFortune.pending.id === first.id);
  assert.strictEqual(s.homeFortune.spawned, 1);
  assert.ok(s.homeFortune.nextOnlineAt >= s.homeFortune.onlineMs + HF.SPAWN_MIN_MS);
  assert.ok(s.homeFortune.nextOnlineAt <= s.homeFortune.onlineMs + HF.SPAWN_MAX_MS);

  // 再等到间隔：已有 pending 时进入 queued，不覆盖当前机缘
  const nextAt = s.homeFortune.nextOnlineAt;
  const second = HF.maybeSpawnOnline(s, { now, onlineMs: nextAt, rng: fixedRng(0.9) });
  assert.ok(second);
  assert.strictEqual(s.homeFortune.pending.id, first.id, '已有待处理时不覆盖');
  assert.strictEqual(s.homeFortune.queued, 1);
  assert.strictEqual(s.homeFortune.spawned, 2);

  assert.strictEqual(HF.randomCooldown(fixedRng(0)), HF.SPAWN_MIN_MS);
  assert.strictEqual(HF.randomCooldown(fixedRng(1)), HF.SPAWN_MAX_MS);
}

function claimPending(s, now) {
  if (!s.homeFortune || !s.homeFortune.pending) return false;
  const ev = IE.findEvent(s.homeFortune.pending.id);
  if (!ev) return false;
  s.qi = 1e12;
  s.stones = 1e12;
  s.lingyu = 1e12;
  s.tree = s.tree || {};
  s.tree.peaches = 99;
  const env = { qiPerSec: 10, stonePerSec: 2, now };
  for (let i = 0; i < ev.options.length; i++) {
    if (HF.settle(s, i, env, {}).ok) return true;
  }
  return false;
}

// ---------- 每日上限：同一本地日最多 DAILY_CAP 次，跨日次数重置（待处理保留） ----------
{
  const morning = atLocal(2026, 11, 15, 9, 0, 0);
  const s = fresh({ realmIndex: 8 }, morning);
  s.homeFortune.onlineMs = 0;
  s.homeFortune.nextOnlineAt = 0;
  let n = 0;
  for (let i = 0; i < 10; i++) {
    const r = HF.maybeSpawnOnline(s, { now: morning, onlineMs: (i + 1) * HF.SPAWN_MAX_MS, rng: fixedRng(0.2) });
    if (r) n += 1;
    // 领掉待处理，让每日上限有机会用完（同时最多挂 2 条）
    while (s.homeFortune.pending) {
      if (!claimPending(s, morning)) break;
    }
  }
  assert.strictEqual(s.homeFortune.spawned, HF.DAILY_CAP, '领完后当日刷出次数应达上限');
  assert.strictEqual(n, HF.DAILY_CAP);
  const extra = HF.maybeSpawnOnline(s, { now: morning, onlineMs: 20 * HF.SPAWN_MAX_MS, rng: fixedRng(0.2) });
  assert.strictEqual(extra, null, '超过每日上限不再刷出');

  // 另开一份：不领取时最多挂 pending+queued，跨日保留待处理并重置次数
  const sHold = fresh({ realmIndex: 8 }, morning);
  sHold.homeFortune.onlineMs = 0;
  sHold.homeFortune.nextOnlineAt = 0;
  HF.maybeSpawnOnline(sHold, { now: morning, onlineMs: HF.SPAWN_MAX_MS, rng: fixedRng(0.2) });
  const pendingId = sHold.homeFortune.pending && sHold.homeFortune.pending.id;
  assert.ok(pendingId);
  const nextMorning = atLocal(2026, 11, 16, 0, 0, 1);
  HF.ensure(sHold, nextMorning);
  assert.strictEqual(sHold.homeFortune.spawned, 0, '本地日切换后次数应重置');
  assert.strictEqual(sHold.homeFortune.pending && sHold.homeFortune.pending.id, pendingId, '跨日仍保留未处理机缘');
}

// ---------- 离线补积：按间隔累计但有条数上限，且受每日上限约束 ----------
{
  const now = atLocal(2026, 11, 15, 18, 0, 0);
  const s = fresh({ realmIndex: 8 }, now);
  const longMs = 12 * 3600 * 1000;
  const got = HF.accrueOffline(s, longMs, now, fixedRng(0.3));
  assert.ok(got.length <= HF.OFFLINE_ACCRUE_CAP, '离线补积不得超过上限');
  assert.strictEqual(got.length, HF.OFFLINE_ACCRUE_CAP, '长离线应按上限补满');
  assert.ok(HF.waitingCount(s.homeFortune) <= 1 + HF.MAX_QUEUED);
  assert.ok(s.homeFortune.spawned <= HF.DAILY_CAP);

  const s2 = fresh({ realmIndex: 8 }, now);
  const none = HF.accrueOffline(s2, HF.OFFLINE_INTERVAL_MS - 1, now, fixedRng(0));
  assert.strictEqual(none.length, 0, '不足一个离线间隔不补积');

  const s3 = fresh({ realmIndex: 8 }, now);
  s3.homeFortune.spawned = HF.DAILY_CAP;
  const denied = HF.accrueOffline(s3, longMs, now, fixedRng(0));
  assert.strictEqual(denied.length, 0, '已达每日上限时离线不再补积');
}

// ---------- 奖励封顶：按当前产出折算，不发道果，桃/玉/分钟数有上限 ----------
{
  const now = atLocal(2026, 11, 15, 11, 0, 0);
  const env = { qiPerSec: 10, stonePerSec: 2, now };
  const s = fresh({ realmIndex: 30, qi: 0, stones: 0, lingyu: 0, daoGuo: 5, totalDaoGuo: 9 }, now);
  s.tree = s.tree || {};
  s.tree.peaches = 2;
  const tea = IE.findEvent('evt_reincarnate_tea');
  const optDao = (tea.options || []).findIndex((o) => o.reward && o.reward.daoguo);
  assert.ok(optDao >= 0);
  const q = HF.quote(s, tea, tea.options[optDao], env);
  assert.ok(!q.reward.daoguo && !q.cost.daoguo, '洞府机缘报价不得含道果');
  s.homeFortune.pending = { id: 'evt_reincarnate_tea', pool: 'home', at: now };
  const daoBefore = s.daoGuo;
  const totalBefore = s.totalDaoGuo;
  const res = HF.settle(s, optDao, env, {});
  assert.ok(res.ok);
  assert.ok(!res.reward.daoguo, '结算不得发放道果');
  assert.strictEqual(s.daoGuo, daoBefore);
  assert.strictEqual(s.totalDaoGuo, totalBefore);

  const ripe = IE.findEvent('evt_ripe_fruit');
  const optPeach = (ripe.options || []).findIndex((o) => o.reward && (o.reward.peach || 0) > HF.PEACH_CAP);
  assert.ok(optPeach >= 0);
  const q2 = HF.quote(s, ripe, ripe.options[optPeach], env);
  if (q2.reward.peach) assert.ok(q2.reward.peach <= HF.PEACH_CAP);
  if (q2.reward.jade) assert.ok(q2.reward.jade <= HF.JADE_ABS_MAX);
  if (q2.reward.qi) assert.ok(q2.reward.qi <= env.qiPerSec * 60 * HF.REWARD_CAP_MINUTES);
  if (q2.reward.stone) assert.ok(q2.reward.stone <= env.stonePerSec * 60 * HF.REWARD_CAP_MINUTES);

  const idleQ = IE.scaleQuote(s, ripe, ripe.options[optPeach], env);
  if (idleQ.reward.qi && q2.reward.qi) {
    assert.ok(q2.reward.qi <= idleQ.reward.qi, '洞府机缘灵气上限不应宽于挂机事件');
  }
}

// ---------- 结算计入已有「机缘抉择」功课，且不新增第 7 项 ----------
{
  const now = atLocal(2026, 11, 15, 12, 0, 0);
  const s = fresh({ realmIndex: 5, qi: 10000, stones: 10000 }, now);
  Daily.ensure(s, now);
  const before = (s.daily && s.daily.tasks && s.daily.tasks.event_choice) || 0;
  s.homeFortune.pending = { id: 'evt_peach_under_tree', pool: 'home', at: now };
  const ev = IE.findEvent('evt_peach_under_tree');
  const idx = 0;
  const env = { qiPerSec: 10, stonePerSec: 2, now };
  const res = HF.settle(s, idx, env, {});
  assert.ok(res.ok, '应用无代价或可负担选项结算');
  const after = Daily.note ? null : null;
  const snap = Daily.snapshot(s, now);
  const task = snap.tasks.find((t) => t.id === 'event_choice');
  assert.ok(task && task.progress >= 1, '洞府机缘应计入「机缘抉择」');
  assert.ok((s.daily.tasks.event_choice || 0) >= 1);
  assert.strictEqual(Daily.TASKS.length, 6, '不得新增第 7 项每日功课');
  assert.ok(!Daily.TASKS.some((t) => /home_fortune|洞府机缘/.test(t.id + t.name)), '未单独增加洞府机缘功课');
}

// ---------- 轮回保留当日次数与待处理机缘 ----------
{
  const storage = memoryStorage();
  const rt = loadRuntime(storage);
  const now = atLocal(2026, 11, 15, 13, 0, 0);
  const s = rt.GS.state;
  s.lingyu = 30;
  rt.HF.ensure(s, now);
  s.homeFortune.spawned = 3;
  s.homeFortune.pending = { id: 'evt_dongtian_leak', pool: 'home', at: now };
  s.homeFortune.queued = 1;
  s.realmIndex = rt.CFG.REINCARNATION_MIN_STAGE || 27;
  s.daoGuo = 10;
  s.totalDaoGuo = 10;
  const rec = rt.GS.performReincarnation();
  assert.ok(rec && rec.ok, '应能轮回以验证洞府机缘保留');
  assert.strictEqual(rt.GS.state.homeFortune.spawned, 3, '轮回应保留当日次数');
  assert.strictEqual(rt.GS.state.homeFortune.pending && rt.GS.state.homeFortune.pending.id, 'evt_dongtian_leak');
  assert.strictEqual(rt.GS.state.homeFortune.queued, 1);
}

// ---------- 旧档迁移：缺字段可加载，坏数据被修正 ----------
{
  const raw = {
    version: 3,
    heroId: 'lanyi',
    realmIndex: 2,
    qi: 100,
    stones: 50,
    lingyu: 20,
    daoGuo: 0,
    totalDaoGuo: 0,
    gongfa: {},
    dongfu: {},
    talents: {},
    flags: {},
    stage: { best: 5, cur: 6 },
    lastSaveTime: Date.now()
  };
  const storage = memoryStorage();
  const first = loadRuntime(storage);
  storage.setItem(first.GS.SAVE_KEY, JSON.stringify(raw));
  const { GS: GS3, HF: HF3 } = loadRuntime(storage);
  const loaded = GS3.loadGame();
  assert.ok(loaded, '缺 homeFortune 的旧档应能读入');
  const hf = HF3.ensure(GS3.state, Date.now());
  assert.strictEqual(hf.spawned, 0);
  assert.strictEqual(hf.pending, null);
  assert.strictEqual(hf.queued, 0);

  const fixed = HF3.normalize({
    spawned: '9',
    queued: 'no',
    pending: { id: 'not-an-event', at: 1 },
    recent: [1, 'evt_peach_under_tree'],
    onlineMs: -8,
    nextOnlineAt: 'bad',
    lastSeen: 'x'
  });
  assert.strictEqual(fixed.spawned, HF3.DAILY_CAP, '非法 spawned 应夹紧到每日上限');
  assert.strictEqual(fixed.queued, 0);
  assert.strictEqual(fixed.pending, null, '未知事件 pending 应丢弃');
  assert.deepStrictEqual(host(fixed.recent), ['evt_peach_under_tree']);
  assert.strictEqual(fixed.onlineMs, 0);
  assert.ok(fixed.nextOnlineAt >= HF3.SPAWN_MIN_MS);
}

// ---------- UI 节点与脚本顺序；不改已有功课数量 ----------
{
  const index = text('index.html');
  assert.ok(/<script src="js\/home-fortune\.js\?v=\d+"><\/script>/.test(index));
  assert.ok(index.indexOf('js/idle-events.js') < index.indexOf('js/home-fortune.js'));
  assert.ok(index.indexOf('js/daily.js') < index.indexOf('js/home-fortune.js'));
  ['btn-home-fortune', 'home-fortune-modal', 'home-fortune-title', 'home-fortune-text', 'home-fortune-options', 'home-fortune-result', 'btn-close-home-fortune'].forEach((id) => {
    assert.ok(index.includes(`id="${id}"`), `缺少 ${id}`);
  });
  assert.ok(/id="btn-home-fortune"[^>]*hidden/.test(index), '入口默认隐藏');
  assert.ok(/id="home-fortune-modal"[^>]*modal-backdrop/.test(index) || /id="home-fortune-modal" class="modal-backdrop"/.test(index));
  assert.ok(/id="btn-close-home-fortune"[^>]*data-modal-close/.test(index));
  assert.ok(!/getImageData/.test(text('js/home-fortune.js')));
  assert.ok(!/TASKS[\s\S]{0,200}home_fortune|洞府机缘/.test(text('js/daily.js')));
}

console.log('home.test.js: ok');
