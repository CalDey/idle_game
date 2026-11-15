// 秘境劫运：次数日重置、波次缩放、劫运抽取/生效/清空、奖励计算、存档兼容、无劫运时战斗与原版逐事件一致，
// 以及闯关页 UI 的无浏览器冒烟（vm + 极简假 DOM，不使用 getImageData / 浏览器自动化）。
// 用法：node tools/mijing.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const PRE_MIJING = '4eb0fe97af53e6970f93fc27ec501928fc840da9';
const text = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });

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
  const sandbox = { window: {}, console, localStorage: o.storage || memoryStorage(), setTimeout, clearTimeout };
  sandbox.globalThis = sandbox.window;
  vm.runInNewContext(text('js/config.js'), sandbox);
  vm.runInNewContext(text('js/equip.js'), sandbox);
  vm.runInNewContext(o.battleSource || text('js/battle.js'), sandbox);
  if (o.state !== false) vm.runInNewContext(text('js/state.js'), sandbox);
  else {
    sandbox.window.GameState = {
      getCurrentStage: () => sandbox.window.GameConfig.REALM_STAGES[0],
      getStonePerSec: () => 1,
      getQiPerSec: () => 1
    };
  }
  if (o.mijing !== false) vm.runInNewContext(text('js/mijing.js'), sandbox);
  return sandbox.window;
}

const W = runtime();
W.GameState.loadGame();
const CFG = W.GameConfig;
const B = W.Battle;
const M = W.Mijing;
const HEROES = CFG.HEROES.filter((h) => !h.locked).map((h) => h.id);
const SQUAD = HEROES.slice(0, 6);

function simState(win, realmIndex, qIndex) {
  const C = win.GameConfig;
  const E = win.Equip;
  const lv = Math.max(1, 1 + 2 * realmIndex);
  const q = C.QUALITIES[qIndex];
  const ns = (q.subs * 6) / 8;
  const sc = E.subScale(qIndex);
  const avgSubs = C.SUBSTATS.map((d) => [d.key, ns * ((d.min + d.max) / 2) * sc]);
  const equip = E.emptyEquip();
  C.EQUIP_SLOTS.forEach((slot, idx) => {
    const raw = slot.base * Math.pow(slot.growth, lv - 1) * q.mult;
    equip[slot.id] = { id: idx + 1, s: slot.id, q: qIndex, lv, m: Math.round(raw), sub: idx === 0 ? avgSubs : [] };
  });
  return { realmIndex, totalDaoGuo: 0, gongfa: {}, dongfu: {}, equip, heroId: SQUAD[0], squad: SQUAD.slice(), unlockedHeroes: HEROES.slice() };
}

let passed = 0;
const pending = [];
function check(name, fn) {
  const ret = fn();
  if (ret && typeof ret.then === 'function') {
    pending.push(
      ret.then(() => {
        passed += 1;
        console.log(`ok - ${name}`);
      })
    );
  } else {
    passed += 1;
    console.log(`ok - ${name}`);
  }
}

// 1. 无劫运（mods 缺省）时与上线前 battle.js 完全一致
check('无劫运时战斗事件与改动前逐条一致', () => {
  const oldW = runtime({ battleSource: git(['show', `${PRE_MIJING}:js/battle.js`]), state: false, mijing: false });
  const newW = runtime({ state: false, mijing: false });
  // 节奏 v2 给 1–29 关加了前期缩放、13/23/… 为精英关，这些关不再与旧 battle.js 逐事件相比。
  for (const [ri, qi, n] of [[3, 0, 9], [8, 1, 30], [12, 2, 57], [16, 3, 90]]) {
    const pNew = newW.Battle.playerStats(simState(newW, ri, qi));
    const ramp = newW.Battle.earlyRampMult(newW.GameConfig.BATTLE, n, n % 10 === 0);
    const elite = newW.Battle.isEliteStage(n);
    for (let seed = 1; seed <= 25; seed++) {
      const b = JSON.stringify(newW.Battle.simulate(pNew, n, seed));
      const c = JSON.stringify(newW.Battle.createSession(pNew, n, seed, null).runToEnd(true));
      assert.strictEqual(c, b, 'mods=null 与默认模拟一致');
      if (ramp === 1 && !elite) {
        const pOld = oldW.Battle.playerStats(simState(oldW, ri, qi));
        const a = JSON.stringify(oldW.Battle.simulate(pOld, n, seed));
        assert.strictEqual(b, a, `realm ${ri} stage ${n} seed ${seed} 结果应与原版一致`);
      }
    }
  }
});

