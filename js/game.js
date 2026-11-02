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
    els.cultivatorRealmText = document.getElementById('cultivator-realm-text');
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

    setTimeout(() => {
      if (span.parentNode) span.parentNode.removeChild(span);
    }, 850);
  }

  // 点击打坐区获取额外灵气
  function handleMeditationTap(e) {
    const gain = GameState.getTapQiGain();
    GameState.state.qi += gain;
    GameState.state.totalClicks = (GameState.state.totalClicks || 0) + 1;

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
      renderUpgradeLists();
      renderReincarnationUI();
      GameState.saveGame();
    } else {
      // 突破失败：损失部分当前灵气，并增加气运补偿
      const loss = Math.floor(s.qi * stage.failureLossRatio);
      s.qi = Math.max(0, s.qi - loss);
      s.pityBonus = Math.min(0.35, (s.pityBonus || 0) + 0.04);
      addLog(
        `${actionName}受挫，心神震荡，散去 ${formatNumber(loss)} 灵气（下次破境成功率 +4%）。`,
        'warn'
      );
      GameState.saveGame();
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
      row.className = 'upgrade-item';
      row.innerHTML = `
        <div class="upgrade-meta">
          <div class="upgrade-name-row">
            <span class="upgrade-name">${item.name}</span>
            <span class="upgrade-lv">${unlocked ? `第 ${lv} 层` : `需 ${reqStageName}`}</span>
          </div>
          <div class="upgrade-desc">${item.desc}</div>
          <div class="upgrade-effect">每层效果：+${formatNumber(perLvEffect)} 灵气/秒</div>
        </div>
        <button class="btn ${canAfford ? 'btn-primary' : ''}" data-gongfa-id="${item.id}" ${
        canAfford ? '' : 'disabled'
      }>
          ${unlocked ? `参悟 (${formatNumber(cost)}灵石)` : '境界不足'}
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

      const row = document.createElement('div');
      row.className = 'upgrade-item';
      row.innerHTML = `
        <div class="upgrade-meta">
          <div class="upgrade-name-row">
            <span class="upgrade-name">${item.name}</span>
            <span class="upgrade-lv">${unlocked ? `Lv.${lv}` : `需 ${reqStageName}`}</span>
          </div>
          <div class="upgrade-desc">${item.desc}</div>
          <div class="upgrade-effect">每级产出：+${formatNumber(perLvEffect)} 灵石/秒</div>
        </div>
        <button class="btn ${canAfford ? 'btn-primary' : ''}" data-dongfu-id="${item.id}" ${
        canAfford ? '' : 'disabled'
      }>
          ${unlocked ? `扩建 (${formatNumber(cost)}灵石)` : '境界不足'}
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
        <div class="upgrade-meta">
          <div class="upgrade-name-row">
            <span class="upgrade-name">${talent.name}</span>
            <span class="upgrade-lv">Lv.${lv}${talent.maxLevel ? `/${talent.maxLevel}` : ''}</span>
          </div>
          <div class="upgrade-desc">${talent.desc}</div>
        </div>
        <button class="btn ${canBuy ? 'btn-primary' : ''}" data-talent-id="${talent.id}" ${
        canBuy ? '' : 'disabled'
      }>
          ${isMax ? '已圆满' : `凝练 (${cost}道果)`}
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

    els.realmPill.textContent = stage.fullName;
    els.qiVal.textContent = formatNumber(s.qi);
    els.qiRate.textContent = `+${formatNumber(qiPerSec)}/秒`;
    els.stoneVal.textContent = formatNumber(s.stones);
    els.stoneRate.textContent = `+${formatNumber(stonePerSec)}/秒`;
    els.daoguoVal.textContent = `${s.daoGuo} (累${s.totalDaoGuo || 0})`;
    els.daoguoMult.textContent = `灵气×${GameState.getDaoGuoQiMultiplier().toFixed(2)}`;

    els.cultivatorRealmText.textContent = stage.fullName;
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

    const canBreak = !stage.isMaxStage && s.qi >= stage.reqQi;
    els.btnBreakthrough.disabled = !canBreak;
    els.btnBreakthrough.classList.toggle('ready-pulse', canBreak);
    els.btnBreakthrough.textContent = stage.isMaxStage
      ? '境界圆满'
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

  function initTabs() {
    const navBtns = document.querySelectorAll('.nav-btn');
    const panes = document.querySelectorAll('.tab-pane');

    navBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-tab');
        navBtns.forEach((b) => b.classList.toggle('active', b === btn));
        panes.forEach((p) => p.classList.toggle('active', p.id === targetId));
      });
    });
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
      GameState.state.qi += GameState.getQiPerSec() * dt;
      GameState.state.stones += GameState.getStonePerSec() * dt;
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

    lastTickTime = performance.now();
    requestAnimationFrame(gameLoop);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

