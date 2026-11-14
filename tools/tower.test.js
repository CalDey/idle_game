// 镇妖塔：层数缩放、每日失败次数按本地日重置、首通只领一次、
// 轮回保留最高层、旧档迁移，以及早期队伍 1–5 层可胜且难度递增。
// 用法：node tools/tower.test.js
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
  [
    'js/config.js',
    'js/equip.js',
    'js/state.js',
    'js/titles.js',
    'js/grow.js',
    'js/battle.js',
    'js/bonds.js',
    'js/mijing.js',
    'js/tower.js'
  ].forEach((rel) => {
    vm.runInNewContext(text(rel), sandbox, { filename: rel });
  });
  return {
    W: sandbox.window,
    GS: sandbox.window.GameState,
    Tower: sandbox.window.Tower,
    Battle: sandbox.window.Battle,
    CFG: sandbox.window.GameConfig,
    storage: sandbox.localStorage
  };
}

function host(v) {
  return JSON.parse(JSON.stringify(v));
}

function atLocal(y, m, d, hh, mm, ss) {
  return new Date(y, m - 1, d, hh || 0, mm || 0, ss || 0, 0).getTime();
}

function kitTypical(W, state, qIndex) {
  const CFG = W.GameConfig;
  const qs = CFG.QUALITIES[qIndex];
  if (!state.equip || typeof state.equip !== 'object') state.equip = W.Equip.emptyEquip();
  state.seq = Number(state.seq) || 0;
  CFG.EQUIP_SLOTS.forEach((slot) => {
    const lv = Math.max(1, 1 + 2 * (state.realmIndex || 0));
    const m = Math.max(1, Math.round(slot.base * Math.pow(slot.growth, lv - 1) * qs.mult));
    state.seq += 1;
    state.equip[slot.id] = { id: state.seq, s: slot.id, q: qIndex, lv, m, sub: [] };
  });
}

const { GS, Tower, Battle, CFG, W } = loadRuntime();
assert.ok(Tower, '应导出 Tower');
assert.strictEqual(Tower.UNLOCK_BEST, 20);
assert.strictEqual(Tower.DAILY_FAILS, 3);
assert.strictEqual(Tower.BOSS_EVERY, 5);

