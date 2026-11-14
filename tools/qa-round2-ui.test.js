// QA 第 2 批 C6/C7：用 jsdom 检查派遣按钮可点、功课弹窗只滚内容区。
// 用法：node tools/qa-round2-ui.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const text = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function loadJsdom() {
  const candidates = [
    path.join(__dirname, '.vendor/node_modules/jsdom'),
    '/tmp/qa-jsdom/node_modules/jsdom',
    'jsdom'
  ];
  for (const c of candidates) {
    try {
      return require(c);
    } catch (err) {
      /* try next */
    }
  }
  const dest = path.join('/tmp', 'qa-jsdom');
  fs.mkdirSync(dest, { recursive: true });
  if (!fs.existsSync(path.join(dest, 'package.json'))) {
    spawnSync('npm', ['init', '-y'], { cwd: dest, stdio: 'ignore' });
  }
  const inst = spawnSync('npm', ['install', 'jsdom@24', '--no-fund', '--no-audit'], {
    cwd: dest,
    encoding: 'utf8'
  });
  if (inst.status !== 0) {
    throw new Error(`无法安装 jsdom：${inst.stderr || inst.stdout || inst.status}`);
  }
  return require(path.join(dest, 'node_modules/jsdom'));
}

const { JSDOM } = loadJsdom();

