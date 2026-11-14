// QA 第 6 批：G1 女性 Boss 圆框锚点、G2 读档钳制、P2 渡劫门槛提示、
// P3 首次音律询问与资源栏/战斗信息最小字号，以及 path-entry / 秘境渐隐跟进。
// 用法：node tools/qa-round6.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const text = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function memoryStorage(initial) {
  const data = Object.assign({}, initial || {});
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    _data: data
  };
}

function runtime(scripts, opts) {
  const ls = (opts && opts.localStorage) || memoryStorage();
  const sandbox = {
    window: {},
    console,
    localStorage: ls,
    document: {
      readyState: 'loading',
      addEventListener() {},
      getElementById() { return null; }
    }
  };
  sandbox.globalThis = sandbox.window;
  sandbox.window.document = sandbox.document;
  sandbox.window.localStorage = ls;
  scripts.forEach((rel) => {
    vm.runInNewContext(text(rel), sandbox, { filename: rel });
  });
  return sandbox.window;
}

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const css = text('css/style.css');
const html = text('index.html');
const gameSrc = text('js/game.js');
const audioSrc = text('js/audio.js');

check('G1 四名女性 Boss 分别设置 object-position，不加大全局 scale；蛛后/龙女保持 54% 28%', () => {
  const scaleBlocks = css.match(/\.board-unit\.is-enemy \.unit-avatar-img\s*\{[^}]+\}/g) || [];
  assert.ok(scaleBlocks.length >= 1, '应有敌人头像规则');
  const global = scaleBlocks[0];
  assert.ok(/transform:\s*scale\(1\.45\)/.test(global), '全局 scale 仍为 1.45');
  assert.ok(!/scale\(1\.[5-9]|scale\([2-9]/.test(global), '不得加大全局 scale');

  const pos = (id) => {
    const re = new RegExp('\\.board-unit\\.is-enemy \\.unit-avatar-img\\[src\\*="boss_' + id + '"\\]\\s*\\{[^}]+object-position:\\s*([^;]+);');
    const m = css.match(re);
    assert.ok(m, `缺少 ${id} 的 object-position`);
    return m[1].trim();
  };
  const xuefu = pos('xuefu');
  const qinglin = pos('qinglin');
  const zhuhou = pos('zhuhou');
  const longnv = pos('longnv');
  assert.strictEqual(zhuhou, '54% 28%', '冰魄蛛后保持原锚点');
  assert.strictEqual(longnv, '54% 28%', '玄冰龙女保持原锚点');
  const yOf = (s) => Number(String(s).split(/\s+/)[1].replace('%', ''));
  assert.ok(yOf(xuefu) < 20, `血蝠夫人 object-position Y 应上移以把脸收入框内，实际 ${xuefu}`);
  assert.ok(yOf(qinglin) < 20, `青鳞蛇姬 object-position Y 应上移以把脸收入框内，实际 ${qinglin}`);
});

check('G2 读档钳制：qi/stones 不小于 0，realmIndex 落在合法境界，其它明显数值也不为负', () => {
  const SAVE = 'xiuxian_idle_save_v1';
  const now = Date.now();
  const ls = memoryStorage({
    [SAVE]: JSON.stringify({
      version: 3,
      qi: -967.44,
      stones: -47.27,
      lingyu: -12,
      realmIndex: -2,
      daoGuo: -3,
      totalDaoGuo: -1,
      lifetimeQi: -100,
      playTimeMs: -50,
      pityBonus: -0.2,
      tree: { peaches: -8, lv: -2, upEnd: 0, regenAt: now },
      stage: { best: -4, cur: -1, wins: -2, fails: -1, losses: -3, streak: -9, maxStreak: -1, speed: -3, idleAt: now },
      mijing: { date: '', used: -1, runs: -2, clears: -3, bestWave: -4, run: null },
      login: { last: '', streak: -5 },
      dayTaps: { date: '', count: -7 },
      lastSaveTime: now,
      openingSeen: true
    })
  });
  const W = runtime(['js/config.js', 'js/equip.js', 'js/state.js'], { localStorage: ls });
  const report = W.GameState.loadGame();
  const s = W.GameState.state;
  assert.strictEqual(report.isNew, false, '负值档应能读入而不是当坏档重建');
  assert.ok(s.qi >= 0, `qi 应 >= 0，实际 ${s.qi}`);
  assert.ok(s.stones >= 0, `stones 应 >= 0，实际 ${s.stones}`);
  assert.ok(s.lingyu >= 0, `lingyu 应 >= 0，实际 ${s.lingyu}`);
  assert.strictEqual(s.realmIndex, 0, 'realmIndex -2 应钳到 0');
  assert.ok(s.daoGuo >= 0 && s.totalDaoGuo >= 0 && s.lifetimeQi >= 0);
  assert.ok(s.playTimeMs >= 0 && s.pityBonus >= 0);
  assert.ok(s.tree.peaches >= 0 && s.tree.lv >= 1);
  assert.ok(s.stage.best >= 0 && s.stage.cur >= 1);
  assert.ok(s.stage.wins >= 0 && s.stage.fails >= 0 && s.stage.streak >= 0);
  assert.ok(s.stage.speed > 0);
  assert.ok(s.mijing.used >= 0 && s.mijing.bestWave >= 0);
  assert.ok(s.login.streak >= 0 && s.dayTaps.count >= 0);
});

check('G2 读档：realmIndex 超出境界上限时钳到最后一重，NaN 资源归零', () => {
  const SAVE = 'xiuxian_idle_save_v1';
  const now = Date.now();
  const max = 41;
  const ls = memoryStorage({
    [SAVE]: JSON.stringify({
      version: 3,
      qi: 'NaN',
      stones: 'Infinity',
      realmIndex: 99,
      lastSaveTime: now,
      openingSeen: true
    })
  });
  const W = runtime(['js/config.js', 'js/equip.js', 'js/state.js'], { localStorage: ls });
  assert.strictEqual(W.GameConfig.REALM_STAGES.length, 42);
  W.GameState.loadGame();
  const s = W.GameState.state;
  assert.strictEqual(s.realmIndex, max, '99 应钳到 41（至尊后）');
  assert.strictEqual(s.qi, 0);
  assert.strictEqual(s.stones, 0);
});

check('G2 coerceStateNumbers 可单独用于钳制，合法正值保持不变', () => {
  const W = runtime(['js/config.js', 'js/equip.js', 'js/state.js']);
  const s = W.GameState.coerceStateNumbers({
    qi: 12.5,
    stones: 30,
    lingyu: 4,
    realmIndex: 20,
    daoGuo: 2
  });
  assert.strictEqual(s.qi, 12.5);
  assert.strictEqual(s.stones, 30);
  assert.strictEqual(s.realmIndex, 20);
  assert.strictEqual(s.daoGuo, 2);
});

check('P2 渡劫晋升旁有「大境界门槛大幅提升」提示，且仅在大境界渡劫时显示', () => {
  assert.ok(html.includes('id="breakthrough-trib-hint"'), 'index 应有提示节点');
  assert.ok(html.includes('大境界门槛大幅提升'), '提示文案应在页面中');
  assert.ok(gameSrc.includes('breakthroughTribHint'), 'game.js 应驱动提示显隐');
  assert.ok(gameSrc.includes('isMajorTribulation') && gameSrc.includes('breakthroughTribHint'), '提示绑定大境界');
  assert.ok(/breakthrough-trib-hint\[hidden\]/.test(css), 'hidden 提示不得被 display 规则盖住');
});

check('P3 首次进入询问音乐音效；选是用默认低音量；选择存档后不再问', () => {
  assert.ok(html.includes('id="audio-consent-modal"'), '应有音律询问弹窗');
  assert.ok(html.includes('btn-audio-consent-yes') && html.includes('btn-audio-consent-no'));
  assert.strictEqual((html.match(/id="rng-volume"/g) || []).length, 1, '不得再加一套音量滑块');
  assert.ok(audioSrc.includes('maybePromptConsent') && audioSrc.includes('applyConsent'));
  assert.ok(gameSrc.includes('maybePromptConsent'), '首次进入应由 game 在开篇/离线之后询问');

  const W = runtime(['js/audio.js']);
  const A = W.GameAudio;
  assert.strictEqual(A.prefs().asked, false, '无本地记录时尚未询问');
  assert.strictEqual(A.prefs().music, false);
  assert.strictEqual(A.prefs().sfx, false);
  assert.strictEqual(A.DEFAULT_VOLUME, 0.9, '主音量缺省仍为 0.9');
  assert.ok(A.DEFAULT_LOW_VOLUME > 0 && A.DEFAULT_LOW_VOLUME < A.DEFAULT_VOLUME, '首次开启应写入低于缺省的主音量');
  assert.strictEqual(A.prefs().volume, 0.9, '未询问前保持滑块缺省 0.9');

  A.applyConsent(true);
  assert.strictEqual(A.prefs().asked, true);
  assert.strictEqual(A.prefs().music, true);
  assert.strictEqual(A.prefs().sfx, true);
  assert.strictEqual(A.prefs().volume, A.DEFAULT_LOW_VOLUME, '选是应写入低主音量，沿用已有滑块');
  const stored = JSON.parse(W.localStorage.getItem(A.PREF_KEY));
  assert.strictEqual(stored.asked, true);
  assert.strictEqual(stored.music, true);
  assert.strictEqual(stored.sfx, true);
  assert.strictEqual(stored.volume, A.DEFAULT_LOW_VOLUME);
  assert.strictEqual(A.maybePromptConsent(), false, '已选择后不得再询问');

  // 已有旧档记录（无 asked 字段）也不再询问
  const ls2 = memoryStorage({ xiuxian_audio: JSON.stringify({ music: false, sfx: false }) });
  const W2 = runtime(['js/audio.js'], { localStorage: ls2 });
  assert.strictEqual(W2.GameAudio.prefs().asked, true);
  assert.strictEqual(W2.GameAudio.maybePromptConsent(), false);
});

check('P3 资源栏与战斗信息最小字号为 12px', () => {
  const pick = (sel) => {
    const re = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]+)\\}');
    const m = css.match(re);
    assert.ok(m, `缺少规则 ${sel}`);
    return m[1];
  };
  const px = (body) => {
    const m = body.match(/font-size:\s*([\d.]+)px/);
    assert.ok(m, `无 font-size: ${body}`);
    return Number(m[1]);
  };
  assert.ok(px(pick('.res-label')) >= 12, '资源栏标签应 ≥12px');
  assert.ok(px(pick('.res-rate')) >= 12, '资源栏速率应 ≥12px');
  assert.ok(px(pick('.battle-top-bar')) >= 12, '战斗顶栏应 ≥12px');
  assert.ok(px(pick('.battle-form-hint')) >= 12, '布阵提示应 ≥12px');
  assert.ok(px(pick('.battle-log-line')) >= 12, '战斗信息行应 ≥12px');
});

