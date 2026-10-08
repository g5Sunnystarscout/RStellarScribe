---
id: triggers
category: script
title: Triggers (Conditions)
title_zh: 条件（触发器）
file_types: [common/scripted_triggers/**, events/**, common/decisions/**, common/script_values/**]
tags: [trigger, condition, limit, count, custom-tooltip, flags]
related: [script-basics, scopes, effects, variables]
sources: [https://stellaris.paradoxwikis.com/Conditions, https://stellaris.paradoxwikis.com/Scopes/Flat_list_of_scopes, https://stellaris.paradoxwikis.com/Event_modding, https://stellaris.paradoxwikis.com/Dynamic_modding]
verified_version: "3.14 / 4.0"
---
## 概要
触发器（trigger / condition）只返回 `yes` 或 `no`，不改变游戏状态。它们出现在事件的 `trigger`、效果的 `limit = { }`、决议与法令的 `potential` / `allow`、`common/scripted_triggers/*.txt`，以及事件的 `pre_triggers` 里。每个触发器都有允许的作用域，用错作用域会写 `error.log` 并常常让后续代码失效。

## 文件位置与命名
- 可复用条件写进 `common/scripted_triggers/<你的前缀>.txt`，定义后当普通条件调用：`my_mod_is_ready = yes`；带参数的 scripted trigger 不能写成 `= no`，要用 `NOT = { … }` 包裹。
- 触发器清单以本机 **4.1.7** 安装目录为准：`D:\SteamLibrary\steamapps\common\Stellaris\common\` 与 `events\`。核对方法：`Get-ChildItem <游戏>\common,<游戏>\events -Recurse -File -Include *.txt | Select-String -Pattern '<触发器>' -SimpleMatch`，出现 0 次即可判定该写法在 4.1.7 不存在。
- 运行时导出：控制台 `trigger_docs` → `logs/script_documentation/triggers.log`。wiki 的 Conditions 页核对版本为 4.3，Scopes 的 Flat list 核对版本为 3.5（偏旧），冲突时以 vanilla 文件为准。

## 语法与字段
比较运算符只有 `=`、`>`、`<`、`>=`、`<=`（没有 `==` / `!=`）。

**国家作用域**：`has_technology = tech_zero_point_power`、`has_ethic = ethic_materialist`、`has_authority = auth_hive_mind`、`has_civic = civic_galactic_sovereign`、`num_pops > 40`、`has_country_flag = my_mod_stage_2`、`is_ai = no`、`num_owned_planets < 8`、`resource_stockpile_compare = { resource = energy value > 2000 }`。

**Gestalt / 蜂巢 / 机械**：`is_gestalt = yes` 是 vanilla 自带的 **scripted trigger**，定义在 `common/scripted_triggers/00_scripted_triggers.txt:1656`，内容为 `has_ethic = ethic_gestalt_consciousness`；同文件还提供 `is_hive_empire`（`has_authority = auth_hive_mind`）、`is_machine_empire`、`is_wilderness_empire`、`is_gestalt_node`。4.1.7 的 `common/` + `events/` 中 `is_gestalt` 出现 **2694** 次、`has_civic` **1597** 次、`has_building` **394** 次、`num_districts` **194** 次、`count_owned_planet` **30** 次 —— 这些都可直接使用。

**行星作用域**：`is_planet_class = pc_continental`、`has_building = building_capitol`、`num_districts = { type = district_mining value > 3 }`、`has_district = district_mining`、`planet_stability > 50`、`is_capital = yes`、`has_deposit = d_immense_engineering_deposit`。

**物种 / 人口作用域**：`has_trait = trait_decadent`、`pop_group_has_trait = trait_decadent`、`pop_has_ethic = ethic_fanatic_xenophile`、`is_robot_pop = yes`。

**迭代与计数**：`any_country = { … }`（存在任一满足者）、`any_owned_planet = { … }`、`any_fleet_in_orbit = { … }`；计数用 `count_<列表> = { limit = { … } count <运算符> N }`，例如 `count_owned_planet = { limit = { is_planet_class = pc_gaia } count > 1 }`。4.1.7 全库统计：`any_fleet_in_orbit` 15 次、`count_owned_planet` 30 次，而 `all_country`、`none_country`、`all_owned_planet`、`none_owned_planet` **均为 0 次** —— 引擎只提供 `any_` 与 `count_`，要表达“全部/无”用 `NOT = { any_… }` 或 `count_… = { count = 0 }`。

**旗标**：`has_country_flag = <flag>`（国家作用域）、`has_planet_flag`、`has_fleet_flag`、`has_ship_flag`、`has_war_flag`、`has_starbase_flag`、`has_sector_flag`、`has_pop_flag`、`has_leader_flag`、`has_federation_flag` 等各有其作用域；**`has_global_flag = <flag>` 的作用域是 `all`**，是全世界唯一的全局标记，与 `has_country_flag` 不可混用。

**存在性与 AI**：`exists = <目标作用域>`（可为 `all` 作用域）；`is_ai = yes`（country）。

**逻辑与流程**：块内默认 `AND`；`OR`、`NOT`（只接受一条）、`NOR`、`NAND`；`if = { limit = { … } … }` / `else_if` / `else`；`switch = { trigger = <触发器> <值> = { … } default = { … } }`；`calc_true_if = { amount >= 2 <条件> <条件> <条件> }`；`always = yes` / `always = no`。

**自定义提示文本**：`text = <loc 键>` 用于 `desc = { trigger = { … } text = … }` 这种条件描述；`success_text = { text = … <triggers> }` 与 `fail_text = { … }` 分别只在条件成立/不成立时显示。

**包裹块**：`hidden_trigger = { <条件> }` 隐藏其内部条件的 tooltip；`custom_tooltip = { text = … fail_text = … success_text = … <条件> }` 用自定义文本替换 tooltip；`custom_tooltip_success = { text = … <条件> }` 只在通过时显示。

**调试**：`log = <字符串>` 会向 `logs/game.log` 打印一条消息（作用域 `all`）。vanilla 自带现成的调试效果 `print_scope_effect`（`common/scripted_effects/00_scripted_effects.txt:16` 起），一次性把 `This / Root / Prev…PrevPrevPrevPrev / From…FromFromFromFrom` 全部打出来，排查作用域时直接调用它最省事；该文件同时演示了在脚本里写 loc 指令必须转义为 `\\[This.GetName]`。

```pdx
# common/scripted_triggers/my_mod_triggers.txt
my_mod_can_start_project = {
	exists = owner
	owner = {
		is_ai = no
		num_pops > 25
		has_technology = tech_zero_point_power
		has_country_flag = my_mod_prologue_done
		# 不同键之间是 AND；重复同一键按列表（OR）处理
		has_ethic = ethic_materialist
		has_ethic = ethic_fanatic_materialist
	}
}

# events/my_mod_trigger_events.txt
planet_event = {
	id = my_mod_trigger.1
	hide_window = yes
	is_triggered_only = yes

	trigger = {
		is_planet_class = pc_continental
		has_building = building_capitol
		# 迭代 + 计数
		count_owned_planet = {
			limit = { is_planet_class = pc_gaia }
			count > 0
		}
		NOT = { has_planet_flag = my_mod_already_scanned }
	}

	immediate = {
		set_planet_flag = my_mod_already_scanned

		custom_tooltip = {
			text = my_mod_scan_tooltip
			hidden_trigger = {
				any_owned_planet = { has_deposit = d_immense_engineering_deposit }
			}
		}

		if = {
			limit = {
				exists = owner
				owner = { is_ai = no }
				owner = { has_global_flag = my_mod_crisis_active }
			}
			log = "my_mod: continental capital scanned during crisis"
			owner = { add_resource = { physics_research = 150 } }
		}
	}
}
```

## 校验要点
- **以 vanilla 文件为唯一权威**：写任何触发器前先统计 `common/` + `events/` 中的出现次数；0 次就不要写。
- 每个触发器允许的作用域见 `logs/script_documentation/triggers.log` 的 scope 列；写之前先查。
- 在写“某对象满足某个计数”的条件时优先用 `count_<列表> = { limit = { } count <op> N }`，不要臆造通用 `count = { }`。
- `has_global_flag` 与 `has_country_flag` 语义不同：前者是全局单例，后者绑在国家上。
- tooltip 相关块（`hidden_trigger` / `custom_tooltip`）只影响显示，不影响判定结果；用 `debugtooltip` 控制台命令核对实际显示。
- 事件 `pre_triggers` 只接受固定白名单键（如 planet 的 `has_owner`、`is_homeworld`、`original_owner`、`has_ground_combat`、`is_capital`、`is_occupied_flag`、`is_ai`），写别的会报错。

## 常见错误
- 用 `==` / `!=`；用错作用域（如 `has_country_flag` 写在 planet 里）。
- 以为 `has_technology` 能接受任意字符串：它只在 country 作用域、且必须是真实科技键。
- 误用 `all_` / `none_` 前缀（4.1.7 全库 0 次）；它不存在，用 `NOT = { any_… }` 或 `count_… = { count = 0 }`。
- `NOT` 里塞多条条件：形式上常能跑，但会写 error.log，应改用 `NOR` / `NAND`。
- 触发器写在不存在的作用域上：会报错并常导致后续代码失效（相比之下，效果作用于不存在的作用域是静默无事）。

## 参考
- vanilla（本机 4.1.7）：`common/scripted_triggers/00_scripted_triggers.txt`（`is_gestalt` 定义在 1656 行、`is_hive_empire`、`is_wilderness_empire`、`is_autocracy`），`common/scripted_effects/00_scripted_effects.txt`（调试效果）
- [Conditions](https://stellaris.paradoxwikis.com/Conditions)（逻辑运算符、触发器总表、scripted triggers）
- [Scopes/Flat list of scopes](https://stellaris.paradoxwikis.com/Scopes/Flat_list_of_scopes)（`any_` / `count_` 迭代触发器清单）
- [Event_modding](https://stellaris.paradoxwikis.com/Event_modding)（`trigger`、`pre_triggers`、条件描述）
- [Dynamic_modding](https://stellaris.paradoxwikis.com/Dynamic_modding)（scripted triggers 与参数）

## 待确认
- **通用 `count = { }`**：未在触发器清单中找到这个通用形式，只有 `count_<列表> = { limit = { } count <运算符> <值> }`。若某个具体触发器内置了 `count` 参数（如 `count_war_participants`、`count_starbase_modules`），以该触发器的签名为准。
- **`is_gestalt` 的 brief 假设已推翻**：brief 把它列为“不确定、可能不存在”，但 4.1.7 的 `common/scripted_triggers/00_scripted_triggers.txt:1656` 明确定义了 `is_gestalt = { has_ethic = ethic_gestalt_consciousness }`，且在 `common/` + `events/` 中共出现 2694 次，可直接使用。需注意它是 **scripted trigger** 而非引擎触发器，因此会随 vanilla 补丁变动。

