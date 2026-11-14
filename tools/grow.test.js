// 仙姬培元：境界上限、花费与只领一次、自身属性接入战斗/胜率/推荐战力/秘境、
// 旧档迁移、轮回保留，以及两个进度点满培元后的闯关推移（目标约 +1～3 关）。
// 用法：node tools/grow.test.js
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
    'js/mijing.js'
  ].forEach((rel) => {
    vm.runInNewContext(text(rel), sandbox, { filename: rel });
  });
  return {
    W: sandbox.window,
    GS: sandbox.window.GameState,
    Grow: sandbox.window.Grow,
    Battle: sandbox.window.Battle,
    Mijing: sandbox.window.Mijing,
    CFG: sandbox.window.GameConfig,
    storage: sandbox.localStorage
  };
}

function host(v) {
  return JSON.parse(JSON.stringify(v));
}

// 胜率对关卡号非单调（Boss 1.5 倍），不能对任意 n 二分。
// 「能打到的关」= 连续通关：先在 Boss 关（单调）上找第一堵墙，再扫该章普通关。
function highestStage(Battle, state, runs, thresh) {
  const r = runs || 20;
  const t = thresh == null ? 0.5 : thresh;
  const ok = (n) => Battle.winRate(state, n, r) >= t;
  if (!ok(1)) return 0;
  const bosses = [];
  for (let b = 10; b <= 300; b += 10) bosses.push(b);
  let lo = -1;
  let hi = bosses.length;
  while (lo + 1 < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (ok(bosses[mid])) lo = mid;
    else hi = mid;
  }
  if (lo < 0) {
    let last = 0;
    for (let n = 1; n <= 9; n++) {
      if (ok(n)) last = n;
      else break;
    }
    return last;
  }
  if (hi >= bosses.length) return 300;
  const lastBoss = bosses[lo];
  const wallBoss = bosses[hi];
  let last = lastBoss;
  for (let n = lastBoss + 1; n < wallBoss; n++) {
    if (ok(n)) last = n;
    else break;
  }
  return last;
}

function cpStageShift(mean, growth) {
  return Math.log(mean) / Math.log(growth);
}

const { GS, Grow, Battle, Mijing, CFG } = loadRuntime();
assert.ok(Grow, '应导出 Grow');
assert.strictEqual(Grow.REINCARNATION, 'keep', '转世策略应为保留等级');
assert.ok(Grow.PER_LEVEL > 0 && Grow.PER_LEVEL <= 0.02, '单层加成须克制');

// ---------- 境界上限 ----------
{
  assert.strictEqual(Grow.maxLevel(2), 8, '搬血后上限 8');
  assert.strictEqual(Grow.maxLevel(17), 11, '尊者后上限 11');
  assert.ok(Grow.maxLevel(41) <= Grow.HARD_CAP);
  const late = 1 + Grow.maxLevel(41) * Grow.PER_LEVEL;
  const early = 1 + Grow.maxLevel(2) * Grow.PER_LEVEL;
  const g = CFG.BATTLE.GROWTH;
  const lateStages = cpStageShift(late, g);
  const earlyStages = cpStageShift(early, g);
  assert.ok(earlyStages >= 1 && earlyStages <= 3, `搬血后满培元约 +1～3 关，实际折算 ${earlyStages.toFixed(2)}`);
  assert.ok(lateStages >= 1 && lateStages <= 3.2, `至尊后满培元仍约 +1～3 关，实际折算 ${lateStages.toFixed(2)}`);
}

