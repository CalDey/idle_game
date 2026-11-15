// 体验官第 6 批：渡劫演出入口、新功法/建筑「新机缘」、往事回溯、音量滑块。
// 用法：node tools/batch6.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const text = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const SAVE_KEY = 'xiuxian_idle_save_v1';
const plain = (v) => JSON.parse(JSON.stringify(v));

function memoryStorage(initial) {
  const data = Object.assign({}, initial || {});
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    _data: data
  };
}

function oldSave(fields) {
  return JSON.stringify(Object.assign({ version: 3, realmIndex: 0, qi: 10, stones: 30, lastSaveTime: Date.now() }, fields));
}

function loadRuntime(storage, extraFiles) {
  const sandbox = { window: {}, console, localStorage: storage || memoryStorage(), setTimeout, clearTimeout, matchMedia: () => ({ matches: false }), document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} } };
  sandbox.globalThis = sandbox.window;
  const files = ['js/config.js', 'js/equip.js', 'js/battle.js', 'js/state.js', 'js/newbie.js'].concat(extraFiles || []);
  files.forEach((rel) => vm.runInNewContext(text(rel), sandbox, { filename: rel }));
  return {
    CFG: sandbox.window.GameConfig,
    GS: sandbox.window.GameState,
    NB: sandbox.window.Newbie,
    Story: sandbox.window.Story,
    SD: sandbox.window.StoryData,
    sandbox
  };
}

