// 秘境劫运：每日 2 次的 8 波连战挑战。每过 2 波三选一「劫运」（仅本局生效），
// 复用自走棋战斗内核（Battle.createSession 的 mods 参数），敌人强度锚定开局时的最高通关关卡。
// 纯逻辑模块，不碰 DOM；UI 在 stage-ui.js。
(function () {
  const root = typeof window !== 'undefined' ? window : globalThis;

  const WAVES = 8;
  const DAILY_ATTEMPTS = 2;
  const UNLOCK_BEST = 10; // 首通第 10 关（第 1 章 Boss）后开启
  const PICK_AFTER = [2, 4, 6]; // 打完这些波后三选一
  const CHOICE_COUNT = 3;

  // 敌方战力 = 开局时最高通关关卡敌人战力 × 倍率；精英/Boss 波使用 Boss 阵型（1 主 2 从）
  const WAVE_PLAN = [
    { wave: 1, kind: 'mob', mult: 0.8 },
    { wave: 2, kind: 'mob', mult: 0.845 },
    { wave: 3, kind: 'mob', mult: 0.89 },
    { wave: 4, kind: 'elite', mult: 0.93 },
    { wave: 5, kind: 'mob', mult: 0.95 },
    { wave: 6, kind: 'mob', mult: 0.98 },
    { wave: 7, kind: 'mob', mult: 1.01 },
    { wave: 8, kind: 'boss', mult: 1.05 }
  ];

  const RARITIES = {
    fan: { id: 'fan', name: '凡品', weight: 60 },
    xuan: { id: 'xuan', name: '玄品', weight: 30 },
    tian: { id: 'tian', name: '天品', weight: 10 }
  };

  // 劫运：每项 max 为可叠加层数；mods 为每层效果（加法叠加，倍率按层累加）
  const BLESSINGS = [
    { id: 'fengmang', name: '锋芒', rarity: 'fan', max: 3, icon: 'slot_weapon', desc: '全队攻击 +10%', mods: { atkMult: 0.1 } },
    { id: 'jinshen', name: '金身', rarity: 'fan', max: 3, icon: 'slot_robe', desc: '全队生命 +12%', mods: { hpMult: 0.12 } },
    { id: 'tiebi', name: '铁壁', rarity: 'fan', max: 3, icon: 'slot_belt', desc: '全队防御 +15%', mods: { defMult: 0.15 } },
    { id: 'huixin', name: '会心', rarity: 'fan', max: 3, icon: 'slot_charm', desc: '全队暴击率 +8%', mods: { critAdd: 0.08 } },
    { id: 'jifeng', name: '疾风', rarity: 'fan', max: 2, icon: 'slot_boots', desc: '全队速度 +15，更易先手', mods: { spdAdd: 15 } },
    { id: 'xushi', name: '蓄势', rarity: 'fan', max: 2, icon: 'ui_bagua', desc: '开战怒气 +30', mods: { rageStart: 30 } },
    { id: 'zhiming', name: '致命', rarity: 'xuan', max: 2, icon: 'slot_crown', desc: '全队暴击伤害 +30%', mods: { critDmgAdd: 0.3 } },
    { id: 'shihun', name: '噬魂', rarity: 'xuan', max: 2, icon: 'res_qi', desc: '绝技吸血：按绝技伤害的 20% 回复施法者生命', mods: { ultLifesteal: 0.2 } },
    { id: 'xuanjia', name: '玄甲', rarity: 'xuan', max: 2, icon: 'res_stone', desc: '前排承伤：站在前两排的角色受到伤害 -15%', mods: { frontDmgTaken: 0.15 } },
    { id: 'hanshuang', name: '寒霜', rarity: 'xuan', max: 2, icon: 'res_daoguo', desc: '冰霜减速：普攻有 15% 几率令目标下次攻击落空', mods: { freezeChance: 0.15 } },
    { id: 'jianqi', name: '剑气纵横', rarity: 'xuan', max: 2, icon: 'gf_taiqingjue', desc: '同行溅射：普攻对目标周围敌人造成 25% 溅射伤害', mods: { atkSplash: 0.25 } },
    { id: 'nuyong', name: '怒涌', rarity: 'xuan', max: 2, icon: 'gf_jiuzhuan_jindan', desc: '普攻额外获得 8 点怒气，绝技更快', mods: { rageOnAtkAdd: 8 } },
    { id: 'tiannu', name: '天怒', rarity: 'tian', max: 1, icon: 'gf_taixu_huashen', desc: '绝技伤害 +35%', mods: { ultDmgMult: 0.35 } },
    { id: 'zhanshou', name: '斩首', rarity: 'tian', max: 1, icon: 'gf_zixiao_yuanying', desc: '对精英与 Boss 伤害 +30%', mods: { bossDmgMult: 0.3 } },
    { id: 'bumie', name: '不灭', rarity: 'tian', max: 1, icon: 'tl_xiantian_daoti', desc: '每波首位倒下的角色以 30% 生命重新站起', mods: { revives: 1 } }
  ];

  const BLESSING_MAP = {};
  BLESSINGS.forEach((b) => {
    BLESSING_MAP[b.id] = b;
  });

  function cfg() {
    return root.GameConfig || null;
  }

  function battle() {
    return root.Battle || null;
  }

  function localDate(ts) {
    const d = new Date(ts == null ? Date.now() : ts);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }

  function defaultState() {
    return { date: '', used: 0, runs: 0, clears: 0, bestWave: 0, run: null };
  }

  function int(v, d) {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? n : d;
  }

  function normalizeRun(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const ref = Math.max(1, Math.min(300, int(raw.ref, 0)));
    if (!int(raw.ref, 0)) return null;
    const blessings = {};
    if (raw.blessings && typeof raw.blessings === 'object') {
      Object.keys(raw.blessings).forEach((id) => {
        const b = BLESSING_MAP[id];
        if (!b) return;
        const n = Math.max(0, Math.min(b.max, int(raw.blessings[id], 0)));
        if (n > 0) blessings[id] = n;
      });
    }
    let choices = null;
    if (Array.isArray(raw.choices)) {
      choices = raw.choices.filter((id) => typeof id === 'string' && BLESSING_MAP[id]).slice(0, CHOICE_COUNT);
      if (choices.length === 0) choices = null;
    }
    const cleared = Math.max(0, Math.min(WAVES, int(raw.cleared, 0)));
    return {
      seed: int(raw.seed, 1) >>> 0,
      ref,
      anchor: Math.round(anchorCp(ref, raw.anchor)),
      wave: Math.max(1, Math.min(WAVES, cleared + 1)),
      cleared,
      blessings,
      choices,
      picks: Math.max(0, int(raw.picks, 0)),
      startedAt: int(raw.startedAt, 0)
    };
  }

  function normalize(raw) {
    const d = defaultState();
    if (!raw || typeof raw !== 'object') return d;
    return {
      date: typeof raw.date === 'string' ? raw.date : '',
      used: Math.max(0, Math.min(DAILY_ATTEMPTS, int(raw.used, 0))),
      runs: Math.max(0, int(raw.runs, 0)),
      clears: Math.max(0, int(raw.clears, 0)),
      bestWave: Math.max(0, Math.min(WAVES, int(raw.bestWave, 0))),
      run: normalizeRun(raw.run)
    };
  }

  function ensure(state) {
    if (!state.mijing || typeof state.mijing !== 'object') {
      state.mijing = defaultState();
    }
    return state.mijing;
  }

  // 本地日期换日时重置次数（进行中的一局不受影响，开局时已扣次数）
  function refreshDaily(state, now) {
    const mj = ensure(state);
    const today = localDate(now);
    if (mj.date !== today) {
      mj.date = today;
      mj.used = 0;
    }
    return mj;
  }

  function attemptsLeft(state, now) {
    const mj = refreshDaily(state, now);
    return Math.max(0, DAILY_ATTEMPTS - (mj.used || 0));
  }

  function bestStage(state) {
    return Math.max(0, int(state && state.stage && state.stage.best, 0));
  }

  function isUnlocked(state) {
    return bestStage(state) >= UNLOCK_BEST;
  }

  function activeRun(state) {
    return (state && state.mijing && state.mijing.run) || null;
  }

  function canStart(state, now) {
    if (activeRun(state)) return { ok: false, reason: 'ACTIVE', message: '已有进行中的秘境' };
    if (!isUnlocked(state)) {
      return { ok: false, reason: 'LOCKED', message: `首通第 ${UNLOCK_BEST} 关后开启秘境劫运` };
    }
    if (attemptsLeft(state, now) <= 0) {
      return { ok: false, reason: 'NO_ATTEMPTS', message: '今日秘境次数已用完，明日再来' };
    }
    const B = battle();
    if (B && typeof B.canStartBattle === 'function') {
      const chk = B.canStartBattle(state);
      if (!chk.ok) return { ok: false, reason: 'EMPTY_SQUAD', message: chk.message || '请先选择上阵角色' };
    }
    return { ok: true, reason: null, message: '' };
  }

  function startRun(state, now, seed) {
    const chk = canStart(state, now);
    if (!chk.ok) return chk;
    const mj = refreshDaily(state, now);
    mj.used = (mj.used || 0) + 1;
    mj.runs = (mj.runs || 0) + 1;
    const ref = Math.min(300, bestStage(state));
    mj.run = {
      seed: (seed == null ? (Date.now() ^ 0x5f3759df) : seed) >>> 0,
      ref,
      anchor: Math.round(computeAnchor(state, ref)),
      wave: 1,
      cleared: 0,
      blessings: {},
      choices: null,
      picks: 0,
      startedAt: now == null ? Date.now() : now
    };
    return { ok: true, reason: null, message: '', run: mj.run };
  }

  function wavePlan(wave) {
    return WAVE_PLAN[Math.max(1, Math.min(WAVES, int(wave, 1))) - 1];
  }

  // 锚定战力：以最高通关关卡为准。该关基础战力（不含 Boss 倍率）记为 base。
  // 开局时用固定种子实测「当前队伍对标准波约五五开」的敌方战力，夹在 [base, base × 2] 之间作为锚点；
  // 同时不低于满编战力折算值的 85%，少带人开局无法压低难度。波次倍率相对该锚点（1.0 ≈ 五五开）。
  function stageBaseCp(ref) {
    const B = cfg().BATTLE;
    return B.BASE_CP * Math.pow(B.GROWTH, Math.max(1, ref) - 1);
  }

  function refCp(ref) {
    return stageBaseCp(ref) * cfg().BATTLE.BOSS_MULT;
  }

  const ANCHOR_HI_MULT = 2;

  function anchorCp(ref, fullCp) {
    const lo = stageBaseCp(ref);
    const hi = stageBaseCp(ref) * ANCHOR_HI_MULT;
    const cp = Number(fullCp);
    if (!Number.isFinite(cp) || cp <= 0) return refCp(ref);
    return Math.max(lo, Math.min(hi, cp));
  }

  // 标准波：4 只小怪阵型（与第 3~5 波相同）
  function probeEnemy(ref, cp) {
    const B = cfg().BATTLE;
    const base = battle().enemyFor(Math.max(1, ref));
    const n = (base.chapter - 1) * 10 + 5;
    return {
      n, chapter: base.chapter, stageInChapter: 5, region: base.region, name: base.name, img: base.img,
      isBoss: false, cp, atk: cp * B.SPLIT.atk, hp: cp * B.SPLIT.hp, def: cp * B.SPLIT.def,
      spd: 100 + 0.5 * ref, crit: 0.05, critDmg: 1.5, cd: 1.5
    };
  }

  const PROBE_SIMS = 12;
  const PROBE_ITERS = 7;

  // 二分查找当前队伍对标准波胜率约 50% 的敌方战力（确定性种子，刷新不变）
  function measureStrength(state, ref) {
    const B = battle();
    if (!B || !B.canStartBattle(state).ok) return 0;
    const guess = fullSquadCp(state) || refCp(ref);
    let lo = Math.log(guess * 0.3);
    let hi = Math.log(guess * 3);
    const probeMods = bondMods(state);
    const rate = (cp) => {
      let w = 0;
      for (let i = 0; i < PROBE_SIMS; i++) {
        if (B.createSession(state, probeEnemy(ref, cp), 0x51ed27 + i * 7919, probeMods).runToEnd(true).win) w += 1;
      }
      return w / PROBE_SIMS;
    };
    for (let i = 0; i < PROBE_ITERS; i++) {
      const mid = (lo + hi) / 2;
      if (rate(Math.exp(mid)) >= 0.5) lo = mid;
      else hi = mid;
    }
    return Math.exp((lo + hi) / 2);
  }

  function computeAnchor(state, ref) {
    const measured = measureStrength(state, ref);
    const floorByCp = fullSquadCp(state) * 0.85;
    return anchorCp(ref, Math.max(measured, floorByCp));
  }

  function fullSquadCp(state) {
    const B = battle();
    if (!B || typeof B.playerStats !== 'function') return 0;
    try {
      const p = B.playerStats(state);
      return (p && (p.baseCp || p.cp)) || 0;
    } catch (err) {
      return 0;
    }
  }

  function waveEnemy(run, wave) {
    const w = Math.max(1, Math.min(WAVES, int(wave == null ? run.wave : wave, 1)));
    const plan = wavePlan(w);
    const C = cfg();
    const B = C.BATTLE;
    const ref = Math.max(1, run.ref);
    const base = battle().enemyFor(ref);
    const cp = (run.anchor > 0 ? anchorCp(ref, run.anchor) : refCp(ref)) * plan.mult;
    const isBoss = plan.kind !== 'mob';
    // 普通波敌人数随波次 3→5（借用章内关卡序号决定阵型）；精英取上一章 Boss，终波取本章 Boss
    const stageInChapter = isBoss ? 10 : w <= 2 ? 2 : w <= 5 ? 5 : 8;
    const n = (base.chapter - 1) * 10 + stageInChapter;
    let name = base.name;
    let img = base.img;
    if (plan.kind === 'mob') {
      const regionIdx = Math.min(B.REGIONS.length - 1, Math.floor((base.chapter - 1) / 5));
      const mobs = (B.REGIONS[regionIdx] && B.REGIONS[regionIdx].mobs) || [];
      const entry = mobs.length ? mobs[(n - 1) % mobs.length] : null;
      if (entry) {
        name = typeof entry === 'object' ? entry.name : entry;
        img = typeof entry === 'object' ? entry.img : '';
      }
    } else {
      const bossIdx = plan.kind === 'elite' ? Math.max(0, base.chapter - 2) : base.chapter - 1;
      const entry = B.BOSSES[Math.min(B.BOSSES.length - 1, bossIdx)];
      if (entry) {
        name = typeof entry === 'object' ? entry.name : entry;
        img = typeof entry === 'object' ? entry.img : '';
      }
    }
    return {
      n,
      chapter: base.chapter,
      stageInChapter,
      region: base.region,
      name: plan.kind === 'elite' ? `精英·${name}` : name,
      img,
      isBoss,
      mijing: true,
      mijingWave: w,
      mijingKind: plan.kind,
      cp,
      atk: cp * B.SPLIT.atk,
      hp: cp * B.SPLIT.hp,
      def: cp * B.SPLIT.def,
      spd: 100 + 0.5 * ref,
      crit: 0.05,
      critDmg: 1.5,
      cd: 1.5
    };
  }

  function waveSeed(run, wave) {
    return (Math.imul((run.seed >>> 0) ^ 0x2545f491, 1) + Math.imul(int(wave, 1), 0x9e3779b1)) >>> 0;
  }

  // 汇总劫运层数为 Battle.createSession 的 mods
  function buildMods(blessings) {
    const m = {
      atkMult: 1,
      hpMult: 1,
      defMult: 1,
      critAdd: 0,
      critDmgAdd: 0,
      spdAdd: 0,
      rageStart: 0,
      rageOnAtkAdd: 0,
      ultDmgMult: 1,
      bossDmgMult: 1,
      frontDmgTakenMult: 1,
      ultLifesteal: 0,
      freezeChance: 0,
      atkSplash: 0,
      revives: 0
    };
    if (!blessings) return m;
    Object.keys(blessings).forEach((id) => {
      const b = BLESSING_MAP[id];
      if (!b) return;
      const n = Math.max(0, Math.min(b.max, int(blessings[id], 0)));
      if (!n) return;
      const e = b.mods;
      if (e.atkMult) m.atkMult += e.atkMult * n;
      if (e.hpMult) m.hpMult += e.hpMult * n;
      if (e.defMult) m.defMult += e.defMult * n;
      if (e.critAdd) m.critAdd += e.critAdd * n;
      if (e.critDmgAdd) m.critDmgAdd += e.critDmgAdd * n;
      if (e.spdAdd) m.spdAdd += e.spdAdd * n;
      if (e.rageStart) m.rageStart += e.rageStart * n;
      if (e.rageOnAtkAdd) m.rageOnAtkAdd += e.rageOnAtkAdd * n;
      if (e.ultDmgMult) m.ultDmgMult += e.ultDmgMult * n;
      if (e.bossDmgMult) m.bossDmgMult += e.bossDmgMult * n;
      if (e.frontDmgTaken) m.frontDmgTakenMult -= e.frontDmgTaken * n;
      if (e.ultLifesteal) m.ultLifesteal += e.ultLifesteal * n;
      if (e.freezeChance) m.freezeChance += e.freezeChance * n;
      if (e.atkSplash) m.atkSplash += e.atkSplash * n;
      if (e.revives) m.revives += e.revives * n;
    });
    m.frontDmgTakenMult = Math.max(0.5, m.frontDmgTakenMult);
    m.freezeChance = Math.min(0.5, m.freezeChance);
    return m;
  }

  // 劫运 + 仙缘羁绊（由当前上阵阵容推导）合并后的战斗 mods
  function bondMods(state) {
    const Bd = root.Bonds;
    return Bd && typeof Bd.modsForState === 'function' ? Bd.modsForState(state) : null;
  }

  function combinedMods(state, blessings) {
    const Bd = root.Bonds;
    const base = buildMods(blessings);
    const bm = bondMods(state);
    return Bd && bm ? Bd.mergeMods(base, bm) : base;
  }

  function hasActiveMods(blessings) {
    return Boolean(blessings && Object.keys(blessings).some((id) => (blessings[id] || 0) > 0));
  }

  // 抽 3 个不重复、未满层的劫运；按品阶权重。随机数由局种子 + 选择次数决定，刷新页面无法重抽
  function drawChoices(run, rngOverride) {
    const rng = rngOverride || battle().mulberry32(waveSeed(run, 100 + (run.picks || 0)));
    const pool = BLESSINGS.filter((b) => (run.blessings[b.id] || 0) < b.max);
    const out = [];
    while (out.length < CHOICE_COUNT && pool.length > 0) {
      let total = 0;
      for (let i = 0; i < pool.length; i++) total += RARITIES[pool[i].rarity].weight;
      let r = rng() * total;
      let idx = pool.length - 1;
      for (let i = 0; i < pool.length; i++) {
        r -= RARITIES[pool[i].rarity].weight;
        if (r < 0) {
          idx = i;
          break;
        }
      }
      out.push(pool[idx].id);
      pool.splice(idx, 1);
    }
    return out;
  }

  function pickBlessing(state, id) {
    const run = activeRun(state);
    if (!run || !Array.isArray(run.choices)) return { ok: false, message: '当前无可选劫运' };
    if (!run.choices.includes(id)) return { ok: false, message: '劫运不在可选范围' };
    const b = BLESSING_MAP[id];
    run.blessings[id] = Math.min(b.max, (run.blessings[id] || 0) + 1);
    run.choices = null;
    run.picks = (run.picks || 0) + 1;
    return { ok: true, blessing: b, stacks: run.blessings[id] };
  }

  // 奖励：灵玉按闯关挂机每小时产出折算（单波 0.1 小时，精英/Boss 波翻倍，通关再加 0.6 小时）；
  // 仙桃每波 1 个、精英/Boss 波 3 个，通关再加 5 + 关卡/30。整局最多约 1.6 小时挂机灵玉。
  function idleLingyuPerHour(ref) {
    return 6 + 0.4 * Math.max(0, ref);
  }

  function waveReward(ref, wave) {
    const plan = wavePlan(wave);
    const big = plan.kind !== 'mob';
    return {
      lingyu: Math.ceil(idleLingyuPerHour(ref) * 0.1 * (big ? 2 : 1)),
      peaches: big ? 3 : 1
    };
  }

  function clearBonus(ref) {
    return {
      lingyu: Math.ceil(idleLingyuPerHour(ref) * 0.6),
      peaches: 5 + Math.floor(Math.max(0, ref) / 30)
    };
  }

  function rewardsFor(ref, clearedWaves) {
    const cleared = Math.max(0, Math.min(WAVES, int(clearedWaves, 0)));
    let lingyu = 0;
    let peaches = 0;
    for (let w = 1; w <= cleared; w++) {
      const r = waveReward(ref, w);
      lingyu += r.lingyu;
      peaches += r.peaches;
    }
    const full = cleared >= WAVES;
    if (full) {
      const b = clearBonus(ref);
      lingyu += b.lingyu;
      peaches += b.peaches;
    }
    return { lingyu, peaches, cleared, full };
  }

  // 一波战斗结束：胜则推进（必要时生成三选一），败则结束本局
  function onWaveResult(state, win) {
    const run = activeRun(state);
    if (!run) return { ok: false, ended: false };
    const wave = run.wave;
    if (!win) {
      return { ok: true, ended: true, win: false, wave };
    }
    run.cleared = Math.min(WAVES, wave);
    if (run.cleared >= WAVES) {
      return { ok: true, ended: true, win: true, wave, full: true };
    }
    run.wave = run.cleared + 1;
    let needPick = false;
    if (PICK_AFTER.includes(run.cleared)) {
      run.choices = drawChoices(run);
      needPick = run.choices.length > 0;
      if (!needPick) run.choices = null;
    }
    return { ok: true, ended: false, win: true, wave, needPick, waveReward: waveReward(run.ref, wave) };
  }

  // 结束本局：发放已通关波次奖励，清空劫运
  function endRun(state, reason) {
    const mj = ensure(state);
    const run = mj.run;
    if (!run) return null;
    const rw = rewardsFor(run.ref, run.cleared);
    state.lingyu = (state.lingyu || 0) + rw.lingyu;
    if (!state.tree) state.tree = {};
    state.tree.peaches = (state.tree.peaches || 0) + rw.peaches;
    if (rw.full) mj.clears = (mj.clears || 0) + 1;
    mj.bestWave = Math.max(mj.bestWave || 0, run.cleared);
    const summary = {
      reason: reason || (rw.full ? 'clear' : 'fail'),
      ref: run.ref,
      cleared: run.cleared,
      full: rw.full,
      lingyu: rw.lingyu,
      peaches: rw.peaches,
      blessings: { ...run.blessings }
    };
    mj.run = null;
    return summary;
  }

  function winRate(state, run, runs) {
    const B = battle();
    const total = Math.max(1, int(runs, 20));
    if (!B.canStartBattle(state).ok) return 0;
    const enemy = waveEnemy(run, run.wave);
    const mods = combinedMods(state, run.blessings);
    let wins = 0;
    for (let i = 0; i < total; i++) {
      const s = B.createSession(state, enemy, waveSeed(run, run.wave) + i * 7919, mods);
      if (s.runToEnd(true).win) wins += 1;
    }
    return wins / total;
  }

  function blessingList(blessings) {
    return BLESSINGS.filter((b) => blessings && blessings[b.id] > 0).map((b) => ({ ...b, stacks: blessings[b.id] }));
  }

  const Mijing = {
    WAVES,
    DAILY_ATTEMPTS,
    UNLOCK_BEST,
    PICK_AFTER,
    WAVE_PLAN,
    RARITIES,
    BLESSINGS,
    BLESSING_MAP,
    localDate,
    defaultState,
    normalize,
    ensure,
    refreshDaily,
    attemptsLeft,
    isUnlocked,
    activeRun,
    canStart,
    startRun,
    wavePlan,
    refCp,
    stageBaseCp,
    anchorCp,
    measureStrength,
    computeAnchor,
    waveEnemy,
    waveSeed,
    buildMods,
    combinedMods,
    hasActiveMods,
    drawChoices,
    pickBlessing,
    waveReward,
    clearBonus,
    rewardsFor,
    onWaveResult,
    endRun,
    winRate,
    blessingList
  };

  root.Mijing = Mijing;
  if (typeof window !== 'undefined') window.Mijing = Mijing;
  if (typeof module !== 'undefined' && module.exports) module.exports = Mijing;
})();
