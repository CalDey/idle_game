// 15 名唯一英雄、4 仙、旧存档迁移、显式锁定、6 人上限、资产字节保护、字体缓存。
// 用法：node tools/hero-roster.test.js
// 字体字形检查需要 Python fontTools（pip install fonttools brotli）。
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const BASE = 'e7f15be2488d74323763a478e9f63c66a62c64a8';
const RESTORED_PORTRAITS = {
  lanyi: {
    img: 'assets/hero_v21_new_hd.jpg?v=4',
    poster: 'assets/hero_v21_new_poster.jpg?v=4',
    hdSha256: '562f3686fb503df7c612d02c835d142a3b4e11736dd9085c8137d8fbd8232b0c',
    posterSha256: '5fd371cef7ea6c83ecc272af9561945b3f2cd4beaeba7766f021014da8137314'
  },
  cloak: {
    img: 'assets/hero_mlg_dawn_hd.jpg?v=4',
    poster: 'assets/hero_mlg_dawn_poster.jpg?v=4',
    hdSha256: '4b6773a1f7de6ef9453137fa98b3e60efc3019d126d0477abb80aebc5cd2f868',
    posterSha256: 'b80c752e5db38f70dd65593eba5f798b4ef4f97a0c7219bcd650b5d3065a796e'
  },
  saintess: {
    img: 'assets/hero_saintess_v4b_hd.jpg?v=4',
    poster: 'assets/hero_saintess_v4b_poster.jpg?v=4',
    hdSha256: '1240c33e67b1dc9e67b9bb3e926bbcc462d2dd14ca9f048b4ff9ce583224d4a9',
    posterSha256: '237fddd52a9b7f9624c8bd6a01d403390d673eea8f01dc6b333883a37acb899c'
  },
  shuanghua: {
    img: 'assets/hero_shuanghua_hd.jpg?v=4',
    poster: 'assets/hero_shuanghua_poster.jpg?v=4',
    hdSha256: '1d8403bd594d3852159015dd3777be118635ed2feefe1779926eef474e2ece0d',
    posterSha256: '7f9563857bbb783e67932f54fe87937f082a5d48a316b16bc4ea301481a983d7'
  },
  sweetmaid: {
    img: 'assets/hero_sweetmaid_hd.jpg?v=4',
    poster: 'assets/hero_sweetmaid_poster.jpg?v=4',
    hdSha256: '7faaf2d8fe5d2038047a1123d0ee758e538e5f77c3bca43d46ea27ee4d7f28cb',
    posterSha256: 'db61561b42aaa4fb66f1a95004e26d47425ace34f2a4a92fa9768e6da24c01e8'
  },
  jianghua: {
    img: 'assets/hero_jianghua_hd.jpg?v=2',
    poster: 'assets/hero_jianghua_poster.jpg?v=2',
    hdSha256: '1fcd357a0d9744249cab91c429cc64fe11101f3879cc6212a35121a5e3175b8a',
    posterSha256: 'f4ba6aba72ec17205073bec6dfd4e108037e2bb980a0c3c021e2cde78652b8af'
  }
};
const YUESHI_HD_SHA256 = 'b6f93fb86082210f3cec22cb5d01b1cdcfe49d6b064886132e9a580ac4637d16';
const YUESHI_POSTER_SHA256 = '2a48c81b71ff91632dab463fffdf56cf10fe527fd28e07789a6b51fa8216fb4d';
const YUESHI_AVATAR_SHA256 = 'a1bb1a7cbad2f17385fae6117876d7825d1758450190cde3fae4cf2f010a6c99';
const NEW_FOUR_HEROES = {
  ziling: {
    name: '紫绫影姬',
    quality: 'di',
    skillId: 'duanying_zhuihun',
    skillName: '断影追魂',
    skillKind: 'single',
    mainMult: 1.85,
    img: 'assets/hero_ziling_hd.jpg?v=3',
    poster: 'assets/hero_ziling_poster.jpg?v=3',
    avatar: 'assets/battle/avatars/ziling.webp?v=3',
    size: { width: 1008, height: 1792 },
    hdSha256: '7363d69622d376fac5daf3ae01d76b5d5c47deb461aa4be842937154039df179',
    posterSha256: 'f214ae13db2beb4b551faea71f27932a2405ad00eca8349faf113644b27cb06f',
    avatarSha256: '5aed69c2445b484544c71ed9aad03a71fc060f5d908e37888eb17f18ecca2676'
  },
  honglian: {
    name: '红莲妖姬',
    quality: 'di',
    skillId: 'honglian_zhuoxin',
    skillName: '红莲灼心',
    skillKind: 'row',
    mainMult: 1.15,
    rowMult: 1.15,
    avatar: 'assets/battle/avatars/honglian.webp?v=2',
    size: { width: 1008, height: 1792 },
    hdSha256: '1395be8b191bd281a7466128295189c699a3615cdbcb706ee2189d918cad69bf',
    posterSha256: '7a3620b6b26e7b8da9d83e50b312d76eb1836d9695921e5b01557a7e30014bdd',
    avatarSha256: '47cfa20d16c637ab70e80dae3e916388d915946529100cf4912568dbf15b35fa'
  },
  molan: {
    name: '墨兰执事',
    quality: 'xuan',
    skillId: 'xuanchou_pozhen',
    skillName: '玄筹破阵',
    skillKind: 'damage_buff_ally',
    mainMult: 1.2,
    buffAtkMult: 1.35,
    buffHits: 2,
    size: { width: 1080, height: 1920 },
    hdSha256: '48f25ae020a0ad8d3aa894a093cb93a7634adbac46aebbd9def09c6fa814bc58',
    posterSha256: '1f3b2279f3a12ba5441ae5cbdac9f7610cae91fd0e1ba83a6f44bc8b6864bd76',
    avatarSha256: 'b3e7f8d7f60ab16856eef7fe897b21b556ed56c5e410ad8eed3eb5dd72d9ec78'
  },
  qinglan: {
    name: '晴岚游侠',
    quality: 'xuan',
    skillId: 'liufeng_zhuying',
    skillName: '流风逐影',
    skillKind: 'single',
    mainMult: 1.75,
    avatar: 'assets/battle/avatars/qinglan.webp?v=2',
    size: { width: 1080, height: 1920 },
    hdSha256: '884a7e73786ae83131f6db035bf8f5b5f29834c2bafa3e0c1dbfac6dfda8923d',
    posterSha256: '6f88c34fceccf44f67a2c2f545574131f66879e29852484de883031b9c48a4d9',
    avatarSha256: '65a6f948519feb9f3ec633448457f9db7f8d8b91ccf7810c3a9ae0bf53ef8c36'
  }
};
const PREVIOUS_IDS = ['lanyi', 'cloak', 'saintess', 'miko', 'shuanghua', 'sweetmaid', 'jianghua', 'qingkui'];
const ALL_13_IDS = PREVIOUS_IDS.concat(['yueshi', 'ziling', 'honglian', 'molan', 'qinglan']);
const ALL_15_IDS = ALL_13_IDS.concat(['fenxiao', 'shuangchen']);
const MAIN = '6c873b5cbed5270ffde62175d059a16521d2bd24';
const FREE_ADDED = ['yueshi', 'ziling', 'honglian', 'molan', 'qinglan', 'fenxiao', 'shuangchen'];
const ASSET_UNCHANGED_IDS = ['lanyi', 'cloak', 'saintess', 'miko', 'shuanghua', 'sweetmaid', 'jianghua', 'qingkui', 'honglian', 'molan', 'qinglan'];
const KICK_ZILING_SHA256 = '1f84886ecbebb4717193dba4622394254220779f3af788ac6611d6be48431cf6';
const EXISTING_SKILL_KINDS = new Set([
  'single',
  'splash_lifesteal',
  'damage_heal_allies',
  'row',
  'splash_freeze',
  'damage_buff_ally'
]);

