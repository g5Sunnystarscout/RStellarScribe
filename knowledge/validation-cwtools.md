---
id: validation-cwtools
category: debug
title: Validation with CWTools and Manual Checks
title_zh: CWTools 校验与人工校验
file_types: [.cwtools/**/*.cwt, .vscode/settings.json, common/**/*.txt, localisation/*.yml]
tags: [CWTools, cwtools-vscode, paradox-syntax, cwt, validation, missing-localisation]
related: [common-errors, debugging-logs, gui-files]
sources: [https://marketplace.visualstudio.com/items?itemName=tboby.cwtools-vscode, https://github-wiki-see.page/m/cwtools/cwtools/wiki/.cwt-config-file-guidance, https://github.com/cwtools/cwtools-stellaris-config, https://stellaris.paradoxwikis.com/Modding_tutorial]
verified_version: "cwtools-vscode 0.10.31（市场页当前版本）；.cwt 指南最后修改 2022-11"
---

## 概要

CWTools 是 VS Code 扩展 `tboby.cwtools-vscode`，为 Clausewitz 脚本提供语言服务：即时语法错误、自动补全、悬停文档、作用域检查，以及**生成缺失本地化 `.yml`**。官方市场页有明确免责声明：扩展仍是 preview，"它可能不工作，也可能随时停止工作。**务必备份你的模组文件。**" 因此把 CWTools 当作**辅助**而非门禁；它跑不起来时，下面的人工校验清单仍然必须掌握。

真正承载"规则"的是 `.cwt` 文件（不是 JSON 配置）。规则来源是各游戏的 config 仓库，Stellaris 对应 `cwtools/cwtools-stellaris-config`（旧地址 `corsairmarks/cwtools-stellaris-config`），扩展会随版本内置/使用它。

## 文件位置与命名

| 内容 | 位置 | 说明 |
| --- | --- | --- |
| 游戏规则（type/enum/alias/scope/links） | 各游戏 config 仓库的 `.cwt` 文件 | 由 CWTools 维护，随扩展提供；一般不需要自己写 |
| **自定义规则** | 在 VS Code 中打开的工作区根目录下的 **`.cwtools`** 文件夹 | 官方 `.cwt` 指南原文："To use custom `.cwt` files place them in a folder called `.cwtools` in the folder you open in vscode (The root of your mod folder)." |
| 游戏生成的一手文档 | `logs/script_documentation/`（如 `localizations.log`） | `.cwt` 指南明确：CK3、Imperator 与 **Stellaris** 会使用游戏生成的 "script docs"，例如 `triggers.log` 用于生成触发器可用的作用域 |

## 语法与字段

使用步骤（市场页原文要点）：

1. 安装扩展（`ext install tboby.cwtools-vscode`）。
2. **直接打开模组文件夹**，且它应位于包含游戏名的目录内，例如
   `C:\Users\name\Documents\Paradox Interactive\Stellaris\mod\your_mod`。
3. 按提示选择 vanilla（游戏安装）目录。
4. 正常编辑文件；出错时会出现语法错误提示。
5. 等待最多约一分钟，扩展会扫描模组并给出错误。

多模组：用 VS Code 的 multi-root workspace（"File → Add folder to workspace"）依次加入，CWTools 会按正确的模组加载顺序把多个模组与 vanilla 一起纳入上下文。查看 vanilla 文件可用资源管理器里的 **"CWTOOLS LOADED FILES"** 区块。

`Paradox Syntax Highlighting`（`tboby.paradox-syntax`）是同作者的**语法高亮**扩展，只负责着色让代码易读，不做语义校验；Modding_tutorial 建议与 CWTools 一起安装。两个扩展都不需要额外配置。

`.cwt` 文件的注释语义（这是 `.cwt` 最容易记错的部分）：

- `#` 普通注释，完全忽略。
- `##` **选项**，如 `## cardinality = 0..1`。
- `###` **文档**，显示在补全提示里。

最小可用的自定义规则示例（仅示意语法，真实规则请以 stellaris-config 为准）：

```cwt
# <mod>/.cwtools/my_mod.cwt
types = {
	type[my_mod_thing] = {
		path = "game/common/my_mod_things"
		name_field = "name"
		localisation = {
			name = "$"
			### 该类型的主要显示文本
			## primary
			description = "$_desc"
			## required
			required = "$_required"
		}
	}
}

my_mod_thing = {
	## cardinality = 0..1
	### 基础花费
	cost = int

	## cardinality = 0..1
	weight = float[-5.0..100.0]

	## cardinality = 0..100
	prerequisites = {
		<technology>
	}

	class = enum[shipsize_class]
}
```

常用右侧类型（官方 `.cwt` 指南）：`bool`、`int`、`int[-5..100]`、`float`、`scalar`（任意字符串）、`percentage_field`、`localisation`、`localisation_synced`、`localisation_inline`、`filepath`、`filepath[prefix/]`、`filepath[prefix/,.ext]`、`icon[gfx/interface/ships]`、`date_field`、`<type_key>`（引用某 type 的名字）、`enum[key]`、`scope[key]`、`scope_field`、`variable_field`、`int_variable_field`、`alias_keys_field[trigger]`。

常用 `##` 选项：`cardinality = min..max`（`~` 前缀表示低于下限只报警告）、`push_scope`、`replace_scope`、`scope`、`severity`。另有 `single_alias[...]` 复用规则段、`value_set[key]`/`value[key]` 用于"由使用处定义取值"的字段。

CWTools 的校验能力（市场页原文列举，直接对应我们的排错需求）：必填本地化键是否已定义、效果/触发器/修正是否存在、它们的作用域上下文、scripted effect/trigger 的用法、weights/`ai_chance` 等条目的正确性、`event_target` 是否先保存后使用、**被引用的 sprite 与图形文件是否存在**。

## 校验要点

- **先确认扩展真的在跑**：状态栏/输出面板应能看到 CWTools 的语言服务活动；"CWTOOLS LOADED FILES" 里应同时包含你的模组与 vanilla。只加载了模组没加载 vanilla，绝大多数跨文件校验会失效或误报。
- **错误要看"来源"**：CWTools 报的 `Unknown key` 可能是它自己的规则版本落后于游戏版本，而非你的代码错。用 `logs/script_documentation/` 与 vanilla 源码复核。
- **生成缺失本地化**：市场页的 "Code actions to generate .yml for missing localisation"；Modding_tutorial 里的操作路径是**右键 → Command Palette → Generate missing loc for all files**。
- 格式化整个文件：右键 → Format Document；批量注释：Command Palette → Toggle Line Comment。
- **了解盲区**：CWTools 是针对 `common/`、`interface/`、`events/` 的校验器（市场页原文 "validators for common, interface, and events"）。它**不能**替你验证渲染结果、覆盖顺序（LIOS/FIOS）与本地化的 BOM 编码——这些必须靠人工清单与游戏内验证。

## 常见错误

使用 CWTools 时的典型误判，以及没有 CWTools 时的**人工校验清单**（按性价比排序）：

**CWTools 误判与陷阱**

1. 只加载了模组、没加载 vanilla → 跨文件校验大面积失效或误报。检查 "CWTOOLS LOADED FILES"。
2. 把 `Unknown key` 一律当成自己的错 → 可能是扩展内置规则落后于游戏版本。用 `logs/script_documentation/` 与 vanilla 源码复核后再改代码。
3. 以为扩展能验证渲染结果、覆盖顺序（LIOS/FIOS）或 `.yml` 的 BOM 编码 → 它不能，这些必须人工核对并在游戏内验证。
4. 未先备份就依赖扩展的自动格式化/生成 → 市场页明确要求"务必备份"。

**人工校验清单（没有 CWTools 时）**

1. **编码逐文件确认**：`.yml` = UTF-8 **with BOM**；`.gfx` / `.txt` / `.asset` = UTF-8 **无 BOM**。Notepad++ 看 `Encoding` 菜单；VS Code 看右下角编码并"Save with Encoding"。这是最高频的静默失效原因。
2. **括号配平**：用编辑器的括号高亮与代码折叠。能折叠到底说明该层完整；折叠不到底就是缺 `}`。vanilla 用 **1 个 Tab** 缩进，按缩进层次反查是有效的土办法。
3. **本地化键覆盖**：把脚本里出现的所有 key（事件 id、`name`/`desc`/`tooltip` 引用的 key、`custom_tooltip`、`buttonText`、`text`）导出成清单，与 `.yml` 中的 key 做差集。可先用 `toggle_string_id` 在游戏内直接看哪些是 raw key。
4. **文件名后缀与首行**：`.yml` 必须以 `_l_<language>` 结尾，首行必须是 `l_<language>:`，每个条目行以空白开头。
5. **键名存在性**：对每个效果/触发器/修正，去 `logs/script_documentation/` 或 vanilla 源码里搜一次。**不要凭记忆写字段名**，也不要相信第三方列表的版本。
6. **作用域合法性**：确认当前作用域能使用该效果/触发器。事件类型（`country_event` / `planet_event` / `fleet_event` 等）决定了初始作用域；用 `log` 与 `eventscopes` 打印 scope 树验证。
7. **覆盖顺序与命名冲突**：`grep` 整个模组找重复 key；确认没有复用 vanilla 文件名（尤其 `00_` 前缀）；跨模组冲突用 `dependencies` 或 Irony Mod Manager 的冲突求解查看。
8. **视觉资源可解析**：所有 `spriteType` / `quadTextureSprite` / `icon` 引用的名字都在某个 `.gfx` 中定义过，且 `texturefile` 指向的文件真实存在、大小写一致。
9. **游戏内验证**：`-debug_mode -logall` 启动，进游戏后依次用 `reload text`、`reload <file>.gui`、`guibounds`、`debugtooltip` 检查；最后读 `error.log` 尾部。

## 待确认

- **配置文件文件名**：用户提示的 `.cwtools-config` / `cwtools.config` **未能核实**。可核实的是：**规则**用 `.cwt` 文件，放在工作区根的 `.cwtools` 文件夹；工作区设置由扩展的引导流程（"按提示选择 vanilla 目录"）写入 VS Code settings。本机 raw.githubusercontent/部分镜像不可达，未能取得扩展 `package.json` 中的确切 `cwtools.*` 设置 id，**请不要在文章或工具里假定某个具体 JSON 配置文件名**。
- `.cwtools-config` 是否存在、其顶层键（`rules`、`localisation`、`vanilla`、`cache`、`log_level` 等）均**未验证**。
- 扩展是否需要独立的语言服务进程/守护程序、是否有独立 CLI、是否要求游戏正在运行：**未确认**。
- 顶层规则块的写法：`.cwt` 指南的示例里类型规则以 `ship_size = { ... }` 这种**同名顶层块**出现（而非包在某个 `rules` 键下），但 cwtools-vscode 的"用户配置文件"是否也用同名顶层块，**未验证**。
- `cwtools-stellaris-config` 的当前归属：搜索结果显示 `cwtools/cwtools-stellaris-config` 与 `corsairmarks/cwtools-stellaris-config` 两个地址（后者描述为 ".cwt config files for Stellaris"）。哪个是当前权威仓库、是否有 Steam 创意工坊版本的 config 模组，**未确认**。
- CWTools 对 `interface/*.gui` 与 `interface/*.gfx` 的具体校验覆盖范围（市场页只说 general 的 "interface" validators），以及能否理解 `replace_path`，**未逐一确认**。但它确实包含"被引用 sprite 与图形文件是否存在"的校验。
- Paradox Syntax Highlighting 的仓库地址与是否需要配置：市场页与 Modding_tutorial 只说与 CWTools 搭配安装，**未取得其独立文档**。
- `.cwt` 指南中 `game/common/...` 这样的 `path` 前缀写法是针对 cwtools 的独立工具模式还是 vscode 模式，**未确认**。

## 参考

- [CWTools – Paradox Language Services（VS Code Marketplace，含功能清单与使用步骤）](https://marketplace.visualstudio.com/items?itemName=tboby.cwtools-vscode)
- [.cwt config file guidance（cwtools GitHub Wiki 镜像）](https://github-wiki-see.page/m/cwtools/cwtools/wiki/.cwt-config-file-guidance)
- [cwtools/cwtools-stellaris-config](https://github.com/cwtools/cwtools-stellaris-config)
- [Stellaris Modding tutorial — Setting up CWTools](https://stellaris.paradoxwikis.com/Modding_tutorial)