// ---------- 花费、只升一次、低品更便宜 ----------
{
  const s = JSON.parse(JSON.stringify(GS.state));
  s.realmIndex = 2;
  s.lingyu = 1000;
  Grow.ensure(s);
  const id = 'lanyi';
  const cost1 = Grow.upgradeCost(s, id);
  assert.ok(cost1 >= 2);
  const r1 = Grow.upgrade(s, id);
  assert.ok(r1.ok && r1.level === 1);
  assert.strictEqual(s.lingyu, 1000 - cost1);
  const after = s.lingyu;
  const r1b = Grow.upgrade(s, id);
  assert.ok(r1b.ok && r1b.level === 2, '同一人可连续升级直到上限');
  assert.ok(s.lingyu < after);

  const xuan = 'sweetmaid';
  const s2 = JSON.parse(JSON.stringify(GS.state));
  s2.realmIndex = 2;
  Grow.ensure(s2);
  const cXian = Grow.upgradeCost(s2, 'lanyi');
  const cXuan = Grow.upgradeCost(s2, xuan);
  assert.ok(cXuan <= cXian, '非仙品费用不应高于仙品，便于低品仙姬养成');

  const poor = JSON.parse(JSON.stringify(GS.state));
  poor.realmIndex = 2;
  poor.lingyu = 1;
  Grow.ensure(poor);
  const no = Grow.upgrade(poor, 'lanyi');
  assert.ok(!no.ok && no.reason === 'insufficient');
  assert.strictEqual(Grow.level(poor, 'lanyi'), 0);
  assert.strictEqual(poor.lingyu, 1);

  // 顶满后不可再升
  const full = JSON.parse(JSON.stringify(GS.state));
  full.realmIndex = 2;
  full.lingyu = 1e6;
  Grow.ensure(full);
  const cap = Grow.maxLevelFor(full);
  for (let i = 0; i < cap; i++) assert.ok(Grow.upgrade(full, 'lanyi').ok);
  const blocked = Grow.upgrade(full, 'lanyi');
  assert.ok(!blocked.ok && blocked.reason === 'capped');
  assert.strictEqual(Grow.level(full, 'lanyi'), cap);
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
    lastSaveTime: Date.now()
  };
  const storage = memoryStorage();
  const first = loadRuntime(storage);
  storage.setItem(first.GS.SAVE_KEY, JSON.stringify(raw));
  const { GS: GS2, Grow: G2 } = loadRuntime(storage);
  const loaded = GS2.loadGame();
  assert.ok(loaded, '缺 grow 字段的旧档应能读入');
  const g = G2.ensure(GS2.state);
  assert.ok(g && g.lv);
  sameEmpty(g.lv);
  assert.strictEqual(G2.level(GS2.state, 'lanyi'), 0);

  const junk = JSON.parse(JSON.stringify(GS.state));
  junk.grow = { lv: { lanyi: '3', cloak: -2, bad: 'x' }, streak: 9 };
  const fixed = G2.normalize(junk.grow);
  assert.strictEqual(fixed.lv.lanyi, 3);
  assert.ok(fixed.lv.cloak == null);
  assert.ok(fixed.lv.bad == null);
}

function sameEmpty(obj) {
  assert.deepStrictEqual(host(obj), {});
}

// ---------- 轮回保留 ----------
{
  const { GS: GS3, Grow: G3 } = loadRuntime();
  GS3.state.realmIndex = 17;
  GS3.state.lingyu = 50;
  GS3.state.daoGuo = 10;
  GS3.state.totalDaoGuo = 10;
  // 天神初才能轮回，这里直接调 performReincarnation 可能失败。改为手工走 merge 逻辑：调用接口若失败则断言 keep 字段。
  G3.ensure(GS3.state);
  G3.setLevel(GS3.state, 'lanyi', 8);
  G3.setLevel(GS3.state, 'sweetmaid', 6);
  const before = host(GS3.state.grow);
  if (GS3.state.realmIndex < (GS3.REINCARNATION_MIN_STAGE || (CFG.REINCARNATION_MIN_STAGE || 27))) {
    GS3.state.realmIndex = CFG.REINCARNATION_MIN_STAGE || 27;
  }
  const rec = GS3.performReincarnation();
  assert.ok(rec && rec.ok, '应能轮回以验证培元保留');
  assert.deepStrictEqual(host(GS3.state.grow.lv), before.lv, '轮回后应保留培元等级');
  assert.strictEqual(GS3.state.lingyu, 50, '轮回不因培元扣灵玉');
  // 境界回到初期，生效等级被上限截断，存储不变
  assert.ok(GS3.state.realmIndex < 17);
  const cap0 = G3.maxLevelFor(GS3.state);
  assert.ok(G3.level(GS3.state, 'lanyi') <= cap0);
  assert.strictEqual(G3.storedLevel(GS3.state, 'lanyi'), 8);
  // 把境界抬回去后无需再花钱，超额自动恢复
  GS3.state.realmIndex = 17;
  assert.strictEqual(G3.level(GS3.state, 'lanyi'), 8);
}