function read(rel) {
  return fs.readFileSync(path.join(root, rel));
}

function text(rel) {
  return read(rel).toString('utf8');
}

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' });
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function stripQuery(assetPath) {
  return String(assetPath || '').split('?')[0];
}

function jpegSize(buf) {
  let i = 2;
  while (i < buf.length - 8) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
    }
    if (marker === 0xd8 || marker === 0xd9) {
      i += 2;
      continue;
    }
    if (i + 3 >= buf.length) break;
    const seglen = buf.readUInt16BE(i + 2);
    i += 2 + seglen;
  }
  throw new Error('无法读取 JPEG 尺寸');
}

function webpSize(buf) {
  assert.strictEqual(buf.toString('ascii', 0, 4), 'RIFF');
  assert.strictEqual(buf.toString('ascii', 8, 12), 'WEBP');
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    return {
      width: 1 + buf.readUIntLE(24, 3),
      height: 1 + buf.readUIntLE(27, 3)
    };
  }
  if (chunk === 'VP8 ') {
    return {
      width: buf.readUInt16LE(26) & 0x3fff,
      height: buf.readUInt16LE(28) & 0x3fff
    };
  }
  if (chunk === 'VP8L') {
    const b0 = buf[21];
    const b1 = buf[22];
    const b2 = buf[23];
    const b3 = buf[24];
    return {
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6))
    };
  }
  throw new Error(`未知 WebP 块 ${chunk}`);
}

function imageSize(rel) {
  const buf = read(rel);
  if (buf[0] === 0xff && buf[1] === 0xd8) return jpegSize(buf);
  if (buf.toString('ascii', 0, 4) === 'RIFF') return webpSize(buf);
  throw new Error(`不是 JPEG/WebP：${rel}`);
}

function hostValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadConfigSource(source) {
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox.window;
  vm.runInNewContext(source, sandbox);
  return hostValue(sandbox.window.GameConfig);
}

function loadRuntime(storage) {
  const sandbox = { window: {}, console, localStorage: storage };
  sandbox.globalThis = sandbox.window;
  vm.runInNewContext(text('js/config.js'), sandbox);
  vm.runInNewContext(text('js/equip.js'), sandbox);
  vm.runInNewContext(text('js/battle.js'), sandbox);
  vm.runInNewContext(text('js/state.js'), sandbox);
  return {
    CFG: sandbox.window.GameConfig,
    Battle: sandbox.window.Battle,
    GameState: sandbox.window.GameState
  };
}

function memoryStorage(initial) {
  const data = Object.assign({}, initial || {});
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    removeItem(key) {
      delete data[key];
    },
    _data: data
  };
}

function saveRaw(fields) {
  const now = Date.now();
  return JSON.stringify(Object.assign({
    version: 3,
    heroId: 'lanyi',
    qi: 123456,
    stones: 789,
    realmIndex: 5,
    lastSaveTime: now,
    createdAt: now - 86400000,
    playTimeMs: 3600000,
    lifetimeQi: 999999,
    gongfa: { banxue: 3 },
    stage: { cur: 13, best: 12, idleAt: now, squad: ['lanyi'] },
    tree: { lv: 1, peaches: 4, gifted: true, regenAt: now, upEnd: 0 },
    squad: ['lanyi', 'cloak', 'saintess', 'miko', 'shuanghua', 'sweetmaid'],
    formation: { lanyi: { c: 2, r: 4 } },
    unlockedHeroes: PREVIOUS_IDS.slice()
  }, fields));
}

