// 修仙挂机 - 主循环、交互与界面渲染
(function () {
  const {
    REALM_STAGES,
    GONGFA_LIST,
    DONGFU_LIST,
    DAOGUO_TALENTS,
    REINCARNATION_MIN_STAGE,
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
    els.qiVal = document.getElementById('res-qi-val');
    els.qiRate = document.getElementById('res-qi-rate');
    els.stoneVal = document.getElementById('res-stone-val');
    els.stoneRate = document.getElementById('res-stone-rate');
    els.daoguoVal = document.getElementById('res-daoguo-val');
    els.daoguoMult = document.getElementById('res-daoguo-mult');

    els.meditationZone = document.getElementById('meditation-zone');
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
    els.gongfaList = document.getElementById('gongfa-list');
    els.dongfuList = document.getElementById('dongfu-list');

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

    els.heroVideo = document.getElementById('hero-video');
    els.heroFrame = document.querySelector('.hero-frame');
    els.realmFlash = document.getElementById('realm-flash');
    els.realmShockwave = document.getElementById('realm-shockwave');
    els.qiMotes = document.getElementById('qi-motes');
    els.appContainer = document.querySelector('.app-container');
  }

  // 立绘光效只改表现，不改数值。境界色：练气青、筑基碧、金丹金、元婴紫、化神白金。
  const REALM_AURAS = {
    lianqi: { core: '#67e8f9', glow: 'rgba(103, 232, 249, 0.55)', mote: 'rgba(186, 244, 255, 0.95)' },
    zhuji: { core: '#4ade80', glow: 'rgba(74, 222, 128, 0.5)', mote: 'rgba(190, 255, 214, 0.95)' },
    jindan: { core: '#f5c76a', glow: 'rgba(245, 199, 106, 0.58)', mote: 'rgba(255, 226, 160, 0.96)' },
    yuanying: { core: '#c084fc', glow: 'rgba(192, 132, 252, 0.58)', mote: 'rgba(230, 204, 255, 0.96)' },
    huashen: { core: '#fff3c4', glow: 'rgba(255, 236, 180, 0.62)', mote: 'rgba(255, 248, 226, 0.98)' }
  };
  let auraMoteColor = REALM_AURAS.lianqi.mote;
  let lastAuraRealm = '';
  let burstMotes = function () {};

  function syncRealmAura(stage) {
    const aura = REALM_AURAS[stage.majorId] || REALM_AURAS.lianqi;
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

  // 点击打坐区获取额外灵气
  function handleMeditationTap(e) {
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
      addLog('道友已臻至化神九层大圆满，可前往【轮回】转世重修，凝聚无上道果！', 'gold');
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

  // 构建功法与洞府列表 DOM
  function renderUpgradeLists() {
    const s = GameState.state;
    const stage = GameState.getCurrentStage();

    // 功法列表
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
        <img class="gi upgrade-icon" src="assets/icons/gf_${item.id}.webp?v=14" alt="" aria-hidden="true" loading="lazy">
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
          <span class="btn-price">${unlocked ? `<img class="gi gi-12" src="assets/icons/res_stone@64.webp?v=14" alt="" aria-hidden="true">${formatNumber(cost)} 灵石` : '境界不足'}</span>
        </button>
      `;
      els.gongfaList.appendChild(row);
    });

    // 洞府列表
    els.dongfuList.innerHTML = '';
    DONGFU_LIST.forEach((item) => {
      const unlocked = s.realmIndex >= item.unlockRealmIndex;
      const lv = (s.dongfu && s.dongfu[item.id]) || 0;
      const cost = GameState.getDongfuCost(item);
      const canAfford = unlocked && s.stones >= cost;
      const reqStageName = REALM_STAGES[item.unlockRealmIndex].fullName;
      const perLvEffect =
        item.baseStonePerSec *
        Math.pow(stage.multiplier, 0.65) *
        GameState.getDaoGuoStoneMultiplier();
      const glow = item.id === 'lingmai' ? ' gi-glow' : '';

      const row = document.createElement('div');
      row.className = 'upgrade-item' + (unlocked ? '' : ' locked');
      row.innerHTML = `
        <img class="gi upgrade-icon${glow}" src="assets/icons/df_${item.id}.webp?v=14" alt="" aria-hidden="true" loading="lazy">
        <div class="upgrade-meta">
          <div class="upgrade-name-row">
            <span class="upgrade-name">${item.name}</span>
            <span class="upgrade-lv">${unlocked ? `Lv.${lv}` : `需 ${reqStageName}`}</span>
          </div>
          <div class="upgrade-desc">${item.desc}</div>
          <div class="upgrade-effect">每级产出：+${formatNumber(perLvEffect)} 灵石/秒</div>
        </div>
        <button class="btn btn-cost ${canAfford ? 'btn-primary' : ''}" data-dongfu-id="${item.id}" ${
        canAfford ? '' : 'disabled'
      }>
          <span class="btn-action">${unlocked ? '扩建' : '锁定'}</span>
          <span class="btn-price">${unlocked ? `<img class="gi gi-12" src="assets/icons/res_stone@64.webp?v=14" alt="" aria-hidden="true">${formatNumber(cost)} 灵石` : '境界不足'}</span>
        </button>
      `;
      els.dongfuList.appendChild(row);
    });
  }

  // 动态刷新功法与洞府按钮的可用状态，避免整表重建闪烁
  function updateUpgradeButtonsState() {
    const s = GameState.state;
    let anyAffordable = false;

    GONGFA_LIST.forEach((item) => {
      const unlocked = s.realmIndex >= item.unlockRealmIndex;
      const cost = GameState.getGongfaCost(item);
      const canAfford = unlocked && s.stones >= cost;
      if (canAfford) anyAffordable = true;

      const btn = els.gongfaList.querySelector(`button[data-gongfa-id="${item.id}"]`);
      if (btn) {
        btn.disabled = !canAfford;
        btn.classList.toggle('btn-primary', canAfford);
      }
    });

    DONGFU_LIST.forEach((item) => {
      const unlocked = s.realmIndex >= item.unlockRealmIndex;
      const cost = GameState.getDongfuCost(item);
      const canAfford = unlocked && s.stones >= cost;
      if (canAfford) anyAffordable = true;

      const btn = els.dongfuList.querySelector(`button[data-dongfu-id="${item.id}"]`);
      if (btn) {
        btn.disabled = !canAfford;
        btn.classList.toggle('btn-primary', canAfford);
      }
    });

    if (els.badgeUpgrade) {
      els.badgeUpgrade.classList.toggle('visible', anyAffordable);
    }
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
      return;
    }

    const dongfuBtn = e.target.closest('button[data-dongfu-id]');
    if (dongfuBtn) {
      const id = dongfuBtn.getAttribute('data-dongfu-id');
      const item = DONGFU_LIST.find((d) => d.id === id);
      if (!item) return;
      const cost = GameState.getDongfuCost(item);
      if (GameState.state.realmIndex >= item.unlockRealmIndex && GameState.state.stones >= cost) {
        GameState.state.stones -= cost;
        GameState.state.dongfu[id] = (GameState.state.dongfu[id] || 0) + 1;
        addLog(`消耗灵石扩建【${item.name}】至 Lv.${GameState.state.dongfu[id]}！`, 'success');
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
      els.reincarnateReqHint.textContent = `当前境界已达元婴期以上，兵解转世可立即凝结 ${pending} 枚道果！`;
      els.btnReincarnate.disabled = false;
    } else {
      const currentName = GameState.getCurrentStage().fullName;
      els.reincarnateReqHint.textContent = `需突破至【元婴一层】方可开启轮回转世（当前：${currentName}）。`;
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
        <img class="gi upgrade-icon" src="assets/icons/tl_${talent.id}.webp?v=14" alt="" aria-hidden="true" loading="lazy">
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
          <span class="btn-price">${isMax ? '—' : `<img class="gi gi-12" src="assets/icons/res_daoguo@64.webp?v=14" alt="" aria-hidden="true">${formatNumber(cost)} 道果`}</span>
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
    els.realmPill.textContent = stage.fullName;
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
      ? `${formatNumber(s.qi)} (已臻化神大圆满)`
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

    // 若已达元婴期，实时更新可获取道果数
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
    if (targetId === 'tab-cultivate') resumeHeroVideo();
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

  // 立绘开关：true 播放练气视频，false 退回静图（静图才有呼吸/漂浮）。
  const HERO_USE_VIDEO = true;
  let tryPlayHero = function () {};

  function resumeHeroVideo() {
    tryPlayHero();
  }

  function initHeroVideo() {
    const video = els.heroVideo;
    const stage = els.meditationZone;
    if (!video || !stage) return;
    video.defaultMuted = true;
    video.muted = true;
    video.loop = true;
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute('muted', '');
    video.setAttribute('autoplay', '');
    video.setAttribute('loop', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.preload = HERO_USE_VIDEO ? 'auto' : 'none';
    if (!HERO_USE_VIDEO) {
      stage.classList.add('is-still');
      video.preload = 'none';
      video.pause();
      return;
    }
    stage.classList.remove('is-still', 'use-fallback');
    const heroSrc = video.getAttribute('src') || 'assets/hero_j_hd.mp4?v=15';
    while (video.firstChild) video.removeChild(video.firstChild);
    video.src = heroSrc;

    let retriesBound = false;
    let playAttempt = null;
    let confirmToken = 0;

    function isActuallyPlaying() {
      return !video.paused && !video.ended && video.readyState >= 2;
    }

    function unbindHeroRetries() {
      if (!retriesBound) return;
      retriesBound = false;
      document.removeEventListener('pointerdown', tryPlayHero, true);
      document.removeEventListener('touchstart', tryPlayHero, true);
      document.removeEventListener('click', tryPlayHero, true);
      document.removeEventListener('visibilitychange', onHeroVisible);
      video.removeEventListener('canplay', tryPlayHero);
      video.removeEventListener('loadeddata', tryPlayHero);
    }

    function showPoster() {
      if (stage.classList.contains('use-fallback')) return;
      stage.classList.remove('is-playing');
      bindHeroRetries();
    }

    function markHeroPlaying() {
      if (video.error || stage.classList.contains('use-fallback')) return;
      const token = ++confirmToken;
      // A play() promise can resolve or a 'playing' event can fire and then be
      // aborted immediately. Only hide the poster once playback sticks.
      setTimeout(function () {
        if (token !== confirmToken) return;
        if (video.error || stage.classList.contains('use-fallback')) return;
        if (!isActuallyPlaying()) {
          showPoster();
          return;
        }
        stage.classList.add('is-playing');
        stage.classList.remove('is-still');
        unbindHeroRetries();
      }, 60);
    }

    function onHeroVisible() {
      if (document.visibilityState === 'visible') tryPlayHero();
    }

    function bindHeroRetries() {
      if (retriesBound) return;
      retriesBound = true;
      document.addEventListener('pointerdown', tryPlayHero, true);
      document.addEventListener('touchstart', tryPlayHero, true);
      document.addEventListener('click', tryPlayHero, true);
      document.addEventListener('visibilitychange', onHeroVisible);
      video.addEventListener('canplay', tryPlayHero);
      video.addEventListener('loadeddata', tryPlayHero);
    }

    tryPlayHero = function () {
      if (!HERO_USE_VIDEO || !video || stage.classList.contains('use-fallback')) return;
      if (isActuallyPlaying()) {
        markHeroPlaying();
        return;
      }
      if (playAttempt) return;
      let pending = null;
      try {
        pending = video.play();
      } catch (err) {
        pending = Promise.reject(err);
      }
      playAttempt = pending;
      if (pending && typeof pending.then === 'function') {
        pending.then(function () {
          if (playAttempt === pending) playAttempt = null;
          markHeroPlaying();
        }).catch(function () {
          if (playAttempt === pending) playAttempt = null;
          // NotAllowedError / AbortError: keep the poster and retry. Do not lock the still.
          if (isActuallyPlaying()) markHeroPlaying();
        });
      } else {
        playAttempt = null;
        markHeroPlaying();
      }
    };

    video.addEventListener('playing', markHeroPlaying);
    video.addEventListener('pause', function () {
      if (video.ended || stage.classList.contains('use-fallback')) return;
      confirmToken += 1;
      showPoster();
    });
    video.addEventListener('error', function () {
      if (!video.error) return;
      stage.classList.add('use-fallback', 'is-still');
      stage.classList.remove('is-playing');
      unbindHeroRetries();
    });

    bindHeroRetries();
    video.load();
    tryPlayHero();
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
    initTabs();
    initHeroVideo();
    initQiMotes();

    const { isNew, offlineReport } = GameState.loadGame();

    renderUpgradeLists();
    renderReincarnationUI();
    updateHeaderAndMeditationUI();
    updateSaveTimestampUI();

    if (isNew) {
      addLog('初入仙途，盘膝吐纳。运转《引气入体诀》，感应天地灵气。', 'success');
    } else {
      addLog('神识归位，继续吐纳天地灵机。');
    }

    if (offlineReport) {
      showOfflineModal(offlineReport);
    }

    // 绑定事件
    els.meditationZone.addEventListener('pointerdown', handleMeditationTap);
    els.btnBreakthrough.addEventListener('click', attemptBreakthrough);
    els.gongfaList.addEventListener('click', handleUpgradeClick);
    els.dongfuList.addEventListener('click', handleUpgradeClick);
    els.talentList.addEventListener('click', handleTalentClick);
    els.btnReincarnate.addEventListener('click', handleReincarnateButton);

    els.btnCloseOffline.addEventListener('click', () => {
      els.offlineModal.classList.remove('active');
    });

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
          GameState.resetGame();
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

