// 图鉴：52 条条目、解锁推导、含糊措辞检查、Boss/小怪文案覆盖、页面接线。
// 用法：node tools/codex.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const text = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const host = (v) => JSON.parse(JSON.stringify(v));

function memoryStorage() {
  const data = {};
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, removeItem: (k) => { delete data[k]; } };
}
function loadRuntime(storage) {
  const sandbox = { window: {}, console, localStorage: storage || memoryStorage() };
  sandbox.globalThis = sandbox.window;
  ['js/config.js', 'js/equip.js', 'js/battle.js', 'js/state.js', 'js/codex-data.js', 'js/codex.js'].forEach((rel) => {
    vm.runInNewContext(text(rel), sandbox, { filename: rel });
  });
  return { W: sandbox.window, GS: sandbox.window.GameState, CX: sandbox.window.Codex, D: sandbox.window.CodexData, CFG: sandbox.window.GameConfig };
}
const { GS, CX, D, CFG } = loadRuntime();
const fresh = (extra) => Object.assign(JSON.parse(JSON.stringify(GS.state)), extra || {});

// ---------- 条目完整性 ----------
assert.strictEqual(D.entries.length, 52, '应有 52 条');
assert.strictEqual(new Set(D.entries.map((e) => e.id)).size, 52, 'id 唯一');
const counts = {};
D.entries.forEach((e) => {
  counts[e.category] = (counts[e.category] || 0) + 1;
  ['id', 'category', 'title', 'subtitle', 'body'].forEach((k) => assert.ok(typeof e[k] === 'string' && e[k].length > 0, `${e.id}.${k}`));
  const h = e.unlockHint;
  assert.ok(h && ['realmIndex', 'chapter', 'stage', 'heroId'].includes(h.type), `${e.id} 解锁类型`);
  if (h.type === 'realmIndex') assert.ok(h.realmIndex >= 0 && h.realmIndex < CFG.REALM_STAGES.length);
  if (h.type === 'chapter') assert.ok(h.chapter >= 1 && h.chapter <= 30);
  if (h.type === 'stage') assert.ok(h.stage >= 1 && h.stage <= 300);
  if (h.type === 'heroId') assert.ok(CFG.HEROES.some((x) => x.id === h.heroId), `${e.id} 角色不存在`);
  assert.ok(!/（\s*(realmIndex|heroId)/.test(CX.hintText(e)), '提示里不应带开发括注');
  // 纪元年代只作文字展示，没有数值年份字段
  if (e.category === 'era') assert.ok(!('year' in e) && !('years' in e));
});
assert.deepStrictEqual(counts, { realm: 14, region: 6, faction: 8, era: 8, hero: 16 });
assert.deepStrictEqual(host(D.categories.map((c) => c.id)), ['realm', 'region', 'faction', 'era', 'hero']);
assert.deepStrictEqual(host(CX.tabs.map((t) => t.id)), ['realm', 'region', 'faction', 'era', 'hero', 'bestiary']);

