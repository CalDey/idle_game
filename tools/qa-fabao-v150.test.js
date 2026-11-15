// v150 法宝页布局回归护栏（用户 iPhone Safari 真机：仙桃树卡裁掉摘桃按钮、升级卡被压扁、因果簿通栏）。
// 静态 CSS/HTML 检查 + 假 DOM 跑 GearUI.render。不是视觉验收，真机效果仍需 QA 在 390/430/440/375×667 回归。
// 用法：node tools/qa-fabao-v150.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const text = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const css = text('css/style.css').replace(/\/\*[\s\S]*?\*\//g, '');
const html = text('index.html');
const gearSrc = text('js/gear.js');

// 把整份 CSS 拆成 { media, selectors[], body }，media 为空表示基础样式。
function allRules(src) {
  const out = [];
  const walk = (s, media) => {
    let i = 0;
    while (i < s.length) {
      const open = s.indexOf('{', i);
      if (open < 0) break;
      const head = s.slice(i, open).trim();
      let depth = 1;
      let j = open + 1;
      while (j < s.length && depth > 0) {
        if (s[j] === '{') depth += 1;
        else if (s[j] === '}') depth -= 1;
        j += 1;
      }
      const body = s.slice(open + 1, j - 1);
      if (/^@media/.test(head)) walk(body, head);
      else if (!/^@/.test(head)) {
        out.push({ media, selectors: head.split(',').map((x) => x.trim()).filter(Boolean), body, at: out.length });
      }
      i = j;
    }
  };
  walk(src, '');
  return out;
}
const rules = allRules(css);
// 同一规则里重复声明时取最后一条（与浏览器层叠一致）
const decl = (body, prop) => {
  const re = new RegExp(`(?:^|[;\\s{])${prop}\\s*:\\s*([^;]+)`, 'g');
  let m;
  let last = null;
  while ((m = re.exec(body))) last = m[1].trim();
  return last;
};
const hits = (re) => rules.filter((r) => r.selectors.some((s) => re.test(s)));

let passed = 0;
function check(name, fn) { fn(); passed += 1; console.log(`ok - ${name}`); }

check('L1 仙桃树/升级卡：任何断点都没有固定高度、max-height 或 overflow 裁切，且不被 flex 压缩', () => {
  const cardRules = hits(/(^|[\s>])\.(peach-card|tree-card)(?![\w-])/)
    .filter((r) => r.selectors.some((s) => /\.(peach-card|tree-card)$/.test(s.replace(/\.q-xian$/, '').replace(/^\.gufeng-card/, ''))
      || /\.(peach-card|tree-card)$/.test(s)));
  assert.ok(cardRules.length > 0, '找到卡片规则');
  cardRules.forEach((r) => {
    const sel = r.selectors.join(', ');
    assert.strictEqual(decl(r.body, 'height'), null, `${sel} 不设固定 height`);
    assert.strictEqual(decl(r.body, 'max-height'), null, `${sel} 不设 max-height`);
    const ov = decl(r.body, 'overflow') || decl(r.body, 'overflow-y') || '';
    assert.ok(!/hidden|clip|auto|scroll/.test(ov), `${sel} 不裁切：${ov}`);
    const flex = decl(r.body, 'flex') || '';
    assert.ok(!/^\s*\d+\s+[1-9]/.test(flex), `${sel} 不允许收缩：flex ${flex}`);
  });
  const base = rules.find((r) => !r.media && r.selectors.includes('.peach-card') && r.selectors.includes('.tree-card'));
  assert.ok(base, '.peach-card, .tree-card 基础规则');
  assert.strictEqual(decl(base.body, 'flex-shrink'), '0');
});

check('L2 gear-body 与其所有子卡保持自然高度：flex-shrink:0，gear-body 不再 min-height:0', () => {
  const gb = rules.filter((r) => r.selectors.some((s) => /(^|\s)\.gear-body$/.test(s)));
  gb.forEach((r) => {
    assert.notStrictEqual(decl(r.body, 'min-height'), '0', `${r.selectors} 不能 min-height:0`);
    assert.strictEqual(decl(r.body, 'height'), null);
    assert.strictEqual(decl(r.body, 'max-height'), null);
    const ov = decl(r.body, 'overflow') || '';
    assert.ok(!/hidden|clip/.test(ov));
  });
  const baseGb = rules.find((r) => !r.media && r.selectors.includes('.gear-body'));
  assert.match(decl(baseGb.body, 'flex'), /^0 0 auto$/);
  const kids = rules.find((r) => !r.media && r.selectors.includes('#tab-gear .gear-body > *'));
  assert.ok(kids, '#tab-gear .gear-body > * 规则存在');
  assert.strictEqual(decl(kids.body, 'flex-shrink'), '0');
  assert.ok(kids.selectors.includes('#tab-gear > #gear-locked'));
});

