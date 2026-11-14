// 大境界渡劫演出：文案表、禁词、境界键、只在大境界成功时调用、减弱动态与可跳过挂钩。
// jsdom / 静态检查不是视觉验收。用法：node tools/tribulation.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const text = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function load() {
  const ctx = { window: {}, console, Math, Date, setTimeout, clearTimeout, matchMedia: () => ({ matches: false }) };
  ctx.globalThis = ctx.window;
  vm.createContext(ctx);
  vm.runInContext(text('js/config.js'), ctx, { filename: 'js/config.js' });
  vm.runInContext(text('js/tribulation-data.js'), ctx, { filename: 'js/tribulation-data.js' });
  vm.runInContext(text('js/tribulation.js'), ctx, { filename: 'js/tribulation.js' });
  return ctx.window;
}

const W = load();
const C = W.GameConfig;
const D = W.TribulationData;
const T = W.Tribulation;
const FORBIDDEN = /收割|至高天|果子/;

const majors = C.MAJOR_REALMS.map((m) => m.name);
const majorSet = new Set(majors);
assert.ok(Array.isArray(D.GENERIC_STRIKES) && D.GENERIC_STRIKES.length === 3, '通用天雷须三句');
assert.strictEqual(D.GENERIC_STRIKES[0], '天在看你。');
assert.strictEqual(D.GENERIC_STRIKES[1], '它记下了你的名字。');
assert.strictEqual(D.GENERIC_STRIKES[2], '熬过去，你欠它的就更多。');
assert.strictEqual(D.SUCCESS_MAIN, '渡劫成功，此身已入{realm}');
assert.strictEqual(D.SUCCESS_SUB, '天雷散了，账还在。');

const keys = Object.keys(D.STRIKE3_BY_REALM);
assert.ok(keys.length >= 13, '第 3 道专属句应覆盖渡劫目标大境界');
keys.forEach((k) => {
  assert.ok(majorSet.has(k), `STRIKE3_BY_REALM 键「${k}」须是真实大境界名`);
  assert.ok(k !== '搬血', '搬血不是渡劫进入的目标境，不应有专属第 3 句');
});
const expected = majors.filter((n) => n !== '搬血');
assert.strictEqual(keys.slice().sort().join('|'), expected.slice().sort().join('|'), '第 3 道专属句须覆盖除搬血外全部大境界，且不多出');


const allCopy = [
  ...D.GENERIC_STRIKES,
  ...Object.values(D.STRIKE3_BY_REALM),
  D.SUCCESS_MAIN,
  D.SUCCESS_SUB
].join('\n');
assert.ok(!FORBIDDEN.test(allCopy), '渡劫文案不得出现「收割／至高天／果子」');

const dongtian = D.strikeCaptions('洞天');
assert.strictEqual(dongtian[0], D.GENERIC_STRIKES[0]);
assert.strictEqual(dongtian[1], D.GENERIC_STRIKES[1]);
assert.strictEqual(dongtian[2], D.STRIKE3_BY_REALM['洞天']);
assert.strictEqual(D.strikeCaptions('不存在的境')[2], D.GENERIC_STRIKES[2], '未知境界回退通用第 3 句');
assert.strictEqual(D.successMain('洞天初'), '渡劫成功，此身已入洞天初');
assert.ok(T.successMain('化灵初').includes('化灵初'));

assert.ok(D.BOLT_PRESETS.length >= 3 && D.BOLT_PRESETS.length <= 4, '闪电折线须有 3–4 组预设');
D.BOLT_PRESETS.forEach((set, i) => {
  assert.ok(Array.isArray(set) && set.length >= 5, `预设 ${i} 点数不足`);
  set.forEach((p) => {
    assert.ok(Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  });
});

const tribStages = C.REALM_STAGES.filter((s) => s.isMajorTribulation);
assert.strictEqual(tribStages.length, expected.length, '大境界渡劫关卡数应与目标境数量一致');
tribStages.forEach((s) => {
  const next = C.REALM_STAGES[s.index + 1];
  assert.ok(next, `${s.fullName} 之后应有新境界`);
  assert.ok(D.STRIKE3_BY_REALM[next.majorName], `缺少目标境 ${next.majorName} 的第 3 道文案`);
});

const game = text('js/game.js');
assert.ok(game.includes('stage.isMajorTribulation && window.Tribulation'), '仅大境界渡劫成功才播放演出');
assert.ok(game.includes('window.Tribulation.play('), 'game.js 须调用 Tribulation.play');
assert.ok(game.includes('realmDesc: nextStage.desc'), '境界描述须取修行页现有 stage.desc');
assert.ok(/isMajorTribulation[\s\S]*Tribulation\.play[\s\S]*triggerRealmFx\('success'\)/.test(game), '小突破仍走原闪光');
assert.ok(!/Tribulation\.play[\s\S]{0,200}GameState\.saveGame/.test(game) || game.indexOf('GameState.saveGame()') < game.indexOf('Tribulation.play'), '存档须在演出之前，演出不阻塞状态');

const html = text('index.html');
assert.ok(html.includes('id="tribulation-cinematic"'));
assert.ok(html.includes('feGaussianBlur'));
assert.ok(html.includes('stroke="#dfe8ff"') || html.includes('stroke:#dfe8ff') || text('css/style.css').includes('stroke: #dfe8ff'));
assert.ok(html.includes('js/tribulation-data.js?v='));
assert.ok(html.includes('js/tribulation.js?v='));
assert.ok(!/tribulation[^"]*\.(png|jpg|webp|gif|mp4)/.test(html), '演出不得引用图片或视频素材');

const css = text('css/style.css');
assert.ok(css.includes('.tribulation-cinematic'));
assert.ok(css.includes('#dfe8ff'));
assert.ok(css.includes('#fff3c4') && css.includes('#e0b44a'));
assert.ok(css.includes('mix-blend-mode: screen'));
assert.ok(css.includes('conic-gradient'));
assert.ok(css.includes('radial-gradient'));
assert.ok(css.includes('prefers-reduced-motion: reduce'));
assert.ok(/@keyframes tribNameIn[\s\S]*scale\(0\.8\)[\s\S]*scale\(1\)/.test(css), '境界名须从 0.8 缩放到 1');
assert.ok(!/tribulation[\s\S]{0,80}url\(/.test(css), 'CSS 不得为演出引入图片');

const js = text('js/tribulation.js');
assert.ok(js.includes('prefersReducedMotion') && js.includes('prefers-reduced-motion'));
assert.ok(js.includes('skipOrClose') || js.includes('function skip'));
assert.ok(js.includes('pointerdown'));
assert.ok(!/addEventListener\(\s*['"]click['"]\s*,\s*skip\s*\)/.test(js), '跳过只绑一种指针事件，不与 click 重复');
assert.strictEqual((js.match(/addEventListener\(\s*['"]pointerdown['"]/g) || []).length, 1);
assert.strictEqual((js.match(/addEventListener\(\s*['"]click['"]/g) || []).length, 0);
assert.ok(js.includes('is-reduced'));
assert.ok(T.TOTAL_MS >= 3000 && T.TOTAL_MS <= 4000, `总时长应约 3–4 秒，实际 ${T.TOTAL_MS}`);
assert.ok(T.FLASH_MS === 80, '每道雷的白闪约 80ms');
assert.ok(typeof T.play === 'function' && typeof T.skip === 'function');
assert.strictEqual(T.isPlaying(), false, '无 DOM 时不得误判为播放中');

console.log('tribulation.test.js ok');