// ---------- 解锁推导 ----------
const byId = (id) => D.entries.find((e) => e.id === id);
{
  const s = fresh({ realmIndex: 0, reincarnationCount: 0, lifeBestStage: 0 });
  s.stage.best = 0; s.stage.cur = 1;
  delete s.codex;
  assert.ok(CX.isUnlocked(s, byId('realm_banxue')));
  assert.ok(!CX.isUnlocked(s, byId('realm_dongtian')));
  assert.ok(CX.isUnlocked(s, byId('region_fanchen')), '第 1 章开局即解锁');
  assert.ok(!CX.isUnlocked(s, byId('region_qingming')));
  assert.ok(!CX.isUnlocked(s, byId('era_taixu')), '首通 200 关才解锁');
  assert.ok(CX.isUnlocked(s, byId('hero_lanyi')), '初始角色');
  assert.deepStrictEqual(host(s.codex), { v: 1, maxRealm: 0 }, '旧档补上安全默认值');
  // 章节：当前到达关卡决定章节（第 50 关已过 → 到达 51 关 = 第 6 章）
  s.stage.best = 50; s.stage.cur = 51;
  assert.ok(CX.isUnlocked(s, byId('region_qingming')));
  s.stage.best = 49; s.stage.cur = 50;
  assert.ok(!CX.isUnlocked(s, byId('region_qingming')));
  // 首通
  s.stage.best = 199;
  assert.ok(!CX.isUnlocked(s, byId('era_taixu')));
  s.stage.best = 200;
  assert.ok(CX.isUnlocked(s, byId('era_taixu')));
  // 转世后 stage.best 归零，用 lifeBestStage 保持
  s.stage.best = 0; s.stage.cur = 1; s.lifeBestStage = 210;
  assert.ok(CX.isUnlocked(s, byId('era_zhanmu')));
  assert.ok(CX.isUnlocked(s, byId('region_jiuyou')));
}
{
  // 境界：历史最高 / 转世过即视为到过天神初
  const s = fresh({ realmIndex: 5, reincarnationCount: 0 });
  delete s.codex;
  assert.ok(CX.isUnlocked(s, byId('realm_dongtian')));
  assert.ok(!CX.isUnlocked(s, byId('realm_hualing')));
  s.codex = { maxRealm: 20 };
  assert.ok(CX.isUnlocked(s, byId('realm_shenhuo')));
  assert.ok(!CX.isUnlocked(s, byId('realm_zhenyi')));
  const r = fresh({ realmIndex: 0, reincarnationCount: 1 });
  delete r.codex;
  assert.ok(CX.isUnlocked(r, byId('realm_tianshen')));
  assert.ok(CX.isUnlocked(r, byId('faction_zhilyu')));
  assert.ok(!CX.isUnlocked(r, byId('realm_xudao')));
  // 损坏字段
  ['x', [], 5, { maxRealm: 'abc' }].forEach((bad) => {
    const t = fresh({ realmIndex: 3 });
    t.codex = bad;
    assert.strictEqual(CX.progress(t).realm, 3);
  });
}
{
  // 角色：按已获得名单
  const s = fresh();
  s.unlockedHeroes = ['lanyi'];
  assert.ok(!CX.isUnlocked(s, byId('hero_saintess')));
  assert.ok(!CX.isUnlocked(s, byId('faction_shengzu')));
  s.unlockedHeroes.push('saintess');
  assert.ok(CX.isUnlocked(s, byId('hero_saintess')));
  assert.ok(CX.isUnlocked(s, byId('faction_shengzu')));
  s.lockedHeroes = ['saintess'];
  assert.ok(!CX.isUnlocked(s, byId('hero_saintess')), '显式锁定的不算获得');
}

// ---------- Boss / 小怪文案 ----------
const bosses = CFG.BATTLE.BOSSES;
assert.strictEqual(bosses.length, 30);
let withLore = 0;
bosses.forEach((b) => {
  const l = D.bossLore[b.name];
  assert.ok(l, `缺少 Boss 文案：${b.name}`);
  assert.ok(l.desc && l.desc.length >= 20, `${b.name} desc`);
  assert.ok(l.quote && l.quote.length >= 3, `${b.name} quote`);
  assert.ok(!/提案|待拍板/.test(l.desc + l.quote), `${b.name} 不应出现策划标注`);
  withLore += 1;
});
assert.strictEqual(withLore, 30, 'Boss 文案覆盖 30/30');
assert.strictEqual(Object.keys(D.bossLore).length, 30, '没有多余的 Boss 文案（名称未改）');
const mobNames = [];
CFG.BATTLE.REGIONS.forEach((r) => r.mobs.forEach((m) => mobNames.push(m.name)));
assert.strictEqual(mobNames.length, 18);
mobNames.forEach((n) => assert.ok(D.mobLore[n] && D.mobLore[n].length >= 8, `缺少小怪文案：${n}`));
assert.strictEqual(Object.keys(D.mobLore).length, 18, '不引入提案中的新小怪');

