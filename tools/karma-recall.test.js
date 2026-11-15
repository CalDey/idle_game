// 因果回收：触发条件、各条结果与奖励、再推一次、还篓胜负、一次性发放、因果簿列表。
// 用法：node tools/karma-recall.test.js（vm 加载真实 js，不用浏览器自动化 / getImageData）
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const text = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function memoryStorage() {
  const data = {};
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; }
  };
}

function runtime() {
  const sandbox = {
    window: {}, console, localStorage: memoryStorage(),
    Date, Math, JSON, Number, Object, Array, String, parseInt, parseFloat, isNaN, isFinite
  };
  sandbox.globalThis = sandbox.window;
  sandbox.window.document = {
    getElementById: () => null, querySelector: () => null,
    querySelectorAll: () => [], addEventListener() {}
  };
  [
    'js/config.js', 'js/equip.js', 'js/battle.js', 'js/bonds.js', 'js/state.js',
    'js/events-data.js', 'js/karma-data.js', 'js/karma.js', 'js/idle-events.js', 'js/dispatch.js'
  ].forEach((rel) => { vm.runInNewContext(text(rel), sandbox, { filename: rel }); });
  return sandbox.window;
}

function fresh(opts) {
  const W = runtime();
  W.GameState.loadGame();
  const s = W.GameState.state;
  const o = opts || {};
  s.realmIndex = o.realmIndex != null ? o.realmIndex : 12;
  s.qi = o.qi != null ? o.qi : 1e12;
  s.stones = o.stones != null ? o.stones : 1e12;
  s.lingyu = o.lingyu != null ? o.lingyu : 0;
  if (!s.tree) s.tree = {};
  s.tree.peaches = o.peaches != null ? o.peaches : 0;
  s.lifeBestStage = o.best != null ? o.best : 120;
  s.stage = s.stage || {};
  s.stage.best = o.best != null ? o.best : 120;
  s.stage.cur = o.cur != null ? o.cur : (s.stage.best + 1);
  s.playTimeMs = 60 * 60 * 1000;
  W.Karma.ensureState(s);
  return { W, s, K: W.Karma, IE: W.IdleEvents, GS: W.GameState };
}

function setProgress(s, best, cur) {
  s.lifeBestStage = best;
  s.stage.best = best;
  s.stage.cur = cur != null ? cur : best + 1;
}

function recordAt(ctx, eventId, choice, best) {
  setProgress(ctx.s, best, best + 1);
  return ctx.K.recordSource(ctx.s, eventId, choice);
}

function env(sps, qps, now) {
  return { stonePerSec: sps, qiPerSec: qps, now: now || Date.now() };
}

function settle(ctx, id, idx, e) {
  ctx.IE.ensureState(ctx.s);
  ctx.s.idleEvents.pending = { id, pool: 'idle', at: 1 };
  return ctx.IE.settle(ctx.s, idx, e || env(100, 200), { rng: () => 0.5 });
}

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

check('旧档无 karma 可读取；原 24 条机缘仍在；8 条回收进挂机池（心口阵纹不进）', () => {
  const { W, K, IE } = fresh();
  const n = K.normalize(undefined);
  assert.strictEqual(n.bookUnlocked, false);
  assert.strictEqual(Object.keys(n.events).length, 0);
  assert.strictEqual((W.GameEventsData.events || []).length, 24);
  const extra = IE.allEvents().filter((e) => e.karma);
  assert.strictEqual(extra.length, 8);
  assert.ok(!extra.some((e) => e.id === 'kc_heart_rune'));
  const face = JSON.stringify(W.KarmaData);
  assert.ok(!/必成/.test(face), '回收文案不得写成渡劫一定成功');
});

check('没遇到原事件的玩家永远不会触发对应回收', () => {
  const ctx = fresh({ best: 200 });
  ctx.K.idleEvents().forEach((e) => assert.strictEqual(ctx.K.isEligible(ctx.s, e), false, e.id));
  recordAt(ctx, 'evt_heifeng_tax', 0, 40);
  setProgress(ctx.s, 200, 201);
  assert.strictEqual(ctx.K.isEligible(ctx.s, ctx.K.idleEvents().find((e) => e.id === 'kc_old_clerk')), true);
  assert.strictEqual(ctx.K.isEligible(ctx.s, ctx.K.idleEvents().find((e) => e.id === 'kc_blade_spirit')), false);
});

