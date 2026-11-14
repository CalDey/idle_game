// 洞府机缘：在洞府场景挂机时偶发机缘，复用 24 条世界观事件文案与 IdleEvents 折算。
// 每日次数有限；按「在线时长」20–40 分钟刷出；离线按封顶条数补积。
// 不发道果、不发转世货币。存档用 state.homeFortune（state.home 已用于洞府升级）。
(function () {
  const VERSION = 1;
  const DAILY_CAP = 4;
  const SPAWN_MIN_MS = 20 * 60 * 1000;
  const SPAWN_MAX_MS = 40 * 60 * 1000;
  const OFFLINE_INTERVAL_MS = 30 * 60 * 1000;
  const OFFLINE_ACCRUE_CAP = 2;
  const MAX_QUEUED = 1;
  const RECENT_SIZE = 4;
  const PEACH_CAP = 3;
  const JADE_ABS_MAX = 4;
  const REWARD_CAP_MINUTES = 6;
  const POOL_HOME = 'home';
  const POOL_IDLE = 'idle';

  function todayKey(now) {
    const d = new Date(now == null ? Date.now() : now);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function emptyFortune(now) {
    return {
      v: VERSION,
      date: '',
      spawned: 0,
      pending: null,
      queued: 0,
      recent: [],
      nextOnlineAt: SPAWN_MIN_MS,
      onlineMs: 0,
      lastSeen: 0
    };
  }

  function randomCooldown(rng) {
    const r = typeof rng === 'function' ? rng() : Math.random();
    const x = Math.max(0, Math.min(1, Number(r) || 0));
    return Math.round(SPAWN_MIN_MS + x * (SPAWN_MAX_MS - SPAWN_MIN_MS));
  }

  function findEvent(id) {
    const IE = window.IdleEvents;
    if (IE && typeof IE.findEvent === 'function') return IE.findEvent(id);
    const all = (window.GameEventsData && window.GameEventsData.events) || [];
    return all.find((e) => e && e.id === id) || null;
  }

  function normalizePending(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    if (!findEvent(raw.id)) return null;
    return { id: String(raw.id), pool: POOL_HOME, at: Number(raw.at) || 0 };
  }

  function normalize(raw) {
    const out = emptyFortune();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    out.date = typeof raw.date === 'string' ? raw.date : '';
    out.spawned = Math.max(0, Math.min(DAILY_CAP, Math.floor(Number(raw.spawned) || 0)));
    out.queued = Math.max(0, Math.min(MAX_QUEUED, Math.floor(Number(raw.queued) || 0)));
    out.pending = normalizePending(raw.pending);
    out.recent = Array.isArray(raw.recent) ? raw.recent.filter((id) => typeof id === 'string').slice(-RECENT_SIZE) : [];
    const online = Number(raw.onlineMs);
    out.onlineMs = Number.isFinite(online) && online > 0 ? online : 0;
    const next = Number(raw.nextOnlineAt);
    out.nextOnlineAt = Number.isFinite(next) && next > 0 ? next : out.onlineMs + SPAWN_MIN_MS;
    const seen = Number(raw.lastSeen);
    out.lastSeen = Number.isFinite(seen) && seen > 0 ? seen : 0;
    return out;
  }

  function ensure(s, now) {
    if (!s || typeof s !== 'object') return emptyFortune(now);
    const key = todayKey(now);
    const cur = normalize(s.homeFortune);
    if (cur.date !== key) {
      cur.date = key;
      cur.spawned = 0;
    }
    // 原地更新，避免调用方持有的引用在二次 ensure 后过期
    if (s.homeFortune && typeof s.homeFortune === 'object' && !Array.isArray(s.homeFortune)) {
      Object.keys(s.homeFortune).forEach((k) => {
        if (!(k in cur)) delete s.homeFortune[k];
      });
      Object.assign(s.homeFortune, cur);
      return s.homeFortune;
    }
    s.homeFortune = cur;
    return cur;
  }

  function waitingCount(h) {
    return (h && h.pending ? 1 : 0) + (h && h.queued ? h.queued : 0);
  }

  function spawnRoom(s, now) {
    const h = ensure(s, now);
    const capLeft = Math.max(0, DAILY_CAP - (h.spawned || 0));
    const waitLeft = Math.max(0, 1 + MAX_QUEUED - waitingCount(h));
    return Math.min(capLeft, waitLeft);
  }

  function eligibleList(s) {
    const IE = window.IdleEvents;
    if (!IE || typeof IE.eligibleEvents !== 'function') return [];
    const home = IE.eligibleEvents(s, POOL_HOME);
    if (home.length) return home;
    return IE.eligibleEvents(s, POOL_IDLE);
  }

  function drawEvent(s, rng) {
    const h = ensure(s);
    const list = eligibleList(s);
    if (!list.length) return null;
    const fresh = list.filter((e) => !h.recent.includes(e.id));
    const bag = fresh.length ? fresh : list;
    const r = typeof rng === 'function' ? rng() : Math.random();
    const x = Math.max(0, Math.min(0.999999, Number(r) || 0));
    return bag[Math.min(bag.length - 1, Math.floor(x * bag.length))];
  }

  function addSpawn(s, now, rng) {
    const h = ensure(s, now);
    if (spawnRoom(s, now) <= 0) return null;
    if (h.pending) {
      h.queued = Math.min(MAX_QUEUED, (h.queued || 0) + 1);
      h.spawned += 1;
      return { queued: true };
    }
    const pick = drawEvent(s, rng);
    if (!pick) return null;
    h.pending = { id: pick.id, pool: POOL_HOME, at: Number(now) || Date.now() };
    h.spawned += 1;
    return pick;
  }

  function promoteQueue(s, now, rng) {
    const h = ensure(s, now);
    if (h.pending || !(h.queued > 0)) return null;
    const pick = drawEvent(s, rng);
    if (!pick) return null;
    h.queued -= 1;
    h.pending = { id: pick.id, pool: POOL_HOME, at: Number(now) || Date.now() };
    return pick;
  }

  // 仅按在线时长刷出；与 playTimeMs 脱钩，避免离线补算的游戏时长再触发一次。
  function maybeSpawnOnline(s, opts) {
    const o = opts || {};
    const now = o.now == null ? Date.now() : o.now;
    const h = ensure(s, now);
    if (typeof o.onlineMs === 'number' && Number.isFinite(o.onlineMs) && o.onlineMs >= 0) {
      h.onlineMs = o.onlineMs;
    }
    promoteQueue(s, now, o.rng);
    if (h.onlineMs < h.nextOnlineAt) return null;
    if (spawnRoom(s, now) <= 0) {
      h.nextOnlineAt = h.onlineMs + randomCooldown(o.rng);
      return null;
    }
    const pick = addSpawn(s, now, o.rng);
    h.nextOnlineAt = h.onlineMs + randomCooldown(o.rng);
    return pick;
  }

  function accrueOffline(s, offlineMs, now, rng) {
    const ms = Math.max(0, Number(offlineMs) || 0);
    const t = now == null ? Date.now() : now;
    ensure(s, t);
    const n = Math.min(spawnRoom(s, t), OFFLINE_ACCRUE_CAP, Math.floor(ms / OFFLINE_INTERVAL_MS));
    const got = [];
    for (let i = 0; i < n; i++) {
      const pick = addSpawn(s, t, rng);
      if (pick) got.push(pick);
      else break;
    }
    return got;
  }

  function onResume(s, offlineMs, now, rng) {
    const t = now == null ? Date.now() : now;
    ensure(s, t);
    const got = accrueOffline(s, offlineMs, t, rng);
    promoteQueue(s, t, rng);
    const h = ensure(s, t);
    h.lastSeen = t;
    if (window.HomeFortuneUI && typeof window.HomeFortuneUI.render === 'function') {
      window.HomeFortuneUI.render();
    }
    return got;
  }

  function quote(s, event, option, env) {
    const IE = window.IdleEvents;
    const q = IE && typeof IE.scaleQuote === 'function'
      ? IE.scaleQuote(s, event, option, env)
      : { cost: {}, reward: {}, notes: [], affordable: true, lacking: [] };
    const cost = Object.assign({}, q.cost);
    const reward = Object.assign({}, q.reward);
    delete cost.daoguo;
    delete reward.daoguo;
    const e = env || {};
    const qiPer = Math.max(0, Number(e.qiPerSec) || 0);
    const stPer = Math.max(0, Number(e.stonePerSec) || 0);
    if (reward.qi) reward.qi = Math.min(reward.qi, Math.max(1, Math.round(qiPer * 60 * REWARD_CAP_MINUTES)));
    if (reward.stone) reward.stone = Math.min(reward.stone, Math.max(1, Math.round(stPer * 60 * REWARD_CAP_MINUTES)));
    if (reward.peach) reward.peach = Math.max(1, Math.min(Math.round(reward.peach), PEACH_CAP));
    if (reward.jade) reward.jade = Math.max(1, Math.min(Math.round(reward.jade), JADE_ABS_MAX));
    const notes = (q.notes || []).filter((n) => n && !/道果/.test(n));
    const have = {
      qi: Number(s.qi) || 0,
      stone: Number(s.stones) || 0,
      jade: Number(s.lingyu) || 0,
      peach: (s.tree && Number(s.tree.peaches)) || 0
    };
    const names = (IE && IE.RES_NAMES) || { qi: '灵气', stone: '灵石', jade: '灵玉', peach: '仙桃' };
    const lacking = ['qi', 'stone', 'jade', 'peach'].filter((k) => cost[k] > 0 && have[k] < cost[k]);
    return {
      cost,
      reward,
      notes,
      affordable: lacking.length === 0,
      lacking: lacking.map((k) => names[k] || k)
    };
  }

  function settle(s, optionIndex, env, hooks) {
    const t = Number((env || {}).now) || Date.now();
    const h = ensure(s, t);
    const hooksObj = hooks || {};
    if (!h.pending) return { ok: false, reason: 'no_pending' };
    const event = findEvent(h.pending.id);
    const option = event && event.options && event.options[optionIndex];
    if (!option) return { ok: false, reason: 'bad_option' };
    const q = quote(s, event, option, env);
    if (!q.affordable) return { ok: false, reason: 'insufficient', lacking: q.lacking, quote: q };

    if (q.cost.qi) s.qi = (Number(s.qi) || 0) - q.cost.qi;
    if (q.cost.stone) s.stones = (Number(s.stones) || 0) - q.cost.stone;
    if (q.cost.jade) s.lingyu = (Number(s.lingyu) || 0) - q.cost.jade;
    if (q.cost.peach) s.tree.peaches = (Number(s.tree.peaches) || 0) - q.cost.peach;

    if (q.reward.qi) {
      s.qi = (Number(s.qi) || 0) + q.reward.qi;
      s.lifetimeQi = (Number(s.lifetimeQi) || 0) + q.reward.qi;
    }
    if (q.reward.stone) s.stones = (Number(s.stones) || 0) + q.reward.stone;
    if (q.reward.jade) s.lingyu = (Number(s.lingyu) || 0) + q.reward.jade;
    if (q.reward.peach) {
      if (!s.tree || typeof s.tree !== 'object') s.tree = {};
      s.tree.peaches = (Number(s.tree.peaches) || 0) + q.reward.peach;
    }
    let equipItem = null;
    let equipNote = '';
    if (q.reward.equip && typeof hooksObj.makeEquip === 'function') {
      equipItem = hooksObj.makeEquip(s, q.reward.equip.q);
      if (equipItem && typeof hooksObj.grantEquip === 'function') equipNote = hooksObj.grantEquip(s, equipItem) || '';
    }

    h.recent = (h.recent || []).concat(event.id).slice(-RECENT_SIZE);
    h.pending = null;
    promoteQueue(s, t, hooksObj.rng);
    if (window.Daily && typeof window.Daily.hook === 'function') {
      window.Daily.hook(s, 'event_choice', 1, t);
    }
    return { ok: true, event, option, cost: q.cost, reward: q.reward, notes: q.notes, equipItem, equipNote, resultText: option.resultText };
  }

  window.HomeFortune = {
    VERSION,
    DAILY_CAP,
    SPAWN_MIN_MS,
    SPAWN_MAX_MS,
    OFFLINE_INTERVAL_MS,
    OFFLINE_ACCRUE_CAP,
    MAX_QUEUED,
    PEACH_CAP,
    JADE_ABS_MAX,
    REWARD_CAP_MINUTES,
    todayKey,
    emptyFortune,
    normalize,
    ensure,
    drawEvent,
    eligibleList,
    maybeSpawnOnline,
    accrueOffline,
    onResume,
    quote,
    settle,
    randomCooldown,
    spawnRoom,
    waitingCount,
    promoteQueue
  };

  if (typeof document === 'undefined' || !document.getElementById) return;

  const fmt = (n) => (window.GameConfig && window.GameConfig.formatNumber ? window.GameConfig.formatNumber(n) : String(Math.round(n)));
  const RES_KEYS = ['qi', 'stone', 'jade', 'peach'];
  const RES_NAMES = { qi: '灵气', stone: '灵石', jade: '灵玉', peach: '仙桃' };
  const ICONS = { qi: 'res_qi', stone: 'res_stone', jade: 'res_lingyu', peach: 'res_peach' };
  let els = null;
  let lastTick = 0;

  function env() {
    const GS = window.GameState;
    return { qiPerSec: GS.getQiPerSec(), stonePerSec: GS.getStonePerSec(), now: Date.now() };
  }

  function makeEquip(s, qIndex) {
    if (!window.Equip || typeof window.Equip.rollItem !== 'function') return null;
    const tmp = Object.assign({}, s, {
      tree: Object.assign({}, s.tree || {}, { lv: 1 }),
      pity: { di: qIndex >= 3 ? 50 : 0, tian: qIndex >= 4 ? 200 : 0 }
    });
    const item = window.Equip.rollItem(tmp);
    s.seq = tmp.seq;
    return item;
  }

  function grantEquip(s, item) {
    if (s.pending || !window.GearUI || typeof window.GearUI.grant !== 'function') {
      const jade = window.Titles && window.Titles.jadeValue ? window.Titles.jadeValue(s, item) : 0;
      s.lingyu = (Number(s.lingyu) || 0) + jade;
      s.decomposed = (Number(s.decomposed) || 0) + 1;
      return `已有待处理装备，【${window.Equip.itemName(item)}】自动分解，灵玉 +${jade}`;
    }
    window.GearUI.grant(item);
    return `获得【${window.Equip.itemName(item)}】`;
  }

  function resLine(map, sign) {
    const parts = [];
    RES_KEYS.forEach((k) => {
      if (map[k] > 0) {
        parts.push(`<span class="evt-res"><img class="gi gi-12" src="assets/icons/${ICONS[k]}@64.webp?v=18" alt="" aria-hidden="true">${RES_NAMES[k]} ${sign}${fmt(map[k])}</span>`);
      }
    });
    if (map.equip) parts.push(`<span class="evt-res">${map.equip.name}装备 ×1</span>`);
    return parts.join('');
  }

  function renderMarker() {
    if (!els || !els.btn) return;
    const GS = window.GameState;
    if (!GS || !GS.state) return;
    const h = ensure(GS.state, Date.now());
    const has = !!(h.pending && findEvent(h.pending.id));
    els.btn.hidden = !has;
    els.btn.classList.toggle('has-event', has);
    if (els.label) els.label.textContent = '机缘';
  }

  function openModal() {
    const s = window.GameState.state;
    const h = ensure(s, Date.now());
    if (!h.pending) return;
    const event = findEvent(h.pending.id);
    if (!event || !els.modal) return;
    if (els.title) els.title.textContent = event.name;
    if (els.text) els.text.textContent = event.text;
    if (els.result) {
      els.result.hidden = true;
      els.result.innerHTML = '';
    }
    if (els.options) {
      els.options.hidden = false;
      els.options.innerHTML = '';
      const e = env();
      (event.options || []).forEach((opt, idx) => {
        const q = quote(s, event, opt, e);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn evt-option';
        btn.disabled = !q.affordable;
        btn.dataset.idx = String(idx);
        const costHtml = resLine(q.cost, '-');
        const rewardHtml = resLine(q.reward, '+');
        btn.innerHTML = `
        <span class="evt-option-label">${opt.label}</span>
        ${costHtml ? `<span class="evt-option-line evt-cost">代价 ${costHtml}</span>` : ''}
        ${rewardHtml ? `<span class="evt-option-line evt-reward">收获 ${rewardHtml}</span>` : ''}
        ${q.notes.length ? `<span class="evt-option-line evt-note">${q.notes.join('；')}</span>` : ''}
        ${q.affordable ? '' : `<span class="evt-option-line evt-lack">${q.lacking.join('、')}不足</span>`}
      `;
        els.options.appendChild(btn);
      });
    }
    if (els.close) els.close.textContent = '暂且记下';
    els.modal.classList.add('active');
    els.modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    if (!els || !els.modal) return;
    els.modal.classList.remove('active');
    els.modal.setAttribute('aria-hidden', 'true');
    renderMarker();
  }

  function choose(idx) {
    const s = window.GameState.state;
    const res = settle(s, idx, env(), { makeEquip, grantEquip });
    if (!res.ok) {
      openModal();
      return;
    }
    window.GameState.saveGame();
    const costHtml = resLine(res.cost, '-');
    const rewardHtml = resLine(res.reward, '+');
    if (els.options) els.options.hidden = true;
    if (els.result) {
      els.result.hidden = false;
      els.result.innerHTML = `
      <p class="evt-result-text">${res.resultText}</p>
      ${costHtml ? `<div class="evt-option-line evt-cost">付出 ${costHtml}</div>` : ''}
      ${rewardHtml ? `<div class="evt-option-line evt-reward">获得 ${rewardHtml}</div>` : ''}
      ${res.equipNote ? `<div class="evt-option-line evt-note">${res.equipNote}</div>` : ''}
      ${res.notes.length ? `<div class="evt-option-line evt-note">${res.notes.join('；')}</div>` : ''}
    `;
    }
    if (els.close) els.close.textContent = '知道了';
    renderMarker();
  }

  function tick() {
    const GS = window.GameState;
    if (!GS || !GS.state) return;
    const now = Date.now();
    const h = ensure(GS.state, now);
    if (!lastTick) lastTick = now;
    const dt = Math.max(0, Math.min(2000, now - lastTick));
    lastTick = now;
    if (typeof document === 'undefined' || document.visibilityState !== 'hidden') {
      h.onlineMs = (h.onlineMs || 0) + dt;
      const spawned = maybeSpawnOnline(GS.state, { now, rng: Math.random });
      if (spawned) GS.saveGame();
    }
    renderMarker();
  }

  function init() {
    els = {
      btn: document.getElementById('btn-home-fortune'),
      label: document.getElementById('home-fortune-label'),
      modal: document.getElementById('home-fortune-modal'),
      title: document.getElementById('home-fortune-title'),
      text: document.getElementById('home-fortune-text'),
      options: document.getElementById('home-fortune-options'),
      result: document.getElementById('home-fortune-result'),
      close: document.getElementById('btn-close-home-fortune')
    };
    if (!els.btn || !els.modal || !window.GameState) {
      els = null;
      return;
    }
    els.btn.addEventListener('click', openModal);
    els.close.addEventListener('click', closeModal);
    els.modal.addEventListener('click', (e) => {
      if (e.target === els.modal) closeModal();
    });
    els.options.addEventListener('click', (e) => {
      const b = e.target.closest('.evt-option');
      if (!b || b.disabled) return;
      choose(Number(b.dataset.idx));
    });
    lastTick = Date.now();
    tick();
    setInterval(tick, 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') lastTick = Date.now();
    });
  }

  window.HomeFortuneUI = { render: renderMarker, open: openModal, close: closeModal };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
