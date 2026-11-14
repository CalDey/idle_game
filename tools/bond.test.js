// 仙缘阵法（羁绊）：标签覆盖、阈值、加成生效、无羁绊时战斗与改动前逐事件一致、秘境叠加、存档不新增字段、
// 以及闯关页/队伍弹窗 UI 的无浏览器冒烟（vm + 极简假 DOM，不使用 getImageData / 浏览器自动化）。
// 用法：node tools/bond.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
// 羁绊改动前的 main（已含秘境 mods 接口）
const PRE_BOND = '25a3d1700b03b802caf6e86dde1bbb0715c31a33';
const text = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });

function memoryStorage() {
  const data = {};
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    _data: data
  };
}

function runtime(opts) {
  const o = opts || {};
  const sandbox = { window: {}, console, localStorage: memoryStorage() };
  sandbox.globalThis = sandbox.window;
  vm.runInNewContext(text('js/config.js'), sandbox);
  vm.runInNewContext(text('js/equip.js'), sandbox);
  vm.runInNewContext(o.battleSource || text('js/battle.js'), sandbox);
  sandbox.window.GameState = {
    getCurrentStage: () => sandbox.window.GameConfig.REALM_STAGES[0],
    getStonePerSec: () => 1,
    getQiPerSec: () => 1
  };
  if (o.bonds !== false) vm.runInNewContext(text('js/bonds.js'), sandbox);
  if (o.mijing) vm.runInNewContext(o.mijingSource || text('js/mijing.js'), sandbox);
  return sandbox.window;
}

const W = runtime({ mijing: true });
const CFG = W.GameConfig;
const B = W.Battle;
const Bd = W.Bonds;
const ALL = CFG.HEROES.map((h) => h.id);
const XIAN = CFG.HEROES.filter((h) => h.quality === 'xian').map((h) => h.id);
const NON_XIAN = ALL.filter((id) => !XIAN.includes(id));

function simState(win, realmIndex, qIndex, squad) {
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
  return { realmIndex, totalDaoGuo: 0, gongfa: {}, dongfu: {}, equip, heroId: squad[0], squad: squad.slice(), unlockedHeroes: ALL.slice() };
}

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

// 无任何激活羁绊的 6 人阵容（每个标签至多 1 人）
const NO_BOND_SQUAD = ['cloak', 'saintess', 'shuanghua', 'fenxiao', 'sweetmaid'];

check('全部角色均有 1~2 个合法标签；每个羁绊用非仙品角色即可激活', () => {
  assert.strictEqual(ALL.length, 16);
  ALL.forEach((id) => {
    const tags = Bd.tagsOf(id);
    assert.ok(tags.length >= 1 && tags.length <= 2, `${id} 标签数 ${tags.length}`);
    assert.strictEqual(new Set(tags).size, tags.length, `${id} 标签不重复`);
    tags.forEach((t) => assert.ok(Bd.BOND_MAP[t], `${id} 标签 ${t} 合法`));
  });
  Object.keys(Bd.HERO_TAGS).forEach((id) => assert.ok(ALL.includes(id), `HERO_TAGS 中的 ${id} 是真实角色`));
  assert.ok(Bd.BONDS.length >= 4 && Bd.BONDS.length <= 6);
  Bd.BONDS.forEach((b) => {
    assert.deepStrictEqual(Array.from(b.tiers.map((t) => t.need)), [2, 3], `${b.id} 档位 2/3`);
    const holders = ALL.filter((id) => Bd.tagsOf(id).includes(b.id));
    const nonXian = holders.filter((id) => NON_XIAN.includes(id));
    assert.ok(holders.length >= 3, `${b.id} 至少 3 名角色可凑满`);
    assert.ok(nonXian.length >= 2, `${b.id} 非仙品角色即可激活（${nonXian.join(',')}）`);
    assert.ok(Bd.evaluate(nonXian).find((e) => e.id === b.id).active);
  });
  assert.ok(Bd.evaluate(NO_BOND_SQUAD).every((e) => !e.active));
  assert.strictEqual(Bd.buildMods(NO_BOND_SQUAD), null);
  assert.strictEqual(Bd.buildMods([]), null);
  // 无「必选阵容」：任意 6 人组合最多同时满级的羁绊数有限，且至少 20 种不同的非仙品阵容可激活 ≥2 个羁绊
  let multi = 0;
  const combos = (arr, k, start, cur, out) => {
    if (cur.length === k) { out.push(cur.slice()); return; }
    for (let i = start; i < arr.length; i++) { cur.push(arr[i]); combos(arr, k, i + 1, cur, out); cur.pop(); }
  };
  const sixes = [];
  combos(NON_XIAN, 6, 0, [], sixes);
  sixes.forEach((sq) => { if (Bd.activeBonds(sq).length >= 2) multi++; });
  assert.ok(multi >= 20, `多羁绊非仙品阵容数 ${multi}`);
});