function assertProgressKept(before, after) {
  assert.strictEqual(after.heroId, before.heroId);
  assert.deepStrictEqual(after.squad, before.squad);
  assert.strictEqual(after.qi, before.qi);
  assert.strictEqual(after.stones, before.stones);
  assert.strictEqual(after.realmIndex, before.realmIndex);
  assert.strictEqual(after.stage.best, before.stage.best);
  assert.strictEqual(after.stage.cur, before.stage.cur);
  assert.strictEqual(after.gongfa.banxue, before.gongfa.banxue);
  assert.strictEqual(after.lifetimeQi, before.lifetimeQi);
  assert.deepStrictEqual(after.formation.lanyi, before.formation.lanyi);
}

const baseConfig = loadConfigSource(git(['show', `${BASE}:js/config.js`]));
const mainConfig = loadConfigSource(git(['show', `${MAIN}:js/config.js`]));
const currentConfig = loadConfigSource(text('js/config.js'));
const heroes = currentConfig.HEROES;
const ids = heroes.map((hero) => hero.id);

assert.strictEqual(baseConfig.HEROES.length, 8, '基线 e7f15be 应是 8 名英雄；这不是当前人数断言');
assert.strictEqual(mainConfig.HEROES.length, 13);
assert.strictEqual(new Set(ids).size, 15, '当前应有 15 个唯一英雄 ID');
assert.strictEqual(ids.length, 15);
assert.deepStrictEqual(ids, ALL_15_IDS);

function withoutAssets(hero) {
  const copy = Object.assign({}, hero);
  delete copy.img;
  delete copy.poster;
  delete copy.avatar;
  return copy;
}

const mainById = {};
mainConfig.HEROES.forEach((hero) => {
  mainById[hero.id] = hero;
});
ASSET_UNCHANGED_IDS.forEach((id) => {
  const now = heroes.find((hero) => hero.id === id);
  const prev = mainById[id];
  assert.deepStrictEqual(now, prev, `${id} 完整配置被改动`);
  assert.deepStrictEqual(currentConfig.HERO_SKILLS[id], mainConfig.HERO_SKILLS[id], `${id} 技能被改动`);
  ['img', 'poster', 'avatar'].forEach((key) => {
    const rel = stripQuery(prev[key]);
    const baseBlob = git(['rev-parse', `${MAIN}:${rel}`]).trim();
    const workBlob = git(['hash-object', '--', rel]).trim();
    assert.strictEqual(workBlob, baseBlob, `无关角色资源被改动：${rel}`);
  });
});
['yueshi', 'ziling'].forEach((id) => {
  const now = heroes.find((hero) => hero.id === id);
  const prev = mainById[id];
  assert.deepStrictEqual(withoutAssets(now), withoutAssets(prev), `${id} 除素材外的配置被改动`);
  assert.deepStrictEqual(now.skill, prev.skill);
  assert.deepStrictEqual(currentConfig.HERO_SKILLS[id], mainConfig.HERO_SKILLS[id]);
});

const baseById = {};
baseConfig.HEROES.forEach((hero) => {
  baseById[hero.id] = hero;
});
PREVIOUS_IDS.forEach((id) => {
  const now = heroes.find((hero) => hero.id === id);
  const prev = baseById[id];
  assert.ok(now, `缺少原英雄 ${id}`);
  assert.strictEqual(now.name, prev.name);
  assert.strictEqual(now.quality, prev.quality);
  assert.strictEqual(now.avatar, prev.avatar);
  assert.deepStrictEqual(now.skill, prev.skill);
  if (Object.prototype.hasOwnProperty.call(RESTORED_PORTRAITS, id)) {
    const exp = RESTORED_PORTRAITS[id];
    assert.strictEqual(now.img, exp.img);
    assert.strictEqual(now.poster, exp.poster);
    assert.strictEqual(sha256(read(stripQuery(now.img))), exp.hdSha256);
    assert.strictEqual(sha256(read(stripQuery(now.poster))), exp.posterSha256);
    assert.deepStrictEqual(imageSize(stripQuery(now.img)), { width: 1008, height: 1792 });
    assert.deepStrictEqual(imageSize(stripQuery(now.poster)), { width: 1008, height: 1792 });
    const avatarRel = stripQuery(prev.avatar);
    assert.strictEqual(git(['hash-object', '--', avatarRel]).trim(), git(['rev-parse', `${BASE}:${avatarRel}`]).trim());
    assert.deepStrictEqual(imageSize(avatarRel), { width: 512, height: 512 });
    return;
  }
  assert.strictEqual(now.img, prev.img);
  assert.strictEqual(now.poster, prev.poster);
  ['img', 'poster', 'avatar'].forEach((key) => {
    const rel = stripQuery(prev[key]);
    const baseBlob = git(['rev-parse', `${BASE}:${rel}`]).trim();
    const workBlob = git(['hash-object', '--', rel]).trim();
    assert.strictEqual(workBlob, baseBlob, `原英雄资源被改动：${rel}`);
    const size = imageSize(rel);
    assert.ok(size.width > 0 && size.height > 0, rel);
  });
});

