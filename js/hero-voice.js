// 角色日常台词：点击立绘 / 主角突破 / 闲置时在立绘上冒一个小气泡；出战 / 阵亡由 stage-ui.js 在棋盘上飘字。
// 只读 HeroLinesData，不改存档、不改数值；所有气泡 pointer-events:none，不阻塞操作，并按类型限频。
(function () {
  'use strict';

  // 各类台词的最短间隔（毫秒，按真实时间）
  const COOLDOWN = {
    tap: 15000,
    breakthrough: 4000,
    idle: 180000,
    deploy: 45000,
    defeat: 20000
  };
  const IDLE_QUIET_MS = 60000; // 无操作满 60 秒才可能冒闲置台词
  const IDLE_CHANCE = 0.05; // 满足条件后每秒检查一次的触发概率
  const BUBBLE_MS = 3200;

  const lastSaid = {};
  let lastActivity = Date.now();
  let lastRealm = null;
  let bubbleTimer = 0;

  function data() {
    return (window.HeroLinesData && window.HeroLinesData.voice) || {};
  }

  function line(heroId, kind) {
    const v = data()[heroId];
    const s = v && v[kind];
    return typeof s === 'string' && s ? s : null;
  }

  function allowed(kind, now) {
    const cd = COOLDOWN[kind] || 10000;
    return !(lastSaid[kind] && now - lastSaid[kind] < cd);
  }

  // 取一句台词并记入限频；被限频或无台词时返回 null
  function take(heroId, kind, now) {
    const t = now === undefined ? Date.now() : now;
    const text = line(heroId, kind);
    if (!text || !allowed(kind, t)) return null;
    lastSaid[kind] = t;
    return text;
  }

  function mainHeroId() {
    const s = window.GameState && window.GameState.state;
    return (s && s.heroId) || 'lanyi';
  }

  function hideBubble() {
    const el = document.getElementById('hero-voice-bubble');
    if (el) el.classList.remove('is-show');
  }

  function showBubble(text) {
    const zone = document.getElementById('meditation-zone');
    const host = (zone && zone.querySelector('.hero-frame')) || zone;
    if (!host) return false;
    let el = document.getElementById('hero-voice-bubble');
    if (!el) {
      el = document.createElement('div');
      el.id = 'hero-voice-bubble';
      el.className = 'hero-voice-bubble';
      el.setAttribute('aria-live', 'polite');
      host.appendChild(el);
    }
    el.textContent = text;
    el.classList.remove('is-show');
    void el.offsetWidth;
    el.classList.add('is-show');
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(hideBubble, BUBBLE_MS);
    return true;
  }

  function sayOnPortrait(kind) {
    const text = take(mainHeroId(), kind);
    if (!text) return null;
    showBubble(text);
    return text;
  }

  // 供 stage-ui.js 调用：出战 / 阵亡 / 绝技时取一句（已限频）
  function battleLine(heroId, kind) {
    return take(heroId, kind);
  }

  function cultivateVisible() {
    const pane = document.getElementById('tab-cultivate');
    if (pane && !pane.classList.contains('active')) return false;
    if (typeof document.hidden === 'boolean' && document.hidden) return false;
    return true;
  }

  function onTap(e) {
    lastActivity = Date.now();
    if (e && e.target && typeof e.target.closest === 'function' && e.target.closest('#title-plate')) return;
    sayOnPortrait('tap');
  }

  function tick() {
    const s = window.GameState && window.GameState.state;
    if (!s) return;
    const realm = Number(s.realmIndex) || 0;
    if (lastRealm === null) {
      lastRealm = realm;
    } else if (realm > lastRealm) {
      // 只在境界上升时说突破台词（轮回导致的回落不算）
      lastRealm = realm;
      lastActivity = Date.now();
      sayOnPortrait('breakthrough');
      return;
    } else {
      lastRealm = realm;
    }
    const now = Date.now();
    if (now - lastActivity < IDLE_QUIET_MS || !cultivateVisible() || !allowed('idle', now)) return;
    if (Math.random() >= IDLE_CHANCE) return;
    sayOnPortrait('idle');
  }

  function init() {
    const st = window.GameState && window.GameState.state;
    if (st) lastRealm = Number(st.realmIndex) || 0;
    const zone = document.getElementById('meditation-zone');
    if (zone) zone.addEventListener('pointerdown', onTap);
    document.addEventListener('pointerdown', () => {
      lastActivity = Date.now();
    });
    document.addEventListener('keydown', () => {
      lastActivity = Date.now();
    });
    setInterval(tick, 1000);
  }

  window.HeroVoice = { COOLDOWN, line, take, battleLine, sayOnPortrait, showBubble, tick };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
