// 灵兽伴生：数据与美术、存档迁移、解锁与喂养、战斗 mods（含与仙缘合并）、轮回保留、页面接线。
// 用法：node tools/beast.test.js（不使用浏览器自动化 / getImageData）
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const text = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const host = (v) => JSON.parse(JSON.stringify(v));

function memoryStorage() {
  const data = {};
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; }
  };
}

function runtime(files) {
  const sandbox = { window: {}, console, localStorage: memoryStorage() };
  sandbox.globalThis = sandbox.window;
  files.forEach((f) => vm.runInNewContext(text(`js/${f}.js`), sandbox, { filename: `${f}.js` }));
  return sandbox.window;
}

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const W0 = runtime(['config', 'equip', 'battle', 'bonds', 'beasts']);
const BS = W0.Beasts;
const BD = W0.Bonds;

check('三只灵兽：id / 名称 / 标签与仙缘对应，解锁关卡递增且为首领关', () => {
  assert.deepStrictEqual(host(BS.BEASTS.map((b) => [b.id, b.name, b.tag])), [
    ['xuanhu', '幽冥玄狐', 'ming'],
    ['shoushanlin', '霜纹守山麟', 'bing'],
    ['jinwu', '赤焰金乌', 'yan']
  ]);
  BS.BEASTS.forEach((b, i) => {
    assert.ok(BD.BOND_MAP[b.tag], `${b.tag} 是现有仙缘标签`);
    assert.strictEqual(b.tagName, BD.BOND_MAP[b.tag].name);
    assert.strictEqual(b.unlockStage % 10, 0, '在首领关结缘');
    if (i > 0) assert.ok(b.unlockStage > BS.BEASTS[i - 1].unlockStage);
  });
  assert.strictEqual(BS.MAX_LV, 10);
});

check('美术：全身 webp 带透明通道，头像 webp 存在；体积受控', () => {
  BS.BEASTS.forEach((b) => {
    const full = fs.readFileSync(path.join(root, `assets/beasts/beast_${b.id}.webp`));
    assert.strictEqual(full.slice(0, 4).toString(), 'RIFF');
    assert.strictEqual(full.slice(8, 12).toString(), 'WEBP');
    assert.strictEqual(full.slice(12, 16).toString(), 'VP8X', '扩展格式（含 alpha）');
    assert.ok(full[20] & 0x10, `${b.id} 全身图需带 alpha`);
    const w = 1 + full.readUIntLE(24, 3);
    const h = 1 + full.readUIntLE(27, 3);
    assert.deepStrictEqual([w, h], [384, 384]);
    assert.ok(full.length < 120 * 1024);
    const av = fs.readFileSync(path.join(root, `assets/beasts/beast_${b.id}_avatar.webp`));
    assert.strictEqual(av.slice(8, 12).toString(), 'WEBP');
    assert.ok(av.length < 20 * 1024);
    assert.strictEqual(BS.imgUrl(b.id), `assets/beasts/beast_${b.id}.webp?v=1`);
  });
});

check('存档迁移：缺省 / 脏数据 → 规范结构；ensureState 原地更新保持引用', () => {
  assert.deepStrictEqual(host(BS.normalize(undefined)), { v: 1, owned: {}, active: '' });
  assert.deepStrictEqual(host(BS.normalize([1, 2])), { v: 1, owned: {}, active: '' });
  const dirty = BS.normalize({ owned: { xuanhu: { lv: 99 }, ghost: { lv: 3 }, jinwu: { lv: -2 } }, active: 'ghost', junk: 1 });
  assert.deepStrictEqual(host(dirty), { v: 1, owned: { xuanhu: { lv: 10 }, jinwu: { lv: 1 } }, active: 'xuanhu' });
  const s = { beasts: { owned: { jinwu: { lv: '4' } }, active: 'jinwu', extra: true } };
  const ref = s.beasts;
  BS.ensureState(s);
  assert.strictEqual(s.beasts, ref, '保持对象引用');
  assert.deepStrictEqual(host(s.beasts), { v: 1, owned: { jinwu: { lv: 4 } }, active: 'jinwu' });
  const s2 = {};
  BS.ensureState(s2);
  assert.deepStrictEqual(host(s2.beasts), { v: 1, owned: {}, active: '' });
});

