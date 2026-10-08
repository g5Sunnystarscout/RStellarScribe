---
id: jobs-buildings-districts
category: content
title: Jobs, Buildings and Districts
title_zh: 岗位、建筑与区划
file_types: [common/pop_jobs/*.txt, common/buildings/*.txt, common/districts/*.txt, common/zones/*.txt, common/zone_slots/*.txt]
tags: [pop_jobs, buildings, districts, zones, 4.0-rework]
related: [static-modifiers, economy-and-resources]
sources: [https://stellaris.paradoxwikis.com/Pop_Job_modding, https://stellaris.paradoxwikis.com/Building_modding, https://stellaris.paradoxwikis.com/District_modding]
verified_version: "4.1.7 (file check) / 3.x (wiki)"
---

## 概要

星球经济由四层对象构成：**岗位（job）** 产出资源，**建筑（building）** 与 **区划（district）** 提供岗位，**区划专精（zone，4.0 新增）** 决定区划提供哪一类建筑槽与岗位。建筑本身通常不直接产资源，而是通过 `planet_modifier` 加岗位（`job_xxx_add`），这是 vanilla 的一贯做法。

**4.0（Phoenix）是本条目最重要的一次重做**：引入 `common/zones/` 与 `common/zone_slots/` 两个新目录，区划必须声明 `zone_slots`，建筑必须归属至少一个 **building set**，pop 被聚合成 **pop group**，岗位产出的加成从"物种特质改产出"改为 **workforce（劳动力）** 机制。3.x 的写法在 4.x 下大部分仍能解析，但缺 `zone_slots` 的自定义区划不会正常出现在 UI 里。

## 文件位置与命名

| 目录 | 内容 |
| --- | --- |
| `common/pop_jobs/*.txt` | 岗位定义 |
| `common/buildings/*.txt` | 行星/分部/附属国建筑 |
| `common/districts/*.txt` | 区划 |
| `common/zones/*.txt` | 区划专精（**仅 4.x**） |
| `common/zone_slots/*.txt` | 区划槽（**仅 4.x**） |
| `common/pop_categories/*.txt` | 社会阶层（ruler/specialist/worker/slave…） |
| `common/job_tags/*.txt` | 岗位标签分组（**仅 4.x**） |

游戏自带的权威文档（强烈建议优先阅读，比 Wiki 新）：
`common/buildings/00_example.txt`、`common/districts/00_DOCUMENTATION.txt`、`common/zones/99_HOW_TO_ZONE.txt`、`common/pop_jobs/000_pretriggers.txt`。

命名注意：**4.x 的岗位根键是裸键**（`technician`、`researcher`），而生成的修正名仍带前缀 `job_technician_add`。Wiki 表格里写的 `job_key = { ... }` 是文档约定，不是真实根键名。

## 语法与字段

### 岗位（4.1 实测字段）

```pdx
# common/pop_jobs/my_jobs.txt  —— 4.x 写法
orbital_ecologist = {
	category = worker                    # 指向 common/pop_categories 的阶层键
	tags = { energy research }           # 4.x：岗位标签，须在 common/job_tags 注册

	swappable_data = {                   # 4.x：岗位"换皮"数据
		default = {
			condition_string = WORKER_JOB_TRIGGER
			building_icon = building_energy_grid
		}
	}

	possible_pre_triggers = {            # 性能优化用的快速前置判断
		has_owner = yes
		is_being_purged = no
		is_being_assimilated = no
		is_sapient = yes
	}
	possible_precalc = can_fill_worker_job
	possible = {                         # Pop scope
		hidden_trigger = { exists = owner }
		owner = { is_gestalt = no }
	}

	resources = {                        # 经济单元：产出与维护都在这里面
		category = planet_technician
		produces = { energy = 6 }
		produces = {
			trigger = { exists = owner owner = { is_robot_empire = yes } }
			energy = 2
		}
		upkeep = { consumer_goods = 1 }
	}

	planet_modifier = { planet_jobs_trade_produces_mult = 0.01 }
	triggered_planet_modifier = {
		potential = { always = yes }
		planet_amenities_add = 2
	}
	triggered_country_modifier = {
		modifier = { country_naval_cap_add = 1 }
		mult = planet.modifier:job_researcher_naval_cap_add
	}

	weight = {                           # 4.x：scope 为 pop_group
		weight = @worker_job_weight
		mult = value:job_weights_modifier|JOB|orbital_ecologist|RESOURCE|energy|
		modifier = { factor = 2 has_trait = trait_strong }
	}
}
```

### 岗位（3.x 写法差异）

3.x 的岗位根键同样是裸键（如 `researcher`），字段集合与 4.x 高度重合（`category` / `condition_string` / `building_icon` / `possible_pre_triggers` / `possible_precalc` / `possible` / `resources{produces,upkeep}` / `planet_modifier` / `triggered_planet_modifier` / `triggered_country_modifier` / `weight`），**但有三处必须区分**：

1. `weight` 的作用域是 **pop**（4.0 改为 **pop_group**）。
2. 4.x 新增 `tags`、`swappable_data`、`promotion`、`overlord_resources`、`possible_precalc`；3.x 无这些字段。
3. 物种特质的产出修正在 4.x 被移除，改为 workforce 系列。**4.1.7 实际注册的修正名**（取自 `modifiers.log`）是 `pop_workforce_mult`、`pop_bonus_workforce_mult`、`job_max_workforce_add`、`job_max_workforce_mult`，另有按阶层的 `pop_cat_worker_bonus_workforce_mult` 等。注意 Dev Diary #372 预告的 `pop_job_bonus_workforce_mult` / `pop_job_workforce_mult` 在 4.1.7 中**并不存在**，以日志为准。
4. 旧的 `pop_growth_speed` 在 4.1 已不存在，须改用 `logistic_growth_mult` / `bonus_pop_growth_mult`；`country_research_speed_mult` 也不存在。

### 建筑（4.1 实测字段）

```pdx
# common/buildings/my_buildings.txt
building_orbital_academy = {
	base_buildtime = 480
	category = research                 # pop_assembly/government/resource/manufacturing/
	                                    # research/trade/amenity/unity/army
	capital = no
	can_build = yes
	can_demolish = yes
	can_be_ruined = yes
	can_be_disabled = yes
	position_priority = 150

	building_sets = {                   # 4.x 必填：决定能建在哪些 zone 里
		research
	}

	planet_limit = { base = 1 }
	empire_limit = { base = 3 modifier = { add = 1 has_technology = tech_x } }

	potential = { exists = owner NOT = { has_designation = col_resort } }
	allow = { has_upgraded_capital = yes }
	destroy_trigger = { NOT = { exists = owner } }
	convert_to = { building_research_lab_1 }
	prerequisites = { "tech_research_lab_1" }

	resources = {
		category = planet_buildings
		cost = { minerals = 400 }
		upkeep = { energy = 2 }
	}

	triggered_planet_modifier = {
		potential = { exists = owner owner = { is_regular_empire = yes } }
		modifier = { job_researcher_add = 2 }
	}
	upgrades = { building_orbital_academy_2 }

	on_built = { owner = { set_country_flag = built_academy } }
}
```

3.x 建筑字段基本一致，差异在于：3.x 用 `is_capped_by_modifier` + `base_cap_amount` 控制上限，4.x 改成 `planet_limit = { base/modifier }` 与 `empire_limit = { base/modifier }`；4.x 的 `building_sets` 是硬性要求。生成修正：`<building_key>_max_add` 可提高该建筑上限。

### 区划（4.x）与 3.x 的区别

```pdx
# common/districts/my_districts.txt —— 4.x
district_orbital_farm = {
	base_buildtime = 240
	expansion_planner = yes
	# default_starting_district = yes     # 每个区划集只有一个"主区划"，通常给城市
	# has_primary_zone = yes              # 默认 yes
	is_uncapped = { is_farming_district_uncapped = yes }

	zone_slots = { slot_farming }         # 4.x 必填

	show_on_uncolonized = { uses_district_set = standard exists = from }
	potential = { uses_district_set = standard }
	allow = { is_special_colony_type = no }
	conversion_ratio = 1
	convert_to = { district_hive_1 }

	resources = {
		category = planet_districts_farming
		cost = { minerals = @base_cost }
		upkeep = { energy = 1 }
	}
	planet_modifier = { planet_housing_add = 200 }
	triggered_name = { trigger = { always = yes } text = district_orbital_farm }
}
```

区划与建筑同名冲突不存在，但 `potential` 返回 false 时 **区划会被移除或按 `convert_to` 转换**，建筑只是隐藏——这是两者最本质的语义差别。

3.x 的 district 没有 `zone_slots`，也没有 `is_uncapped` / `default_starting_district` / `has_primary_zone`，而是用 `is_capped_by_modifier` 与 `min_for_deposits_on_planet` / `max_for_deposits_on_planet` 控制数量。3.x 一个 district set 通常有 5 个区划，4.x 精简到 4 个（城市 + 3 个资源区划），合金/消费品改由 zone 提供。

### 区划专精 zone 与 zone slot（4.x 独有）

```pdx
# common/zones/my_zones.txt
zone_orbital_industry = {
	icon = GFX_district_specialization_urban
	base_buildtime = @zone_buildtime
	potential = { hidden_trigger = { exists = owner owner = { is_wilderness_empire = no } } }
	unlock = { hidden_trigger = { exists = owner } }

	resources = {
		category = planet_zones
		cost = { minerals = @zone_cost }
	}

	max_buildings = 3                    # 主区划一般 6，次级区划一般 3
	zone_sets = { urban habitat_urban }  # 每个 zone 至少属于一个 zone set

	triggered_district_planet_modifier = {   # 数值 × 已建区划数量
		planet_housing_add = 200
	}
	planet_modifier = { zone_building_slots_add = 3 }
	swap_type = district_nexus_factory   # 建造后把宿主区划换成另一类型
	swap_type_weight = 5
	ai_priority = 2
	ai_weight_coefficient = 0.5
}
```

```pdx
# common/zone_slots/my_zone_slots.txt
slot_city_01 = {
	included_zone_sets = { urban }
	unlock = { custom_tooltip = { fail_text = zone_city_02_prereq has_upgraded_capital = yes } }
}
slot_city_government = {
	start = zone_default                 # 开局自动装上这个 zone
	included_zone_sets = { zone_default }
	potential = { always = yes }
	unlock = { always = yes }
}
```

`district_planet_modifier` / `district_country_modifier` 是 **按已建区划数倍乘**，`planet_modifier` / `country_modifier` 只算一次，这是最容易写错的一处。

## 校验要点

1. 建筑必须有 `building_sets`，区划必须有 `zone_slots`，zone 必须有 `zone_sets` 与 `max_buildings`，否则 4.x 下不显示或报错。
2. `zone_slots` 里引用的 slot 必须在 `common/zone_slots/` 定义；slot 必须用 `include` 或 `included_zone_sets` 至少允许一个 zone。
3. 岗位产出写在 `resources = { produces = { ... } }` 内，不要写成顶层的 `produces`.
4. 本地化键：`<key>`、`<key>_desc`，岗位还有 `job_<key>_effect_desc`（用于 `triggered_desc`）。
5. 图标：建筑默认取 `gfx/interface/icons/buildings/<building_key>.dds`，并需在定义里显式写 `icon` 才会生效。
6. 用 `-debug_mode` 或 `error.log` 检查未注册的 tag、缺失的 building set、缺失的 zone slot。

## 常见错误

- **写顶层 `produces` / `upkeep`**：4.x 会解析失败或产出为 0，正确是放进 `resources`。
- **忘记 `building_sets`**：建筑不出现在任何 zone 的建造列表里。
- **自定义区划没写 `zone_slots`**：区划出现在 UI 但无法获得建筑槽，实际不可用。
- **混淆 `planet_modifier` 与 `triggered_district_planet_modifier`**：前者只生效一次，后者按区划数倍乘。
- **在 4.x 用 3.x 的旧修正名**（如 `pop_growth_speed`、`country_research_speed_mult`）：不存在，静默失效。必须先查 `logs/script_documentation/modifiers.log`。
- **认为 job 根键要加 `job_` 前缀**：根键是裸键，加了前缀会导致 `job_xxx_add` 找不到岗位。

## 待确认

- 3.x（3.14）岗位是否确实使用 `resources = { produces ... }` 还是顶层 `produces`：本机只有 4.1.7，3.14 文件未能取得，Wiki 正文（表格用 `resources`、问答段用 `resources`）与 3.x 时代留存的 vanilla 片段存在表述不一致，暂按"同为 `resources`"记录，需用 3.14 安装实测确认。
- `possible_precalc` 的合法取值集合（vanilla 见到 `can_fill_worker_job` / `can_fill_specialist_job` / `can_fill_ruler_job`），是否有其它值未确认。
- `swappable_data` 的完整子字段（`swap_type` / `weight` / `icon` / `name` / `desc` / `building_icon`）与 `condition_string` 的优先级关系未在官方文档中说明。
- 4.0 早期小版本（4.0.x）与 4.1.x 在 zone 字段上是否完全一致未逐版核对。

## vanilla 核实记录（4.1.7 = `D:\SteamLibrary\steamapps\common\Stellaris`）

以下字段均在游戏本体文件中实际读到，可直接对照：

| 字段 | 证据文件 | 备注 |
| --- | --- | --- |
| job 根键是裸键 | `common/pop_jobs/03_worker_jobs.txt:112` `technician = {` | 不是 `job_technician` |
| `resources = { produces/upkeep }` | `common/pop_jobs/03_worker_jobs.txt:148-170` | 产出在 `resources` 内 |
| `tags` | `common/pop_jobs/03_worker_jobs.txt:131` `tags = { energy }` | 值须在 `common/job_tags/00_tags.txt` 注册 |
| `swappable_data` | `common/pop_jobs/03_worker_jobs.txt:114-129` | 含 `swap_type`/`weight`/`icon`/`name`/`desc`/`building_icon` |
| `possible_precalc` | `common/pop_jobs/03_worker_jobs.txt:140` `possible_precalc = can_fill_worker_job` | |
| `promotion` | `common/pop_jobs/00_other_jobs.txt:657` | |
| `overlord_resources` | `common/pop_jobs/02_specialist_jobs.txt:131` | |
| `pop_group_modifier`（阶层上的） | `common/pop_categories/00_social_classes.txt:9` | 3.x 为 `pop_modifier` |
| `is_uncapped` | `common/districts/02_rural_districts.txt` `district_generator` | 取代 `is_capped_by_modifier` |
| `zone_slots` | `common/districts/00_urban_districts.txt` `district_city` | `slot_city_government` / `slot_city_01` / `slot_city_02` |
| `default_starting_district` | 同上 `district_city` | |
| zone 的 `max_buildings` / `zone_sets` / `swap_type` | `common/zones/00_zones.txt`（`zone_default` / `zone_urban` / `zone_factory_nexus`） | |
| `triggered_district_planet_modifier` | `common/zones/00_zones.txt` `zone_urban` | 按区划数倍乘 |
| slot 的 `start` / `included_zone_sets` | `common/zone_slots/00_zone_slots.txt`（`slot_city_government` / `slot_city_01`） | |
| 建筑必填 `building_sets` | `common/buildings/00_example.txt` | 文件注释明确"All buildings … must belong to at least one Building Set" |
| `planet_limit` / `empire_limit` | `common/buildings/00_example.txt` | 取代 `base_cap_amount` |
| `triggered_planet_pop_group_modifier_for_all/_for_species` | `common/buildings/00_example.txt` | |
| `army_modifier` / `system_modifier`（建筑上的） | `common/buildings/00_example.txt` | 本次未在正文展开 |

**被推翻的假设**：`common/buildable_districts/` 在 4.1.7 **不存在**（`Test-Path` 为 False）；`job_technician = {` 这种带前缀根键在 4.1.7 **不存在**。

## 参考

- [Pop Job modding](https://stellaris.paradoxwikis.com/Pop_Job_modding)
- [Building modding](https://stellaris.paradoxwikis.com/Building_modding)（含 Phoenix 4.0 迁移章节）
- [District modding / Zones modding](https://stellaris.paradoxwikis.com/District_modding)
- [Economy modding（Economy Units）](https://stellaris.paradoxwikis.com/Economy_modding)
- 游戏自带：`common/buildings/00_example.txt`、`common/districts/00_DOCUMENTATION.txt`、`common/zones/99_HOW_TO_ZONE.txt`
- Dev Diary #372 Modding: Pop Groups and Jobs（workforce 机制与 `pop_job_bonus_workforce_mult`）
