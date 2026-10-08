---
id: custom-gui
category: content
title: Writing a Custom GUI
title_zh: 从零写自定义界面
file_types: [interface/*.gui, common/button_effects/*.txt, common/static_modifiers/*.txt, events/*.txt]
tags: [guiTypes, containerWindowType, effectbuttonType, button_effects, custom_gui, custom_gui_option]
related: [ship-abilities-and-gui, interface-gui, events]
sources: [https://stellaris.paradoxwikis.com/Interface_modding]
verified_version: "Pegasus 4.4.6 实机对照（自写空天母舰舰桥窗口，加载零报错）"
---

## 概要

群星**允许模组从零写界面**，而且不需要替换任何 vanilla 文件：自己在 `interface/*.gui` 里定义窗口，然后让**事件**用 `custom_gui = "<窗口名>"` 把它实例化。窗口里的按钮用 `effectbuttonType`，`effect = <键>` 指向 `common/button_effects/` 里自己写的脚本——这是全游戏**唯一**能挂 `effect` 的 GUI 元素。

这条路实测可行：自写的舰桥窗口（标题、说明、三个 `effectbuttonType` 指令按钮、状态文本、关闭按钮、一行选项按钮）在 4.4.6 加载零报错。

## 文件位置与命名

| 路径 | 作用 |
| :--- | :--- |
| `interface/*.gui` | 界面定义。**不要**与 vanilla 同名（同名会整体替换它，版本一变就崩）；写成自己的文件名 |
| `common/button_effects/*.txt` | 按钮点击后执行的脚本；官方示例 `example.txt` 自带字段说明 |
| `common/static_modifiers/*.txt` | 需要给对象加临时修正时用（本条目里用作示例效果） |
| `events/*.txt` | 用 `custom_gui` / `custom_gui_option` 引用上面定义的窗口 |

## 语法与字段

**1) 文件根节点是 `guiTypes = { ... }`。** 顶层直接写 `containerWindowType` 是语法错误（这一条没有任何文档写着，是实机对照出来的）。

```pdx
guiTypes = {

	containerWindowType = {
		name = "aerospace_carrier_bridge_window"	# custom_gui 就引用这个名字
		orientation = center
		origo = center
		moveable = yes
		size = { width = 720 height = 470 }

		background = { name = "background" quadTextureSprite = "GFX_tile_large_bg" }

		instantTextBoxType = {
			name = "heading"
			font = "malgun_goth_24"
			text = "AEROSPACE_CARRIER_BRIDGE_TITLE"	# 本地化键
			position = { x = 24 y = 14 }
			maxWidth = 620
			maxHeight = 30
			fixedSize = yes
			alwaysTransparent = yes
		}

		# 唯一能挂 effect 的元素；这里才是"自己写的按钮"
		effectbuttonType = {
			name = "muster_army_button"
			position = { x = 24 y = 190 }
			size = { x = 330 y = 34 }
			quadTextureSprite = GFX_tiling_button_standard
			orientation = UPPER_LEFT
			font = "cg_16b"
			buttonText = "AEROSPACE_CARRIER_BTN_MUSTER"		# 按钮标签的本地化键
			tooltipText = "AEROSPACE_CARRIER_BTN_MUSTER_TT"
			effect = aerospace_carrier_button_muster_army	# -> common/button_effects/
			clicksound = tab_click
		}

		buttonType = {						# 名字必须是 close，引擎才认关闭
			name = "close"
			quadTextureSprite = "GFX_button_close"
			position = { x = -20 y = 14 }
			orientation = "UPPER_RIGHT"
			clicksound = "back_click"
		}
	}

	# 选项行单独一个容器，按钮名必须叫 option_button、text 必须是 OPTION_TEXT，
	# 引擎会把事件的每个 option 绑到它上面。
	containerWindowType = {
		name = "aerospace_carrier_bridge_option"
		position = { x = 0 y = 0 }
		size = { width = 300 height = 30 }
		moveable = no

		buttonType = {
			name = "option_button"
			quadTextureSprite = "GFX_tiling_button_standard"
			position = { x = 0 y = 8 }
			font = "cg_16b"
			text = "OPTION_TEXT"
		}
	}
}
```

**2) 事件把它实例化：**

```pdx
country_event = {
	id = my_mod.2
	title = my_mod.2.name
	desc = my_mod.2.desc
	picture = GFX_evt_alien_nature		# 不加会报 "has no pictures"
	is_triggered_only = yes
	custom_gui = "aerospace_carrier_bridge_window"
	custom_gui_option = "aerospace_carrier_bridge_option"
	option = { name = my_mod.2.a }
}
```

**3) 按钮脚本（`common/button_effects/`）的作用域**，官方 `example.txt` 明文写着：

- `this` = **当前选中的对象**（球、舰、舰队、星系、巨构、联邦…）**或**玩家国家
- `from` = 玩家国家
- 官方建议：在 `allow` 里先 `is_scope_type = ship` 之类的检查，因为"同时开多个界面时作用域可能混淆"

```pdx
aerospace_carrier_button_muster_army = {
	potential = { is_scope_type = ship }
	allow = {
		is_ship_size = aerospace_carrier
		from = { ... }
		custom_tooltip = { fail_text = MY_FAIL_KEY  is_ship_size = aerospace_carrier }
	}
	effect = {
		create_army = { name = "my_army" owner = from type = assault_army }
	}
}
```

**4) 从"舰上的按钮"打开这个窗口**：舰船专属按钮走 `scripted_action`（见 `ship-abilities-and-gui`），而它只能触发 **on_action**，on_action 又**只接 `events`/`random_events`**。所以链条是：

```
组件 scripted_action → on_completed(on_action) → fleet_event（保持舰队作用域）
   → immediate = { owner = { country_event = { id = 我的窗口事件 } } }   # 上跳到国家作用域
   → country_event 带 custom_gui → 自写窗口出现
```

## 真正的 GUI 与"事件窗口"是两回事

这一点必须分清，否则会像我一开始那样把事件窗口当成 GUI：

| | 载体 | 是否常驻 | 怎么实现 |
| :--- | :--- | :--- | :--- |
| **事件窗口** | 事件（`custom_gui` 引用你写的布局） | 否，弹窗，点掉就没了 | 自写 `containerWindowType` + 事件引用；见上文 |
| **真正的 GUI** | 引擎自己实例化的界面元素 | **是**，一直在游戏界面上 | **覆写**一个引擎会实例化的 `.gui` 文件，把自写元素塞进去 |

`.gui` 文件只是"元素类型定义"，**引擎决定实例化哪些**。所以模组**无法凭空造出一个常驻新窗口**；要放常驻元素，只能覆写引擎已经在用的文件。

实测做法（空天母舰的舰队按钮条）：覆写 `interface/fleet_view.gui`（把 vanilla 文件整份复制过来，只在里面加一个自己的容器），容器里放 `effectbuttonType`，`effect` 直接指向 `common/button_effects/`——**不需要任何事件**：

```pdx
# 插在 vanilla 的 containerWindowType name = "bottom" 里面
containerWindowType = {
	name = "aerospace_carrier_bridge_bar"
	position = { x = 210 y = 25 }

	effectbuttonType = {
		name = "aerospace_carrier_muster_button"
		size = { x = 122 y = 28 }
		quadTextureSprite = GFX_tiling_button_standard
		font = "cg_16b"
		buttonText = "AEROSPACE_CARRIER_BTN_MUSTER"			# 本地化键
		tooltipText = "AEROSPACE_CARRIER_BTN_MUSTER_TT"
		effect = aerospace_carrier_fleet_button_muster		# -> common/button_effects/
		clicksound = tab_click
	}
}
```

**舰队视图里按钮的作用域**：`this` = 当前选中的舰队，`from` = 玩家国家。所以要操作舰队里的某艘舰，得用 `every_owned_ship = { limit = { is_ship_size = X } ... }`（`every_ship` 不存在，会报 `Invalid scripted effect`）。

**覆写的代价（必须告诉使用者）**：

- 整份替换 → **游戏版本一变就要重新复制** vanilla 文件；
- 与其他覆写同一文件的模组**直接冲突**，只能有一个生效。覆写前先查一遍已装模组有没有同名文件。

## `create_army` 在非殖民地作用域必须显式给 `species`

`create_army` 官方参数是 `name / owner / species / type`，作用域 `planet ship colony`。但在**舰船/舰队作用域**下不写 `species` 时，引擎拿不到物种，会报：

```
Attempting to get a random pop species on an invalid colony
```

vanilla 的写法是把**国家**当物种来源传给 `species`：

```pdx
# common/scripted_effects/01_start_of_game_effects.txt:5104
create_army = {
	owner = last_created_country
	type = primitive_additional_army
	species = last_created_country
}
```

所以在按钮效果里写 `species = from`（玩家国家）即可。

## `*_compare` 类触发器：比较运算符是键的一部分

写按钮条件时踩到的一个**静默错误**（不报错，只是判断结果总是错的）：

```pdx
# 错：会被当成"恰好等于 100"
resource_stockpile_compare = { resource = energy value = 100 }

# 对：运算符属于键名
resource_stockpile_compare = { resource = energy value >= 100 }
```

`triggers.log` 的签名原文：

```
resource_stockpile_compare - Checks specific resource stockpile for the country/ship scope:
  resource_stockpile_compare = {
    resource = <resource_name>
    value ><= <value>
    mult = <variable> (optional)
  }
  Supported Scopes: country ship
```

vanilla 用例：`value > 2000`（`00_energy_budget.txt:28`）、`value >= 1000`（`00_biomass_budget.txt:72`）。
写成 `value = N` 时引擎**不报错**，但条件等价于"N == 该数值"，于是"有 5000 能量币却提示能量不足"。

同类还有 `resource_income_compare` / `resource_revenue_compare` / `resource_expenses_compare` / `planet_resource_compare`。

**顺带记两个舰队按钮常用签名**（同样取自 `triggers.log`）：

- `any_owned_ship` — "Iterate through each ship in the fleet or controlled by the country"，
  **Supported Scopes: country fleet**。在舰队作用域下它就是遍历该舰队的舰船，正是舰队按钮里"本舰队有没有 X 舰"的正确写法。
- `every_owned_ship` — 效果迭代器；**`every_ship` 不存在**（会报 `Invalid scripted effect`）。

## 校验要点

- 根节点必须是 `guiTypes`。
- `custom_gui` / `custom_gui_option` 的值是 `containerWindowType` 的 `name`。
- 选项容器的按钮名必须是 `option_button`、`text` 必须是 `OPTION_TEXT`。
- 只有 `effectbuttonType` 有 `effect` 字段，值指向 `common/button_effects/` 的顶层键。
- 窗口里的 `close` 按钮名固定为 `close`。
- **`common/static_modifiers/` 的键需要本地化**，否则报 `Missing modifier localization: <键>`；vanilla 两种写法都存在：裸键（`dreadnought_power`）与 `MOD_<大写键>`。两种都写上最稳。
- 带 `custom_gui` 的事件一样需要 `picture`。
- `.gui` 文件**不带 BOM**（vanilla 的都没有）。

## 常见错误

- 顶层直接写 `containerWindowType` → 解析失败（必须包在 `guiTypes = { }` 里）。
- 按钮点了没反应 → 忘了 `effect = <button_effects 键>`，或那个键名拼错。
- `Missing modifier localization` → 静态修正缺本地化键。
- `Event ... has no pictures` → 事件缺 `picture`。
- 用了不存在的精灵名 → 日志报 `Trying to change sprite to unknown sprite '<名字>'`；可安全复用的通用精灵：`GFX_tile_large_bg`（面板底）、`GFX_tiling_button_standard`、`GFX_tiling_button_standard_seethrough`（按钮）、`GFX_button_close`（关闭）；字体 `malgun_goth_24` / `cg_16b`。
- 把窗口写进与 vanilla 同名的 `.gui` 文件 → 整体替换，版本更新后极易崩；尽量用自己的文件名 + `custom_gui` 引用。

## 待确认

- `custom_gui` 在**非外交事件**上是否所有窗口类型都能正常渲染，只实测了 country_event 这一种。
- `event_message_type`（vanilla 的外交窗口用它）对自定义窗口是否必需，未验证——不写也能加载。
- 窗口内元素是否需要严格的 `position`/`size` 才能显示（本条目里的坐标是按 720×470 手算的，未逐项做过视觉校验）。

## 参考

- 实测模组：`<mods>\aerospace_carrier`（`interface/zz_aerospace_carrier_gui.gui` + `common/button_effects/` + `events/`）
- `common/button_effects/example.txt`（官方字段说明与 `effectbuttonType` 用法）
- `interface/diplomacy_champions forge_event_view.gui`（vanilla 的 `custom_gui` 窗口与选项容器）
- `events/nomads_events_1.txt:2291`（引用 `custom_gui` / `custom_gui_option` 的真实事件）
- `interface/fleet_view.gui:708`（vanilla 的 `effectbuttonType` 用例）
