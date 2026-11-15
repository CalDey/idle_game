// v152：修为改定弹窗文案、1-5 推荐战力 1250、解锁卡合并、目标条「★功法」、
// 窄屏道果格、对白层立绘渐隐与战败旁白不画右侧暗影、因果簿存档文档。
// 不跑浏览器，不是视觉验收。
// 用法：node tools/qa-v152.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const text = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const SAVE_KEY = 'xiuxian_idle_save_v1';

function memoryStorage(initial) {
  const data = Object.assign({}, initial || {});
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    _data: data
  };
}

function runtime(opts) {
  const o = opts || {};
  const files = o.files || ['config', 'equip', 'state', 'titles', 'battle', 'bonds', 'path', 'beasts'];
  const sandbox = { window: {}, console, localStorage: o.storage || memoryStorage(), setTimeout, clearTimeout };
  sandbox.globalThis = sandbox.window;
  files.forEach((f) => vm.runInNewContext(text(`js/${f}.js`), sandbox, { filename: `${f}.js` }));
  return sandbox.window;
}

function loadNewbie(storage) {
  const sandbox = {
    window: {},
    console,
    localStorage: storage || memoryStorage(),
    setTimeout,
    clearTimeout,
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {}
    }
  };
  sandbox.globalThis = sandbox.window;
  ['config', 'equip', 'battle', 'state', 'newbie'].forEach((f) => {
    vm.runInNewContext(text(`js/${f}.js`), sandbox, { filename: `${f}.js` });
  });
  return sandbox.window;
}

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

check('修为改定弹窗：返还灵石为 0 时不写该行；道果句改为「已有道果效果不变」；门槛句默认关闭', () => {
  const W = runtime();
  W.GameState.loadGame();
  const s = W.GameState.state;
  s.realmIndex = 17; // 尊者后：数值策划要核对的 744万→28.5亿 样本
  assert.strictEqual(W.GameState.SHOW_PACING_V2_THRESHOLD_LINE, false, '本版不展示门槛重算句');
  const zero = W.GameState.formatPacingV2Notice({ qi: 12345, stones: 0 }, s);
  assert.ok(zero.includes('修为规矩已改定'));
  assert.ok(zero.includes('补发 2 小时离线灵气'));
  assert.ok(!zero.includes('返还灵石'), `0 返还时不应出现返还灵石：${zero}`);
  assert.ok(zero.includes('已有道果效果不变'));
  assert.ok(!zero.includes('已得道果数量不变'));
  assert.ok(!zero.includes('突破门槛重算'), `开关关闭时不应出现门槛句：${zero}`);

  const paid = W.GameState.formatPacingV2Notice({ qi: 12345, stones: 800 }, s);
  assert.ok(paid.includes('药园造价按差价返还灵石'), paid);
  assert.ok(paid.includes('已有道果效果不变'));
  assert.ok(!paid.includes('突破门槛重算'));

  const th = W.GameState.pacingV2Threshold(s);
  assert.ok(th, '尊者后应能算出下一重门槛');
  assert.strictEqual(th.nextQi, 2846071280);
  assert.strictEqual(th.oldQi, 7443436);
  const fmt = W.GameConfig.formatNumber;
  assert.strictEqual(fmt(th.nextQi), '28.5亿');
  assert.strictEqual(fmt(th.oldQi), '744万');
});

check('1-5 关推荐战力覆盖为 1250；邻关不被同一常数钉死', () => {
  const W = runtime();
  W.GameState.loadGame();
  const s = W.GameState.state;
  s.realmIndex = 2;
  assert.strictEqual(W.Battle.STAGE_5_RECOMMENDED_CP, 1250);
  assert.strictEqual(W.Battle.recommendedCp(s, 5), 1250);
  assert.strictEqual(W.Battle.recommendedCp(s, W.Battle.enemyFor(5)), 1250);
  const rec4 = W.Battle.recommendedCp(s, 4);
  const rec6 = W.Battle.recommendedCp(s, 6);
  assert.notStrictEqual(rec4, 1250, `1-4 不应被钉成 1250，实际 ${rec4}`);
  assert.notStrictEqual(rec6, 1250, `1-6 不应被钉成 1250，实际 ${rec6}`);
  // 敌人数值未改：第 5 关仍按原公式（ramp 1.7）
  const e5 = W.Battle.enemyFor(5);
  const B = W.GameConfig.BATTLE;
  const expect = B.BASE_CP * Math.pow(B.GROWTH, 4) * W.Battle.earlyRampMult(B, 5, false);
  assert.ok(Math.abs(e5.cp / expect - 1) < 1e-9, `第 5 关敌方战力不应被改：${e5.cp} vs ${expect}`);
});

