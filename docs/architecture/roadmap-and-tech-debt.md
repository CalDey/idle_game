# 技术债、架构重构建议与新系统扩展指南

对照提交 **`851adfb`** 对源码的审视：先列出已经落地的修复，再写仍存在的技术债、重构优先级，以及扩展新系统时的接入方式。

---

## 1. 近期已修复（不要再当作未决问题）

以下条目在旧讨论或旧文档中出现过，但在当前 main 上已经修好，回归测试可覆盖：

1. **图鉴轮回丢失 `state.codex`**：`performReincarnation` 会 `Codex.syncMaxRealm(state)` 并深拷 `state.codex`，避免天神初以上条目转世后重新上锁。`codex.test.js` / `beast.test.js` 有断言。（对应提交 `c4fb602` 等）
2. **`createDefaultState` 未预置 `daily`**：默认状态已包含与 `Daily.normalize(null)` 同形的 `daily`，坏档再经 `Daily.ensure`。`daily.test.js` 覆盖。
3. **`style.css` 中后段漏写右花括号**（曾导致后续规则被嵌套吞掉，问题点接近旧版 4995 行附近）：已补上 `idle-event-result` / `grow-upgrade-btn` / `tower-challenge-btn` 等处的 `}`，并增加 `css-brace-balance.test.js`。本环境该测试通过。
4. **损坏存档被静默覆盖**：`loadGame` 的 `catch` 会先写入 `xiuxian_idle_save_v1_corrupt` 再重置。`qa-round1.test.js` 覆盖。
5. **秘境测力重复狂跑**：常数已进入 `GameConfig.MIJING`（`PROBE_SIMS: 12`、`PROBE_ITERS: 7`），**同签名结果会缓存**。但缓存未命中时仍可能一次开局跑满 `12 × 7 ≈ 84` 次模拟，见下方未决项。

6. **统一 `?v=` 缓存版本（`tools/bump-version.js`）**：不再手改 `index.html` 里每个脚本/样式的版本号。本次已把本地 css/js 与洞府 `scene_*.webp` 统一到 **128**。以后发版只需在仓库根目录执行 `node tools/bump-version.js --auto`；与并行分支在 `?v=` 上冲突时，解决冲突标记后重跑同一条命令即可。回归：`node tools/version-consistency.test.js`。图标等单图版本号仍按资源单独维护。

---

## 2. 现存技术债

### 2.1 高优先级（P0）

1. **技能配置双份维护**
   - `GameConfig.HERO_SKILLS` 与 `battle.js` 里的 `FALLBACK_HERO_SKILLS` 仍同时存在。优先读配置，但改倍率时必须改两处，容易和测试/线上不一致。
   - 建议：删除或把兜底收成「无名默认单体技」，只留 `config.js` 为唯一数据源。

2. **`state.squad` 与 `state.stage.squad` 双写**
   - `state.js`、`battle.js`、`stage-ui.js` 多处互相拷贝。漏同步会导致阵容回退。
   - 建议：以顶层 `state.squad` 为唯一权威，其它只读镜像或全部走 `GameState.getSquad` / `setSquad`。

3. **免费角色补发名单硬编码**
   - `mergeSave` 仍逐个 `grantFreeHero('qingkui')` … `grantFreeHero('youming')`。再加默认解锁角色时，若忘记补一行，带 `unlockedHeroes` 的旧档拿不到新人。
   - 建议：遍历 `GameConfig.HEROES.filter(h => !h.locked)` 自动补发。

4. **秘境 `measureStrength` 在缓存未命中时约 84 次模拟**
   - 二分 7 轮、每轮 12 局，开秘境或阵容/战力签名变化时可能造成首帧卡顿。缓存只能消除「相同签名」的重复计算。
   - 建议：降低 `PROBE_SIMS` / `PROBE_ITERS`、改用更便宜的估计，或把测力延后到 Web Worker / 空闲回调，并在 UI 上给出短暂「测力中」而不是卡死。

### 2.2 中优先级（P1）