check('旧账房：收留 / 交出按当前产出×秒数发放，只结算一次', () => {
  const ctx = fresh({ best: 50, lingyu: 0, peaches: 0, qi: 0, stones: 0 });
  recordAt(ctx, 'evt_heifeng_tax', 0, 40);
  setProgress(ctx.s, 50, 51);
  ctx.s.qi = 0;
  ctx.s.stones = 0;
  const e = env(1000, 2000);
  const ev = ctx.K.idleEvents().find((x) => x.id === 'kc_old_clerk');
  const q0 = ctx.K.scaleQuote(ctx.s, ev, ev.options[0], e);
  assert.strictEqual(q0.reward.stone, 300000);
  assert.strictEqual(q0.reward.qi, 120000);
  assert.strictEqual(q0.reward.jade, 30);
  assert.strictEqual(q0.reward.peach, 6);
  const q1 = ctx.K.scaleQuote(ctx.s, ev, ev.options[1], e);
  assert.strictEqual(q1.reward.stone, 180000);
  assert.strictEqual(q1.reward.jade, 15);
  const res = settle(ctx, 'kc_old_clerk', 0, e);
  assert.ok(res.ok);
  assert.strictEqual(ctx.s.stones, 300000);
  assert.strictEqual(ctx.s.lingyu, 30);
  assert.strictEqual(ctx.s.tree.peaches, 6);
  const again = settle(ctx, 'kc_old_clerk', 0, e);
  assert.ok(!again.ok || !ctx.K.callbackEligible(ctx.s, ctx.K.callbackById('kc_old_clerk')));
  assert.strictEqual(ctx.K.callbackEligible(ctx.s, ctx.K.callbackById('kc_old_clerk')), false);
  assert.strictEqual(ctx.s.lingyu, 30);
});

check('残灵索刀：斩了发奖；收器灵给攻击+6% 且战败反噬封顶；还税箱扣灵石', () => {
  const ctx = fresh({ best: 40, stones: 1e9, qi: 100000 });
  recordAt(ctx, 'evt_heifeng_tax', 1, 35);
  setProgress(ctx.s, 40, 41);
  const e = env(100, 50);
  const ev = ctx.K.idleEvents().find((x) => x.id === 'kc_blade_spirit');
  assert.ok(ev.portrait && ev.portrait.id === 'daoling');
  assert.strictEqual(ev.portrait.position, '38% 28%');
  const cut = ctx.K.scaleQuote(ctx.s, ev, ev.options[0], e);
  assert.strictEqual(cut.reward.stone, 12000);
  assert.strictEqual(cut.reward.jade, 24);
  const ret = ctx.K.scaleQuote(ctx.s, ev, ev.options[2], e);
  assert.strictEqual(ret.cost.stone, 30000);
  const keep = settle(ctx, 'kc_blade_spirit', 1, e);
  assert.ok(keep.ok);
  const mods = ctx.K.battleMods(ctx.s);
  assert.ok(Math.abs(mods.atkMult - 1.06) < 1e-9);
  const qiBefore = ctx.s.qi;
  const req = ctx.W.GameConfig.REALM_STAGES[ctx.s.realmIndex].reqQi;
  const loss = ctx.K.onBattleLoss(ctx.s);
  assert.ok(loss > 0);
  assert.ok(loss <= Math.floor(req * 0.05) + 1e-9);
  assert.strictEqual(ctx.s.qi, qiBefore - loss);
});