// ---------- P1 渡劫：只有一条入口，无离线/自动渡劫；小突破不播演出 ----------
{
  const game = text('js/game.js');
  const trib = text('js/tribulation.js');
  const html = text('index.html');
  assert.strictEqual((game.match(/function attemptBreakthrough/g) || []).length, 1);
  assert.ok((game.match(/Tribulation\.play\(/g) || []).length === 1, '只在大境界渡劫成功处调用 play');
  assert.ok(!/settleOffline[\s\S]{0,400}Tribulation/.test(game));
  assert.ok(!/autoBreak|offlineBreakthrough/.test(game + trib));
  assert.ok(game.includes('stage.isMajorTribulation && window.Tribulation'));
  assert.ok(game.includes("if (!played) triggerRealmFx('success')"), '演出没挂上时回退闪光，避免只剩日志');
  assert.ok(html.includes('id="trib-hero-wrap"') && html.includes('trib-hero-glow'));
  assert.ok(!/getImageData/.test(trib) && !/getImageData/.test(text('css/style.css')));
  const { CFG } = loadRuntime();
  const liezhenHou = CFG.REALM_STAGES.find((s) => s.fullName === '列阵后');
  const liezhenChu = CFG.REALM_STAGES.find((s) => s.fullName === '列阵初');
  const zunzheChu = CFG.REALM_STAGES.find((s) => s.fullName === '尊者初');
  assert.ok(liezhenHou && liezhenHou.isMajorTribulation, '列阵后→尊者初才是大境界渡劫');
  assert.ok(liezhenChu && !liezhenChu.isMajorTribulation, '列阵初→列阵中是小突破，只走日志与闪光');
  assert.strictEqual(zunzheChu.index, liezhenHou.index + 1);
}

// ---------- P2 新功法 / 新建筑「新机缘」+ 红点，旧档不补弹 ----------
{
  const { GS, NB } = loadRuntime(memoryStorage());
  GS.loadGame();
  const s = GS.state;
  const items = NB.itemUnlocks();
  const lingmai = items.find((u) => u.key === 'dongfu:lingmai');
  const xueji = items.find((u) => u.key === 'gongfa:jiuzhuan_jindan');
  assert.ok(xueji && xueji.title.includes('尊者血祭大道') && xueji.pane === 'gongfa' && xueji.tab === 'tab-upgrades');
  assert.ok(lingmai && lingmai.title.includes('地底极品灵脉') && lingmai.pane === 'dongfu');
  assert.ok(!items.some((u) => u.key === 'dongfu:yaoyuan'), '百草灵药园沿用原功能卡，不重复弹');
  assert.ok(!items.some((u) => u.key.endsWith(':yinqijue') || u.key.endsWith(':julingshi')), '开局已有的不弹');

  assert.strictEqual(NB.pendingUnlock(s), null);
  s.realmIndex = 15;
  s.unlockSeen.gear = true;
  const first = NB.pendingUnlock(s);
  assert.ok(first && (first.key === 'yaoyuan' || first.key.startsWith('gongfa:') || first.key.startsWith('dongfu:')), '尊者初应弹出新机缘');
  const pendingKeys = [];
  let guard = 0;
  while (guard < 20) {
    const u = NB.pendingUnlock(s);
    if (!u) break;
    pendingKeys.push(u.key);
    s.unlockSeen[u.key] = true;
    guard += 1;
  }
  assert.ok(pendingKeys.includes('gongfa:jiuzhuan_jindan'), pendingKeys.join(','));
  assert.ok(pendingKeys.includes('dongfu:lingmai'), pendingKeys.join(','));

  // 红点：弹过卡但没去过对应页签仍亮；去过才灭
  s.unlockVisited = {};
  assert.strictEqual(NB.unlockTabDot(s, 'gongfa'), true);
  assert.strictEqual(NB.unlockTabDot(s, 'dongfu'), true);
  NB.markUnlockPaneVisited(s, 'gongfa');
  assert.strictEqual(NB.unlockTabDot(s, 'gongfa'), false);
  assert.strictEqual(NB.unlockTabDot(s, 'dongfu'), true);
  NB.markUnlockPaneVisited(s, 'dongfu');
  assert.strictEqual(NB.unlockTabDot(s, 'dongfu'), false);

  // 轮回保留 seen / visited
  s.unlockSeen['gongfa:jiuzhuan_jindan'] = true;
  s.unlockVisited['gongfa:jiuzhuan_jindan'] = true;
  GS.performReincarnation();
  assert.strictEqual(GS.state.unlockSeen['gongfa:jiuzhuan_jindan'], true);
  assert.strictEqual(GS.state.unlockVisited['gongfa:jiuzhuan_jindan'], true);
}
{
  const { GS, NB } = loadRuntime(memoryStorage({ [SAVE_KEY]: oldSave({ realmIndex: 15, stage: { best: 40, cur: 41 } }) }));
  GS.loadGame();
  assert.strictEqual(NB.pendingUnlock(GS.state), null, '中期旧档不把已解锁功法/建筑全部弹一遍');
  assert.strictEqual(NB.unlockTabDot(GS.state, 'gongfa'), false, '旧档不补红点');
  assert.strictEqual(NB.unlockTabDot(GS.state, 'dongfu'), false);
  assert.strictEqual(GS.state.unlockSeen['gongfa:jiuzhuan_jindan'], true);
  assert.strictEqual(GS.state.unlockVisited['gongfa:jiuzhuan_jindan'], true);
  // 之后再破到新境界仍会弹
  GS.state.realmIndex = 27;
  const next = NB.pendingUnlock(GS.state);
  assert.ok(next && (next.key === 'gongfa:zixiao_yuanying' || next.key === 'dongfu:dongtian_fudi'), next && next.key);
}

{
  const html = text('index.html');
  const nb = text('js/newbie.js');
  const game = text('js/game.js');
  assert.ok(html.includes('unlock-kicker') && html.includes('新机缘开启'));
  assert.ok(nb.includes('itemUnlocks') && nb.includes('markUnlockPaneVisited') && nb.includes('unlockTabDot'));
  assert.ok(game.includes('openHome:') && game.includes('unlockTabDot'));
  assert.ok(text('js/state.js').includes('unlockVisited'));
}

// ---------- P2 往事回溯：已通章节只读重看，不发奖励、不改 seen ----------
{
  const files = ['js/story-data.js', 'js/story.js'];
  const { GS, Story, SD } = loadRuntime(memoryStorage(), files);
  GS.loadGame();
  const T = Story.RECALL_TEXT;
  assert.strictEqual(T.entry, '往事回溯');
  assert.ok(T.entryHint && T.modalTitle && T.empty && T.replayIntro && T.replayBoss && T.close);
  assert.ok(T.chapterIntro && typeof T.chapterIntro === 'object');
  assert.deepStrictEqual(plain(Story.clearedChapters(0)), []);
  assert.deepStrictEqual(plain(Story.clearedChapters(9)), []);
  const c1 = Story.clearedChapters(10);
  assert.strictEqual(c1.length, 1);
  assert.strictEqual(c1[0].chapter, 1);
  assert.ok(c1[0].title.includes('黑山道'));
  assert.strictEqual(Story.clearedChapters(25).length, 2);
  assert.strictEqual(Story.chapterTitle(2).includes('丹毒岗'), true);

  const intro = Story.introPart(1);
  assert.ok(intro && intro.lines.length >= 1);
  const bossParts = Story.bossDialogueParts(1);
  assert.ok(bossParts.length >= 1);
  const joined = bossParts.map((p) => (p.lines || []).map((l) => l.text || '').join('\n')).join('\n');
  assert.ok(!joined.includes('图鉴已收录'), '回溯对白不含图鉴收录奖励句');

  GS.state.storySeen = {};
  const marked = JSON.stringify(GS.state.storySeen);
  // 未通关章节：函数内部直接 return，不调用 done
  let uncleared = false;
  assert.strictEqual(Story.replayChapter(1, 'intro', () => { uncleared = true; }), false, '未通关应直接返回');
  assert.strictEqual(uncleared, false, '未通关不得调用 done');
  assert.strictEqual(Story.replayChapter(1, 'boss', () => { uncleared = true; }), false);

  if (!GS.state.stage) GS.state.stage = {};
  GS.state.stage.best = 10;
  // 无 DOM 时 play 会失败并调用 done，但 replay 标志仍须保证不写 storySeen
  let done = false;
  Story.replayChapter(1, 'intro', () => { done = true; });
  assert.strictEqual(JSON.stringify(GS.state.storySeen), marked, '回溯不得改写 storySeen');
  assert.strictEqual(GS.state.openingSeen, false, '回溯不得把开篇标成已看（新档）');
  // 已通关后若误把 best 降回去，仍须拒绝
  GS.state.stage.best = 9;
  let again = false;
  assert.strictEqual(Story.replayChapter(1, 'intro', () => { again = true; }), false);
  assert.strictEqual(again, false);
  GS.state.stage.best = 10;

  const storySrc = text('js/story.js');
  assert.ok(storySrc.includes('const RECALL_TEXT') && storySrc.includes('replay: true'));
  assert.ok(storySrc.includes('isChapterCleared(ch, currentBest())'), 'replayChapter 内部须校验已通关');
  assert.ok(storySrc.includes('if (!replay && window.GameState'));
  const html = text('index.html');
  assert.ok(html.includes('id="btn-story-recall"') && html.includes('id="recall-modal"') && html.includes('id="recall-list"'));
  const ui = text('js/stage-ui.js');
  assert.ok(ui.includes('openRecallModal') && ui.includes('RECALL_TEXT') && ui.includes('replayChapter'));
  assert.ok(!/grantReward|giveReward|发放[道灵石桃]/.test(ui));
  assert.ok(/不发放奖励|不重发奖励|赏，不会再给/.test(text('js/story.js') + text('index.html')), '回溯须保留不重发奖励之意');
  assert.ok(SD.chapters.length >= 30, '沿用现有章节数据');
}

// ---------- P3 音量滑块与试听，兼容旧偏好和日后低默认音量 ----------
{
  function fakeNode() {
    const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} });
    return { connect() {}, start() {}, stop() {}, gain: param(), frequency: param(), Q: param(), type: '', buffer: null };
  }
  function makeAudio(stored) {
    let created = 0;
    const listeners = {};
    class FakeCtx {
      constructor() { created += 1; this.currentTime = 0; this.sampleRate = 8000; this.state = 'running'; this.destination = {}; }
      createGain() { return fakeNode(); }
      createOscillator() { return fakeNode(); }
      createBiquadFilter() { return fakeNode(); }
      createBufferSource() { return fakeNode(); }
      createBuffer(c, len) { const d = new Float32Array(len); return { getChannelData: () => d }; }
      resume() {}
      suspend() {}
    }
    const storage = memoryStorage(stored || {});
    const document = { readyState: 'complete', hidden: false, getElementById: () => null, addEventListener: (t, fn) => { listeners[t] = fn; } };
    const sandbox = { console, Date, Math, JSON, setInterval: () => 1, clearInterval() {}, setTimeout, localStorage: storage, document, Float32Array };
    sandbox.window = sandbox;
    sandbox.AudioContext = FakeCtx;
    vm.runInNewContext(text('js/audio.js'), sandbox, { filename: 'js/audio.js' });
    return { A: sandbox.GameAudio, created: () => created, listeners, storage };
  }

  const a = makeAudio();
  assert.strictEqual(a.A.DEFAULT_VOLUME, 0.9);
  assert.strictEqual(a.A.prefs().volume, 0.9);
  assert.strictEqual(a.A.preview(), true, '试听本身记作手势');
  assert.strictEqual(a.created(), 1, '试听可在双开关关闭时建上下文');
  assert.strictEqual(a.A.setVolume(0.25), 0.25);
  assert.strictEqual(a.A.prefs().volume, 0.25);
  assert.strictEqual(a.A.setVolume(2), 1);
  assert.strictEqual(a.A.setVolume(-1), 0);

  const low = makeAudio({ xiuxian_audio: JSON.stringify({ music: true, sfx: false, volume: 0.2 }) });
  assert.strictEqual(low.A.prefs().volume, 0.2, '其它分支写入的低默认音量须原样读出');
  assert.strictEqual(low.A.prefs().music, true);

  const legacy = makeAudio({ xiuxian_audio: JSON.stringify({ music: false, sfx: true }) });
  assert.strictEqual(legacy.A.prefs().volume, 0.9, '旧偏好没有 volume 时保持 0.9');
  const muted = makeAudio({ xiuxian_audio: JSON.stringify({ music: true, sfx: true, volume: 0 }) });
  assert.strictEqual(muted.A.prefs().volume, 0, '显式写成 0 的音量不得被当成缺省');

  const src = text('js/audio.js');
  assert.ok(src.includes('setVolume') && src.includes('btn-audio-preview') && src.includes('rng-volume'));
  assert.ok(src.includes('ensureCtx(true)'));
  const html = text('index.html');
  assert.ok(html.includes('id="rng-volume"') && html.includes('id="btn-audio-preview"') && html.includes('试听'));
}

console.log('batch6.test.js ok');