const yueshi = heroes.find((hero) => hero.id === 'yueshi');
assert.strictEqual(yueshi.name, '月誓灵姝');
assert.strictEqual(yueshi.quality, 'tian');
assert.ok(!yueshi.locked);
assert.strictEqual(yueshi.skill.name, '月誓灵佑');
assert.strictEqual(yueshi.skill.kind, 'damage_heal_allies');
assert.strictEqual(yueshi.skill.healAllyMaxHpRatio, 0.08);
assert.strictEqual(yueshi.skill.mainMult, 1.2);
assert.strictEqual(yueshi.skill.splashMult, 0);
assert.strictEqual(yueshi.img, 'assets/hero_yueshi_hd.jpg?v=2');
assert.strictEqual(yueshi.poster, 'assets/hero_yueshi_poster.jpg?v=2');
assert.strictEqual(yueshi.avatar, 'assets/battle/avatars/yueshi.webp?v=3');
assert.strictEqual(read(stripQuery(yueshi.img)).length, 524264);
assert.ok(!Object.prototype.hasOwnProperty.call(yueshi.skill, 'shield'));
assert.ok(EXISTING_SKILL_KINDS.has(yueshi.skill.kind));
assert.deepStrictEqual(currentConfig.HERO_SKILLS.yueshi, yueshi.skill);

const xianIds = heroes.filter((hero) => hero.quality === 'xian').map((hero) => hero.id);
assert.deepStrictEqual(xianIds, ['lanyi', 'cloak', 'fenxiao', 'shuangchen']);
const baseQualities = {};
baseConfig.HEROES.forEach((hero) => {
  baseQualities[hero.id] = hero.quality;
});
assert.deepStrictEqual(baseQualities, {
  lanyi: 'xian',
  cloak: 'xian',
  saintess: 'tian',
  miko: 'di',
  shuanghua: 'tian',
  sweetmaid: 'xuan',
  jianghua: 'di',
  qingkui: 'tian'
});

['img', 'poster', 'avatar'].forEach((key) => {
  const rel = stripQuery(yueshi[key]);
  assert.ok(fs.existsSync(path.join(root, rel)), rel);
  assert.ok(text('js/config.js').includes(path.basename(rel)), `部署引用缺失 ${rel}`);
});
assert.strictEqual(sha256(read(stripQuery(yueshi.img))), YUESHI_HD_SHA256);
assert.strictEqual(sha256(read(stripQuery(yueshi.poster))), YUESHI_POSTER_SHA256);
assert.strictEqual(sha256(read(stripQuery(yueshi.avatar))), YUESHI_AVATAR_SHA256);
assert.deepStrictEqual(imageSize(stripQuery(yueshi.img)), { width: 1008, height: 1792 });
assert.deepStrictEqual(imageSize(stripQuery(yueshi.poster)), { width: 1008, height: 1792 });
assert.deepStrictEqual(imageSize(stripQuery(yueshi.avatar)), { width: 512, height: 512 });
assert.ok(read(stripQuery(yueshi.img)).length > 100000);
assert.notStrictEqual(sha256(read(stripQuery(yueshi.poster))), YUESHI_HD_SHA256);

Object.keys(NEW_FOUR_HEROES).forEach((hid) => {
  const exp = NEW_FOUR_HEROES[hid];
  const hero = heroes.find((item) => item.id === hid);
  assert.ok(hero, `缺少新英雄 ${hid}`);
  assert.strictEqual(hero.name, exp.name);
  assert.strictEqual(hero.quality, exp.quality);
  assert.notStrictEqual(hero.quality, 'xian');
  assert.ok(!hero.locked);
  assert.strictEqual(hero.skill.id, exp.skillId);
  assert.strictEqual(hero.skill.name, exp.skillName);
  assert.strictEqual(hero.skill.kind, exp.skillKind);
  assert.strictEqual(hero.skill.mainMult, exp.mainMult);
  assert.ok(EXISTING_SKILL_KINDS.has(hero.skill.kind));
  assert.deepStrictEqual(currentConfig.HERO_SKILLS[hid], hero.skill);
  ['img', 'poster', 'avatar'].forEach((key) => {
    if (exp[key]) assert.strictEqual(hero[key], exp[key]);
    const rel = stripQuery(hero[key]);
    assert.ok(fs.existsSync(path.join(root, rel)), rel);
    assert.ok(text('js/config.js').includes(path.basename(rel)), `部署引用缺失 ${rel}`);
  });
  assert.strictEqual(sha256(read(stripQuery(hero.img))), exp.hdSha256);
  assert.strictEqual(sha256(read(stripQuery(hero.poster))), exp.posterSha256);
  assert.strictEqual(sha256(read(stripQuery(hero.avatar))), exp.avatarSha256);
  assert.deepStrictEqual(imageSize(stripQuery(hero.img)), exp.size);
  assert.deepStrictEqual(imageSize(stripQuery(hero.poster)), exp.size);
  assert.deepStrictEqual(imageSize(stripQuery(hero.avatar)), { width: 512, height: 512 });
  assert.notStrictEqual(sha256(read(stripQuery(hero.poster))), exp.hdSha256);
});
assert.notStrictEqual(sha256(read('assets/hero_ziling_hd.jpg')), KICK_ZILING_SHA256);
assert.ok(!text('js/config.js').includes('27c65ab'));
assert.ok(!text('js/config.js').includes('a13112c0'));

