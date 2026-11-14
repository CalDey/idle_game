// 仙姬培元：每名仙姬自己的培元等级，只加成她自身攻防血。
// 不照搬抽卡升星（没有重复抽取来源）。消耗灵玉；上限随境界提高，避免冲掉主线进度。
// 轮回保留已培元等级；生效等级为 min(已学, 当前境界上限)，超额部分突破后自动恢复，不退灵玉。
// 第一版不加绝技向独有被动，便于把战力涨幅压在约 +1～3 关。
(function () {
  const VERSION = 1;
  const PER_LEVEL = 0.005;
  const BASE_CAP = 8;
  const CAP_PER_MAJOR = 5; // 每 5 小层（约一大境的一部分）+1 上限
  const HARD_CAP = 13;
  const COST_BASE = 3;
  const COST_Q = { fan: 0.7, ling: 0.78, xuan: 0.85, di: 0.92, tian: 1, xian: 1.15 };

  function emptyGrow() {
    return { v: VERSION, lv: {} };
  }

  function normalize(raw) {
    const out = emptyGrow();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    const src = raw.lv && typeof raw.lv === 'object' && !Array.isArray(raw.lv) ? raw.lv : raw;
    Object.keys(src).forEach((id) => {
      if (id === 'v' || id === 'lv') return;
      const n = Math.floor(Number(src[id]));
      if (Number.isFinite(n) && n > 0) out.lv[id] = n;
    });
    return out;
  }

  function ensure(s) {
    if (!s || typeof s !== 'object') return emptyGrow();
    s.grow = normalize(s.grow);
    return s.grow;
  }

  function maxLevel(realmIndex) {
    const r = Math.max(0, Math.floor(Number(realmIndex) || 0));
    return Math.max(1, Math.min(HARD_CAP, BASE_CAP + Math.floor(r / CAP_PER_MAJOR)));
  }

  function maxLevelFor(s) {
    return maxLevel(s && s.realmIndex);
  }

  function storedLevel(s, heroId) {
    if (!heroId) return 0;
    const g = s && s.grow && s.grow.lv ? s.grow.lv : null;
    const n = g ? Math.floor(Number(g[heroId]) || 0) : 0;
    return n > 0 ? n : 0;
  }

  function level(s, heroId) {
    return Math.min(storedLevel(s, heroId), maxLevelFor(s));
  }

  function heroById(heroId) {
    const C = window.GameConfig;
    const list = C && Array.isArray(C.HEROES) ? C.HEROES : [];
    return list.find((h) => h && h.id === heroId) || null;
  }

  function qualityId(heroId) {
    const h = heroById(heroId);
    return (h && h.quality) || 'xian';
  }

  function costQMult(heroId) {
    const q = qualityId(heroId);
    return COST_Q[q] != null ? COST_Q[q] : 1;
  }

  function upgradeCost(s, heroId) {
    const lv = level(s, heroId);
    const cap = maxLevelFor(s);
    if (lv >= cap) return 0;
    return Math.max(2, Math.round(COST_BASE * (lv + 1) * costQMult(heroId)));
  }

  function statMult(s, heroId) {
    return 1 + level(s, heroId) * PER_LEVEL;
  }

  function meanMult(s, squadIds) {
    const ids = Array.isArray(squadIds) ? squadIds.filter(Boolean) : [];
    if (!ids.length) return 1;
    let sum = 0;
    for (let i = 0; i < ids.length; i++) sum += statMult(s, ids[i]);
    return sum / ids.length;
  }

  function decoratePlayerStats(s, stats, squadIds) {
    if (!stats) return stats;
    const ids = squadIds || stats.squad || [];
    const mean = meanMult(s, ids);
    stats.grow = s && s.grow;
    stats._growMean = mean;
    if (!(mean > 0) || mean === 1) return stats;
    stats.atk = (Number(stats.atk) || 0) * mean;
    stats.hp = (Number(stats.hp) || 0) * mean;
    stats.def = (Number(stats.def) || 0) * mean;
    const crit = stats.crit != null ? stats.crit : 0.05;
    const cd = stats.critDmg || stats.cd || 1.5;
    stats.cp = (stats.atk * 10 + stats.hp + stats.def * 8 + (Number(stats.spd) || 0) * 2) * (1 + crit * (cd - 1));
    return stats;
  }

  function unitAdj(s, heroId, mean) {
    const m = statMult(s, heroId);
    const avg = mean > 0 ? mean : 1;
    return m / avg;
  }

  function canUpgrade(s, heroId) {
    if (!s || !heroId) return { ok: false, reason: 'no_state' };
    if (window.Battle && typeof window.Battle.isHeroUnlocked === 'function' && !window.Battle.isHeroUnlocked(heroId, s)) {
      return { ok: false, reason: 'locked' };
    }
    const cap = maxLevelFor(s);
    const lv = level(s, heroId);
    if (lv >= cap) return { ok: false, reason: 'capped', cap, level: lv };
    const cost = upgradeCost(s, heroId);
    if ((Number(s.lingyu) || 0) < cost) return { ok: false, reason: 'insufficient', cost, have: Number(s.lingyu) || 0 };
    return { ok: true, cost, level: lv, cap, next: lv + 1 };
  }

  function upgrade(s, heroId) {
    const check = canUpgrade(s, heroId);
    if (!check.ok) return check;
    ensure(s);
    s.lingyu = (Number(s.lingyu) || 0) - check.cost;
    const stored = storedLevel(s, heroId);
    // 若先前轮回后上限回退，stored 可能大于生效等级；突破后 stored 已生效，此处升的是生效等级+1
    const nextStored = Math.max(stored, check.next);
    s.grow.lv[heroId] = nextStored;
    return {
      ok: true,
      cost: check.cost,
      level: level(s, heroId),
      stored: nextStored,
      cap: check.cap,
      lingyu: s.lingyu
    };
  }

  function setLevel(s, heroId, n) {
    ensure(s);
    const v = Math.max(0, Math.floor(Number(n) || 0));
    if (v <= 0) delete s.grow.lv[heroId];
    else s.grow.lv[heroId] = v;
    return level(s, heroId);
  }

  function fillSquadToCap(s) {
    const ids =
      (window.Battle && typeof window.Battle.getSquadIds === 'function' && window.Battle.getSquadIds(s)) ||
      (s && Array.isArray(s.squad) && s.squad) ||
      [];
    const cap = maxLevelFor(s);
    ids.forEach((id) => setLevel(s, id, cap));
    return { cap, ids: ids.slice() };
  }

  function anyAffordable(s) {
    const C = window.GameConfig;
    const list = C && Array.isArray(C.HEROES) ? C.HEROES : [];
    for (let i = 0; i < list.length; i++) {
      const id = list[i] && list[i].id;
      if (id && canUpgrade(s, id).ok) return true;
    }
    return false;
  }

  function snapshot(s, heroId) {
    const h = heroById(heroId);
    const cap = maxLevelFor(s);
    const lv = level(s, heroId);
    const stored = storedLevel(s, heroId);
    const cost = upgradeCost(s, heroId);
    const check = canUpgrade(s, heroId);
    return {
      id: heroId,
      name: (h && h.name) || heroId,
      quality: qualityId(heroId),
      avatar: (h && (h.avatar || h.img)) || '',
      level: lv,
      stored,
      cap,
      bonus: lv * PER_LEVEL,
      cost,
      can: check.ok,
      reason: check.ok ? '' : check.reason,
      pending: Math.max(0, stored - lv)
    };
  }

  const core = {
    VERSION,
    PER_LEVEL,
    BASE_CAP,
    CAP_PER_MAJOR,
    HARD_CAP,
    COST_BASE,
    COST_Q,
    REINCARNATION: 'keep',
    REINCARNATION_NOTE:
      '轮回保留培元等级与灵玉。生效等级为 min(已培元, 当前境界上限)；上限随境界回退时超额暂不生效，突破后自动恢复，不退还灵玉。',
    normalize,
    emptyGrow,
    ensure,
    maxLevel,
    maxLevelFor,
    storedLevel,
    level,
    statMult,
    meanMult,
    decoratePlayerStats,
    unitAdj,
    upgradeCost,
    canUpgrade,
    upgrade,
    setLevel,
    fillSquadToCap,
    anyAffordable,
    snapshot,
    qualityId
  };

  window.Grow = core;
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
})();