// ---------- 缩放：每 5 层 Boss，战力单调上升（同类型层），Boss 复用现有数据 ----------
{
  assert.ok(!Tower.isBossFloor(1) && !Tower.isBossFloor(4));
  assert.ok(Tower.isBossFloor(5) && Tower.isBossFloor(10));
  assert.ok(Tower.isMilestoneFloor(10) && !Tower.isMilestoneFloor(5));
  const c1 = Tower.floorCp(1);
  const c4 = Tower.floorCp(4);
  const c5 = Tower.floorCp(5);
  const c6 = Tower.floorCp(6);
  const c10 = Tower.floorCp(10);
  assert.ok(c4 > c1, '普通层战力应随层数上升');
  assert.ok(c5 > c4, 'Boss 层应高于前一层');
  assert.ok(c6 < c5 && c6 > c4, 'Boss 后普通层应回落到介于前一普通层与 Boss 之间或附近，且仍高于更早普通层');
  assert.ok(c10 > c5, '更高 Boss 层应更强');
  const e5 = Tower.floorEnemy(5);
  const e10 = Tower.floorEnemy(10);
  assert.ok(e5.isBoss && e10.isBoss);
  const bossNames = new Set((CFG.BATTLE.BOSSES || []).map((b) => b && b.name));
  assert.ok(bossNames.has(e5.name), 'Boss 层应复用现有首领名');
  assert.ok(bossNames.has(e10.name));
  // 不新造立绘路径：img 必须是 placeholder 或已有 assets/enemies
  [e5, e10].forEach((e) => {
    assert.ok(e.img === 'placeholder' || /^assets\/enemies\//.test(e.img), `非法 Boss 图 ${e.img}`);
  });
  assert.ok(!Tower.floorEnemy(1).isBoss);
}

// ---------- 每日失败次数：胜利不扣，失败扣 1，本地 0 点重置 ----------
{
  const s = JSON.parse(JSON.stringify(GS.state));
  s.stage = s.stage || {};
  s.stage.best = 20;
  s.tree = s.tree || { peaches: 0 };
  const t0 = atLocal(2026, 11, 15, 10, 0, 0);
  Tower.ensure(s, t0);
  assert.strictEqual(Tower.failsLeft(s, t0), 3);
  const win1 = Tower.settleWin(s, 1, { qiPerSec: 10, stonePerSec: 2 }, t0);
  assert.ok(win1.ok && win1.first);
  assert.strictEqual(Tower.failsLeft(s, t0), 3, '胜利不消耗次数');
  const lose1 = Tower.settleLoss(s, 2, t0);
  assert.ok(lose1.ok);
  assert.strictEqual(Tower.failsLeft(s, t0), 2);
  Tower.settleLoss(s, 2, t0);
  Tower.settleLoss(s, 2, t0);
  assert.strictEqual(Tower.failsLeft(s, t0), 0);
  const blocked = Tower.canChallenge(s, t0);
  assert.ok(!blocked.ok && blocked.reason === 'no_attempts');
  const extra = Tower.settleLoss(s, 2, t0);
  assert.strictEqual(extra.fails, 3, '次数用尽后不再累加');

  const t1 = atLocal(2026, 11, 16, 0, 0, 0);
  Tower.ensure(s, t1);
  assert.strictEqual(s.tower.date, '2026-11-16');
  assert.strictEqual(s.tower.fails, 0, '本地 0 点失败次数清零');
  assert.strictEqual(s.tower.best, 1, '最高层跨日保留');
  assert.ok(Tower.canChallenge(s, t1).ok);
}

// ---------- 未解锁 ----------
{
  const s = JSON.parse(JSON.stringify(GS.state));
  s.stage = { best: 10, cur: 11 };
  Tower.ensure(s, Date.now());
  const chk = Tower.canChallenge(s, Date.now());
  assert.ok(!chk.ok && chk.reason === 'locked');
}

// ---------- 首通只领一次，不发道果 ----------
{
  const s = JSON.parse(JSON.stringify(GS.state));
  s.stage = { best: 20, cur: 21 };
  s.lingyu = 0;
  s.qi = 0;
  s.stones = 0;
  s.daoGuo = 4;
  s.totalDaoGuo = 9;
  s.tree = { peaches: 0 };
  const now = atLocal(2026, 11, 15, 12, 0, 0);
  const env = { qiPerSec: 10, stonePerSec: 2 };
  const r1 = Tower.settleWin(s, 1, env, now);
  assert.ok(r1.ok && r1.first);
  assert.ok(r1.reward, '首通应有奖励');
  assert.ok(!r1.reward.daoguo, '镇妖塔不得发放道果');
  const jade1 = s.lingyu;
  const peach1 = s.tree.peaches;
  const dao1 = s.daoGuo;
  // 不能跳层
  const jump = Tower.settleWin(s, 3, env, now);
  assert.ok(!jump.ok && jump.reason === 'out_of_order');
  const r2 = Tower.settleWin(s, 2, env, now);
  assert.ok(r2.ok && r2.first);
  assert.ok(Tower.alreadyClaimed(s, 1, now) && Tower.alreadyClaimed(s, 2, now), '前两层首通应已记领取');
  assert.ok(!Tower.alreadyClaimed(s, 3, now));
  const jade2 = s.lingyu;
  const peach2 = s.tree.peaches;
  const dao2 = s.daoGuo;
  // 同一层不能再作为下一层结算（进度必须连续）
  const again = Tower.settleWin(s, 2, env, now);
  assert.ok(!again.ok && again.reason === 'out_of_order');
  assert.strictEqual(s.lingyu, jade2, '重复结算不得再发灵玉');
  assert.strictEqual(s.tree.peaches, peach2);
  assert.strictEqual(s.daoGuo, dao1);
  assert.strictEqual(s.totalDaoGuo, 9);
  assert.ok(s.lingyu >= jade1);
  // 里程碑层灵玉应多于普通层（在封顶前）
  const sM = JSON.parse(JSON.stringify(GS.state));
  sM.stage = { best: 20, cur: 21 };
  const normal = Tower.scaleReward(sM, 1, env);
  const mile = Tower.scaleReward(sM, 10, env);
  assert.ok((mile.jade || 0) > (normal.jade || 0), '里程碑层灵玉应更高');
  assert.ok((mile.jade || 0) <= Tower.jadeCapFor(sM));
  assert.ok((mile.peach || 0) <= Tower.PEACH_REWARD_CAP);
}

// ---------- 轮回保留最高层 ----------
{
  const { GS: GS2, Tower: T2, CFG: C2 } = loadRuntime();
  GS2.state.stage = GS2.state.stage || {};
  GS2.state.stage.best = 20;
  GS2.state.lingyu = 30;
  T2.ensure(GS2.state, atLocal(2026, 11, 15, 8, 0, 0));
  GS2.state.tower.best = 17;
  GS2.state.tower.claimed = 17;
  GS2.state.tower.fails = 2;
  const before = host(GS2.state.tower);
  GS2.state.realmIndex = C2.REINCARNATION_MIN_STAGE || 27;
  GS2.state.daoGuo = 10;
  GS2.state.totalDaoGuo = 10;
  const rec = GS2.performReincarnation();
  assert.ok(rec && rec.ok, '应能轮回以验证镇妖塔保留');
  assert.strictEqual(GS2.state.tower.best, 17, '轮回应保留最高层');
  assert.strictEqual(GS2.state.tower.claimed, 17);
  assert.deepStrictEqual(host(GS2.state.tower.best), before.best);
}

// ---------- 旧档迁移 ----------
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
    stage: { best: 20, cur: 21 },
    lastSaveTime: Date.now()
  };
  const storage = memoryStorage();
  const first = loadRuntime(storage);
  storage.setItem(first.GS.SAVE_KEY, JSON.stringify(raw));
  const { GS: GS3, Tower: T3 } = loadRuntime(storage);
  const loaded = GS3.loadGame();
  assert.ok(loaded, '缺 tower 字段的旧档应能读入');
  const tw = T3.ensure(GS3.state, Date.now());
  assert.strictEqual(tw.best, 0);
  assert.strictEqual(tw.claimed, 0);
  assert.strictEqual(tw.fails, 0);

  const junk = { best: '8', claimed: 'no', fails: 99, date: 20261115 };
  const fixed = T3.normalize(junk);
  assert.strictEqual(fixed.best, 8);
  assert.strictEqual(fixed.claimed, 0);
  assert.ok(fixed.fails <= T3.DAILY_FAILS);
}

