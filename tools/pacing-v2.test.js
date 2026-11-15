// 节奏 v2 合并参数：境界曲线、洞府、推荐战力、精英关、羁绊/道途 6 折、天赋、老存档一次性补偿（不重复发放，已有道果不折算）。
// 用法：node tools/pacing-v2.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const text = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const SAVE_KEY = 'xiuxian_idle_save_v1';

function memoryStorage(initial) {
  const data = Object.assign({}, initial || {});
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    _data: data
  };
}

function runtime(opts) {
  const o = opts || {};
  const files = o.files || ['config', 'equip', 'state', 'titles', 'battle', 'bonds', 'path', 'beasts'];
  const sandbox = { window: {}, console, localStorage: o.storage || memoryStorage() };
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

const STEPS = [1.35, 2.4, 4.88, 1.72, 1.15, 3.26, 1.38, 1.15, 1.15, 1.6, 1.15, 1.15, 2.5, 1.89];
const FAILS = [0.12, 0.12, 0.13, 0.13, 0.14, 0.14, 0.15, 0.15, 0.16, 0.16, 0.17, 0.17, 0.18, 0.18];
const LATE = [1, 2.76, 17.8, 223, 872, 1030, 3570, 2420, 900, 1100, 798, 292, 450, 720];
const PARAMS_V2 = {
  jian: [0.22, 0.35],
  ming: [0.25, 0.32],
  bing: [0.04, 0.08],
  yan: [0.07, 0.12],
  yu: [0.02, 0.045],
  zuo: [8, 20]
};
const PATH_PER = {
  fengmang: 0.018, jianyi: 0.042, zhanyao: 0.048,
  liangu: 0.018, tiebi: 0.024, zhenyue: -0.018,
  julingfu: 0.03, zhaocaifu: 0.048, jingshenfu: 4.8
};

check('境界曲线：LATE / stepGrowth / 化灵倍率 / 失败比例，reqQi 单调且前几层与定稿一致', () => {
  const W = runtime();
  const C = W.GameConfig;
  assert.deepStrictEqual(Array.from(C.LATE_REALM_QI_MULT), LATE);
  C.MAJOR_REALMS.forEach((m, i) => {
    assert.strictEqual(m.stepGrowth, STEPS[i], `${m.name} stepGrowth`);
    assert.strictEqual(m.failureQiLossRatio, FAILS[i], `${m.name} failureQiLossRatio`);
  });
  const hua = C.MAJOR_REALMS.find((m) => m.id === 'hualing');
  assert.strictEqual(hua.realmMultiplier, 1.85);
  const req = C.REALM_STAGES.map((s) => s.reqQi);
  assert.strictEqual(req.length, 42);
  for (let i = 1; i < req.length; i++) assert.ok(req[i] >= req[i - 1], `reqQi 单调 @${i}: ${req[i - 1]} → ${req[i]}`);
  assert.deepStrictEqual(Array.from(req.slice(0, 4)), [50, 68, 91, 718]);
});

check('洞府 B2：产出/造价/倍率；lingmai=250000、洞天福地=4.6e7；先天祖脉造价保持 1.6e7', () => {
  const C = runtime().GameConfig;
  const by = (id) => C.DONGFU_LIST.find((d) => d.id === id);
  assert.strictEqual(by('lingquan').baseStonePerSec, 6);
  assert.strictEqual(by('lingquan').baseCost, 150);
  assert.strictEqual(by('lingquan').costScale, 1.26);
  assert.strictEqual(by('yaoyuan').baseStonePerSec, 40);
  assert.strictEqual(by('yaoyuan').baseCost, 3000);
  assert.strictEqual(by('yaoyuan').costScale, 1.31);
  assert.strictEqual(by('lingmai').baseStonePerSec, 550);
  assert.strictEqual(by('lingmai').baseCost, 250000);
  assert.strictEqual(by('lingmai').costScale, 1.33);
  assert.strictEqual(by('dongtian_fudi').baseStonePerSec, 9000);
  assert.strictEqual(by('dongtian_fudi').baseCost, 46000000);
  assert.strictEqual(by('dongtian_fudi').costScale, 1.35);
  assert.strictEqual(by('xiantian_zuqiao').baseStonePerSec, 170000);
  assert.strictEqual(by('xiantian_zuqiao').baseCost, 16000000);
  assert.strictEqual(by('xiantian_zuqiao').costScale, 1.38);
});

check('天赋 bonusPerLevel 0.1，文案 +10%；新获得道果用 0.02/0.015', () => {
  const W = runtime();
  const qiT = W.GameConfig.DAOGUO_TALENTS.find((x) => x.id === 'xiantian_daoti');
  const stT = W.GameConfig.DAOGUO_TALENTS.find((x) => x.id === 'qiyun_jiashang');
  assert.strictEqual(qiT.bonusPerLevel, 0.1);
  assert.strictEqual(stT.bonusPerLevel, 0.1);
  assert.ok(qiT.desc.includes('+10%') && stT.desc.includes('+10%'));
  W.GameState.loadGame();
  const s = W.GameState.state;
  s.pacingV2LegacyTotalDaoGuo = 0;
  s.totalDaoGuo = 46;
  s.talents.xiantian_daoti = 0;
  s.talents.qiyun_jiashang = 0;
  assert.ok(Math.abs(W.GameState.getDaoGuoQiMultiplier() - (1 + 46 * 0.02)) < 1e-12);
  assert.ok(Math.abs(W.GameState.getDaoGuoStoneMultiplier() - (1 + 46 * 0.015)) < 1e-12);
  s.talents.xiantian_daoti = 2;
  assert.ok(Math.abs(W.GameState.getDaoGuoQiMultiplier() - (1 + 46 * 0.02) * 1.2) < 1e-12);
});

check('推荐战力方案 A：0.9 / 24 次；自动再挑战仍保留 30s 与战力提升，并要求战力≥推荐', () => {
  const W = runtime();
  assert.strictEqual(W.Battle.RECOMMENDED_WIN_RATE, 0.9);
  const src = text('js/battle.js');
  assert.ok(src.includes('const RECOMMENDED_SIMS = 24'));
  const ui = text('js/stage-ui.js');
  assert.ok(ui.includes('now - lastAutoRetryAt < 30000'));
  assert.ok(ui.includes('curCp > lossPlayerCp'));
  assert.ok(ui.includes('curCp >= rec'));
});

check('精英关：每章第 3 关，ELITE_MULT=1.35；奖励灵石 30 秒 / 灵气 15 秒，灵玉仙桃按普通首通 ×2；普通 10/5，Boss 60/30', () => {
  const W = runtime();
  const B = W.GameConfig.BATTLE;
  assert.strictEqual(B.ELITE_MULT, 1.35);
  assert.strictEqual(B.EARLY_RAMP.A, 0.7);
  assert.strictEqual(B.EARLY_RAMP.peakStage, 5);
  assert.strictEqual(B.EARLY_RAMP.endStage, 30);
  assert.strictEqual(B.EARLY_RAMP.bossFactor, 0.25);
  [33, 63, 93].forEach((n) => {
    assert.strictEqual(W.Battle.isEliteStage(n), true, String(n));
    assert.strictEqual(W.Battle.enemyFor(n).isElite, true);
  });
  [13, 23].forEach((n) => assert.strictEqual(W.Battle.isEliteStage(n), false, `第 ${n} 关不再是精英（从 33 起）`));
  assert.strictEqual(W.Battle.isEliteStage(3), false, '第 1 章第 3 关不加精英');
  assert.strictEqual(W.Battle.isEliteStage(1), false);
  assert.strictEqual(W.Battle.isEliteStage(10), false);
  const e3 = W.Battle.enemyFor(33);
  const rampOff = { ...B, EARLY_RAMP: null, ELITE_MULT: 1 };
  // 第 33 关（首个精英）；对比同关去掉精英系数
  const base = W.Battle.earlyRampMult(B, 33, false) * B.BASE_CP * Math.pow(B.GROWTH, 32);
  assert.ok(Math.abs(e3.cp / (base * 1.35) - 1) < 1e-9);
  const r1 = W.Battle.earlyRampMult(B, 1, false);
  const r5 = W.Battle.earlyRampMult(B, 5, false);
  const r30 = W.Battle.earlyRampMult(B, 30, false);
  const r5b = W.Battle.earlyRampMult(B, 5, true);
  assert.strictEqual(r1, 1);
  assert.ok(Math.abs(r5 - 1.7) < 1e-12);
  assert.strictEqual(r30, 1);
  assert.ok(Math.abs(r5b - (1 + 0.7 * 0.25)) < 1e-12);

  W.GameState.loadGame();
  const qi = W.GameState.getQiPerSec();
  const st = W.GameState.getStonePerSec();
  const normal = W.Battle.firstClearReward(W.GameState.state, 1);
  const elite = W.Battle.firstClearReward(W.GameState.state, 33);
  const boss = W.Battle.firstClearReward(W.GameState.state, 10);
  assert.strictEqual(normal.stones, Math.round(st * 10));
  assert.strictEqual(normal.qi, Math.round(qi * 5));
  assert.strictEqual(normal.peaches, 1);
  assert.strictEqual(normal.lingyu, 2 + Math.floor(1 / 10));
  assert.strictEqual(elite.isElite, true);
  assert.strictEqual(elite.stones, Math.round(st * 30));
  assert.strictEqual(elite.qi, Math.round(qi * 15));
  assert.strictEqual(elite.peaches, 2);
  assert.strictEqual(elite.lingyu, (2 + Math.floor(33 / 10)) * 2);
  assert.strictEqual(boss.stones, Math.round(st * 60));
  assert.strictEqual(boss.qi, Math.round(qi * 30));
});

check('道途只改 per（×0.6，含符道经济），id 不变；灵兽花费维持', () => {
  const W = runtime();
  const ids = [];
  W.Path.PATHS.forEach((p) => p.nodes.forEach((n) => {
    ids.push(`${p.id}/${n.id}`);
    assert.strictEqual(n.per, PATH_PER[n.id], n.id);
  }));
  assert.deepStrictEqual(ids, [
    'jian/fengmang', 'jian/jianyi', 'jian/zhanyao',
    'ti/liangu', 'ti/tiebi', 'ti/zhenyue',
    'fu/julingfu', 'fu/zhaocaifu', 'fu/jingshenfu'
  ]);
  const cost = W.Beasts.feedCost(3);
  assert.strictEqual(cost.peaches, 5 + 5 * 3);
  assert.strictEqual(cost.lingyu, Math.round(40 * Math.pow(1.3, 2)));
  assert.strictEqual(W.Beasts.TEAM_ATK_PER_LV, 0.004);
});

check('羁绊为 params_v2 各档 ×0.6', () => {
  const bonds = runtime().Bonds.BONDS || runtime().Bonds;
  const list = runtime().Bonds;
  // Bonds may not export BONDS; read from evaluate/buildMods instead
  const W = runtime();
  const jian2 = W.Bonds.buildMods(['ziling', 'qinglan']);
  assert.ok(Math.abs(jian2.heroMods.ziling.ultDmgMult - (1 + PARAMS_V2.jian[0] * 0.6)) < 1e-12);
  const jian3 = W.Bonds.buildMods(['ziling', 'qinglan', 'lanyi']);
  assert.ok(Math.abs(jian3.heroMods.ziling.ultDmgMult - (1 + PARAMS_V2.jian[1] * 0.6)) < 1e-12);
  const yu2 = W.Bonds.buildMods(['saintess', 'jianghua']);
  assert.ok(Math.abs(yu2.hpMult - (1 + PARAMS_V2.yu[0] * 0.6)) < 1e-12);
  const zuo3 = W.Bonds.buildMods(['miko', 'sweetmaid', 'qingkui']);
  assert.strictEqual(zuo3.rageStart, PARAMS_V2.zuo[1] * 0.6);
});

check('老存档补偿只发一次：2h 灵气、药园造价差价、道果数量不动且旧倍率保留；重载不重复发放', () => {
  const prep = runtime();
  prep.GameState.loadGame();
  const raw = JSON.parse(JSON.stringify(prep.GameState.state));
  delete raw.pacingV2Compensated;
  delete raw.pacingV2LegacyTotalDaoGuo;
  delete raw.pacingV2Notice;
  raw.qi = 100;
  raw.stones = 1000;
  raw.lifetimeQi = 0;
  raw.totalDaoGuo = 46;
  raw.daoGuo = 46;
  raw.reincarnationCount = 1;
  raw.dongfu.yaoyuan = 16;
  raw.lastSaveTime = Date.now();
  const storage = memoryStorage({ [SAVE_KEY]: JSON.stringify(raw) });
  const W = runtime({ storage });
  const r1 = W.GameState.loadGame();
  const s = W.GameState.state;
  assert.strictEqual(s.pacingV2Compensated, true);
  assert.strictEqual(s.pacingV2LegacyTotalDaoGuo, 46);
  assert.strictEqual(s.totalDaoGuo, 46, '道果数量不得改动');
  assert.strictEqual(s.daoGuo, 46);
  const rate = W.GameState.getQiPerSec();
  const expectedQi = Math.round(rate * 7200);
  assert.ok(expectedQi > 0, '应补发正数灵气');
  assert.strictEqual(s.qi, 100 + expectedQi);
  assert.strictEqual(s.lifetimeQi, expectedQi);
  assert.strictEqual(W.GameState.yaoyuanPriceDiffRefund(s), 0, '新造价更高，差价返还为 0');
  assert.strictEqual(s.stones, 1000);
  assert.ok(r1.pacingV2Notice && r1.pacingV2Notice.qi === expectedQi);
  assert.ok(Math.abs(W.GameState.getDaoGuoQiMultiplier() - (1 + 46 * 0.25)) < 1e-12, '已有道果仍按旧倍率');
  s.totalDaoGuo = 56;
  assert.ok(Math.abs(W.GameState.getDaoGuoQiMultiplier() - (1 + 46 * 0.25 + 10 * 0.02)) < 1e-12, '新得道果用新系数');
  s.totalDaoGuo = 46;

  const qiAfter = s.qi;
  const stonesAfter = s.stones;
  const r2 = W.GameState.loadGame();
  assert.strictEqual(W.GameState.state.qi, qiAfter, '重载不得再补发灵气');
  assert.strictEqual(W.GameState.state.stones, stonesAfter);
  assert.strictEqual(W.GameState.state.totalDaoGuo, 46);
  assert.ok(!r2.pacingV2Notice || r2.pacingV2Notice === W.GameState.state.pacingV2Notice);

  const fresh = runtime();
  const nf = fresh.GameState.loadGame();
  assert.strictEqual(nf.isNew, true);
  assert.strictEqual(fresh.GameState.state.pacingV2Compensated, true);
  assert.strictEqual(fresh.GameState.state.qi, 0, '新档不补发');
  assert.strictEqual(fresh.GameState.state.pacingV2LegacyTotalDaoGuo, 0);
});

check('path.js / state.js 注释与源码不再出现「重定」；自动再挑战与补偿弹窗已接入', () => {
  assert.ok(!text('js/path.js').includes('重定'));
  assert.ok(!text('js/state.js').includes('重定'));
  assert.ok(text('index.html').includes('id="pacing-v2-modal"'));
  assert.ok(text('js/game.js').includes('showPacingV2Notice'));
});

check('UI：渡劫按钮可显示战力增益；道途入口不再省略成「化…」；战败条紧凑字号可读；回溯列表不再重复 hint；对白底不透明并抬离底栏；对比弹窗期间暂缓 30/30 停顿', () => {
  const index = text('index.html');
  assert.ok(index.includes('id="btn-breakthrough-gain"'), '突破按钮下应有战力增益位');
  const game = text('js/game.js');
  assert.ok(game.includes('breakGainText') && game.includes('btn-breakthrough-gain'));
  const nb = text('js/newbie.js');
  assert.ok(nb.includes('function breakGainText'));
  assert.ok(nb.includes('compareModalOpen') && nb.includes('peachHoldPausedAt'), '对比弹窗打开时应暂停赠桃目标停顿');

  const css = text('css/style.css');
  const entry = css.match(/\n\.path-entry \{([\s\S]*?)\n\}/);
  assert.ok(entry, '.path-entry 规则');
  assert.ok(!/max-width:\s*9\.5em/.test(entry[1]), '入口不得再用 9.5em 把「化灵初开启」裁成「化…」');
  assert.ok(/flex:\s*0 0 auto/.test(entry[1]));
  assert.ok(/overflow:\s*visible/.test(entry[1]));
  const bannerBtn = css.match(/\.battle-result-overlay\.is-banner \.battle-fail-actions \.btn \{([\s\S]*?)\n\}/);
  assert.ok(bannerBtn, '紧凑战败推荐按钮');
  const fs = /font-size:\s*(\d+)px/.exec(bannerBtn[1]);
  assert.ok(fs && Number(fs[1]) >= 13, `紧凑战败按钮字号应 ≥13px，实际 ${fs && fs[1]}`);

  const su = text('js/stage-ui.js');
  assert.ok(!/className = 'recall-list-hint'/.test(su), '列表内不再插入只准回看提示');
  assert.ok(su.includes("entrySub") || text('js/story.js').includes('entrySub'), '副标题保留');

  const storyModal = css.match(/\n\.story-modal \{([\s\S]*?)\n\}/);
  assert.ok(storyModal);
  assert.ok(/58px/.test(storyModal[1]) && /safe-area-inset-bottom/.test(storyModal[1]), '对白盒抬到 tab 栏之上');
  const box = css.match(/\n\.story-box \{([\s\S]*?)\n\}/);
  assert.ok(box);
  const bg = /background:\s*([^;]+);/.exec(box[1]);
  assert.ok(bg && /^#120c08$/.test(bg[1].trim()), `对白盒背景应不透明，实际 ${bg && bg[1]}`);
});

check('本命道途：催杀符描述改定；择道卡展示首层参悟灵石；改道确认含层数保留与免费次数', () => {
  const W = runtime();
  const fu = W.Path.PATH_MAP.fu.nodes.find((n) => n.id === 'jingshenfu');
  assert.strictEqual(fu.desc, '符一燃，杀心先于人醒。');
  assert.ok(/开战怒气 \+/.test(fu.fmt(4.8)));
  assert.ok(W.Path.TEXT.respecConfirm.includes('按节点位置保留'));
  assert.ok(W.Path.TEXT.respecConfirmFree.includes('免费'));
  const src = text('js/path.js');
  assert.ok(src.includes('nodeCost(s, 0)') && src.includes('path-card-cost'), '择道卡展示首层参悟花费');
});

console.log(`pacing-v2: ${passed} checks passed`);

check('精英关标题带「精英」标签', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '../js/stage-ui.js'), 'utf8');
  assert.ok(src.includes("${enemy.isElite ? '精英 · ' : ''}"), '第 N 关标题在精英关加「精英 · 」');
});