check('独臂税官三项：人情给灵玉+下个 Boss 情报；要手发重奖；放走无数值', () => {
  const ctx = fresh({ best: 70, lingyu: 0, cur: 71 });
  recordAt(ctx, 'evt_heifeng_tax', 2, 62);
  setProgress(ctx.s, 70, 71);
  const e = env(1817, 14200);
  const ev = ctx.K.idleEvents().find((x) => x.id === 'kc_one_arm');
  assert.strictEqual(ev.options.length, 3, '世界观改动：拍平为三项');
  const res = settle(ctx, 'kc_one_arm', 0, e);
  assert.ok(res.ok);
  assert.strictEqual(ctx.s.lingyu, 20);
  const intel = ctx.s.karma.effects.bossIntel;
  assert.ok(intel && intel.stage % 10 === 0 && intel.bossDmgMult === 0.12);

  const c2 = fresh({ best: 70, lingyu: 0, stones: 0, peaches: 0 });
  recordAt(c2, 'evt_heifeng_tax', 2, 62);
  setProgress(c2.s, 70, 71);
  const hand = settle(c2, 'kc_one_arm', 1, e);
  assert.ok(hand.ok);
  assert.strictEqual(c2.s.stones, Math.round(1817 * 300));
  assert.strictEqual(c2.s.lingyu, 40);
  assert.strictEqual(c2.s.tree.peaches, 8);

  const c3 = fresh({ best: 70, stones: 9, lingyu: 3, peaches: 1, qi: 7 });
  recordAt(c3, 'evt_heifeng_tax', 2, 62);
  setProgress(c3.s, 70, 71);
  const before = { st: c3.s.stones, ly: c3.s.lingyu, p: c3.s.tree.peaches, qi: c3.s.qi };
  const walk = settle(c3, 'kc_one_arm', 2, e);
  assert.ok(walk.ok);
  assert.strictEqual(c3.s.stones, before.st);
  assert.strictEqual(c3.s.lingyu, before.ly);
  assert.strictEqual(c3.s.tree.peaches, before.p);
  assert.strictEqual(c3.s.qi, before.qi);
});

check('桃债：先扣当前层 reqQi×15%，再发更重回礼；拥有甜心女仆改用 textIfOwned', () => {
  const ctx = fresh({ best: 120, realmIndex: 12, qi: 1e12, stones: 0, lingyu: 0, peaches: 0 });
  recordAt(ctx, 'evt_peach_under_tree', 0, 11);
  setProgress(ctx.s, 120, 121);
  const ev = ctx.K.idleEvents().find((x) => x.id === 'kc_peach_debt');
  const req = ctx.W.GameConfig.REALM_STAGES[12].reqQi;
  const e = env(43500, 371000);
  const q = ctx.K.scaleQuote(ctx.s, ev, ev.options[0], e);
  assert.strictEqual(q.cost.qi, Math.floor(req * 0.15));
  assert.strictEqual(q.reward.stone, Math.round(43500 * 360));
  assert.strictEqual(q.reward.jade, 60);
  assert.strictEqual(q.reward.peach, 12);
  const qi0 = ctx.s.qi;
  const res = settle(ctx, 'kc_peach_debt', 0, e);
  assert.ok(res.ok);
  assert.strictEqual(ctx.s.qi, qi0 - q.cost.qi + (q.reward.qi || 0));
  ctx.s.unlockedHeroes = [];
  ctx.s.squad = [];
  ctx.s.heroId = 'hero';
  assert.ok(ctx.K.eventText(ctx.s, ev).includes('树下'));
  ctx.s.unlockedHeroes = ['sweetmaid'];
  assert.ok(ctx.K.eventText(ctx.s, ev).includes('空盘'));
});

check('已问：问她们给灵玉+派遣 7 天 +15%；两种选法都把因果簿该行涂掉', () => {
  const ctx = fresh({ best: 200, lingyu: 0 });
  recordAt(ctx, 'evt_peach_under_tree', 1, 15);
  setProgress(ctx.s, 200, 201);
  const res = settle(ctx, 'kc_asked', 0, env(1, 1, 1000));
  assert.ok(res.ok);
  assert.strictEqual(ctx.s.lingyu, 40);
  assert.strictEqual(ctx.K.dispatchYieldBonus(ctx.s, 1000), 0.15);
  assert.strictEqual(ctx.K.dispatchYieldBonus(ctx.s, 1000 + 7 * 86400000 + 1), 0);
  const rows = ctx.K.ledgerEntries(ctx.s);
  const asked = rows.find((r) => r.callbackId === 'kc_asked');
  assert.ok(asked.closed && /█/.test(asked.ledgerResult));

  const c2 = fresh({ best: 200 });
  recordAt(c2, 'evt_peach_under_tree', 1, 15);
  setProgress(c2.s, 200, 201);
  settle(c2, 'kc_asked', 1, env(1, 1));
  const row2 = c2.K.ledgerEntries(c2.s).find((r) => r.callbackId === 'kc_asked');
  assert.ok(row2.closed && /█/.test(row2.ledgerResult));
});