const XIAN_PAIR = {
  fenxiao: {
    name: '焚霄炎姬',
    skillId: 'fenxiao_guanzhen',
    skillName: '焚霄贯阵',
    skillKind: 'row',
    mainMult: 1.4,
    rowMult: 1.4,
    img: 'assets/hero_fenxiao_hd.jpg?v=1',
    poster: 'assets/hero_fenxiao_poster.jpg?v=1',
    avatar: 'assets/battle/avatars/fenxiao.webp?v=1',
    hdSha256: 'c37c0b370754cc939d4e8dda6717b559c9b6e1125a5d255402198ef988224314',
    posterSha256: 'a7d5549cf70e618eb0167a3f951dc21e333d2afeb7638a2fd2ef40b25deea70d',
    avatarSha256: '00fc1637071b6364cf11724667502c11b8b0e5dc595ac711874a3343a538db94'
  },
  shuangchen: {
    name: '霜宸冰璃',
    skillId: 'shuangchen_yingyu',
    skillName: '霜宸映愈',
    skillKind: 'damage_heal_allies',
    mainMult: 1.45,
    healAllyMaxHpRatio: 0.09,
    splashMult: 0,
    img: 'assets/hero_shuangchen_hd.jpg?v=1',
    poster: 'assets/hero_shuangchen_poster.jpg?v=1',
    avatar: 'assets/battle/avatars/shuangchen.webp?v=1',
    hdSha256: '6a4585cd9b698a2ee1468da30e9f8ed2f11a07c4f2174d4df6c2a9ab272c9c5c',
    posterSha256: '2374722c27455cc82bb977a3f5eb0ec5e0a41ca35ccf6e0b8bde76a909b26ccf',
    avatarSha256: '68df445368b794eb03b2681d0f278cd798b29fea2f0e2b3f8890ca29d67d02a0'
  }
};
Object.keys(XIAN_PAIR).forEach((hid) => {
  const exp = XIAN_PAIR[hid];
  const hero = heroes.find((item) => item.id === hid);
  assert.ok(hero, `缺少仙品 ${hid}`);
  assert.strictEqual(hero.name, exp.name);
  assert.strictEqual(hero.quality, 'xian');
  assert.ok(!hero.locked);
  assert.strictEqual(hero.skill.id, exp.skillId);
  assert.strictEqual(hero.skill.name, exp.skillName);
  assert.strictEqual(hero.skill.kind, exp.skillKind);
  assert.strictEqual(hero.skill.mainMult, exp.mainMult);
  assert.strictEqual(hero.skill.splashMult, exp.splashMult || 0);
  if (exp.rowMult) assert.strictEqual(hero.skill.rowMult, exp.rowMult);
  if (exp.healAllyMaxHpRatio) assert.strictEqual(hero.skill.healAllyMaxHpRatio, exp.healAllyMaxHpRatio);
  assert.ok(EXISTING_SKILL_KINDS.has(hero.skill.kind));
  assert.deepStrictEqual(currentConfig.HERO_SKILLS[hid], hero.skill);
  assert.strictEqual(hero.img, exp.img);
  assert.strictEqual(hero.poster, exp.poster);
  assert.strictEqual(hero.avatar, exp.avatar);
  assert.strictEqual(sha256(read(stripQuery(hero.img))), exp.hdSha256);
  assert.strictEqual(sha256(read(stripQuery(hero.poster))), exp.posterSha256);
  assert.strictEqual(sha256(read(stripQuery(hero.avatar))), exp.avatarSha256);
  assert.deepStrictEqual(imageSize(stripQuery(hero.img)), { width: 1008, height: 1792 });
  assert.deepStrictEqual(imageSize(stripQuery(hero.poster)), { width: 1008, height: 1792 });
  assert.deepStrictEqual(imageSize(stripQuery(hero.avatar)), { width: 512, height: 512 });
  assert.ok(read(stripQuery(hero.poster)).length < read(stripQuery(hero.img)).length);
  assert.notStrictEqual(sha256(read(stripQuery(hero.poster))), exp.hdSha256);
});

const fresh = loadRuntime(memoryStorage());
const freshLoad = fresh.GameState.loadGame();
assert.strictEqual(freshLoad.isNew, true);
const freshState = hostValue(fresh.GameState.state);
assert.strictEqual(freshState.heroId, 'lanyi');
assert.deepStrictEqual(freshState.squad, PREVIOUS_IDS.slice(0, 6));
assert.ok(!freshState.squad.includes('yueshi'));
assert.ok(!freshState.squad.includes('fenxiao'));
assert.ok(!freshState.squad.includes('shuangchen'));
assert.strictEqual(fresh.Battle.isHeroUnlocked('fenxiao', fresh.GameState.state), true);
assert.strictEqual(fresh.Battle.isHeroUnlocked('shuangchen', fresh.GameState.state), true);
assert.strictEqual(freshState.squad.length, 6);
assert.strictEqual(fresh.Battle.isHeroUnlocked('yueshi', fresh.GameState.state), true);
assert.strictEqual(fresh.Battle.MAX_SQUAD_SIZE, 6);

const oldSave = JSON.parse(saveRaw({}));
const migrated = loadRuntime(memoryStorage({ xiuxian_idle_save_v1: JSON.stringify(oldSave) }));
const migratedLoad = migrated.GameState.loadGame();
assert.strictEqual(migratedLoad.isNew, false);
assert.ok(!migratedLoad.offlineReport, '测试存档不应触发离线结算');
const migratedState = hostValue(migrated.GameState.state);
assertProgressKept(oldSave, migratedState);
FREE_ADDED.forEach((hid) => {
  assert.ok(migratedState.unlockedHeroes.includes(hid));
  assert.ok(!migratedState.squad.includes(hid));
  assert.strictEqual(migrated.Battle.isHeroUnlocked(hid, migrated.GameState.state), true);
});
assert.deepStrictEqual(
  migratedState.unlockedHeroes.filter((id) => !FREE_ADDED.includes(id)),
  oldSave.unlockedHeroes
);
assert.strictEqual(migratedState.squad.length, 6);

