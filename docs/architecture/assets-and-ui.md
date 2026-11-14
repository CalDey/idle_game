# 静态资源组织规范与 UI 布局适配方案

本文档基于 `assets/` 实测文件、[index.html](../../index.html)、[css/style.css](../../css/style.css) 与 `GameConfig.HEROES`，对照提交 **`851adfb`**。早期文档中的 `assets/stage/`、`icons/equip/`、`@240` 头像与 `_cutout` 棋子路径已经废弃。

---

## 1. 静态资源总览

`assets/` 下共 **271** 个文件，以 WebP 为主，立绘/海报为 JPG，站点图标为 PNG，另有 5 个 woff2 字体与 OFL 许可文本。缓存刷新仍靠 URL 查询参数 `?v=`。

```text
assets/
├── hero_*_hd.jpg / hero_*_poster.jpg   # 角色主立绘与海报（现用图多为 1080×1920）
├── battle/
│   ├── avatars/                        # 16 张自走棋/列表头像，512×512
│   ├── bg_region0..5.webp              # 6 大区域战场背景，1200×1600
│   └── frame_*.webp                    # 棋子框：player / leader / enemy / boss，256×256
├── enemies/                            # 30 Boss + 18 小怪 + placeholder.webp
├── beasts/                             # 三只灵兽全身 384×384、头像 128×128
├── fonts/                              # MaShanZheng-*.woff2 与 OFL.txt
├── icons/                              # 导航、资源、功法、洞府、天赋、空槽、UI
│   ├── gear/                           # 6 部位 × 6 品质 = 36 张 256×256（无 @128）
│   └── tree/                           # 6 阶桃树 256×256 + @128
└── home/                               # scene_base.webp + 12 张建筑进阶补丁 p_*_{xuan,xian}.webp
```

---

## 2. 分类规范

### 2.1 角色立绘与头像

`GameConfig.HEROES` 共 **16** 名角色。每名角色现在主要使用两类图：

1. **主立绘 `hero.img` / 海报 `hero.poster`**：修行页舞台与大招演出。现用文件多为 **1080×1920** JPG。
2. **头像 `hero.avatar`**：统一为 `assets/battle/avatars/<id>.webp`，实测 **512×512**。用于更换角色、出战队伍、羁绊行等。已不再配置 `@240` 缩略图或 `_cutout` 透明棋子；棋盘单位直接用头像（加 `frame_*.webp` 框）。

聚焦仍可通过 `avatarPos` / `avatarScale`（以及修行页相关 CSS 变量）校准。

| ID | 名称 | 品质 | 当前主立绘 | 头像 |
| :--- | :--- | :---: | :--- | :--- |
| `lanyi` | 清冷剑仙 | 仙 | `assets/hero_v21_new_hd.jpg` | `assets/battle/avatars/lanyi.webp` |
| `cloak` | 魔灵光 | 仙 | `assets/hero_mlg_dawn_hd.jpg` | `assets/battle/avatars/cloak.webp` |
| `saintess` | 圣王女 | 天 | `assets/hero_saintess_v4b_hd.jpg` | `assets/battle/avatars/saintess.webp` |
| `miko` | 灼樱巫女 | 地 | `assets/hero_miko_dawn_hd.jpg` | `assets/battle/avatars/miko.webp` |
| `shuanghua` | 霜华玉仙 | 天 | `assets/hero_shuanghua_hd.jpg` | `assets/battle/avatars/shuanghua.webp` |
| `sweetmaid` | 甜心女仆 | 玄 | `assets/hero_sweetmaid_hd.jpg` | `assets/battle/avatars/sweetmaid.webp` |
| `jianghua` | 绛华倾城 | 地 | `assets/hero_jianghua_hd.jpg` | `assets/battle/avatars/jianghua.webp` |
| `qingkui` | 晴葵灵姬 | 天 | `assets/hero_qingkui_hd.jpg` | `assets/battle/avatars/qingkui.webp` |
| `yueshi` | 月誓灵姝 | 天 | `assets/hero_yueshi_hd.jpg` | `assets/battle/avatars/yueshi.webp` |
| `ziling` | 紫绫影姬 | 地 | `assets/hero_ziling_hd.jpg` | `assets/battle/avatars/ziling.webp` |
| `honglian` | 红莲妖姬 | 地 | `assets/hero_honglian_hd.jpg` | `assets/battle/avatars/honglian.webp` |
| `molan` | 墨兰执事 | 玄 | `assets/hero_molan_hd.jpg` | `assets/battle/avatars/molan.webp` |
| `qinglan` | 晴岚游侠 | 玄 | `assets/hero_qinglan_hd.jpg` | `assets/battle/avatars/qinglan.webp` |
| `fenxiao` | 焚霄炎姬 | 仙 | `assets/hero_fenxiao_hd.jpg` | `assets/battle/avatars/fenxiao.webp` |
| `shuangchen` | 霜宸冰璃 | 仙 | `assets/hero_shuangchen_hd.jpg` | `assets/battle/avatars/shuangchen.webp` |
| `youming` | 幽冥鬼后 | 仙 | `assets/hero_youming_hd.jpg` | `assets/battle/avatars/youming.webp` |

