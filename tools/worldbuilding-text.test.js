// 世界观文案接入：角色日常台词（hero-lines-data / hero-voice）与界面文案（ui-text）
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const text = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const host = (v) => JSON.parse(JSON.stringify(v));

function load(files, extra) {
  const ctx = Object.assign({ window: {}, console, Math, Date, setTimeout, clearTimeout }, extra || {});
  vm.createContext(ctx);
  files.forEach((f) => vm.runInContext(text(f), ctx, { filename: f }));
  return ctx;
}

const cfgCtx = load(['js/config.js']);
const C = cfgCtx.window.GameConfig;
const heroIds = host(C.HEROES.map((h) => h.id));

// ---------- 角色日常台词 ----------
const KINDS = ['deploy', 'tap', 'breakthrough', 'idle', 'defeat'];
{
  const ctx = load(['js/hero-lines-data.js']);
  const voice = host(ctx.window.HeroLinesData.voice);
  assert.deepStrictEqual(Object.keys(voice).sort(), heroIds.slice().sort(), '台词需覆盖 config 中全部角色，且不多出');
  heroIds.forEach((id) => {
    KINDS.forEach((k) => {
      const s = voice[id][k];
      assert.ok(typeof s === 'string' && s.length > 0 && s.length <= 30, `${id}.${k} 台词缺失或过长`);
    });
    assert.deepStrictEqual(Object.keys(voice[id]).sort(), KINDS.slice().sort(), `${id} 只收五类台词`);
  });
}

// HeroVoice 限频：同类台词冷却内只出一次，冷却后可再出
{
  const listeners = {};
  const fakeDoc = {
    readyState: 'complete',
    hidden: false,
    getElementById: () => null,
    addEventListener: (t, fn) => {
      listeners[t] = fn;
    }
  };
  const ctx = load(['js/hero-lines-data.js', 'js/hero-voice.js'], { document: fakeDoc, setInterval: () => 0 });
  const HV = ctx.window.HeroVoice;
  const t0 = 1e12;
  assert.strictEqual(HV.take('lanyi', 'deploy', t0), ctx.window.HeroLinesData.voice.lanyi.deploy);
  assert.strictEqual(HV.take('cloak', 'deploy', t0 + 1000), null, '出战台词冷却内不应再出');
  assert.ok(HV.take('cloak', 'deploy', t0 + HV.COOLDOWN.deploy + 1));
  assert.strictEqual(HV.take('nobody', 'tap', t0), null, '未知角色不出台词');
  assert.ok(HV.COOLDOWN.tap >= 10000 && HV.COOLDOWN.idle >= 60000, '点击与闲置台词需限频');
}

// 钩子位置：出战 / 阵亡在 stage-ui，点击 / 突破 / 闲置在 hero-voice 自身，不改 game.js 的点击逻辑
{
  const stage = text('js/stage-ui.js');
  assert.ok(stage.includes("heroVoiceLine('deploy'"));
  assert.ok(stage.includes("heroVoiceLine('defeat', defUnit)"));
  const hv = text('js/hero-voice.js');
  assert.ok(hv.includes("sayOnPortrait('tap')") && hv.includes("sayOnPortrait('breakthrough')") && hv.includes("sayOnPortrait('idle')"));
  assert.ok(!text('js/game.js').includes('HeroVoice'));
  assert.ok(/\.hero-voice-bubble \{[^}]*pointer-events: none/.test(text('css/style.css')));
  assert.ok(/\.battle-voice \{[^}]*pointer-events: none/.test(text('css/style.css')));
}

