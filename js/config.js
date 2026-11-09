// 修仙挂机 - 核心配置与数值表
(function () {
  const SUB_LEVEL_NAMES = ['初', '中', '后'];

  const MAJOR_REALMS = [
    {
      id: 'banxue',
      name: '搬血',
      baseQi: 50,
      stepGrowth: 1.35,
      baseSuccessRate: 0.92,
      rateDecayPerSub: 0.02,
      tribulationSuccessRate: 0.75,
      failureQiLossRatio: 0.25,
      realmMultiplier: 1.0,
      desc: '精血如雷，骨文入血催神曦淬肉；败则血枯骨裂。'
    },
    {
      id: 'dongtian',
      name: '洞天',
      baseQi: 260,
      stepGrowth: 1.36,
      baseSuccessRate: 0.89,
      rateDecayPerSub: 0.02,
      tribulationSuccessRate: 0.72,
      failureQiLossRatio: 0.26,
      realmMultiplier: 1.35,
      desc: '夺天地造化开洞天吞神精；败则洞天崩、本源倒灌。'
    },
    {
      id: 'hualing',
      name: '化灵',
      baseQi: 1500,
      stepGrowth: 1.38,
      baseSuccessRate: 0.86,
      rateDecayPerSub: 0.022,
      tribulationSuccessRate: 0.68,
      failureQiLossRatio: 0.27,
      realmMultiplier: 1.7,
      desc: '肉身、精神与洞天三重成灵；半途易成残灵。'
    },
    {
      id: 'mingwen',
      name: '铭纹',
      baseQi: 8500,
      stepGrowth: 1.40,
      baseSuccessRate: 0.83,
      rateDecayPerSub: 0.024,
      tribulationSuccessRate: 0.65,
      failureQiLossRatio: 0.28,
      realmMultiplier: 2.3,
      desc: '体内自铭杀符，不再只抄凶兽；错纹噬主。'
    },
    {
      id: 'liezhen',
      name: '列阵',
      baseQi: 48000,
      stepGrowth: 1.41,
      baseSuccessRate: 0.80,
      rateDecayPerSub: 0.025,
      tribulationSuccessRate: 0.62,
      failureQiLossRatio: 0.29,
      realmMultiplier: 3.1,
      desc: '身内铺杀阵推演杀伐；阵反则己身为祭。'
    },
    {
      id: 'zunzhe',
      name: '尊者',
      baseQi: 260000,
      stepGrowth: 1.43,
      baseSuccessRate: 0.78,
      rateDecayPerSub: 0.026,
      tribulationSuccessRate: 0.58,
      failureQiLossRatio: 0.30,
      realmMultiplier: 4.2,
      desc: '凡人称尊；成尊必染血债，方圆可寸草不生。'
    },
    {
      id: 'shenhuo',
      name: '神火',
      baseQi: 1400000,
      stepGrowth: 1.44,
      baseSuccessRate: 0.75,
      rateDecayPerSub: 0.028,
      tribulationSuccessRate: 0.55,
      failureQiLossRatio: 0.31,
      realmMultiplier: 6.0,
      desc: '燃神火、种道种；晚年火可熄，借火易被反吞。'
    },
    {
      id: 'zhenyi',
      name: '真一',
      baseQi: 7500000,
      stepGrowth: 1.46,
      baseSuccessRate: 0.72,
      rateDecayPerSub: 0.03,
      tribulationSuccessRate: 0.52,
      failureQiLossRatio: 0.32,
      realmMultiplier: 8.5,
      desc: '真神长燃；道种不稳则神形俱裂。'
    },
    {
      id: 'shengji',
      name: '圣祭',
      baseQi: 40000000,
      stepGrowth: 1.47,
      baseSuccessRate: 0.69,
      rateDecayPerSub: 0.03,
      tribulationSuccessRate: 0.48,
      failureQiLossRatio: 0.33,
      realmMultiplier: 11.8,
      desc: '危境过渡，可渡神王劫；可跳过则顺，败则为祭。'
    },
    {
      id: 'tianshen',
      name: '天神',
      baseQi: 220000000,
      stepGrowth: 1.49,
      baseSuccessRate: 0.66,
      rateDecayPerSub: 0.032,
      tribulationSuccessRate: 0.45,
      failureQiLossRatio: 0.34,
      realmMultiplier: 17.5,
      desc: '断肢可再生，一滴血崩山；威压镇下境。'
    },
    {
      id: 'xudao',
      name: '虚道',
      baseQi: 1200000000,
      stepGrowth: 1.50,
      baseSuccessRate: 0.63,
      rateDecayPerSub: 0.034,
      tribulationSuccessRate: 0.42,
      failureQiLossRatio: 0.35,
      realmMultiplier: 25.5,
      desc: '以道种触大道；易化道失我。'
    },
    {
      id: 'zhanwo',
      name: '斩我',
      baseQi: 6500000000,
      stepGrowth: 1.52,
      baseSuccessRate: 0.60,
      rateDecayPerSub: 0.036,
      tribulationSuccessRate: 0.39,
      failureQiLossRatio: 0.36,
      realmMultiplier: 37.2,
      desc: '斩我明道；斩偏则道消人灭。'
    },
    {
      id: 'dunyi',
      name: '遁一',
      baseQi: 36000000000,
      stepGrowth: 1.54,
      baseSuccessRate: 0.58,
      rateDecayPerSub: 0.038,
      tribulationSuccessRate: 0.36,
      failureQiLossRatio: 0.37,
      realmMultiplier: 65.0,
      desc: '一方霸主，统领杀伐。'
    },
    {
      id: 'zhizun',
      name: '至尊',
      baseQi: 200000000000,
      stepGrowth: 1.55,
      baseSuccessRate: 0.55,
      rateDecayPerSub: 0.04,
      tribulationSuccessRate: 0.35,
      failureQiLossRatio: 0.38,
      realmMultiplier: 120.0,
      desc: '人道绝巅；威压压境，长生靠神源非善果。（当前终点）'
    }
  ];

  // Build flat list of 42 realm stages (搬血初 .. 至尊后)
  const REALM_STAGES = [];
  MAJOR_REALMS.forEach((major, majorIdx) => {
    SUB_LEVEL_NAMES.forEach((subName, subIdx) => {
      const isMajorTribulation = subIdx === 2 && majorIdx < MAJOR_REALMS.length - 1;
      const isMaxStage = majorIdx === MAJOR_REALMS.length - 1 && subIdx === 2;
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

  // 洞天之后逐步抬高灵气需求，避免十几分钟通关至至尊后。倍数由 tools/sim.js 校准。
  const LATE_REALM_QI_MULT = [1, 4, 6, 8, 11, 14, 18, 22, 26, 30, 35, 40, 48, 60];
  REALM_STAGES.forEach((stage) => {
    const mult = LATE_REALM_QI_MULT[stage.majorIndex] || 1;
    if (mult !== 1) stage.reqQi = Math.round(stage.reqQi * mult);
  });

  const EQUIP_SLOTS = [
    { id: 'weapon', name: '武器', itemName: '青锋飞剑', stat: 'atk', base: 8, growth: 1.06 },
    { id: 'charm', name: '护符', itemName: '温玉佩', stat: 'atk', base: 5, growth: 1.06 },
    { id: 'crown', name: '头冠', itemName: '白玉簪', stat: 'hp', base: 70, growth: 1.06 },
    { id: 'belt', name: '腰带', itemName: '流云丝绦', stat: 'hp', base: 50, growth: 1.06 },
    { id: 'robe', name: '法袍', itemName: '搬血短衫', stat: 'def', base: 5, growth: 1.06 },
    { id: 'boots', name: '靴', itemName: '踏云履', stat: 'spd', base: 4, growth: 1.02 }
  ];

  const QUALITIES = [
    { id: 'fan', name: '凡品', color: '#e7e2d6', mult: 1.0, subs: 0, jade: 1 },
    { id: 'ling', name: '灵品', color: '#7ddea0', mult: 1.3, subs: 1, jade: 3 },
    { id: 'xuan', name: '玄品', color: '#67c6e3', mult: 1.7, subs: 1, jade: 8 },
    { id: 'di', name: '地品', color: '#c084fc', mult: 2.2, subs: 2, jade: 20 },
    { id: 'tian', name: '天品', color: '#f5c76a', mult: 2.9, subs: 3, jade: 50 },
    { id: 'xian', name: '仙品', color: '#f07167', mult: 3.8, subs: 4, jade: 120 }
  ];

  // 树等级锚点上的品质权重（凡灵玄地天仙），中间等级线性插值。
  const TREE_WEIGHT_ANCHORS = [
    { lv: 1, w: [70, 25, 5, 0, 0, 0] },
    { lv: 3, w: [60, 30, 9, 1, 0, 0] },
    { lv: 5, w: [48, 34, 14, 4, 0, 0] },
    { lv: 8, w: [35, 35, 20, 9, 1, 0] },
    { lv: 12, w: [22, 33, 26, 15, 4, 0] },
    { lv: 16, w: [12, 28, 30, 21, 8, 1] },
    { lv: 20, w: [5, 22, 32, 26, 13, 2] },
    { lv: 25, w: [0, 15, 30, 32, 19, 4] }
  ];

  // 仙桃树品质阶段（外观随等级变化）
  const TREE_STAGES = [
    { q: 0, minLv: 1, name: '凡品桃树' },
    { q: 1, minLv: 5, name: '灵品桃树' },
    { q: 2, minLv: 9, name: '玄品桃树' },
    { q: 3, minLv: 13, name: '地品仙桃树' },
    { q: 4, minLv: 17, name: '天品仙桃树' },
    { q: 5, minLv: 21, name: '仙品蟠桃树' }
  ];

  function treeStage(lv) {
    const level = lv || 1;
    let cur = TREE_STAGES[0];
    for (let i = 0; i < TREE_STAGES.length; i++) {
      if (TREE_STAGES[i].minLv <= level) {
        cur = TREE_STAGES[i];
      }
    }
    return cur;
  }

  const SUBSTATS = [
    { key: 'atkPct', name: '攻击', min: 0.02, max: 0.04, pct: true },
    { key: 'hpPct', name: '生命', min: 0.02, max: 0.04, pct: true },
    { key: 'defPct', name: '防御', min: 0.03, max: 0.05, pct: true },
    { key: 'crit', name: '暴击率', min: 0.01, max: 0.02, pct: true },
    { key: 'critDmg', name: '暴击伤害', min: 0.04, max: 0.08, pct: true },
    { key: 'spd', name: '速度', min: 2, max: 5, pct: false },
    { key: 'qi', name: '吐纳', min: 0.02, max: 0.05, pct: true },
    { key: 'stone', name: '聚财', min: 0.02, max: 0.05, pct: true }
  ];

  // 大境界渡劫门槛。P2 打开 ENABLE_STAGE_GATES 后才会拦住突破。
  const TRIBULATION_GATES = {
    8: { chapter: 3, stage: 30, boss: '黑风寨主' }, // 化灵后
    17: { chapter: 9, stage: 90, boss: '青冥蛟王' }, // 尊者后
    26: { chapter: 15, stage: 150, boss: '赤炎魔君' }, // 圣祭后
    35: { chapter: 21, stage: 210, boss: '九幽鬼母' } // 斩我后
  };

  const BATTLE = {
    GROWTH: 1.0223,
    BASE_CP: 600,
    BOSS_MULT: 1.5,
    SPLIT: { atk: 0.04, hp: 0.40, def: 0.0165 },
    MAX_ROUNDS: 24,
    BOARD_COLS: 6,
    BOARD_ROWS: 8,
    RAGE_MAX: 100,
    RAGE_ON_ATK: 22,
    RAGE_ON_HIT: 14,
    ULT_MAIN_MULT: 1.6,
    ULT_SPLASH_MULT: 0.5,
    PLAYER_DMG_FACTOR: 0.92,
    PLAYER_DMG_FACTOR_MOB3: 0.965,
    PLAYER_DMG_FACTOR_MOB45: 0.918,
    PLAYER_DMG_FACTOR_BOSS: 0.942,
    BOSS_ULT_MAIN_MULT: 1.2,
    BOSS_ULT_SPLASH_MULT: 0.45,
    PACE_NORMAL: 1.95,
    PACE_BOSS: 1.15,
    DISPLAY_MULT: 10,
    UNLOCK_REALM: 2, // 搬血后
    CRUSH_RATIO: 3,
    REGIONS: [
      {
        name: '凡尘野地',
        chapters: [1, 5],
        mobs: [
          { name: '山贼喽啰', img: 'placeholder' },
          { name: '野狼', img: 'placeholder' },
          { name: '游荡僵尸', img: 'placeholder' }
        ]
      },
      {
        name: '青冥山脉',
        chapters: [6, 10],
        mobs: [
          { name: '青蛇妖', img: 'placeholder' },
          { name: '树妖', img: 'placeholder' },
          { name: '雷鹰', img: 'placeholder' }
        ]
      },
      {
        name: '赤炎荒原',
        chapters: [11, 15],
        mobs: [
          { name: '火灵', img: 'placeholder' },
          { name: '熔岩蜥', img: 'placeholder' },
          { name: '魔修散人', img: 'placeholder' }
        ]
      },
      {
        name: '玄冰海',
        chapters: [16, 20],
        mobs: [
          { name: '冰魄蛛', img: 'placeholder' },
          { name: '寒水妖', img: 'placeholder' },
          { name: '雪尸', img: 'placeholder' }
        ]
      },
      {
        name: '九幽魔域',
        chapters: [21, 25],
        mobs: [
          { name: '怨魂', img: 'placeholder' },
          { name: '骨魔', img: 'placeholder' },
          { name: '血傀', img: 'placeholder' }
        ]
      },
      {
        name: '天外天',
        chapters: [26, 30],
        mobs: [
          { name: '星骸', img: 'placeholder' },
          { name: '天魔', img: 'placeholder' },
          { name: '虚空剑影', img: 'placeholder' }
        ]
      }
    ],
    BOSSES: [
      { name: '山魈', img: 'placeholder' },
      { name: '赤眼狼王', img: 'placeholder' },
      { name: '黑风寨主', img: 'placeholder' },
      { name: '尸傀道人', img: 'placeholder' },
      { name: '血蝠老祖', img: 'placeholder' },
      { name: '青鳞蟒', img: 'placeholder' },
      { name: '枯木妖婆', img: 'placeholder' },
      { name: '雷翼鹰王', img: 'placeholder' },
      { name: '青冥蛟王', img: 'placeholder' },
      { name: '白额山君', img: 'placeholder' },
      { name: '火鸦王', img: 'placeholder' },
      { name: '熔岩巨傀', img: 'placeholder' },
      { name: '焚骨老魔', img: 'placeholder' },
      { name: '炎魔将', img: 'placeholder' },
      { name: '赤炎魔君', img: 'placeholder' },
      { name: '冰魄蛛后', img: 'placeholder' },
      { name: '寒潮巨鲸', img: 'placeholder' },
      { name: '雪发剑尸', img: 'placeholder' },
      { name: '玄冰龙女', img: 'placeholder' },
      { name: '北溟鲲影', img: 'placeholder' },
      { name: '九幽鬼母', img: 'placeholder' },
      { name: '噬魂魔将', img: 'placeholder' },
      { name: '血海修罗', img: 'placeholder' },
      { name: '白骨魔尊', img: 'placeholder' },
      { name: '幽冥判官', img: 'placeholder' },
      { name: '天外剑魔', img: 'placeholder' },
      { name: '星陨神将', img: 'placeholder' },
      { name: '太虚古神', img: 'placeholder' },
      { name: '混沌魔祖', img: 'placeholder' },
      { name: '天道化身', img: 'placeholder' }
    ]
  };

  const PEACH = {
    INTERVAL_MS: 3 * 60 * 1000,
    BASE_CAP: 50,
    CAP_PER_LEVEL: 2,
    GIFT: 30,
    UNLOCK_REALM: 1 // 搬血中
  };

  function treeUpgradeCost(level) {
    return Math.round(30 * Math.pow(1.38, level - 1));
  }

  function treeUpgradeMs(level) {
    return Math.min(8 * 3600 * 1000, 3 * 60 * 1000 * Math.pow(1.4, level - 1));
  }

  function peachCap(treeLevel) {
    return PEACH.BASE_CAP + PEACH.CAP_PER_LEVEL * treeLevel;
  }

  // 功法升级配置 (消耗灵石 -> 提升灵气/秒 & 点击吐纳灵气)
  const GONGFA_LIST = [
    {
      id: 'yinqijue',
      name: '《搬血淬体诀》',
      desc: '催动滚滚精血如雷鸣，引骨文神曦淬炼凡躯，稍有不慎便血枯骨裂。',
      baseCost: 10,
      costScale: 1.22,
      baseQiPerSec: 2,
      unlockRealmIndex: 0 // 搬血初
    },
    {
      id: 'taiqingjue',
      name: '《洞天纳神篇》',
      desc: '夺天地造化强开洞天，鲸吞十方神精，反噬则洞天崩塌、本源倒灌。',
      baseCost: 120,
      costScale: 1.25,
      baseQiPerSec: 18,
      unlockRealmIndex: 3 // 洞天初
    },
    {
      id: 'zhuji_zhenjie',
      name: '《化灵三元真解》',
      desc: '肉身、精神与洞天三重化生真灵，周天运转倍增，半途易成残灵。',
      baseCost: 1600,
      costScale: 1.28,
      baseQiPerSec: 160,
      unlockRealmIndex: 6 // 化灵初
    },
    {
      id: 'jiuzhuan_jindan',
      name: '《尊者血祭大道》',
      desc: '以万灵血债铸就凡人尊位，鲸吞万里灵机，所过之处寸草不生。',
      baseCost: 28000,
      costScale: 1.30,
      baseQiPerSec: 2200,
      unlockRealmIndex: 15 // 尊者初
    },
    {
      id: 'zixiao_yuanying',
      name: '《天神威压神章》',
      desc: '断肢再生、一滴血可崩山，神威镇压下境，呼吸间引动天地本源。',
      baseCost: 550000,
      costScale: 1.32,
      baseQiPerSec: 36000,
      unlockRealmIndex: 27 // 天神初
    },
    {
      id: 'taixu_huashen',
      name: '《至尊人道天书》',
      desc: '立身人道绝巅，统领诸天杀伐，燃神源以镇万古。',
      baseCost: 12000000,
      costScale: 1.35,
      baseQiPerSec: 680000,
      unlockRealmIndex: 36 // 遁一初
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
      unlockRealmIndex: 0 // 搬血初
    },
    {
      id: 'lingquan',
      name: '洞天灵泉眼',
      desc: '引地脉灵泉浇灌洞府，日夜孕育下品灵石。',
      baseCost: 150,
      costScale: 1.26,
      baseStonePerSec: 10,
      unlockRealmIndex: 2 // 搬血后
    },
    {
      id: 'yaoyuan',
      name: '百草灵药园',
      desc: '栽种千年灵草，与坊市互通有无，灵石源源不断。',
      baseCost: 2200,
      costScale: 1.28,
      baseStonePerSec: 110,
      unlockRealmIndex: 6 // 化灵初
    },
    {
      id: 'lingmai',
      name: '地底极品灵脉',
      desc: '拘禁一条地底灵脉入驻洞府，灵石喷涌而出。',
      baseCost: 38000,
      costScale: 1.30,
      baseStonePerSec: 1450,
      unlockRealmIndex: 15 // 尊者初
    },
    {
      id: 'dongtian_fudi',
      name: '三十六洞天福地',
      desc: '开辟一方随身小世界，自生灵矿，万古不枯。',
      baseCost: 750000,
      costScale: 1.33,
      baseStonePerSec: 24000,
      unlockRealmIndex: 27 // 天神初
    },
    {
      id: 'xiantian_zuqiao',
      name: '先天混沌祖脉',
      desc: '夺天地造化，演混沌灵源，顷刻间灵石成山。',
      baseCost: 16000000,
      costScale: 1.36,
      baseStonePerSec: 450000,
      unlockRealmIndex: 36 // 遁一初
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
      if (abs >= 100) return String(Math.floor(abs) * Math.sign(num || 1));
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
        const scaled = num / units[i].value;
        const digits = Math.abs(scaled) >= 100 ? 0 : 1;
        return scaled.toFixed(digits).replace(/\.0$/, '') + units[i].symbol;
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

  // 洞府场景与品阶配置
  const HOME_TIERS = [
    { key: 'fan', q: 0, name: '凡品' },
    { key: 'xuan', q: 2, name: '玄品' },
    { key: 'xian', q: 5, name: '仙品' }
  ];

  const HOME_BUILDING_TIER_LV = [0, 25, 100];
  const HOME_BG_TIER_TOTAL = [0, 150, 600];

  const HOME_SCENE = {
    short: {
      julingshi: '聚灵',
      lingquan: '灵泉',
      yaoyuan: '药园',
      lingmai: '灵脉',
      dongtian_fudi: '洞天',
      xiantian_zuqiao: '祖窍'
    },
    island: {
      dongtian_fudi: [0.65, 12.72, 40.36, 31.61],
      xiantian_zuqiao: [41.67, 19.99, 28.65, 14.9],
      lingmai: [63.8, 36.34, 32.55, 18.9],
      yaoyuan: [23.44, 49.78, 31.9, 15.62],
      lingquan: [67.71, 63.59, 27.99, 14.53],
      julingshi: [9.11, 70.86, 31.25, 16.72]
    },
    badge: {
      dongtian_fudi: [21.7, 31],
      xiantian_zuqiao: [55.6, 29.5],
      lingmai: [80, 48.4],
      yaoyuan: [39.6, 58.6],
      lingquan: [81.6, 71.2],
      julingshi: [24.3, 80.4]
    },
    patch: {
      dongtian_fudi_xuan: [0, 6.613, 51.953, 38.808],
      dongtian_fudi_xian: [0, 6.613, 51.953, 38.844],
      xiantian_zuqiao_xuan: [41.536, 19.985, 29.622, 15.116],
      xiantian_zuqiao_xian: [39.844, 16.061, 36.263, 19.004],
      lingmai_xuan: [64.062, 36.41, 34.375, 24.855],
      lingmai_xian: [59.44, 35.792, 38.867, 20.203],
      yaoyuan_xuan: [23.698, 50.218, 32.812, 15.843],
      yaoyuan_xian: [18.49, 43.677, 45.052, 22.311],
      lingquan_xuan: [67.578, 58.067, 32.422, 21.584],
      lingquan_xian: [64.974, 60.392, 32.878, 21.039],
      julingshi_xuan: [8.464, 70.385, 32.617, 23.292],
      julingshi_xian: [0, 65.334, 51.302, 28.343]
    }
  };

  function homeBuildingTier(lv) {
    const level = lv || 0;
    if (level >= HOME_BUILDING_TIER_LV[2]) return 2;
    if (level >= HOME_BUILDING_TIER_LV[1]) return 1;
    return 0;
  }

  function homeBgTier(totalLv) {
    const total = totalLv || 0;
    if (total >= HOME_BG_TIER_TOTAL[2]) return 2;
    if (total >= HOME_BG_TIER_TOTAL[1]) return 1;
    return 0;
  }

  window.GameConfig = {
    SUB_LEVEL_NAMES,
    MAJOR_REALMS,
    REALM_STAGES,
    GONGFA_LIST,
    DONGFU_LIST,
    DAOGUO_TALENTS,
    HOME_TIERS,
    HOME_BUILDING_TIER_LV,
    HOME_BG_TIER_TOTAL,
    HOME_SCENE,
    homeBuildingTier,
    homeBgTier,
    OFFLINE_CAP_SECONDS: 12 * 3600, // 12小时上限
    REINCARNATION_MIN_STAGE: 27, // 天神初 (index 27)
    ENABLE_STAGE_GATES: true,
    LATE_REALM_QI_MULT,
    EQUIP_SLOTS,
    QUALITIES,
    TREE_WEIGHT_ANCHORS,
    TREE_STAGES,
    treeStage,
    SUBSTATS,
    TRIBULATION_GATES,
    BATTLE,
    PEACH,
    TREE_MAX_LEVEL: 25,
    treeUpgradeCost,
    treeUpgradeMs,
    peachCap,
    formatNumber,
    formatDuration,
    TITLE_COLLECTION_QI: 0.005,
    TITLES: [
      { id: 'churu', name: '初入仙途', cat: '入门', tier: 'intro', stat: 'qi', value: 0.01, bonus: '灵气 +1%', cond: '踏入仙途' },
      { id: 'yinqiruti', name: '引气入体', cat: '入门', tier: 'intro', stat: 'tap', value: 0.01, bonus: '点击灵气 +1%', cond: '达到搬血初' },
      { id: 'tunaxinren', name: '吐纳新人', cat: '入门', tier: 'intro', stat: 'tap', value: 0.02, bonus: '点击灵气 +2%', cond: '累计点击 100 次' },
      { id: 'jingzuo', name: '静坐童子', cat: '入门', tier: 'intro', stat: 'qi', value: 0.02, bonus: '灵气 +2%', cond: '累计修炼 1 小时' },
      { id: 'qinxiubuchuo', name: '勤修不辍', cat: '修炼', tier: 'cultivate', stat: 'break', value: 0.01, bonus: '突破成功率 +1%', cond: '连续 3 日登录' },
      { id: 'lingqixiaofu', name: '灵气小富', cat: '修炼', tier: 'cultivate', stat: 'qi', value: 0.02, bonus: '灵气 +2%', cond: '累计获得灵气 10 万' },
      { id: 'yiyerzhuji', name: '一夜洞天', cat: '修炼', tier: 'cultivate', stat: 'qi', value: 0.03, bonus: '灵气 +3%', cond: '开档 24 小时内突破至洞天初' },
      { id: 'lvbailvzhan', name: '屡败屡战', cat: '修炼', tier: 'cultivate', stat: 'break', value: 0.01, bonus: '突破成功率 +1%', cond: '突破失败累计 3 次' },
      { id: 'zhaotaoxiaoxian', name: '摘桃小仙', cat: '仙桃', tier: 'peach', stat: 'peach', value: 0.02, bonus: '仙桃回复 +2%', cond: '累计摘桃 50 次' },
      { id: 'chudelingbao', name: '初得灵宝', cat: '仙桃', tier: 'peach', stat: 'jade', value: 0.02, bonus: '分解灵玉 +2%', cond: '获得第一件灵品及以上' },
      { id: 'hongyundangtou', name: '鸿运当头', cat: '仙桃', tier: 'peach', stat: 'cp', value: 0.03, bonus: '战力 +3%', cond: '获得第一件地品及以上' },
      { id: 'suibaokuangren', name: '碎宝狂人', cat: '仙桃', tier: 'peach', stat: 'jade', value: 0.03, bonus: '分解灵玉 +3%', cond: '累计分解 100 件' },
      { id: 'jianxinchumeng', name: '剑心初萌', cat: '彩蛋', tier: 'egg', stat: 'cp', value: 0.02, bonus: '战力 +2%', cond: '第一次装备武器' },
      { id: 'biguanbuchu', name: '闭关不出', cat: '彩蛋', tier: 'egg', stat: 'qi', value: 0.03, bonus: '灵气 +3%', cond: '一次离线结算满 12 小时' },
      { id: 'diandaoshousuan', name: '点到手酸', cat: '彩蛋', tier: 'egg', stat: 'tap', value: 0.03, bonus: '点击灵气 +3%', cond: '单日点击 1000 次' }
    ],
    HERO_SKILLS: {
      lanyi: {
        id: 'jianyi_powang',
        name: '剑意斩 · 破妄',
        kind: 'single',
        mainMult: 2.2,
        splashMult: 0,
        healSelfOfMainDmg: 0,
        healAllyMaxHpRatio: 0,
        rowMult: 0,
        buffAtkMult: 1,
        buffHits: 0
      },
      cloak: {
        id: 'youming_shiguang',
        name: '幽冥噬光',
        kind: 'splash_lifesteal',
        mainMult: 1.4,
        splashMult: 0.5,
        healSelfOfMainDmg: 0.25,
        healAllyMaxHpRatio: 0,
        rowMult: 0,
        buffAtkMult: 1,
        buffHits: 0
      },
      saintess: {
        id: 'shengcai_guangyi',
        name: '圣裁光翼',
        kind: 'damage_heal_allies',
        mainMult: 1.3,
        splashMult: 0,
        healSelfOfMainDmg: 0,
        healAllyMaxHpRatio: 0.08,
        rowMult: 0,
        buffAtkMult: 1,
        buffHits: 0
      },
      miko: {
        id: 'yinghuo_zhuci',
        name: '樱火祝词',
        kind: 'row',
        mainMult: 1.1,
        splashMult: 0,
        healSelfOfMainDmg: 0,
        healAllyMaxHpRatio: 0,
        rowMult: 1.1,
        buffAtkMult: 1,
        buffHits: 0
      },
      shuanghua: {
        id: 'shuanghua_ningpo',
        name: '霜华凝魄',
        kind: 'splash_freeze',
        mainMult: 1.5,
        splashMult: 0.5,
        healSelfOfMainDmg: 0,
        healAllyMaxHpRatio: 0,
        rowMult: 0,
        buffAtkMult: 1,
        buffHits: 0
      },
      sweetmaid: {
        id: 'tianxin_jiahu',
        name: '甜心加护',
        kind: 'damage_buff_ally',
        mainMult: 1.2,
        splashMult: 0,
        healSelfOfMainDmg: 0,
        healAllyMaxHpRatio: 0,
        rowMult: 0,
        buffAtkMult: 1.35,
        buffHits: 2
      },
      jianghua: {
        id: 'hongxiu_chanxin',
        name: '红袖缠心',
        kind: 'damage_heal_allies',
        mainMult: 1.4,
        splashMult: 0.45,
        healSelfOfMainDmg: 0,
        healAllyMaxHpRatio: 0.05,
        rowMult: 0,
        buffAtkMult: 1,
        buffHits: 0
      },
      qingkui: {
        id: 'huaying_huichun',
        name: '花影回春',
        kind: 'damage_heal_allies',
        mainMult: 1.25,
        splashMult: 0.35,
        healSelfOfMainDmg: 0,
        healAllyMaxHpRatio: 0.07,
        rowMult: 0,
        buffAtkMult: 1,
        buffHits: 0
      },
      // 月誓灵佑：防御辅助，沿用现有 damage_heal_allies。不是护盾。
      // 对主目标造成 mainMult 倍绝技伤害，每名存活我方回复 ceil(自身 maxHp × healAllyMaxHpRatio)，不超过 maxHp。
      yueshi: {
        id: 'yueshi_lingyou',
        name: '月誓灵佑',
        kind: 'damage_heal_allies',
        mainMult: 1.2,
        splashMult: 0,
        healSelfOfMainDmg: 0,
        healAllyMaxHpRatio: 0.08,
        rowMult: 0,
        buffAtkMult: 1,
        buffHits: 0
      },
      // 断影追魂：单体爆发，沿用现有 single。
      ziling: {
        id: 'duanying_zhuihun',
        name: '断影追魂',
        kind: 'single',
        mainMult: 1.85,
        splashMult: 0,
        healSelfOfMainDmg: 0,
        healAllyMaxHpRatio: 0,
        rowMult: 0,
        buffAtkMult: 1,
        buffHits: 0
      },
      // 红莲灼心：群攻，沿用现有 row（同行群攻），不含虚构灼烧/持续伤害。
      honglian: {
        id: 'honglian_zhuoxin',
        name: '红莲灼心',
        kind: 'row',
        mainMult: 1.15,
        splashMult: 0,
        healSelfOfMainDmg: 0,
        healAllyMaxHpRatio: 0,
        rowMult: 1.15,
        buffAtkMult: 1,
        buffHits: 0
      },
      // 玄筹破阵：攻击辅助，沿用现有 damage_buff_ally（强化我方最高攻单位下次普攻）。
      molan: {
        id: 'xuanchou_pozhen',
        name: '玄筹破阵',
        kind: 'damage_buff_ally',
        mainMult: 1.2,
        splashMult: 0,
        healSelfOfMainDmg: 0,
        healAllyMaxHpRatio: 0,
        rowMult: 0,
        buffAtkMult: 1.35,
        buffHits: 2
      },
      // 流风逐影：单体攻击，沿用现有 single，不含虚构多段连击。
      qinglan: {
        id: 'liufeng_zhuying',
        name: '流风逐影',
        kind: 'single',
        mainMult: 1.75,
        splashMult: 0,
        healSelfOfMainDmg: 0,
        healAllyMaxHpRatio: 0,
        rowMult: 0,
        buffAtkMult: 1,
        buffHits: 0
      },
      // 焚霄贯阵：仙品火焰群攻，沿用现有 row。对主目标所在横排每名敌人造成 1.4 倍绝技伤害。不含灼烧或持续伤害。
      fenxiao: {
        id: 'fenxiao_guanzhen',
        name: '焚霄贯阵',
        kind: 'row',
        mainMult: 1.4,
        splashMult: 0,
        healSelfOfMainDmg: 0,
        healAllyMaxHpRatio: 0,
        rowMult: 1.4,
        buffAtkMult: 1,
        buffHits: 0
      },
      // 霜宸映愈：仙品冰晶单体支援，沿用现有 damage_heal_allies。主目标 1.45 倍伤害且不溅射；每名存活我方回复 ceil(自身 maxHp × 0.09)。不是冻结、护盾或持续伤害。
      shuangchen: {
        id: 'shuangchen_yingyu',
        name: '霜宸映愈',
        kind: 'damage_heal_allies',
        mainMult: 1.45,
        splashMult: 0,
        healSelfOfMainDmg: 0,
        healAllyMaxHpRatio: 0.09,
        rowMult: 0,
        buffAtkMult: 1,
        buffHits: 0
      },
      // 冥灯摄魂：仙品幽冥单体噬魂，沿用现有 single + healSelfOfMainDmg（单体攻击+治疗自身）。对主目标造成 1.8 倍绝技伤害且不溅射，自身回复本次主目标伤害的 30%（不超过 maxHp）。不含恐惧、复活或召唤。
      youming: {
        id: 'mingdeng_shehun',
        name: '冥灯摄魂',
        kind: 'single',
        mainMult: 1.8,
        splashMult: 0,
        healSelfOfMainDmg: 0.3,
        healAllyMaxHpRatio: 0,
        rowMult: 0,
        buffAtkMult: 1,
        buffHits: 0
      }
    },
    HEROES: [
      {
        id: 'lanyi',
        name: '清冷剑仙',
        quality: 'xian',
        avatar: 'assets/battle/avatars/lanyi.webp?v=4',
        avatarPos: '47% 17%',
        avatarScale: 2.6,
        img: 'assets/hero_v21_new_hd.jpg?v=4',
        poster: 'assets/hero_v21_new_poster.jpg?v=4',
        skill: {
          id: 'jianyi_powang',
          name: '剑意斩 · 破妄',
          kind: 'single',
          mainMult: 2.2,
          splashMult: 0,
          healSelfOfMainDmg: 0,
          healAllyMaxHpRatio: 0,
          rowMult: 0,
          buffAtkMult: 1,
          buffHits: 0
        }
      },
      {
        id: 'cloak',
        name: '魔灵光',
        quality: 'xian',
        avatar: 'assets/battle/avatars/cloak.webp?v=5',
        avatarPos: '55% 15%',
        avatarScale: 2.6,
        img: 'assets/hero_mlg_dawn_hd.jpg?v=4',
        poster: 'assets/hero_mlg_dawn_poster.jpg?v=4',
        skill: {
          id: 'youming_shiguang',
          name: '幽冥噬光',
          kind: 'splash_lifesteal',
          mainMult: 1.4,
          splashMult: 0.5,
          healSelfOfMainDmg: 0.25,
          healAllyMaxHpRatio: 0,
          rowMult: 0,
          buffAtkMult: 1,
          buffHits: 0
        }
      },
      {
        id: 'saintess',
        name: '圣王女',
        quality: 'tian',
        avatar: 'assets/battle/avatars/saintess.webp?v=4',
        avatarPos: '48% 12%',
        avatarScale: 2.6,
        img: 'assets/hero_saintess_v4b_hd.jpg?v=4',
        poster: 'assets/hero_saintess_v4b_poster.jpg?v=4',
        skill: {
          id: 'shengcai_guangyi',
          name: '圣裁光翼',
          kind: 'damage_heal_allies',
          mainMult: 1.3,
          splashMult: 0,
          healSelfOfMainDmg: 0,
          healAllyMaxHpRatio: 0.08,
          rowMult: 0,
          buffAtkMult: 1,
          buffHits: 0
        }
      },
      {
        id: 'miko',
        name: '灼樱巫女',
        quality: 'di',
        avatar: 'assets/battle/avatars/miko.webp?v=6',
        avatarPos: '57% 14%',
        avatarScale: 2.6,
        img: 'assets/hero_miko_dawn_hd.jpg?v=4',
        poster: 'assets/hero_miko_dawn_poster.jpg?v=4',
        skill: {
          id: 'yinghuo_zhuci',
          name: '樱火祝词',
          kind: 'row',
          mainMult: 1.1,
          splashMult: 0,
          healSelfOfMainDmg: 0,
          healAllyMaxHpRatio: 0,
          rowMult: 1.1,
          buffAtkMult: 1,
          buffHits: 0
        }
      },
      {
        id: 'shuanghua',
        name: '霜华玉仙',
        quality: 'tian',
        avatar: 'assets/battle/avatars/shuanghua.webp?v=4',
        avatarPos: '52% 17%',
        avatarScale: 2.6,
        img: 'assets/hero_shuanghua_hd.jpg?v=4',
        poster: 'assets/hero_shuanghua_poster.jpg?v=4',
        skill: {
          id: 'shuanghua_ningpo',
          name: '霜华凝魄',
          kind: 'splash_freeze',
          mainMult: 1.5,
          splashMult: 0.5,
          healSelfOfMainDmg: 0,
          healAllyMaxHpRatio: 0,
          rowMult: 0,
          buffAtkMult: 1,
          buffHits: 0
        }
      },
      {
        id: 'sweetmaid',
        name: '甜心女仆',
        quality: 'xuan',
        avatar: 'assets/battle/avatars/sweetmaid.webp?v=4',
        avatarPos: '64% 19%',
        avatarScale: 2.6,
        img: 'assets/hero_sweetmaid_hd.jpg?v=4',
        poster: 'assets/hero_sweetmaid_poster.jpg?v=4',
        skill: {
          id: 'tianxin_jiahu',
          name: '甜心加护',
          kind: 'damage_buff_ally',
          mainMult: 1.2,
          splashMult: 0,
          healSelfOfMainDmg: 0,
          healAllyMaxHpRatio: 0,
          rowMult: 0,
          buffAtkMult: 1.35,
          buffHits: 2
        }
      },
      {
        id: 'jianghua',
        name: '绛华倾城',
        quality: 'di',
        avatar: 'assets/battle/avatars/jianghua.webp?v=3',
        avatarPos: '50% 18%',
        avatarScale: 2.6,
        img: 'assets/hero_jianghua_hd.jpg?v=2',
        poster: 'assets/hero_jianghua_poster.jpg?v=2',
        skill: {
          id: 'hongxiu_chanxin',
          name: '红袖缠心',
          kind: 'damage_heal_allies',
          mainMult: 1.4,
          splashMult: 0.45,
          healSelfOfMainDmg: 0,
          healAllyMaxHpRatio: 0.05,
          rowMult: 0,
          buffAtkMult: 1,
          buffHits: 0
        }
      },
      {
        id: 'qingkui',
        name: '晴葵灵姬',
        quality: 'tian',
        unlockCond: '踏入仙途（初始免费解锁）',
        avatar: 'assets/battle/avatars/qingkui.webp?v=5',
        avatarPos: '58% 13%',
        avatarScale: 2.6,
        img: 'assets/hero_qingkui_hd.jpg?v=2',
        poster: 'assets/hero_qingkui_poster.jpg?v=2',
        skill: {
          id: 'huaying_huichun',
          name: '花影回春',
          kind: 'damage_heal_allies',
          mainMult: 1.25,
          splashMult: 0.35,
          healSelfOfMainDmg: 0,
          healAllyMaxHpRatio: 0.07,
          rowMult: 0,
          buffAtkMult: 1,
          buffHits: 0
        }
      },
      {
        id: 'yueshi',
        name: '月誓灵姝',
        quality: 'tian',
        unlockCond: '踏入仙途（初始免费解锁）',
        avatar: 'assets/battle/avatars/yueshi.webp?v=8',
        avatarPos: '50% 22%',
        avatarScale: 2.6,
        img: 'assets/hero_yueshi_hd.jpg?v=2',
        poster: 'assets/hero_yueshi_poster.jpg?v=2',
        skill: {
          id: 'yueshi_lingyou',
          name: '月誓灵佑',
          kind: 'damage_heal_allies',
          mainMult: 1.2,
          splashMult: 0,
          healSelfOfMainDmg: 0,
          healAllyMaxHpRatio: 0.08,
          rowMult: 0,
          buffAtkMult: 1,
          buffHits: 0
        }
      },
      {
        id: 'ziling',
        name: '紫绫影姬',
        quality: 'di',
        unlockCond: '踏入仙途（初始免费解锁）',
        avatar: 'assets/battle/avatars/ziling.webp?v=3',
        avatarPos: '51% 12%',
        avatarScale: 2.6,
        img: 'assets/hero_ziling_hd.jpg?v=3',
        poster: 'assets/hero_ziling_poster.jpg?v=3',
        skill: {
          id: 'duanying_zhuihun',
          name: '断影追魂',
          kind: 'single',
          mainMult: 1.85,
          splashMult: 0,
          healSelfOfMainDmg: 0,
          healAllyMaxHpRatio: 0,
          rowMult: 0,
          buffAtkMult: 1,
          buffHits: 0
        }
      },
      {
        id: 'honglian',
        name: '红莲妖姬',
        quality: 'di',
        unlockCond: '踏入仙途（初始免费解锁）',
        avatar: 'assets/battle/avatars/honglian.webp?v=2',
        avatarPos: '44% 10%',
        avatarScale: 2.6,
        img: 'assets/hero_honglian_hd.jpg?v=1',
        poster: 'assets/hero_honglian_poster.jpg?v=1',
        skill: {
          id: 'honglian_zhuoxin',
          name: '红莲灼心',
          kind: 'row',
          mainMult: 1.15,
          splashMult: 0,
          healSelfOfMainDmg: 0,
          healAllyMaxHpRatio: 0,
          rowMult: 1.15,
          buffAtkMult: 1,
          buffHits: 0
        }
      },
      {
        id: 'molan',
        name: '墨兰执事',
        quality: 'xuan',
        unlockCond: '踏入仙途（初始免费解锁）',
        avatar: 'assets/battle/avatars/molan.webp?v=3',
        avatarPos: '54% 14%',
        avatarScale: 2.6,
        img: 'assets/hero_molan_hd.jpg?v=2',
        poster: 'assets/hero_molan_poster.jpg?v=2',
        skill: {
          id: 'xuanchou_pozhen',
          name: '玄筹破阵',
          kind: 'damage_buff_ally',
          mainMult: 1.2,
          splashMult: 0,
          healSelfOfMainDmg: 0,
          healAllyMaxHpRatio: 0,
          rowMult: 0,
          buffAtkMult: 1.35,
          buffHits: 2
        }
      },
      {
        id: 'qinglan',
        name: '晴岚游侠',
        quality: 'xuan',
        unlockCond: '踏入仙途（初始免费解锁）',
        avatar: 'assets/battle/avatars/qinglan.webp?v=3',
        avatarPos: '44% 15%',
        avatarScale: 2.6,
        img: 'assets/hero_qinglan_hd.jpg?v=1',
        poster: 'assets/hero_qinglan_poster.jpg?v=1',
        skill: {
          id: 'liufeng_zhuying',
          name: '流风逐影',
          kind: 'single',
          mainMult: 1.75,
          splashMult: 0,
          healSelfOfMainDmg: 0,
          healAllyMaxHpRatio: 0,
          rowMult: 0,
          buffAtkMult: 1,
          buffHits: 0
        }
      },
      {
        id: 'fenxiao',
        name: '焚霄炎姬',
        quality: 'xian',
        unlockCond: '踏入仙途（初始免费解锁）',
        avatar: 'assets/battle/avatars/fenxiao.webp?v=2',
        avatarPos: '50% 50%',
        avatarScale: 2.6,
        img: 'assets/hero_fenxiao_hd.jpg?v=1',
        poster: 'assets/hero_fenxiao_poster.jpg?v=1',
        skill: {
          id: 'fenxiao_guanzhen',
          name: '焚霄贯阵',
          kind: 'row',
          mainMult: 1.4,
          splashMult: 0,
          healSelfOfMainDmg: 0,
          healAllyMaxHpRatio: 0,
          rowMult: 1.4,
          buffAtkMult: 1,
          buffHits: 0
        }
      },
      {
        id: 'shuangchen',
        name: '霜宸冰璃',
        quality: 'xian',
        unlockCond: '踏入仙途（初始免费解锁）',
        avatar: 'assets/battle/avatars/shuangchen.webp?v=2',
        avatarPos: '50% 50%',
        avatarScale: 2.6,
        img: 'assets/hero_shuangchen_hd.jpg?v=1',
        poster: 'assets/hero_shuangchen_poster.jpg?v=1',
        skill: {
          id: 'shuangchen_yingyu',
          name: '霜宸映愈',
          kind: 'damage_heal_allies',
          mainMult: 1.45,
          splashMult: 0,
          healSelfOfMainDmg: 0,
          healAllyMaxHpRatio: 0.09,
          rowMult: 0,
          buffAtkMult: 1,
          buffHits: 0
        }
      },
      {
        id: 'youming',
        name: '幽冥鬼后',
        quality: 'xian',
        unlockCond: '踏入仙途（初始免费解锁）',
        avatar: 'assets/battle/avatars/youming.webp?v=2',
        avatarPos: '50% 50%',
        avatarScale: 2.6,
        img: 'assets/hero_youming_hd.jpg?v=1',
        poster: 'assets/hero_youming_poster.jpg?v=1',
        skill: {
          id: 'mingdeng_shehun',
          name: '冥灯摄魂',
          kind: 'single',
          mainMult: 1.8,
          splashMult: 0,
          healSelfOfMainDmg: 0.3,
          healAllyMaxHpRatio: 0,
          rowMult: 0,
          buffAtkMult: 1,
          buffHits: 0
        }
      }
    ]
  };
  window.CONFIG = window.GameConfig;
})();