仓库里仍留有一些未再被配置引用的历史文件（如 `hero_cloak_hd.jpg`、`hero_saintess_hd.jpg`、`hero_dawn_hd.jpg`、`hero_j_hd.jpg`，部分为 1080×1440），接入新角色时不要误用。

**已不再使用** `assets/stage/vfx/` 大招特效贴图；绝技演出以立绘、CSS/DOM 效果与台词为主。

### 2.2 战场背景与敌人

1. **区域背景**：`assets/battle/bg_region0.webp` … `bg_region5.webp`（注意文件名是 `bg_region0`，中间没有下划线再加数字前的第二道下划线）。实测 **1200×1600**。由 CSS 根据 `#battle-stage[data-region]` 切换。
2. **敌人**：`assets/enemies/`。Boss 文件名按 id，如 `boss_heifeng.webp`、`boss_rongyan.webp`、`boss_beiming.webp`（北**溟**鲲影）、`boss_jiuyou.webp`。小怪为 `mob_*.webp`。另有 `placeholder.webp`。
   - 48 张角色/敌人图实测约 **600×804**，`placeholder.webp` 为 **600×800**。
   - 已无 `@256` 双分辨率目录；解析路径不再指向 `assets/stage/enemies/`。

### 2.3 图标、仙桃树、字体与灵兽

| 类别 | 路径与命名 | 数量与尺寸 | 引用 |
| :--- | :--- | :--- | :--- |
| 法宝图标 | `assets/icons/gear/<slot>_<quality>.webp` | 36 张，256×256（无单独 @128） | `gear.js` |
| 仙桃树 | `assets/icons/tree/tree_<fan…xian>.webp` 与 `@128` | 6+6，256 / 128 | 法宝页桃树 |
| 通用图标 | `assets/icons/` 下 `nav_` / `res_` / `gf_` / `df_` / `tl_` / `slot_` / `ui_` 等 | 多为 64 与 128 成对；`ui_idle_chest` 等少量例外 | 顶栏、导航、列表 |
| 站点图标 | `favicon-32.png` / `apple-touch-icon.png` / `app_icon_192.png` / `app_icon_512.webp` | 32 / 180 / 192 / 512 | `index.html` `<head>` |
| 字体 | `assets/fonts/MaShanZheng-*.woff2`（AnHei / Nav / Realm / Role / Title）+ `OFL.txt` | 5 个子集字体 | 标题、导航、境界、角色名 |
| 灵兽 | `assets/beasts/beast_{xuanhu,shoushanlin,jinwu}.webp` 与 `*_avatar.webp` | 全身 384×384，头像 128×128 | 灵兽弹窗与仙缘行 |