// 2. 次数、日重置、解锁
check('每日 2 次，按本地日期重置，第 10 关解锁', () => {
  const st = { stage: { best: 9 }, squad: SQUAD.slice(), heroId: SQUAD[0], unlockedHeroes: HEROES.slice() };
  const day1 = new Date(2026, 10, 15, 23, 50).getTime();
  const day2 = new Date(2026, 10, 16, 0, 5).getTime();
  assert.strictEqual(M.canStart(st, day1).reason, 'LOCKED');
  st.stage.best = 10;
  assert.strictEqual(M.attemptsLeft(st, day1), 2);
  assert.ok(M.startRun(st, day1, 1).ok);
  assert.strictEqual(M.canStart(st, day1).reason, 'ACTIVE');
  M.endRun(st, 'quit');
  assert.ok(M.startRun(st, day1, 2).ok);
  M.endRun(st, 'quit');
  assert.strictEqual(M.attemptsLeft(st, day1), 0);
  assert.strictEqual(M.canStart(st, day1).reason, 'NO_ATTEMPTS');
  assert.strictEqual(M.startRun(st, day1, 3).ok, false);
  assert.strictEqual(M.attemptsLeft(st, day2), 2, '跨过本地零点恢复 2 次');
  assert.strictEqual(st.mijing.date, M.localDate(day2));
  assert.strictEqual(st.mijing.runs, 2);
  const empty = { stage: { best: 50 }, squad: [], heroId: 'lanyi', unlockedHeroes: HEROES.slice() };
  assert.strictEqual(M.canStart(empty, day1).reason, 'EMPTY_SQUAD');
});

// 3. 波次缩放
check('波次战力单调递增、第 4 波精英、第 8 波 Boss，锚定最高通关关卡', () => {
  for (const ref of [10, 29, 30, 77, 150, 300]) {
    const run = { seed: 7, ref, wave: 1, cleared: 0, blessings: {} };
    let prev = 0;
    for (let w = 1; w <= M.WAVES; w++) {
      const e = M.waveEnemy(run, w);
      assert.ok(e.cp > prev, `ref ${ref} wave ${w} 战力递增`);
      prev = e.cp;
      assert.strictEqual(e.isBoss, w === 4 || w === 8);
      assert.strictEqual(e.mijingKind, w === 4 ? 'elite' : w === 8 ? 'boss' : 'mob');
      assert.ok(Math.abs(e.cp / M.refCp(ref) - M.WAVE_PLAN[w - 1].mult) < 1e-9);
      assert.ok(e.name && typeof e.name === 'string');
      const units = B.buildEnemyUnits(e);
      assert.ok(units.length >= 3 && units.length <= 5);
      if (e.isBoss) assert.strictEqual(units.filter((u) => u.isBoss).length, 1);
    }
    assert.ok(M.refCp(ref + 1) > M.refCp(ref));
  }
  assert.ok(M.waveEnemy({ seed: 1, ref: 30 }, 4).name.startsWith('精英·'));
});

// 4. 劫运抽取 / 应用 / 叠层上限 / 清空
check('劫运抽取不重复、跳过满层、确定性；mods 汇总与上限', () => {
  assert.ok(M.BLESSINGS.length >= 12 && M.BLESSINGS.length <= 15);
  const rar = new Set(M.BLESSINGS.map((b) => b.rarity));
  assert.deepStrictEqual([...rar].sort(), ['fan', 'tian', 'xuan']);
  const run = { seed: 99, ref: 40, wave: 3, cleared: 2, blessings: {}, picks: 0 };
  const c1 = M.drawChoices(run);
  assert.deepStrictEqual(Array.from(M.drawChoices(run)), Array.from(c1), '同局同选择次数结果一致（刷新不能重抽）');
  assert.strictEqual(new Set(c1).size, 3);
  const full = {};
  M.BLESSINGS.forEach((b) => { full[b.id] = b.max; });
  delete full.fengmang;
  const c2 = M.drawChoices({ seed: 1, blessings: full, picks: 0 });
  assert.deepStrictEqual(Array.from(c2), ['fengmang'], '满层的劫运不再出现');
  let tianHits = 0;
  for (let i = 0; i < 2000; i++) {
    const r = M.drawChoices({ seed: i, blessings: {}, picks: 0 });
    tianHits += r.filter((id) => M.BLESSING_MAP[id].rarity === 'tian').length;
  }
  assert.ok(tianHits > 300 && tianHits < 1400, `天品出现次数应适中: ${tianHits}`);

  const mods = M.buildMods({ fengmang: 3, xuanjia: 2, hanshuang: 2, tiannu: 1, bumie: 1, ghost: 5 });
  assert.ok(Math.abs(mods.atkMult - 1.3) < 1e-9);
  assert.ok(Math.abs(mods.frontDmgTakenMult - 0.7) < 1e-9);
  assert.ok(Math.abs(mods.freezeChance - 0.3) < 1e-9);
  assert.ok(Math.abs(mods.ultDmgMult - 1.35) < 1e-9);
  assert.strictEqual(mods.revives, 1);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(M.buildMods({}))), JSON.parse(JSON.stringify(M.buildMods(null))));

  const st = { stage: { best: 40 }, squad: SQUAD.slice(), heroId: SQUAD[0], unlockedHeroes: HEROES.slice() };
  M.startRun(st, Date.now(), 1234);
  assert.strictEqual(M.pickBlessing(st, 'fengmang').ok, false, '无可选时不能选');
  M.onWaveResult(st, true);
  const r2 = M.onWaveResult(st, true);
  assert.ok(r2.needPick && st.mijing.run.choices.length === 3);
  assert.strictEqual(M.pickBlessing(st, 'not-offered-' + 1).ok, false);
  const pick = st.mijing.run.choices[0];
  assert.ok(M.pickBlessing(st, pick).ok);
  assert.strictEqual(st.mijing.run.blessings[pick], 1);
  assert.strictEqual(st.mijing.run.choices, null);
  const sum = M.endRun(st, 'quit');
  assert.strictEqual(st.mijing.run, null, '结束后劫运清空');
  assert.strictEqual(sum.blessings[pick], 1);
});