const lockedSave = JSON.parse(saveRaw({
  heroId: 'saintess',
  squad: ['saintess', 'lanyi'],
  stage: { cur: 8, best: 7, idleAt: Date.now(), squad: ['saintess', 'lanyi'] },
  formation: { lanyi: { c: 2, r: 4 }, saintess: { c: 1, r: 4 } },
  unlockedHeroes: ['lanyi', 'cloak', 'saintess'],
  lockedHeroes: ['yueshi', 'sweetmaid', 'ziling', 'honglian', 'molan', 'qinglan', 'fenxiao', 'shuangchen']
}));
const lockedRt = loadRuntime(memoryStorage({ xiuxian_idle_save_v1: JSON.stringify(lockedSave) }));
lockedRt.GameState.loadGame();
const lockedState = hostValue(lockedRt.GameState.state);
assert.strictEqual(lockedState.heroId, 'saintess');
assert.deepStrictEqual(lockedState.squad, ['saintess', 'lanyi']);
assert.ok(!lockedState.unlockedHeroes.includes('yueshi'));
assert.ok(!lockedState.unlockedHeroes.includes('sweetmaid'));
['ziling', 'honglian', 'molan', 'qinglan', 'fenxiao', 'shuangchen'].forEach((hid) => {
  assert.ok(!lockedState.unlockedHeroes.includes(hid));
  assert.strictEqual(lockedRt.Battle.isHeroUnlocked(hid, lockedRt.GameState.state), false);
});
assert.ok(lockedState.unlockedHeroes.includes('qingkui'), '既有晴葵免费迁移应保留');
assert.ok(lockedState.unlockedHeroes.includes('lanyi'));
assert.ok(lockedState.unlockedHeroes.includes('cloak'));
assert.strictEqual(lockedRt.Battle.isHeroUnlocked('yueshi', lockedRt.GameState.state), false);
assert.strictEqual(lockedRt.Battle.isHeroUnlocked('sweetmaid', lockedRt.GameState.state), false);
assert.strictEqual(lockedState.qi, lockedSave.qi);
assert.strictEqual(lockedState.stage.best, 7);

const implicitSave = JSON.parse(saveRaw({
  unlockedHeroes: undefined,
  lockedHeroes: ['yueshi', 'ziling', 'honglian', 'molan', 'qinglan', 'fenxiao', 'shuangchen'],
  squad: ['cloak'],
  heroId: 'cloak',
  stage: { cur: 4, best: 3, idleAt: Date.now(), squad: ['cloak'] }
}));
delete implicitSave.unlockedHeroes;
const implicitRt = loadRuntime(memoryStorage({ xiuxian_idle_save_v1: JSON.stringify(implicitSave) }));
implicitRt.GameState.loadGame();
const implicitState = hostValue(implicitRt.GameState.state);
assert.ok(!Array.isArray(implicitState.unlockedHeroes));
assert.deepStrictEqual(implicitState.squad, ['cloak']);
assert.strictEqual(implicitState.heroId, 'cloak');
assert.strictEqual(implicitRt.Battle.isHeroUnlocked('yueshi', implicitRt.GameState.state), false);
['ziling', 'honglian', 'molan', 'qinglan', 'fenxiao', 'shuangchen'].forEach((hid) => {
  assert.strictEqual(implicitRt.Battle.isHeroUnlocked(hid, implicitRt.GameState.state), false);
});
assert.strictEqual(implicitRt.Battle.isHeroUnlocked('lanyi', implicitRt.GameState.state), true);

const battleState = {
  atk: 900,
  hp: 6000,
  def: 240,
  spd: 120,
  crit: 0,
  critDmg: 1.5,
  heroId: 'yueshi',
  squad: ['yueshi', 'lanyi', 'cloak']
};
const session = fresh.Battle.createSession(battleState, 1, 11);
assert.strictEqual(session.playerUnits.length, 3);
const caster = session.playerUnits.find((unit) => unit.heroId === 'yueshi');
const ally = session.playerUnits.find((unit) => unit.heroId === 'lanyi');
const dead = session.playerUnits.find((unit) => unit.heroId === 'cloak');
assert.strictEqual(caster.skill.kind, 'damage_heal_allies');
assert.strictEqual(caster.skill.name, '月誓灵佑');
assert.ok(!('shield' in caster));
session.playerUnits.forEach((unit) => {
  unit.hp = Math.floor(unit.maxHp * 0.4);
});
dead.hp = 0;
dead.alive = false;
const before = {
  yueshi: caster.hp,
  lanyi: ally.hp
};
caster.rage = (currentConfig.BATTLE && currentConfig.BATTLE.RAGE_MAX) || 100;
const events = session.castUlt(caster.id);
const ult = events.find((event) => event.type === 'ult');
assert.ok(ult, '月誓应能释放绝技');
assert.strictEqual(ult.skillId, 'yueshi_lingyou');
assert.strictEqual(ult.skillName, '月誓灵佑');
assert.strictEqual(ult.skillKind, 'damage_heal_allies');
assert.ok(ult.dmg > 0);
assert.ok(!ult.shield && !ult.barrier);
const ratio = yueshi.skill.healAllyMaxHpRatio;
[caster, ally].forEach((unit) => {
  const expected = Math.max(1, Math.ceil(unit.maxHp * ratio));
  const heal = ult.heals.find((item) => item.unitId === unit.id);
  assert.ok(heal, `${unit.heroId} 应获得队友回复`);
  assert.strictEqual(heal.amount, expected);
  assert.strictEqual(unit.hp, Math.min(unit.maxHp, before[unit.heroId] + expected));
  assert.ok(unit.hp <= unit.maxHp);
  assert.ok(unit.shield == null);
});
assert.ok(!ult.heals.some((item) => item.unitId === dead.id));
assert.strictEqual(dead.hp, 0);

