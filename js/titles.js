// 称号：条件、佩戴加成与收藏加成。一夜筑基按「存档创建时间」起算，轮回不重置 createdAt。
(function () {
  const HOUR = 3600 * 1000;
  const DAY = 24 * HOUR;

  function list() {
    return window.GameConfig.TITLES;
  }

  function byId(id) {
    return list().find((t) => t.id === id);
  }

  function localDate(ts) {
    const d = new Date(ts || Date.now());
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }

  function dayDiff(a, b) {
    const [ay, am, ad] = a.split('-').map(Number);
    const [by, bm, bd] = b.split('-').map(Number);
    const ua = Date.UTC(ay, am - 1, ad);
    const ub = Date.UTC(by, bm - 1, bd);
    return Math.round((ub - ua) / DAY);
  }

  function ensure(state) {
    if (!state.titles) state.titles = { owned: [], worn: 'churu', seen: [] };
    state.titles.owned = state.titles.owned || [];
    state.titles.seen = state.titles.seen || [];
    if (!state.titles.worn) state.titles.worn = 'churu';
    if (!state.createdAt) state.createdAt = state.lastSaveTime || Date.now();
    state.playTimeMs = state.playTimeMs || 0;
    state.lifetimeQi = state.lifetimeQi || 0;
    state.failBreakthroughs = state.failBreakthroughs || 0;
    state.peachesPicked = state.peachesPicked || 0;
    state.decomposed = state.decomposed || 0;
    state.flags = Object.assign(
      { ling: false, di: false, weapon: false, offlineCap: false },
      state.flags || {}
    );
    state.login = state.login || { last: '', streak: 0 };
    state.dayTaps = state.dayTaps || { date: '', count: 0 };
    if (state.equip && state.equip.weapon) state.flags.weapon = true;
    const items = [];
    if (state.equip) {
      Object.keys(state.equip).forEach((key) => {
        if (state.equip[key]) items.push(state.equip[key]);
      });
    }
    if (state.pending) items.push(state.pending);
    items.forEach((item) => {
      if (item.q >= 1) state.flags.ling = true;
      if (item.q >= 3) state.flags.di = true;
    });
  }

  function noteLogin(state) {
    ensure(state);
    const today = localDate();
    if (state.login.last === today) return;
    if (state.login.last && dayDiff(state.login.last, today) === 1) state.login.streak += 1;
    else state.login.streak = 1;
    state.login.last = today;
  }

  function noteTap(state) {
    ensure(state);
    const today = localDate();
    if (state.dayTaps.date !== today) {
      state.dayTaps.date = today;
      state.dayTaps.count = 0;
    }
    state.dayTaps.count += 1;
  }

  function meets(state, title) {
    const realm = state.realmIndex || 0;
    switch (title.id) {
      case 'churu':
        return true;
      case 'yinqiruti':
        return realm >= 0;
      case 'tunaxinren':
        return (state.totalClicks || 0) >= 100;
      case 'jingzuo':
        return (state.playTimeMs || 0) >= HOUR;
      case 'qinxiubuchuo':
        return (state.login.streak || 0) >= 3;
      case 'lingqixiaofu':
        return (state.lifetimeQi || 0) >= 100000;
      case 'yiyerzhuji':
        return realm >= 9 && Date.now() - state.createdAt <= DAY;
      case 'lvbailvzhan':
        return (state.failBreakthroughs || 0) >= 3;
      case 'zhaotaoxiaoxian':
        return (state.peachesPicked || 0) >= 50;
      case 'chudelingbao':
        return !!state.flags.ling;
      case 'hongyundangtou':
        return !!state.flags.di;
      case 'suibaokuangren':
        return (state.decomposed || 0) >= 100;
      case 'jianxinchumeng':
        return !!state.flags.weapon;
      case 'biguanbuchu':
        return !!state.flags.offlineCap;
      case 'diandaoshousuan':
        return state.dayTaps.date === localDate() && (state.dayTaps.count || 0) >= 1000;
      default:
        return false;
    }
  }

  function progress(state, title) {
    switch (title.id) {
      case 'tunaxinren':
        return [(state.totalClicks || 0), 100];
      case 'jingzuo':
        return [Math.floor((state.playTimeMs || 0) / 60000), 60];
      case 'qinxiubuchuo':
        return [state.login.streak || 0, 3];
      case 'lingqixiaofu':
        return [Math.floor(state.lifetimeQi || 0), 100000];
      case 'yiyerzhuji': {
        if ((state.realmIndex || 0) >= 9) return [1, 1];
        const left = state.createdAt + DAY - Date.now();
        return left > 0 ? [0, 1] : [-1, 1];
      }
      case 'lvbailvzhan':
        return [state.failBreakthroughs || 0, 3];
      case 'zhaotaoxiaoxian':
        return [state.peachesPicked || 0, 50];
      case 'suibaokuangren':
        return [state.decomposed || 0, 100];
      case 'diandaoshousuan':
        return [state.dayTaps.date === localDate() ? state.dayTaps.count || 0 : 0, 1000];
      default:
        return meets(state, title) ? [1, 1] : [0, 1];
    }
  }

  function progressText(state, title) {
    const [cur, max] = progress(state, title);
    if (title.id === 'yiyerzhuji' && cur < 0) return '已错过';
    if (max === 1) return cur >= 1 ? '已达成' : '未达成';
    return `${Math.min(cur, max)}/${max}`;
  }

  let fresh = [];

  function sync(state) {
    const s = state || window.GameState.state;
    ensure(s);
    const owned = new Set(s.titles.owned);
    const unlocked = [];
    list().forEach((title) => {
      if (owned.has(title.id)) return;
      if (!meets(s, title)) return;
      owned.add(title.id);
      unlocked.push(title);
    });
    s.titles.owned = list().filter((t) => owned.has(t.id)).map((t) => t.id);
    if (!s.titles.owned.includes(s.titles.worn)) s.titles.worn = 'churu';
    fresh = fresh.concat(unlocked);
    return unlocked;
  }

  function consumeFresh() {
    const out = fresh;
    fresh = [];
    return out;
  }

  function wornTitle(state) {
    ensure(state);
    return byId(state.titles.worn) || byId('churu');
  }

  function factor(state, stat) {
    ensure(state);
    const worn = wornTitle(state);
    if (!worn || worn.stat !== stat) return 1;
    return 1 + worn.value;
  }

  function addend(state, stat) {
    ensure(state);
    const worn = wornTitle(state);
    if (!worn || worn.stat !== stat) return 0;
    return worn.value;
  }

  function qiFactor(state) {
    ensure(state);
    const worn = wornTitle(state);
    const wornQi = worn && worn.stat === 'qi' ? worn.value : 0;
    const collection = state.titles.owned.length * window.GameConfig.TITLE_COLLECTION_QI;
    return 1 + wornQi + collection;
  }

  function jadeValue(state, item) {
    return Math.max(1, Math.round(window.Equip.decomposeValue(item) * factor(state, 'jade')));
  }

  function peachIntervalMs(state) {
    return window.GameConfig.PEACH.INTERVAL_MS / factor(state, 'peach');
  }

  function unseen(state) {
    ensure(state);
    return state.titles.owned.some((id) => !state.titles.seen.includes(id));
  }

  function markSeen(state) {
    ensure(state);
    state.titles.seen = state.titles.owned.slice();
  }

  function wear(state, id) {
    ensure(state);
    if (!state.titles.owned.includes(id)) return false;
    state.titles.worn = id;
    return true;
  }

  window.Titles = {
    ensure,
    noteLogin,
    noteTap,
    sync,
    consumeFresh,
    wornTitle,
    factor,
    addend,
    qiFactor,
    jadeValue,
    peachIntervalMs,
    unseen,
    markSeen,
    wear,
    progressText,
    byId,
    localDate
  };
})();

