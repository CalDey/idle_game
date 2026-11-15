// 本命道途：化灵初起可从剑道 / 体道 / 符道三选一，每条道途 3 个参悟节点（各 3 层），用灵石参悟。
// 规则：
// - 战斗类加成通过 Battle.createSession 的可选 mods（全队）注入，与仙缘羁绊、秘境劫运同一通道；
//   收益类加成（灵气/灵石）乘到 GameState.getQiPerSec / getStonePerSec。
// - 参悟花费 = 当前灵石产出 × 分钟数（COST_MINUTES，可调常量），下限 COST_FLOOR；用作 化灵 之后的灵石去处。
// - 节点按境界开放：第 1 节点 化灵初、第 2 节点 尊者初、第 3 节点 天神初。
// - 改道：花费 RESPEC_MINUTES 分钟灵石产出，已参悟层数按节点位置保留到新道途；每次轮回赠 1 次免费改道。
// - 转世：保留所选道途；参悟层数清零（与功法/洞府一样属于灵石投入，随轮回重修）；赠 1 次免费改道。
// - 存档字段 state.path（旧存档缺省自动补全，坏数据被修正）。不发放、不消耗道果与灵气。
(function () {
  const root = typeof window !== 'undefined' ? window : globalThis;

  const RULES = {
    UNLOCK_REALM: 6, // 化灵初
    TIER_REALMS: [6, 15, 27], // 化灵初 / 尊者初 / 天神初
    MAX_LV: 3,
    COST_MINUTES: [5, 10, 20], // 第 1/2/3 层：当前灵石产出的分钟数（可调）
    COST_FLOOR: 200,
    RESPEC_MINUTES: 30
  };

  // 每层效果值 per；kind: 'mod' 进战斗 mods（mult 类为增量），'income' 进收益倍率
  // 显示名/道心/节点描述按文案定稿 v1；id / kind / key / per / 图标路径不动，以免存档与数值对不上。
  const PATHS = [
    {
      id: 'jian', name: '剑道', icon: 'assets/ui/path/path_jian', motto: '以心饲剑，锋才肯替你出手。',
      nodes: [
        { id: 'fengmang', name: '剑心锋芒', kind: 'mod', key: 'critAdd', per: 0.018, fmt: (v) => `全队暴击率 +${Math.round(v * 100)}%`, desc: '锋不是练出来的，是从心口抽出来的。' },
        { id: 'jianyi', name: '剑意入骨', kind: 'mod', key: 'ultDmgMult', per: 0.042, fmt: (v) => `全队绝技伤害 +${Math.round(v * 100)}%`, desc: '剑意留下就不走。挥得越深，越难装没听见。' },
        { id: 'zhanyao', name: '斩其魁首', kind: 'mod', key: 'bossDmgMult', per: 0.048, fmt: (v) => `对首领伤害 +${Math.round(v * 100)}%`, desc: '剑不看对面是人是妖，只看谁挡在最前。' }
      ]
    },
    {
      id: 'ti', name: '体道', icon: 'assets/ui/path/path_ti', motto: '拿骨去挡，才能让别人还活着。',
      nodes: [
        { id: 'liangu', name: '拆骨饲身', kind: 'mod', key: 'hpMult', per: 0.018, fmt: (v) => `全队生命 +${Math.round(v * 100)}%`, desc: '骨要拆开再接。接上的，就不再全是你的。' },
        { id: 'tiebi', name: '肉身作垣', kind: 'mod', key: 'defMult', per: 0.024, fmt: (v) => `全队防御 +${Math.round(v * 100)}%`, desc: '墙是用自己砌的，破了就再砌一层。' },
        { id: 'zhenyue', name: '承锋不退', kind: 'mod', key: 'frontDmgTakenMult', per: -0.018, fmt: (v) => `前排承伤 -${Math.round(-v * 100)}%`, desc: '站在最前的人，是把自己当成了盾。' }
      ]
    },
    {
      id: 'fu', name: '符道', icon: 'assets/ui/path/path_fu', motto: '符是借条，写下的都要还。',
      nodes: [
        { id: 'julingfu', name: '聚灵符', kind: 'income', key: 'qi', per: 0.03, fmt: (v) => `灵气获取 +${Math.round(v * 100)}%`, desc: '气不会白来，符只是替你伸手去拿。' },
        { id: 'zhaocaifu', name: '摄石符', kind: 'income', key: 'stone', per: 0.048, fmt: (v) => `灵石产出 +${Math.round(v * 100)}%`, desc: '石也是被写来的，不是自己长出来的。' },
        { id: 'jingshenfu', name: '催杀符', kind: 'mod', key: 'rageStart', per: 4.8, fmt: (v) => `全队开战怒气 +${Math.round(v)}`, desc: '符一燃，杀心先于人醒。' }
      ]
    }
  ];
  const PATH_MAP = {};
  PATHS.forEach((p) => { PATH_MAP[p.id] = p; });
  const MULT_KEYS = ['atkMult', 'hpMult', 'defMult', 'ultDmgMult', 'bossDmgMult', 'frontDmgTakenMult'];

  // 界面文案集中在此，便于整批替换（不改逻辑）。显示用「改道」，内部函数名仍为 respec。
  const TEXT = {
    entryLocked: '化灵初开启',
    entryDefault: '本命道途',
    entryPending: '本命道途 · 待择道',
    entryChosen: '本命道途 · {name} {total}/9',
    modalTitle: '本命道途',
    tagCurrent: '当前',
    tagNatal: '本命',
    introChoose: '择一条本命道途，便是把自己押上去。参悟要花灵石（按当前灵石产出折算）。效果如下；改道可以，但要再付一笔。',
    introRespecFree: '改道会把已参悟的层数按位置带到新道途上。此世还可免费改一次（轮回后留下的）。',
    introRespecPaid: '改道会把已参悟的层数按位置带到新道途上。花费灵石 {cost}（约 {RESPEC_MINUTES} 分钟产出）。',
    noteReincarnate: '轮回后道途还在，参悟层数清空，并留下 1 次免费改道。',
    btnChoose: '择此道途',
    btnRespec: '改修{name}',
    btnUpgrade: '参悟 · 灵石 {cost}',
    btnRespecOpenFree: '改道（免费）',
    btnRespecOpenPaid: '改道 · 灵石 {cost}',
    btnClose: '关闭',
    btnBack: '返回',
    stateUnlearned: '未参悟',
    stateNext: '下一层：{effect}',
    stateMaxed: '已圆满',
    lockMaxed: '圆满',
    lockTier: '{realmName}开放',
    flashChosen: '已把本命押在{name}上',
    flashChooseFail: '未能择道',
    flashUpgrade: '参悟【{name}】至 {lv} 层，灵石 -{cost}',
    flashUpgradeFail: '参悟失败',
    flashRespecFree: '已改修{name}（免费）',
    flashRespecPaid: '已改修{name}，灵石 -{cost}',
    flashRespecFail: '改道失败',
    msgLocked: '{realmName}开启本命道途',
    msgAlreadyChosen: '已选定道途，可花费灵石改道',
    msgNoPath: '请先选定道途',
    msgTierLocked: '{realmName}开放',
    msgMaxed: '已参悟圆满',
    msgInsufficient: '灵石不足',
    msgSamePath: '已是当前道途',
    combatNote: '加成在战斗内生效，不计入面板战力',
    respecNoRefund: '已投入灵石不退还',
    chooseConfirmTitle: '择道确认',
    chooseConfirm: '确定择【{name}】为本命道途？',
    respecConfirmTitle: '改道确认',
    respecConfirm: '改修【{name}】后，已参悟层数按节点位置保留到新道途。{freeNote}{refund}。确定改修？',
    respecConfirmFree: '此世还可免费改一次。',
    confirmYes: '确定',
    confirmNo: '取消'
  };

  function t(key, vars) {
    const src = TEXT[key] == null ? '' : String(TEXT[key]);
    const bag = Object.assign({ RESPEC_MINUTES: RULES.RESPEC_MINUTES }, vars || {});
    return src.replace(/\{(\w+)\}/g, (_, k) => (bag[k] == null ? '' : String(bag[k])));
  }

  function defaults() {
    return { v: 1, id: null, lv: [0, 0, 0], freeRespec: 0, respecs: 0, spent: 0 };
  }

  function normalize(raw) {
    const out = defaults();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    out.id = typeof raw.id === 'string' && PATH_MAP[raw.id] ? raw.id : null;
    if (Array.isArray(raw.lv)) {
      for (let i = 0; i < 3; i++) out.lv[i] = Math.max(0, Math.min(RULES.MAX_LV, Math.floor(Number(raw.lv[i]) || 0)));
    }
    if (!out.id) out.lv = [0, 0, 0];
    out.freeRespec = Math.max(0, Math.min(1, Math.floor(Number(raw.freeRespec) || 0)));
    out.respecs = Math.max(0, Math.floor(Number(raw.respecs) || 0));
    out.spent = Math.max(0, Number(raw.spent) || 0);
    return out;
  }

  // 原地补全/修复 state.path（保持对象引用）
  function ensureState(s) {
    const p = normalize(s && s.path);
    if (s.path && typeof s.path === 'object' && !Array.isArray(s.path)) {
      Object.keys(s.path).forEach((k) => { if (!(k in p)) delete s.path[k]; });
      Object.assign(s.path, p);
      return s.path;
    }
    s.path = p;
    return p;
  }

  // 只读：不改存档
  function peek(s) {
    return normalize(s && s.path);
  }

  function realmOf(s) {
    return Math.max(0, Math.floor(Number(s && s.realmIndex) || 0));
  }

  function isUnlocked(s) {
    return realmOf(s) >= RULES.UNLOCK_REALM;
  }

  function tierOpen(s, i) {
    return realmOf(s) >= RULES.TIER_REALMS[i];
  }

  function realmName(idx) {
    const C = root.GameConfig;
    const st = C && C.REALM_STAGES && C.REALM_STAGES[idx];
    return (st && st.fullName) || `第 ${idx} 境`;
  }

  function stonePerSec(s, env) {
    const e = env || {};
    if (Number.isFinite(Number(e.stonePerSec))) return Math.max(0, Number(e.stonePerSec));
    const GS = root.GameState;
    return GS && typeof GS.getStonePerSec === 'function' ? Math.max(0, GS.getStonePerSec()) : 0;
  }

  function minutesCost(minutes, sps) {
    return Math.max(RULES.COST_FLOOR, Math.round(sps * 60 * minutes));
  }

  function nodeCost(s, tier, env) {
    const p = peek(s);
    const lv = p.lv[tier];
    if (lv >= RULES.MAX_LV) return null;
    return minutesCost(RULES.COST_MINUTES[lv], stonePerSec(s, env));
  }

  function respecCost(s, env) {
    const p = peek(s);
    if (p.freeRespec > 0) return 0;
    return minutesCost(RULES.RESPEC_MINUTES, stonePerSec(s, env));
  }

  function choose(s, pathId) {
    if (!isUnlocked(s)) return { ok: false, reason: 'locked', message: t('msgLocked', { realmName: realmName(RULES.UNLOCK_REALM) }) };
    if (!PATH_MAP[pathId]) return { ok: false, reason: 'bad_path' };
    const p = ensureState(s);
    if (p.id) return { ok: false, reason: 'already_chosen', message: t('msgAlreadyChosen') };
    p.id = pathId;
    return { ok: true, path: PATH_MAP[pathId] };
  }

  function upgrade(s, tier, env) {
    const p = ensureState(s);
    if (!p.id) return { ok: false, reason: 'no_path', message: t('msgNoPath') };
    if (!(tier >= 0 && tier < 3)) return { ok: false, reason: 'bad_tier' };
    if (!tierOpen(s, tier)) return { ok: false, reason: 'tier_locked', message: t('msgTierLocked', { realmName: realmName(RULES.TIER_REALMS[tier]) }) };
    if (p.lv[tier] >= RULES.MAX_LV) return { ok: false, reason: 'maxed', message: t('msgMaxed') };
    const cost = nodeCost(s, tier, env);
    const have = Number(s.stones) || 0;
    if (have < cost) return { ok: false, reason: 'insufficient', cost, message: t('msgInsufficient') };
    s.stones = have - cost;
    p.lv[tier] += 1;
    p.spent += cost;
    return { ok: true, tier, lv: p.lv[tier], cost };
  }

  // 改道：层数按节点位置保留到新道途
  function respec(s, pathId, env) {
    const p = ensureState(s);
    if (!p.id) return { ok: false, reason: 'no_path' };
    if (!PATH_MAP[pathId]) return { ok: false, reason: 'bad_path' };
    if (pathId === p.id) return { ok: false, reason: 'same_path', message: t('msgSamePath') };
    const cost = respecCost(s, env);
    const have = Number(s.stones) || 0;
    if (have < cost) return { ok: false, reason: 'insufficient', cost, message: t('msgInsufficient') };
    if (p.freeRespec > 0) p.freeRespec -= 1;
    else s.stones = have - cost;
    const from = p.id;
    p.id = pathId;
    p.respecs += 1;
    return { ok: true, from, to: pathId, cost, free: cost === 0 };
  }

  // 转世：保留道途，层数清零，赠 1 次免费改道
  function onReincarnate(prevPath) {
    const p = normalize(prevPath);
    return { v: 1, id: p.id, lv: [0, 0, 0], freeRespec: p.id ? 1 : 0, respecs: p.respecs, spent: 0 };
  }

  function nodeValue(node, lv) {
    return node.per * lv;
  }

  function effects(s) {
    const p = peek(s);
    if (!p.id) return [];
    return PATH_MAP[p.id].nodes.map((n, i) => ({ node: n, tier: i, lv: p.lv[i], value: nodeValue(n, p.lv[i]) }));
  }

  // 战斗 mods（全队）；未选道途或无层数时返回 null（战斗与原版一致）
  function battleMods(s) {
    const mods = {};
    let any = false;
    effects(s).forEach((e) => {
      if (e.node.kind !== 'mod' || e.lv <= 0) return;
      any = true;
      if (MULT_KEYS.includes(e.node.key)) mods[e.node.key] = (mods[e.node.key] == null ? 1 : mods[e.node.key]) + e.value;
      else mods[e.node.key] = (mods[e.node.key] || 0) + e.value;
    });
    return any ? mods : null;
  }

  function incomeFactor(s, key) {
    let f = 1;
    effects(s).forEach((e) => {
      if (e.node.kind === 'income' && e.node.key === key) f += e.value;
    });
    return f;
  }

  function qiFactor(s) { return incomeFactor(s, 'qi'); }
  function stoneFactor(s) { return incomeFactor(s, 'stone'); }

  // 用于界面缓存键
  function signature(s) {
    const p = peek(s);
    return p.id ? `${p.id}${p.lv.join('')}` : '-';
  }

  // 有可参悟的节点（灵石足够）或尚未选定道途
  function hasAction(s, env) {
    if (!isUnlocked(s)) return false;
    const p = peek(s);
    if (!p.id) return true;
    for (let i = 0; i < 3; i++) {
      if (!tierOpen(s, i) || p.lv[i] >= RULES.MAX_LV) continue;
      if ((Number(s.stones) || 0) >= nodeCost(s, i, env)) return true;
    }
    return false;
  }

  const core = {
    RULES, PATHS, PATH_MAP, TEXT,
    defaults, normalize, ensureState, peek, isUnlocked, tierOpen,
    nodeCost, respecCost, choose, upgrade, respec, onReincarnate,
    effects, battleMods, qiFactor, stoneFactor, signature, hasAction
  };
  root.Path = core;
  if (typeof module !== 'undefined' && module.exports) module.exports = core;

  // ===================== 界面（仅浏览器） =====================
  if (typeof document === 'undefined' || !document.getElementById) return;

  const fmtN = (n) => (root.GameConfig && root.GameConfig.formatNumber ? root.GameConfig.formatNumber(n) : String(Math.round(n)));
  const ICON_V = 124;
  function pathIconHtml(path, cls) {
    if (!path || !path.icon) return '';
    const c = cls ? ` ${cls}` : '';
    return `<img class="gi path-icon${c}" src="${path.icon}@64.webp?v=${ICON_V}" srcset="${path.icon}@64.webp?v=${ICON_V} 64w, ${path.icon}.webp?v=${ICON_V} 128w" sizes="18px" alt="" aria-hidden="true">`;
  }
  let els = null;
  let view = 'main'; // main | choose | respec
  let flash = '';
  let lastEntry = '';
  let pending = null; // { kind: 'choose'|'respec', pathId }

  function GS() { return root.GameState; }

  // 窄屏入口只显示「道途」，状态放第二行小字；完整文字写进 title / aria-label（v143）
  function entryStatusOf(text) {
    const str = String(text || '');
    const i = str.indexOf(' · ');
    return i >= 0 ? str.slice(i + 3) : str;
  }

  function setEntryStatus(text) {
    if (!els) return;
    if (els.entryStatus) els.entryStatus.textContent = entryStatusOf(text);
    if (els.entry && typeof els.entry.setAttribute === 'function') {
      els.entry.setAttribute('title', text);
      els.entry.setAttribute('aria-label', text);
    }
  }

  function renderEntry() {
    if (!els) return;
    const s = GS().state;
    const unlocked = isUnlocked(s);
    els.entry.hidden = false;
    if (!unlocked) {
      const key = `locked|${t('entryLocked')}`;
      if (key !== lastEntry) {
        lastEntry = key;
        els.entryText.textContent = t('entryLocked');
        setEntryStatus(t('entryLocked'));
        els.entry.disabled = true;
        els.entry.setAttribute('aria-disabled', 'true');
        els.entry.classList.add('is-locked');
        els.entry.classList.remove('has-action');
        if (els.badge) els.badge.classList.remove('visible');
      }
      return;
    }
    els.entry.disabled = false;
    els.entry.removeAttribute('aria-disabled');
    els.entry.classList.remove('is-locked');
    const p = peek(s);
    const total = p.lv[0] + p.lv[1] + p.lv[2];
    const text = p.id ? t('entryChosen', { name: PATH_MAP[p.id].name, total }) : t('entryPending');
    const act = hasAction(s);
    const key = `${text}|${act}`;
    if (key !== lastEntry) {
      lastEntry = key;
      els.entryText.textContent = text;
      setEntryStatus(text);
      els.entry.classList.toggle('has-action', act);
      if (els.badge) els.badge.classList.toggle('visible', act);
    }
  }

  function pathCard(path, opts) {
    const o = opts || {};
    const lines = path.nodes.map((n, i) => `<li><div class="path-card-node-main"><span class="path-node-name">${n.name}</span>${n.fmt(nodeValue(n, RULES.MAX_LV))}<span class="path-node-gate">${t('lockTier', { realmName: realmName(RULES.TIER_REALMS[i]) })}</span></div>${n.desc ? `<div class="path-node-desc">${n.desc}</div>` : ''}</li>`).join('');
    return `
      <div class="path-card path-${path.id}${o.current ? ' is-current' : ''}">
        <div class="path-card-head">${pathIconHtml(path)}<span class="path-card-name">${path.name}</span>${o.current ? `<span class="path-card-tag">${t('tagCurrent')}</span>` : ''}</div>
        <div class="path-card-motto">${path.motto}</div>
        <ul class="path-card-nodes">${lines}</ul>
        ${o.learnCost != null ? `<div class="path-card-cost">${t('btnUpgrade', { cost: fmtN(o.learnCost) })}</div>` : ''}
        ${o.button || ''}
      </div>`;
  }

  function confirmHtml() {
    if (!pending || !PATH_MAP[pending.pathId]) return '';
    const path = PATH_MAP[pending.pathId];
    const kind = pending.kind === 'respec' ? 'respec' : 'choose';
    const freeNote = kind === 'respec' && peek(GS().state).freeRespec > 0 ? t('respecConfirmFree') : '';
    return `<div class="path-confirm">
      <div class="path-confirm-title">${t(kind + 'ConfirmTitle')}</div>
      <div class="path-confirm-msg">${t(kind + 'Confirm', { name: path.name, refund: t('respecNoRefund'), freeNote })}</div>
      <div class="path-confirm-actions">
        <button type="button" class="btn btn-primary btn-sm" data-path-confirm="yes">${t('confirmYes')}</button>
        <button type="button" class="btn btn-sm" data-path-confirm="no">${t('confirmNo')}</button>
      </div>
    </div>`;
  }

  function render() {
    if (!els) return;
    const s = GS().state;
    const p = ensureState(s);
    let html = flash ? `<div class="path-flash">${flash}</div>` : '';
    html += confirmHtml();
    let actions = '';
    if (!p.id || view === 'choose') {
      html += `<div class="path-intro">${t('introChoose')}</div>`;
      const firstCost = nodeCost(s, 0);
      PATHS.forEach((path) => {
        html += pathCard(path, { learnCost: firstCost, button: `<button type="button" class="btn btn-primary btn-sm" data-path-choose="${path.id}">${t('btnChoose')}</button>` });
      });
      actions = `<button type="button" class="btn" data-path-close="1">${t('btnClose')}</button>`;
    } else if (view === 'respec') {
      const cost = respecCost(s);
      const intro = cost === 0 ? t('introRespecFree') : t('introRespecPaid', { cost: fmtN(cost) });
      html += `<div class="path-intro">${intro} ${t('respecNoRefund')}。</div>`;
      PATHS.filter((path) => path.id !== p.id).forEach((path) => {
        const afford = (Number(s.stones) || 0) >= cost;
        html += pathCard(path, { button: `<button type="button" class="btn btn-sm" data-path-respec="${path.id}"${afford ? '' : ' disabled'}>${t('btnRespec', { name: path.name })}</button>` });
      });
      actions = `<button type="button" class="btn" data-path-back="1">${t('btnBack')}</button>`;
    } else {
      const path = PATH_MAP[p.id];
      html += `<div class="path-card path-${path.id} is-current"><div class="path-card-head">${pathIconHtml(path)}<span class="path-card-name">${path.name}</span><span class="path-card-tag">${t('tagNatal')}</span></div><div class="path-card-motto">${path.motto}</div></div>`;
      path.nodes.forEach((n, i) => {
        const lv = p.lv[i];
        const open = tierOpen(s, i);
        const maxed = lv >= RULES.MAX_LV;
        const cost = maxed ? 0 : nodeCost(s, i);
        const afford = (Number(s.stones) || 0) >= cost;
        const cur = lv > 0 ? n.fmt(nodeValue(n, lv)) : t('stateUnlearned');
        const next = maxed ? t('stateMaxed') : t('stateNext', { effect: n.fmt(nodeValue(n, lv + 1)) });
        let btn;
        if (!open) btn = `<span class="path-node-lock">${t('lockTier', { realmName: realmName(RULES.TIER_REALMS[i]) })}</span>`;
        else if (maxed) btn = `<span class="path-node-lock">${t('lockMaxed')}</span>`;
        else btn = `<button type="button" class="btn btn-sm${afford ? ' btn-primary' : ''}" data-path-up="${i}"${afford ? '' : ' disabled'}>${t('btnUpgrade', { cost: fmtN(cost) })}</button>`;
        html += `
          <div class="path-node${open ? '' : ' is-locked'}${maxed ? ' is-maxed' : ''}">
            <div class="path-node-head"><span class="path-node-name">${n.name}</span><span class="path-node-lv">${lv}/${RULES.MAX_LV}</span></div>
            ${n.desc ? `<div class="path-node-desc">${n.desc}</div>` : ''}
            <div class="path-node-cur">${cur}</div>
            <div class="path-node-next">${next}</div>
            <div class="path-node-actions">${btn}</div>
          </div>`;
      });
      html += `<div class="path-note">${t('noteReincarnate')}</div>`;
      html += `<div class="path-note">${t('combatNote')}</div>`;
      const rc = respecCost(s);
      actions = `<button type="button" class="btn" data-path-torespec="1">${rc === 0 ? t('btnRespecOpenFree') : t('btnRespecOpenPaid', { cost: fmtN(rc) })}</button><button type="button" class="btn" data-path-close="1">${t('btnClose')}</button>`;
    }
    if (view !== 'main' || !p.id) html += `<div class="path-note">${t('combatNote')}</div>`;
    els.body.innerHTML = html;
    els.actions.innerHTML = actions;
    if (els.titleIcon) {
      const cur = p.id && view === 'main' ? PATH_MAP[p.id] : null;
      if (cur) {
        els.titleIcon.src = `${cur.icon}@64.webp?v=${ICON_V}`;
        els.titleIcon.srcset = `${cur.icon}@64.webp?v=${ICON_V} 64w, ${cur.icon}.webp?v=${ICON_V} 128w`;
      } else {
        els.titleIcon.src = `assets/icons/gf_taiqingjue@64.webp?v=18`;
        els.titleIcon.removeAttribute('srcset');
      }
    }
  }

  function isOpen() {
    return Boolean(els && els.modal.classList.contains('active'));
  }

  function open() {
    if (!els || !isUnlocked(GS().state)) return false;
    view = 'main';
    flash = '';
    pending = null;
    render();
    els.modal.classList.add('active');
    els.modal.setAttribute('aria-hidden', 'false');
    return true;
  }

  function close() {
    if (!els) return;
    els.modal.classList.remove('active');
    els.modal.setAttribute('aria-hidden', 'true');
    view = 'main';
    pending = null;
    renderEntry();
  }

  function afterChange() {
    GS().saveGame();
  }

  function onClick(e) {
    const btn = e.target && e.target.closest ? e.target.closest('button') : null;
    if (!btn || btn.disabled) return;
    const s = GS().state;
    const ds = btn.dataset || {};
    if (ds.pathChoose) {
      pending = { kind: 'choose', pathId: ds.pathChoose };
      flash = '';
    } else if (ds.pathUp !== undefined) {
      const res = upgrade(s, Number(ds.pathUp), {});
      if (res.ok) {
        const n = PATH_MAP[peek(s).id].nodes[res.tier];
        flash = t('flashUpgrade', { name: n.name, lv: res.lv, cost: fmtN(res.cost) });
        afterChange();
      } else flash = res.message || t('flashUpgradeFail');
    } else if (ds.pathTorespec) {
      view = 'respec';
      pending = null;
      flash = '';
    } else if (ds.pathRespec) {
      pending = { kind: 'respec', pathId: ds.pathRespec };
      flash = '';
    } else if (ds.pathConfirm === 'yes' && pending && pending.pathId) {
      if (pending.kind === 'respec') {
        const res = respec(s, pending.pathId, {});
        if (res.ok) {
          flash = res.free
            ? t('flashRespecFree', { name: PATH_MAP[res.to].name })
            : t('flashRespecPaid', { name: PATH_MAP[res.to].name, cost: fmtN(res.cost) });
          afterChange();
          view = 'main';
        } else flash = res.message || t('flashRespecFail');
      } else {
        const res = choose(s, pending.pathId);
        flash = res.ok ? t('flashChosen', { name: res.path.name }) : (res.message || t('flashChooseFail'));
        if (res.ok) afterChange();
        view = 'main';
      }
      pending = null;
    } else if (ds.pathConfirm === 'no') {
      pending = null;
      flash = '';
    } else if (ds.pathBack) {
      view = 'main';
      flash = '';
    } else if (ds.pathClose) {
      close();
      return;
    } else return;
    render();
    renderEntry();
  }

  function tick() {
    if (!els || !GS() || !GS().state) return;
    renderEntry();
  }

  function init() {
    els = {
      entry: document.getElementById('btn-path-open'),
      entryText: document.getElementById('path-entry-text'),
      entryStatus: document.getElementById('path-entry-status'),
      badge: document.getElementById('badge-path'),
      modal: document.getElementById('path-modal'),
      body: document.getElementById('path-modal-body'),
      actions: document.getElementById('path-modal-actions'),
      close: document.getElementById('btn-path-close'),
      titleIcon: document.getElementById('path-modal-title-icon')
    };
    if (!els.entry || !els.modal || !els.body || !els.actions || !root.GameState) {
      els = null;
      return;
    }
    els.entry.addEventListener('click', open);
    els.close.addEventListener('click', close);
    els.modal.addEventListener('click', (e) => { if (e.target === els.modal) close(); });
    els.body.addEventListener('click', onClick);
    els.actions.addEventListener('click', onClick);
    document.addEventListener('keydown', (e) => { if (e && e.key === 'Escape' && isOpen()) close(); });
    tick();
    setInterval(tick, 1000);
  }

  core.ui = { open, close, render, renderEntry, isOpen, tick, init, _view: () => view };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
