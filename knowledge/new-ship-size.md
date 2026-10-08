---
id: new-ship-size
category: content
title: Adding a Ship Size
title_zh: 新增舰船类型
file_types: [common/ship_sizes/*.txt, common/section_templates/*.txt, common/scripted_triggers/*.txt, common/technology/*.txt, common/scripted_actions/*.txt, common/on_actions/*.txt]
tags: [ship_size, construction_type, carries_colony, prerequisites, start_tech, scripted_action, trigger-override]
related: [ship-sizes, ship-components, ship-abilities-and-gui, technology, section-templates]
sources: [https://stellaris.paradoxwikis.com/Ship_modding]
verified_version: "Pegasus 4.4.6 实机对照（新增空天母舰并逐项消除引擎报错）"
---

## 概要

在 4.4.6 新增一个舰船类型，需要**四件事**，缺一个就会以"看起来没事但实际不可用"的方式失败：

1. `common/ship_sizes/` 里写舰种块；
2. `common/section_templates/` 里给它一个 `ship_size` 匹配的区段模板（否则自动设计器无处安放核心组件）；
3. **覆盖 vanilla 的"舰种白名单"脚本化触发器**（否则反应堆/推进器/战斗计算机装不上，见下）；
4. 科技侧 `start_tech = yes`（如果要开局已研究）。

要复刻方舟舰那种"自带殖民地、有专属界面、能造陆军"的大型舰，走 `class = shipclass_starbase` + `carries_colony` 这条路；要复刻主宰那种"边打边造船"，靠 `class = shipclass_starbase` + `construction_type = starbase_shipyard` + `starbase_shipyard_capacity_add`。

## 文件位置与命名

| 路径 | 作用 |
| :--- | :--- |
| `common/ship_sizes/*.txt` | 舰种本体。字段手册在 `00_ship_sizes.txt` 顶部注释（含 `carries_colony`、`arkship_picture`、`base_ship_size` 等方舟舰字段） |
| `common/section_templates/*.txt` | 区段模板，靠 `ship_size` + `fits_on_slot` 与舰种匹配 |
| `common/scripted_triggers/*.txt` | **模组覆盖 vanilla 触发器的地方**（同名键，模组后加载即生效） |
| `common/technology/*.txt` | 解锁用科技 |
| `common/scripted_actions/*.txt` | 舰船专属按钮；字段手册 `99_README_SCRIPTED_ACTIONS.txt` |
| `common/on_actions/*.txt` | `on_completed` 回调；**只认 `events`/`random_events`** |

## 语法与字段

最小可加载的方舟舰型舰种（空天母舰实测通过）：

```pdx
aerospace_carrier = {
	class = shipclass_starbase			# carries_colony 的前置要求
	carries_colony = pc_aerospace_carrier	# 启用"方舟舰专属界面"（含建造陆军按钮）
	construction_type = starbase_shipyard	# 由带船坞的恒星基地建造
	prerequisites = { "tech_aerospace_carrier" }	# 由科技解锁

	is_designable = no
	is_civilian = no
	available_to_everyone = yes
	enable_default_design = yes
	components_add_to_cost = no

	entity = military_arkship_01_stage_1_entity		# 复用现成模型
	section_slots = {
		"mid" = { locator = "part1" }
		"1" = { locator = "module_01" }
		"2" = { locator = "module_02" }
	}
	icon = ship_size_military_arkship_tier_1
	icon_frame = 16
	ship_class_icon_frame = 64

	max_hitpoints = 2500
	size_multiplier = 80
	fleet_slot_size = 8
	modifier = {
		ship_orbital_bombardment_mult = 1.0		# 轨道轰炸
		starbase_module_capacity_add = 4
		starbase_building_capacity_add = 6		# 建筑槽（集结平台装在这里）
	}

	required_component_set = "power_core"
	required_component_set = "ftl_components"
	required_component_set = "thruster_components"
	required_component_set = "sensor_components"
	required_component_set = "combat_computers"
}
```

**不要写 `potential_construction` / `possible_construction` 里的 `has_technology`**：该作用域不是国家，引擎报 `Wrong scope for trigger 'has_technology'`。vanilla 这里是调用脚本化触发器（如 `titan_potential_construction`）。解锁交给 `prerequisites` 即可。

## 核心组件：必须覆盖 vanilla 的舰种白名单触发器

这是新增舰种最容易卡住的一步。大型舰的反应堆/推进器/战斗计算机**不是**按 `size` 通用可用的，而是各自写 `potential` 指向一组**白名单脚本化触发器**：

```pdx
# common/component_templates/00_utilities_reactors.txt:192
utility_component_template = {
	key = "JUGGERNAUT_FISSION_REACTOR"
	component_set = "power_core"
	potential = {
		ship_uses_juggernaut_reactors = yes
		...
	}
}
```

而那些触发器只列 vanilla 舰种：

```pdx
# common/scripted_triggers/07_scripted_triggers_ships.txt:740
ship_uses_juggernaut_reactors = {
	OR = {
		is_ship_size = juggernaut
		...
		is_arkship_ship = yes
	}
}
```

所以模组舰种必须**在 `common/scripted_triggers/` 里用同名键覆盖它**（模组后加载，日志会写 `Object with key: X already exists, using the one at file: <你的文件>` —— 那是**成功**的标志）。实测需要覆盖 6 个键：

| 触发器 | 不覆盖的后果 |
| :--- | :--- |
| `ship_uses_juggernaut_reactors` | `power_core` 装不上 |
| `ship_uses_colossus_thrusters` | `thruster_components` 装不上 |
| `ship_uses_juggernaut_components` | 大型舰专用组件装不上 |
| `ship_uses_artillery_role` / `ship_uses_carrier_role` | 舰种无法担任对应战斗角色 |
| `is_arkship_ship` | `COMBAT_COMPUTER_ARKSHIP` 装不上 → `combat_computers` 装不上 |

症状是每个国家各刷一条：

```
Country <谁> cannot build any component in the component set combat_computers
  for design Temp <舰名> and size <你的舰种键>
```

**注意**：vanilla 自己的 `military_arkship_tier_1` / `science_arkship_tier_1` 偶尔也报这条（实测 2 条），所以"看到这条"不等于一定是你写错了——要看 `size` 是不是你的键。

## 区段模板

`section_slots` 里的槽必须能找到 `ship_size` 匹配、`fits_on_slot` 对应的 `ship_section_template`。最稳的做法是把 vanilla 方舟舰的区段块**逐字复制**，只改 `key` 和 `ship_size`（它自带 hangar/turret/PD 等 `component_slot`）。

## 开局已研究

科技侧写 **`start_tech = yes`**（vanilla 50 处，如 `00_eng_tech.txt:26` 的 `tech_corvettes`）。`is_starting_tech` / `starting_tech` **都不是**有效字段；`tier = 0` + 无 `prerequisites` 也**不足以**让科技开局已研究。

科技的图标字段是**裸名字**，不是路径：`icon = "tech_cruisers"`（引擎解析成 `gfx/interface/icons/technologies/<名字>.dds`）。`inherit_icon` 只存在于 `technology_swap` 块内，写在科技顶层会报 `Unexpected token: inherit_icon`。

## 舰船专属按钮

`common/ship_abilities/` 在本版本**不存在**，组件里的 `ship_ability` 字段也**不存在**。正解是：

1. 在**组件**（`utility_component_template`）里写 `scripted_action = { <动作键> }`；
2. 在 `common/scripted_actions/` 定义该动作：`user_scope` 必须第一、`scope` 必须第二，`on_completed = <on_action 名>`；
3. 在 `common/on_actions/` 定义回调——**只能写 `events = { ... }`（或 `random_events`）**，写 `effect = { }` 会 `Unexpected token: effect`；
4. 效果放在那个事件里。`create_army` 文档写 `Supported Scopes: planet ship colony`，但**舰船作用域要靠 `every_owned_ship` 进入**（`every_ship` 不存在，报 `Invalid scripted effect`）。

方舟舰那种"建造陆军/建造舰船"按钮**是 exe 硬编码的**（`interface/planet_view.gui` 里 `arkship_build_armies` 等 `buttonType` 只有 `name`、没有 `effect`），模组舰种无法复制，只能靠 `carries_colony` 让引擎自己把界面挂上来，或用上面的 `scripted_action` 做等效按钮。

## 建造列表里不出现？先看"有没有设计图"

恒星基地的建造列表列的是**设计图（design）**，不是舰种本身。所以一个舰种要在列表里出现，必须存在一张它的设计图。

- `enable_default_design = yes` 的官方注释是 **"countries will have an auto-generated design at start"** —— 只在**开局**生成。
- 因此 `is_designable = no` 的舰种在**已有存档里永远拿不到设计图**（既不能自动生成，也不能手搓），列表里就永远不会出现。

vanilla 的判别特征（实测）非常干净：

| 舰种 | `available_to_everyone` | `is_civilian` | `is_designable` | 可建造 |
| :--- | :--- | :--- | :--- | :--- |
| `juggernaut`（唯一可建造的 `shipclass_starbase`） | 未写 | 未写 | 未写（默认可设计） | 是 |
| 方舟舰族 `*_arkship_tier_*` | `yes` | `no` | `no` | 否（另有 `potential_construction = { always = no }`） |

所以要**同时**做到"复刻方舟舰的携带殖民地 + 玩家可建造"，就不能把方舟舰那三个字段照抄过来：保留 `class = shipclass_starbase` + `carries_colony`（拿专属界面），而 `is_designable` / `available_to_everyone` / `is_civilian` 按**主宰**那一侧设置。

## 区段（section）：组件槽从哪来

玩家在设计器里能配装什么，完全由**区段模板**决定，舰种本身不提供槽位：

- 武器/机库是 `component_slot = { name template locatorname }`，`locatorname` 必须是该 `entity` 上**真实存在**的挂点（写错通常没有报错，但槽位不生效）。
- 护盾/装甲是 `large_utility_slots` / `medium_utility_slots` / `small_utility_slots`，**只写数量、不需要 locator**。
- `aux_utility_slots` 才是能装 aux 组件（例如自定义舰船组件）的槽位。
- 同一个 `fits_on_slot` 下可以放多个区段模板供玩家选择；只写一个，设计器里就"只有一组区段可选"。

**两个实测坑**：

1. **不要照抄方舟舰的区段。** 方舟舰的区段只有武器槽（它的护盾与装甲由恒星基地模块提供），照抄的结果是设计器里"只有一组武器区段、完全没有组件槽"，连 aux 槽都没有，自定义组件根本装不上。
2. **舰种里 `section_slots` 的每一个槽都必须有匹配的区段模板**，否则引擎报
   `Couldn't find any section templates that are compatible with ship_size "<键>" and fits on slot "<槽>"`。
   方舟舰的 `"1"` / `"2"` 槽是给恒星基地模块用的；模组舰种若不提供模块区段，就**不要写这两个槽**。

## 不要为了"专属界面"去套方舟舰：那会得到不能编队的特殊舰

这是最容易犯、也最贵的错误。

`carries_colony = <行星类别>` 会让舰船变成**移动殖民地**：它自带一座殖民地、由引擎挂上硬编码的方舟舰界面，**但不能编入舰队**、不参与常规舰队作战、也拿不到常规轰炸姿态。想要"与护卫舰/巡洋舰并列的舰种"，**就不能用这个字段**。

| 想要的效果 | 正确做法 | 错误做法 |
| :--- | :--- | :--- |
| 与护卫舰并列、能编入舰队、正常太空作战 | `class = shipclass_military` + `construction_type = starbase_shipyard` | 照抄方舟舰块 |
| 由带船坞的恒星基地建造 | `construction_type = starbase_shipyard` | —— |
| 由科技解锁 | 舰种自身 `prerequisites = { "tech_x" }` | —— |
| 开局已研究 | 科技写 `start_tech = yes` | —— |
| **舰船专属界面 / 专属按钮** | **自己写 GUI**（`interface/*.gui` + `common/button_effects/` + 事件 `custom_gui`，见 `custom-gui` 条目），按钮用舰种或组件的 `scripted_action` | 用 `carries_colony` 蹭方舟舰界面 |

判断标准很简单：**看它能不能进舰队**。能编队、能跟护卫舰一起打仗，才是"并列的舰种"。

### `use_shipnames_from` 只能填已存在的舰种键

合法值（4.4.6）：`destroyer` / `corvette` / `cruiser` / `battleship` / `titan` / `juggernaut` / `colossus` / `science` / `colonizer` / `constructor` / `military_station_small`。
填别的（例如自造的 `carrier`）会：

1. 直接报 `Invalid ship size for names <值> in ship size <你的键>`；
2. 之后所有命名组反复回退，刷出一堆 `Name list [X] failed to generate a ship class name for ship size [<你的键>]`。

**诊断小技巧**：vanilla 舰种各自也只会刷 **1 次**这条 class-name 失败（正常现象）；**你的舰种出现 8~20 次**就是上面这个错在作祟。

## 校验要点

- 舰种块里有 `class = shipclass_starbase` 才允许 `carries_colony`。
- `construction_type = starbase_shipyard` 才由恒星基地船坞建造。
- 解锁靠**舰种自己的 `prerequisites`**；科技块里没有解锁字段（`unlock_ship_sizes` 不存在）。
- 反应堆/推进器/计算机三类 `required_component_set` 都要有对应的白名单触发器覆盖。
- 区段模板的 `ship_size` 必须等于舰种键。
- 开局已研究写 `start_tech = yes`。
- 组件按钮走 `scripted_action` + `on_action`（`events`），事件里放效果。

## 常见错误

- **科技工具提示里"解锁舰船类型"那一行不一定会自己出现。** 组件解锁行是引擎扫组件 `prerequisites` 自动生成的（实测会显示"解锁部件 X"），
  但只写 `prereqfor_desc = { ship = { title desc } }` 时，舰种行可能仍然不显示（与 vanilla 巡洋舰/方舟舰写法一致却无效）。
  可靠做法是**同时用 `custom` 段**显式写明这一行——`custom` 是 vanilla 里最常见的段（102 次），
  `tech_juggernaut` 的解锁文案正是放在 `custom` 里：

```pdx
prereqfor_desc = {
	ship = {
		title = "TECH_UNLOCK_X_TITLE"
		desc = "TECH_UNLOCK_X_DESC"
	}
	custom = {
		title = "TECH_UNLOCK_X_SHIP_TITLE"      # 「解锁舰船类型：X」
		desc = "TECH_UNLOCK_X_SHIP_DESC"
	}
}
```

- 另外：`start_tech = yes` 的科技**不需要** `prerequisites`（vanilla 的 `tech_corvettes` 就没有）。

- `Wrong scope for trigger 'has_technology'` → `potential_construction` 里不要直接用国家级触发器。
- `cannot build any component in the component set X` → 缺白名单触发器覆盖（或区段模板缺槽）。
- `Unexpected token: inherit_icon` → 那是 `technology_swap` 的字段。
- `Failed to find icon for technology: <键>` → 缺 `icon`，且 `icon` 要裸名字。
- `Unexpected token: effect` in `on_actions/` → on_action 不接 `effect`。
- `Invalid scripted effect: every_ship` → 用 `every_owned_ship`。
- `Unexpected token: modifier` in `starbase_buildings/` → 建筑/模块没有裸 `modifier` 字段，要用 `station_modifier` / `planet_modifier` / `country_modifier` 等九种作用域块之一。

## 待确认

- `create_army` 在**舰船作用域**下的落点（陆军出现在哪、是否随舰）无 vanilla 先例，未做实机功能验证。
- 覆盖 vanilla 脚本化触发器意味着要跟进版本变化；若 DLC 更新了这些白名单，模组里的副本会变旧。
- `ship_uses_*_components` 系列之外是否还有别的白名单触发器会拦住某个组件，未穷举。

## 参考

- 实测模组：`<mods>\aerospace_carrier`（14 个文件，实机日志中本模组相关报错 0 条）
- `common/ship_sizes/00_ship_sizes.txt` 顶部字段手册
- `common/ship_sizes/29_nomads_dlc_ships.txt`（方舟舰族）
- `common/ship_sizes/18_juggernauts.txt`（主宰）
- `common/scripted_actions/99_README_SCRIPTED_ACTIONS.txt`
- `common/starbase_modules/00_example.txt`（模块与建筑的字段手册）
