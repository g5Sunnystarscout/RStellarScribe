---
id: gui-files
category: media
title: GUI Files (interface/*.gui)
title_zh: GUI 界面文件
file_types: [interface/*.gui, common/button_effects/*.txt]
tags: [guiTypes, containerWindowType, instantTextBoxType, buttonType, effectButtonType, orientation]
related: [gfx-interface, common-errors, validation-cwtools]
sources: [https://stellaris.paradoxwikis.com/Interface_modding]
verified_version: "wiki Interface_modding 明示 3.7 起含部分内容；元素与属性表未标版本"
---

## 概要

`interface/*.gui` 描述 UI 的布局树，官方文档的写法是**所有元素必须放在 `guiTypes = {}` 内**。文件同样是 LIOS 加载，所以"改 vanilla 界面"在多数情况下等于**必须替换整个 vanilla `.gui` 文件**（用同名文件覆盖），这会带来兼容性问题。能用新增文件解决的（新增窗口、往既有窗口挂元素）优先新增。

容器元素基本只能改属性：`containerWindowType`、`buttonType`、`instantTextBoxType` 等的**属性可以被改**，但很多交互逻辑是硬编码的。真正给模组用的可编程按钮是 `effectButtonType`，它通过 `effect = <key>` 调用 `/common/button_effects/` 里的定义。

## 文件位置与命名

- `<mod>/interface/*.gui`：界面布局。
- `<mod>/interface/*.gfx`：精灵注册（见 gfx-interface）。
- `<mod>/common/button_effects/*.txt`：`effectButtonType` 的 `effect` 目标。
- vanilla 参考：`interface/reference.txt` 有示例元素。

调试命令（见 debugging-logs）：`reload <file>.gui` 可热重载 `.gui`（仅 `.gui` 有效）；`guibounds` 显示鼠标所指元素的来源文件；`debugtooltip` 后可 `CTRL+ALT+右键` 打开对应 GUI 文件。

## 语法与字段

```pdx
# <mod>/interface/my_mod_window.gui
guiTypes = {

	@my_panel_sprite = "GFX_tiles_dark_area_cut_8"
	@my_width = 420

	containerWindowType = {
		name = "my_mod_overview_window"
		orientation = center
		origo = center
		moveable = yes
		size = { width = @my_width height = 300 }
		background = {
			name = "background"
			quadTextureSprite = @my_panel_sprite
		}

		iconType = {
			name = "my_mod_emblem"
			spriteType = "GFX_my_mod_emblem"
			position = { x = -10 y = -14 }
			scale = 0.75
			centerPosition = yes
			alwaysTransparent = yes
		}

		instantTextBoxType = {
			name = "my_mod_header"
			font = "malgun_goth_24"
			text = "my_mod_window_header"
			position = { x = 20 y = 5 }
			maxWidth = 380
			maxHeight = 26
			fixedSize = yes
			format = center
			vertical_alignment = center
			alwaysTransparent = yes
		}

		buttonType = {
			name = "my_mod_close"
			quadTextureSprite = "GFX_close"
			position = { x = -42 y = 12 }
			orientation = upper_right
			shortcut = "ESCAPE"
			clicksound = "back_click"
			pdx_tooltip = "my_mod_close_tooltip"
		}

		effectButtonType = {
			name = "my_mod_confirm"
			quadTextureSprite = "GFX_standard_button_142_34_button"
			position = { x = 20 y = 250 }
			buttonFont = "cg_16b"
			buttonText = "my_mod_confirm_button"
			effect = "my_mod_confirm_effect"
		}
	}
}
```

已核实的元素类型：`containerWindowType`、`buttonType`、`effectButtonType`、`iconType`、`instantTextBoxType`、`scrollbarType`、`extendedScrollbarType`、`spinnerType`、`guiButtonType`、`positionType`、`listboxType`、`smoothListboxType`、`overlappingElementsBoxType`、`gridBoxType`、`checkboxType`、`editBoxType`、`dropDownBoxType`、`expandButton`、`expandedWindow`、`windowType`。

常用属性（官方表格）：

- `name`：**唯一必需**属性，在兄弟节点中不能重名。
- `position = { x = .. y = .. }`：仅支持整数。
- `size = { width = .. height = .. }` 或 `size = { x = .. y = .. }`——**取决于元素类型**，两者不通用。取值四型：`100`（绝对）、`100%`（父级相对）、`100%%`（父级相对再减去本元素 `position`）、`-10`（父级相对减去 `position` 与该值）。注意 `x`/`y` 形式只接受正整数。
- `orientation`：`upper_left`、`upper_right`、`lower_left`、`lower_right`、`center`、`center_up`、`center_down`、`center_left`、`center_right`（默认 `upper_left`）。配套 `origo`。
- `clipping`、`moveable`、`alwaysTransparent`（yes/no）。
- `background = { name = ... spriteType/quadTextureSprite = ... }`，可多次出现但每次 `name` 必须唯一。
- 文本类：`font`、`buttonFont`、`text`、`buttonText`、`appendText`、`maxWidth`、`maxHeight`、`fixedSize`、`format`（left/right/center，`centre` 亦可）、`vertical_alignment`、`text_color_code`、`borderSize`。
- 按钮类：`clicksound`、`oversound`、`show_sound`、`shortcut`、`pdx_tooltip`、`pdx_tooltip_delayed`、`pdx_tooltip_anchor_offset`、`pdx_tooltip_anchor_orientation`、`multiline`、`web_link`、`rotation`。
- 图形类：`spriteType`、`quadTextureSprite`、`frame`（默认 1）、`scale`（默认 1）、`centerPosition`、`mirror`。
- `effectButtonType` 专属：`effect = <key>`，指向 `/common/button_effects/`。**`pdx_tooltip` 在 `effectButtonType` 上不生效**，需在 button effect 里用 `custom_tooltip`。

`@变量` 可在 `.gui` 中声明（如 `@myvar = 200`、`@my_width = 50%`、`@my_sprite = "GFX_..."`），不可重复声明，且作用域不能跨嵌套层向上/向下传递。

分辨率条件块 `if_resolution = { min_width = .. min_height = .. }` 与 `if_scaled_resolution = { max_width = .. max_height = .. }`（后者基于 UI 缩放后的分辨率）可用于任何元素。

自定义窗口：在事件里写 `diplomatic = yes` + `custom_gui = "my_mod_overview_window"`，`custom_gui` 的值**必须**与某个 `containerWindowType` 的 `name` 完全一致，否则游戏崩溃。原 vanilla 窗口内的元素**不允许删除**，只能把 `size` 设为 0 或把 `position` 挪到屏幕外隐藏，否则游戏找不到 GUI 实例也会崩溃。

## 界面校验工具与它的来历

`validate_stellaris_interface` 会校验模组界面层里"引擎能否解析得出来"，全部规则都来自实机踩坑：

| 检查 | 依据 | 严重度 |
| :--- | :--- | :--- |
| `.gui` 根节点必须是 `guiTypes = { }` | 全 177 个 vanilla `.gui` 实测（176 个写 `guiTypes`，`traits.gui` 写小写 `guitypes` → **引擎大小写不敏感**） | error |
| `effectbuttonType` 的 `effect` 必须存在于 `common/button_effects/` | 点下去没反应就是这里错了 | error |
| `effectbuttonType` 缺 `effect` 字段 | 按钮存在但什么都不做 | warning |
| `spriteType` / `quadTextureSprite` 必须是已定义精灵 | 否则日志刷 `Trying to change sprite to unknown sprite '<名字>'` | error |
| 事件的 `custom_gui` / `custom_gui_option` 必须指向真实 `containerWindowType` | 指向不存在的窗口 = 事件找不到界面 | error |
| 模组文件与 vanilla 同名（整体替换） | 版本脆弱 + 与其他模组冲突（只能一个生效） | warning |
| 模组定义的容器名与 vanilla 重名 | 界面按名字查找，重名会互相遮蔽 | warning |

vanilla 侧索引规模（4.4.6 实测）：**177 个 `.gui` / 2435 个容器名 / 9217 个精灵名 / 2 个 button_effects 键**。

### 两个只有实测才会知道的细节

**1) `.gui` 文件开头常常不是 `guiTypes`。** 177 个文件里有 **30 个**先写了 `@变量 = 值`，之后才是 `guiTypes = {`：

```pdx
@sort_button_height = 80
@entry_info_height = 17

guiTypes = {
	containerWindowType = { ... }
}
```

所以判根节点时必须**先跳过注释与 `@` 行**，否则会误报 30 个文件。

**2) `.gfx` 里的精灵名不止定义在 `spriteType` 块里。** 只扫 `spriteType` 会漏掉一大批（我第一次索引 8536 个，改用"扫所有 `name = "GFX_..."`"后是 9217 个）。vanilla 还用这些块类型承载精灵名：

```pdx
corneredTileSpriteType = {     # GFX_invisible 就在这里
	name = "GFX_invisible"
	size = { x = 32 y = 32 }
	textureFile = "gfx/interface/tiles/invisible.dds"
}
```

同类还有 `tileSpriteType`、`maskedShieldType`、`progressBarType` 等。**按块类型枚举精灵是不可能的，只能按 `name = "GFX_..."` 收集。**

## 校验要点

1. `guiTypes = {}` 外层块；括号配平（vanilla 用 1 个 Tab 缩进）。
2. 每个节点 `name` 唯一；`background` 内多个块各自 `name` 唯一。
3. `spriteType` / `quadTextureSprite` 引用的 `GFX_*` 必须在某个 `.gfx` 里定义过。
4. `effectButtonType` 的 `effect` 必须在 `/common/button_effects/` 存在。
5. `custom_gui` 与 `containerWindowType` 名严格一致；不要删 vanilla 子元素。
6. 改 `.gui` 后可用 `reload xxx.gui` 验证，不必重启。
7. 只改 `size`/`position`/`spriteType` 属性通常安全；改动容器层级顺序有风险（官方示例警告"don't rearrange the logic of containers"）。

## 常见错误

- `position` 写小数 → 被截断或报错，官方明确只支持整数。
- 混用 `size = { x = .. y = .. }` 与 `width/height`，元素不显示或尺寸为 0。
- `custom_gui` 名与窗口 `name` 不一致 → 直接崩溃。
- 删掉 vanilla 自定义窗口里的子容器 → 崩溃（必须保留并隐藏）。
- 用 `pdx_tooltip` 挂在 `effectButtonType` 上 → 无提示，应改用 `custom_tooltip`。
- 想用 `[Root.GetName]` 之类的方括号 loc 命令做动态文本：多数 UI 元素**不处理**方括号命令，只会原样显示；只有 `effectButtonType` 的 `buttonText` 例外。

## 待确认

- 用户提到的 `types` 外层块：本页只出现 `guiTypes`，未找到 `types` 作为 `.gui` 根块的证据，**待确认**。
- `scripted_gui`：未在 Stellaris 官方 Wiki 找到任何 `scripted_gui` 相关说明。已知的可编程 UI 机制是 `effectButtonType` + `/common/button_effects/` 与事件 `custom_gui`。**Stellaris 是否支持 `scripted_gui` 未能证实**，不能假定可用。
- 修改 GUI 是否**必须**用 `replace_path`：官方 Modding 页的"Overwriting specific elements"对 `interface/` 的说明未取得；同目录同名 `.gui` 文件的覆盖行为与 `replace_path` 的精确语法**待确认**。实际上更常见的做法是同名覆盖单个 `.gui` 文件。
- `dropdownBoxType`（官方示例里写作 `dropDownBoxType`）大小写不一致，未验证引擎是否大小写敏感。

## 参考

- [Interface modding](https://stellaris.paradoxwikis.com/Interface_modding)
- [Modding（interface/ 目录与覆盖机制）](https://stellaris.paradoxwikis.com/Modding)
