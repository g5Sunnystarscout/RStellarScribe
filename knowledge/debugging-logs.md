---
id: debugging-logs
category: debug
title: Logs and Debugging
title_zh: 日志与调试
file_types: [logs/*.log, descriptor.mod, logs/script_documentation/*.log]
tags: [error.log, game.log, debug_mode, log, logall, script_documentation]
related: [common-errors, validation-cwtools]
sources: [https://stellaris.paradoxwikis.com/Modding_tutorial, https://stellaris.paradoxwikis.com/Console_commands, https://stellaris.paradoxwikis.com/Localisation_modding, https://stellaris.paradoxwikis.com/Interface_modding]
verified_version: "Modding_tutorial 页示例 v3.13；Console_commands 页 4.4"
---

## 概要

排查模组问题的第一步永远是**看日志**，而不是猜。日志位置就在 mod 文件夹旁边。默认日志对重复内容有去重行为（只记录第一次），所以"只看到一条错误"不代表只出错一次。开启 `-debug_mode` 与 `-logall` 能显著提高信息量；`logs/script_documentation/` 下由游戏导出的脚本文档是**自查合法触发器/效果/本地化指令最权威的一手资料**，比任何第三方列表都贴合当前版本。

## 文件位置与命名

日志目录：

| 操作系统 | 路径 |
| --- | --- |
| Windows | `…\Documents\Paradox Interactive\Stellaris\logs` |
| Linux | `~/.local/share/Paradox Interactive/Stellaris/logs` |
| Mac OS | `~/Documents/Paradox Interactive/Stellaris/logs` |

模组目录（与 logs 同级）：Windows `…\Documents\Paradox Interactive\Stellaris\mod`；Linux `~/.local/share/Paradox Interactive/Stellaris/mod`；Mac OS `~/Documents/Paradox Interactive/Stellaris/mod`。Steam 创意工坊模组放在 `…\SteamLibrary\SteamApps\workshop\content\281990`（以工坊 ID 命名）；Paradox Mods 的放在 mod 目录下，命名为 `PDX_<MOD_ID>`。

关键日志文件：

- `error.log`：**执行与加载错误**。模组加载失败、键冲突、脚本错误首先看这里。
- `game.log`：运行时输出，`log` 效果的写在这里。
- `system.log`：系统/引擎信息。
- `logs/script_documentation/*.log`：游戏导出的脚本文档。已确认存在 `localizations.log`（全部可用的本地化命令/作用域命令），同目录还有触发器、效果等文档。这是自查"某个字段名到底存不存在"的首选依据。

## 语法与字段

启动参数（加在 `stellaris.exe` 命令行后）：

```text
-script_debug    官方标注 (Can ignore)
-debug_mode      额外日志输出
-debugtooltip    进入首个游戏时自动启用 debugtooltip
-logprefix       给每个日志文件名加上指定前缀
-logpostfix      给每个日志文件名加上指定后缀
-logall          日志不再跳过重复字符串值
```

`log` 效果——最常用的脚本调试手段，**所有作用域**均支持：

```pdx
country_event = {
	id = my_mod_debug.1
	is_triggered_only = yes

	immediate = {
		log = "my_mod: debug event fired"
		log = "my_mod: scope name = [This.GetName]"
	}
}
```

注意两点：`log` 消息默认**只记录首次出现的相同内容**，循环里反复打同一句只会看到一条；在 scripted effect / scripted trigger 中要写 `log = \[This.GetName]`（多一个反斜杠），否则会出问题。

常用控制台命令（非铁人存档，按 `~` 或 `Shift+2` 等键打开，视键盘布局而定）：

| 命令 | 用途 |
| --- | --- |
| `reload text` | 重载本地化表 |
| `switchlanguage l_english` | 切换语言并重载本地化表 |
| `toggle_string_id` | 显示 StringID 而非本地化文本（找缺失 key 极有用） |
| `reload <file>.gui` | 热重载 `.gui`（**仅 `.gui`**） |
| `reload texture all` | 重载 `.gfx` 引用的贴图（改分辨率仍需重启） |
| `guibounds` | 显示鼠标所指 UI 元素来自哪个文件 |
| `debugtooltip` | 扩展 tooltip 信息，并可用 `CTRL+ALT+右键` 打开对应 GUI 文件 |
| `error` | 显示日志中的错误 |
| `trigger_docs` | 打印触发器与效果的文档 |
| `eventstats` / `eventscopes` | 事件统计 / 打印当前事件的 scope 树 |
| `debug_dumpevents` | 打印已触发的事件 |
| `script_profiler` | 跑一次开始、再跑一次结束并输出结果，用来定位性能问题 |
| `observe` | 切换到观察者模式（`play` 可切回） |
| `research_all_technologies [1] [数量]` | 瞬间研究全部非可重复科技；加 `1` 连太空生物/危机科技也算 |
| `research_technology <tech_key>` | 瞬间研究指定科技 |
| `effect <effect>` | 执行一段效果脚本 |
| `trigger <脚本名>` | 测试放在 `…\Stellaris\` 下的触发脚本 |
| `run <文件名>.ini` | 批量执行命令文件 |
| `help` / `help <命令>` | 查看命令列表 / 单条命令说明 |

使用任何控制台命令都会**禁用成就**。

## 校验要点

1. 改完模组先看 `error.log` 的**文件尾部**（最新错误在末尾），再往前追。
2. 找不到字段名时，直接查 `logs/script_documentation/localizations.log`，不要依赖记忆或第三方列表。
3. 加 `-debug_mode -logall` 复现问题；`-logprefix` 方便把本次运行的日志和旧日志区分开。
4. 用 `-logpostfix` 而不是手工改日志文件名，避免覆盖历史。
5. 本地化改动用 `reload text`，语言切换用 `switchlanguage`；找不到 key 就开 `toggle_string_id`。
6. `descriptor.mod` / `<mod>.mod` 里 `supported_version` 只影响启动器显示与警告，**不影响代码加载**；但用通配符（如 `v3.13.*`）时启动器仍会在 `error.log` 里写一条提示，属于噪音，不是真错误。
7. 游戏会拒绝加载同时存在**本地与创意工坊订阅**的同一个模组——排查"改了却没生效"时先确认不是这种冲突。

## 常见错误

- 只盯着 `error.log` 而不知道 `log` 效果没输出——因为默认去重，加 `-logall` 再看。
- 用 `reload texture all` 期望分辨率改动生效 → 必须重启。
- 期望 `reload` 重载 `.gfx` 或脚本 → `reload` 对 `.gui` 最可靠。
- 在 `log` 里写了方括号 loc 命令但没转义 → 在 scripted effect/trigger 中行为异常。
- 把 `error.log` 里 `supported_version` 的通配符警告当成致命错误。
- 编辑了 Steam 安装目录下的 vanilla 文件 → 被更新覆盖，且不会出现在自己的模组里。

## 待确认

- `system.log` 的实际角色与字段格式：Modding_tutorial 页明确列出 `game.log` 与 `error.log`，`system.log` 由用户提及，未在官方页面核实其存在与用途。
- `logs/script_documentation/` 下除 `localizations.log` 外的具体文件名（如 `triggers.log`、`effects.log`）未在 Stellaris 官方页面逐一确认；CWTools 文档提到"在 CK3、Imperator 和 Stellaris 中使用游戏生成的 script docs，例如 `triggers.log` 用于生成触发器可用的作用域"，可作旁证但非 Stellaris 官方页面。
- `-logprefix` / `-logpostfix` 的参数拼接格式（是否需要引号、前缀与文件名之间是否自动加分号）未验证。
- 控制台命令是否存在逐版本差异（如 `add_pops` 参数顺序在页面示例中为 `[species id] [amount]`）未逐条核实。

## 参考

- [Modding tutorial — Logs & Debugging（EXE parameters / log effect / game.log & error.log）](https://stellaris.paradoxwikis.com/Modding_tutorial)
- [Console commands](https://stellaris.paradoxwikis.com/Console_commands)
- [Localisation modding（reload text / switchlanguage / toggle_string_id）](https://stellaris.paradoxwikis.com/Localisation_modding)
- [Interface modding（reload / guibounds / debugtooltip）](https://stellaris.paradoxwikis.com/Interface_modding)
- [Modding（模组与日志目录、工坊路径）](https://stellaris.paradoxwikis.com/Modding)