check('时候已到：再推一次账未了，隔 1 章再入池，奖励不衰减；收下发奖后关闭', () => {
  const ctx = fresh({ best: 250, cur: 251, lingyu: 0, peaches: 0, qi: 0 });
  recordAt(ctx, 'evt_peach_under_tree', 2, 20);
  setProgress(ctx.s, 250, 251);
  const ev = ctx.K.idleEvents().find((x) => x.id === 'kc_ripe');
  const e = env(4.98e6, 8.01e7);
  const q = ctx.K.scaleQuote(ctx.s, ev, ev.options[0], e);
  assert.strictEqual(q.reward.qi, Math.round(8.01e7 * 120));
  assert.strictEqual(q.reward.jade, 80);
  assert.strictEqual(q.reward.peach, 16);
  const push = settle(ctx, 'kc_ripe', 1, e);
  assert.ok(push.ok && push.karma && push.karma.keepOpen);
  assert.strictEqual(ctx.s.lingyu, 0);
  assert.ok(!ctx.K.callbackEligible(ctx.s, ctx.K.callbackById('kc_ripe')), '当章不再入池');
  setProgress(ctx.s, 260, 261);
  assert.ok(ctx.K.callbackEligible(ctx.s, ctx.K.callbackById('kc_ripe')), '隔 1 章再来');
  const q2 = ctx.K.scaleQuote(ctx.s, ev, ev.options[0], e);
  assert.strictEqual(q2.reward.qi, q.reward.qi);
  const take = settle(ctx, 'kc_ripe', 0, e);
  assert.ok(take.ok);
  assert.strictEqual(ctx.s.lingyu, 80);
  assert.strictEqual(ctx.s.tree.peaches, 16);
  assert.ok(!ctx.K.callbackEligible(ctx.s, ctx.K.callbackById('kc_ripe')));
});

check('篓中骨：afterChapters=1 才触发；三种结果；采药女立绘保留骨篓定位', () => {
  const ctx = fresh({ best: 20, cur: 21, stones: 0, lingyu: 0 });
  recordAt(ctx, 'evt_array_eye', 0, 12);
  // source stage 12 is chapter 2; afterChapters 1 => chapter 3+
  setProgress(ctx.s, 18, 19); // chapter 2, not yet
  const ev = ctx.K.idleEvents().find((x) => x.id === 'kc_basket_bones');
  assert.ok(ev.portrait && ev.portrait.id === 'caiyao');
  assert.strictEqual(ev.portrait.position, '60% 18%');
  assert.strictEqual(ctx.K.isEligible(ctx.s, ev), false);
  setProgress(ctx.s, 30, 31); // chapter 3
  assert.strictEqual(ctx.K.isEligible(ctx.s, ev), true);
  const e = env(200, 10);
  const garden = settle(ctx, 'kc_basket_bones', 2, e);
  assert.ok(garden.ok);
  assert.strictEqual(ctx.K.gardenFactor(ctx.s), 1.08);

  const c2 = fresh({ best: 40, stones: 0, lingyu: 0 });
  recordAt(c2, 'evt_array_eye', 0, 12);
  setProgress(c2.s, 40, 41);
  const eye = settle(c2, 'kc_basket_bones', 0, e);
  assert.ok(eye.ok);
  assert.strictEqual(c2.s.stones, 200 * 240);
  assert.strictEqual(c2.s.lingyu, 24);
});

