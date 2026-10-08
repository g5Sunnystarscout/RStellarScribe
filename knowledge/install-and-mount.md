---
id: install-and-mount
category: debug
title: Installing a Local Mod, and Proving It Loaded
title_zh: 本地模组安装与"它到底加载了没"的判定
file_types: [descriptor.mod, modname.mod, dlc_load.json, logs/error.log]
tags: [non-ascii-path, dlc_load, launcher-owned, mount-probe, supported_version, silent-failure]
related: [mod-structure, mod-metadata, common-errors, debugging-logs]
sources: [https://stellaris.paradoxwikis.com/Modding, https://stellaris.paradoxwikis.com/Modding_tutorial]
verified_version: "Pegasus 4.4.6 实机对照实验（本机 4.1.7 与 4.4.6 双安装）"
---

## 概要

模组"装上了但没效果"有两大类原因，**外观完全一样**：一类是内容写错，一类是**模组根本没被挂载**。第二类尤其恶劣，因为它**不写任何日志**。本条目记录的是实机对照实验得出的判定方法，不是推测。

**排查顺序：先证明"加载了没"，再怀疑脚本写法。** 顺序颠倒会浪费几个小时去改一份根本没被读取的文件。

## 一、非 ASCII 路径 = 静默不挂载（最高优先级）

**Stellaris 不会挂载路径含非 ASCII 字符的本地模组。** 具体表现：

- 引擎**会**读取 `<mod>.mod` 描述文件（因此它甚至能为这个模组报 `Invalid supported_version in file: mod/<mod>.mod`）；
- 它被算作"已启用"；
- **内容一个都不加载**；
- `error.log` 里**没有任何相关记录**。

这在 Windows 用户名是中文时必然踩到：`C:\Users\<中文名>\Documents\Paradox Interactive\Stellaris\mod\<mod>` 下的**任何**本地模组都不生效。

### 对照实验（4.4.6，其余变量完全一致）

| 模组内容位置 | `error.log` 里的挂载探针 | 是否挂载 |
| :--- | :--- | :--- |
| `<mods>\<mod>` | `Object with key: storm_map_mode already exists, using the one at file: common/map_modes/zz_zz_mount_probe.txt` | **是** |
| `C:\Users\<非ASCII>\Documents\Paradox Interactive\Stellaris\mod\<mod>` | 无 | **否** |

### 正确布局

```
<mods>\<mod>\                                    ← 全部内容，路径纯 ASCII
…\Documents\Paradox Interactive\Stellaris\mod\<mod>.mod     ← 只有 name / tags / supported_version / path
```

`path=` 必须是**绝对路径 + 正斜杠**，指向那个 ASCII 目录。内容不必放在 Documents 下。

## 二、怎么证明模组真的被挂载了

往模组里放一个**重复定义 vanilla 单对象数据库键**的临时文件。引擎对这类重复会**点名报错**：

```pdx
# common/map_modes/zz_zz_mount_probe.txt
# 键取自 vanilla common/map_modes/00_map_modes.txt，块体照抄以确保探针自身有效
storm_map_mode = {
	icon = "GFX_map_mode_storm_forecast"
	enable_terra_incognita = yes
	can_change_point_of_view = no
	shortcut = "CTRL+COMMA"
	display_storms = yes
	tutorial = "STORM_FORECAST_MAP_MODE"
	visible = { has_cosmic_storms_dlc = yes }
	color = { value = hsv { 0.0 0.0 0.5 0.75 } condition = { always = yes } }
}
```

重启游戏后看 `error.log`：

- 出现 `Object with key: storm_map_mode already exists, using the one at file: common/map_modes/zz_zz_mount_probe.txt` → **模组确实挂载了**，问题在内容里，去查脚本。
- 什么都没有 → **模组没被挂载**，别去改脚本。查路径 ASCII、`dlc_load.json`、是否同名冲突。

**不能用 `common/species_classes/` 之类的重复键来判定**：那些数据库的重复键是**静默覆盖**的，探针不会响。必须用会报错的单对象数据库（`common/map_modes/`、`common/map_modes` 之外的 `gfx/models` 3D 类型等）。探针用完**立刻删掉**。

## 三、`dlc_load.json` 归启动器所有

`Documents\Paradox Interactive\Stellaris\dlc_load.json` 里 `enabled_mods` 是形如 `mod/<file>.mod` 的数组。

- 游戏**直接启动**（`stellaris.exe`）时会读它，所以手工加入条目**能生效一次**；
- 但**启动器（dowser）会重写这个文件**，手工条目会在下次启动器刷新 playset 时消失。实测中它就这样丢过一次；
- **长期启用请用启动器界面勾选**，不要只改 JSON。

## 四、版本一致性

游戏版本从安装目录的 `launcher-settings.json` 读：`version`（如 `Pegasus v4.4.6 (fdde)`）与 `modsCompatibilityVersion`（如 `4.4`）。老版本可能没有后一个字段，可以从 `version` 串里推出主次版本号。

`supported_version` 与安装不一致时：启动器把它标成"过时"，**代码仍然会加载**，但任何"对着这个安装核对过的字段"都不可信。本机实测常见写法是 `v4.4.*`。

**同时存在多个安装时（例如一个 Steam 旧版 + 一个全 DLC 新版），必须显式指定要对哪个核对**，否则会把模组对着错误的版本验证一遍。用 `discover_stellaris_environment` 看它报了哪些安装与版本；必要时用 `RSTELLARISCRIBE_GAME_ROOT` 固定。

## 五、同名冲突

同一个模组**不能**同时以本地文件夹和创意工坊订阅两种形式存在，游戏会拒绝加载。上传自己的模组后再订阅它，也会触发。

## 六、排查清单（按顺序）

1. 模组目录路径是否**纯 ASCII**？（第二节的探针判定）
2. `.mod` 是否存在、`path=` 是否为正斜杠绝对路径、指向的目录里有 `descriptor.mod` 吗？
3. 模组是否在启动器里被勾选（而不是只改了 `dlc_load.json`）？
4. `supported_version` 与你要玩的那个安装是否一致？
5. 以上全过，再去查本地化 BOM / 文件名后缀 / 首行语言头、括号配平、作用域、缺失本地化键。

## 校验要点

- 判定"挂载了没"**只**用会报错的重复键探针；不写日志的重复键（`common/species_classes/` 等）不能用作判定。
- 探针文件用完必须删除，它本身会覆盖一个 vanilla 键。
- `path=` 用正斜杠；内容路径保持纯 ASCII。
- 只改 `dlc_load.json` 不算"已启用"，启动器重写后即失效。
- 核对字段前先确认安装版本，多安装时显式指定。

## 常见错误

- 花几小时改脚本，而模组因为用户名含中文压根没被挂载。
- 把"引擎报了我的 `supported_version`"当成"模组已加载"的证据——描述文件是**无条件**被扫描的，读到它不等于启用它。
- 用 `common/species_classes/` 的重复键做探针，误判成"没挂载"。
- 只改 `dlc_load.json`，之后启动器一刷新就失效。
- 对着机器上另一个版本的游戏核对字段。
- 用 Windows PowerShell 5.1 的 `Get-Content`/`Set-Content` 读写 UTF-8 文件（中文会变乱码，甚至写坏 JSON）；用能存 UTF-8 的编辑器，或把 JSON 写进文件再用 `--json-file` 传给工具。

## 待确认

- `common/species_classes/` 重复键"静默覆盖"的直接证据只来自文件层分析（该目录不在 DUPL/NO 白名单、按加载序后者生效）与两次实机对照中探针不响；未逐条验证每个数据库的重复处理策略。
- `dlc_load.json` 被启动器重写的确切时机（启动器启动时 / 切换 playset 时）未做逐步观察。

## 参考

- 本机实机对照实验：`<Stellaris>`（Pegasus v4.4.6，35 DLC）与 `D:\SteamLibrary\steamapps\common\Stellaris`（Lyra v4.1.7）
- https://stellaris.paradoxwikis.com/Modding
- https://stellaris.paradoxwikis.com/Modding_tutorial
