// 每日功课与七日签到：打包已有行为（闯关、秘境、机缘、突破、功法/洞府、摘桃），
// 活跃度宝箱与累计七日签到。按本地日历日 0 点重置功课；签到按累计天数，漏签不重置。
// 奖励按当前产出折算并封顶（与机缘同一套口径），不发放道果。
(function () {
  const VERSION = 1;
  const POINTS_GOAL = 100;
  const JADE_CAP_HOURS = 0.5;
  const JADE_CAP_MIN = 3;
  const PEACH_REWARD_CAP = 5;
  const QI_STONE_CAP_MINUTES = 8;
  const DAY7_JADE_CAP_HOURS = 1;
  const DAY7_PEACH_CAP = 8;
  const DAY7_QI_STONE_CAP_MINUTES = 12;

  const TASKS = [
    { id: 'breakthrough', name: '尝试突破', desc: '渡劫突破 1 次（成败皆计）', target: 1, points: 20 },
    { id: 'home_upgrade', name: '参悟扩建', desc: '升级功法或洞府 1 次', target: 1, points: 20 },
    { id: 'peach_pick', name: '摘桃炼宝', desc: '摘桃炼化 1 次', target: 1, points: 20, unlock: 'peach' },
    { id: 'stage_clear', name: '闯关通关', desc: '闯关获胜 2 次', target: 2, points: 20, unlock: 'stage' },
    { id: 'event_choice', name: '机缘抉择', desc: '完成 1 次机缘事件选择', target: 1, points: 20 },
    { id: 'mijing_run', name: '秘境劫运', desc: '开启 1 次秘境劫运', target: 1, points: 20, unlock: 'mijing' }
  ];

  const CHESTS = [
    { id: 'c20', at: 20, qiMin: 3, stoneMin: 3, jade: 0, peach: 0 },
    { id: 'c40', at: 40, qiMin: 4, stoneMin: 4, jade: 3, peach: 2 },
    { id: 'c60', at: 60, qiMin: 5, stoneMin: 5, jade: 5, peach: 3 },
    { id: 'c80', at: 80, qiMin: 6, stoneMin: 6, jade: 8, peach: 4 },
    { id: 'c100', at: 100, qiMin: 8, stoneMin: 8, jade: 12, peach: 5 }
  ];

  const CHECKIN = [
    { day: 1, peach: 2 },
    { day: 2, qiMin: 3 },
    { day: 3, jade: 4 },
    { day: 4, peach: 3, stoneMin: 3 },
    { day: 5, jade: 6 },
    { day: 6, peach: 4, qiMin: 5 },
    { day: 7, peach: 8, qiMin: 12, stoneMin: 12, jade: 20, notable: true }
  ];

  function todayKey(now) {
    const d = new Date(now == null ? Date.now() : now);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function emptyDaily(date) {
    return {
      v: VERSION,
      date: date || '',
      points: 0,
      tasks: {},
      chests: {},
      checkin: { cycleDay: 0, last: '', total: 0 }
    };
  }

  function normalize(raw) {
    const out = emptyDaily('');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    out.date = typeof raw.date === 'string' ? raw.date : '';
    out.points = Math.max(0, Math.floor(Number(raw.points) || 0));
    if (raw.tasks && typeof raw.tasks === 'object' && !Array.isArray(raw.tasks)) {
      Object.keys(raw.tasks).forEach((k) => {
        out.tasks[k] = Math.max(0, Math.floor(Number(raw.tasks[k]) || 0));
      });
    }
    if (raw.chests && typeof raw.chests === 'object' && !Array.isArray(raw.chests)) {
      Object.keys(raw.chests).forEach((k) => {
        if (raw.chests[k]) out.chests[k] = true;
      });
    }
    const c = raw.checkin && typeof raw.checkin === 'object' && !Array.isArray(raw.checkin) ? raw.checkin : {};
    let cycleDay = Math.max(0, Math.floor(Number(c.cycleDay) || 0));
    if (cycleDay > 7) cycleDay = 7;
    out.checkin.cycleDay = cycleDay;
    out.checkin.last = typeof c.last === 'string' ? c.last : '';
    out.checkin.total = Math.max(0, Math.floor(Number(c.total) || 0));
    return out;
  }

  function ensure(s, now) {
    if (!s || typeof s !== 'object') return emptyDaily(todayKey(now));
    const key = todayKey(now);
    const cur = normalize(s.daily);
    if (cur.date !== key) {
      const kept = cur.checkin;
      const next = emptyDaily(key);
      next.checkin = kept;
      s.daily = next;
      return next;
    }
    s.daily = cur;
    return cur;
  }

  function peachUnlockRealm() {
    const C = window.GameConfig;
    return (C && C.PEACH && Number.isFinite(Number(C.PEACH.UNLOCK_REALM)) ? Number(C.PEACH.UNLOCK_REALM) : 1);
  }

  function stageUnlockRealm() {
    const C = window.GameConfig;
    return (C && C.BATTLE && Number.isFinite(Number(C.BATTLE.UNLOCK_REALM)) ? Number(C.BATTLE.UNLOCK_REALM) : 2);
  }

  function mijingUnlockBest() {
    return (window.Mijing && Number.isFinite(Number(window.Mijing.UNLOCK_BEST)) ? Number(window.Mijing.UNLOCK_BEST) : 10);
  }

  function isUnlocked(s, task) {
    if (!task || !task.unlock) return true;
    if (task.unlock === 'peach') return (Number(s.realmIndex) || 0) >= peachUnlockRealm();
    if (task.unlock === 'stage') return (Number(s.realmIndex) || 0) >= stageUnlockRealm();
    if (task.unlock === 'mijing') return ((s.stage && Number(s.stage.best)) || 0) >= mijingUnlockBest();
    return true;
  }

  function unlockHint(task) {
    if (!task || !task.unlock) return '';
    if (task.unlock === 'peach') return '搬血中开启摘桃后可完成';
    if (task.unlock === 'stage') return '搬血后开启闯关后可完成';
    if (task.unlock === 'mijing') return `通关第 ${mijingUnlockBest()} 关后可完成`;
    return '尚未开启';
  }

  function findTask(id) {
    return TASKS.find((t) => t.id === id) || null;
  }

  function note(s, hookId, amount, now) {
    if (!s) return { ok: false, reason: 'no_state' };
    const task = findTask(hookId);
    if (!task) return { ok: false, reason: 'unknown_hook' };
    const d = ensure(s, now);
    if (!isUnlocked(s, task)) return { ok: false, reason: 'locked' };
    const add = Math.max(0, Math.floor(Number(amount) || 0) || (amount == null ? 1 : 0));
    if (add <= 0) return { ok: false, reason: 'no_amount' };
    const before = Math.max(0, Number(d.tasks[task.id]) || 0);
    if (before >= task.target) return { ok: false, reason: 'already_done', daily: d };
    const after = Math.min(task.target, before + add);
    d.tasks[task.id] = after;
    if (before < task.target && after >= task.target) {
      d.points = (Number(d.points) || 0) + task.points;
    }
    return { ok: true, daily: d, progress: after, completed: after >= task.target };
  }

  function hook(s, hookId, amount, now) {
    const res = note(s || (window.GameState && window.GameState.state), hookId, amount, now);
    if (window.DailyUI && typeof window.DailyUI.refresh === 'function') window.DailyUI.refresh();
    return res;
  }

  function rates(s, env) {
    const e = env || {};
    let qi = Number(e.qiPerSec);
    let stone = Number(e.stonePerSec);
    const GS = window.GameState;
    if (!Number.isFinite(qi) || qi < 0) {
      qi = GS && typeof GS.getQiPerSec === 'function' ? Number(GS.getQiPerSec()) || 0 : 1;
    }
    if (!Number.isFinite(stone) || stone < 0) {
      stone = GS && typeof GS.getStonePerSec === 'function' ? Number(GS.getStonePerSec()) || 0 : 0.5;
    }
    return { qiPerSec: Math.max(0, qi), stonePerSec: Math.max(0, stone) };
  }

  function jadeCapFor(s, hours) {
    const best = (s && s.stage && Number(s.stage.best)) || 0;
    const h = hours == null ? JADE_CAP_HOURS : hours;
    return Math.max(JADE_CAP_MIN, Math.ceil((6 + 0.4 * best) * h));
  }

  function scaleSpec(s, spec, env, opts) {
    const o = opts || {};
    const r = rates(s, env);
    const capMin = o.qiStoneCapMinutes == null ? QI_STONE_CAP_MINUTES : o.qiStoneCapMinutes;
    const peachCap = o.peachCap == null ? PEACH_REWARD_CAP : o.peachCap;
    const jHours = o.jadeCapHours == null ? JADE_CAP_HOURS : o.jadeCapHours;
    const reward = {};
    if (Number(spec.qiMin) > 0) {
      const min = Math.min(capMin, Number(spec.qiMin));
      const n = Math.round(r.qiPerSec * 60 * min);
      if (n > 0) reward.qi = n;
    }
    if (Number(spec.stoneMin) > 0) {
      const min = Math.min(capMin, Number(spec.stoneMin));
      const n = Math.round(r.stonePerSec * 60 * min);
      if (n > 0) reward.stone = n;
    }
    if (Number(spec.jade) > 0) {
      reward.jade = Math.max(1, Math.min(Math.round(Number(spec.jade)), jadeCapFor(s, jHours)));
    }
    if (Number(spec.peach) > 0) {
      reward.peach = Math.max(1, Math.min(Math.round(Number(spec.peach)), peachCap));
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

  function findChest(id) {
    return CHESTS.find((c) => c.id === id) || null;
  }

  function claimChest(s, chestId, env, now) {
    if (!s) return { ok: false, reason: 'no_state' };
    const chest = findChest(chestId);
    if (!chest) return { ok: false, reason: 'bad_chest' };
    const d = ensure(s, now);
    if ((Number(d.points) || 0) < chest.at) return { ok: false, reason: 'not_enough', daily: d };
    if (d.chests[chest.id]) return { ok: false, reason: 'already_claimed', daily: d };
    const reward = scaleSpec(s, chest, env);
    grantReward(s, reward);
    d.chests[chest.id] = true;
    return { ok: true, reward, daily: d, chest };
  }

  function nextCheckinDay(d) {
    const n = Number(d && d.checkin && d.checkin.cycleDay) || 0;
    return n >= 7 ? 1 : n + 1;
  }

  function checkinAvailable(s, now) {
    const d = ensure(s, now);
    return d.checkin.last !== todayKey(now);
  }

  function claimCheckin(s, env, now) {
    if (!s) return { ok: false, reason: 'no_state' };
    const d = ensure(s, now);
    const key = todayKey(now);
    if (d.checkin.last === key) return { ok: false, reason: 'already_claimed', daily: d };
    const day = nextCheckinDay(d);
    const spec = CHECKIN[day - 1];
    const opts = spec.notable
      ? { qiStoneCapMinutes: DAY7_QI_STONE_CAP_MINUTES, peachCap: DAY7_PEACH_CAP, jadeCapHours: DAY7_JADE_CAP_HOURS }
      : {};
    const reward = scaleSpec(s, spec, env, opts);
    grantReward(s, reward);
    d.checkin.cycleDay = day;
    d.checkin.last = key;
    d.checkin.total = (Number(d.checkin.total) || 0) + 1;
    return { ok: true, day, reward, daily: d, notable: Boolean(spec.notable) };
  }

  function hasClaimable(s, now) {
    if (!s) return false;
    const d = ensure(s, now);
    if (d.checkin.last !== todayKey(now)) return true;
    return CHESTS.some((c) => (Number(d.points) || 0) >= c.at && !d.chests[c.id]);
  }

  function snapshot(s, now, env) {
    const d = ensure(s, now);
    const key = todayKey(now);
    const tasks = TASKS.map((t) => {
      const progress = Math.max(0, Number(d.tasks[t.id]) || 0);
      const unlocked = isUnlocked(s, t);
      return {
        id: t.id,
        name: t.name,
        desc: t.desc,
        target: t.target,
        points: t.points,
        progress: unlocked ? Math.min(t.target, progress) : 0,
        done: unlocked && progress >= t.target,
        unlocked,
        hint: unlocked ? '' : unlockHint(t)
      };
    });
    const chests = CHESTS.map((c) => ({
      id: c.id,
      at: c.at,
      ready: (Number(d.points) || 0) >= c.at,
      claimed: Boolean(d.chests[c.id]),
      reward: scaleSpec(s, c, env)
    }));
    const day = nextCheckinDay(d);
    const spec = CHECKIN[day - 1];
    const opts = spec.notable
      ? { qiStoneCapMinutes: DAY7_QI_STONE_CAP_MINUTES, peachCap: DAY7_PEACH_CAP, jadeCapHours: DAY7_JADE_CAP_HOURS }
      : {};
    const newCycle = (Number(d.checkin.cycleDay) || 0) >= 7 && d.checkin.last !== key;
    const days = CHECKIN.map((c) => {
      return {
        day: c.day,
        claimed: !newCycle && (Number(d.checkin.cycleDay) || 0) >= c.day,
        current: d.checkin.last !== key && c.day === day,
        notable: Boolean(c.notable),
        reward: scaleSpec(s, c, env, c.notable ? opts : {})
      };
    });
    return {
      date: d.date,
      points: Number(d.points) || 0,
      goal: POINTS_GOAL,
      tasks,
      chests,
      checkin: {
        available: d.checkin.last !== key,
        day,
        last: d.checkin.last,
        cycleDay: Number(d.checkin.cycleDay) || 0,
        total: Number(d.checkin.total) || 0,
        days,
        reward: scaleSpec(s, spec, env, opts)
      }
    };
  }

  const core = {
    VERSION,
    POINTS_GOAL,
    TASKS,
    CHESTS,
    CHECKIN,
    JADE_CAP_HOURS,
    JADE_CAP_MIN,
    PEACH_REWARD_CAP,
    QI_STONE_CAP_MINUTES,
    DAY7_JADE_CAP_HOURS,
    DAY7_PEACH_CAP,
    DAY7_QI_STONE_CAP_MINUTES,
    todayKey,
    normalize,
    emptyDaily,
    ensure,
    isUnlocked,
    note,
    hook,
    scaleSpec,
    grantReward,
    claimChest,
    claimCheckin,
    checkinAvailable,
    hasClaimable,
    snapshot,
    nextCheckinDay,
    jadeCapFor
  };

  window.Daily = core;
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
})();

(function () {
  const RES_NAMES = { qi: '灵气', stone: '灵石', jade: '灵玉', peach: '仙桃' };

  function fmt(n) {
    const x = Math.floor(Number(n) || 0);
    if (typeof window.formatNumber === 'function') return window.formatNumber(x);
    if (x >= 1e8) return `${(x / 1e8).toFixed(1).replace(/\.0$/, '')}亿`;
    if (x >= 10000) return `${(x / 10000).toFixed(1).replace(/\.0$/, '')}万`;
    return String(x);
  }

  function rewardText(rw) {
    if (!rw) return '';
    const parts = [];
    ['qi', 'stone', 'jade', 'peach'].forEach((k) => {
      if (rw[k]) parts.push(`${RES_NAMES[k]}+${fmt(rw[k])}`);
    });
    return parts.join(' · ');
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

  let els = null;

  function renderBadge() {
    if (!els || !els.badge) return;
    const GS = window.GameState;
    const on = !!(GS && GS.state && window.Daily && window.Daily.hasClaimable(GS.state, Date.now()));
    els.badge.classList.toggle('visible', on);
    if (els.btn) els.btn.classList.toggle('has-claim', on);
  }

  function render() {
    if (!els || !window.Daily || !window.GameState || !window.GameState.state) return;
    const snap = window.Daily.snapshot(window.GameState.state, Date.now(), env());
    if (els.checkinRow) {
      els.checkinRow.innerHTML = snap.checkin.days
        .map((d) => {
          const cls = ['daily-day'];
          if (d.claimed) cls.push('is-claimed');
          if (d.current) cls.push('is-today');
          if (d.notable) cls.push('is-notable');
          const sub = d.claimed ? '已领' : d.current ? '今日' : rewardText(d.reward);
          return `<div class="${cls.join(' ')}"><div class="daily-day-n">第${d.day}日</div><div class="daily-day-r">${sub}</div></div>`;
        })
        .join('');
    }
    if (els.checkinBtn) {
      els.checkinBtn.disabled = !snap.checkin.available;
      els.checkinBtn.textContent = snap.checkin.available ? `领取第 ${snap.checkin.day} 日签到` : '今日已签到';
    }
    if (els.checkinHint) {
      const rw = rewardText(snap.checkin.reward);
      els.checkinHint.textContent = snap.checkin.available
        ? `累计签到，漏签不中断。本日奖励：${rw || '—'}`
        : '今日签到已领取，漏签不会重置进度。';
    }
    if (els.pointsLabel) {
      els.pointsLabel.textContent = `活跃度 ${Math.min(snap.points, snap.goal)}/${snap.goal}${snap.points > snap.goal ? `（${snap.points}）` : ''}`;
    }
    if (els.trackFill) {
      const pct = Math.max(0, Math.min(100, (snap.points / snap.goal) * 100));
      els.trackFill.style.width = `${pct}%`;
    }
    if (els.chests) {
      els.chests.innerHTML = snap.chests
        .map((c) => {
          const cls = ['daily-chest'];
          if (c.claimed) cls.push('is-claimed');
          else if (c.ready) cls.push('is-ready');
          const label = c.claimed ? '已领' : c.ready ? '可领' : `${c.at}`;
          return `<button class="${cls.join(' ')}" type="button" data-daily-chest="${c.id}" style="left:${c.at}%" ${
            c.ready && !c.claimed ? '' : 'disabled'
          } title="${rewardText(c.reward) || '活跃宝箱'}" aria-label="活跃度 ${c.at} 宝箱"><span class="daily-chest-at">${label}</span></button>`;
        })
        .join('');
    }
    if (els.tasks) {
      els.tasks.innerHTML = snap.tasks
        .map((t) => {
          const cls = ['daily-task'];
          if (!t.unlocked) cls.push('is-locked');
          if (t.done) cls.push('is-done');
          const status = !t.unlocked ? t.hint : t.done ? '已完成' : `${t.progress}/${t.target}`;
          return `<div class="${cls.join(' ')}"><div class="daily-task-main"><div class="daily-task-name">${t.name}</div><div class="daily-task-desc">${t.desc}</div></div><div class="daily-task-side"><div class="daily-task-pts">+${t.points}</div><div class="daily-task-status">${status}</div></div></div>`;
        })
        .join('');
    }
    if (els.toast) {
      // leave existing toast until next action overwrites
    }
    renderBadge();
  }

  function showToast(text) {
    if (!els || !els.toast) return;
    if (!text) {
      els.toast.hidden = true;
      els.toast.textContent = '';
      return;
    }
    els.toast.hidden = false;
    els.toast.textContent = text;
  }

  function openModal() {
    if (!els || !els.modal) return;
    showToast('');
    render();
    els.modal.classList.add('active');
    els.modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    if (!els || !els.modal) return;
    els.modal.classList.remove('active');
    els.modal.setAttribute('aria-hidden', 'true');
    renderBadge();
  }

  function onCheckin() {
    const GS = window.GameState;
    if (!GS || !GS.state || !window.Daily) return;
    const res = window.Daily.claimCheckin(GS.state, env(), Date.now());
    if (!res.ok) {
      render();
      return;
    }
    GS.saveGame();
    const prefix = res.notable ? '七日签到圆满！' : `第 ${res.day} 日签到`;
    showToast(`${prefix} 获得 ${rewardText(res.reward) || '奖励'}`);
    render();
  }

  function onChest(id) {
    const GS = window.GameState;
    if (!GS || !GS.state || !window.Daily) return;
    const res = window.Daily.claimChest(GS.state, id, env(), Date.now());
    if (!res.ok) {
      render();
      return;
    }
    GS.saveGame();
    showToast(`领取 ${res.chest.at} 活跃宝箱：${rewardText(res.reward) || '奖励'}`);
    render();
  }

  function tick() {
    const GS = window.GameState;
    if (!GS || !GS.state || !window.Daily) return;
    const before = GS.state.daily && GS.state.daily.date;
    window.Daily.ensure(GS.state, Date.now());
    const after = GS.state.daily && GS.state.daily.date;
    if (before && after && before !== after) GS.saveGame();
    if (els && els.modal && els.modal.classList.contains('active')) render();
    else renderBadge();
  }

  function init() {
    els = {
      btn: document.getElementById('btn-daily'),
      badge: document.getElementById('badge-daily'),
      modal: document.getElementById('daily-modal'),
      close: document.getElementById('btn-close-daily'),
      checkinRow: document.getElementById('daily-checkin-row'),
      checkinBtn: document.getElementById('btn-daily-checkin'),
      checkinHint: document.getElementById('daily-checkin-hint'),
      pointsLabel: document.getElementById('daily-points-label'),
      trackFill: document.getElementById('daily-track-fill'),
      chests: document.getElementById('daily-chests'),
      tasks: document.getElementById('daily-tasks'),
      toast: document.getElementById('daily-toast')
    };
    if (!els.btn || !els.modal || !window.GameState) {
      els = null;
      return;
    }
    els.btn.addEventListener('click', openModal);
    if (els.close) els.close.addEventListener('click', closeModal);
    if (els.checkinBtn) els.checkinBtn.addEventListener('click', onCheckin);
    if (els.chests) {
      els.chests.addEventListener('click', (e) => {
        const b = e.target.closest('[data-daily-chest]');
        if (!b || b.disabled) return;
        onChest(b.getAttribute('data-daily-chest'));
      });
    }
    tick();
    setInterval(tick, 1000);
  }

  window.DailyUI = {
    refresh() {
      if (els && els.modal && els.modal.classList.contains('active')) render();
      else renderBadge();
    },
    open: openModal,
    close: closeModal
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
