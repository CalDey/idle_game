// 修仙挂机 - 核心配置与数值表
(function () {
  const SUB_LEVEL_NAMES = ['一层', '二层', '三层', '四层', '五层', '六层', '七层', '八层', '九层'];

  const MAJOR_REALMS = [
    {
      id: 'lianqi',
      name: '练气',
      baseQi: 50,
      stepGrowth: 1.42,
      baseSuccessRate: 0.92,
      rateDecayPerSub: 0.015,
      tribulationSuccessRate: 0.75,
      failureQiLossRatio: 0.25,
      realmMultiplier: 1.0,
      desc: '引天地灵气入体，洗涤凡胎，初窥仙门径。'
    },
    {
      id: 'zhuji',
      name: '筑基',
      baseQi: 1800,
      stepGrowth: 1.48,
      baseSuccessRate: 0.85,
      rateDecayPerSub: 0.018,
      tribulationSuccessRate: 0.65,
      failureQiLossRatio: 0.30,
      realmMultiplier: 2.5,
      desc: '铸就大道之基，气海凝实，寿元大增。'
    },
    {
      id: 'jindan',
      name: '金丹',
      baseQi: 85000,
      stepGrowth: 1.52,
      baseSuccessRate: 0.78,
      rateDecayPerSub: 0.02,
      tribulationSuccessRate: 0.55,
      failureQiLossRatio: 0.32,
      realmMultiplier: 7.0,
      desc: '百脉灵气凝结成丹，金丹一转，脱胎换骨。'
    },
    {
      id: 'yuanying',
      name: '元婴',
      baseQi: 5200000,
      stepGrowth: 1.56,
      baseSuccessRate: 0.70,
      rateDecayPerSub: 0.02,
      tribulationSuccessRate: 0.48,
      failureQiLossRatio: 0.35,
      realmMultiplier: 22.0,
      desc: '碎丹成婴，神魂初成，已具备轮回转世之资格。'
    },
    {
      id: 'huashen',
      name: '化神',
      baseQi: 420000000,
      stepGrowth: 1.60,
      baseSuccessRate: 0.62,
      rateDecayPerSub: 0.022,
      tribulationSuccessRate: 0.40,
      failureQiLossRatio: 0.35,
      realmMultiplier: 75.0,
      desc: '元神化道，执掌一方天地法则，举手投足皆是天威。'
    }
  ];

  // Build flat list of 45 realm stages (练气一层 .. 化神九层)
  const REALM_STAGES = [];
  MAJOR_REALMS.forEach((major, majorIdx) => {
    SUB_LEVEL_NAMES.forEach((subName, subIdx) => {
      const isMajorTribulation = subIdx === 8 && majorIdx < MAJOR_REALMS.length - 1;
      const isMaxStage = majorIdx === MAJOR_REALMS.length - 1 && subIdx === 8;
      const reqQi = Math.round(major.baseQi * Math.pow(major.stepGrowth, subIdx));
      const baseRate = isMajorTribulation
        ? major.tribulationSuccessRate
        : Math.max(0.35, major.baseSuccessRate - subIdx * major.rateDecayPerSub);

      // Sub-level multiplier increases smoothly within each major realm
      const stageMultiplier = major.realmMultiplier * (1 + subIdx * 0.15);

      REALM_STAGES.push({
        index: REALM_STAGES.length,
        majorIndex: majorIdx,
        subIndex: subIdx,
        majorId: major.id,
        majorName: major.name,
        subName: subName,
        fullName: `${major.name}${subName}`,
        reqQi: reqQi,
        successRate: Number(baseRate.toFixed(3)),
        failureLossRatio: major.failureQiLossRatio,
        isMajorTribulation: isMajorTribulation,
        isMaxStage: isMaxStage,
        multiplier: Number(stageMultiplier.toFixed(2)),
        desc: major.desc
      });
    });
  });

  // 功法升级配置 (消耗灵石 -> 提升灵气/秒 & 点击吐纳灵气)
  const GONGFA_LIST = [
    {
      id: 'yinqijue',
      name: '《引气入体诀》',
      desc: '基础吐纳心法，引导周天灵气汇聚丹田。',
      baseCost: 10,
      costScale: 1.22,
      baseQiPerSec: 2,
      unlockRealmIndex: 0
    },
    {
      id: 'taiqingjue',
      name: '《太清养气篇》',
      desc: '道门正宗温养法门，生生不息，绵密悠长。',
      baseCost: 120,
      costScale: 1.25,
      baseQiPerSec: 18,
      unlockRealmIndex: 3 // 练气四层
    },
    {
      id: 'zhuji_zhenjie',
      name: '《百脉筑基真解》',
      desc: '贯通奇经八脉，周天运转效率倍增。',
      baseCost: 1600,
      costScale: 1.28,
      baseQiPerSec: 160,
      unlockRealmIndex: 9 // 筑基一层
    },
    {
      id: 'jiuzhuan_jindan',
      name: '《九转金丹大道》',
      desc: '以天地为烘炉，锤炼不朽金丹，鲸吞万里灵气。',
      baseCost: 28000,
      costScale: 1.30,
      baseQiPerSec: 2200,
      unlockRealmIndex: 18 // 金丹一层
    },
    {
      id: 'zixiao_yuanying',
      name: '《紫霄凝婴神章》',
      desc: '紫气东来，元婴吐纳之间引动星辰之力。',
      baseCost: 550000,
      costScale: 1.32,
      baseQiPerSec: 36000,
      unlockRealmIndex: 27 // 元婴一层
    },
    {
      id: 'taixu_huashen',
      name: '《太虚化神天书》',
      desc: '神游太虚，一念生万法，呼吸与天地同频。',
      baseCost: 12000000,
      costScale: 1.35,
      baseQiPerSec: 680000,
      unlockRealmIndex: 36 // 化神一层
    }
  ];

  // 洞府升级配置 (消耗灵石 -> 提升灵石/秒)
  const DONGFU_LIST = [
    {
      id: 'julingshi',
      name: '微型聚灵石阵',
      desc: '在洞府布下基础阵纹，自动凝结天地灵石。',
      baseCost: 12,
      costScale: 1.24,
      baseStonePerSec: 1,
      unlockRealmIndex: 0
    },
    {
      id: 'lingquan',
      name: '洞天灵泉眼',
      desc: '引地脉灵泉浇灌洞府，日夜孕育下品灵石。',
      baseCost: 150,
      costScale: 1.26,
      baseStonePerSec: 10,
      unlockRealmIndex: 2 // 练气三层
    },
    {
      id: 'yaoyuan',
      name: '百草灵药园',
      desc: '栽种千年灵草，与坊市互通有无，灵石源源不断。',
      baseCost: 2200,
      costScale: 1.28,
      baseStonePerSec: 110,
      unlockRealmIndex: 9 // 筑基一层
    },
    {
      id: 'lingmai',
      name: '地底极品灵脉',
      desc: '拘禁一条地底灵脉入驻洞府，灵石喷涌而出。',
      baseCost: 38000,
      costScale: 1.30,
      baseStonePerSec: 1450,
      unlockRealmIndex: 18 // 金丹一层
    },
    {
      id: 'dongtian_fudi',
      name: '三十六洞天福地',
      desc: '开辟一方随身小世界，自生灵矿，万古不枯。',
      baseCost: 750000,
      costScale: 1.33,
      baseStonePerSec: 24000,
      unlockRealmIndex: 27 // 元婴一层
    },
    {
      id: 'xiantian_zuqiao',
      name: '先天混沌祖脉',
      desc: '夺天地造化，演混沌灵源，顷刻间灵石成山。',
      baseCost: 16000000,
      costScale: 1.36,
      baseStonePerSec: 450000,
      unlockRealmIndex: 36 // 化神一层
    }
  ];

  // 轮回转世：道果秘术升级 (消耗道果点，永久保留)
  const DAOGUO_TALENTS = [
    {
      id: 'xiantian_daoti',
      name: '先天道体',
      desc: '每级额外提升 +50% 灵气获取速度',
      baseCost: 1,
      costScale: 1.6,
      bonusPerLevel: 0.5
    },
    {
      id: 'qiyun_jiashang',
      name: '天道眷顾',
      desc: '每级额外提升 +50% 灵石产出速度',
      baseCost: 1,
      costScale: 1.6,
      bonusPerLevel: 0.5
    },
    {
      id: 'pomo_daoxin',
      name: '不灭道心',
      desc: '每级永久提升 +3% 突破/渡劫成功率（最高+30%）',
      baseCost: 2,
      costScale: 1.8,
      bonusPerLevel: 0.03,
      maxLevel: 10
    }
  ];

  // 中文大数格式化
  function formatNumber(num, decimals = 1) {
    if (num === null || num === undefined || Number.isNaN(num)) return '0';
    const abs = Math.abs(num);
    if (abs < 10000) {
      return Number.isInteger(num) ? String(num) : num.toFixed(decimals).replace(/\.0+$/, '');
    }
    const units = [
      { value: 1e16, symbol: '兆' },
      { value: 1e12, symbol: '万亿' },
      { value: 1e8, symbol: '亿' },
      { value: 1e4, symbol: '万' }
    ];
    for (let i = 0; i < units.length; i++) {
      if (abs >= units[i].value) {
        return (num / units[i].value).toFixed(2).replace(/\.?0+$/, '') + units[i].symbol;
      }
    }
    return Math.floor(num).toString();
  }

  function formatDuration(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    const parts = [];
    if (hrs > 0) parts.push(`${hrs}小时`);
    if (mins > 0) parts.push(`${mins}分`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}秒`);
    return parts.join('');
  }

  window.GameConfig = {
    SUB_LEVEL_NAMES,
    MAJOR_REALMS,
    REALM_STAGES,
    GONGFA_LIST,
    DONGFU_LIST,
    DAOGUO_TALENTS,
    OFFLINE_CAP_SECONDS: 12 * 3600, // 12小时上限
    REINCARNATION_MIN_STAGE: 27, // 元婴一层 (index 27)
    formatNumber,
    formatDuration
  };
})();