// 5. 劫运在战斗内生效
check('劫运效果在战斗内核生效（攻击、减伤、冰封、溅射、吸血、不灭）', () => {
  const p = B.playerStats(simState(W, 8, 1));
  const enemy = M.waveEnemy({ seed: 3, ref: 29 }, 6);
  const wr = (mods) => {
    let w = 0;
    for (let i = 1; i <= 60; i++) if (B.createSession(p, enemy, i, mods).runToEnd(true).win) w++;
    return w / 60;
  };
  const base = wr(null);
  const buffed = wr(M.buildMods({ fengmang: 3, jinshen: 3, tiannu: 1 }));
  assert.ok(buffed > base + 0.15, `加成后胜率应明显提高: ${base} -> ${buffed}`);

  const s1 = B.createSession(p, enemy, 5, M.buildMods({ xuanjia: 2 }));
  assert.ok(s1.playerUnits.some((u) => u.dmgTakenMult === 0.7) || s1.playerUnits.every((u) => u.r > 5));
  s1.playerUnits.filter((u) => u.r > 5).forEach((u) => assert.ok(!u.dmgTakenMult));

  const s2 = B.createSession(p, enemy, 5, M.buildMods({ hanshuang: 2, jianqi: 2 }));
  const r2 = s2.runToEnd(true);
  assert.ok(r2.events.some((e) => e.froze), '应出现冰封');
  assert.ok(r2.events.some((e) => Array.isArray(e.splash) && e.splash.length > 0), '应出现溅射');

  const s3 = B.createSession(p, enemy, 9, M.buildMods({ shihun: 2 }));
  const r3 = s3.runToEnd(true);
  assert.ok(r3.events.some((e) => e.type === 'ult' && e.who === 'a' && e.heals.length > 0), '绝技吸血产生治疗');

  const hard = M.waveEnemy({ seed: 3, ref: 60 }, 8);
  const s4 = B.createSession(p, hard, 11, M.buildMods({ bumie: 1 }));
  s4.runToEnd(true);
  assert.strictEqual(s4.playerUnits.filter((u) => u.revived).length, 1, '不灭每波只触发一次');

  const s5 = B.createSession(p, enemy, 1, M.buildMods({ xushi: 2 }));
  s5.playerUnits.forEach((u) => assert.ok(u.rage === 60));
});

