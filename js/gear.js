// 法宝页：摘桃、对比、分解、树升级。
(function () {
  const fmt = (n) => window.GameConfig.formatNumber(n);
  let log = function () {};
  let onChange = function () {};

  function $(id) {
    return document.getElementById(id);
  }

  function unlocked() {
    return window.GameState.state.realmIndex >= window.GameConfig.PEACH.UNLOCK_REALM;
  }

  function gearIconSrc(slotId, item) {
    if (item) {
      return `assets/icons/gear/${slotId}_${window.GameConfig.QUALITIES[item.q].id}.webp?v=2`;
    }
    return `assets/icons/slot_${slotId}.webp?v=18`;
  }

  function slotGlowCls(item) {
    return !item ? ' gi-glow' : '';
  }

  function cardHtml(item, title) {
    if (!item) {
      return `<div class="item-card empty"><div class="item-name">${title}</div><div class="item-sub">空</div></div>`;
    }
    const q = window.GameConfig.QUALITIES[item.q];
    const glow = slotGlowCls(item);
    const subs = (item.sub || []).map((pair) => `<div>${window.Equip.formatSub(pair)}</div>`).join('');
    return `<div class="item-card" style="border-color:${q.color};color:${q.color}">
      <div class="item-card-head">
        <img class="gi item-card-icon${glow}" src="${gearIconSrc(item.s, item)}" alt="" aria-hidden="true">
        <div class="item-card-meta">
          <div class="item-name">${window.Equip.itemName(item)}</div>
          <div class="item-lv">Lv.${item.lv}</div>
        </div>
      </div>
      <div class="item-main">${window.Equip.formatMain(item)}</div>
      <div class="item-subs">${subs}</div>
    </div>`;
  }

  let lastGridSig = '';
  let slotRefs = null;

  function renderGrid() {
    const grid = $('equip-grid');
    if (!grid) return;
    const slots = window.GameConfig.EQUIP_SLOTS;
    const equip = window.GameState.state.equip;
    const sig = slots
      .map((slot) => {
        const it = equip[slot.id];
        return it ? `${slot.id}:${it.q}:${it.lv}` : `${slot.id}:-`;
      })
      .join('|');
    const needRebuild = !slotRefs || grid.children.length !== slots.length;
    if (!needRebuild && sig === lastGridSig) return;

    if (needRebuild) {
      grid.innerHTML = '';
      slotRefs = {};
      slots.forEach((slot) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'equip-slot';
        btn.dataset.slot = slot.id;
        btn.innerHTML = `<span class="slot-lv"></span><img class="gi slot-icon" width="34" height="34" src="assets/icons/slot_${slot.id}.webp?v=18" alt="" aria-hidden="true"><div class="slot-info"><span class="slot-name">${slot.name}</span><span class="slot-item"></span></div>`;
        grid.appendChild(btn);
        slotRefs[slot.id] = {
          btn,
          lvEl: btn.querySelector('.slot-lv'),
          imgEl: btn.querySelector('.slot-icon'),
          nameEl: btn.querySelector('.slot-name'),
          itemEl: btn.querySelector('.slot-item'),
        };
      });
    }

    slots.forEach((slot) => {
      const ref = slotRefs[slot.id];
      const item = equip[slot.id];
      const q = item ? window.GameConfig.QUALITIES[item.q] : null;
      const glow = !item ? ' gi-glow' : '';
      const src = gearIconSrc(slot.id, item);
      if (ref.imgEl.getAttribute('src') !== src) {
        ref.imgEl.src = src;
      }
      ref.btn.className = 'equip-slot' + (item ? ' filled' : '');
      ref.btn.style.borderColor = q ? q.color : 'rgba(230,201,138,0.35)';
      ref.lvEl.textContent = item ? 'Lv' + item.lv : '';
      ref.imgEl.className = 'gi slot-icon' + glow;
      ref.nameEl.textContent = slot.name;
      ref.itemEl.textContent = q ? q.name : '空';
    });

    lastGridSig = sig;
  }

  function renderTree() {
    const s = window.GameState.state;
    const tree = s.tree;
    const cap = window.GameConfig.peachCap(tree.lv);
    const locked = !unlocked();
    const lockedEl = $('gear-locked');
    const body = $('gear-body');
    if (lockedEl) lockedEl.style.display = locked ? 'block' : 'none';
    if (body) body.style.display = locked ? 'none' : 'flex';
    if (locked) {
      const badge = $('badge-gear');
      if (badge) badge.classList.remove('visible');
      return;
    }
    const attr = window.Equip.attributes(s);
    const cp = Math.round(window.Equip.combatPower(s));
    $('cp-value').textContent = fmt(cp);
    $('cp-stats').textContent = `攻${fmt(attr.atk)} · 血${fmt(attr.hp)} · 防${fmt(attr.def)} · 速${fmt(attr.spd)}`;
    $('peach-count').textContent = `${tree.peaches}/${cap}`;
    const remain = Math.max(0, (tree.regenAt || 0) + window.GameConfig.PEACH.INTERVAL_MS - Date.now());
    $('peach-next').textContent =
      tree.peaches >= cap ? '仙桃已满' : `下一枚 ${window.GameConfig.formatDuration(Math.ceil(remain / 1000))}`;
    const cost = window.GameConfig.treeUpgradeCost(tree.lv);
    const secs = Math.round(window.GameConfig.treeUpgradeMs(tree.lv) / 1000);
    $('tree-lv-label').textContent = `树 Lv${tree.lv}`;
    if (tree.upEnd && tree.upEnd > Date.now()) {
      const left = Math.ceil((tree.upEnd - Date.now()) / 1000);
      $('tree-cost-label').textContent = `升级中 ${window.GameConfig.formatDuration(left)}`;
      $('btn-tree-up').disabled = true;
    } else if (tree.lv >= window.GameConfig.TREE_MAX_LEVEL) {
      $('tree-cost-label').textContent = '仙桃树已圆满';
      $('btn-tree-up').disabled = true;
    } else {
      $('tree-cost-label').textContent = `升级需 ${fmt(cost)} 灵玉 / ${window.GameConfig.formatDuration(secs)}`;
      $('btn-tree-up').disabled = (s.lingyu || 0) < cost;
    }
    $('lingyu-val').textContent = fmt(s.lingyu || 0);
    $('pity-label').textContent = `地品保底 ${s.pity.di}/50 · 天品 ${s.pity.tian}/200`;
    $('btn-pick-peach').disabled = (tree.peaches || 0) < 1 || !!s.pending;
    const pickText = $('btn-pick-peach-text');
    if (pickText) pickText.textContent = s.pending ? '先处理掉落' : '摘桃';
    else $('btn-pick-peach').textContent = s.pending ? '先处理掉落' : '摘桃';
    const autoOn = $('auto-decomp-on');
    const autoQ = $('auto-decomp-q');
    if (document.activeElement !== autoOn) autoOn.checked = !!(s.autoDecomp && s.autoDecomp.on);
    if (document.activeElement !== autoQ) autoQ.value = String((s.autoDecomp && s.autoDecomp.maxQ) || 0);
    const badge = $('badge-gear');
    const ready = tree.peaches >= 10 || (tree.upEnd && tree.upEnd <= Date.now());
    if (badge) badge.classList.toggle('visible', ready);
    renderGrid();
  }

  function showReveal(item) {
    const el = $('peach-reveal');
    if (!el) return;
    const q = window.GameConfig.QUALITIES[item.q];
    el.style.color = q.color;
    el.textContent = q.name;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  function openCompare(item) {
    const s = window.GameState.state;
    const old = s.equip[item.s];
    const oldCp = Math.round(window.Equip.combatPower(s));
    const newCp = Math.round(window.Equip.powerWithSwap(s, item));
    const delta = newCp - oldCp;
    const deltaEl = $('compare-delta');
    deltaEl.textContent = `战力 ${delta >= 0 ? '+' : ''}${fmt(delta)}`;
    deltaEl.style.color = delta >= 0 ? '#7ddea0' : '#f07167';
    $('compare-old').innerHTML = cardHtml(old, '当前');
    $('compare-new').innerHTML = cardHtml(item, '新获得');
    $('compare-modal').classList.add('active');
  }

  function closeCompare() {
    $('compare-modal').classList.remove('active');
  }

  function equipOrPrompt(item) {
    const s = window.GameState.state;
    const current = s.equip[item.s];
    if (!current) {
      const before = window.Equip.combatPower(s);
      s.equip[item.s] = item;
      if (item.s === 'weapon') s.flags.weapon = true;
      const delta = Math.round(window.Equip.combatPower(s) - before);
      log(`空位纳入【${window.Equip.itemName(item)}】，战力 +${fmt(delta)}`, 'success');
      showReveal(item);
      return;
    }
    const oldCp = window.Equip.combatPower(s);
    const newCp = window.Equip.powerWithSwap(s, item);
    const auto = s.autoDecomp || {};
    const worse = newCp <= oldCp;
    if (auto.on && worse && item.q <= (auto.maxQ || 0)) {
      const jade = window.Titles.jadeValue(s, item);
      s.lingyu = (s.lingyu || 0) + jade;
      s.decomposed = (s.decomposed || 0) + 1;
      log(`自动分解【${window.Equip.itemName(item)}】，灵玉 +${jade}`, 'gold');
      showReveal(item);
      return;
    }
    s.pending = item;
    showReveal(item);
    setTimeout(() => openCompare(item), 420);
  }

  function pickPeach() {
    const s = window.GameState.state;
    if (!unlocked() || s.pending || (s.tree.peaches || 0) < 1) return;
    s.tree.peaches -= 1;
    s.peachesPicked = (s.peachesPicked || 0) + 1;
    const item = window.Equip.rollItem(s);
    if (item.q >= 1) s.flags.ling = true;
    if (item.q >= 3) s.flags.di = true;
    equipOrPrompt(item);
    window.GameState.saveGame();
    if (window.Titles) Titles.sync(s);
    if (window.TitlesUI) TitlesUI.flushToasts();
    onChange();
    renderTree();
  }

  function replacePending() {
    const s = window.GameState.state;
    const item = s.pending;
    if (!item) return;
    const old = s.equip[item.s];
    if (old) {
      const jade = window.Titles.jadeValue(s, old);
      s.lingyu = (s.lingyu || 0) + jade;
      s.decomposed = (s.decomposed || 0) + 1;
      log(`替换并分解旧装备，灵玉 +${jade}`, 'gold');
    }
    s.equip[item.s] = item;
    if (item.s === 'weapon') s.flags.weapon = true;
    s.pending = null;
    closeCompare();
    window.GameState.saveGame();
    if (window.Titles) Titles.sync(s);
    if (window.TitlesUI) TitlesUI.flushToasts();
    onChange();
    renderTree();
  }

  function decomposePending() {
    const s = window.GameState.state;
    const item = s.pending;
    if (!item) return;
    const jade = window.Titles.jadeValue(s, item);
    s.lingyu = (s.lingyu || 0) + jade;
    s.decomposed = (s.decomposed || 0) + 1;
    s.pending = null;
    log(`分解【${window.Equip.itemName(item)}】，灵玉 +${jade}`, 'gold');
    closeCompare();
    window.GameState.saveGame();
    if (window.Titles) Titles.sync(s);
    if (window.TitlesUI) TitlesUI.flushToasts();
    onChange();
    renderTree();
  }

  function upgradeTree() {
    const s = window.GameState.state;
    const tree = s.tree;
    if (tree.upEnd && tree.upEnd > Date.now()) return;
    if (tree.lv >= window.GameConfig.TREE_MAX_LEVEL) return;
    const cost = window.GameConfig.treeUpgradeCost(tree.lv);
    if ((s.lingyu || 0) < cost) return;
    s.lingyu -= cost;
    tree.upEnd = Date.now() + window.GameConfig.treeUpgradeMs(tree.lv);
    log(`仙桃树开始蕴养至 Lv${tree.lv + 1}`, 'success');
    window.GameState.saveGame();
    onChange();
    renderTree();
  }

  function openItem(slotId) {
    const item = window.GameState.state.equip[slotId];
    const slot = window.Equip.slotDef(slotId);
    const glow = slotGlowCls(item);
    const iconHtml = `<div class="item-modal-icon-wrap"><img class="gi item-modal-icon${glow}" src="${gearIconSrc(slotId, item)}" alt="" aria-hidden="true"></div>`;
    $('item-modal-title').textContent = item ? window.Equip.itemName(item) : slot.name;
    $('item-modal-body').innerHTML =
      iconHtml +
      (item
        ? `${window.Equip.formatMain(item)}<br>${(item.sub || []).map((p) => window.Equip.formatSub(p)).join('<br>')}<br>分解可得 ${window.Equip.decomposeValue(item)} 灵玉`
        : '此部位尚无装备。');
    $('item-modal').classList.add('active');
  }

  function init(hooks) {
    log = (hooks && hooks.log) || log;
    onChange = (hooks && hooks.onChange) || onChange;
    const settingsBtn = $('btn-open-settings');
    const settingsModal = $('settings-modal');
    if (settingsBtn && settingsModal) {
      settingsBtn.addEventListener('click', () => settingsModal.classList.add('active'));
      $('btn-close-settings').addEventListener('click', () => settingsModal.classList.remove('active'));
    }
    $('btn-pick-peach').addEventListener('click', pickPeach);
    $('btn-tree-up').addEventListener('click', upgradeTree);
    $('btn-replace').addEventListener('click', replacePending);
    $('btn-decompose').addEventListener('click', decomposePending);
    $('btn-close-item').addEventListener('click', () => $('item-modal').classList.remove('active'));
    $('equip-grid').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-slot]');
      if (btn) openItem(btn.dataset.slot);
    });
    $('auto-decomp-on').addEventListener('change', (e) => {
      window.GameState.state.autoDecomp.on = e.target.checked;
      window.GameState.saveGame();
    });
    $('auto-decomp-q').addEventListener('change', (e) => {
      window.GameState.state.autoDecomp.maxQ = Number(e.target.value);
      window.GameState.saveGame();
    });
    if (window.GameState.state.pending) openCompare(window.GameState.state.pending);
    renderTree();
  }

  let lastPaint = 0;

  function tick() {
    const changed = window.GameState.tickTimers(Date.now());
    if (changed.leveled) log('仙桃树升级完成。', 'gold');
    const now = Date.now();
    if (changed.leveled || changed.peaches || now - lastPaint > 400) {
      lastPaint = now;
      renderTree();
    }
  }

  window.GearUI = { init, tick, render: renderTree };
})();