5. **超大 UI 文件更臃肿**
   - `stage-ui.js` 现约 **3229** 行（棋盘、回放、队伍、秘境/塔入口、羁绊、剧情衔接、挂机、失败引导全挤在一起）。
   - `game.js` 约 **1850** 行（主循环、修行、洞府、轮回、通用弹窗）。
   - `style.css` 约 **7287** 行。
   - 建议：按先前设想拆 `home-ui.js`、棋盘渲染/VFX、队伍弹窗；新玩法优先独立 IIFE，不要继续往 `stage-ui.js` 堆。

6. **主循环里的重复计算**
   - `requestAnimationFrame` 每帧都会调用 `getQiPerSec` / `getStonePerSec`（点击收益内部还会再算一次产率）以及 `updateHeaderAndMeditationUI`。养成未变化时可用脏标记缓存。

7. **手动维护 `?v=` 缓存版本号**（已落地脚本，见第 1 节补充）
   - 已提供 `tools/bump-version.js`：发版时 `node tools/bump-version.js --auto`（或传入明确版本号）即可把 `index.html` 里所有本地 css/js 的 `?v=`，以及洞府背景 `scene_*.webp?v=`（`index.html` / `js/game.js` 预加载列表 / `css/style.css`）统一成同一个值。合并冲突时先解决冲突标记，再重跑脚本（`--auto` 会取现有最高值 + 1）。`tools/version-consistency.test.js` 会检查 css/js 版本全部一致且不低于基准 128，并核对立府背景三处对齐。
   - 图标、立绘、敌人图等资源仍按单图维护自己的 `?v=`，不要用这条命令一刀切，以免无意义刷新缓存或打断按精确路径断言的测试。
   - 按文件哈希自动 bump 仍可作为后续增强（见下方 P2-1）。

8. **`tools/sim.js` 仍是简化公式副本**
   - 只加载 `config.js`，基础吐纳/洞府产出与生产代码同形，但缺少装备、称号、道果总量、章节加成、聚灵石等乘区，不能当正式平衡回归。

9. **引导连锁试算直接改活 state，再靠快照还原**
   - `newbie.js` 的 `estimateBreakChain` / `runBreakChain` 必须在活 `GameState` 上改 `qi`、`realmIndex`、功法洞府等字段，因为 `getQiPerSec`、`getGongfaCost`、`getCurrentStage`、`tribulationLock`、`getBreakthroughSuccessRate` 都读闭包里的当前档，不能对一份深拷贝调用。现在用 `SIM_KEYS` 快照 + `try/finally` 还原，并断言还原后 JSON 一致；漏记字段或中途抛错仍可能把试算写进存档。
   - 建议：改为对 `structuredClone` 后的副本跑，或在 `GameState` 上提供只读/可注入 state 的试算 API，让连锁估算不再改活档。

10. **`newbie.js` 已约 2000 行，引导连锁与机缘/目标条耦在同一 IIFE**
    - 连锁缓存、推荐优先、目标条、解锁卡、引导气泡都挤在 `newbie.js` 里，改缓存键或解锁顺序时容易误伤其它路径。
    - 建议：把连锁估算与缓存抽到独立的 `js/guide-chain.js`（读 `GameState` / `Equip`，由 `Newbie` 调用），`newbie.js` 只保留目标条、机缘卡与引导 UI。

### 2.3 低优先级（P2）

11. **没有存档导入/导出（Base64 备份码）**，清缓存即丢档。时钟回拨保护不完整（派遣已做回拨重计时，离线结算尚未钳制未来时间戳）。
12. **`state.stage.sweep` 仍只是预留字段**，没有扫荡玩法。
13. **d620701 已修：轮回深拷 idleEvents 并 ensureState；loadGame catch 补了 HomeFortune.ensure**
14. 存档仍明文、多标签互踩，见 [state-and-save.md 第 6 节](./state-and-save.md)。

---

## 3. 重构路线图