check('阈值与进度：1/2 未激活，2 人一档，3 人二档（满级），超出不再提升', () => {
  const jian = (ids) => Bd.evaluate(ids).find((e) => e.id === 'jian');
  let e = jian(['ziling']);
  assert.strictEqual(e.count, 1); assert.ok(!e.active); assert.strictEqual(e.progressText, '剑修 1/2');
  e = jian(['ziling', 'qinglan']);
  assert.ok(e.active); assert.strictEqual(e.level, 1); assert.strictEqual(e.progressText, '剑修 2/3'); assert.ok(!e.maxed);
  e = jian(['ziling', 'qinglan', 'lanyi']);
  assert.strictEqual(e.level, 2); assert.ok(e.maxed); assert.strictEqual(e.progressText, '剑修 3/3（满）');
  e = jian(['ziling', 'ziling', 'qinglan']);
  assert.strictEqual(e.count, 2, '重复 id 去重');
  const ming = Bd.evaluate(['cloak', 'ziling', 'honglian', 'molan', 'youming']).find((x) => x.id === 'ming');
  assert.strictEqual(ming.count, 5); assert.strictEqual(ming.level, 2);
  assert.deepStrictEqual(Array.from(Bd.tagNames('miko')), ['烈焰', '辅佐']);
});

check('buildMods / mergeMods 数值：成员加成只给持标签角色，全队加成给全体', () => {
  const m = Bd.buildMods(['ziling', 'qinglan', 'saintess', 'jianghua', 'miko', 'sweetmaid']);
  assert.ok(Math.abs(m.heroMods.ziling.ultDmgMult - 1.15) < 1e-9);
  assert.ok(Math.abs(m.heroMods.qinglan.ultDmgMult - 1.15) < 1e-9);
  assert.ok(!m.heroMods.saintess);
  assert.ok(Math.abs(m.hpMult - 1.05) < 1e-9, '灵愈 2 人 全队生命 +5%');
  assert.strictEqual(m.rageStart, 15, '辅佐 2 人 开战怒气 +15');
  assert.strictEqual(m.heroMods.miko.atkSplash, 0.15);
  assert.strictEqual(m.heroMods.jianghua.atkSplash, 0.15);
  const m3 = Bd.buildMods(['qinglan', 'shuanghua', 'yueshi', 'saintess', 'qingkui']);
  assert.strictEqual(m3.heroMods.yueshi.freezeChance, 0.15);
  assert.ok(Math.abs(m3.hpMult - 1.1) < 1e-9);
  const merged = Bd.mergeMods({ atkMult: 1.2, hpMult: 1.1, freezeChance: 0.1 }, m3);
  assert.ok(Math.abs(merged.hpMult - 1.2) < 1e-9, '倍率按增量相加');
  assert.ok(Math.abs(merged.atkMult - 1.2) < 1e-9);
  assert.strictEqual(merged.freezeChance, 0.1);
  assert.strictEqual(merged.heroMods.yueshi.freezeChance, 0.15);
  assert.strictEqual(Bd.mergeMods(null, null), null);
});

const stripMod = (k, v) => (/^mod[A-Z]/.test(k) ? undefined : v);