// ---------- 界面文案 ----------
const U = load(['js/ui-text.js']).window.UIText;
{
  // 十四境突破文案全覆盖；末境给出圆满句
  const majors = host(C.MAJOR_REALMS.map((m) => m.id));
  majors.forEach((id, i) => {
    const b = U.data.breakthrough[id];
    assert.ok(b && b.successMinor && b.failure, `${id} 突破文案缺失`);
    if (i < majors.length - 1) assert.ok(b.successTribulation, `${id} 渡劫文案缺失`);
    assert.ok(b.failure.includes('{loss}') && b.failure.includes('+4%'), `${id} 失败文案需保留损耗与 +4%`);
    const ok = U.breakthrough(id, 'successMinor', { next: '某境' }, 'FB');
    assert.ok(ok.includes('【某境】') && !/\{\w+\}/.test(ok));
  });
  assert.ok(U.data.breakthrough.zhizun.successMax);
  assert.strictEqual(U.breakthrough('none', 'failure', {}, 'FB'), 'FB', '缺数据时回退旧文案');
}
{
  // 渡劫关口文案只换说法，关卡、章节、境界索引必须与 config 一致（不改解锁表）
  const gates = host(C.TRIBULATION_GATES);
  const byBoss = U.data.gates;
  assert.strictEqual(Object.keys(byBoss).length, Object.keys(gates).length);
  Object.keys(gates).forEach((idx) => {
    const g = gates[idx];
    const t = byBoss[g.boss];
    assert.ok(t, `${g.boss} 关口文案缺失`);
    assert.strictEqual(t.index, Number(idx));
    assert.strictEqual(t.chapter, g.chapter);
    assert.strictEqual(t.stage, g.stage);
    assert.ok(t.lockLog.includes(`第 ${g.chapter} 章`) && t.lockLog.includes(`【${g.boss}】`));
    assert.strictEqual(U.gate(g.boss, 'button', 'FB'), `先败${g.boss}`);
  });
}
{
  // 离线：分档 + 日志保留时长与数值
  assert.strictEqual(U.offlineTier({ capped: true, effectiveSeconds: 99 }), 'capped');
  assert.strictEqual(U.offlineTier({ effectiveSeconds: 600 }), 'short');
  assert.strictEqual(U.offlineTier({ effectiveSeconds: 2 * 3600 }), 'normal');
  assert.strictEqual(U.offlineTier({ effectiveSeconds: 5 * 3600 }), 'long');
  const logLine = U.fmt(U.offline('log').body, { duration: '1小时', qi: '10', stone: '2' });
  assert.ok(logLine.includes('1小时') && logLine.includes('10') && logLine.includes('2') && !/\{\w+\}/.test(logLine));
  // 不收录加载提示
  assert.ok(!('loadingTips' in U.data));
}
{
  // 各锚点已接入（旧文案只作为回退保留）
  const game = text('js/game.js');
  ['successMinor', 'successTribulation', 'failure', 'successMax'].forEach((k) => assert.ok(game.includes(`'${k}'`)));
  assert.ok(game.includes("gateText(gate.boss, 'lockLog'") && game.includes("gateText(gate.boss, 'button'"));
  ['ready', 'locked', 'confirm', 'success'].forEach((k) => assert.ok(game.includes(`'reincarnation'`) && game.includes(`'${k}')`)));
  assert.ok(game.includes("'tierup')") && game.includes('dongfuBuildText(') && game.includes('applyOfflineFlavor(report)'));
  const gear = text('js/gear.js');
  assert.ok(gear.includes("gearText('full'") && gear.includes("gearText('stageup'") && gear.includes('peachUpgradeText('));
  const html = text('index.html');
  [U.data.dongfu.gongfa_hint, U.data.reincarnation.subtitle, U.data.reincarnation.locked, U.data.offline.normal.body, U.data.peach.locked].forEach((s) =>
    assert.ok(html.includes(s), `index.html 未接入：${s}`)
  );
  assert.ok(html.includes('id="offline-title"') && html.includes('id="offline-flavor"'));
  // 加载顺序：ui-text 早于 gear/game；台词数据早于 hero-voice
  const pos = (f) => html.indexOf(`src="js/${f}?v=`);
  assert.ok(pos('ui-text.js') > 0 && pos('ui-text.js') < pos('gear.js') && pos('ui-text.js') < pos('game.js'));
  assert.ok(pos('hero-lines-data.js') > 0 && pos('hero-lines-data.js') < pos('hero-voice.js'));
}

// 世界观剧透修订：去掉暗示「被栽培 / 催熟 / 账」的句子
{
  const all = text('index.html') + text('js/ui-text.js') + text('js/hero-lines-data.js');
  ['第一笔栽培', '尚未写明田主', '果香来得也越早', '更甜的催熟', '不一定只是为了你', '长得太快', '账上另有一行', '鬼后斩下的那一半', '九幽的事，由我来收', '进里域', '又熟了一点点'].forEach((w) =>
    assert.ok(!all.includes(w), `仍有旧文案：${w}`)
  );
  assert.strictEqual(U.data.peach.upgrade, '树开始蕴养。根系往更深的地方钻。');
  assert.strictEqual(U.data.reincarnation.subtitle, '天神境起，可兵解重修。道果永留。');
  assert.ok(U.data.gates['九幽鬼母'].lockLog.includes('先去第 21 章第 210 关击败【九幽鬼母】'));
}

console.log('worldbuilding-text tests passed');