check('心口阵纹：下一次大境界渡劫自动结算，成功率+30%（仍非必成），失败不扣灵气，发灵玉 20', () => {
  const ctx = fresh({ best: 80, realmIndex: 14, lingyu: 0, qi: 1e12 });
  // 列阵末 / 下一重大境界：找 isMajorTribulation
  const stages = ctx.W.GameConfig.REALM_STAGES;
  const major = stages.findIndex((st, i) => st.isMajorTribulation && i >= 12);
  assert.ok(major >= 0);
  ctx.s.realmIndex = major;
  recordAt(ctx, 'evt_array_eye', 1, 40);
  assert.ok(ctx.K.heartRunePending(ctx.s));
  assert.ok(!ctx.K.isEligible(ctx.s, { id: 'kc_heart_rune', karma: true }));
  const base = ctx.GS.getBreakthroughSuccessRate();
  const raw = stages[major].successRate;
  assert.ok(base <= 0.98);
  assert.ok(base >= Math.min(0.98, raw + 0.30 - 0.001) || base > raw, '含 +30% 加成');
  const fail = ctx.GS.applyBreakthroughAttempt(1); // roll 1 always fail unless guaranteed
  if (!fail.success) {
    assert.strictEqual(fail.loss, 0, '失败不扣灵气');
    assert.ok(fail.heartRune);
  }
  assert.strictEqual(ctx.s.lingyu, 20);
  assert.ok(!ctx.K.heartRunePending(ctx.s));
  const row = ctx.K.ledgerEntries(ctx.s).find((r) => r.callbackId === 'kc_heart_rune');
  assert.ok(row.closed);
  const txt = text('js/karma-data.js') + (ctx.K.callbackById('kc_heart_rune').options[0].resultText);
  assert.ok(!txt.includes('必成'));
});

check('还篓：afterChapters=2；收下灵药发奖；照图寻人分胜负', () => {
  const ctx = fresh({ best: 20, stones: 0, lingyu: 0, peaches: 0 });
  recordAt(ctx, 'evt_array_eye', 2, 12); // ch2, need ch4
  setProgress(ctx.s, 25, 26); // still ch3
  const ev = ctx.K.idleEvents().find((x) => x.id === 'kc_return_basket');
  assert.strictEqual(ctx.K.isEligible(ctx.s, ev), false);
  setProgress(ctx.s, 35, 36);
  assert.strictEqual(ctx.K.isEligible(ctx.s, ev), true);
  const e = env(50, 10);
  const herb = settle(ctx, 'kc_return_basket', 0, e);
  assert.ok(herb.ok);
  assert.strictEqual(ctx.s.stones, 50 * 240);
  assert.strictEqual(ctx.s.lingyu, 30);
  assert.strictEqual(ctx.s.tree.peaches, 12);

  const fight = fresh({ best: 40, stones: 0, lingyu: 0, peaches: 0 });
  recordAt(fight, 'evt_array_eye', 2, 12);
  setProgress(fight.s, 40, 41);
  const start = settle(fight, 'kc_return_basket', 1, e);
  assert.ok(start.ok && start.karma && start.karma.pendingElite);
  const win = fight.K.runEliteBattle(fight.s, Object.assign({ win: true }, e));
  assert.ok(win.ok && win.win);
  assert.strictEqual(fight.s.stones, 50 * 360);
  assert.strictEqual(fight.s.lingyu, 50);
  assert.strictEqual(fight.s.tree.peaches, 10);
  assert.ok(win.resultText.includes('放走了'));

  const lose = fresh({ best: 40, stones: 9, lingyu: 1, peaches: 2 });
  recordAt(lose, 'evt_array_eye', 2, 12);
  setProgress(lose.s, 40, 41);
  settle(lose, 'kc_return_basket', 1, e);
  const lost = lose.K.runEliteBattle(lose.s, Object.assign({ win: false }, e));
  assert.ok(lost.ok && !lost.win);
  assert.strictEqual(lose.s.stones, 9);
  assert.ok(lost.resultText.includes('朱砂'));
});

check('因果簿：只列出遇到过的事件；未了/已了；杀伐红墨；第一次选择后解锁', () => {
  const ctx = fresh({ best: 10 });
  assert.strictEqual(ctx.K.bookUnlocked(ctx.s), false);
  assert.strictEqual(ctx.K.ledgerEntries(ctx.s).length, 0);
  const rec = recordAt(ctx, 'evt_heifeng_tax', 1, 8);
  assert.ok(rec.ok && rec.first);
  assert.ok(rec.toast.includes('册子'));
  assert.strictEqual(ctx.K.bookUnlocked(ctx.s), true);
  let rows = ctx.K.ledgerEntries(ctx.s);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].choiceInk, 'red');
  assert.strictEqual(rows[0].status, '此账未了');
  assert.ok(!rows.some((r) => r.sourceId === 'evt_peach_under_tree'));
  setProgress(ctx.s, 40, 41);
  settle(ctx, 'kc_blade_spirit', 0, env(10, 10));
  rows = ctx.K.ledgerEntries(ctx.s);
  assert.ok(rows[0].closed);
  assert.ok(rows[0].ledgerResult.includes('斩了'));
});