check('无羁绊时战斗与改动前 battle.js 逐事件一致；秘境劫运 mods 结果也与改动前一致', () => {
  const oldW = runtime({ battleSource: git(['show', `${PRE_BOND}:js/battle.js`]), bonds: false, mijing: true, mijingSource: git(['show', `${PRE_BOND}:js/mijing.js`]) });
  const newW = runtime({ mijing: true });
  const squads = [NO_BOND_SQUAD, ['lanyi'], ['saintess', 'cloak', 'miko', 'shuanghua', 'ziling', 'fenxiao']];
  const blessingsList = [{ fengmang: 2, xuanjia: 1 }, { hanshuang: 2, jianqi: 2, shihun: 1 }, { bumie: 1, xushi: 2, jinshen: 1 }];
  let compared = 0;
  for (const sq of squads) {
    for (const [ri, qi, n] of [[3, 0, 9], [8, 1, 30], [12, 2, 57], [16, 3, 90]]) {
      const pOld = oldW.Battle.playerStats(simState(oldW, ri, qi, sq));
      const pNew = newW.Battle.playerStats(simState(newW, ri, qi, sq));
      const bondMods = newW.Bonds.buildMods(sq);
      for (let seed = 1; seed <= 12; seed++) {
        const a = JSON.stringify(oldW.Battle.createSession(pOld, n, seed).runToEnd(true));
        if (bondMods === null) {
          assert.strictEqual(JSON.stringify(newW.Battle.createSession(pNew, n, seed, bondMods).runToEnd(true)), a, `无羁绊 ${sq} stage ${n} seed ${seed}`);
          assert.strictEqual(JSON.stringify(newW.Battle.simulate(pNew, n, seed)), JSON.stringify(oldW.Battle.simulate(pOld, n, seed)));
          compared++;
        }
        const bl = blessingsList[seed % blessingsList.length];
        const oldM = oldW.Mijing.buildMods(bl);
        const newM = newW.Mijing.buildMods(bl);
        assert.deepStrictEqual(JSON.parse(JSON.stringify(newM)), JSON.parse(JSON.stringify(oldM)), '劫运 mods 定义不变');
        // 事件日志与胜负完全一致；units 快照仅多出逐角色 mod* 字段（实现由全队改为逐角色），剔除后也一致
        const ao = JSON.stringify(oldW.Battle.createSession(pOld, n, seed, oldM).runToEnd(true), stripMod);
        const an = JSON.stringify(newW.Battle.createSession(pNew, n, seed, newM).runToEnd(true), stripMod);
        assert.strictEqual(an, ao, `劫运 ${JSON.stringify(bl)} stage ${n} seed ${seed} 与改动前一致`);
      }
    }
  }
  assert.ok(compared >= 90, `无羁绊对比场次 ${compared}`);
  // 同一阵容 winRate 不传 mods 与改动前一致
  const st = simState(newW, 8, 1, NO_BOND_SQUAD);
  assert.strictEqual(newW.Battle.winRate(st, 30, 30), oldW.Battle.winRate(simState(oldW, 8, 1, NO_BOND_SQUAD), 30, 30));
});

check('加成在战斗内核生效：绝技增伤、绝技吸血、冰封、溅射、全队生命、开战怒气', () => {
  // 剑修：首个剑修绝技前事件完全一致，该绝技伤害约 ×1.15
  const sq = ['ziling', 'qinglan', 'saintess'];
  const p = B.playerStats(simState(W, 12, 2, sq));
  const mods = Bd.buildMods(sq);
  let checkedUlt = 0;
  for (let seed = 1; seed <= 20 && checkedUlt < 5; seed++) {
    const r0 = B.createSession(p, 57, seed, null).runToEnd(true).events;
    const r1 = B.createSession(p, 57, seed, mods).runToEnd(true).events;
    const i = r0.findIndex((e) => e.type === 'ult' && e.who === 'a' && (e.heroId === 'ziling' || e.heroId === 'qinglan'));
    if (i < 0) continue;
    for (let k = 0; k < i; k++) assert.strictEqual(JSON.stringify(r1[k]), JSON.stringify(r0[k]), '剑修绝技前事件一致');
    const d0 = r0[i].targets[0].dmg;
    const d1 = r1[i].targets[0].dmg;
    if (d0 >= 30) {
      // 伤害取整，允许 ±1.5 的取整误差
      assert.ok(Math.abs(d1 - d0 * 1.15) <= 1.5, `绝技伤害比 ${d1}/${d0}`);
      checkedUlt++;
    }
  }
  assert.ok(checkedUlt >= 5, '至少验证 5 次剑修绝技增伤');
  const s = B.createSession(p, 57, 1, mods);
  assert.strictEqual(s.playerUnits.find((u) => u.heroId === 'saintess').modUltDmgMult, 1);

  // 幽冥：绝技吸血产生治疗
  const ming = ['cloak', 'ziling', 'honglian'];
  const pm = B.playerStats(simState(W, 8, 1, ming));
  const rm = B.createSession(pm, 30, 2, Bd.buildMods(ming)).runToEnd(true);
  assert.ok(rm.events.some((e) => e.type === 'ult' && e.who === 'a' && ['cloak', 'ziling', 'honglian'].includes(e.heroId) && e.heals.length > 0), '幽冥绝技吸血');
  assert.strictEqual(B.createSession(pm, 30, 2, Bd.buildMods(ming)).playerUnits[0].modUltLifesteal, 0.18);

  // 冰霜 + 烈焰
  const fx = ['shuanghua', 'yueshi', 'qinglan', 'miko', 'honglian', 'jianghua'];
  const pf = B.playerStats(simState(W, 8, 1, fx));
  let froze = false;
  let splash = false;
  for (let seed = 1; seed <= 10; seed++) {
    const ev = B.createSession(pf, 30, seed, Bd.buildMods(fx)).runToEnd(true).events;
    froze = froze || ev.some((e) => e.froze);
    splash = splash || ev.some((e) => Array.isArray(e.splash) && e.splash.length > 0);
  }
  assert.ok(froze, '应出现冰封');
  assert.ok(splash, '应出现溅射');
  const sf = B.createSession(pf, 30, 1, Bd.buildMods(fx));
  sf.playerUnits.forEach((u) => {
    const tags = Bd.tagsOf(u.heroId);
    assert.strictEqual(u.modFreeze, tags.includes('bing') ? 0.15 : 0, `${u.heroId} 冰封几率`);
    assert.strictEqual(u.modAtkSplash, tags.includes('yan') ? 0.25 : 0, `${u.heroId} 溅射`);
  });

  // 灵愈 / 辅佐（全队）
  const team = ['saintess', 'qingkui', 'jianghua', 'molan', 'sweetmaid', 'lanyi'];
  const pt = B.playerStats(simState(W, 8, 1, team));
  const base = B.createSession(pt, 30, 1, null);
  const buff = B.createSession(pt, 30, 1, Bd.buildMods(team));
  buff.playerUnits.forEach((u, i) => {
    assert.ok(Math.abs(u.maxHp / base.playerUnits[i].maxHp - 1.1) < 1e-9, '灵愈 3 人 全队生命 +10%');
    assert.strictEqual(u.rage - base.playerUnits[i].rage, 25, '辅佐 3 人 开战怒气 +25');
  });
});