// 6. 奖励
check('奖励：按通过波次累加，全通额外奖励，量级受控', () => {
  const ref = 100;
  const perH = 6 + 0.4 * ref;
  const r0 = M.rewardsFor(ref, 0);
  assert.deepStrictEqual([r0.lingyu, r0.peaches, r0.full], [0, 0, false]);
  const r3 = M.rewardsFor(ref, 3);
  assert.strictEqual(r3.lingyu, 3 * Math.ceil(perH * 0.1));
  assert.strictEqual(r3.peaches, 3);
  const r4 = M.rewardsFor(ref, 4);
  assert.strictEqual(r4.lingyu - r3.lingyu, Math.ceil(perH * 0.2), '精英波双倍灵玉');
  assert.strictEqual(r4.peaches - r3.peaches, 3);
  const r8 = M.rewardsFor(ref, 8);
  assert.ok(r8.full);
  assert.strictEqual(r8.lingyu, 6 * Math.ceil(perH * 0.1) + 2 * Math.ceil(perH * 0.2) + Math.ceil(perH * 0.6));
  assert.strictEqual(r8.peaches, 6 + 6 + 5 + Math.floor(ref / 30));
  for (const r of [10, 50, 150, 300]) {
    const full = M.rewardsFor(r, 8);
    const hours = full.lingyu / (6 + 0.4 * r);
    assert.ok(hours <= 1.9, `ref ${r} 单局灵玉不超过约 1.9 小时挂机（含向上取整）: ${hours}`);
    assert.ok(full.peaches <= 30);
  }
  const st = { stage: { best: ref }, lingyu: 10, tree: { peaches: 2 }, squad: SQUAD.slice(), heroId: SQUAD[0], unlockedHeroes: HEROES.slice() };
  M.startRun(st, Date.now(), 1);
  for (let i = 0; i < 5; i++) {
    const res = M.onWaveResult(st, true);
    if (res.needPick) M.pickBlessing(st, st.mijing.run.choices[0]);
  }
  const res = M.onWaveResult(st, false);
  assert.ok(res.ended && !res.win && res.wave === 6);
  const sum = M.endRun(st, 'fail');
  assert.strictEqual(sum.cleared, 5);
  assert.strictEqual(st.lingyu, 10 + M.rewardsFor(ref, 5).lingyu);
  assert.strictEqual(st.tree.peaches, 2 + M.rewardsFor(ref, 5).peaches);
  assert.strictEqual(st.mijing.bestWave, 5);
  assert.strictEqual(st.mijing.clears, 0);
  M.startRun(st, Date.now(), 2);
  for (let i = 0; i < 8; i++) {
    const r = M.onWaveResult(st, true);
    if (r.needPick) M.pickBlessing(st, st.mijing.run.choices[0]);
    if (r.ended) assert.ok(r.full);
  }
  M.endRun(st, 'clear');
  assert.strictEqual(st.mijing.clears, 1);
  assert.strictEqual(st.mijing.bestWave, 8);
});

// 7. 存档兼容 / 迁移
check('旧存档无 mijing 字段可正常加载；坏数据被修正；进行中的局可恢复；轮回保留次数', () => {
  const now = Date.now();
  const oldSave = {
    version: 3, heroId: 'lanyi', qi: 5, stones: 9, realmIndex: 5, lastSaveTime: now, createdAt: now - 1000,
    stage: { cur: 31, best: 30, idleAt: now, squad: ['lanyi'] }, tree: { lv: 1, peaches: 4, gifted: true, regenAt: now, upEnd: 0 },
    squad: ['lanyi'], unlockedHeroes: ['lanyi'], lingyu: 7
  };
  let storage = memoryStorage({ xiuxian_idle_save_v1: JSON.stringify(oldSave) });
  let w = runtime({ storage });
  const loaded = w.GameState.loadGame();
  assert.strictEqual(loaded.isNew, false);
  const st = w.GameState.state;
  assert.deepStrictEqual(JSON.parse(JSON.stringify(st.mijing)), { date: '', used: 0, runs: 0, clears: 0, bestWave: 0, run: null });
  assert.strictEqual(st.stage.best, 30);
  assert.strictEqual(st.lingyu, 7);
  assert.strictEqual(st.version, 3);

  // v1 旧档也能迁移并带上默认字段
  storage = memoryStorage({ xiuxian_idle_save_v1: JSON.stringify({ realmIndex: 2, qi: 1, stones: 1, lastSaveTime: now }) });
  w = runtime({ storage });
  w.GameState.loadGame();
  assert.strictEqual(w.GameState.state.mijing.run, null);

  // 坏数据
  storage = memoryStorage({ xiuxian_idle_save_v1: JSON.stringify(Object.assign({}, oldSave, { mijing: { used: 99, date: 5, run: { ref: 'x' } } })) });
  w = runtime({ storage });
  w.GameState.loadGame();
  assert.strictEqual(w.GameState.state.mijing.used, 2);
  assert.strictEqual(w.GameState.state.mijing.date, '');
  assert.strictEqual(w.GameState.state.mijing.run, null);

  // 进行中的局存盘后恢复，含劫运与待选项
  const run = { seed: 42, ref: 30, wave: 5, cleared: 4, blessings: { fengmang: 2, ghost: 1, tiannu: 9 }, choices: ['jinshen', 'bad', 'tiebi'], picks: 1 };
  storage = memoryStorage({ xiuxian_idle_save_v1: JSON.stringify(Object.assign({}, oldSave, { mijing: { date: '2026-11-15', used: 1, runs: 3, run } })) });
  w = runtime({ storage });
  w.GameState.loadGame();
  const r = w.GameState.state.mijing.run;
  assert.strictEqual(r.wave, 5);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r.blessings)), { fengmang: 2, tiannu: 1 });
  assert.deepStrictEqual(Array.from(r.choices), ['jinshen', 'tiebi']);
  w.GameState.saveGame();
  const reparsed = JSON.parse(storage._data.xiuxian_idle_save_v1);
  assert.strictEqual(reparsed.mijing.run.seed, 42);

  // 轮回不重置秘境次数
  w.GameState.state.realmIndex = 20;
  w.GameState.state.totalDaoGuo = 0;
  w.GameState.state.lifetimeQi = 1e40;
  w.GameState.state.qi = 1e40;
  const re = w.GameState.performReincarnation();
  if (re.ok) {
    assert.strictEqual(w.GameState.state.mijing.used, 1);
    assert.strictEqual(w.GameState.state.mijing.run.seed, 42);
  }
});

