---
id: variables
category: script
title: Variables
title_zh: 变量与脚本常量
file_types: [common/scripted_variables/**, common/script_values/**, common/scripted_effects/**, events/**]
tags: [variable, scripted-variable, export, localisation, arithmetic]
related: [script-basics, effects, triggers, scopes]
sources: [https://stellaris.paradoxwikis.com/Variables, https://stellaris.paradoxwikis.com/Dynamic_modding, https://stellaris.paradoxwikis.com/Localisation_modding, https://stellaris.paradoxwikis.com/Effects]
verified_version: "3.14 / 4.0"
---
## 概要
Stellaris 有两套完全不同的“变量”，不要混淆：
- **作用域变量**：效果 `set_variable` 创建，绑定在某个作用域对象上并随存档持久化，可用 `check_variable` 判断、可参与运算与 localisation 显示。
- **脚本常量 `@`**：编译期文本替换，不是游戏对象，不参与运行时运算。

## 文件位置与命名
- 作用域变量在运行时创建，没有对应文件，但可用的作用域为：`megastructure planet country ship pop pop_group fleet galactic_object leader army ambient_object species bypass pop_faction war federation starbase deposit sector archaeological_site first_contact spy_network espionage_operation espionage_asset agreement situation astral_rift ship_growth_stage`。
- 脚本常量定义在 `common/scripted_variables/*.txt`；vanilla 实例：`common/scripted_variables/00_scripted_variables.txt` 里的 `@evopred_small_progress = 10`、`@evopred_medium_progress = 20`。wiki 要求该文件**以空行或注释行结尾**。
- 动态数值（相当于“可传参的 ai_weight”）定义在 `common/script_values/*.txt`，用 `value:<键>` 引用。
- 核对方法：`Get-ChildItem <游戏>\common,<游戏>\events -Recurse -File -Include *.txt | Select-String -Pattern '<键>' -SimpleMatch`。清单亦可由控制台 `trigger_docs` → `logs/script_documentation/effects.log` / `triggers.log` 导出。

## 语法与字段
**赋值与运算**（作用域 effect）：
- `set_variable = { which = <名> value = <数值/变量/作用域.变量/trigger:触发器> }`
- `change_variable` / `subtract_variable` / `multiply_variable` / `divide_variable` / `modulo_variable = { which = <名> value = … }`
- `set_variable_to_random_value = { which = <名> min = -100 max = 100 rounded = yes }`
- `clear_variable = <名>`、`round_variable = <名>`、`floor_variable = <名>`、`ceiling_variable = <名>`、`round_variable_to_closest`

**读取与判定**（作用域 trigger）：
- `is_variable_set = <名>`：**务必先判存在**。变量未设置时引擎按 0 处理但会报“未设置变量”错误。
- `check_variable = { which = <名> value = <…> }`：接受 `=`、`>=`、`>`、`<=`、`<`。
- `check_variable_arithmetic = { which = <名> add/multiply/… = <…> value <运算符> <值> }`：先做算术再比较，**不改变变量本身**，可重复多行。vanilla 实例：`check_variable_arithmetic = { which = value:num_active_research_labs value >= 5 }`（`common/country_focus/focus_cards/00_exploration_focus_cards.txt:318`）；`which` 可以直接是 `value:<脚本值>`。

**跨作用域取值**（v3.1 起）用点链：`value = owner.capital_scope.my_var`；也可直接取触发器或修正的值：`value = trigger:num_pops`、`value = modifier:pop_growth_speed_reduction`、`value:some_script_value`。

**导出（写变量）效果**：
- `export_trigger_value_to_variable = { trigger = planet_size variable = num_districts_terravore }`；若触发器自身带 `{ }`，把参数放进 `parameters`，例如 `export_trigger_value_to_variable = { trigger = count_deposits parameters = { type = d_lithoid_devastation } variable = <名> }`（`common/decisions/02_special_decisions.txt:1923`、`:1927`）。
- `export_modifier_to_variable = { modifier = <修正键> variable = <名> }`
- `export_resource_stockpile_to_variable = { resource = energy variable = <名> }`
- `export_resource_income_to_variable = { resource = energy variable = <名> }`
- `export_resource_maximum_to_variable = { resource = energy variable = <名> }`
- `export_modifier_duration_to_variable = { modifier = <修正键> variable = <名> }`
- `get_galaxy_setup_value = { which = <变量名> setting = <设置项> scale_by = <float> }`，设置项如 `num_empires`、`mid_game_year`、`crisis_strength_scale`、`tech_costs_scale` 等。

**变量能用在哪**：任何比较单个数值的触发器与效果、`while` 的 `count`、`add_modifier` 的 `multiplier`、`add_resource` 的 `mult`、资源表的 `multiplier`（必须位于 planet 作用域且不能点链）、MTTH / `ai_chance` 的 `add` / `factor`、`ordered_` 列表排序。

**`mult` / `value` / `min` / `max` 的正确语境**（不要混用）：
- `add_resource = { energy = 100 mult = <变量或 value:脚本值> }`——整体倍率；vanilla 里也有 `mult = -1` 用来扣资源（`common/inline_scripts/events/dynamic_resource_cost.txt:36`）。
- `add_monthly_resource_mult = { resource = unity value = 0.5 min = 10 max = 5000 mult = <变量> }`——按月度收入比例发放，并夹在 min/max 之间。
- `set_variable_to_random_value = { which = v min = -100 max = 100 }`——取值范围。
- `common/script_values` 里 `min` / `max` 是“低于/高于该值时夹紧”，`add` / `multiply` / `round` 等是运算。

**`@` 与 `$` 的区别**：
- `@`：脚本常量。文件内 `@name = 2` 只在本文件有效；写进 `common/scripted_variables/` 后全局共享。用法 `count = @example`。
- `$`：元脚本参数替换，用于 `scripted_effects` / `scripted_triggers` / `inline_scripts` 的传参（`$COUNT$`），也用于 localisation 里引用其它 loc 键（`$@cyborg_energy_upkeep$`）。两者不能互相替代。

**localisation 显示**：变量用 `[This.my_var]`（或 `[Scope.my_variable]`）；`set_saved_date` 存下的日期用 `[This.<flag>]` 显示。前提是变量已设置。

**精度**：浮点显示精度约 5 位。需要整数时先 `round_variable` / `floor_variable` / `ceiling_variable`。

```pdx
# common/scripted_variables/my_mod_variables.txt
# 该文件必须以空行或注释行结尾
@my_mod_gift_base = 300
@my_mod_gift_cap = 2000

# common/scripted_effects/my_mod_variable_effects.txt
my_mod_accumulate_gift = {
	# 未设置时先初始化，避免“未设置变量”报错
	if = {
		limit = { NOT = { is_variable_set = my_mod_gift } }
		set_variable = { which = my_mod_gift value = 0 }
	}

	# 累加：直接取触发器数值
	change_variable = {
		which = my_mod_gift
		value = trigger:num_pops
	}

	# 乘倍数并夹紧上限
	multiply_variable = { which = my_mod_gift value = 2 }
	if = {
		limit = { check_variable = { which = my_mod_gift value > @my_mod_gift_cap } }
		set_variable = { which = my_mod_gift value = @my_mod_gift_cap }
	}

	# 发放资源：用 mult 让整份资源按变量缩放
	add_resource = {
		energy = @my_mod_gift_base
		influence = 25
		mult = my_mod_gift
	}

	# 把修正值导出成变量，供其它事件比较
	export_modifier_to_variable = { modifier = logistic_growth_mult variable = my_mod_growth_mult }

	# 算术后比较（不改变变量本身）
	if = {
		limit = {
			check_variable_arithmetic = {
				which = my_mod_gift
				divide = 10
				value >= 50
			}
		}
		set_country_flag = my_mod_gift_high
	}
}
```

## 校验要点
- 使用变量前先 `is_variable_set`，否则 `error.log` 会堆满“unset variable”。
- `which = ` 后面只能直接写变量名，不能点链；跨作用域取值要写在 `value = ` 一侧（`value = owner.capital_scope.my_var`）。
- `clear_variable = <名>`（v3.0 起）用于回收，避免存档膨胀。
- `common/scripted_variables/*.txt` 必须以空行或注释行结尾，否则最后一个常量可能不被读入。
- 变量参与 localisation 显示时用 `[This.my_var]`，不要在 loc 里写 `[my_var]`。

## 常见错误
- 用 `@name` 去引用另一个文件里的文件级常量；文件级 `@` 不跨文件，跨文件必须放 `common/scripted_variables/`。
- 把 `$` 与 `@` 混用：`$` 只在 scripted effects / triggers / inline scripts / loc 中有意义。
- 写 `variable_arithmetic`：真正存在的名字是 **`check_variable_arithmetic`**（读取侧）与 `check_variable`。
- 在 `add_resource` 里给 `min` / `max`：`add_resource` 只有资源键与 `mult`，`min`/`max` 属于 `add_monthly_resource_mult`。
- 变量做过除法后当整数用，忘了 `round_variable` / `floor_variable`。

## 参考
- vanilla（本机 4.1.7）：`common/scripted_variables/00_scripted_variables.txt`（`@evopred_small_progress = 10` 等 `@` 常量）、`common/decisions/02_special_decisions.txt:1923`（`export_trigger_value_to_variable`）、`common/country_focus/focus_cards/00_exploration_focus_cards.txt:318`（`check_variable_arithmetic`）、`common/council_agendas/00_council_agendas_ethics.txt:270`（`add_resource` 的 `mult = value:…`）
- [Variables](https://stellaris.paradoxwikis.com/Variables)（可用作用域、命令、导出、精度、loc 显示）
- [Dynamic_modding](https://stellaris.paradoxwikis.com/Dynamic_modding)（scripted variables 与 `@`、script values、modifier 的 multiplier）
- [Localisation_modding](https://stellaris.paradoxwikis.com/Localisation_modding)（`[Scope.my_variable]`、`$` 代码）
- [Effects](https://stellaris.paradoxwikis.com/Effects)（各 export_* 效果与作用域）

## 待确认
- **`export_to_variable` 已确认不存在**：brief 列为待查，实测 4.1.7 全库 0 次。存在的导出效果是 `export_trigger_value_to_variable`、`export_modifier_to_variable`、`export_resource_stockpile_to_variable`、`export_resource_income_to_variable`、`export_resource_maximum_to_variable`、`export_modifier_duration_to_variable`。
- **`variable_arithmetic` 已确认不存在**：brief 列为待查，实测全库 0 次独立出现（`variable_arithmetic` 的 87 次命中**全部**来自 `check_variable_arithmetic` 的子串）。运行时用的是 `check_variable_arithmetic`（触发器）与 `change_variable` 系列（效果）。
- **`add_resource` 的倍率取值为脚本值而非仅变量**：brief 与 wiki 只提到 `mult = <variable>`，vanilla 实际写法为 `mult = value:country_assigned_priests`（`common/council_agendas/00_council_agendas_ethics.txt:270`），即 `value:` 脚本值同样合法；`add_resource` 是否还有本机 vanilla 未出现的其它参数，需要时查 `effects.log`。
- **变量在 MTTH / `ai_chance` 中与 `is_variable_set` 的组合写法**：wiki 示例为 3.6 版，未在 4.1.7 逐项实测。

