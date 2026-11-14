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
  let squadSkillFocus = ''; // 队伍弹窗里最近点过的角色，用于显示其绝技完整说明
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
  // 卡 Boss 挂机：战力超过推荐战力时自动再战一次（batch2 P1-2）
  let bossRetry = { armed: false, stageNum: 0, recCp: 0, name: '', notified: false };

  // 胜率预估缓存
  let cachedWinRateKey = '';
  let cachedWinRateVal = 0.5;
  let cachedRecommendedCp = 0;
  let lastIdlePaint = 0;
  let lastUnlocked = null;
  let preloadedNextUrl = '';
  let preloadImg = null;
  let preloadedRegionIdx = -1;
  let preloadRegionBgImg = null;
  let resultOverlayTimer = 0;
  let squadModalOpen = false;
  let draftSquad = [];

  // 秘境劫运：mijingView 为当前闯关页是否显示秘境；battleMode 标记正在播放的战斗归属
  let mijingView = false;
  let battleMode = 'stage';
  let towerBattle = false;
  let mijingModalOpen = false;
  let mijingModalMode = '';
  let mijingResult = null;
  let mijingQuitArmed = false;
  // 开启秘境要二次确认：每次开启消耗 1 次当日次数（batch2 P2-6）
  let mijingStartArmed = false;
  let mijingWinRateKey = '';
  let mijingWinRateVal = 0.5;
  let mijingRecommendedCp = 0;

  function $(id) {
    return document.getElementById(id);
  }

  function MJ() {
    return window.Mijing || null;
  }

  function mijingRun() {
    const M = MJ();
    return M ? M.activeRun(window.GameState.state) : null;
  }

  // ===== 仙缘阵法（羁绊）=====
  function BD() {
    return window.Bonds || null;
  }

  function bondModsFor(state) {
    const Bd = BD();
    return Bd ? Bd.modsForState(state) : null;
  }

  // 仙姬派遣：派遣中的仙姬不能编入出战队伍（召回后可上阵）
  function dispatchBusy(heroId) {
    const D = window.Dispatch;
    const s = window.GameState && window.GameState.state;
    if (!D || !s || typeof D.busyMission !== 'function') return null;
    return D.busyMission(s, heroId);
  }

  function bondTagsHtml(heroId) {
    const Bd = BD();
    if (!Bd) return '';
    const tags = Bd.tagsOf(heroId);
    if (!tags.length) return '';
    return `<span class="bond-tags">${tags
      .map((t) => `<span class="bond-tag bond-${t}">${Bd.BOND_MAP[t] ? Bd.BOND_MAP[t].name : t}</span>`)
      .join('')}</span>`;
  }

  function bondChipsHtml(heroIds, withDesc) {
    const Bd = BD();
    if (!Bd) return '';
    const list = Bd.evaluate(heroIds).filter((b) => b.count > 0);
    list.sort((a, b) => (b.level - a.level) || (b.count - a.count));
    if (!list.length) return '';
    return list
      .map((b) => {
        const def = Bd.BOND_MAP[b.id];
        const lvCls = b.active ? ` is-active lv-${b.level}` : '';
        const desc = withDesc
          ? `<span class="bond-chip-desc">${b.active ? b.tier.desc : `差 ${b.nextNeed - b.count} 人：${def.tiers[0].desc}`}${
            b.active && !b.maxed ? `（${b.nextNeed} 人：${def.tiers[b.level].desc}）` : ''
          }</span>`
          : '';
        const tip = def.loreName ? ` title="${def.loreName}${def.flavor ? `：${def.flavor}` : ''}"` : '';
        return `<span class="bond-chip bond-${b.id}${lvCls}"${tip}><span class="bond-chip-name">${b.name}</span><span class="bond-chip-count">${b.countLabel}</span>${desc}</span>`;
      })
      .join('');
  }

  // 羁绊说明（batch3 P2-4）：每个标签一行，已激活高亮，未激活置灰并写「差 N 人」
  function bondListRows(heroIds) {
    const Bd = BD();
    if (!Bd) return [];
    return Bd.evaluate(heroIds).map((b) => {
      const def = Bd.BOND_MAP[b.id];
      const first = def.tiers[0];
      const lack = b.active ? 0 : Math.max(0, first.need - b.count);
      return {
        id: b.id,
        name: b.name,
        loreName: def.loreName || '',
        flavor: def.flavor || '',
        icon: b.icon,
        active: b.active,
        level: b.level,
        count: b.count,
        need: b.active ? b.nextNeed : first.need,
        countLabel: b.countLabel,
        lack,
        status: b.active ? (b.maxed ? '已满阶' : '已激活') : `差 ${lack} 人`,
        desc: b.active ? (b.maxed ? b.tier.desc : `${b.tier.desc}（${b.nextNeed} 人：${def.tiers[b.level].desc}）`) : first.desc
      };
    });
  }

  function bondListHtml(heroIds) {
    const rows = bondListRows(heroIds);
    if (!rows.length) return '';
    return `<ul class="bond-list">${rows
      .map(
        (r) => `<li class="bond-row bond-${r.id}${r.active ? ` is-active lv-${r.level}` : ' is-inactive'}">` +
          `<img class="gi bond-row-icon" src="assets/icons/${r.icon}@64.webp?v=18" alt="" aria-hidden="true">` +
          `<span class="bond-row-name">${r.name}</span>` +
          `<span class="bond-row-count">${r.countLabel}</span>` +
          `<span class="bond-row-desc">${r.desc}</span>` +
          `<span class="bond-row-status">${r.status}</span>` +
          (r.loreName || r.flavor
            ? `<span class="bond-row-lore"><b>${r.loreName}</b>${r.flavor ? ` ${r.flavor}` : ''}</span>`
            : '') +
          '</li>'
      )
      .join('')}</ul>`;
  }

  // 第一次进闯关页提示一次「试试凑羁绊」（state.flags.squadTagHintShown）
  let bondHintTimer = 0;
  function maybeShowBondHint() {
    const s = window.GameState && window.GameState.state;
    const el = $('bond-hint');
    if (!s || !el || !unlocked() || !BD()) return false;
    if (!s.flags) s.flags = {};
    if (s.flags.squadTagHintShown) return false;
    s.flags.squadTagHintShown = true;
    window.GameState.saveGame();
    el.hidden = false;
    clearTimeout(bondHintTimer);
    bondHintTimer = setTimeout(() => {
      el.hidden = true;
    }, 6000);
    return true;
  }

  function renderStageBondRow(squadIds) {
    const row = $('stage-bond-row');
    if (!row) return;
    const html = bondChipsHtml(squadIds, false) || '<span class="bond-row-empty">仙缘：同标签角色上阵 2 人激活羁绊</span>';
    const beastChip = window.BeastsUI && typeof window.BeastsUI.chipHtml === 'function' ? window.BeastsUI.chipHtml() : '';
    const full = `${beastChip}<span class="bond-row-label">仙缘</span>${html}`;
    if (row._lastHtml !== full) {
      row._lastHtml = full;
      row.innerHTML = full;
    }
    const n = BD() ? BD().activeBonds(squadIds).length : 0;
    row.setAttribute('aria-label', `仙缘羁绊：已激活 ${n} 个，点击编辑队伍`);
  }

  function inMijing() {
    return Boolean(mijingView && mijingRun());
  }

  const MJ_ICON = (name) => `assets/icons/${name}@64.webp?v=18`;
  const LINGYU_ICON = '<img class="gi gi-14" src="assets/icons/res_lingyu@64.webp?v=18" alt="" aria-hidden="true">';
  const PEACH_ICON = '<img class="gi gi-14" src="assets/icons/res_peach@64.webp?v=18" alt="" aria-hidden="true">';

  function escHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
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
    const squadIds = window.Battle.getSquadIds(s);
    if (!Array.isArray(s.squad) || s.squad.length > window.Battle.MAX_SQUAD_SIZE) {
      s.squad = [...squadIds];
    }
    s.stage.squad = [...squadIds];
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

  function forecastKey(state, id, playerCp) {
    const formStr = serializeFormation(state && state.formation);
    const squadStr = window.Battle.getSquadIds(state).join(',');
    return `${id}:${Math.round(playerCp)}:${state && state.heroId}:${squadStr}:${formStr}:${beastKey(state)}`;
  }

  // 灵兽伴生（js/beasts.js）会改变战斗 mods：当前伴生与等级并入胜率缓存键
  function beastKey(state) {
    const Bs = window.Beasts;
    const b = Bs && state ? Bs.activeBeast(state) : null;
    return b ? `${b.id}${Bs.levelOf(state, b.id)}` : '';
  }

  function getCachedWinRate(state, stageNum, playerCp) {
    const key = forecastKey(state, stageNum, playerCp);
    if (key !== cachedWinRateKey) {
      cachedWinRateKey = key;
      cachedWinRateVal = window.Battle.winRate(state, stageNum, 40, bondModsFor(state));
      cachedRecommendedCp = window.Battle.recommendedCp(state, stageNum, { mods: bondModsFor(state) });
    }
    return cachedWinRateVal;
  }

  function getRecommendedCp(state, enemyOrStage, playerCp) {
    const isMijing = enemyOrStage && typeof enemyOrStage === 'object' && enemyOrStage.mijingWave;
    if (isMijing) {
      const run = mijingRun();
      if (run) getMijingWinRate(state, run, playerCp);
      if (mijingRecommendedCp) return mijingRecommendedCp;
    } else {
      const id = enemyOrStage && typeof enemyOrStage === 'object' ? enemyOrStage.n : enemyOrStage;
      getCachedWinRate(state, id, playerCp);
      if (cachedRecommendedCp) return cachedRecommendedCp;
    }
    const mods = isMijing
      ? (MJ() && MJ().combinedMods && mijingRun() ? MJ().combinedMods(state, mijingRun().blessings) : null)
      : bondModsFor(state);
    return window.Battle.recommendedCp(state, enemyOrStage, { mods });
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

  // ---------- 固定站位（P2-6，纯视觉） ----------
  // 战斗内核里的单位仍会移动（数值不变）；画面上我方单位钉在开战时的阵位格，攻击时向目标突进再弹回。
  // 敌方显示在其逻辑格；若与我方阵位或其他敌人重叠，则挪到最近的空格（优先靠近其出生格）。
  let unitAnchors = {};
  let unitLogical = {};

  function cellKey(c, r) {
    return `${c},${r}`;
  }

  function computeDisplayCells(units, anchors, logical) {
    const out = {};
    const taken = {};
    const list = units || [];
    for (let i = 0; i < list.length; i++) {
      const u = list[i];
      if (!u || u.side !== 'player') continue;
      const a = anchors[u.id] || logical[u.id] || { c: u.c, r: u.r };
      out[u.id] = { c: a.c, r: a.r };
      if (u.alive !== false) taken[cellKey(a.c, a.r)] = true;
    }
    for (let i = 0; i < list.length; i++) {
      const u = list[i];
      if (!u || u.side === 'player') continue;
      const p = logical[u.id] || { c: u.c, r: u.r };
      let best = { c: p.c, r: p.r };
      if (u.alive !== false && taken[cellKey(p.c, p.r)]) {
        const home = anchors[u.id] || p;
        let bestScore = Infinity;
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            if (taken[cellKey(c, r)]) continue;
            const d = Math.max(Math.abs(c - p.c), Math.abs(r - p.r));
            const h = Math.abs(c - home.c) + Math.abs(r - home.r);
            const score = d * 100 + h;
            if (score < bestScore) {
              bestScore = score;
              best = { c, r };
            }
          }
        }
      }
      out[u.id] = best;
      if (u.alive !== false) taken[cellKey(best.c, best.r)] = true;
    }
    return out;
  }

  // 攻击突进向量（像素）：朝目标显示格前冲，停在目标前约 0.6 格，最多 1.5 格、最少 8px，然后弹回。
  function lungeVector(from, to, cellW, cellH) {
    const cw = cellW > 0 ? cellW : 54;
    const ch = cellH > 0 ? cellH : 54;
    const dx = ((to.c - from.c) || 0) * cw;
    const dy = ((to.r - from.r) || 0) * ch;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (!dist) return { x: 0, y: -6 };
    const cell = Math.min(cw, ch);
    const mag = Math.max(8, Math.min(dist - cell * 0.6, cell * 1.5));
    return { x: Math.round((dx / dist) * mag), y: Math.round((dy / dist) * mag) };
  }

  function sessionDisplayCells() {
    const units = currentSession ? currentSession.units : null;
    if (!units) return null;
    return computeDisplayCells(units, unitAnchors, unitLogical);
  }

  function displayCellOf(unitId, c, r) {
    const map = sessionDisplayCells();
    return (map && map[unitId]) || { c, r };
  }

  function boardCellPx() {
    const board = $('battle-board');
    if (!board) return { w: 54, h: 54 };
    const st = board.style;
    const read = (name) => (st && typeof st.getPropertyValue === 'function' ? parseFloat(st.getPropertyValue(name)) : NaN);
    const w = read('--cell-w') || (board.clientWidth || 0) / COLS || 54;
    const h = read('--cell-h') || (board.clientHeight || 0) / ROWS || 54;
    return { w, h };
  }

  // 按显示格重新摆放所有单位（移动事件后调用；仅改 left/top，不动战斗数据）
  function layoutAllUnits() {
    const map = sessionDisplayCells();
    if (!map || !currentSession) return;
    const units = currentSession.units;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      const dom = unitDomMap[u.id];
      const d = map[u.id];
      if (!dom || !d) continue;
      const ultReady = u.side === 'player' && u.alive && (u.rage || 0) >= (u.maxRage || 100);
      applyUnitPosition(dom.el, d.c, d.r, u.isBoss, ultReady);
    }
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
        ${u.isBoss ? '<span class="unit-boss-tag">Boss</span>' : ''}
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
    unitAnchors = {};
    unitLogical = {};
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      unitAnchors[u.id] = { c: u.c, r: u.r };
      unitLogical[u.id] = { c: u.c, r: u.r };
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
    unitLogical[u.id] = { c: u.c, r: u.r };
    const disp = displayCellOf(u.id, u.c, u.r);
    applyUnitPosition(dom.el, disp.c, disp.r, u.isBoss, ultReady);
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
        const ud = u.isBoss ? displayCellOf(u.id, u.c, u.r) : null;
        if (ud && ud.c === c && ud.r === r) {
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

  // 角色台词飘字（数据见 js/hero-voice.js / js/hero-lines-data.js）：只做展示，不阻塞战斗节奏
  function spawnVoiceFloat(unit, text, kind) {
    const layer = $('battle-float-layer');
    if (!layer || !unit || !text) return;
    const span = document.createElement('span');
    let cls = `battle-voice is-${kind || 'line'}`;
    if (unit.c >= COLS - 2) cls += ' at-right-edge';
    if (unit.c <= 1) cls += ' at-left-edge';
    span.className = cls;
    span.style.left = `${(((unit.c + 0.5) / COLS) * 100).toFixed(2)}%`;
    span.style.top = `${(((unit.r + 0.5) / ROWS) * 100).toFixed(2)}%`;
    span.textContent = text;
    layer.appendChild(span);
    setTimeout(() => {
      if (span.parentNode) span.parentNode.removeChild(span);
    }, 2400);
  }

  // 队伍弹窗底部：最近点过的角色（否则队首）的绝技完整说明
  function renderSquadSkillDetail() {
    const el = $('squad-skill-detail');
    if (!el) return;
    const heroes = getAllHeroesList();
    const id = squadSkillFocus || draftSquad[0] || '';
    const h = heroes.find((x) => x && x.id === id);
    const ST = window.SkillTextData;
    const desc = h && ST && typeof ST.desc === 'function' ? ST.desc(h.id) : '';
    if (!h || !desc) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    const skillName = (h.skill && h.skill.name) || '破妄神通';
    el.hidden = false;
    el.innerHTML =
      `<span class="squad-skill-detail-name">${escHtml(h.name)} · 绝技「${escHtml(skillName)}」</span>` +
      `<span class="squad-skill-detail-desc">${escHtml(desc)}</span>`;
  }

  // 绝技说明（js/skill-text-data.js）；无数据时不渲染
  function skillDescHtml(heroId) {
    const ST = window.SkillTextData;
    const desc = ST && typeof ST.desc === 'function' ? ST.desc(heroId) : '';
    return desc ? `<div class="squad-hero-skill-desc">${escHtml(desc)}</div>` : '';
  }

  // 我方绝技落下时，在施法者头顶短暂飘出施放台词（每次绝技一句，不限频，不阻塞）
  function ultCastLine(ultEv) {
    if (!ultEv || !currentSession) return;
    const caster = currentSession.unitMap[ultEv.casterId];
    if (!caster || caster.side !== 'player' || !caster.heroId) return;
    const ST = window.SkillTextData;
    const line = ST && typeof ST.castLine === 'function' ? ST.castLine(caster.heroId) : '';
    if (line) spawnVoiceFloat(caster, line, 'ult');
  }

  function heroVoiceLine(kind, unit) {
    if (!unit || unit.side !== 'player' || !unit.heroId) return;
    const HV = window.HeroVoice;
    if (!HV || typeof HV.battleLine !== 'function') return;
    const text = HV.battleLine(unit.heroId, kind);
    if (text) spawnVoiceFloat(unit, text, kind);
  }

  function spawnBoardHealFloat(c, r, amount) {
    const layer = $('battle-float-layer');
    if (!layer) return;
    const span = document.createElement('span');
    let cls = 'battle-float heal';
    if (c >= COLS - 1) cls += ' at-right-edge';
    span.className = cls;
    span.style.left = `${(((c + 0.5) / COLS) * 100).toFixed(2)}%`;
    span.style.top = `${(((r + 0.5) / ROWS) * 100).toFixed(2)}%`;
    span.textContent = `+${dispNum(amount)}`;
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

  function pulseAttackAndHit(attackerId, targetId, fromCell, toCell) {
    const atkDom = unitDomMap[attackerId];
    const defDom = unitDomMap[targetId];
    if (atkDom && atkDom.bodyEl) {
      clearTimeout(atkDom.atkTimer);
      const px = boardCellPx();
      const v = lungeVector(fromCell, toCell, px.w, px.h);
      atkDom.bodyEl.style.setProperty('--lunge-x', `${v.x}px`);
      atkDom.bodyEl.style.setProperty('--lunge-y', `${v.y}px`);
      atkDom.el.classList.remove('is-attacking');
      void atkDom.el.offsetWidth;
      atkDom.el.classList.add('is-attacking');
      atkDom.atkTimer = setTimeout(() => {
        atkDom.el.classList.remove('is-attacking');
      }, 280);
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
    if (overlay) {
      overlay.classList.remove('is-active', 'is-fading');
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
    }
  }

  // 播放大招全屏静态立绘演出（1x 约 1.35 秒，2x 缩短为 0.55 秒）
  function playUltCutscene(ultEv, onComplete) {
    const overlay = $('battle-ult-overlay');
    const imgEl = $('ult-hero-img');
    const nameEl = $('ult-hero-name');
    const skillTagEl = $('ult-skill-tag');
    if (nameEl && ultEv) {
      nameEl.textContent = ultEv.casterName || '绝技释放';
    }
    if (skillTagEl) {
      const skillName = (ultEv && ultEv.skillName) || '破妄神通';
      skillTagEl.textContent = `绝技 · ${skillName}`;
    }
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

    const staticSrc = ultEv.casterImg || ultEv.casterPoster || 'assets/hero_v21_new_hd.jpg?v=5';
    if (imgEl) {
      imgEl.src = staticSrc;
      imgEl.alt = ultEv.casterName || '';
    }

    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    overlay.classList.remove('is-fading');
    void overlay.offsetWidth;
    overlay.classList.add('is-active');

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
    if (!isEnemyUlt) ultCastLine(ultEv);
    const casterDom = unitDomMap[ultEv.casterId];
    if (casterDom) {
      casterDom.el.classList.remove('is-ult-ready', 'is-ult-casting');
      const casterUnit = currentSession && currentSession.unitMap[ultEv.casterId];
      if (casterUnit) {
        const cd = displayCellOf(casterUnit.id, casterUnit.c, casterUnit.r);
        applyUnitPosition(casterDom.el, cd.c, cd.r, casterUnit.isBoss, false);
      }
      void casterDom.el.offsetWidth;
      casterDom.el.classList.add('is-ult-casting');
      setTimeout(() => {
        casterDom.el.classList.remove('is-ult-casting');
      }, 420);
      if (casterDom.rageFill) casterDom.rageFill.style.width = '0%';
    }
    delete manualUltReadyAt[ultEv.casterId];

    const primaryCell = ultEv.primaryId
      ? displayCellOf(ultEv.primaryId, ultEv.primaryC, ultEv.primaryR)
      : ultEv.targets && ultEv.targets.length
      ? displayCellOf((ultEv.targets.find((t) => !t.isSplash) || ultEv.targets[0]).unitId, ultEv.primaryC, ultEv.primaryR)
      : { c: ultEv.primaryC, r: ultEv.primaryR };
    spawnUltBoardFx(primaryCell.c, primaryCell.r, isEnemyUlt);

    const targets = ultEv.targets || [];
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      flashUnitHit(t.unitId);
      const tc = displayCellOf(t.unitId, t.c, t.r);
      spawnBoardFloat(tc.c, tc.r, t.dmg, t.crit, !t.isSplash);
      const u = currentSession && currentSession.unitMap[t.unitId];
      if (u) {
        syncUnitBarsAndState(u);
      }
    }

    const heals = ultEv.heals || [];
    for (let i = 0; i < heals.length; i++) {
      const h = heals[i];
      const hc = displayCellOf(h.unitId, h.c, h.r);
      spawnBoardHealFloat(hc.c, hc.r, h.amount);
      const u = currentSession && currentSession.unitMap[h.unitId];
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
        const skillName = ultEv.skillName || '破妄神通';
        const notes = [];
        if (ultEv.skillKind === 'row' && targets.length > 1) {
          notes.push(`贯通同行 ${targets.length} 敌`);
        } else if (splashCount > 0) {
          notes.push(`波及周围 ${splashCount} 敌`);
        }
        if (heals.length === 1 && heals[0].unitId === ultEv.casterId) {
          notes.push(`回复了 ${dispNum(heals[0].amount)} 生命`);
        } else if (heals.length > 0) {
          notes.push(`全队各回复了 ${dispNum(heals[0].amount)} 生命`);
        }
        if (ultEv.freezeTargetId) {
          notes.push(`霜冻了 ${ultEv.primaryTargetName}`);
        }
        if (ultEv.buffTargetName) {
          notes.push(`为 ${ultEv.buffTargetName} 附加甜心加护`);
        }
        const extraNote = notes.length > 0 ? `，${notes.join('，')}` : '';
        logLine.textContent = `【${ultEv.casterName}】释放绝技「${skillName}」！对 ${ultEv.primaryTargetName} 造成 ${dispNum(ultEv.dmg)} 伤害${extraNote}`;
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
        const cd = displayCellOf(caster.id, caster.c, caster.r);
        applyUnitPosition(dom.el, cd.c, cd.r, caster.isBoss, false);
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

  // 失败后「去摘桃 / 去参悟功法 / 去突破」：只显示当前可用的，标出战力增益最多的一项（Newbie.cpGainOptions 估算）
  function renderFailGainActions(actionsEl) {
    const opts = window.Newbie && window.Newbie.cpGainOptions ? window.Newbie.cpGainOptions(window.GameState.state) : [];
    const byKey = {};
    opts.forEach((o) => { byKey[o.key] = o; });
    let shown = 0;
    actionsEl.querySelectorAll('[data-gain-key]').forEach((btn) => {
      const o = byKey[btn.getAttribute('data-gain-key')];
      btn.hidden = !o;
      btn.classList.toggle('is-best', Boolean(o && o.best));
      btn.classList.toggle('btn-primary', Boolean(o && o.best));
      const em = btn.querySelector('.fail-gain');
      if (em) em.textContent = o ? `${o.best ? '★ ' : ''}战力+${fmt(o.gain)}` : '';
      if (o) shown += 1;
    });
    // 按增益排序显示
    opts.forEach((o) => {
      const btn = actionsEl.querySelector(`[data-gain-key="${o.key}"]`);
      if (btn) actionsEl.appendChild(btn);
    });
    actionsEl.hidden = shown === 0;
    return shown;
  }

  function showFailOverlay(enemy, player, timeout, fails) {
    const overlay = $('battle-result-overlay');
    const titleEl = $('battle-result-title');
    const subEl = $('battle-result-sub');
    const actionsEl = $('battle-fail-actions');
    if (!overlay || !titleEl || !subEl || !actionsEl) return;

    const recCp = getRecommendedCp(window.GameState.state, enemy, Math.round(player.cp));
    const gapCp = window.Battle.failPowerGap(player.cp, recCp);
    if (enemy && enemy.isBoss && !enemy.mijingWave) {
      bossRetry = { armed: gapCp > 0, stageNum: enemy.n, recCp, name: enemy.name || '', notified: false };
    }
    const prefix = timeout ? '久战不下' : '败';

    if (gapCp > 0) {
      const gapPct = Math.max(1, Math.round((gapCp / recCp) * 100));
      titleEl.textContent = `${prefix} · 还差 ${fmt(gapCp)} 战力（约 ${gapPct}%）`;
    } else {
      titleEl.textContent = `${prefix} · 此战惜败，可再战或调整布阵`;
    }

    const shown = renderFailGainActions(actionsEl);
    if (fails >= 2) {
      subEl.textContent = shown
        ? `本关已连败 ${fails} 次，先提升战力再战（★ 为提升最多）`
        : `本关已连败 ${fails} 次，可调整布阵或等待资源积累`;
    } else {
      subEl.textContent = shown
        ? '失败不损分毫，提升战力后再战（★ 为提升最多）'
        : '失败不损分毫，可调整布阵或提升战力后再战';
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
      navBtn.title = isUnlocked ? '闯关' : '突破至搬血后开启闯关';
      navBtn.classList.toggle('is-locked', !isUnlocked);
    }
    if (navText) {
      navText.textContent = isUnlocked ? '闯关' : '闯关·搬血后';
    }
  }

  function renderChapterBar(enemy, bestStage) {
    const titleEl = $('stage-chapter-title');
    const stepEl = $('stage-chapter-step');
    const dotsEl = $('stage-chapter-dots');
    // 章节短名（每章不同）；顶栏还挤着秘境/镇妖塔入口，放「大地域·短名」会被省略号吃掉短名，故只显示短名，缺数据回退大地域名
    if (titleEl) titleEl.textContent = `第 ${enemy.chapter} 章 · ${enemy.chapterName || enemy.region}`;
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
    const squadStr = window.Battle.getSquadIds(s).join(',');
    const key = `${enemy.n}:${enemy.mijingWave || 0}:${Math.round(enemy.cp)}:${s.heroId}:${squadStr}:${formStr}`;
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
    const mjRun = inMijing() ? mijingRun() : null;
    const enemy =
      isPlaying && currentEnemy
        ? currentEnemy
        : mjRun
          ? MJ().waveEnemy(mjRun, mjRun.wave)
          : window.Battle.enemyFor(stageNum);
    const player = isPlaying && currentPlayer ? currentPlayer : window.Battle.playerStats(s);
    const activeSquadIds = window.Battle.getSquadIds(s);
    const maxSquad = window.Battle.MAX_SQUAD_SIZE || 6;

    const inTower = battleMode === 'tower' || Boolean(enemy && enemy.towerFloor);
    if (mjRun) {
      renderMijingBar(mjRun);
    } else if (inTower) {
      renderTowerBar(enemy);
    } else {
      renderChapterBar(enemy, st.best || 0);
    }
    renderMijingEntry();
    if (window.TowerUI && typeof window.TowerUI.renderEntry === 'function') window.TowerUI.renderEntry();
    renderStageBondRow(activeSquadIds);

    const stageBox = $('battle-stage');
    const regionIdx = Math.min(5, Math.floor((enemy.chapter - 1) / 5));
    if (stageBox) {
      stageBox.dataset.region = String(regionIdx);
      stageBox.classList.toggle('is-boss', enemy.isBoss);
      stageBox.classList.toggle('is-in-battle', isPlaying);
    }

    const enemyTitleEl = $('battle-stage-enemy-title');
    const formHintEl = $('battle-form-hint');
    if (enemyTitleEl && mjRun) {
      const w = enemy.mijingWave || mjRun.wave;
      const total = MJ().WAVES;
      if (enemy.isBoss) {
        const tag = enemy.mijingKind === 'boss' ? 'Boss' : '精英';
        enemyTitleEl.textContent = `秘境 ${w}/${total} 波 · ${tag}【${enemy.name.replace(/^精英·/, '')}】`;
      } else {
        const mobCnt = 3 + Math.min(2, Math.floor(((enemy.stageInChapter || 1) - 1) / 3));
        enemyTitleEl.textContent = `秘境 ${w}/${total} 波 · ${enemy.name} 等 ${mobCnt} 敌`;
      }
    } else if (enemyTitleEl && enemy.towerFloor) {
      enemyTitleEl.textContent = enemy.isBoss
        ? `镇妖塔 第 ${enemy.towerFloor} 层 · Boss【${enemy.name}】`
        : `镇妖塔 第 ${enemy.towerFloor} 层 · 【${enemy.name}】`;
    } else if (enemyTitleEl) {
      if (enemy.isBoss) {
        enemyTitleEl.textContent = `第 ${stageNum} 关 · ${enemy.stageName ? `${enemy.stageName} · ` : ''}Boss【${enemy.name}】`;
      } else {
        const mobCnt = 3 + Math.min(2, Math.floor(((enemy.stageInChapter || 1) - 1) / 3));
        enemyTitleEl.textContent = `第 ${stageNum} 关 · ${enemy.name} 等 ${mobCnt} 敌`;
      }
    }
    if (formHintEl) {
      if (isPlaying) {
        formHintEl.textContent = st.auto ? '自动释放大招中' : '怒气满点击头像放大招';
      } else if (activeSquadIds.length === 0) {
        formHintEl.textContent = '请先点击【队伍】选择上阵角色';
      } else {
        formHintEl.textContent = `上阵 ${activeSquadIds.length}/${maxSquad} · 拖动角色布阵`;
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
    if (winrateEl) {
      const rate = mjRun
        ? getMijingWinRate(s, mjRun, player.cp)
        : enemy.towerFloor
          ? getTowerWinRate(s, enemy, player.cp)
          : getCachedWinRate(s, stageNum, player.cp);
      const label = window.Battle.winRateLabel(rate);
      winrateEl.textContent = label;
      winrateEl.dataset.level = rate >= 0.6 ? 'high' : rate >= 0.4 ? 'mid' : 'low';
    }
    if (cpEnemyEl) {
      const rec = getRecommendedCp(s, mjRun || enemy.towerFloor ? enemy : stageNum, player.cp);
      cpEnemyEl.textContent = fmt(Math.round(rec));
    }

    const btnSquad = $('btn-stage-squad');
    const squadCountEl = $('stage-squad-count');
    const btnChallenge = $('btn-stage-challenge');
    const btnAuto = $('btn-stage-auto');
    const btnSpeed = $('btn-stage-speed');
    if (squadCountEl) {
      squadCountEl.textContent = `${activeSquadIds.length}/${maxSquad}`;
    }
    if (btnSquad) {
      btnSquad.classList.toggle('is-empty', activeSquadIds.length === 0);
      btnSquad.title = isPlaying ? '编辑队伍（下一场生效）' : `编辑队伍（当前 ${activeSquadIds.length}/${maxSquad}）`;
    }
    if (window.GrowUI && typeof window.GrowUI.refreshBadge === 'function') window.GrowUI.refreshBadge();
    if (btnChallenge) {
      const needPick = Boolean(mjRun && Array.isArray(mjRun.choices) && mjRun.choices.length > 0);
      btnChallenge.textContent = isPlaying ? '跳 过' : needPick ? '择 运' : mjRun ? '迎 战' : '挑 战';
      btnChallenge.classList.toggle('ready-pulse', !isPlaying && needPick);
      btnChallenge.classList.toggle('is-disabled', !isPlaying && activeSquadIds.length === 0);
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
    renderMijingPanel(mjRun);
    if (squadModalOpen) {
      renderSquadModal();
    }
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
    if (window.Codex && typeof window.Codex.noteBattle === 'function') {
      window.Codex.noteBattle(s, sim);
    }

    isPlaying = false;
    currentSession = null;
    previewBoardKey = '';

    if (battleMode === 'tower') {
      finishTowerFloor(sim, enemy);
      return;
    }

    if (battleMode === 'mijing') {
      battleMode = 'stage';
      finishMijingWave(sim, enemy);
      return;
    }

    const logLine = $('battle-log-line');

    if (sim.win) {
      hideResultOverlay();
      const firstClear = stageNum > (st.best || 0);
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
        const peaches = window.GameState.addPeaches(rw.peaches);
        s.lingyu = (s.lingyu || 0) + rw.lingyu;
        s.stones = (s.stones || 0) + rw.stones;
        s.qi = (s.qi || 0) + rw.qi;
        s.lifetimeQi = (s.lifetimeQi || 0) + rw.qi;

        const rewardText = `仙桃+${peaches} · 灵玉+${rw.lingyu} · 灵石+${fmt(rw.stones)} · 灵气+${fmt(rw.qi)}`;
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
      if (window.Daily && typeof window.Daily.hook === 'function') window.Daily.hook(s, 'stage_clear', 1, Date.now());
      onChange();
      render();

      // 首通 Boss：遗言 → 战后剧情 → 「图鉴已收录」，看完再继续自动推关
      const resumeAuto = () => {
        if (stageNum < 300) scheduleAutoNextIfAllowed();
      };
      const storyShown = Boolean(firstClear && enemy.isBoss && window.Story && window.Story.afterBossWin(stageNum, resumeAuto));
      if (storyShown) log(`图鉴已收录【${enemy.name}】`, 'gold');
      else resumeAuto();
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
        unitLogical[mainEv.unitId] = { c: mainEv.toC, r: mainEv.toR };
        if (currentSession && currentSession.units) {
          layoutAllUnits();
        } else {
          applyUnitPosition(dom.el, mainEv.toC, mainEv.toR, Boolean(mvUnit && mvUnit.isBoss), Boolean(mvUltReady));
        }
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
      const fromCell = displayCellOf(mainEv.attackerId, mainEv.attackerC, mainEv.attackerR);
      const toCell = displayCellOf(mainEv.targetId, mainEv.targetC, mainEv.targetR);
      pulseAttackAndHit(mainEv.attackerId, mainEv.targetId, fromCell, toCell);
      spawnBoardFloat(toCell.c, toCell.r, mainEv.dmg, mainEv.crit, false);

      const atkUnit = currentSession.unitMap[mainEv.attackerId];
      const defUnit = currentSession.unitMap[mainEv.targetId];
      if (atkUnit) syncUnitBarsAndState(atkUnit);
      if (defUnit) syncUnitBarsAndState(defUnit);
      if (mainEv.targetDied && defUnit && defUnit.side === 'player') heroVoiceLine('defeat', defUnit);
      if (Array.isArray(mainEv.splash)) {
        for (let i = 0; i < mainEv.splash.length; i++) {
          const sp = mainEv.splash[i];
          const spc = displayCellOf(sp.unitId, sp.c, sp.r);
          spawnBoardFloat(spc.c, spc.r, sp.dmg, false, false);
          const spUnit = currentSession.unitMap[sp.unitId];
          if (spUnit) syncUnitBarsAndState(spUnit);
        }
      }

      if (logLine) {
        const dieNote = mainEv.targetDied ? '（击破）' : '';
        const newReady = currentSession.getReadyPlayerUnits();
        const readyHint =
          !st.auto && newReady.length > 0 ? ` · 点击【${newReady[0].name}】头像放大招` : '';
        const frozeNote = mainEv.froze ? '（冰封）' : '';
        logLine.textContent = `第 ${mainEv.t} 回合 · ${mainEv.attackerName} 攻 ${mainEv.targetName} -${dispNum(mainEv.dmg)}${mainEv.crit ? '（暴击）' : ''}${frozeNote}${dieNote}${readyHint}`;
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

  let lastBossSfxKey = '';
  let lastBossSfxAt = 0;

  function startBattle(manual) {
    if (!unlocked()) return false;
    if (isPlaying) {
      if (manual) skipBattle();
      return false;
    }

    if (dragState) {
      cancelDrag();
    }

    const s = window.GameState.state;
    const st = ensureStageState();
    const squadCheck = window.Battle.canStartBattle(s);
    if (!squadCheck.ok) {
      clearTimeout(autoNextTimer);
      autoNextTimer = 0;
      const logLine = $('battle-log-line');
      if (logLine) {
        logLine.textContent = '队伍为空，请先点击【队伍】选择至少 1 名角色上阵';
      }
      if (manual) {
        log('出战队伍为空，请先在闯关【队伍】中选择至少 1 名角色上阵。', 'warn');
      }
      render();
      return false;
    }

    // 主线剧情（batch3 P1-1）：章首第一关 / Boss 关首次开战前先播对话，播完（或跳过）再开战
    if (!towerBattle && !inMijing() && window.Story) {
      if (window.Story.isOpen()) return false;
      if (window.Story.beforeBattle(st.cur, () => startBattle(manual))) {
        clearTimeout(autoNextTimer);
        autoNextTimer = 0;
        return false;
      }
    }

    clearTimeout(autoNextTimer);
    autoNextTimer = 0;
    clearAllTimers();
    hideUltOverlay();
    clearBattleFloats();
    hideResultOverlay();

    const stageNum = st.cur;
    const player = window.Battle.playerStats(s);
    const twFloor = towerBattle && window.Tower ? window.Tower.currentFloor(s) : 0;
    const mjRun = !twFloor && inMijing() ? mijingRun() : null;
    if (mjRun && Array.isArray(mjRun.choices) && mjRun.choices.length > 0) {
      openMijingModal('pick');
      render();
      return false;
    }
    const enemy = twFloor
      ? window.Tower.floorEnemy(twFloor)
      : mjRun
        ? MJ().waveEnemy(mjRun, mjRun.wave)
        : window.Battle.enemyFor(stageNum);

    let session;
    if (mjRun) {
      // 秘境每波种子由局种子决定：刷新页面重打同一波，结果不会因重开而改变
      session = window.Battle.createSession(s, enemy, MJ().waveSeed(mjRun, mjRun.wave), MJ().combinedMods(s, mjRun.blessings));
    } else {
      s.seq = (s.seq || 0) + 1;
      const seed = ((Date.now() & 0xffffffff) ^ Math.imul(s.seq, 0x9e3779b1)) >>> 0;
      session = window.Battle.createSession(s, enemy, seed, bondModsFor(s));
    }
    if (!session || session.emptySquad || session.playerUnits.length < 1) {
      const logLine = $('battle-log-line');
      if (logLine) {
        logLine.textContent = '队伍为空，请先点击【队伍】选择至少 1 名角色上阵';
      }
      render();
      return false;
    }

    isPlaying = true;
    battleMode = twFloor ? 'tower' : mjRun ? 'mijing' : 'stage';
    currentSession = session;
    currentEnemy = enemy;
    currentPlayer = player;
    if (window.Codex && typeof window.Codex.noteSeen === 'function') {
      window.Codex.noteSeen(s, session.enemyUnits || [enemy]);
    }
    previewBoardKey = '';

    mountUnitsToBoard(session.units);
    syncAllSessionUnits();
    // 音效（batch3 P2-7）：Boss 现身；同一关 20 秒内只响一次，避免自动重打时反复敲锣
    if (enemy && enemy.isBoss && window.GameAudio && !(typeof document !== 'undefined' && document.hidden)) {
      const bossKey = battleMode + ':' + (twFloor || stageNum);
      const nowMs = Date.now();
      if (bossKey !== lastBossSfxKey || nowMs - lastBossSfxAt > 20000) {
        lastBossSfxKey = bossKey;
        lastBossSfxAt = nowMs;
        window.GameAudio.play('boss');
      }
    }

    const logLine = $('battle-log-line');
    if (logLine) {
      logLine.textContent = twFloor
        ? `镇妖塔 第 ${twFloor} 层 · 迎战【${enemy.name}】`
        : mjRun
          ? `秘境第 ${mjRun.wave} 波 · 迎战【${enemy.name}】`
          : `第 1 回合 · 迎战【${enemy.name}】`;
    }
    if (!mjRun && enemy.isBoss && window.Codex && typeof window.Codex.showBossQuote === 'function') {
      window.Codex.showBossQuote(enemy);
    }
    render();
    if (session.playerUnits.length > 0) {
      heroVoiceLine('deploy', session.playerUnits[Math.floor(Math.random() * session.playerUnits.length)]);
    }

    playTimer = setTimeout(stepPlayback, getMoveDelay());
    return true;
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
      } else if (unlocked() && !isPlaying && !mijingView) {
        startBattle(false);
      } else if (inMijing() && !isPlaying) {
        scheduleMijingNext();
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

  // 纯判断：卡在 Boss、战力已超推荐、还没自动重试过 → 'retry'（在闯关页）/'notify'（在别的页）/null
  function bossRetryDecision(b, ctx) {
    if (!b || !b.armed || !ctx || ctx.isPlaying || ctx.mijing || !ctx.unlocked || !ctx.halted) return null;
    if (ctx.curStage !== b.stageNum || !(b.recCp > 0) || ctx.cp < b.recCp) return null;
    return ctx.onStageTab ? 'retry' : b.notified ? null : 'notify';
  }

  function checkBossRetry(s, st) {
    if (!bossRetry.armed) return false;
    const pane = $('tab-stage');
    const decision = bossRetryDecision(bossRetry, {
      isPlaying,
      mijing: mijingView,
      unlocked: unlocked(),
      halted: haltedByLoss,
      curStage: st.cur,
      cp: Math.round(window.Battle.playerStats(s).cp),
      onStageTab: Boolean(pane && pane.classList.contains('active'))
    });
    if (decision === 'notify') {
      bossRetry.notified = true;
      log(`战力已超过推荐战力，回到闯关页将自动再战 Boss【${bossRetry.name}】。`, 'gold');
      return false;
    }
    if (decision !== 'retry') return false;
    bossRetry.armed = false;
    haltedByLoss = false;
    lastAutoRetryAt = Date.now();
    log(`战力已超过推荐战力，自动再战 Boss【${bossRetry.name}】！`, 'gold');
    startBattle(false);
    return true;
  }

  // 离线结算弹窗用：当前关是否已达推荐战力（未解锁/秘境中/已通关到顶返回 null）
  function challengeReadiness() {
    const s = window.GameState.state;
    if (!s || !unlocked() || isPlaying || mijingView) return null;
    const st = ensureStageState();
    const stageNum = st.cur || 1;
    if (stageNum <= (st.best || 0) || (st.best || 0) >= 300) return null;
    if (!window.Battle.canStartBattle(s).ok) return null;
    const enemy = window.Battle.enemyFor(stageNum);
    const cp = Math.round(window.Battle.playerStats(s).cp);
    const rec = getRecommendedCp(s, stageNum, cp);
    return { ready: cp >= rec, stageNum, isBoss: Boolean(enemy && enemy.isBoss), name: (enemy && enemy.name) || '', cp, rec };
  }

  function challengeNow() {
    switchTab('tab-stage');
    setTimeout(() => {
      if (!isPlaying && unlocked()) {
        haltedByLoss = false;
        startBattle(false);
      }
    }, 350);
  }

  function checkAutoRetryOnPowerUp(now) {
    const s = window.GameState.state;
    const st = ensureStageState();
    if (checkBossRetry(s, st)) return;
    if (!unlocked() || !st.auto || isPlaying || !haltedByLoss || mijingView) return;
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

  function setSquadFeedback(text, tone = 'info') {
    const el = $('squad-modal-feedback');
    if (!el) return;
    el.textContent = text;
    el.dataset.tone = tone;
  }

  function getAllHeroesList() {
    if (window.GameConfig && Array.isArray(window.GameConfig.HEROES)) {
      return window.GameConfig.HEROES;
    }
    return [];
  }

  function renderSquadModal() {
    const modal = $('squad-modal');
    if (!modal) return;
    const s = window.GameState.state;
    const maxSquad = window.Battle.MAX_SQUAD_SIZE || 6;
    const heroes = getAllHeroesList();
    const heroMap = {};
    for (let i = 0; i < heroes.length; i++) {
      const h = heroes[i];
      if (h && h.id) heroMap[h.id] = h;
    }

    draftSquad = window.Battle.sanitizeSquadIds(draftSquad, s);
    const curCount = draftSquad.length;
    const isFull = curCount >= maxSquad;
    const isEmpty = curCount < 1;

    const countEl = $('squad-modal-count');
    if (countEl) {
      countEl.textContent = `已上阵 ${curCount}/${maxSquad}`;
      countEl.classList.toggle('is-full', isFull);
      countEl.classList.toggle('is-empty', isEmpty);
    }

    const slotsEl = $('squad-active-slots');
    if (slotsEl) {
      let slotsHtml = '';
      for (let i = 0; i < maxSquad; i++) {
        const hid = draftSquad[i];
        const h = hid ? heroMap[hid] : null;
        if (h) {
          const av = h.avatar || h.img || '';
          const slotQInfo = resolveQualityInfo(h.quality || 'xian');
          const slotQCls = slotQInfo.id === 'xian' ? ' q-xian' : ` q-${slotQInfo.id}`;
          const slotQStyle = slotQInfo.id === 'xian' ? '' : ` style="border-color:${slotQInfo.color}"`;
          slotsHtml += `
            <button type="button" class="squad-slot-item is-filled" data-slot-hero-id="${h.id}" title="点击移出【${h.name}】" aria-label="移出 ${h.name}">
              <span class="squad-slot-avatar-wrap${slotQCls}"${slotQStyle}>
                <img class="squad-slot-avatar" src="${av}" alt="${h.name}" decoding="async" />
                <span class="squad-slot-remove" aria-hidden="true">×</span>
                <span class="squad-slot-idx">${i + 1}</span>
              </span>
              <span class="squad-slot-name">${h.name}</span>
            </button>
          `;
        } else {
          slotsHtml += `
            <div class="squad-slot-item is-empty" aria-label="空槽位 ${i + 1}">
              <span class="squad-slot-avatar-wrap">
                <span class="squad-slot-plus" aria-hidden="true">+</span>
                <span class="squad-slot-idx">${i + 1}</span>
              </span>
              <span class="squad-slot-name">空位</span>
            </div>
          `;
        }
      }
      slotsEl.innerHTML = slotsHtml;
    }

    const bondPanel = $('squad-bond-panel');
    if (bondPanel) {
      bondPanel.innerHTML = bondListHtml(draftSquad) || '<span class="bond-row-empty">仙缘：同标签角色上阵 2 人激活羁绊，3 人进阶</span>';
    }

    const listEl = $('squad-hero-list');
    if (listEl) {
      let listHtml = '';
      for (let i = 0; i < heroes.length; i++) {
        const h = heroes[i];
        if (!h || !h.id) continue;
        const isUnlockedHero = window.Battle.isHeroUnlocked(h.id, s);
        const selIdx = draftSquad.indexOf(h.id);
        const isSelected = selIdx !== -1;
        const av = h.avatar || h.img || '';
        const skillName = (h.skill && h.skill.name) || '破妄神通';

        if (!isUnlockedHero) {
          listHtml += `
            <button type="button" class="squad-hero-card is-locked" data-squad-hero-id="${h.id}" aria-disabled="true">
              <div class="squad-hero-avatar-box is-locked">
                <span class="squad-hero-lock-icon" aria-hidden="true">🔒</span>
              </div>
              <div class="squad-hero-info">
                <div class="squad-hero-name-row">
                  <span class="squad-hero-name">${h.name || '未解锁角色'}</span>
                  ${bondTagsHtml(h.id)}
                </div>
                <div class="squad-hero-skill">绝技 · ${skillName}</div>
                ${skillDescHtml(h.id)}
                <div class="squad-hero-status is-locked">未解锁</div>
              </div>
            </button>
          `;
        } else {
          const busy = !isSelected ? dispatchBusy(h.id) : null;
          const stateCls = isSelected ? 'is-selected' : busy ? 'is-dispatched' : isFull ? 'is-full-disabled' : 'is-available';
          const qInfo = resolveQualityInfo(h.quality || 'xian');
          const qCls = qInfo.id === 'xian' ? 'q-xian' : `q-${qInfo.id}`;
          const qStyle = qInfo.id === 'xian' ? '' : ` style="border-color:${qInfo.color}"`;
          const badgeHtml = isSelected
            ? `<span class="squad-hero-order">#${selIdx + 1}</span>`
            : '';
          const statusText = isSelected
            ? '✓ 已上阵 · 点击移出'
            : busy
              ? '派遣中 · 召回后可上阵'
              : isFull
              ? '待命 · 已满 6/6'
              : '+ 待命 · 点击上阵';
          const grow = window.Grow && typeof window.Grow.snapshot === 'function' ? window.Grow.snapshot(s, h.id) : null;
          const growLabel = grow ? `培元 ${grow.level}/${grow.cap}` : '';
          const growDot = grow && grow.can ? ' has-grow' : '';
          const growHtml = grow
            ? `<span class="squad-hero-grow${growDot}" data-grow-open="${h.id}">${growLabel}</span>`
            : '';
          listHtml += `
            <button type="button" class="squad-hero-card ${stateCls}" data-squad-hero-id="${h.id}" aria-pressed="${isSelected ? 'true' : 'false'}">
              <div class="squad-hero-avatar-box ${qCls}"${qStyle}>
                ${av ? `<img class="squad-hero-avatar" src="${av}" alt="${h.name}" decoding="async" />` : `<span class="squad-hero-fallback">${(h.name || '?').slice(0, 1)}</span>`}
                ${badgeHtml}
              </div>
              <div class="squad-hero-info">
                <div class="squad-hero-name-row">
                  <span class="squad-hero-name">${h.name}</span>
                  ${bondTagsHtml(h.id)}
                </div>
                <div class="squad-hero-skill">绝技 · ${skillName}</div>
                ${skillDescHtml(h.id)}
                <div class="squad-hero-status">${statusText}</div>
                ${growHtml}
              </div>
            </button>
          `;
        }
      }
      listEl.innerHTML = listHtml;
    }
    renderSquadSkillDetail();

    const btnSave = $('btn-squad-save');
    if (btnSave) {
      btnSave.disabled = isEmpty;
      btnSave.classList.toggle('is-disabled', isEmpty);
      btnSave.textContent = isEmpty ? '至少选 1 人' : `保存 (${curCount}/${maxSquad})`;
    }
  }

  function scheduleAutoNextIfAllowed() {
    clearTimeout(autoNextTimer);
    autoNextTimer = 0;
    const s = window.GameState.state;
    const st = ensureStageState();
    if (!unlocked() || isPlaying || squadModalOpen || document.hidden) return false;
    if (towerBattle || battleMode === 'tower') return false;
    if (mijingView) return scheduleMijingNext();
    if (!st.auto || haltedByLoss || (st.best || 0) >= 300) return false;
    if (!window.Battle.canStartBattle(s).ok) return false;

    autoNextTimer = setTimeout(() => {
      autoNextTimer = 0;
      const curState = window.GameState.state;
      const curSt = ensureStageState();
      if (
        curSt.auto &&
        !isPlaying &&
        !mijingView &&
        unlocked() &&
        !squadModalOpen &&
        !haltedByLoss &&
        window.Battle.canStartBattle(curState).ok
      ) {
        startBattle(false);
      }
    }, 1000);
    return true;
  }

  function openSquadModal() {
    const modal = $('squad-modal');
    if (!modal) return false;
    if (dragState) cancelDrag();
    clearTimeout(autoNextTimer);
    autoNextTimer = 0;

    const s = window.GameState.state;
    draftSquad = [...window.Battle.getSquadIds(s)];
    squadSkillFocus = '';
    squadModalOpen = true;
    renderSquadModal();
    if (isPlaying) {
      setSquadFeedback('战斗进行中，保存队伍后将在下一场生效', 'info');
    } else if (draftSquad.length === 0) {
      setSquadFeedback('当前队伍为空（0/6），请至少选择 1 名角色上阵', 'warn');
    } else {
      setSquadFeedback(`点击角色卡上阵或移出（当前 ${draftSquad.length}/${window.Battle.MAX_SQUAD_SIZE || 6}，最多 6 人）`, 'info');
    }
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    return true;
  }

  function closeSquadModal(options) {
    const modal = $('squad-modal');
    const wasOpen = squadModalOpen;
    squadModalOpen = false;
    draftSquad = [...window.Battle.getSquadIds(window.GameState.state)];

    // 关闭并标记 aria-hidden 前，先将焦点安全交还给「队伍」触发按钮，避免 aria-hidden 后代保留焦点告警
    const activeEl = document.activeElement;
    if (modal && activeEl && typeof modal.contains === 'function' && modal.contains(activeEl)) {
      if (typeof activeEl.blur === 'function') activeEl.blur();
    }
    const triggerBtn = $('btn-stage-squad');
    if (triggerBtn && typeof triggerBtn.focus === 'function') {
      try {
        triggerBtn.focus({ preventScroll: true });
      } catch (err) {
        triggerBtn.focus();
      }
    }

    if (modal) {
      modal.classList.remove('active');
      modal.setAttribute('aria-hidden', 'true');
    }

    const skipResume = Boolean(options && typeof options === 'object' && options.skipResumeAuto);
    if (wasOpen && !skipResume) {
      scheduleAutoNextIfAllowed();
    }
  }

  function getDraftSquad() {
    return [...draftSquad];
  }

  function toggleDraftHero(heroId) {
    const s = window.GameState.state;
    const maxSquad = window.Battle.MAX_SQUAD_SIZE || 6;
    const heroes = getAllHeroesList();
    const hero = heroes.find((h) => h && h.id === heroId);
    const heroName = (hero && hero.name) || heroId || '角色';

    const existingIdx = draftSquad.indexOf(heroId);
    if (existingIdx !== -1) {
      draftSquad.splice(existingIdx, 1);
      renderSquadModal();
      if (draftSquad.length === 0) {
        setSquadFeedback(`已移出【${heroName}】（0/${maxSquad}）· 请至少选择 1 名角色上阵`, 'warn');
      } else {
        setSquadFeedback(`已移出【${heroName}】（${draftSquad.length}/${maxSquad}）`, 'info');
      }
      return {
        ok: true,
        action: 'removed',
        reason: null,
        count: draftSquad.length,
        squad: [...draftSquad]
      };
    }

    if (!window.Battle.isHeroUnlocked(heroId, s)) {
      setSquadFeedback(`【${heroName}】尚未解锁，无法编入队伍`, 'error');
      return {
        ok: false,
        action: 'rejected',
        reason: 'LOCKED_OR_INVALID_ID',
        count: draftSquad.length,
        squad: [...draftSquad]
      };
    }

    if (dispatchBusy(heroId)) {
      setSquadFeedback(`【${heroName}】正在派遣中，可在洞府「仙姬派遣」召回后上阵`, 'warn');
      return {
        ok: false,
        action: 'rejected',
        reason: 'DISPATCHED',
        count: draftSquad.length,
        squad: [...draftSquad]
      };
    }

    if (draftSquad.length >= maxSquad) {
      setSquadFeedback(`队伍已满（${maxSquad}/${maxSquad}），请先移出 1 名成员再更换`, 'warn');
      return {
        ok: false,
        action: 'rejected',
        reason: 'MAX_REACHED',
        count: draftSquad.length,
        squad: [...draftSquad]
      };
    }

    draftSquad.push(heroId);
    renderSquadModal();
    setSquadFeedback(`已上阵【${heroName}】（${draftSquad.length}/${maxSquad}）`, 'success');
    return {
      ok: true,
      action: 'added',
      reason: null,
      count: draftSquad.length,
      squad: [...draftSquad]
    };
  }

  function saveSquad(customIds) {
    const s = window.GameState.state;
    const maxSquad = window.Battle.MAX_SQUAD_SIZE || 6;
    const targetIds = Array.isArray(customIds) ? customIds : draftSquad;
    const current = window.Battle.getSquadIds(s);
    const busyNew = targetIds.find((id) => !current.includes(id) && dispatchBusy(id));
    if (busyNew) {
      const res = { ok: false, reason: 'DISPATCHED', message: '派遣中的仙姬不能上阵，请先召回', squad: current };
      setSquadFeedback(res.message, 'error');
      return res;
    }
    const res = window.Battle.setSquad(s, targetIds);
    if (!res.ok) {
      setSquadFeedback(res.message || '请至少选择 1 名角色上阵', 'error');
      return res;
    }

    draftSquad = [...res.squad];
    window.GameState.saveGame();
    cachedWinRateKey = '';
    previewBoardKey = '';
    haltedByLoss = false;

    closeSquadModal();
    const logLine = $('battle-log-line');
    if (logLine) {
      logLine.textContent = isPlaying
        ? `队伍已保存（${res.squad.length}/${maxSquad}），将在下一场战斗生效`
        : `出战队伍已更新（${res.squad.length}/${maxSquad}）· 可拖动角色调整站位`;
    }
    onChange();
    render();
    return res;
  }


  let towerWinRateKey = '';
  let towerWinRateVal = 0;
  let towerRecommendedCp = 0;

  function getTowerWinRate(state, enemy, playerCp) {
    const formStr = serializeFormation(state && state.formation);
    const squadStr = window.Battle.getSquadIds(state).join(',');
    const floor = (enemy && enemy.towerFloor) || 0;
    const key = `tw:${floor}:${Math.round(playerCp)}:${squadStr}:${formStr}`;
    if (key !== towerWinRateKey) {
      towerWinRateKey = key;
      towerWinRateVal = window.Battle.winRate(state, enemy, 16);
      towerRecommendedCp = window.Battle.recommendedCp(state, enemy, { runs: 16 });
    }
    return towerWinRateVal;
  }

  function renderTowerBar(enemy) {
    const titleEl = $('stage-chapter-title');
    const stepEl = $('stage-chapter-step');
    const T = window.Tower;
    const floor = (enemy && enemy.towerFloor) || (T && T.currentFloor(window.GameState.state)) || 1;
    const best = (window.GameState.state.tower && window.GameState.state.tower.best) || 0;
    if (titleEl) titleEl.textContent = `镇妖塔 · 第 ${floor} 层`;
    if (stepEl) stepEl.textContent = best > 0 ? `最高 ${best}` : '新挑战';
  }

  function startTowerBattle() {
    const T = window.Tower;
    const s = window.GameState.state;
    if (!T || !s) return false;
    const chk = T.canChallenge(s, Date.now());
    if (!chk.ok) {
      if (chk.reason === 'locked') log(`首通第 ${T.UNLOCK_BEST} 关后开启镇妖塔。`, 'warn');
      else if (chk.reason === 'no_attempts') log('今日镇妖塔失败次数已用尽，明日再来。', 'warn');
      else if (chk.message) log(chk.message, 'warn');
      return false;
    }
    if (mijingView || mijingRun()) {
      log('请先结束当前秘境，再挑战镇妖塔。', 'warn');
      return false;
    }
    if (isPlaying) skipBattle();
    if (isPlaying) return false;
    towerBattle = true;
    const ok = startBattle(true);
    if (!ok) towerBattle = false;
    return ok;
  }

  function finishTowerFloor(sim, enemy) {
    const T = window.Tower;
    const s = window.GameState.state;
    const floor = (enemy && enemy.towerFloor) || (T && T.currentFloor(s));
    towerBattle = false;
    battleMode = 'stage';
    const logLine = $('battle-log-line');
    let toast = '';
    if (sim && sim.win) {
      hideResultOverlay();
      haltedByLoss = false;
      const res = T
        ? T.settleWin(s, floor, {
            qiPerSec: window.GameState.getQiPerSec && window.GameState.getQiPerSec(),
            stonePerSec: window.GameState.getStonePerSec && window.GameState.getStonePerSec()
          }, Date.now())
        : { ok: false };
      const rw = (res && res.reward) || {};
      const parts = [];
      if (rw.jade) parts.push(`灵玉 +${fmt(rw.jade)}`);
      if (rw.peach) parts.push(`仙桃 +${fmt(rw.peach)}`);
      if (rw.qi) parts.push(`灵气 +${fmt(rw.qi)}`);
      if (rw.stone) parts.push(`灵石 +${fmt(rw.stone)}`);
      const rewardText = res && res.first && parts.length ? parts.join(' · ') : '已领取过首通';
      toast = res && res.ok ? `镇妖塔第 ${floor} 层告捷。${res.first ? '首通 ' + parts.join(' · ') : '已通此层'}` : `镇妖塔第 ${floor} 层告捷`;
      if (logLine) logLine.textContent = `镇妖塔第 ${floor} 层告捷！${res && res.first ? rewardText : ''}`;
      log(toast, 'gold');
    } else {
      const res = T ? T.settleLoss(s, floor, Date.now()) : { left: 0 };
      haltedByLoss = true;
      const left = res && res.left != null ? res.left : 0;
      toast = `镇妖塔第 ${floor} 层受挫，今日剩余失败次数 ${left}/${T ? T.DAILY_FAILS : 3}`;
      if (logLine) {
        logLine.textContent = sim && sim.timeout
          ? `镇妖塔第 ${floor} 层久战不下`
          : `镇妖塔第 ${floor} 层不敌 ${enemy && enemy.name ? enemy.name : '守军'}`;
      }
      showFailOverlay(enemy, currentPlayer, Boolean(sim && sim.timeout), 0);
      log(toast, 'warn');
    }
    window.GameState.saveGame();
    if (window.Titles) window.Titles.sync(s);
    if (window.TitlesUI) window.TitlesUI.flushToasts();
    onChange();
    render();
    if (window.TowerUI && typeof window.TowerUI.showToast === 'function') window.TowerUI.showToast(toast);
    if (sim && sim.win && window.TowerUI && typeof window.TowerUI.open === 'function') {
      window.TowerUI.open();
    }
  }

  // ===== 秘境劫运 UI =====
  function getMijingWinRate(state, run, playerCp) {
    const formStr = serializeFormation(state && state.formation);
    const squadStr = window.Battle.getSquadIds(state).join(',');
    const blessStr = Object.keys(run.blessings || {}).sort().map((k) => `${k}${run.blessings[k]}`).join('');
    const key = `${run.seed}:${run.wave}:${blessStr}:${Math.round(playerCp)}:${squadStr}:${formStr}:${beastKey(state)}`;
    if (key !== mijingWinRateKey) {
      mijingWinRateKey = key;
      mijingWinRateVal = MJ().winRate(state, run, 20);
      const enemy = MJ().waveEnemy(run, run.wave);
      mijingRecommendedCp = window.Battle.recommendedCp(state, enemy, {
        mods: MJ().combinedMods ? MJ().combinedMods(state, run.blessings) : null
      });
    }
    return mijingWinRateVal;
  }

  function renderMijingBar(run) {
    const titleEl = $('stage-chapter-title');
    const stepEl = $('stage-chapter-step');
    const dotsEl = $('stage-chapter-dots');
    const M = MJ();
    const enemy = M.waveEnemy(run, run.wave);
    if (titleEl) titleEl.textContent = `秘境劫运 · ${enemy.region}`;
    if (stepEl) stepEl.textContent = `${run.cleared}/${M.WAVES}`;
    if (dotsEl) {
      let html = '';
      for (let i = 1; i <= M.WAVES; i++) {
        let cls = '';
        if (i <= run.cleared) cls = ' passed';
        else if (i === run.wave) cls = ' current';
        const big = M.wavePlan(i).kind !== 'mob' ? ' boss' : '';
        html += `<span class="chapter-dot${cls}${big}"></span>`;
      }
      dotsEl.innerHTML = html;
    }
  }

  function renderMijingEntry() {
    const btn = $('btn-mijing-entry');
    const M = MJ();
    if (!btn || !M) return;
    const s = window.GameState.state;
    const run = M.activeRun(s);
    let text;
    let state;
    if (mijingView && run) {
      text = '返回闯关';
      state = 'back';
    } else if (run) {
      text = '续秘境';
      state = 'resume';
    } else if (!M.isUnlocked(s)) {
      text = '秘境·未开';
      state = 'locked';
    } else {
      const left = M.attemptsLeft(s, Date.now());
      text = `秘境 ${left}/${M.DAILY_ATTEMPTS}`;
      state = left > 0 ? 'ready' : 'empty';
    }
    if (btn.textContent !== text) btn.textContent = text;
    if (btn.dataset.state !== state) btn.dataset.state = state;
  }

  function blessingChipText(run) {
    const list = MJ().blessingList(run.blessings);
    if (list.length === 0) return '劫运：暂无（每过 2 波三选一）';
    return `劫运：${list.map((b) => (b.stacks > 1 ? `${b.name}×${b.stacks}` : b.name)).join(' · ')}`;
  }

  function renderMijingPanel(run) {
    const idleCard = document.querySelector('#tab-stage .stage-idle-card:not(.mijing-run-card)');
    const card = $('mijing-run-card');
    if (idleCard) idleCard.style.display = run ? 'none' : '';
    if (!card) return;
    card.style.display = run ? '' : 'none';
    if (!run) return;
    const M = MJ();
    const blessEl = $('mijing-run-bless');
    const rewardEl = $('mijing-run-reward');
    const btn = $('btn-mijing-detail');
    if (blessEl) blessEl.textContent = blessingChipText(run);
    if (rewardEl) {
      const rw = M.rewardsFor(run.ref, run.cleared);
      rewardEl.innerHTML = `已过 ${run.cleared}/${M.WAVES} 波 · ${LINGYU_ICON} +${fmt(rw.lingyu)} · ${PEACH_ICON} +${fmt(rw.peaches)}`;
    }
    if (btn) {
      const needPick = Array.isArray(run.choices) && run.choices.length > 0;
      btn.textContent = needPick ? '择运' : '劫运';
      btn.classList.toggle('btn-primary', needPick);
      btn.classList.toggle('ready-pulse', needPick);
    }
  }

  function scheduleMijingNext() {
    clearTimeout(autoNextTimer);
    autoNextTimer = 0;
    const st = ensureStageState();
    const run = mijingRun();
    if (!inMijing() || !st.auto || isPlaying || squadModalOpen || mijingModalOpen || document.hidden) return false;
    if (!run || (Array.isArray(run.choices) && run.choices.length > 0)) return false;
    if (!window.Battle.canStartBattle(window.GameState.state).ok) return false;
    autoNextTimer = setTimeout(() => {
      autoNextTimer = 0;
      const r = mijingRun();
      if (
        inMijing() &&
        ensureStageState().auto &&
        !isPlaying &&
        !squadModalOpen &&
        !mijingModalOpen &&
        r &&
        !(Array.isArray(r.choices) && r.choices.length > 0)
      ) {
        startBattle(false);
      }
    }, 1000);
    return true;
  }

  function enterMijing() {
    if (isPlaying) {
      const logLine = $('battle-log-line');
      if (logLine) logLine.textContent = '本场战斗结束后再进入秘境';
      return false;
    }
    if (!mijingRun()) return false;
    clearTimeout(autoNextTimer);
    autoNextTimer = 0;
    if (dragState) cancelDrag();
    hideResultOverlay();
    mijingView = true;
    previewBoardKey = '';
    const logLine = $('battle-log-line');
    const run = mijingRun();
    if (logLine) {
      logLine.textContent =
        Array.isArray(run.choices) && run.choices.length > 0
          ? '秘境中 · 请先择一劫运'
          : `秘境中 · 点击迎战第 ${run.wave} 波`;
    }
    render();
    return true;
  }

  function exitMijing() {
    if (isPlaying) {
      const logLine = $('battle-log-line');
      if (logLine) logLine.textContent = '本场战斗结束后再返回闯关';
      return false;
    }
    clearTimeout(autoNextTimer);
    autoNextTimer = 0;
    mijingView = false;
    previewBoardKey = '';
    const logLine = $('battle-log-line');
    if (logLine) logLine.textContent = mijingRun() ? '秘境进度已保留 · 点击【续秘境】继续' : '准备就绪 · 点击挑战开始推关';
    render();
    scheduleAutoNextIfAllowed();
    return true;
  }

  function onMijingEntryClick() {
    const M = MJ();
    if (!M) return;
    if (mijingView && mijingRun()) {
      exitMijing();
      return;
    }
    if (mijingRun()) {
      enterMijing();
      return;
    }
    openMijingModal('intro');
  }

  function blessCardHtml(b, stacks, clickable) {
    const rar = MJ().RARITIES[b.rarity];
    const tag = clickable ? 'button type="button"' : 'div';
    const endTag = clickable ? 'button' : 'div';
    const stackText = clickable
      ? b.max > 1
        ? `已有 ${stacks}/${b.max} 层`
        : '唯一'
      : b.max > 1
        ? `${stacks}/${b.max} 层`
        : '';
    return (
      `<${tag} class="mijing-bless-card rar-${b.rarity}"${clickable ? ` data-bless-id="${b.id}"` : ''}>` +
      `<img class="gi mijing-bless-icon" src="${MJ_ICON(b.icon)}" alt="" aria-hidden="true">` +
      `<span class="mijing-bless-main"><span class="mijing-bless-name">${escHtml(b.name)}<span class="mijing-bless-rar">${rar.name}</span></span>` +
      `<span class="mijing-bless-desc">${escHtml(b.desc)}</span></span>` +
      (stackText ? `<span class="mijing-bless-stack">${stackText}</span>` : '') +
      `</${endTag}>`
    );
  }

  function rewardLineHtml(rw) {
    return `${LINGYU_ICON} 灵玉 +${fmt(rw.lingyu)} · ${PEACH_ICON} 仙桃 +${fmt(rw.peaches)}`;
  }

  function renderMijingModal() {
    const titleEl = $('mijing-modal-title');
    const bodyEl = $('mijing-modal-body');
    const actionsEl = $('mijing-modal-actions');
    const M = MJ();
    if (!titleEl || !bodyEl || !actionsEl || !M) return;
    const s = window.GameState.state;
    const run = M.activeRun(s);
    let title = '秘境劫运';
    let body = '';
    let actions = '';

    if (mijingModalMode === 'intro') {
      const chk = M.canStart(s, Date.now());
      const left = M.attemptsLeft(s, Date.now());
      const best = (s.stage && s.stage.best) || 0;
      const ref = Math.max(1, Math.min(300, best));
      const full = M.rewardsFor(ref, M.WAVES);
      body =
        '<ul class="mijing-rules">' +
        `<li>连战 <b>${M.WAVES}</b> 波，第 4 波精英、第 8 波 Boss；敌人强度以最高通关关卡（第 ${best} 关）为基准，按当前队伍实力微调。</li>` +
        '<li>每过 2 波可从 3 个<b>劫运</b>中择一，可叠层，仅本局生效，结束即散。</li>' +
        '<li>沿用当前队伍与布阵；每波开战满血，失败即结束，按已过波次结算。</li>' +
        `<li>每日 <b>${M.DAILY_ATTEMPTS}</b> 次（按本地日期零点重置），开启即消耗。</li>` +
        '</ul>' +
        (M.isUnlocked(s) ? `<div class="mijing-reward-row">全通奖励约：${rewardLineHtml(full)}</div>` : '') +
        `<div class="mijing-note" data-tone="${chk.ok ? 'info' : 'warn'}">${chk.ok ? `今日剩余 ${left}/${M.DAILY_ATTEMPTS} 次` : escHtml(chk.message)}</div>`;
      actions =
        '<button class="btn" type="button" data-mj-action="close">取消</button>' +
        `<button class="btn btn-primary" type="button" data-mj-action="start"${chk.ok ? '' : ' disabled'}>${
          mijingStartArmed && chk.ok ? `确认开启（消耗 1 次，剩 ${left - 1} 次）` : '开启秘境'
        }</button>`;
      if (mijingStartArmed && chk.ok) {
        body += `<div class="mijing-note mijing-start-confirm" data-tone="warn">开启即消耗今日 1 次秘境次数，中途结束不返还。再点一次确认开启。</div>`;
      }
    } else if (mijingModalMode === 'pick' && run && Array.isArray(run.choices)) {
      title = `择一劫运 · 已过 ${run.cleared} 波`;
      body =
        '<div class="mijing-bless-list">' +
        run.choices.map((id) => blessCardHtml(M.BLESSING_MAP[id], run.blessings[id] || 0, true)).join('') +
        '</div>' +
        `<div class="mijing-note">${escHtml(blessingChipText(run))}</div>`;
      actions = '<button class="btn" type="button" data-mj-action="close">稍后再选</button>';
    } else if (mijingModalMode === 'detail' && run) {
      title = `秘境劫运 · 已过 ${run.cleared}/${M.WAVES} 波`;
      const list = M.blessingList(run.blessings);
      body =
        (list.length
          ? `<div class="mijing-bless-list is-compact">${list.map((b) => blessCardHtml(b, b.stacks, false)).join('')}</div>`
          : '<div class="mijing-note">暂无劫运 · 每过 2 波可三选一</div>') +
        `<div class="mijing-reward-row">现在结束可得：${rewardLineHtml(M.rewardsFor(run.ref, run.cleared))}</div>` +
        `<div class="mijing-reward-row">全通可得：${rewardLineHtml(M.rewardsFor(run.ref, M.WAVES))}</div>`;
      actions =
        '<button class="btn" type="button" data-mj-action="close">继续秘境</button>' +
        `<button class="btn btn-danger" type="button" data-mj-action="quit">${mijingQuitArmed ? '再点一次确认结束' : '结束并领取'}</button>`;
    } else if (mijingModalMode === 'result' && mijingResult) {
      const r = mijingResult;
      title = r.full ? '秘境全通！' : r.reason === 'quit' ? '秘境结算 · 主动结束' : `秘境止步 · 第 ${r.cleared + 1} 波`;
      const list = M.blessingList(r.blessings);
      body =
        `<div class="mijing-result-big">${r.full ? '八波尽破，劫运散去' : `已过 ${r.cleared}/${M.WAVES} 波`}</div>` +
        `<div class="mijing-reward-row is-gain">获得：${rewardLineHtml(r)}</div>` +
        (list.length
          ? `<div class="mijing-note">本局劫运（已消散）：${escHtml(list.map((b) => (b.stacks > 1 ? `${b.name}×${b.stacks}` : b.name)).join(' · '))}</div>`
          : '');
      actions = '<button class="btn btn-primary" type="button" data-mj-action="back">返回闯关</button>';
    } else {
      closeMijingModal();
      return;
    }
    titleEl.textContent = title;
    bodyEl.innerHTML = body;
    actionsEl.innerHTML = actions;
  }

  function openMijingModal(mode) {
    const modal = $('mijing-modal');
    if (!modal || !MJ()) return false;
    if (dragState) cancelDrag();
    clearTimeout(autoNextTimer);
    autoNextTimer = 0;
    mijingModalMode = mode;
    mijingQuitArmed = false;
    mijingStartArmed = false;
    mijingModalOpen = true;
    renderMijingModal();
    if (!mijingModalOpen) return false;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    return true;
  }

  function closeMijingModal() {
    const modal = $('mijing-modal');
    const wasMode = mijingModalMode;
    const wasOpen = mijingModalOpen;
    mijingModalOpen = false;
    mijingModalMode = '';
    mijingQuitArmed = false;
    mijingStartArmed = false;
    if (modal) {
      const activeEl = document.activeElement;
      if (activeEl && typeof modal.contains === 'function' && modal.contains(activeEl) && typeof activeEl.blur === 'function') {
        activeEl.blur();
      }
      modal.classList.remove('active');
      modal.setAttribute('aria-hidden', 'true');
    }
    if (wasOpen && wasMode === 'result') {
      mijingResult = null;
      exitMijing();
      return;
    }
    if (wasOpen) {
      render();
      scheduleAutoNextIfAllowed();
    }
  }

  function startMijingRun() {
    const M = MJ();
    if (!M) return false;
    // 普通推关战斗进行中时先瞬时结算，避免秘境次数已扣却进不去
    if (isPlaying) skipBattle();
    if (isPlaying) return false;
    const s = window.GameState.state;
    s.seq = (s.seq || 0) + 1;
    const seed = ((Date.now() & 0xffffffff) ^ Math.imul(s.seq, 0x85ebca6b)) >>> 0;
    const res = M.startRun(s, Date.now(), seed);
    if (!res.ok) {
      renderMijingModal();
      return false;
    }
    window.GameState.saveGame();
    if (window.Daily && typeof window.Daily.hook === 'function') window.Daily.hook(s, 'mijing_run', 1, Date.now());
    log(`开启秘境劫运（敌人强度以第 ${res.run.ref} 关为基准），今日剩余 ${M.attemptsLeft(s, Date.now())} 次。`, 'success');
    mijingModalOpen = false;
    mijingModalMode = '';
    const modal = $('mijing-modal');
    if (modal) {
      modal.classList.remove('active');
      modal.setAttribute('aria-hidden', 'true');
    }
    enterMijing();
    onChange();
    scheduleMijingNext();
    return true;
  }

  function pickMijingBlessing(id) {
    const M = MJ();
    const s = window.GameState.state;
    const res = M ? M.pickBlessing(s, id) : { ok: false };
    if (!res.ok) return false;
    window.GameState.saveGame();
    const stackNote = res.blessing.max > 1 ? `（${res.stacks}/${res.blessing.max} 层）` : '';
    const logLine = $('battle-log-line');
    if (logLine) logLine.textContent = `获得劫运【${res.blessing.name}】${stackNote} · ${res.blessing.desc}`;
    closeMijingModal();
    return true;
  }

  function showMijingResult(summary) {
    mijingResult = summary;
    openMijingModal('result');
  }

  function quitMijingRun() {
    const M = MJ();
    if (!M || isPlaying || !mijingRun()) return false;
    const summary = M.endRun(window.GameState.state, 'quit');
    window.GameState.saveGame();
    log(`秘境劫运结束（已过 ${summary.cleared}/${M.WAVES} 波）：灵玉 +${fmt(summary.lingyu)}、仙桃 +${fmt(summary.peaches)}`, 'gold');
    onChange();
    mijingModalOpen = false;
    showMijingResult(summary);
    return true;
  }

  function finishMijingWave(sim, enemy) {
    const M = MJ();
    const s = window.GameState.state;
    const logLine = $('battle-log-line');
    const res = M ? M.onWaveResult(s, sim.win) : { ok: false };
    if (!res.ok) {
      render();
      return;
    }
    if (res.ended) {
      const summary = M.endRun(s, res.full ? 'clear' : 'fail');
      if (logLine) {
        logLine.textContent = res.full
          ? `秘境全通！击破 Boss【${enemy.name}】`
          : sim.timeout
            ? `秘境第 ${res.wave} 波久战不下，秘境止步`
            : `秘境第 ${res.wave} 波不敌 ${enemy.name}，秘境止步`;
      }
      log(
        `${res.full ? '秘境劫运全通' : `秘境劫运止步第 ${res.wave} 波`}：灵玉 +${fmt(summary.lingyu)}、仙桃 +${fmt(summary.peaches)}`,
        res.full ? 'gold' : 'warn'
      );
      window.GameState.saveGame();
      onChange();
      render();
      showMijingResult(summary);
      return;
    }
    if (logLine) {
      logLine.textContent = res.needPick
        ? `秘境第 ${res.wave} 波告捷 · 劫运将至，择一而行`
        : `秘境第 ${res.wave} 波告捷 · 下一波：第 ${res.wave + 1} 波`;
    }
    window.GameState.saveGame();
    onChange();
    render();
    if (res.needPick) {
      openMijingModal('pick');
    } else {
      scheduleMijingNext();
    }
  }

  function initMijingUI() {
    const entry = $('btn-mijing-entry');
    if (entry) entry.addEventListener('click', onMijingEntryClick);
    const detailBtn = $('btn-mijing-detail');
    if (detailBtn) {
      detailBtn.addEventListener('click', () => {
        const run = mijingRun();
        if (!run) return;
        openMijingModal(Array.isArray(run.choices) && run.choices.length > 0 ? 'pick' : 'detail');
      });
    }
    const closeBtn = $('btn-mijing-close');
    if (closeBtn) closeBtn.addEventListener('click', () => closeMijingModal());
    const modal = $('mijing-modal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          closeMijingModal();
          return;
        }
        const card = e.target.closest && e.target.closest('[data-bless-id]');
        if (card) {
          pickMijingBlessing(card.getAttribute('data-bless-id'));
          return;
        }
        const actBtn = e.target.closest && e.target.closest('[data-mj-action]');
        if (!actBtn || actBtn.disabled) return;
        const act = actBtn.getAttribute('data-mj-action');
        if (act === 'close' || act === 'back') closeMijingModal();
        else if (act === 'start') {
          if (!mijingStartArmed) {
            mijingStartArmed = true;
            renderMijingModal();
          } else {
            mijingStartArmed = false;
            startMijingRun();
          }
        }
        else if (act === 'quit') {
          if (!mijingQuitArmed) {
            mijingQuitArmed = true;
            renderMijingModal();
          } else {
            quitMijingRun();
          }
        }
      });
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
        renderMijingEntry();
      }
    }
  }

  function onShow() {
    previewBoardKey = '';
    render();
    requestAnimationFrame(layoutBoard);
    maybeShowBondHint();
  }

  function onHide() {
    if (dragState) cancelDrag();
    if (squadModalOpen) closeSquadModal({ skipResumeAuto: true });
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

    const btnSquad = $('btn-stage-squad');
    const btnChallenge = $('btn-stage-challenge');
    const btnAuto = $('btn-stage-auto');
    const btnSpeed = $('btn-stage-speed');
    const btnClaim = $('btn-stage-claim');
    const btnGotoPeach = $('btn-goto-peach');
    const btnGotoGongfa = $('btn-goto-gongfa');
    const squadModal = $('squad-modal');
    const btnSquadClose = $('btn-squad-close');
    const btnSquadCancel = $('btn-squad-cancel');
    const btnSquadSave = $('btn-squad-save');
    const squadHeroList = $('squad-hero-list');
    const squadActiveSlots = $('squad-active-slots');

    if (btnSquad) {
      btnSquad.addEventListener('click', () => openSquadModal());
    }
    if (btnSquadClose) {
      btnSquadClose.addEventListener('click', () => closeSquadModal());
    }
    if (btnSquadCancel) {
      btnSquadCancel.addEventListener('click', () => closeSquadModal());
    }
    if (btnSquadSave) {
      btnSquadSave.addEventListener('click', () => saveSquad());
    }
    if (squadModal) {
      squadModal.addEventListener('click', (e) => {
        if (e.target === squadModal) {
          closeSquadModal();
        }
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e && e.key === 'Escape' && squadModalOpen) {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        closeSquadModal();
      } else if (e && e.key === 'Escape' && mijingModalOpen) {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        closeMijingModal();
      }
    });
    if (squadHeroList) {
      squadHeroList.addEventListener('click', (e) => {
        const growOpen = e.target.closest && e.target.closest('[data-grow-open]');
        if (growOpen) {
          const gid = growOpen.getAttribute('data-grow-open');
          if (typeof e.preventDefault === 'function') e.preventDefault();
          if (typeof e.stopPropagation === 'function') e.stopPropagation();
          if (gid && window.GrowUI && typeof window.GrowUI.open === 'function') window.GrowUI.open(gid);
          return;
        }
        const card = e.target.closest('[data-squad-hero-id]');
        if (!card) return;
        const heroId = card.getAttribute('data-squad-hero-id');
        if (heroId) squadSkillFocus = heroId;
        if (heroId) toggleDraftHero(heroId);
        renderSquadSkillDetail();
      });
    }
    if (squadActiveSlots) {
      squadActiveSlots.addEventListener('click', (e) => {
        const slot = e.target.closest('[data-slot-hero-id]');
        if (!slot) return;
        const heroId = slot.getAttribute('data-slot-hero-id');
        if (heroId) toggleDraftHero(heroId);
      });
    }

    if (btnChallenge) {
      btnChallenge.addEventListener('click', () => startBattle(true));
    }
    initMijingUI();
    const bondHint = $('bond-hint');
    if (bondHint) {
      bondHint.addEventListener('click', () => {
        bondHint.hidden = true;
        openSquadModal();
      });
    }
    const bondRow = $('stage-bond-row');
    if (bondRow) {
      bondRow.addEventListener('click', () => {
        if (!isPlaying) openSquadModal();
      });
      bondRow.addEventListener('keydown', (e) => {
        if (e && (e.key === 'Enter' || e.key === ' ') && !isPlaying) {
          if (typeof e.preventDefault === 'function') e.preventDefault();
          openSquadModal();
        }
      });
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
    const btnGotoBreak = $('btn-goto-break');
    if (btnGotoBreak) {
      btnGotoBreak.addEventListener('click', (e) => {
        e.stopPropagation();
        hideResultOverlay();
        switchTab('tab-cultivate');
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
    _formation: { computeDisplayCells, lungeVector },
    _bossRetryDecision: bossRetryDecision,
    _bondListRows: bondListRows,
    challengeReadiness,
    challengeNow,
    init,
    tick,
    render,
    onShow,
    onHide,
    startBattle,
    skipBattle,
    openSquadModal,
    closeSquadModal,
    renderSquadModal,
    getDraftSquad,
    toggleDraftHero,
    saveSquad,
    enterMijing,
    exitMijing,
    openMijingModal,
    closeMijingModal,
    pickMijingBlessing,
    startMijingRun,
    quitMijingRun,
    startTowerBattle
  };
})();
