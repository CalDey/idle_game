// 引导跟进：渡劫门槛下不显示「约 T 秒后能突破」、目标条附带通关1-10 而不跳过逐重突破；
// QA 第 6 批 H1–H3；MAIN BRAIN 两条 P3（withState 空赋值、突破按钮 textContent 冲掉红点）。
// 用法：node tools/guide-followup.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const text = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function memoryStorage(initial) {
  const data = Object.assign({}, initial || {});
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    _data: data
  };
}

function loadRuntime(extraFiles, doc) {
  const sandbox = {
    window: {},
    console,
    localStorage: memoryStorage(),
    setTimeout,
    clearTimeout,
    matchMedia: () => ({ matches: false }),
    document: doc || {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener() {},
      createElement: () => ({ classList: { add() {}, remove() {}, contains() { return false; } } })
    }
  };
  sandbox.globalThis = sandbox.window;
  sandbox.window.document = sandbox.document;
  sandbox.document.defaultView = sandbox.window;
  const files = ['js/config.js', 'js/equip.js', 'js/battle.js', 'js/state.js', 'js/dispatch.js', 'js/newbie.js'].concat(extraFiles || []);
  files.forEach((rel) => vm.runInNewContext(text(rel), sandbox, { filename: rel }));
  return {
    CFG: sandbox.window.GameConfig,
    GS: sandbox.window.GameState,
    NB: sandbox.window.Newbie,
    Equip: sandbox.window.Equip,
    Codex: sandbox.window.Codex,
    sandbox
  };
}

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