| 优先级 | 事项 | 涉及 | 建议 |
| :---: | :--- | :--- | :--- |
| P0-1 | 去掉技能双表与免费英雄硬编码 | `battle.js`、`state.js` | 单一 `HERO_SKILLS`；`mergeSave` 遍历未锁定英雄补发 |
| P0-2 | 统一 `squad` 数据源 | `state.js`、`battle.js`、`stage-ui.js` | 只保留 `state.squad` |
| P0-3 | 降低秘境首次测力开销 | `mijing.js`、`config.js` `MIJING` | 减模拟次数或异步化；保留签名缓存 |
| P1-1 | 派生数值脏标记缓存 | `state.js`、`equip.js` | 按养成版本号缓存产率与战力 |
| P1-2 | 拆分超大模块 | 新 `home-ui.js` 等 | 单文件控制在可维护规模，停止向 `stage-ui.js` 堆功能 |
| P1-3 | 存档导入导出与时间回拨保护 | `state.js`、设置弹窗 | Base64+校验；发现 `now < lastSaveTime` 时钳制计时字段 |
| P1-4 | `sim.js` 复用 `GameState` | `tools/sim.js` | 提供 `localStorage` 桩并加载 `state.js` |
| P1-5 | 连锁试算离开活 state | `newbie.js`、`state.js` | `structuredClone` 副本或只读试算 API，不再快照还原活档 |
| P1-6 | 抽出 `js/guide-chain.js` | `newbie.js` | 连锁估算与缓存独立成模块，引导 UI 留在 `newbie.js` |
| P2-1 | 按哈希自动 bump `?v=` 与 CI | `tools/bump-version.js`、`.github/workflows` | 发版脚本已落地（`--auto` / 指定版本号）；后续可改为按文件哈希，并在 Push 时跑全部 `tools/*.test.js` |

---

## 4. 新系统扩展指南

### 4.1 新增大境界

1. 在 `MAJOR_REALMS` 追加对象，并在 `LATE_REALM_QI_MULT` 追加对应倍率；`REALM_STAGES` 会自动展开「初/中/后」。
2. 若要绑定新天劫门禁，在 `TRIBULATION_GATES` 增加映射。
3. 可选：在修行页光环表与 CSS 中补视觉。
4. 用 `node tools/sim.js` 只做粗节奏检查，正式验收应看产率函数本身。

### 4.2 新增仙侣与绝技

1. **美术**（当前规范）：
   - 主立绘 / 海报：建议 `assets/hero_<id>_hd.jpg` 与 `assets/hero_<id>_poster.jpg`，**1080×1920**；
   - 头像：`assets/battle/avatars/<id>.webp`，**512×512**，并配置 `avatarPos` / `avatarScale`；
   - 不要再依赖已删除的 `@240`、`_cutout` 或 `assets/stage/vfx/`。
2. 在 `HERO_SKILLS` 与 `HEROES` 注册；复用现有 `kind` 可零战斗代码生效。新 `kind` 需改 `castUlt` 与 `StageUI` 表现，并补 `SkillTextData`、`HeroLinesData`、仙缘标签。
3. 默认解锁者在完成「自动补发」重构前，仍要在 `mergeSave` 里加 `grantFreeHero`。
4. 验证：`node tools/hero-roster.test.js`、`node tools/asset-refs.test.js`、`node tools/skill-text.test.js`，必要时补 `bond.test.js`。

### 4.3 新增玩法模块

推荐模式仍是 **Config + State 缺省/normalize + 独立 IIFE + 自挂载或由 game.js 注入钩子**：

1. 静态表放 `config.js` 或独立 `*-data.js`（图鉴、剧情、事件已采用后一种，避免继续撑大 `config.js`）。
2. 在 `mergeSave` / 轮回矩阵里明确：字段如何补齐、转世保留还是重置、会不会被用来刷每日次数。
3. UI 模块导出 `init` / `render` / `tick`，通过 `hooks` 或读写 `GameState.state` 通信；能自初始化的不要硬塞进 `game.js`。
4. 在 `index.html` 按依赖顺序加 `<script src="js/xxx.js?v=1">`（放在所依赖模块之后、如需被 `game.js` 调用则还要在它之前）。
5. 同步补 `tools/<系统>.test.js`：存档缺省、坏数据、轮回、UI 节点与资源引用。

不要把新玩法的全部 DOM 逻辑继续堆进已经超过 3000 行的 `stage-ui.js`，除非它只是闯关页上的一个入口按钮。
