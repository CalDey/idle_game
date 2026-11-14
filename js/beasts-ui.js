// 灵兽伴生界面：打坐页立绘右下角的伴生灵兽、灵兽弹窗（出战 / 喂养）、闯关仙缘行里的小头像。
// 逻辑与数值见 js/beasts.js；本文件只做展示与交互。
(function () {
  'use strict';
  let els = null;

  const B = () => window.Beasts;
  const S = () => window.GameState && window.GameState.state;
  const fmt = (n) => (window.GameConfig && window.GameConfig.formatNumber ? window.GameConfig.formatNumber(n) : String(n));
  const esc = (str) =>
    String(str == null ? '' : str).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

  function log(text, type) {
    const box = document.getElementById('cultivation-log');
    if (!box) return;
    const now = new Date();
    const t = [now.getHours(), now.getMinutes(), now.getSeconds()].map((v) => String(v).padStart(2, '0')).join(':');
    const div = document.createElement('div');
    div.className = `log-entry ${type || ''}`;
    div.innerHTML = `<span class="log-time">[${t}]</span>${esc(text)}`;
    box.prepend(div);
  }

  function save() {
    if (window.GameState && typeof window.GameState.saveGame === 'function') window.GameState.saveGame();
  }

  // 闯关仙缘行左侧的小头像（stage-ui.js renderStageBondRow 调用）
  function chipHtml() {
    const s = S();
    if (!B() || !s) return '';
    const b = B().activeBeast(s);
    if (!b) return '';
    const lv = B().levelOf(s, b.id);
    return `<span class="beast-chip bond-${b.tag}" title="${esc(`${b.name} Lv${lv}：${B().bonusText(b.id, lv)}`)}"><img class="beast-chip-img" src="${B().avatarUrl(b.id)}" alt="" aria-hidden="true" /><span class="beast-chip-lv">Lv${lv}</span></span>`;
  }

  function renderCompanion() {
    if (!els || !els.companion) return;
    const s = S();
    const b = s && B() ? B().activeBeast(s) : null;
    if (!b) {
      els.companion.hidden = true;
      return;
    }
    const src = B().imgUrl(b.id);
    if (els.companionImg.getAttribute('src') !== src) els.companionImg.setAttribute('src', src);
    els.companion.dataset.beast = b.id;
    els.companion.setAttribute('aria-label', `灵兽伴生：${b.name} Lv${B().levelOf(s, b.id)}，点击查看`);
    els.companion.hidden = false;
  }

  function cardHtml(s, b) {
    const owned = B().isOwned(s, b.id);
    const lv = B().levelOf(s, b.id);
    const st = B().ensureState(s);
    const isActive = st.active === b.id;
    if (!owned) {
      return `<div class="beast-card is-locked">
        <div class="beast-card-art"><img src="${B().avatarUrl(b.id)}" alt="" aria-hidden="true" /></div>
        <div class="beast-card-info">
          <div class="beast-card-name">${esc(b.name)} <span class="beast-tag bond-${b.tag}">${esc(b.tagName)}</span></div>
          <div class="beast-card-lock">🔒 ${esc(b.unlockText)}后结缘</div>
          <div class="beast-card-bonus">满级：${esc(B().bonusText(b.id, B().MAX_LV))}</div>
        </div>
      </div>`;
    }
    const cost = B().feedCost(lv);
    const chk = B().canFeed(s, b.id);
    const next = cost ? `下一级：${esc(B().bonusText(b.id, lv + 1))}` : '已满级';
    const feedLabel = cost ? `喂养 · 灵玉 ${fmt(cost.lingyu)} · 仙桃 ${fmt(cost.peaches)}` : '已满级';
    return `<div class="beast-card${isActive ? ' is-active' : ''}">
      <div class="beast-card-art"><img src="${B().avatarUrl(b.id)}" alt="" aria-hidden="true" /></div>
      <div class="beast-card-info">
        <div class="beast-card-name">${esc(b.name)} <span class="beast-tag bond-${b.tag}">${esc(b.tagName)}</span> <span class="beast-card-lv">Lv${lv}/${B().MAX_LV}</span></div>
        <div class="beast-card-blurb">${esc(b.blurb)}</div>
        <div class="beast-card-bonus">当前：${esc(B().bonusText(b.id, lv))}</div>
        <div class="beast-card-next">${next}</div>
        <div class="beast-card-actions">
          <button type="button" class="btn${isActive ? '' : ' btn-primary'}" data-beast-active="${b.id}"${isActive ? ' disabled' : ''}>${isActive ? '伴生中' : '设为伴生'}</button>
          <button type="button" class="btn btn-primary" data-beast-feed="${b.id}"${chk.ok ? '' : ' disabled'} title="${esc(chk.ok ? '' : chk.reason || '')}">${feedLabel}</button>
        </div>
      </div>
    </div>`;
  }

  function renderModal() {
    if (!els || !els.modal) return;
    const s = S();
    if (!s || !B()) return;
    B().ensureState(s);
    els.wallet.textContent = `灵玉 ${fmt(Math.floor(s.lingyu || 0))} · 仙桃 ${fmt(Math.floor((s.tree && s.tree.peaches) || 0))}`;
    els.list.innerHTML = B().BEASTS.map((b) => cardHtml(s, b)).join('');
  }

  function open() {
    if (!els || !els.modal) return;
    const settings = document.getElementById('settings-modal');
    if (settings) settings.classList.remove('active');
    renderModal();
    els.modal.classList.add('active');
    els.modal.setAttribute('aria-hidden', 'false');
  }

  function close() {
    if (!els || !els.modal) return;
    els.modal.classList.remove('active');
    els.modal.setAttribute('aria-hidden', 'true');
  }

  function refreshAll() {
    renderCompanion();
    if (els && els.modal && els.modal.classList.contains('active')) renderModal();
    if (window.StageUI && typeof window.StageUI.render === 'function') window.StageUI.render();
  }

  function sync(silent) {
    const s = S();
    if (!s || !B()) return;
    const gained = B().syncUnlocks(s);
    if (gained.length) {
      gained.forEach((b) => {
        if (!silent) log(`灵兽结缘：【${b.name}】愿随你同行（${b.tagName}）。点打坐页的灵兽可喂养、换伴生。`, 'gold');
      });
      save();
      refreshAll();
    } else {
      renderCompanion();
    }
  }

  function onListClick(e) {
    const s = S();
    if (!s) return;
    const act = e.target.closest('[data-beast-active]');
    if (act) {
      const id = act.getAttribute('data-beast-active');
      if (B().setActive(s, id)) {
        log(`灵兽伴生改为【${B().BY_ID[id].name}】。`, 'info');
        save();
        refreshAll();
      }
      return;
    }
    const feedBtn = e.target.closest('[data-beast-feed]');
    if (feedBtn) {
      const id = feedBtn.getAttribute('data-beast-feed');
      const res = B().feed(s, id);
      if (res.ok) {
        log(`喂养【${B().BY_ID[id].name}】：灵玉 -${fmt(res.cost.lingyu)}、仙桃 -${fmt(res.cost.peaches)}，升至 Lv${res.lv}。`, 'success');
        save();
        refreshAll();
      }
    }
  }

  function init() {
    if (els) return; // 只初始化一次
    const frame = document.querySelector('#meditation-zone .hero-frame');
    els = {
      modal: document.getElementById('beast-modal'),
      list: document.getElementById('beast-list'),
      wallet: document.getElementById('beast-wallet'),
      btnOpen: document.getElementById('btn-open-beast'),
      btnClose: document.getElementById('btn-close-beast'),
      companion: null,
      companionImg: null
    };
    if (frame) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'beast-companion';
      btn.className = 'beast-companion';
      btn.hidden = true;
      const img = document.createElement('img');
      img.alt = '';
      img.decoding = 'async';
      btn.appendChild(img);
      // 不触发打坐点击（game.js 在打坐区监听 pointerdown）
      btn.addEventListener('pointerdown', (e) => e.stopPropagation());
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        open();
      });
      frame.appendChild(btn);
      els.companion = btn;
      els.companionImg = img;
    }
    if (els.btnOpen) els.btnOpen.addEventListener('click', open);
    if (els.btnClose) els.btnClose.addEventListener('click', close);
    if (els.modal) {
      els.modal.addEventListener('click', (e) => {
        if (e.target === els.modal) close();
      });
    }
    if (els.list) els.list.addEventListener('click', onListClick);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && els.modal && els.modal.classList.contains('active')) close();
    });
    // 仙缘行里的灵兽头像：打开灵兽弹窗，而不是队伍弹窗
    const bondRow = document.getElementById('stage-bond-row');
    if (bondRow) {
      bondRow.addEventListener(
        'click',
        (e) => {
          if (e.target && typeof e.target.closest === 'function' && e.target.closest('.beast-chip')) {
            e.stopImmediatePropagation();
            e.stopPropagation();
            open();
          }
        },
        true
      );
    }
    // 读档补发旧档已达解锁关的灵兽；进行中的首通由 stage-ui 在 Boss 结算时再调 sync
    sync(false);
  }

  window.BeastsUI = { chipHtml, open, close, renderCompanion, renderModal, sync };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
