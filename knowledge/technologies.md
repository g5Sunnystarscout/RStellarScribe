---
id: technologies
category: content
title: Technologies
title_zh: 科技
file_types: [common/technology/*.txt, common/technology/tier/*.txt, common/technology/category/*.txt]
tags: [cost, area, tier, category, prerequisites, weight, weight_modifier, potential, feature_flags, gateway, levels, technology_swap]
related: [civics-origins, traditions-perks]
sources: [https://stellaris.paradoxwikis.com/Technology_modding, https://stellaris.paradoxwikis.com/Modding]
verified_version: "4.1.7 / 3.1"
---
## 概要

科技定义在 `common/technology/`。一个科技条目主要描述四件事：属于哪个研究领域与层级、花多少科研点、以多大概率被抽为可研究卡、研究完成后给什么修正或解锁什么。层级与领域的框架分别由 `common/technology/tier/` 与 `common/technology/category/` 定义。游戏内文档是 `common/technology/000_documentation.txt`（内容很简短，只覆盖部分特性）。

## 文件位置与命名

- `common/technology/*.txt`：科技本体。vanilla 按领域与来源分文件（`00_eng_tech.txt`、`00_phys_tech.txt`、`00_soc_tech.txt`、`00_eng_tech_repeatable.txt` 等）。
- `common/technology/tier/00_tier.txt`：层级框架，键是**带引号的数字** `0`～`5`。
- `common/technology/category/00_category.txt`：研究类别，只定义图标。
- 覆盖类型：`technology` 为 **LIOS\*** + error.log `Duplicate technology: [tech]`。Wiki 特别提示：LIOS 覆盖大多仍生效，但**若覆盖版本缺少 `potential` 块，它会继承被覆盖科技的 `potential` 块**——这是最容易踩的坑。`technology/tier` 为 LIOS。

## 语法与字段

4.1.7 已核对字段：`cost`（整数或 `@变量`，也可写成 `cost = { factor = 1000 modifier = { factor = 0.5 <trigger> } }`）、`area`（`physics` / `society` / `engineering`）、`tier`（0～5）、`category = { <单个值> }`（花括号但不是数组）、`prerequisites = { key }`、`weight`、`weight_modifier`（内含 `factor = x` 与 `modifier = { factor/add <conditions> }`）、`ai_weight`、`potential`（普通 trigger）、`modifier`、`feature_flags`（**硬编码，不能自创**）、`gateway`（仅风味文本）、`ai_update_type`（`military` / `all`）、`start_tech`、`is_rare`、`is_dangerous`、`is_reverse_engineerable`、`levels`、`cost_per_level`、`weight_groups`、`mod_weight_if_group_picked`、`prereqfor_desc`、`technology_swap`。

**可重复科技没有 `is_repeatable` 字段**（4.1.7 的 `common/technology/` 下 **0 处**）。正确写法是 `levels = -1`（24 处）加 `cost_per_level`（29 处）；`levels = 5` 之类则表示有限层数。`weight_groups`（38 处）+ `mod_weight_if_group_picked`（39 处）用于抑制同类卡同时出现：抽到带某 weight group 的科技后，其它科技按 `mod_weight_if_group_picked` 里该组的倍率相乘（vanilla 可重复科技通常写 `repeatable = 0.4` 之类）。`technology_swap`（168 处）可让科技在特定条件下改名、改图标、改修正，并可覆盖 `area` 与 `category`（`category` 是**整体替换**，原本想要的类别要一并列出）。

关于 `weight_modifier` 与 `ai_weight` 的写法差异（易错）：`weight_modifier` 块内用 `factor = x` 做倍率（全目录 2186 处 `factor =`）；`ai_weight` 块首位最常见也是 `factor =`，但 vanilla 中同时存在 `weight =` 与 `base =` 两种写法（多见于较早期的 DLC 文件）。照同目录多数 vanilla 写 `factor` 最稳。

```pdx
# common/technology/zz_tidal_tech.txt
@tier2cost2 = 5000
@tier2weight1 = 85

tech_tidal_condensation = {
	cost = @tier2cost2
	area = physics
	tier = 2
	category = { field_manipulation }
	prerequisites = { "tech_power_plant_2" }
	weight = @tier2weight1

	is_rare = no
	ai_update_type = military

	potential = {
		NOT = { has_authority = auth_hive_mind }
	}

	feature_flags = {
		gateway_activation
	}

	modifier = {
		planet_jobs_energy_produces_mult = 0.10
	}

	weight_modifier = {
		modifier = {
			factor = 1.5
			has_ethic = ethic_materialist
		}
		modifier = {
			factor = 1.5
			research_leader = {
				area = physics
				has_trait = "leader_trait_expertise_field_manipulation"
			}
		}
	}

	ai_weight = {
		modifier = {
			factor = 1.5
			has_ethic = ethic_materialist
		}
	}

	prereqfor_desc = {
		ship = {
			title = "TECH_UNLOCK_TIDAL_CONDENSATION_TITLE"
			desc = "TECH_UNLOCK_TIDAL_CONDENSATION_DESC"
		}
	}
}

tech_repeatable_tidal_yield = {
	cost = @repeatableTechBaseCost
	cost_per_level = @repeatableTechLevelCost
	area = physics
	tier = 5
	category = { field_manipulation }
	levels = -1
	weight = 20

	modifier = {
		planet_jobs_energy_produces_mult = 0.05
	}

	weight_groups = { repeatable }
	mod_weight_if_group_picked = {
		repeatable = 0.01
	}
}

# common/technology/tier/00_tier.txt 的写法（层级键是数字，不是标识符）
# 2 = {
# 	previously_unlocked = 6
# 	weight_modifier = {
# 		base = 1
# 		complex_trigger_modifier = {
# 			trigger = num_researched_techs_of_tier
# 			parameters = { tier = 4 }
# 			mode = add
# 			mult = 0.2
# 		}
# 	}
# }

# common/technology/category/00_category.txt 只能定义图标
# field_manipulation = {
# 	icon = "gfx/interface/icons/technologies/categories/category_field_manipulation.dds"
# }
```

## 校验要点

- `area` 只有 `physics` / `society` / `engineering` 三值，写错会被静默丢弃。
- 4.1.7 的 13 个类别：`materials`、`propulsion`、`voidcraft`、`industry`、`field_manipulation`、`particles`、`computing`、`psionics`、`new_worlds`、`statecraft`、`biology`、`military_theory`、`archaeostudies`。注意 3.1 Wiki 写的 `rocketry` 在 4.1.7 已是 **`propulsion`**（改名），且新增了 `archaeostudies`。
- 层级解封门槛由 `previously_unlocked` 控制，4.1.7 vanilla 为 tier1 = 0、tier2～tier5 = 6（即需先研究 6 个上一层科技）。
- localisation：`tech_x` 名称、`tech_x_desc` 描述。`feature_flags` 的文本用 flag 本身作键、`<flag>_desc` 作 tooltip。
- cost/weight 的 `@tierNcostM` / `@tierNweightM` 常量来自 `common/scripted_variables/00_scripted_variables.txt`，模组可自行另建。
- 想验证"能不能被抽到"：`potential` 为假、或 `weight_modifier` 把权重乘成 0，都不会出卡；`weight` 乘 0 仍可由脚本或控制台给予。
- localisation 中 `<tech>_desc` 缺失不会报错，但 UI 会给空描述。

## 常见错误

1. 使用 `is_repeatable = yes`——该字段不存在；可重复科技请写 `levels = -1` + `cost_per_level`。
2. 覆盖 vanilla 科技时漏写 `potential`，于是继承了原科技的 `potential`，导致"我的科技对某些帝国永远不出现"。
3. 自创 `feature_flags`。所有 feature flag 都是硬编码的，只有引擎认识的才有意义（例如 `gateway_activation`）；自定义键只是纯文本。
4. 以为 `is_rare`/`is_dangerous` 会改变抽取概率——4.x 之前 Wiki 已明确它们只改颜色，稀有度要靠 `weight_modifier`（例如检查 `has_ascension_perk = ap_technological_ascendancy`）实现。
5. 在 `category` 里列多个类别以为能同时归类——它虽然用花括号，但每个科技只能有一个类别。
6. 用 `prerequisite`/`prerequisities` 等错拼；正确拼写是 `prerequisites`。

## 待确认

- "科技成本曲线由 1000 × 2^n 改为 500 × (2^n + 3^n)"这一说法出现在 2024 年的一次官方公告中，但无法确认它属于哪个具体补丁，也未在 4.1.7 文件中直接核对；写成本时请以现有 vanilla 值为基准。
- `common/technology_ages/`（4.x 新增，vanilla 仅含 `preftl/preftl_ages.txt`）的字段未核对，它与 `common/technology/` 的关系未见权威说明。
- 新增科技**类别**是否仍然不可能（3.1 Wiki 称只能改图标）。4.1.7 中类别数已从 12 增到 13，说明官方在版本间会自行增删，但未确认 mod 能否被正确识别新类别。

## 参考

- [Technology modding (Stellaris Wiki)](https://stellaris.paradoxwikis.com/Technology_modding)
- [Modding — Common folder 覆盖类型表 (Stellaris Wiki)](https://stellaris.paradoxwikis.com/Modding)
- 本地核对：`common/technology/000_documentation.txt`、`00_eng_tech.txt`、`00_eng_tech_repeatable.txt`、`tier/00_tier.txt`、`category/00_category.txt`（Stellaris Lyra v4.1.7）
