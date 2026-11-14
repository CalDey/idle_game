// 新手体验：前三步高亮引导、常驻「当前目标」、法宝解锁提示、页签红点、锁定内容门槛提示、弹窗 Esc / 点遮罩关闭。
// 纯函数挂在 window.Newbie 上，供 tools/newbie-ux.test.js 在 node vm 里校验；DOM 部分只在 init() 之后运行。
(function () {
  // 与设置弹窗「境界体系」一致的说明，锁定提示里复用。
  const REALM_CHAIN_TEXT = '搬血 → 洞天 → 化灵 → 铭纹 → 列阵 → 尊者 → 神火 → 真一 → 圣祭 → 天神 → 虚道 → 斩我 → 遁一 → 至尊（各分初/中/后）';
  const TOTAL_REALMS = 42;
  const GUIDE_TAPS = 3;
  const GEAR_POPUP_DELAY_MS = 1400;

  function cfg() {
    return window.GameConfig || {};
  }

  function fmt(n) {
    const f = cfg().formatNumber;
    return typeof f === 'function' ? f(n) : String(n);
  }

  function peachUnlockRealm() {
    return (cfg().PEACH && cfg().PEACH.UNLOCK_REALM) || 1;
  }

  function stageUnlockRealm() {
    return (cfg().BATTLE && cfg().BATTLE.UNLOCK_REALM) || 2;
  }

  // ---------- 境界门槛 ----------
  function realmName(idx) {
    const list = cfg().REALM_STAGES || [];
    const st = list[Math.max(0, Math.min(list.length - 1, Math.floor(idx || 0)))];
    return st ? st.fullName : '';
  }

  function realmGap(cur, target) {
    return Math.max(0, Math.floor(Number(target) || 0) - Math.floor(Number(cur) || 0));
  }

  function realmGapText(cur, target) {
    const gap = realmGap(cur, target);
    return gap > 0 ? `还差${gap}重` : '已达成';
  }

  function realmGateText(cur, target) {
    return `需突破至【${realmName(target)}】· ${realmGapText(cur, target)}`;
  }

  function stageLabel(n) {
    const num = Math.max(1, Math.floor(n || 1));
    return `${Math.ceil(num / 10)}-${((num - 1) % 10) + 1}`;
  }

  // ---------- 新手引导 ----------
  // snap: { realmIndex, qiReady, gearVisited }
  function advanceGuide(guide, snap) {
    const g = { ...(guide || {}) };
    const sn = snap || {};
    if (g.done) {
      g.step = 3;
      return g;
    }
    g.step = Math.max(0, Math.floor(g.step || 0));
    if (g.step === 0 && ((g.taps || 0) >= GUIDE_TAPS || (sn.realmIndex || 0) >= 1 || sn.qiReady)) g.step = 1;
    if (g.step === 1 && (sn.realmIndex || 0) >= 1) g.step = 2;
    if (g.step === 2 && (g.gearVisited || sn.gearVisited)) g.step = 3;
    if (g.step >= 3) {
      g.step = 3;
      g.done = true;
    }
    return g;
  }

  function guideTarget(guide, snap) {
    if (!guide || guide.done) return null;
    if (guide.step === 0) return 'portrait';
    if (guide.step === 1) return 'breakthrough';
    if (guide.step === 2 && ((snap && snap.realmIndex) || 0) >= peachUnlockRealm()) return 'gear-tab';
    return null;
  }

  // ---------- 当前目标 ----------
  function sumLv(map) {
    if (!map) return 0;
    return Object.keys(map).reduce((sum, k) => sum + (Number(map[k]) || 0), 0);
  }

  function hasAnyEquip(s) {
    const eq = s && s.equip;
    if (!eq) return false;
    return Object.keys(eq).some((k) => Boolean(eq[k]));
  }

  function bestStage(s) {
    return (s && s.stage && Number(s.stage.best)) || 0;
  }

  function realmGoal(id, target, suffix) {
    return {
      id,
      tab: 'tab-cultivate',
      realm: target,
      text: () => `突破至${realmName(target)}${suffix || ''}`,
      done: (s) => (s.realmIndex || 0) >= target
    };
  }

  const STATIC_GOALS = [
    realmGoal('realm1', 1),
    {
      id: 'peach',
      tab: 'tab-gear',
      text: () => '去法宝页摘桃',
      done: (s) => (s.peachesPicked || 0) >= 1 || hasAnyEquip(s)
    },
    realmGoal('realm2', 2, '（开启闯关）'),
    { id: 'stage1', tab: 'tab-stage', text: () => '通关1-1', done: (s) => bestStage(s) >= 1 },
    { id: 'gongfa', tab: 'tab-upgrades', text: () => '去洞府参悟一层功法', done: (s) => sumLv(s.gongfa) >= 2 },
    realmGoal('realm3', 3),
    { id: 'stage10', tab: 'tab-stage', text: () => '通关1-10（首领山魈娘娘）', done: (s) => bestStage(s) >= 10 }
  ];

  function currentGoal(s) {
    const st = s || {};
    for (let i = 0; i < STATIC_GOALS.length; i++) {
      const g = STATIC_GOALS[i];
      if (!g.done(st)) {
        return { id: g.id, text: g.text(st), tab: g.tab, realm: g.realm };
      }
    }
    const realm = st.realmIndex || 0;
    const gates = cfg().TRIBULATION_GATES || {};
    const gate = cfg().ENABLE_STAGE_GATES ? gates[realm] : null;
    if (gate && bestStage(st) < gate.stage) {
      return { id: `gate${realm}`, text: `击败第${gate.chapter}章首领【${gate.boss}】`, tab: 'tab-stage' };
    }
    const total = (cfg().REALM_STAGES || []).length || TOTAL_REALMS;
    if (realm < total - 1) {
      return { id: `realm${realm + 1}`, text: `突破至${realmName(realm + 1)}`, tab: 'tab-cultivate', realm: realm + 1 };
    }
    return { id: 'reincarnate', text: '去轮回转世，凝结道果', tab: 'tab-reincarnate' };
  }

  function isGoalDone(goal, s) {
    if (!goal || !s) return false;
    if (goal.realm !== undefined) return (s.realmIndex || 0) >= goal.realm;
    const g = STATIC_GOALS.find((item) => item.id === goal.id);
    if (g) return g.done(s);
    if (goal.id === 'reincarnate') return false;
    return currentGoal(s).id !== goal.id;
  }

  // 目标进度：只给「下一重突破」显示灵气进度。
  function goalProgress(goal, s, stage) {
    if (!goal || goal.realm === undefined || !stage || stage.isMaxStage) return '';
    if ((s.realmIndex || 0) + 1 !== goal.realm) return '';
    const pct = Math.min(100, Math.floor(((s.qi || 0) / Math.max(1, stage.reqQi)) * 100));
    return `灵气 ${pct}%`;
  }

  // ---------- 红点 ----------
  function gearDot(s, now) {
    if (!s || (s.realmIndex || 0) < peachUnlockRealm()) return false;
    if (s.guide && !s.guide.gearVisited) return true;
    if (s.pending) return true;
    const tree = s.tree || {};
    if ((tree.peaches || 0) >= 10) return true;
    if (tree.upEnd && tree.upEnd <= (now || Date.now())) return true;
    return false;
  }

  // api: { playerStats(s), enemyFor(n) }
  function stageDot(s, api, now) {
    if (!s || (s.realmIndex || 0) < stageUnlockRealm()) return false;
    const st = s.stage || {};
    const best = Number(st.best) || 0;
    if (best > 0 && st.idleAt && (now || Date.now()) - st.idleAt >= 3600 * 1000) return true;
    if (best >= 300 || !api || typeof api.playerStats !== 'function' || typeof api.enemyFor !== 'function') return false;
    const cur = Math.max(1, Math.min(300, Number(st.cur) || best + 1));
    const player = api.playerStats(s);
    const enemy = api.enemyFor(cur);
    if (!player || !enemy) return false;
    return Number(player.cp) >= Number(enemy.cp);
  }

  // api: { getGongfaCost(item), getDongfuCost(item) } — 与 game.js 洞府红点同口径
  function upgradeDot(s, api) {
    if (!s || !api) return false;
    const realm = s.realmIndex || 0;
    const stones = s.stones || 0;
    const ok = (list, costFn) =>
      (list || []).some((item) => realm >= item.unlockRealmIndex && stones >= costFn(item));
    return ok(cfg().GONGFA_LIST, api.getGongfaCost) || ok(cfg().DONGFU_LIST, api.getDongfuCost);
  }

  // ---------- 装备对比 ----------
  function compareDiff(oldCp, newCp) {
    const delta = Math.round(Number(newCp) || 0) - Math.round(Number(oldCp) || 0);
    const sign = delta > 0 ? 'up' : delta < 0 ? 'down' : 'same';
    const arrow = sign === 'up' ? '↑' : sign === 'down' ? '↓' : '＝';
    const num = delta > 0 ? `+${fmt(delta)}` : delta < 0 ? `-${fmt(Math.abs(delta))}` : '0';
    return {
      delta,
      sign,
      arrow,
      better: delta > 0,
      color: sign === 'up' ? '#7ddea0' : sign === 'down' ? '#f07167' : '#e7e2d6',
      text: `战力 ${arrow} ${num}`
    };
  }

  // ---------- 弹窗关闭 ----------
  function topActiveModal(doc) {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d) return null;
    const list = d.querySelectorAll('.modal-backdrop.active');
    return list && list.length ? list[list.length - 1] : null;
  }

  function closeModal(modal) {
    if (!modal) return false;
    const btn = modal.querySelector('[data-modal-close]');
    if (btn && !btn.disabled && typeof btn.click === 'function') btn.click();
    if (modal.classList.contains('active')) {
      modal.classList.remove('active');
      if (modal.hasAttribute && modal.hasAttribute('aria-hidden')) modal.setAttribute('aria-hidden', 'true');
    }
    return true;
  }

  function handleEscKey(e, doc) {
    if (!e || e.key !== 'Escape' || e.defaultPrevented) return false;
    const m = topActiveModal(doc);
    if (!m) return false;
    if (typeof e.preventDefault === 'function') e.preventDefault();
    return closeModal(m);
  }

  function handleBackdropClick(e) {
    const t = e && e.target;
    if (!t || !t.classList || !t.classList.contains('modal-backdrop') || !t.classList.contains('active')) return false;
    return closeModal(t);
  }

  // ====================== DOM 部分 ======================
  let api = { switchTab() {}, log() {} };
  let els = {};
  let started = false;
  let lastGoal = null;
  let gearPopupTimer = 0;
  let lastFocusEl = null;
  let tickTimer = 0;

  function S() {
    return window.GameState && window.GameState.state;
  }

  function ensureGuide(s) {
    if (!s.guide || typeof s.guide !== 'object') {
      s.guide = window.GameState && window.GameState.defaultGuide
        ? window.GameState.defaultGuide()
        : { v: 1, step: 0, done: false, taps: 0, gearPopup: false, gearVisited: false };
    }
    return s.guide;
  }

  function activeTab() {
    return (els.app && els.app.dataset.tab) || 'tab-cultivate';
  }

  function anyModalOpen() {
    return Boolean(topActiveModal(document));
  }

  function setFocus(el) {
    if (lastFocusEl && lastFocusEl !== el) lastFocusEl.classList.remove('guide-focus');
    if (el) el.classList.add('guide-focus');
    lastFocusEl = el || null;
  }

  function hideBubble() {
    if (els.bubble) els.bubble.hidden = true;
    setFocus(null);
  }

  function placeBubble(target, text) {
    if (!els.bubble || !els.app || !target) return hideBubble();
    const tr = target.getBoundingClientRect();
    if (!tr || tr.width <= 0 || tr.height <= 0) return hideBubble();
    const ar = els.app.getBoundingClientRect();
    els.bubbleText.textContent = text;
    els.bubble.hidden = false;
    const bw = els.bubble.offsetWidth;
    const bh = els.bubble.offsetHeight;
    const cx = tr.left - ar.left + tr.width / 2;
    let left = Math.max(6, Math.min(ar.width - bw - 6, cx - bw / 2));
    let top = tr.top - ar.top - bh - 12;
    let below = false;
    if (top < 52) {
      top = tr.bottom - ar.top + 12;
      below = true;
    }
    els.bubble.style.left = `${Math.round(left)}px`;
    els.bubble.style.top = `${Math.round(top)}px`;
    els.bubble.style.setProperty('--arrow-x', `${Math.round(cx - left)}px`);
    els.bubble.classList.toggle('is-below', below);
    setFocus(target);
  }

  function renderGuide(s) {
    const guide = ensureGuide(s);
    const stage = window.GameState.getCurrentStage();
    const snap = {
      realmIndex: s.realmIndex || 0,
      qiReady: !stage.isMaxStage && (s.qi || 0) >= stage.reqQi,
      gearVisited: guide.gearVisited
    };
    const next = advanceGuide(guide, snap);
    if (next.step !== guide.step || next.done !== guide.done) {
      Object.assign(guide, next);
      window.GameState.saveGame();
    }
    const target = guideTarget(guide, snap);
    if (!target || anyModalOpen()) return hideBubble();
    if (target === 'gear-tab') {
      return placeBubble(els.navGear, '法宝已开启，去摘桃');
    }
    if (activeTab() !== 'tab-cultivate') return hideBubble();
    if (target === 'portrait') {
      return placeBubble(els.caption, '点击立绘，凝神吐纳灵气');
    }
    if (target === 'breakthrough') {
      return placeBubble(els.btnBreak, snap.qiReady ? '灵气已满，点击突破境界' : '灵气积满后，点这里突破');
    }
    return hideBubble();
  }

  function renderGoal(s) {
    if (!els.goal) return;
    const goal = currentGoal(s);
    const stage = window.GameState.getCurrentStage();
    if (lastGoal && goal.id !== lastGoal.id && isGoalDone(lastGoal, s)) {
      els.goal.classList.remove('is-done');
      void els.goal.offsetWidth;
      els.goal.classList.add('is-done');
      api.log(`目标达成：${lastGoal.text}。新目标：${goal.text}`, 'gold');
    }
    lastGoal = goal;
    els.goal.hidden = false;
    els.goal.dataset.goal = goal.id;
    els.goal.dataset.tab = goal.tab;
    if (els.goalText.textContent !== goal.text) els.goalText.textContent = goal.text;
    const prog = goalProgress(goal, s, stage);
    if (els.goalProgress.textContent !== prog) els.goalProgress.textContent = prog;
  }

  function renderDots(s) {
    const now = Date.now();
    if (els.badgeStage) {
      const on =
        activeTab() !== 'tab-stage' &&
        stageDot(s, { playerStats: window.Battle && window.Battle.playerStats, enemyFor: window.Battle && window.Battle.enemyFor }, now);
      els.badgeStage.classList.toggle('visible', Boolean(on));
    }
  }

  function maybeGearPopup(s) {
    const guide = ensureGuide(s);
    if (guide.gearPopup || (s.realmIndex || 0) < peachUnlockRealm() || gearPopupTimer) return;
    gearPopupTimer = setTimeout(function tryShow() {
      const st = S();
      const g = ensureGuide(st);
      if (g.gearPopup) {
        gearPopupTimer = 0;
        return;
      }
      if (anyModalOpen()) {
        gearPopupTimer = setTimeout(tryShow, 1000);
        return;
      }
      gearPopupTimer = 0;
      g.gearPopup = true;
      window.GameState.saveGame();
      if (els.unlockModal) {
        els.unlockModal.classList.add('active');
        els.unlockModal.setAttribute('aria-hidden', 'false');
      }
    }, GEAR_POPUP_DELAY_MS);
  }

  function closeUnlockModal() {
    if (!els.unlockModal) return;
    els.unlockModal.classList.remove('active');
    els.unlockModal.setAttribute('aria-hidden', 'true');
  }

  // 锁定卡片：data-lock-realm 写门槛和「还差X重」，data-realm-chain 写境界体系说明。
  function renderLocks(s) {
    const realm = s.realmIndex || 0;
    document.querySelectorAll('[data-lock-realm]').forEach((el) => {
      const target = Number(el.getAttribute('data-lock-realm')) || 0;
      const t = realmGateText(realm, target);
      if (el.textContent !== t) el.textContent = t;
    });
    document.querySelectorAll('[data-realm-chain]').forEach((el) => {
      const t = `境界共${TOTAL_REALMS}重：${REALM_CHAIN_TEXT}`;
      if (el.textContent !== t) el.textContent = t;
    });
  }

  function tick() {
    const s = S();
    if (!s) return;
    renderLocks(s);
    const guide = ensureGuide(s);
    if (activeTab() === 'tab-gear' && (s.realmIndex || 0) >= peachUnlockRealm() && !guide.gearVisited) {
      guide.gearVisited = true;
      window.GameState.saveGame();
    }
    maybeGearPopup(s);
    renderGoal(s);
    renderGuide(s);
    renderDots(s);
  }

  function init(hooks) {
    if (started) return;
    started = true;
    api = { ...api, ...(hooks || {}) };
    els = {
      app: document.querySelector('.app-container'),
      goal: document.getElementById('goal-strip'),
      goalText: document.getElementById('goal-text'),
      goalProgress: document.getElementById('goal-progress'),
      bubble: document.getElementById('guide-bubble'),
      bubbleText: document.getElementById('guide-bubble-text'),
      caption: document.querySelector('#meditation-zone .meditation-caption'),
      zone: document.getElementById('meditation-zone'),
      btnBreak: document.getElementById('btn-breakthrough'),
      navGear: document.querySelector('.nav-btn[data-tab="tab-gear"]'),
      badgeStage: document.getElementById('badge-stage'),
      unlockModal: document.getElementById('unlock-modal'),
      btnUnlockGo: document.getElementById('btn-unlock-go'),
      btnUnlockLater: document.getElementById('btn-unlock-later')
    };

    if (els.zone) {
      els.zone.addEventListener('pointerdown', (e) => {
        if (e && e.target && typeof e.target.closest === 'function' && e.target.closest('#title-plate')) return;
        const s = S();
        if (!s) return;
        const guide = ensureGuide(s);
        if (!guide.done && guide.step === 0) {
          guide.taps = (guide.taps || 0) + 1;
          renderGuide(s);
        }
      });
    }
    if (els.goal) {
      els.goal.addEventListener('click', () => {
        const tab = els.goal.dataset.tab;
        if (tab) api.switchTab(tab);
      });
    }
    if (els.btnUnlockLater) els.btnUnlockLater.addEventListener('click', closeUnlockModal);
    if (els.btnUnlockGo) {
      els.btnUnlockGo.addEventListener('click', () => {
        closeUnlockModal();
        api.switchTab('tab-gear');
        tick();
      });
    }

    // 捕获阶段：先于各模块自己的 Esc 处理，只关最上层一个弹窗（关闭走该弹窗自己的关闭按钮逻辑）
    document.addEventListener('keydown', (e) => handleEscKey(e, document), true);
    document.addEventListener('click', handleBackdropClick);
    window.addEventListener('resize', () => {
      const s = S();
      if (s) renderGuide(s);
    });

    tick();
    tickTimer = setInterval(tick, 500);
  }

  window.Newbie = {
    REALM_CHAIN_TEXT,
    TOTAL_REALMS,
    GUIDE_TAPS,
    realmName,
    realmGap,
    realmGapText,
    realmGateText,
    stageLabel,
    advanceGuide,
    guideTarget,
    currentGoal,
    isGoalDone,
    goalProgress,
    gearDot,
    stageDot,
    upgradeDot,
    compareDiff,
    topActiveModal,
    closeModal,
    handleEscKey,
    handleBackdropClick,
    init,
    tick
  };
})();