// 8. 平衡抽样：卡在章末 Boss 的玩家前 3 波基本稳过，全通是挑战但可达成
check('平衡抽样：前 3 波高胜率，全通率处于挑战区间', () => {
  const st0 = simState(W, 8, 2);
  const p = B.playerStats(st0);
  let wall = 1;
  const wrStage = (n) => {
    let w = 0;
    for (let i = 1; i <= 30; i++) if (B.simulate(p, n, i).win) w++;
    return w / 30;
  };
  // 精英关（13/23/…）是尖刺，不能当成「卡在章末 Boss」的墙。
  while (wall < 300) {
    const next = wall + 1;
    if (typeof B.isEliteStage === 'function' && B.isEliteStage(next)) {
      wall = next;
      continue;
    }
    if (wrStage(next) >= 0.5) wall = next;
    else break;
  }
  let full = 0;
  let early = 0;
  const N = 60;
  for (let i = 1; i <= N; i++) {
    const st = Object.assign(simState(W, 8, 2), { stage: { best: wall }, lingyu: 0, tree: {} });
    M.startRun(st, Date.now(), i * 101);
    if (i === 1) {
      const anchor = st.mijing.run.anchor;
      assert.ok(anchor >= Math.floor(M.stageBaseCp(wall)) && anchor <= Math.ceil(M.stageBaseCp(wall) * 2), '锚点夹在关卡区间内');
      assert.ok(anchor >= Math.floor(p.baseCp * 0.85), '锚点不低于满编战力的 85%');
      const again = Object.assign(simState(W, 8, 2), { stage: { best: wall } });
      M.startRun(again, Date.now(), 777);
      assert.strictEqual(again.mijing.run.anchor, anchor, '实测锚点确定性（与局种子无关）');
      const weak = Object.assign(simState(W, 8, 2), { stage: { best: wall }, squad: [SQUAD[0]] });
      M.startRun(weak, Date.now(), 1);
      assert.ok(weak.mijing.run.anchor >= anchor * 0.7, `少带人开局不能明显压低难度: ${weak.mijing.run.anchor} vs ${anchor}`);
      assert.strictEqual(M.anchorCp(wall, 1e12), M.stageBaseCp(wall) * 2);
      assert.strictEqual(M.anchorCp(wall, 1), M.stageBaseCp(wall));
    }
    for (;;) {
      const run = st.mijing.run;
      const sim = B.createSession(p, M.waveEnemy(run, run.wave), M.waveSeed(run, run.wave), M.buildMods(run.blessings)).runToEnd(true);
      const res = M.onWaveResult(st, sim.win);
      if (res.ended) break;
      if (res.needPick) M.pickBlessing(st, st.mijing.run.choices[i % 3] || st.mijing.run.choices[0]);
    }
    const sum = M.endRun(st);
    if (sum.full) full++;
    if (sum.cleared >= 3) early++;
  }
  console.log(`   最高通关 ${wall} 关的玩家：全通 ${full}/${N}，过前 3 波 ${early}/${N}`);
  assert.ok(early / N >= 0.9, '前 3 波应基本稳过');
  assert.ok(full / N >= 0.1 && full / N <= 0.8, `全通率应在挑战区间: ${full / N}`);
});