check('跟进：≤400px 时 path-entry 为 12px 且长文案不省略、可换行', () => {
  const mediaMatches = [...css.matchAll(/@media \(max-width: 400px\) \{([\s\S]*?)\n\}\n/g)];
  const wrapMedia = mediaMatches.filter((m) => m[1].includes('.path-entry') && /white-space:\s*normal/.test(m[1]));
  assert.ok(wrapMedia.length, '应有 400px path-entry 换行规则');
  const last = wrapMedia[wrapMedia.length - 1];
  const block = last[1];
  const path = block.match(/\.path-entry \{([\s\S]*?)\n  \}/);
  assert.ok(path, '400px 内应有 .path-entry');
  const body = path[1];
  assert.ok(/font-size:\s*12px/.test(body), 'path-entry 在窄屏应为 12px');
  assert.ok(/white-space:\s*normal/.test(body), '应允许换行');
  assert.ok(!/text-overflow:\s*ellipsis/.test(body), '不得再省略');
  const textRule = block.match(/\.path-entry #path-entry-text \{([\s\S]*?)\n  \}/);
  assert.ok(textRule, '窄屏应覆盖标题文字省略');
  assert.ok(/white-space:\s*normal/.test(textRule[1]));
  assert.ok(/text-overflow:\s*unset/.test(textRule[1]));
  const g = css.match(/\n\.path-entry #path-entry-text \{\n(?:  [^\n]+\n)*  white-space: nowrap;\n\}/);
  assert.ok(g, '应有全局 nowrap 规则');
  assert.ok(last.index > css.lastIndexOf(g[0]), '窄屏换行必须写在全局 nowrap 之后');
});

check('跟进：秘境结算底部渐隐放宽到 ≤430px', () => {
  const fade = css.match(/@media \(max-width: (\d+)px\) \{\s*\.mijing-wave-rewards-wrap::after \{/);
  assert.ok(fade, '应有秘境结算渐隐媒体查询');
  assert.strictEqual(fade[1], '430');
  assert.ok(!/@media \(max-width: 375px\) \{\s*\.mijing-wave-rewards-wrap::after \{/.test(css), '不应再只在 375px 生效');
});

check('P3 凡品洞府背景 scene_base 在 game.js / index.html / style.css 使用同一版本号', () => {
  const pick = (src, re) => {
    const m = src.match(re);
    assert.ok(m, '缺少 scene_base 版本: ' + re);
    return m[1];
  };
  const vg = pick(gameSrc, /assets\/home\/scene_base\.webp\?v=(\d+)/);
  const vh = pick(html, /id="home-bg"[^>]*src="assets\/home\/scene_base\.webp\?v=(\d+)/);
  const vc = pick(css, /assets\/home\/scene_base\.webp\?v=(\d+)/);
  assert.strictEqual(vh, vg);
  assert.strictEqual(vc, vg);
});

check('P3 init 用 new Image 预取当前档与下一档洞府背景，且不用 getImageData', () => {
  assert.ok(/function prefetchHomeBackgrounds/.test(gameSrc));
  assert.ok(/new Image\s*\(/.test(gameSrc));
  assert.ok(!/getImageData/.test(gameSrc));
  assert.ok(gameSrc.includes('prefetchHomeBackgrounds(GameState.getHomeBgDisplayTier())'));
  assert.ok(/HOME_BG_SRC\[cur \+ 1\]/.test(gameSrc), '应预取下一档');
});

check('缓存版本：本次改动的 style/state/audio/game 已升到当时最高 + 1（≥127）', () => {
  const ver = (file) => {
    const m = html.match(new RegExp(file.replace('.', '\\.') + '\\?v=(\\d+)'));
    assert.ok(m, `index 应引用 ${file}?v=`);
    return Number(m[1]);
  };
  assert.ok(ver('css/style.css') >= 127);
  assert.ok(ver('js/state.js') >= 127);
  assert.ok(ver('js/audio.js') >= 127);
  assert.ok(ver('js/game.js') >= 127);
});

console.log(`\nqa-round6: ${passed} checks passed`);
