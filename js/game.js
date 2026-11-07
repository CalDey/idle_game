// 修仙挂机 - 主循环、交互与界面渲染
(function () {
  const {
    REALM_STAGES,
    GONGFA_LIST,
    DONGFU_LIST,
    DAOGUO_TALENTS,
    REINCARNATION_MIN_STAGE,
    QUALITIES,
    HOME_TIERS,
    HOME_SCENE,
    homeBuildingTier,
    homeBgTier,
    formatNumber,
    formatDuration
  } = window.GameConfig;

  const GameState = window.GameState;

  let lastTickTime = performance.now();
  let autoSaveTimer = 0;
  const AUTO_SAVE_INTERVAL_MS = 4000;
  let confirmCallback = null;

  // DOM 缓存
  const els = {};

  function cacheElements() {
    els.realmPill = document.getElementById('header-realm-pill');
    els.realmText = document.getElementById('header-realm-text');
    els.qiVal = document.getElementById('res-qi-val');
    els.qiRate = document.getElementById('res-qi-rate');
    els.stoneVal = document.getElementById('res-stone-val');
    els.stoneRate = document.getElementById('res-stone-rate');
    els.daoguoVal = document.getElementById('res-daoguo-val');
    els.daoguoMult = document.getElementById('res-daoguo-mult');

    els.tabCultivate = document.getElementById('tab-cultivate');
    els.meditationZone = document.getElementById('meditation-zone');
    els.chkPortraitFocus = document.getElementById('chk-portrait-focus');
    els.titlePlateName = document.getElementById('title-plate-name');
    els.tapGainHint = document.getElementById('tap-gain-hint');

    els.realmDesc = document.getElementById('realm-desc');
    els.qiProgressText = document.getElementById('qi-progress-text');
    els.qiProgressPercent = document.getElementById('qi-progress-percent');
    els.qiProgressBar = document.getElementById('qi-progress-bar');
    els.breakthroughRate = document.getElementById('breakthrough-rate');
    els.breakthroughPenalty = document.getElementById('breakthrough-penalty');
    els.btnBreakthrough = document.getElementById('btn-breakthrough');

    els.logBox = document.getElementById('cultivation-log');
    els.logModal = document.getElementById('log-modal');
    els.btnOpenLog = document.getElementById('btn-open-log');
    els.btnCloseLog = document.getElementById('btn-close-log');
    els.badgeLog = document.getElementById('badge-log');
    els.roleModal = document.getElementById('role-modal');
    els.roleList = document.getElementById('role-list');
    els.btnOpenRole = document.getElementById('btn-open-role');
    els.btnCloseRole = document.getElementById('btn-close-role');
    els.gongfaList = document.getElementById('gongfa-list');

    els.tabUpgrades = document.getElementById('tab-upgrades');
    els.homeCard = document.querySelector('#tab-upgrades .home-card');
    els.homeScene = document.getElementById('home-scene');
    els.homeStage = document.getElementById('home-stage');
    els.homeGlow = document.getElementById('home-glow');
    els.homeLayer = document.getElementById('home-layer');
    els.homeTitle = document.getElementById('home-title');
    els.homeReveal = document.getElementById('home-reveal');
    els.btnHomeUpgrade = document.getElementById('btn-home-upgrade');
    els.badgeHomeUpgrade = document.getElementById('badge-home-upgrade');

    els.homeUpgradeModal = document.getElementById('home-upgrade-modal');
    els.homeUpgradeList = document.getElementById('home-upgrade-list');
    els.btnCloseHomeUpgrade = document.getElementById('btn-close-home-upgrade');
    els.homeModalScroll = document.getElementById('home-modal-scroll');
    els.homeTabBtnDongfu = document.getElementById('home-tab-btn-dongfu');
    els.homeTabBtnGongfa = document.getElementById('home-tab-btn-gongfa');
    els.homeModalPaneDongfu = document.getElementById('home-modal-pane-dongfu');
    els.homeModalPaneGongfa = document.getElementById('home-modal-pane-gongfa');
    els.badgeHomeTabDongfu = document.getElementById('badge-home-tab-dongfu');
    els.badgeHomeTabGongfa = document.getElementById('badge-home-tab-gongfa');

    els.reincarnateCount = document.getElementById('reincarnate-count');
    els.reincarnateMult = document.getElementById('reincarnate-mult');
    els.pendingDaoguo = document.getElementById('pending-daoguo');
    els.reincarnateReqHint = document.getElementById('reincarnate-req-hint');
    els.btnReincarnate = document.getElementById('btn-reincarnate');
    els.talentList = document.getElementById('talent-list');

    els.lastSaveStatus = document.getElementById('last-save-status');
    els.btnManualSave = document.getElementById('btn-manual-save');
    els.btnResetSave = document.getElementById('btn-reset-save');

    els.badgeBreakthrough = document.getElementById('badge-breakthrough');
    els.badgeUpgrade = document.getElementById('badge-upgrade');
    els.badgeReincarnate = document.getElementById('badge-reincarnate');

    els.offlineModal = document.getElementById('offline-modal');
    els.offlineDuration = document.getElementById('offline-duration');
    els.offlineQi = document.getElementById('offline-qi');
    els.offlineStone = document.getElementById('offline-stone');
    els.offlineCapNote = document.getElementById('offline-cap-note');
    els.btnCloseOffline = document.getElementById('btn-close-offline');

    els.confirmModal = document.getElementById('confirm-modal');
    els.confirmTitle = document.getElementById('confirm-title');
    els.confirmMessage = document.getElementById('confirm-message');
    els.btnConfirmYes = document.getElementById('btn-confirm-yes');
    els.btnConfirmNo = document.getElementById('btn-confirm-no');

    els.heroStill = document.getElementById('hero-still');
    els.heroFallback = document.getElementById('hero-fallback');
    els.fighterPlayer = document.getElementById('fighter-player');
    els.tabStage = document.getElementById('tab-stage');
    els.heroFrame = document.querySelector('.hero-frame');
    els.realmFlash = document.getElementById('realm-flash');
    els.realmShockwave = document.getElementById('realm-shockwave');
    els.qiMotes = document.getElementById('qi-motes');
    els.appContainer = document.querySelector('.app-container');
  }

  // 立绘光效只改表现，不改数值。按人道十四境配色，兼容旧存档 fallback。
  const REALM_AURAS = {
    banxue: { core: '#67e8f9', glow: 'rgba(103, 232, 249, 0.55)', mote: 'rgba(186, 244, 255, 0.95)' },
    dongtian: { core: '#38bdf8', glow: 'rgba(56, 189, 248, 0.55)', mote: 'rgba(186, 230, 253, 0.95)' },
    hualing: { core: '#4ade80', glow: 'rgba(74, 222, 128, 0.5)', mote: 'rgba(190, 255, 214, 0.95)' },
    mingwen: { core: '#2dd4bf', glow: 'rgba(45, 212, 191, 0.55)', mote: 'rgba(153, 246, 228, 0.95)' },
    liezhen: { core: '#34d399', glow: 'rgba(52, 211, 153, 0.55)', mote: 'rgba(167, 243, 208, 0.95)' },
    zunzhe: { core: '#f5c76a', glow: 'rgba(245, 199, 106, 0.58)', mote: 'rgba(255, 226, 160, 0.96)' },
    shenhuo: { core: '#fb923c', glow: 'rgba(251, 146, 60, 0.58)', mote: 'rgba(254, 215, 170, 0.96)' },
    zhenyi: { core: '#facc15', glow: 'rgba(250, 204, 21, 0.58)', mote: 'rgba(254, 240, 138, 0.96)' },
    shengji: { core: '#f87171', glow: 'rgba(248, 113, 113, 0.58)', mote: 'rgba(254, 202, 202, 0.96)' },
    tianshen: { core: '#c084fc', glow: 'rgba(192, 132, 252, 0.58)', mote: 'rgba(230, 204, 255, 0.96)' },
    xudao: { core: '#a78bfa', glow: 'rgba(167, 139, 250, 0.58)', mote: 'rgba(221, 214, 254, 0.96)' },
    zhanwo: { core: '#e879f9', glow: 'rgba(232, 121, 249, 0.58)', mote: 'rgba(245, 208, 254, 0.96)' },
    dunyi: { core: '#fde047', glow: 'rgba(253, 224, 71, 0.60)', mote: 'rgba(254, 249, 195, 0.97)' },
    zhizun: { core: '#fff3c4', glow: 'rgba(255, 236, 180, 0.62)', mote: 'rgba(255, 248, 226, 0.98)' },
    lianqi: { core: '#67e8f9', glow: 'rgba(103, 232, 249, 0.55)', mote: 'rgba(186, 244, 255, 0.95)' },
    zhuji: { core: '#4ade80', glow: 'rgba(74, 222, 128, 0.5)', mote: 'rgba(190, 255, 214, 0.95)' },
    jindan: { core: '#f5c76a', glow: 'rgba(245, 199, 106, 0.58)', mote: 'rgba(255, 226, 160, 0.96)' },
    yuanying: { core: '#c084fc', glow: 'rgba(192, 132, 252, 0.58)', mote: 'rgba(230, 204, 255, 0.96)' },
    huashen: { core: '#fff3c4', glow: 'rgba(255, 236, 180, 0.62)', mote: 'rgba(255, 248, 226, 0.98)' }
  };
  let auraMoteColor = REALM_AURAS.banxue.mote;
  let lastAuraRealm = '';
  let burstMotes = function () {};

  function syncRealmAura(stage) {
    const aura = REALM_AURAS[stage.majorId] || REALM_AURAS.banxue;
    auraMoteColor = aura.mote;
    if (stage.majorId === lastAuraRealm) return;
    lastAuraRealm = stage.majorId;
    const root = document.documentElement;
    root.style.setProperty('--aura', aura.core);
    root.style.setProperty('--aura-glow', aura.glow);
    if (els.meditationZone) els.meditationZone.dataset.realm = stage.majorId;
    if (els.appContainer) els.appContainer.dataset.realm = stage.majorId;
  }

  function triggerRealmFx(kind) {
    const flash = els.realmFlash;
    const shock = els.realmShockwave;
    const frame = els.heroFrame;
    if (flash) {
      flash.classList.remove('play', 'play-fail');
      void flash.offsetWidth;
      flash.classList.add(kind === 'success' ? 'play' : 'play-fail');
    }
    if (kind === 'success') {
      if (shock) {
        shock.classList.remove('play');
        void shock.offsetWidth;
        shock.classList.add('play');
      }
      burstMotes(26);
    } else if (frame) {
      frame.classList.remove('is-shaking');
      void frame.offsetWidth;
      frame.classList.add('is-shaking');
    }
  }

  function addLog(text, type = '') {
    if (!els.logBox) return;
    const now = new Date();
    const timeStr = [
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0')
    ].join(':');

    const div = document.createElement('div');
    div.className = `log-entry ${type}`;
    div.innerHTML = `<span class="log-time">[${timeStr}]</span>${text}`;
    els.logBox.prepend(div);

    while (els.logBox.children.length > 35) {
      els.logBox.removeChild(els.logBox.lastChild);
    }

    if (els.badgeLog && (!els.logModal || !els.logModal.classList.contains('active'))) {
      els.badgeLog.classList.add('visible');
    }
  }

  function spawnFloatText(x, y, text) {
    if (!els.meditationZone) return;
    const rect = els.meditationZone.getBoundingClientRect();
    const relX = x ? x - rect.left : rect.width / 2 + (Math.random() * 60 - 30);
    const relY = y ? y - rect.top : rect.height / 2 + (Math.random() * 30 - 15);

    const span = document.createElement('span');
    span.className = 'float-text';
    span.style.left = `${relX}px`;
    span.style.top = `${relY}px`;
    span.textContent = text;
    els.meditationZone.appendChild(span);
    spawnTapRipple(relX, relY);

    setTimeout(() => {
      if (span.parentNode) span.parentNode.removeChild(span);
    }, 980);
  }

  function spawnTapRipple(x, y) {
    if (!els.meditationZone) return;
    const ripple = document.createElement('span');
    ripple.className = 'tap-ripple';
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    els.meditationZone.appendChild(ripple);
    setTimeout(() => {
      if (ripple.parentNode) ripple.parentNode.removeChild(ripple);
    }, 680);
  }

  const PORTRAIT_FOCUS_KEY = 'xiuxian_portrait_focus';

  function applyPortraitFocus(on) {
    const active = Boolean(on);
    const tab = els.tabCultivate || document.getElementById('tab-cultivate');
    const chk = els.chkPortraitFocus || document.getElementById('chk-portrait-focus');
    if (tab) {
      tab.classList.toggle('is-portrait-focus', active);
    }
    if (els.appContainer) {
      els.appContainer.classList.toggle('is-portrait-focus', active);
    }
    if (chk) {
      chk.checked = active;
    }
    try {
      localStorage.setItem(PORTRAIT_FOCUS_KEY, active ? '1' : '0');
    } catch (err) {}
  }

  function restorePortraitFocus() {
    let on = false;
    try {
      on = localStorage.getItem(PORTRAIT_FOCUS_KEY) === '1';
    } catch (err) {
      on = false;
    }
    applyPortraitFocus(on);
  }

  // 点击打坐区获取额外灵气
  function handleMeditationTap(e) {
    if (e && e.target && typeof e.target.closest === 'function' && e.target.closest('#title-plate')) {
      return;
    }
    const gain = GameState.getTapQiGain();
    GameState.state.qi += gain;
    GameState.state.lifetimeQi = (GameState.state.lifetimeQi || 0) + gain;
    GameState.state.totalClicks = (GameState.state.totalClicks || 0) + 1;
    if (window.Titles) Titles.noteTap(GameState.state);

    let clientX = null;
    let clientY = null;
    if (e && typeof e.clientX === 'number') {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    spawnFloatText(clientX, clientY, `+${formatNumber(gain)} 灵气`);
    updateHeaderAndMeditationUI();
  }

  // 境界突破 / 渡劫
  function attemptBreakthrough() {
    const s = GameState.state;
    const stage = GameState.getCurrentStage();
    if (stage.isMaxStage) {
      addLog('道友已臻至至尊后大圆满，可前往【轮回】转世重修，凝聚无上道果！', 'gold');
      return;
    }
    const gate = window.Equip && Equip.tribulationLock(GameState.state);
    if (gate) {
      addLog(`大境界渡劫前需先击败【${gate.boss}】（第 ${gate.chapter} 章）。`, 'warn');
      switchToTab('tab-stage');
      return;
    }
    if (s.qi < stage.reqQi) {
      addLog(`灵气尚未充盈，还需 ${formatNumber(stage.reqQi - s.qi)} 灵气方可尝试破境。`, 'warn');
      return;
    }

    const rate = GameState.getBreakthroughSuccessRate();
    const roll = Math.random();
    const actionName = stage.isMajorTribulation ? '渡劫破境' : '突破境界';

    if (roll < rate) {
      // 突破成功：扣除所需灵气，晋升下一层
      s.qi = Math.max(0, s.qi - stage.reqQi);
      s.realmIndex += 1;
      s.pityBonus = 0;
      const nextStage = GameState.getCurrentStage();
      if (stage.isMajorTribulation) {
        addLog(`天降祥瑞，雷劫散尽！恭喜道友渡劫成功，正式踏入【${nextStage.fullName}】！`, 'gold');
      } else {
        addLog(`气海翻腾，水到渠成！成功突破至【${nextStage.fullName}】！`, 'success');
      }
      if (s.realmIndex === (window.GameConfig.BATTLE && window.GameConfig.BATTLE.UNLOCK_REALM)) {
        addLog('闯关已开，黑风寨主在第 3 章等你。', 'gold');
      }
      renderUpgradeLists();
      renderReincarnationUI();
      if (window.StageUI) StageUI.render();
      GameState.saveGame();
      triggerRealmFx('success');
      if (window.Titles) Titles.sync(s);
      if (window.TitlesUI) TitlesUI.flushToasts();
    } else {
      // 突破失败：损失部分当前灵气，并增加气运补偿
      const loss = Math.floor(s.qi * stage.failureLossRatio);
      s.qi = Math.max(0, s.qi - loss);
      s.pityBonus = Math.min(0.35, (s.pityBonus || 0) + 0.04);
      s.failBreakthroughs = (s.failBreakthroughs || 0) + 1;
      addLog(
        `${actionName}受挫，心神震荡，散去 ${formatNumber(loss)} 灵气（下次破境成功率 +4%）。`,
        'warn'
      );
      GameState.saveGame();
      triggerRealmFx('fail');
      if (window.Titles) Titles.sync(s);
      if (window.TitlesUI) TitlesUI.flushToasts();
    }

    updateHeaderAndMeditationUI();
  }

  // 构建功法列表与洞府场景
  function renderUpgradeLists() {
    const s = GameState.state;
    const stage = GameState.getCurrentStage();

    // 功法列表
    if (els.gongfaList) {
      els.gongfaList.innerHTML = '';
      GONGFA_LIST.forEach((item) => {
        const unlocked = s.realmIndex >= item.unlockRealmIndex;
        const lv = (s.gongfa && s.gongfa[item.id]) || 0;
        const cost = GameState.getGongfaCost(item);
        const canAfford = unlocked && s.stones >= cost;
        const reqStageName = REALM_STAGES[item.unlockRealmIndex].fullName;
        const perLvEffect = item.baseQiPerSec * stage.multiplier * GameState.getDaoGuoQiMultiplier();

        const row = document.createElement('div');
        row.className = 'upgrade-item' + (unlocked ? '' : ' locked');
        row.innerHTML = `
          <div class="upgrade-icon-wrap">
            <img class="gi upgrade-icon" src="assets/icons/gf_${item.id}.webp?v=18" alt="" aria-hidden="true" loading="lazy">
          </div>
          <div class="upgrade-meta">
            <div class="upgrade-name-row">
              <span class="upgrade-name">${item.name}</span>
              <span class="upgrade-lv">${unlocked ? `第 ${lv} 层` : `需 ${reqStageName}`}</span>
            </div>
            <div class="upgrade-desc">${item.desc}</div>
            <div class="upgrade-effect">每层效果：+${formatNumber(perLvEffect)} 灵气/秒</div>
          </div>
          <button class="btn btn-cost ${canAfford ? 'btn-primary' : ''}" data-gongfa-id="${item.id}" ${
          canAfford ? '' : 'disabled'
        }>
            <span class="btn-action">${unlocked ? '参悟' : '锁定'}</span>
            <span class="btn-price">${unlocked ? `<img class="gi gi-12" src="assets/icons/res_stone@64.webp?v=18" alt="" aria-hidden="true">${formatNumber(cost)} 灵石` : '境界不足'}</span>
          </button>
        `;
        els.gongfaList.appendChild(row);
      });
    }

    renderHomeScene();
  }

  let homeRefs = null;
  let homeSyncedOnce = false;
  let lastHomeModalTab = 'dongfu';
  let homeRevealTimer = null;
  let homeFlashTimer = null;
  const HOME_STAGE_RATIO = 1080 / 1935;

  function layoutHomeStage() {
    if (!els.tabUpgrades || !els.homeScene || !els.homeStage) return;
    if (!els.tabUpgrades.classList.contains('active')) return;

    const cs = window.getComputedStyle(els.tabUpgrades);
    const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const paneH = Math.max(0, els.tabUpgrades.clientHeight - padY);
    if (paneH > 0) {
      els.tabUpgrades.style.setProperty('--home-h', `${paneH}px`);
    }

    const W = els.homeScene.clientWidth;
    const H = els.homeScene.clientHeight;
    if (W <= 0 || H <= 0) return;

    const coverScale = Math.max(W / 1080, H / 1935);
    const scale = Math.min(coverScale, W / (1080 * 0.88), H / (1935 * 0.8));
    const stageW = 1080 * scale;
    const stageH = 1935 * scale;
    const left = (W - stageW) / 2;
    const top = (H - stageH) / 2;

    els.homeStage.style.width = `${stageW}px`;
    els.homeStage.style.height = `${stageH}px`;
    els.homeStage.style.left = `${left}px`;
    els.homeStage.style.top = `${top}px`;
  }

  function initHomeStageResize() {
    const onResize = () => {
      layoutHomeStage();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => {
      setTimeout(layoutHomeStage, 60);
    });
    if (typeof ResizeObserver === 'function' && els.tabUpgrades) {
      const ro = new ResizeObserver(() => {
        layoutHomeStage();
      });
      ro.observe(els.tabUpgrades);
    }
  }

  function showHomeReveal(tierIdx, text) {
    if (!els.homeReveal) return;
    if (homeRevealTimer) {
      clearTimeout(homeRevealTimer);
      homeRevealTimer = null;
    }
    const tierInfo = HOME_TIERS[tierIdx] || HOME_TIERS[0];
    const q = QUALITIES[tierInfo.q] || QUALITIES[0];
    const isXian = q.id === 'xian';
    els.homeReveal.classList.toggle('q-xian-text', isXian);
    els.homeReveal.style.color = isXian ? '' : q.color;
    els.homeReveal.textContent = text;
    els.homeReveal.classList.remove('show');
    void els.homeReveal.offsetWidth;
    els.homeReveal.classList.add('show');
    homeRevealTimer = setTimeout(() => {
      if (els.homeReveal) els.homeReveal.classList.remove('show');
      homeRevealTimer = null;
    }, 2200);
  }

  function renderHomeScene() {
    if (!els.homeLayer) return;
    const s = GameState.state;
    if (!s.home) s.home = { maxTier: {}, bgMaxTier: 0 };
    if (!s.home.maxTier) s.home.maxTier = {};

    if (!homeRefs) {
      els.homeLayer.innerHTML = '';
      homeRefs = {};
      DONGFU_LIST.forEach((item) => {
        const id = item.id;
        const isl = HOME_SCENE.island[id] || [0, 0, 0, 0];
        const bdg = HOME_SCENE.badge[id] || [0, 0];

        const patchEl = document.createElement('img');
        patchEl.className = 'home-patch';
        patchEl.alt = '';
        patchEl.style.display = 'none';
        els.homeLayer.appendChild(patchEl);

        const fogEl = document.createElement('div');
        fogEl.className = 'home-fog';
        fogEl.style.left = `${isl[0]}%`;
        fogEl.style.top = `${isl[1]}%`;
        fogEl.style.width = `${isl[2]}%`;
        fogEl.style.height = `${isl[3]}%`;
        els.homeLayer.appendChild(fogEl);

        const badgeEl = document.createElement('div');
        badgeEl.className = 'home-badge';
        badgeEl.style.left = `${bdg[0]}%`;
        badgeEl.style.top = `${bdg[1]}%`;
        els.homeLayer.appendChild(badgeEl);

        const hotEl = document.createElement('button');
        hotEl.type = 'button';
        hotEl.className = 'home-hot';
        hotEl.setAttribute('aria-label', item.name);
        hotEl.dataset.homeId = id;
        hotEl.style.left = `${isl[0]}%`;
        hotEl.style.top = `${isl[1]}%`;
        hotEl.style.width = `${isl[2]}%`;
        hotEl.style.height = `${isl[3]}%`;
        els.homeLayer.appendChild(hotEl);

        homeRefs[id] = {
          patchEl,
          fogEl,
          badgeEl,
          hotEl,
          lastTier: -1
        };
      });
    }

    let totalLv = 0;
    let revealedInfo = null;

    DONGFU_LIST.forEach((item) => {
      const id = item.id;
      const ref = homeRefs[id];
      if (!ref) return;
      const unlocked = s.realmIndex >= item.unlockRealmIndex;
      const lv = (s.dongfu && s.dongfu[id]) || 0;
      totalLv += lv;

      const curTier = homeBuildingTier(lv);
      const prevMax = Number(s.home.maxTier[id]) || 0;
      const newMax = Math.max(curTier, prevMax);
      if (newMax > prevMax) {
        s.home.maxTier[id] = newMax;
        if (homeSyncedOnce) {
          const tName = (HOME_TIERS[newMax] && HOME_TIERS[newMax].name) || '';
          const msg = `洞府进阶：${item.name}·${tName}`;
          addLog(msg, 'success');
          revealedInfo = { tier: newMax, text: msg };
        }
      } else if (s.home.maxTier[id] === undefined) {
        s.home.maxTier[id] = prevMax;
      }

      const displayTier = GameState.getHomeDisplayTier(id);
      const tierCfg = HOME_TIERS[displayTier] || HOME_TIERS[0];
      const q = QUALITIES[tierCfg.q] || QUALITIES[0];
      const isXian = q.id === 'xian';

      if (displayTier === 0) {
        ref.patchEl.style.display = 'none';
        ref.patchEl.classList.remove('fade-in');
        ref.lastTier = 0;
      } else {
        const tierKey = tierCfg.key;
        const rect = HOME_SCENE.patch[`${id}_${tierKey}`] || [0, 0, 0, 0];
        const nextSrc = `assets/home/p_${id}_${tierKey}.webp?v=1`;
        ref.patchEl.style.left = `${rect[0]}%`;
        ref.patchEl.style.top = `${rect[1]}%`;
        ref.patchEl.style.width = `${rect[2]}%`;
        ref.patchEl.style.height = `${rect[3]}%`;
        ref.patchEl.style.display = 'block';
        if (ref.patchEl.getAttribute('src') !== nextSrc) {
          ref.patchEl.setAttribute('src', nextSrc);
        }
        if (ref.lastTier !== -1 && ref.lastTier !== displayTier) {
          ref.patchEl.classList.remove('fade-in');
          void ref.patchEl.offsetWidth;
          ref.patchEl.classList.add('fade-in');
        }
        ref.lastTier = displayTier;
      }

      ref.fogEl.classList.toggle('is-unlocked', unlocked);

      const shortName = HOME_SCENE.short[id] || item.name;
      if (unlocked) {
        ref.badgeEl.textContent = `${shortName} Lv.${lv}`;
      } else {
        const reqName = REALM_STAGES[item.unlockRealmIndex].fullName;
        ref.badgeEl.textContent = `🔒 ${reqName}解锁`;
      }
      ref.badgeEl.classList.toggle('q-xian', isXian);
      ref.badgeEl.style.borderColor = isXian ? '' : q.color;
    });

    const curBgTier = homeBgTier(totalLv);
    const prevBgMax = Number(s.home.bgMaxTier) || 0;
    const newBgMax = Math.max(curBgTier, prevBgMax);
    if (newBgMax > prevBgMax) {
      s.home.bgMaxTier = newBgMax;
      if (homeSyncedOnce) {
        const bgName = (HOME_TIERS[newBgMax] && HOME_TIERS[newBgMax].name) || '';
        const msg = `洞府进阶：洞天${bgName}`;
        addLog(msg, 'success');
        revealedInfo = { tier: newBgMax, text: msg };
      }
    } else if (s.home.bgMaxTier === undefined) {
      s.home.bgMaxTier = prevBgMax;
    }

    if (revealedInfo) {
      showHomeReveal(revealedInfo.tier, revealedInfo.text);
    }

    const bgDisplayTier = GameState.getHomeBgDisplayTier();
    if (els.homeGlow) {
      els.homeGlow.dataset.tier = String(bgDisplayTier);
    }
    if (els.homeTitle) {
      const bgTierName = (HOME_TIERS[bgDisplayTier] && HOME_TIERS[bgDisplayTier].name) || '凡品';
      els.homeTitle.textContent = `洞府 · ${bgTierName} · 总等级 ${totalLv}`;
    }

    homeSyncedOnce = true;
    layoutHomeStage();

    if (els.homeUpgradeModal && els.homeUpgradeModal.classList.contains('active')) {
      renderHomeUpgradeModal();
    }
  }

  function isHomeUpgradeModalOpen() {
    return Boolean(els.homeUpgradeModal && els.homeUpgradeModal.classList.contains('active'));
  }

  function switchHomeModalTab(tabKey, resetScroll = true) {
    const nextTab = tabKey === 'gongfa' ? 'gongfa' : 'dongfu';
    lastHomeModalTab = nextTab;
    const isGongfa = nextTab === 'gongfa';

    if (els.homeTabBtnDongfu) {
      els.homeTabBtnDongfu.classList.toggle('is-active', !isGongfa);
      els.homeTabBtnDongfu.setAttribute('aria-selected', !isGongfa ? 'true' : 'false');
    }
    if (els.homeTabBtnGongfa) {
      els.homeTabBtnGongfa.classList.toggle('is-active', isGongfa);
      els.homeTabBtnGongfa.setAttribute('aria-selected', isGongfa ? 'true' : 'false');
    }
    if (els.homeModalPaneDongfu) {
      els.homeModalPaneDongfu.hidden = isGongfa;
    }
    if (els.homeModalPaneGongfa) {
      els.homeModalPaneGongfa.hidden = !isGongfa;
    }
    if (resetScroll && els.homeModalScroll) {
      els.homeModalScroll.scrollTop = 0;
    }
  }

  function openHomeUpgradeModal(focusBuildingId, tabKey) {
    if (!els.homeUpgradeModal) return;
    renderHomeUpgradeModal();
    const targetTab = focusBuildingId ? 'dongfu' : (tabKey || lastHomeModalTab || 'dongfu');
    switchHomeModalTab(targetTab, !focusBuildingId);
    els.homeUpgradeModal.classList.add('active');
    els.homeUpgradeModal.setAttribute('aria-hidden', 'false');

    if (focusBuildingId && els.homeUpgradeList) {
      requestAnimationFrame(() => {
        if (!els.homeUpgradeList) return;
        const row = els.homeUpgradeList.querySelector(`.home-up-row[data-building-id="${focusBuildingId}"]`);
        if (!row) return;
        row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        els.homeUpgradeList.querySelectorAll('.home-up-row.is-flash').forEach((el) => {
          el.classList.remove('is-flash');
        });
        void row.offsetWidth;
        row.classList.add('is-flash');
        if (homeFlashTimer) clearTimeout(homeFlashTimer);
        homeFlashTimer = setTimeout(() => {
          row.classList.remove('is-flash');
          homeFlashTimer = null;
        }, 1050);
      });
    } else if (els.homeModalScroll) {
      els.homeModalScroll.scrollTop = 0;
    }
  }

  function closeHomeUpgradeModal() {
    if (!els.homeUpgradeModal) return;
    els.homeUpgradeModal.classList.remove('active');
    els.homeUpgradeModal.setAttribute('aria-hidden', 'true');
    if (homeFlashTimer) {
      clearTimeout(homeFlashTimer);
      homeFlashTimer = null;
    }
  }

  function renderHomeUpgradeModal() {
    if (!els.homeUpgradeList) return;
    const s = GameState.state;
    const stage = GameState.getCurrentStage();
    const stoneMult = Math.pow(stage.multiplier, 0.65) * GameState.getDaoGuoStoneMultiplier();

    let rowsBuilt = els.homeUpgradeList.querySelectorAll('.home-up-row').length === DONGFU_LIST.length;
    if (!rowsBuilt) {
      els.homeUpgradeList.innerHTML = '';
      DONGFU_LIST.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'home-up-row';
        row.dataset.buildingId = item.id;
        row.innerHTML = `
          <div class="home-up-head">
            <div class="home-up-title">
              <span class="home-up-name">${item.name}</span>
              <span class="home-up-tier"></span>
              <span class="upgrade-lv home-up-lv"></span>
            </div>
          </div>
          <div class="home-up-output"></div>
          <div class="home-up-link" hidden></div>
          <div class="home-up-meta-row">
            <span class="home-up-cost"></span>
            <span class="home-up-next"></span>
          </div>
          <div class="home-up-lock" hidden></div>
          <div class="home-up-actions">
            <button class="btn btn-primary" type="button" data-home-buy="1" data-home-id="${item.id}">×1</button>
            <button class="btn" type="button" data-home-buy="10" data-home-id="${item.id}">×10</button>
            <button class="btn" type="button" data-home-buy="max" data-home-id="${item.id}">最大</button>
          </div>
        `;
        els.homeUpgradeList.appendChild(row);
      });
    }

    DONGFU_LIST.forEach((item) => {
      const row = els.homeUpgradeList.querySelector(`.home-up-row[data-building-id="${item.id}"]`);
      if (!row) return;
      const unlocked = s.realmIndex >= item.unlockRealmIndex;
      const lv = (s.dongfu && s.dongfu[item.id]) || 0;
      const displayTier = GameState.getHomeDisplayTier(item.id);
      const tierCfg = HOME_TIERS[displayTier] || HOME_TIERS[0];
      const q = QUALITIES[tierCfg.q] || QUALITIES[0];
      const isXian = q.id === 'xian';

      row.classList.toggle('is-locked', !unlocked);

      const tierEl = row.querySelector('.home-up-tier');
      if (tierEl) {
        tierEl.textContent = tierCfg.name;
        tierEl.classList.toggle('q-xian-text', isXian);
        tierEl.style.color = isXian ? '' : q.color;
      }

      const lvEl = row.querySelector('.home-up-lv');
      if (lvEl) {
        lvEl.textContent = `Lv.${lv}`;
      }

      const perLvEffect = item.baseStonePerSec * stoneMult;
      const curOutput = perLvEffect * lv;
      const outEl = row.querySelector('.home-up-output');
      if (outEl) {
        outEl.innerHTML = `每秒灵石产出：<strong>+${formatNumber(curOutput)}/秒</strong>（单级 +${formatNumber(perLvEffect)}/秒）`;
      }

      const linkEl = row.querySelector('.home-up-link');
      if (linkEl) {
        if (item.id === 'julingshi') {
          const bonusPct = Math.floor(lv / 10);
          linkEl.textContent = `联动加成：灵气 +${bonusPct}%（每 10 级 +1%）`;
          linkEl.hidden = false;
        } else if (item.id === 'lingquan') {
          const capHours = (GameState.getOfflineCapSeconds() / 3600).toFixed(1).replace(/\.0$/, '');
          linkEl.textContent = `联动加成：离线上限 ${capHours}h（每 20 级 +0.5h，最高 15h）`;
          linkEl.hidden = false;
        } else {
          linkEl.textContent = '';
          linkEl.hidden = true;
        }
      }

      const metaRow = row.querySelector('.home-up-meta-row');
      const lockEl = row.querySelector('.home-up-lock');
      const actionsEl = row.querySelector('.home-up-actions');

      if (!unlocked) {
        const reqName = REALM_STAGES[item.unlockRealmIndex].fullName;
        if (metaRow) {
          metaRow.hidden = true;
          metaRow.style.display = 'none';
        }
        if (actionsEl) {
          actionsEl.hidden = true;
          actionsEl.style.display = 'none';
        }
        if (lockEl) {
          lockEl.hidden = false;
          lockEl.style.display = '';
          lockEl.textContent = `需突破至【${reqName}】解锁`;
        }
      } else {
        if (metaRow) {
          metaRow.hidden = false;
          metaRow.style.display = '';
        }
        if (actionsEl) {
          actionsEl.hidden = false;
          actionsEl.style.display = '';
        }
        if (lockEl) {
          lockEl.hidden = true;
          lockEl.style.display = 'none';
        }

        const nextCost = GameState.getDongfuCost(item);
        const costEl = row.querySelector('.home-up-cost');
        if (costEl) {
          costEl.innerHTML = `下一级：<img class="gi gi-12" src="assets/icons/res_stone@64.webp?v=18" alt="" aria-hidden="true"><strong>${formatNumber(nextCost)}</strong>`;
        }

        const nextEl = row.querySelector('.home-up-next');
        if (nextEl) {
          if (displayTier >= 2 || lv >= 100) {
            nextEl.textContent = '已至仙品';
          } else if (displayTier === 1 || lv >= 25) {
            nextEl.textContent = '下一档：Lv100 仙品';
          } else {
            nextEl.textContent = '下一档：Lv25 玄品';
          }
        }

        const canAfford = s.stones >= nextCost;
        row.querySelectorAll('button[data-home-buy]').forEach((btn) => {
          btn.disabled = !canAfford;
        });
      }
    });
  }

  function updateHomeUpgradeButtons() {
    if (!isHomeUpgradeModalOpen() || !els.homeUpgradeList) return;
    const s = GameState.state;
    DONGFU_LIST.forEach((item) => {
      const unlocked = s.realmIndex >= item.unlockRealmIndex;
      if (!unlocked) return;
      const row = els.homeUpgradeList.querySelector(`.home-up-row[data-building-id="${item.id}"]`);
      if (!row) return;
      const nextCost = GameState.getDongfuCost(item);
      const canAfford = s.stones >= nextCost;
      const costEl = row.querySelector('.home-up-cost');
      if (costEl) {
        costEl.innerHTML = `下一级：<img class="gi gi-12" src="assets/icons/res_stone@64.webp?v=18" alt="" aria-hidden="true"><strong>${formatNumber(nextCost)}</strong>`;
      }
      row.querySelectorAll('button[data-home-buy]').forEach((btn) => {
        btn.disabled = !canAfford;
      });
    });
  }

  function handleHomeModalBuy(id, n) {
    const item = DONGFU_LIST.find((d) => d.id === id);
    if (!item) return;
    const bought = GameState.buyDongfu(id, n);
    if (bought > 0) {
      addLog(`消耗灵石扩建【${item.name}】至 Lv.${GameState.state.dongfu[id]}！`, 'success');
      renderUpgradeLists();
      renderHomeUpgradeModal();
      updateHeaderAndMeditationUI();
      if (window.StageUI) StageUI.render();
    }
  }

  // 动态刷新功法与洞府按钮的可用状态，避免整表重建闪烁
  function updateUpgradeButtonsState() {
    const s = GameState.state;
    let anyGongfaAffordable = false;

    GONGFA_LIST.forEach((item) => {
      const unlocked = s.realmIndex >= item.unlockRealmIndex;
      const cost = GameState.getGongfaCost(item);
      const canAfford = unlocked && s.stones >= cost;
      if (canAfford) anyGongfaAffordable = true;

      if (els.gongfaList) {
        const btn = els.gongfaList.querySelector(`button[data-gongfa-id="${item.id}"]`);
        if (btn) {
          btn.disabled = !canAfford;
          btn.classList.toggle('btn-primary', canAfford);
        }
      }
    });

    let anyDongfuAffordable = false;
    DONGFU_LIST.forEach((item) => {
      const unlocked = s.realmIndex >= item.unlockRealmIndex;
      const cost = GameState.getDongfuCost(item);
      const canAfford = unlocked && s.stones >= cost;
      if (canAfford) {
        anyDongfuAffordable = true;
      }
    });

    const anyAffordable = anyGongfaAffordable || anyDongfuAffordable;

    if (els.badgeUpgrade) {
      els.badgeUpgrade.classList.toggle('visible', anyAffordable);
    }
    if (els.badgeHomeUpgrade) {
      els.badgeHomeUpgrade.classList.toggle('visible', anyAffordable);
    }
    if (els.badgeHomeTabDongfu) {
      els.badgeHomeTabDongfu.classList.toggle('visible', anyDongfuAffordable);
    }
    if (els.badgeHomeTabGongfa) {
      els.badgeHomeTabGongfa.classList.toggle('visible', anyGongfaAffordable);
    }

    updateHomeUpgradeButtons();
  }

  function handleUpgradeClick(e) {
    const gongfaBtn = e.target.closest('button[data-gongfa-id]');
    if (gongfaBtn) {
      const id = gongfaBtn.getAttribute('data-gongfa-id');
      const item = GONGFA_LIST.find((g) => g.id === id);
      if (!item) return;
      const cost = GameState.getGongfaCost(item);
      if (GameState.state.realmIndex >= item.unlockRealmIndex && GameState.state.stones >= cost) {
        GameState.state.stones -= cost;
        GameState.state.gongfa[id] = (GameState.state.gongfa[id] || 0) + 1;
        addLog(`潜心参悟${item.name}至第 ${GameState.state.gongfa[id]} 层，吐纳大进！`, 'success');
        renderUpgradeLists();
        updateHeaderAndMeditationUI();
        if (window.StageUI) StageUI.render();
      }
    }
  }

  // 渲染轮回与道果界面
  function renderReincarnationUI() {
    const s = GameState.state;
    const canReincarnate = s.realmIndex >= REINCARNATION_MIN_STAGE;
    const pending = GameState.getPendingDaoGuo();

    els.reincarnateCount.textContent = `${s.reincarnationCount || 0} 世`;
    els.reincarnateMult.textContent = `×${GameState.getDaoGuoQiMultiplier().toFixed(2)}`;
    els.pendingDaoguo.textContent = `+${pending} 道果`;

    if (canReincarnate) {
      els.reincarnateReqHint.textContent = `当前境界已达天神境以上，兵解转世可立即凝结 ${pending} 枚道果！`;
      els.btnReincarnate.disabled = false;
    } else {
      const currentName = GameState.getCurrentStage().fullName;
      els.reincarnateReqHint.textContent = `需突破至【天神初】方可开启轮回转世（当前：${currentName}）。`;
      els.btnReincarnate.disabled = true;
    }

    if (els.badgeReincarnate) {
      els.badgeReincarnate.classList.toggle('visible', canReincarnate);
    }

    els.talentList.innerHTML = '';
    DAOGUO_TALENTS.forEach((talent) => {
      const lv = (s.talents && s.talents[talent.id]) || 0;
      const isMax = talent.maxLevel && lv >= talent.maxLevel;
      const cost = GameState.getTalentCost(talent);
      const canBuy = !isMax && s.daoGuo >= cost;

      const row = document.createElement('div');
      row.className = 'upgrade-item';
      row.innerHTML = `
        <img class="gi upgrade-icon" src="assets/icons/tl_${talent.id}.webp?v=18" alt="" aria-hidden="true" loading="lazy">
        <div class="upgrade-meta">
          <div class="upgrade-name-row">
            <span class="upgrade-name">${talent.name}</span>
            <span class="upgrade-lv">Lv.${lv}${talent.maxLevel ? `/${talent.maxLevel}` : ''}</span>
          </div>
          <div class="upgrade-desc">${talent.desc}</div>
        </div>
        <button class="btn btn-cost ${canBuy ? 'btn-primary' : ''}" data-talent-id="${talent.id}" ${
        canBuy ? '' : 'disabled'
      }>
          <span class="btn-action">${isMax ? '圆满' : '凝练'}</span>
          <span class="btn-price">${isMax ? '—' : `<img class="gi gi-12" src="assets/icons/res_daoguo@64.webp?v=18" alt="" aria-hidden="true">${formatNumber(cost)} 道果`}</span>
        </button>
      `;
      els.talentList.appendChild(row);
    });
  }

  function handleTalentClick(e) {
    const btn = e.target.closest('button[data-talent-id]');
    if (!btn) return;
    const id = btn.getAttribute('data-talent-id');
    const talent = DAOGUO_TALENTS.find((t) => t.id === id);
    if (!talent) return;

    const s = GameState.state;
    const lv = (s.talents && s.talents[id]) || 0;
    if (talent.maxLevel && lv >= talent.maxLevel) return;

    const cost = GameState.getTalentCost(talent);
    if (s.daoGuo >= cost) {
      s.daoGuo -= cost;
      s.talents[id] = lv + 1;
      addLog(`以道果凝练先天秘术【${talent.name}】至 Lv.${s.talents[id]}！`, 'gold');
      renderReincarnationUI();
      renderUpgradeLists();
      updateHeaderAndMeditationUI();
      GameState.saveGame();
    }
  }

  function handleReincarnateButton() {
    const pending = GameState.getPendingDaoGuo();
    if (pending <= 0) return;

    openConfirmModal(
      '轮回转世确认',
      `转世重修将重置当前境界、灵气、灵石以及功法与洞府等级，但会永久获得 ${pending} 枚【道果】并保留所有道果秘术加成。是否立即踏入轮回？`,
      () => {
        const res = GameState.performReincarnation();
        if (res.ok) {
          addLog(`历经百劫，轮回重修！凝结 ${res.gain} 枚不朽道果，先天资质大幅跃升！`, 'gold');
          renderUpgradeLists();
          renderReincarnationUI();
          updateHeaderAndMeditationUI();
          if (window.GearUI) GearUI.render();
          if (window.StageUI) StageUI.render();
        }
      }
    );
  }

  function updateHeaderAndMeditationUI() {
    const s = GameState.state;
    const stage = GameState.getCurrentStage();
    const qiPerSec = GameState.getQiPerSec();
    const stonePerSec = GameState.getStonePerSec();
    const tapGain = GameState.getTapQiGain();

    syncRealmAura(stage);
    els.realmText.textContent = stage.fullName;
    els.qiVal.textContent = formatNumber(s.qi);
    els.qiRate.textContent = `+${formatNumber(qiPerSec)}/秒`;
    els.stoneVal.textContent = formatNumber(s.stones);
    els.stoneRate.textContent = `+${formatNumber(stonePerSec)}/秒`;
    els.daoguoVal.textContent = `${s.daoGuo} (累${s.totalDaoGuo || 0})`;
    els.daoguoMult.textContent = `灵气×${GameState.getDaoGuoQiMultiplier().toFixed(2)}`;

    if (window.TitlesUI) TitlesUI.paintPlate();
    els.tapGainHint.textContent = `点击画面凝神吐纳（每次 +${formatNumber(tapGain)} 灵气）`;
    els.realmDesc.textContent = stage.desc;

    const ratio = stage.isMaxStage ? 1 : Math.min(1, s.qi / stage.reqQi);
    const pct = (ratio * 100).toFixed(1);
    els.qiProgressText.textContent = stage.isMaxStage
      ? `${formatNumber(s.qi)} (已臻至尊后大圆满)`
      : `${formatNumber(s.qi)} / ${formatNumber(stage.reqQi)}`;
    els.qiProgressPercent.textContent = `${pct}%`;
    els.qiProgressBar.style.width = `${pct}%`;

    const successRatePct = (GameState.getBreakthroughSuccessRate() * 100).toFixed(1);
    const lossPct = Math.round(stage.failureLossRatio * 100);
    els.breakthroughRate.textContent = `${successRatePct}%`;
    els.breakthroughPenalty.textContent = `失败损耗 ${lossPct}% 当前灵气`;

    const gate = window.Equip && window.Equip.tribulationLock(s);
    const hasQi = !stage.isMaxStage && s.qi >= stage.reqQi;
    const gateLocked = Boolean(gate && hasQi);
    const canBreak = hasQi && !gate;
    els.btnBreakthrough.disabled = !hasQi;
    els.btnBreakthrough.classList.toggle('ready-pulse', canBreak);
    els.btnBreakthrough.textContent = stage.isMaxStage
      ? '境界圆满'
      : gateLocked
      ? `先败 ${gate.boss}`
      : stage.isMajorTribulation
      ? '渡劫晋升'
      : '突破境界';

    if (els.badgeBreakthrough) {
      els.badgeBreakthrough.classList.toggle('visible', canBreak);
    }

    // 若已达天神境，实时更新可获取道果数
    if (s.realmIndex >= REINCARNATION_MIN_STAGE) {
      const pending = GameState.getPendingDaoGuo();
      els.pendingDaoguo.textContent = `+${pending} 道果`;
    }

    updateUpgradeButtonsState();
  }

  function showOfflineModal(report) {
    if (!report) return;
    els.offlineDuration.textContent = formatDuration(report.effectiveSeconds);
    els.offlineQi.textContent = `+${formatNumber(report.qiGain)}`;
    els.offlineStone.textContent = `+${formatNumber(report.stoneGain)}`;
    const offlinePeach = document.getElementById('offline-peach');
    const offlineLingyu = document.getElementById('offline-lingyu');
    if (offlinePeach) offlinePeach.textContent = `+${formatNumber(report.peachGain || 0)}`;
    if (offlineLingyu) offlineLingyu.textContent = `+${formatNumber(report.lingyuGain || 0)}`;
    els.offlineCapNote.style.display = report.capped ? 'block' : 'none';
    els.offlineModal.classList.add('active');
    addLog(
      `闭关归来（离线 ${formatDuration(report.effectiveSeconds)}），共获 ${formatNumber(
        report.qiGain
      )} 灵气、${formatNumber(report.stoneGain)} 灵石。`,
      'gold'
    );
  }

  function openConfirmModal(title, message, onConfirm) {
    els.confirmTitle.textContent = title;
    els.confirmMessage.textContent = message;
    confirmCallback = onConfirm;
    els.confirmModal.classList.add('active');
  }

  function closeConfirmModal() {
    els.confirmModal.classList.remove('active');
    confirmCallback = null;
  }

  function switchToTab(targetId) {
    const navBtns = document.querySelectorAll('.nav-btn');
    const panes = document.querySelectorAll('.tab-pane');
    navBtns.forEach((b) => b.classList.toggle('active', b.getAttribute('data-tab') === targetId));
    panes.forEach((p) => p.classList.toggle('active', p.id === targetId));
    if (els.appContainer) {
      els.appContainer.dataset.tab = targetId;
    }
    if (targetId === 'tab-cultivate') {
      restorePortraitFocus();
    }
    if (targetId === 'tab-upgrades') {
      renderHomeScene();
      layoutHomeStage();
    }
    if (window.StageUI) {
      if (targetId === 'tab-stage') window.StageUI.onShow();
      else window.StageUI.onHide();
    }
  }

  function initTabs() {
    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-tab');
        switchToTab(targetId);
      });
    });
  }

  function initHeroStage() {
    const stage = els.meditationZone;
    if (!stage) return;
    stage.classList.add('is-still');
  }

  function initQiMotes() {
    const canvas = els.qiMotes;
    const frame = els.heroFrame;
    if (!canvas || !frame) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const motes = [];
    let width = 0;
    let height = 0;
    let last = performance.now();
    const maxMotes = 72;

    function resize() {
      const rect = frame.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function qiScale() {
      let qps = 1;
      try {
        qps = Math.max(0, GameState.getQiPerSec());
      } catch (err) {
        qps = 1;
      }
      const log = Math.log10(1 + qps);
      return {
        count: Math.round(Math.min(maxMotes, 16 + log * 14)),
        speed: Math.min(2.6, 0.7 + log * 0.38)
      };
    }

    function makeMote(fromBottom) {
      return {
        x: Math.random() * width,
        y: fromBottom ? height + Math.random() * 16 : Math.random() * height,
        r: 0.7 + Math.random() * 2.1,
        vy: 16 + Math.random() * 34,
        drift: 8 + Math.random() * 18,
        phase: Math.random() * Math.PI * 2,
        a: 0.28 + Math.random() * 0.62,
        color: auraMoteColor
      };
    }

    burstMotes = function (n) {
      const extra = Math.min(36, n);
      for (let i = 0; i < extra; i++) {
        const m = makeMote(false);
        m.x = width * (0.3 + Math.random() * 0.4);
        m.y = height * (0.42 + Math.random() * 0.28);
        m.vy = 40 + Math.random() * 90;
        m.r = 1.2 + Math.random() * 2.4;
        m.a = 0.75;
        motes.push(m);
      }
    };

    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function frameMotes(now) {
      const dt = Math.max(0.001, Math.min(0.05, (now - last) / 1000));
      last = now;
      if (!reduceMotion && !document.hidden && width > 2 && height > 2) {
        const scale = qiScale();
        while (motes.length < scale.count) motes.push(makeMote(false));
        ctx.clearRect(0, 0, width, height);
        for (let i = motes.length - 1; i >= 0; i--) {
          const m = motes[i];
          m.y -= m.vy * scale.speed * dt;
          m.x += Math.sin(m.phase + now * 0.0015) * m.drift * dt;
          if (m.y < -10 || m.x < -12 || m.x > width + 12) {
            if (motes.length > scale.count) motes.splice(i, 1);
            else Object.assign(m, makeMote(true));
            continue;
          }
          ctx.globalAlpha = m.a;
          ctx.fillStyle = m.color;
          ctx.beginPath();
          ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      requestAnimationFrame(frameMotes);
    }

    resize();
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(resize);
      observer.observe(frame);
    } else {
      window.addEventListener('resize', resize);
    }
    requestAnimationFrame(frameMotes);
  }

  function updateSaveTimestampUI() {
    if (!els.lastSaveStatus) return;
    const d = new Date(GameState.state.lastSaveTime || Date.now());
    const t = [
      String(d.getHours()).padStart(2, '0'),
      String(d.getMinutes()).padStart(2, '0'),
      String(d.getSeconds()).padStart(2, '0')
    ].join(':');
    els.lastSaveStatus.textContent = `上次自动存档：${t}`;
  }

  function getHeroList() {
    if (window.CONFIG && Array.isArray(window.CONFIG.HEROES)) return window.CONFIG.HEROES;
    if (window.GameConfig && Array.isArray(window.GameConfig.HEROES)) return window.GameConfig.HEROES;
    return [];
  }

  function isHeroLocked(hero) {
    if (!hero) return true;
    if (window.Battle && typeof window.Battle.isHeroUnlocked === 'function') {
      return !window.Battle.isHeroUnlocked(hero.id, GameState && GameState.state);
    }
    return Boolean(hero.locked);
  }

  function resolveHero(heroId) {
    const heroes = getHeroList();
    let hero = heroes.find((h) => h && h.id === heroId && !isHeroLocked(h));
    if (!hero) {
      hero = heroes.find((h) => h && !isHeroLocked(h)) || {
        id: 'lanyi',
        name: '蓝衣剑修',
        img: 'assets/hero_v21_new_hd.jpg?v=3',
        poster: 'assets/hero_v21_new_poster.jpg?v=3'
      };
    }
    return hero;
  }

  function applyHeroAppearance(heroId) {
    const hero = resolveHero(heroId);
    if (GameState && GameState.state) {
      GameState.state.heroId = hero.id;
    }

    const heroStill = els.heroStill || document.getElementById('hero-still');
    const heroFallback = els.heroFallback || document.getElementById('hero-fallback');

    if (heroStill && hero.img) {
      heroStill.setAttribute('src', hero.img);
      heroStill.src = hero.img;
      if (hero.name) heroStill.setAttribute('alt', hero.name);
    }
    if (heroFallback && hero.img) {
      heroFallback.setAttribute('src', hero.img);
      heroFallback.src = hero.img;
    }

    const fighterPlayer = els.fighterPlayer || document.getElementById('fighter-player');
    if (fighterPlayer) {
      const nodes = fighterPlayer.querySelectorAll('.fighter-hero-img');
      nodes.forEach((node) => {
        const tag = (node.tagName || '').toUpperCase();
        if (tag === 'IMG' && hero.img) {
          node.setAttribute('src', hero.img);
          node.src = hero.img;
          if (hero.name) node.setAttribute('alt', hero.name);
        }
      });
    }

    if (window.StageUI && typeof window.StageUI.render === 'function') {
      window.StageUI.render();
    }
  }

  // 只排更换角色立绘列表。品阶沿用 QUALITIES 从低到高的下标，展示时从高到低；同品阶保持 HEROES 原顺序。不改全局数组。
  function portraitHeroList(heroes, qualities) {
    const rank = {};
    const qualityList = qualities || QUALITIES || [];
    for (let i = 0; i < qualityList.length; i++) {
      const item = qualityList[i];
      if (item && item.id) rank[item.id] = i;
    }
    const source = heroes || [];
    const decorated = [];
    for (let i = 0; i < source.length; i++) {
      decorated.push({ hero: source[i], index: i });
    }
    decorated.sort((a, b) => {
      const aq = a.hero && a.hero.quality;
      const bq = b.hero && b.hero.quality;
      const ra = Object.prototype.hasOwnProperty.call(rank, aq) ? rank[aq] : -1;
      const rb = Object.prototype.hasOwnProperty.call(rank, bq) ? rank[bq] : -1;
      if (ra !== rb) return rb - ra;
      return a.index - b.index;
    });
    const ordered = [];
    for (let i = 0; i < decorated.length; i++) ordered.push(decorated[i].hero);
    return ordered;
  }

  window.portraitHeroList = portraitHeroList;

  function renderRoleList() {
    const box = els.roleList || document.getElementById('role-list');
    if (!box) return;
    const heroes = portraitHeroList(getHeroList());
    const activeHero = resolveHero(GameState.state && GameState.state.heroId);
    box.innerHTML = '';

    heroes.forEach((hero) => {
      if (!hero) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-hero-id', hero.id);

      if (isHeroLocked(hero)) {
        btn.className = 'role-card is-locked';
        btn.disabled = true;
        btn.setAttribute('aria-disabled', 'true');
        btn.innerHTML = `
          <div class="role-locked-body" aria-hidden="true">
            <svg class="role-silhouette" viewBox="0 0 120 160" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M54 18C54 13.5 56.7 10 60 10C63.3 10 66 13.5 66 18C66 20.5 64.8 22.7 63 23.8C69.5 26 74 32.5 74 40.5C74 48 69.8 54.4 64 56.8L68 62L92 72L100 138L20 138L28 72L52 62L56 56.8C50.2 54.4 46 48 46 40.5C46 32.5 50.5 26 57 23.8C55.2 22.7 54 20.5 54 18Z" fill="currentColor"/>
              <path d="M28 32L36 26L88 118L82 124L28 32Z" fill="currentColor" opacity="0.55"/>
            </svg>
            <span class="role-lock-badge">
              <svg class="role-lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="5" y="11" width="14" height="10" rx="2"></rect>
                <path d="M8 11V7a4 4 0 0 1 8 0v4"></path>
              </svg>
            </span>
          </div>
          <div class="role-card-footer">
            <span class="role-card-name">${hero.name || '敬请期待'}</span>
          </div>
        `;
      } else {
        const isActive = hero.id === activeHero.id;
        btn.className = 'role-card' + (isActive ? ' is-active' : '');
        btn.innerHTML = `
          <img class="role-card-img" src="${hero.img}" alt="${hero.name}" loading="lazy" />
          ${isActive ? '<span class="role-card-badge">使用中</span>' : ''}
          <div class="role-card-footer">
            <span class="role-card-name">${hero.name}</span>
          </div>
        `;
      }
      box.appendChild(btn);
    });
  }

  function handleRoleListClick(e) {
    const card = e.target.closest('.role-card[data-hero-id]');
    if (!card || card.classList.contains('is-locked') || card.disabled) return;
    const heroId = card.getAttribute('data-hero-id');
    const heroes = getHeroList();
    const hero = heroes.find((h) => h && h.id === heroId);
    if (!hero || isHeroLocked(hero)) return;

    GameState.state.heroId = hero.id;
    GameState.saveGame();
    applyHeroAppearance(hero.id);
    renderRoleList();
    if (els.roleModal) {
      els.roleModal.classList.remove('active');
    }
  }

  function gameLoop(now) {
    const dt = Math.max(0, Math.min(1.0, (now - lastTickTime) / 1000));
    lastTickTime = now;

    if (dt > 0) {
      const qiGain = GameState.getQiPerSec() * dt;
      GameState.state.qi += qiGain;
      GameState.state.lifetimeQi = (GameState.state.lifetimeQi || 0) + qiGain;
      GameState.state.playTimeMs = (GameState.state.playTimeMs || 0) + dt * 1000;
      GameState.state.stones += GameState.getStonePerSec() * dt;
      if (window.GearUI) GearUI.tick();
      if (window.StageUI) StageUI.tick();
      if (window.Titles && Math.floor(GameState.state.playTimeMs / 5000) !== Math.floor((GameState.state.playTimeMs - dt * 1000) / 5000)) {
        Titles.sync(GameState.state);
        if (window.TitlesUI) TitlesUI.flushToasts();
      }
      updateHeaderAndMeditationUI();
    }

    autoSaveTimer += dt * 1000;
    if (autoSaveTimer >= AUTO_SAVE_INTERVAL_MS) {
      autoSaveTimer = 0;
      GameState.saveGame();
      updateSaveTimestampUI();
    }

    requestAnimationFrame(gameLoop);
  }

  function init() {
    cacheElements();
    restorePortraitFocus();
    initTabs();
    initHomeStageResize();
    initHeroStage();
    initQiMotes();

    const { isNew, offlineReport } = GameState.loadGame();
    applyHeroAppearance(GameState.state.heroId);
    renderRoleList();

    renderUpgradeLists();
    renderReincarnationUI();
    updateHeaderAndMeditationUI();
    updateSaveTimestampUI();

    if (isNew) {
      addLog('初入仙途，盘膝吐纳。运转《搬血淬体诀》，感应天地灵气。', 'success');
    } else {
      addLog('神识归位，继续吐纳天地灵机。');
    }

    if (offlineReport) {
      showOfflineModal(offlineReport);
    }

    // 绑定事件
    els.meditationZone.addEventListener('pointerdown', handleMeditationTap);
    if (els.chkPortraitFocus) {
      els.chkPortraitFocus.addEventListener('change', () => {
        applyPortraitFocus(!!els.chkPortraitFocus.checked);
      });
    }
    els.btnBreakthrough.addEventListener('click', attemptBreakthrough);
    if (els.gongfaList) {
      els.gongfaList.addEventListener('click', handleUpgradeClick);
    }
    els.talentList.addEventListener('click', handleTalentClick);
    els.btnReincarnate.addEventListener('click', handleReincarnateButton);

    const btnGotoGongfa = document.getElementById('btn-goto-gongfa');
    if (btnGotoGongfa) {
      btnGotoGongfa.addEventListener('click', () => {
        openHomeUpgradeModal(null, 'gongfa');
      });
    }

    if (els.homeLayer) {
      els.homeLayer.addEventListener('click', (e) => {
        const hot = e.target.closest('.home-hot[data-home-id]');
        if (hot) {
          openHomeUpgradeModal(hot.dataset.homeId);
        }
      });
    }

    if (els.btnHomeUpgrade) {
      els.btnHomeUpgrade.addEventListener('click', () => {
        openHomeUpgradeModal();
      });
    }

    if (els.homeTabBtnDongfu) {
      els.homeTabBtnDongfu.addEventListener('click', () => {
        switchHomeModalTab('dongfu', true);
      });
    }
    if (els.homeTabBtnGongfa) {
      els.homeTabBtnGongfa.addEventListener('click', () => {
        switchHomeModalTab('gongfa', true);
      });
    }

    if (els.homeUpgradeModal) {
      els.homeUpgradeModal.addEventListener('click', (e) => {
        if (e.target === els.homeUpgradeModal) {
          closeHomeUpgradeModal();
        }
      });
    }
    if (els.btnCloseHomeUpgrade) {
      els.btnCloseHomeUpgrade.addEventListener('click', closeHomeUpgradeModal);
    }
    if (els.homeUpgradeList) {
      els.homeUpgradeList.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-home-buy][data-home-id]');
        if (!btn || btn.disabled) return;
        const id = btn.dataset.homeId;
        const buyRaw = btn.dataset.homeBuy;
        const n = buyRaw === 'max' ? Infinity : Number(buyRaw) || 1;
        handleHomeModalBuy(id, n);
      });
    }

    els.btnCloseOffline.addEventListener('click', () => {
      els.offlineModal.classList.remove('active');
    });

    if (els.btnOpenLog && els.logModal) {
      els.btnOpenLog.addEventListener('click', () => {
        els.logModal.classList.add('active');
        if (els.badgeLog) els.badgeLog.classList.remove('visible');
      });
      if (els.btnCloseLog) {
        els.btnCloseLog.addEventListener('click', () => els.logModal.classList.remove('active'));
      }
      els.logModal.addEventListener('click', (e) => {
        if (e.target === els.logModal) {
          els.logModal.classList.remove('active');
        }
      });
    }

    if (els.btnOpenRole && els.roleModal) {
      els.btnOpenRole.addEventListener('click', () => {
        renderRoleList();
        els.roleModal.classList.add('active');
      });
      if (els.btnCloseRole) {
        els.btnCloseRole.addEventListener('click', () => els.roleModal.classList.remove('active'));
      }
      els.roleModal.addEventListener('click', (e) => {
        if (e.target === els.roleModal) {
          els.roleModal.classList.remove('active');
        }
      });
      if (els.roleList) {
        els.roleList.addEventListener('click', handleRoleListClick);
      }
    }

    els.btnManualSave.addEventListener('click', () => {
      GameState.saveGame();
      updateSaveTimestampUI();
      addLog('已手动将修仙进度铭刻至玉简（存档成功）。', 'success');
    });

    els.btnResetSave.addEventListener('click', () => {
      openConfirmModal(
        '散功重修（重置存档）',
        '确定要彻底清空当前所有修仙进度、灵石、功法与道果吗？此操作不可撤销！',
        () => {
          closeHomeUpgradeModal();
          homeSyncedOnce = false;
          if (homeRefs) {
            Object.values(homeRefs).forEach((r) => {
              r.lastTier = -1;
            });
          }
          GameState.resetGame();
          applyHeroAppearance(GameState.state.heroId);
          renderRoleList();
          els.logBox.innerHTML = '';
          addLog('已散尽修为，重归凡尘，开启全新仙途！', 'warn');
          renderUpgradeLists();
          renderReincarnationUI();
          updateHeaderAndMeditationUI();
          updateSaveTimestampUI();
          if (window.GearUI) GearUI.render();
          if (window.StageUI) StageUI.render();
        }
      );
    });

    els.btnConfirmYes.addEventListener('click', () => {
      if (typeof confirmCallback === 'function') {
        confirmCallback();
      }
      closeConfirmModal();
    });

    els.btnConfirmNo.addEventListener('click', closeConfirmModal);

    window.addEventListener('beforeunload', () => {
      GameState.saveGame();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        GameState.saveGame();
      }
    });

    if (window.TitlesUI) TitlesUI.init();

    if (window.GearUI) {
      GearUI.init({
        log: addLog,
        onChange() {
          renderUpgradeLists();
          updateHeaderAndMeditationUI();
          if (window.StageUI) StageUI.render();
        }
      });
    }

    if (window.StageUI) {
      StageUI.init({
        log: addLog,
        switchTab: switchToTab,
        onChange() {
          renderUpgradeLists();
          renderReincarnationUI();
          updateHeaderAndMeditationUI();
          if (window.GearUI) GearUI.render();
        }
      });
    }

    lastTickTime = performance.now();
    requestAnimationFrame(gameLoop);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

