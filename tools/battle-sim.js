// 战斗系统数值校准与内核验证脚本（B0 + B1）
// 用法：node tools/battle-sim.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const sandbox = { window: {}, console };
sandbox.globalThis = sandbox.window;

vm.runInNewContext(fs.readFileSync(path.join(root, 'js/config.js'), 'utf8'), sandbox);
vm.runInNewContext(fs.readFileSync(path.join(root, 'js/equip.js'), 'utf8'), sandbox);
vm.runInNewContext(fs.readFileSync(path.join(root, 'js/battle.js'), 'utf8'), sandbox);

const CFG = sandbox.window.GameConfig;
const Equip = sandbox.window.Equip;
const Battle = sandbox.window.Battle;

let currentRealmIndex = 0;
sandbox.window.GameState = {
  getCurrentStage() {
    const idx = Math.max(0, Math.min(currentRealmIndex, CFG.REALM_STAGES.length - 1));
    return CFG.REALM_STAGES[idx];
  },
  getStonePerSec() {
    return 10;
  },
  getQiPerSec() {
    return 20;
  }
};

// 按设计稿模拟假设构造 state：
// 6 个部位同品质 q，装备等级 = 1 + 2 * realmIndex，副词条取平均值，功法与洞府总等级各取 3 * realmIndex
function buildSimState(realmIndex, qIndex) {
  currentRealmIndex = realmIndex;
  const lv = Math.max(1, 1 + 2 * realmIndex);
  const q = CFG.QUALITIES[qIndex];
  const ns = (q.subs * 6) / 8;
  const sc = Equip.subScale(qIndex);
  const avgSubs = CFG.SUBSTATS.map((d) => [d.key, ns * ((d.min + d.max) / 2) * sc]);

  const equip = Equip.emptyEquip();
  CFG.EQUIP_SLOTS.forEach((slot, idx) => {
    const raw = slot.base * Math.pow(slot.growth, lv - 1) * q.mult;
    equip[slot.id] = {
      id: idx + 1,
      s: slot.id,
      q: qIndex,
      lv,
      m: Math.round(raw),
      sub: idx === 0 ? avgSubs : []
    };
  });

  return {
    realmIndex,
    totalDaoGuo: 0,
    gongfa: { sim: 3 * realmIndex },
    dongfu: { sim: 3 * realmIndex },
    equip
  };
}

function getSimPlayer(realmIndex, qIndex) {
  const state = buildSimState(realmIndex, qIndex);
  const stats = Battle.playerStats(state);
  return {
    ...stats,
    state,
    name: CFG.REALM_STAGES[realmIndex].fullName
  };
}

function enemyAtCp(cp, n) {
  const B = CFG.BATTLE;
  return {
    n,
    cp,
    atk: cp * B.SPLIT.atk,
    hp: cp * B.SPLIT.hp,
    def: cp * B.SPLIT.def,
    spd: 100 + 0.5 * n,
    crit: 0.05,
    critDmg: 1.5,
    cd: 1.5
  };
}

