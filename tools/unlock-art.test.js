// 解锁卡与寒潮/北溟立绘：路径被引用且文件存在。
// 用法：node tools/unlock-art.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const UNLOCKS = [
  { key: 'gear', file: 'assets/ui/unlock_gear.webp' },
  { key: 'yaoyuan', file: 'assets/ui/unlock_yaoyuan.webp' },
  { key: 'mijing', file: 'assets/ui/unlock_mijing.webp' },
  { key: 'bonds', file: 'assets/ui/unlock_bonds.webp' }
];

const newbie = read('js/newbie.js');
assert.ok(newbie.includes('function unlockArtSrc'), '应有 unlockArtSrc，只对有图的 key 发请求');
UNLOCKS.forEach((u) => {
  assert.ok(fs.existsSync(path.join(ROOT, u.file)), `${u.file} 存在`);
  // 模板引用：newbie.js 用 u.key 拼接，此处确认四个 key 都在 UNLOCKS 里
  const re = new RegExp(`key:\\s*'${u.key}'`);
  assert.ok(re.test(newbie), `newbie.js UNLOCKS 含 ${u.key}`);
});

const css = read('css/style.css');
assert.ok(/\.unlock-art img \{[^}]*object-fit: cover/.test(css), '解锁卡插画 object-fit:cover，不拉伸');
assert.ok(/\.unlock-art \{[^}]*aspect-ratio: 16 \/ 9/.test(css), '解锁卡插画位 16:9');

const BOSSES = [
  { id: 'hanchao', file: 'assets/enemies/boss_hanchao.webp' },
  { id: 'beiming', file: 'assets/enemies/boss_beiming.webp' }
];
BOSSES.forEach((b) => {
  assert.ok(fs.existsSync(path.join(ROOT, b.file)), `${b.file} 存在`);
  const cfg = read('js/config.js');
  assert.ok(cfg.includes(`assets/enemies/${path.basename(b.file)}?v=119`), `config.js 引用 ${b.id} webp?v=119`);
});

const sandbox = { window: {}, console };
sandbox.globalThis = sandbox.window;
vm.runInNewContext(read('js/config.js'), sandbox);
const bosses = sandbox.window.GameConfig.BATTLE.BOSSES;
['hanchao', 'beiming'].forEach((id) => {
  const entry = bosses.find((b) => b.id === id);
  assert.ok(entry, `${id} 在 BOSSES 中`);
  assert.notStrictEqual(entry.img, 'placeholder', `${id} 不再是占位`);
  assert.ok(String(entry.img).startsWith(`assets/enemies/boss_${id}.webp`), `${id} 指向 webp`);
});

{
  const m = read('index.html').match(/js\/config\.js\?v=(\d+)/);
  assert.ok(m && Number(m[1]) >= 119, 'index 引用 config.js 且版本不低于接入立绘时的 119');
}
assert.ok(/js\/newbie\.js\?v=\d+/.test(read('index.html')), 'index 引用 newbie.js 带缓存版本');

// 只对仓库里有图的 key 发请求，功法/洞府单项（key 含冒号）不得拼出 404 路径
{
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox.window;
  vm.runInNewContext(read('js/config.js'), sandbox);
  vm.runInNewContext(read('js/newbie.js'), sandbox);
  const NB = sandbox.window.Newbie;
  assert.ok(NB && typeof NB.unlockArtSrc === 'function');
  UNLOCKS.forEach((u) => {
    const src = NB.unlockArtSrc(u.key);
    assert.ok(src.startsWith(`assets/ui/unlock_${u.key}.webp?v=`), `${u.key} 应请求现有插画`);
    assert.ok(fs.existsSync(path.join(ROOT, src.split('?')[0])), `${src} 文件须存在`);
  });
  const bad = ['gongfa:xueji', 'dongfu:lingmai', 'gongfa:foo', '', 'gear:extra'];
  bad.forEach((key) => {
    assert.strictEqual(NB.unlockArtSrc(key), '', `${key} 不得发图请求`);
    assert.ok(!String(key).includes(':') || !NB.unlockArtSrc(key).includes('unlock_gongfa:'), '不得请求带冒号的文件名');
  });
  NB.itemUnlocks().forEach((u) => {
    assert.strictEqual(NB.unlockArtSrc(u.key), '', `单项解锁 ${u.key} 不得请求不存在的图`);
  });
}

console.log('unlock-art.test.js ok: 4 unlock cards + hanchao/beiming + no colon 404');

