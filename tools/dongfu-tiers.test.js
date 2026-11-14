// 洞府整景背景：凡/玄/仙三档文件存在，renderHomeScene 与模糊衬底按 getHomeBgDisplayTier 切换。
// 用法：node tools/dongfu-tiers.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const text = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(root, rel));

['assets/home/scene_base.webp', 'assets/home/scene_xuan.webp', 'assets/home/scene_xian.webp'].forEach((rel) => {
  assert.ok(exists(rel), `缺洞府背景：${rel}`);
});

const sandbox = { window: {}, console };
sandbox.globalThis = sandbox.window;
vm.runInNewContext(text('js/config.js'), sandbox);
const C = sandbox.window.GameConfig;
assert.deepStrictEqual(Array.from(C.HOME_BG_TIER_TOTAL), [0, 150, 600], '背景品阶阈值不应改动');
assert.strictEqual(C.homeBgTier(0), 0, '总等级 0 应为凡品');
assert.strictEqual(C.homeBgTier(149), 0);
assert.strictEqual(C.homeBgTier(150), 1, '总等级 150 应为玄品');
assert.strictEqual(C.homeBgTier(599), 1);
assert.strictEqual(C.homeBgTier(600), 2, '总等级 600 应为仙品');

const game = text('js/game.js');
assert.ok(game.includes('const bgDisplayTier = GameState.getHomeBgDisplayTier();'), '须沿用已有 getHomeBgDisplayTier');
assert.ok(/HOME_BG_SRC\s*=\s*\[/.test(game), 'renderHomeScene 应有按品阶切换的背景表');
assert.ok(/assets\/home\/scene_base\.webp\?v=\d+/.test(game), '凡品应对 scene_base');
assert.ok(/assets\/home\/scene_xuan\.webp\?v=\d+/.test(game), '玄品应对 scene_xuan');
assert.ok(/assets\/home\/scene_xian\.webp\?v=\d+/.test(game), '仙品应对 scene_xian');
assert.ok(game.includes("els.homeBg.getAttribute('src') !== nextBg"), '换 src 前先比较，避免闪一下');
assert.ok(game.includes("els.homeScene.classList.toggle('bg-tier-xuan', bgDisplayTier === 1)"));
assert.ok(game.includes("els.homeScene.classList.toggle('bg-tier-xian', bgDisplayTier === 2)"));
assert.ok(game.includes('els.homeGlow.dataset.tier = String(bgDisplayTier)'), '原有光晕档位须保留');
assert.ok(game.includes('洞府 · ${bgTierName} · 总等级 ${totalLv}'), '原有标题文案须保留');

const css = text('css/style.css');
assert.ok(/\.home-scene::before\s*\{[^}]*scene_base\.webp/.test(css), '默认衬底仍是凡品 scene_base');
assert.ok(/\.home-scene\.bg-tier-xuan::before\s*\{[^}]*scene_xuan\.webp/.test(css), '模糊衬底玄品须跟 scene_xuan');
assert.ok(/\.home-scene\.bg-tier-xian::before\s*\{[^}]*scene_xian\.webp/.test(css), '模糊衬底仙品须跟 scene_xian');

// 贴片路径、热区百分比、舞台宽高常量不得改动
assert.ok(game.includes('assets/home/p_${id}_${tierKey}.webp?v=1'), '建筑贴片路径不应改动');
assert.ok(/coverScale[^;]*1080/.test(game) && game.includes('1935'), 'layoutHomeStage 的 1080×1935 不应改动');
const html = text('index.html');
assert.ok(/id="home-bg"[^>]*src="assets\/home\/scene_base\.webp/.test(html), '初始 #home-bg 仍回退到 scene_base');

console.log('dongfu-tiers.test.js ok: fan/xuan/xian mapped');