// 验证新增四位角色（ziling, honglian, molan, qinglan）真实绝技释放
const newFourSession = fresh.Battle.createSession({
  atk: 900,
  hp: 6000,
  def: 240,
  spd: 120,
  crit: 0,
  critDmg: 1.5,
  heroId: 'ziling',
  squad: ['ziling', 'honglian', 'molan', 'qinglan', 'lanyi', 'cloak']
}, 80, 19);
newFourSession.enemyUnits.forEach((e) => {
  e.hp = 999999;
  e.maxHp = 999999;
});
assert.strictEqual(newFourSession.playerUnits.length, 6);
const uZiling = newFourSession.playerUnits.find((u) => u.heroId === 'ziling');
const uHonglian = newFourSession.playerUnits.find((u) => u.heroId === 'honglian');
const uMolan = newFourSession.playerUnits.find((u) => u.heroId === 'molan');
const uQinglan = newFourSession.playerUnits.find((u) => u.heroId === 'qinglan');

uZiling.rage = 100;
const evZiling = newFourSession.castUlt(uZiling.id).find((e) => e.type === 'ult');
assert.ok(evZiling && evZiling.skillId === 'duanying_zhuihun' && evZiling.skillKind === 'single');
assert.strictEqual(evZiling.targets.length, 1);
assert.ok(evZiling.dmg > 0);

uHonglian.rage = 100;
const evHonglian = newFourSession.castUlt(uHonglian.id).find((e) => e.type === 'ult');
assert.ok(evHonglian && evHonglian.skillId === 'honglian_zhuoxin' && evHonglian.skillKind === 'row');
assert.ok(evHonglian.targets.length >= 1);
assert.ok(evHonglian.dmg > 0);

uMolan.rage = 100;
const evMolan = newFourSession.castUlt(uMolan.id).find((e) => e.type === 'ult');
assert.ok(evMolan && evMolan.skillId === 'xuanchou_pozhen' && evMolan.skillKind === 'damage_buff_ally');
assert.ok(evMolan.buffTargetId);
const buffedUnit = newFourSession.unitMap[evMolan.buffTargetId];
assert.strictEqual(buffedUnit.atkBuffMult, 1.35);
assert.strictEqual(buffedUnit.atkBuffHits, 2);

uQinglan.rage = 100;
const evQinglan = newFourSession.castUlt(uQinglan.id).find((e) => e.type === 'ult');
assert.ok(evQinglan && evQinglan.skillId === 'liufeng_zhuying' && evQinglan.skillKind === 'single');
assert.strictEqual(evQinglan.targets.length, 1);
assert.ok(evQinglan.dmg > 0);

const fireSession = fresh.Battle.createSession({
  atk: 900,
  hp: 6000,
  def: 240,
  spd: 120,
  crit: 0,
  critDmg: 1.5,
  heroId: 'fenxiao',
  squad: ['fenxiao', 'lanyi']
}, 80, 19);
fireSession.enemyUnits.forEach((enemy) => {
  enemy.hp = 999999;
  enemy.maxHp = 999999;
});
const uFenxiao = fireSession.playerUnits.find((unit) => unit.heroId === 'fenxiao');
uFenxiao.rage = 100;
const evFenxiao = fireSession.castUlt(uFenxiao.id).find((event) => event.type === 'ult');
assert.ok(evFenxiao && evFenxiao.skillId === 'fenxiao_guanzhen' && evFenxiao.skillKind === 'row');
assert.strictEqual(evFenxiao.skillName, '焚霄贯阵');
assert.ok(evFenxiao.targets.length >= 1);
assert.ok(evFenxiao.dmg > 0);
assert.strictEqual(evFenxiao.heals.length, 0);
assert.ok(!evFenxiao.freezeTargetId);

const iceState = {
  atk: 900,
  hp: 6000,
  def: 240,
  spd: 120,
  crit: 0,
  critDmg: 1.5,
  heroId: 'shuangchen',
  squad: ['shuangchen', 'lanyi', 'cloak']
};
const iceSession = fresh.Battle.createSession(iceState, 1, 11);
const iceCaster = iceSession.playerUnits.find((unit) => unit.heroId === 'shuangchen');
const iceAlly = iceSession.playerUnits.find((unit) => unit.heroId === 'lanyi');
const iceDead = iceSession.playerUnits.find((unit) => unit.heroId === 'cloak');
iceSession.playerUnits.forEach((unit) => {
  unit.hp = Math.floor(unit.maxHp * 0.4);
});
iceDead.hp = 0;
iceDead.alive = false;
const iceBefore = { shuangchen: iceCaster.hp, lanyi: iceAlly.hp };
iceCaster.rage = 100;
const evIce = iceSession.castUlt(iceCaster.id).find((event) => event.type === 'ult');
assert.ok(evIce && evIce.skillId === 'shuangchen_yingyu' && evIce.skillKind === 'damage_heal_allies');
assert.strictEqual(evIce.skillName, '霜宸映愈');
assert.strictEqual(evIce.targets.length, 1);
assert.ok(evIce.dmg > 0);
assert.ok(!evIce.freezeTargetId);
[iceCaster, iceAlly].forEach((unit) => {
  const expected = Math.max(1, Math.ceil(unit.maxHp * 0.09));
  const heal = evIce.heals.find((item) => item.unitId === unit.id);
  assert.ok(heal, `${unit.heroId} 应获得霜宸映愈回复`);
  assert.strictEqual(heal.amount, expected);
  assert.strictEqual(unit.hp, Math.min(unit.maxHp, iceBefore[unit.heroId] + expected));
});
assert.ok(!evIce.heals.some((item) => item.unitId === iceDead.id));

