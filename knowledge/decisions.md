---
id: decisions
category: content
title: Decisions
title_zh: 决议
file_types: [common/decisions/*.txt]
tags: [potential, allow, effect, resources, enactment_time, ai_weight, owned_planets_only]
related: [events, scopes, triggers, effects, ai-weights, static-modifiers, custom-tooltips, localisation-basics]
sources: [https://stellaris.paradoxwikis.com/Decision_modding]
verified_version: "本机正式版 4.1.7 (Lyra) 文件实测；wiki Decision_modding 页标注 3.0"
---

## 概要

决议写在 `common/decisions/*.txt`。**顶层就是裸键 `<decision_key> = { ... }`，不需要 `decisions = { }` 包裹**——本机 21 个本体决议文件中 `decisions = {` 出现 0 次，而 `potential =` 出现 103 次。若照其他 PDX 作品的习惯套一层 `decisions = { }`，整个文件会被引擎当成一个名叫 `decisions` 的决议，里面所有真决议全部失效。

**行星决议也在同一个目录**：brief 里提到的 `common/planetary_decisions/` 在本机 4.1.7 的 `common/` 下**不存在**（`common/` 目录清单里只有 `decisions` 与 `planet_modifiers`，没有 `planetary_decisions`）。wiki 的"Planetary decisions"链接也是指向 `Decision_modding`。决议的作用域是 **planet**：`potential` / `allow` / `effect` 里的 `this` 都是行星，要够到国家就写 `owner = { ... }`（见 `decision_planet_food_boost` 的 `potential = { owner = { is_regular_empire = yes } }`）。

## 文件位置与命名

- 本体：`common/decisions/00_resource_decisions.txt`、`02_special_decisions.txt`（62 KB，主要参考）、`05_ancient_relics_decisions.txt` 等，以及 `example.txt`——**`example.txt` 是引擎自带的字段说明，全是被注释掉的模板键，先读它**。
- mod 新建唯一命名文件（如 `zz_my_mod_decisions.txt`）追加；同键名的决议会被后者覆盖。
- 图标资源目录：`gfx/interface/icons/decisions/`（本机存在）。
- 经济类别 `decisions` 定义在 `common/economic_categories/`，内容为 `decisions = { use_for_ai_budget = yes parent = country }`。

## 语法与字段

下面是一个完整可加载的行星决议，含条件化资源消耗、建造队列字段、AI 权重。`my_mod_*` 为占位名。

```pdx
# common/decisions/zz_my_mod_decisions.txt
my_mod_atmospheric_harvest = {
	owned_planets_only = yes
	sound = event_administrative_work
	icon = decision_resources          # gfx/interface/icons/decisions/ 下的文件名，不带路径与扩展名

	enactment_time = 180               # 天数；>0 走行星建造队列，可被取消；省略或 0 = 立即生效

	resources = {
		category = decisions           # 经济类别；决定消耗记在哪个"预算"里
		cost = {
			energy = 500
			influence = 25
		}
		cost = {                       # 可写多个 cost 块，用 trigger 做阶梯定价
			trigger = { pop_amount >= 1000 }
			energy = 1000
		}
	}

	prerequisites = {                  # 科技前置（只影响显示/解锁提示）
		"tech_my_mod_atmospheric_processing"
	}

	potential = {                      # planet 作用域：不满足则决议完全不显示
		owner = { is_regular_empire = yes }
		is_planet_class = pc_continental
		NOT = { has_planet_flag = my_mod_harvested }
	}

	allow = {                          # planet 作用域：不满足则显示但灰掉
		NOT = { has_modifier = my_mod_atmospheric_harvest_mod }
	}

	on_queued = {                      # 仅 enactment_time > 0 时才有意义
		set_planet_flag = my_mod_harvest_queued
	}

	on_unqueued = {
		remove_planet_flag = my_mod_harvest_queued
	}

	abort_trigger = {                  # 为真则中断已排队的决议
		NOT = { has_planet_flag = my_mod_harvest_queued }
	}

	abort_effect = {
		remove_planet_flag = my_mod_harvest_queued
	}

	effect = {                         # 决议真正执行时（planet 作用域）
		custom_tooltip = my_mod_atmospheric_harvest_effects
		hidden_effect = {
			set_planet_flag = my_mod_harvested
			add_modifier = {
				modifier = "my_mod_atmospheric_harvest_mod"
				days = -1              # -1 = 永久
			}
		}
	}

	ai_weight = {                      # 本机 96 处；同 random_list 的 factor/add 语义
		weight = 1
		modifier = {
			factor = 0
			owner = { has_resource = { type = energy amount < 600 } }
		}
	}
}
```

已核实字段清单（括号内为本机 `common/decisions/*.txt` 出现次数）：

- `potential`（103）、`allow`（49）、`effect`（105）、`ai_weight`（96）、`resources`（95）、`owned_planets_only`（99）、`icon`（89）、`sound`（62）、`enactment_time`（47）、`on_queued`（8）、`on_unqueued`（7）、`abort_trigger`（3）、`abort_effect`（2）、`prerequisites`（3）。
- `show_tech_unlock_if = { <triggers> }`：只见于 `common/decisions/example.txt` 的模板注释，**本体 0 处使用**。是否仍被引擎解析未验证，能用但不要依赖。
- **决议没有 `modifier = { }` 字段**（wiki 明确说明）。要做"持续加成"就在 `effect` 里 `add_modifier` 一个静态修正（`common/static_modifiers/`），需要取消时再给一个反制决议 `remove_modifier`。
- `custom_tooltip`（84）可写在 `effect` 或 `allow` 里，用于显示人工撰写的说明文字或失败原因。

## 校验要点

- **localisation 键约定（本机实测）**：标题是 `<decision_key>`，描述是 `<decision_key>_desc`。证据：`localisation/english/megacorp_l_english.yml:3077` 的 `decision_planet_food_boost:0 "Encourage Planetary Growth"` 与 3078 行的 `decision_planet_food_boost_desc:1 "..."`，对应 `common/decisions/00_resource_decisions.txt:4` 的 `decision_planet_food_boost = {`。
- `_desc` 引擎不会自动生成：缺了它决议窗口描述区为空白，但不报错。
- 额外的说明文字用**自定义键**，在 `effect` 里用 `custom_tooltip` 引用。本体惯例后缀是 `_effects`（如 `decision_baol_life_seed_effects`、`decision_stripmine_planet_tooltip`，后者由 `custom_tooltip = decision_stripmine_planet_tooltip` 引用）。`_tooltip` / `_effects` / `_custom_tooltip` 只是命名习惯，**引擎不识别后缀，只认你在 `custom_tooltip` 里写的那串键**。
- loc 文件必须 UTF-8 with BOM、文件名以 `_l_english.yml` 结尾、首行 `l_english:`、键前有缩进。
- `resources` 的 `category` 必须是 `common/economic_categories/` 里真实存在的类别（决议用 `decisions`）。
- `icon` 必须是 `gfx/interface/icons/decisions/` 下的真实文件名（不含路径与扩展名），否则决议按钮显示占位图。
- 作用域：全部字段都在 planet 作用域求值。要用星球标志就 `set_planet_flag`（`has_planet_flag` 本体 2142 处、`remove_planet_flag` 350 处），不要误用 `set_country_flag`。
- `enactment_time > 0` 的决议会进入行星建造队列，**未殖民行星没有可见的建造队列 UI**，此时应写 `enactment_time = 0`（wiki §Decisions On Uncolonized Planets）。

## 常见错误

- 套一层 `decisions = { ... }`：本机 0 处此写法，真决议全部失效。
- 去 `common/planetary_decisions/` 找行星决议：该目录不存在，决议一律在 `common/decisions/`。
- 在决议里写 `modifier = { ... }` 期望持续加成：决议不支持该字段，必须走 `add_modifier` + 静态修正。
- `potential` 写得太宽泛（例如只写 `always = yes`）：决议会出现在银河系每一颗行星上，包括未殖民星体。
- 用 `owned_planets_only = no` 却给了非 0 的 `enactment_time`：玩家看不到也无法取消进度。
- `abort_trigger` / `abort_effect` 只在有建造队列流程时才有意义；`enactment_time = 0` 时写了也不会触发。
- 忘了写 `potential`，只写 `allow`：决议会在不该出现的地方显示。
- 变量化资源消耗时把多个阶梯都写成同一个 `cost = { }` 块（键重复覆盖），必须拆成多个 `cost` 块各带 `trigger`。

## 待确认

- brief 问"是否需要 `decisions = { }` 包裹""行星决议在 `common/decisions/` 还是别处"：**不需要包裹**（0 处，正文已改）；**不存在 `common/planetary_decisions/`**（目录清单已核，正文已改）。
- `show_tech_unlock_if` 仅出现在 `common/decisions/example.txt` 注释中、本体 0 处使用；wiki 也未列该字段。无法确认引擎是否仍解析它。
- brief 问"决议是否支持消耗资源与 cost 写法"：**支持**，`resources = { category = decisions cost = { <resource> = <int> } }`，且 `cost` 支持多个带 `trigger` 的阶梯块（依据 `decision_planet_luxuries_boost`，`00_resource_decisions.txt:47`）。
- 决议的 `potential` 是否支持 `pre_triggers` 类的性能优化未验证（本机决议文件中未见）。
- `on_queued` / `on_unqueued` / `abort_effect` 在 4.1.7 中的精确触发时机（例如玩家手动从队列移除时是否一定走 `on_unqueued`）未做游戏内实测。

## 参考

- [Decision modding（字段表与 "prospect" 决议范例）](https://stellaris.paradoxwikis.com/Decision_modding)
- 本机 `Stellaris/common/decisions/example.txt`（引擎自带决议字段模板，4.1.7）
- 本机 `Stellaris/common/decisions/00_resource_decisions.txt`（阶梯 cost、ai_weight 真实范例）
- 本机 `Stellaris/common/decisions/02_special_decisions.txt`（on_queued / abort_trigger 真实范例）
- 本机 `Stellaris/localisation/english/megacorp_l_english.yml:3077-3078`（`<key>` / `<key>_desc` 键名证据）
- 本机 `Stellaris/common/economic_categories/*.txt`（`decisions` 经济类别定义）
- [cwtools-stellaris-config: config/common/decisions.cwt](https://github.com/cwtools/cwtools-stellaris-config/blob/master/config/common/decisions.cwt)（CWTools 的决议字段定义，用于游戏外静态校验）
