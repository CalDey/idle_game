// 主线剧情对话（新手体验 batch3 P1-1）：章首 intro、Boss 战前 pre、击败后遗言 + 战后 post + 「图鉴已收录」。
// 数据来自 js/story-data.js（按章节 / Boss 关键字），Boss 名从 GameConfig.BATTLE.BOSSES 实时读取（文案里只有 {boss} 占位符）。
// 可跳过；看过与否记在 state.storySeen（旧档按已通关进度补记）。不改任何数值，只在闯关页拦一下开战。
(function () {
  'use strict';

  const CHAPTER_SIZE = 10;

  // 往事回溯文案：文案定稿 v1。入口名保持「往事回溯」。
  const RECALL_TEXT = {
    entry: "往事回溯",
    entrySub: "走过的章，可以再翻一遍。赏，不会再给。",
    entryHint: "走过的章，可以再翻一遍。赏，不会再给。",
    modalTitle: "往事回溯",
    empty: "尚无已通之章。走过去，才会留下可翻的账。",
    listHint: "只准回看，不重发奖励。",
    listItem: "第{ch}章 · {chapterName}",
    listItemSub: "已过{bossName} · 第{bossStage}关",
    replayIntro: "重看开篇",
    replayBoss: "重看对白",
    modalIntroTitle: "第{ch}章 · {chapterName} · 开篇",
    modalBossTitle: "第{ch}章 · {bossStageName} · 对白",
    close: "关闭",
    chapterIntro: {
      1: "黑山要一口精血换路。你还没有名字。",
      2: "她吞了破丹，专咬身上有灵气的人。",
      3: "化灵后的关口是他。他把人当货来灌窍。",
      4: "次货被送到无灯作坊。她说死了更好用。",
      5: "她说血还浅，再修一夜会更香。",
      6: "她受着龙祭，最怕被人叫破不是龙。",
      7: "枝头挂着空皮。她要你把热气交给根。",
      8: "她截走不该停在骨头里的雷。",
      9: "她只问这血够不够换一个尊字。",
      10: "她吞了山神之位，受香火也受怨。",
      11: "她闻香来送祭，也为了自己不被烧。",
      12: "神已不再点头。它仍按旧令挡路。",
      13: "她烧无主尸骨，自居火神座下收骨人。",
      14: "她走进火里，却成了替人收柴的人。",
      15: "他问你是来称臣，还是来为祭。",
      16: "她专裹坠落的渡劫者。不要乱叫醒谁。",
      17: "鲸背上是迁徙的冰墓。它自己也成了墓。",
      18: "剑还在，人已不是人。她认剑不认人。",
      19: "给一个人续命，抽的是别人的生机。",
      20: "被取走的不只是这一世，也不只是人。",
      21: "她提着认娘的灯，问你把哪一半留下。",
      22: "她不记得名字，只记得漏走的魂要追回来。",
      23: "魂归灯，心归莲。剩下的杀业还站着。",
      24: "她表面称臣，骨子里在等主君乱一次。",
      25: "两套账在收同一批名字。名仍未公开。",
      26: "「果子」二字已经落地。你不该再当没听见。",
      27: "她拦住不该上行的人，却不知自己已除名。",
      28: "她比此刻的天律更老，却赢不了现行的律。",
      29: "你还不该有名字。身上却已闻得见甜味。",
      30: "它长得像你，只说长到这里，就够了。"
    }
  };

  const STORY_LINES = {
    stage1_1_fail: "凡躯挡不住它。仙桃树下压着一件法宝，前一个主人没能活着取走——去拿。"
  };

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
    if (window.Karma && typeof window.Karma.bossPrefightLine === 'function') {
      const line = window.Karma.bossPrefightLine(window.GameState && window.GameState.state, n);
      const key = `karma:heifeng${n}`;
      if (line && !sn[key]) {
        const pf = (window.KarmaData && window.KarmaData.BOSS_PREFIGHT) || {};
        out.push({
          key,
          lines: [{ speaker: pf.bossName || '黑风寨主', text: line }],
          bossId: be && be.bossId
        });
      }
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

  // 击败 Boss 后的段落：遗言 + post（有则播）+ 图鉴已收录
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
  function play(parts, done, opts) {
    const e = ensureEls();
    if (!e || !parts || !parts.length) {
      if (typeof done === 'function') done();
      return false;
    }
    const replay = Boolean(opts && opts.replay);
    const seen = seenMap();
    const squad = currentSquad();
    const heroName = (id) => {
      const h = heroCfg(id);
      return (h && h.name) || id;
    };
    const lines = [];
    parts.forEach((p) => {
      if (!replay) {
        if (p.key === OPENING_KEY) {
          const st = S();
          if (st) st.openingSeen = true;
        } else if (p.key) {
          seen[p.key] = true;
          if (String(p.key).indexOf('karma:heifeng') === 0 && window.Karma && typeof window.Karma.markPrefightShown === 'function') {
            window.Karma.markPrefightShown(window.GameState && window.GameState.state);
          }
        }
      }
      resolveLines(p.lines, { bossId: p.bossId, squad, heroName }).forEach((l) => {
        if (p.key === OPENING_KEY) l.opening = true;
        lines.push(l);
      });
      ctxBossId = p.bossId || ctxBossId;
    });
    if (!replay && window.GameState && window.GameState.saveGame) window.GameState.saveGame();
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

  // 1-1 教学性战败：尚未首通时弹出旁白，只播一次（记入 storySeen.stage1_1_fail）。
  function pendingStage1Fail(s) {
    const st = s || S();
    if (!st) return false;
    const best = (st.stage && st.stage.best) || 0;
    if (best >= 1) return false;
    const seen = st.storySeen && typeof st.storySeen === 'object' ? st.storySeen : {};
    return !seen.stage1_1_fail;
  }

  function afterStageFail(stageNum, done) {
    if (Math.floor(Number(stageNum) || 0) !== 1) return false;
    if (open || !pendingStage1Fail()) return false;
    return play([{
      key: 'stage1_1_fail',
      lines: [{ speaker: '旁白', text: STORY_LINES.stage1_1_fail }]
    }], done);
  }

  function chapterMeta(ch) {
    const list = (window.GameConfig && window.GameConfig.BATTLE && window.GameConfig.BATTLE.CHAPTERS) || [];
    return list.find((c) => c && c.chapter === ch) || null;
  }

  function chapterTitle(ch) {
    const meta = chapterMeta(ch);
    const name = (meta && meta.name) || '';
    return name ? `第 ${ch} 章 · ${name}` : `第 ${ch} 章`;
  }

  function chapterIntroText(ch, best) {
    const map = RECALL_TEXT.chapterIntro || {};
    const text = map[ch] || map[String(ch)] || '';
    const b = best == null ? currentBest() : best;
    // 「果子」只在第 26 章通关后可见，与现有揭示规则一致。
    if (text.indexOf('果子') >= 0 && !isChapterCleared(26, b)) return '';
    return text;
  }

  // 已通关：best 达到该章 Boss 关（第 N 章 = N*10）
  function isChapterCleared(ch, best) {
    const n = Math.floor(Number(ch) || 0);
    const b = Math.max(0, Math.floor(Number(best) || 0));
    return n >= 1 && b >= n * CHAPTER_SIZE;
  }

  function clearedChapters(best) {
    const list = (window.GameConfig && window.GameConfig.BATTLE && window.GameConfig.BATTLE.CHAPTERS) || [];
    return list.filter((c) => c && isChapterCleared(c.chapter, best)).map((c) => ({
      chapter: c.chapter,
      name: c.name || '',
      title: chapterTitle(c.chapter),
      intro: chapterIntroText(c.chapter, best),
      bossStage: c.chapter * CHAPTER_SIZE
    }));
  }

  function introPart(ch) {
    const cd = chapterData(ch);
    if (!cd || !Array.isArray(cd.intro) || !cd.intro.length) return null;
    return { key: `c${ch}:intro`, lines: cd.intro, bossId: cd.bosses && cd.bosses[0] && cd.bosses[0].bossId };
  }

  function bossDialogueParts(ch) {
    const cd = chapterData(ch);
    if (!cd || !Array.isArray(cd.bosses) || !cd.bosses.length) return [];
    const out = [];
    cd.bosses.forEach((be) => {
      if (!be) return;
      if (Array.isArray(be.pre) && be.pre.length) out.push({ key: `b${be.stage}:pre`, lines: be.pre, bossId: be.bossId });
      const lines = [];
      const lw = lastWordsFor(be.bossId, be.stage);
      if (lw) lines.push({ speaker: 'Boss', text: lw, kind: 'last' });
      if (Array.isArray(be.post)) be.post.forEach((l) => lines.push(l));
      if (lines.length) out.push({ key: `b${be.stage}:post`, lines, bossId: be.bossId });
    });
    return out;
  }

  function currentBest() {
    const s = window.GameState && window.GameState.state;
    return (s && s.stage && s.stage.best) || 0;
  }

  function replayChapter(ch, kind, done) {
    if (open) return false;
    // 函数内部再校验已通关（第 N 章需 best >= N*10），未通关直接返回。
    if (!isChapterCleared(ch, currentBest())) return false;
    const parts = kind === 'boss' ? bossDialogueParts(ch) : (introPart(ch) ? [introPart(ch)] : []);
    if (!parts.length) {
      if (typeof done === 'function') done();
      return false;
    }
    return play(parts, done, { replay: true });
  }

  window.Story = {
    CHAPTER_SIZE,
    RECALL_TEXT,
    STORY_LINES,
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
    pendingStage1Fail,
    afterStageFail,
    finish,
    chapterTitle,
    chapterIntroText,
    isChapterCleared,
    clearedChapters,
    introPart,
    bossDialogueParts,
    replayChapter
  };
})();