// 9. 闯关页 UI 冒烟（无浏览器：vm + 极简假 DOM）
check('闯关页秘境 UI 冒烟：开启、播放/跳过、择运、结算、返回闯关、普通推关不受影响', () => {
  function makeEl(id) {
    const el = {
      id, tagName: 'DIV', children: [], style: { setProperty() {}, removeProperty() {} }, dataset: {}, attributes: {}, hidden: false, disabled: false,
      textContent: '', _html: '', listeners: {}, parentNode: null, className: '',
      classList: {
        set: new Set(),
        add(...c) { c.forEach((x) => this.set.add(x)); },
        remove(...c) { c.forEach((x) => this.set.delete(x)); },
        toggle(c, on) { const v = on === undefined ? !this.set.has(c) : Boolean(on); if (v) this.set.add(c); else this.set.delete(c); return v; },
        contains(c) { return this.set.has(c); }
      },
      get innerHTML() { return this._html; },
      set innerHTML(v) { this._html = String(v); this.children = []; },
      setAttribute(k, v) { this.attributes[k] = String(v); },
      getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null; },
      removeAttribute(k) { delete this.attributes[k]; },
      addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); },
      removeEventListener() {},
      appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
      removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; },
      remove() {},
      querySelector() { return makeEl(''); },
      querySelectorAll() { return []; },
      closest() { return null; },
      contains() { return false; },
      getBoundingClientRect() { return { left: 0, top: 0, width: 360, height: 480, right: 360, bottom: 480 }; },
      focus() {}, blur() {},
      offsetWidth: 360, offsetHeight: 480, clientWidth: 360, clientHeight: 480
    };
    return el;
  }
  const els = {};
  const document = {
    hidden: false,
    activeElement: null,
    getElementById(id) { if (!els[id]) els[id] = makeEl(id); return els[id]; },
    createElement(tag) { const e = makeEl(''); e.tagName = String(tag).toUpperCase(); return e; },
    querySelector() { return makeEl(''); },
    querySelectorAll() { return []; },
    addEventListener() {},
    body: makeEl('body')
  };
  let timers = [];
  let clock = Date.now();
  const sandbox = {
    window: {}, console, document, localStorage: memoryStorage(), navigator: { userAgent: 'node' },
    setTimeout(fn, ms) { const id = timers.length + 1; timers.push({ id, fn, at: clock + (ms || 0), done: false }); return id; },
    clearTimeout(id) { const t = timers.find((x) => x.id === id); if (t) t.done = true; },
    setInterval() { return 0; }, clearInterval() {},
    requestAnimationFrame(fn) { return sandbox.setTimeout(fn, 16); },
    Image: function () {}, ResizeObserver: undefined,
    getComputedStyle() { return { getPropertyValue: () => '' }; }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.window.addEventListener = () => {};
  sandbox.window.innerWidth = 390;
  sandbox.window.innerHeight = 844;
  ['config', 'equip', 'state', 'titles', 'battle', 'mijing', 'stage-ui'].forEach((f) => {
    const src = text(`js/${f}.js`);
    assert.ok(!src.includes('getImageData'), `${f}.js 不应使用 getImageData`);
    vm.runInNewContext(src, sandbox, { filename: `${f}.js` });
  });
  const GS = sandbox.GameState;
  GS.loadGame();
  const st = GS.state;
  Object.assign(st, simState(sandbox, 10, 2));
  st.realmIndex = 10;
  st.stage.best = 39;
  st.stage.cur = 40;
  st.stage.auto = false;
  const logs = [];
  sandbox.StageUI.init({ log: (m) => logs.push(m), onChange() {}, switchTab() {} });
  sandbox.StageUI.render();
  assert.strictEqual(M.attemptsLeft(st, Date.now()), 2);

  function drain(maxSteps) {
    let n = 0;
    while (n < maxSteps) {
      const pending = timers.filter((t) => !t.done).sort((a, b) => a.at - b.at);
      if (!pending.length) break;
      const t = pending[0];
      t.done = true;
      clock = Math.max(clock, t.at);
      t.fn();
      n++;
    }
    return n;
  }

  // 开启
  sandbox.StageUI.openMijingModal('intro');
  assert.ok(els['mijing-modal'].classList.contains('active'));
  assert.ok(els['mijing-modal-body'].innerHTML.includes('第 39 关'));
  assert.ok(sandbox.StageUI.startMijingRun());
  assert.strictEqual(st.mijing.used, 1);
  assert.ok(st.mijing.run);
  assert.strictEqual(els['btn-mijing-detail'].textContent, '返回闯关');
  assert.ok(els['stage-chapter-title'].textContent.startsWith('秘境劫运'));
  assert.ok(els['battle-stage-enemy-title'].textContent.startsWith('秘境 1/8 波'));
  assert.strictEqual(els['btn-stage-challenge'].textContent, '迎 战');
  assert.strictEqual(els['mijing-run-card'].style.display, '');

  let guard = 0;
  let picks = 0;
  let played = false;
  while (st.mijing.run && guard < 40) {
    guard++;
    const run = st.mijing.run;
    if (Array.isArray(run.choices) && run.choices.length) {
      assert.strictEqual(els['btn-stage-challenge'].textContent, '择 运');
      assert.ok(sandbox.StageUI.pickMijingBlessing(run.choices[0]));
      picks++;
      continue;
    }
    assert.ok(sandbox.StageUI.startBattle(true), 'wave battle should start');
    if (!played) {
      drain(4000); // 第一波完整播放（含绝技演出计时器）
      played = true;
    } else {
      sandbox.StageUI.skipBattle();
    }
  }
  assert.ok(!st.mijing.run, '秘境应结束');
  assert.ok(els['mijing-modal'].classList.contains('active'), '应弹出结算');
  assert.ok(/秘境(全通|止步)/.test(els['mijing-modal-title'].textContent));
  assert.ok(st.mijing.bestWave >= 0 && st.mijing.bestWave <= 8);
  if (st.mijing.bestWave >= 2) assert.ok(picks >= 1);
  sandbox.StageUI.closeMijingModal();
  assert.strictEqual(M.attemptsLeft(st, Date.now()), 1);
  assert.ok(els['stage-chapter-title'].textContent.startsWith('第 4 章'));
  // 普通推关仍可进行，且不会消耗秘境次数
  const before = st.stage.wins + st.stage.losses;
  assert.ok(sandbox.StageUI.startBattle(true));
  sandbox.StageUI.skipBattle();
  assert.strictEqual(st.stage.wins + st.stage.losses, before + 1);
  assert.strictEqual(st.mijing.used, 1);

  // 中途主动结束：领取已得奖励
  sandbox.StageUI.openMijingModal('intro');
  assert.ok(sandbox.StageUI.startMijingRun());
  assert.ok(sandbox.StageUI.startBattle(true));
  sandbox.StageUI.skipBattle();
  drain(50);
  if (st.mijing.run) {
    const lingyuBefore = st.lingyu;
    sandbox.StageUI.closeMijingModal();
    assert.ok(sandbox.StageUI.quitMijingRun());
    assert.ok(st.lingyu > lingyuBefore);
    assert.ok(els['mijing-modal-title'].textContent.includes('主动结束'));
    sandbox.StageUI.closeMijingModal();
  }
  assert.strictEqual(st.mijing.used, 2);
  sandbox.StageUI.render();
  assert.strictEqual(M.attemptsLeft(st, Date.now()), 0);
});

