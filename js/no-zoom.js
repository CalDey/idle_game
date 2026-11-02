(function () {
  'use strict';

  var prevent = function (e) {
    e.preventDefault();
  };

  document.addEventListener('gesturestart', prevent, { passive: false });
  document.addEventListener('gesturechange', prevent, { passive: false });
  document.addEventListener('gestureend', prevent, { passive: false });

  document.addEventListener(
    'touchmove',
    function (e) {
      if ((e.touches && e.touches.length > 1) || (e.scale !== undefined && e.scale !== 1)) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

  document.addEventListener(
    'wheel',
    function (e) {
      if (e.ctrlKey) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

  let lastTouchEnd = 0;
  document.addEventListener(
    'touchend',
    function (e) {
      const now = Date.now();
      if (now - lastTouchEnd <= 350) {
        e.preventDefault();
        // 第二次点击被拦截后，手动补发一次 click，保证快速连点按钮（比如升级功法）不会丢点击
        const t = e.target;
        if (t && typeof t.click === 'function' && !(t.closest && t.closest('input, textarea, select'))) {
          t.click();
        }
      }
      lastTouchEnd = now;
    },
    { passive: false }
  );
})();

