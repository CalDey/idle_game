// 新手体验：前三步高亮引导、常驻「当前目标」、法宝解锁提示、页签红点、锁定内容门槛提示、弹窗 Esc / 点遮罩关闭。
// 纯函数挂在 window.Newbie 上，供 tools/newbie-ux.test.js 在 node vm 里校验；DOM 部分只在 init() 之后运行。
(function () {
  // 与设置弹窗「境界体系」一致的说明，锁定提示里复用。
  const REALM_CHAIN_TEXT = '搬血 → 洞天 → 化灵 → 铭纹 → 列阵 → 尊者 → 神火 → 真一 → 圣祭 → 天神 → 虚道 → 斩我 → 遁一 → 至尊（各分初/中/后）';
  const TOTAL_REALMS = 42;
  const GUIDE_TAPS = 3;
  const GEAR_POPUP_DELAY_MS = 1400;
  const UNLOCK_WAIT_CAP_MS = 30000;

  function cfg() {
    return window.GameConfig || {};
  }

  function fmt(n) {
    const f = cfg().formatNumber;
    return typeof f === 'function' ? f(n) : String(n);
  }

  function peachUnlockRealm() {
    return (cfg().PEACH && cfg().PEACH.UNLOCK_REALM) || 1;
  }

  function stageUnlockRealm() {
    return (cfg().BATTLE && cfg().BATTLE.UNLOCK_REALM) || 2;
  }

  // ---------- 境界门槛 ----------
  function realmName(idx) {
    const list = cfg().REALM_STAGES || [];
    const st = list[Math.max(0, Math.min(list.length - 1, Math.floor(idx || 0)))];
    return st ? st.fullName : '';
  }

  function realmGap(cur, target) {
    return Math.max(0, Math.floor(Number(target) || 0) - Math.floor(Number(cur) || 0));
  }

  function realmGapText(cur, target) {
    const gap = realmGap(cur, target);
    return gap > 0 ? `还差${gap}重` : '已达成';
  }

  function realmGateText(cur, target) {
    return `需突破至【${realmName(target)}】· ${realmGapText(cur, target)}`;
  }

  function stageLabel(n) {
    const num = Math.max(1, Math.floor(n || 1));
    return `${Math.ceil(num / 10)}-${((num - 1) % 10) + 1}`;
  }

  // ---------- 新手引导 ----------
  // snap: { realmIndex, qiReady, gearVisited }
  function advanceGuide(guide, snap) {
    const g = { ...(guide || {}) };
    const sn = snap || {};
    if (g.done) {
      g.step = 3;
      return g;
    }
    g.step = Math.max(0, Math.floor(g.step || 0));
    if (g.step === 0 && ((g.taps || 0) >= GUIDE_TAPS || (sn.realmIndex || 0) >= 1 || sn.qiReady)) g.step = 1;
    if (g.step === 1 && (sn.realmIndex || 0) >= 1) g.step = 2;
    if (g.step === 2 && (g.gearVisited || sn.gearVisited)) g.step = 3;
    if (g.step >= 3) {
      g.step = 3;
      g.done = true;
    }
    return g;
  }

  function guideTarget(guide, snap) {
    if (!guide || guide.done) return null;
    if (guide.step === 0) return 'portrait';
    if (guide.step === 1) return 'breakthrough';
    if (guide.step === 2 && ((snap && snap.realmIndex) || 0) >= peachUnlockRealm()) return 'gear-tab';
    return null;
  }

  // ---------- 当前目标 ----------
  function sumLv(map) {
    if (!map) return 0;
    return Object.keys(map).reduce((sum, k) => sum + (Number(map[k]) || 0), 0);
  }

  function hasAnyEquip(s) {
    const eq = s && s.equip;
    if (!eq) return false;
    return Object.keys(eq).some((k) => Boolean(eq[k]));
  }

  function bestStage(s) {
    return (s && s.stage && Number(s.stage.best)) || 0;
  }

  // P0 新档必输：赠桃 30 枚。旧版摘 1 枚就算完成目标，新手只拿 1 件装备（战力约 600）就被引去打 1-1，
  // 而 1-1 的真实六成线约 760~880，实战 0%。现在要把赠桃摘完（或手头已无桃）才进入「开启闯关 / 通关1-1」。
  function giftPeachTarget() {
    const g = cfg().PEACH && Number(cfg().PEACH.GIFT);
    return g > 0 ? Math.floor(g) : 30;
  }

  function peachGoalDone(s) {
    const st = s || {};
    if (bestStage(st) >= 1) return true; // 已通过 1-1（含旧档）不再回头引导摘桃
    const picked = Math.floor(Number(st.peachesPicked) || 0);
    if (picked >= giftPeachTarget()) return true;
    const left = Math.floor((st.tree && Number(st.tree.peaches)) || 0);
    return picked >= 1 && left < 1 && !st.pending && hasAnyEquip(st);
  }

  // 完成判定仍走 peachGoalDone；文案把「摘满 30」和「树已摘空/已有装备」分开。
  const PEACH_HOLD_MS = 1200;
  function peachPickedFull(s) {
    return Math.floor(Number((s && s.peachesPicked) || 0)) >= giftPeachTarget();
  }
  function peachGoalText(s) {
    const st = s || {};
    const target = giftPeachTarget();
    const picked = Math.floor(Number(st.peachesPicked) || 0);
    if (peachPickedFull(st)) return `去法宝页摘桃（${target}/${target}）`;
    if (peachGoalDone(st) && bestStage(st) < 1) return '树已摘空，已有法宝';
    return picked > 0 ? `去法宝页摘桃（${Math.min(picked, target)}/${target}）` : '去法宝页摘桃';
  }

  function realmGoal(id, target, suffix) {
    return {
      id,
      tab: 'tab-cultivate',
      realm: target,
      text: () => `突破至${realmName(target)}${suffix || ''}`,
      done: (s) => (s.realmIndex || 0) >= target
    };
  }

  const STATIC_GOALS = [
    realmGoal('realm1', 1),
    {
      id: 'peach',
      tab: 'tab-gear',
      text: (s) => peachGoalText(s),
      done: (s) => peachGoalDone(s)
    },
    realmGoal('realm2', 2, '（开启闯关）'),
    { id: 'stage1', tab: 'tab-stage', text: () => '通关1-1', done: (s) => bestStage(s) >= 1 },
    { id: 'gongfa', tab: 'tab-upgrades', text: () => '去洞府参悟一层功法', done: (s) => sumLv(s.gongfa) >= 2 },
    {
      id: 'spend',
      tab: 'tab-upgrades',
      text: (s) => spendGoalText(s),
      // 灵石还买得起时继续提醒；能突破时让位给突破目标；通关 1-10 或到化灵初后也让位。
      done: (s) => !canAffordUpgrade(s) || bestStage(s) >= 10 || (s.realmIndex || 0) >= 6 || canBreakNow(s)
    },
    realmGoal('realm3', 3)
  ];

  function bossNameForStage(stageNum) {
    const bosses = (cfg().BATTLE && cfg().BATTLE.BOSSES) || [];
    const chapter = Math.max(1, Math.ceil((Number(stageNum) || 1) / 10));
    const entry = bosses[chapter - 1];
    return (entry && entry.name) || '';
  }

  // 渡劫真正挡路的下一只 Boss（可能是通往关卡门槛的中间首领，而不一定是门槛本人）。
  function blockingBoss(s) {
    const st = s || {};
    if (!cfg().ENABLE_STAGE_GATES) return null;
    const realm = st.realmIndex || 0;
    const gate = (cfg().TRIBULATION_GATES || {})[realm];
    if (!gate) return null;
    const best = bestStage(st);
    if (best >= gate.stage) return null;
    const nextBoss = Math.min(gate.stage, Math.ceil((best + 1) / 10) * 10);
    const chapter = Math.ceil(nextBoss / 10);
    const name = bossNameForStage(nextBoss) || (nextBoss === gate.stage ? gate.boss : '');
    const reachable = best + 1 >= nextBoss;
    return {
      stage: nextBoss,
      chapter,
      name,
      gate,
      reachable,
      cur: reachable ? nextBoss : Math.max(1, best + 1)
    };
  }

  function focusBlockingBoss(s) {
    const block = blockingBoss(s);
    if (!block || !s || !s.stage) return block;
    s.stage.cur = block.cur;
    return block;
  }

  function blockingGoal(block, realm) {
    if (!block) return null;
    return {
      id: `gate${realm || ''}_boss${block.stage}`,
      text: `击败第${block.chapter}章首领【${block.name}】`,
      tab: 'tab-stage',
      bossStage: block.stage
    };
  }


  function nextLockedBuilding(s) {
    const realm = (s && s.realmIndex) || 0;
    const list = cfg().DONGFU_LIST || [];
    let best = null;
    list.forEach((item) => {
      if (realm < item.unlockRealmIndex && (!best || item.unlockRealmIndex < best.unlockRealmIndex)) {
        best = item;
      }
    });
    return best;
  }

  function buildingUnlockHint(s) {
    const b = nextLockedBuilding(s);
    if (!b) return '';
    return `${realmGapText((s && s.realmIndex) || 0, b.unlockRealmIndex)}解锁${b.name}`;
  }

  function currentGoal(s) {
    const st = s || {};
    const block = blockingBoss(st);
    if (block) return blockingGoal(block, st.realmIndex || 0);
    for (let i = 0; i < STATIC_GOALS.length; i++) {
      const g = STATIC_GOALS[i];
      if (!g.done(st)) {
        return { id: g.id, text: g.text(st), tab: g.tab, realm: g.realm };
      }
    }
    const realm = st.realmIndex || 0;
    const gates = cfg().TRIBULATION_GATES || {};
    const gate = cfg().ENABLE_STAGE_GATES ? gates[realm] : null;
    if (gate && bestStage(st) < gate.stage) {
      return blockingGoal({ stage: gate.stage, chapter: gate.chapter, name: gate.boss }, realm);
    }
    const total = (cfg().REALM_STAGES || []).length || TOTAL_REALMS;
    const building = nextLockedBuilding(st);
    if (realm < total - 1) {
      const target = realm + 1;
      // 下一重正好解锁建筑时，主目标仍是修行突破（点目标条去突破），建筑提示附在进度里但不盖掉灵气百分比。
      return {
        id: `realm${target}`,
        text: `突破至${realmName(target)}`,
        tab: 'tab-cultivate',
        realm: target,
        buildingHint: building ? buildingUnlockHint(st) : '',
        buildingId: building && building.unlockRealmIndex === target ? building.id : undefined
      };
    }
    return { id: 'reincarnate', text: '去轮回转世，凝结道果', tab: 'tab-reincarnate' };
  }

  function isGoalDone(goal, s) {
    if (!goal || !s) return false;
    if (goal.realm !== undefined) return (s.realmIndex || 0) >= goal.realm;
    const g = STATIC_GOALS.find((item) => item.id === goal.id);
    if (g) return g.done(s);
    if (goal.id === 'reincarnate') return false;
    return currentGoal(s).id !== goal.id;
  }

  // 目标进度：下一重突破显示灵气百分比；若有下一座建筑提示，附在百分比后面，不盖掉。
  function goalProgress(goal, s, stage) {
    let qiText = '';
    if (goal && goal.realm !== undefined && stage && !stage.isMaxStage && (s.realmIndex || 0) + 1 === goal.realm) {
      const pct = Math.min(100, Math.floor(((s.qi || 0) / Math.max(1, stage.reqQi)) * 100));
      qiText = `灵气 ${pct}%`;
    }
    const stageHint = (goal && goal.realm !== undefined && (s.realmIndex || 0) >= 3 && (s.stage && (s.stage.best || 0) < 10))
      ? '通关1-10（首领山魈娘娘）'
      : '';
    const hint = [stageHint, goal && goal.buildingHint].filter(Boolean).join(' · ');
    if (qiText && hint) return `${qiText} · ${hint}`;
    return qiText || hint || '';
  }

  // ---------- 红点 ----------
  function gearDot(s, now) {
    if (!s || (s.realmIndex || 0) < peachUnlockRealm()) return false;
    if (s.guide && !s.guide.gearVisited) return true;
    if (s.pending) return true;
    const tree = s.tree || {};
    if ((tree.peaches || 0) >= 10) return true;
    if (tree.upEnd && tree.upEnd <= (now || Date.now())) return true;
    return false;
  }

  // 法宝页内红点：页签亮着时，让玩家看见是「摘桃/处理掉落」还是「树已升级完成」。
  function gearPickDot(s) {
    if (!s || (s.realmIndex || 0) < peachUnlockRealm()) return false;
    if (s.pending) return true;
    return ((s.tree && s.tree.peaches) || 0) >= 10;
  }

  function gearTreeDot(s, now) {
    if (!s || (s.realmIndex || 0) < peachUnlockRealm()) return false;
    const tree = s.tree || {};
    return Boolean(tree.upEnd && tree.upEnd <= (now || Date.now()));
  }

  // api: { playerStats(s), enemyFor(n) }
  function stageDot(s, api, now) {
    if (!s || (s.realmIndex || 0) < stageUnlockRealm()) return false;
    const st = s.stage || {};
    const best = Number(st.best) || 0;
    // 赠桃没摘完、还没换上法宝时不点闯关红点（先引导去法宝页）
    if (best < 1 && !peachGoalDone(s)) return false;
    if (best > 0 && st.idleAt && (now || Date.now()) - st.idleAt >= 3600 * 1000) return true;
    if (best >= 300 || !api || typeof api.playerStats !== 'function' || typeof api.enemyFor !== 'function') return false;
    const cur = Math.max(1, Math.min(300, Number(st.cur) || best + 1));
    const player = api.playerStats(s);
    const enemy = api.enemyFor(cur);
    if (!player || !enemy) return false;
    return Number(player.cp) >= Number(enemy.cp);
  }

  // api: { getGongfaCost(item), getDongfuCost(item) } — 与 game.js 洞府红点同口径
  function upgradeDot(s, api) {
    if (!s || !api) return false;
    const realm = s.realmIndex || 0;
    const stones = s.stones || 0;
    const ok = (list, costFn) =>
      (list || []).some((item) => realm >= item.unlockRealmIndex && stones >= costFn(item));
    return ok(cfg().GONGFA_LIST, api.getGongfaCost) || ok(cfg().DONGFU_LIST, api.getDongfuCost);
  }

  // 敌方战力高出我方 15% 以上（旧口径，供其他调用）。
  function enemyExceedsTeam(playerCp, enemyCp, ratio) {
    const p = Number(playerCp);
    const e = Number(enemyCp);
    const r = Number(ratio);
    const lim = Number.isFinite(r) && r > 0 ? r : 1.15;
    if (!Number.isFinite(p) || !Number.isFinite(e) || p <= 0) return false;
    return (e - p) * 100 > p * Math.round((lim - 1) * 100);
  }

  // 战败标题与「先回洞府/突破」同一口径：相对推荐战力的缺口超过 15%。
  function recGapExceeds(playerCp, recCp, ratio) {
    const p = Number(playerCp);
    const rec = Number(recCp);
    const lim = Number.isFinite(Number(ratio)) && Number(ratio) > 0 ? Number(ratio) : 0.15;
    if (!Number.isFinite(p) || !Number.isFinite(rec) || rec <= 0) return false;
    const gap = Math.max(0, Math.round(rec) - Math.round(p));
    return gap / rec > lim;
  }

  function powerJumpTab(s) {
    const st = s || {};
    const list = (cfg().REALM_STAGES || []);
    const idx = Math.max(0, Math.min(list.length - 1, Math.floor(st.realmIndex || 0)));
    const stage = list[idx];
    if (stage && !stage.isMaxStage && (st.qi || 0) >= stage.reqQi) return 'tab-cultivate';
    return 'tab-upgrades';
  }

  // ---------- 装备对比 ----------
  function compareDiff(oldCp, newCp) {
    const delta = Math.round(Number(newCp) || 0) - Math.round(Number(oldCp) || 0);
    const sign = delta > 0 ? 'up' : delta < 0 ? 'down' : 'same';
    const arrow = sign === 'up' ? '↑' : sign === 'down' ? '↓' : '＝';
    const num = delta > 0 ? `+${fmt(delta)}` : delta < 0 ? `-${fmt(Math.abs(delta))}` : '0';
    return {
      delta,
      sign,
      arrow,
      better: delta > 0,
      color: sign === 'up' ? '#7ddea0' : sign === 'down' ? '#f07167' : '#e7e2d6',
      text: delta === 0 ? '无差异' : `战力 ${arrow} ${num}`
    };
  }

  // ---------- 闯关失败后的提升途径（batch2 P1-3） ----------
  // 估算「去摘桃 / 去参悟功法 / 去突破」各能带来多少战力：临时改动存档、用现有 Battle.playerStats 计算后立即还原。
  function seededRandom(seed) {
    let x = (seed >>> 0) || 1;
    return function () {
      x ^= x << 13; x >>>= 0;
      x ^= x >>> 17;
      x ^= x << 5; x >>>= 0;
      return (x >>> 0) / 4294967296;
    };
  }

  // 引导里的「战力 +X」必须与顶栏同一口径（Equip.combatPower）。
  // Battle.playerStats(s).cp 含 squadScale = 出战人数/6，单人上阵会把真实战力差缩小约 6 倍。
  function cpOf(s) {
    const E = window.Equip;
    if (E && typeof E.combatPower === 'function') return Math.round(Number(E.combatPower(s)) || 0);
    const B = window.Battle;
    return B ? Math.round(Number(B.playerStats(s).cp) || 0) : 0;
  }

  const CHAIN_SECONDS = 120;

  function canBreakNow(s) {
    if (!s) return false;
    const list = cfg().REALM_STAGES || [];
    const st = list[s.realmIndex || 0];
    if (!st || st.isMaxStage) return false;
    if ((Number(s.qi) || 0) < (Number(st.reqQi) || 0)) return false;
    return !tribulationGate(s);
  }

  function fmtRate(n) {
    const x = Number(n) || 0;
    if (x >= 100) return String(Math.round(x));
    const r = Math.round(x * 10) / 10;
    return Number.isInteger(r) ? String(r) : r.toFixed(1);
  }

  function spendGoalText(s) {
    const GS = window.GameState;
    if (!s || !GS || !canAffordUpgrade(s)) return '把灵石用来参悟功法/修建洞府';
    const before = (typeof GS.getQiPerSec === 'function' ? Number(GS.getQiPerSec()) : 0) || 0;
    const detail = estimateSpendDetail(s);
    if (!detail || !(detail.qiPerSecAfter > 0)) return '把灵石用来参悟功法/修建洞府';
    return `把灵石用来参悟功法（灵气 ${fmtRate(before)}/s → ${fmtRate(detail.qiPerSecAfter)}/s）`;
  }

  const SIM_KEYS = ['qi', 'realmIndex', 'stones', 'gongfa', 'dongfu', 'path', 'equip', 'breakAttempts', 'pity', 'pending', 'tree', 'peachesPicked'];

  function snapshotSim(s) {
    const o = {};
    for (let i = 0; i < SIM_KEYS.length; i += 1) {
      const k = SIM_KEYS[i];
      if (Object.prototype.hasOwnProperty.call(s, k)) o[k] = s[k];
    }
    return JSON.stringify(o);
  }

  function restoreSim(s, json) {
    const o = JSON.parse(json);
    for (let i = 0; i < SIM_KEYS.length; i += 1) {
      const k = SIM_KEYS[i];
      if (Object.prototype.hasOwnProperty.call(o, k)) s[k] = o[k];
      else if (Object.prototype.hasOwnProperty.call(s, k)) delete s[k];
    }
  }

  function remainingGuarantees(s) {
    const GS = window.GameState;
    const cap = (GS && GS.GUARANTEED_BREAKS) || 3;
    return Math.max(0, cap - (Number(s.breakAttempts) || 0));
  }

  function trySimBreak(s, GS, ctx) {
    const stage = typeof GS.getCurrentStage === 'function' ? GS.getCurrentStage() : null;
    if (!stage || stage.isMaxStage) return 'max';
    if (tribulationGate(s)) return 'gate';
    const need = Number(stage.reqQi) || 0;
    if ((Number(s.qi) || 0) < need) return 'need';
    if (!ctx || ctx.left <= 0) return 'unguaranteed';
    s.qi = Math.max(0, (Number(s.qi) || 0) - need);
    s.realmIndex = (s.realmIndex || 0) + 1;
    s.breakAttempts = (Number(s.breakAttempts) || 0) + 1;
    ctx.left -= 1;
    return 'ok';
  }

  function drainBreaks(s, GS, ctx) {
    let last = 'need';
    for (let i = 0; i < 80; i += 1) {
      last = trySimBreak(s, GS, ctx);
      if (last !== 'ok') return last;
    }
    return last;
  }

  function peekUnguaranteed(s, GS, base) {
    const stage = typeof GS.getCurrentStage === 'function' ? GS.getCurrentStage() : null;
    if (!stage || stage.isMaxStage || tribulationGate(s)) return null;
    const need = Number(stage.reqQi) || 0;
    if ((Number(s.qi) || 0) < need) return null;
    const rate = typeof GS.getBreakthroughSuccessRate === 'function' ? Number(GS.getBreakthroughSuccessRate()) : 0;
    const prevQi = s.qi;
    const prevRealm = s.realmIndex;
    s.qi = Math.max(0, (Number(s.qi) || 0) - need);
    s.realmIndex = (s.realmIndex || 0) + 1;
    const peek = {
      nextRealmIndex: s.realmIndex,
      nextRealmName: realmName(s.realmIndex),
      nextGain: Math.max(0, cpOf(s) - base),
      nextRate: rate
    };
    s.qi = prevQi;
    s.realmIndex = prevRealm;
    return peek;
  }

  function applyBuyFirst(s, buyFirst) {
    if (!buyFirst) return;
    if (buyFirst === 'peach') {
      simulateSpendPeach(s);
      return;
    }
    if (buyFirst === 'path') {
      simulateSpendPath(s);
      return;
    }
    if (buyFirst === 'gongfa' || buyFirst === 'dongfu') {
      simulateSpendStones(s, buyFirst);
      return;
    }
    simulateSpendStones(s, 'all');
  }

  function runBreakChain(s, budget, buyFirst) {
    const GS = window.GameState;
    const startRealm = s.realmIndex || 0;
    const base = cpOf(s);
    applyBuyFirst(s, buyFirst);
    const ctx = { left: remainingGuarantees(s) };
    let stop = drainBreaks(s, GS, ctx);
    let t = 0;
    const lim = Math.max(0, Math.floor(Number(budget) || 0));
    while (t < lim && stop === 'need') {
      const per = (typeof GS.getQiPerSec === 'function' ? Number(GS.getQiPerSec()) : 0) || 0;
      s.qi = (Number(s.qi) || 0) + per;
      t += 1;
      stop = drainBreaks(s, GS, ctx);
    }
    const endRealm = s.realmIndex || 0;
    const peek = stop === 'unguaranteed' ? peekUnguaranteed(s, GS, base) : null;
    const out = {
      gain: Math.max(0, cpOf(s) - base),
      realmIndex: endRealm,
      realmName: realmName(endRealm),
      breaks: Math.max(0, endRealm - startRealm),
      seconds: t,
      stop: stop === 'need' ? 'time' : stop,
      buyFirst: buyFirst || false,
      guaranteed: remainingGuarantees({ breakAttempts: (Number(s.breakAttempts) || 0) }) // leftover after sim, not needed
    };
    if (peek) {
      out.nextRealmIndex = peek.nextRealmIndex;
      out.nextRealmName = peek.nextRealmName;
      out.nextGain = peek.nextGain;
      out.nextRate = peek.nextRate;
    }
    return out;
  }

  // 120 秒连锁：只改传入的活 state 上相关字段，try/finally 还原；不存档、不派事件、不刷界面。
  // 缓存按 fullKey 做有上限的 LRU；灵气按约 0.5 秒产量分桶。fullKey 变了立刻重算，不再用时间节流。
  // 键用轻量签名（不出整对象 JSON.stringify）；先做引用/分桶快检，命中时不重建键。
  const CHAIN_CACHE_LIMIT = 16;
  let chainCache = new Map();
  let chainComputeCount = 0;
  let chainKeyBuildCount = 0;
  let lastQuick = null;

  function qiBucket(s, GS) {
    const qi = Number(s.qi) || 0;
    const per = (GS && typeof GS.getQiPerSec === 'function' ? Number(GS.getQiPerSec()) : 0) || 0;
    const step = Math.max(1, per * 0.5);
    return Math.floor(qi / step);
  }

  function mapLvSig(map) {
    if (!map || typeof map !== 'object') return '';
    const keys = Object.keys(map);
    let out = '';
    for (let i = 0; i < keys.length; i += 1) {
      const v = map[keys[i]];
      out += keys[i] + ':' + (v && typeof v === 'object' ? (v.lv != null ? v.lv : 1) : (v || 0)) + ',';
    }
    return out;
  }

  function itemSubSig(sub) {
    if (!sub || !sub.length) return '';
    const parts = [];
    for (let i = 0; i < sub.length; i += 1) {
      const pair = sub[i];
      if (!pair) continue;
      parts.push(`${pair[0]}:${pair[1]}`);
    }
    parts.sort();
    return parts.join(',');
  }

  function itemSig(it) {
    if (!it) return '-';
    return `${it.q}:${it.lv}:${it.m}:${it.id || ''}:${it.name || ''}:${itemSubSig(it.sub)}`;
  }

  function equipSig(equip) {
    if (!equip) return '';
    const keys = Object.keys(equip).sort();
    let out = '';
    for (let i = 0; i < keys.length; i += 1) {
      out += keys[i] + ':' + itemSig(equip[keys[i]]) + ',';
    }
    return out;
  }

  function beastsSig(beasts) {
    if (!beasts || typeof beasts !== 'object') return '';
    const owned = beasts.owned || beasts;
    const active = beasts.active || '';
    return `${active}|${mapLvSig(owned)}`;
  }

  function chainFullKey(s, budget, buyFirst, GS) {
    chainKeyBuildCount += 1;
    const path = s.path;
    const titles = s.titles;
    return [
      qiBucket(s, GS),
      Math.floor(Number(s.stones) || 0),
      s.realmIndex || 0,
      s.breakAttempts || 0,
      Number(s.pityBonus) || 0,
      s.totalDaoGuo || 0,
      (s.stage && s.stage.best) || 0,
      (s.tree && s.tree.lv) || 0,
      (s.tree && s.tree.peaches) || 0,
      pitySig(s.pity),
      (s.squad || []).join(','),
      titles ? `${titles.worn || ''}:${(titles.owned || []).join(',')}` : '',
      path ? `${path.id || ''}:${(path.lv || []).join('')}` : '',
      mapLvSig(s.gongfa),
      mapLvSig(s.dongfu),
      mapLvSig(s.talents),
      beastsSig(s.beasts),
      equipSig(s.equip),
      pendingSig(s.pending),
      budget,
      String(buyFirst || '')
    ].join('|');
  }

  function titlesSig(titles) {
    return titles ? `${titles.worn || ''}:${(titles.owned || []).join(',')}` : '';
  }
  function pathSig(path) {
    return path ? `${path.id || ''}:${(path.lv || []).join('')}` : '';
  }
  function pendingSig(pending) {
    return pending ? `${pending.s}:${itemSig(pending)}` : '';
  }

  function pitySig(pity) {
    if (!pity || typeof pity !== 'object') return '';
    const keys = Object.keys(pity).sort();
    let out = '';
    for (let i = 0; i < keys.length; i += 1) {
      out += keys[i] + ':' + (Number(pity[keys[i]]) || 0) + ',';
    }
    return out;
  }

  function quickStateSame(s, budget, GS) {
    const q = lastQuick;
    if (!q || q.state !== s || q.budget !== budget) return false;
    if (q.qB !== qiBucket(s, GS)) return false;
    if (q.stones !== Math.floor(Number(s.stones) || 0)) return false;
    if (q.realm !== (s.realmIndex || 0)) return false;
    if (q.breakAttempts !== (s.breakAttempts || 0)) return false;
    if (q.pityBonus !== (Number(s.pityBonus) || 0)) return false;
    if (q.treeLv !== ((s.tree && s.tree.lv) || 0)) return false;
    if (q.peaches !== ((s.tree && s.tree.peaches) || 0)) return false;
    if (q.pitySig !== pitySig(s.pity)) return false;
    if (q.best !== ((s.stage && s.stage.best) || 0) || q.dao !== (s.totalDaoGuo || 0)) return false;
    // 不靠对象引用：restoreSim 的 JSON.parse 会换新引用，签名不变则视为同一输入
    if (q.equipSig !== equipSig(s.equip)) return false;
    if (q.gongfaSig !== mapLvSig(s.gongfa) || q.dongfuSig !== mapLvSig(s.dongfu)) return false;
    if (q.talentsSig !== mapLvSig(s.talents) || q.beastsSig !== beastsSig(s.beasts)) return false;
    if (q.titlesSig !== titlesSig(s.titles) || q.pathSig !== pathSig(s.path) || q.pendingSig !== pendingSig(s.pending)) return false;
    if (q.squadSig !== (s.squad || []).join(',')) return false;
    return true;
  }

  function quickSame(s, budget, buyFirst, GS) {
    return quickStateSame(s, budget, GS) && Object.prototype.hasOwnProperty.call(lastQuick.keys, String(buyFirst || ''));
  }

  function rememberQuick(s, budget, GS, buyFirst, full) {
    if (!quickStateSame(s, budget, GS)) {
      lastQuick = {
        state: s,
        budget,
        qB: qiBucket(s, GS),
        stones: Math.floor(Number(s.stones) || 0),
        realm: s.realmIndex || 0,
        breakAttempts: s.breakAttempts || 0,
        pityBonus: Number(s.pityBonus) || 0,
        treeLv: (s.tree && s.tree.lv) || 0,
        peaches: (s.tree && s.tree.peaches) || 0,
        pitySig: pitySig(s.pity),
        best: (s.stage && s.stage.best) || 0,
        dao: s.totalDaoGuo || 0,
        equipSig: equipSig(s.equip),
        gongfaSig: mapLvSig(s.gongfa),
        dongfuSig: mapLvSig(s.dongfu),
        talentsSig: mapLvSig(s.talents),
        beastsSig: beastsSig(s.beasts),
        titlesSig: titlesSig(s.titles),
        pathSig: pathSig(s.path),
        pendingSig: pendingSig(s.pending),
        squadSig: (s.squad || []).join(','),
        keys: {}
      };
    }
    lastQuick.keys[String(buyFirst || '')] = full;
  }

  function cacheGet(key) {
    if (!chainCache.has(key)) return undefined;
    const val = chainCache.get(key);
    chainCache.delete(key);
    chainCache.set(key, val);
    return val;
  }

  function cacheSet(key, val) {
    if (chainCache.has(key)) chainCache.delete(key);
    chainCache.set(key, val);
    while (chainCache.size > CHAIN_CACHE_LIMIT) {
      const oldest = chainCache.keys().next().value;
      chainCache.delete(oldest);
    }
  }

  function estimateBreakChain(s, seconds, opts) {
    const GS = window.GameState;
    if (!s || !GS) return null;
    const budget = seconds == null ? CHAIN_SECONDS : Number(seconds);
    const buyFirst = opts && opts.buyFirst ? opts.buyFirst : false;
    if (quickSame(s, budget, buyFirst, GS)) {
      const hit = cacheGet(lastQuick.keys[String(buyFirst || '')]);
      if (hit !== undefined) return hit;
    }
    const full = chainFullKey(s, budget, buyFirst, GS);
    const cached = cacheGet(full);
    if (cached !== undefined) {
      rememberQuick(s, budget, GS, buyFirst, full);
      return cached;
    }
    const json = snapshotSim(s);
    let result = null;
    try {
      chainComputeCount += 1;
      result = runBreakChain(s, budget, buyFirst);
    } finally {
      restoreSim(s, json);
    }
    cacheSet(full, result);
    rememberQuick(s, budget, GS, buyFirst, full);
    return result;
  }

  function resetChainCache() {
    chainCache = new Map();
    lastQuick = null;
    chainKeyBuildCount = 0;
  }

  function chainComputeCalls() {
    return chainComputeCount;
  }
  function chainKeyBuildCalls() {
    return chainKeyBuildCount;
  }

  function chainSuccessNote(chain) {
    if (!chain || !chain.nextRealmName || chain.nextRate == null) return '';
    const pct = Math.round((Number(chain.nextRate) || 0) * 100);
    return `，再成功一次（约 ${pct}%）可至${chain.nextRealmName}，战力 +${fmt(chain.nextGain)}`;
  }

  function breakGainText(s) {
    if (!s || tribulationGate(s) || !canBreakNow(s)) return '';
    const chain = estimateBreakChain(s, CHAIN_SECONDS);
    if (!chain) return '';
    if (chain.breaks >= 1 && chain.gain > 0) return `战力 +${fmt(chain.gain)}`;
    if (chain.nextGain > 0) return `战力 +${fmt(chain.nextGain)}`;
    return '';
  }

  function formatBreakChainLabel(s, chain) {
    if (!chain) return '';
    const st = currentStageOf(s);
    const major = nextMajorName(s);
    const note = chainSuccessNote(chain);
    if (chain.breaks < 1) {
      if (!chain.nextRealmName) return '';
      const pct = Math.round((Number(chain.nextRate) || 0) * 100);
      return st && st.isMajorTribulation
        ? `渡劫进入${major} · 再成功一次（约 ${pct}%）可至${chain.nextRealmName}，战力 +${fmt(chain.nextGain)}`
        : `可以突破 · 再成功一次（约 ${pct}%）可至${chain.nextRealmName}，战力 +${fmt(chain.nextGain)}`;
    }
    const dest = chain.realmName;
    const gain = fmt(chain.gain);
    const base = st && st.isMajorTribulation
      ? `渡劫进入${major} · 2 分钟内可连破至${dest}，战力 +${gain}`
      : `可以突破 · 2 分钟内可连破 ${chain.breaks} 重，战力 +${gain}`;
    return base + note;
  }

  function formatSpendChainLabel(prefix, chain, fallback) {
    if (!chain || (chain.breaks < 1 && !chain.nextRealmName)) return fallback;
    if (chain.breaks < 1) {
      const pct = Math.round((Number(chain.nextRate) || 0) * 100);
      return `${prefix}再成功一次（约 ${pct}%）可至${chain.nextRealmName}，战力 +${fmt(chain.nextGain)}`;
    }
    return `${prefix}2 分钟内可连破至${chain.realmName}，战力 +${fmt(chain.gain)}` + chainSuccessNote(chain);
  }

  const REC_ORDER = ['break', 'gongfa', 'peach', 'dongfu', 'path'];
  const REC_NAMES = { break: '突破', gongfa: '修行', peach: '法宝', dongfu: '洞府', path: '道途' };

  function categoryChain(s, key) {
    if (key === 'break') {
      if (tribulationGate(s)) return null;
      return estimateBreakChain(s, CHAIN_SECONDS);
    }
    if (key === 'gongfa') {
      if (!canAffordUpgrade(s) && !cheapestUpgrade(s, 'gongfa')) return null;
      if (!cheapestUpgrade(s, 'gongfa')) return null;
      return estimateBreakChain(s, CHAIN_SECONDS, { buyFirst: 'gongfa' });
    }
    if (key === 'dongfu') {
      if (!cheapestUpgrade(s, 'dongfu')) return null;
      return estimateBreakChain(s, CHAIN_SECONDS, { buyFirst: 'dongfu' });
    }
    if (key === 'path') {
      const P = window.Path;
      if (!P || !P.isUnlocked || !P.isUnlocked(s)) return null;
      const cur = P.peek ? P.peek(s) : null;
      if (!cur || !cur.id || (P.hasAction && !P.hasAction(s))) return null;
      return estimateBreakChain(s, CHAIN_SECONDS, { buyFirst: 'path' });
    }
    if (key === 'peach') {
      const CFG = window.GameConfig;
      const unlock = (CFG && CFG.PEACH && CFG.PEACH.UNLOCK_REALM) || 1;
      const peaches = Math.floor((s.tree && s.tree.peaches) || 0);
      const hasPeach = (s.realmIndex || 0) >= unlock && peaches > 0;
      const E = window.Equip;
      const hasPending = !!(s.pending && E && typeof E.powerWithSwap === 'function' && E.powerWithSwap(s, s.pending) > E.combatPower(s));
      if (!hasPeach && !hasPending) return null;
      return estimateBreakChain(s, CHAIN_SECONDS, { buyFirst: 'peach' });
    }
    return null;
  }

  function recActionable(ch) {
    if (!ch) return false;
    return (Number(ch.gain) || 0) > 0 || Boolean(ch.nextRealmName);
  }

  function recommendBest(s) {
    if (!s) return null;
    let best = null;
    for (let i = 0; i < REC_ORDER.length; i += 1) {
      const key = REC_ORDER[i];
      const ch = categoryChain(s, key);
      if (!recActionable(ch)) continue;
      const gain = Number(ch.gain) || 0;
      if (!best || gain > best.gain) {
        best = { key, name: REC_NAMES[key], gain, chain: ch, tab: key === 'break' || key === 'path' ? 'tab-cultivate' : key === 'peach' ? 'tab-gear' : 'tab-upgrades' };
      }
    }
    return best;
  }

  function nextMajorName(s) {
    const list = cfg().REALM_STAGES || [];
    const next = list[(s.realmIndex || 0) + 1];
    return (next && next.majorName) || realmName((s.realmIndex || 0) + 1);
  }

  function currentStageOf(s) {
    const list = cfg().REALM_STAGES || [];
    return list[s.realmIndex || 0] || null;
  }

  function tribHintText(s, stage) {
    const C = cfg();
    const st = stage || currentStageOf(s);
    if (!st || typeof C.shouldShowTribHint !== 'function' || !C.shouldShowTribHint(st)) return '';
    const list = C.REALM_STAGES || [];
    const idx = Number.isInteger(st.index) ? st.index : list.indexOf(st);
    const next = idx >= 0 ? list[idx + 1] : null;
    const cur = Number(st.reqQi) || 0;
    const nxt = next ? Number(next.reqQi) || 0 : 0;
    const n = cur > 0 ? Math.max(1, Math.round(nxt / cur)) : 0;
    const hasQi = !st.isMaxStage && (Number(s && s.qi) || 0) >= (Number(st.reqQi) || 0);
    if (hasQi && !tribulationGate(s)) {
      const ch = estimateBreakChain(s, CHAIN_SECONDS);
      if (ch && ch.breaks >= 2 && ch.seconds <= CHAIN_SECONDS) return '';
    }
    return n >= 2
      ? `渡劫后下一重需灵气 ×${n}，记得先参悟功法提速`
      : '渡劫后下一重需灵气大幅提升，记得先参悟功法提速';
  }

  function estimateBreakGain(s) {
    const GS = window.GameState;
    const stage = GS.getCurrentStage();
    if (!stage || stage.isMaxStage || (s.qi || 0) < stage.reqQi) return null;
    if (window.Equip && window.Equip.tribulationLock && window.Equip.tribulationLock(s)) return null;
    const base = cpOf(s);
    const prev = s.realmIndex;
    let after = base;
    try {
      s.realmIndex = prev + 1;
      after = cpOf(s);
    } finally {
      s.realmIndex = prev;
    }
    return Math.max(0, after - base);
  }

  // 预估会原地改 s.gongfa / s.dongfu / s.stones，算完必须还原。
  // GameState.state 只有 getter、没有 setter，不能整对象替换；调用方必须传入当前
  // 正在使用的那份 state（与 GameState.state 同一引用），getQiPerSec / getGongfaCost
  // / tribulationLock 才能读到模拟结果。

  function canAffordUpgrade(s) {
    const GS = window.GameState;
    const CFG = window.GameConfig;
    if (!s || !GS) return false;
    const realm = s.realmIndex || 0;
    const stones = s.stones || 0;
    const gongfa = ((CFG && CFG.GONGFA_LIST) || []).some((item) => realm >= (item.unlockRealmIndex || 0) && stones >= GS.getGongfaCost(item));
    const dongfu = ((CFG && CFG.DONGFU_LIST) || []).some((item) => realm >= (item.unlockRealmIndex || 0) && stones >= GS.getDongfuCost(item));
    return gongfa || dongfu;
  }

  function cheapestUpgrade(s, only) {
    const GS = window.GameState;
    const CFG = window.GameConfig;
    const realm = s.realmIndex || 0;
    let pick = null;
    let kind = '';
    let cost = Infinity;
    const wantG = !only || only === 'all' || only === 'gongfa' || only === true;
    const wantD = !only || only === 'all' || only === 'dongfu' || only === true;
    if (wantG) {
      ((CFG && CFG.GONGFA_LIST) || []).forEach((item) => {
        if (realm < (item.unlockRealmIndex || 0)) return;
        const c = GS.getGongfaCost(item);
        if (c <= (s.stones || 0) && c < cost) { pick = item; kind = 'gongfa'; cost = c; }
      });
    }
    if (wantD) {
      ((CFG && CFG.DONGFU_LIST) || []).forEach((item) => {
        if (realm < (item.unlockRealmIndex || 0)) return;
        const c = GS.getDongfuCost(item);
        if (c <= (s.stones || 0) && c < cost) { pick = item; kind = 'dongfu'; cost = c; }
      });
    }
    return pick ? { item: pick, kind, cost } : null;
  }

  // 模拟把买得起的功法/洞府买完（最多 60 次）。必须在 GameState.state 上跑，因为造价和灵气/秒都读全局 state。
  function simulateSpendStones(s, only) {
    if (!s.gongfa) s.gongfa = {};
    if (!s.dongfu) s.dongfu = {};
    for (let i = 0; i < 60; i += 1) {
      const p = cheapestUpgrade(s, only);
      if (!p) break;
      s.stones -= p.cost;
      if (p.kind === 'gongfa') s.gongfa[p.item.id] = (s.gongfa[p.item.id] || 0) + 1;
      else s.dongfu[p.item.id] = (s.dongfu[p.item.id] || 0) + 1;
    }
  }

  function simulateSpendPath(s) {
    const P = window.Path;
    if (!P || typeof P.upgrade !== 'function' || typeof P.isUnlocked !== 'function') return;
    if (!P.isUnlocked(s)) return;
    const cur = typeof P.peek === 'function' ? P.peek(s) : (s.path || {});
    if (!cur || !cur.id) return;
    for (let n = 0; n < 12; n += 1) {
      let ok = false;
      for (let i = 0; i < 3; i += 1) {
        const r = P.upgrade(s, i);
        if (r && r.ok) { ok = true; break; }
      }
      if (!ok) break;
    }
  }

  function simulateSpendPeach(s) {
    const CFG = window.GameConfig;
    const E = window.Equip;
    if (s.pending && E && typeof E.powerWithSwap === 'function' && typeof E.combatPower === 'function') {
      if (E.powerWithSwap(s, s.pending) > E.combatPower(s)) {
        if (!s.equip) s.equip = {};
        s.equip[s.pending.s] = s.pending;
        s.pending = null;
      }
    }
    const unlockRealm = (CFG && CFG.PEACH && CFG.PEACH.UNLOCK_REALM) || 1;
    const peaches = Math.floor((s.tree && s.tree.peaches) || 0);
    if (!E || !E.rollItem || (s.realmIndex || 0) < unlockRealm || peaches <= 0) return;
    const realRandom = Math.random;
    try {
      Math.random = seededRandom(0x5eed + peaches * 31 + (s.realmIndex || 0));
      const fake = { tree: { lv: (s.tree && s.tree.lv) || 1 }, pity: Object.assign({ di: 0, tian: 0 }, s.pity || {}), realmIndex: s.realmIndex || 0, seq: 0 };
      if (!s.equip) s.equip = {};
      let cur = cpOf(s);
      for (let i = 0; i < Math.min(12, peaches); i += 1) {
        const item = E.rollItem(fake);
        const prev = s.equip[item.s];
        s.equip[item.s] = item;
        const cp = cpOf(s);
        if (cp > cur) {
          cur = cp;
          if (s.tree) s.tree.peaches = Math.max(0, (Number(s.tree.peaches) || 0) - 1);
          s.peachesPicked = (Number(s.peachesPicked) || 0) + 1;
        } else s.equip[item.s] = prev;
      }
      s.pity = Object.assign({}, fake.pity);
    } finally {
      Math.random = realRandom;
    }
  }

  function realmCpGain(s) {
    const list = (window.GameConfig && window.GameConfig.REALM_STAGES) || [];
    const idx = s.realmIndex || 0;
    if (!list[idx + 1]) return 0;
    const base = cpOf(s);
    const prev = s.realmIndex;
    let after = base;
    try {
      s.realmIndex = prev + 1;
      after = cpOf(s);
    } finally {
      s.realmIndex = prev;
    }
    return Math.max(0, after - base);
  }

  // 用现有灵石从最便宜的功法/洞府开始买。T 必须按买完后的灵气/秒算，不能用当前速度。
  function estimateGongfaGain(s) {
    const detail = estimateSpendDetail(s);
    if (!detail) return null;
    if (detail.eta != null && detail.eta <= 120) return detail.breakGain;
    return detail.immediate;
  }

  function tribulationGate(s) {
    const E = window.Equip;
    if (!E || typeof E.tribulationLock !== 'function') return null;
    return E.tribulationLock(s) || null;
  }

  function estimateSpendDetail(s) {
    const GS = window.GameState;
    if (!s || !GS || !canAffordUpgrade(s)) return null;
    const locked = !!tribulationGate(s);
    const stage = typeof GS.getCurrentStage === 'function' ? GS.getCurrentStage() : null;
    const prevGongfa = Object.assign({}, s.gongfa || {});
    const prevDongfu = Object.assign({}, s.dongfu || {});
    const prevStones = s.stones;
    const base = cpOf(s);
    const qi0 = s.qi || 0;
    const need = stage && !stage.isMaxStage ? Number(stage.reqQi) || 0 : 0;
    let immediate = 0;
    let qiPerSecAfter = 0;
    try {
      simulateSpendStones(s);
      immediate = Math.max(0, cpOf(s) - base);
      qiPerSecAfter = (typeof GS.getQiPerSec === 'function' ? Number(GS.getQiPerSec()) : 0) || 0;
    } finally {
      s.gongfa = prevGongfa;
      s.dongfu = prevDongfu;
      s.stones = prevStones;
    }
    let eta = null;
    if (!locked) {
      if (need > 0 && qiPerSecAfter > 0) {
        eta = Math.max(0, Math.ceil((need - qi0) / qiPerSecAfter));
      } else if (need > 0 && qi0 >= need) {
        eta = 0;
      }
    }
    return {
      immediate,
      breakGain: locked ? 0 : realmCpGain(s),
      eta,
      qiPerSecAfter,
      stones: prevStones,
      locked
    };
  }

  // 摘现有仙桃（最多 12 枚）按固定种子掷出法宝，比当前好就换上
  function estimatePeachGain(s) {
    const CFG = window.GameConfig;
    const E = window.Equip;
    const unlockRealm = (CFG && CFG.PEACH && CFG.PEACH.UNLOCK_REALM) || 1;
    const peaches = Math.floor((s.tree && s.tree.peaches) || 0);
    if (!E || !E.rollItem || (s.realmIndex || 0) < unlockRealm || peaches <= 0) return null;
    const base = cpOf(s);
    const prevEquip = Object.assign({}, s.equip || {});
    const realRandom = Math.random;
    let after = base;
    try {
      Math.random = seededRandom(0x5eed + peaches * 31 + (s.realmIndex || 0));
      const fake = { tree: { lv: (s.tree && s.tree.lv) || 1 }, pity: Object.assign({ di: 0, tian: 0 }, s.pity || {}), realmIndex: s.realmIndex || 0, seq: 0 };
      if (!s.equip) s.equip = {};
      let cur = base;
      for (let i = 0; i < Math.min(12, peaches); i += 1) {
        const item = E.rollItem(fake);
        const prev = s.equip[item.s];
        s.equip[item.s] = item;
        const cp = cpOf(s);
        if (cp > cur) cur = cp;
        else s.equip[item.s] = prev;
      }
      after = cur;
    } finally {
      Math.random = realRandom;
      s.equip = prevEquip;
    }
    return Math.max(0, after - base);
  }

  function estimatePendingGain(s) {
    const E = window.Equip;
    if (!s || !s.pending || !E || typeof E.powerWithSwap !== 'function') return null;
    const cur = Math.round(E.combatPower(s));
    const next = Math.round(E.powerWithSwap(s, s.pending));
    const gain = next - cur;
    return gain > 0 ? gain : null;
  }

  function estimateWaitEta(s) {
    if (tribulationGate(s)) return null;
    const GS = window.GameState;
    if (!s || !GS || typeof GS.getCurrentStage !== 'function') return null;
    const stage = GS.getCurrentStage();
    if (!stage || stage.isMaxStage || (s.qi || 0) >= stage.reqQi) return null;
    const per = (typeof GS.getQiPerSec === 'function' ? Number(GS.getQiPerSec()) : 0) || 0;
    if (per <= 0) return null;
    const eta = Math.ceil((stage.reqQi - (s.qi || 0)) / per);
    return eta > 0 && eta <= 120 ? eta : null;
  }

  // 战败引导：按固定优先级，第一个满足的标 ★，最多 3 条。不再按立即战力总排序。
  function cpGainOptions(s) {
    const out = [];
    const pendingGain = estimatePendingGain(s);
    if (pendingGain != null) {
      out.push({
        key: 'pending',
        label: `有更好的法宝没换上 · 战力 +${fmt(pendingGain)}`,
        tab: 'tab-gear',
        gain: pendingGain,
        priority: 1,
        action: 'openCompare'
      });
    }
    const gate = tribulationGate(s);
    const breakChain = !gate && canBreakNow(s) ? estimateBreakChain(s, CHAIN_SECONDS) : null;
    const breakLabel = breakChain ? formatBreakChainLabel(s, breakChain) : '';
    if (breakChain && breakLabel) {
      out.push({
        key: 'break',
        label: breakLabel,
        tab: 'tab-cultivate',
        gain: breakChain.gain,
        breaks: breakChain.breaks,
        realmName: breakChain.realmName,
        nextRealmName: breakChain.nextRealmName,
        nextGain: breakChain.nextGain,
        nextRate: breakChain.nextRate,
        priority: 2
      });
    }
    if (gate) {
      out.push({
        key: 'gate',
        label: `先通关${stageLabel(gate.stage)}才能突破`,
        tab: 'tab-stage',
        focus: 'blockingBoss',
        gain: 0,
        priority: 2
      });
    }
    const peachGain = estimatePeachGain(s);
    if (peachGain != null) {
      const n = Math.floor((s.tree && s.tree.peaches) || 0);
      out.push({
        key: 'peach',
        label: peachGain > 0 ? `还有 ${n} 个仙桃没摘 · 预计战力 +${fmt(peachGain)}` : `还有 ${n} 个仙桃没摘`,
        tab: 'tab-gear',
        gain: peachGain,
        priority: 3
      });
    }
    const gongfaChain = cheapestUpgrade(s, 'gongfa') && !gate ? estimateBreakChain(s, CHAIN_SECONDS, { buyFirst: 'gongfa' }) : null;
    if (gongfaChain || cheapestUpgrade(s, 'gongfa')) {
      const useChain = !!(gongfaChain && (gongfaChain.breaks >= 1 || gongfaChain.nextRealmName));
      out.push({
        key: 'gongfa',
        label: useChain
          ? formatSpendChainLabel('参悟功法后 ', gongfaChain, '灵石闲置 · 参悟功法让灵气更快')
          : '灵石闲置 · 参悟功法让灵气更快',
        tab: 'tab-upgrades',
        gain: gongfaChain ? gongfaChain.gain : 0,
        breaks: gongfaChain ? gongfaChain.breaks : 0,
        realmName: gongfaChain ? gongfaChain.realmName : '',
        priority: 4
      });
    }
    const dongfuChain = cheapestUpgrade(s, 'dongfu') && !gate ? estimateBreakChain(s, CHAIN_SECONDS, { buyFirst: 'dongfu' }) : null;
    if (dongfuChain || cheapestUpgrade(s, 'dongfu')) {
      const useChain = !!(dongfuChain && (dongfuChain.breaks >= 1 || dongfuChain.nextRealmName));
      out.push({
        key: 'dongfu',
        label: useChain
          ? formatSpendChainLabel('修建洞府后 ', dongfuChain, '灵石闲置 · 修建洞府让产出更快')
          : '灵石闲置 · 修建洞府让产出更快',
        tab: 'tab-upgrades',
        gain: dongfuChain ? dongfuChain.gain : 0,
        breaks: dongfuChain ? dongfuChain.breaks : 0,
        realmName: dongfuChain ? dongfuChain.realmName : '',
        priority: 4
      });
    }
    const P = window.Path;
    const pathReady = P && typeof P.isUnlocked === 'function' && P.isUnlocked(s) && P.peek && P.peek(s) && P.peek(s).id && (!P.hasAction || P.hasAction(s));
    const pathChain = pathReady && !gate ? estimateBreakChain(s, CHAIN_SECONDS, { buyFirst: 'path' }) : null;
    if (pathChain || pathReady) {
      const useChain = !!(pathChain && (pathChain.breaks >= 1 || pathChain.nextRealmName));
      out.push({
        key: 'path',
        label: useChain
          ? formatSpendChainLabel('参悟道途后 ', pathChain, '灵石闲置 · 可参悟本命道途')
          : '灵石闲置 · 可参悟本命道途',
        tab: 'tab-cultivate',
        gain: pathChain ? pathChain.gain : 0,
        breaks: pathChain ? pathChain.breaks : 0,
        realmName: pathChain ? pathChain.realmName : '',
        priority: 4
      });
    }
    if (!out.length) {
      const wait = estimateWaitEta(s);
      if (wait != null) {
        out.push({
          key: 'wait',
          label: `再修炼约 ${wait} 秒即可突破`,
          tab: '',
          gain: 0,
          eta: wait,
          priority: 5
        });
      }
    }
    out.sort((a, b) => (a.priority - b.priority) || (b.gain - a.gain));
    const rec = recommendBest(s);
    const recKey = rec && rec.key === 'peach' && !out.some((o) => o.key === 'peach') && out.some((o) => o.key === 'pending')
      ? 'pending'
      : (rec && rec.key);
    let shown = out.slice(0, 3);
    if (recKey && !shown.some((o) => o.key === recKey)) {
      const extra = out.find((o) => o.key === recKey);
      if (extra) shown = shown.slice(0, 2).concat([extra]);
    }
    shown.forEach((o) => { o.best = false; });
    if (recKey) {
      const star = shown.find((o) => o.key === recKey);
      if (star) {
        star.best = true;
        star.recommend = rec.name;
      }
    }
    return shown;
  }

  // ---------- 更换角色卡：品阶 + 一句简介 + 选中台词（batch3 P1-3） ----------
  function heroQuality(hero) {
    const list = (window.GameConfig && window.GameConfig.QUALITIES) || [];
    const q = list.find((x) => x && hero && x.id === hero.quality);
    return q ? { id: q.id, name: q.name, color: q.color } : null;
  }

  // 复用图鉴角色条目的副标题，去掉开头的「X品。」（品阶另行显示）
  function heroIntro(heroId) {
    const data = typeof window !== 'undefined' && window.CodexData;
    const entries = (data && data.entries) || [];
    const e = entries.find((x) => x && x.id === `hero_${heroId}`);
    if (!e || !e.subtitle) return '';
    return String(e.subtitle).replace(/^[凡灵玄地天仙]品[。.．]\s*/, '').trim();
  }

  // 复用角色日常台词：优先「点击立绘」，否则「出战」
  function heroSelectLine(heroId) {
    const data = typeof window !== 'undefined' && window.HeroLinesData;
    const v = data && data.voice && data.voice[heroId];
    if (!v) return '';
    return v.tap || v.deploy || v.idle || '';
  }

  // 选中角色后在立绘上冒约 2 秒台词（复用 HeroVoice 气泡）
  let roleLineTimer = 0;
  function sayHeroSelectLine(heroId) {
    const text = heroSelectLine(heroId);
    const HV = typeof window !== 'undefined' && window.HeroVoice;
    if (!text || !HV || typeof HV.showBubble !== 'function') return false;
    if (!HV.showBubble(text)) return false;
    clearTimeout(roleLineTimer);
    roleLineTimer = setTimeout(() => {
      const el = document.getElementById('hero-voice-bubble');
      if (el) el.classList.remove('is-show');
    }, 2000);
    return true;
  }

  // ---------- 弹窗关闭 ----------
  function topActiveModal(doc) {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d) return null;
    const list = d.querySelectorAll('.modal-backdrop.active');
    return list && list.length ? list[list.length - 1] : null;
  }

  function closeModal(modal) {
    if (!modal) return false;
    const btn = modal.querySelector('[data-modal-close]');
    if (btn && !btn.disabled && typeof btn.click === 'function') btn.click();
    if (modal.classList.contains('active')) {
      modal.classList.remove('active');
      if (modal.hasAttribute && modal.hasAttribute('aria-hidden')) modal.setAttribute('aria-hidden', 'true');
    }
    return true;
  }

  function handleEscKey(e, doc) {
    if (!e || e.key !== 'Escape' || e.defaultPrevented) return false;
    const m = topActiveModal(doc);
    if (!m) return false;
    if (typeof e.preventDefault === 'function') e.preventDefault();
    return closeModal(m);
  }

  function handleBackdropClick(e) {
    const t = e && e.target;
    if (!t || !t.classList || !t.classList.contains('modal-backdrop') || !t.classList.contains('active')) return false;
    return closeModal(t);
  }

  // ====================== DOM 部分 ======================
  let api = { switchTab() {}, log() {} };
  let els = {};
  let started = false;
  let lastGoal = null;
  let lastFocusEl = null;
  let tickTimer = 0;

  function S() {
    return window.GameState && window.GameState.state;
  }

  function ensureGuide(s) {
    if (!s.guide || typeof s.guide !== 'object') {
      s.guide = window.GameState && window.GameState.defaultGuide
        ? window.GameState.defaultGuide()
        : { v: 1, step: 0, done: false, taps: 0, gearPopup: false, gearVisited: false };
    }
    return s.guide;
  }

  function activeTab() {
    return (els.app && els.app.dataset.tab) || 'tab-cultivate';
  }

  function anyModalOpen() {
    // 渡劫动画根节点 #tribulation-cinematic 不是 .modal-backdrop，
    // 播放 / 跳过 / 减弱动态全程 isPlaying 且带 is-on，直到 hideRoot 才关掉。
    const T = window.Tribulation;
    if (T && typeof T.isPlaying === 'function' && T.isPlaying()) return true;
    const cine = document.getElementById('tribulation-cinematic');
    if (cine && cine.classList && cine.classList.contains('is-on')) return true;
    return Boolean(topActiveModal(document));
  }

  function setFocus(el) {
    if (lastFocusEl && lastFocusEl !== el) lastFocusEl.classList.remove('guide-focus');
    if (el) el.classList.add('guide-focus');
    lastFocusEl = el || null;
  }

  function hideBubble() {
    if (els.bubble) els.bubble.hidden = true;
    setFocus(null);
  }

  function placeBubble(target, text) {
    if (!els.bubble || !els.app || !target) return hideBubble();
    const tr = target.getBoundingClientRect();
    if (!tr || tr.width <= 0 || tr.height <= 0) return hideBubble();
    const ar = els.app.getBoundingClientRect();
    els.bubbleText.textContent = text;
    els.bubble.hidden = false;
    const bw = els.bubble.offsetWidth;
    const bh = els.bubble.offsetHeight;
    const cx = tr.left - ar.left + tr.width / 2;
    let left = Math.max(6, Math.min(ar.width - bw - 6, cx - bw / 2));
    let top = tr.top - ar.top - bh - 12;
    let below = false;
    if (top < 52) {
      top = tr.bottom - ar.top + 12;
      below = true;
    }
    els.bubble.style.left = `${Math.round(left)}px`;
    els.bubble.style.top = `${Math.round(top)}px`;
    els.bubble.style.setProperty('--arrow-x', `${Math.round(cx - left)}px`);
    els.bubble.classList.toggle('is-below', below);
    setFocus(target);
  }

  function renderGuide(s) {
    const guide = ensureGuide(s);
    const stage = window.GameState.getCurrentStage();
    const snap = {
      realmIndex: s.realmIndex || 0,
      qiReady: !stage.isMaxStage && (s.qi || 0) >= stage.reqQi,
      gearVisited: guide.gearVisited
    };
    const next = advanceGuide(guide, snap);
    if (next.step !== guide.step || next.done !== guide.done) {
      Object.assign(guide, next);
      window.GameState.saveGame();
    }
    const target = guideTarget(guide, snap);
    if (!target || anyModalOpen()) return hideBubble();
    if (target === 'gear-tab') {
      return placeBubble(els.navGear, '法宝已开启，去摘桃');
    }
    if (activeTab() !== 'tab-cultivate') return hideBubble();
    if (target === 'portrait') {
      return placeBubble(els.caption, '点击立绘，凝神吐纳灵气');
    }
    if (target === 'breakthrough') {
      return placeBubble(els.btnBreak, snap.qiReady ? '灵气已满，点击突破境界' : '灵气积满后，点这里突破');
    }
    return hideBubble();
  }

  let peachHoldUntil = 0;
  let peachHoldGoal = null;
  let peachHoldPausedAt = 0;

  function compareModalOpen() {
    const m = document.getElementById('compare-modal');
    return Boolean(m && m.classList.contains('active'));
  }

  function onStateReload() {
    lastGoal = null;
    peachHoldUntil = 0;
    peachHoldGoal = null;
    peachHoldPausedAt = 0;
    resetChainCache();
  }
  function goalSession() {
    return { lastGoal: lastGoal && lastGoal.id, peachHoldUntil };
  }

  function renderGoal(s) {
    if (!els.goal) return;
    const goal = currentGoal(s);
    const stage = window.GameState.getCurrentStage();
    const now = Date.now();
    // 摘满 30 或树已摘空时，先把完成文案停 1.2 秒再切下一目标。
    if (!peachHoldUntil && lastGoal && lastGoal.id === 'peach' && goal.id !== 'peach' && peachGoalDone(s)) {
      peachHoldGoal = { id: 'peach', text: peachGoalText(s), tab: 'tab-gear' };
      if (compareModalOpen()) {
        peachHoldPausedAt = now;
        peachHoldUntil = now + PEACH_HOLD_MS;
      } else {
        peachHoldUntil = now + PEACH_HOLD_MS;
        peachHoldPausedAt = 0;
      }
    }
    if (peachHoldUntil && peachHoldGoal && compareModalOpen()) {
      if (!peachHoldPausedAt) peachHoldPausedAt = now;
    } else if (peachHoldPausedAt) {
      const left = Math.max(0, peachHoldUntil - peachHoldPausedAt);
      peachHoldUntil = now + left;
      peachHoldPausedAt = 0;
    }
    if (peachHoldUntil && now < peachHoldUntil && peachHoldGoal) {
      if (els.goal.hidden) els.goal.hidden = false;
      if (els.goal.dataset.goal !== 'peach') els.goal.dataset.goal = 'peach';
      if (els.goal.dataset.tab !== 'tab-gear') els.goal.dataset.tab = 'tab-gear';
      if (els.goalText && els.goalText.textContent !== peachHoldGoal.text) els.goalText.textContent = peachHoldGoal.text;
      if (els.goalProgress && els.goalProgress.textContent) els.goalProgress.textContent = '';
      return;
    }
    if (peachHoldUntil && now >= peachHoldUntil) {
      peachHoldUntil = 0;
      peachHoldGoal = null;
    }
    if (lastGoal && goal.id !== lastGoal.id && isGoalDone(lastGoal, s)) {
      els.goal.classList.remove('is-done');
      void els.goal.offsetWidth;
      els.goal.classList.add('is-done');
      api.log(`目标达成：${lastGoal.text}。新目标：${goal.text}`, 'gold');
    }
    lastGoal = goal;
    if (els.goal.hidden) els.goal.hidden = false;
    if (els.goal.dataset.goal !== goal.id) els.goal.dataset.goal = goal.id;
    if (els.goal.dataset.tab !== goal.tab) els.goal.dataset.tab = goal.tab;
    if (els.goalText.textContent !== goal.text) els.goalText.textContent = goal.text;
    const prog = goalProgress(goal, s, stage);
    if (els.goalProgress.textContent !== prog) els.goalProgress.textContent = prog;
    const rec = recommendBest(s);
    if (els.goalRecommend) {
      if (rec && rec.name) {
        const recText = `推荐优先 ★${rec.name}`;
        if (els.goalRecommend.textContent !== recText) els.goalRecommend.textContent = recText;
        if (els.goalRecommend.hidden) els.goalRecommend.hidden = false;
      } else {
        if (els.goalRecommend.textContent) els.goalRecommend.textContent = '';
        if (!els.goalRecommend.hidden) els.goalRecommend.hidden = true;
      }
    }
  }

  // 按 recommendBest().tab 给对应底栏页签加金点，其余红点（含顶栏）走 .has-recommend 弱化。
  function syncRecommendNav(s) {
    const rec = s ? recommendBest(s) : null;
    const recTab = rec && rec.tab ? rec.tab : '';
    const app = (els && els.app) || (typeof document !== 'undefined' && document.querySelector && document.querySelector('.app-container'));
    if (app) {
      if (app.classList && typeof app.classList.toggle === 'function') {
        app.classList.toggle('has-recommend', Boolean(recTab));
      }
      if (typeof app.setAttribute === 'function') {
        if (recTab) app.setAttribute('data-rec-tab', recTab);
        else if (typeof app.removeAttribute === 'function') app.removeAttribute('data-rec-tab');
      }
    }
    const nodes = (typeof document !== 'undefined' && document.querySelectorAll)
      ? document.querySelectorAll('.nav-btn[data-tab]')
      : [];
    for (let i = 0; i < nodes.length; i += 1) {
      const btn = nodes[i];
      const on = Boolean(recTab) && btn.getAttribute && btn.getAttribute('data-tab') === recTab;
      if (btn.classList && typeof btn.classList.toggle === 'function') btn.classList.toggle('is-recommended', on);
      const badge = btn.querySelector && btn.querySelector('.nav-badge');
      if (badge && badge.classList && typeof badge.classList.toggle === 'function') {
        badge.classList.toggle('is-recommended', on);
      }
    }
    return rec;
  }

  function renderDots(s) {
    const now = Date.now();
    if (els.badgeStage) {
      const on =
        activeTab() !== 'tab-stage' &&
        stageDot(s, { playerStats: window.Battle && window.Battle.playerStats, enemyFor: window.Battle && window.Battle.enemyFor }, now);
      els.badgeStage.classList.toggle('visible', Boolean(on));
    }
  }

  // ---------- 「新机缘开启」通用解锁卡（batch2 P2-6） ----------
  // 插画位 16:9：有 assets/ui/unlock_<key>.webp（960×540，不透明）就加载，否则用 CSS 占位。
  const UNLOCKS = [
    {
      key: 'gear',
      title: '法宝已开启',
      desc: '仙桃树赠桃三十枚，去法宝页摘桃可得法宝。',
      go: '去摘桃',
      tab: 'tab-gear',
      glyph: '宝',
      test: (s) => (s.realmIndex || 0) >= peachUnlockRealm()
    },
    {
      key: 'yaoyuan',
      title: '百草灵药园已开启',
      desc: '洞府可栽种千年灵草，灵石产出大增。',
      go: '去洞府',
      tab: 'tab-upgrades',
      glyph: '药',
      test: (s) => (s.realmIndex || 0) >= dongfuUnlockRealm('yaoyuan', 6)
    },
    {
      key: 'mijing',
      title: '秘境劫运已开启',
      desc: '每日两次闯秘境，三选一劫运，八波尽破得厚礼。',
      go: '去秘境',
      tab: 'tab-stage',
      glyph: '劫',
      test: (s) => {
        const M = typeof window !== 'undefined' && window.Mijing;
        if (M && typeof M.isUnlocked === 'function') return M.isUnlocked(s);
        return ((s.stage && s.stage.best) || 0) >= 10;
      }
    },
    {
      key: 'bonds',
      title: '仙缘羁绊已激活',
      desc: '同缘仙姬同队出战即触发羁绊，全队更强。',
      go: '看羁绊',
      tab: 'tab-stage',
      glyph: '缘',
      test: (s) => {
        const B = typeof window !== 'undefined' && window.Bonds;
        const Bt = typeof window !== 'undefined' && window.Battle;
        const battleRealm = (window.GameConfig && window.GameConfig.BATTLE && window.GameConfig.BATTLE.UNLOCK_REALM) || 2;
        if (!B || !Bt || (s.realmIndex || 0) < battleRealm) return false;
        try {
          return B.activeBonds(Bt.getSquadIds(s)).length > 0;
        } catch (err) {
          return false;
        }
      }
    },
    {
      key: 'dispatch',
      title: '仙姬派遣已开启',
      desc: '未上阵的仙姬可去洞府接限时悬赏，到点领取灵石、灵玉或仙桃。',
      go: '去派遣',
      tab: 'tab-upgrades',
      glyph: '遣',
      test: (s) => {
        const D = typeof window !== 'undefined' && window.Dispatch;
        if (D && typeof D.isUnlocked === 'function') return D.isUnlocked(s);
        const need = (D && D.RULES && D.RULES.UNLOCK_BEST) || 5;
        return ((s.stage && s.stage.best) || 0) >= need;
      }
    }
  ];

  // 功法 / 洞府单项解锁（如《尊者血祭大道》、地底极品灵脉）。跳过开局即有的，以及已有专用卡片的百草灵药园。
  function itemUnlocks() {
    const out = [];
    const add = (kind, item) => {
      if (!item || !item.id || !item.name) return;
      if (!item.unlockRealmIndex || item.unlockRealmIndex <= 0) return;
      if (kind === 'dongfu' && item.id === 'yaoyuan') return;
      const short = String(item.name).replace(/[《》]/g, '');
      out.push({
        key: `${kind}:${item.id}`,
        kind,
        itemId: item.id,
        title: `${item.name}已开启`,
        desc: item.desc || (kind === 'gongfa' ? '新功法可在洞府页参悟。' : '新建筑可在洞府页升级。'),
        go: kind === 'gongfa' ? '去参悟' : '去洞府',
        tab: 'tab-upgrades',
        pane: kind,
        glyph: short.charAt(0) || (kind === 'gongfa' ? '功' : '府'),
        test: (s) => (s.realmIndex || 0) >= item.unlockRealmIndex
      });
    };
    ((window.GameConfig && window.GameConfig.GONGFA_LIST) || []).forEach((item) => add('gongfa', item));
    ((window.GameConfig && window.GameConfig.DONGFU_LIST) || []).forEach((item) => add('dongfu', item));
    return out;
  }

  function unlockCatalog() {
    return UNLOCKS.concat(itemUnlocks());
  }

  function dongfuUnlockRealm(id, fallback) {
    const list = (window.GameConfig && window.GameConfig.DONGFU_LIST) || [];
    const item = list.find((d) => d.id === id);
    return item && item.unlockRealmIndex != null ? item.unlockRealmIndex : fallback;
  }

  function unlockedKeys(s, list) {
    return (list || unlockCatalog()).filter((u) => {
      try {
        return Boolean(u.test(s));
      } catch (err) {
        return false;
      }
    }).map((u) => u.key);
  }

  // 旧档（unlockSeen 为 null）：已解锁的直接记为看过；法宝沿用 guide.gearPopup
  function ensureUnlockSeen(s) {
    if (!s.unlockSeen || typeof s.unlockSeen !== 'object') {
      const seen = {};
      unlockedKeys(s).forEach((k) => { seen[k] = true; });
      const guide = ensureGuide(s);
      if (!guide.gearPopup) delete seen.gear;
      s.unlockSeen = seen;
    }
    return s.unlockSeen;
  }

  // 旧档（unlockVisited 为 null）：已解锁的记为去过，避免读档时所有旧功法/建筑都亮红点
  function ensureUnlockVisited(s) {
    if (!s.unlockVisited || typeof s.unlockVisited !== 'object') {
      const visited = {};
      unlockedKeys(s, itemUnlocks()).forEach((k) => { visited[k] = true; });
      s.unlockVisited = visited;
    }
    return s.unlockVisited;
  }

  function pendingUnlock(s) {
    const seen = ensureUnlockSeen(s);
    ensureUnlockVisited(s);
    const catalog = unlockCatalog();
    const keys = unlockedKeys(s, catalog);
    const gear = catalog.find((u) => u.key === 'gear');
    if (gear && !seen.gear && keys.indexOf('gear') >= 0) return gear;
    for (let i = 0; i < catalog.length; i += 1) {
      const u = catalog[i];
      if (u.key === 'gear') continue;
      if (!seen[u.key] && keys.indexOf(u.key) >= 0) return u;
    }
    return null;
  }

  // 法宝卡未弹过时只出法宝；未通 1-10 时（无论当前页签）不弹其它机缘，通关后再按队列弹出。
  function shouldDeferUnlock(s, u) {
    if (!u || u.key === 'gear') return false;
    const seen = s && s.unlockSeen;
    if (seen && !seen.gear) {
      const gear = unlockCatalog().find((item) => item.key === 'gear');
      if (gear && gear.test(s)) return true;
    }
    if (bestStage(s) < 10) return true;
    return false;
  }

  function unlockTabDot(s, kind) {
    if (!s) return false;
    ensureUnlockSeen(s);
    const visited = ensureUnlockVisited(s);
    return itemUnlocks().some((u) => {
      if (kind && u.kind !== kind) return false;
      try {
        return Boolean(u.test(s)) && !visited[u.key];
      } catch (err) {
        return false;
      }
    });
  }

  function unlockItemUnvisited(s, kind, id) {
    if (!s || !kind || !id) return false;
    const visited = ensureUnlockVisited(s);
    const key = `${kind}:${id}`;
    return itemUnlocks().some((u) => {
      if (u.key !== key) return false;
      try {
        return Boolean(u.test(s)) && !visited[u.key];
      } catch (err) {
        return false;
      }
    });
  }

  function markUnlockPaneVisited(s, pane) {
    if (!s) return false;
    const visited = ensureUnlockVisited(s);
    const kind = pane === 'gongfa' ? 'gongfa' : pane === 'dongfu' ? 'dongfu' : '';
    if (!kind) return false;
    let changed = false;
    itemUnlocks().forEach((u) => {
      if (u.kind !== kind) return;
      try {
        if (u.test(s) && !visited[u.key]) {
          visited[u.key] = true;
          changed = true;
        }
      } catch (err) { /* ignore */ }
    });
    if (changed && window.GameState && typeof window.GameState.saveGame === 'function') {
      window.GameState.saveGame();
    }
    return changed;
  }

  let unlockTimer = 0;
  let currentUnlock = null;

  function markUnlockSeen(s, key) {
    ensureUnlockSeen(s)[key] = true;
    if (key === 'gear') ensureGuide(s).gearPopup = true;
  }

  // 只有仓库里真实存在的 unlock_<key>.webp 才发请求，避免 gongfa:id 这类 key 去拉不存在的图。
  const UNLOCK_ART_KEYS = { gear: 1, yaoyuan: 1, mijing: 1, bonds: 1 };
  function unlockArtSrc(key) {
    if (!UNLOCK_ART_KEYS[key]) return '';
    return `assets/ui/unlock_${key}.webp?v=119`;
  }

  function renderUnlockCard(u) {
    if (!els.unlockModal) return;
    const title = els.unlockModal.querySelector('#unlock-modal-title');
    const body = els.unlockModal.querySelector('.unlock-body');
    const art = els.unlockModal.querySelector('.unlock-art');
    if (title) title.textContent = u.title;
    if (body) body.textContent = u.desc;
    if (els.btnUnlockGo) els.btnUnlockGo.textContent = u.go;
    if (art) {
      art.setAttribute('data-unlock-key', u.key);
      art.classList.remove('has-art');
      const glyph = art.querySelector('.unlock-art-glyph');
      if (glyph) glyph.textContent = u.glyph;
      const img = art.querySelector('img');
      if (img) {
        img.onload = null;
        img.onerror = null;
        const src = unlockArtSrc(u.key);
        if (src) {
          img.onload = () => { if (currentUnlock === u) art.classList.add('has-art'); };
          img.onerror = () => art.classList.remove('has-art');
          img.src = src;
        } else {
          img.removeAttribute('src');
        }
      }
    }
  }

  function showUnlockCard(s, u) {
    if (!s || !u) return false;
    if (unlockTimer) {
      clearTimeout(unlockTimer);
      unlockTimer = 0;
    }
    currentUnlock = u;
    markUnlockSeen(s, u.key);
    if (window.GameState && typeof window.GameState.saveGame === 'function') window.GameState.saveGame();
    renderUnlockCard(u);
    if (els.unlockModal) {
      els.unlockModal.classList.add('active');
      els.unlockModal.setAttribute('aria-hidden', 'false');
    }
    return true;
  }

  function maybeUnlockCard(s) {
    if (unlockTimer || (els.unlockModal && els.unlockModal.classList.contains('active'))) return;
    if (!pendingUnlock(s)) return;
    const waitStart = Date.now();
    unlockTimer = setTimeout(function tryShow() {
      const st = S();
      const u = st && pendingUnlock(st);
      if (!u || shouldDeferUnlock(st, u)) {
        unlockTimer = 0;
        return;
      }
      // 渡劫演出会挡住机缘卡；约 30 秒仍未结束则不再等，避免 play() 异常时永远不弹。
      const waited = Date.now() - waitStart;
      const tribOpen = (window.Tribulation && typeof window.Tribulation.isPlaying === 'function' && window.Tribulation.isPlaying())
        || (() => {
          const cine = document.getElementById('tribulation-cinematic');
          return !!(cine && cine.classList && cine.classList.contains('is-on'));
        })();
      if (anyModalOpen() && !(tribOpen && waited >= UNLOCK_WAIT_CAP_MS)) {
        unlockTimer = setTimeout(tryShow, 1000);
        return;
      }
      unlockTimer = 0;
      showUnlockCard(st, u);
    }, GEAR_POPUP_DELAY_MS);
  }

  // 闯关已开且第一次进闯关页时，若「法宝已开启」还没弹过，立刻弹出，避免没拿法宝就打 1-1。
  // 不改 peachGoalDone / stageDot：赠桃没摘完时闯关红点仍不亮，与 ed7efa0 引导不冲突。
  function shouldShowGearBeforeStage(s) {
    if (!s || (s.realmIndex || 0) < stageUnlockRealm()) return false;
    if ((s.realmIndex || 0) < peachUnlockRealm()) return false;
    const seen = ensureUnlockSeen(s);
    return !seen.gear;
  }

  function promptGearBeforeStage(s) {
    if (!shouldShowGearBeforeStage(s)) return false;
    const u = unlockCatalog().find((item) => item.key === 'gear');
    return showUnlockCard(s, u);
  }

  function closeUnlockModal() {
    if (!els.unlockModal) return;
    els.unlockModal.classList.remove('active');
    els.unlockModal.setAttribute('aria-hidden', 'true');
  }

  // 锁定卡片：data-lock-realm 写门槛和「还差X重」，data-realm-chain 写境界体系说明。
  function renderLocks(s) {
    const realm = s.realmIndex || 0;
    document.querySelectorAll('[data-lock-realm]').forEach((el) => {
      const target = Number(el.getAttribute('data-lock-realm')) || 0;
      const t = realmGateText(realm, target);
      if (el.textContent !== t) el.textContent = t;
    });
    document.querySelectorAll('[data-realm-chain]').forEach((el) => {
      const t = `境界共${TOTAL_REALMS}重：${REALM_CHAIN_TEXT}`;
      if (el.textContent !== t) el.textContent = t;
    });
  }

  function tick() {
    const s = S();
    if (!s) return;
    renderLocks(s);
    const guide = ensureGuide(s);
    if (activeTab() === 'tab-gear' && (s.realmIndex || 0) >= peachUnlockRealm() && !guide.gearVisited) {
      guide.gearVisited = true;
      window.GameState.saveGame();
    }
    maybeUnlockCard(s);
    renderGoal(s);
    renderGuide(s);
    renderDots(s);
    syncRecommendNav(s);
  }

  function init(hooks) {
    if (started) return;
    started = true;
    api = { ...api, ...(hooks || {}) };
    els = {
      app: document.querySelector('.app-container'),
      goal: document.getElementById('goal-strip'),
      goalText: document.getElementById('goal-text'),
      goalProgress: document.getElementById('goal-progress'),
      goalRecommend: document.getElementById('goal-recommend'),
      bubble: document.getElementById('guide-bubble'),
      bubbleText: document.getElementById('guide-bubble-text'),
      caption: document.querySelector('#meditation-zone .meditation-caption'),
      zone: document.getElementById('meditation-zone'),
      btnBreak: document.getElementById('btn-breakthrough'),
      navGear: document.querySelector('.nav-btn[data-tab="tab-gear"]'),
      badgeStage: document.getElementById('badge-stage'),
      unlockModal: document.getElementById('unlock-modal'),
      btnUnlockGo: document.getElementById('btn-unlock-go'),
      btnUnlockLater: document.getElementById('btn-unlock-later')
    };

    if (els.zone) {
      els.zone.addEventListener('pointerdown', (e) => {
        if (e && e.target && typeof e.target.closest === 'function' && e.target.closest('#title-plate')) return;
        const s = S();
        if (!s) return;
        const guide = ensureGuide(s);
        if (!guide.done && guide.step === 0) {
          guide.taps = (guide.taps || 0) + 1;
          renderGuide(s);
        }
      });
    }
    if (els.goal) {
      els.goal.addEventListener('click', () => {
        const tab = els.goal.dataset.tab;
        if (tab) api.switchTab(tab);
      });
    }
    if (els.btnUnlockLater) els.btnUnlockLater.addEventListener('click', closeUnlockModal);
    if (els.btnUnlockGo) {
      els.btnUnlockGo.addEventListener('click', () => {
        const u = currentUnlock || UNLOCKS[0];
        closeUnlockModal();
        api.switchTab(u.tab);
        if (u.pane && typeof api.openHome === 'function') api.openHome(u.pane);
        if (u.key === 'dispatch' && typeof api.openDispatch === 'function') api.openDispatch();
        tick();
      });
    }

    // 捕获阶段：先于各模块自己的 Esc 处理，只关最上层一个弹窗（关闭走该弹窗自己的关闭按钮逻辑）
    document.addEventListener('keydown', (e) => handleEscKey(e, document), true);
    document.addEventListener('click', handleBackdropClick);
    window.addEventListener('resize', () => {
      const s = S();
      if (s) renderGuide(s);
    });

    tick();
    tickTimer = setInterval(tick, 500);
  }

  window.Newbie = {
    REALM_CHAIN_TEXT,
    TOTAL_REALMS,
    GUIDE_TAPS,
    UNLOCK_WAIT_CAP_MS,
    realmName,
    realmGap,
    realmGapText,
    realmGateText,
    stageLabel,
    advanceGuide,
    guideTarget,
    currentGoal,
    peachGoalDone,
    peachGoalText,
    PEACH_HOLD_MS,
    giftPeachTarget,
    nextLockedBuilding,
    buildingUnlockHint,
    enemyExceedsTeam,
    recGapExceeds,
    powerJumpTab,
    blockingBoss,
    focusBlockingBoss,
    bossNameForStage,
    isGoalDone,
    goalProgress,
    gearDot,
    gearPickDot,
    gearTreeDot,
    stageDot,
    upgradeDot,
    unlockItemUnvisited,
    canAffordUpgrade,
    canBreakNow,
    estimateSpendDetail,
    estimateBreakChain,
    breakGainText,
    estimateWaitEta,
    tribulationGate,
    tribHintText,
    CHAIN_SECONDS,
    CHAIN_CACHE_LIMIT,
    chainComputeCalls,
    chainKeyBuildCalls,
    resetChainCache,
    recommendBest,
    syncRecommendNav,
    onStateReload,
    goalSession,
    formatBreakChainLabel,
    compareDiff,
    cpGainOptions,
    anyModalOpen,
    heroQuality,
    heroIntro,
    heroSelectLine,
    sayHeroSelectLine,
    UNLOCKS,
    UNLOCK_ART_KEYS,
    unlockArtSrc,
    itemUnlocks,
    unlockCatalog,
    unlockedKeys,
    ensureUnlockSeen,
    ensureUnlockVisited,
    pendingUnlock,
    unlockTabDot,
    markUnlockPaneVisited,
    shouldShowGearBeforeStage,
    shouldDeferUnlock,
    promptGearBeforeStage,
    showUnlockCard,
    topActiveModal,
    closeModal,
    handleEscKey,
    handleBackdropClick,
    init,
    tick
  };
})();
