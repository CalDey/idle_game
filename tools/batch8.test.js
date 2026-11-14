// 体验官第 8 批（只改 UI）：派遣结算说明与领取红点、图鉴领取飘字与阈值奖励、
// 修行页独立图鉴入口；以及 MAIN BRAIN 三条 P3（渡劫 play 收尾与机缘卡 30 秒上限、
// 删掉全局 nowrap 之前那份多余的 ≤400px 换行、镇妖塔台词与 keepQuote 一致）。
// 用法：node tools/batch8.test.js
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
  const files = ['js/config.js', 'js/equip.js', 'js/battle.js', 'js/state.js', 'js/dispatch.js', 'js/codex.js'].concat(extraFiles || []);
  files.forEach((rel) => vm.runInNewContext(text(rel), sandbox, { filename: rel }));
  return { W: sandbox.window, sandbox };
}

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

check('派遣按派出时锁定奖励，仅轮回后才按今生产出封顶；面板文案与逻辑一致', () => {
  const { W } = loadRuntime();
  const D = W.Dispatch;
  const GS = W.GameState;
  GS.loadGame();
  const s = GS.state;
  s.stage.best = 30;
  s.unlockedHeroes = W.GameConfig.HEROES.map((h) => h.id);
  s.squad = ['lanyi'];
  s.createdAt = 123456789;
  s.reincarnationCount = 0;
  D.ensureState(s, Date.now());
  const m = s.dispatch.board.find((b) => (D.TPL_MAP[b.tpl].kinds || []).includes('stone')) || s.dispatch.board[0];
  const ids = D.availableHeroes(s).slice(0, m.need);
  const started = D.start(s, m.slot, ids, { now: 1000, stonePerSec: 10 });
  assert.ok(started.ok);
  assert.strictEqual(started.mission.reincarnationCount, 0);
  const snap = Object.assign({}, started.mission.reward);
  assert.ok(started.mission.reward, '派出时写入奖励快照');
  const same = D.claimReward(s, started.mission, { stonePerSec: 10 });
  if (snap.stone) assert.strictEqual(same.stone, snap.stone, '产出未降时领到快照值');
  if (snap.stone) {
    const dip = D.claimReward(s, started.mission, { stonePerSec: 0.01 });
    assert.strictEqual(dip.stone, snap.stone, '未轮回时产出下降仍发快照，不得按当时产出少给');
    s.reincarnationCount = 1;
    const capped = D.claimReward(s, started.mission, { stonePerSec: 0.01 });
    assert.ok(capped.stone < snap.stone, '轮回后产出更低，灵石按今生产出封顶');
  }
  assert.strictEqual(D.SETTLEMENT_HINT, '按派出时锁定（轮回后按今生产出封顶）');
  assert.ok(text('js/dispatch.js').includes('dispatch-settle-hint') && text('js/dispatch.js').includes('SETTLEMENT_HINT'));
  assert.ok(text('css/style.css').includes('.dispatch-settle-hint'));
});

check('派遣完成后，洞府页签和派遣按钮都亮红点催领取', () => {
  const game = text('js/game.js');
  assert.ok(game.includes('Dispatch.hasClaimable') && /badgeUpgrade[\s\S]{0,200}dispatchClaim/.test(game), '洞府页签红点纳入可领取派遣');
  assert.ok(text('js/dispatch.js').includes("classList.toggle('visible', sm.done > 0)"));
  assert.ok(text('js/dispatch.js').includes('is-dispatch-claim'));
  const css = text('css/style.css');
  assert.ok(/\.nav-badge\.visible,\s*\n\.nav-badge\.is-dispatch-claim/.test(css) || css.includes('.nav-badge.is-dispatch-claim'));
});