// 含糊措辞：不得写明魔君=窃火大祭司、天道化身=收割投影
const allText = JSON.stringify(D) + text('js/codex.js');
['窃火', '大祭司', '收割投影', '收割用的影子', '收割'].forEach((w) => {
  assert.ok(!allText.includes(w), `图鉴数据不应出现「${w}」`);
});
const mojun = D.bossLore['赤炎魔君'].desc;
const tiandao = D.bossLore['天道化身'].desc;
assert.ok(!/祭司|窃|偷/.test(mojun), '赤炎魔君来历保持含糊');
assert.ok(!/投影|收割|至高天/.test(tiandao), '天道化身来历保持含糊');
assert.ok(mojun.includes('据着祭台称君'), '赤炎魔君取 codex.json 的说法');
assert.ok(tiandao.includes('却还不是那个地方本身'), '天道化身取 codex.json 的说法');
assert.ok(!JSON.stringify(D.bossLore).includes('果子'), 'Boss 文案不点破「果子」');

// ---------- 妖魔页列表 ----------
{
  const s = fresh();
  s.stage.best = 30; s.stage.cur = 31; s.lifeBestStage = 30;
  const list = CX.bossList(s);
  assert.strictEqual(list.length, 30);
  assert.ok(list[2].defeated && list[2].name === '黑风寨主');
  assert.ok(list[3].reached === false, '第 40 关未到达');
  s.stage.cur = 40; s.stage.best = 39;
  const l2 = CX.bossList(s);
  assert.ok(l2[3].reached && !l2[3].defeated, '到达未击败');
  // 图片解析与战斗一致
  assert.strictEqual(CX.bossImgUrl('placeholder'), 'assets/enemies/placeholder.webp?v=18');
  assert.strictEqual(CX.bossImgUrl('boss_heifeng'), 'assets/enemies/boss_heifeng.webp?v=18');
  assert.strictEqual(CX.bossImgUrl('assets/enemies/x.webp?v=3'), 'assets/enemies/x.webp?v=3');
  const stageUi = text('js/stage-ui.js');
  assert.ok(stageUi.includes('return `assets/enemies/${filename}?v=18`;'), '战斗端解析规则未变（如变化需同步 Codex.bossImgUrl）');
  list.forEach((b) => assert.ok(fs.existsSync(path.join(root, b.img.split('?')[0])), `Boss 图缺失 ${b.img}`));
  const mobs = CX.mobList(s);
  assert.strictEqual(mobs.length, 18);
  assert.ok(mobs.filter((m) => m.unlocked).length === 3, '只解锁到达地域的小怪');
}

// ---------- 页面接线 ----------
const index = text('index.html');
['btn-open-codex', 'codex-modal', 'codex-tabs', 'codex-list', 'btn-close-codex'].forEach((id) => assert.ok(index.includes(`id="${id}"`), `缺少 #${id}`));
assert.ok(index.indexOf('js/codex-data.js') > 0 && index.indexOf('js/codex-data.js') < index.indexOf('js/codex.js'));
assert.ok(/<script src="js\/codex\.js\?v=\d+"><\/script>/.test(index));
const settingsBlock = index.slice(index.indexOf('id="settings-modal"'), index.indexOf('id="btn-close-settings"'));
assert.ok(settingsBlock.includes('id="btn-open-codex"'), '入口放在设置弹窗内，不占底部导航');
const codexJs = text('js/codex.js');
assert.ok(codexJs.includes("e.key === 'Escape'"), 'Esc 关闭');
assert.ok(codexJs.includes('e.target === els.modal'), '点击遮罩关闭');
assert.ok(text('js/stage-ui.js').includes('window.Codex.showBossQuote(enemy)'), 'Boss 战开场台词');
assert.ok(/\.boss-quote-banner\s*\{[^}]*pointer-events:\s*none/.test(text('css/style.css')), '台词横幅不拦截点击');
assert.ok(!/getImageData/.test(codexJs));

console.log('codex.test.js ok: 52 entries, 30/30 bosses, 18 mobs');
