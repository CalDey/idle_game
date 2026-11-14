// 灵兽伴生数值对比：同一队伍、同一装备，在关键关卡比较「仅羁绊」与「羁绊 + 灵兽（Lv1 / Lv10）」的胜率
// 用法：node tools/beast-sim.js [场次，默认 400]
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const RUNS = Number(process.argv[2]) || 400;
const sandbox = { window: {}, console };
sandbox.globalThis = sandbox.window;
['js/config.js', 'js/equip.js', 'js/battle.js', 'js/bonds.js', 'js/beasts.js'].forEach((f) =>
  vm.runInNewContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox, { filename: f })
);
const CFG = sandbox.window.GameConfig;
const Equip = sandbox.window.Equip;
const Battle = sandbox.window.Battle;
const Bonds = sandbox.window.Bonds;
const Beasts = sandbox.window.Beasts;

let currentRealmIndex = 0;
sandbox.window.GameState = {
  getCurrentStage: () => CFG.REALM_STAGES[Math.max(0, Math.min(currentRealmIndex, CFG.REALM_STAGES.length - 1))],
  getStonePerSec: () => 10,
  getQiPerSec: () => 20
};

// 与 tools/battle-sim.js 相同的装备假设
function buildSimState(realmIndex, qIndex, squad) {
  currentRealmIndex = realmIndex;
  const lv = Math.max(1, 1 + 2 * realmIndex);
  const q = CFG.QUALITIES[qIndex];
  const ns = (q.subs * 6) / 8;
  const sc = Equip.subScale(qIndex);
  const avgSubs = CFG.SUBSTATS.map((d) => [d.key, ns * ((d.min + d.max) / 2) * sc]);
  const equip = Equip.emptyEquip();
  CFG.EQUIP_SLOTS.forEach((slot, idx) => {
    const raw = slot.base * Math.pow(slot.growth, lv - 1) * q.mult;
    equip[slot.id] = { id: idx + 1, s: slot.id, q: qIndex, lv, m: Math.round(raw), sub: idx === 0 ? avgSubs : [] };
  });
  return {
    realmIndex,
    totalDaoGuo: 0,
    gongfa: { sim: 3 * realmIndex },
    dongfu: { sim: 3 * realmIndex },
    equip,
    heroId: squad[0],
    unlockedHeroes: squad.slice(),
    squad: squad.slice(),
    stage: { best: 0, cur: 1, squad: squad.slice() }
  };
}

const SQUADS = {
  ming: ['cloak', 'youming', 'ziling', 'honglian', 'molan', 'saintess'], // 幽冥 5 人
  bing: ['lanyi', 'shuanghua', 'yueshi', 'qinglan', 'shuangchen', 'saintess'], // 冰霜 5 人
  yan: ['miko', 'jianghua', 'honglian', 'fenxiao', 'saintess', 'sweetmaid'] // 烈焰 4 人
};

// 门槛与品质沿用 battle-sim 表 2；另加每档「五五开」附近的关卡，变化最敏感
const CASES = [
  { r: 8, q: 1, stages: [30, 36] },
  { r: 17, q: 2, stages: [90, 100] },
  { r: 26, q: 3, stages: [150, 160] },
  { r: 35, q: 4, stages: [210, 225] }
];

function rate(state, stage) {
  return Battle.winRate(state, stage, RUNS, Bonds.modsForState(state));
}

const lines = [];
const out = (s) => {
  lines.push(s);
  console.log(s);
};
out(`灵兽伴生胜率对比（每格 ${RUNS} 场；同一 seed 序列；「无」= 仅仙缘羁绊）`);
out('队伍\t关卡\t境界/品质\t无\tLv1\tLv10');
Object.keys(SQUADS).forEach((tag) => {
  const beast = Beasts.BEASTS.find((b) => b.tag === tag);
  CASES.forEach((c) => {
    c.stages.forEach((stage) => {
      const s = buildSimState(c.r, c.q, SQUADS[tag]);
      const base = rate(s, stage);
      s.beasts = { owned: { [beast.id]: { lv: 1 } }, active: beast.id };
      const lv1 = rate(s, stage);
      s.beasts.owned[beast.id].lv = 10;
      const lv10 = rate(s, stage);
      out(`${beast.name}队\t第${stage}关\t${CFG.REALM_STAGES[c.r].fullName}/${CFG.QUALITIES[c.q].name}\t${(base * 100).toFixed(0)}%\t${(lv1 * 100).toFixed(0)}%\t${(lv10 * 100).toFixed(0)}%`);
    });
  });
});
// 推关上限：能 ≥50% 胜率打过的最高关卡（含首领关的二分查找），看灵兽能多推几关
function edge(state) {
  let lo = 1;
  let hi = 300;
  while (lo < hi) {
    const m = Math.ceil((lo + hi) / 2);
    if (rate(state, m) >= 0.5) lo = m;
    else hi = m - 1;
  }
  return lo;
}
out('');
out('推关上限（≥50% 胜率的最高关）\t境界/品质\t无\tLv1\tLv10\t满级多推');
Object.keys(SQUADS).forEach((tag) => {
  const beast = Beasts.BEASTS.find((b) => b.tag === tag);
  CASES.forEach((c) => {
    const s = buildSimState(c.r, c.q, SQUADS[tag]);
    const e0 = edge(s);
    s.beasts = { owned: { [beast.id]: { lv: 1 } }, active: beast.id };
    const e1 = edge(s);
    s.beasts.owned[beast.id].lv = 10;
    const e10 = edge(s);
    out(`${beast.name}队\t${CFG.REALM_STAGES[c.r].fullName}/${CFG.QUALITIES[c.q].name}\t${e0}\t${e1}\t${e10}\t+${e10 - e0}`);
  });
});
fs.writeFileSync(path.join(root, 'tools/beast-sim-output.txt'), lines.join('\n') + '\n');
