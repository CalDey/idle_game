// 万妖图鉴：跨模式击杀计数、精通门槛、奖励只领一次、加成封顶、旧档迁移、轮回保留。
// 用法：node tools/bestiary.test.js
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
    'js/codex-data.js',
    'js/codex.js'
  ].forEach((rel) => {
    vm.runInNewContext(text(rel), sandbox, { filename: rel });
  });
  return {
    W: sandbox.window,
    GS: sandbox.window.GameState,
    CX: sandbox.window.Codex,
    Battle: sandbox.window.Battle,
    CFG: sandbox.window.GameConfig,
    storage: sandbox.localStorage
  };
}

function unitsFrom(name, opts) {
  const o = opts || {};
  return [{
    side: 'enemy',
    name,
    isBoss: Boolean(o.isBoss),
    alive: o.alive != null ? o.alive : false,
    hp: o.hp != null ? o.hp : 0,
    bestiaryId: o.bestiaryId
  }];
}

const { GS, CX, Battle, CFG } = loadRuntime();
assert.ok(CX && CX.catalog, 'Codex 应导出收集 API');

const cat = CX.catalog();
assert.strictEqual(cat.filter((e) => e.kind === 'boss').length, 30, '30 名首领');
assert.strictEqual(cat.filter((e) => e.kind === 'mob').length, 18, '18 种妖物');
assert.strictEqual(new Set(cat.map((e) => e.id)).size, 48, '收集 id 唯一');

// 显示名必须随时从配置读取（改名补丁只改 config 即可生效）
{
  const bosses = CFG.BATTLE.BOSSES;
  const fromCfg = bosses.map((b) => b.name);
  const fromCat = cat.filter((e) => e.kind === 'boss').map((e) => e.name);
  assert.deepStrictEqual(host(fromCat), host(fromCfg));
  const mobNames = [];
  CFG.BATTLE.REGIONS.forEach((r) => (r.mobs || []).forEach((m) => mobNames.push(m.name)));
  assert.deepStrictEqual(host(cat.filter((e) => e.kind === 'mob').map((e) => e.name)), host(mobNames));
  assert.ok(CFG.BATTLE.REGIONS.every((r) => (r.mobs || []).every((m) => m && m.id)), '小怪应有稳定 id，避免改名丢进度');
}

const heifeng = cat.find((e) => e.id === 'boss_heifeng');
const shanzei = cat.find((e) => e.id === 'mob_shanzei');
assert.ok(heifeng && heifeng.name === '黑风寨主');
assert.ok(shanzei && shanzei.name === '山贼喽啰');

// ---------- 跨模式击杀：主线 / 秘境 / 镇妖塔共用 noteBattle ----------
{
  const s = JSON.parse(JSON.stringify(GS.state));
  delete s.codex;
  CX.noteSeen(s, unitsFrom('黑风寨主', { isBoss: true, alive: true, hp: 100 }));
  assert.strictEqual(s.codex.seen.boss_heifeng, 1, '遭遇即现形，不必先击杀');
  assert.ok(!s.codex.kills.boss_heifeng);

  // 主线：击败 Boss
  CX.noteBattle(s, { win: true, enemyUnits: unitsFrom('黑风寨主', { isBoss: true }) });
  assert.strictEqual(s.codex.kills.boss_heifeng, 1);

  // 秘境：精英名前缀应去掉，计入同一首领
  CX.noteBattle(s, { win: true, enemyUnits: unitsFrom('精英·黑风寨主', { isBoss: true }) });
  assert.strictEqual(s.codex.kills.boss_heifeng, 2, '秘境精英应计入同一首领');

  // 镇妖塔：小怪按配置名累计；失败时只计已倒下的
  CX.noteBattle(s, {
    win: false,
    enemyUnits: [
      { side: 'enemy', name: '山贼喽啰', isBoss: false, alive: false, hp: 0 },
      { side: 'enemy', name: '山贼喽啰', isBoss: false, alive: true, hp: 20 }
    ]
  });
  assert.strictEqual(s.codex.kills.mob_shanzei, 1, '失败时只计倒下的单位');
  CX.noteBattle(s, {
    win: true,
    enemyUnits: [
      { side: 'enemy', name: '山贼喽啰', isBoss: false, alive: true, hp: 1 },
      { side: 'enemy', name: '山贼喽啰', isBoss: false, alive: true, hp: 1 }
    ]
  });
  assert.strictEqual(s.codex.kills.mob_shanzei, 3, '胜利时整波计击杀');
  assert.strictEqual(s.codex.seen.mob_shanzei, 1);
}

