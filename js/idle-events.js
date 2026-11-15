// 挂机随机事件（机缘）：抽取、折算、结算、存档字段与非阻塞入口。
// 规则：
// - 只在 realmIndex >= minRealmStage，且（若有 minChapter）章节进度 >= minChapter 时抽取；同一时间最多 1 个待处理事件（离线回来也最多 1 个）。
// - 章节进度与 BATTLE.CHAPTERS / 主线剧情相同：每 10 关一章，取 lifeBestStage、stage.best、stage.cur 的最高关换算。
// - 结算后进入 10–20 分钟（按游戏时长 playTimeMs 计）的冷却，冷却结束才会再出现。
// - 不强制弹窗：顶栏「机缘」按钮亮起，玩家点开再选。
// - 先扣 cost，资源不足的选项禁用；再发放 reward。只用现有资源：灵气、灵石、灵玉、仙桃、道果、装备。
// - 灵气/灵石按「当前每秒产出 × 分钟数」折算，避免盖过主循环（见 scaleQuote）。
// - 事件按 pool 分池（'idle' 挂机；后续「洞府机缘」可用 'home' 池复用 draw/quote/settle）。
(function () {
  const RULES = {
    POOL_IDLE: 'idle',
    COOLDOWN_MIN_MS: 10 * 60 * 1000,
    COOLDOWN_MAX_MS: 20 * 60 * 1000,
    // 灵气/灵石：分钟数 = BASE_MINUTES × 文档数值 ÷ 该境界段文档数值中位数
    BASE_MINUTES: 3,
    REWARD_CAP_MINUTES: 8,
    COST_CAP_MINUTES: 12,
    // 灵玉：不超过文档值，且不超过关卡挂机 0.5 小时的灵玉产出（至少 3）
    JADE_CAP_HOURS: 0.5,
    JADE_CAP_MIN: 3,
    // 仙桃：奖励最多 5 枚；代价按文档原值
    PEACH_REWARD_CAP: 5,
    // 道果：每个选项最多 1 枚，只进可用道果（不计入累计倍率），每天最多 2 枚
    DAOGUO_PER_OPTION: 1,
    DAOGUO_DAILY_CAP: 2,
    RECENT_SIZE: 4
  };
  const TIER_BOUNDS = [0, 6, 15, 21, 27, 33];
  const RES_KEYS = ['qi', 'stone', 'jade', 'peach', 'daoguo'];
  const RES_NAMES = { qi: '灵气', stone: '灵石', jade: '灵玉', peach: '仙桃', daoguo: '道果' };

  function allEvents() {
    const base = (window.GameEventsData && Array.isArray(window.GameEventsData.events) && window.GameEventsData.events) || [];
    const extra = (window.Karma && typeof window.Karma.idleEvents === 'function') ? window.Karma.idleEvents() : [];
    return extra.length ? base.concat(extra) : base;
  }

  function findEvent(id) {
    return allEvents().find((e) => e && e.id === id) || null;
  }

  function tierOf(minRealmStage) {
    let t = 0;
    for (let i = 0; i < TIER_BOUNDS.length; i++) {
      if ((minRealmStage || 0) >= TIER_BOUNDS[i]) t = i;
    }
    return t;
  }

  function median(values) {
    if (!values.length) return 0;
    const v = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(v.length / 2);
    return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
  }

  let refCache = null;
  // 每个境界段、每种资源（qi/stone）文档数值的中位数，作为「BASE_MINUTES 分钟产出」的锚点。
  function tierRefs() {
    if (refCache && refCache.src === allEvents()) return refCache.refs;
    const refs = {};
    ['qi', 'stone'].forEach((res) => {
      refs[res] = TIER_BOUNDS.map((_, t) => {
        const vals = [];
        allEvents().forEach((e) => {
          if (tierOf(e.minRealmStage) !== t) return;
          (e.options || []).forEach((o) => {
            ['cost', 'reward'].forEach((k) => {
              const n = o && o[k] && Number(o[k][res]);
              if (n > 0) vals.push(n);
            });
          });
        });
        return median(vals);
      });
    });
    refCache = { src: allEvents(), refs };
    return refs;
  }

  function todayKey(now) {
    const d = new Date(now);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function randomCooldown(rng) {
    const r = typeof rng === 'function' ? rng() : Math.random();
    const x = Math.max(0, Math.min(1, Number(r) || 0));
    return Math.round(RULES.COOLDOWN_MIN_MS + x * (RULES.COOLDOWN_MAX_MS - RULES.COOLDOWN_MIN_MS));
  }

  // 存档字段 state.idleEvents 的安全默认值；旧档没有该字段或字段损坏时自动修复。
  function ensureState(s) {
    const play = Number(s.playTimeMs) || 0;
    let ev = s.idleEvents;
    if (!ev || typeof ev !== 'object' || Array.isArray(ev)) ev = {};
    const out = {
      v: 1,
      pending: null,
      nextAt: Number.isFinite(Number(ev.nextAt)) && ev.nextAt !== null ? Number(ev.nextAt) : play + RULES.COOLDOWN_MIN_MS,
      recent: Array.isArray(ev.recent) ? ev.recent.filter((id) => typeof id === 'string').slice(-RULES.RECENT_SIZE) : [],
      dgDay: ev.dgDay && typeof ev.dgDay === 'object' ? { date: String(ev.dgDay.date || ''), n: Math.max(0, Number(ev.dgDay.n) || 0) } : { date: '', n: 0 },
      count: Math.max(0, Number(ev.count) || 0)
    };
    // 冷却不应长于上限（例如异常存档写入了极大值）
    if (out.nextAt > play + RULES.COOLDOWN_MAX_MS) out.nextAt = play + RULES.COOLDOWN_MAX_MS;
    if (ev.pending && typeof ev.pending === 'object' && findEvent(ev.pending.id)) {
      out.pending = { id: ev.pending.id, pool: ev.pending.pool || RULES.POOL_IDLE, at: Number(ev.pending.at) || 0 };
    }
    // 原地更新，保持同一对象引用（调用方可能持有旧引用）
    if (s.idleEvents && typeof s.idleEvents === 'object' && !Array.isArray(s.idleEvents)) {
      Object.keys(s.idleEvents).forEach((k) => {
        if (!(k in out)) delete s.idleEvents[k];
      });
      Object.assign(s.idleEvents, out);
      return s.idleEvents;
    }
    s.idleEvents = out;
    return out;
  }

  function eventPools(e) {
    const p = e && e.pool;
    if (Array.isArray(p)) return p.filter((x) => typeof x === 'string' && x);
    if (typeof p === 'string' && p) return [p];
    return [RULES.POOL_IDLE];
  }

  // 与 story.js / BATTLE.CHAPTERS 相同：第 n 章 = 关卡 (n-1)*10+1 … n*10。
  function chapterProgress(s) {
    const stage = (s && s.stage) || {};
    const n = Math.max(
      Number(s && s.lifeBestStage) || 0,
      Number(stage.best) || 0,
      Number(stage.cur) || 0
    );
    if (n <= 0) return 0;
    return Math.floor((n - 1) / 10) + 1;
  }

  function eligibleEvents(s, pool) {
    const want = pool || RULES.POOL_IDLE;
    const realm = Number(s.realmIndex) || 0;
    const chapter = chapterProgress(s);
    return allEvents().filter((e) => {
      if (!eventPools(e).includes(want)) return false;
      if (window.Karma && e && e.karma && typeof window.Karma.isEligible === 'function') {
        return window.Karma.isEligible(s, e) === true;
      }
      return realm >= (Number(e.minRealmStage) || 0) && chapter >= (Number(e.minChapter) || 0);
    });
  }

  function drawEvent(s, pool, rng) {
    const ev = ensureState(s);
    const list = eligibleEvents(s, pool);
    if (!list.length) return null;
    const fresh = list.filter((e) => !ev.recent.includes(e.id));
    const bag = fresh.length ? fresh : list;
    const forced = bag.find((e) => e && e.karma && window.Karma && typeof window.Karma.shouldPity === 'function' && window.Karma.shouldPity(s, e));
    if (forced) return forced;
    const weightOf = (e) => (window.Karma && typeof window.Karma.drawWeight === 'function' ? window.Karma.drawWeight(e) : 1);
    const weights = bag.map(weightOf);
    const total = weights.reduce((a, b) => a + b, 0);
    let r = (typeof rng === 'function' ? rng() : Math.random()) * total;
    for (let i = 0; i < bag.length; i++) {
      r -= weights[i];
      if (r < 0) return bag[i];
    }
    return bag[bag.length - 1];
  }

  // 冷却结束且无待处理事件时生成一个待处理事件。返回新事件或 null。
  function maybeSpawn(s, opts) {
    const o = opts || {};
    const ev = ensureState(s);
    if (ev.pending) return null;
    const play = Number(s.playTimeMs) || 0;
    if (play < ev.nextAt) return null;
    const pick = drawEvent(s, o.pool, o.rng);
    if (!pick) return null;
    ev.pending = { id: pick.id, pool: pick.pool || RULES.POOL_IDLE, at: Number(o.now) || Date.now() };
    return pick;
  }

  function jadeCap(s) {
    const best = (s.stage && Number(s.stage.best)) || 0;
    return Math.max(RULES.JADE_CAP_MIN, Math.ceil((6 + 0.4 * best) * RULES.JADE_CAP_HOURS));
  }

  function minutesFor(res, docValue, event, capMinutes) {
    const ref = tierRefs()[res][tierOf(event.minRealmStage)] || docValue;
    const m = (RULES.BASE_MINUTES * docValue) / ref;
    return Math.min(capMinutes, m);
  }

  // 把文档建议值折算成当前实际数值。env: { qiPerSec, stonePerSec, now }
  function scaleQuote(s, event, option, env) {
    if (event && event.karmaQuote && window.Karma && typeof window.Karma.scaleQuote === 'function') {
      return window.Karma.scaleQuote(s, event, option, env);
    }
    const e = env || {};
    const perSec = { qi: Math.max(0, Number(e.qiPerSec) || 0), stone: Math.max(0, Number(e.stonePerSec) || 0) };
    const cost = {};
    const reward = {};
    const notes = [];
    const docCost = (option && option.cost) || {};
    const docReward = (option && option.reward) || {};
    ['qi', 'stone'].forEach((res) => {
      if (Number(docCost[res]) > 0) {
        const min = minutesFor(res, Number(docCost[res]), event, RULES.COST_CAP_MINUTES);
        cost[res] = Math.max(1, Math.round(perSec[res] * 60 * min));
      }
      if (Number(docReward[res]) > 0) {
        const min = minutesFor(res, Number(docReward[res]), event, RULES.REWARD_CAP_MINUTES);
        reward[res] = Math.max(1, Math.round(perSec[res] * 60 * min));
      }
    });
    if (Number(docCost.jade) > 0) cost.jade = Math.ceil(Number(docCost.jade));
    if (Number(docReward.jade) > 0) reward.jade = Math.max(1, Math.min(Math.round(Number(docReward.jade)), jadeCap(s)));
    if (Number(docCost.peach) > 0) cost.peach = Math.ceil(Number(docCost.peach));
    if (Number(docReward.peach) > 0) reward.peach = Math.max(1, Math.min(Math.round(Number(docReward.peach)), RULES.PEACH_REWARD_CAP));
    if (Number(docCost.daoguo) > 0) cost.daoguo = Math.ceil(Number(docCost.daoguo));
    if (Number(docReward.daoguo) > 0) {
      const ev = ensureState(s);
      const day = todayKey(Number(e.now) || Date.now());
      const used = ev.dgDay.date === day ? ev.dgDay.n : 0;
      const left = Math.max(0, RULES.DAOGUO_DAILY_CAP - used);
      const n = Math.min(RULES.DAOGUO_PER_OPTION, Math.round(Number(docReward.daoguo)), left);
      if (n > 0) reward.daoguo = n;
      else notes.push('今日机缘所得道果已达上限');
    }
    if (docReward.equip && typeof docReward.equip === 'object') {
      const qualities = (window.GameConfig && window.GameConfig.QUALITIES) || [];
      const qIndex = qualities.findIndex((q) => q.id === docReward.equip.quality);
      if (qIndex >= 0) reward.equip = { q: qIndex, name: qualities[qIndex].name };
    }
    const have = {
      qi: Number(s.qi) || 0,
      stone: Number(s.stones) || 0,
      jade: Number(s.lingyu) || 0,
      peach: (s.tree && Number(s.tree.peaches)) || 0,
      daoguo: Number(s.daoGuo) || 0
    };
    const lacking = RES_KEYS.filter((k) => cost[k] > 0 && have[k] < cost[k]);
    return { cost, reward, notes, affordable: lacking.length === 0, lacking: lacking.map((k) => RES_NAMES[k]) };
  }

  // 结算待处理事件的某个选项：校验 → 先扣 cost → 再发 reward → 清空待处理、进入冷却。
  // hooks: { rng, makeEquip(state, qIndex) -> item, grantEquip(state, item) -> string? }
  function settle(s, optionIndex, env, hooks) {
    const ev = ensureState(s);
    const h = hooks || {};
    if (!ev.pending) return { ok: false, reason: 'no_pending' };
    const event = findEvent(ev.pending.id);
    const option = event && event.options && event.options[optionIndex];
    if (!option) return { ok: false, reason: 'bad_option' };
    if (event.karma && window.Karma && typeof window.Karma.isEligible === 'function') {
      const pendingElite = window.Karma.ensureState && window.Karma.ensureState(s).pendingElite;
      const allowElite = pendingElite && pendingElite.id === event.id;
      if (!allowElite && window.Karma.isEligible(s, event) !== true) {
        return { ok: false, reason: 'ineligible' };
      }
    }
    const q = scaleQuote(s, event, option, env);
    if (!q.affordable) return { ok: false, reason: 'insufficient', lacking: q.lacking, quote: q };

    // 1) 扣除
    if (q.cost.qi) s.qi = (Number(s.qi) || 0) - q.cost.qi;
    if (q.cost.stone) s.stones = (Number(s.stones) || 0) - q.cost.stone;
    if (q.cost.jade) s.lingyu = (Number(s.lingyu) || 0) - q.cost.jade;
    if (q.cost.peach) s.tree.peaches = (Number(s.tree.peaches) || 0) - q.cost.peach;
    if (q.cost.daoguo) s.daoGuo = (Number(s.daoGuo) || 0) - q.cost.daoguo;

    // 2) 发放
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
    if (q.reward.daoguo) {
      s.daoGuo = (Number(s.daoGuo) || 0) + q.reward.daoguo;
      const day = todayKey(Number((env || {}).now) || Date.now());
      ev.dgDay = { date: day, n: (ev.dgDay.date === day ? ev.dgDay.n : 0) + q.reward.daoguo };
    }
    let equipItem = null;
    let equipNote = '';
    if (q.reward.equip && typeof h.makeEquip === 'function') {
      equipItem = h.makeEquip(s, q.reward.equip.q);
      if (equipItem && typeof h.grantEquip === 'function') equipNote = h.grantEquip(s, equipItem) || '';
    }

    // 3) 收尾
    ev.recent = ev.recent.concat(event.id).slice(-RULES.RECENT_SIZE);
    ev.pending = null;
    ev.count += 1;
    ev.nextAt = (Number(s.playTimeMs) || 0) + randomCooldown(h.rng);
    if (window.Daily && typeof window.Daily.hook === 'function') {
      window.Daily.hook(s, 'event_choice', 1, Number((env || {}).now) || Date.now());
    }
    let resultText = option.resultText;
    let karmaExtra = null;
    if (window.Karma && typeof window.Karma.afterSettle === 'function') {
      karmaExtra = window.Karma.afterSettle(s, event, optionIndex, env);
      if (karmaExtra && karmaExtra.resultText) resultText = karmaExtra.resultText;
    }
    return { ok: true, event, option, cost: q.cost, reward: q.reward, notes: q.notes, equipItem, equipNote, resultText, karma: karmaExtra };
  }

  const core = {
    RULES,
    RES_NAMES,
    allEvents,
    eventPools,
    findEvent,
    tierOf,
    tierRefs,
    ensureState,
    chapterProgress,
    eligibleEvents,
    drawEvent,
    maybeSpawn,
    scaleQuote,
    settle,
    randomCooldown,
    todayKey
  };
  // v143：页面载入后 20 秒内不刷新、不显示、不打开任何机缘（避免一进游戏就盖住首屏）；事件内容与奖励不变。
  core.LOAD_GRACE_MS = 20 * 1000;
  window.IdleEvents = core;

  // ===================== 界面（仅浏览器） =====================
  if (typeof document === 'undefined' || !document.getElementById) return;

  const fmt = (n) => (window.GameConfig && window.GameConfig.formatNumber ? window.GameConfig.formatNumber(n) : String(Math.round(n)));
  const ICONS = {
    qi: 'res_qi',
    stone: 'res_stone',
    jade: 'res_lingyu',
    peach: 'res_peach',
    daoguo: 'res_daoguo'
  };
  let els = null;

  function env() {
    const GS = window.GameState;
    return { qiPerSec: GS.getQiPerSec(), stonePerSec: GS.getStonePerSec(), now: Date.now() };
  }

  // 按指定品阶生成装备：沿用 Equip.rollItem。临时把仙桃树权重设为 1 级（地品以上权重为 0）并触发对应保底，
  // 从而得到恰好的地品（保底 50）或天品（保底 200）；不影响玩家真实保底计数。
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
    // 已有未处理掉落时不覆盖，直接分解为灵玉
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

  let loadedAt = 0;
  function inLoadGrace() {
    return Date.now() - loadedAt < core.LOAD_GRACE_MS;
  }

  function renderPortrait(modal, portrait) {
    if (!modal) return;
    const dialog = modal.querySelector('.idle-event-dialog') || modal;
    let art = dialog.querySelector('.idle-event-portrait-wrap');
    if (!portrait || !portrait.src) {
      if (art) art.remove();
      dialog.classList.remove('has-portrait');
      return;
    }
    dialog.classList.add('has-portrait');
    if (!art) {
      art = document.createElement('div');
      art.className = 'idle-event-portrait-wrap';
      const img = document.createElement('img');
      img.alt = '';
      img.className = 'idle-event-portrait';
      art.appendChild(img);
      const kicker = dialog.querySelector('.idle-event-kicker');
      if (kicker && kicker.parentNode === dialog) dialog.insertBefore(art, kicker.nextSibling);
      else dialog.insertBefore(art, dialog.firstChild);
    }
    const img = art.querySelector('img');
    const v = portrait.v != null ? portrait.v : 1;
    img.src = `${portrait.src}?v=${v}`;
    img.className = `idle-event-portrait is-${portrait.id || 'npc'}`;
    if (portrait.position) img.style.objectPosition = portrait.position;
  }

  function renderBadge() {
    if (!els) return;
    const s = window.GameState.state;
    const has = !inLoadGrace() && !!(s.idleEvents && s.idleEvents.pending);
    els.btn.hidden = !has;
    els.btn.classList.toggle('has-event', has);
  }

  function openModal() {
    if (inLoadGrace()) return;
    const s = window.GameState.state;
    const ev = ensureState(s);
    if (!ev.pending) return;
    const event = findEvent(ev.pending.id);
    if (!event) return;
    els.title.textContent = event.name;
    const pres = window.Karma && typeof window.Karma.presentation === 'function' ? window.Karma.presentation(s, event) : { text: event.text, portrait: event.portrait };
    renderPortrait(els.modal, pres && pres.portrait);
    els.text.textContent = (pres && pres.text) || event.text;
    els.result.hidden = true;
    els.result.innerHTML = '';
    els.options.hidden = false;
    els.options.innerHTML = '';
    const e = env();
    event.options.forEach((opt, idx) => {
      const q = scaleQuote(s, event, opt, e);
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
    els.close.textContent = '暂且记下';
    els.modal.classList.add('active');
    els.modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    els.modal.classList.remove('active');
    els.modal.setAttribute('aria-hidden', 'true');
    renderBadge();
  }

  function choose(idx) {
    const s = window.GameState.state;
    const res = settle(s, idx, env(), { makeEquip, grantEquip });
    if (!res.ok) {
      openModal();
      return;
    }
    if (res.karma && res.karma.pendingElite && window.Karma && typeof window.Karma.runEliteBattle === 'function') {
      const fight = window.Karma.runEliteBattle(s, env());
      if (fight && fight.ok) {
        res.resultText = fight.resultText;
        res.reward = Object.assign({}, res.reward || {}, fight.reward || {});
      }
    }
    window.GameState.saveGame();
    if (res.karma && res.karma.first && res.karma.toast) {
      if (window.Karma && typeof window.Karma.markNoticeShown === 'function') window.Karma.markNoticeShown(s);
      if (window.GameState && typeof window.GameState.saveGame === 'function') window.GameState.saveGame();
    }
    const costHtml = resLine(res.cost, '-');
    const rewardHtml = resLine(res.reward, '+');
    const toastHtml = res.karma && res.karma.toast ? `<p class="evt-karma-toast">${res.karma.toast}</p>` : '';
    els.options.hidden = true;
    els.result.hidden = false;
    els.result.innerHTML = `
      ${toastHtml}
      <p class="evt-result-text">${res.resultText}</p>
      ${costHtml ? `<div class="evt-option-line evt-cost">付出 ${costHtml}</div>` : ''}
      ${rewardHtml ? `<div class="evt-option-line evt-reward">获得 ${rewardHtml}</div>` : ''}
      ${res.equipNote ? `<div class="evt-option-line evt-note">${res.equipNote}</div>` : ''}
      ${res.notes.length ? `<div class="evt-option-line evt-note">${res.notes.join('；')}</div>` : ''}
    `;
    els.close.textContent = '知道了';
    renderBadge();
  }

  function tick() {
    const GS = window.GameState;
    if (!GS || !GS.state) return;
    if (inLoadGrace()) {
      renderBadge();
      return;
    }
    const spawned = maybeSpawn(GS.state);
    if (spawned) GS.saveGame();
    renderBadge();
  }

  function init() {
    els = {
      btn: document.getElementById('btn-idle-event'),
      modal: document.getElementById('idle-event-modal'),
      title: document.getElementById('idle-event-title'),
      text: document.getElementById('idle-event-text'),
      options: document.getElementById('idle-event-options'),
      result: document.getElementById('idle-event-result'),
      close: document.getElementById('btn-close-idle-event')
    };
    if (!els.btn || !els.modal || !window.GameState) {
      els = null;
      return;
    }
    loadedAt = Date.now();
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
    tick();
    setInterval(tick, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