check('P3 withState 已去掉：不再给只有 getter 的 GameState.state 赋值，并注明原地修改算完还原', () => {
  const src = text('js/newbie.js');
  assert.ok(!/function withState/.test(src), '不应再保留 withState');
  assert.ok(!/GS\.state\s*=/.test(src), '不应再给 GameState.state 赋值');
  assert.ok(src.includes('只有 getter') && src.includes('原地改'), '应注明 getter 只读、原地修改后还原');
  const stateSrc = text('js/state.js');
  const getter = /get state\(\)\s*\{/.test(stateSrc);
  const setter = /set state\s*\(/.test(stateSrc);
  assert.ok(getter && !setter, 'GameState.state 仍只有 getter');
});

check('P3 突破按钮只改文案 span，文案不变不写，避免每帧冲掉红点', () => {
  const html = text('index.html');
  assert.ok(html.includes('id="btn-breakthrough-text"') && html.includes('action-badge'), '文案与红点分成两个节点');
  const game = text('js/game.js');
  assert.ok(!/els\.btnBreakthrough\.textContent\s*=/.test(game), '不得再对整颗按钮写 textContent');
  assert.ok(game.includes('btn-breakthrough-text') && game.includes('btnBreakthroughText'));
  assert.ok(/breakLabel\.textContent !== breakText/.test(game), '文案变了才写');
  assert.ok(/setActionBadge\(els\.btnBreakthrough,\s*canBreak\)/.test(game));
});

check('化灵后未通关 3-10（第 30 关） 时，战败引导不出现约 T 秒后能突破 / 再修炼约 T 秒，改为先通关3-10才能突破', () => {
  const { GS, NB, Equip } = loadRuntime();
  GS.loadGame();
  const s = GS.state;
  s.realmIndex = 8; // 化灵后
  s.stage.best = 25;
  s.stage.cur = 26;
  s.tree.peaches = 0;
  s.pending = null;
  s.stones = 0;
  assert.ok(Equip.tribulationLock(s), '应处于渡劫门槛锁定');
  assert.strictEqual(NB.stageLabel(30), '3-10');
  assert.ok(NB.tribulationGate(s));
  assert.strictEqual(NB.estimateWaitEta(s), null, '锁定时 wait 必须返回 null');

  s.qi = Math.max(0, GS.getCurrentStage().reqQi - GS.getQiPerSec() * 30);
  let opts = NB.cpGainOptions(s);
  const keys = opts.map((o) => o.key);
  assert.ok(keys.includes('gate'), `应出现门槛按钮，实际 ${keys.join(',')}`);
  const gate = opts.find((o) => o.key === 'gate');
  assert.strictEqual(gate.label, '先通关3-10才能突破');
  assert.strictEqual(gate.tab, 'tab-stage');
  assert.ok(!opts.some((o) => o.key === 'wait'), '不得出现再修炼约 T 秒即可突破');
  assert.ok(!opts.some((o) => /约\s*\d+\s*秒后能突破/.test(o.label)), '不得出现约 T 秒后能突破');
  assert.ok(!opts.some((o) => /再修炼约/.test(o.label)));
  assert.strictEqual(opts[0].key, 'gate');
  assert.strictEqual(NB.recommendBest(s), null, '门槛锁定且无花销时不应推荐优先');
  assert.ok(!opts.some((o) => o.best), '无推荐项时不得把门槛或 shown[0] 标成 ★');

  // 有闲置灵石时仍可提示参悟，但不得带 T
  s.stones = 1e9;
  const detail = NB.estimateSpendDetail(s);
  assert.ok(detail, '锁定时仍可估算花灵石');
  assert.strictEqual(detail.eta, null, '锁定时 spend 不得给突破倒计时');
  assert.ok(detail.locked);
  opts = NB.cpGainOptions(s);
  assert.strictEqual(opts[0].key, 'gate');
  const spend = opts.find((o) => o.key === 'gongfa');
  if (spend) {
    assert.ok(!/约\s*\d+\s*秒后能突破/.test(spend.label), `花灵石文案不得带 T：${spend.label}`);
  }

  // 灵气已满也不能出「可以突破了」，只出通关门槛
  s.qi = GS.getCurrentStage().reqQi + 1;
  opts = NB.cpGainOptions(s);
  assert.ok(!opts.some((o) => o.key === 'break'));
  assert.ok(opts.some((o) => o.key === 'gate' && o.label === '先通关3-10才能突破'));

  const html = text('index.html');
  assert.ok(html.includes('data-gain-key="gate"') && html.includes('id="btn-goto-gate"'));
  const ui = text('js/stage-ui.js');
  assert.ok(ui.includes('btn-goto-gate') && ui.includes('focusBlockingBoss'));
});

check('通关门槛已解开后，wait / spend 的 T 恢复正常', () => {
  const { GS, NB, Equip } = loadRuntime();
  GS.loadGame();
  const s = GS.state;
  s.realmIndex = 8;
  s.stage.best = 30;
  s.tree.peaches = 0;
  s.pending = null;
  s.stones = 0;
  assert.ok(!Equip.tribulationLock(s));
  s.qi = Math.max(0, GS.getCurrentStage().reqQi - GS.getQiPerSec() * 30);
  const wait = NB.estimateWaitEta(s);
  assert.ok(wait != null && wait <= 120);
  const opts = NB.cpGainOptions(s);
  assert.ok(!opts.some((o) => o.key === 'gate'));
  assert.ok(opts.some((o) => o.key === 'wait' && o.label.includes('再修炼约')));
});

check('洞天初后目标仍是逐重突破，进度附带通关1-10（首领山魈娘娘），通关后不再附带', () => {
  const { GS, NB } = loadRuntime();
  GS.loadGame();
  const s = GS.state;
  s.peachesPicked = 30;
  s.tree.peaches = 0;
  s.gongfa[Object.keys(s.gongfa)[0]] = 2;
  s.stones = 0;
  s.realmIndex = 3;
  s.stage.best = 1;
  const g = NB.currentGoal(s);
  assert.strictEqual(g.text, '突破至洞天中', '不得把主目标改成通关1-10而跳过洞天中');
  const prog = NB.goalProgress(g, s, GS.getCurrentStage());
  assert.ok(prog.includes('通关1-10（首领山魈娘娘）'), `进度应附带 1-10 提示，实际：${prog}`);
  assert.ok(prog.startsWith('灵气 '), '不得盖掉灵气百分比');
  s.realmIndex = 4;
  const g2 = NB.currentGoal(s);
  assert.strictEqual(g2.text, '突破至洞天后', '洞天中之后继续逐重突破');
  assert.ok(NB.goalProgress(g2, s, GS.getCurrentStage()).includes('通关1-10（首领山魈娘娘）'));
  s.stage.best = 10;
  assert.ok(!NB.goalProgress(NB.currentGoal(s), s, GS.getCurrentStage()).includes('通关1-10'), '通关 1-10 后不再附带');
});

check('H1 机缘卡等待渡劫动画：anyModalOpen 覆盖播放 / 跳过 / 减弱动态直至 hideRoot', () => {
  const { NB, sandbox } = loadRuntime();
  sandbox.window.Tribulation = { isPlaying: () => true };
  assert.strictEqual(NB.anyModalOpen(), true, 'isPlaying 时应视为弹层占用');
  sandbox.window.Tribulation = { isPlaying: () => false };
  const cine = { classList: { contains: (c) => c === 'is-on' } };
  sandbox.document.getElementById = (id) => (id === 'tribulation-cinematic' ? cine : null);
  assert.strictEqual(NB.anyModalOpen(), true, '根节点 is-on 时也应等待（含跳过/减弱动态尚未 hideRoot）');
  cine.classList.contains = () => false;
  assert.strictEqual(NB.anyModalOpen(), false);

  const trib = text('js/tribulation.js');
  assert.ok(/playing = true/.test(trib) && trib.includes("classList.add('is-on'"));
  const playIdx = trib.indexOf('function play(');
  const reducedIdx = trib.indexOf('prefersReducedMotion', playIdx);
  const playingIdx = trib.indexOf('playing = true', playIdx);
  const isOnIdx = trib.indexOf("classList.add('is-on'", playIdx);
  assert.ok(playingIdx > 0 && playingIdx < reducedIdx, 'play() 在减弱动态分支前就置 playing');
  assert.ok(isOnIdx > 0 && isOnIdx < reducedIdx, 'play() 在减弱动态分支前就加上 is-on');
  assert.ok(/function hideRoot\(\)[\s\S]*playing = false[\s\S]*classList\.remove\('is-on'/.test(trib));
  assert.ok(/function skipOrClose[\s\S]*if \(!playing\) return/.test(trib), '跳过不会提前清 playing');
  const nb = text('js/newbie.js');
  assert.ok(nb.includes('isPlaying') && nb.includes('tribulation-cinematic') && nb.includes('maybeUnlockCard'));
});

check('H2 离开 Boss 关或进入新关时立刻关掉台词并取消计时、清空文案', () => {
  let banner;
  const timers = [];
  const realSet = setTimeout;
  const realClear = clearTimeout;
  const doc = {
    getElementById: (id) => {
      if (id === 'battle-stage') return { appendChild() {} };
      if (id === 'boss-quote-banner') return banner;
      return null;
    },
    createElement: (tag) => {
      banner = {
        tag,
        id: '',
        className: '',
        innerHTML: '',
        classList: {
          _on: false,
          add(c) { if (c === 'is-show') this._on = true; },
          remove(c) { if (c === 'is-show') this._on = false; },
          contains(c) { return c === 'is-show' && this._on; }
        },
        setAttribute() {},
        offsetWidth: 1
      };
      return banner;
    }
  };
  const sandbox = {
    window: { CodexData: { bossLore: { 山魈娘娘: { quote: '来战' } }, categories: [], entries: [], mobLore: {} } },
    console,
    document: doc,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: (id) => { if (id) timers[id - 1] = null; }
  };
  sandbox.globalThis = sandbox.window;
  sandbox.window.document = doc;
  vm.runInNewContext(text('js/codex.js'), sandbox, { filename: 'js/codex.js' });
  const Codex = sandbox.window.Codex;
  assert.ok(Codex && typeof Codex.showBossQuote === 'function' && typeof Codex.hideBossQuote === 'function');
  Codex.showBossQuote({ name: '山魈娘娘', isBoss: true });
  assert.ok(banner && banner.classList.contains('is-show'));
  assert.ok(banner.innerHTML.includes('来战'));
  assert.ok(timers.some(Boolean), '应有淡出计时');
  Codex.hideBossQuote();
  assert.ok(!banner.classList.contains('is-show'));
  assert.strictEqual(banner.innerHTML, '');
  assert.ok(timers.every((t) => !t), '计时应被取消');

  const ui = text('js/stage-ui.js');
  assert.ok(/function render\([\s\S]*hideBossQuote/.test(ui), 'render 离开 Boss 关时关掉台词');
  assert.ok(/function startBattle\([\s\S]*hideBossQuote[\s\S]*showBossQuote/.test(ui), '开新战先关旧台词再按需显示');
});

check('H3 ≤400px 的 path-entry 换行写在全局 nowrap 之后', () => {
  const css = text('css/style.css');
  const mediaMatches = [...css.matchAll(/@media \(max-width: 400px\) \{([\s\S]*?)\n\}\n/g)];
  const wrapMedia = mediaMatches.filter((m) => m[1].includes('.path-entry') && /white-space:\s*normal/.test(m[1]));
  assert.ok(wrapMedia.length, '应有窄屏 path-entry 换行规则');
  const lastWrap = wrapMedia[wrapMedia.length - 1];
  const g = css.match(/\n\.path-entry #path-entry-text \{\n(?:  [^\n]+\n)*  white-space: nowrap;\n\}/);
  assert.ok(g, '应有全局 nowrap 规则');
  const gPos = css.lastIndexOf(g[0]);
  assert.ok(lastWrap.index > gPos, '窄屏换行必须写在全局 nowrap 之后，否则 375 宽仍会变成「本命道…」');
  assert.ok(/text-overflow:\s*unset/.test(lastWrap[1]));
});

console.log(`\nguide-followup: ${passed} checks passed`);
