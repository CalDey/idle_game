// 闯关页 UI（B2 MVP）：章节进度、回合事件播放、倍速与跳过、自动推关、失败指引与挂机收益领取。
(function () {
  const fmt = (n) => window.GameConfig.formatNumber(n);
  let log = function () {};
  let onChange = function () {};
  let switchTab = function () {};

  let isPlaying = false;
  let playTimer = 0;
  let autoNextTimer = 0;
  let currentSim = null;
  let currentEnemy = null;
  let currentPlayer = null;
  let eventIndex = 0;

  // 自动推关失败后暂停，等战力上涨再自动重试（每 30 秒最多一次）
  let haltedByLoss = false;
  let lossPlayerCp = 0;
  let lastAutoRetryAt = 0;

  // 胜率预估缓存
  let cachedWinRateKey = '';
  let cachedWinRateVal = 0.5;
  let lastIdlePaint = 0;
  let lastUnlocked = null;
  let preloadedNextUrl = '';
  let preloadImg = null;

  function $(id) {
    return document.getElementById(id);
  }

  function resolveEnemyImgUrl(enemy) {
    if (!enemy) return '';
    let raw = enemy.img || '';
    if (!raw && window.GameConfig && window.GameConfig.BATTLE) {
      const B = window.GameConfig.BATTLE;
      if (enemy.isBoss) {
        const b = B.BOSSES && B.BOSSES[Math.min(B.BOSSES.length - 1, (enemy.chapter || 1) - 1)];
        if (b && typeof b === 'object') raw = b.img || '';
      } else {
        const rIdx = Math.min((B.REGIONS && B.REGIONS.length - 1) || 0, Math.floor(((enemy.chapter || 1) - 1) / 5));
        const r = B.REGIONS && B.REGIONS[rIdx];
        const m = r && r.mobs && r.mobs[((enemy.n || 1) - 1) % r.mobs.length];
        if (m && typeof m === 'object') raw = m.img || '';
      }
    }
    if (!raw) return '';
    if (raw.includes('/')) {
      return raw.includes('?') ? raw : `${raw}?v=15`;
    }
    const filename = raw.endsWith('.webp') ? raw : `${raw}.webp`;
    return `assets/enemies/${filename}?v=15`;
  }

  function updateEnemyPortrait(enemy) {
    const box = $('fighter-enemy');
    const imgEl = $('enemy-portrait');
    if (!box || !imgEl) return;
    const url = resolveEnemyImgUrl(enemy);
    if (!url) {
      imgEl.dataset.srcKey = '';
      box.classList.add('is-fallback');
      imgEl.removeAttribute('src');
      return;
    }
    imgEl.alt = (enemy && enemy.name) || '';
    if (imgEl.dataset.srcKey !== url) {
      imgEl.dataset.srcKey = url;
      box.classList.remove('is-fallback');
      imgEl.src = url;
    }
  }

  function preloadNextStageEnemy(stageNum) {
    const cur = Math.max(1, Math.floor(stageNum || 1));
    if (cur >= 300) return;
    const nextEnemy = window.Battle.enemyFor(cur + 1);
    const nextUrl = resolveEnemyImgUrl(nextEnemy);
    if (!nextUrl || nextUrl === preloadedNextUrl) return;
    preloadedNextUrl = nextUrl;
    const img = new Image();
    img.decoding = 'async';
    img.src = nextUrl;
    preloadImg = img;
  }

  function unlocked() {
    const s = window.GameState.state;
    const req = (window.GameConfig.BATTLE && window.GameConfig.BATTLE.UNLOCK_REALM) || 2;
    return (s.realmIndex || 0) >= req;
  }

  function ensureStageState() {
    const s = window.GameState.state;
    if (!s.stage) {
      s.stage = window.Equip.defaultStage(Date.now());
    }
    if (!s.stage.cur || s.stage.cur < 1) s.stage.cur = 1;
    if (s.stage.best > 0 && s.stage.cur <= s.stage.best && s.stage.best < 300) {
      s.stage.cur = s.stage.best + 1;
    }
    if (s.stage.cur > 300) s.stage.cur = 300;
    if (s.stage.speed !== 1 && s.stage.speed !== 2) s.stage.speed = 2;
    if (s.stage.auto === undefined) s.stage.auto = true;
    if (!s.stage.idleAt) s.stage.idleAt = Date.now();
    return s.stage;
  }

  function formatIdleHm(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    if (hrs > 0) return `${hrs}时${mins}分`;
    if (mins > 0) return `${mins}分`;
    return `${s}秒`;
  }

  function getStepDelay() {
    const st = ensureStageState();
    return st.speed === 1 ? 360 : 180;
  }

  function getCachedWinRate(state, stageNum, playerCp) {
    const key = `${stageNum}:${Math.round(playerCp)}`;
    if (key !== cachedWinRateKey) {
      cachedWinRateKey = key;
      cachedWinRateVal = window.Battle.winRate(state, stageNum, 100);
    }
    return cachedWinRateVal;
  }

  function spawnBattleFloat(side, dmg, crit) {
    const layer = $(side === 'a' ? 'float-layer-player' : 'float-layer-enemy');
    if (!layer) return;
    const span = document.createElement('span');
    span.className = 'battle-float' + (crit ? ' crit' : '');
    span.textContent = `${crit ? '暴击 ' : ''}-${fmt(dmg)}`;
    layer.appendChild(span);
    setTimeout(() => {
      if (span.parentNode) span.parentNode.removeChild(span);
    }, 650);
  }

  function clearBattleFloats() {
    const lp = $('float-layer-player');
    const le = $('float-layer-enemy');
    if (lp) lp.innerHTML = '';
    if (le) le.innerHTML = '';
  }

  function pulseFighter(attackerSide) {
    const atkEl = $(attackerSide === 'a' ? 'fighter-player' : 'fighter-enemy');
    const defEl = $(attackerSide === 'a' ? 'fighter-enemy' : 'fighter-player');
    if (atkEl) {
      atkEl.classList.remove('is-attacking');
      void atkEl.offsetWidth;
      atkEl.classList.add('is-attacking');
    }
    if (defEl) {
      defEl.classList.remove('is-hit');
      void defEl.offsetWidth;
      defEl.classList.add('is-hit');
    }
  }

  function updateHpBars(hpA, maxHpA, hpB, maxHpB, enemy) {
    const pctA = maxHpA > 0 ? Math.max(0, Math.min(100, (hpA / maxHpA) * 100)) : 0;
    const pctB = maxHpB > 0 ? Math.max(0, Math.min(100, (hpB / maxHpB) * 100)) : 0;
    const barA = $('hp-bar-player');
    const barB = $('hp-bar-enemy');
    const txtA = $('hp-text-player');
    const txtB = $('hp-text-enemy');
    if (barA) barA.style.width = `${pctA.toFixed(1)}%`;
    if (barB) barB.style.width = `${pctB.toFixed(1)}%`;
    if (txtA) txtA.textContent = `我 · 血 ${fmt(Math.round(hpA))}/${fmt(Math.round(maxHpA))}`;
    if (txtB && enemy) {
      txtB.textContent = `${enemy.name}${enemy.isBoss ? ' · Boss' : ''} · ${fmt(Math.round(hpB))}`;
    }
  }

  function hideResultOverlay() {
    const overlay = $('battle-result-overlay');
    if (overlay) overlay.hidden = true;
  }

  function showFailOverlay(enemy, player, timeout, fails) {
    const overlay = $('battle-result-overlay');
    const titleEl = $('battle-result-title');
    const subEl = $('battle-result-sub');
    const actionsEl = $('battle-fail-actions');
    if (!overlay || !titleEl || !subEl || !actionsEl) return;

    const gapCp = Math.max(1, Math.round(enemy.cp - player.cp));
    const gapPct = Math.max(1, Math.round(((enemy.cp - player.cp) / enemy.cp) * 100));
    const prefix = timeout ? '久战不下' : '败';

    if (enemy.cp > player.cp) {
      titleEl.textContent = `${prefix} · 还差 ${fmt(gapCp)} 战力（约 ${gapPct}%）`;
    } else {
      const steadyGap = Math.max(1, Math.round(enemy.cp * 1.05 - player.cp));
      titleEl.textContent = `${prefix} · 还差约 ${fmt(steadyGap)} 战力稳胜`;
    }

    if (fails >= 2) {
      subEl.textContent = `本关已连败 ${fails} 次，建议先提升装备或参悟功法`;
      actionsEl.hidden = false;
    } else {
      subEl.textContent = '失败不损分毫，可再次挑战或提升战力';
      actionsEl.hidden = true;
    }
    overlay.hidden = false;
  }

  function renderNavUnlockState() {
    const isUnlocked = unlocked();
    lastUnlocked = isUnlocked;
    const navBtn = $('nav-btn-stage');
    const navText = $('nav-stage-text');
    if (navBtn) {
      navBtn.title = isUnlocked ? '闯关' : '突破至练气三层后开启闯关';
      navBtn.classList.toggle('is-locked', !isUnlocked);
    }
    if (navText) {
      navText.textContent = isUnlocked ? '闯关' : '闯关·练气三';
    }
  }

  function renderChapterBar(enemy, bestStage) {
    const titleEl = $('stage-chapter-title');
    const stepEl = $('stage-chapter-step');
    const dotsEl = $('stage-chapter-dots');
    if (titleEl) titleEl.textContent = `第 ${enemy.chapter} 章 · ${enemy.region}`;
    const allCleared = bestStage >= 300;
    if (stepEl) stepEl.textContent = allCleared ? '10/10 · 圆满' : `${enemy.stageInChapter}/10`;
    if (dotsEl) {
      let html = '';
      for (let i = 1; i <= 10; i++) {
        let stateCls = '';
        if (allCleared || i < enemy.stageInChapter) stateCls = ' passed';
        else if (i === enemy.stageInChapter) stateCls = ' current';
        const bossCls = i === 10 ? ' boss' : '';
        html += `<span class="chapter-dot${stateCls}${bossCls}"></span>`;
      }
      dotsEl.innerHTML = html;
    }
  }

  function renderIdleCard() {
    const s = window.GameState.state;
    const st = ensureStageState();
    const best = st.best || 0;
    const now = Date.now();
    const capSec = window.GameConfig.OFFLINE_CAP_SECONDS || 12 * 3600;
    const rawSec = best > 0 ? Math.max(0, Math.floor((now - (st.idleAt || now)) / 1000)) : 0;
    const cappedSec = Math.min(rawSec, capSec);
    const hours = best > 0 ? cappedSec / 3600 : 0;
    const peaches = Math.floor((1 + Math.floor(best / 50)) * hours);
    const lingyu = Math.floor((6 + 0.4 * best) * hours);

    const timeEl = $('stage-idle-time');
    const rewardEl = $('stage-idle-reward');
    const claimBtn = $('btn-stage-claim');

    if (timeEl) {
      if (best <= 0) {
        timeEl.textContent = '挂机 0分（首通第 1 关开启）';
      } else {
        const capTag = rawSec >= capSec ? ' · 已满12时' : '';
        timeEl.textContent = `挂机 ${formatIdleHm(cappedSec)}${capTag}`;
      }
    }
    if (rewardEl) {
      rewardEl.innerHTML = `<img class="gi gi-14" src="assets/icons/res_lingyu@64.webp?v=14" alt="" aria-hidden="true"> +${fmt(lingyu)} · <img class="gi gi-14" src="assets/icons/res_peach@64.webp?v=14" alt="" aria-hidden="true"> +${fmt(peaches)}`;
    }
    if (claimBtn) {
      claimBtn.disabled = best <= 0 || cappedSec < 60;
    }
  }

  function render() {
    renderNavUnlockState();
    const s = window.GameState.state;
    const st = ensureStageState();
    const isUnlocked = unlocked();
    const lockedCard = $('stage-locked');
    const bodyEl = $('stage-body');

    if (lockedCard) lockedCard.style.display = isUnlocked ? 'none' : 'block';
    if (bodyEl) bodyEl.style.display = isUnlocked ? 'flex' : 'none';
    if (!isUnlocked) return;

    const stageNum = st.cur;
    const enemy = isPlaying && currentEnemy ? currentEnemy : window.Battle.enemyFor(stageNum);
    const player = isPlaying && currentPlayer ? currentPlayer : window.Battle.playerStats(s);

    renderChapterBar(enemy, st.best || 0);

    const stageBox = $('battle-stage');
    const regionIdx = Math.min(5, Math.floor((enemy.chapter - 1) / 5));
    if (stageBox) {
      stageBox.dataset.region = String(regionIdx);
      stageBox.classList.toggle('is-boss', enemy.isBoss);
    }

    const nameplate = $('enemy-nameplate');
    const enemyTag = $('enemy-tag');
    if (nameplate) nameplate.textContent = enemy.name;
    if (enemyTag) {
      enemyTag.hidden = !enemy.isBoss;
      enemyTag.textContent = 'Boss';
    }

    updateEnemyPortrait(enemy);
    preloadNextStageEnemy(enemy.n);

    if (!isPlaying) {
      updateHpBars(player.hp, player.hp, enemy.hp, enemy.hp, enemy);
    }

    const cpPlayerEl = $('stage-cp-player');
    const cpEnemyEl = $('stage-cp-enemy');
    const winrateEl = $('stage-winrate');
    if (cpPlayerEl) cpPlayerEl.textContent = fmt(Math.round(player.cp));
    if (cpEnemyEl) cpEnemyEl.textContent = fmt(Math.round(enemy.cp));
    if (winrateEl) {
      const rate = getCachedWinRate(s, stageNum, player.cp);
      const label = window.Battle.winRateLabel(rate);
      winrateEl.textContent = label;
      winrateEl.dataset.level =
        rate >= 0.6 ? 'high' : rate >= 0.4 ? 'mid' : 'low';
    }

    const btnChallenge = $('btn-stage-challenge');
    const btnAuto = $('btn-stage-auto');
    const btnSpeed = $('btn-stage-speed');
    if (btnChallenge) {
      btnChallenge.textContent = isPlaying ? '跳 过' : '挑 战';
    }
    if (btnAuto) {
      const autoOn = Boolean(st.auto);
      btnAuto.classList.toggle('is-active', autoOn);
      btnAuto.setAttribute('aria-pressed', autoOn ? 'true' : 'false');
      btnAuto.textContent = autoOn ? '自动·开' : '自动·关';
    }
    if (btnSpeed) {
      btnSpeed.textContent = `${st.speed === 1 ? 1 : 2}×`;
    }

    renderIdleCard();
  }

  function finishBattle() {
    clearTimeout(playTimer);
    playTimer = 0;
    if (!isPlaying || !currentSim || !currentEnemy || !currentPlayer) {
      isPlaying = false;
      return;
    }

    const s = window.GameState.state;
    const st = ensureStageState();
    const sim = currentSim;
    const enemy = currentEnemy;
    const player = currentPlayer;
    const stageNum = enemy.n;

    isPlaying = false;
    currentSim = null;

    const lastEv = sim.events[sim.events.length - 1];
    if (lastEv) {
      updateHpBars(lastEv.hpA, player.hp, lastEv.hpB, enemy.hp, enemy);
    }

    const logLine = $('battle-log-line');

    if (sim.win) {
      hideResultOverlay();
      st.fails = 0;
      st.wins = (st.wins || 0) + 1;
      st.streak = (st.streak || 0) + 1;
      if (st.streak > (st.maxStreak || 0)) st.maxStreak = st.streak;
      haltedByLoss = false;

      if (stageNum > (st.best || 0)) {
        const wasZero = (st.best || 0) === 0;
        st.best = stageNum;
        if (wasZero) st.idleAt = Date.now();
        s.lifeBestStage = Math.max(s.lifeBestStage || 0, stageNum);

        const rw = window.Battle.firstClearReward(s, stageNum);
        s.tree.peaches = (s.tree.peaches || 0) + rw.peaches;
        s.lingyu = (s.lingyu || 0) + rw.lingyu;
        s.stones = (s.stones || 0) + rw.stones;
        s.qi = (s.qi || 0) + rw.qi;
        s.lifetimeQi = (s.lifetimeQi || 0) + rw.qi;

        const rewardText = `仙桃+${rw.peaches} · 灵玉+${rw.lingyu} · 灵石+${fmt(rw.stones)} · 灵气+${fmt(rw.qi)}`;
        if (logLine) {
          logLine.textContent = `首通第 ${stageNum} 关！获 ${rewardText}`;
        }
        if (rw.isBoss) {
          log(
            `首通第 ${enemy.chapter} 章 Boss【${enemy.name}】！获 ${rewardText}（灵气与灵石产出 +2%）`,
            'gold'
          );
        } else {
          log(`首通第 ${stageNum} 关【${enemy.name}】，获 ${rewardText}`, 'success');
        }
      } else if (logLine) {
        logLine.textContent = `第 ${sim.rounds} 回合击败 ${enemy.name}！`;
      }

      if (stageNum < 300) {
        st.cur = stageNum + 1;
      } else {
        st.cur = 300;
      }

      window.GameState.saveGame();
      if (window.Titles) window.Titles.sync(s);
      if (window.TitlesUI) window.TitlesUI.flushToasts();
      onChange();
      render();

      if (st.auto && stageNum < 300 && !document.hidden) {
        clearTimeout(autoNextTimer);
        autoNextTimer = setTimeout(() => {
          if (st.auto && !isPlaying && unlocked()) {
            startBattle(false);
          }
        }, 1000);
      }
    } else {
      st.fails = (st.fails || 0) + 1;
      st.losses = (st.losses || 0) + 1;
      st.streak = 0;
      haltedByLoss = true;
      lossPlayerCp = Math.round(player.cp);
      lastAutoRetryAt = Date.now();

      if (logLine) {
        logLine.textContent = sim.timeout
          ? `第 ${sim.rounds} 回合久战不下，闯关受挫`
          : `第 ${sim.rounds} 回合不敌 ${enemy.name}，闯关受挫`;
      }
      showFailOverlay(enemy, player, Boolean(sim.timeout), st.fails);

      window.GameState.saveGame();
      if (window.Titles) window.Titles.sync(s);
      if (window.TitlesUI) window.TitlesUI.flushToasts();
      onChange();
      render();
    }
  }

  function stepPlayback() {
    if (!isPlaying || !currentSim) return;
    const events = currentSim.events;
    if (eventIndex >= events.length) {
      finishBattle();
      return;
    }

    const ev = events[eventIndex++];
    const player = currentPlayer;
    const enemy = currentEnemy;

    updateHpBars(ev.hpA, player.hp, ev.hpB, enemy.hp, enemy);
    pulseFighter(ev.who);
    spawnBattleFloat(ev.who === 'a' ? 'b' : 'a', ev.dmg, ev.crit);

    const logLine = $('battle-log-line');
    if (logLine) {
      if (ev.who === 'a') {
        logLine.textContent = `第 ${ev.t} 回合 · ${enemy.name} 受到 ${fmt(ev.dmg)} 点伤害${ev.crit ? '（暴击）' : ''}`;
      } else {
        logLine.textContent = `第 ${ev.t} 回合 · 我方 受到 ${fmt(ev.dmg)} 点伤害${ev.crit ? '（暴击）' : ''}`;
      }
    }

    if (eventIndex >= events.length) {
      playTimer = setTimeout(finishBattle, getStepDelay());
    } else {
      playTimer = setTimeout(stepPlayback, getStepDelay());
    }
  }

  function skipBattle() {
    if (!isPlaying) return;
    clearTimeout(playTimer);
    playTimer = 0;
    finishBattle();
  }

  function startBattle(manual) {
    if (!unlocked()) return;
    if (isPlaying) {
      if (manual) skipBattle();
      return;
    }

    clearTimeout(autoNextTimer);
    autoNextTimer = 0;
    clearBattleFloats();
    hideResultOverlay();

    const s = window.GameState.state;
    const st = ensureStageState();
    const stageNum = st.cur;
    const player = window.Battle.playerStats(s);
    const enemy = window.Battle.enemyFor(stageNum);

    s.seq = (s.seq || 0) + 1;
    const seed = ((Date.now() & 0xffffffff) ^ Math.imul(s.seq, 0x9e3779b1)) >>> 0;
    const sim = window.Battle.simulate(player, enemy, seed);

    isPlaying = true;
    currentSim = sim;
    currentEnemy = enemy;
    currentPlayer = player;
    eventIndex = 0;

    updateHpBars(player.hp, player.hp, enemy.hp, enemy.hp, enemy);
    const logLine = $('battle-log-line');
    if (logLine) {
      logLine.textContent = `第 1 回合 · 迎战【${enemy.name}】`;
    }
    render();

    playTimer = setTimeout(stepPlayback, getStepDelay());
  }

  function toggleAuto() {
    const st = ensureStageState();
    st.auto = !st.auto;
    if (!st.auto) {
      clearTimeout(autoNextTimer);
      autoNextTimer = 0;
    } else {
      haltedByLoss = false;
      if (unlocked() && !isPlaying) {
        startBattle(false);
      }
    }
    window.GameState.saveGame();
    render();
  }

  function toggleSpeed() {
    const st = ensureStageState();
    st.speed = st.speed === 1 ? 2 : 1;
    window.GameState.saveGame();
    render();
  }

  function claimIdleRewards() {
    const s = window.GameState.state;
    const st = ensureStageState();
    const best = st.best || 0;
    if (best <= 0) return;

    const now = Date.now();
    const capSec = window.GameConfig.OFFLINE_CAP_SECONDS || 12 * 3600;
    const rawSec = Math.max(0, Math.floor((now - (st.idleAt || now)) / 1000));
    const cappedSec = Math.min(rawSec, capSec);
    if (cappedSec < 60) return;

    const rw = window.GameState.applyIdleStageRewards(cappedSec);
    st.idleAt = now;
    window.GameState.saveGame();
    log(
      `领取闯关挂机收益（${formatIdleHm(cappedSec)}）：灵玉 +${fmt(rw.lingyu)}、仙桃 +${fmt(rw.peaches)}`,
      'gold'
    );
    onChange();
    render();
  }

  function checkAutoRetryOnPowerUp(now) {
    const s = window.GameState.state;
    const st = ensureStageState();
    if (!unlocked() || !st.auto || isPlaying || !haltedByLoss) return;
    if (now - lastAutoRetryAt < 30000) return;
    const curCp = Math.round(window.Battle.playerStats(s).cp);
    if (curCp > lossPlayerCp) {
      haltedByLoss = false;
      lastAutoRetryAt = now;
      const pane = $('tab-stage');
      if (pane && pane.classList.contains('active')) {
        startBattle(false);
      }
    }
  }

  function tick() {
    const now = Date.now();
    if (unlocked() !== lastUnlocked) {
      render();
    }
    checkAutoRetryOnPowerUp(now);
    if (now - lastIdlePaint >= 1000) {
      lastIdlePaint = now;
      renderNavUnlockState();
      if (unlocked()) {
        renderIdleCard();
      }
    }
  }

  function onShow() {
    render();
  }

  function onHide() {
    if (isPlaying) {
      skipBattle();
    }
    clearTimeout(autoNextTimer);
    autoNextTimer = 0;
  }

  function init(hooks) {
    log = (hooks && hooks.log) || log;
    onChange = (hooks && hooks.onChange) || onChange;
    switchTab = (hooks && hooks.switchTab) || switchTab;

    const btnChallenge = $('btn-stage-challenge');
    const btnAuto = $('btn-stage-auto');
    const btnSpeed = $('btn-stage-speed');
    const btnClaim = $('btn-stage-claim');
    const btnGotoPeach = $('btn-goto-peach');
    const btnGotoGongfa = $('btn-goto-gongfa');
    const enemyPortrait = $('enemy-portrait');
    const fighterEnemy = $('fighter-enemy');

    if (enemyPortrait && fighterEnemy) {
      enemyPortrait.addEventListener('load', () => {
        fighterEnemy.classList.remove('is-fallback');
      });
      enemyPortrait.addEventListener('error', () => {
        fighterEnemy.classList.add('is-fallback');
      });
    }

    if (btnChallenge) {
      btnChallenge.addEventListener('click', () => startBattle(true));
    }
    if (btnAuto) {
      btnAuto.addEventListener('click', toggleAuto);
    }
    if (btnSpeed) {
      btnSpeed.addEventListener('click', toggleSpeed);
    }
    if (btnClaim) {
      btnClaim.addEventListener('click', claimIdleRewards);
    }
    if (btnGotoPeach) {
      btnGotoPeach.addEventListener('click', () => {
        switchTab('tab-gear');
      });
    }
    if (btnGotoGongfa) {
      btnGotoGongfa.addEventListener('click', () => {
        switchTab('tab-upgrades');
      });
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && isPlaying) {
        skipBattle();
      }
    });

    render();
  }

  window.StageUI = {
    init,
    tick,
    render,
    onShow,
    onHide,
    startBattle,
    skipBattle
  };
})();