// 10. 页面引用
check('index.html 引用 mijing.js 且有入口/面板/弹窗节点', () => {
  const index = text('index.html');
  assert.match(index, /<script src="js\/battle\.js\?v=\d+"><\/script>\s*(?:<script src="js\/bonds\.js\?v=\d+"><\/script>\s*)?<script src="js\/mijing\.js\?v=\d+"><\/script>\s*(?:<script src="js\/tower\.js\?v=\d+"><\/script>\s*)?<script src="js\/gear\.js/);
  ['nav-btn-more', 'more-modal', 'mijing-run-card', 'mijing-modal', 'mijing-modal-body', 'mijing-modal-actions', 'btn-mijing-detail'].forEach((id) => {
    assert.ok(index.includes(`id="${id}"`), id);
  });
  M.BLESSINGS.forEach((b) => assert.ok(fs.existsSync(path.join(root, `assets/icons/${b.icon}@64.webp`)), `图标存在 ${b.icon}`));
  assert.ok(text('css/style.css').includes('.mijing-modal-body::-webkit-scrollbar'));
});

check('测力常数在 config，同签名缓存避免重复模拟', () => {
  const mc = CFG.MIJING;
  assert.ok(mc, 'GameConfig.MIJING 应存在');
  assert.strictEqual(mc.PROBE_SIMS, 12);
  assert.strictEqual(mc.PROBE_ITERS, 7);
  assert.strictEqual(mc.ANCHOR_FLOOR_MULT, 0.85);
  assert.ok(!/const PROBE_SIMS/.test(text('js/mijing.js')), 'PROBE_* 不应再写死在 mijing.js');
  assert.ok(text('js/mijing.js').includes('ANCHOR_FLOOR_MULT'));
  assert.ok(text('js/mijing.js').includes('strengthCache'));
  assert.ok(text('js/stage-ui.js').includes('Codex.renderBadge'), '战斗结算后立刻刷新图鉴红点');

  const st = simState(W, 8, 1);
  st.stage = st.stage || {};
  st.stage.best = 20;
  const a = M.measureStrength(st, 20);
  assert.ok(a > 0);
  let sessions = 0;
  const orig = B.createSession.bind(B);
  B.createSession = function () {
    sessions += 1;
    return orig.apply(this, arguments);
  };
  try {
    const b = M.measureStrength(st, 20);
    assert.strictEqual(b, a, '同队伍同战力签名应命中缓存，结果一致');
    assert.strictEqual(sessions, 0, '命中缓存时不应再跑探测模拟');
    const weak = Object.assign(simState(W, 8, 1), { stage: { best: 20 }, squad: [SQUAD[0]] });
    const c = M.measureStrength(weak, 20);
    assert.ok(sessions > 0, '换队后应重新测力');
    assert.ok(c > 0);
    assert.notStrictEqual(c, a);

    const src = text('js/mijing.js');
    assert.ok(/cp:.*atk:.*hp:.*def:.*spd:.*crit:/.test(src), '测力签名含加成后战力与攻击/生命/防御/速度/暴击');
    assert.ok(!/p\.baseCp \|\| p\.cp/.test(src), '满编战力与签名不用加成前 baseCp');
    const origPS = B.playerStats.bind(B);
    sessions = 0;
    B.playerStats = function (state) {
      const p = origPS(state);
      return Object.assign({}, p, { atk: p.atk * 1.1, cp: p.cp, baseCp: p.baseCp });
    };
    try {
      const d = M.measureStrength(st, 20);
      assert.ok(sessions > 0, '同战力但属性构成不同应重新测力');
      assert.ok(d > 0);
    } finally {
      B.playerStats = origPS;
    }
    sessions = 0;
    B.playerStats = function (state) {
      const p = origPS(state);
      return Object.assign({}, p, { cp: (p.cp || 0) * 1.05, baseCp: p.baseCp });
    };
    try {
      const e = M.measureStrength(st, 20);
      assert.ok(sessions > 0, '加成后 p.cp 变化即使 baseCp 不变也应重新测力');
      assert.ok(e > 0);
    } finally {
      B.playerStats = origPS;
    }
  } finally {
    B.createSession = orig;
  }
});

check('测力可分片预热，结果与同步测力一致', async () => {
  const st = simState(W, 8, 1);
  st.stage = st.stage || {};
  st.stage.best = 20;
  M.clearStrengthCache();
  const syncVal = M.measureStrength(st, 20);
  assert.ok(syncVal > 0);
  M.clearStrengthCache();
  const warmVal = await new Promise((resolve) => {
    M.warmupStrength(st, 20, resolve);
  });
  assert.strictEqual(warmVal, syncVal, '分片预热与同步测力应得到同一结果');
  let sessions = 0;
  const orig = B.createSession.bind(B);
  B.createSession = function () {
    sessions += 1;
    return orig.apply(this, arguments);
  };
  try {
    assert.strictEqual(M.measureStrength(st, 20), syncVal);
    assert.strictEqual(sessions, 0, '预热写入同一缓存');
  } finally {
    B.createSession = orig;
  }
});


check('v1 波次强度与推荐战力隔离在 estimateWaveStrength / recommendedCp，只读测力缓存', () => {
  assert.ok(typeof M.estimateWaveStrength === 'function' && typeof M.recommendedCp === 'function');
  const st = simState(W, 10, 2);
  st.stage = { best: 39, cur: 40, squad: SQUAD.slice() };
  if (B.ensureFormation) B.ensureFormation(st);
  M.clearStrengthCache();
  const cheap = M.estimateWaveStrength(st, 39, 1, { cachedOnly: true });
  assert.ok(cheap > 0, '无缓存时用下限估值，不强制同步测力');
  const w8 = M.estimateWaveStrength(st, 39, 8);
  const rec = M.recommendedCp(st, 39);
  assert.strictEqual(rec, w8, '推荐战力取第 8 波预估强度');
  const waves = M.estimateAllWaves(st, 39);
  assert.strictEqual(waves.length, 8);
  for (let i = 1; i < 8; i++) {
    assert.ok(waves[i].strength >= waves[i - 1].strength, '波次强度单调不降');
  }
  assert.strictEqual(waves[7].kind, 'boss');
  assert.strictEqual(waves[3].kind, 'elite');
  const measured = M.measureStrength(st, 39);
  const floor = Math.max((B.playerStats(st).cp || 0) * ((CFG.MIJING && CFG.MIJING.ANCHOR_FLOOR_MULT) || 0.85), 0);
  const anchor = M.anchorCp(39, Math.max(measured, floor));
  assert.strictEqual(M.estimateWaveStrength(st, 39, 8), Math.round(anchor * M.wavePlan(8).mult));
  assert.strictEqual(M.peekMeasuredStrength(st, 39), measured);
});

check('开局展示推荐战力与每波预估，结算列出逐波奖励和已通 X/8；不做失败补偿', () => {
  const ui = text('js/stage-ui.js');
  assert.ok(ui.includes('mijingIntroProbeHtml') && ui.includes('推荐战力'));
  assert.ok(ui.includes('mijingResultWavesHtml') && ui.includes('已过 ${r.cleared}/${M.WAVES} 波'));
  assert.ok(!ui.includes('已通 ${done}/${M.WAVES}'), '结算只保留一句已过波次，去掉重复的已通');
  assert.ok(ui.includes('warmupStrength(s, ref, () => {'));
  assert.ok(!ui.includes('返还半次') && !ui.includes('failureRefund') && !/补偿次数/.test(ui), '本批不做失败补偿');
  const css = text('css/style.css');
  assert.ok(css.includes('.mijing-wave-list') && css.includes('scrollbar-width: none'));
  assert.ok(ui.includes('mijing-wave-rewards-wrap'), '结算列表包一层以便底部渐隐');
  assert.ok(/@media \(max-width: 430px\)[\s\S]{0,400}\.mijing-wave-rewards-wrap::after/.test(css), '430 宽下结算列表底部有渐隐，提示可滚动');
});

Promise.all(pending)
  .then(() => {
    console.log(`mijing.test.js ok: ${passed} checks`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