const seven = PREVIOUS_IDS.slice(0, 6).concat('yueshi');
const capped = fresh.Battle.buildPlayerUnits({
  atk: 500,
  hp: 3000,
  def: 100,
  spd: 100,
  crit: 0.05,
  critDmg: 1.5,
  heroId: 'lanyi',
  squad: seven
});
assert.strictEqual(capped.length, 6);
assert.deepStrictEqual(Array.from(capped, (unit) => `${unit.heroId}`), PREVIOUS_IDS.slice(0, 6));
const squadState = { heroId: 'lanyi', squad: ['lanyi'] };
const rejected = fresh.Battle.setSquad(squadState, seven);
assert.strictEqual(rejected.ok, false);
assert.strictEqual(rejected.reason, 'MAX_EXCEEDED');
assert.deepStrictEqual(hostValue(squadState.squad), ['lanyi']);
assert.strictEqual(fresh.Battle.MAX_SQUAD_SIZE, 6);

const css = text('css/style.css');
const cssDiff = git(['diff', '-U0', BASE, '--', 'css/style.css']);
const cssBody = cssDiff.split('\n').filter((line) => (
  (line.startsWith('+') || line.startsWith('-')) && !line.startsWith('+++') && !line.startsWith('---')
));
assert.deepStrictEqual(cssBody, [
  '-  src: url("../assets/fonts/MaShanZheng-Role.woff2?v=9") format("woff2");',
  '+  src: url("../assets/fonts/MaShanZheng-Role.woff2?v=12") format("woff2");',
  '-  object-position: 50% 15%;',
  '+  object-position: center top;',
  '-  object-position: center 16%;',
  '+  object-position: center top;'
]);
assert.ok(css.includes('scrollbar-width: none'));
assert.ok(css.includes('object-position: center top'));
assert.match(css, /\.ult-hero-media\s*\{[^}]*object-fit:\s*cover;[^}]*object-position:\s*center top;/);
assert.match(css, /\.role-card-img\s*\{[^}]*object-fit:\s*cover;[^}]*object-position:\s*center top;/);
assert.ok(css.includes('MaShanZheng-Role.woff2?v=12'));
['js/game.js', 'js/stage-ui.js', 'js/gear.js', 'js/equip.js', 'js/titles.js', 'js/no-zoom.js'].forEach((rel) => {
  assert.strictEqual(git(['diff', '--stat', BASE, '--', rel]).trim(), '', `${rel} 不应改动`);
});

const index = text('index.html');
assert.ok(index.includes('css/style.css?v=82'));
assert.ok(index.includes('js/config.js?v=66'));
assert.ok(index.includes('js/state.js?v=31'));
assert.ok(index.includes('js/battle.js?v=34'));
const battleDiff = git(['diff', '-U0', MAIN, '--', 'js/battle.js']);
const battleBody = battleDiff.split('\n').filter((line) => (
  (line.startsWith('+') || line.startsWith('-')) && !line.startsWith('+++') && !line.startsWith('---')
));
assert.ok(battleBody.length > 0 && battleBody.every((line) => line.startsWith('+')), 'battle.js 只允许追加技能回退');
assert.ok(battleBody.some((line) => line.includes('fenxiao_guanzhen')));
assert.ok(battleBody.some((line) => line.includes('shuangchen_yingyu')));
assert.ok(!battleBody.some((line) => line.includes('MAX_ROUNDS') || line.includes('function castUlt')));

const fontCheck = [
  'import ctypes, subprocess, sys, types',
  'try:',
  '  import brotli',
  'except ImportError:',
  '  _lib = ctypes.CDLL("libbrotlidec.so.1")',
  '  _lib.BrotliDecoderDecompress.argtypes = [ctypes.c_size_t, ctypes.c_char_p, ctypes.POINTER(ctypes.c_size_t), ctypes.c_char_p]',
  '  _lib.BrotliDecoderDecompress.restype = ctypes.c_int',
  '  def _dec(d):',
  '    c = max(len(d) * 8, 65536)',
  '    b = ctypes.create_string_buffer(c)',
  '    s = ctypes.c_size_t(c)',
  '    assert _lib.BrotliDecoderDecompress(len(d), d, ctypes.byref(s), b) == 1',
  '    return b.raw[:s.value]',
  '  _m = types.ModuleType("brotli")',
  '  _m.decompress = _dec',
  '  sys.modules["brotli"] = _m',
  'from fontTools.ttLib import TTFont',
  `old = subprocess.check_output(['git','show','${BASE}:assets/fonts/MaShanZheng-Role.woff2'])`,
  "open('/tmp/role-font-base.woff2','wb').write(old)",
  "base = TTFont('/tmp/role-font-base.woff2').getBestCmap()",
  "cur = TTFont('assets/fonts/MaShanZheng-Role.woff2').getBestCmap()",
  "need = [ord(ch) for ch in '月誓灵姝佑紫绫影姬断追魂红莲妖灼心墨兰执事玄筹破阵晴岚游侠流风逐焚霄炎贯宸冰璃映愈']",
  "missing_old = [cp for cp in base if cp not in cur]",
  "missing_new = [cp for cp in need if cp not in cur]",
  "print('missing_old', ''.join(chr(cp) for cp in missing_old))",
  "print('missing_new', ''.join(chr(cp) for cp in missing_new))",
  "sys.exit(1 if missing_old or missing_new else 0)"
].join('\n');
execFileSync('python3', ['-c', fontCheck], { cwd: root, stdio: 'inherit' });

console.log('hero-roster.test.js ok: 15 unique heroes, 4 xian, max squad 6');