check('解锁：按本世最高关或历史最高关补发，首只自动伴生，不重复发放', () => {
  const s = { stage: { best: 29 }, lifeBestStage: 0 };
  assert.strictEqual(BS.syncUnlocks(s).length, 0);
  s.stage.best = 30;
  assert.deepStrictEqual(host(BS.syncUnlocks(s).map((b) => b.id)), ['xuanhu']);
  assert.strictEqual(s.beasts.active, 'xuanhu');
  assert.strictEqual(BS.syncUnlocks(s).length, 0);
  // 轮回后本世关卡归零，但历史最高关仍算
  const t = { stage: { best: 3 }, lifeBestStage: 160 };
  assert.deepStrictEqual(host(BS.syncUnlocks(t).map((b) => b.id)), ['xuanhu', 'shoushanlin', 'jinwu']);
  assert.strictEqual(t.beasts.active, 'xuanhu');
  assert.ok(BS.setActive(t, 'jinwu'));
  assert.ok(!BS.setActive({ beasts: { owned: {} } }, 'jinwu'), '未获得不可伴生');
});

check('喂养：灵玉 40×1.3^(lv-1)、仙桃 5+5×lv；不足 / 满级拒绝；只扣这两种资源', () => {
  assert.deepStrictEqual(host(BS.feedCost(1)), { lingyu: 40, peaches: 10 });
  assert.deepStrictEqual(host(BS.feedCost(9)), { lingyu: 326, peaches: 50 });
  assert.strictEqual(BS.feedCost(10), null);
  let totalJade = 0;
  let totalPeach = 0;
  for (let lv = 1; lv < 10; lv++) {
    totalJade += BS.feedCost(lv).lingyu;
    totalPeach += BS.feedCost(lv).peaches;
  }
  assert.deepStrictEqual([totalJade, totalPeach], [1281, 270], '满级总花费');
  const s = { stage: { best: 30 }, lingyu: 45, stones: 999, qi: 5, tree: { peaches: 9 } };
  BS.syncUnlocks(s);
  assert.strictEqual(BS.canFeed(s, 'xuanhu').reason, '仙桃不足');
  s.tree.peaches = 10;
  const r = BS.feed(s, 'xuanhu');
  assert.ok(r.ok && r.lv === 2);
  assert.deepStrictEqual([s.lingyu, s.tree.peaches, s.stones, s.qi], [5, 0, 999, 5]);
  assert.strictEqual(BS.feed(s, 'xuanhu').reason, '灵玉不足');
  assert.strictEqual(BS.feed(s, 'jinwu').reason, '尚未获得');
  s.beasts.owned.xuanhu.lv = 10;
  s.lingyu = 1e9;
  s.tree.peaches = 1e9;
  assert.strictEqual(BS.feed(s, 'xuanhu').reason, '已满级');
});

check('加成：全队攻击 +0.4%/级，同系上阵角色得同系小加成；未伴生返回 null', () => {
  assert.strictEqual(BS.modsForState({}, ['cloak']), null);
  const s = { beasts: { owned: { xuanhu: { lv: 10 } }, active: 'xuanhu' } };
  const m = host(BS.modsForState(s, ['cloak', 'saintess', 'youming']));
  assert.ok(Math.abs(m.atkMult - 1.04) < 1e-9);
  assert.deepStrictEqual(Object.keys(m.heroMods).sort(), ['cloak', 'youming']);
  assert.ok(Math.abs(m.heroMods.cloak.ultLifesteal - 0.1) < 1e-9);
  const ice = host(BS.modsForState({ beasts: { owned: { shoushanlin: { lv: 10 } }, active: 'shoushanlin' } }, ['lanyi', 'cloak']));
  assert.deepStrictEqual(Object.keys(ice.heroMods), ['lanyi']);
  assert.ok(Math.abs(ice.heroMods.lanyi.freezeChance - 0.05) < 1e-9);
  const fire = host(BS.modsForState({ beasts: { owned: { jinwu: { lv: 1 } }, active: 'jinwu' } }, ['miko']));
  assert.ok(Math.abs(fire.heroMods.miko.atkSplash - 0.01) < 1e-9);
  assert.strictEqual(BS.bonusText('xuanhu', 10), '全队攻击 +4%；幽冥角色绝技吸血 +10%');
  // 满级仍低于仙缘一档：吸血 10% ≤ 幽冥 2 人档 10%、溅射 10% < 烈焰 15%、冰封 5% < 冰霜 8%
  assert.ok(BS.bonusAt('xuanhu', 10).perk <= 0.1 && BS.bonusAt('jinwu', 10).perk < 0.15 && BS.bonusAt('shoushanlin', 10).perk < 0.08);
});

