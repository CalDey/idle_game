// 因果回收：记录原机缘选择、把回收事件送进挂机机缘池、结算奖励与效果、因果簿。
// 存档字段 state.karma；旧档缺省由 normalize / mergeSave 补全。每条回收只触发一次（「再推一次」除外）。
(function () {
  const root = typeof window !== 'undefined' ? window : globalThis;
  const WEIGHT = 8;
  const PITY_CHAPTERS = 2;
  const DAY_MS = 24 * 60 * 60 * 1000;

  function data() {
    return root.KarmaData || {};
  }

  function callbacks() {
    return (data().CALLBACKS || []).slice();
  }

  function callbackById(id) {
    return callbacks().find((c) => c && c.id === id) || null;
  }

  function sourceIds() {
    return (data().SOURCE_IDS || []).slice();
  }

  function isSourceEvent(id) {
    return sourceIds().indexOf(id) >= 0;
  }

  function defaults() {
    return {
      v: 1,
      events: {},
      callbacks: {},
      effects: {},
      eligibleSince: {},
      bookUnlocked: false,
      noticeShown: false,
      pendingElite: null,
      prefightShown: false
    };
  }

  function clampInt(n, min, max) {
    const v = Math.floor(Number(n) || 0);
    if (!Number.isFinite(v)) return min;
    return Math.max(min, max == null ? v : Math.min(max, v));
  }

  function normalize(raw) {
    const d = defaults();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return d;
    d.v = 1;
    d.bookUnlocked = raw.bookUnlocked === true;
    d.noticeShown = raw.noticeShown === true;
    d.prefightShown = raw.prefightShown === true;
    if (raw.events && typeof raw.events === 'object' && !Array.isArray(raw.events)) {
      Object.keys(raw.events).forEach((id) => {
        if (!isSourceEvent(id)) return;
        const e = raw.events[id];
        if (!e || typeof e !== 'object') return;
        d.events[id] = {
          choice: clampInt(e.choice, 0, 2),
          stage: clampInt(e.stage, 0, 9999),
          best: clampInt(e.best, 0, 9999)
        };
      });
    }
    if (raw.callbacks && typeof raw.callbacks === 'object' && !Array.isArray(raw.callbacks)) {
      Object.keys(raw.callbacks).forEach((id) => {
        if (!callbackById(id)) return;
        const e = raw.callbacks[id];
        if (!e || typeof e !== 'object') return;
        const row = {
          closed: e.closed === true,
          choice: e.choice == null ? null : clampInt(e.choice, 0, 8),
          stage: clampInt(e.stage, 0, 9999)
        };
        if (e.deferredToChapter != null) row.deferredToChapter = clampInt(e.deferredToChapter, 0, 999);
        if (e.ledgerResult) row.ledgerResult = String(e.ledgerResult);
        if (e.ink) row.ink = e.ink === 'red' ? 'red' : 'pale';
        d.callbacks[id] = row;
      });
    }
    if (raw.effects && typeof raw.effects === 'object' && !Array.isArray(raw.effects)) {
      const e = raw.effects;
      if (e.artifactBuff) {
        d.effects.artifactBuff = {
          atkMult: Number(e.artifactBuff.atkMult) || 0,
          qiLossExtraPct: Number(e.artifactBuff.qiLossExtraPct) || 0
        };
      }
      if (e.gardenBonus) d.effects.gardenBonus = { dongfuStonePerSec: Number(e.gardenBonus.dongfuStonePerSec) || 0 };
      if (e.bossIntel) {
        d.effects.bossIntel = {
          stage: clampInt(e.bossIntel.stage, 1, 300),
          bossDmgMult: Number(e.bossIntel.bossDmgMult) || 0,
          showRecCp: e.bossIntel.showRecCp !== false,
          used: e.bossIntel.used === true
        };
      }
      if (e.dispatchBonus) {
        d.effects.dispatchBonus = {
          yield: Number(e.dispatchBonus.yield) || 0,
          expiresAt: Number(e.dispatchBonus.expiresAt) || 0
        };
      }
      if (e.heartRune) {
        d.effects.heartRune = {
          pending: e.heartRune.pending === true,
          consumed: e.heartRune.consumed === true,
          rateBonus: Number(e.heartRune.rateBonus) || 0,
          noQiLossOnFail: e.heartRune.noQiLossOnFail !== false,
          lingyu: clampInt(e.heartRune.lingyu, 0, 9999)
        };
      }
    }
    if (raw.eligibleSince && typeof raw.eligibleSince === 'object' && !Array.isArray(raw.eligibleSince)) {
      Object.keys(raw.eligibleSince).forEach((id) => {
        d.eligibleSince[id] = clampInt(raw.eligibleSince[id], 0, 999);
      });
    }
    if (raw.pendingElite && typeof raw.pendingElite === 'object') {
      d.pendingElite = { id: String(raw.pendingElite.id || ''), option: clampInt(raw.pendingElite.option, 0, 8) };
    }
    return d;
  }

  function ensureState(s) {
    if (!s || typeof s !== 'object') return defaults();
    const n = normalize(s.karma);
    if (!s.karma || typeof s.karma !== 'object' || Array.isArray(s.karma)) {
      s.karma = n;
      return n;
    }
    const k = s.karma;
    k.v = n.v;
    k.events = n.events;
    k.callbacks = n.callbacks;
    k.effects = n.effects;
    k.eligibleSince = n.eligibleSince;
    k.bookUnlocked = n.bookUnlocked;
    k.noticeShown = n.noticeShown;
    k.pendingElite = n.pendingElite;
    k.prefightShown = n.prefightShown;
    return k;
  }

  function chapterOf(s) {
    if (root.IdleEvents && typeof root.IdleEvents.chapterProgress === 'function') {
      return root.IdleEvents.chapterProgress(s);
    }
    const stage = (s && s.stage) || {};
    const n = Math.max(Number(s && s.lifeBestStage) || 0, Number(stage.best) || 0, Number(stage.cur) || 0);
    if (n <= 0) return 0;
    return Math.floor((n - 1) / 10) + 1;
  }

  function bestStageOf(s) {
    const stage = (s && s.stage) || {};
    return Math.max(Number(s && s.lifeBestStage) || 0, Number(stage.best) || 0, Number(stage.cur) || 0);
  }

  function currentStageOf(s) {
    const stage = (s && s.stage) || {};
    return Math.max(1, Number(stage.cur) || Number(stage.best) || Number(s && s.lifeBestStage) || 1);
  }

  function ownsHero(s, heroId) {
    if (!heroId || !s) return false;
    if (Array.isArray(s.unlockedHeroes) && s.unlockedHeroes.indexOf(heroId) >= 0) return true;
    if (Array.isArray(s.squad) && s.squad.indexOf(heroId) >= 0) return true;
    return s.heroId === heroId;
  }

  function eventText(s, ev) {
    if (!ev) return '';
    const own = ev.textIfOwned;
    if (own && ownsHero(s, own.heroId) && own.text) return own.text;
    return ev.text || '';
  }

  function presentation(s, ev) {
    return { text: eventText(s, ev), portrait: ev && ev.portrait ? ev.portrait : null };
  }

  function asIdleEvent(cb) {
    if (!cb || cb.auto) return null;
    return {
      id: cb.id,
      name: cb.name,
      pool: 'idle',
      karma: true,
      karmaQuote: true,
      minRealmStage: 0,
      minChapter: 0,
      portrait: cb.portrait || null,
      text: cb.text,
      textIfOwned: cb.textIfOwned,
      options: cb.options
    };
  }

  function idleEvents() {
    return callbacks().map(asIdleEvent).filter(Boolean);
  }

  function reqQiOf(s) {
    const GS = root.GameState;
    if (GS && typeof GS.getCurrentStage === 'function') {
      try {
        const st = GS.state === s ? GS.getCurrentStage() : null;
        if (st && st.reqQi) return Number(st.reqQi) || 0;
      } catch (err) { /* fall through */ }
    }
    const C = root.GameConfig;
    const stages = C && C.REALM_STAGES;
    if (Array.isArray(stages)) {
      const idx = Math.max(0, Math.min((Number(s && s.realmIndex) || 0), stages.length - 1));
      return Number(stages[idx] && stages[idx].reqQi) || 0;
    }
    return 0;
  }

  function perSec(s, env) {
    const e = env || {};
    const GS = root.GameState;
    const qi = Number.isFinite(Number(e.qiPerSec))
      ? Math.max(0, Number(e.qiPerSec))
      : (GS && GS.state === s && typeof GS.getQiPerSec === 'function' ? Math.max(0, GS.getQiPerSec()) : 0);
    const stone = Number.isFinite(Number(e.stonePerSec))
      ? Math.max(0, Number(e.stonePerSec))
      : (GS && GS.state === s && typeof GS.getStonePerSec === 'function' ? Math.max(0, GS.getStonePerSec()) : 0);
    return { qi, stone };
  }

  // 把定稿秒数/固定值折成当前报价。不走机缘 scaleQuote 的分钟中位数与桃/玉上限（一次性稀有奖励按数值表发放）。
  function scaleQuote(s, event, option, env) {
    const bag = (option && (option.rewardWin && env && env.eliteWin ? option.rewardWin : option.reward)) || {};
    const costBag = (option && option.cost) || {};
    const rate = perSec(s, env);
    const cost = {};
    const reward = {};
    if (Number(costBag.stonesSec) > 0) cost.stone = Math.max(1, Math.round(rate.stone * Number(costBag.stonesSec)));
    if (Number(costBag.qiSec) > 0) cost.qi = Math.max(1, Math.round(rate.qi * Number(costBag.qiSec)));
    if (Number(costBag.qiReqPct) > 0) cost.qi = Math.max(1, Math.floor(reqQiOf(s) * Number(costBag.qiReqPct)));
    if (Number(costBag.lingyu) > 0) cost.jade = Math.ceil(Number(costBag.lingyu));
    if (Number(bag.stonesSec) > 0) reward.stone = Math.max(1, Math.round(rate.stone * Number(bag.stonesSec)));
    if (Number(bag.qiSec) > 0) reward.qi = Math.max(1, Math.round(rate.qi * Number(bag.qiSec)));
    if (Number(bag.lingyu) > 0) reward.jade = Math.round(Number(bag.lingyu));
    if (Number(bag.peaches) > 0) reward.peach = Math.round(Number(bag.peaches));
    const have = {
      qi: Number(s.qi) || 0,
      stone: Number(s.stones) || 0,
      jade: Number(s.lingyu) || 0,
      peach: (s.tree && Number(s.tree.peaches)) || 0
    };
    const names = { qi: '灵气', stone: '灵石', jade: '灵玉', peach: '仙桃' };
    const lacking = Object.keys(cost).filter((k) => cost[k] > 0 && have[k] < cost[k]);
    return { cost, reward, notes: [], affordable: lacking.length === 0, lacking: lacking.map((k) => names[k]) };
  }

  function sourceEntry(s, eventId) {
    const k = ensureState(s);
    return k.events[eventId] || null;
  }

  function isEligible(s, ev) {
    if (!ev || !ev.karma) return null;
    const cb = callbackById(ev.id);
    if (!cb || cb.auto) return false;
    return callbackEligible(s, cb);
  }

  function callbackEligible(s, cb) {
    if (!cb || cb.auto) return false;
    const k = ensureState(s);
    const src = k.events[cb.source.event];
    if (!src || src.choice !== cb.source.choice) return false;
    const rec = k.callbacks[cb.id];
    if (rec && rec.closed) return false;
    const ch = chapterOf(s);
    if (rec && rec.deferredToChapter != null && ch < rec.deferredToChapter) return false;
    const trig = cb.trigger || {};
    if (trig.onNextMajorTribulation) return false;
    if (Number(trig.minChapter) > 0 && ch < Number(trig.minChapter)) return false;
    if (Number(trig.afterChapters) > 0) {
      const srcCh = src.stage > 0 ? Math.floor((src.stage - 1) / 10) + 1 : 0;
      if (ch < srcCh + Number(trig.afterChapters)) return false;
    }
    if (!k.eligibleSince[cb.id]) k.eligibleSince[cb.id] = ch;
    return true;
  }

  function shouldPity(s, ev) {
    if (!ev || !ev.karma) return false;
    const k = ensureState(s);
    const since = Number(k.eligibleSince[ev.id]) || 0;
    if (since <= 0) return false;
    return chapterOf(s) - since >= PITY_CHAPTERS;
  }

  function drawWeight(ev) {
    return ev && ev.karma ? WEIGHT : 1;
  }

  function heartRunePending(s) {
    const k = ensureState(s);
    const src = k.events.evt_array_eye;
    if (!src || src.choice !== 1) return false;
    const rec = k.callbacks.kc_heart_rune;
    if (rec && rec.closed) return false;
    const fx = k.effects.heartRune;
    if (fx && fx.consumed) return false;
    return true;
  }

  function heartRuneActive(s) {
    return heartRunePending(s);
  }

  function consumeHeartRune(s) {
    if (!heartRunePending(s)) return null;
    const k = ensureState(s);
    const cb = callbackById('kc_heart_rune');
    const opt = cb && cb.options && cb.options[0];
    const trib = (opt && opt.reward && opt.reward.tribulation) || { rateBonus: 0.30, noQiLossOnFail: true };
    const lingyu = (opt && opt.reward && opt.reward.lingyu) || 20;
    s.lingyu = (Number(s.lingyu) || 0) + lingyu;
    k.effects.heartRune = { pending: false, consumed: true, rateBonus: Number(trib.rateBonus) || 0.30, noQiLossOnFail: trib.noQiLossOnFail !== false, lingyu };
    k.callbacks.kc_heart_rune = {
      closed: true,
      choice: 0,
      stage: currentStageOf(s),
      ledgerResult: opt ? opt.ledgerResult : '心口阵纹：替你挡了一道雷。',
      ink: 'pale'
    };
    k.bookUnlocked = true;
    return {
      rateBonus: Number(trib.rateBonus) || 0.30,
      noQiLossOnFail: trib.noQiLossOnFail !== false,
      lingyu,
      tribulationLine: cb && cb.tribulationLine,
      resultText: opt && opt.resultText,
      ledgerResult: opt && opt.ledgerResult
    };
  }

  function gardenFactor(s) {
    const k = ensureState(s);
    const v = k.effects.gardenBonus && Number(k.effects.gardenBonus.dongfuStonePerSec);
    return v > 0 ? 1 + v : 1;
  }

  function battleMods(s) {
    const k = ensureState(s);
    const out = {};
    const atk = k.effects.artifactBuff && Number(k.effects.artifactBuff.atkMult);
    if (atk > 0) out.atkMult = 1 + atk;
    const intel = k.effects.bossIntel;
    const n = currentStageOf(s);
    if (intel && !intel.used && intel.bossDmgMult > 0 && n % 10 === 0 && n === intel.stage) {
      out.bossDmgMult = 1 + Number(intel.bossDmgMult);
    }
    return Object.keys(out).length ? out : null;
  }

  function consumeBossIntel(s, stageNum) {
    const k = ensureState(s);
    const intel = k.effects.bossIntel;
    if (!intel || intel.used) return;
    if (Number(stageNum) === intel.stage) intel.used = true;
  }

  function bossIntelFor(s, stageNum) {
    const k = ensureState(s);
    const intel = k.effects.bossIntel;
    if (!intel || intel.used) return null;
    if (Number(stageNum) === intel.stage) return intel;
    return null;
  }

  function dispatchYieldBonus(s, now) {
    const k = ensureState(s);
    const d = k.effects.dispatchBonus;
    if (!d || !(d.yield > 0)) return 0;
    const t = Number(now) || Date.now();
    if (t > d.expiresAt) return 0;
    return d.yield;
  }

  function onBattleLoss(s) {
    const k = ensureState(s);
    const buff = k.effects.artifactBuff;
    if (!buff || !(buff.qiLossExtraPct > 0)) return 0;
    const qi = Math.max(0, Number(s.qi) || 0);
    const cap = reqQiOf(s) * buff.qiLossExtraPct;
    const loss = Math.floor(Math.min(qi * buff.qiLossExtraPct, cap > 0 ? cap : qi * buff.qiLossExtraPct));
    if (loss > 0) s.qi = Math.max(0, qi - loss);
    return loss;
  }

  function nextBossStage(s) {
    const best = Math.max(Number((s.stage && s.stage.best) || 0), Number(s.lifeBestStage) || 0);
    const cur = Number((s.stage && s.stage.cur) || 0);
    const n = Math.max(best, cur, 1);
    const next = Math.ceil(n / 10) * 10;
    if (best >= next) return Math.min(300, next + 10);
    return next;
  }

  function applyEffect(s, option, now) {
    const fx = option && option.effect;
    if (!fx) return;
    const k = ensureState(s);
    if (fx.type === 'artifactBuff') {
      k.effects.artifactBuff = {
        atkMult: Number(fx.atkMult) || 0,
        qiLossExtraPct: Number(fx.onBattleLoss && fx.onBattleLoss.qiLossExtraPct) || 0
      };
    } else if (fx.type === 'gardenBonus') {
      k.effects.gardenBonus = { dongfuStonePerSec: Number(fx.dongfuStonePerSec) || 0 };
    } else if (fx.type === 'bossIntel') {
      k.effects.bossIntel = {
        stage: nextBossStage(s),
        bossDmgMult: Number(fx.bossDmgMult) || 0,
        showRecCp: fx.showRecCp !== false,
        used: false
      };
    } else if (fx.type === 'dispatchOrBondBonus') {
      const days = Number(fx.durationDays) || 7;
      k.effects.dispatchBonus = {
        yield: Number(fx.dispatchYield) || 0,
        expiresAt: (Number(now) || Date.now()) + days * DAY_MS
      };
    }
  }

  function recordSource(s, eventId, choice) {
    if (!isSourceEvent(eventId)) return null;
    const k = ensureState(s);
    if (k.events[eventId]) return { ok: false, reason: 'already' };
    const stage = currentStageOf(s);
    const best = Math.max(Number((s.stage && s.stage.best) || 0), Number(s.lifeBestStage) || 0);
    k.events[eventId] = { choice: clampInt(choice, 0, 2), stage, best };
    const first = !k.bookUnlocked;
    k.bookUnlocked = true;
    return { ok: true, first, toast: first && !k.noticeShown ? (data().LEDGER_UI || {}).firstAppearToast : '' };
  }

  function markNoticeShown(s) {
    const k = ensureState(s);
    k.noticeShown = true;
  }

  function afterSettle(s, event, optionIndex, env) {
    if (!event) return null;
    if (isSourceEvent(event.id)) return recordSource(s, event.id, optionIndex);
    const cb = callbackById(event.id);
    if (!cb) return null;
    return resolveCallback(s, cb, optionIndex, env);
  }

  function resolveCallback(s, cb, optionIndex, env) {
    const k = ensureState(s);
    if (!callbackEligible(s, cb) && !(k.pendingElite && k.pendingElite.id === cb.id)) {
      return { ok: false, reason: 'ineligible' };
    }
    const option = cb.options && cb.options[optionIndex];
    if (!option) return { ok: false, reason: 'bad_option' };
    const rec = k.callbacks[cb.id];
    if (rec && rec.closed) return { ok: false, reason: 'already' };

    if (option.keepOpen) {
      const ch = chapterOf(s);
      const wait = Number(option.retryAfterChapters) || 1;
      k.callbacks[cb.id] = {
        closed: false,
        choice: optionIndex,
        stage: currentStageOf(s),
        deferredToChapter: ch + wait,
        ledgerResult: option.ledgerResult,
        ink: option.ink === 'red' ? 'red' : 'pale'
      };
      delete k.eligibleSince[cb.id];
      return { ok: true, keepOpen: true, resultText: option.resultText, ledgerResult: option.ledgerResult };
    }

    if (option.effect && option.effect.type === 'eliteBattle') {
      k.pendingElite = { id: cb.id, option: optionIndex };
      k.callbacks[cb.id] = {
        closed: false,
        choice: optionIndex,
        stage: currentStageOf(s),
        ink: option.ink === 'red' ? 'red' : 'pale'
      };
      return { ok: true, pendingElite: true, resultText: '你照着阵图，去找那个修士。' };
    }

    applyEffect(s, option, (env || {}).now);
    k.callbacks[cb.id] = {
      closed: true,
      choice: optionIndex,
      stage: currentStageOf(s),
      ledgerResult: option.ledgerResult,
      ink: option.ink === 'red' ? 'red' : 'pale'
    };
    return { ok: true, resultText: option.resultText, ledgerResult: option.ledgerResult };
  }

  function eliteEnemy(s) {
    const B = root.Battle;
    const n = currentStageOf(s);
    if (!B || typeof B.enemyFor !== 'function') return { n, cp: 1, atk: 1, hp: 1, def: 1, isElite: true, name: '布阵修士' };
    const e = B.enemyFor(n);
    const mult = 1.35;
    if (!e.isElite) {
      e.cp *= mult;
      e.atk *= mult;
      e.hp *= mult;
      e.def *= mult;
      e.isElite = true;
    }
    e.name = e.name || '布阵修士';
    return e;
  }

  function finishElite(s, win, env) {
    const k = ensureState(s);
    const pend = k.pendingElite;
    if (!pend) return { ok: false, reason: 'no_pending' };
    const cb = callbackById(pend.id);
    const option = cb && cb.options && cb.options[pend.option];
    if (!option) return { ok: false, reason: 'bad_option' };
    k.pendingElite = null;
    const won = !!win;
    const resultText = won ? (option.resultWin || option.resultText) : (option.resultLose || '');
    k.callbacks[cb.id] = {
      closed: true,
      choice: pend.option,
      stage: currentStageOf(s),
      ledgerResult: option.ledgerResult,
      ink: option.ink === 'red' ? 'red' : 'pale',
      eliteWin: won
    };
    let quote = { cost: {}, reward: {}, notes: [], affordable: true, lacking: [] };
    if (won && option.rewardWin) {
      quote = scaleQuote(s, cb, option, Object.assign({}, env || {}, { eliteWin: true }));
      if (quote.reward.qi) {
        s.qi = (Number(s.qi) || 0) + quote.reward.qi;
        s.lifetimeQi = (Number(s.lifetimeQi) || 0) + quote.reward.qi;
      }
      if (quote.reward.stone) s.stones = (Number(s.stones) || 0) + quote.reward.stone;
      if (quote.reward.jade) s.lingyu = (Number(s.lingyu) || 0) + quote.reward.jade;
      if (quote.reward.peach) {
        if (!s.tree || typeof s.tree !== 'object') s.tree = {};
        s.tree.peaches = (Number(s.tree.peaches) || 0) + quote.reward.peach;
      }
    }
    return { ok: true, win: won, resultText, reward: quote.reward, cost: quote.cost };
  }

  function runEliteBattle(s, env) {
    const k = ensureState(s);
    if (!k.pendingElite) return { ok: false, reason: 'no_pending' };
    const B = root.Battle;
    let win = false;
    if (env && Object.prototype.hasOwnProperty.call(env, 'win')) {
      win = !!env.win;
    } else if (B && typeof B.createSession === 'function') {
      const enemy = eliteEnemy(s);
      const mods = root.Bonds && typeof root.Bonds.modsForState === 'function' ? root.Bonds.modsForState(s) : null;
      const seed = (Number((env || {}).seed) || (Date.now() ^ 0x9e3779b1)) >>> 0;
      const session = B.createSession(s, enemy, seed, mods);
      const sim = session && typeof session.runToEnd === 'function' ? session.runToEnd(true) : (B.simulate && B.simulate(B.playerStats(s), enemy.n, seed));
      win = !!(sim && sim.win);
    }
    return finishElite(s, win, env);
  }

  function ledgerEntries(s) {
    const k = ensureState(s);
    const ui = data().LEDGER_UI || {};
    const choices = ui.sourceChoices || {};
    const status = ui.status || { open: '此账未了', closed: '已了' };
    const out = [];
    sourceIds().forEach((sid) => {
      const src = k.events[sid];
      if (!src) return;
      const meta = (choices[sid] || [])[src.choice] || { text: '', ink: 'pale' };
      const cb = callbacks().find((c) => c.source.event === sid && c.source.choice === src.choice);
      const rec = cb ? k.callbacks[cb.id] : null;
      const closed = !!(rec && rec.closed);
      const name = cb ? cb.name : sid;
      out.push({
        sourceId: sid,
        callbackId: cb ? cb.id : '',
        name,
        choice: meta.text,
        choiceInk: meta.ink === 'red' ? 'red' : 'pale',
        status: closed ? status.closed : status.open,
        closed,
        ledgerResult: rec && rec.ledgerResult ? rec.ledgerResult : (closed && cb && cb.options && rec ? (cb.options[rec.choice] || {}).ledgerResult : ''),
        resultInk: rec && rec.ink ? rec.ink : 'pale'
      });
    });
    return out;
  }

  function formatEntry(row) {
    const ui = data().LEDGER_UI || {};
    const entry = String(ui.entryTemplate || '{name}　你当时：{choice}　{status}')
      .replace('{name}', row.name || '')
      .replace('{choice}', row.choice || '')
      .replace('{status}', row.status || '');
    const closed = row.closed && row.ledgerResult
      ? String(ui.closedTemplate || '{ledgerResult}').replace('{ledgerResult}', row.ledgerResult)
      : (!row.closed && row.ledgerResult ? row.ledgerResult : '');
    return { entry, closed, ink: row.choiceInk, resultInk: row.resultInk };
  }

  function bossPrefightLine(s, stageNum) {
    const n = Math.floor(Number(stageNum) || 0);
    const pf = data().BOSS_PREFIGHT || {};
    if (n !== (pf.stage || 30)) return null;
    const k = ensureState(s);
    if (k.prefightShown) return null;
    const src = k.events.evt_heifeng_tax;
    if (!src) return null;
    if ((src.best != null ? src.best : src.stage) >= n) return null;
    const line = pf.lines && pf.lines[src.choice];
    return line ? String(line) : null;
  }

  function markPrefightShown(s) {
    const k = ensureState(s);
    k.prefightShown = true;
  }

  const core = {
    WEIGHT,
    PITY_CHAPTERS,
    defaults,
    normalize,
    ensureState,
    callbacks,
    callbackById,
    sourceIds,
    isSourceEvent,
    idleEvents,
    eventText,
    presentation,
    scaleQuote,
    isEligible,
    callbackEligible,
    shouldPity,
    drawWeight,
    recordSource,
    markNoticeShown,
    afterSettle,
    resolveCallback,
    runEliteBattle,
    finishElite,
    eliteEnemy,
    ledgerEntries,
    formatEntry,
    bookUnlocked: (s) => ensureState(s).bookUnlocked,
    heartRunePending,
    heartRuneActive,
    consumeHeartRune,
    gardenFactor,
    battleMods,
    onBattleLoss,
    dispatchYieldBonus,
    bossIntelFor,
    consumeBossIntel,
    bossPrefightLine,
    markPrefightShown,
    chapterOf
  };
  root.Karma = core;
  if (typeof module !== 'undefined' && module.exports) module.exports = core;

  // ===================== 因果簿界面（仅浏览器） =====================
  if (typeof document === 'undefined' || !document.getElementById) return;

  let els = null;

  function bind() {
    els = {
      btn: document.getElementById('btn-karma-ledger'),
      gearBtn: document.getElementById('btn-karma-ledger-gear'),
      settingsBtn: document.getElementById('btn-open-karma-ledger'),
      modal: document.getElementById('karma-ledger-modal'),
      title: document.getElementById('karma-ledger-title'),
      desc: document.getElementById('karma-ledger-desc'),
      list: document.getElementById('karma-ledger-list'),
      empty: document.getElementById('karma-ledger-empty'),
      close: document.getElementById('btn-karma-ledger-close'),
      badge: document.getElementById('badge-karma-ledger')
    };
    if (!els.modal) {
      els = null;
      return;
    }
    const open = () => { render(); openModal(); };
    [els.btn, els.gearBtn, els.settingsBtn].forEach((b) => {
      if (b) b.addEventListener('click', open);
    });
    if (els.close) els.close.addEventListener('click', closeModal);
    els.modal.addEventListener('click', (e) => {
      if (e.target === els.modal) closeModal();
    });
  }

  function openModal() {
    if (!els) return;
    els.modal.classList.add('active');
    els.modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    if (!els) return;
    els.modal.classList.remove('active');
    els.modal.setAttribute('aria-hidden', 'true');
  }

  function render() {
    if (!els) return;
    const GS = root.GameState;
    if (!GS || !GS.state) return;
    const s = GS.state;
    const k = ensureState(s);
    const ui = data().LEDGER_UI || {};
    const unlocked = k.bookUnlocked;
    [els.btn, els.gearBtn, els.settingsBtn].forEach((b) => {
      if (!b) return;
      b.hidden = !unlocked;
    });
    if (els.title) els.title.textContent = ui.name || '因果簿';
    if (els.desc) els.desc.textContent = ui.tabDesc || '';
    const rows = ledgerEntries(s);
    if (els.empty) els.empty.hidden = rows.length > 0;
    if (els.list) {
      els.list.innerHTML = rows.map((row) => {
        const fmt = formatEntry(row);
        const smear = /█/.test(fmt.closed || '');
        return `<li class="karma-entry ink-${fmt.ink}${row.closed ? ' is-closed' : ''}${smear ? ' is-smeared' : ''}">
          <div class="karma-entry-main">${fmt.entry}</div>
          ${fmt.closed ? `<div class="karma-entry-result ink-${fmt.resultInk}">${fmt.closed}</div>` : ''}
        </li>`;
      }).join('');
    }
  }

  function tick() {
    if (!els) bind();
    if (els) render();
  }

  core.ui = { render: tick, open: () => { tick(); openModal(); }, close: closeModal, isOpen: () => !!(els && els.modal && els.modal.classList.contains('active')) };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { bind(); tick(); });
  else { bind(); tick(); }
})();
