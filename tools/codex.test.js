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
  const migrated = host(s.codex);
  assert.strictEqual(migrated.maxRealm, 0, '旧档补上安全默认值');
  assert.ok(migrated.v >= 1);
  assert.deepStrictEqual(migrated.kills || {}, {});
  assert.deepStrictEqual(migrated.seen || {}, {});
  assert.deepStrictEqual(migrated.claimed || {}, {});
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
assert.ok(mojun.includes('据着荒原祭台的伪火神'), '赤炎魔君取 boss_rename_patch 的说法');
assert.ok(tiandao.includes('不是可拜的本体'), '天道化身取 boss_rename_patch 的说法');
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

// 世界观修订：两条 Boss 开场台词
{
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'js/codex-data.js'), 'utf8');
  require('assert').ok(src.includes('"quote": "那一剑还没收回去。我也不走。"'));
  require('assert').ok(src.includes('"quote": "长到这里，就够了。"'));
  require('assert').ok(!src.includes('破妄的人呢') && !src.includes('熟了。可以收了。'));
}

// Boss 改名同步（boss_rename_patch.json）：config 名称/图片 id、图鉴文案与全仓库旧名
{
  const fs = require('fs');
  const path = require('path');
  const ROOT = path.join(__dirname, '..');
  const RENAMED = {
    shanxiao: ['山魈', '山魈娘娘'], langwang: ['赤眼狼王', '赤瞳狼后'], shikui: ['尸傀道人', '尸傀道姑'],
    xuefu: ['血蝠老祖', '血蝠夫人'], qinglin: ['青鳞蟒', '青鳞蛇姬'], kumu: ['枯木妖婆', '枯木树娘'],
    leiying: ['雷翼鹰王', '雷翼鹰后'], qingming: ['青冥蛟王', '青冥蛟后'], huoya: ['火鸦王', '火鸦女王'],
    fengu: ['焚骨老魔', '焚骨魔女'], yanmojiang: ['炎魔将', '炎魔女将'], shihun: ['噬魂魔将', '噬魂女将'],
    jianmo: ['天外剑魔', '天外剑姬'], xingyun: ['星陨神将', '星陨女神将'], hundun: ['混沌魔祖', '混沌魔母']
  };
  const byId = {};
  bosses.forEach((b) => { byId[b.id] = b; });
  assert.strictEqual(Object.keys(byId).length, 30, '每个 Boss 都有唯一 id');
  bosses.forEach((b) => assert.ok(fs.existsSync(path.join(ROOT, `assets/enemies/boss_${b.id}.webp`)), `boss_${b.id}.webp 存在`));
  // 图片：黑风/血蝠夫人/青鳞蛇姬/熔岩巨傀/赤炎魔君/冰魄蛛后/玄冰龙女/九幽鬼母接入新立绘，其余仍为占位；寒潮与北溟鲲影尚未接入
  assert.deepStrictEqual(JSON.parse(JSON.stringify(bosses.filter((b) => b.img !== 'placeholder').map((b) => b.id))), ['heifeng', 'xuefu', 'qinglin', 'rongyan', 'chiyan', 'zhuhou', 'longnv', 'jiuyou']);
  Object.keys(RENAMED).forEach((id) => {
    const [oldName, newName] = RENAMED[id];
    assert.strictEqual(byId[id].name, newName, `${id} 应改名为 ${newName}`);
    assert.ok(D.bossLore[newName], `${newName} 图鉴文案`);
  });
  assert.strictEqual(CFG.TRIBULATION_GATES[17].boss, '青冥蛟后');
  assert.strictEqual(D.bossLore['天外剑姬'].quote, '那一剑还没收回去。我也不走。');
  // 全部 js 不再出现旧名（「山魈」只允许作为「山魈娘娘」的前缀出现）
  const jsDir = path.join(ROOT, 'js');
  const all = fs.readdirSync(jsDir).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(jsDir, f), 'utf8')).join('\n');
  Object.keys(RENAMED).forEach((id) => {
    const [oldName, newName] = RENAMED[id];
    const stripped = all.split(newName).join('');
    assert.ok(!stripped.includes(oldName), `js 中仍有旧名：${oldName}`);
  });
}

// ---------- 轮回保留图鉴解锁；突破时更新 maxRealm ----------
{
  const storage = memoryStorage();
  const { GS, CX } = loadRuntime(storage);
  GS.state.qi = 1e18;
  GS.state.realmIndex = 5;
  GS.state.codex = { v: 1, maxRealm: 0 };
  const br = GS.applyBreakthroughAttempt(0);
  assert.ok(br.success, '突破应成功以便记下 maxRealm');
  assert.strictEqual(GS.state.realmIndex, 6);
  assert.strictEqual(GS.state.codex.maxRealm, 6, '突破成功应立刻更新 maxRealm，不必打开图鉴');

  GS.state.realmIndex = 30;
  CX.syncMaxRealm(GS.state);
  assert.strictEqual(GS.state.codex.maxRealm, 30);
  assert.ok(CX.isUnlocked(GS.state, byId('realm_xudao')));
  const snap = JSON.parse(JSON.stringify(GS.state.codex));

  GS.state.lifetimeQi = 1e40;
  GS.state.qi = 1e40;
  const re = GS.performReincarnation();
  assert.ok(re.ok, '应能轮回');
  assert.strictEqual(GS.state.realmIndex, 0, '轮回后境界归零');
  assert.ok(GS.state.codex && typeof GS.state.codex === 'object', '轮回应深拷 state.codex');
  assert.strictEqual(GS.state.codex.maxRealm, 30, '轮回后 maxRealm 应保留');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(GS.state.codex)), snap);
  assert.ok(CX.isUnlocked(GS.state, byId('realm_xudao')), '轮回后已解锁境界不应重新上锁');
  GS.state.codex.maxRealm = 0;
  assert.strictEqual(snap.maxRealm, 30, '深拷贝后改新档不应写回轮回前快照');
}

console.log('codex.test.js also ok: reincarnation keeps maxRealm, breakthrough syncs it');