check('第 30 关黑风寨主战前台词：仅当原事件发生在首领战之前，按原选择插一句', () => {
  const ctx = fresh({ best: 20 });
  recordAt(ctx, 'evt_heifeng_tax', 0, 20); // best=20 < 30
  assert.strictEqual(ctx.K.bossPrefightLine(ctx.s, 30), '记得你，走路的人。');
  const c1 = fresh({ best: 29 });
  recordAt(c1, 'evt_heifeng_tax', 1, 25);
  assert.strictEqual(c1.K.bossPrefightLine(c1.s, 30), '我的刀，在你身上留了味。');
  const c2 = fresh({ best: 29 });
  recordAt(c2, 'evt_heifeng_tax', 2, 28);
  assert.strictEqual(c2.K.bossPrefightLine(c2.s, 30), '带话那个，现在只剩一只手。你倒是会记账。');
  const late = fresh({ best: 30, cur: 31 });
  recordAt(late, 'evt_heifeng_tax', 0, 30); // already beat 30 (recordAt sets best=30)
  assert.strictEqual(late.K.bossPrefightLine(late.s, 30), null);
});

check('首次满足后提高权重，满 2 章仍未遇到则保底抽中；轮回保留账本', () => {
  const ctx = fresh({ best: 50 });
  recordAt(ctx, 'evt_heifeng_tax', 0, 40);
  setProgress(ctx.s, 50, 51);
  const ev = ctx.K.idleEvents().find((e) => e.id === 'kc_old_clerk');
  assert.strictEqual(ctx.K.drawWeight(ev), 8);
  assert.ok(ctx.K.isEligible(ctx.s, ev));
  assert.strictEqual(ctx.K.shouldPity(ctx.s, ev), false);
  setProgress(ctx.s, 70, 71);
  assert.ok(ctx.K.shouldPity(ctx.s, ev));
  const picks = [];
  for (let i = 0; i < 5; i++) picks.push(ctx.IE.drawEvent(ctx.s, 'idle', () => 0.99).id);
  assert.ok(picks.every((id) => id === 'kc_old_clerk'));

  const rs = ctx.GS.performReincarnation ? null : ctx.s.karma;
  const copied = JSON.parse(JSON.stringify(ctx.s.karma));
  const again = ctx.K.normalize(copied);
  assert.ok(again.events.evt_heifeng_tax);
  assert.strictEqual(again.events.evt_heifeng_tax.choice, 0);
});

check('index / 样式接线：脚本顺序、因果簿入口与弹窗、立绘定位，不用 getImageData', () => {
  const index = text('index.html');
  assert.ok(/<script src="js\/karma-data\.js\?v=\d+"><\/script>/.test(index));
  assert.ok(/<script src="js\/karma\.js\?v=\d+"><\/script>/.test(index));
  assert.ok(index.indexOf('js/karma-data.js') > index.indexOf('js/events-data.js'));
  assert.ok(index.indexOf('js/karma.js') < index.indexOf('js/idle-events.js'));
  ['btn-karma-ledger-gear', 'btn-open-karma-ledger', 'karma-ledger-modal', 'karma-ledger-list'].forEach((id) => {
    assert.ok(index.includes(`id="${id}"`), id);
  });
  const css = text('css/style.css');
  assert.ok(css.includes('.karma-ledger-list'));
  assert.ok(css.includes('object-position: 38% 28%'));
  assert.ok(css.includes('object-position: 60% 18%'));
  assert.ok(fs.existsSync(path.join(root, 'assets/npc/npc_daoling.webp')));
  assert.ok(fs.existsSync(path.join(root, 'assets/npc/npc_caiyao.webp')));
  assert.ok(fs.existsSync(path.join(root, 'assets/npc/npc_daoling_hd.jpg')));
  assert.ok(fs.existsSync(path.join(root, 'assets/npc/npc_caiyao_hd.jpg')));
  assert.ok(!/getImageData/.test(text('js/karma.js')));
  assert.ok(!/getImageData/.test(text('js/idle-events.js')));
});

console.log(`karma-recall.test.js ok: ${passed} checks`);