check('秘境：劫运与羁绊叠加（combinedMods），无羁绊时与纯劫运一致', () => {
  const M = W.Mijing;
  const sqState = simState(W, 8, 1, ['ziling', 'qinglan', 'saintess', 'qingkui']);
  const c = M.combinedMods(sqState, { fengmang: 1 });
  assert.ok(c.heroMods.ziling.ultDmgMult > 1);
  assert.ok(c.hpMult > 1);
  assert.ok(c.atkMult > 1);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(M.combinedMods(simState(W, 8, 1, NO_BOND_SQUAD), { fengmang: 1 }))), JSON.parse(JSON.stringify(M.buildMods({ fengmang: 1 }))));
  // 未选劫运时，秘境战斗等价于只带羁绊
  const ps = B.playerStats(sqState);
  for (let seed = 1; seed <= 5; seed++) {
    assert.strictEqual(
      JSON.stringify(B.createSession(ps, 30, seed, M.combinedMods(sqState, {})).runToEnd(true)),
      JSON.stringify(B.createSession(ps, 30, seed, Bd.buildMods(sqState.squad)).runToEnd(true))
    );
  }
});

check('存档不新增字段：state.js 不涉及羁绊，存档 JSON 不含羁绊数据', () => {
  assert.ok(!/bond|xianyuan|仙缘/i.test(text('js/state.js')), 'state.js 不涉及羁绊（羁绊由阵容实时推导）');
  assert.ok(!text('js/bonds.js').includes('localStorage'));
  assert.ok(!/state\.(bond|xianyuan)/i.test(text('js/stage-ui.js') + text('js/bonds.js') + text('js/mijing.js')));
});