check('目标条推荐标签显示「★功法」，id 仍是 gongfa', () => {
  const src = text('js/newbie.js');
  assert.ok(/REC_NAMES = \{ break: '突破', gongfa: '功法'/.test(src));
  assert.ok(src.includes('推荐优先 ★${rec.name}'));
  assert.ok(/key === 'gongfa'/.test(src), '推荐项 id 仍为 gongfa，只改显示名');
  assert.ok(!/gongfa: '修行'/.test(src));
});

check('读档时多张待弹解锁卡合并为「新开启的功能」，单张仍走原标题', () => {
  const W = loadNewbie();
  const NB = W.Newbie;
  const s = W.GameState.createDefaultState
    ? W.GameState.state
    : (W.GameState.loadGame(), W.GameState.state);
  W.GameState.loadGame();
  const st = W.GameState.state;
  st.realmIndex = 10;
  st.stage = st.stage || {};
  st.stage.best = 20;
  st.stage.cur = 21;
  st.unlockSeen = { gear: true, yaoyuan: true };
  st.unlockVisited = { gear: true, yaoyuan: true };
  const pending = NB.pendingUnlocks(st);
  const keys = pending.map((u) => u.key);
  assert.ok(keys.indexOf('dispatch') >= 0, `应含仙姬派遣：${keys.join(',')}`);
  assert.ok(keys.indexOf('mijing') >= 0, `应含秘境劫运：${keys.join(',')}`);
  assert.ok(pending.length >= 2, `读档应积下至少 2 张：${keys.join(',')}`);

  const src = text('js/newbie.js');
  assert.ok(src.includes("title: '新开启的功能'"));
  assert.ok(src.includes('pendingUnlocks(s).filter'));
  assert.ok(src.includes("go: '去看看'"));
  assert.ok(/list\.forEach\(\(item\) => markUnlockSeen/.test(src));

  // 单张：只剩一个待弹时不应走合并标题（源码 list.length >= 2）
  st.unlockSeen.mijing = true;
  st.unlockSeen.dispatch = true;
  // 把其余也记掉，只留一个（若还有）
  NB.pendingUnlocks(st).slice(1).forEach((u) => { st.unlockSeen[u.key] = true; });
  const one = NB.pendingUnlocks(st);
  if (one.length === 1) {
    assert.notStrictEqual(one[0].title, '新开启的功能');
  }
});

check('对白层：主角立绘上沿与外侧渐隐；战败旁白加 is-no-boss，开场会清掉上一场的 ctxBossId', () => {
  const css = text('css/style.css');
  const js = text('js/story.js');
  assert.ok(/--story-hero-fade-y/.test(css) && /--story-hero-fade-x/.test(css));
  assert.ok(/mask-composite:\s*intersect/.test(css));
  assert.ok(/-webkit-mask-composite:\s*source-in/.test(css));
  assert.ok(/\.story-modal\.is-no-boss \.story-boss \{\s*display:\s*none/.test(css));
  assert.ok(js.includes("classList.toggle('is-no-boss'"));
  assert.ok(js.includes("classList.remove('active', 'is-last-words', 'is-opening', 'is-no-boss')"));
  assert.ok(js.includes("ctxBossId = '';"));
  assert.ok(/is-opening/.test(js), '开篇仍用 is-opening，名签规则不变');
});

check('窄屏道果格：HTML 拆出「灵气」前缀，≤390px 隐藏前缀且取消省略号', () => {
  const html = text('index.html');
  const css = text('css/style.css');
  const game = text('js/game.js');
  assert.ok(html.includes('class="res-mult-prefix">灵气</span>×1.00'));
  assert.ok(game.includes('res-mult-prefix'));
  assert.ok(/@media \(max-width: 390px\) \{[\s\S]*#res-daoguo-mult \.res-mult-prefix \{[\s\S]*display:\s*none/.test(css));
  assert.ok(/#res-daoguo-mult \{[\s\S]*text-overflow:\s*unset/.test(css));
});

check('文档补充因果簿存档：字段结构、旧档空账本、轮回保留', () => {
  const doc = text('docs/architecture/state-and-save.md');
  assert.ok(doc.includes('## 6. 因果簿存档（`state.karma`）'));
  assert.ok(doc.includes('bookUnlocked'));
  assert.ok(doc.includes('Karma.normalize'));
  assert.ok(doc.includes('空账本'));
  assert.ok(/轮回[\s\S]{0,80}karma|karma[\s\S]{0,120}轮回/.test(doc));
  assert.ok(doc.includes('不能靠轮回刷回收奖励或抹掉旧账'));
});

check('因果簿按钮图标：本批无 handoff 素材，不替换借用的 ui_log', () => {
  const html = text('index.html');
  const gear = text('js/gear.js');
  assert.ok(!fs.existsSync('/workspace/handoff_ui_karma'), '无 handoff 目录则跳过换图');
  // 仍使用既有图标路径，不误引入不存在的 book icon
  assert.ok(!/ui_karma_book/.test(html + gear));
});

console.log(`qa-v152.test.js ${passed} checks ok`);
