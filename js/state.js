// 修仙挂机 - 状态管理、存档与离线收益结算
(function () {
  const SAVE_KEY = 'xiuxian_idle_save_v1';
  const SAVE_BACKUP_KEY = 'xiuxian_idle_save_v1_bak';
  const SAVE_CORRUPT_KEY = 'xiuxian_idle_save_v1_corrupt';
  const VISIBLE_SETTLE_MIN_SECONDS = 60;
  const MAX_SQUAD_SIZE = 6;
  // 新手保底：新档前 3 次突破必定成功（数值策划 P2-5）。
  const GUARANTEED_BREAKS = 3;

  function isHeroUnlockedInState(heroId, s) {
    if (!heroId || typeof heroId !== 'string') return false;
    const heroes = (window.GameConfig && Array.isArray(window.GameConfig.HEROES) && window.GameConfig.HEROES) || [];
    const hero = heroes.find((h) => h && h.id === heroId);
    if (!hero) return false;
    if (s && Array.isArray(s.lockedHeroes) && s.lockedHeroes.includes(heroId)) return false;
    if (s && Array.isArray(s.unlockedHeroes)) {
      return s.unlockedHeroes.includes(heroId) && !hero.locked;
    }
    return !hero.locked;
  }

  function computeDefaultSquadIds(s) {
    const heroes = (window.GameConfig && Array.isArray(window.GameConfig.HEROES) && window.GameConfig.HEROES) || [];
    const unlocked = heroes.filter((h) => h && isHeroUnlockedInState(h.id, s));
    if (unlocked.length === 0) return [];
    const mainId = (s && typeof s.heroId === 'string' && s.heroId) || unlocked[0].id;
    const out = [];
    if (unlocked.some((h) => h.id === mainId)) {
      out.push(mainId);
    }
    for (let i = 0; i < unlocked.length && out.length < MAX_SQUAD_SIZE; i++) {
      const id = unlocked[i].id;
      if (!out.includes(id)) out.push(id);
    }
    return out.slice(0, MAX_SQUAD_SIZE);
  }

  function normalizeSavedSquad(saved, heroId) {
    const refState = {
      ...(saved || {}),
      heroId: heroId || (saved && saved.heroId) || 'lanyi'
    };
    let raw = null;
    if (saved && Array.isArray(saved.squad)) {
      raw = saved.squad;
    } else if (saved && saved.stage && Array.isArray(saved.stage.squad)) {
      raw = saved.stage.squad;
    } else if (saved && Array.isArray(saved.heroOrder)) {
      raw = saved.heroOrder;
    } else if (saved && Array.isArray(saved.team)) {
      raw = saved.team;
    } else if (saved && Array.isArray(saved.lineup)) {
      raw = saved.lineup;
    }

    if (Array.isArray(raw)) {
      const seen = new Set();
      const filtered = [];
      for (let i = 0; i < raw.length; i++) {
        const id = raw[i];
        if (typeof id !== 'string' || !id || seen.has(id)) continue;
        if (!isHeroUnlockedInState(id, refState)) continue;
        seen.add(id);
        filtered.push(id);
        if (filtered.length >= MAX_SQUAD_SIZE) break;
      }
      if (filtered.length > 0 || raw.length === 0) {
        return filtered;
      }
    }
    return computeDefaultSquadIds(refState);
  }

  // 新手引导状态。旧存档没有 guide 字段：有进度的一律视为老玩家，不弹引导；几乎未动过的存档按新玩家处理。
  function defaultGuide() {
    return { v: 1, step: 0, done: false, taps: 0, gearPopup: false, gearVisited: false };
  }

  function isProgressedSave(saved) {
    if (!saved || typeof saved !== 'object') return false;
    if ((Number(saved.realmIndex) || 0) > 0) return true;
    if ((Number(saved.reincarnationCount) || 0) > 0 || (Number(saved.totalDaoGuo) || 0) > 0) return true;
    if (saved.stage && (Number(saved.stage.best) || 0) > 0) return true;
    if ((Number(saved.peachesPicked) || 0) > 0) return true;
    if ((Number(saved.totalClicks) || 0) >= 5) return true;
    if ((Number(saved.playTimeMs) || 0) >= 60000) return true;
    return false;
  }

  function normalizeGuide(rawGuide, saved) {
    const def = defaultGuide();
    if (rawGuide && typeof rawGuide === 'object') {
      const step = Math.max(0, Math.min(3, Math.floor(Number(rawGuide.step) || 0)));
      return {
        v: 1,
        step,
        done: Boolean(rawGuide.done) || step >= 3,
        taps: Math.max(0, Math.floor(Number(rawGuide.taps) || 0)),
        gearPopup: Boolean(rawGuide.gearPopup),
        gearVisited: Boolean(rawGuide.gearVisited),
        ...(rawGuide.legacy ? { legacy: true } : {})
      };
    }
    if (!isProgressedSave(saved)) return def;
    return { ...def, step: 3, done: true, gearPopup: true, gearVisited: true, legacy: true };
  }

  // 旧档没有 breakAttempts：洞天及以上或失败过的不再保底（记 99），否则按已突破次数 = realmIndex 计。
  function normalizeBreakAttempts(saved) {
    const raw = saved && saved.breakAttempts;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return Math.floor(raw);
    const realm = Math.max(0, Math.floor(Number(saved && saved.realmIndex) || 0));
    if (realm >= 3 || (Number(saved && saved.failBreakthroughs) || 0) > 0) return 99;
    return realm;
  }

  // 「新机缘开启」卡片已看过的功能。旧档没有该字段 → null，由 Newbie 按当前已解锁的功能补记（老玩家不补弹）。
  function normalizeUnlockSeen(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const out = {};
    Object.keys(raw).forEach((k) => {
      if (raw[k]) out[k] = true;
    });
    return out;
  }

  // 主线剧情已看过的段落（键：c<章>:intro / b<关>:pre / b<关>:post）。
  // 旧档没有该字段：已打过的章节与 Boss 一律记为看过，只给之后的内容播剧情。
  const STORY_CHAPTERS = 6;
  function seedStorySeen(best) {
    const out = {};
    const b = Math.max(0, Math.floor(Number(best) || 0));
    for (let ch = 1; ch <= STORY_CHAPTERS; ch += 1) {
      const start = (ch - 1) * 10 + 1;
      const bossStage = ch * 10;
      if (b >= start) out[`c${ch}:intro`] = true;
      if (b >= bossStage) {
        out[`c${ch}:intro`] = true;
        out[`b${bossStage}:pre`] = true;
        out[`b${bossStage}:post`] = true;
      }
    }
    return out;
  }

  function normalizeStorySeen(raw, saved) {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const out = {};
      Object.keys(raw).forEach((k) => {
        if (raw[k]) out[k] = true;
      });
      return out;
    }
    const best = Math.max(
      Number(saved && saved.stage && saved.stage.best) || 0,
      Number(saved && saved.lifeBestStage) || 0
    );
    return seedStorySeen(best);
  }

  function isBreakGuaranteed() {
    return (Number(state.breakAttempts) || 0) < GUARANTEED_BREAKS;
  }

  // 结算一次突破（不含灵气是否足够、渡劫门槛的前置检查）。roll 为 [0,1) 随机数。
  function applyBreakthroughAttempt(roll) {
    const stage = getCurrentStage();
    const guaranteed = isBreakGuaranteed();
    const rate = getBreakthroughSuccessRate();
    state.breakAttempts = (Number(state.breakAttempts) || 0) + 1;
    if (window.Daily && typeof window.Daily.hook === 'function') window.Daily.hook(state, 'breakthrough', 1, Date.now());
    if (guaranteed || roll < rate) {
      state.qi = Math.max(0, state.qi - stage.reqQi);
      state.realmIndex += 1;
      state.pityBonus = 0;
      if (window.Codex && typeof window.Codex.syncMaxRealm === 'function') window.Codex.syncMaxRealm(state);
      return { success: true, guaranteed, rate, loss: 0, stage, nextStage: getCurrentStage() };
    }
    const loss = Math.floor(Math.min(state.qi, stage.reqQi) * stage.failureLossRatio);
    state.qi = Math.max(0, state.qi - loss);
    state.pityBonus = Math.min(0.35, (state.pityBonus || 0) + 0.04);
    state.failBreakthroughs = (state.failBreakthroughs || 0) + 1;
    const firstFailTip = !state.flags.breakFailTipShown;
    state.flags.breakFailTipShown = true;
    return { success: false, guaranteed: false, rate, loss, stage, nextStage: stage, firstFailTip };
  }

  function createDefaultState() {
    const gongfaLevels = {};
    window.GameConfig.GONGFA_LIST.forEach((g, idx) => {
      gongfaLevels[g.id] = idx === 0 ? 1 : 0;
    });

    const dongfuLevels = {};
    const homeMaxTier = {};
    window.GameConfig.DONGFU_LIST.forEach((d, idx) => {
      dongfuLevels[d.id] = idx === 0 ? 1 : 0;
      homeMaxTier[d.id] = 0;
    });

    const talentLevels = {};
    window.GameConfig.DAOGUO_TALENTS.forEach((t) => {
      talentLevels[t.id] = 0;
    });

    const now = Date.now();
    const defaultSquad = computeDefaultSquadIds({ heroId: 'lanyi' });
    const v2Fields = window.Equip.defaultV2Fields(now);
    if (v2Fields.stage) {
      v2Fields.stage.squad = [...defaultSquad];
    }
    return {
      version: 3,
      heroId: 'lanyi',
      squad: [...defaultSquad],
      realmIndex: 0, // 0 = 搬血初
      qi: 0,
      stones: 25,
      pityBonus: 0, // 当前小境界渡劫失败累积的额外成功率
      gongfa: gongfaLevels,
      dongfu: dongfuLevels,
      home: { maxTier: homeMaxTier, bgMaxTier: 0 },
      reincarnationCount: 0,
      daoGuo: 0, // 可用道果点
      totalDaoGuo: 0, // 历史累计获得道果点（提供永久基础倍率）
      talents: talentLevels,
      totalClicks: 0,
      lastSaveTime: now,
      createdAt: now,
      playTimeMs: 0,
      lifetimeQi: 0,
      failBreakthroughs: 0,
      peachesPicked: 0,
      decomposed: 0,
      flags: { ling: false, di: false, weapon: false, offlineCap: false, breakFailTipShown: false, squadTagHintShown: false },
      login: { last: '', streak: 0 },
      dayTaps: { date: '', count: 0 },
      titles: { owned: ['churu'], worn: 'churu', seen: ['churu'] },
      // 每日功课：预置空结构；旧档或缺模块时与 Daily.normalize(null) 同形
      daily: window.Daily && typeof window.Daily.normalize === 'function'
        ? window.Daily.normalize(null)
        : { v: 1, date: '', points: 0, tasks: {}, chests: {}, checkin: { cycleDay: 0, last: '', total: 0 } },
      // 秘境劫运：每日次数（本地日期）与进行中的一局；旧存档缺省即为此值
      mijing: { date: '', used: 0, runs: 0, clears: 0, bestWave: 0, run: null },
      guide: defaultGuide(),
      breakAttempts: 0,
      unlockSeen: {},
      storySeen: {},
      // 开篇五屏（世界观 batch5）：只给全新存档播一次；旧档读档时视为已看过
      openingSeen: false,
      ...v2Fields
    };
  }

  function chapterBonus(best) {
    return Math.floor((best || 0) / 10);
  }

  let state = createDefaultState();

  function getCurrentStage() {
    const idx = Math.max(0, Math.min(state.realmIndex, window.GameConfig.REALM_STAGES.length - 1));
    return window.GameConfig.REALM_STAGES[idx];
  }

  function getDaoGuoQiMultiplier() {
    const baseMult = 1 + (state.totalDaoGuo || 0) * 0.25;
    const talentLv = (state.talents && state.talents.xiantian_daoti) || 0;
    const talentMult = 1 + talentLv * 0.5;
    return baseMult * talentMult;
  }

  function getDaoGuoStoneMultiplier() {
    const baseMult = 1 + (state.totalDaoGuo || 0) * 0.20;
    const talentLv = (state.talents && state.talents.qiyun_jiashang) || 0;
    const talentMult = 1 + talentLv * 0.5;
    return baseMult * talentMult;
  }

  function getQiPerSec() {
    const stage = getCurrentStage();
    let rawQi = 1; // 天地自然吐纳基础 1/秒
    window.GameConfig.GONGFA_LIST.forEach((item) => {
      const lv = (state.gongfa && state.gongfa[item.id]) || 0;
      if (lv > 0) {
        rawQi += item.baseQiPerSec * lv;
      }
    });
    const qiPct = window.Equip.subSum(state.equip, 'qi');
    const chapters = chapterBonus(state.stage && state.stage.best);
    const titleFactor = window.Titles ? window.Titles.qiFactor(state) : 1;
    const julingshiLv = (state.dongfu && state.dongfu.julingshi) || 0;
    return (
      rawQi *
      stage.multiplier *
      getDaoGuoQiMultiplier() *
      (1 + qiPct) *
      (1 + 0.02 * chapters) *
      titleFactor *
      (1 + 0.01 * Math.floor(julingshiLv / 10))
    );
  }

  function getStonePerSec() {
    const stage = getCurrentStage();
    let rawStone = 0.5; // 基础洞府产出
    window.GameConfig.DONGFU_LIST.forEach((item) => {
      const lv = (state.dongfu && state.dongfu[item.id]) || 0;
      if (lv > 0) {
        rawStone += item.baseStonePerSec * lv;
      }
    });
    const stonePct = window.Equip.subSum(state.equip, 'stone');
    const chapters = chapterBonus(state.stage && state.stage.best);
    return (
      rawStone *
      Math.pow(stage.multiplier, 0.65) *
      getDaoGuoStoneMultiplier() *
      (1 + stonePct) *
      (1 + 0.02 * chapters) *
      (window.Titles ? window.Titles.factor(state, 'stone') : 1)
    );
  }

  function grantPeachGift() {
    if (!state.tree || state.tree.gifted) return false;
    if ((state.realmIndex || 0) < window.GameConfig.PEACH.UNLOCK_REALM) return false;
    state.tree.gifted = true;
    state.tree.peaches = (state.tree.peaches || 0) + window.GameConfig.PEACH.GIFT;
    return true;
  }

  function finishTreeUpgrade(now) {
    if (!state.tree || !state.tree.upEnd) return false;
    if (now < state.tree.upEnd) return false;
    state.tree.lv = Math.min(window.GameConfig.TREE_MAX_LEVEL, (state.tree.lv || 1) + 1);
    state.tree.upEnd = 0;
    return true;
  }

  function applyPeachRegen(fromTs, toTs) {
    const tree = state.tree;
    if (!tree || toTs <= fromTs) return 0;
    const cap = window.GameConfig.peachCap(tree.lv || 1);
    const interval = window.Titles
      ? window.Titles.peachIntervalMs(state)
      : window.GameConfig.PEACH.INTERVAL_MS;
    if ((tree.peaches || 0) >= cap) {
      tree.regenAt = toTs;
      return 0;
    }
    let cursor = tree.regenAt || fromTs;
    let peaches = tree.peaches || 0;
    let gained = 0;
    while (cursor + interval <= toTs && peaches < cap) {
      cursor += interval;
      peaches += 1;
      gained += 1;
    }
    tree.peaches = peaches;
    tree.regenAt = peaches >= cap ? toTs : cursor;
    return gained;
  }

  function applyIdleStageRewards(seconds) {
    const best = (state.stage && state.stage.best) || 0;
    if (seconds <= 0 || best <= 0) return { peaches: 0, lingyu: 0 };
    const hours = seconds / 3600;
    const peaches = Math.floor((1 + Math.floor(best / 50)) * hours);
    const lingyu = Math.floor((6 + 0.4 * best) * hours);
    if (!state.tree) state.tree = {};
    const granted = addPeaches(peaches);
    state.lingyu = (state.lingyu || 0) + lingyu;
    return { peaches: granted, lingyu };
  }

  // 仙桃只补到上限；已因赠桃/闯关等溢出的存量不裁掉，只是不再增长。返回实际入账数量。
  function addPeaches(amount) {
    if (!state.tree) state.tree = {};
    const want = Math.max(0, Math.floor(Number(amount) || 0));
    const cap = window.GameConfig.peachCap(state.tree.lv || 1);
    const current = state.tree.peaches || 0;
    const granted = current >= cap ? 0 : Math.min(want, cap - current);
    state.tree.peaches = current + granted;
    return granted;
  }

  function toFiniteNumber(value, fallback) {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function coerceNumericMap(map, fallback) {
    if (!map || typeof map !== 'object') return;
    Object.keys(map).forEach((key) => {
      map[key] = toFiniteNumber(map[key], fallback);
    });
  }

  function coerceStateNumbers(s) {
    if (!s || typeof s !== 'object') return s;
    s.qi = toFiniteNumber(s.qi, 0);
    s.stones = toFiniteNumber(s.stones, 0);
    s.lingyu = toFiniteNumber(s.lingyu, 0);
    s.realmIndex = toFiniteNumber(s.realmIndex, 0);
    s.pityBonus = toFiniteNumber(s.pityBonus, 0);
    s.reincarnationCount = toFiniteNumber(s.reincarnationCount, 0);
    s.daoGuo = toFiniteNumber(s.daoGuo, 0);
    s.totalDaoGuo = toFiniteNumber(s.totalDaoGuo, 0);
    s.totalClicks = toFiniteNumber(s.totalClicks, 0);
    s.lastSaveTime = toFiniteNumber(s.lastSaveTime, Date.now());
    s.createdAt = toFiniteNumber(s.createdAt, s.lastSaveTime || Date.now());
    s.playTimeMs = toFiniteNumber(s.playTimeMs, 0);
    s.lifetimeQi = toFiniteNumber(s.lifetimeQi, 0);
    s.failBreakthroughs = toFiniteNumber(s.failBreakthroughs, 0);
    s.peachesPicked = toFiniteNumber(s.peachesPicked, 0);
    s.decomposed = toFiniteNumber(s.decomposed, 0);
    s.lifeBestStage = toFiniteNumber(s.lifeBestStage, 0);
    s.breakAttempts = toFiniteNumber(s.breakAttempts, 0);
    if (s.tree && typeof s.tree === 'object') {
      s.tree.peaches = toFiniteNumber(s.tree.peaches, 0);
      s.tree.lv = toFiniteNumber(s.tree.lv, 1);
      s.tree.upEnd = toFiniteNumber(s.tree.upEnd, 0);
      s.tree.regenAt = toFiniteNumber(s.tree.regenAt, s.lastSaveTime || Date.now());
    }
    if (s.stage && typeof s.stage === 'object') {
      s.stage.best = toFiniteNumber(s.stage.best, 0);
      s.stage.cur = toFiniteNumber(s.stage.cur, 1);
      s.stage.idleAt = toFiniteNumber(s.stage.idleAt, s.lastSaveTime || Date.now());
      s.stage.wins = toFiniteNumber(s.stage.wins, 0);
      s.stage.fails = toFiniteNumber(s.stage.fails, 0);
      s.stage.losses = toFiniteNumber(s.stage.losses, 0);
      s.stage.streak = toFiniteNumber(s.stage.streak, 0);
      s.stage.maxStreak = toFiniteNumber(s.stage.maxStreak, 0);
      s.stage.speed = toFiniteNumber(s.stage.speed, 2);
    }
    if (s.mijing && typeof s.mijing === 'object') {
      s.mijing.used = toFiniteNumber(s.mijing.used, 0);
      s.mijing.runs = toFiniteNumber(s.mijing.runs, 0);
      s.mijing.clears = toFiniteNumber(s.mijing.clears, 0);
      s.mijing.bestWave = toFiniteNumber(s.mijing.bestWave, 0);
    }
    coerceNumericMap(s.gongfa, 0);
    coerceNumericMap(s.dongfu, 0);
    coerceNumericMap(s.talents, 0);
    if (s.home && typeof s.home === 'object') {
      s.home.bgMaxTier = toFiniteNumber(s.home.bgMaxTier, 0);
      coerceNumericMap(s.home.maxTier, 0);
    }
    return s;
  }

  function applyOfflineWindow(savedTime, now) {
    const elapsedSec = Math.floor((now - savedTime) / 1000);
    if (elapsedSec < 3) {
      finishTreeUpgrade(now);
      applyPeachRegen(state.tree && state.tree.regenAt ? state.tree.regenAt : now, now);
      grantPeachGift();
      return null;
    }
    const cappedSec = Math.min(elapsedSec, getOfflineCapSeconds());
    const qiGain = getQiPerSec() * cappedSec;
    const stoneGain = getStonePerSec() * cappedSec;
    state.qi = toFiniteNumber(state.qi, 0) + qiGain;
    state.lifetimeQi = toFiniteNumber(state.lifetimeQi, 0) + qiGain;
    state.playTimeMs = toFiniteNumber(state.playTimeMs, 0) + cappedSec * 1000;
    if (elapsedSec > getOfflineCapSeconds()) {
      if (!state.flags) state.flags = {};
      state.flags.offlineCap = true;
    }
    state.stones = toFiniteNumber(state.stones, 0) + stoneGain;
    const windowEnd = savedTime + cappedSec * 1000;
    let treeDone = false;
    if (state.tree && state.tree.upEnd && state.tree.upEnd > windowEnd) {
      state.tree.upEnd += now - windowEnd;
    } else {
      treeDone = finishTreeUpgrade(windowEnd);
    }
    const peachGain = applyPeachRegen(savedTime, windowEnd);
    const idle = applyIdleStageRewards(cappedSec);
    if (state.tree) state.tree.regenAt = now;
    if (state.stage) state.stage.idleAt = now;
    state.lastSaveTime = now;
    grantPeachGift();
    return {
      rawSeconds: elapsedSec,
      effectiveSeconds: cappedSec,
      capped: elapsedSec > getOfflineCapSeconds(),
      qiGain,
      stoneGain,
      peachGain: peachGain + idle.peaches,
      lingyuGain: idle.lingyu,
      treeDone
    };
  }

  function settleAwayProgress(now, opts) {
    const at = toFiniteNumber(now, Date.now()) || Date.now();
    const minSec = opts && opts.minSeconds != null ? toFiniteNumber(opts.minSeconds, VISIBLE_SETTLE_MIN_SECONDS) : VISIBLE_SETTLE_MIN_SECONDS;
    const savedTime = toFiniteNumber(state.lastSaveTime, at) || at;
    const elapsedSec = Math.floor((at - savedTime) / 1000);
    if (elapsedSec < 3 || elapsedSec < minSec) return null;
    const report = applyOfflineWindow(savedTime, at);
    saveGame();
    return report;
  }

  function getTapQiGain() {
    // 每次点击获得相当于 3 + 0.35秒打坐灵气
    const perSec = getQiPerSec();
    const tap = window.Titles ? window.Titles.factor(state, 'tap') : 1;
    return Math.max(2, Math.round((3 + perSec * 0.35) * tap * 10) / 10);
  }

  function getGongfaCost(item) {
    const lv = (state.gongfa && state.gongfa[item.id]) || 0;
    return Math.floor(item.baseCost * Math.pow(item.costScale, lv));
  }

  function getDongfuCost(item) {
    const lv = (state.dongfu && state.dongfu[item.id]) || 0;
    return Math.floor(item.baseCost * Math.pow(item.costScale, lv));
  }

  function getHomeDisplayTier(id) {
    const lv = (state.dongfu && state.dongfu[id]) || 0;
    const curTier = window.GameConfig.homeBuildingTier(lv);
    const maxTier = (state.home && state.home.maxTier && Number(state.home.maxTier[id])) || 0;
    return Math.max(curTier, maxTier);
  }

  function getHomeBgDisplayTier() {
    let totalLv = 0;
    window.GameConfig.DONGFU_LIST.forEach((d) => {
      totalLv += (state.dongfu && state.dongfu[d.id]) || 0;
    });
    const curTier = window.GameConfig.homeBgTier(totalLv);
    const bgMaxTier = (state.home && Number(state.home.bgMaxTier)) || 0;
    return Math.max(curTier, bgMaxTier);
  }

  function getOfflineCapSeconds() {
    const base = window.GameConfig.OFFLINE_CAP_SECONDS || 12 * 3600;
    const lingquanLv = (state.dongfu && state.dongfu.lingquan) || 0;
    const bonus = Math.floor(lingquanLv / 20) * 1800;
    return Math.min(15 * 3600, base + bonus);
  }

  function buyDongfu(id, n) {
    const item = window.GameConfig.DONGFU_LIST.find((d) => d.id === id);
    if (!item) return 0;
    if ((state.realmIndex || 0) < item.unlockRealmIndex) return 0;
    const limit = n === Infinity ? Infinity : Math.max(0, Math.floor(n || 0));
    let bought = 0;
    while (bought < limit) {
      const cost = getDongfuCost(item);
      if (state.stones < cost) break;
      state.stones -= cost;
      state.dongfu[id] = (state.dongfu[id] || 0) + 1;
      bought += 1;
    }
    if (bought > 0 && window.Daily && typeof window.Daily.hook === 'function') {
      window.Daily.hook(state, 'home_upgrade', 1, Date.now());
    }
    return bought;
  }

  function getTalentCost(talent) {
    const lv = (state.talents && state.talents[talent.id]) || 0;
    return Math.max(1, Math.floor(talent.baseCost * Math.pow(talent.costScale, lv)));
  }

  function getBreakthroughSuccessRate() {
    const stage = getCurrentStage();
    const talentLv = (state.talents && state.talents.pomo_daoxin) || 0;
    const talentBonus = Math.min(0.30, talentLv * 0.03);
    const titleBonus = window.Titles ? window.Titles.addend(state, 'break') : 0;
    const total = stage.successRate + (state.pityBonus || 0) + talentBonus + titleBonus;
    return Math.min(0.98, Number(total.toFixed(3)));
  }

  function getPendingDaoGuo() {
    if (state.realmIndex < window.GameConfig.REINCARNATION_MIN_STAGE) {
      return 0;
    }
    // 天神初(index 27)基础可得 2 点道果，每高一小层增加，至尊期大幅提升
    const stepsAbove = state.realmIndex - window.GameConfig.REINCARNATION_MIN_STAGE;
    const realmBonus = Math.floor(Math.pow(1.22, stepsAbove) * 2);
    const qiBonus = Math.floor(Math.log10(Math.max(1, state.qi / 1e6)));
    const chapter = chapterBonus(Math.max((state.stage && state.stage.best) || 0, state.lifeBestStage || 0));
    return Math.max(2, realmBonus + Math.max(0, qiBonus) + Math.floor(chapter / 5));
  }

  function migrateV1toV2(parsed) {
    const now = Date.now();
    const realmIndex = parsed.realmIndex || 0;
    const major = Math.floor(realmIndex / 9);
    const passed = [0, 30, 90, 150, 210][Math.min(major, 4)];
    const peaches = Math.min(200, 30 + 5 * realmIndex);
    const fields = window.Equip.defaultV2Fields(parsed.lastSaveTime || now);
    fields.tree.peaches = peaches;
    fields.tree.gifted = true;
    fields.tree.regenAt = parsed.lastSaveTime || now;
    fields.stage.best = passed;
    fields.stage.cur = passed > 0 ? Math.min(300, passed + 1) : 1;
    fields.stage.idleAt = parsed.lastSaveTime || now;
    fields.lifeBestStage = passed;
    return { ...parsed, ...fields, version: 2 };
  }

  function migrateV2toV3(parsed) {
    const now = Date.now();
    const realmIndex = parsed.realmIndex || 0;
    const major = Math.floor(realmIndex / 9);
    const passed = [0, 30, 90, 150, 210][Math.min(Math.max(0, major), 4)];
    const prevStage = parsed.stage || {};
    const best = Math.max(prevStage.best || 0, passed);
    const prevCur = prevStage.cur || 1;
    const cur = best > 0 ? Math.min(300, Math.max(prevCur, best + 1)) : prevCur;
    const defStage = window.Equip.defaultStage(parsed.lastSaveTime || now);
    return {
      ...parsed,
      version: 3,
      stage: {
        ...defStage,
        ...prevStage,
        cur,
        best,
        idleAt: prevStage.idleAt || parsed.lastSaveTime || now,
        sweep: { ...defStage.sweep, ...(prevStage.sweep || {}) }
      },
      lifeBestStage: Math.max(parsed.lifeBestStage || 0, best)
    };
  }

  function mergeSave(def, saved) {
    const equip = { ...def.equip };
    if (saved.equip) {
      Object.keys(equip).forEach((key) => {
        if (key in saved.equip) equip[key] = saved.equip[key];
      });
    }
    let unlockedHeroes = saved.unlockedHeroes;
    if (Array.isArray(unlockedHeroes)) {
      const lockedSet = new Set(Array.isArray(saved.lockedHeroes) ? saved.lockedHeroes : []);
      const cfgHeroes = (window.GameConfig && Array.isArray(window.GameConfig.HEROES) && window.GameConfig.HEROES) || [];
      unlockedHeroes = [...unlockedHeroes];
      // 免费角色只补名单里缺的晴葵、月誓、紫绫、红莲、墨兰、晴岚、焚霄、霜宸、幽冥。显式 lockedHeroes 或配置 locked 不解锁，也不补其他旧角色。
      const grantFreeHero = (heroId) => {
        const hero = cfgHeroes.find((h) => h && h.id === heroId);
        if (hero && !hero.locked && !lockedSet.has(heroId) && !unlockedHeroes.includes(heroId)) {
          unlockedHeroes.push(heroId);
        }
      };
      grantFreeHero('qingkui');
      grantFreeHero('yueshi');
      grantFreeHero('ziling');
      grantFreeHero('honglian');
      grantFreeHero('molan');
      grantFreeHero('qinglan');
      grantFreeHero('fenxiao');
      grantFreeHero('shuangchen');
      grantFreeHero('youming');
    }
    const heroId = (saved && typeof saved.heroId === 'string' && saved.heroId) ? saved.heroId : 'lanyi';
    const squad = normalizeSavedSquad(saved, heroId);
    const mergedStage = {
      ...def.stage,
      ...(saved.stage || {}),
      squad: [...squad],
      sweep: { ...def.stage.sweep, ...((saved.stage && saved.stage.sweep) || {}) }
    };
    if (mergedStage.best > 0 && mergedStage.cur <= mergedStage.best && mergedStage.best < 300) {
      mergedStage.cur = mergedStage.best + 1;
    }
    const merged = {
      ...def,
      ...saved,
      version: 3,
      heroId,
      squad: [...squad],
      gongfa: { ...def.gongfa, ...(saved.gongfa || {}) },
      dongfu: { ...def.dongfu, ...(saved.dongfu || {}) },
      home: {
        ...def.home,
        ...(saved.home || {}),
        maxTier: {
          ...def.home.maxTier,
          ...((saved.home && saved.home.maxTier) || {})
        }
      },
      talents: { ...def.talents, ...(saved.talents || {}) },
      tree: { ...def.tree, ...(saved.tree || {}) },
      equip,
      pity: { ...def.pity, ...(saved.pity || {}) },
      autoDecomp: { ...def.autoDecomp, ...(saved.autoDecomp || {}) },
      stage: mergedStage,
      pending: saved.pending || null,
      titles: {
        owned: (saved.titles && saved.titles.owned) || def.titles.owned,
        worn: (saved.titles && saved.titles.worn) || def.titles.worn,
        seen: (saved.titles && saved.titles.seen) || def.titles.seen
      },
      flags: { ...def.flags, ...(saved.flags || {}) },
      login: { ...def.login, ...(saved.login || {}) },
      dayTaps: { ...def.dayTaps, ...(saved.dayTaps || {}) },
      guide: normalizeGuide(saved.guide, saved),
      breakAttempts: normalizeBreakAttempts(saved),
      unlockSeen: normalizeUnlockSeen(saved.unlockSeen),
      storySeen: normalizeStorySeen(saved.storySeen, saved),
      openingSeen: saved.openingSeen !== false,
      createdAt: saved.createdAt || saved.lastSaveTime || def.createdAt,
      playTimeMs: saved.playTimeMs || 0,
      lifetimeQi: saved.lifetimeQi || 0,
      failBreakthroughs: saved.failBreakthroughs || 0,
      peachesPicked: saved.peachesPicked || 0,
      decomposed: saved.decomposed || 0,
      mijing: window.Mijing
        ? window.Mijing.normalize(saved.mijing)
        : saved.mijing && typeof saved.mijing === 'object'
          ? saved.mijing
          : { ...def.mijing },
      daily: window.Daily
        ? window.Daily.normalize(saved.daily)
        : saved.daily && typeof saved.daily === 'object' && !Array.isArray(saved.daily)
          ? saved.daily
          : { v: 1, date: '', points: 0, tasks: {}, chests: {}, checkin: { cycleDay: 0, last: '', total: 0 } },
      grow: window.Grow
        ? window.Grow.normalize(saved.grow)
        : saved.grow && typeof saved.grow === 'object' && !Array.isArray(saved.grow)
          ? saved.grow
          : { v: 1, lv: {} },
      tower: window.Tower
        ? window.Tower.normalize(saved.tower)
        : saved.tower && typeof saved.tower === 'object' && !Array.isArray(saved.tower)
          ? saved.tower
          : { v: 1, best: 0, claimed: 0, date: '', fails: 0 },
      homeFortune: window.HomeFortune
        ? window.HomeFortune.normalize(saved.homeFortune)
        : saved.homeFortune && typeof saved.homeFortune === 'object' && !Array.isArray(saved.homeFortune)
          ? saved.homeFortune
          : { v: 1, date: '', spawned: 0, pending: null, queued: 0, recent: [], nextOnlineAt: 20 * 60 * 1000, onlineMs: 0, lastSeen: 0 },
      codex: window.Codex
        ? window.Codex.normalize(saved.codex)
        : saved.codex && typeof saved.codex === 'object' && !Array.isArray(saved.codex)
          ? saved.codex
          : { v: 2, maxRealm: 0, kills: {}, seen: {}, claimed: {} }
    };
    if (Array.isArray(unlockedHeroes)) {
      merged.unlockedHeroes = unlockedHeroes;
    }
    if (!saved.flags || typeof saved.flags.breakFailTipShown !== 'boolean') {
      merged.flags.breakFailTipShown = (saved.failBreakthroughs || 0) > 0;
    }
    return merged;
  }

  function saveGame() {
    try {
      state.lastSaveTime = Date.now();
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      console.warn('存档保存失败:', err);
      return false;
    }
  }

  // 离线/后台结算：从 fromTs 结算到 now。idleStage=true 时（读档）直接发闯关挂机奖励并重置挂机计时；
  // 后台切回（idleStage=false）不动挂机计时，挂机奖励仍由闯关页「领取」按 idleAt 计算，避免重复。
  function settleOffline(fromTs, now, opts) {
    const options = opts || {};
    const savedTime = Number(fromTs) || now;
    const elapsedSec = Math.floor((now - savedTime) / 1000);
    if (elapsedSec < 3) {
      finishTreeUpgrade(now);
      applyPeachRegen(state.tree.regenAt || now, now);
      return null;
    }
    const capSec = getOfflineCapSeconds();
    const cappedSec = Math.min(elapsedSec, capSec);
    const qiGain = getQiPerSec() * cappedSec;
    const stoneGain = getStonePerSec() * cappedSec;
    state.qi += qiGain;
    state.lifetimeQi = (state.lifetimeQi || 0) + qiGain;
    state.playTimeMs = (state.playTimeMs || 0) + cappedSec * 1000;
    if (elapsedSec > capSec) state.flags.offlineCap = true;
    state.stones += stoneGain;
    const windowEnd = savedTime + cappedSec * 1000;
    let treeDone = false;
    if (state.tree.upEnd && state.tree.upEnd > windowEnd) {
      state.tree.upEnd += now - windowEnd;
    } else {
      treeDone = finishTreeUpgrade(windowEnd);
    }
    const peachGain = applyPeachRegen(savedTime, windowEnd);
    const idle = options.idleStage ? applyIdleStageRewards(cappedSec) : { peaches: 0, lingyu: 0 };
    state.tree.regenAt = now;
    if (options.idleStage && state.stage) state.stage.idleAt = now;
    state.lastSaveTime = now;
    return {
      rawSeconds: elapsedSec,
      effectiveSeconds: cappedSec,
      capped: elapsedSec > capSec,
      qiGain,
      stoneGain,
      peachGain: peachGain + idle.peaches,
      lingyuGain: idle.lingyu,
      treeDone
    };
  }

  // 前台 tick 的墙上时钟，用来计算后台补算时「还没被 tick 覆盖」的缺口。
  let lastTickAt = 0;

  function markTick(now) {
    lastTickAt = Number(now) || Date.now();
    return lastTickAt;
  }

  function getLastTickAt() {
    return lastTickAt;
  }

  // 页面从后台切回：只补「上次 tick 之后」的缺口。
  // rAF 在后台暂停时，缺口≈隐藏时长；后台仍在跑 tick 时，缺口接近 0，避免再按挂钟发一遍。
  function resumeFromBackground(hiddenAt, now) {
    const t = now || Date.now();
    const hideAt = Number(hiddenAt) || Number(state.lastSaveTime) || t;
    const tickAt = Number(lastTickAt) || 0;
    const from = tickAt > 0 ? tickAt : hideAt;
    const report = settleOffline(from, t, { idleStage: false });
    lastTickAt = t;
    grantPeachGift();
    if (window.Daily && typeof window.Daily.ensure === 'function') window.Daily.ensure(state, t);
    if (window.Grow && typeof window.Grow.ensure === 'function') window.Grow.ensure(state);
    if (window.Tower && typeof window.Tower.ensure === 'function') window.Tower.ensure(state);
    if (window.HomeFortune && typeof window.HomeFortune.onResume === 'function') {
      window.HomeFortune.onResume(state, (report && report.effectiveSeconds ? report.effectiveSeconds : 0) * 1000, t);
    }
    if (window.Codex && typeof window.Codex.ensureState === 'function') window.Codex.ensureState(state);
    saveGame();
    return report;
  }

  function loadGame() {
    let raw = null;
    try {
      raw = localStorage.getItem(SAVE_KEY);
      if (!raw) {
        state = createDefaultState();
        if (window.Daily && typeof window.Daily.ensure === 'function') window.Daily.ensure(state, Date.now());
        if (window.Grow && typeof window.Grow.ensure === 'function') window.Grow.ensure(state);
        if (window.Tower && typeof window.Tower.ensure === 'function') window.Tower.ensure(state);
        if (window.HomeFortune && typeof window.HomeFortune.ensure === 'function') window.HomeFortune.ensure(state, Date.now());
        if (window.Codex && typeof window.Codex.ensureState === 'function') window.Codex.ensureState(state);
        return { isNew: true, offlineReport: null };
      }
      let parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('存档格式无效');
      }
      if ((parsed.version || 1) < 3) {
        try {
          localStorage.setItem(SAVE_BACKUP_KEY, raw);
        } catch (err) {
          console.warn('旧档备份失败:', err);
        }
        if ((parsed.version || 1) < 2) {
          parsed = migrateV1toV2(parsed);
        }
        parsed = migrateV2toV3(parsed);
      }
      const def = createDefaultState();
      state = coerceStateNumbers(mergeSave(def, parsed));
      const now = Date.now();
      const savedTime = toFiniteNumber(parsed.lastSaveTime, now) || now;
      const offlineReport = settleOffline(savedTime, now, { idleStage: true });
      grantPeachGift();
      if (window.Daily && typeof window.Daily.ensure === 'function') window.Daily.ensure(state, now);
      if (window.Grow && typeof window.Grow.ensure === 'function') window.Grow.ensure(state);
      if (window.Tower && typeof window.Tower.ensure === 'function') window.Tower.ensure(state);
      if (window.HomeFortune && typeof window.HomeFortune.onResume === 'function') {
        window.HomeFortune.onResume(state, (offlineReport && offlineReport.effectiveSeconds ? offlineReport.effectiveSeconds : 0) * 1000, now);
      }
      if (window.Codex && typeof window.Codex.ensureState === 'function') window.Codex.ensureState(state);
      return { isNew: false, offlineReport };
    } catch (err) {
      console.warn('读取存档异常，初始化新存档:', err);
      if (raw) {
        try {
          localStorage.setItem(SAVE_CORRUPT_KEY, raw);
        } catch (bakErr) {
          console.warn('坏档备份失败:', bakErr);
        }
      }
      state = createDefaultState();
      if (window.Daily && typeof window.Daily.ensure === 'function') window.Daily.ensure(state, Date.now());
      if (window.Grow && typeof window.Grow.ensure === 'function') window.Grow.ensure(state);
      if (window.Tower && typeof window.Tower.ensure === 'function') window.Tower.ensure(state);
      if (window.Codex && typeof window.Codex.ensureState === 'function') window.Codex.ensureState(state);
      return { isNew: true, offlineReport: null };
    }
  }

  function resetGame() {
    state = createDefaultState();
    localStorage.removeItem(SAVE_KEY);
    saveGame();
    return state;
  }

  function performReincarnation() {
    const gain = getPendingDaoGuo();
    if (gain <= 0) return { ok: false, gain: 0 };

    const keepReincarnations = (state.reincarnationCount || 0) + 1;
    const keepDaoGuo = (state.daoGuo || 0) + gain;
    const keepTotalDaoGuo = (state.totalDaoGuo || 0) + gain;
    const keepTalents = { ...(state.talents || {}) };
    let refund = 0;
    window.GameConfig.EQUIP_SLOTS.forEach((slot) => {
      const item = state.equip && state.equip[slot.id];
      if (item) {
        const value = window.Titles ? window.Titles.jadeValue(state, item) : window.Equip.decomposeValue(item);
        refund += Math.floor(value * 0.5);
      }
    });
    if (state.pending) {
      const value = window.Titles
        ? window.Titles.jadeValue(state, state.pending)
        : window.Equip.decomposeValue(state.pending);
      refund += Math.floor(value * 0.5);
    }
    const keepLingyu = (state.lingyu || 0) + refund;
    const keepTree = {
      ...state.tree,
      gifted: true
    };
    const keepPity = { ...(state.pity || { di: 0, tian: 0 }) };
    const keepAuto = { ...(state.autoDecomp || {}) };
    const keepLife = Math.max(state.lifeBestStage || 0, (state.stage && state.stage.best) || 0);
    const keepSeq = state.seq || 0;
    const keepPeaches = (state.tree && state.tree.peaches) || 0;
    const keepHome = JSON.parse(JSON.stringify(state.home || {}));

    const keepSquad = normalizeSavedSquad(state, state.heroId);
    const keepFormation = state.formation ? JSON.parse(JSON.stringify(state.formation)) : undefined;

    const fresh = createDefaultState();
    fresh.home = {
      ...fresh.home,
      ...keepHome,
      maxTier: { ...fresh.home.maxTier, ...((keepHome && keepHome.maxTier) || {}) }
    };
    fresh.heroId = state.heroId || 'lanyi';
    fresh.squad = [...keepSquad];
    if (keepFormation) fresh.formation = keepFormation;
    fresh.reincarnationCount = keepReincarnations;
    fresh.daoGuo = keepDaoGuo;
    fresh.totalDaoGuo = keepTotalDaoGuo;
    fresh.talents = keepTalents;
    fresh.lingyu = keepLingyu;
    fresh.tree = { ...keepTree, peaches: keepPeaches };
    fresh.pity = keepPity;
    fresh.autoDecomp = keepAuto;
    fresh.lifeBestStage = keepLife;
    fresh.seq = keepSeq;
    const prevStage = state.stage || {};
    fresh.stage = {
      cur: 1,
      best: 0,
      auto: prevStage.auto !== undefined ? Boolean(prevStage.auto) : true,
      idleAt: Date.now(),
      speed: prevStage.speed === 1 ? 1 : 2,
      fails: 0,
      wins: prevStage.wins || 0,
      losses: prevStage.losses || 0,
      streak: 0,
      maxStreak: prevStage.maxStreak || 0,
      squad: [...keepSquad],
      sweep: { ...((prevStage && prevStage.sweep) || { date: '', used: 0 }) }
    };
    fresh.equip = window.Equip.emptyEquip();
    fresh.pending = null;
    fresh.createdAt = state.createdAt;
    fresh.playTimeMs = state.playTimeMs || 0;
    fresh.lifetimeQi = state.lifetimeQi || 0;
    fresh.failBreakthroughs = state.failBreakthroughs || 0;
    fresh.peachesPicked = state.peachesPicked || 0;
    fresh.decomposed = state.decomposed || 0;
    // 图鉴：轮回保留历史最高境界（及其它 codex 字段），避免已解锁条目重新上锁
    if (window.Codex && typeof window.Codex.syncMaxRealm === 'function') {
      window.Codex.syncMaxRealm(state);
    }
    if (state.codex && typeof state.codex === 'object' && !Array.isArray(state.codex)) {
      const copied = JSON.parse(JSON.stringify(state.codex));
      fresh.codex = window.Codex && typeof window.Codex.normalize === 'function'
        ? window.Codex.normalize(copied)
        : copied;
    }
    // 轮回不重置秘境当日次数，进行中的一局按开局快照继续（避免轮回刷次数）
    if (state.mijing && typeof state.mijing === 'object') {
      fresh.mijing = JSON.parse(JSON.stringify(state.mijing));
    }
    // 仙姬派遣：轮回不清空进行中的派遣与当日悬赏（避免轮回刷新悬赏榜；灵石奖励领取时按当时产出封顶）
    if (state.dispatch && typeof state.dispatch === 'object') {
      fresh.dispatch = JSON.parse(JSON.stringify(state.dispatch));
    }
    // 灵兽伴生：已获得的灵兽与等级、当前伴生随轮回保留
    if (state.beasts && typeof state.beasts === 'object') {
      fresh.beasts = JSON.parse(JSON.stringify(state.beasts));
    }
    fresh.flags = { ...(state.flags || {}) };
    fresh.login = { ...(state.login || {}) };
    fresh.dayTaps = { ...(state.dayTaps || {}) };
    fresh.daily = window.Daily
      ? window.Daily.normalize(state.daily)
      : (state.daily && typeof state.daily === 'object' ? { ...state.daily } : state.daily);
    fresh.grow = window.Grow
      ? window.Grow.normalize(state.grow)
      : (state.grow && typeof state.grow === 'object' ? { ...state.grow, lv: { ...((state.grow && state.grow.lv) || {}) } } : state.grow);
    // 镇妖塔：轮回深拷贝保留最高层与当日失败次数（不能靠轮回刷新次数）
    if (state.tower && typeof state.tower === 'object') {
      const copied = JSON.parse(JSON.stringify(state.tower));
      fresh.tower = window.Tower ? window.Tower.normalize(copied) : copied;
    }
    // 洞府机缘：轮回保留当日次数与待处理事件（不能靠轮回刷新次数）
    if (state.homeFortune && typeof state.homeFortune === 'object') {
      const copied = JSON.parse(JSON.stringify(state.homeFortune));
      fresh.homeFortune = window.HomeFortune ? window.HomeFortune.normalize(copied) : copied;
    }
    fresh.guide = normalizeGuide(state.guide, state);
    fresh.breakAttempts = normalizeBreakAttempts(state);
    fresh.unlockSeen = normalizeUnlockSeen(state.unlockSeen) || {};
    fresh.storySeen = normalizeStorySeen(state.storySeen, state);
    fresh.openingSeen = true;
    fresh.titles = {
      owned: [...((state.titles && state.titles.owned) || ['churu'])],
      worn: (state.titles && state.titles.worn) || 'churu',
      seen: [...((state.titles && state.titles.seen) || ['churu'])]
    };

    state = fresh;
    saveGame();
    return { ok: true, gain, refund };
  }

  function getSquad() {
    if (window.Battle && typeof window.Battle.getSquadIds === 'function') {
      return window.Battle.getSquadIds(state);
    }
    return normalizeSavedSquad(state, state.heroId);
  }

  function setSquad(heroIds) {
    if (window.Battle && typeof window.Battle.setSquad === 'function') {
      const res = window.Battle.setSquad(state, heroIds);
      if (res && res.ok) {
        saveGame();
      }
      return res;
    }
    if (!Array.isArray(heroIds)) {
      return { ok: false, reason: 'INVALID_INPUT', squad: getSquad() };
    }
    const seen = new Set();
    const valid = [];
    for (let i = 0; i < heroIds.length; i++) {
      const id = heroIds[i];
      if (typeof id !== 'string' || !id || seen.has(id)) {
        return { ok: false, reason: 'DUPLICATE_ID', squad: getSquad() };
      }
      if (!isHeroUnlockedInState(id, state)) {
        return { ok: false, reason: 'LOCKED_OR_INVALID_ID', squad: getSquad() };
      }
      seen.add(id);
      valid.push(id);
    }
    if (valid.length > MAX_SQUAD_SIZE) {
      return { ok: false, reason: 'MAX_EXCEEDED', squad: getSquad() };
    }
    if (valid.length < 1) {
      return { ok: false, reason: 'EMPTY_SQUAD', squad: getSquad() };
    }
    state.squad = [...valid];
    if (state.stage) state.stage.squad = [...valid];
    saveGame();
    return { ok: true, reason: null, squad: [...valid] };
  }

  function unlockHero(heroId) {
    if (!heroId || typeof heroId !== 'string') return false;
    const heroes = (window.GameConfig && Array.isArray(window.GameConfig.HEROES) && window.GameConfig.HEROES) || [];
    const hero = heroes.find((h) => h && h.id === heroId);
    if (!hero) return false;
    if (hero.locked) {
      hero.locked = false;
    }
    if (Array.isArray(state.lockedHeroes)) {
      state.lockedHeroes = state.lockedHeroes.filter((id) => id !== heroId);
    }
    if (Array.isArray(state.unlockedHeroes) && !state.unlockedHeroes.includes(heroId)) {
      state.unlockedHeroes.push(heroId);
    }
    const curSquad = Array.isArray(state.squad) ? [...state.squad] : computeDefaultSquadIds(state);
    // 解锁新角色不得自动加到满 6 人以上
    if (curSquad.length < MAX_SQUAD_SIZE && !curSquad.includes(heroId)) {
      curSquad.push(heroId);
    }
    state.squad = curSquad.slice(0, MAX_SQUAD_SIZE);
    if (state.stage && typeof state.stage === 'object') {
      state.stage.squad = [...state.squad];
    }
    if (window.Battle && typeof window.Battle.ensureFormation === 'function') {
      window.Battle.ensureFormation(state);
    }
    saveGame();
    return true;
  }

  function tickTimers(now) {
    grantPeachGift();
    const leveled = finishTreeUpgrade(now);
    const peaches = applyPeachRegen(state.tree.regenAt || now, now);
    return { leveled, peaches };
  }

  window.GameState = {
    get state() {
      return state;
    },
    MAX_SQUAD_SIZE,
    getCurrentStage,
    getDaoGuoQiMultiplier,
    getDaoGuoStoneMultiplier,
    getQiPerSec,
    getStonePerSec,
    getTapQiGain,
    getGongfaCost,
    getDongfuCost,
    getHomeDisplayTier,
    getHomeBgDisplayTier,
    getOfflineCapSeconds,
    buyDongfu,
    getTalentCost,
    getBreakthroughSuccessRate,
    getPendingDaoGuo,
    getSquad,
    setSquad,
    unlockHero,
    saveGame,
    loadGame,
    resetGame,
    performReincarnation,
    tickTimers,
    grantPeachGift,
    applyIdleStageRewards,
    addPeaches,
    markTick,
    getLastTickAt,
    defaultGuide,
    normalizeGuide,
    isProgressedSave,
    GUARANTEED_BREAKS,
    normalizeBreakAttempts,
    normalizeUnlockSeen,
    normalizeStorySeen,
    seedStorySeen,
    isBreakGuaranteed,
    applyBreakthroughAttempt,
    settleOffline,
    resumeFromBackground,
    settleAwayProgress,
    applyOfflineWindow,
    SAVE_KEY,
    SAVE_BACKUP_KEY,
    SAVE_CORRUPT_KEY,
    VISIBLE_SETTLE_MIN_SECONDS
  };
})();
