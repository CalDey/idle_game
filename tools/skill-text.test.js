// 绝技说明与施放台词：覆盖 config 全部角色；技能名沿用 config；说明里的倍率/百分比与 config 一致
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const text = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const host = (v) => JSON.parse(JSON.stringify(v));

const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(text('js/config.js'), ctx);
vm.runInContext(text('js/skill-text-data.js'), ctx);
const C = ctx.window.GameConfig;
const ST = ctx.window.SkillTextData;
const heroes = host(C.HEROES);
const skills = host(ST.skills);

assert.deepStrictEqual(Object.keys(skills).sort(), heroes.map((h) => h.id).sort(), '绝技文案需覆盖 config 全部角色且不多出');

const pct = (r) => `${Math.round(r * 100)}%`;
heroes.forEach((h) => {
  const t = skills[h.id];
  const k = h.skill;
  assert.ok(k && k.name, `${h.id} config 缺技能`);
  assert.strictEqual(t.skillId, k.id, `${h.id} skillId 与 config 不一致`);
  assert.ok(!('name' in t) && !('altName' in t), `${h.id} 不应收录技能名/备选名（名称以 config 为准）`);
  assert.ok(typeof t.desc === 'string' && t.desc.length >= 20, `${h.id} desc 缺失`);
  assert.ok(typeof t.castLine === 'string' && t.castLine.length > 0 && t.castLine.length <= 20, `${h.id} castLine 缺失或过长`);
  assert.strictEqual(ST.desc(h.id), t.desc);
  assert.strictEqual(ST.castLine(h.id), t.castLine);

  // 说明中的数值必须来自 config
  const main = k.kind === 'row' ? k.rowMult : k.mainMult;
  assert.ok(t.desc.includes(`${main} 倍`), `${h.id} 主倍率应为 ${main}`);
  if (k.splashMult > 0) assert.ok(t.desc.includes(`${k.splashMult} 倍溅射`), `${h.id} 溅射应为 ${k.splashMult}`);
  else assert.ok(!t.desc.includes('倍溅射'), `${h.id} 无溅射却写了溅射`);
  if (k.healSelfOfMainDmg > 0) assert.ok(t.desc.includes(pct(k.healSelfOfMainDmg)), `${h.id} 自回应为 ${pct(k.healSelfOfMainDmg)}`);
  if (k.healAllyMaxHpRatio > 0) assert.ok(t.desc.includes(`生命上限的 ${pct(k.healAllyMaxHpRatio)}`), `${h.id} 群疗应为 ${pct(k.healAllyMaxHpRatio)}`);
  if (k.buffHits > 0) {
    assert.ok(t.desc.includes(`${k.buffAtkMult} 倍`), `${h.id} 加持倍率应为 ${k.buffAtkMult}`);
    assert.ok(t.desc.includes(k.buffHits === 2 ? '两下' : `${k.buffHits} 下`), `${h.id} 加持次数应为 ${k.buffHits}`);
  }
  // 不写代码里没有的机制
  ['灼烧', '燃烧', '恐惧', '复活', '召唤', '护盾', '持续伤害'].forEach((w) => {
    t.desc.split('。').forEach((sentence) => {
      if (sentence.includes(w)) assert.ok(/不|没有/.test(sentence), `${h.id} 出现未实现机制：${w}`);
    });
  });
});

// HERO_SKILLS 中的同名配置也保持一致
Object.keys(host(C.HERO_SKILLS || {})).forEach((id) => {
  assert.strictEqual(skills[id].skillId, C.HERO_SKILLS[id].id);
});

// UI 接线：队伍卡片摘要 + 弹窗完整说明；我方绝技落下时在施法者处飘 castLine
{
  const stage = text('js/stage-ui.js');
  assert.strictEqual((stage.match(/\$\{skillDescHtml\(h\.id\)\}/g) || []).length, 2, '已解锁/未解锁卡片都显示绝技摘要');
  assert.ok(stage.includes('renderSquadSkillDetail();'));
  assert.ok(stage.includes('if (!isEnemyUlt) ultCastLine(ultEv);'));
  assert.ok(stage.includes("spawnVoiceFloat(caster, line, 'ult')"));
  // 技能名仍取 config
  assert.ok(stage.includes("const skillName = (h.skill && h.skill.name) || '破妄神通';"));
  const html = text('index.html');
  assert.ok(html.includes('id="squad-skill-detail"'));
  assert.ok(/<script src="js\/skill-text-data\.js\?v=\d+"><\/script>/.test(html));
  assert.ok(/\.squad-hero-skill-desc \{/.test(text('css/style.css')));
}

console.log('skill-text tests passed:', heroes.length, 'heroes');
