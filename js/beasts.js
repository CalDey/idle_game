// 灵兽伴生：闯关里程碑解锁灵兽，同时只带一只；以灵玉 + 仙桃喂养升级（Lv1~10）。
// 加成很小，并与仙缘标签呼应：全队攻击微增 + 对应标签（幽冥/烈焰/冰霜）的上阵角色获得同系小加成。
// 战斗加成经 Bonds.modsForState 合并进 Battle mods（闯关、秘境、胜率预估一致）。
// 存档：state.beasts = { v, owned: { id: { lv } }, active }；旧档缺省时按历史最高关自动补发，轮回保留。
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;

  const VERSION = 1;
  const MAX_LV = 10;

  const BEASTS = [
    {
      id: 'xuanhu',
      name: '幽冥玄狐',
      tag: 'ming',
      tagName: '幽冥',
      unlockStage: 30,
      unlockText: '通关第 30 关（击败黑风寨主）',
      blurb: '九尾比身子先到。它不认主，只认你身上那股阴气。',
      perk: { key: 'ultLifesteal', perLv: 0.01, label: '幽冥角色绝技吸血' }
    },
    {
      id: 'shoushanlin',
      name: '霜纹守山麟',
      tag: 'bing',
      tagName: '冰霜',
      unlockStage: 90,
      unlockText: '通关第 90 关（击败青冥蛟后）',
      blurb: '青冥岭上的老守山兽，鳞结着霜。它随你走，岭上便少一季霜。',
      perk: { key: 'freezeChance', perLv: 0.005, label: '冰霜角色普攻冰封几率' }
    },
    {
      id: 'jinwu',
      name: '赤焰金乌',
      tag: 'yan',
      tagName: '烈焰',
      unlockStage: 150,
      unlockText: '通关第 150 关（击败赤炎魔君）',
      blurb: '祭火里逃出的金乌，羽尖仍在落星。它不肯回去当香火。',
      perk: { key: 'atkSplash', perLv: 0.01, label: '烈焰角色普攻溅射' }
    }
  ];
  const TEAM_ATK_PER_LV = 0.004; // 全队攻击 +0.4%/级（满级 +4%）

  const BY_ID = {};
  BEASTS.forEach((b) => {
    BY_ID[b.id] = b;
  });

  function clampLv(v) {
    const n = Math.floor(Number(v) || 0);
    return Math.max(1, Math.min(MAX_LV, n));
  }

  function lifeBest(s) {
    if (!s) return 0;
    return Math.max(Number(s.lifeBestStage) || 0, (s.stage && Number(s.stage.best)) || 0);
  }

  // 规范化（原地更新，保持对象引用）；不发放新灵兽
  function normalize(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const owned = {};
    const so = src.owned && typeof src.owned === 'object' && !Array.isArray(src.owned) ? src.owned : {};
    Object.keys(so).forEach((id) => {
      if (BY_ID[id]) owned[id] = { lv: clampLv(so[id] && so[id].lv) };
    });
    let active = typeof src.active === 'string' && owned[src.active] ? src.active : '';
    if (!active) {
      const first = BEASTS.find((b) => owned[b.id]);
      active = first ? first.id : '';
    }
    return { v: VERSION, owned, active };
  }

  function ensureState(s) {
    if (!s) return normalize(null);
    const out = normalize(s.beasts);
    if (s.beasts && typeof s.beasts === 'object' && !Array.isArray(s.beasts)) {
      Object.keys(s.beasts).forEach((k) => {
        if (!(k in out)) delete s.beasts[k];
      });
      Object.assign(s.beasts, out);
    } else {
      s.beasts = out;
    }
    return s.beasts;
  }

  // 按历史最高关补发已达成的灵兽；返回新获得的灵兽列表
  function syncUnlocks(s) {
    const st = ensureState(s);
    const best = lifeBest(s);
    const gained = [];
    BEASTS.forEach((b) => {
      if (!st.owned[b.id] && best >= b.unlockStage) {
        st.owned[b.id] = { lv: 1 };
        gained.push(b);
      }
    });
    if (!st.active && gained.length) st.active = gained[0].id;
    return gained;
  }

  function isOwned(s, id) {
    const st = ensureState(s);
    return Boolean(st.owned[id]);
  }

  function levelOf(s, id) {
    const st = ensureState(s);
    return st.owned[id] ? st.owned[id].lv : 0;
  }

  function activeBeast(s) {
    const st = ensureState(s);
    return st.active && st.owned[st.active] ? BY_ID[st.active] : null;
  }

  function setActive(s, id) {
    const st = ensureState(s);
    if (!st.owned[id]) return false;
    st.active = id;
    return true;
  }

  // 喂养（升一级）花费：灵玉 40×1.3^(lv-1)，仙桃 5+5×lv
  function feedCost(lv) {
    const L = clampLv(lv);
    if (L >= MAX_LV) return null;
    return { lingyu: Math.round(40 * Math.pow(1.3, L - 1)), peaches: 5 + 5 * L };
  }

  function peachesOf(s) {
    return (s && s.tree && Number(s.tree.peaches)) || 0;
  }

  function canFeed(s, id) {
    const lv = levelOf(s, id);
    if (!lv) return { ok: false, reason: '尚未获得' };
    const cost = feedCost(lv);
    if (!cost) return { ok: false, reason: '已满级' };
    if ((Number(s.lingyu) || 0) < cost.lingyu) return { ok: false, reason: '灵玉不足', cost };
    if (peachesOf(s) < cost.peaches) return { ok: false, reason: '仙桃不足', cost };
    return { ok: true, cost };
  }

  function feed(s, id) {
    const chk = canFeed(s, id);
    if (!chk.ok) return chk;
    s.lingyu = (Number(s.lingyu) || 0) - chk.cost.lingyu;
    s.tree.peaches = peachesOf(s) - chk.cost.peaches;
    const st = ensureState(s);
    st.owned[id].lv = clampLv(st.owned[id].lv + 1);
    return { ok: true, cost: chk.cost, lv: st.owned[id].lv };
  }

  // 某只灵兽在给定等级下的加成数值
  function bonusAt(id, lv) {
    const b = BY_ID[id];
    if (!b) return null;
    const L = clampLv(lv);
    return { teamAtk: TEAM_ATK_PER_LV * L, perkKey: b.perk.key, perk: b.perk.perLv * L, tag: b.tag };
  }

  const pct = (v) => `${Math.round(v * 1000) / 10}%`;

  function bonusText(id, lv) {
    const b = BY_ID[id];
    const x = bonusAt(id, lv);
    if (!b || !x) return '';
    return `全队攻击 +${pct(x.teamAtk)}；${b.perk.label} +${pct(x.perk)}`;
  }

  function tagsOf(heroId) {
    const Bd = root.Bonds;
    return Bd && typeof Bd.tagsOf === 'function' ? Bd.tagsOf(heroId) : [];
  }

  // Battle mods 片段（与 Bonds.buildMods 同格式：倍率为 1+x，加值类为增量）；未带灵兽时返回 null
  function modsForState(s, squadIds) {
    if (!s) return null;
    const b = activeBeast(s);
    if (!b) return null;
    const x = bonusAt(b.id, levelOf(s, b.id));
    const mods = { atkMult: 1 + x.teamAtk, heroMods: {} };
    (Array.isArray(squadIds) ? squadIds : []).forEach((hid) => {
      if (tagsOf(hid).includes(b.tag)) mods.heroMods[hid] = { [x.perkKey]: x.perk };
    });
    return mods;
  }

  function imgUrl(id) {
    return `assets/beasts/beast_${id}.webp?v=1`;
  }

  function avatarUrl(id) {
    return `assets/beasts/beast_${id}_avatar.webp?v=1`;
  }

  const api = {
    VERSION,
    MAX_LV,
    BEASTS,
    BY_ID,
    TEAM_ATK_PER_LV,
    normalize,
    ensureState,
    syncUnlocks,
    isOwned,
    levelOf,
    activeBeast,
    setActive,
    feedCost,
    canFeed,
    feed,
    bonusAt,
    bonusText,
    modsForState,
    imgUrl,
    avatarUrl
  };
  root.Beasts = api;
  if (typeof window !== 'undefined') window.Beasts = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
