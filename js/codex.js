// 图鉴：只读的世界观条目（境界/地域/势力/纪元/角色）与「妖魔」页（Boss + 普通敌人）。
// - 解锁全部由存档推导：realmIndex（含历史最高）、到达章节、首通关卡、已获得角色。
// - 存档只多一个 state.codex = { v, maxRealm }，用于转世后不重新上锁；旧档缺省时安全推导。
// - Boss 战开场显示一句台词（非阻塞横幅），图鉴里显示 desc + 台词。
// - 页签通过 registerTab 扩展，后续「万妖图鉴」（收集加成）可在妖魔页上叠加，不改条目数据。
(function () {
  const BOSS_EVERY = 10;
  const MAX_STAGE = 300;

  function data() {
    return window.CodexData || { categories: [], entries: [], bossLore: {}, mobLore: {} };
  }
  function cfg() {
    return window.GameConfig || {};
  }
  function battleCfg() {
    return cfg().BATTLE || { BOSSES: [], REGIONS: [] };
  }

  function ensureState(s) {
    let c = s.codex;
    if (!c || typeof c !== 'object' || Array.isArray(c)) c = {};
    const out = { v: 1, maxRealm: Math.max(0, Math.floor(Number(c.maxRealm) || 0)) };
    if (s.codex && typeof s.codex === 'object' && !Array.isArray(s.codex)) {
      Object.assign(s.codex, out);
      return s.codex;
    }
    s.codex = out;
    return out;
  }

  // 由存档推导的进度快照
  function progress(s) {
    const st = s.stage || {};
    const minRe = Number(cfg().REINCARNATION_MIN_STAGE) || 27;
    const c = ensureState(s);
    const realm = Math.max(Number(s.realmIndex) || 0, c.maxRealm, (Number(s.reincarnationCount) || 0) > 0 ? minRe : 0);
    const cleared = Math.max(Number(st.best) || 0, Number(s.lifeBestStage) || 0);
    const reached = Math.min(MAX_STAGE, Math.max(Number(st.cur) || 1, cleared + 1));
    return { realm, cleared, reached, chapter: Math.ceil(reached / BOSS_EVERY) };
  }

  function heroOwned(s, heroId) {
    const hero = (cfg().HEROES || []).find((h) => h && h.id === heroId);
    if (!hero || hero.locked) return false;
    if (Array.isArray(s.lockedHeroes) && s.lockedHeroes.includes(heroId)) return false;
    if (Array.isArray(s.unlockedHeroes)) return s.unlockedHeroes.includes(heroId);
    return true;
  }

  function isUnlocked(s, entry, prog) {
    const h = entry && entry.unlockHint;
    if (!h) return true;
    const p = prog || progress(s);
    switch (h.type) {
      case 'realmIndex':
        return p.realm >= (Number(h.realmIndex) || 0);
      case 'chapter':
        return p.chapter >= (Number(h.chapter) || 1);
      case 'stage':
        return p.cleared >= (Number(h.stage) || 1);
      case 'heroId':
        return heroOwned(s, h.heroId);
      default:
        return false;
    }
  }

  // 去掉给开发看的括注，如「（realmIndex 27）」「（heroId saintess）」
  function hintText(entry) {
    const h = (entry && entry.unlockHint) || {};
    return String(h.label || '').replace(/（\s*(realmIndex|heroId|stage|chapter)[^）]*）/g, '').trim();
  }

  function bossImgUrl(raw) {
    if (!raw) return 'assets/enemies/placeholder.webp?v=18';
    if (raw.includes('/')) return raw.includes('?') ? raw : `${raw}?v=18`;
    return `assets/enemies/${raw.endsWith('.webp') ? raw : `${raw}.webp`}?v=18`;
  }

  function bossList(s) {
    const p = progress(s);
    const lore = data().bossLore || {};
    return (battleCfg().BOSSES || []).map((b, i) => {
      const stageNum = (i + 1) * BOSS_EVERY;
      const name = b && typeof b === 'object' ? b.name : String(b);
      const l = lore[name] || {};
      return {
        id: `boss_${i + 1}`,
        name,
        chapter: i + 1,
        stage: stageNum,
        img: bossImgUrl(b && b.img),
        desc: l.desc || '',
        quote: l.quote || '',
        reached: p.reached >= stageNum,
        defeated: p.cleared >= stageNum
      };
    });
  }

  function mobList(s) {
    const p = progress(s);
    const lore = data().mobLore || {};
    const out = [];
    (battleCfg().REGIONS || []).forEach((r) => {
      const first = (r.chapters && r.chapters[0]) || 1;
      (r.mobs || []).forEach((m) => {
        const name = m && typeof m === 'object' ? m.name : String(m);
        out.push({ name, region: r.name, desc: lore[name] || '', unlocked: p.chapter >= first });
      });
    });
    return out;
  }

  function bossLore(name) {
    return (data().bossLore || {})[name] || null;
  }

  // ---------- 页签注册（可扩展） ----------
  const tabs = [];
  function registerTab(tab) {
    if (!tab || !tab.id || tabs.some((t) => t.id === tab.id)) return;
    tabs.push(tab);
  }
  (data().categories || []).forEach((c) => {
    registerTab({ id: c.id, name: c.name, kind: 'entries' });
  });
  registerTab({ id: 'bestiary', name: '妖魔', kind: 'bestiary' });

  function entriesFor(catId) {
    return (data().entries || []).filter((e) => e.category === catId);
  }

  const core = { ensureState, progress, isUnlocked, hintText, heroOwned, bossList, mobList, bossLore, bossImgUrl, registerTab, tabs, entriesFor };
  window.Codex = core;

  // ===================== 界面 =====================
  if (typeof document === 'undefined' || !document.getElementById) return;

  let els = null;
  let activeTab = '';
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  function tabCount(s, tab, prog) {
    if (tab.kind === 'bestiary') {
      const list = bossList(s);
      return `${list.filter((b) => b.reached).length}/${list.length}`;
    }
    const list = entriesFor(tab.id);
    return `${list.filter((e) => isUnlocked(s, e, prog)).length}/${list.length}`;
  }

  function renderTabs(s, prog) {
    els.tabs.innerHTML = tabs
      .map((t) => `<button type="button" class="codex-tab${t.id === activeTab ? ' is-active' : ''}" data-codex-tab="${esc(t.id)}" role="tab" aria-selected="${t.id === activeTab}">${esc(t.name)}<span class="codex-tab-count">${tabCount(s, t, prog)}</span></button>`)
      .join('');
  }

  function renderEntries(s, catId, prog) {
    return entriesFor(catId)
      .map((e) => {
        if (!isUnlocked(s, e, prog)) {
          return `<div class="codex-entry is-locked"><div class="codex-entry-title">？？？</div><div class="codex-entry-hint">${esc(hintText(e))}</div></div>`;
        }
        return `<details class="codex-entry"><summary><span class="codex-entry-title">${esc(e.title)}</span><span class="codex-entry-sub">${esc(e.subtitle)}</span></summary><p class="codex-entry-body">${esc(e.body)}</p></details>`;
      })
      .join('');
  }

  function renderBestiary(s) {
    const bosses = bossList(s)
      .map((b) => {
        if (!b.reached) {
          return `<div class="codex-boss is-locked"><div class="codex-boss-thumb is-locked" aria-hidden="true"></div><div class="codex-boss-meta"><div class="codex-entry-title">？？？</div><div class="codex-entry-hint">到达第${b.chapter}章第${b.stage}关</div></div></div>`;
        }
        return `<details class="codex-boss"><summary><img class="codex-boss-thumb" src="${esc(b.img)}" alt="" loading="lazy"><span class="codex-boss-meta"><span class="codex-entry-title">${esc(b.name)}</span><span class="codex-boss-tag${b.defeated ? ' is-done' : ''}">第${b.chapter}章 · ${b.defeated ? '已击败' : '未击败'}</span>${b.quote ? `<span class="codex-boss-quote">「${esc(b.quote.replace(/^「|」$/g, ''))}」</span>` : ''}</span></summary><p class="codex-entry-body">${esc(b.desc)}</p></details>`;
      })
      .join('');
    let region = '';
    const mobs = mobList(s)
      .map((m) => {
        const head = m.region !== region ? `<div class="codex-mob-region">${esc((region = m.region))}</div>` : '';
        return head + (m.unlocked
          ? `<div class="codex-mob"><span class="codex-mob-name">${esc(m.name)}</span><span class="codex-mob-desc">${esc(m.desc)}</span></div>`
          : `<div class="codex-mob is-locked"><span class="codex-mob-name">？？？</span><span class="codex-mob-desc">进入${esc(m.region)}后可见</span></div>`);
      })
      .join('');
    return `<div class="codex-section-title">首领</div>${bosses}<div class="codex-section-title">妖物</div>${mobs}`;
  }

  function render() {
    if (!els) return;
    const s = window.GameState.state;
    const prog = progress(s);
    if (!tabs.some((t) => t.id === activeTab)) activeTab = tabs[0] ? tabs[0].id : '';
    renderTabs(s, prog);
    const tab = tabs.find((t) => t.id === activeTab);
    els.list.innerHTML = !tab ? '' : tab.kind === 'bestiary' ? renderBestiary(s) : (typeof tab.render === 'function' ? tab.render(s) : renderEntries(s, tab.id, prog));
  }

  function syncMaxRealm() {
    const GS = window.GameState;
    if (!GS || !GS.state) return;
    const c = ensureState(GS.state);
    const r = Number(GS.state.realmIndex) || 0;
    if (r > c.maxRealm) c.maxRealm = r;
  }

  function open() {
    if (!els) return;
    syncMaxRealm();
    render();
    els.list.scrollTop = 0;
    els.modal.classList.add('active');
    els.modal.setAttribute('aria-hidden', 'false');
  }

  function close() {
    if (!els) return;
    els.modal.classList.remove('active');
    els.modal.setAttribute('aria-hidden', 'true');
  }

  // Boss 战开场台词：战场顶部一行淡入淡出，不拦截点击
  let quoteTimer = 0;
  function showBossQuote(enemy) {
    const box = document.getElementById('battle-stage');
    const l = enemy && bossLore(enemy.name);
    if (!box || !l || !l.quote) return;
    let el = document.getElementById('boss-quote-banner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'boss-quote-banner';
      el.className = 'boss-quote-banner';
      el.setAttribute('aria-live', 'polite');
      box.appendChild(el);
    }
    el.innerHTML = `<span class="boss-quote-name">${esc(enemy.name)}</span><span class="boss-quote-text">「${esc(l.quote)}」</span>`;
    el.classList.remove('is-show');
    void el.offsetWidth;
    el.classList.add('is-show');
    clearTimeout(quoteTimer);
    quoteTimer = setTimeout(() => el.classList.remove('is-show'), 2800);
  }
  core.showBossQuote = showBossQuote;
  core.open = open;
  core.close = close;

  function init() {
    els = {
      btn: document.getElementById('btn-open-codex'),
      modal: document.getElementById('codex-modal'),
      tabs: document.getElementById('codex-tabs'),
      list: document.getElementById('codex-list'),
      close: document.getElementById('btn-close-codex')
    };
    if (!els.btn || !els.modal || !window.GameState) {
      els = null;
      return;
    }
    els.btn.addEventListener('click', () => {
      const settings = document.getElementById('settings-modal');
      if (settings) settings.classList.remove('active');
      open();
    });
    els.close.addEventListener('click', close);
    els.modal.addEventListener('click', (e) => {
      if (e.target === els.modal) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && els.modal.classList.contains('active')) close();
    });
    els.tabs.addEventListener('click', (e) => {
      const b = e.target.closest('[data-codex-tab]');
      if (!b) return;
      activeTab = b.dataset.codexTab;
      render();
      els.list.scrollTop = 0;
    });
    syncMaxRealm();
    setInterval(syncMaxRealm, 5000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