check('L3 #tab-gear 及其子孙不受 100vh / 100% 高度 / --bt-panel-h / max-height 约束', () => {
  hits(/#tab-gear|\.gear-body|\.peach-|\.tree-row|\.tree-up|\.auto-row|\.cp-bar|\.equip-grid/).forEach((r) => {
    const sel = r.selectors.join(', ');
    if (/\.peach-tree-img/.test(sel) || /\.tree-up-bar/.test(sel)) return; // 树图片在固定尺寸框里撑满、进度条 3px，都不是卡片约束
    const h = decl(r.body, 'height');
    if (/\.peach-tree-art/.test(sel)) {
      assert.ok(!h || /^\d+px$/.test(h), `${sel} 树图框只用固定像素：${h}`);
      return;
    }
    assert.ok(!h, `${sel} 不设 height：${h}`);
    assert.strictEqual(decl(r.body, 'max-height'), null, `${sel} 不设 max-height`);
    assert.ok(!/vh|dvh|--bt-panel-h/.test(r.body), `${sel} 不引用视口高度/面板高度`);
  });
});

check('L4 #tab-gear 仍是隐藏滚动条的普通纵向滚动列', () => {
  const pane = rules.find((r) => !r.media && r.selectors.includes('.tab-pane.active') && /overflow-y/.test(r.body));
  assert.ok(pane);
  assert.strictEqual(decl(pane.body, 'overflow-y'), 'auto');
  assert.strictEqual(decl(pane.body, 'flex-direction') || 'column', 'column');
  const hide = rules.find((r) => r.selectors.includes('.tab-pane.active') && /scrollbar-width:\s*none/.test(r.body));
  assert.ok(hide, 'scrollbar-width:none 仍在');
  assert.ok(rules.some((r) => r.selectors.includes('.tab-pane.active::-webkit-scrollbar') && /display:\s*none/.test(r.body)));
  hits(/#tab-gear$/).forEach((r) => {
    assert.ok(!/overflow(-y)?:\s*hidden/.test(r.body), '#tab-gear 自身不关滚动');
  });
});