(function () {
  const $ = (id) => document.getElementById(id);
  let toastTimer = 0;

  function paintPlate() {
    const s = window.GameState.state;
    window.Titles.ensure(s);
    const worn = window.Titles.wornTitle(s);
    const plate = $('title-plate');
    const name = $('title-plate-name');
    if (name) name.textContent = worn.name;
    if (plate) plate.dataset.tier = worn.tier;
    const badge = $('title-plate-badge');
    if (badge) badge.classList.toggle('visible', window.Titles.unseen(s));
  }

  function showToast(title) {
    const el = $('title-toast');
    if (!el) return;
    el.textContent = `获得称号「${title.name}」`;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1700);
  }

  function flushToasts() {
    const fresh = window.Titles.consumeFresh();
    fresh.forEach((title, i) => {
      setTimeout(() => showToast(title), i * 1800);
    });
    paintPlate();
    if ($('title-modal') && $('title-modal').classList.contains('active')) renderList();
  }

  function renderList() {
    const s = window.GameState.state;
    window.Titles.ensure(s);
    const box = $('title-list');
    if (!box) return;
    const owned = new Set(s.titles.owned);
    const groups = [];
    window.GameConfig.TITLES.forEach((title) => {
      if (!groups.length || groups[groups.length - 1].cat !== title.cat) {
        groups.push({ cat: title.cat, items: [] });
      }
      groups[groups.length - 1].items.push(title);
    });
    const n = s.titles.owned.length;
    const pct = (n * window.GameConfig.TITLE_COLLECTION_QI * 100).toFixed(1);
    $('title-summary').textContent = `已收集 ${n}/${window.GameConfig.TITLES.length} · 收藏灵气 +${pct}%`;
    box.innerHTML = groups
      .map((group) => {
        const rows = group.items
          .map((title) => {
            const have = owned.has(title.id);
            const worn = s.titles.worn === title.id;
            const prog = have ? '已获得' : window.Titles.progressText(s, title);
            return `<div class="title-row${have ? '' : ' locked'}${worn ? ' worn' : ''}">
              <div>
                <div class="title-row-name" style="color:${tierColor(title.tier)}">${title.name}${worn ? ' · 佩戴中' : ''}</div>
                <div class="title-row-meta">${title.bonus} · ${title.cond} · ${prog}</div>
              </div>
              ${have && !worn ? `<button class="btn" type="button" data-wear="${title.id}">佩戴</button>` : ''}
            </div>`;
          })
          .join('');
        return `<div class="title-group-name">${group.cat}</div>${rows}`;
      })
      .join('');
  }

  function tierColor(tier) {
    return { intro: '#f4efe4', cultivate: '#9ee7c2', peach: '#f5c76a', egg: '#f3a6c8' }[tier] || '#f4efe4';
  }

  function open() {
    const s = window.GameState.state;
    window.Titles.markSeen(s);
    window.GameState.saveGame();
    renderList();
    $('title-modal').classList.add('active');
    paintPlate();
  }

  function init() {
    const plate = $('title-plate');
    if (plate) {
      plate.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
      });
      plate.addEventListener('click', (e) => {
        e.stopPropagation();
        open();
      });
    }
    const list = $('title-list');
    if (list) {
      list.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-wear]');
        if (!btn) return;
        window.Titles.wear(window.GameState.state, btn.getAttribute('data-wear'));
        window.GameState.saveGame();
        renderList();
        paintPlate();
      });
    }
    const close = $('btn-close-titles');
    if (close) close.addEventListener('click', () => $('title-modal').classList.remove('active'));
    window.Titles.noteLogin(window.GameState.state);
    window.Titles.sync(window.GameState.state);
    paintPlate();
    flushToasts();
  }

  window.TitlesUI = { init, paintPlate, flushToasts, open };
})();