// ---------- 模拟：早期可开塔队伍 1–5 层可胜，难度递增 ----------
{
  const rt = loadRuntime();
  const s = rt.GS.state;
  s.realmIndex = 5; // 洞天后，刚过第 20 关的早期队伍
  s.stage = s.stage || {};
  s.stage.best = 20;
  s.stage.cur = 21;
  kitTypical(rt.W, s, 2); // 玄品套
  const rates = [];
  for (let f = 1; f <= 5; f++) {
    const enemy = rt.Tower.floorEnemy(f);
    const wr = rt.Battle.winRate(s, enemy, 24);
    rates.push(wr);
    assert.ok(wr >= 0.5, `早期队伍应能稳定打过第 ${f} 层（胜率 ${wr}）`);
  }
  // 更高层对同一队伍应更难（取第 15 层或第 20 层 Boss）
  const later = rt.Battle.winRate(s, rt.Tower.floorEnemy(20), 24);
  const earlyAvg = (rates[0] + rates[1] + rates[2]) / 3;
  assert.ok(later <= earlyAvg + 0.05, `难度应上升：前三层均胜率 ${earlyAvg.toFixed(2)}，第 20 层 ${later.toFixed(2)}`);
  assert.ok(rt.Tower.floorCp(20) > rt.Tower.floorCp(5));
}

