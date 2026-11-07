// 修仙挂机 - 状态管理、存档与离线收益结算
(function () {
  const SAVE_KEY = 'xiuxian_idle_save_v1';
  const SAVE_BACKUP_KEY = 'xiuxian_idle_save_v1_bak';
  const MAX_SQUAD_SIZE = 6;

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
      flags: { ling: false, di: false, weapon: false, offlineCap: false },
      login: { last: '', streak: 0 },
      dayTaps: { date: '', count: 0 },
      titles: { owned: ['churu'], worn: 'churu', seen: ['churu'] },
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
    state.tree.peaches = (state.tree.peaches || 0) + peaches;
    state.lingyu = (state.lingyu || 0) + lingyu;
    return { peaches, lingyu };
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
      const qkHero = cfgHeroes.find((h) => h && h.id === 'qingkui');
      unlockedHeroes = [...unlockedHeroes];
      if (qkHero && !qkHero.locked && !lockedSet.has('qingkui') && !unlockedHeroes.includes('qingkui')) {
        unlockedHeroes.push('qingkui');
      }
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
      createdAt: saved.createdAt || saved.lastSaveTime || def.createdAt,
      playTimeMs: saved.playTimeMs || 0,
      lifetimeQi: saved.lifetimeQi || 0,
      failBreakthroughs: saved.failBreakthroughs || 0,
      peachesPicked: saved.peachesPicked || 0,
      decomposed: saved.decomposed || 0
    };
    if (Array.isArray(unlockedHeroes)) {
      merged.unlockedHeroes = unlockedHeroes;
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

  function loadGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) {
        state = createDefaultState();
        return { isNew: true, offlineReport: null };
      }
      let parsed = JSON.parse(raw);
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
      state = mergeSave(def, parsed);

      const now = Date.now();
      const savedTime = Number(parsed.lastSaveTime) || now;
      const elapsedSec = Math.floor((now - savedTime) / 1000);
      let offlineReport = null;

      if (elapsedSec >= 3) {
        const cappedSec = Math.min(elapsedSec, getOfflineCapSeconds());
        const qiGain = getQiPerSec() * cappedSec;
        const stoneGain = getStonePerSec() * cappedSec;
        state.qi += qiGain;
        state.lifetimeQi = (state.lifetimeQi || 0) + qiGain;
        state.playTimeMs = (state.playTimeMs || 0) + cappedSec * 1000;
        if (elapsedSec > getOfflineCapSeconds()) state.flags.offlineCap = true;
        state.stones += stoneGain;
        const windowEnd = savedTime + cappedSec * 1000;
        let treeDone = false;
        if (state.tree.upEnd && state.tree.upEnd > windowEnd) {
          state.tree.upEnd += now - windowEnd;
        } else {
          treeDone = finishTreeUpgrade(windowEnd);
        }
        const peachGain = applyPeachRegen(savedTime, windowEnd);
        const idle = applyIdleStageRewards(cappedSec);
        state.tree.regenAt = now;
        if (state.stage) state.stage.idleAt = now;
        state.lastSaveTime = now;
        offlineReport = {
          rawSeconds: elapsedSec,
          effectiveSeconds: cappedSec,
          capped: elapsedSec > getOfflineCapSeconds(),
          qiGain,
          stoneGain,
          peachGain: peachGain + idle.peaches,
          lingyuGain: idle.lingyu,
          treeDone
        };
      } else {
        finishTreeUpgrade(now);
        applyPeachRegen(state.tree.regenAt || now, now);
      }
      grantPeachGift();

      return { isNew: false, offlineReport };
    } catch (err) {
      console.warn('读取存档异常，初始化新存档:', err);
      state = createDefaultState();
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
    fresh.flags = { ...(state.flags || {}) };
    fresh.login = { ...(state.login || {}) };
    fresh.dayTaps = { ...(state.dayTaps || {}) };
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
    applyIdleStageRewards
  };
})();