// ---------- 门槛与领取一次 ----------
{
  const s = JSON.parse(JSON.stringify(GS.state));
  s.qi = 0; s.stones = 0; s.lingyu = 0; s.daoGuo = 4; s.totalDaoGuo = 9;
  s.tree = s.tree || {}; s.tree.peaches = 0;
  s.stage = s.stage || {}; s.stage.best = 20;
  const env = { qiPerSec: 10, stonePerSec: 2, now: Date.now() };
  const id = 'boss_heifeng';
  CX.ensureState(s);
  s.codex.kills[id] = 10;
  s.codex.seen[id] = 1;
  assert.deepStrictEqual(host(CX.claimableTiersFor(s, id)), [1, 10]);
  const r1 = CX.claimNext(s, id, env);
  assert.ok(r1.ok && r1.tier === 1);
  const qi1 = s.qi, jade1 = s.lingyu, peach1 = s.tree.peaches, dao1 = s.daoGuo;
  const r1b = CX.claimNext(s, id, env);
  assert.ok(r1b.ok && r1b.tier === 10, '下一阶应可继续领');
  const r1c = CX.claimNext(s, id, env);
  assert.ok(!r1c.ok, '已领取的阶不得再发');
  assert.strictEqual(s.daoGuo, dao1, '不得发放道果');
  assert.strictEqual(s.totalDaoGuo, 9);
  assert.ok(s.qi >= qi1);
  if (s.tree.peaches > peach1) assert.ok(s.tree.peaches - peach1 <= CX.PEACH_CAP);
  const q = CX.scaleTierReward(s, 200, env);
  if (q.qi) assert.ok(q.qi <= env.qiPerSec * 60 * CX.QI_STONE_CAP_MINUTES);
  if (q.stone) assert.ok(q.stone <= env.stonePerSec * 60 * CX.QI_STONE_CAP_MINUTES);
  if (q.peach) assert.ok(q.peach <= CX.PEACH_CAP);
  if (q.jade) assert.ok(q.jade >= 1);
  assert.ok(!('daoguo' in (q || {})));
}

// ---------- 加成封顶，且 decorate 只计一次 ----------
{
  const s = JSON.parse(JSON.stringify(GS.state));
  CX.ensureState(s);
  // 填满所有阶：48*4=192，0.05%*192=9.6% → 封顶 5%
  CX.catalog().forEach((e) => { s.codex.kills[e.id] = 200; s.codex.seen[e.id] = 1; });
  assert.ok(Math.abs(CX.bonusRate(s) - CX.BONUS_CAP) < 1e-9, '总加成应封顶在 +5%');
  const few = JSON.parse(JSON.stringify(GS.state));
  CX.ensureState(few);
  few.codex.kills.boss_heifeng = 1;
  few.codex.seen.boss_heifeng = 1;
  assert.ok(Math.abs(CX.bonusRate(few) - CX.BONUS_PER_TIER) < 1e-12);

  const base = { atk: 1000, hp: 2000, def: 300, spd: 100, crit: 0.05, critDmg: 1.5 };
  const once = CX.decoratePlayerStats(s, Object.assign({}, base));
  const atk1 = once.atk;
  const twice = CX.decoratePlayerStats(s, once);
  assert.strictEqual(twice.atk, atk1, '加成不得叠加第二次');
  assert.ok(Math.abs(atk1 - 1000 * (1 + CX.BONUS_CAP)) < 1e-6);
  assert.ok(twice.cp > 0);

  const none = CX.decoratePlayerStats(JSON.parse(JSON.stringify(GS.state)), Object.assign({}, base));
  assert.strictEqual(none.atk, 1000, '无击杀不加攻');
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
  const { GS: GS3, CX: CX3 } = loadRuntime(storage);
  const loaded = GS3.loadGame();
  assert.ok(loaded, '缺收集字段的旧档应能读入');
  const c = CX3.ensureState(GS3.state);
  assert.strictEqual(c.maxRealm, 0);
  assert.deepStrictEqual(host(c.kills), {});
  assert.deepStrictEqual(host(c.seen), {});
  assert.deepStrictEqual(host(c.claimed), {});

  const fixed = CX3.normalize({
    maxRealm: '7',
    kills: { boss_heifeng: '12', '!!': -3, mob_shanzei: 2.8 },
    seen: { boss_heifeng: true, ghost: 0 },
    claimed: { boss_heifeng: 15, mob_shanzei: 'no' }
  });
  assert.strictEqual(fixed.maxRealm, 7);
  assert.strictEqual(fixed.kills.boss_heifeng, 12);
  assert.strictEqual(fixed.kills.mob_shanzei, 2);
  assert.ok(!('!!' in fixed.kills));
  assert.strictEqual(fixed.seen.boss_heifeng, 1);
  assert.ok(!fixed.seen.ghost);
  assert.strictEqual(fixed.claimed.boss_heifeng, 10, 'claimed 应落到已达门槛');
  assert.ok(!fixed.claimed.mob_shanzei);
}

