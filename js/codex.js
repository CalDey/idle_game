// 图鉴：世界观条目 +「妖魔」页收集（击杀计数、精通阶、薄奖与小幅永久加成）。
// - 条目文案仍来自 CodexData；敌人显示名始终读自 GameConfig（改名补丁只需改配置）。
// - 存档 state.codex = { v, maxRealm, kills, seen, claimed }；旧档缺省安全迁移；轮回深拷贝保留。
// - 未遭遇为剪影（复用已有立绘，CSS 压暗），首次遭遇后现形；击杀达门槛可领取一次奖励。
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

  const CODEX_VERSION = 2;
  const TIERS = [1, 10, 50, 200];
  const BONUS_PER_TIER = 0.0005; // 每阶 +0.05% 攻/血/防
  const BONUS_CAP = 0.05; // 总加成不超过 +5%
  const PEACH_CAP = 3;
  const JADE_CAP_HOURS = 0.5;
  const JADE_CAP_MIN = 3;
  const QI_STONE_CAP_MINUTES = 6;
  const TIER_REWARDS = {
    1: { qiMin: 1, stoneMin: 1, jade: 1, peach: 0 },
    10: { qiMin: 2, stoneMin: 2, jade: 1, peach: 1 },
    50: { qiMin: 3, stoneMin: 3, jade: 2, peach: 1 },
    200: { qiMin: 4, stoneMin: 4, jade: 3, peach: 2 }
  };

  function emptyCodex() {
    return { v: CODEX_VERSION, maxRealm: 0, kills: {}, seen: {}, claimed: {} };
  }

  function normalizeCounts(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    Object.keys(raw).forEach((k) => {
      if (typeof k !== 'string' || !k) return;
      const n = Math.max(0, Math.floor(Number(raw[k]) || 0));
      if (n > 0) out[k] = n;
    });
    return out;
  }

  function normalizeFlags(raw, kills) {
    const out = {};
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      Object.keys(raw).forEach((k) => {
        if (typeof k === 'string' && k && raw[k]) out[k] = 1;
      });
    }
    Object.keys(kills || {}).forEach((k) => {
      if ((kills[k] || 0) > 0) out[k] = 1;
    });
    return out;
  }

  function normalizeClaimed(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    Object.keys(raw).forEach((k) => {
      if (typeof k !== 'string' || !k) return;
      const n = Math.max(0, Math.floor(Number(raw[k]) || 0));
      const tier = TIERS.filter((t) => t <= n).pop() || 0;
      if (tier) out[k] = tier;
    });
    return out;
  }

  function normalize(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const kills = normalizeCounts(src.kills);
    return {
      v: CODEX_VERSION,
      maxRealm: Math.max(0, Math.floor(Number(src.maxRealm) || 0)),
      kills,
      seen: normalizeFlags(src.seen, kills),
      claimed: normalizeClaimed(src.claimed)
    };
  }

  function ensureState(s) {
    if (!s || typeof s !== 'object') return emptyCodex();
    const out = normalize(s.codex);
    if (s.codex && typeof s.codex === 'object' && !Array.isArray(s.codex)) {
      Object.keys(s.codex).forEach((k) => {
        if (!(k in out)) delete s.codex[k];
      });
      Object.assign(s.codex, out);
      return s.codex;
    }
    s.codex = out;
    return out;
  }

  function stripElite(name) {
    return String(name || '').replace(/^精英·/, '').trim();
  }

  function regionNameForChapter(chapter) {
    const regs = battleCfg().REGIONS || [];
    const idx = Math.min(regs.length - 1, Math.max(0, Math.floor((Math.max(1, chapter) - 1) / 5)));
    return (regs[idx] && regs[idx].name) || '';
  }

  function catalog() {
    const B = battleCfg();
    const lore = data();
    const bossLore = lore.bossLore || {};
    const mobLore = lore.mobLore || {};
    const list = [];
    (B.BOSSES || []).forEach((b, i) => {
      if (!b) return;
      const name = typeof b === 'object' ? b.name : String(b);
      const id = 'boss_' + ((typeof b === 'object' && b.id) || String(i + 1));
      const l = bossLore[name] || {};
      list.push({
        id,
        kind: 'boss',
        name,
        img: bossImgUrl(typeof b === 'object' ? b.img : ''),
        region: regionNameForChapter(i + 1),
        chapter: i + 1,
        stage: (i + 1) * BOSS_EVERY,
        desc: l.desc || '',
        quote: l.quote || ''
      });
    });
    (B.REGIONS || []).forEach((r, ri) => {
      (r && r.mobs ? r.mobs : []).forEach((m, mi) => {
        if (!m) return;
        const name = typeof m === 'object' ? m.name : String(m);
        const mid = (typeof m === 'object' && m.id) ? String(m.id) : String(mi);
        const id = mid.indexOf('mob_') === 0 ? mid : 'mob_' + mid;
        list.push({
          id,
          kind: 'mob',
          name,
          img: bossImgUrl(typeof m === 'object' ? m.img : ''),
          region: r.name || '',
          chapter: (r.chapters && r.chapters[0]) || 1,
          desc: mobLore[name] || '',
          quote: ''
        });
      });
    });
    return list;
  }

  let _catCache = null;
  let _catSrc = null;
  function cachedCatalog() {
    const src = battleCfg();
    if (_catCache && _catSrc === src) return _catCache;
    _catCache = catalog();
    _catSrc = src;
    return _catCache;
  }

  function entryById(id) {
    return cachedCatalog().find((e) => e.id === id) || null;
  }

  function resolveId(unitOrEnemy) {
    if (!unitOrEnemy) return '';
    if (unitOrEnemy.bestiaryId && entryById(unitOrEnemy.bestiaryId)) return unitOrEnemy.bestiaryId;
    const name = stripElite(unitOrEnemy.name);
    if (!name) return '';
    const list = cachedCatalog();
    const wantBoss = Boolean(unitOrEnemy.isBoss);
    const hit = list.find((e) => e.name === name && (wantBoss ? e.kind === 'boss' : e.kind === 'mob'))
      || list.find((e) => e.name === name);
    return hit ? hit.id : '';
  }

  function reachedTiers(kills) {
    const n = Math.max(0, Math.floor(Number(kills) || 0));
    return TIERS.filter((t) => n >= t);
  }

  function nextTier(kills) {
    const n = Math.max(0, Math.floor(Number(kills) || 0));
    return TIERS.find((t) => n < t) || 0;
  }

  function totalReachedTiers(s) {
    const c = ensureState(s);
    let n = 0;
    cachedCatalog().forEach((e) => {
      n += reachedTiers(c.kills[e.id] || 0).length;
    });
    return n;
  }

  function bonusRate(s) {
    return Math.min(BONUS_CAP, totalReachedTiers(s) * BONUS_PER_TIER);
  }

  function decoratePlayerStats(s, stats) {
    if (!stats || stats._bestiaryMult) return stats;
    const rate = bonusRate(s);
    const m = 1 + rate;
    stats._bestiaryMult = m;
    stats._bestiaryBonus = rate;
    if (!(rate > 0)) return stats;
    stats.atk = (Number(stats.atk) || 0) * m;
    stats.hp = (Number(stats.hp) || 0) * m;
    stats.def = (Number(stats.def) || 0) * m;
    const crit = stats.crit != null ? stats.crit : 0.05;
    const cd = stats.critDmg || stats.cd || 1.5;
    stats.cp = (stats.atk * 10 + stats.hp + stats.def * 8 + (Number(stats.spd) || 0) * 2) * (1 + crit * (cd - 1));
    return stats;
  }

  function noteSeen(s, units) {
    const c = ensureState(s);
    const list = Array.isArray(units) ? units : units ? [units] : [];
    list.forEach((u) => {
      if (!u || (u.side && u.side !== 'enemy')) return;
      const id = resolveId(u);
      if (id) c.seen[id] = 1;
    });
    return c;
  }

  function noteKills(s, units, allDead) {
    const c = ensureState(s);
    const list = Array.isArray(units) ? units : units ? [units] : [];
    list.forEach((u) => {
      if (!u || (u.side && u.side !== 'enemy')) return;
      const dead = allDead || u.alive === false || (Number(u.hp) || 0) <= 0;
      const id = resolveId(u);
      if (!id) return;
      c.seen[id] = 1;
      if (dead) c.kills[id] = (c.kills[id] || 0) + 1;
    });
    return c;
  }

  function noteBattle(s, session) {
    if (!s) return null;
    const units = (session && session.enemyUnits) || [];
    noteSeen(s, units);
    noteKills(s, units, Boolean(session && session.win));
    return ensureState(s);
  }

  function claimableTiersFor(s, id) {
    const c = ensureState(s);
    const have = reachedTiers(c.kills[id] || 0);
    const claimed = Number(c.claimed[id]) || 0;
    return have.filter((t) => t > claimed);
  }

  function claimableCount(s) {
    return cachedCatalog().reduce((n, e) => n + claimableTiersFor(s, e.id).length, 0);
  }

  function jadeCapFor(s) {
    const best = (s && s.stage && Number(s.stage.best)) || 0;
    return Math.max(JADE_CAP_MIN, Math.ceil((6 + 0.4 * best) * JADE_CAP_HOURS));
  }

  function scaleTierReward(s, tier, env) {
    const spec = TIER_REWARDS[tier] || { qiMin: 0, stoneMin: 0, jade: 0, peach: 0 };
    const e = env || {};
    const qiPer = Math.max(0, Number(e.qiPerSec) || 0);
    const stPer = Math.max(0, Number(e.stonePerSec) || 0);
    const reward = {};
    if (spec.qiMin > 0) {
      const n = Math.round(qiPer * 60 * Math.min(QI_STONE_CAP_MINUTES, spec.qiMin));
      if (n > 0) reward.qi = n;
    }
    if (spec.stoneMin > 0) {
      const n = Math.round(stPer * 60 * Math.min(QI_STONE_CAP_MINUTES, spec.stoneMin));
      if (n > 0) reward.stone = n;
    }
    if (spec.jade > 0) reward.jade = Math.max(1, Math.min(Math.round(spec.jade), jadeCapFor(s)));
    if (spec.peach > 0) reward.peach = Math.max(1, Math.min(Math.round(spec.peach), PEACH_CAP));
    return reward;
  }

  function grantReward(s, reward) {
    const rw = reward || {};
    if (rw.qi) {
      s.qi = (Number(s.qi) || 0) + rw.qi;
      s.lifetimeQi = (Number(s.lifetimeQi) || 0) + rw.qi;
    }
    if (rw.stone) s.stones = (Number(s.stones) || 0) + rw.stone;
    if (rw.jade) s.lingyu = (Number(s.lingyu) || 0) + rw.jade;
    if (rw.peach) {
      const GS = window.GameState;
      if (GS && typeof GS.addPeachesTo === 'function') {
        GS.addPeachesTo(s, rw.peach);
      } else if (GS && typeof GS.addPeaches === 'function' && GS.state === s) {
        GS.addPeaches(rw.peach);
      } else {
        if (!s.tree || typeof s.tree !== 'object') s.tree = {};
        const want = Math.max(0, Math.floor(Number(rw.peach) || 0));
        const capFn = window.GameConfig && typeof window.GameConfig.peachCap === 'function'
          ? window.GameConfig.peachCap
          : null;
        const cap = capFn ? capFn(s.tree.lv || 1) : Infinity;
        const current = Number(s.tree.peaches) || 0;
        const granted = current >= cap ? 0 : Math.min(want, cap - current);
        s.tree.peaches = current + granted;
      }
    }
    return rw;
  }

  function claimNext(s, id, env) {
    const c = ensureState(s);
    const pending = claimableTiersFor(s, id);
    if (!pending.length) return { ok: false, reason: 'none' };
    const tier = pending[0];
    const reward = grantReward(s, scaleTierReward(s, tier, env));
    c.claimed[id] = tier;
    return { ok: true, id, tier, reward };
  }

  function claimAll(s, env) {
    const got = [];
    cachedCatalog().forEach((e) => {
      while (true) {
        const res = claimNext(s, e.id, env);
        if (!res.ok) break;
        got.push(res);
      }
    });
    return { ok: got.length > 0, claims: got };
  }

  function collectionProgress(s) {
    const c = ensureState(s);
    const list = cachedCatalog();
    let seen = 0;
    let tiers = 0;
    list.forEach((e) => {
      if (c.seen[e.id]) seen += 1;
      tiers += reachedTiers(c.kills[e.id] || 0).length;
    });
    return { seen, total: list.length, tiers, maxTiers: list.length * TIERS.length, bonus: bonusRate(s), claimable: claimableCount(s) };
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

  // 突破成功时立刻记下历史最高境界，不依赖打开图鉴。
  function syncMaxRealm(s) {
    const st = s || (typeof window !== 'undefined' && window.GameState && window.GameState.state);
    if (!st) return null;
    const c = ensureState(st);
    const r = Math.max(0, Math.floor(Number(st.realmIndex) || 0));
    if (r > c.maxRealm) c.maxRealm = r;
    return c;
  }

  const core = { ensureState, normalize, progress, isUnlocked, hintText, heroOwned, bossList, mobList, bossLore, bossImgUrl, registerTab, tabs, entriesFor, syncMaxRealm, catalog: cachedCatalog, entryById, resolveId, noteSeen, noteKills, noteBattle, bonusRate, decoratePlayerStats, claimNext, claimAll, claimableCount, claimableTiersFor, collectionProgress, scaleTierReward, reachedTiers, nextTier, totalReachedTiers, TIERS, BONUS_PER_TIER, BONUS_CAP, TIER_REWARDS, PEACH_CAP, QI_STONE_CAP_MINUTES, JADE_CAP_MIN, CODEX_VERSION };
  window.Codex = core;

  // ===================== 界面 =====================
  if (typeof document === 'undefined' || !document.getElementById) return;

  let els = null;
  let activeTab = '';
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  function tabCount(s, tab, prog) {
    if (tab.kind === 'bestiary') {
      const col = collectionProgress(s);
      return `${col.seen}/${col.total}`;
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
    const c = ensureState(s);
    const col = collectionProgress(s);
    const pct = (col.bonus * 100).toFixed(2).replace(/\.?0+$/, '');
    const head = `<div class="codex-bestiary-head"><div class="codex-bestiary-progress">收集 ${col.seen}/${col.total} · 精通 ${col.tiers}/${col.maxTiers} · 属性 +${pct}%</div><button type="button" class="btn btn-primary codex-claim-all" data-codex-claim-all ${col.claimable ? '' : 'disabled'}>${col.claimable ? `领取 ${col.claimable} 项` : '暂无可领'}</button></div>`;

    function tierMarks(id, kills) {
      const claimed = Number(c.claimed[id]) || 0;
      return TIERS.map((tier) => {
        let cls = 'codex-tier';
        if (kills >= tier && claimed >= tier) cls += ' is-claimed';
        else if (kills >= tier) cls += ' is-ready';
        return `<span class="${cls}" title="${tier}击">${tier}</span>`;
      }).join('');
    }

    function claimBtn(id) {
      const n = claimableTiersFor(s, id).length;
      if (!n) return '';
      return `<button type="button" class="btn codex-claim-btn" data-codex-claim="${esc(id)}">领取</button>`;
    }

    const bosses = cachedCatalog().filter((e) => e.kind === 'boss').map((e) => {
      const seen = Boolean(c.seen[e.id]);
      const kills = c.kills[e.id] || 0;
      const thumbCls = 'codex-boss-thumb' + (seen ? '' : ' is-unseen');
      if (!seen) {
        return `<div class="codex-boss is-locked is-unseen"><img class="${thumbCls}" src="${esc(e.img)}" alt="" loading="lazy" width="44" height="58"><div class="codex-boss-meta"><div class="codex-entry-title">？？？</div><div class="codex-entry-hint">遭遇后现形</div></div></div>`;
      }
      return `<details class="codex-boss is-seen"><summary><img class="codex-boss-thumb" src="${esc(e.img)}" alt="" loading="lazy" width="44" height="58"><span class="codex-boss-meta"><span class="codex-entry-title">${esc(e.name)}</span><span class="codex-boss-tag${kills > 0 ? ' is-done' : ''}">击破 ${kills} · 第${e.chapter}章</span>${e.quote ? `<span class="codex-boss-quote">「${esc(String(e.quote).replace(/^「|」$/g, ''))}」</span>` : ''}<span class="codex-tiers">${tierMarks(e.id, kills)}</span>${claimBtn(e.id)}</span></summary><p class="codex-entry-body">${esc(e.desc)}</p></details>`;
    }).join('');

    let region = '';
    const mobs = cachedCatalog().filter((e) => e.kind === 'mob').map((e) => {
      const seen = Boolean(c.seen[e.id]);
      const kills = c.kills[e.id] || 0;
      const headR = e.region !== region ? `<div class="codex-mob-region">${esc((region = e.region))}</div>` : '';
      const thumbCls = 'codex-boss-thumb codex-mob-thumb' + (seen ? '' : ' is-unseen');
      if (!seen) {
        return headR + `<div class="codex-mob is-locked is-unseen"><img class="${thumbCls}" src="${esc(e.img)}" alt="" loading="lazy" width="44" height="58"><div class="codex-mob-main"><span class="codex-mob-name">？？？</span><span class="codex-mob-desc">遭遇后现形</span></div></div>`;
      }
      return headR + `<div class="codex-mob is-seen"><img class="codex-boss-thumb codex-mob-thumb" src="${esc(e.img)}" alt="" loading="lazy" width="44" height="58"><div class="codex-mob-main"><span class="codex-mob-name">${esc(e.name)}</span><span class="codex-mob-desc">${esc(e.desc)}</span><span class="codex-mob-kills">击破 ${kills}</span><span class="codex-tiers">${tierMarks(e.id, kills)}</span>${claimBtn(e.id)}</div></div>`;
    }).join('');

    return `${head}<div class="codex-section-title">首领</div>${bosses}<div class="codex-section-title">妖物</div>${mobs}`;
  }

  function renderBadge() {
    const badge = document.getElementById('badge-codex');
    const btn = els && els.btn;
    const GS = window.GameState;
    const on = !!(GS && GS.state && claimableCount(GS.state) > 0);
    if (badge) badge.classList.toggle('visible', on);
    if (btn) btn.classList.toggle('has-claim', on);
  }

  function syncTabsFade() {
    const bar = els && els.tabs;
    const wrap = els && els.tabsWrap;
    if (!bar || !wrap) return;
    const sl = bar.scrollLeft;
    const max = Math.max(0, bar.scrollWidth - bar.clientWidth);
    wrap.classList.toggle('is-fade-left', sl > 2);
    wrap.classList.toggle('is-fade-right', max - sl > 2);
  }

  function render() {
    if (!els) return;
    const s = window.GameState.state;
    const prog = progress(s);
    if (!tabs.some((t) => t.id === activeTab)) activeTab = tabs[0] ? tabs[0].id : '';
    renderTabs(s, prog);
    const tab = tabs.find((t) => t.id === activeTab);
    els.list.innerHTML = !tab ? '' : tab.kind === 'bestiary' ? renderBestiary(s) : (typeof tab.render === 'function' ? tab.render(s) : renderEntries(s, tab.id, prog));
    renderBadge();
    syncTabsFade();
  }

  function open() {
    if (!els) return;
    syncMaxRealm();
    render();
    els.list.scrollTop = 0;
    els.modal.classList.add('active');
    els.modal.setAttribute('aria-hidden', 'false');
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(syncTabsFade);
    } else {
      syncTabsFade();
    }
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

  core.renderBadge = renderBadge;

  function init() {
    els = {
      btn: document.getElementById('btn-open-codex'),
      modal: document.getElementById('codex-modal'),
      tabsWrap: document.getElementById('codex-tabs-wrap'),
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
    els.tabs.addEventListener('scroll', syncTabsFade, { passive: true });
    if (typeof window !== 'undefined') window.addEventListener('resize', syncTabsFade);
    els.list.addEventListener('click', (e) => {
      const all = e.target.closest('[data-codex-claim-all]');
      const one = e.target.closest('[data-codex-claim]');
      if (!all && !one) return;
      e.preventDefault();
      e.stopPropagation();
      const GS = window.GameState;
      if (!GS || !GS.state) return;
      const env = {
        qiPerSec: typeof GS.getQiPerSec === 'function' ? GS.getQiPerSec() : 0,
        stonePerSec: typeof GS.getStonePerSec === 'function' ? GS.getStonePerSec() : 0,
        now: Date.now()
      };
      if (all && !all.disabled) claimAll(GS.state, env);
      else if (one) claimNext(GS.state, one.getAttribute('data-codex-claim'), env);
      GS.saveGame();
      render();
    });
    syncMaxRealm();
    renderBadge();
    setInterval(() => { syncMaxRealm(); renderBadge(); }, 5000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
