// 底部「更多」面板：功能格子由注册表驱动，不是存档页签。
// 以后加功能只需往 entries() 里加一条。
(function (root) {
  'use strict';

  const GROUPS = [
    { id: 'trial', name: '试炼' },
    { id: 'records', name: '见闻' },
    { id: 'errands', name: '差事' }
  ];

  function state() {
    return root.GameState && root.GameState.state;
  }

  function icon(name) {
    return `assets/icons/${name}@64.webp?v=18`;
  }

  function entries() {
    const s = state();
    return [
      {
        id: 'mijing',
        group: 'trial',
        name: '秘境劫运',
        icon: icon('ui_bagua'),
        desc: '每日两次连战八波，三选一劫运。',
        isUnlocked: () => {
          const M = root.Mijing;
          return !!(M && s && typeof M.isUnlocked === 'function' && M.isUnlocked(s));
        },
        lockText: () => {
          const n = (root.Mijing && root.Mijing.UNLOCK_BEST) || 10;
          return `首通第 ${n} 关后开启`;
        },
        badge: () => false,
        open: () => {
          if (root.StageUI && typeof root.StageUI.openMijingFromMore === 'function') {
            root.StageUI.openMijingFromMore();
          } else if (root.StageUI && typeof root.StageUI.openMijingModal === 'function') {
            const M = root.Mijing;
            const run = M && typeof M.activeRun === 'function' ? M.activeRun(s) : null;
            root.StageUI.openMijingModal(run ? 'detail' : 'intro');
          }
        }
      },
      {
        id: 'tower',
        group: 'trial',
        name: '镇妖塔',
        icon: icon('nav_stage'),
        desc: '独立爬塔，每日三次失败，首通有奖。',
        isUnlocked: () => {
          const T = root.Tower;
          return !!(T && s && typeof T.isUnlocked === 'function' && T.isUnlocked(s));
        },
        lockText: () => {
          const n = (root.Tower && root.Tower.UNLOCK_BEST) || 20;
          return `首通第 ${n} 关后开启`;
        },
        badge: () => {
          const T = root.Tower;
          if (!T || !s || typeof T.isUnlocked !== 'function' || !T.isUnlocked(s)) return false;
          if (typeof T.failsLeft === 'function' && T.failsLeft(s, Date.now()) <= 0) return false;
          if (typeof T.hasRedDot === 'function') return !!T.hasRedDot(s, Date.now());
          return false;
        },
        open: () => {
          if (root.TowerUI && typeof root.TowerUI.open === 'function') root.TowerUI.open();
        }
      },
      {
        id: 'bestiary',
        group: 'records',
        name: '万妖图鉴',
        icon: icon('ui_title'),
        desc: '收集击杀的妖魔，领取精通奖励。',
        isUnlocked: () => true,
        lockText: () => '',
        badge: () => {
          const C = root.Codex;
          return !!(C && s && typeof C.claimableCount === 'function' && C.claimableCount(s) > 0);
        },
        open: () => {
          if (root.Codex && typeof root.Codex.open === 'function') root.Codex.open('bestiary');
        }
      },
      {
        id: 'karma',
        group: 'records',
        name: '因果簿',
        icon: icon('ui_log'),
        desc: '记下未了的因果。',
        isUnlocked: () => {
          const K = root.Karma;
          return !!(K && s && typeof K.bookUnlocked === 'function' && K.bookUnlocked(s));
        },
        lockText: () => '机缘触发后开启',
        badge: () => {
          const el = document.getElementById('badge-karma-ledger');
          return !!(el && el.classList.contains('visible'));
        },
        open: () => {
          if (root.Karma && root.Karma.ui && typeof root.Karma.ui.open === 'function') root.Karma.ui.open();
        }
      },
      {
        id: 'dispatch',
        group: 'errands',
        name: '仙姬派遣',
        icon: icon('ui_role'),
        desc: '未上阵仙姬可接限时悬赏。',
        isUnlocked: () => {
          const D = root.Dispatch;
          return !!(D && s && typeof D.isUnlocked === 'function' && D.isUnlocked(s));
        },
        lockText: () => {
          const n = (root.Dispatch && root.Dispatch.RULES && root.Dispatch.RULES.UNLOCK_BEST) || 5;
          return `首通第 ${n} 关后开启`;
        },
        badge: () => {
          const D = root.Dispatch;
          return !!(D && s && typeof D.hasClaimable === 'function' && D.hasClaimable(s));
        },
        open: () => {
          if (root.Dispatch && root.Dispatch.ui && typeof root.Dispatch.ui.open === 'function') {
            root.Dispatch.ui.open();
          }
        }
      }
    ];
  }

  let els = null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function isOpen() {
    return !!(els && els.modal && els.modal.classList.contains('active'));
  }

  function render() {
    if (!els || !els.body) return;
    const list = entries();
    let html = '';
    GROUPS.forEach((g) => {
      const items = list.filter((e) => e.group === g.id);
      if (!items.length) return;
      html += `<section class="more-group" data-more-group="${esc(g.id)}">`;
      html += `<h3 class="more-group-title">${esc(g.name)}</h3>`;
      html += '<div class="more-grid">';
      items.forEach((e) => {
        let unlocked = false;
        try {
          unlocked = !!e.isUnlocked();
        } catch (err) {
          unlocked = false;
        }
        let lock = '';
        try {
          lock = unlocked ? '' : String(e.lockText() || '');
        } catch (err) {
          lock = '';
        }
        let dot = false;
        try {
          dot = unlocked && !!e.badge();
        } catch (err) {
          dot = false;
        }
        const badgeId = e.id === 'tower' ? ' id="badge-tower"' : '';
        html += `<button type="button" class="more-tile${unlocked ? '' : ' is-locked'}" data-more-id="${esc(e.id)}" data-state="${unlocked ? 'ready' : 'locked'}" aria-label="${esc(e.name)}${lock ? '，' + esc(lock) : ''}">`;
        html += `<span class="more-tile-badge${dot ? ' visible' : ''}"${badgeId} aria-hidden="true"></span>`;
        html += `<img class="more-tile-icon" src="${esc(e.icon)}" alt="" aria-hidden="true">`;
        html += `<span class="more-tile-name">${esc(e.name)}</span>`;
        if (e.desc) html += `<span class="more-tile-desc">${esc(e.desc)}</span>`;
        if (lock) html += `<span class="more-tile-lock">${esc(lock)}</span>`;
        html += '</button>';
      });
      html += '</div></section>';
    });
    els.body.innerHTML = html;
    refreshNavBadge(list);
  }

  function anyBadge(list) {
    const items = list || entries();
    return items.some((e) => {
      try {
        return !!e.isUnlocked() && !!e.badge();
      } catch (err) {
        return false;
      }
    });
  }

  function refreshNavBadge(list) {
    if (!els || !els.badge) return;
    els.badge.classList.toggle('visible', anyBadge(list));
  }

  function refresh() {
    if (isOpen()) render();
    else refreshNavBadge();
  }

  function open() {
    if (!els || !els.modal) return false;
    render();
    els.modal.classList.add('active');
    els.modal.setAttribute('aria-hidden', 'false');
    if (els.btn) els.btn.classList.add('is-open');
    return true;
  }

  function close() {
    if (!els || !els.modal) return;
    els.modal.classList.remove('active');
    els.modal.setAttribute('aria-hidden', 'true');
    if (els.btn) els.btn.classList.remove('is-open');
    refreshNavBadge();
  }

  function onTileClick(id) {
    const entry = entries().find((e) => e.id === id);
    if (!entry) return;
    close();
    try {
      entry.open();
    } catch (err) {
      console.warn('更多入口打开失败:', id, err);
    }
  }

  function init() {
    els = {
      btn: document.getElementById('nav-btn-more'),
      badge: document.getElementById('badge-more'),
      modal: document.getElementById('more-modal'),
      body: document.getElementById('more-modal-body'),
      close: document.getElementById('btn-close-more')
    };
    if (!els.modal || !els.body) {
      els = null;
      return;
    }
    if (els.btn) {
      els.btn.addEventListener('click', () => {
        if (isOpen()) close();
        else open();
      });
    }
    if (els.close) els.close.addEventListener('click', close);
    els.modal.addEventListener('click', (e) => {
      if (e.target === els.modal) {
        close();
        return;
      }
      const tile = e.target.closest && e.target.closest('[data-more-id]');
      if (tile) onTileClick(tile.getAttribute('data-more-id'));
    });
    refresh();
  }

  root.MoreMenu = {
    GROUPS,
    entries,
    init,
    open,
    close,
    refresh,
    isOpen,
    anyBadge
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : this);