// ---------- 轮回保留击杀 / 已见 / 已领 ----------
{
  const storage = memoryStorage();
  const rt = loadRuntime(storage);
  const s = rt.GS.state;
  s.lingyu = 30;
  rt.CX.ensureState(s);
  s.codex.kills.boss_heifeng = 50;
  s.codex.seen.boss_heifeng = 1;
  s.codex.claimed.boss_heifeng = 10;
  s.realmIndex = rt.CFG.REINCARNATION_MIN_STAGE || 27;
  rt.CX.syncMaxRealm(s);
  const keptRealm = s.codex.maxRealm;
  s.daoGuo = 10;
  s.totalDaoGuo = 10;
  const rec = rt.GS.performReincarnation();
  assert.ok(rec && rec.ok, '应能轮回以验证图鉴收集保留');
  assert.strictEqual(rt.GS.state.codex.kills.boss_heifeng, 50);
  assert.strictEqual(rt.GS.state.codex.seen.boss_heifeng, 1);
  assert.strictEqual(rt.GS.state.codex.claimed.boss_heifeng, 10);
  assert.strictEqual(rt.GS.state.codex.maxRealm, keptRealm, '轮回应保留历史最高境界与收集进度');
}

// ---------- 战力接入：有加成时 playerStats.cp 上升，且与 winRate 同源 ----------
{
  const s = JSON.parse(JSON.stringify(GS.state));
  s.realmIndex = 5;
  s.stage = s.stage || {}; s.stage.best = 20;
  const before = Battle.playerStats(s);
  CX.ensureState(s);
  CX.catalog().forEach((e) => { s.codex.kills[e.id] = 200; s.codex.seen[e.id] = 1; });
  const after = Battle.playerStats(s);
  assert.ok(after.cp > before.cp, '收集加成应进入 playerStats / CP');
  assert.ok(Math.abs(after.atk / before.atk - (1 + CX.BONUS_CAP)) < 1e-6);
  assert.ok(typeof Battle.winRate(s, 1, 4) === 'number');
}

// ---------- 页面接线：缩略图约束与入口红点节点 ----------
{
  const index = text('index.html');
  const css = text('css/style.css');
  assert.ok(/<script src="js\/codex\.js\?v=\d+"><\/script>/.test(index));
  assert.ok(index.includes('id="badge-codex"'));
  assert.ok(/codex-boss-thumb[\s\S]{0,180}max-width:\s*100%/.test(css), '缩略图应限制 max-width，避免大图撑破弹窗');
  assert.ok(/codex-boss-thumb[\s\S]{0,120}width:\s*44px/.test(css));
  assert.ok(/codex-boss-thumb[\s\S]{0,160}height:\s*58px/.test(css));
  assert.ok(css.includes('is-unseen'));
  assert.ok(!/getImageData/.test(text('js/codex.js')));
}

console.log('bestiary.test.js: ok');