// 每日功课保持 6 项，不加镇妖塔任务
{
  const daily = text('js/daily.js');
  assert.ok(!/tower|镇妖塔/.test(daily), '未把镇妖塔加入每日功课');
}

// ---------- 预估胜率与实战使用同一份 Bonds.modsForState（含道途，只计一次） ----------
{
  const sandbox = {
    window: {},
    console,
    localStorage: memoryStorage(),
    document: { readyState: 'loading', addEventListener() {}, getElementById() { return null; } }
  };
  sandbox.globalThis = sandbox.window;
  sandbox.window.document = sandbox.document;
  [
    'js/config.js',
    'js/beasts.js',
    'js/equip.js',
    'js/state.js',
    'js/titles.js',
    'js/grow.js',
    'js/battle.js',
    'js/bonds.js',
    'js/mijing.js',
    'js/path.js',
    'js/tower.js'
  ].forEach((rel) => {
    vm.runInNewContext(text(rel), sandbox, { filename: rel });
  });
  const W = sandbox.window;
  const s = W.GameState.state;
  s.realmIndex = 8;
  s.stage = { best: 80, cur: 81 };
  s.squad = ['saintess', 'qingkui', 'jianghua', 'molan', 'sweetmaid', 'lanyi'];
  s.heroId = s.squad[0];
  s.unlockedHeroes = W.GameConfig.HEROES.map((h) => h.id);
  kitTypical(W, s, 3);
  s.path = { id: 'jian', lv: [3, 3, 3] };
  const floor = 65;
  const enemy = W.Tower.floorEnemy(floor);
  const mods = W.Bonds.modsForState(s);
  assert.ok(mods && W.Path.battleMods(s), '应有羁绊/道途加成');
  assert.ok(mods.critAdd > 0 || mods.ultDmgMult > 1, 'mods 须包含剑道加成');
  const twice = W.Bonds.mergeMods(mods, W.Path.battleMods(s));
  assert.ok(Math.abs((mods.ultDmgMult || 1) - (twice.ultDmgMult || 1)) > 1e-9, '若再叠一次道途会不同，用于确认只计一次');
  const preview = W.TowerUI.previewRate(s, floor);
  const wr = W.Battle.winRate(s, enemy, 12, mods);
  assert.strictEqual(preview.rate, wr, '预估与实战同一份 mods、同一跑次数');
  assert.deepStrictEqual(W.Bonds.modsForState(s), mods, '实战 createSession 与预估共用同一份 mods（只合并一次）');
  const tw = text('js/tower.js');
  const su = text('js/stage-ui.js');
  assert.ok(/function previewRate[\s\S]{0,800}battleMods\(s\)/.test(tw) && /modsForState/.test(tw), 'previewRate 走 Bonds.modsForState');
  assert.ok(!/Path\.battleMods/.test(tw) && !/Path\.battleMods/.test(su), '镇妖塔不单独再叠道途');
  assert.ok(/function getTowerWinRate[\s\S]{0,500}bondModsFor\(state\)/.test(su), '闯关页塔内预估也走同一 mods');
  assert.ok(/function getTowerWinRate[\s\S]{0,400}beastKey\(state\)/.test(su), '塔内预估缓存键含道途签名');
  assert.ok(/function previewRate[\s\S]{0,500}previewCacheSig\(s\)/.test(tw), '塔外预估缓存键含道途签名');
  assert.ok(/function getRecommendedCp[\s\S]{0,900}isTower[\s\S]{0,300}return towerRecommendedCp/.test(su), '镇妖塔推荐战力取塔层敌人并带 mods，不再把层号当成主线关号');
}

console.log('tower.test.js: ok');
