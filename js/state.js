// 修仙挂机 - 状态管理、存档与离线收益结算
(function () {
  const SAVE_KEY = 'xiuxian_idle_save_v1';

  function createDefaultState() {
    const gongfaLevels = {};
    window.GameConfig.GONGFA_LIST.forEach((g, idx) => {
      gongfaLevels[g.id] = idx === 0 ? 1 : 0;
    });

    const dongfuLevels = {};
    window.GameConfig.DONGFU_LIST.forEach((d, idx) => {
      dongfuLevels[d.id] = idx === 0 ? 1 : 0;
    });

    const talentLevels = {};
    window.GameConfig.DAOGUO_TALENTS.forEach((t) => {
      talentLevels[t.id] = 0;
    });

    return {
      version: 1,
      realmIndex: 0, // 0 = 练气一层
      qi: 0,
      stones: 25,
      pityBonus: 0, // 当前小境界渡劫失败累积的额外成功率
      gongfa: gongfaLevels,
      dongfu: dongfuLevels,
      reincarnationCount: 0,
      daoGuo: 0, // 可用道果点
      totalDaoGuo: 0, // 历史累计获得道果点（提供永久基础倍率）
      talents: talentLevels,
      totalClicks: 0,
      lastSaveTime: Date.now()
    };
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
    return rawQi * stage.multiplier * getDaoGuoQiMultiplier();
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
    return rawStone * Math.pow(stage.multiplier, 0.65) * getDaoGuoStoneMultiplier();
  }

  function getTapQiGain() {
    // 每次点击获得相当于 3 + 0.35秒打坐灵气
    const perSec = getQiPerSec();
    return Math.max(2, Math.round((3 + perSec * 0.35) * 10) / 10);
  }

  function getGongfaCost(item) {
    const lv = (state.gongfa && state.gongfa[item.id]) || 0;
    return Math.floor(item.baseCost * Math.pow(item.costScale, lv));
  }

  function getDongfuCost(item) {
    const lv = (state.dongfu && state.dongfu[item.id]) || 0;
    return Math.floor(item.baseCost * Math.pow(item.costScale, lv));
  }

  function getTalentCost(talent) {
    const lv = (state.talents && state.talents[talent.id]) || 0;
    return Math.max(1, Math.floor(talent.baseCost * Math.pow(talent.costScale, lv)));
  }

  function getBreakthroughSuccessRate() {
    const stage = getCurrentStage();
    const talentLv = (state.talents && state.talents.pomo_daoxin) || 0;
    const talentBonus = Math.min(0.30, talentLv * 0.03);
    const total = stage.successRate + (state.pityBonus || 0) + talentBonus;
    return Math.min(0.98, Number(total.toFixed(3)));
  }

  function getPendingDaoGuo() {
    if (state.realmIndex < window.GameConfig.REINCARNATION_MIN_STAGE) {
      return 0;
    }
    // 元婴一层(index 27)基础可得 2 点道果，每高一小层增加，化神期大幅提升
    const stepsAbove = state.realmIndex - window.GameConfig.REINCARNATION_MIN_STAGE;
    const realmBonus = Math.floor(Math.pow(1.22, stepsAbove) * 2);
    const qiBonus = Math.floor(Math.log10(Math.max(1, state.qi / 1e6)));
    return Math.max(2, realmBonus + Math.max(0, qiBonus));
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
      const parsed = JSON.parse(raw);
      const def = createDefaultState();
      state = {
        ...def,
        ...parsed,
        gongfa: { ...def.gongfa, ...(parsed.gongfa || {}) },
        dongfu: { ...def.dongfu, ...(parsed.dongfu || {}) },
        talents: { ...def.talents, ...(parsed.talents || {}) }
      };

      // 计算离线收益
      const now = Date.now();
      const savedTime = Number(parsed.lastSaveTime) || now;
      const elapsedSec = Math.floor((now - savedTime) / 1000);
      let offlineReport = null;

      if (elapsedSec >= 3) {
        const cappedSec = Math.min(elapsedSec, window.GameConfig.OFFLINE_CAP_SECONDS);
        const qiGain = getQiPerSec() * cappedSec;
        const stoneGain = getStonePerSec() * cappedSec;
        state.qi += qiGain;
        state.stones += stoneGain;
        state.lastSaveTime = now;
        offlineReport = {
          rawSeconds: elapsedSec,
          effectiveSeconds: cappedSec,
          capped: elapsedSec > window.GameConfig.OFFLINE_CAP_SECONDS,
          qiGain,
          stoneGain
        };
      }

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

    const fresh = createDefaultState();
    fresh.reincarnationCount = keepReincarnations;
    fresh.daoGuo = keepDaoGuo;
    fresh.totalDaoGuo = keepTotalDaoGuo;
    fresh.talents = keepTalents;

    state = fresh;
    saveGame();
    return { ok: true, gain };
  }

  window.GameState = {
    get state() {
      return state;
    },
    getCurrentStage,
    getDaoGuoQiMultiplier,
    getDaoGuoStoneMultiplier,
    getQiPerSec,
    getStonePerSec,
    getTapQiGain,
    getGongfaCost,
    getDongfuCost,
    getTalentCost,
    getBreakthroughSuccessRate,
    getPendingDaoGuo,
    saveGame,
    loadGame,
    resetGame,
    performReincarnation
  };
})();
