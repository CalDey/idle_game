// 资源引用完整性：config 里的立绘/头像/敌人图、功法/洞府/天赋图标、index.html 静态 src 都必须存在。
// 用法：node tools/asset-refs.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const text = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const strip = (p) => String(p || '').split('?')[0].split('#')[0];
const exists = (rel) => fs.existsSync(path.join(root, rel));

const sandbox = { window: {}, console };
sandbox.globalThis = sandbox.window;
vm.runInNewContext(text('js/config.js'), sandbox);
const C = sandbox.window.GameConfig;
let checked = 0;
function must(rel, why) {
  assert.ok(rel, `空资源路径：${why}`);
  assert.ok(exists(rel), `资源缺失：${rel}（${why}）`);
  checked += 1;
}

// 英雄立绘 / 海报 / 头像
C.HEROES.forEach((h) => {
  ['img', 'poster', 'avatar'].forEach((k) => {
    if (h[k]) must(strip(h[k]), `${h.id}.${k}`);
  });
});

// 敌人图（与 stage-ui.js resolveEnemyImgUrl 规则一致）
function enemyRel(raw) {
  if (!raw) return '';
  if (raw.includes('/')) return strip(raw);
  return `assets/enemies/${raw.endsWith('.webp') ? raw : `${raw}.webp`}`;
}
C.BATTLE.REGIONS.forEach((r, ri) => {
  (r.mobs || []).forEach((m, mi) => must(enemyRel(m.img), `REGIONS[${ri}].mobs[${mi}] ${m.name}`));
});
C.BATTLE.BOSSES.forEach((b, bi) => must(enemyRel(b.img), `BOSSES[${bi}] ${b.name}`));

// 列表图标（game.js 模板按 id 拼路径）
const game = text('js/game.js');
[['gf_', C.GONGFA_LIST], ['df_', C.DONGFU_LIST], ['tl_', C.DAOGUO_TALENTS]].forEach(([prefix, list]) => {
  assert.ok(game.includes(`assets/icons/${prefix}\${`), `game.js 未使用 ${prefix} 图标模板`);
  list.forEach((item) => must(`assets/icons/${prefix}${item.id}.webp`, `${prefix}${item.id}`));
});
// 洞府图标显示在升级列表中
assert.ok(/home-up-icon[^>]*src="assets\/icons\/df_\$\{item\.id\}\.webp/.test(game) || /src="assets\/icons\/df_\$\{item\.id\}\.webp[^>]*home-up-icon/.test(game) || game.includes('class="gi home-up-icon" src="assets/icons/df_${item.id}.webp'), '洞府升级列表应显示 df_ 图标');

// index.html / js 中的静态 assets 引用
const staticRe = /assets\/[A-Za-z0-9_\-\/@.]+\.(?:webp|jpg|jpeg|png|woff2|mp4|webm)/g;
['index.html', 'css/style.css', ...fs.readdirSync(path.join(root, 'js')).map((f) => `js/${f}`)].forEach((rel) => {
  const src = text(rel);
  const seen = new Set(src.match(staticRe) || []);
  seen.forEach((ref) => {
    if (ref.includes('${')) return;
    must(ref, `${rel} 静态引用`);
  });
});

console.log(`asset-refs.test.js ok: ${checked} references`);
