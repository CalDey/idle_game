// 绝技说明与施放台词（只做展示）。技能名、kind 与数值以 js/config.js 为准，此处不收录备选名。
// 来源：docs/worldbuilding/技能文案.md 文末 JSON（desc / castLine）。
(function () {
  'use strict';
  const SKILLS = {
      "lanyi": {
        "skillId": "jianyi_powang",
        "desc": "一剑只取单一敌人，破开身前虚妄，造成 2.2 倍绝技伤害。不溅射，不回复，不加持。剑意只斩眼前这一个。",
        "castLine": "妄，只斩眼前。"
      },
      "cloak": {
        "skillId": "youming_shiguang",
        "desc": "吞噬主目标的光，对其造成 1.4 倍绝技伤害；周围一格敌人分摊 0.5 倍溅射。自身回复本次主目标伤害的 25%，不超过自身生命上限。",
        "castLine": "你的光，我收下了。"
      },
      "fenxiao": {
        "skillId": "fenxiao_guanzhen",
        "desc": "古火横贯主目标所在一排，对该排每名敌人造成 1.4 倍绝技伤害。火过即止，没有灼烧，也没有持续伤害。",
        "castLine": "跪不跪，都是柴。"
      },
      "shuangchen": {
        "skillId": "shuangchen_yingyu",
        "desc": "冰魄刺向单一敌人，造成 1.45 倍绝技伤害，不溅射。每名存活队友回复自身生命上限的 9%。不是冻结，也不是护盾。",
        "castLine": "先活着。冰里还冷得及。"
      },
      "youming": {
        "skillId": "mingdeng_shehun",
        "desc": "冥灯摄住主目标之魂，造成 1.8 倍绝技伤害，不溅射。自身回复本次主目标伤害的 30%，不超过自身生命上限。不含恐惧、复活或召唤。",
        "castLine": "灯还亮着。你的魂，够用了。"
      },
      "saintess": {
        "skillId": "shengcai_guangyi",
        "desc": "光翼展开，对单一敌人造成 1.3 倍绝技伤害。每名存活队友回复自身生命上限的 8%。光会渡血，但不是护盾。",
        "castLine": "罪，该还回去。"
      },
      "shuanghua": {
        "skillId": "shuanghua_ningpo",
        "desc": "凝住主目标的魄，造成 1.5 倍绝技伤害；周围一格敌人分摊 0.5 倍溅射。若主目标未死，其下一次攻击会落空。不是持续伤害。",
        "castLine": "先停在这一息。"
      },
      "qingkui": {
        "skillId": "huaying_huichun",
        "desc": "花影扫向主目标，造成 1.25 倍绝技伤害；周围一格敌人分摊 0.35 倍溅射。每名存活队友回复自身生命上限的 7%。回春是疗伤，不是护盾。",
        "castLine": "再开一回。枯的，我来补。"
      },
      "yueshi": {
        "skillId": "yueshi_lingyou",
        "desc": "以誓约落下裁断，对单一敌人造成 1.2 倍绝技伤害。每名存活队友回复自身生命上限的 8%。是疗伤，不是护盾。",
        "castLine": "誓在，便护你这一息。"
      },
      "miko": {
        "skillId": "yinghuo_zhuci",
        "desc": "祝词点燃樱火，横扫主目标所在一排，对该排每名敌人造成 1.1 倍绝技伤害。火随祝词而过，没有灼烧或持续伤害。",
        "castLine": "祝你……烧干净。"
      },
      "jianghua": {
        "skillId": "hongxiu_chanxin",
        "desc": "红袖缠上主目标，造成 1.4 倍绝技伤害；周围一格敌人分摊 0.45 倍溅射。每名存活队友回复自身生命上限的 5%。是疗伤，不是魅惑控制。",
        "castLine": "心既已交给我，便留下吧。"
      },
      "ziling": {
        "skillId": "duanying_zhuihun",
        "desc": "影子贴上单一敌人，造成 1.85 倍绝技伤害。不溅射，不回复。一击只取这一个魂。",
        "castLine": "影子到了。"
      },
      "honglian": {
        "skillId": "honglian_zhuoxin",
        "desc": "红莲张开，横扫主目标所在一排，对该排每名敌人造成 1.15 倍绝技伤害。花瓣收得很快，没有灼烧，也没有持续伤害。",
        "castLine": "心，留下。"
      },
      "sweetmaid": {
        "skillId": "tianxin_jiahu",
        "desc": "对单一敌人造成 1.2 倍绝技伤害。同时加护我方当前攻击最高的存活者，使其接下来两下普攻伤害变为 1.35 倍。只加持普攻，不加在绝技上。",
        "castLine": "这一下，让我来护。"
      },
      "molan": {
        "skillId": "xuanchou_pozhen",
        "desc": "一筹点向单一敌人，造成 1.2 倍绝技伤害。同时推演破阵，使我方当前攻击最高的存活者接下来两下普攻伤害变为 1.35 倍。只加持普攻。",
        "castLine": "阵眼在此。打。"
      },
      "qinglan": {
        "skillId": "liufeng_zhuying",
        "desc": "流风追上单一敌人，造成 1.75 倍绝技伤害。不溅射，不连击。一刀只够取一条命。",
        "castLine": "别跑。影子还在。"
      }
    };

  function forHero(heroId) {
    return (heroId && SKILLS[heroId]) || null;
  }

  window.SkillTextData = {
    version: 1,
    skills: SKILLS,
    forHero,
    desc: (heroId) => (forHero(heroId) ? forHero(heroId).desc : ''),
    castLine: (heroId) => (forHero(heroId) ? forHero(heroId).castLine : '')
  };
})();
