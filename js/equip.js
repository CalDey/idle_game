// 仙桃树装备与战力。不碰存档读写，只根据传入的 state 计算。
(function () {
  const CFG = () => window.GameConfig;

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function emptyEquip() {
    const equip = {};
    CFG().EQUIP_SLOTS.forEach((slot) => {
      equip[slot.id] = null;
    });
    return equip;
  }

  function defaultTree(now) {
    return {
      lv: 1,
      peaches: 0,
      regenAt: now || Date.now(),
      upEnd: 0,
      gifted: false
    };
  }

  function defaultStage(now) {
    return { cur: 1, best: 0, auto: true, idleAt: now || Date.now() };
  }

  function defaultV2Fields(now) {
    return {
      version: 2,
      lingyu: 0,
      tree: defaultTree(now),
      equip: emptyEquip(),
      pending: null,
      pity: { di: 0, tian: 0 },
      autoDecomp: { on: false, maxQ: 0, onlyWorse: true },
      stage: defaultStage(now),
      lifeBestStage: 0,
      seq: 0
    };
  }

  function qualityWeights(treeLevel) {
    const anchors = CFG().TREE_WEIGHT_ANCHORS;
    const lv = clamp(treeLevel || 1, 1, 25);
    let lo = anchors[0];
    let hi = anchors[anchors.length - 1];
    for (let i = 0; i < anchors.length - 1; i++) {
      if (lv >= anchors[i].lv && lv <= anchors[i + 1].lv) {
        lo = anchors[i];
        hi = anchors[i + 1];
        break;
      }
    }
    const span = hi.lv - lo.lv || 1;
    const t = (lv - lo.lv) / span;
    return lo.w.map((w, i) => w + (hi.w[i] - w) * t);
  }

  function subScale(qIndex) {
    // 表内区间是灵品。灵品序号按 0 起算为 1，倍率 1；仙品为 1+0.25*4 = 2。
    return 1 + 0.25 * (qIndex - 1);
  }

  function rollSub(qIndex, used) {
    const pool = CFG().SUBSTATS.filter((s) => !used.has(s.key));
    const def = pool[Math.floor(Math.random() * pool.length)];
    const base = def.min + Math.random() * (def.max - def.min);
    const value = base * subScale(qIndex);
    used.add(def.key);
    const rounded = def.pct ? Math.round(value * 1000) / 1000 : Math.round(value);
    return [def.key, rounded];
  }

  function mainStat(slot, level, qIndex) {
    const q = CFG().QUALITIES[qIndex];
    const raw = slot.base * Math.pow(slot.growth, level - 1) * q.mult;
    return Math.max(1, Math.round(raw));
  }

  function rollItem(state) {
    const slots = CFG().EQUIP_SLOTS;
    const slot = slots[Math.floor(Math.random() * slots.length)];
    const pity = state.pity || { di: 0, tian: 0 };
    let minQ = 0;
    if (pity.tian >= 200) minQ = 4;
    else if (pity.di >= 50) minQ = 3;
    const weights = qualityWeights(state.tree.lv);
    let bag = weights.map((w, i) => (i >= minQ ? w : 0));
    let sum = bag.reduce((a, b) => a + b, 0);
    if (sum <= 0) {
      bag = weights.map((_, i) => (i === minQ ? 1 : 0));
      sum = 1;
    }
    let r = Math.random() * sum;
    let qIndex = minQ;
    for (let i = 0; i < bag.length; i++) {
      r -= bag[i];
      if (r <= 0) {
        qIndex = i;
        break;
      }
    }
    const jitter = Math.floor(Math.random() * 4) - 2;
    const level = clamp(1 + 2 * (state.realmIndex || 0) + jitter, 1, 99);
    const q = CFG().QUALITIES[qIndex];
    const used = new Set();
    const sub = [];
    for (let i = 0; i < q.subs; i++) sub.push(rollSub(qIndex, used));
    state.seq = (state.seq || 0) + 1;
    if (qIndex >= 3) pity.di = 0;
    else pity.di = (pity.di || 0) + 1;
    if (qIndex >= 4) pity.tian = 0;
    else pity.tian = (pity.tian || 0) + 1;
    state.pity = pity;
    return {
      id: state.seq,
      s: slot.id,
      q: qIndex,
      lv: level,
      m: mainStat(slot, level, qIndex),
      sub
    };
  }

  function slotDef(id) {
    return CFG().EQUIP_SLOTS.find((s) => s.id === id);
  }

  function itemName(item) {
    const slot = slotDef(item.s);
    const q = CFG().QUALITIES[item.q];
    return `${q.name}${slot.itemName}`;
  }

  function decomposeValue(item) {
    const jade = CFG().QUALITIES[item.q].jade;
    return Math.max(1, Math.round(jade * (1 + item.lv / 30)));
  }

  function subSum(equip, key) {
    let total = 0;
    if (!equip) return 0;
    CFG().EQUIP_SLOTS.forEach((slot) => {
      const item = equip[slot.id];
      if (!item || !item.sub) return;
      item.sub.forEach((pair) => {
        if (pair[0] === key) total += pair[1];
      });
    });
    return total;
  }

  function mainOf(equip, slotId) {
    const item = equip && equip[slotId];
    return item ? item.m : 0;
  }

  function sumLevels(map) {
    if (!map) return 0;
    return Object.keys(map).reduce((sum, key) => sum + (map[key] || 0), 0);
  }

  function attributes(state) {
    const stage = window.GameState.getCurrentStage();
    const mult = stage.multiplier;
    const equip = state.equip || emptyEquip();
    const allAttr = 1 + (state.totalDaoGuo || 0) * 0.05;
    const gongfaLv = sumLevels(state.gongfa);
    const dongfuLv = sumLevels(state.dongfu);
    const atkPct = subSum(equip, 'atkPct');
    const hpPct = subSum(equip, 'hpPct');
    const defPct = subSum(equip, 'defPct');
    let atk = 10 * mult + mainOf(equip, 'weapon') + mainOf(equip, 'charm');
    atk *= 1 + atkPct + gongfaLv * 0.005;
    atk *= allAttr;
    let hp = 120 * mult + mainOf(equip, 'crown') + mainOf(equip, 'belt');
    hp *= 1 + hpPct + dongfuLv * 0.005;
    hp *= allAttr;
    let def = 5 * mult + mainOf(equip, 'robe');
    def *= 1 + defPct;
    def *= allAttr;
    const spd = 100 + 2 * (state.realmIndex || 0) + mainOf(equip, 'boots') + subSum(equip, 'spd');
    const crit = Math.min(0.6, 0.05 + subSum(equip, 'crit'));
    const critDmg = 1.5 + subSum(equip, 'critDmg');
    return { atk, hp, def, spd, crit, critDmg };
  }

  function combatPowerFrom(attr) {
    return (attr.atk * 10 + attr.hp + attr.def * 8 + attr.spd * 2) * (1 + attr.crit * (attr.critDmg - 1));
  }

  function combatPower(state) {
    const base = combatPowerFrom(attributes(state));
    const mult = window.Titles ? window.Titles.factor(state, 'cp') : 1;
    return base * mult;
  }

  function powerWithSwap(state, item) {
    const prev = state.equip[item.s];
    state.equip[item.s] = item;
    const cp = combatPower(state);
    state.equip[item.s] = prev;
    return cp;
  }

  function tribulationLock(state) {
    if (!CFG().ENABLE_STAGE_GATES) return null;
    const stage = window.GameState.getCurrentStage();
    const gate = CFG().TRIBULATION_GATES[stage.index];
    if (!gate) return null;
    if ((state.stage && state.stage.best) >= gate.stage) return null;
    return gate;
  }

  function formatSub(pair) {
    const def = CFG().SUBSTATS.find((s) => s.key === pair[0]);
    if (!def) return '';
    if (def.pct) return `${def.name} +${(pair[1] * 100).toFixed(1)}%`;
    return `${def.name} +${pair[1]}`;
  }

  function formatMain(item) {
    const slot = slotDef(item.s);
    const label = { atk: '攻击', hp: '生命', def: '防御', spd: '速度' }[slot.stat];
    return `${label} ${item.m}`;
  }

  window.Equip = {
    emptyEquip,
    defaultV2Fields,
    qualityWeights,
    subScale,
    rollItem,
    itemName,
    decomposeValue,
    subSum,
    attributes,
    combatPower,
    powerWithSwap,
    tribulationLock,
    formatSub,
    formatMain,
    slotDef
  };
})();
