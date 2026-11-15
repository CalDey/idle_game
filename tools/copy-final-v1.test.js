// 文案定稿 v1：1-1 战败旁白、本命道途显示名（id 不变）、往事回溯简介与「果子」揭示。
// 用法：node tools/copy-final-v1.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const text = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const FINAL = JSON.parse(fs.readFileSync('/workspace/docs/worldbuilding/文案定稿_v1.json', 'utf8'));

function memoryStorage(initial) {
  const data = Object.assign({}, initial || {});
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    _data: data
  };
}

function load(files) {
  const sandbox = {
    window: {},
    console,
    localStorage: memoryStorage(),
    document: {
      getElementById: () => null,
      addEventListener() {},
      querySelector() { return null; }
    }
  };
  sandbox.globalThis = sandbox.window;
  sandbox.window.document = sandbox.document;
  files.forEach((f) => vm.runInNewContext(text(`js/${f}.js`), sandbox, { filename: `${f}.js` }));
  return sandbox.window;
}

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

check('1-1 战败对白用 A 句，键 stage1_1_fail', () => {
  const W = load(['config', 'story-data', 'story']);
  const expect = FINAL.stage1_1_fail;
  assert.strictEqual(expect, '凡躯挡不住它。仙桃树下压着一件法宝，前一个主人没能活着取走——去拿。');
  assert.strictEqual(W.Story.STORY_LINES.stage1_1_fail, expect);
  const s = { stage: { best: 0 }, storySeen: {} };
  assert.strictEqual(W.Story.pendingStage1Fail(s), true);
  s.stage.best = 1;
  assert.strictEqual(W.Story.pendingStage1Fail(s), false, '已通 1-1 不再弹');
  s.stage.best = 0;
  s.storySeen.stage1_1_fail = true;
  assert.strictEqual(W.Story.pendingStage1Fail(s), false, '看过一次不再弹');
  assert.strictEqual(W.Story.afterStageFail(2, () => {}), false, '非 1-1 不弹');
  assert.ok(text('js/stage-ui.js').includes('afterStageFail(stageNum)'));
});

check('本命道途只换显示名，路径与节点 id、数值字段不变；界面不再出现「重定」', () => {
  const W = load(['config', 'equip', 'state', 'path']);
  const P = W.Path;
  const want = FINAL.path.PATHS;
  assert.strictEqual(P.PATHS.length, want.length);
  const ids = [];
  P.PATHS.forEach((p, i) => {
    const src = want[i];
    assert.strictEqual(p.id, src.id, '道途 id 不得改');
    assert.strictEqual(p.name, src.name);
    assert.strictEqual(p.motto, src.motto);
    assert.ok(String(p.icon).startsWith('assets/ui/path/'), '图标路径保持原资源，不用定稿里的 slot_*');
    src.nodes.forEach((n, j) => {
      const node = p.nodes[j];
      assert.strictEqual(node.id, n.id, '节点 id 不得改');
      assert.strictEqual(node.name, n.name);
      assert.strictEqual(node.desc, n.desc);
      assert.strictEqual(node.kind, n.kind);
      assert.strictEqual(node.key, n.key);
      assert.strictEqual(node.per, n.per, `${node.id} per 不得改数值`);
      ids.push(`${p.id}/${node.id}`);
    });
  });
  assert.deepStrictEqual(ids, [
    'jian/fengmang', 'jian/jianyi', 'jian/zhanyao',
    'ti/liangu', 'ti/tiebi', 'ti/zhenyue',
    'fu/julingfu', 'fu/zhaocaifu', 'fu/jingshenfu'
  ]);
  assert.strictEqual(P.PATH_MAP.fu.nodes.find((n) => n.id === 'zhaocaifu').name, '摄石符');
  Object.keys(P.TEXT).forEach((k) => {
    assert.ok(!String(P.TEXT[k]).includes('重定'), `TEXT.${k} 含「重定」`);
  });
  assert.strictEqual(P.TEXT.btnRespecOpenFree, '改道（免费）');
  assert.ok(P.TEXT.introChoose.includes('改道'));
  assert.ok(P.TEXT.flashChosen.includes('已把本命押在{name}上'));
  // 渲染用文案集中在 TEXT：源码里不再硬编码「重定」给玩家看（注释除外）
  const src = text('js/path.js');
  const shown = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!shown.includes('重定'), 'path.js 非注释源码不得出现「重定」');
});

check('往事回溯入口名不变，副标题/按钮/30 章简介写入 RECALL_TEXT；果子只在第 26 章通关后可见', () => {
  const W = load(['config', 'story-data', 'story']);
  const T = W.Story.RECALL_TEXT;
  assert.strictEqual(T.entry, '往事回溯');
  assert.strictEqual(T.modalTitle, '往事回溯');
  assert.strictEqual(T.entrySub, FINAL.recall.ui.entrySub);
  assert.strictEqual(T.empty, FINAL.recall.ui.empty);
  assert.strictEqual(T.listHint, FINAL.recall.ui.listHint);
  assert.strictEqual(T.replayIntro, FINAL.recall.ui.btnIntro);
  assert.strictEqual(T.replayBoss, FINAL.recall.ui.btnBoss);
  assert.strictEqual(T.close, FINAL.recall.ui.close);
  FINAL.recall.chapters.forEach((c) => {
    assert.strictEqual(T.chapterIntro[c.ch], c.summary, `第 ${c.ch} 章简介`);
  });
  assert.strictEqual(Object.keys(T.chapterIntro).length, 30);
  assert.ok(T.chapterIntro[26].includes('果子'));
  assert.strictEqual(W.Story.chapterIntroText(26, 250), '', '未通第 26 章不得露出「果子」');
  const unlocked = W.Story.chapterIntroText(26, 260);
  assert.ok(unlocked.includes('果子'));
  const list = W.Story.clearedChapters(250);
  assert.ok(!list.some((c) => c.chapter === 26));
  assert.ok(!list.some((c) => (c.intro || '').includes('果子')));
  const list26 = W.Story.clearedChapters(260);
  const ch26 = list26.find((c) => c.chapter === 26);
  assert.ok(ch26 && ch26.intro.includes('果子'));
  const c1 = W.Story.clearedChapters(10);
  assert.strictEqual(c1[0].intro, FINAL.recall.chapters[0].summary);
});

check('道果天赋 +50% 文案与 bonusPerLevel 绑定，本批不改数值', () => {
  const W = load(['config']);
  const qi = W.GameConfig.DAOGUO_TALENTS.find((x) => x.id === 'xiantian_daoti');
  const st = W.GameConfig.DAOGUO_TALENTS.find((x) => x.id === 'qiyun_jiashang');
  assert.strictEqual(qi.bonusPerLevel, 0.5);
  assert.strictEqual(st.bonusPerLevel, 0.5);
  assert.ok(qi.desc.includes('+50%'));
  assert.ok(st.desc.includes('+50%'));
});

console.log(`copy-final-v1: ${passed} checks passed`);
