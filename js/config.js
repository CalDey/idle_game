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

  // P0：筑基之后抬高灵气需求，避免十几分钟修到化神。倍数由 tools/sim.js 校准。
  const LATE_REALM_QI_MULT = [1, 12, 90, 500, 2200];
  REALM_STAGES.forEach((stage) => {
    const mult = LATE_REALM_QI_MULT[stage.majorIndex] || 1;
    if (mult !== 1) stage.reqQi = Math.round(stage.reqQi * mult);
  });

  const EQUIP_SLOTS = [
    { id: 'weapon', name: '武器', itemName: '青锋飞剑', stat: 'atk', base: 8, growth: 1.06 },
    { id: 'charm', name: '护符', itemName: '温玉佩', stat: 'atk', base: 5, growth: 1.06 },
    { id: 'crown', name: '头冠', itemName: '白玉簪', stat: 'hp', base: 70, growth: 1.06 },
    { id: 'belt', name: '腰带', itemName: '流云丝绦', stat: 'hp', base: 50, growth: 1.06 },
    { id: 'robe', name: '法袍', itemName: '练气短衫', stat: 'def', base: 5, growth: 1.06 },
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
    8: { chapter: 3, stage: 30, boss: '黑风寨主' },
    17: { chapter: 9, stage: 90, boss: '青冥蛟王' },
    26: { chapter: 15, stage: 150, boss: '赤炎魔君' },
    35: { chapter: 21, stage: 210, boss: '九幽鬼母' }
  };

  const BATTLE = {
    GROWTH: 1.0223,
    BASE_CP: 600,
    BOSS_MULT: 1.5,
    SPLIT: { atk: 0.04, hp: 0.40, def: 0.0165 },
    MAX_ROUNDS: 20,
    UNLOCK_REALM: 2,
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
    UNLOCK_REALM: 1
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

  window.GameConfig = {
    SUB_LEVEL_NAMES,
    MAJOR_REALMS,
    REALM_STAGES,
    GONGFA_LIST,
    DONGFU_LIST,
    DAOGUO_TALENTS,
    OFFLINE_CAP_SECONDS: 12 * 3600, // 12小时上限
    REINCARNATION_MIN_STAGE: 27, // 元婴一层 (index 27)
    ENABLE_STAGE_GATES: true,
    LATE_REALM_QI_MULT,
    EQUIP_SLOTS,
    QUALITIES,
    TREE_WEIGHT_ANCHORS,
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
      { id: 'yinqiruti', name: '引气入体', cat: '入门', tier: 'intro', stat: 'tap', value: 0.01, bonus: '点击灵气 +1%', cond: '达到练气一层' },
      { id: 'tunaxinren', name: '吐纳新人', cat: '入门', tier: 'intro', stat: 'tap', value: 0.02, bonus: '点击灵气 +2%', cond: '累计点击 100 次' },
      { id: 'jingzuo', name: '静坐童子', cat: '入门', tier: 'intro', stat: 'qi', value: 0.02, bonus: '灵气 +2%', cond: '累计修炼 1 小时' },
      { id: 'qinxiubuchuo', name: '勤修不辍', cat: '修炼', tier: 'cultivate', stat: 'break', value: 0.01, bonus: '突破成功率 +1%', cond: '连续 3 日登录' },
      { id: 'lingqixiaofu', name: '灵气小富', cat: '修炼', tier: 'cultivate', stat: 'qi', value: 0.02, bonus: '灵气 +2%', cond: '累计获得灵气 10 万' },
      { id: 'yiyerzhuji', name: '一夜筑基', cat: '修炼', tier: 'cultivate', stat: 'qi', value: 0.03, bonus: '灵气 +3%', cond: '开档 24 小时内筑基' },
      { id: 'lvbailvzhan', name: '屡败屡战', cat: '修炼', tier: 'cultivate', stat: 'break', value: 0.01, bonus: '突破成功率 +1%', cond: '突破失败累计 3 次' },
      { id: 'zhaotaoxiaoxian', name: '摘桃小仙', cat: '仙桃', tier: 'peach', stat: 'peach', value: 0.02, bonus: '仙桃回复 +2%', cond: '累计摘桃 50 次' },
      { id: 'chudelingbao', name: '初得灵宝', cat: '仙桃', tier: 'peach', stat: 'jade', value: 0.02, bonus: '分解灵玉 +2%', cond: '获得第一件灵品及以上' },
      { id: 'hongyundangtou', name: '鸿运当头', cat: '仙桃', tier: 'peach', stat: 'cp', value: 0.03, bonus: '战力 +3%', cond: '获得第一件地品及以上' },
      { id: 'suibaokuangren', name: '碎宝狂人', cat: '仙桃', tier: 'peach', stat: 'jade', value: 0.03, bonus: '分解灵玉 +3%', cond: '累计分解 100 件' },
      { id: 'jianxinchumeng', name: '剑心初萌', cat: '彩蛋', tier: 'egg', stat: 'cp', value: 0.02, bonus: '战力 +2%', cond: '第一次装备武器' },
      { id: 'biguanbuchu', name: '闭关不出', cat: '彩蛋', tier: 'egg', stat: 'qi', value: 0.03, bonus: '灵气 +3%', cond: '一次离线结算满 12 小时' },
      { id: 'diandaoshousuan', name: '点到手酸', cat: '彩蛋', tier: 'egg', stat: 'tap', value: 0.03, bonus: '点击灵气 +3%', cond: '单日点击 1000 次' }
    ],
    HEROES: [
      { id: 'lanyi', name: '清冷剑仙', img: 'assets/hero_dawn_hd.jpg?v=1', poster: 'assets/hero_dawn_poster.jpg?v=1', video: 'assets/hero_dawn_hd.mp4?v=1' },
      { id: 'cloak', name: '魔灵光', img: 'assets/hero_mlg_dawn_hd.jpg?v=1', poster: 'assets/hero_mlg_dawn_poster.jpg?v=1', video: 'assets/hero_mlg_dawn_hd.mp4?v=1' },
      { id: 'saintess', name: '圣女', img: 'assets/hero_saintess_v4b_hd.jpg?v=1', poster: 'assets/hero_saintess_v4b_poster.jpg?v=1', video: 'assets/hero_saintess_v4b_hd.mp4?v=1' },
      { id: 'locked3', name: '敬请期待', locked: true }
    ]
  };
  window.CONFIG = window.GameConfig;
})();

