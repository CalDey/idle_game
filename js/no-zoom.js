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
})();

