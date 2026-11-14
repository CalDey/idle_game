// 音乐与音效（新手体验 batch3 P2-7）：全部由 Web Audio 实时合成，仓库内不含任何音频文件。
// 来源与许可：本文件代码原创，随仓库发布；合成音色不引用任何采样或第三方素材（见 docs/AUDIO_SOURCES.md）。
// 规则：首次进入若尚未记录选择，先询问是否开启音乐和音效；选是则以默认低音量开启，选择写入本地后不再询问。
// 只有在用户手势（点击 / 按键）之后才创建 AudioContext；页面隐藏时暂停。
// 音效 3 个：吐纳（点击立绘）、突破成功、Boss 现身；音乐 1 首：低沉古琴拨弦 + 埙声长音的循环氛围。
(function () {
  'use strict';

  const PREF_KEY = 'xiuxian_audio';
  const DEFAULT_VOLUME = 0.9;
  // 首次选择「开启」时写入主音量滑块的低音量（沿用第 6 批 volume 字段，不另加滑块）
  const DEFAULT_LOW_VOLUME = 0.35;
  const DEFAULT_PREFS = { music: false, sfx: false, volume: DEFAULT_VOLUME, asked: false };
  // D 小调五声（D F G A C），偏低音区
  const PENTA = [146.83, 174.61, 196.0, 220.0, 261.63, 293.66];
  const DRONE = 73.42; // D2

  let prefs = loadPrefs();
  let ctx = null;
  let master = null;
  let musicBus = null;
  let sfxBus = null;
  let gestured = false;
  let musicTimer = 0;
  let droneNodes = null;
  let lastTap = 0;
  let lastRealm = null;

  function storage() {
    try {
      return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch (err) {
      return null;
    }
  }

  function loadPrefs() {
    const ls = storage();
    let raw = null;
    try {
      raw = ls ? JSON.parse(ls.getItem(PREF_KEY) || 'null') : null;
    } catch (err) {
      raw = null;
    }
    // localStorage 里已有该键（含旧档仅 music/sfx）视为已问过，避免对老玩家再弹窗
    const hasRecord = Boolean(raw && typeof raw === 'object');
    return {
      music: Boolean(raw && raw.music === true),
      sfx: Boolean(raw && raw.sfx === true),
      volume: clampVolume(raw && Object.prototype.hasOwnProperty.call(raw, 'volume') ? raw.volume : undefined),
      asked: hasRecord
    };
  }

  // 旧偏好没有 volume 时沿用原先主音量 0.9，以便其它分支写入的低默认音量能被原样读出。
  function clampVolume(v) {
    if (v == null || v === '') return DEFAULT_VOLUME;
    const n = Number(v);
    if (!Number.isFinite(n)) return DEFAULT_VOLUME;
    return Math.max(0, Math.min(1, n));
  }

  function savePrefs() {
    const ls = storage();
    try {
      if (ls) ls.setItem(PREF_KEY, JSON.stringify(prefs));
    } catch (err) {}
  }

  function AC() {
    if (typeof window === 'undefined') return null;
    return window.AudioContext || window.webkitAudioContext || null;
  }

  // 只在手势之后创建：开关打开，或试听强制建上下文
  function ensureCtx(force) {
    if (ctx) return ctx;
    if (!gestured || !(force || prefs.music || prefs.sfx)) return null;
    const Ctor = AC();
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch (err) {
      ctx = null;
      return null;
    }
    master = ctx.createGain();
    master.gain.value = prefs.volume;
    master.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.0;
    musicBus.connect(master);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.55;
    sfxBus.connect(master);
    return ctx;
  }

  function noiseBuffer(sec) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * sec));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let x = 12345;
    for (let i = 0; i < len; i += 1) {
      x = (x * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (x / 0x7fffffff) * 2 - 1;
    }
    return buf;
  }

  function env(g, t, a, peak, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + decay);
  }

  // 古琴式拨弦：三角波 + 二次谐波，快起慢衰，尾音轻微下滑
  function pluck(freq, t, vol, bus) {
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    o1.type = 'triangle';
    o2.type = 'sine';
    o1.frequency.setValueAtTime(freq, t);
    o1.frequency.exponentialRampToValueAtTime(freq * 0.985, t + 1.8);
    o2.frequency.setValueAtTime(freq * 2, t);
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1800, t);
    lp.frequency.exponentialRampToValueAtTime(500, t + 1.5);
    env(g, t, 0.008, vol, 2.2);
    o1.connect(lp);
    o2.connect(lp);
    lp.connect(g);
    g.connect(bus);
    o1.start(t);
    o2.start(t);
    o1.stop(t + 2.4);
    o2.stop(t + 2.4);
  }

  // 埙式长音：正弦 + 少量带通噪声的气声，慢起慢收
  function xun(freq, t, dur, vol, bus) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    const vib = ctx.createOscillator();
    const vibG = ctx.createGain();
    vib.frequency.value = 4.5;
    vibG.gain.value = freq * 0.006;
    vib.connect(vibG);
    vibG.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const n = ctx.createBufferSource();
    n.buffer = noiseBuffer(dur);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq * 2;
    bp.Q.value = 6;
    const ng = ctx.createGain();
    ng.gain.value = 0.25;
    n.connect(bp);
    bp.connect(ng);
    ng.connect(g);
    o.connect(g);
    g.connect(bus);
    o.start(t);
    vib.start(t);
    n.start(t);
    o.stop(t + dur + 0.05);
    vib.stop(t + dur + 0.05);
    n.stop(t + dur + 0.05);
  }

  // ---------- 音效 ----------
  const SFX = {
    // 吐纳：一口气声 + 低柔正弦
    tuna(t) {
      const n = ctx.createBufferSource();
      n.buffer = noiseBuffer(0.4);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(600, t);
      bp.frequency.exponentialRampToValueAtTime(1400, t + 0.3);
      bp.Q.value = 1.2;
      const g = ctx.createGain();
      env(g, t, 0.08, 0.18, 0.3);
      n.connect(bp);
      bp.connect(g);
      g.connect(sfxBus);
      n.start(t);
      n.stop(t + 0.42);
      const o = ctx.createOscillator();
      const og = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(220, t);
      o.frequency.exponentialRampToValueAtTime(330, t + 0.25);
      env(og, t, 0.05, 0.08, 0.3);
      o.connect(og);
      og.connect(sfxBus);
      o.start(t);
      o.stop(t + 0.4);
    },
    // 突破成功：五声上行琶音 + 钟声泛音
    breakthrough(t) {
      [0, 2, 3, 4, 5].forEach((k, i) => pluck(PENTA[k] * 2, t + i * 0.09, 0.22, sfxBus));
      [1, 2.76, 5.4].forEach((h, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = 587.33 * h;
        env(g, t + 0.45, 0.01, 0.12 / (i + 1), 1.6);
        o.connect(g);
        g.connect(sfxBus);
        o.start(t + 0.45);
        o.stop(t + 2.2);
      });
    },
    // Boss 现身：低鼓 + 闷锣
    boss(t) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(90, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.5);
      env(g, t, 0.005, 0.6, 0.7);
      o.connect(g);
      g.connect(sfxBus);
      o.start(t);
      o.stop(t + 0.8);
      const n = ctx.createBufferSource();
      n.buffer = noiseBuffer(1.4);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 180;
      bp.Q.value = 8;
      const ng = ctx.createGain();
      env(ng, t + 0.05, 0.03, 0.35, 1.2);
      n.connect(bp);
      bp.connect(ng);
      ng.connect(sfxBus);
      n.start(t + 0.05);
      n.stop(t + 1.45);
      xun(PENTA[0] / 2 * 1.06, t + 0.1, 1.2, 0.08, sfxBus);
    }
  };

  function resumeCtx(c) {
    if (!c || typeof c.resume !== 'function') return;
    try {
      const p = c.resume();
      if (p && typeof p.catch === 'function') p.catch(function () {});
    } catch (err) {}
  }

  function play(name) {
    if (!prefs.sfx || !SFX[name]) return false;
    const c = ensureCtx();
    if (!c) return false;
    if (c.state === 'suspended') resumeCtx(c);
    try {
      SFX[name](c.currentTime + 0.01);
    } catch (err) {
      return false;
    }
    return true;
  }

  // ---------- 音乐：低音持续 + 随机古琴拨弦 + 偶尔一声埙 ----------
  function startDrone() {
    if (droneNodes) return;
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    o1.type = 'sine';
    o2.type = 'sine';
    o1.frequency.value = DRONE;
    o2.frequency.value = DRONE * 1.5;
    lp.type = 'lowpass';
    lp.frequency.value = 400;
    g.gain.value = 0.05;
    o1.connect(lp);
    o2.connect(lp);
    lp.connect(g);
    g.connect(musicBus);
    o1.start();
    o2.start();
    droneNodes = [o1, o2];
  }

  function stopDrone() {
    if (!droneNodes) return;
    droneNodes.forEach((o) => {
      try {
        o.stop();
      } catch (err) {}
    });
    droneNodes = null;
  }

  let phraseSeed = 7;
  function rnd() {
    phraseSeed = (phraseSeed * 16807) % 2147483647;
    return phraseSeed / 2147483647;
  }

  function scheduleMusic() {
    if (!ctx || !prefs.music) return;
    const t = ctx.currentTime + 0.05;
    const notes = 2 + Math.floor(rnd() * 3);
    let at = t;
    for (let i = 0; i < notes; i += 1) {
      const f = PENTA[Math.floor(rnd() * PENTA.length)] * (rnd() < 0.3 ? 0.5 : 1);
      pluck(f, at, 0.12, musicBus);
      at += 0.45 + rnd() * 0.6;
    }
    if (rnd() < 0.35) xun(PENTA[Math.floor(rnd() * 4)], at + 0.3, 3.2, 0.05, musicBus);
  }

  function startMusic() {
    if (!prefs.music) return false;
    const c = ensureCtx();
    if (!c) return false;
    if (c.state === 'suspended') resumeCtx(c);
    startDrone();
    musicBus.gain.cancelScheduledValues(c.currentTime);
    musicBus.gain.setValueAtTime(musicBus.gain.value, c.currentTime);
    musicBus.gain.linearRampToValueAtTime(0.7, c.currentTime + 2);
    if (!musicTimer) {
      scheduleMusic();
      musicTimer = setInterval(scheduleMusic, 4200);
    }
    return true;
  }

  function stopMusic() {
    clearInterval(musicTimer);
    musicTimer = 0;
    if (ctx && musicBus) {
      musicBus.gain.cancelScheduledValues(ctx.currentTime);
      musicBus.gain.setValueAtTime(0, ctx.currentTime);
    }
    stopDrone();
  }

  function setMusic(on) {
    prefs.music = Boolean(on);
    prefs.asked = true;
    savePrefs();
    if (prefs.music) startMusic();
    else stopMusic();
    syncUi();
  }

  function setSfx(on) {
    prefs.sfx = Boolean(on);
    prefs.asked = true;
    savePrefs();
    syncUi();
  }

  function applyVolume() {
    if (!master) return;
    try {
      if (ctx && master.gain.cancelScheduledValues) {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setValueAtTime(prefs.volume, ctx.currentTime);
      } else {
        master.gain.value = prefs.volume;
      }
    } catch (err) {
      master.gain.value = prefs.volume;
    }
  }

  function setVolume(v) {
    prefs.volume = clampVolume(v);
    savePrefs();
    applyVolume();
    syncUi();
    return prefs.volume;
  }

  function preview() {
    gestured = true;
    const c = ensureCtx(true);
    if (!c) return false;
    if (c.state === 'suspended') resumeCtx(c);
    try {
      const t0 = c.currentTime + 0.02;
      pluck(PENTA[3], t0, 0.2, master);
      pluck(PENTA[5], t0 + 0.16, 0.16, master);
    } catch (err) {
      return false;
    }
    return true;
  }

  function onGesture() {
    if (gestured) return;
    gestured = true;
    if (prefs.music) startMusic();
  }

  function onVisibility() {
    if (!ctx) return;
    if (document.hidden) {
      if (typeof ctx.suspend === 'function') ctx.suspend();
    } else if (prefs.music || prefs.sfx) {
      resumeCtx(ctx);
    }
  }

  let promptOpen = false;

  function markAsked() {
    prefs.asked = true;
    savePrefs();
  }

  function applyConsent(enable) {
    gestured = true;
    prefs.asked = true;
    prefs.music = Boolean(enable);
    prefs.sfx = Boolean(enable);
    if (enable) prefs.volume = clampVolume(DEFAULT_LOW_VOLUME);
    savePrefs();
    applyVolume();
    if (prefs.music) startMusic();
    else stopMusic();
    syncUi();
    hideConsent();
  }

  function hideConsent() {
    promptOpen = false;
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('audio-consent-modal');
    if (modal) {
      modal.classList.remove('active');
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  function maybePromptConsent() {
    if (prefs.asked || promptOpen) return false;
    if (typeof document === 'undefined') return false;
    const modal = document.getElementById('audio-consent-modal');
    if (!modal) return false;
    promptOpen = true;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    return true;
  }

  function bindConsentUi() {
    if (typeof document === 'undefined') return;
    const yes = document.getElementById('btn-audio-consent-yes');
    const no = document.getElementById('btn-audio-consent-no');
    if (yes) yes.addEventListener('click', () => applyConsent(true));
    if (no) no.addEventListener('click', () => applyConsent(false));
  }

  function syncUi() {
    if (typeof document === 'undefined') return;
    const m = document.getElementById('chk-music');
    const s = document.getElementById('chk-sfx');
    const r = document.getElementById('rng-volume');
    const lab = document.getElementById('volume-value');
    if (m) m.checked = prefs.music;
    if (s) s.checked = prefs.sfx;
    const pct = Math.round(prefs.volume * 100);
    if (r && Number(r.value) !== pct) r.value = String(pct);
    if (lab) lab.textContent = `${pct}%`;
  }

  function tick() {
    const st = window.GameState && window.GameState.state;
    if (!st) return;
    const realm = Number(st.realmIndex) || 0;
    if (lastRealm !== null && realm > lastRealm) play('breakthrough');
    lastRealm = realm;
  }

  function init() {
    syncUi();
    bindConsentUi();
    const m = document.getElementById('chk-music');
    const s = document.getElementById('chk-sfx');
    const r = document.getElementById('rng-volume');
    const previewBtn = document.getElementById('btn-audio-preview');
    if (m) m.addEventListener('change', () => { gestured = true; setMusic(m.checked); });
    if (s) s.addEventListener('change', () => { gestured = true; setSfx(s.checked); if (s.checked) play('tuna'); });
    if (r) {
      const onVol = () => setVolume(Number(r.value) / 100);
      r.addEventListener('input', onVol);
      r.addEventListener('change', onVol);
    }
    if (previewBtn) previewBtn.addEventListener('click', () => { preview(); });
    document.addEventListener('pointerdown', onGesture, true);
    document.addEventListener('keydown', onGesture, true);
    document.addEventListener('visibilitychange', onVisibility);
    const zone = document.getElementById('meditation-zone');
    if (zone) {
      zone.addEventListener('pointerdown', () => {
        const now = Date.now();
        if (now - lastTap < 120) return;
        lastTap = now;
        play('tuna');
      });
    }
    const st = window.GameState && window.GameState.state;
    if (st) lastRealm = Number(st.realmIndex) || 0;
    setInterval(tick, 500);
  }

  window.GameAudio = {
    PREF_KEY,
    DEFAULT_PREFS,
    DEFAULT_VOLUME,
    DEFAULT_LOW_VOLUME,
    prefs: () => ({ music: prefs.music, sfx: prefs.sfx, volume: prefs.volume, asked: Boolean(prefs.asked) }),
    setMusic,
    setSfx,
    setVolume,
    preview,
    applyConsent,
    maybePromptConsent,
    play,
    startMusic,
    stopMusic,
    hasContext: () => Boolean(ctx),
    _gesture: onGesture
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})();
