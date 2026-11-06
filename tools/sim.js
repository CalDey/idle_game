// 贪心修炼模拟：有灵石就买当前最便宜的功法/洞府，灵气够了就突破（不计失败）。
// 用法：node tools/sim.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const sandbox = { window: {}, console };
vm.runInNewContext(fs.readFileSync(path.join(root, 'js/config.js'), 'utf8'), sandbox);
const CFG = sandbox.window.GameConfig;

function simulate() {
  const gongfa = {};
  const dongfu = {};
  CFG.GONGFA_LIST.forEach((g, i) => {
    gongfa[g.id] = i === 0 ? 1 : 0;
  });
  CFG.DONGFU_LIST.forEach((d, i) => {
    dongfu[d.id] = i === 0 ? 1 : 0;
  });
  let realm = 0;
  let qi = 0;
  let stones = 25;
  let t = 0;
  const marks = {};
  const dt = 0.5;
  const limit = 86400 * 30;

  function qiPerSec() {
    const stage = CFG.REALM_STAGES[realm];
    let raw = 1;
    CFG.GONGFA_LIST.forEach((item) => {
      const lv = gongfa[item.id] || 0;
      if (lv > 0) raw += item.baseQiPerSec * lv;
    });
    return raw * stage.multiplier;
  }
  function stonePerSec() {
    const stage = CFG.REALM_STAGES[realm];
    let raw = 0.5;
    CFG.DONGFU_LIST.forEach((item) => {
      const lv = dongfu[item.id] || 0;
      if (lv > 0) raw += item.baseStonePerSec * lv;
    });
    return raw * Math.pow(stage.multiplier, 0.65);
  }
  function cheapest() {
    let best = null;
    CFG.GONGFA_LIST.forEach((item) => {
      if (realm < item.unlockRealmIndex) return;
      const lv = gongfa[item.id] || 0;
      const cost = Math.floor(item.baseCost * Math.pow(item.costScale, lv));
      if (!best || cost < best.cost) best = { kind: 'g', item, cost };
    });
    CFG.DONGFU_LIST.forEach((item) => {
      if (realm < item.unlockRealmIndex) return;
      const lv = dongfu[item.id] || 0;
      const cost = Math.floor(item.baseCost * Math.pow(item.costScale, lv));
      if (!best || cost < best.cost) best = { kind: 'd', item, cost };
    });
    return best;
  }

  while (realm < CFG.REALM_STAGES.length - 1 && t < limit) {
    qi += qiPerSec() * dt;
    stones += stonePerSec() * dt;
    const offer = cheapest();
    if (offer && stones >= offer.cost) {
      stones -= offer.cost;
      if (offer.kind === 'g') offer.item && (gongfa[offer.item.id] = (gongfa[offer.item.id] || 0) + 1);
      else dongfu[offer.item.id] = (dongfu[offer.item.id] || 0) + 1;
    }
    const stage = CFG.REALM_STAGES[realm];
    if (qi >= stage.reqQi) {
      qi -= stage.reqQi;
      realm += 1;
      const name = CFG.REALM_STAGES[realm].fullName;
      if (name.endsWith('初') || realm === CFG.REALM_STAGES.length - 1) {
        marks[name] = t;
      }
    }
    t += dt;
  }
  return { seconds: t, realm, marks, reachedEnd: realm >= CFG.REALM_STAGES.length - 1 };
}

function fmt(sec) {
  if (sec == null) return '未到达';
  if (sec < 90) return `${sec.toFixed(0)} 秒`;
  if (sec < 3600) return `${(sec / 60).toFixed(1)} 分`;
  return `${(sec / 3600).toFixed(2)} 小时`;
}

const result = simulate();
const lines = [];
lines.push('暗黑修仙 · 贪心模拟（不计突破失败，不计装备）');
lines.push(`灵气倍率 LATE_REALM_QI_MULT = ${JSON.stringify(CFG.LATE_REALM_QI_MULT)}`);
lines.push(`用时 ${fmt(result.seconds)}，停在 ${CFG.REALM_STAGES[result.realm].fullName}`);
['洞天初', '化灵初', '尊者初', '天神初', '遁一初', '至尊后'].forEach((name) => {
  lines.push(`${name}：${fmt(result.marks[name])}`);
});
const weights = (lv) => {
  const anchors = CFG.TREE_WEIGHT_ANCHORS;
  let lo = anchors[0];
  let hi = anchors[anchors.length - 1];
  for (let i = 0; i < anchors.length - 1; i++) {
    if (lv >= anchors[i].lv && lv <= anchors[i + 1].lv) {
      lo = anchors[i];
      hi = anchors[i + 1];
      break;
    }
  }
  const t = (lv - lo.lv) / (hi.lv - lo.lv || 1);
  return lo.w.map((w, i) => w + (hi.w[i] - w) * t);
};
lines.push('树 Lv8 权重（凡→仙）：' + weights(8).map((n) => n.toFixed(1)).join(' / '));
lines.push('1→2 灵玉 ' + CFG.treeUpgradeCost(1) + '，耗时 ' + Math.round(CFG.treeUpgradeMs(1) / 60000) + ' 分');
lines.push('5→6 灵玉 ' + CFG.treeUpgradeCost(5) + '，耗时 ' + Math.round(CFG.treeUpgradeMs(5) / 60000) + ' 分');
const text = lines.join('\n') + '\n';
fs.writeFileSync(path.join(__dirname, 'sim-output.txt'), text);
console.log(text);