// ---------- 战斗属性、胜率、推荐战力、秘境 ----------
{
  const { GS: GSb, Grow: Gb, Battle: Bb, Mijing: Mj } = loadRuntime();
  const s = GSb.state;
  s.realmIndex = 2;
  const squad = Bb.getSquadIds(s);
  assert.ok(squad.length >= 1);
  const p0 = Bb.playerStats(s);
  const units0 = Bb.buildPlayerUnits(s);
  const cp0 = p0.cp;
  const u0 = units0.find((u) => u.heroId === squad[0]);

  Gb.fillSquadToCap(s);
  const cap = Gb.maxLevelFor(s);
  const mean = Gb.meanMult(s, squad);
  assert.ok(Math.abs(mean - (1 + cap * Gb.PER_LEVEL)) < 1e-9, '满培元小队均值为 1+cap*每层');

  const p1 = Bb.playerStats(s);
  const units1 = Bb.buildPlayerUnits(s);
  const u1 = units1.find((u) => u.heroId === squad[0]);
  assert.ok(p1.cp > cp0, 'playerStats.cp 应计入培元');
  assert.ok(Math.abs(p1.cp / cp0 - mean) < 0.04, `战力应大约按均值放大，实际 ${ (p1.cp / cp0).toFixed(4) } vs ${mean}`);
  assert.ok(u1.atk > u0.atk && u1.hp > u0.hp && u1.def > u0.def, '单位攻防血应上升');

  // 只培养未上阵角色，不改变当前队伍战力
  const sBench = loadRuntime().GS.state;
  sBench.realmIndex = 2;
  const onField = new Set(Bb.getSquadIds(sBench));
  const bench = CFG.HEROES.find((h) => h && !onField.has(h.id));
  const cpA = Bb.playerStats(sBench).cp;
  if (bench) {
    Gb.setLevel(sBench, bench.id, Gb.maxLevelFor(sBench));
    const cpB = Bb.playerStats(sBench).cp;
    assert.ok(Math.abs(cpB - cpA) < 1e-6, '培养不上阵仙姬不应改变当前队伍战力');
  }

  // 非均分：只培一人，该人体量高于队友
  const sOne = loadRuntime().GS.state;
  sOne.realmIndex = 2;
  const sid = Bb.getSquadIds(sOne)[0];
  const mate = Bb.getSquadIds(sOne)[1];
  Gb.setLevel(sOne, sid, Gb.maxLevelFor(sOne));
  const unitsOne = Bb.buildPlayerUnits(sOne);
  const ua = unitsOne.find((u) => u.heroId === sid);
  const ub = mate ? unitsOne.find((u) => u.heroId === mate) : null;
  if (ub) {
    assert.ok(ua.atk > ub.atk, '培元对象自身属性应高于同队未培元同伴');
  }

  const rate0 = Bb.winRate(s, 1, 20);
  // s already full-grown from fillSquadToCap above; compare a fresh ungrown copy vs grown
  const fresh = loadRuntime().GS.state;
  fresh.realmIndex = 2;
  const grown = loadRuntime().GS.state;
  grown.realmIndex = 2;
  Gb.fillSquadToCap(grown);
  const wr0 = Bb.winRate(fresh, 3, 30);
  const wr1 = Bb.winRate(grown, 3, 30);
  assert.ok(wr1 + 1e-9 >= wr0, `培元后胜率不应下降（${wr0} → ${wr1}）`);

  const rec0 = Bb.recommendedCp(fresh, 5);
  const rec1 = Bb.recommendedCp(grown, 5);
  assert.ok(Number.isFinite(rec0) && Number.isFinite(rec1));
  // 同一关推荐战力应基本不变（由敌人决定），但玩家战力上升后缺口变小
  const gap0 = rec0 - Bb.playerStats(fresh).cp;
  const gap1 = rec1 - Bb.playerStats(grown).cp;
  assert.ok(gap1 <= gap0 + 30, '满培元后推荐缺口不应明显变大');

  if (Mj) {
    const mods0 = Mj.combinedMods(fresh, []);
    const mods1 = Mj.combinedMods(grown, []);
    const wrM0 = Bb.winRate(fresh, 3, 20, mods0);
    const wrM1 = Bb.winRate(grown, 3, 20, mods1);
    assert.ok(wrM1 + 1e-9 >= wrM0, '秘境 mods 下培元仍应生效');
    const pu = Bb.buildPlayerUnits(grown);
    assert.ok(pu.every((u) => u.atk > 0), '秘境前的单位构建已含培元');
  }
}