check('Bonds.modsForState：无灵兽时与改动前一致；有灵兽时与羁绊合并', () => {
  const squad = ['cloak', 'youming', 'saintess'];
  const base = { squad: squad.slice(), unlockedHeroes: squad.slice(), heroId: 'cloak', stage: { squad: squad.slice() } };
  assert.deepStrictEqual(host(BD.modsForState(base)), host(BD.buildMods(squad)));
  const solo = { squad: ['saintess'], unlockedHeroes: ['saintess'], heroId: 'saintess', stage: { squad: ['saintess'] } };
  assert.strictEqual(BD.modsForState(solo), null, '无羁绊无灵兽仍为 null');
  const withBeast = Object.assign({}, base, { beasts: { owned: { xuanhu: { lv: 5 } }, active: 'xuanhu' } });
  const m = host(BD.modsForState(withBeast));
  assert.ok(Math.abs(m.atkMult - 1.02) < 1e-9);
  assert.ok(Math.abs(m.heroMods.cloak.ultLifesteal - (0.1 + 0.05)) < 1e-9, '幽冥 2 人档 10% + 玄狐 Lv5 5%');
  // 未加载 beasts.js 的环境（如旧测试）不受影响
  const W1 = runtime(['config', 'equip', 'battle', 'bonds']);
  assert.deepStrictEqual(host(W1.Bonds.modsForState(withBeast)), host(W1.Bonds.buildMods(squad)));
});

check('战斗：满级灵兽胜率不降，且同一关胜率提升有限', () => {
  const Battle = W0.Battle;
  W0.GameState = { getCurrentStage: () => W0.GameConfig.REALM_STAGES[17], getStonePerSec: () => 1, getQiPerSec: () => 1 };
  const squad = ['lanyi', 'shuanghua', 'yueshi', 'qinglan', 'shuangchen', 'saintess'];
  const s = { realmIndex: 17, squad: squad.slice(), unlockedHeroes: squad.slice(), heroId: 'lanyi', stage: { best: 0, squad: squad.slice() }, equip: W0.Equip.emptyEquip(), gongfa: {}, dongfu: {} };
  const stage = 20;
  const a = Battle.winRate(s, stage, 120, BD.modsForState(s));
  s.beasts = { owned: { shoushanlin: { lv: 10 } }, active: 'shoushanlin' };
  const b = Battle.winRate(s, stage, 120, BD.modsForState(s));
  assert.ok(b >= a, `${a} -> ${b}`);
  assert.ok(b - a <= 0.35, `提升应有限：${a} -> ${b}`);
});

check('轮回保留灵兽与图鉴进度（state.js）', () => {
  const W = runtime(['config', 'equip', 'state', 'titles', 'battle', 'bonds', 'beasts']);
  const GS = W.GameState;
  GS.loadGame();
  const s = GS.state;
  s.realmIndex = W.GameConfig.REINCARNATION_MIN_STAGE + 1;
  s.stage.best = 160;
  s.beasts = { v: 1, owned: { xuanhu: { lv: 7 }, jinwu: { lv: 2 } }, active: 'jinwu' };
  s.codex = { v: 1, maxRealm: 33 };
  assert.ok(GS.performReincarnation().ok);
  assert.deepStrictEqual(host(GS.state.beasts), { v: 1, owned: { xuanhu: { lv: 7 }, jinwu: { lv: 2 } }, active: 'jinwu' });
  assert.deepStrictEqual(host(GS.state.codex), { v: 1, maxRealm: 33 });
  assert.ok(GS.state.lifeBestStage >= 160);
});

check('页面接线：脚本顺序、弹窗、设置入口、闯关仙缘行头像、胜率缓存键', () => {
  const html = text('index.html');
  const pos = (f) => html.indexOf(`src="js/${f}?v=`);
  assert.ok(pos('beasts.js') > 0 && pos('beasts.js') < pos('stage-ui.js'));
  assert.ok(pos('beasts-ui.js') > pos('game.js'));
  ['id="beast-modal"', 'id="beast-list"', 'id="btn-open-beast"', 'id="btn-close-beast"', 'id="beast-wallet"'].forEach((k) => assert.ok(html.includes(k), k));
  const stage = text('js/stage-ui.js');
  assert.ok(stage.includes('window.BeastsUI.chipHtml()'));
  assert.ok(stage.includes(':${beastKey(state)}`'), '胜率缓存随灵兽变化失效');
  assert.ok(!text('js/game.js').includes('Beasts'), '不改 game.js');
  const css = text('css/style.css');
  assert.ok(/\.beast-companion \{[^}]*bottom: 164px/.test(css), '灵兽在立绘下部、说明文字附近');
  assert.ok(css.includes('#tab-cultivate.is-portrait-focus .beast-companion'));
  const ui = text('js/beasts-ui.js');
  assert.ok(ui.includes("btn.addEventListener('pointerdown', (e) => e.stopPropagation())"), '点灵兽不触发打坐');
  assert.ok(!/getImageData/.test(ui + text('js/beasts.js')));
});

console.log(`beast.test.js ok: ${passed} checks`);
