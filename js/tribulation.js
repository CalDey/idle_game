// 大境界渡劫演出：纯视觉，不改存档与境界状态。只在大境界渡劫成功后播放；小突破不走这里。
// 流程：压暗 → 三道天雷（SVG 折线 + 白闪 + 轻震）→ 全屏金光与新境界名。可点击跳过，尊重减弱动态。
(function (root) {
  const DIM_MS = 600;
  const STRIKE_GAP_MS = 450;
  const FIRST_STRIKE_MS = 700;
  const FLASH_MS = 80;
  const GOLD_AFTER_LAST_MS = 220;
  const TOTAL_MS = 3800;
  const FADE_MS = 320;

  let rootEl = null;
  let boltEl = null;
  let captionEl = null;
  let successEl = null;
  let heroWrapEl = null;
  let heroImgEl = null;
  let nameEl = null;
  let mainEl = null;
  let descEl = null;
  let subEl = null;
  let timers = [];
  let playing = false;
  let phase = '';
  let lastPreset = -1;
  let bound = false;
  let skipGestureId = null;
  let skipIgnoreUntil = 0;

  function data() {
    return root.TribulationData || (typeof window !== 'undefined' && window.TribulationData) || null;
  }

  function prefersReducedMotion() {
    try {
      return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (err) {
      return false;
    }
  }

  function clearTimers() {
    timers.forEach((id) => clearTimeout(id));
    timers = [];
  }

  function later(fn, ms) {
    const id = setTimeout(fn, ms);
    timers.push(id);
    return id;
  }

  function bindEls() {
    if (typeof document === 'undefined') return false;
    rootEl = document.getElementById('tribulation-cinematic');
    if (!rootEl) return false;
    boltEl = rootEl.querySelector('.trib-bolt');
    captionEl = document.getElementById('trib-caption');
    successEl = document.getElementById('trib-success');
    heroWrapEl = document.getElementById('trib-hero-wrap');
    heroImgEl = document.getElementById('trib-hero-img');
    nameEl = document.getElementById('trib-realm-name');
    mainEl = document.getElementById('trib-success-main');
    descEl = document.getElementById('trib-realm-desc');
    subEl = document.getElementById('trib-success-sub');
    if (!bound) {
      bound = true;
      const skip = (e) => {
        if (!playing) return;
        const now = Date.now();
        if (now < skipIgnoreUntil) return;
        if (e && e.pointerId != null && e.pointerId === skipGestureId) return;
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        const fromSuccess = phase === 'success';
        skipOrClose();
        // 刚跳到成功页时忽略同一次手势（pointerup/残留 click），成功页像 Esc 一样停留约 1.6 秒
        if (!fromSuccess && phase === 'success') {
          skipIgnoreUntil = now + 450;
          if (e && e.pointerId != null) skipGestureId = e.pointerId;
        }
      };
      const clearGesture = (e) => {
        if (e && e.pointerId != null && e.pointerId === skipGestureId) skipGestureId = null;
      };
      // 只绑一种指针事件：pointerdown 已覆盖鼠标/触摸，再绑 click 会触发两次跳过
      rootEl.addEventListener('pointerdown', skip);
      rootEl.addEventListener('pointerup', clearGesture);
      rootEl.addEventListener('pointercancel', clearGesture);
      rootEl.addEventListener('keydown', (e) => {
        if (!playing) return;
        if (e && (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ')) {
          if (typeof e.preventDefault === 'function') e.preventDefault();
          skipOrClose();
        }
      });
    }
    return true;
  }

  function pickPreset() {
    const D = data();
    const sets = (D && D.BOLT_PRESETS) || [];
    if (!sets.length) return [];
    let idx = Math.floor(Math.random() * sets.length);
    if (sets.length > 1 && idx === lastPreset) idx = (idx + 1) % sets.length;
    lastPreset = idx;
    return sets[idx];
  }

  function applyBolt(points) {
    if (!boltEl) return;
    const pts = (points || []).map((p) => `${p[0]},${p[1]}`).join(' ');
    boltEl.setAttribute('points', pts);
  }

  function setCaption(text) {
    if (!captionEl) return;
    captionEl.textContent = text || '';
    captionEl.hidden = !text;
  }

  function bindHeroPortrait() {
    if (!heroImgEl || typeof document === 'undefined') return false;
    const srcEl = document.getElementById('hero-still') || document.getElementById('hero-fallback') || document.getElementById('ult-hero-img');
    const src = srcEl && (srcEl.currentSrc || srcEl.getAttribute('src') || srcEl.src);
    if (!src) return false;
    heroImgEl.src = src;
    return true;
  }

  function setHeroVisible(on) {
    if (!heroWrapEl) return;
    const show = Boolean(on) && bindHeroPortrait();
    heroWrapEl.hidden = !show;
    heroWrapEl.setAttribute('aria-hidden', show ? 'false' : 'true');
  }

  function fillSuccess(opts) {
    const D = data();
    const realmName = (opts && opts.realmName) || '';
    const realmDesc = (opts && opts.realmDesc) || '';
    if (mainEl) mainEl.textContent = D ? D.successMain(realmName) : `渡劫成功，此身已入${realmName}`;
    if (nameEl) nameEl.textContent = realmName;
    if (descEl) descEl.textContent = realmDesc;
    if (subEl) subEl.textContent = (D && D.SUCCESS_SUB) || '';
  }

  function showSuccess() {
    phase = 'success';
    if (rootEl) {
      rootEl.classList.add('is-gold', 'is-success');
      rootEl.classList.remove('is-strike', 'is-flash', 'is-shake');
    }
    setCaption('');
    if (boltEl) boltEl.setAttribute('points', '');
    if (successEl) successEl.hidden = false;
    setHeroVisible(true);
  }

  function hideRoot() {
    playing = false;
    phase = '';
    skipGestureId = null;
    skipIgnoreUntil = 0;
    clearTimers();
    if (!rootEl) return;
    rootEl.classList.remove('is-on', 'is-dim', 'is-strike', 'is-flash', 'is-shake', 'is-gold', 'is-success', 'is-reduced');
    rootEl.hidden = true;
    rootEl.setAttribute('aria-hidden', 'true');
    if (rootEl.contains(document.activeElement) && typeof rootEl.blur === 'function') {
      try { document.activeElement.blur(); } catch (err) { /* ignore */ }
    }
    setCaption('');
    if (successEl) successEl.hidden = true;
    setHeroVisible(false);
    if (boltEl) boltEl.setAttribute('points', '');
  }

  function close() {
    if (!playing && phase === '') {
      hideRoot();
      return;
    }
    if (!rootEl || rootEl.hidden) {
      hideRoot();
      return;
    }
    rootEl.classList.add('is-out');
    clearTimers();
    later(() => {
      if (rootEl) rootEl.classList.remove('is-out');
      hideRoot();
    }, FADE_MS);
  }

  function skipOrClose() {
    if (!playing) return;
    if (phase !== 'success') {
      clearTimers();
      showSuccess();
      later(close, 1600);
      return;
    }
    close();
  }

  function flashAndShake() {
    if (!rootEl) return;
    rootEl.classList.remove('is-flash', 'is-shake');
    void rootEl.offsetWidth;
    rootEl.classList.add('is-flash', 'is-shake');
    later(() => {
      if (rootEl) rootEl.classList.remove('is-flash', 'is-shake');
    }, Math.max(FLASH_MS, 140));
  }

  function playStrike(index, captions) {
    if (!playing) return;
    phase = 'strike';
    const pts = pickPreset();
    applyBolt(pts);
    if (rootEl) rootEl.classList.add('is-strike');
    setCaption(captions[index] || '');
    flashAndShake();
  }

  function play(opts) {
    const options = opts || {};
    if (typeof document === 'undefined') return false;
    if (!bindEls()) return false;
    clearTimers();
    playing = true;
    phase = 'dim';
    skipGestureId = null;
    skipIgnoreUntil = 0;
    fillSuccess(options);
    if (successEl) successEl.hidden = true;
    setHeroVisible(false);
    setCaption('');
    if (boltEl) boltEl.setAttribute('points', '');
    rootEl.hidden = false;
    rootEl.setAttribute('aria-hidden', 'false');
    rootEl.classList.remove('is-out', 'is-strike', 'is-flash', 'is-shake', 'is-gold', 'is-success', 'is-reduced');
    void rootEl.offsetWidth;
    rootEl.classList.add('is-on', 'is-dim');
    if (typeof rootEl.focus === 'function') {
      try { rootEl.focus(); } catch (err) { /* ignore */ }
    }

    const D = data();
    const captions = D ? D.strikeCaptions(options.majorName) : ['', '', ''];

    // 减弱动态：仍展示压暗、一道天雷和金光立绘，只取消闪/震/旋转，避免被看成「只有文字弹窗」。
    if (prefersReducedMotion()) {
      rootEl.classList.add('is-reduced');
      later(() => playStrike(0, captions), 200);
      later(showSuccess, 800);
      later(close, 2400);
      return true;
    }

    later(() => playStrike(0, captions), FIRST_STRIKE_MS);
    later(() => playStrike(1, captions), FIRST_STRIKE_MS + STRIKE_GAP_MS);
    later(() => playStrike(2, captions), FIRST_STRIKE_MS + STRIKE_GAP_MS * 2);
    later(showSuccess, FIRST_STRIKE_MS + STRIKE_GAP_MS * 2 + GOLD_AFTER_LAST_MS);
    later(close, TOTAL_MS);
    return true;
  }

  function isPlaying() {
    return playing;
  }

  const Tribulation = {
    DIM_MS,
    STRIKE_GAP_MS,
    FIRST_STRIKE_MS,
    FLASH_MS,
    TOTAL_MS,
    prefersReducedMotion,
    strikeCaptions: (name) => (data() ? data().strikeCaptions(name) : []),
    successMain: (name) => (data() ? data().successMain(name) : ''),
    play,
    skip: skipOrClose,
    close,
    isPlaying
  };

  root.Tribulation = Tribulation;
  if (typeof module !== 'undefined' && module.exports) module.exports = Tribulation;
})(typeof window !== 'undefined' ? window : globalThis);
