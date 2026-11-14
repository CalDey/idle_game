// 体验官第 3 批 P2-6 / P2-4 / P2-5：章节短名与 Boss 关名、羁绊世界观名、法宝专名（只作显示，不改数值）。
// 用法：node tools/lore-names.test.js（不使用浏览器自动化）
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const text = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const host = (v) => JSON.parse(JSON.stringify(v));

function runtime(files, patch) {
  const sandbox = { window: {}, console, Math: Object.create(Math) };
  sandbox.globalThis = sandbox.window;
  files.forEach((f) => {
    vm.runInNewContext(text(`js/${f}.js`), sandbox, { filename: `${f}.js` });
    if (f === 'config' && patch) patch(sandbox.window.GameConfig);
  });
  return sandbox;
}

function seeded(seed) {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

// 文档 JSON（若文档不在本机则跳过逐条比对，仍做结构检查）
const DOC = '/workspace/docs/worldbuilding/体验官第3批文案.md';
let docBlocks = null;
if (fs.existsSync(DOC)) {
  const md = fs.readFileSync(DOC, 'utf8');
  docBlocks = [...md.matchAll(/```json\n([\s\S]*?)\n```/g)].map((m) => JSON.parse(m[1]));
}

const S = runtime(['config', 'equip', 'battle', 'bonds']);
const W = S.window;
const C = W.GameConfig;
const B = C.BATTLE;

check('P2-6：30 章短名 + 30 个 Boss 关名，大地域与 REGIONS 一致，每章唯一', () => {
  assert.strictEqual(B.CHAPTERS.length, 30);
  const names = new Set();
  B.CHAPTERS.forEach((c, i) => {
    assert.strictEqual(c.chapter, i + 1);
    assert.strictEqual(c.region, B.REGIONS[Math.min(B.REGIONS.length - 1, Math.floor(i / 5))].name, `第 ${i + 1} 章大地域`);
    assert.ok(c.name && !names.has(c.name), `第 ${i + 1} 章短名唯一`);
    names.add(c.name);
    assert.deepStrictEqual(host(c.bossStages.map((x) => x.stage)), [(i + 1) * 10]);
    assert.ok(c.bossStages[0].name.length >= 4);
  });
  if (docBlocks) assert.deepStrictEqual(host(B.CHAPTERS), docBlocks[1]);
});

check('P2-6：enemyFor 写出 chapterName / stageName，数值字段不变', () => {
  const e3 = W.Battle.enemyFor(30);
  assert.strictEqual(e3.chapterName, '黑风寨');
  assert.strictEqual(e3.stageName, '黑风寨·收命台');
  assert.strictEqual(e3.region, '凡尘野地');
  assert.strictEqual(e3.name, '黑风寨主');
  const e31 = W.Battle.enemyFor(31);
  assert.strictEqual(e31.chapterName, '无灯作坊');
  assert.strictEqual(e31.stageName, '');
  const bare = runtime(['config', 'equip', 'battle'], (cfg) => { delete cfg.BATTLE.CHAPTERS; }).window;
  [1, 9, 10, 55, 150, 300].forEach((n) => {
    const a = host(W.Battle.enemyFor(n));
    const b = host(bare.Battle.enemyFor(n));
    delete a.chapterName; delete a.stageName;
    assert.strictEqual(b.chapterName, '');
    delete b.chapterName; delete b.stageName;
    assert.deepStrictEqual(a, b, `第 ${n} 关敌人数值不变`);
  });
});

check('P2-6：只改主线顶栏与 Boss 关标题，秘境顶栏仍用大地域名', () => {
  const ui = text('js/stage-ui.js');
  const bar = ui.slice(ui.indexOf('function renderChapterBar('), ui.indexOf('function renderChapterBar(') + 600);
  assert.ok(bar.includes('enemy.chapterName || enemy.region'));
  assert.ok(ui.includes('`第 ${stageNum} 关 · ${enemy.stageName ? `${enemy.stageName} · ` : \'\'}Boss【${enemy.name}】`'));
  assert.ok(ui.includes('titleEl.textContent = `秘境劫运 · ${enemy.region}`'), '秘境顶栏不动');
  assert.ok(text('index.html').includes('id="stage-chapter-title" class="chapter-title">第 1 章 · 黑山道<'));
});

check('P2-4：6 条羁绊保留短名，新增 loreName / flavor，且来历数字与真实效果一致', () => {
  const short = { jian: '剑修', ming: '幽冥', bing: '冰霜', yan: '烈焰', yu: '灵愈', zuo: '辅佐' };
  const nums = { jian: ['一成五', '三成'], ming: ['一成', '一成八'], bing: ['八分', '一成五'], yan: ['一成五', '两成五'], yu: ['百分之五', '百分之十'], zuo: ['十五', '二十五'] };
  assert.strictEqual(W.Bonds.BONDS.length, 6);
  W.Bonds.BONDS.forEach((b) => {
    assert.strictEqual(b.name, short[b.id]);
    assert.ok(b.loreName.startsWith(`${b.name}·`), b.loreName);
    nums[b.id].forEach((n) => assert.ok(b.flavor.includes(n), `${b.id} 来历含 ${n}`));
  });
  if (docBlocks) {
    assert.deepStrictEqual(host(W.Bonds.BONDS.map((b) => ({ key: b.id, name: b.loreName, flavor: b.flavor }))), docBlocks[2]);
  }
  const ui = text('js/stage-ui.js');
  assert.ok(ui.includes('class="bond-row-lore"'), '羁绊列表每行显示世界观名与来历');
  assert.ok(text('css/style.css').includes('.bond-row-lore'));
});

check('P2-5：72 个法宝专名（6 部位 × 地/天/仙 × 4），来历 20–40 字，全局唯一', () => {
  const pool = C.GEAR_UNIQUE_NAMES;
  assert.deepStrictEqual(Object.keys(pool), ['di', 'tian', 'xian']);
  const seen = new Set();
  let n = 0;
  ['di', 'tian', 'xian'].forEach((q) => {
    C.EQUIP_SLOTS.forEach((slot) => {
      const list = pool[q][slot.id];
      assert.strictEqual(list.length, 4, `${q}/${slot.id}`);
      list.forEach((e) => {
        assert.ok(!seen.has(e.name), e.name);
        seen.add(e.name);
        assert.ok(e.flavor.length >= 20 && e.flavor.length <= 40, `${e.name} 来历长度 ${e.flavor.length}`);
        n += 1;
      });
    });
  });
  assert.strictEqual(n, 72);
  if (docBlocks) {
    const tier = { 地品: 'di', 天品: 'tian', 仙品: 'xian' };
    docBlocks[3].forEach((d) => {
      assert.ok(host(pool[tier[d.tier]][d.slot]).some((e) => e.name === d.name && e.flavor === d.flavor), d.name);
    });
  }
  ['果契桃核', '果账缚腰绦'].forEach((bad) => assert.ok(!seen.has(bad), `${bad} 不进随机池`));
});

function rollMany(sandbox, seed, count) {
  sandbox.Math.random = seeded(seed);
  const st = { seq: 0, pity: { di: 0, tian: 0 }, tree: { lv: 40 }, realmIndex: 20 };
  const out = [];
  for (let i = 0; i < count; i++) out.push(host(sandbox.window.Equip.rollItem(st)));
  return { out, st: host(st) };
}

check('P2-5：rollItem 只多写 name，不额外消耗随机数，掉落与数值序列完全不变', () => {
  const withNames = runtime(['config', 'equip']);
  const bare = runtime(['config', 'equip'], (cfg) => { delete cfg.GEAR_UNIQUE_NAMES; });
  const a = rollMany(withNames, 12345, 400);
  const b = rollMany(bare, 12345, 400);
  assert.deepStrictEqual(a.st, b.st);
  let named = 0;
  a.out.forEach((item, i) => {
    const plain = { ...item };
    delete plain.name;
    assert.deepStrictEqual(plain, b.out[i]);
    assert.ok(!('name' in b.out[i]));
    if (item.q >= 3) {
      assert.ok(item.name, '地品及以上有专名');
      named += 1;
    } else {
      assert.ok(!('name' in item), '凡/灵/玄品无专名');
    }
  });
  assert.ok(named > 20, `样本里有足够的地品及以上（${named}）`);
});

check('P2-5：itemName 专名优先、旧档回退旧名；itemFlavor 只认池内专名', () => {
  const E = W.Equip;
  const old = { id: 1, s: 'weapon', q: 3, lv: 10, m: 50, sub: [] };
  assert.strictEqual(E.itemName(old), '地品青锋飞剑');
  assert.strictEqual(E.itemFlavor(old), '');
  assert.strictEqual(E.itemName({ ...old, q: 0 }), '凡品青锋飞剑');
  const named = { ...old, name: '紫晶斩马刀' };
  assert.strictEqual(E.itemName(named), '地品·紫晶斩马刀');
  assert.ok(E.itemFlavor(named).startsWith('公炉用紫晶'));
  assert.strictEqual(E.itemFlavor({ ...old, name: '不存在的刀' }), '');
  assert.strictEqual(E.itemName({ ...old, name: '不存在的刀' }), '地品·不存在的刀');
  assert.strictEqual(E.decomposeValue(named), E.decomposeValue(old), '分解价值不变');
  const gear = text('js/gear.js');
  assert.ok(gear.includes('itemFlavorHtml(item)'), '对比卡 / 详情显示来历');
  assert.ok(text('css/style.css').includes('.item-flavor'));
});

check('资源版本号不低于本批', () => {
  const index = text('index.html');
  const pins = { 'css/style.css': 109, 'js/config.js': 82, 'js/battle.js': 41, 'js/stage-ui.js': 68, 'js/bonds.js': 4, 'js/equip.js': 23, 'js/gear.js': 35 };
  Object.entries(pins).forEach(([f, v]) => {
    const m = index.match(new RegExp(`${f.replace(/[.]/g, '\\.')}\\?v=(\\d+)`));
    assert.ok(m && Number(m[1]) >= v, `${f} ?v=${m && m[1]} >= ${v}`);
  });
});

console.log(`\n${passed} checks passed`);