// ---------- 两档进度：满投资闯关推移 ----------
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

const simReport = [];
function runPoint(label, realmIndex, qIndex, runs) {
  const rt = loadRuntime();
  const s = rt.GS.state;
  s.realmIndex = realmIndex;
  kitTypical(rt.W, s, qIndex);
  const before = highestStage(rt.Battle, s, runs, 0.5);
  const cp0 = rt.Battle.playerStats(s).cp;
  rt.Grow.fillSquadToCap(s);
  const after = highestStage(rt.Battle, s, runs, 0.5);
  const cp1 = rt.Battle.playerStats(s).cp;
  const implied = cpStageShift(cp1 / cp0, rt.CFG.BATTLE.GROWTH);
  const delta = after - before;
  const row = {
    label,
    realmIndex,
    cap: rt.Grow.maxLevelFor(s),
    mean: rt.Grow.meanMult(s, rt.Battle.getSquadIds(s)),
    cpBefore: cp0,
    cpAfter: cp1,
    implied,
    before,
    after,
    delta
  };
  simReport.push(row);
  return row;
}

const p1 = runPoint('搬血后·灵品套', 2, 1, 20);
const p2 = runPoint('尊者后·地品套', 17, 3, 20);

p1.okImplied = p1.implied >= 1 && p1.implied <= 3.2;
p2.okImplied = p2.implied >= 1 && p2.implied <= 3.2;
assert.ok(p1.okImplied, `${p1.label} 战力折算关差应在 1～3，实际 ${p1.implied.toFixed(2)}`);
assert.ok(p2.okImplied, `${p2.label} 战力折算关差应在 1～3，实际 ${p2.implied.toFixed(2)}`);
assert.ok(p1.delta >= 0 && p1.delta <= 3, `${p1.label} 实机推移应在 0～3 关（Boss 墙可能挡住），实际 ${p1.delta}（${p1.before}→${p1.after}）`);
assert.ok(p2.delta >= 0 && p2.delta <= 3, `${p2.label} 实机推移应在 0～3 关，实际 ${p2.delta}（${p2.before}→${p2.after}）`);

// 每日功课已有 6 项，不加培元功课（避免超过 4–6 项上限）
if (fs.existsSync(path.join(root, 'js/daily.js'))) {
  const dailySrc = text('js/daily.js') + text('index.html');
  assert.ok(!/hero_grow|培元/.test(text('js/daily.js')), '未把培元功课加入每日任务表');
}

console.log('grow.test.js: ok');
console.log(
  simReport
    .map(
      (r) =>
        `  sim ${r.label}(realm ${r.realmIndex}, cap ${r.cap}): ${r.before} → ${r.after} (Δ${r.delta} 关), 战力折算 +${r.implied.toFixed(2)} 关, mean=${r.mean.toFixed(4)}`
    )
    .join('\n')
);
