// 主线剧情对话（新手体验 batch3 P1-1）：章首 intro、Boss 战前 pre、击败后遗言 + 战后 post + 「图鉴已收录」。
// 数据来自 js/story-data.js（按章节 / Boss 关键字），Boss 名从 GameConfig.BATTLE.BOSSES 实时读取（文案里只有 {boss} 占位符）。
// 可跳过；看过与否记在 state.storySeen（旧档按已通关进度补记）。不改任何数值，只在闯关页拦一下开战。
(function () {
  'use strict';

  const CHAPTER_SIZE = 10;

  function data() {
    return (typeof window !== 'undefined' && window.StoryData) || { chapters: [], lastWords: {} };
  }

  function cfgBosses() {
    const B = window.GameConfig && window.GameConfig.BATTLE;
    return (B && B.BOSSES) || [];
  }

  function bossById(id) {
    return cfgBosses().find((b) => b && b.id === id) || null;
  }

  function bossForStage(stageNum) {
    const n = Math.floor(Number(stageNum) || 0);
    if (n <= 0 || n % CHAPTER_SIZE !== 0) return null;
    return cfgBosses()[n / CHAPTER_SIZE - 1] || null;
  }

  function bossName(id) {
    const b = bossById(id);
    return (b && b.name) || '';
  }

  function chapterOf(stageNum) {
    return Math.floor((Math.max(1, Math.floor(Number(stageNum) || 1)) - 1) / CHAPTER_SIZE) + 1;
  }

  function chapterData(ch) {
    return (data().chapters || []).find((c) => c && c.chapter === ch) || null;
  }

  function bossEntry(stageNum) {
    const ch = chapterData(chapterOf(stageNum));
    if (!ch || !Array.isArray(ch.bosses)) return null;
    return ch.bosses.find((b) => b && b.stage === stageNum) || null;
  }

  function fill(text, ownBossId) {
    return String(text || '')
      .replace(/\{boss:([a-z0-9_]+)\}/gi, (m, id) => bossName(id) || '')
      .replace(/\{boss\}/g, bossName(ownBossId) || '');
  }

  // 该关开战前要播的段落：章首第一关播 intro，Boss 关播 pre；已看过返回 null
  function pendingBefore(stageNum, seen) {
    const n = Math.floor(Number(stageNum) || 0);
    const sn = seen || {};
    const ch = chapterOf(n);
    const cd = chapterData(ch);
    if (!cd) return null;
    const out = [];
    if (n === (ch - 1) * CHAPTER_SIZE + 1 && Array.isArray(cd.intro) && !sn[`c${ch}:intro`]) {
      out.push({ key: `c${ch}:intro`, lines: cd.intro, bossId: cd.bosses && cd.bosses[0] && cd.bosses[0].bossId });
    }
    const be = bossEntry(n);
    if (be && Array.isArray(be.pre) && !sn[`b${n}:pre`]) {
      // 章首关恰好也是 Boss 关时（目前没有）连播
      out.push({ key: `b${n}:pre`, lines: be.pre, bossId: be.bossId });
    }
    return out.length ? out : null;
  }

  // 遗言：story-data 的 lastWords（按 bossId）→ 本章条目 → 图鉴开场台词（占位）
  function lastWordsFor(bossId, stageNum) {
    const lw = data().lastWords || {};
    if (lw[bossId]) return fill(lw[bossId], bossId);
    const be = stageNum ? bossEntry(stageNum) : null;
    if (be && be.lastWords) return fill(be.lastWords, bossId);
    const C = window.Codex;
    const lore = C && typeof C.bossLore === 'function' ? C.bossLore(bossName(bossId)) : null;
    return lore && lore.quote ? lore.quote : '';
  }

  // 击败 Boss 后的段落：遗言（一定有）+ post（前 6 章）+ 图鉴已收录
  function pendingAfter(stageNum, seen) {
    const boss = bossForStage(stageNum);
    if (!boss) return null;
    const key = `b${stageNum}:post`;
    if ((seen || {})[key]) return null;
    const be = bossEntry(stageNum);
    const lines = [];
    const lw = lastWordsFor(boss.id, stageNum);
    if (lw) lines.push({ speaker: 'Boss', text: lw, kind: 'last' });
    if (be && Array.isArray(be.post)) be.post.forEach((l) => lines.push(l));
    lines.push({ speaker: '图鉴', text: `图鉴已收录【${boss.name}】`, kind: 'codex' });
    return [{ key, lines, bossId: boss.id }];
  }

  // 把一段台词解析成可显示的行：Boss/旁白/无名修士/heroId（不在队伍时用 fallback 改为旁白，没有 fallback 跳过）
  function resolveLines(lines, ctx) {
    const c = ctx || {};
    const squad = c.squad || [];
    const heroName = c.heroName || ((id) => id);
    const out = [];
    (lines || []).forEach((l) => {
      if (!l || !l.text) return;
      const sp = l.speaker;
      if (sp === 'Boss') {
        out.push({ who: 'boss', name: bossName(c.bossId) || 'Boss', text: fill(l.text, c.bossId), kind: l.kind || '' });
      } else if (sp === '旁白') {
        out.push({ who: 'narrator', name: '', text: fill(l.text, c.bossId) });
      } else if (sp === '无名修士') {
        out.push({ who: 'player', name: '无名修士', text: fill(l.text, c.bossId) });
      } else if (sp === '图鉴') {
        out.push({ who: 'codex', name: '', text: l.text, kind: 'codex' });
      } else if (squad.indexOf(sp) >= 0) {
        out.push({ who: 'hero', heroId: sp, name: heroName(sp), text: fill(l.text, c.bossId) });
      } else if (l.fallback) {
        out.push({ who: 'narrator', name: '', text: fill(l.fallback, c.bossId) });
      }
    });
    return out;
  }

  // ====================== DOM ======================
  let els = null;
  let queue = [];
  let idx = 0;
  let onDone = null;
  let open = false;
  let ctxBossId = '';

  function S() {
    return window.GameState && window.GameState.state;
  }

  function seenMap() {
    const s = S();
    if (!s) return {};
    if (!s.storySeen || typeof s.storySeen !== 'object') s.storySeen = {};
    return s.storySeen;
  }

  function heroCfg(id) {
    const list = (window.GameConfig && window.GameConfig.HEROES) || [];
    return list.find((h) => h && h.id === id) || null;
  }

  function currentSquad() {
    const s = S();
    const B = window.Battle;
    let ids = [];
    try {
      ids = B && s ? B.getSquadIds(s) : [];
    } catch (err) {
      ids = [];
    }
    if (s && s.heroId && ids.indexOf(s.heroId) < 0) ids = ids.concat([s.heroId]);
    return ids;
  }

  function ensureEls() {
    if (els) return els;
    const modal = document.getElementById('story-modal');
    if (!modal) return null;
    els = {
      modal,
      hero: document.getElementById('story-hero-img'),
      boss: document.getElementById('story-boss'),
      bossImg: document.getElementById('story-boss-img'),
      name: document.getElementById('story-speaker'),
      text: document.getElementById('story-text'),
      next: document.getElementById('btn-story-next'),
      skip: document.getElementById('btn-story-skip'),
      box: document.getElementById('story-box')
    };
    if (els.next) els.next.addEventListener('click', (e) => { e.stopPropagation(); advance(); });
    if (els.box) els.box.addEventListener('click', () => advance());
    if (els.skip) els.skip.addEventListener('click', (e) => { e.stopPropagation(); finish(); });
    return els;
  }

  function showLine() {
    const e = ensureEls();
    if (!e) return;
    const l = queue[idx];
    if (!l) return;
    e.modal.setAttribute('data-who', l.who);
    e.modal.classList.toggle('is-last-words', l.kind === 'last');
    // 开篇是无名凡人视角：不显示主角立绘与 Boss 剪影
    e.modal.classList.toggle('is-opening', Boolean(l.opening));
    if (e.name) e.name.textContent = l.name || (l.who === 'narrator' ? '' : '');
    if (e.text) e.text.textContent = l.text;
    if (l.who === 'hero' && e.hero) {
      const h = heroCfg(l.heroId);
      if (h && (h.img || h.avatar)) e.hero.src = h.img || h.avatar;
    } else if (e.hero) {
      const h = heroCfg(S() && S().heroId);
      if (h && h.img && e.hero.getAttribute('src') !== h.img) e.hero.src = h.img;
    }
    if (e.next) e.next.textContent = idx >= queue.length - 1 ? '继续' : '下一句';
  }

  function advance() {
    if (!open) return;
    idx += 1;
    if (idx >= queue.length) finish();
    else showLine();
  }

  function finish() {
    if (!open) return;
    open = false;
    const e = ensureEls();
    if (e) {
      e.modal.classList.remove('active', 'is-last-words', 'is-opening');
      e.modal.setAttribute('aria-hidden', 'true');
    }
    queue = [];
    idx = 0;
    const cb = onDone;
    onDone = null;
    if (typeof cb === 'function') cb();
  }

  function bossVisual(bossId) {
    const e = ensureEls();
    if (!e || !e.boss) return;
    const b = bossById(bossId);
    const raw = b && b.img && b.img !== 'placeholder' ? b.img : '';
    e.boss.classList.toggle('has-img', Boolean(raw));
    if (e.bossImg) {
      if (raw) e.bossImg.src = raw;
      else e.bossImg.removeAttribute('src');
    }
    e.boss.setAttribute('aria-label', (b && b.name) || '');
  }

  // 播放若干段落；全部看完 / 跳过后调用 done。段落一开播即记为看过（跳过也算）。
  function play(parts, done) {
    const e = ensureEls();
    if (!e || !parts || !parts.length) {
      if (typeof done === 'function') done();
      return false;
    }
    const seen = seenMap();
    const squad = currentSquad();
    const heroName = (id) => {
      const h = heroCfg(id);
      return (h && h.name) || id;
    };
    const lines = [];
    parts.forEach((p) => {
      if (p.key === OPENING_KEY) {
        const st = S();
        if (st) st.openingSeen = true;
      } else {
        seen[p.key] = true;
      }
      resolveLines(p.lines, { bossId: p.bossId, squad, heroName }).forEach((l) => {
        if (p.key === OPENING_KEY) l.opening = true;
        lines.push(l);
      });
      ctxBossId = p.bossId || ctxBossId;
    });
    if (window.GameState && window.GameState.saveGame) window.GameState.saveGame();
    if (!lines.length) {
      if (typeof done === 'function') done();
      return false;
    }
    queue = lines;
    idx = 0;
    onDone = done || null;
    open = true;
    bossVisual(ctxBossId);
    showLine();
    e.modal.classList.add('active');
    e.modal.setAttribute('aria-hidden', 'false');
    return true;
  }

  // 开篇五屏（世界观 batch5）：state.openingSeen === false（全新存档）时待播；旧档读档即为 true
  const OPENING_KEY = 'opening';

  function openingPart() {
    const op = data().opening;
    const screens = op && Array.isArray(op.screens) ? op.screens : [];
    const lines = screens.filter((x) => x && x.text).map((x) => ({ speaker: '旁白', text: x.text }));
    return lines.length ? { key: OPENING_KEY, lines, kind: 'opening' } : null;
  }

  function openingPending(s) {
    const st = s || S();
    return Boolean(st && st.openingSeen === false && openingPart());
  }

  // game.js 进游戏时调用：需要播则播完再回调 done，返回 true 表示已弹出
  function playOpening(done) {
    if (open || !openingPending()) return false;
    return play([openingPart()], done);
  }

  // stage-ui 开战前调用：需要播剧情则播完再回调 resume，返回 true 表示已拦下
  // 开篇若还没播（例如被直接关掉页面），先播开篇再接章节剧情，同一个弹窗连播
  function beforeBattle(stageNum, resume) {
    if (open) return true;
    const parts = pendingBefore(stageNum, seenMap()) || [];
    if (openingPending()) parts.unshift(openingPart());
    if (!parts.length) return false;
    return play(parts, resume);
  }

  // stage-ui 首通 Boss 后调用
  function afterBossWin(stageNum, done) {
    if (open) return true;
    const parts = pendingAfter(stageNum, seenMap());
    if (!parts) return false;
    return play(parts, done);
  }

  function isOpen() {
    return open;
  }

  window.Story = {
    CHAPTER_SIZE,
    chapterOf,
    bossForStage,
    bossEntry,
    fill,
    pendingBefore,
    pendingAfter,
    lastWordsFor,
    resolveLines,
    play,
    beforeBattle,
    afterBossWin,
    openingPart,
    openingPending,
    playOpening,
    isOpen,
    finish
  };
})();