// === B1 确定性与核心接口断言 ===
(function runAssertions() {
  assert.ok(CFG.BATTLE, 'GameConfig.BATTLE 应存在');
  assert.strictEqual(CFG.BATTLE.GROWTH, 1.0223);
  assert.strictEqual(CFG.BATTLE.BASE_CP, 600);
  assert.strictEqual(CFG.BATTLE.BOSS_MULT, 1.5);
  assert.strictEqual(CFG.BATTLE.REGIONS.length, 6);
  assert.strictEqual(CFG.BATTLE.BOSSES.length, 30);

  const e1 = Battle.enemyFor(1);
  assert.strictEqual(Math.round(e1.cp), 600);
  assert.strictEqual(e1.isBoss, false);
  assert.strictEqual(e1.region, '凡尘野地');
  assert.strictEqual(e1.name, '山贼喽啰');

  const e30 = Battle.enemyFor(30);
  assert.strictEqual(Math.round(e30.cp), 1706);
  assert.strictEqual(e30.isBoss, true);
  assert.strictEqual(e30.name, '黑风寨主');

  const e90 = Battle.enemyFor(90);
  assert.strictEqual(Math.round(e90.cp), 6408);
  assert.strictEqual(e90.name, '青冥蛟王');

  const p = getSimPlayer(8, 1);
  // 同一 seed 多次调用 simulate 结果完全一致
  for (const seed of [1, 42, 123456, 999999]) {
    const r1 = Battle.simulate(p, e30, seed);
    const r2 = Battle.simulate(p, e30, seed);
    assert.deepStrictEqual(r1, r2, `seed=${seed} 两次 simulate 结果必须完全一致`);
    assert.ok(Array.isArray(r1.events) && r1.events.length > 0, 'events 列表非空');
    assert.ok(r1.rounds >= 1 && r1.rounds <= CFG.BATTLE.MAX_ROUNDS, '回合数在 1..20 之间');
  }

  // 验证称号战力加成对 playerStats 生效
  sandbox.window.Titles = {
    factor(_s, stat) {
      return stat === 'cp' ? 1.05 : 1;
    }
  };
  const pBoosted = Battle.playerStats(p.state);
  assert.ok(Math.abs(pBoosted.atk / p.atk - 1.05) < 1e-9, '称号战力加成应乘在攻击上');
  assert.ok(Math.abs(pBoosted.hp / p.hp - 1.05) < 1e-9, '称号战力加成应乘在生命上');
  assert.ok(Math.abs(pBoosted.def / p.def - 1.05) < 1e-9, '称号战力加成应乘在防御上');
  delete sandbox.window.Titles;

  // 验证速度达到 2 倍时单回合出手 2 次
  const fastSim = Battle.simulate(
    { atk: 10, hp: 1000, def: 10, spd: 220, crit: 0, critDmg: 1.5 },
    { atk: 10, hp: 1000, def: 10, spd: 100, crit: 0, critDmg: 1.5 },
    7
  );
  const round1A = fastSim.events.filter((ev) => ev.t === 1 && ev.who === 'a');
  const round1B = fastSim.events.filter((ev) => ev.t === 1 && ev.who === 'b');
  assert.strictEqual(round1A.length, 2, '2 倍速一方每回合应出手 2 次');
  assert.strictEqual(round1B.length, 1, '正常速度一方每回合出手 1 次');

  // 验证 20 回合打不完算失败（超时）
  const timeoutSim = Battle.simulate(
    { atk: 1, hp: 100000, def: 1000, spd: 100, crit: 0, critDmg: 1.5 },
    { atk: 1, hp: 100000, def: 1000, spd: 100, crit: 0, critDmg: 1.5 },
    1
  );
  assert.strictEqual(timeoutSim.win, false, '20 回合超时应判负');
  assert.strictEqual(timeoutSim.rounds, 20, '超时回合数应为 20');

  // 验证首通奖励累计与设计稿一致（第 30/90/210 关累计）
  function sumRewards(upTo) {
    let peaches = 0;
    let lingyu = 0;
    for (let k = 1; k <= upTo; k++) {
      const rw = Battle.firstClearReward(p.state, k);
      peaches += rw.peaches;
      lingyu += rw.lingyu;
    }
    return { peaches, lingyu };
  }
  assert.deepStrictEqual(sumRewards(30), { peaches: 42, lingyu: 141 });
  assert.deepStrictEqual(sumRewards(90), { peaches: 126, lingyu: 801 });
  assert.deepStrictEqual(sumRewards(210), { peaches: 294, lingyu: 3633 });
})();

function fmtCp(cp) {
  if (cp >= 10000) return `${(cp / 10000).toFixed(1)}万`;
  return Math.round(cp).toLocaleString('en-US');
}

const lines = [];
lines.push('暗黑修仙 · 战斗数值校准与模拟报告（B0 + B1）');
lines.push(`参数：GROWTH=${CFG.BATTLE.GROWTH}, BASE_CP=${CFG.BATTLE.BASE_CP}, BOSS_MULT=${CFG.BATTLE.BOSS_MULT}, MAX_ROUNDS=${CFG.BATTLE.MAX_ROUNDS}`);
lines.push('');

// 表 1：胜率 vs 战力比（设计稿 s3）
// 设计稿基准：
// 练气九层 · 灵品: 0% / 0% / 0% / 11% / 72%
// 筑基九层 · 玄品: 0% / 2% / 79% / 100% / 100%
// 金丹九层 · 地品: 1% / 25% / 94% / 100% / 100%
// 化神九层 · 天品: 1% / 30% / 89% / 100% / 100%
const ratios = [0.9, 0.95, 1.0, 1.05, 1.1];
const ratioRows = [
  { r: 8, q: 1, n: 30, label: '练气九层 · 灵品', target: [0, 0, 0, 11, 72] },
  { r: 17, q: 2, n: 90, label: '筑基九层 · 玄品', target: [0, 2, 79, 100, 100] },
  { r: 26, q: 3, n: 150, label: '金丹九层 · 地品', target: [1, 25, 94, 100, 100] },
  { r: 44, q: 4, n: 290, label: '化神九层 · 天品', target: [1, 30, 89, 100, 100] }
];

