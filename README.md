# RStellarScribe

**给《群星》(Stellaris) 模组开发 Agent 用的本地 MCP server + SKILL 包**，是
[RHoiScribe](https://github.com/czxieddan/RHoiScribe)（HOI4 同类工具）的群星移植版。

它解决的是同一个问题：Agent 写 Paradox 脚本时最常见的失败**不是报错，而是静默失效**——
本地化文件少了 BOM 就整份不被读取、脚本里写了个 4.1.7 并不存在的字段、定义键没有对应本地化
于是玩家看到原始 key、`00_` 前缀覆盖了 vanilla 文件导致连锁失效。RStellarScribe 把一套
**按 4.1.7 实机核对过的知识库**、**生成前可审阅的文件计划**和**针对静默失效的校验器**
放进一个零依赖的本地进程里。

## 环境要求

- **Node.js 20+**（开发与验证使用 v24.19.0）
- **零运行时依赖**：不需要 `npm install`，不需要 Rust，不需要联网

## 快速开始

```powershell
# 编译知识库：把 knowledge/**.md 编译成资源目录与内嵌快照
node scripts/build-knowledge.mjs

# 自检：354 项端到端断言
node scripts/selftest.mjs

# 协议自检：以子进程方式跑真实 stdio MCP 握手（22 项）
node scripts/protocol-test.mjs

# 启动 MCP server（stdio）
node src/index.mjs

# 打印 MCP 客户端配置
node src/index.mjs --print-client-config
```

配置示例（Claude Code / Cursor / Codex 等任何 MCP 客户端）：

```json
{
  "mcpServers": {
    "rstellariscribe": {
      "command": "node",
      "args": ["<clone>/src/index.mjs"]
    }
  }
}
```

不想配 MCP 时，可以用 SKILL 模式逐条调用（输出 JSON）：

```powershell
node src/index.mjs --skill list-tools
node src/index.mjs --skill read-resource "rstellariscribe://stellaris/knowledge/catalog"
node src/index.mjs --skill call-tool search_stellaris_knowledge '{\"query\":\"on_actions random_events\"}'
```

> **Windows PowerShell 5.1 注意**：它会改写原生程序参数里的双引号，`'{"query":"a b"}'` 会变成
> `{query:a b}`，而 `"{\"query\":\"a b\"}"` 会被**拆成三个参数**。上例的写法（外层单引号 +
> 内层反斜杠）已验证可用；嵌套参数请用 `--json-file args.json` 或 `-`（标准输入），两者在任何
> shell 下都可靠。解析器先试严格 JSON、再结构重扫，失败时会直接打印可用写法。

客户端接入细节见 [docs/client-setup.zh-CN.md](docs/client-setup.zh-CN.md)。

## 工具一览（48 个）

所有生成器默认 `dry_run = true`：先返回文件计划供你审阅，再显式 `dry_run = false` 加绝对
`output_root` 才落盘。路径一律是模组根相对路径，并且被限制在群星真正会读取的目录白名单内。

| 分组 | 工具 |
| :--- | :--- |
| 知识 | `search_stellaris_knowledge` |
| 工作区与状态 | `open_stellaris_workspace` · `get_stellaris_workspace_status` · `inspect_rststellariscribe_state` · `query_tool_logs` · `export_tool_logs` |
| 校验（只读） | `validate_stellaris_paths` · `validate_stellaris_localisation` · `validate_stellaris_file` · `validate_stellaris_project` · `generate_missing_localisation` · `scan_unique_identifiers` · `classify_error_log` · `explain_stellaris_diagnostic` · `format_paradox_script` |
| 素材注册 | `register_image_asset` · `validate_image_asset` · `register_audio_asset` · `validate_audio_asset` |
| 生成 | `setup_stellaris_mod_skeleton` · `generate_stellaris_mod_descriptor` · `generate_localisation_batch` · `generate_event_batch` · `generate_decision_batch` · `generate_civic_batch` · `generate_technology_batch` · `generate_tradition_batch` |
| 生成（内容子系统） | `generate_species_class_batch`（物种类别＋头像集＋类别＋授予特质）· `generate_name_list_batch`（命名组）· `generate_prescripted_empire`（预设帝国）· `generate_ship_size_batch`（舰船类型）· `generate_event_chain_batch`（事件链）· `generate_situation_batch`（局势）· `generate_tradition_tree`（传统树＋飞升天赋） |
| 编辑 | `edit_stellaris_script_file` |
| 环境与调试 | `discover_stellaris_environment` · `plan_stellaris_debug_run` · `validate_stellaris_debug_run` · `run_stellaris_debug_session` · `wait_for_stellaris_log_settle` |

### 素材注册（`register_*` / `validate_*`）

四个工具成对使用：`register_*` 默认 dry-run，`validate_*` 只读。两者都**不写二进制素材**——
贴图/音频必须已经放到位，工具读取它们的**真实文件头**（尺寸、像素格式、mip 数、是否有 alpha；
采样率、声道、位深、时长），然后写出**注册所需的文本**：

| 输入 | 产出 |
| :--- | :--- |
| 贴图（`.dds`/`.tga`/`.png`）＋ 精灵名 ＋ 用途 | 一个 `interface/<prefix>_gfx.gfx`，UTF-8 **无 BOM** |
| 音效（`.wav`）＋ 名字 | `sound/<prefix>/<prefix>_sound.asset`（可选 `soundeffect` 组、可选混音分组） |
| 音乐（`.ogg`）＋ 曲名 | `music/<prefix>_music.asset` ＋ `music/<prefix>_songs.txt` ＋ **带 BOM** 的 `localisation/<lang>/<prefix>_musicplayer_l_<lang>.yml` |

硬约束都来自实机测量（见知识库 [image-assets](resources/knowledge/stellaris/media/image-assets.toml) 与
[audio-assets](resources/knowledge/stellaris/media/audio-assets.toml)）：`spriteType` 不接受 `size`/`borderSize`
（8539 条记录里 0 次）；`progressBarType` 用 `textureFile1`/`textureFile2`；内联 `£token£` 图标必须命名
`GFX_text_<token>`；`sound`/`music` 的 `file` **相对 `.asset` 文件自己的目录**解析（5931 条里 4569 条只能这样解析）；
采样率必须是 44100 Hz（引擎自己会在 `error.log` 里逐曲报 `pdx_audiomusic_sdl.cpp:88`）。

**与 RHoiScribe 的 36 个工具一一对应关系**（含被替换的 CWT 语言服务类工具）见
[docs/porting-notes.zh-CN.md](docs/porting-notes.zh-CN.md)。

## 知识库（51 个主题）

资源 URI 与原项目同形：

| URI | 内容 |
| :--- | :--- |
| `rstellariscribe://stellaris/latest-update` | 本构建核对所依据的版本说明 |
| `rstellariscribe://stellaris/knowledge/catalog` | 全部主题的 TOML 索引 |
| `rstellariscribe://stellaris/knowledge/<topic_id>` | 单个主题的 Markdown |

分类：`structure`（4）· `localisation`（3）· `script`（10）· `content`（24）· `media`（5）· `debug`（5）。

**这些条目是按本机真实安装的 Stellaris 逐字段核对写成的**，不是照抄 Wiki。早期主题按 4.1.7 "Lyra"
核对，素材注册两篇（`image-assets` / `audio-assets`）按 4.4.6 "Pegasus"（`<Stellaris>`）重新实测。
核对过程推翻了若干流传很广的说法，例如：

- `common/custom_tooltips/` 不存在；`common/game_rules/` 没有 `default`/`setting`，`has_game_rule` 不是 4.1.7 语法
- `common/buildable_districts/`、`common/strike_craft/`、`common/event_modifiers/` 不存在；4.0 新增了 `common/zones/` 与 `common/zone_slots/`
- `common/archaeological_site_types/` 才是真实目录；考古遗址没有 `rewards` 字段
- 决议不需要 `decisions = { }` 包裹，行星决议就在 `common/decisions/`
- `is_repeatable` 在科技里、`major` 在事件里都是 0 次出现
- `common/name_lists/*.txt` 在 vanilla 里**带** BOM
- `spriteType` 不接受 `size`/`borderSize`（4.4.6 全安装 8539 条里 0 次）；`tileSpriteType`/`maskedShieldType` 在 4.4.6 里 **0 个块**，字段集无法实测
- `sound`/`music` 的 `file` 相对 **`.asset` 文件自己的目录**解析，不是相对 `sound/`（5931 条里 4569 条只能这样解析）
- `sound/` 只收 `.wav`、`music/` 只收 `.ogg`；`soundtrack/` 的 mp3/flac 是发行原声，引擎不加载
- 内联 `£token£` 图标的 sprite 必须叫 `GFX_text_<token>`：vanilla 为一个已有普通名字的贴图又写了一遍别名（`interface/astral_planes_resources.gfx:3` 与 `:13`）

每个主题的正文都附了依据（vanilla 文件路径、出现次数），无法证实的写进 `## 待确认`。

## 明确不做的事

- **不做 CWTools 校验**。群星没有公开的规则集，所以「某个触发器/修正名是否存在」只能由引擎日志判定。
  本工具帮你读日志（`classify_error_log` / `explain_stellaris_diagnostic`），不假装能替你保证。
- **不生成二进制素材**。`.dds` / `.tga` / `.mesh` / `.ogg` / 肖像必须由你提供。素材注册工具只读它们
  的文件头、写出注册用的文本（`.gfx` / `.asset` / `music/*.txt` / 音乐播放器 `.yml`），不会替你复制或转码。
- **不启动游戏**。`plan_stellaris_debug_run` 只打印命令行并核对 `dlc_load.json`。
- **不写入 `output_root` 之外的任何路径**，包括启动器的 `.mod` 文件——它把内容返回给你自己放。

## 头号静默坑：模组目录路径含非 ASCII 字符

**游戏不会挂载路径含非 ASCII 字符的本地模组。** 它会照读 `.mod` 描述文件（因此引擎甚至会为它报
`Invalid supported_version`），被算作"已启用"，然后**内容一个都不加载，且 `error.log` 里什么都不写**。

这在 Windows 用户名是中文时必然踩到：`C:\Users\钢木\Documents\Paradox Interactive\Stellaris\mod\<mod>`
下的**任何**本地模组都不会生效。4.4.6 实机对照验证（其余变量完全一致）：同一份模组放
`<mods>\<mod>` 会挂载，放回含中文的用户名路径下立刻静默失效。

正确布局是**内容放 ASCII 路径，Documents 里只留几行的启动器描述文件**：

```
<mods>\<mod>\                                   ← 全部内容
…\Documents\Paradox Interactive\Stellaris\mod\<mod>.mod    ← 只有 name/tags/supported_version/path
```

本插件已内置此检查：`validate_stellaris_project` 对非 ASCII 的模组根报 **error**，
写入时返回 `mount_warnings`，`validate_stellaris_debug_run` 报 `MOUNT BLOCKER`。
排查手法与判定表见知识库 [common-errors](resources/knowledge/stellaris/debug/common-errors.toml)。

## 目录结构

```
RStellarScribe/
├── knowledge/                 撰写源（Markdown + front matter），51 个主题 + updates/
├── resources/knowledge/stellaris/   编译产物：按 category 分组的规范 TOML（与 RHoiScribe schema 兼容）
├── src/
│   ├── index.mjs              CLI 与入口（MCP / --skill / --print-client-config）
│   ├── generated/knowledge.mjs      编译期内嵌快照（对应原项目 build.rs 的嵌入）
│   ├── lib/                   MCP 协议、知识库、路径安全、生成管线、Paradox 词法、本地化、工作区、工具日志、
│   │                          贴图/音频文件头读取、`.gfx` kind 字段契约、素材注册计划
│   └── tools/                 48 个工具的注册表与实现（全部带完整 JSON Schema）
├── scripts/                   build-knowledge · selftest · protocol-test
├── skill/SKILL.md             SKILL 包
└── docs/                      接入指南 · 移植说明 · 来源声明
```

## 验证状态

| 检查 | 结果 |
| :--- | :--- |
| `node scripts/selftest.mjs` | **363 / 363 通过**（上文 354 项，加 9 项 GAP-2/GAP-3 断言，见下节） |
| `node scripts/protocol-test.mjs` | **22 / 22 通过**（真实子进程 stdio 握手、tools/list、resources/read、prompts/get、dry-run 与真实落盘、`-32602` 映射、素材工具越界路径与非法参数映射、退出干净、stderr 无输出） |
| `node scripts/build-knowledge.mjs` | 51 个主题全部解析通过 |

素材注册的 77 项断言用「删掉功能看测试是否失败」验证过：移除 `.gfx` 字段契约（`spriteType` 的 `size` 拒绝）、
移除 44.1 kHz 规则、移除 `GFX_text_` 命名规则、把 `file` 改回按 `sound/` 根解析、让贴图头读取器不再返回尺寸，
分别让 1、4、1、4、3 条断言失败；每次变异后原文件都按 SHA-256 校验还原。变异脚本见 `.work/prove-tests-fail.mjs`，
测量脚本见 `.work/measure-*.mjs`（均只读安装目录，可在任意机器上重跑复现本文的计数）。

## 两个已补齐的静默缺陷类（GAP-2 / GAP-3）

### GAP-2：`validate_stellaris_script_signatures` 不查修饰键，也不查 `common/script_values/`

**缺陷。** 引擎对「不存在的修饰键」**不报错**：`common/static_modifiers/` 里写一个拼错的键，
该修饰符只是静默地什么都不做——没有日志、没有报错、效果凭空消失。同理，脚本值里
`divide = <拼错的名字>` 会被当作 0 求值；只有 `value = <名字>` 这种**当作操作符**的写法才会留下
一行 `unknown command 'value' ... will always be 0`。这两类都是「没有反馈」的缺陷，所以唯一的
防线是引擎自己生成的清单。

**规则（`src/lib/modifier-keys.mjs`，由 `src/tools/signature-checks.mjs` 调用）。**

1. `common/static_modifiers/*.txt` 里每个块内标量赋值，其键必须出现在
   `<用户数据>/logs/script_documentation/modifiers.log`（4.4.6 实测 48,555 个键）中，否则报
   `unknown-modifier-key`（warning），并给出最近的键名建议。
2. `common/script_values/*.txt` 里作为操作数被**具名引用**的名字（`value`/`add`/`subtract`/
   `multiply`/`divide`/`mod`/`min`/`max`/`mult`）必须能解析到：本工作区定义的脚本值、脚本用
   `which = <名字>` 写入过的变量、或引擎文档化的效果/触发器；否则报 `unknown-script-value`
   （warning，带 `file:line`）。

**刻意不报的写法**（否则规则不可用）：宏（`$MULT$`）、带点的作用域路径（`owner.num_x`）、
带 `:` 的限定引用（`value:...`）、纯数字与 `@变量`。严重级别是 warning 而非 error：合法名字集合
本质上是开放集合，规则报告的是「无法解析」，不宣称文件是坏的。

**验证（`<clone>\unga-fix\prove-rules.mjs`，每个用例都在全新进程里跑）。**

| 用例 | 结果 |
| :--- | :--- |
| 未改动的真实模组 | 5 条 finding，全是既有的 `is_fe_cluster` warning，0 条新规则 |
| 注入 `country_trust_zzz_impossible` 到 `static_modifiers` | 5 → **6**，`unknown-modifier-key`，`zz_geocentric_unga_modifiers.txt:41` |
| 同一次注入，**关掉规则** | 6 → 5，**0** 条提及 `zzz` |
| 注入 `divide = unga_zzz_impossible_value` | 5 → **6**，`unknown-script-value`，`zz_geocentric_unga_mech_values.txt:82` |
| 同一次注入，**关掉规则** | 6 → 5，**0** 条提及 `zzz` |

「关掉规则」是真的把规则代码从一份 mutant 检出里去掉、并在**独立进程**中重跑；早先在同一进程内
用 mutant 做对照会「通过」，原因是 ESM 按 URL 缓存模块——对照跑的根本不是 mutant。这一点写在
`prove-rules.mjs` 的头部，避免后来者重犯。

**`is_fe_cluster` 的差异已解释。** 不带 `game_root` 时它报 5 条 `unknown-script-name`，带上
`game_root` 后变 0——这不是假阳性，也不是配置 bug：`is_fe_cluster` 是基础游戏在
`common/scripted_triggers/00_scripted_triggers.txt` 等 3 个文件里定义的脚本触发器，
`openWorkspace(game_root)` 能索引到（基础游戏脚本触发器 1,821 个），模组自身当然没有。
所以 `game_root` 是**必要参数**而非可选优化：不给它，基础游戏定义的每个脚本效果/触发器
都会被误报。

**未确立。** 嵌套条件块（`modifier = { ... }` 或未命名的条件块）里标量的引擎精确读法没有实测：
`potential`/`allow`/`trigger`/`weight_modifier` 包装块会被跳过，而**裸写的**条件块与修饰赋值在
同一深度、形状相同，所以不被区分。vanilla 里这类名字都在 48,555 清单内，因此不产生 finding；
若某个模组在裸条件块里写了触发器名，会得到一条 warning（可解释、可忽略），不会漏掉真实缺陷。

### GAP-3：`defined_text` 被误报 42 条重复键

**缺陷。** `common/scripted_loc/*.txt` 的格式是每个函数一个
`defined_text = { name = Get... value = ... }` 块——vanilla 如此，本模组亦如此——而重复键检查
把**块关键字**当成了定义键，于是真实模组报了 42 条
`duplicate scripted_loc key \`defined_text\``。

**修复。** `src/lib/workspace.mjs` 增加 `REPEATABLE_SECTION_KEYS`（精确的 `<kind>:<key>` 对，
目前是 `scripted_loc:defined_text` 与 vanilla 同样重复的几个容器块关键字）与
`isRepeatableSectionKey()`；重复检查跳过这些键。刻意做成精确对而不是「凡是重复都放过」：
可重复是这个文件类型解析器的性质，普通类型里写两遍的键正是该检查要抓的重复。
`scripted_loc` 里真正唯一的约束是块**内**的 `name = "..."`。

**验证（`<clone>\unga-fix\prove-exemption.mjs`，原地改一份检出、`finally` 还原）。**

| 用例 | 结果 |
| :--- | :--- |
| 真实模组 | 0 条错误，0 条重复（3 个 `scripted_loc` 文件，43 个 `defined_text` 块） |
| **关掉豁免** | **42 条** `duplicate scripted_loc key \`defined_text\`` |
| 还原后 | 0 条错误 |

42 与缺陷报告里的计数一致，所以这条假阳性就是豁免缺失造成的，而不是别的原因。


## 许可

**AGPL-3.0-or-later**，见 [LICENSE](LICENSE)。本项目是 RHoiScribe 的衍生作品，
来源与复用范围见 [docs/rhoiscribe-attribution.md](docs/rhoiscribe-attribution.md)。
