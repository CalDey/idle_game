# 测试与数值模拟工具指南（`tools/`）

本文档说明 `tools/` 下自动化测试与数值模拟脚本的用途和运行方式。对照提交 **`851adfb`**（本环境用 `node` 逐个跑过，**18 个 `*.test.js` 全部通过**）。

早期文档中的 `test-squad-size.js`、`test-new-heroes.js`、`smoke-16heroes.js` 以及根目录 `package.json` / jsdom 依赖 **均已不存在**。角色与编队回归现由 `hero-roster.test.js` 等脚本承担，全部只用 Node 内置模块（`vm`、`fs`、`path`、`assert`）。

---

## 1. 环境准备

- 需要 **Node.js**。在仓库根目录直接 `node tools/<脚本>` 即可，不必 `npm install`。
- 测试通过 `vm` 按与页面相近的顺序加载 `js/*.js`，个别用例会构造内存中的 `localStorage` 桩。
- `daily.test.js` 与 `qa-round1.test.js` 会故意写入损坏存档以验证备份逻辑，控制台可能打印 `读取存档异常，初始化新存档`，**只要最后一行是 ok / passed 即视为通过**。

---

## 2. 脚本一览

### 2.1 单元 / 回归测试（18 个，均已在 `851adfb` 通过）

| 脚本 | 核心验证目标 |
| :--- | :--- |
| [tools/asset-refs.test.js](../../tools/asset-refs.test.js) | 配置里引用的静态资源路径存在（本环境输出 `212 references`） |
| [tools/hero-roster.test.js](../../tools/hero-roster.test.js) | 16 名角色唯一、仙品数量、编队上限 6、立绘/头像引用等（替代已删除的 new-heroes / squad-size 测试） |
| [tools/home.test.js](../../tools/home.test.js) | 洞府场景、建筑阶与升级相关回归 |
| [tools/bond.test.js](../../tools/bond.test.js) | 仙缘标签、2/3 人阈值、mods 合并、战斗/秘境叠加、UI 节点 |
| [tools/codex.test.js](../../tools/codex.test.js) | 图鉴条目、30 Boss / 18 小怪；轮回保留 `maxRealm`、突破同步 |
| [tools/mijing.test.js](../../tools/mijing.test.js) | 每日 2 次、8 波锚定、劫运、奖励、旧档、UI；测力常数在 config 且同签名缓存 |
| [tools/daily.test.js](../../tools/daily.test.js) | 每日功课与签到；默认 `daily` 预置；坏档 `Daily.ensure` |
| [tools/dispatch.test.js](../../tools/dispatch.test.js) | 每日 4 悬赏、计时、奖励封顶、轮回保留、互斥与 UI |
| [tools/tower.test.js](../../tools/tower.test.js) | 镇妖塔次数、奖励、存档与轮回 |
| [tools/grow.test.js](../../tools/grow.test.js) | 仙姬培元上限、消耗、战力涨幅受控 |
| [tools/beast.test.js](../../tools/beast.test.js) | 三只灵兽解锁/喂养/加成、美术、轮回保留、页面接线 |
| [tools/idle-events.test.js](../../tools/idle-events.test.js) | 24 条挂机机缘、冷却、折算与结算 |
| [tools/newbie-ux.test.js](../../tools/newbie-ux.test.js) | 引导、目标条、解锁卡、Esc/遮罩、失败跳转等新手体验 |
| [tools/qa-round1.test.js](../../tools/qa-round1.test.js) | QA 第 1 批：导航文案、挂机桃上限、推荐战力同源、回前台补算、坏档先备份、`formatNumber` 非有限值 |
| [tools/skill-text.test.js](../../tools/skill-text.test.js) | 16 人绝技说明与 config 数值一致 |
| [tools/worldbuilding-text.test.js](../../tools/worldbuilding-text.test.js) | 界面/世界观文案接入（不剧透等约束） |
| [tools/lore-names.test.js](../../tools/lore-names.test.js) | 30 章短名与 Boss 关名、羁绊 loreName/flavor、72 个法宝专名；只改显示、旧档回退旧名；秘境顶栏仍用大地域名 |
| [tools/css-brace-balance.test.js](../../tools/css-brace-balance.test.js) | `style.css` 花括号配对（覆盖曾在中后段漏写 `}` 的问题） |

运行示例：

```bash
node tools/codex.test.js
```

### 2.2 数值模拟（3 个，不算在上述 18 个测试里）

| 脚本 | 说明 |
| :--- | :--- |
| [tools/sim.js](../../tools/sim.js) | 贪心修炼模拟：有灵石买最便宜的功法/洞府，灵气够了就突破（不计失败），默认展望约 30 天。它用 `vm` **只加载 `config.js`**，并在脚本内重写了简化版 `qiPerSec` / `stonePerSec`（不含装备、称号、道果总量、章节加成等），结果只能作节奏粗探 |
| [tools/battle-sim.js](../../tools/battle-sim.js) | 自走棋确定性、`step` 与 `runToEnd` 一致、棋盘不变量、胜率曲线与章节快照 |
| [tools/beast-sim.js](../../tools/beast-sim.js) | 灵兽加成对关卡胜率影响的抽样（目录内另有 `beast-sim-output.txt` 可参考） |

```bash
node tools/sim.js
node tools/battle-sim.js
node tools/beast-sim.js
```

---

## 3. 一键跑完全部测试

在仓库根目录：

```bash
for f in tools/*.test.js; do node "$f" || exit 1; done
```

如需连同模拟一起跑，再加上 `node tools/battle-sim.js && node tools/sim.js && node tools/beast-sim.js`。

根目录没有 `package.json`，因此也没有现成的 `npm test`。若接入 CI，直接调用上面的循环即可。

---

## 4. 测试覆盖与仍建议补的缺口

原先建议补充的存档迁移、秘境、功课、派遣、图鉴、羁绊、新手 UX、CSS 括号等，**大部分已有对应 `*.test.js`**。仍然相对薄弱或需要留意的点：

1. **`tools/sim.js` 公式分叉**：未加载 `state.js`，不能当作真实产率回归。若要预测通关天数，应改为调用 `GameState.getQiPerSec()` 等，或在文档/输出里明确「简化模型」。
2. **称号乘区**仍没有独立的 `titles` 单测（条件分散在业务测试里）。
3. **摘桃保底与自动分解**没有单独的 `test-equip-gear.js`，只在相关流程里部分覆盖。
4. **`performReincarnation` 的全字段矩阵**（尤其是 `idleEvents` 是否重置、各子系统深拷）更多是分散在各模块测试中，缺少一张总表测试。
5. 没有 JSDOM 级端到端（原 `smoke-16heroes.js` 已删除）；UI 冒烟主要靠各测试自己拼最小 DOM / 检查 `index.html` 节点。

`hero-roster.test.js` 运行时可能先打印 `missing_old` / `missing_new` 字样，随即给出 `ok: 16 unique heroes, 5 xian, max squad 6`——以最终 ok 为准。