check('L5 底部留白：底栏在文档流（非 fixed/absolute），gear-body 留白含 safe-area；窄屏不再给滚动容器叠 padding', () => {
  hits(/^\.bottom-nav$/).forEach((r) => {
    const pos = decl(r.body, 'position');
    assert.ok(!pos || !/fixed|absolute/.test(pos), `.bottom-nav 必须在文档流中，否则 #tab-gear 需要加导航高度：${pos}`);
  });
  const nav = rules.find((r) => !r.media && r.selectors.includes('.bottom-nav'));
  assert.match(decl(nav.body, 'flex'), /^0 0 auto$/);
  assert.match(decl(nav.body, 'padding'), /env\(safe-area-inset-bottom\)/, '底栏自身已吃掉 home 指示条安全区');
  const app = rules.find((r) => !r.media && r.selectors.includes('.app-container') && /flex-direction/.test(r.body));
  assert.strictEqual(decl(app.body, 'flex-direction'), 'column');
  const pad = rules.find((r) => !r.media && r.selectors.includes('#tab-gear .gear-body') && /padding-bottom/.test(r.body));
  assert.ok(pad, 'gear-body 有底部留白');
  assert.match(decl(pad.body, 'padding-bottom'), /safe-area-inset-bottom/);
  assert.match(decl(pad.body, 'padding-bottom'), /max\(20px/);
  const narrowPane = rules.filter((r) => r.media && r.selectors.includes('#tab-gear') && /padding-bottom/.test(r.body));
  assert.strictEqual(narrowPane.length, 0, '媒体查询里不再改 #tab-gear 的 padding-bottom');
  // gear-body 在 DOM 里是 #tab-gear 的最后一个子元素，且包着自动分解行
  const pane = html.slice(html.indexOf('<section id="tab-gear"'), html.indexOf('</section>', html.indexOf('<section id="tab-gear"')));
  const bodyIdx = pane.indexOf('id="gear-body"');
  assert.ok(bodyIdx > 0 && pane.indexOf('id="auto-decomp-row"') > bodyIdx);
});

check('L6 因果簿：放进战力条右侧，是小金边按钮；任何断点都不是 width:100% / display:block，[hidden] 真隐藏', () => {
  const cp = html.match(/<div class="cp-bar">([\s\S]*?)<div id="equip-grid"/);
  assert.ok(cp, '战力条存在');
  assert.ok(cp[1].includes('id="btn-karma-ledger-gear"'), '因果簿按钮在战力条里，不单独占一行');
  assert.match(cp[1], /<div class="cp-text">/);
  const btn = html.match(/<button id="btn-karma-ledger-gear"[^>]*>/)[0];
  assert.match(btn, /codex-entry-btn karma-ledger-entry/);
  assert.match(btn, /\shidden[\s>]/);
  const karmaRules = hits(/karma-ledger-entry(?![\w-])|#btn-karma-ledger-gear/).filter((r) => !r.selectors.every((s) => /\[hidden\]/.test(s)));
  assert.ok(karmaRules.length > 0);
  karmaRules.forEach((r) => {
    const sel = r.selectors.join(', ');
    const w = decl(r.body, 'width');
    assert.ok(!w || !/100%|100vw/.test(w), `${sel} 不通栏：width ${w}`);
    const d = decl(r.body, 'display');
    assert.ok(!d || !/^(block|flex|grid)$/.test(d), `${sel} 不是块级：display ${d}`);
    assert.notStrictEqual(decl(r.body, 'align-self'), 'stretch');
  });
  const main = rules.find((r) => !r.media && r.selectors.includes('.karma-ledger-entry') && /display/.test(r.body));
  assert.strictEqual(decl(main.body, 'display'), 'inline-flex');
  assert.strictEqual(decl(main.body, 'flex'), '0 0 auto');
  assert.strictEqual(decl(main.body, 'width'), 'auto');
  const hidden = rules.find((r) => r.selectors.includes('.karma-ledger-entry[hidden]'));
  assert.ok(hidden && decl(hidden.body, 'display') === 'none', 'inline-flex 不能盖掉 hidden');
  assert.ok(hidden.at > main.at);
  const codex = rules.find((r) => !r.media && r.selectors.includes('.codex-entry-btn') && /border/.test(r.body));
  assert.match(codex.body, /border:\s*1px solid rgba\(230, 201, 138/);
  // 战力条是横向 flex，文字列可收缩、按钮不收缩
  const bar = rules.find((r) => !r.media && r.selectors.includes('.cp-bar'));
  assert.strictEqual(decl(bar.body, 'display'), 'flex');
  const ct = rules.find((r) => !r.media && r.selectors.includes('.cp-text'));
  assert.strictEqual(decl(ct.body, 'min-width'), '0');
  // 窄屏媒体查询里也不能把因果簿/图鉴按钮拉宽
  rules.filter((r) => r.media && r.selectors.some((s) => /codex-entry-btn$/.test(s) && !/#tab-cultivate/.test(s))).forEach((r) => {
    assert.ok(!/width:\s*100%/.test(r.body) && !/display:\s*block/.test(r.body), `${r.media} ${r.selectors}`);
  });
});

check('L7 升级中：是可读的状态条（不透明、金字），换到文字下方整行，不挤文字列', () => {
  assert.match(html, /<div class="tree-row tree-up-row">\s*<div class="tree-up-info">/);
  const row = rules.find((r) => !r.media && r.selectors.includes('.tree-up-row'));
  assert.strictEqual(decl(row.body, 'flex-wrap'), 'wrap');
  const info = rules.find((r) => !r.media && r.selectors.includes('.tree-up-info'));
  assert.strictEqual(decl(info.body, 'min-width'), '0');
  const up = rules.find((r) => !r.media && r.selectors.includes('#btn-tree-up.is-upgrading'));
  assert.match(decl(up.body, 'flex'), /^1 1 100%$/);
  assert.ok(parseFloat(decl(up.body, 'font-size')) >= 12, '字号 ≥12px');
  const dis = rules.find((r) => !r.media && r.selectors.includes('#btn-tree-up.is-upgrading:disabled'));
  assert.ok(dis, '升级中的 disabled 外观单独覆盖');
  assert.strictEqual(decl(dis.body, 'opacity'), '1', '不再是 0.42 的灰幽灵框');
  assert.match(decl(dis.body, 'color'), /accent-gold-bright/);
  // 覆盖要赢过 .btn:disabled（0,2,0）
  assert.ok(rules.some((r) => r.selectors.includes('.btn:disabled')));
  // 运行时文案：上面写目标等级，按钮写「升级中 剩余时间」
  assert.ok(gearSrc.includes('正在升至 Lv'));
  assert.ok(gearSrc.includes('setUpLabel(`升级中 ${dur}`)'));
});

console.log(`qa-fabao-v150.test.js ok: ${passed} checks`);