check('图鉴领取飘字写出具体奖励，各击破阈值旁标明对应奖励', () => {
  const { W } = loadRuntime();
  const CX = W.Codex;
  const env = { qiPerSec: 2, stonePerSec: 1 };
  const r1 = CX.scaleTierReward({ stage: { best: 10 } }, 1, env);
  const text1 = CX.formatReward(r1);
  assert.ok(text1.includes('灵气 +') && text1.includes('灵石 +') && text1.includes('灵玉 +'), `1击奖励应写出具体资源：${text1}`);
  assert.ok(!text1.includes('仙桃'), '1击不应有仙桃');
  const r10 = CX.scaleTierReward({ stage: { best: 10 } }, 10, env);
  assert.ok(CX.formatReward(r10).includes('仙桃 +'), '10击应含仙桃');
  const sum = CX.sumRewards([r1, r10]);
  assert.ok(sum.qi === (r1.qi || 0) + (r10.qi || 0));
  const src = text('js/codex.js');
  assert.ok(src.includes('codex-tier-reward') && src.includes('showClaimToast'));
  assert.ok(src.includes('获得 ${text}') || src.includes('获得 ') && src.includes('formatReward'));
  assert.ok(src.includes('scaleTierReward(s, tier, env)'));
  CX.TIERS.forEach((tier) => {
    assert.ok(CX.TIER_REWARDS[tier], `阈值 ${tier} 应有奖励配置`);
  });
  const html = text('index.html');
  assert.ok(html.includes('id="codex-claim-toast"'));
  assert.ok(text('css/style.css').includes('.codex-claim-toast') && text('css/style.css').includes('.codex-tier-reward'));
});

check('修行页有独立图鉴入口，设置里的保留；≤400px 字号至少 12px、不挤', () => {
  const html = text('index.html');
  const cultivate = html.slice(html.indexOf('id="tab-cultivate"'), html.indexOf('id="tab-gear"'));
  const settings = html.slice(html.indexOf('id="settings-modal"'), html.indexOf('id="btn-close-settings"') > 0 ? html.indexOf('id="btn-close-settings"') + 40 : html.length);
  assert.ok(cultivate.includes('id="btn-cultivate-codex"'), '修行页应有图鉴按钮');
  assert.ok(settings.includes('id="btn-open-codex"'), '设置里的图鉴入口保留');
  assert.ok(!html.slice(html.indexOf('class="bottom-nav"'), html.indexOf('guide-bubble')).includes('btn-cultivate-codex'), '不占用底部导航');
  const css = text('css/style.css');
  const btn = css.match(/\.codex-entry-btn \{([\s\S]*?)\n\}/);
  assert.ok(btn, '应有修行页图鉴按钮样式');
  const size = btn[1].match(/font-size:\s*(\d+)px/);
  assert.ok(size && Number(size[1]) >= 12, `默认字号应 ≥12px，实际 ${btn[1]}`);
  const media = [...css.matchAll(/@media \(max-width: 400px\) \{([\s\S]*?)\n\}\n/g)];
  const entryMedia = media.filter((m) => m[1].includes('.codex-entry-btn'));
  assert.ok(entryMedia.length, '≤400px 应单独规定图鉴入口字号');
  assert.ok(/font-size:\s*12px/.test(entryMedia[entryMedia.length - 1][1]));
  assert.ok(/min-height:\s*32px/.test(entryMedia[entryMedia.length - 1][1]));
  assert.ok(text('js/codex.js').includes('btn-cultivate-codex') && text('js/codex.js').includes('badge-cultivate-codex'));
});

