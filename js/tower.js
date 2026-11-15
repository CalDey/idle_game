// 镇妖塔：独立于主线闯关的无尽爬塔，复用现有自走棋与 Boss 立绘。
// 每日 3 次失败次数，胜利不扣次；只发首通奖励（产出折算并封顶，不发道果）。
// 进度 state.tower.best 永久保留，轮回深拷贝保留。
(function () {
  const VERSION = 1;
  const UNLOCK_BEST = 20; // 首通第 20 关（第 2 章 Boss）后开启，避开与秘境（第 10 关）同时挤入
  const DAILY_FAILS = 3;
  const BOSS_EVERY = 5;
  const MILESTONE_EVERY = 10;
  const BASE_CP = 650;
  const GROWTH = 1.03;
  const BOSS_MULT = 1.35;
  const JADE_CAP_HOURS = 0.5;
  const JADE_CAP_MIN = 3;
  const PEACH_REWARD_CAP = 3;
  const QI_STONE_CAP_MINUTES = 6;

  function todayKey(now) {
    const d = new Date(now == null ? Date.now() : now);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function emptyTower(date) {
    return { v: VERSION, best: 0, claimed: 0, date: date || '', fails: 0 };
  }

  function normalize(raw) {
    const out = emptyTower('');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    out.best = Math.max(0, Math.floor(Number(raw.best) || 0));
    out.claimed = Math.max(0, Math.floor(Number(raw.claimed) || 0));
    if (out.claimed > out.best) out.claimed = out.best;
    out.date = typeof raw.date === 'string' ? raw.date : '';
    out.fails = Math.max(0, Math.min(DAILY_FAILS, Math.floor(Number(raw.fails) || 0)));
    return out;
  }

  function ensure(s, now) {
    if (!s || typeof s !== 'object') return emptyTower(todayKey(now));
    const key = todayKey(now);
    const cur = normalize(s.tower);
    if (cur.date !== key) {
      cur.date = key;
      cur.fails = 0;
    }
    s.tower = cur;
    return cur;
  }

  function bestStage(s) {
    return Math.max((s && s.stage && Number(s.stage.best)) || 0, (s && Number(s.lifeBestStage)) || 0);
  }

  function isUnlocked(s) {
    return bestStage(s) >= UNLOCK_BEST;
  }

  function isBossFloor(floor) {
    const f = Math.floor(Number(floor) || 0);
    return f > 0 && f % BOSS_EVERY === 0;
  }

  function isMilestoneFloor(floor) {
    const f = Math.floor(Number(floor) || 0);
    return f > 0 && f % MILESTONE_EVERY === 0;
  }

  function floorCp(floor) {
    const f = Math.max(1, Math.floor(Number(floor) || 1));
    const raw = BASE_CP * Math.pow(GROWTH, f - 1) * (isBossFloor(f) ? BOSS_MULT : 1);
    return Math.max(1, Math.round(raw));
  }

  function bosses() {
    const B = window.GameConfig && window.GameConfig.BATTLE;
    return (B && Array.isArray(B.BOSSES) && B.BOSSES) || [];
  }

  function regions() {
    const B = window.GameConfig && window.GameConfig.BATTLE;
    return (B && Array.isArray(B.REGIONS) && B.REGIONS) || [];
  }

  function floorEnemy(floor) {
    const f = Math.max(1, Math.floor(Number(floor) || 1));
    const boss = isBossFloor(f);
    const cp = floorCp(f);
    const B = (window.GameConfig && window.GameConfig.BATTLE) || {};
    const split = B.SPLIT || { atk: 0.04, hp: 0.4, def: 0.0165 };
    const chapter = Math.min(30, 1 + Math.floor((f - 1) / 10));
    const regionIdx = Math.min(5, Math.floor((chapter - 1) / 5));
    const regs = regions();
    const regionObj = regs[regionIdx] || regs[0] || { name: '凡尘野地', mobs: [{ name: '妖兽', img: 'placeholder' }] };
    let name = '镇妖塔守卫';
    let img = 'placeholder';
    if (boss) {
      const list = bosses();
      const idx = list.length ? (f / BOSS_EVERY - 1) % list.length : 0;
      const entry = list[idx] || list[0];
      if (entry) {
        name = entry.name || name;
        img = entry.img || img;
      }
    } else {
      const mobs = regionObj.mobs || [];
      const entry = mobs.length ? mobs[(f - 1) % mobs.length] : null;
      name = entry && typeof entry === 'object' ? entry.name : entry || name;
      img = entry && typeof entry === 'object' ? entry.img || 'placeholder' : 'placeholder';
    }
    return {
      n: f,
      towerFloor: f,
      chapter,
      stageInChapter: ((f - 1) % 10) + 1,
      region: regionObj.name,
      name,
      img,
      isBoss: boss,
      isMilestone: isMilestoneFloor(f),
      cp,
      atk: cp * split.atk,
      hp: cp * split.hp,
      def: cp * split.def,
      spd: 100 + 0.4 * f,
      crit: 0.05,
      critDmg: 1.5,
      cd: 1.5
    };
  }

  function currentFloor(s) {
    const t = ensure(s);
    return (t.best || 0) + 1;
  }

  function failsLeft(s, now) {
    const t = ensure(s, now);
    return Math.max(0, DAILY_FAILS - (t.fails || 0));
  }

  function canChallenge(s, now) {
    if (!s) return { ok: false, reason: 'no_state' };
    if (!isUnlocked(s)) return { ok: false, reason: 'locked', need: UNLOCK_BEST };
    if (window.Battle && typeof window.Battle.canStartBattle === 'function') {
      const chk = window.Battle.canStartBattle(s);
      if (!chk.ok) return { ok: false, reason: 'empty_squad', message: chk.message };
    }
    const left = failsLeft(s, now);
    if (left <= 0) return { ok: false, reason: 'no_attempts', left: 0 };
    return { ok: true, floor: currentFloor(s), left };
  }

  function rates(s, env) {
    const e = env || {};
    let qi = Number(e.qiPerSec);
    let stone = Number(e.stonePerSec);
    const GS = window.GameState;
    if (!Number.isFinite(qi) || qi < 0) qi = GS && typeof GS.getQiPerSec === 'function' ? Number(GS.getQiPerSec()) || 0 : 1;
    if (!Number.isFinite(stone) || stone < 0) {
      stone = GS && typeof GS.getStonePerSec === 'function' ? Number(GS.getStonePerSec()) || 0 : 0.5;
    }
    return { qiPerSec: Math.max(0, qi), stonePerSec: Math.max(0, stone) };
  }

  function jadeCapFor(s) {
    const best = (s && s.stage && Number(s.stage.best)) || 0;
    return Math.max(JADE_CAP_MIN, Math.ceil((6 + 0.4 * best) * JADE_CAP_HOURS));
  }

  function rewardSpec(floor) {
    const boss = isBossFloor(floor);
    const mile = isMilestoneFloor(floor);
    const jade = mile ? Math.min(8, 4 + Math.floor(floor / 20)) : boss ? Math.min(5, 2 + Math.floor(floor / 20)) : 1;
    return {
      qiMin: boss ? 3 : 2,
      stoneMin: boss ? 3 : 2,
      peach: boss ? 2 : 1,
      jade
    };
  }

  function scaleReward(s, floor, env) {
    const spec = rewardSpec(floor);
    const r = rates(s, env);
    const reward = {};
    if (spec.qiMin > 0) {
      const n = Math.round(r.qiPerSec * 60 * Math.min(QI_STONE_CAP_MINUTES, spec.qiMin));
      if (n > 0) reward.qi = n;
    }
    if (spec.stoneMin > 0) {
      const n = Math.round(r.stonePerSec * 60 * Math.min(QI_STONE_CAP_MINUTES, spec.stoneMin));
      if (n > 0) reward.stone = n;
    }
    if (spec.jade > 0) {
      reward.jade = Math.max(1, Math.min(Math.round(spec.jade), jadeCapFor(s)));
    }
    if (spec.peach > 0) {
      reward.peach = Math.max(1, Math.min(Math.round(spec.peach), PEACH_REWARD_CAP));
    }
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
      if (!s.tree || typeof s.tree !== 'object') s.tree = {};
      s.tree.peaches = (Number(s.tree.peaches) || 0) + rw.peach;
    }
    return rw;
  }

  function alreadyClaimed(s, floor, now) {
    const t = ensure(s, now);
    return floor <= (t.claimed || 0);
  }

  function settleWin(s, floor, env, now) {
    if (!s) return { ok: false, reason: 'no_state' };
    const f = Math.max(1, Math.floor(Number(floor) || 0));
    const t = ensure(s, now);
    const expect = (t.best || 0) + 1;
    if (f !== expect) return { ok: false, reason: 'out_of_order', expect, floor: f, daily: t };
    let reward = null;
    let first = false;
    if (f > (t.claimed || 0)) {
      reward = grantReward(s, scaleReward(s, f, env));
      t.claimed = f;
      first = true;
    }
    t.best = f;
    return { ok: true, first, reward: reward || {}, floor: f, best: t.best, daily: t };
  }

  function settleLoss(s, floor, now) {
    if (!s) return { ok: false, reason: 'no_state' };
    const t = ensure(s, now);
    if (t.fails < DAILY_FAILS) t.fails += 1;
    return { ok: true, fails: t.fails, left: Math.max(0, DAILY_FAILS - t.fails), best: t.best, floor: currentFloor(s) };
  }

  function estimateWinnable(s, floor, opts) {
    if (!s || !window.Battle) return false;
    const enemy = floorEnemy(floor);
    const runs = (opts && opts.runs) || 8;
    const thresh = opts && opts.thresh != null ? opts.thresh : 0.5;
    const p = window.Battle.playerStats(s);
    if (p && enemy && p.cp >= enemy.cp * 1.25) return true;
    if (p && enemy && p.cp < enemy.cp * 0.55) return false;
    const mods = opts && opts.mods;
    return window.Battle.winRate(s, enemy, runs, mods) >= thresh;
  }

  function hasRedDot(s, now, opts) {
    if (!canChallenge(s, now).ok) return false;
    return estimateWinnable(s, currentFloor(s), opts);
  }

  const core = {
    VERSION,
    UNLOCK_BEST,
    DAILY_FAILS,
    BOSS_EVERY,
    MILESTONE_EVERY,
    BASE_CP,
    GROWTH,
    BOSS_MULT,
    JADE_CAP_HOURS,
    JADE_CAP_MIN,
    PEACH_REWARD_CAP,
    QI_STONE_CAP_MINUTES,
    todayKey,
    normalize,
    emptyTower,
    ensure,
    isUnlocked,
    isBossFloor,
    isMilestoneFloor,
    floorCp,
    floorEnemy,
    currentFloor,
    failsLeft,
    canChallenge,
    scaleReward,
    rewardSpec,
    settleWin,
    settleLoss,
    alreadyClaimed,
    estimateWinnable,
    hasRedDot,
    jadeCapFor
  };

  window.Tower = core;
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
})();