### 2.4 洞府场景（`assets/home/`）

洞府仍是多层景观，但资源已简化：

| 资源 | 路径 | 实测尺寸 | 说明 |
| :--- | :--- | :--- | :--- |
| 主场景底图 | `assets/home/scene_base.webp` | **1080×1935**（竖图，不再是 1600×900 的 `bg_fan/xuan/xian` 三套底） | `#home-bg` |
| 建筑进阶补丁 | `assets/home/p_<建筑id>_xuan.webp` / `p_<建筑id>_xian.webp` | 随岛屿裁剪，约 320×292 至 561×752 | 玄/仙阶外观；凡阶用底图本身，没有 `b_*_fan.webp` 十八张本体图 |
| 升级特效 | 已不再附带 `fx_upgrade_burst.webp` / `fx_cloud_256.webp` | — | 揭晓主要靠 CSS |

`renderHomeScene()` / `layoutHomeStage()` 仍按容器做 cover 裁切，使岛屿在竖屏居中。灵泉、聚灵石等坐标仍来自 `HOME_SCENE`。

---

## 3. UI 布局与适配

### 3.1 单页容器

结构仍是 `100dvh` + `.app-container`（`max-width: 480px`）锁定单屏：

```text
body
└── .app-container
    ├── header.top-header     # 标题、境界胶囊、机缘、每日功课、日志、设置
    ├── .goal-strip           # 常驻「当前目标」卷轴条（Newbie，深底金字，纯 CSS）
    ├── main.main-content
    │   ├── .resource-grid    # 灵气 / 灵石 / 道果（闯关页会隐藏以腾棋盘）
    │   ├── #tab-cultivate    # 修行：立绘、伴生灵兽入口、突破
    │   ├── #tab-gear         # 法宝
    │   ├── #tab-stage        # 闯关：章节短名、棋盘、秘境/镇妖塔入口、羁绊、挂机
    │   ├── #tab-upgrades     # 洞府：场景、升级、派遣、洞府机缘
    │   └── #tab-reincarnate  # 轮回
    └── nav.bottom-nav        # 五行：修行 / 法宝 / 闯关 / 洞府 / 轮回（带红点）
```

顶栏在日志、设置之外增加了「机缘」与「每日功课」。设置弹窗含赏玩立绘模式、背景音乐/音效开关（默认关）、手动保存与重置。

### 3.2 模态弹窗

早期「10 个弹窗」已经不够。当前 `index.html` 中的主要 backdrop / overlay 包括（按出现顺序，不穷尽每一个内部层）：

- `#log-modal`、`#role-modal`、`#squad-modal`
- `#mijing-modal`、`#settings-modal`、`#story-modal`、`#unlock-modal`、`#break-tip-modal`
- `#offline-modal`、`#confirm-modal`、`#compare-modal`、`#item-modal`、`#title-modal`
- `#codex-modal`、`#beast-modal`、`#dispatch-modal`、`#home-fortune-modal`、`#idle-event-modal`
- `#tower-modal`、`#grow-modal`、`#daily-modal`、`#home-upgrade-modal`
- 另有战斗内 `#battle-ult-overlay`、`#battle-result-overlay`

多数弹窗支持 Esc 与点击遮罩关闭（Newbie 统一接入，含派遣关闭按钮）。

### 3.3 自适应

1. **棋盘**：仍是 6×8，`layoutBoard()` 按父容器取 `cellSize = max(24, floor(min(availW/6, availH/8)))`，写入 `--cell-size`。
2. **洞府**：按容器对 `scene_base` 做 cover 居中（底图已改为竖图，实现细节以 `layoutHomeStage` 为准）。
3. **短屏与安全区**：`100dvh` + `env(safe-area-inset-bottom)`，以及针对较矮屏幕的 `@media` 收紧间距。
4. **防缩放**：`no-zoom.js` + 适当的 viewport 设置。