function parsePx(v, fallback) {
  if (v == null) return fallback;
  if (v === 'auto' || v === '') return fallback;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseZ(v) {
  if (v == null || v === 'auto' || v === '') return 0;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

function installHitTest(window, boxes) {
  const doc = window.document;
  const orig = doc.elementFromPoint && doc.elementFromPoint.bind(doc);
  doc.elementFromPoint = function elementFromPoint(x, y) {
    let best = null;
    let bestZ = -Infinity;
    let bestOrder = -1;
    let order = 0;
    const visit = (el) => {
      const cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      if (el.hasAttribute('hidden')) return;
      const box = boxes.get(el);
      if (box) {
        const inside = x >= box.left && x < box.right && y >= box.top && y < box.bottom;
        if (inside && cs.pointerEvents !== 'none') {
          const z = parseZ(cs.zIndex) + (cs.position === 'static' ? 0 : 0.1);
          if (z > bestZ || (z === bestZ && order > bestOrder)) {
            best = el;
            bestZ = z;
            bestOrder = order;
          }
        }
      }
      order += 1;
      for (const child of el.children) visit(child);
    };
    visit(doc.body);
    if (best) return best;
    if (orig) {
      try {
        const hit = orig(x, y);
        if (hit) return hit;
      } catch (err) {
        /* jsdom 常未实现布局 */
      }
    }
    return null;
  };
}

function layoutHome(window, sceneEl) {
  const sceneBox = { left: 0, top: 0, width: 375, height: 501, right: 375, bottom: 501 };
  const boxes = new Map();
  const place = (el, box) => {
    if (!el) return;
    boxes.set(el, box);
    el.getBoundingClientRect = () => ({
      x: box.left,
      y: box.top,
      top: box.top,
      left: box.left,
      right: box.right,
      bottom: box.bottom,
      width: box.width,
      height: box.height,
      toJSON() { return this; }
    });
  };
  place(sceneEl, sceneBox);

  const stage = window.document.getElementById('home-stage');
  place(stage, { ...sceneBox });
  const layer = window.document.getElementById('home-layer');
  place(layer, { ...sceneBox });

  const btn = window.document.getElementById('btn-dispatch-open');
  const cs = window.getComputedStyle(btn);
  const top = parsePx(cs.top, 52);
  const right = parsePx(cs.right, 10);
  const height = parsePx(cs.height, 34) || 34;
  const width = 88;
  const left = sceneBox.width - right - width;
  place(btn, {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height
  });

  const upgrade = window.document.querySelector('.home-upgrade-btn');
  if (upgrade) {
    const ucs = window.getComputedStyle(upgrade);
    const uTop = parsePx(ucs.top, 10);
    const uRight = parsePx(ucs.right, 10);
    const uH = parsePx(ucs.height, 34) || 34;
    const uW = 72;
    const uLeft = sceneBox.width - uRight - uW;
    place(upgrade, { left: uLeft, top: uTop, width: uW, height: uH, right: uLeft + uW, bottom: uTop + uH });
  }

  const hot = window.document.querySelector('.home-hot');
  if (hot) {
    place(hot, { left: 40, top: 200, width: 80, height: 80, right: 120, bottom: 280 });
  }
  return boxes;
}

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const css = text('css/style.css');

check('C6 派遣按钮在 #home-layer 之上，elementFromPoint 能点到，洞府热区仍可点', () => {
  const html = `<!doctype html><html><head><style>${css}</style></head><body>
    <div class="gufeng-card home-card" style="width:375px;height:501px">
      <div id="home-scene" class="home-scene">
        <div id="home-stage" class="home-stage">
          <img id="home-bg" class="home-bg" alt="">
          <div id="home-glow" class="home-glow"></div>
          <div id="home-layer"><button class="home-hot" type="button" id="home-hot-1">府</button></div>
          <div id="home-reveal" class="home-reveal"></div>
        </div>
        <div id="home-title" class="home-title">洞府</div>
        <button id="btn-home-upgrade" class="home-upgrade-btn" type="button">升级</button>
        <button id="btn-dispatch-open" class="home-dispatch-btn" type="button">派遣</button>
      </div>
    </div>
  </body></html>`;
  const dom = new JSDOM(html, { pretendToBeVisual: true, url: 'https://example.test/' });
  const { window } = dom;
  const btn = window.document.getElementById('btn-dispatch-open');
  const layer = window.document.getElementById('home-layer');
  const stage = window.document.getElementById('home-stage');
  const hot = window.document.getElementById('home-hot-1');

  const bcs = window.getComputedStyle(btn);
  const lcs = window.getComputedStyle(layer);
  const scs = window.getComputedStyle(stage);
  const hcs = window.getComputedStyle(hot);

  assert.strictEqual(bcs.position, 'absolute', '派遣按钮应为 absolute');
  assert.ok(parseZ(bcs.zIndex) > parseZ(scs.zIndex), `按钮 z-index ${bcs.zIndex} 应高于 home-stage ${scs.zIndex}`);
  assert.ok(parseZ(bcs.zIndex) > parseZ(lcs.zIndex), `按钮 z-index ${bcs.zIndex} 应高于 home-layer ${lcs.zIndex}`);
  assert.strictEqual(lcs.pointerEvents, 'none', '#home-layer 不得拦截点击');
  assert.notStrictEqual(bcs.pointerEvents, 'none', '派遣按钮要能点');
  assert.strictEqual(hcs.pointerEvents, 'auto', '洞府热区在 layer 关闭事件后仍可点');

  const boxes = layoutHome(window, window.document.getElementById('home-scene'));
  installHitTest(window, boxes);
  const box = boxes.get(btn);
  const x = Math.floor((box.left + box.right) / 2);
  const y = Math.floor((box.top + box.bottom) / 2);
  const hit = window.document.elementFromPoint(x, y);
  assert.ok(hit, `elementFromPoint(${x},${y}) 应命中元素`);
  assert.ok(hit === btn || btn.contains(hit), `派遣按钮中心应点到按钮，实际为 ${hit && (hit.id || hit.className)}`);
  assert.notStrictEqual(hit, layer, '点击不得被 #home-layer 吃掉');

  const hotBox = boxes.get(hot);
  const hx = Math.floor((hotBox.left + hotBox.right) / 2);
  const hy = Math.floor((hotBox.top + hotBox.bottom) / 2);
  const hotHit = window.document.elementFromPoint(hx, hy);
  assert.ok(hotHit === hot || hot.contains(hotHit), '洞府热区中心仍可点到 .home-hot');
});

check('C7 每日功课弹窗本身不滚出屏幕，只有内容区 overflow:auto', () => {
  const html = `<!doctype html><html><head><style>${css}</style></head><body>
    <div id="daily-modal" class="modal-backdrop active" aria-hidden="false">
      <div class="modal-dialog daily-dialog" role="dialog">
        <div class="card-header daily-header"><span class="card-title">每日功课</span></div>
        <div class="daily-body">
          <section class="daily-section">${'<p class="daily-task">功课</p>'.repeat(40)}</section>
        </div>
      </div>
    </div>
  </body></html>`;
  const dom = new JSDOM(html, { pretendToBeVisual: true, url: 'https://example.test/' });
  const { window } = dom;
  const modal = window.document.getElementById('daily-modal');
  const dialog = window.document.querySelector('.daily-dialog');
  const body = window.document.querySelector('.daily-body');
  const header = window.document.querySelector('.daily-header');

  const mcs = window.getComputedStyle(modal);
  const dcs = window.getComputedStyle(dialog);
  const bcs = window.getComputedStyle(body);
  const hcs = window.getComputedStyle(header);

  assert.ok(['hidden', 'clip'].includes(mcs.overflow) || mcs.overflowY === 'hidden', `遮罩不应滚走弹窗，实际 overflow=${mcs.overflow}`);
  assert.ok(['hidden', 'clip'].includes(dcs.overflow) || dcs.overflowY === 'hidden', `弹窗本身 overflow 应为 hidden，实际 ${dcs.overflow}`);
  assert.ok(dcs.maxHeight && dcs.maxHeight !== 'none', `弹窗应有 max-height，实际 ${dcs.maxHeight}`);
  assert.ok(dcs.display === 'flex' || dcs.display === 'inline-flex', '弹窗应为 flex 列布局');
  assert.ok(['auto', 'scroll', 'overlay'].includes(bcs.overflow) || ['auto', 'scroll', 'overlay'].includes(bcs.overflowY), `内容区应可滚动，实际 overflow=${bcs.overflow}/${bcs.overflowY}`);
  assert.ok(bcs.minHeight === '0px' || bcs.minHeight === '0', `内容区 min-height 应为 0，实际 ${bcs.minHeight}`);
  assert.ok(hcs.flexGrow === '0' || hcs.flexShrink === '0' || hcs.flex === '0 0 auto' || hcs.flex === 'none' || parsePx(hcs.flexGrow, 0) === 0, '标题栏不应被挤出');
});

console.log(`qa-round2-ui.test.js ok: ${passed} checks`);
