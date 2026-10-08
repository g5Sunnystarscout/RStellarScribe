---
id: megastructures-starbases
category: content
title: Megastructures and Starbases
title_zh: 巨型结构与恒星基地
file_types: [common/megastructures/*.txt, common/starbase_levels/*.txt, common/starbase_modules/*.txt, common/starbase_buildings/*.txt, common/starbase_types/*.txt, common/system_types/*.txt]
tags: [megastructures, starbases, starbase_levels, starbase_modules, construction]
related: [ships-components, static-modifiers]
sources: [https://stellaris.paradoxwikis.com/Megastructure_modding, https://stellaris.paradoxwikis.com/Starbase_modding]
verified_version: "4.1.7 (file check)"
---

## 概要

一个恒星基地由**两半**组成，改的时候必须分清：

- **舰船部分（Ship part）**：太阳系视图里可见、能开火的那部分，由 `common/ship_sizes/`（如 `starbase_outpost`）、`section_templates`、`component_templates` 定义。
- **基地部分（Starbase part）**：GUI 里能造船、装模块、装建筑的那部分，由 `starbase_levels` / `starbase_modules` / `starbase_buildings` / `starbase_types` 定义。

巨型结构（Megastructure）是建造船（Constructor）在星系里造的大型太空物体，4.x 中其造价统一走 `resources = { cost = { } }` 经济单元，**而不是**旧文档里的裸 `build_cost`（见下方"待确认"）。

## 文件位置与命名

| 目录 | 用途 |
| --- | --- |
| `common/megastructures/*.txt` | 巨型结构（含 Habitat、Ring World 各阶段） |
| `common/starbase_levels/*.txt` | 基地等级（前哨/星港/星堡/星垒/星citadel…） |
| `common/starbase_modules/*.txt` | 模块（造船厂、锚地、机库…） |
| `common/starbase_buildings/*.txt` | 基地建筑（每基地每类只能一个） |
| `common/starbase_types/*.txt` | 基地类型（星港/造船厂/贸易枢纽…），主要影响 AI 自动建造 |
| `common/system_types/*.txt` | 星系类型（图例文本），受模块影响 |

游戏自带文档：`common/megastructures/99_README_MEGASTRUCTURES.txt`、`common/starbase_modules/00_example.txt`、`common/starbase_levels/00_starbase_levels.txt`（文件头即字段注释）。**这三份比 Wiki 新，优先看它们。**

## 语法与字段

### megastructures

```pdx
# common/megastructures/99_my_megastructure.txt
my_orbital_foundry_1 = {
	entity = "arc_crucible_stage_1_entity"
	construction_entity = "arc_crucible_stage_1_entity"
	construction_scale = 1.02        # 建造中占位实体缩放，默认 1.0
	portrait = "GFX_megastructure_arc_furnace_background"
	place_entity_on_planet_plane = yes
	entity_offset = { x = 0 y = 0 }
	scale_offset = yes
	use_planet_resource = yes        # 是否开采下方行星/恒星资源
	hide_name = no
	scales_with_planet = yes
	show_in_outliner = yes
	build_type = around_planet        # around_planet / inside_gravity_well / outside_gravity_well

	build_time = 360                  # 天
	dismantle_time = 360
	upgrade_desc = default            # default / hide
	# upgrade_from = { my_orbital_foundry_0 }
	prerequisites = { "tech_orbital_arc_furnace" }

	potential = { }                   # country scope
	possible = { }                    # galactic object scope, from = 建造国
	placement_rules = {
		planet_possible = { }         # planet scope, from = 建造国
	}
	dismantle_potential = { always = yes }   # megastructure scope
	dismantle_possible = {
		can_dismantle_megastructure = { TECH = tech_orbital_arc_furnace }
	}
	can_be_dismantled_by_non_owner = no
	should_ai_dismantle = { }
	victory_score = 1000

	resources = {                     # 4.x：造价/维护走经济单元
		category = megastructures
		cost = { unity = 500 }
		cost = {
			trigger = { country_uses_bio_ships = no }
			alloys = 500
		}
		upkeep = { energy = 20 }
	}

	dismantle_cost = {
		category = megastructures
		cost = { energy = 500 }
	}

	country_modifier = { }
	triggered_country_modifier = { potential = { } }
	station_modifier = { starbase_shipyard_capacity_add = 2 }   # 仅巨型船坞用
	ship_modifier = { }                                          # 仅巨型船坞用

	construction_blocks_and_blocked_by = self_type  # none / self_type / multi_stage_type
	build_system_tooltip = arc_furnace_tooltip
	custom_tooltip_requirements = LOC_KEY

	on_build_start = { }              # galactic object scope, from = 建造国
	on_build_cancel = { }
	on_build_complete = { }
	on_dismantle_start = { }
	on_dismantle_cancel = { }
	on_dismantle_complete = { }

	starbase = starbase_starport       # 建成后自动转为该基地等级
	ai_weight = { weight = 100 }
}
```

**升级链写法**：升级目标写 `upgrade_from = { 前置键 }`，前置键里不写指向；且**不要把同一个前置巨型结构写成两个不同升级目标的前置**。等级 4 科研枢纽这类只能靠事件获得的阶段用 `upgrade_desc = hide` 从升级列表隐藏。

**行星化巨型结构**（Habitat / Ring World）：建成后会生成行星并自我移除，脚本里用 `remove_megastructure = FROMFROM`；环世界宜居段另需 `trigger_megastructure_icon = yes` 效果，让该行星触发星系视图的巨型结构图标。

### starbase_levels

```pdx
# common/starbase_levels/99_my_levels.txt
starbase_level_my_fortress = {
	ship_size = starbase_my_fortress    # 必填：关联舰船尺寸
	next_level = starbase_level_citadel # 可选：升级去向
	show_in_outliner = yes              # 默认 yes
	display_empire_shield = no          # 默认 no
	display_map_icon = yes              # 默认 yes
	level_weight = 3                    # 用于宣称成本与"要求等级"的条件判断
	ai_weight = { weight = 4 }          # THIS = 基地, FROM = 国家
	picture = GFX_starbase_background   # 或 picture = { trigger = { } picture = xxx }
	potential_home_base = yes           # 默认 no：可否作为舰队母港
	can_always_dismantle = no           # 默认 no
}
```

### starbase_modules 与 starbase_buildings

```pdx
# common/starbase_modules/99_my_modules.txt
my_foundry_module = {
	icon = "GFX_starbase_shipyard"
	section = "ASSEMBLYYARD_STARBASE_SECTION"   # 挂到舰船部分的哪个 section
	construction_days = 180
	initial = no                       # yes = 开局首个基地自带
	starbase_type = all                # all / starbase / orbital_ring

	potential = { is_normal_starbase = yes }    # 是否出现在建造列表
	possible = { }                              # 是否可入建造队列
	replaceable = { }                           # 何时可移除
	abort_construction_trigger = { }            # 何时自动中止建造

	resources = {
		category = starbase_modules
		cost = { alloys = 50 }
		upkeep = { energy = 1 }
	}

	station_modifier = { starbase_shipyard_capacity_add = 1 }
	triggered_station_modifier = {
		potential = { has_starbase_building = irassian_naval_yards }
		starbase_shipyard_capacity_add = 1
	}
	country_modifier = { }
	system_modifier = { }              # 只影响本系内该国行星
	planet_modifier = { }
	orbit_modifier = { }               # 停靠本基地的舰船
	ship_modifier = { }                # 本基地建造的舰船
	defense_platform_modifier = { }
	equipped_component = <utility component key>   # 装上光环组件
	component_set = <component set key>
	custom_tooltip = LOC_KEY
	show_in_tech = "tech_xeno_linguistics"

	on_finished = { set_ship_construction_type = starbase_shipyard }
	on_destroyed = { }

	ai_build_at_chokepoint = yes
	ai_build_outside_chokepoint = yes
	ai_weight = { weight = 100 }
}
```

`starbase_buildings` 与模块字段**基本一致**，区别是：**不需要 `section`**（不影响舰船外观），且**每基地每类只能有一个**，所以 `possible` 里通常要写 `count_starbase_buildings = { type = <key> count < 1 }` 来防重复。

### starbase_types（AI 自动建造向导）

```pdx
# common/starbase_types/99_my_types.txt
my_shipyard_type = {
	potential = {                    # starbase scope
		has_starbase_size > starbase_outpost
		count_starbase_modules = { type = shipyard count > 0 }
	}
	weight_modifier = {              # 权重最高者胜出，决定基地"类型"称号
		base = 100
		modifier = { add = 100 count_starbase_modules = { type = shipyard count > 1 } }
	}
	ai_design = {
		min = { base = 1 factor = 1 }
		ratio = {
			base = 0.25
			modifier = { add = 0.10 exists = owner owner = { has_ethic = ethic_militarist } }
		}
		buildings = { crew_quarters = { base = 1.00 } fleet_academy = { base = 0.25 } }
		modules = { shipyard = { base = 1.00 } anchorage = { base = 0.50 } }
	}
}
```

## 校验要点

1. `starbase_levels` 的 `ship_size` 必须指向 `common/ship_sizes/` 中已定义的键，`next_level` 必须指向另一个等级键，否则升级链断裂。
2. 模块的 `section` 必须存在于 `common/section_templates/`，且该 section 的 `fits_on_slot` 要匹配基地舰船尺寸的 `section_slots`。
3. 巨型结构升级链不可分叉：一个前置只能对应一个升级目标。
4. `construction_blocks_and_blocked_by` 取 `none` / `self_type` / `multi_stage_type`（3.4 起取代了旧的 `construction_blocks_others` 与 `construction_blocked_by_others`）。不要只设其中一个方向。
5. 图例与新解锁提示：`show_in_tech` 让科技卡显示"解锁恒星基地模块"，`custom_tooltip_requirements` 让巨型结构显示额外要求。
6. `starbase_types` 不影响玩家可用性，只影响 AI 与界面称号——写错了不会导致崩溃，但 AI 不会建造。

## 常见错误

- **用旧字段 `build_cost` / `monthly_production` / `maintenance` 写巨型结构**：这些是 2.x 时代的写法，4.x 用 `resources = { cost/upkeep/produces }`。
- **给 `starbase_buildings` 写 `section`**：该字段对建筑无意义。
- **忘记防重复**：建筑每基地每类只能一个，`possible` 里没写 `count_starbase_buildings` 检查会导致重复入队后被中止。
- **`construction_blocks_and_blocked_by` 只设一个方向**：官方文档明确不推荐。
- **巨型结构升级链写成多方共享同一前置**：会导致升级面板异常。
- **模块 `icon` 用图片路径而不是 GFX 键**：模块和建筑用的是 **GFX 键**（如 `"GFX_starbase_shipyard"`），与 static_modifier 用 `.dds` 路径不同，别混。

## 待确认

- 官方 README 同时列了 `build_cost` / `maintenance` / `monthly_production`（旧式）与 `resources`（新式），但 4.1.7 的 vanilla 巨型结构（如 `orbital_arc_furnace_1`）只用 `resources`；旧式字段是否仍被解析未实测。**新写内容一律用 `resources`。**
- `common/megastructures/99_README_MEGASTRUCTURES.txt` 中 `is_ruined_orbital_ring`、`must_select_ship_design`、`outliner_trigger` 等字段在 4.1.7 的实际行为未逐一验证。
- 模块 `starbase_type` 的确切作用范围（注释称"不真正锁定组件，建议同时在 potential 里检查"）未进一步确认。
- `system_types` 的完整字段（`potential` / `weight_modifier`）取自 3.1 时期 Wiki，4.1.7 未逐字核对。

## vanilla 核实记录（4.1.7）

| 结论 | 证据 |
| --- | --- |
| 巨型结构用 `resources = { cost/upkeep }`，非 `build_cost` | `common/megastructures/17_orbital_arc_furnace.txt` `orbital_arc_furnace_1`：`resources = { category = megastructures cost = { unity = 500 } cost = { trigger = {...} alloys = 500 } upkeep = { energy = 20 } }` |
| 巨型结构完整字段 | `common/megastructures/99_README_MEGASTRUCTURES.txt`（含 `entity_offset`、`scale_offset`、`rotate_to_center`、`use_planet_resource`、`dismantle_cost`、`dismantle_time`、`dismantle_potential`、`dismantle_possible`、`on_dismantle_*`、`build_type`、`starbase`、`victory_score`） |
| 目录存在性 | `common/megastructures/`、`common/starbase_levels/`、`common/starbase_modules/`、`common/starbase_buildings/`、`common/starbase_types/`、`common/system_types/` 全部 `Test-Path` = True |
| `starbase_levels` 字段 | `common/starbase_levels/00_starbase_levels.txt` 文件头注释：`ship_size`(Required) / `next_level` / `show_in_outliner` / `display_empire_shield` / `display_map_icon` / `level_weight` / `ai_weight` / `picture` / `potential_home_base` / `can_always_dismantle` |
| 模块字段 | `common/starbase_modules/00_example.txt` 全字段注释；真实例 `common/starbase_modules/00_starbase_modules.txt` `shipyard`（含 `section`、`initial`、`on_finished`、`on_destroyed`、`abort_construction_trigger`） |
| 建筑无 `section`，需防重复 | `common/starbase_buildings/00_starbase_buildings.txt` `recruitment_office`：无 `section`，`possible` 用 `count_starbase_buildings = { type = recruitment_office count < 1 }` |
| `icon` 用 GFX 键 | 同上 `icon = "GFX_starbase_recruitment_office"`；模块 `icon = "GFX_starbase_shipyard"` |

**被推翻的假设**：`common/starbase_levels/` 并不存在"字段表在 Wiki"的问题——游戏自带注释比 Wiki 完整，Wiki 缺少 `picture`、`can_always_dismantle`；`build_cost` / `maintenance` / `monthly_production` 仍出现在 README 旧式示例中，但 4.1.7 的 vanilla 巨型结构**无一使用**。

## 参考

- [Megastructure modding](https://stellaris.paradoxwikis.com/Megastructure_modding)
- [Starbase modding](https://stellaris.paradoxwikis.com/Starbase_modding)
- [Ship modding（舰船部分）](https://stellaris.paradoxwikis.com/Ship_modding)
- 游戏自带：`common/megastructures/99_README_MEGASTRUCTURES.txt`、`common/starbase_modules/00_example.txt`、`common/starbase_levels/00_starbase_levels.txt`
