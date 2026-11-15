// 仙缘阵法：上阵角色按「仙缘标签」凑齐 2 / 3 人即激活羁绊。
// 标签与羁绊都由当前上阵阵容实时推导，不写存档；战斗加成通过 Battle.createSession 的 mods（heroMods）注入。
// 纯逻辑模块，不碰 DOM；UI 在 stage-ui.js。
(function () {
  const root = typeof window !== 'undefined' ? window : globalThis;

  // 每位角色 1~2 个标签，依据绝技类型与名号设定
  const HERO_TAGS = {
    lanyi: ['jian', 'bing'], // 清冷剑仙：单体剑意 · 清冷霜寒
    cloak: ['ming'], // 魔灵光：幽冥噬光（吸血）
    saintess: ['yu'], // 圣王女：圣裁光翼（群疗）
    miko: ['yan', 'zuo'], // 灼樱巫女：樱火祝词（火 · 祝祷）
    shuanghua: ['bing'], // 霜华玉仙：霜华凝魄（冰冻）
    sweetmaid: ['zuo'], // 甜心女仆：甜心加护（增伤）
    jianghua: ['yan', 'yu'], // 绛华倾城：红袖缠心（绛红 · 群疗）
    qingkui: ['yu', 'zuo'], // 晴葵灵姬：花影回春（群疗 · 灵姬）
    yueshi: ['bing', 'yu'], // 月誓灵姝：月誓灵佑（月寒 · 群疗）
    ziling: ['jian', 'ming'], // 紫绫影姬：断影追魂（单体 · 影）
    honglian: ['yan', 'ming'], // 红莲妖姬：红莲灼心（火 · 妖）
    molan: ['zuo', 'ming'], // 墨兰执事：玄筹破阵（增伤 · 墨）
    qinglan: ['jian', 'bing'], // 晴岚游侠：流风逐影（单体 · 寒岚）
    fenxiao: ['yan'], // 焚霄炎姬：焚霄贯阵（火）
    shuangchen: ['bing', 'yu'], // 霜宸冰璃：霜宸映愈（冰 · 疗）
    youming: ['ming'] // 幽冥鬼后：冥灯摄魂（吸魂）
  };

  // scope: 'member' 仅持有该标签的上阵角色获得；'team' 全队获得
  // name 为芯片/标签用短名；loreName / flavor 为世界观名与来历（体验官第 3 批 P2-4，只作显示）
  const BONDS = [
    {
      id: 'jian', name: '剑修',
      loreName: '剑修·破妄同锋',
      flavor: '未收的剑意叠在一处。持剑者绝技互相借力，伤害加 13.2%；三人同阵，加到 21%。',
      icon: 'slot_weapon', scope: 'member',
      tiers: [
        { need: 2, desc: '剑修角色绝技伤害 +13.2%', mods: { ultDmgMult: 0.132 } },
        { need: 3, desc: '剑修角色绝技伤害 +21%', mods: { ultDmgMult: 0.21 } }
      ]
    },
    {
      id: 'ming', name: '幽冥',
      loreName: '幽冥·灯下共噬',
      flavor: '灯影里的人把溢出的伤势吞回去。幽冥角色绝技可吸血 15%，三人则 19.2%。',
      icon: 'res_qi', scope: 'member',
      tiers: [
        { need: 2, desc: '幽冥角色绝技吸血 15%', mods: { ultLifesteal: 0.15 } },
        { need: 3, desc: '幽冥角色绝技吸血 19.2%', mods: { ultLifesteal: 0.192 } }
      ]
    },
    {
      id: 'bing', name: '冰霜',
      loreName: '冰霜·寒魄同修',
      flavor: '同修一脉寒气。冰霜角色普攻有 2.4% 几率冰封目标，令其下次攻击落空；三人则 4.8%。',
      icon: 'res_daoguo', scope: 'member',
      tiers: [
        { need: 2, desc: '冰霜角色普攻 2.4% 几率冰封目标（下次攻击落空）', mods: { freezeChance: 0.024 } },
        { need: 3, desc: '冰霜角色普攻 4.8% 几率冰封目标', mods: { freezeChance: 0.048 } }
      ]
    },
    {
      id: 'yan', name: '烈焰',
      loreName: '烈焰·同烬相燎',
      flavor: '火性同源，火星会溅到身旁。烈焰角色普攻对周围敌人溅射 4.2%，三人则 7.2%。',
      icon: 'gf_jiuzhuan_jindan', scope: 'member',
      tiers: [
        { need: 2, desc: '烈焰角色普攻对周围敌人溅射 4.2%', mods: { atkSplash: 0.042 } },
        { need: 3, desc: '烈焰角色普攻对周围敌人溅射 7.2%', mods: { atkSplash: 0.072 } }
      ]
    },
    {
      id: 'yu', name: '灵愈',
      loreName: '灵愈·护生同脉',
      flavor: '治愈的脉息连成一张网。全队生命加 1.2%；三人同阵，加到 2.7%。',
      icon: 'df_lingquan', scope: 'team',
      tiers: [
        { need: 2, desc: '全队生命 +1.2%', mods: { hpMult: 0.012 } },
        { need: 3, desc: '全队生命 +2.7%', mods: { hpMult: 0.027 } }
      ]
    },
    {
      id: 'zuo', name: '辅佐',
      loreName: '辅佐·先机同筹',
      flavor: '开阵之前就把气机推到众人腕上。全队开战怒气加 4.8；三人则加 12。',
      icon: 'ui_bagua', scope: 'team',
      tiers: [
        { need: 2, desc: '全队开战怒气 +4.8', mods: { rageStart: 4.8 } },
        { need: 3, desc: '全队开战怒气 +12', mods: { rageStart: 12 } }
      ]
    }
  ];

  const BOND_MAP = {};
  BONDS.forEach((b) => {
    BOND_MAP[b.id] = b;
  });

  const MULT_KEYS = ['atkMult', 'hpMult', 'defMult', 'ultDmgMult', 'bossDmgMult', 'frontDmgTakenMult'];

  function tagsOf(heroId) {
    return (HERO_TAGS[heroId] || []).slice();
  }

  function tagNames(heroId) {
    return tagsOf(heroId).map((t) => (BOND_MAP[t] ? BOND_MAP[t].name : t));
  }

  function uniqueIds(heroIds) {
    const out = [];
    (Array.isArray(heroIds) ? heroIds : []).forEach((id) => {
      if (typeof id === 'string' && id && !out.includes(id)) out.push(id);
    });
    return out;
  }

  // 返回每个羁绊的进度：count、当前激活档（tier 或 null）、下一档需求、成员
  function evaluate(heroIds) {
    const ids = uniqueIds(heroIds);
    return BONDS.map((b) => {
      const members = ids.filter((id) => tagsOf(id).includes(b.id));
      let tier = null;
      let tierIdx = -1;
      b.tiers.forEach((t, i) => {
        if (members.length >= t.need) {
          tier = t;
          tierIdx = i;
        }
      });
      const next = b.tiers[tierIdx + 1] || null;
      const maxNeed = b.tiers[b.tiers.length - 1].need;
      const maxed = !next;
      const countLabel = maxed ? `${maxNeed}/${maxNeed}（满）` : `${members.length}/${next.need}`;
      return {
        id: b.id,
        name: b.name,
        icon: b.icon,
        scope: b.scope,
        count: members.length,
        members,
        tier,
        level: tierIdx + 1,
        active: Boolean(tier),
        nextNeed: next ? next.need : maxNeed,
        maxed,
        countLabel,
        progressText: `${b.name} ${countLabel}`
      };
    });
  }

  function activeBonds(heroIds) {
    return evaluate(heroIds).filter((b) => b.active);
  }

  function addPart(target, part) {
    Object.keys(part).forEach((k) => {
      if (MULT_KEYS.includes(k)) {
        target[k] = (target[k] == null ? 1 : target[k]) + part[k];
      } else {
        target[k] = (target[k] || 0) + part[k];
      }
    });
  }

  // 羁绊 → Battle mods；无激活羁绊时返回 null（战斗与原版完全一致）
  function buildMods(heroIds) {
    const act = activeBonds(heroIds);
    if (act.length === 0) return null;
    const mods = { heroMods: {} };
    act.forEach((b) => {
      const def = BOND_MAP[b.id];
      if (def.scope === 'team') {
        addPart(mods, b.tier.mods);
      } else {
        b.members.forEach((hid) => {
          if (!mods.heroMods[hid]) mods.heroMods[hid] = {};
          addPart(mods.heroMods[hid], b.tier.mods);
        });
      }
    });
    return mods;
  }

  function squadIdsOf(state) {
    const B = root.Battle;
    if (!B || typeof B.getSquadIds !== 'function') return [];
    try {
      return B.getSquadIds(state);
    } catch (err) {
      return [];
    }
  }

  // 羁绊 + 灵兽伴生（js/beasts.js）+ 本命道途（js/path.js，均可缺省）合并后的 mods；都没有时返回 null
  function modsForState(state) {
    const ids = squadIdsOf(state);
    const base = buildMods(ids);
    const Bs = root.Beasts;
    const beast = Bs && typeof Bs.modsForState === 'function' ? Bs.modsForState(state, ids) : null;
    const merged = beast ? mergeMods(base, beast) : base;
    // 本命道途（js/path.js，可缺省）：玩家所选道途的全队常驻加成；未选或未参悟时为 null
    const P = root.Path;
    const path = P && typeof P.battleMods === 'function' ? P.battleMods(state) : null;
    return path ? mergeMods(merged, path) : merged;
  }

  // 合并两份 mods（如秘境劫运 + 羁绊）：倍率按增量相加，其余数值相加，heroMods 逐角色合并
  function mergeMods(a, b) {
    if (!a) return b ? JSON.parse(JSON.stringify(b)) : null;
    if (!b) return JSON.parse(JSON.stringify(a));
    const out = JSON.parse(JSON.stringify(a));
    Object.keys(b).forEach((k) => {
      if (k === 'heroMods') return;
      const v = b[k];
      if (typeof v !== 'number') return;
      if (MULT_KEYS.includes(k)) out[k] = (out[k] == null ? 1 : out[k]) + (v - 1);
      else out[k] = (out[k] || 0) + v;
    });
    if (b.heroMods) {
      out.heroMods = out.heroMods || {};
      Object.keys(b.heroMods).forEach((hid) => {
        const src = b.heroMods[hid];
        const dst = out.heroMods[hid] || (out.heroMods[hid] = {});
        Object.keys(src).forEach((k) => {
          if (MULT_KEYS.includes(k)) dst[k] = (dst[k] == null ? 1 : dst[k]) + (src[k] - 1);
          else dst[k] = (dst[k] || 0) + src[k];
        });
      });
    }
    return out;
  }

  const Bonds = {
    HERO_TAGS,
    BONDS,
    BOND_MAP,
    tagsOf,
    tagNames,
    evaluate,
    activeBonds,
    buildMods,
    modsForState,
    mergeMods
  };

  root.Bonds = Bonds;
  if (typeof window !== 'undefined') window.Bonds = Bonds;
  if (typeof module !== 'undefined' && module.exports) module.exports = Bonds;
})();