lines.push('=== 表 1：胜率 vs 战力比（每格 1000 场，mulberry32 种子） ===');
lines.push(['我方战力 / 推荐战力', ...ratios.map((x) => x.toFixed(2))].join('\t'));

for (const row of ratioRows) {
  const p = getSimPlayer(row.r, row.q);
  const cells = [];
  ratios.forEach((ratio, idx) => {
    const enemy = enemyAtCp(p.cp / ratio, row.n);
    const rate = Battle.winRate(p, enemy, 1000);
    const pct = Math.round(rate * 100);
    const diff = Math.abs(pct - row.target[idx]);
    assert.ok(
      diff <= 5,
      `胜率表误差超限: ${row.label} @${ratio} 实测=${pct}% 设计稿=${row.target[idx]}%`
    );
    cells.push(`${pct}%`);
  });
  lines.push([row.label, ...cells].join('\t'));
}

lines.push('');

// 表 2：门槛校准（设计稿 s5）
// 练气九层 → 第 3 章 黑风寨主 (1,706): 0% / 100% / 100% / 100% / 100%
// 筑基九层 → 第 9 章 青冥蛟王 (6,408): 0% / 0% / 100% / 100% / 100%
// 金丹九层 → 第 15 章 赤炎魔君 (2.4万): 0% / 0% / 0% / 100% / 100%
// 元婴九层 → 第 21 章 九幽鬼母 (9.0万): 0% / 0% / 0% / 1% / 100%
const gateRows = [
  { r: 8, stage: 30, label: '练气九层 → 第 3 章 黑风寨主', target: [0, 100, 100, 100, 100], note: '灵品一套，约 20～30 分钟' },
  { r: 17, stage: 90, label: '筑基九层 → 第 9 章 青冥蛟王', target: [0, 0, 100, 100, 100], note: '玄品一套，约第 1 天' },
  { r: 26, stage: 150, label: '金丹九层 → 第 15 章 赤炎魔君', target: [0, 0, 0, 100, 100], note: '地品一套，约第 2～3 天' },
  { r: 35, stage: 210, label: '元婴九层 → 第 21 章 九幽鬼母', target: [0, 0, 0, 1, 100], note: '地天混搭，约第 5～7 天' }
];

lines.push('=== 表 2：门槛校准（境界九层打章末 Boss，每格 1000 场） ===');
lines.push(['门槛（境界九层打章末 Boss）', 'Boss 推荐战力', '凡', '灵', '玄', '地', '天', '需要的装备'].join('\t'));

for (const row of gateRows) {
  const boss = Battle.enemyFor(row.stage);
  const cells = [];
  for (let q = 0; q <= 4; q++) {
    const p = getSimPlayer(row.r, q);
    const rate = Battle.winRate(p, row.stage, 1000);
    const pct = Math.round(rate * 100);
    const diff = Math.abs(pct - row.target[q]);
    assert.ok(
      diff <= 5,
      `门槛表误差超限: ${row.label} 品质=${CFG.QUALITIES[q].name} 实测=${pct}% 设计稿=${row.target[q]}%`
    );
    cells.push(`${pct}%`);
  }
  lines.push([row.label, fmtCp(boss.cp), ...cells, row.note].join('\t'));
}

lines.push('');
lines.push('=== 关键关卡推荐战力抽样 ===');
const sampleStages = [1, 10, 30, 90, 150, 210, 300];
lines.push(
  sampleStages
    .map((n) => {
      const e = Battle.enemyFor(n);
      return `第${n}关(${e.name}): ${fmtCp(e.cp)}`;
    })
    .join(' · ')
);
lines.push('');
lines.push('全部断言通过（同一 seed 结果一致、数值表误差均在 ±5% 内）。');

const outPath = path.join(__dirname, 'battle-sim-output.txt');
const text = lines.join('\n') + '\n';
fs.writeFileSync(outPath, text, 'utf8');
console.log(text);