check('UI 冒烟：闯关页羁绊条、队伍弹窗羁绊面板与角色卡标签、普通推关传入羁绊 mods', () => {
  function makeEl(id) {
    return {
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
  }
  const els = {};
  const document = {
    hidden: false, activeElement: null,
    getElementById(id) { if (!els[id]) els[id] = makeEl(id); return els[id]; },
    createElement(tag) { const e = makeEl(''); e.tagName = String(tag).toUpperCase(); return e; },
    querySelector() { return makeEl(''); },
    querySelectorAll() { return []; },
    addEventListener() {},
    body: makeEl('body')
  };
  const timers = [];
  const sandbox = {
    window: {}, console, document, localStorage: memoryStorage(), navigator: { userAgent: 'node' },
    setTimeout(fn) { timers.push(fn); return timers.length; }, clearTimeout() {},
    setInterval() { return 0; }, clearInterval() {},
    requestAnimationFrame() { return 0; },
    Image: function () {}, ResizeObserver: undefined,
    getComputedStyle() { return { getPropertyValue: () => '' }; }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.window.addEventListener = () => {};
  sandbox.window.innerWidth = 390;
  sandbox.window.innerHeight = 844;
  ['config', 'equip', 'state', 'titles', 'battle', 'bonds', 'mijing', 'stage-ui'].forEach((f) => {
    const src = text(`js/${f}.js`);
    assert.ok(!src.includes('getImageData'), `${f}.js 不应使用 getImageData`);
    vm.runInNewContext(src, sandbox, { filename: `${f}.js` });
  });
  const GS = sandbox.GameState;
  GS.loadGame();
  const st = GS.state;
  const squad = ['ziling', 'qinglan', 'molan', 'honglian', 'cloak', 'miko'];
  Object.assign(st, simState(sandbox, 8, 1, squad));
  st.stage.best = 20;
  st.stage.cur = 21;
  st.stage.auto = false;
  const seen = [];
  const orig = sandbox.Battle.createSession;
  sandbox.Battle.createSession = function (a, b, c, d) { seen.push(d); return orig(a, b, c, d); };
  sandbox.StageUI.init({ log() {}, onChange() {}, switchTab() {} });
  sandbox.StageUI.render();

  const row = els['stage-bond-row'].innerHTML;
  assert.ok(row.includes('仙缘'));
  assert.ok(/bond-chip bond-ming is-active lv-2[^]*幽冥[^]*3\/3（满）/.test(row), '幽冥满阶显示 3/3（满），不显示 4/3');
  assert.ok(/bond-chip bond-jian is-active lv-1[^]*剑修[^]*2\/3/.test(row), '剑修 2/3');
  assert.ok(/bond-chip bond-bing"[^]*冰霜[^]*1\/2/.test(row), '冰霜 1/2 未激活');
  assert.ok(!row.includes('灵愈'), '0 人的羁绊不显示');
  assert.ok(els['stage-bond-row'].getAttribute('aria-label').includes('已激活 4 个'));
  assert.ok((els['stage-bond-row'].listeners.click || []).length >= 1, '点击羁绊条可编辑队伍');

  assert.ok(sandbox.StageUI.openSquadModal());
  const panel = els['squad-bond-panel'].innerHTML;
  assert.ok(panel.includes('幽冥角色绝技吸血 18%'));
  assert.ok(panel.includes('剑修角色绝技伤害 +15%（3 人：剑修角色绝技伤害 +30%）'));
  // 新手体验 batch3 P2-4：羁绊说明改为每标签一行的图标列表，「差 N 人」单列
  assert.ok(/bond-row bond-bing is-inactive[^]*冰霜角色普攻 8% 几率冰封目标[^]*差 1 人/.test(panel));
  const list = els['squad-hero-list'].innerHTML;
  ALL.forEach((id) => Bd.tagsOf(id).forEach((t) => assert.ok(list.includes(`bond-tag bond-${t}`), `角色卡标签 ${id}:${t}`)));
  assert.ok(list.includes('<span class="bond-tag bond-yan">烈焰</span>'));
  sandbox.StageUI.closeSquadModal && sandbox.StageUI.closeSquadModal();

  assert.ok(sandbox.StageUI.startBattle(true));
  sandbox.StageUI.skipBattle();
  const used = seen.filter(Boolean).pop();
  assert.ok(used && used.heroMods && used.heroMods.cloak && used.heroMods.cloak.ultLifesteal === 0.18, '普通推关使用羁绊 mods');
  assert.ok(!JSON.stringify(st).includes('heroMods'), '存档状态不含羁绊 mods');
  GS.saveGame();
  const saved = sandbox.localStorage._data.xiuxian_idle_save_v1 || '';
  assert.ok(saved.length > 0 && !/bond|xianyuan|heroMods/i.test(saved), '存档无羁绊字段');

  // 无羁绊时空提示
  st.squad = NO_BOND_SQUAD.slice();
  sandbox.StageUI.render();
  assert.ok(!els['stage-bond-row'].innerHTML.includes('is-active'));
  assert.ok(els['stage-bond-row'].getAttribute('aria-label').includes('已激活 0 个'));
});

check('index.html 引用 bonds.js（battle 之后、mijing 之前）且有羁绊节点；样式存在', () => {
  const index = text('index.html');
  assert.match(index, /<script src="js\/battle\.js\?v=\d+"><\/script>\s*<script src="js\/bonds\.js\?v=\d+"><\/script>\s*<script src="js\/mijing\.js/);
  assert.ok(index.includes('id="stage-bond-row"'));
  assert.ok(index.includes('id="squad-bond-panel"'));
  const css = text('css/style.css');
  ['.stage-bond-row', '.bond-chip', '.squad-bond-panel', '.bond-tag'].forEach((c) => assert.ok(css.includes(c), c));
});

console.log(`bond.test.js ok: ${passed} checks`);