(function () {
  const RES_NAMES = { qi: '灵气', stone: '灵石', jade: '灵玉', peach: '仙桃' };
  let els = null;
  let winCache = { key: '', rate: 0, rec: 0, at: 0 };
  let dotCache = { key: '', on: false, at: 0 };

  function fmt(n) {
    const x = Math.floor(Number(n) || 0);
    if (typeof window.formatNumber === 'function') return window.formatNumber(x);
    return String(x);
  }

  // 与闯关一致：羁绊 + 灵兽 + 道途只经 Bonds.modsForState 合并一次
  function battleMods(s) {
    const Bd = window.Bonds;
    return Bd && typeof Bd.modsForState === 'function' ? Bd.modsForState(s) : null;
  }

  function previewCacheSig(s) {
    const Bs = window.Beasts;
    const b = Bs && s ? Bs.activeBeast(s) : null;
    const beast = b ? `${b.id}${Bs.levelOf(s, b.id)}` : '';
    const P = window.Path;
    const path = P && typeof P.signature === 'function' ? P.signature(s) : '';
    return `${beast}|${path}`;
  }

  function env() {
    const GS = window.GameState;
    if (!GS) return { qiPerSec: 1, stonePerSec: 0.5, now: Date.now() };
    return {
      qiPerSec: typeof GS.getQiPerSec === 'function' ? GS.getQiPerSec() : 1,
      stonePerSec: typeof GS.getStonePerSec === 'function' ? GS.getStonePerSec() : 0.5,
      now: Date.now()
    };
  }

  function rewardText(rw) {
    if (!rw) return '';
    return ['jade', 'peach', 'qi', 'stone']
      .filter((k) => rw[k])
      .map((k) => `${RES_NAMES[k]}+${fmt(rw[k])}`)
      .join(' · ');
  }

  function renderEntry() {
    const badge = document.getElementById('badge-tower');
    const T = window.Tower;
    const GS = window.GameState;
    if (!T || !GS || !GS.state) return;
    const s = GS.state;
    if (!T.isUnlocked(s)) {
      if (badge) badge.classList.remove('visible');
      if (window.MoreMenu && typeof window.MoreMenu.refresh === 'function') window.MoreMenu.refresh();
      return;
    }
    const tw = T.ensure(s, Date.now());
    const left = T.failsLeft(s, Date.now());
    let dot = false;
    if (left > 0) {
      const p = window.Battle && window.Battle.playerStats(s);
      const squad = window.Battle && window.Battle.getSquadIds ? window.Battle.getSquadIds(s).join(',') : '';
      const key = `${T.currentFloor(s)}:${Math.round((p && p.cp) || 0)}:${squad}:${tw.date}:${left}:${previewCacheSig(s)}`;
      if (dotCache.key === key && Date.now() - dotCache.at < 5000) {
        dot = dotCache.on;
      } else {
        dot = T.hasRedDot(s, Date.now(), { runs: 8, mods: battleMods(s) });
        dotCache = { key, on: dot, at: Date.now() };
      }
    }
    if (badge) badge.classList.toggle('visible', dot);
    if (window.MoreMenu && typeof window.MoreMenu.refresh === 'function') window.MoreMenu.refresh();
  }

  function previewRate(s, floor) {
    const T = window.Tower;
    const Battle = window.Battle;
    if (!T || !Battle) return { rate: 0, rec: 0 };
    const enemy = T.floorEnemy(floor);
    const p = Battle.playerStats(s);
    const form = s && s.formation ? JSON.stringify(s.formation) : '';
    const squad = Battle.getSquadIds ? Battle.getSquadIds(s).join(',') : '';
    const key = `${floor}:${Math.round((p && p.cp) || 0)}:${squad}:${form}:${previewCacheSig(s)}`;
    if (winCache.key === key && Date.now() - winCache.at < 4000) return winCache;
    const mods = battleMods(s);
    const rate = Battle.winRate(s, enemy, 12, mods);
    const rec = Battle.recommendedCp(s, enemy, { runs: 12, mods });
    winCache = { key, rate, rec, at: Date.now() };
    return winCache;
  }

  function renderPanel() {
    if (!els || !window.Tower || !window.GameState || !window.GameState.state) return;
    const s = window.GameState.state;
    const T = window.Tower;
    const now = Date.now();
    T.ensure(s, now);
    const unlocked = T.isUnlocked(s);
    const floor = T.currentFloor(s);
    const t = s.tower;
    const enemy = T.floorEnemy(floor);
    const left = T.failsLeft(s, now);
    const chk = T.canChallenge(s, now);
    if (els.best) els.best.textContent = t.best > 0 ? `最高 ${t.best} 层` : '尚未通关';
    if (els.floor) {
      els.floor.textContent = unlocked
        ? `第 ${floor} 层${enemy.isBoss ? ' · Boss' : ''}${enemy.isMilestone ? ' · 里程碑' : ''}`
        : `通关第 ${T.UNLOCK_BEST} 关后开启`;
    }
    if (els.enemy) els.enemy.textContent = unlocked ? `【${enemy.name}】 战力 ${fmt(enemy.cp)}` : '镇妖塔尚未开启';
    if (els.tries) els.tries.textContent = `今日失败次数剩余 ${left}/${T.DAILY_FAILS}（胜利不扣次）`;
    if (els.reward) {
      if (!unlocked) els.reward.textContent = '';
      else if (T.alreadyClaimed(s, floor, now)) els.reward.textContent = '本层首通奖励已领取';
      else els.reward.textContent = `首通：${rewardText(T.scaleReward(s, floor, env())) || '—'}`;
    }
    if (els.hint) {
      if (!unlocked) els.hint.textContent = `首通主线第 ${T.UNLOCK_BEST} 关（第 2 章 Boss）后开启。进度永久保留，轮回不重置。`;
      else if (!chk.ok && chk.reason === 'no_attempts') els.hint.textContent = '今日失败次数已用尽，明日再来。';
      else if (!chk.ok && chk.reason === 'empty_squad') els.hint.textContent = '请先在闯关【队伍】中选择至少 1 名角色上阵。';
      else els.hint.textContent = '每 5 层为 Boss 关（复用现有首领立绘），每 10 层额外赠送灵玉。只发首通奖，不发道果。';
    }
    if (els.rate && unlocked && window.Battle && chk.reason !== 'empty_squad') {
      const prev = previewRate(s, floor);
      const label = window.Battle.winRateLabel(prev.rate);
      els.rate.textContent = `预估 ${label} · 推荐战力 ${fmt(prev.rec)}`;
    } else if (els.rate) {
      els.rate.textContent = '';
    }
    if (els.btn) {
      if (!unlocked) {
        els.btn.disabled = true;
        els.btn.textContent = '尚未开启';
      } else if (!chk.ok && chk.reason === 'no_attempts') {
        els.btn.disabled = true;
        els.btn.textContent = '今日次数已尽';
      } else if (!chk.ok) {
        els.btn.disabled = true;
        els.btn.textContent = '无法挑战';
      } else {
        els.btn.disabled = false;
        els.btn.textContent = `挑战第 ${floor} 层`;
      }
    }
    if (els.toast && !els.toast.dataset.keep) {
      // leave last result until next open overwrites in open()
    }
    renderEntry();
  }

  function showToast(text) {
    if (!els || !els.toast) return;
    if (!text) {
      els.toast.hidden = true;
      els.toast.textContent = '';
      els.toast.dataset.keep = '';
      return;
    }
    els.toast.hidden = false;
    els.toast.textContent = text;
    els.toast.dataset.keep = '1';
  }

  function open() {
    if (!els || !els.modal) return;
    showToast('');
    renderPanel();
    els.modal.classList.add('active');
    els.modal.setAttribute('aria-hidden', 'false');
  }

  function close() {
    if (!els || !els.modal) return;
    els.modal.classList.remove('active');
    els.modal.setAttribute('aria-hidden', 'true');
    renderEntry();
  }

  function onChallenge() {
    const GS = window.GameState;
    if (!GS || !GS.state || !window.Tower) return;
    const chk = window.Tower.canChallenge(GS.state, Date.now());
    if (!chk.ok) {
      renderPanel();
      return;
    }
    if (window.StageUI && typeof window.StageUI.startTowerBattle === 'function') {
      close();
      window.StageUI.startTowerBattle();
    }
  }

  function init() {
    els = {
      badge: document.getElementById('badge-tower'),
      modal: document.getElementById('tower-modal'),
      close: document.getElementById('btn-close-tower'),
      best: document.getElementById('tower-best'),
      floor: document.getElementById('tower-floor'),
      enemy: document.getElementById('tower-enemy'),
      tries: document.getElementById('tower-tries'),
      reward: document.getElementById('tower-reward'),
      rate: document.getElementById('tower-rate'),
      hint: document.getElementById('tower-hint'),
      btn: document.getElementById('btn-tower-challenge'),
      toast: document.getElementById('tower-toast')
    };
    els.btn = document.getElementById('btn-tower-challenge');
    if (!els.modal) {
      els = null;
      return;
    }
    if (els.close) els.close.addEventListener('click', close);
    if (els.btn) els.btn.addEventListener('click', onChallenge);
    renderEntry();
  }

  window.TowerUI = {
    open,
    close,
    refresh: renderEntry,
    renderEntry,
    renderPanel,
    showToast,
    previewRate
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