check('P3 play() 中途抛错也会去掉 is-on 并重置 isPlaying', () => {
  const src = text('js/tribulation.js');
  assert.ok(/function play\([\s\S]*try \{[\s\S]*finally \{[\s\S]*hideRoot\(/.test(src), 'play 应有 try/finally 收尾');
  const classes = new Set();
  const rootEl = {
    hidden: true,
    classList: {
      add(...c) { c.forEach((x) => classes.add(x)); },
      remove(...c) { c.forEach((x) => classes.delete(x)); },
      contains: (c) => classes.has(c)
    },
    setAttribute() {},
    addEventListener() {},
    focus() {},
    contains() { return false; },
    querySelector: () => ({ setAttribute() {} }),
    offsetWidth: 1
  };
  const els = { 'tribulation-cinematic': rootEl, 'trib-caption': { textContent: '', hidden: true }, 'trib-success': { hidden: true } };
  const sandbox = {
    window: {},
    document: {
      getElementById: (id) => els[id] || null
    },
    setTimeout,
    clearTimeout,
    matchMedia: () => ({ matches: false }),
    console
  };
  sandbox.window.document = sandbox.document;
  sandbox.globalThis = sandbox.window;
  sandbox.window.TribulationData = {
    successMain: () => 'ok',
    SUCCESS_SUB: '',
    strikeCaptions() { throw new Error('boom'); },
    BOLT_PRESETS: []
  };
  vm.runInNewContext(text('js/tribulation.js'), sandbox, { filename: 'js/tribulation.js' });
  const T = sandbox.window.Tribulation;
  assert.ok(T);
  let threw = false;
  try { T.play({ majorName: '化灵初' }); } catch (err) { threw = true; assert.strictEqual(err.message, 'boom'); }
  assert.ok(threw, 'strikeCaptions 抛错应冒出');
  assert.strictEqual(T.isPlaying(), false, '抛错后 isPlaying 必须复位');
  assert.ok(!classes.has('is-on'), '抛错后必须去掉 is-on');
});

check('P3 等渡劫演出时 maybeUnlockCard 约 30 秒超时就弹', () => {
  const nb = text('js/newbie.js');
  assert.ok(nb.includes('UNLOCK_WAIT_CAP_MS = 30000') || /UNLOCK_WAIT_CAP_MS\s*=\s*30\s*\*\s*1000/.test(nb));
  const { W } = loadRuntime(['js/newbie.js']);
  assert.strictEqual(W.Newbie.UNLOCK_WAIT_CAP_MS, 30000);
  assert.ok(nb.includes('maybeUnlockCard') && nb.includes('UNLOCK_WAIT_CAP_MS'));
  assert.ok(/tribOpen && waited >= UNLOCK_WAIT_CAP_MS/.test(nb));
});

check('P3 只保留全局 nowrap 之后那份 ≤400px path-entry 换行规则', () => {
  const css = text('css/style.css');
  const mediaMatches = [...css.matchAll(/@media \(max-width: 400px\) \{([\s\S]*?)\n\}\n/g)];
  const wrapMedia = mediaMatches.filter((m) => m[1].includes('.path-entry') && /white-space:\s*normal/.test(m[1]));
  assert.strictEqual(wrapMedia.length, 1, `窄屏换行应只剩一份，实际 ${wrapMedia.length}`);
  const g = css.match(/\n\.path-entry #path-entry-text \{\n(?:  [^\n]+\n)*  white-space: nowrap;\n\}/);
  assert.ok(g, '应有全局 nowrap');
  assert.ok(wrapMedia[0].index > css.lastIndexOf(g[0]), '仅保留的换行规则必须在全局 nowrap 之后');
});

check('P3 镇妖塔 Boss 台词的显示条件与 keepQuote 一致（塔内不显示）', () => {
  const ui = text('js/stage-ui.js');
  assert.ok(/const keepQuote = !mjRun && !inTower && enemy && enemy\.isBoss/.test(ui));
  assert.ok(/!mjRun && !twFloor && enemy && enemy\.isBoss/.test(ui), 'showBossQuote 应排除镇妖塔');
  assert.ok(!/if \(!mjRun && enemy\.isBoss && window\.Codex && typeof window\.Codex\.showBossQuote/.test(ui), '不得再对塔内 Boss 先显示再藏');
});

check('P3 只保留一份 12px .codex-tier 规则，含原边框色且不再有被覆盖的 10px', () => {
  const css = text('css/style.css');
  const blocks = [...css.matchAll(/\.codex-tier \{([\s\S]*?)\n\}/g)].map((m) => m[1]);
  assert.strictEqual(blocks.length, 1, `应只剩一份 .codex-tier 基础规则，实际 ${blocks.length}`);
  const body = blocks[0];
  assert.ok(/font-size:\s*12px/.test(body), '字号应为覆盖后的 12px');
  assert.ok(!/font-size:\s*10px/.test(body));
  assert.ok(/height:\s*auto/.test(body) && /min-height:\s*20px/.test(body));
  assert.ok(/border:\s*1px solid rgba\(230, 201, 138, 0\.28\)/.test(body), '未覆盖的边框应合并进留下的规则，显示不变');
  assert.ok(/color:\s*var\(--text-muted\)/.test(body));
  assert.ok(/border-radius:\s*3px/.test(body));
});

check('不改平衡数值，且不用 getImageData / 浏览器自动化', () => {

  const changed = ['js/dispatch.js', 'js/game.js', 'js/codex.js', 'js/newbie.js', 'js/tribulation.js', 'js/stage-ui.js', 'index.html', 'css/style.css'];
  changed.forEach((rel) => {
    const src = text(rel);
    assert.ok(!/getImageData/.test(src), rel);
  });
  const rewards = text('js/codex.js').match(/const TIER_REWARDS = \{[\s\S]*?\n  \}/)[0];
  assert.ok(rewards.includes('qiMin: 1') && rewards.includes('qiMin: 4'));
  const rules = text('js/dispatch.js').match(/const RULES = \{[\s\S]*?CLOCK_SKEW_MS: 60 \* 1000/)[0];
  assert.ok(rules.includes('STONE_CAP_MIN: 60') && rules.includes('PEACH_CAP: 5'));
});

console.log(`\nbatch8: ${passed} checks passed`);