(function () {
  function fmt(n) {
    const x = Math.floor(Number(n) || 0);
    if (typeof window.formatNumber === 'function') return window.formatNumber(x);
    return String(x);
  }

  let els = null;
  let focusId = '';

  function qualityName(q) {
    const C = window.GameConfig;
    const list = C && C.QUALITIES;
    const found = Array.isArray(list) ? list.find((x) => x.id === q) : null;
    return (found && found.name) || '';
  }

  function renderBadge() {
    const badge = document.getElementById('badge-squad-grow');
    const btn = document.getElementById('btn-stage-squad');
    const GS = window.GameState;
    const on = !!(GS && GS.state && window.Grow && window.Grow.anyAffordable(GS.state));
    if (badge) badge.classList.toggle('visible', on);
    if (btn) btn.classList.toggle('has-grow', on);
  }

  function renderPanel() {
    if (!els || !els.modal || !window.Grow || !window.GameState || !window.GameState.state) return;
    const s = window.GameState.state;
    if (!focusId) return;
    const snap = window.Grow.snapshot(s, focusId);
    if (els.avatar) {
      if (snap.avatar) {
        els.avatar.src = snap.avatar;
        els.avatar.hidden = false;
      } else {
        els.avatar.hidden = true;
      }
    }
    if (els.name) els.name.textContent = snap.name;
    if (els.meta) {
      const qn = qualityName(snap.quality);
      els.meta.textContent = `${qn ? qn + ' · ' : ''}培元 ${snap.level}/${snap.cap}`;
    }
    if (els.bonus) {
      const pct = (snap.bonus * 100).toFixed(1).replace(/\.0$/, '');
      els.bonus.textContent = `自身攻、防、血 +${pct}%（不上阵不生效）`;
    }
    if (els.hint) {
      if (snap.pending > 0) {
        els.hint.textContent = `已培元至 ${snap.stored} 层，当前境界上限 ${snap.cap} 层，超额部分突破后恢复。`;
      } else if (snap.reason === 'capped') {
        els.hint.textContent = '已达当前境界上限，继续突破可提高培元上限。';
      } else {
        els.hint.textContent = '轮回保留培元。消耗灵玉，低品阶仙姬费用略低。';
      }
    }
    if (els.btn) {
      if (snap.reason === 'capped') {
        els.btn.disabled = true;
        els.btn.textContent = '已达上限';
      } else if (snap.reason === 'insufficient') {
        els.btn.disabled = true;
        els.btn.textContent = `灵玉不足（${fmt(snap.cost)}）`;
      } else if (snap.reason === 'locked') {
        els.btn.disabled = true;
        els.btn.textContent = '未解锁';
      } else {
        els.btn.disabled = !snap.can;
        els.btn.textContent = `培元 · 灵玉 ${fmt(snap.cost)}`;
      }
    }
  }

  function open(heroId) {
    if (!els || !els.modal || !heroId) return;
    focusId = heroId;
    renderPanel();
    els.modal.classList.add('active');
    els.modal.setAttribute('aria-hidden', 'false');
  }

  function close() {
    if (!els || !els.modal) return;
    els.modal.classList.remove('active');
    els.modal.setAttribute('aria-hidden', 'true');
    renderBadge();
  }

  function onUpgrade() {
    const GS = window.GameState;
    if (!GS || !GS.state || !window.Grow || !focusId) return;
    const res = window.Grow.upgrade(GS.state, focusId);
    if (!res.ok) {
      renderPanel();
      renderBadge();
      return;
    }
    GS.saveGame();
    renderPanel();
    renderBadge();
    if (window.StageUI && typeof window.StageUI.render === 'function') window.StageUI.render();
    if (window.StageUI && typeof window.StageUI.renderSquadModal === 'function') window.StageUI.renderSquadModal();
  }

  function init() {
    els = {
      modal: document.getElementById('grow-modal'),
      avatar: document.getElementById('grow-avatar'),
      name: document.getElementById('grow-name'),
      meta: document.getElementById('grow-meta'),
      bonus: document.getElementById('grow-bonus'),
      hint: document.getElementById('grow-hint'),
      btn: document.getElementById('btn-grow-upgrade'),
      close: document.getElementById('btn-close-grow')
    };
    if (!els.modal) {
      els = null;
      return;
    }
    if (els.close) els.close.addEventListener('click', close);
    if (els.btn) els.btn.addEventListener('click', onUpgrade);
    renderBadge();
  }

  window.GrowUI = {
    open,
    close,
    refresh: renderBadge,
    refreshBadge: renderBadge,
    renderPanel
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
