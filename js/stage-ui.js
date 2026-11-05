// 闯关页自走棋 UI：6×8 棋盘自适应、战前拖放布阵、分段式战斗回放、满怒点击/自动释放大招、动态立绘演出与挂机收益。
(function () {
  const fmt = (n) => window.GameConfig.formatNumber(n);
  function dispNum(val) {
    const mult = (window.GameConfig.BATTLE && window.GameConfig.BATTLE.DISPLAY_MULT) || 10;
    return fmt(Math.max(1, Math.round((val || 0) * mult)));
  }
  let log = function () {};
  let onChange = function () {};
  let switchTab = function () {};

  const COLS = 6;
  const ROWS = 8;
  const MANUAL_ULT_TIMEOUT_MS = 3000;

  let isPlaying = false;
  let playTimer = 0;
  let autoNextTimer = 0;
  let ultAutoCastTimer = 0;
  let ultCutsceneTimer = 0;
  let ultFadeTimer = 0;
  let isUltPlaying = false;
  let waitingForManualUlt = false;
  let manualUltReadyAt = {};
  let manualUltQueue = [];

  let currentSession = null;
  let currentEnemy = null;
  let currentPlayer = null;
  let unitDomMap = {};
  let previewBoardKey = '';
  let gridBuilt = false;
  let dragState = null;

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
  let preloadedRegionIdx = -1;
  let preloadRegionBgImg = null;
  let resultOverlayTimer = 0;

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
      return raw.includes('?') ? raw : `${raw}?v=18`;
    }
    const filename = raw.endsWith('.webp') ? raw : `${raw}.webp`;
    return `assets/enemies/${filename}?v=18`;
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

  function preloadNextRegionBg(regionIdx) {
    const nextIdx = Math.min(5, Math.max(0, Math.floor(regionIdx || 0)) + 1);
    if (nextIdx === preloadedRegionIdx) return;
    preloadedRegionIdx = nextIdx;
    const img = new Image();
    img.decoding = 'async';
    img.src = `assets/battle/bg_region${nextIdx}.webp?v=1`;
    preloadRegionBgImg = img;
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
    window.Battle.ensureFormation(s);
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
    return st.speed === 1 ? 185 : 95;
  }

  function getMoveDelay() {
    const st = ensureStageState();
    return st.speed === 1 ? 130 : 65;
  }

  function getEnemyUltDelay() {
    const st = ensureStageState();
    return st.speed === 1 ? 450 : 240;
  }

  function getManualUltTimeout() {
    const st = ensureStageState();
    return st.speed === 2 ? MANUAL_ULT_TIMEOUT_MS / 2 : MANUAL_ULT_TIMEOUT_MS;
  }

  function serializeFormation(formation) {
    if (!formation || typeof formation !== 'object') return '';
    return Object.keys(formation)
      .sort()
      .map((k) => `${k}:${formation[k].c},${formation[k].r}`)
      .join('|');
  }

  function getCachedWinRate(state, stageNum, playerCp) {
    const formStr = serializeFormation(state && state.formation);
    const key = `${stageNum}:${Math.round(playerCp)}:${state && state.heroId}:${formStr}`;
    if (key !== cachedWinRateKey) {
      cachedWinRateKey = key;
      cachedWinRateVal = window.Battle.winRate(state, stageNum, 40);
    }
    return cachedWinRateVal;
  }

  // 构建 6×8 棋盘网格
  function ensureGridCells() {
    const gridEl = $('battle-grid');
    if (!gridEl || gridBuilt) return;
    let html = '';
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const halfCls = r < 4 ? 'is-enemy-half' : 'is-player-half';
        const riverCls = r === 3 ? ' is-river-top' : r === 4 ? ' is-river-bottom' : '';
        html += `<div class="board-cell ${halfCls}${riverCls}" data-c="${c}" data-r="${r}"></div>`;
      }
    }
    gridEl.innerHTML = html;
    gridBuilt = true;
  }

  // 按 #battle-board-wrap 可用宽高自适应缩放 6×8 棋盘，宽高分开计算使棋盘横向铺满
  function layoutBoard() {
    const wrap = $('battle-board-wrap');
    const board = $('battle-board');
    if (!wrap || !board) return;
    const W = wrap.clientWidth;
    const H = wrap.clientHeight;
    if (W <= 0 || H <= 0) return;
    const cellW = Math.max(20, Math.floor((W - 2) / COLS));
    const cellH = Math.max(20, Math.floor((H - 2) / ROWS));
    const cell = Math.min(cellW, cellH);
    const boardW = cellW * COLS;
    const boardH = cellH * ROWS;
    board.style.setProperty('--cell-w', `${cellW}px`);
    board.style.setProperty('--cell-h', `${cellH}px`);
    board.style.setProperty('--cell-size', `${cell}px`);
    board.style.width = `${boardW}px`;
    board.style.height = `${boardH}px`;
  }

  function cellLeftPct(c) {
    return `${((c / COLS) * 100).toFixed(4)}%`;
  }

  function cellTopPct(r) {
    return `${((r / ROWS) * 100).toFixed(4)}%`;
  }

  function applyUnitPosition(el, c, r, isBoss, ultReady) {
    const row = Math.max(0, Math.min(ROWS - 1, Math.round(Number(r) || 0)));
    el.style.left = cellLeftPct(c);
    el.style.top = cellTopPct(r);
    el.style.setProperty('--unit-row', String(row));
    const bonus = Math.min(1, (isBoss ? 1 : 0) + (ultReady ? 1 : 0));
    el.style.zIndex = String(10 + 2 * row + bonus);
  }

  function getHeroCfg(u) {
    if (!u || u.side !== 'player') return null;
    const heroes = (window.GameConfig && window.GameConfig.HEROES) || [];
    if (u.heroId) {
      for (let i = 0; i < heroes.length; i++) {
        if (heroes[i] && heroes[i].id === u.heroId) return heroes[i];
      }
    }
    return null;
  }

  function resolveQualityInfo(qualityId) {
    const qId = qualityId || 'xian';
    const list = (window.GameConfig && window.GameConfig.QUALITIES) || [];
    for (let i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === qId) return list[i];
    }
    return { id: qId, name: '仙品', color: '#f07167' };
  }

  function resolveUnitHpSegments(u) {
    const hp = Math.max(1, Number(u && u.maxHp) || 1);
    return { step: hp, segments: 1 };
  }

  function createUnitElement(u) {
    const el = document.createElement('div');
    const sideCls = u.side === 'player' ? 'is-player' : 'is-enemy';
    const bossCls = u.isBoss ? ' is-boss' : '';
    const leaderCls = u.isLeader ? ' is-leader' : '';
    el.className = `board-unit ${sideCls}${bossCls}${leaderCls}`;
    el.dataset.unitId = u.id;
    if (u.heroId) el.dataset.heroId = u.heroId;
    el.dataset.side = u.side;
    applyUnitPosition(el, u.c, u.r, u.isBoss, false);
    el.title = `${u.name} 生命 ${dispNum(u.hp)}/${dispNum(u.maxHp)}`;

    const heroCfg = u.side === 'player' ? getHeroCfg(u) : null;
    const heroAvatar = u.side === 'player' ? (u.avatar || (heroCfg && heroCfg.avatar) || '') : '';
    const imgUrl = u.side === 'player' ? (heroAvatar || u.img || (heroCfg && heroCfg.img) || '') : resolveEnemyImgUrl(u);
    const shortChar = (u.name || '?').slice(0, 1);

    let avatarQualityCls = '';
    let avatarBorderStyle = '';
    let imgStyle = '';

    if (u.side === 'player') {
      const qInfo = resolveQualityInfo(u.quality || (heroCfg && heroCfg.quality) || 'xian');
      const isXian = qInfo.id === 'xian';
      avatarQualityCls = isXian ? ' q-xian' : ` q-${qInfo.id}`;
      if (!isXian && qInfo.color) {
        avatarBorderStyle = ` style="border-color:${qInfo.color}"`;
      }
      imgStyle = ' style="width:100%;height:100%;object-fit:cover;object-position:50% 50%;border-radius:50%"';
    }

    el.innerHTML = `
      <div class="unit-body">
        <div class="unit-bars">
          <div class="unit-hp-bar"><div class="unit-hp-fill" style="width:100%"></div><div class="unit-hp-lag" style="width:100%"></div></div>
          <div class="unit-rage-bar"><div class="unit-rage-fill" style="width:0%"></div></div>
        </div>
        <div class="unit-avatar-wrap">
          <div class="unit-avatar${avatarQualityCls}${imgUrl ? '' : ' is-img-fallback'}"${avatarBorderStyle}>
            ${imgUrl ? `<img class="unit-avatar-img" src="${imgUrl}" alt="${u.name}" decoding="async" draggable="false"${imgStyle} />` : ''}
            <span class="unit-avatar-fallback">${shortChar}</span>
          </div>
          ${u.isLeader ? '<span class="unit-leader-tag" aria-label="主角">主</span>' : ''}
          ${u.isBoss ? '<span class="unit-boss-tag">Boss</span>' : ''}
          ${u.side === 'player' ? '<span class="unit-ult-tag">大招</span>' : ''}
        </div>
      </div>
    `;

    const imgEl = el.querySelector('.unit-avatar-img');
    const avatarBox = el.querySelector('.unit-avatar');
    if (imgEl && avatarBox) {
      imgEl.addEventListener('error', () => {
        avatarBox.classList.add('is-img-fallback');
      });
      imgEl.addEventListener('load', () => {
        avatarBox.classList.remove('is-img-fallback');
      });
    }

    return {
      el,
      bodyEl: el.querySelector('.unit-body'),
      hpFill: el.querySelector('.unit-hp-fill'),
      hpLag: el.querySelector('.unit-hp-lag'),
      rageFill: el.querySelector('.unit-rage-fill'),
      hitTimer: 0,
      atkTimer: 0
    };
  }

  function mountUnitsToBoard(units) {
    const container = $('battle-units');
    if (!container) return;
    container.innerHTML = '';
    unitDomMap = {};
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      const dom = createUnitElement(u);
      unitDomMap[u.id] = dom;
      container.appendChild(dom.el);
    }
  }

  function syncUnitBarsAndState(u) {
    const dom = unitDomMap[u.id];
    if (!dom) return;
    const hpPct = u.maxHp > 0 ? Math.max(0, Math.min(100, (u.hp / u.maxHp) * 100)) : 0;
    const hpWidth = `${hpPct.toFixed(1)}%`;
    if (dom.hpFill) {
      dom.hpFill.style.width = hpWidth;
    }
    if (dom.hpLag) {
      dom.hpLag.style.width = hpWidth;
    }
    if (dom.rageFill) {
      const ragePct = u.maxRage > 0 ? Math.max(0, Math.min(100, ((u.rage || 0) / u.maxRage) * 100)) : 0;
      dom.rageFill.style.width = `${ragePct.toFixed(1)}%`;
    }
    const ultReady = u.side === 'player' && u.alive && (u.rage || 0) >= (u.maxRage || 100);
    dom.el.classList.toggle('is-ult-ready', ultReady);
    applyUnitPosition(dom.el, u.c, u.r, u.isBoss, ultReady);
    dom.el.title = `${u.name} 生命 ${dispNum(u.hp)}/${dispNum(u.maxHp)}`;
    if (!u.alive) {
      dom.el.classList.add('is-dead');
      dom.el.classList.remove('is-ult-ready');
      delete manualUltReadyAt[u.id];
    } else if (u.side === 'player') {
      if (ultReady) {
        if (!manualUltReadyAt[u.id]) {
          manualUltReadyAt[u.id] = Date.now();
        }
      } else {
        delete manualUltReadyAt[u.id];
      }
    }
  }

  function syncAllSessionUnits() {
    if (!currentSession) return;
    const units = currentSession.units;
    for (let i = 0; i < units.length; i++) {
      syncUnitBarsAndState(units[i]);
    }
  }

  // 在棋盘对应格生成飘字（以被击单位头像圆环右上角为起点，向右上方轻微飘动 ≤12px 后淡出，不盖住任何棋子的脸）
  function spawnBoardFloat(c, r, dmg, crit, isUlt) {
    const layer = $('battle-float-layer');
    if (!layer) return;
    const span = document.createElement('span');
    let cls = 'battle-float';
    if (crit) cls += ' crit';
    if (isUlt) cls += ' ult';
    if (c >= COLS - 1) cls += ' at-right-edge';
    if (currentSession && currentSession.units) {
      for (let i = 0; i < currentSession.units.length; i++) {
        const u = currentSession.units[i];
        if (u.isBoss && u.c === c && u.r === r) {
          cls += ' on-boss';
          break;
        }
      }
    }
    span.className = cls;
    span.style.left = `${(((c + 0.5) / COLS) * 100).toFixed(2)}%`;
    span.style.top = `${(((r + 0.5) / ROWS) * 100).toFixed(2)}%`;
    const prefix = crit ? '暴击 ' : isUlt ? '绝技 ' : '';
    span.textContent = `${prefix}-${dispNum(dmg)}`;
    layer.appendChild(span);
    setTimeout(() => {
      if (span.parentNode) span.parentNode.removeChild(span);
    }, 600);
  }

  function spawnUltBoardFx(c, r, isEnemy) {
    const fxLayer = $('battle-fx-layer');
    if (!fxLayer) return;
    const ring = document.createElement('div');
    ring.className = isEnemy ? 'ult-board-burst is-enemy-ult' : 'ult-board-burst';
    ring.style.left = `${(((c + 0.5) / COLS) * 100).toFixed(2)}%`;
    ring.style.top = `${(((r + 0.5) / ROWS) * 100).toFixed(2)}%`;
    fxLayer.appendChild(ring);
    setTimeout(() => {
      if (ring.parentNode) ring.parentNode.removeChild(ring);
    }, 620);
  }

  function clearBattleFloats() {
    const fl = $('battle-float-layer');
    const fx = $('battle-fx-layer');
    if (fl) fl.innerHTML = '';
    if (fx) fx.innerHTML = '';
  }

  function pulseAttackAndHit(attackerId, targetId, dc, dr) {
    const atkDom = unitDomMap[attackerId];
    const defDom = unitDomMap[targetId];
    if (atkDom && atkDom.bodyEl) {
      clearTimeout(atkDom.atkTimer);
      const lx = Math.max(-1, Math.min(1, dc || 0)) * 9;
      const ly = Math.max(-1, Math.min(1, dr || 0)) * 9;
      atkDom.bodyEl.style.setProperty('--lunge-x', `${lx}px`);
      atkDom.bodyEl.style.setProperty('--lunge-y', `${ly}px`);
      atkDom.el.classList.remove('is-attacking');
      void atkDom.el.offsetWidth;
      atkDom.el.classList.add('is-attacking');
      atkDom.atkTimer = setTimeout(() => {
        atkDom.el.classList.remove('is-attacking');
      }, 150);
    }
    if (defDom) {
      clearTimeout(defDom.hitTimer);
      defDom.el.classList.remove('is-hit');
      void defDom.el.offsetWidth;
      defDom.el.classList.add('is-hit');
      defDom.hitTimer = setTimeout(() => {
        defDom.el.classList.remove('is-hit');
      }, 160);
    }
  }

  function flashUnitHit(unitId) {
    const defDom = unitDomMap[unitId];
    if (!defDom) return;
    clearTimeout(defDom.hitTimer);
    defDom.el.classList.remove('is-hit');
    void defDom.el.offsetWidth;
    defDom.el.classList.add('is-hit');
    defDom.hitTimer = setTimeout(() => {
      defDom.el.classList.remove('is-hit');
    }, 200);
  }

  function clearAllTimers() {
    clearTimeout(playTimer);
    clearTimeout(ultAutoCastTimer);
    clearTimeout(ultCutsceneTimer);
    clearTimeout(ultFadeTimer);
    playTimer = 0;
    ultAutoCastTimer = 0;
    ultCutsceneTimer = 0;
    ultFadeTimer = 0;
    waitingForManualUlt = false;
    manualUltReadyAt = {};
    manualUltQueue = [];
  }

  function hideUltOverlay() {
    clearTimeout(ultCutsceneTimer);
    clearTimeout(ultFadeTimer);
    ultCutsceneTimer = 0;
    ultFadeTimer = 0;
    isUltPlaying = false;
    const overlay = $('battle-ult-overlay');
    const video = $('ult-hero-video');
    if (video) {
      try {
        video.pause();
      } catch (e) {}
    }
    if (overlay) {
      overlay.classList.remove('is-active', 'is-fading', 'use-fallback', 'is-video-playing');
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
    }
  }

  // 播放大招全屏动态立绘演出（1x 约 1.35 秒，2x 缩短为 0.55 秒）
  function playUltCutscene(ultEv, onComplete) {
    const overlay = $('battle-ult-overlay');
    const imgEl = $('ult-hero-img');
    const videoEl = $('ult-hero-video');
    const nameEl = $('ult-hero-name');
    if (!overlay || !isPlaying) {
      onComplete();
      return;
    }

    isUltPlaying = true;
    const st = ensureStageState();
    const duration = st.speed === 2 ? 550 : 1350;
    const fadeStart = Math.max(120, duration - 200);

    // 演出期间顺延其他满怒角色的 3 秒手动点击倒计时
    for (const uid in manualUltReadyAt) {
      if (Object.prototype.hasOwnProperty.call(manualUltReadyAt, uid)) {
        manualUltReadyAt[uid] += duration;
      }
    }

    if (nameEl) {
      nameEl.textContent = ultEv.casterName || '绝技释放';
    }
    const staticSrc = ultEv.casterImg || ultEv.casterPoster || 'assets/hero_v21_new_hd.jpg?v=1';
    const posterSrc = ultEv.casterPoster || staticSrc;
    if (imgEl) {
      imgEl.src = staticSrc;
      imgEl.alt = ultEv.casterName || '';
    }

    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    overlay.classList.remove('is-fading', 'use-fallback', 'is-video-playing');
    void overlay.offsetWidth;
    overlay.classList.add('is-active');

    if (videoEl && ultEv.casterVideo) {
      videoEl.defaultMuted = true;
      videoEl.muted = true;
      videoEl.playsInline = true;
      videoEl.setAttribute('muted', '');
      videoEl.setAttribute('playsinline', '');
      videoEl.setAttribute('webkit-playsinline', '');
      videoEl.poster = posterSrc;
      if (videoEl.getAttribute('src') !== ultEv.casterVideo) {
        videoEl.setAttribute('src', ultEv.casterVideo);
        videoEl.src = ultEv.casterVideo;
      } else {
        try {
          videoEl.currentTime = 0;
        } catch (e) {}
      }

      const onPlaying = () => {
        if (!videoEl.error && isUltPlaying) {
          overlay.classList.add('is-video-playing');
        }
      };
      const onError = () => {
        overlay.classList.add('use-fallback');
        overlay.classList.remove('is-video-playing');
      };
      videoEl.addEventListener('playing', onPlaying, { once: true });
      videoEl.addEventListener('error', onError, { once: true });

      let playPromise = null;
      try {
        playPromise = videoEl.play();
      } catch (err) {
        onError();
      }
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise
          .then(() => {
            if (isUltPlaying && !videoEl.error) {
              overlay.classList.add('is-video-playing');
            }
          })
          .catch(() => {
            onError();
          });
      }
    } else {
      overlay.classList.add('use-fallback');
    }

    ultFadeTimer = setTimeout(() => {
      if (overlay && isUltPlaying) {
        overlay.classList.add('is-fading');
      }
    }, fadeStart);

    ultCutsceneTimer = setTimeout(() => {
      hideUltOverlay();
      if (isPlaying) {
        onComplete();
      }
    }, duration);
  }

  function applyUltDamageVisuals(ultEv) {
    if (!ultEv) return;
    const isEnemyUlt = Boolean(ultEv.isEnemyUlt || ultEv.who === 'b');
    const casterDom = unitDomMap[ultEv.casterId];
    if (casterDom) {
      casterDom.el.classList.remove('is-ult-ready', 'is-ult-casting');
      const casterUnit = currentSession && currentSession.unitMap[ultEv.casterId];
      if (casterUnit) {
        applyUnitPosition(casterDom.el, casterUnit.c, casterUnit.r, casterUnit.isBoss, false);
      }
      void casterDom.el.offsetWidth;
      casterDom.el.classList.add('is-ult-casting');
      setTimeout(() => {
        casterDom.el.classList.remove('is-ult-casting');
      }, 420);
      if (casterDom.rageFill) casterDom.rageFill.style.width = '0%';
    }
    delete manualUltReadyAt[ultEv.casterId];

    spawnUltBoardFx(ultEv.primaryC, ultEv.primaryR, isEnemyUlt);

    const targets = ultEv.targets || [];
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      flashUnitHit(t.unitId);
      spawnBoardFloat(t.c, t.r, t.dmg, t.crit, !t.isSplash);
      const u = currentSession && currentSession.unitMap[t.unitId];
      if (u) {
        syncUnitBarsAndState(u);
      }
    }

    const logLine = $('battle-log-line');
    if (logLine) {
      const splashCount = Math.max(0, targets.length - 1);
      if (isEnemyUlt) {
        const splashNote = splashCount > 0 ? `，波及周围 ${splashCount} 人` : '';
        logLine.textContent = `Boss【${ultEv.casterName}】释放凶威绝技！对 ${ultEv.primaryTargetName} 造成 ${dispNum(ultEv.dmg)} 伤害${splashNote}`;
      } else {
        const splashNote = splashCount > 0 ? `，波及周围 ${splashCount} 敌` : '';
        logLine.textContent = `【${ultEv.casterName}】释放大招！对 ${ultEv.primaryTargetName} 造成 ${dispNum(ultEv.dmg)} 伤害${splashNote}`;
      }
    }
  }

  function triggerUnitUlt(unitId) {
    if (!isPlaying || !currentSession || isUltPlaying) return;
    clearTimeout(playTimer);
    clearTimeout(ultAutoCastTimer);
    playTimer = 0;
    ultAutoCastTimer = 0;
    waitingForManualUlt = false;
    delete manualUltReadyAt[unitId];
    manualUltQueue = manualUltQueue.filter((id) => id !== unitId);

    const stepEvents = currentSession.castUlt(unitId);
    const ultEv = stepEvents.find((e) => e.type === 'ult');
    if (!ultEv) {
      stepPlayback();
      return;
    }

    const caster = currentSession.unitMap[ultEv.casterId];
    if (caster) {
      const dom = unitDomMap[caster.id];
      if (dom) {
        dom.el.classList.remove('is-ult-ready');
        applyUnitPosition(dom.el, caster.c, caster.r, caster.isBoss, false);
        if (dom.rageFill) dom.rageFill.style.width = '0%';
      }
    }

    playUltCutscene(ultEv, () => {
      if (!isPlaying || !currentSession) return;
      applyUltDamageVisuals(ultEv);
      if (currentSession.finished) {
        playTimer = setTimeout(finishBattle, getStepDelay());
      } else {
        playTimer = setTimeout(stepPlayback, getStepDelay());
      }
    });
  }

  function hideResultOverlay() {
    clearTimeout(resultOverlayTimer);
    resultOverlayTimer = 0;
    const overlay = $('battle-result-overlay');
    if (overlay) {
      overlay.classList.remove('is-banner');
      overlay.hidden = true;
    }
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
      subEl.textContent = '失败不损分毫，可调整布阵或提升战力后再战';
      actionsEl.hidden = true;
    }
    clearTimeout(resultOverlayTimer);
    resultOverlayTimer = 0;
    overlay.classList.remove('is-banner');
    overlay.hidden = false;
    resultOverlayTimer = setTimeout(() => {
      if (overlay && !overlay.hidden) {
        overlay.classList.add('is-banner');
      }
    }, 4000);
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
    const st = ensureStageState();
    const best = st.best || 0;
    const now = Date.now();
    const capSec =
      (window.GameState && window.GameState.getOfflineCapSeconds && window.GameState.getOfflineCapSeconds()) ||
      window.GameConfig.OFFLINE_CAP_SECONDS ||
      12 * 3600;
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
      rewardEl.innerHTML = `<img class="gi gi-14" src="assets/icons/res_lingyu@64.webp?v=18" alt="" aria-hidden="true"> +${fmt(lingyu)} · <img class="gi gi-14" src="assets/icons/res_peach@64.webp?v=18" alt="" aria-hidden="true"> +${fmt(peaches)}`;
    }
    if (claimBtn) {
      claimBtn.disabled = best <= 0 || cappedSec < 60;
    }
  }

  function renderPreBattleBoard(s, enemy) {
    if (isPlaying || dragState) return;
    const formStr = serializeFormation(s.formation);
    const key = `${enemy.n}:${s.heroId}:${formStr}`;
    const container = $('battle-units');
    if (key === previewBoardKey && container && container.children.length > 0) {
      return;
    }
    previewBoardKey = key;
    const pUnits = window.Battle.buildPlayerUnits(s);
    const eUnits = window.Battle.buildEnemyUnits(enemy);
    mountUnitsToBoard([...pUnits, ...eUnits]);
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

    ensureGridCells();
    layoutBoard();

    const stageNum = st.cur;
    const enemy = isPlaying && currentEnemy ? currentEnemy : window.Battle.enemyFor(stageNum);
    const player = isPlaying && currentPlayer ? currentPlayer : window.Battle.playerStats(s);

    renderChapterBar(enemy, st.best || 0);

    const stageBox = $('battle-stage');
    const regionIdx = Math.min(5, Math.floor((enemy.chapter - 1) / 5));
    if (stageBox) {
      stageBox.dataset.region = String(regionIdx);
      stageBox.classList.toggle('is-boss', enemy.isBoss);
      stageBox.classList.toggle('is-in-battle', isPlaying);
    }

    const enemyTitleEl = $('battle-stage-enemy-title');
    const formHintEl = $('battle-form-hint');
    if (enemyTitleEl) {
      if (enemy.isBoss) {
        enemyTitleEl.textContent = `第 ${stageNum} 关 · Boss【${enemy.name}】`;
      } else {
        const mobCnt = 3 + Math.min(2, Math.floor(((enemy.stageInChapter || 1) - 1) / 3));
        enemyTitleEl.textContent = `第 ${stageNum} 关 · ${enemy.name} 等 ${mobCnt} 敌`;
      }
    }
    if (formHintEl) {
      if (isPlaying) {
        formHintEl.textContent = st.auto ? '自动释放大招中' : '怒气满点击头像放大招';
      } else {
        formHintEl.textContent = '战前可拖动我方角色布阵';
      }
    }

    preloadNextStageEnemy(enemy.n);
    preloadNextRegionBg(regionIdx);

    if (!isPlaying) {
      renderPreBattleBoard(s, enemy);
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
      winrateEl.dataset.level = rate >= 0.6 ? 'high' : rate >= 0.4 ? 'mid' : 'low';
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
    clearAllTimers();
    hideUltOverlay();
    if (!isPlaying || !currentSession || !currentEnemy || !currentPlayer) {
      isPlaying = false;
      return;
    }

    const s = window.GameState.state;
    const st = ensureStageState();
    const sim = currentSession;
    const enemy = currentEnemy;
    const player = currentPlayer;
    const stageNum = enemy.n;

    syncAllSessionUnits();

    isPlaying = false;
    currentSession = null;
    previewBoardKey = '';

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
        logLine.textContent = `第 ${sim.rounds} 回合击败 ${enemy.name} 阵容！`;
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
    if (!isPlaying || !currentSession || isUltPlaying) return;

    const st = ensureStageState();
    for (let i = 0; i < currentSession.units.length; i++) {
      syncUnitBarsAndState(currentSession.units[i]);
    }
    const readyList = currentSession.getReadyPlayerUnits();

    // 检查是否有我方单位怒气已满
    if (readyList.length > 0) {
      if (st.auto) {
        // 自动推关模式：满怒立即释放
        triggerUnitUlt(readyList[0].id);
        return;
      }

      // 手动模式：不暂停战斗，满怒头像持续发光；
      // 1) 若玩家点击过满怒头像（排入队列），立即在下一步插入释放
      while (manualUltQueue.length > 0) {
        const queuedId = manualUltQueue.shift();
        const qu = currentSession.unitMap[queuedId];
        if (qu && qu.alive && qu.side === 'player' && qu.rage >= (qu.maxRage || 100)) {
          triggerUnitUlt(qu.id);
          return;
        }
      }

      // 2) 若满怒后超时仍未点击（1x 为 3 秒，2x 为 1.5 秒），自动释放该角色大招
      const now = Date.now();
      const manualTimeoutMs = getManualUltTimeout();
      for (let i = 0; i < readyList.length; i++) {
        const ru = readyList[i];
        const readySince = manualUltReadyAt[ru.id] || now;
        manualUltReadyAt[ru.id] = readySince;
        if (now - readySince >= manualTimeoutMs) {
          triggerUnitUlt(ru.id);
          return;
        }
      }
    }

    if (currentSession.finished) {
      finishBattle();
      return;
    }

    const stepEvents = currentSession.step({ autoUlt: false });
    if (!stepEvents || stepEvents.length === 0) {
      if (currentSession.finished) {
        finishBattle();
      }
      return;
    }

    const mainEv = stepEvents[0];
    const logLine = $('battle-log-line');

    if (mainEv.type === 'move') {
      const dom = unitDomMap[mainEv.unitId];
      if (dom) {
        const mvUnit = currentSession.unitMap[mainEv.unitId];
        const mvUltReady =
          mvUnit && mvUnit.side === 'player' && mvUnit.alive && (mvUnit.rage || 0) >= (mvUnit.maxRage || 100);
        applyUnitPosition(dom.el, mainEv.toC, mainEv.toR, Boolean(mvUnit && mvUnit.isBoss), Boolean(mvUltReady));
      }
      if (logLine) {
        const readyHint =
          !st.auto && readyList.length > 0 ? `（【${readyList[0].name}】满怒可点头像释放）` : '';
        logLine.textContent = `第 ${mainEv.t} 回合 · ${mainEv.name} 踏步逼近${readyHint}`;
      }
      playTimer = setTimeout(stepPlayback, getMoveDelay());
      return;
    }

    if (mainEv.type === 'attack') {
      const dc = mainEv.targetC - mainEv.attackerC;
      const dr = mainEv.targetR - mainEv.attackerR;
      pulseAttackAndHit(mainEv.attackerId, mainEv.targetId, dc, dr);
      spawnBoardFloat(mainEv.targetC, mainEv.targetR, mainEv.dmg, mainEv.crit, false);

      const atkUnit = currentSession.unitMap[mainEv.attackerId];
      const defUnit = currentSession.unitMap[mainEv.targetId];
      if (atkUnit) syncUnitBarsAndState(atkUnit);
      if (defUnit) syncUnitBarsAndState(defUnit);

      if (logLine) {
        const dieNote = mainEv.targetDied ? '（击破）' : '';
        const newReady = currentSession.getReadyPlayerUnits();
        const readyHint =
          !st.auto && newReady.length > 0 ? ` · 点击【${newReady[0].name}】头像放大招` : '';
        logLine.textContent = `第 ${mainEv.t} 回合 · ${mainEv.attackerName} 攻 ${mainEv.targetName} -${dispNum(mainEv.dmg)}${mainEv.crit ? '（暴击）' : ''}${dieNote}${readyHint}`;
      }

      if (currentSession.finished) {
        playTimer = setTimeout(finishBattle, getStepDelay());
      } else {
        playTimer = setTimeout(stepPlayback, getStepDelay());
      }
      return;
    }

    if (mainEv.type === 'ult') {
      // 敌方 Boss 大招：只播放棋盘红色震波特效与飘字，不播全屏立绘
      if (mainEv.isEnemyUlt || mainEv.who === 'b') {
        applyUltDamageVisuals(mainEv);
        if (currentSession.finished) {
          playTimer = setTimeout(finishBattle, getEnemyUltDelay());
        } else {
          playTimer = setTimeout(stepPlayback, getEnemyUltDelay());
        }
        return;
      }

      playUltCutscene(mainEv, () => {
        if (!isPlaying || !currentSession) return;
        applyUltDamageVisuals(mainEv);
        if (currentSession.finished) {
          playTimer = setTimeout(finishBattle, getStepDelay());
        } else {
          playTimer = setTimeout(stepPlayback, getStepDelay());
        }
      });
    }
  }

  function skipBattle() {
    if (!isPlaying || !currentSession) return;
    clearAllTimers();
    hideUltOverlay();
    currentSession.runToEnd(true);
    finishBattle();
  }

  function startBattle(manual) {
    if (!unlocked()) return;
    if (isPlaying) {
      if (manual) skipBattle();
      return;
    }

    if (dragState) {
      cancelDrag();
    }

    clearTimeout(autoNextTimer);
    autoNextTimer = 0;
    clearAllTimers();
    hideUltOverlay();
    clearBattleFloats();
    hideResultOverlay();

    const s = window.GameState.state;
    const st = ensureStageState();
    const stageNum = st.cur;
    const player = window.Battle.playerStats(s);
    const enemy = window.Battle.enemyFor(stageNum);

    s.seq = (s.seq || 0) + 1;
    const seed = ((Date.now() & 0xffffffff) ^ Math.imul(s.seq, 0x9e3779b1)) >>> 0;
    const session = window.Battle.createSession(s, enemy, seed);

    isPlaying = true;
    currentSession = session;
    currentEnemy = enemy;
    currentPlayer = player;
    previewBoardKey = '';

    mountUnitsToBoard(session.units);
    syncAllSessionUnits();

    const logLine = $('battle-log-line');
    if (logLine) {
      logLine.textContent = `第 1 回合 · 迎战【${enemy.name}】`;
    }
    render();

    playTimer = setTimeout(stepPlayback, getMoveDelay());
  }

  function toggleAuto() {
    const st = ensureStageState();
    st.auto = !st.auto;
    if (!st.auto) {
      clearTimeout(autoNextTimer);
      autoNextTimer = 0;
    } else {
      haltedByLoss = false;
      if (isPlaying && currentSession && !isUltPlaying) {
        const readyUnit = currentSession.getReadyPlayerUnit();
        if (readyUnit) {
          triggerUnitUlt(readyUnit.id);
        }
      } else if (unlocked() && !isPlaying) {
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
    const st = ensureStageState();
    const best = st.best || 0;
    if (best <= 0) return;

    const now = Date.now();
    const capSec =
      (window.GameState && window.GameState.getOfflineCapSeconds && window.GameState.getOfflineCapSeconds()) ||
      window.GameConfig.OFFLINE_CAP_SECONDS ||
      12 * 3600;
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

  // 战前拖放布阵 & 战中点击满怒头像放大招
  function highlightDropCell(c, r) {
    const gridEl = $('battle-grid');
    if (!gridEl) return;
    const cells = gridEl.querySelectorAll('.board-cell.is-drop-target');
    cells.forEach((cell) => cell.classList.remove('is-drop-target'));
    if (c !== null && r !== null) {
      const target = gridEl.querySelector(`.board-cell[data-c="${c}"][data-r="${r}"]`);
      if (target) target.classList.add('is-drop-target');
    }
  }

  function cancelDrag() {
    if (!dragState) return;
    const { unitEl, bodyEl } = dragState;
    if (unitEl) unitEl.classList.remove('is-dragging');
    if (bodyEl) bodyEl.style.transform = '';
    const board = $('battle-board');
    if (board) board.classList.remove('is-dragging-formation');
    highlightDropCell(null, null);
    dragState = null;
  }

  function clientPosToPlayerCell(clientX, clientY) {
    const board = $('battle-board');
    if (!board) return null;
    const rect = board.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const rawC = Math.floor(((clientX - rect.left) / rect.width) * COLS);
    const rawR = Math.floor(((clientY - rect.top) / rect.height) * ROWS);
    const c = Math.max(0, Math.min(COLS - 1, rawC));
    const r = Math.max(4, Math.min(ROWS - 1, rawR));
    return { c, r };
  }

  function initBoardInteraction() {
    const board = $('battle-board');
    if (!board) return;

    function startUnitInteraction(unitEl, clientX, clientY, pointerId) {
      const side = unitEl.dataset.side;
      if (side !== 'player') return false;

      // 战斗中：若该单位怒气满，点击立即在下一步插入放大招
      if (isPlaying) {
        if (!currentSession) return false;
        const unitId = unitEl.dataset.unitId;
        const u = currentSession.unitMap[unitId];
        if (u && u.alive && u.rage >= (u.maxRage || 100)) {
          if (isUltPlaying) {
            if (!manualUltQueue.includes(u.id)) {
              manualUltQueue.push(u.id);
            }
          } else {
            triggerUnitUlt(u.id);
          }
          return true;
        }
        return false;
      }

      // 战前：拖放布阵
      const heroId = unitEl.dataset.heroId;
      if (!heroId) return false;
      const s = window.GameState.state;
      const form = window.Battle.ensureFormation(s);
      const orig = form[heroId];
      if (!orig) return false;

      const bodyEl = unitEl.querySelector('.unit-body');
      dragState = {
        heroId,
        unitEl,
        bodyEl,
        startX: clientX,
        startY: clientY,
        origC: orig.c,
        origR: orig.r,
        targetC: orig.c,
        targetR: orig.r,
        pointerId,
        moved: false
      };

      board.classList.add('is-dragging-formation');
      unitEl.classList.add('is-dragging');
      highlightDropCell(orig.c, orig.r);
      return true;
    }

    function moveUnitInteraction(clientX, clientY) {
      if (!dragState) return;
      const dx = clientX - dragState.startX;
      const dy = clientY - dragState.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        dragState.moved = true;
      }
      if (dragState.bodyEl) {
        dragState.bodyEl.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(1.14)`;
      }
      const cell = clientPosToPlayerCell(clientX, clientY);
      if (cell) {
        dragState.targetC = cell.c;
        dragState.targetR = cell.r;
        highlightDropCell(cell.c, cell.r);
      }
    }

    function endUnitInteraction() {
      if (!dragState) return;
      const { heroId, origC, origR, targetC, targetR } = dragState;
      cancelDrag();

      if (isPlaying) return;
      if (targetC === origC && targetR === origR) return;

      const s = window.GameState.state;
      const form = window.Battle.ensureFormation(s);
      let swappedWith = null;
      const keys = Object.keys(form);
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (k !== heroId && form[k] && form[k].c === targetC && form[k].r === targetR) {
          swappedWith = k;
          break;
        }
      }

      if (swappedWith) {
        form[swappedWith] = { c: origC, r: origR };
      }
      form[heroId] = { c: targetC, r: targetR };
      s.formation = form;
      window.GameState.saveGame();

      cachedWinRateKey = '';
      previewBoardKey = '';
      const logLine = $('battle-log-line');
      if (logLine) {
        logLine.textContent = '阵型已保存 · 点击挑战开始推关';
      }
      render();
    }

    if (window.PointerEvent) {
      board.addEventListener('pointerdown', (e) => {
        const unitEl = e.target.closest('.board-unit');
        if (!unitEl) return;
        if (startUnitInteraction(unitEl, e.clientX, e.clientY, e.pointerId)) {
          e.preventDefault();
          if (board.setPointerCapture && e.pointerId != null) {
            try {
              board.setPointerCapture(e.pointerId);
            } catch (err) {}
          }
        }
      });

      board.addEventListener('pointermove', (e) => {
        if (!dragState) return;
        if (dragState.pointerId != null && e.pointerId !== dragState.pointerId) return;
        e.preventDefault();
        moveUnitInteraction(e.clientX, e.clientY);
      });

      const onPointerEnd = (e) => {
        if (!dragState) return;
        if (dragState.pointerId != null && e.pointerId !== dragState.pointerId) return;
        endUnitInteraction();
      };
      board.addEventListener('pointerup', onPointerEnd);
      board.addEventListener('pointercancel', cancelDrag);
    } else {
      board.addEventListener(
        'touchstart',
        (e) => {
          const unitEl = e.target.closest('.board-unit');
          if (!unitEl || !e.touches[0]) return;
          const t = e.touches[0];
          if (startUnitInteraction(unitEl, t.clientX, t.clientY, t.identifier)) {
            e.preventDefault();
          }
        },
        { passive: false }
      );

      board.addEventListener(
        'touchmove',
        (e) => {
          if (!dragState || !e.touches[0]) return;
          e.preventDefault();
          const t = e.touches[0];
          moveUnitInteraction(t.clientX, t.clientY);
        },
        { passive: false }
      );

      board.addEventListener('touchend', () => {
        if (dragState) endUnitInteraction();
      });
      board.addEventListener('touchcancel', cancelDrag);
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
    previewBoardKey = '';
    render();
    requestAnimationFrame(layoutBoard);
  }

  function onHide() {
    if (dragState) cancelDrag();
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

    ensureGridCells();
    initBoardInteraction();

    const btnChallenge = $('btn-stage-challenge');
    const btnAuto = $('btn-stage-auto');
    const btnSpeed = $('btn-stage-speed');
    const btnClaim = $('btn-stage-claim');
    const btnGotoPeach = $('btn-goto-peach');
    const btnGotoGongfa = $('btn-goto-gongfa');

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
    const resultOverlay = $('battle-result-overlay');
    if (resultOverlay) {
      resultOverlay.addEventListener('click', (e) => {
        if (e.target && e.target.closest && e.target.closest('#battle-fail-actions .btn')) {
          return;
        }
        hideResultOverlay();
      });
    }
    if (btnGotoPeach) {
      btnGotoPeach.addEventListener('click', (e) => {
        e.stopPropagation();
        hideResultOverlay();
        switchTab('tab-gear');
      });
    }
    if (btnGotoGongfa) {
      btnGotoGongfa.addEventListener('click', (e) => {
        e.stopPropagation();
        hideResultOverlay();
        switchTab('tab-upgrades');
      });
    }

    window.addEventListener('resize', layoutBoard);
    window.addEventListener('orientationchange', () => {
      setTimeout(layoutBoard, 60);
    });
    if (typeof ResizeObserver === 'function') {
      const wrap = $('battle-board-wrap');
      if (wrap) {
        const ro = new ResizeObserver(() => layoutBoard());
        ro.observe(wrap);
      }
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
