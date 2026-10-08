---
id: civics-origins
category: content
title: Civics and Origins
title_zh: 国民理念与起源
file_types: [common/governments/civics/*.txt]
tags: [potential, possible, random_weight, ai_weight, modifier, is_origin, swap_type, has_secondary_species]
related: [governments-authorities, traits-species]
sources: [https://stellaris.paradoxwikis.com/Government_modding, https://stellaris.paradoxwikis.com/Modding]
verified_version: "4.1.7 / 3.14"
---
## 概要

国民理念（civic）与起源（origin）定义在同一个目录、共用同一套结构；`is_origin = yes` 即为起源。一个帝国最多选一个起源，起源不参与政府改革，因此 civic 的部分字段对起源无意义。游戏内权威文档是 `common/governments/99_README_GOVERNMENT.txt`（旧 Wiki 引用的 `readme_requirements.txt` 已改名，内容一致：定义需求所用的"需求清单语法"）。4.1.7 的该目录包含 `00_civics.txt`、`00_origins.txt`、`01_origins_non_playable.txt`、`01_special_civics.txt`、`02_gestalt_civics.txt`、`03_corporate_civics.txt`。

## 文件位置与命名

路径 `common/governments/civics/*.txt`。该目录的覆盖类型是 **LIOS**（last in, only served），并在 error.log 记录 `Object key already exists`。加载顺序按文件名的 ASCII 序，`00_` 只排在最前，**`00_` 前缀本身并不会造成覆盖**：真正决定胜负的是目录的 FIOS/LIOS 属性加文件名排序。用自定义前缀（如 `zz_mymod_civics.txt`）重定义同名 civic 会覆盖 vanilla 并写一条 error.log，但不会连带替换 vanilla 文件里的其它 civic。只有**同目录同名文件**才是整文件替换——那是兼容性最差的做法，应避免。

## 语法与字段

civic/起源的已核对字段（4.1.7）：`playable`、`possible`、`potential`、`pickable_at_start`、`modification`（可为 yes/no，或 `{ moddable_conditions_custom_tooltip add remove }`）、`custom_tooltip_with_modifiers`、`random_weight`、`ai_weight`、`modifier`、`hide_modifiers`、`can_build_ruler_ship`、`traits`、`soft_traits`（起源专用）、`has_secondary_species`（内 `title`、`traits`）、`is_origin`、`description`、`negative_description`、`alternate_civic_version`、`swap_type`（内 `name`、`description`、`negative_description`、`trigger`、`modifier`）、`ai_playable`、`blocks_random_machine_empire_generation`（起源专用）。起源另有 `icon`、`picture`、`starting_colony`、`habitability_preference`、`advanced_start`、`preferred_planet_class_neighbor`、`non_colonizable_planet_class_neighbor`、`initializers`、`flags`、`max_once_global`。

`potential` 与 `possible` 都用**需求清单语法**，不是普通 trigger：只允许按类别的 `value = <key>` 加 `NOT/AND/OR/NOR`，块内可加 `text = <loc>` 覆盖自动提示。`potential` 是硬性兼容：为假时该 civic 从创建/改革界面完全消失，已选的也直接失效且**不给任何 tooltip**；`possible` 是软性门槛：仍可见但灰显，并自动生成"缺少什么"的提示。4.1.7 的 README 明确**允许**在类别块之间加外层 `OR/AND` 并可嵌套（3.0 时代 Wiki 称不可嵌套，已过时）。README 列出的类别为 `country_type`、`ethics`、`authority`、`civics`、`ship_categories`、`graphical_culture`；vanilla 4.1.7 实际还在使用 `origin` 与 `species_archetype`。`random_weight = { base = X }` 缺省为 1，越大越容易被随机抽中；**开局之后 AI 选新 civic 改用 `ai_weight`**。

```pdx
civic_tidal_engineers = {
	icon = "gfx/interface/icons/governments/civics/civic_tidal_engineers.dds"

	potential = {
		ethics = { NOT = { value = ethic_gestalt_consciousness } }
		authority = { NOT = { value = auth_corporate } }
	}

	possible = {
		ethics = {
			OR = {
				text = civic_tidal_engineers_requires_ethics
				value = ethic_materialist
				value = ethic_fanatic_materialist
				value = ethic_xenophile
			}
		}
		civics = { NOR = { value = civic_environmentalist } }
	}

	pickable_at_start = yes
	modification = yes

	random_weight = { base = 20 }
	ai_weight = { base = 10 }

	description = "civic_tidal_engineers_effects"
	negative_description = "civic_tidal_engineers_penalties"
	modifier = {
		planet_jobs_energy_produces_mult = 0.10
		planet_jobs_minerals_produces_mult = 0.05
		country_starbase_influence_cost_mult = -0.10
	}
}

origin_deepwater_cradle = {
	is_origin = yes
	icon = "gfx/interface/icons/origins/origins_deepwater_cradle.dds"
	picture = GFX_origin_deepwater_cradle

	starting_colony = pc_ocean
	habitability_preference = pc_ocean

	possible = {
		ethics = { NOT = { value = ethic_gestalt_consciousness } }
		species_archetype = { NOT = { value = MACHINE } }
	}

	description = "origin_deepwater_cradle_effects"

	has_secondary_species = {
		title = origin_deepwater_cradle_secondary_species
		traits = { trait = trait_ingenious }
	}

	advanced_start = yes
	max_once_global = yes
	random_weight = { base = 5 }
}
```

## 校验要点

- 用 `has_valid_civic = civic_x` 检查 civic，用 `has_origin = origin_x` 检查起源；二者在脚本中是不同的判断。
- localisation 约定（已核对 vanilla 键名）：`civic_x` 名称、`civic_x_desc` 风味文本、`civic_x_effects` 由 `description = "civic_x_effects"` 显式引用，**不存在**"自动拼 `_effects`"这回事；起源同理用 `origin_x` / `origin_x_desc`。
- 起源的 `picture` 必须是已在某处 `spriteType` 注册的 GFX 键；`icon` 是 dds 路径。
- 只有 `modifier` 块内的修正会真正生效，`description` 只是文本。

## 常见错误

1. 把 `potential`/`possible` 当普通 trigger 写（塞 `has_technology` 之类），README 明言属未定义行为。
2. 使用 `government_description`——4.1.7 的 `common/governments/civics/` 全目录 **0 处**，此字段不存在。效果说明请用 `description` + `negative_description`（后者 44 处）。
3. 写了 `random_weight = { modifier = { ... } }` 却没有 `base`，缺省权值变 1，几乎不会被抽中。
4. 以为 4.0 之后"物种特质不能用产出乘数，所以 civic 也不能"——错。4.0 取消的是**物种特质**的 job 产出乘数（改用 bonus workforce），帝国/行星级来源（civic、传统、建筑）的 `planet_jobs_*_produces_mult` 仍然有效（`planet_jobs_energy_produces_mult` 在 vanilla 中 107 处），且与 workforce 加成相乘。
5. 起源忘了 `is_origin = yes`，结果被当成普通 civic 占用理念槽。
6. 沿用 3.x 的 `local_human_origin` / `local_human_species_class` 条件——4.1.7 中这两个 trigger 均为 **0 处**（4.0 补丁说明已声明移除），帝国创建现在直接吃普通 trigger。

## 待确认

- `pickable_at_start`、`modification`、`cost` 对**起源**的实际生效程度（README 只说它们是 civic 语义）；`pickable_at_start` 在 4.1.7 的 civics 目录中**只出现在注释里（实际赋值 0 处）**，vanilla 完全不用，建议不要依赖它。
- README 未列出 `origin` / `species_archetype` 两个类别，但 vanilla 4.1.7 在使用（如 `00_civics.txt` 的 `auth_democratic` 用 `origin = {}`、`origin_necrophage` 用 `species_archetype = {}`）；官方文档可能滞后，未见正式说明。
- `swap_type` 的 `trigger` 作用域：3.0 Wiki 记为 global scope 且举例用 `local_human_species_class`，该 trigger 已在 4.0 移除，现应改用普通条件（如 `has_trait`），但未找到 4.x 权威说明。
- `soft_traits`（2 处）与 `alternate_civic_version`（28 处）确有 vanilla 用例，但语义只从文件头注释得知，未实测边界。

## 参考

- [Government modding (Stellaris Wiki)](https://stellaris.paradoxwikis.com/Government_modding)
- [Modding — Common folder 覆盖类型表 (Stellaris Wiki)](https://stellaris.paradoxwikis.com/Modding)
- 本地核对：`common/governments/99_README_GOVERNMENT.txt`、`common/governments/civics/00_civics.txt`、`00_origins.txt`（Stellaris Lyra v4.1.7）
