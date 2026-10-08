---
id: ships-components
category: content
title: Ships, Sections and Components
title_zh: 舰船、舰段与组件
file_types: [common/ship_sizes/*.txt, common/section_templates/*.txt, common/component_templates/*.txt, common/component_sets/*.txt, common/component_slot_templates/*.txt, common/global_ship_designs/*.txt, common/ship_behaviors/*.txt]
tags: [ship_sizes, section_templates, component_templates, component_sets, weapon_components, ship_design]
related: [megastructures-starbases, static-modifiers, gfx-entities]
sources: [https://stellaris.paradoxwikis.com/Ship_modding, https://stellaris.paradoxwikis.com/Ship_designer]
verified_version: "4.1.7 (file check)"
---

## 概要

舰船由三个层次拼装而成，**四者缺一不可**：

1. `ship_size`（`common/ship_sizes/`）—— 舰船"壳"：血量、速度、有哪些 section 槽、归类。
2. `section_template`（`common/section_templates/`）—— 舰段：能装在哪些 ship_size 的哪些槽上，提供哪些武器/通用槽。
3. `component_slot_template`（`common/component_slot_templates/`）—— "炮塔"：定义槽位尺寸、是武器还是舰载机、用哪个炮塔实体。
4. `component_template`（`common/component_templates/`）—— 实际组件：武器、通用、舰载机。

`ship_design`（`common/global_ship_designs/`）把上面三者组合成成品设计。

**重要发现（4.1.7 实测）**：`common/strike_craft/` **目录不存在**。舰载机组件定义在 `common/component_templates/` 中，根键是 `strike_craft_component_template`，与 `weapon_component_template`、`utility_component_template` 并列。Wiki 或旧教程提到 `common/strike_craft/` 时指的是更早的版本。

## 文件位置与命名

| 目录 | 根键 | 说明 |
| --- | --- | --- |
| `common/ship_sizes/` | `<key> = { }` | 有自带字段注释在 `00_ship_sizes.txt` 文件头 |
| `common/section_templates/` | `ship_section_template = { key = "..." }` | 舰段 |
| `common/component_slot_templates/` | `<key> = { }` | 炮塔槽模板 |
| `common/component_templates/` | `weapon_component_template` / `utility_component_template` / `strike_craft_component_template` | 有 `000_documentation.txt` |
| `common/component_sets/` | `component_set = { key = "..." }` | 组件分组 |
| `common/component_tags/` | — | 组件 tag 与 `ai_tags` 的注册表（`00_tags.txt`；**没有 `common/weapon_tags/`**） |
| `common/global_ship_designs/` | `ship_design = { }` | 预置设计，有 `000_documentation.txt` |
| `common/ship_behaviors/` | — | 战斗行为（`fighters_behavior` 等） |

## 语法与字段

### ship_sizes

```pdx
# common/ship_sizes/99_my_ships.txt
my_frigate = {
	formation_priority = @corvette_formation_priority
	max_speed = @speed_very_fast
	acceleration = 0.35
	rotation_speed = 0.1
	collision_radius = @corvette_collision_radius
	max_hitpoints = @corvette_hp
	modifier = {                       # 只允许有限修正集，见下
		ship_evasion_add = 0.6
	}
	ship_modifier = { ship_fire_rate_mult = 0.05 }   # 其余修正放这里

	size_multiplier = 1                # 战斗 AI 视作多大 & 占多少指挥点
	combat_size_multiplier = 1         # 覆盖 size_multiplier
	fleet_slot_size = 1                # 舰队排列顺序（护卫 1 … 泰坦 8）
	num_target_locators = 2

	section_slots = { "mid" = { locator = "part1" } }

	is_space_station = no
	is_civilian = no
	valid_target_aggressive_stance = yes
	is_space_object = no
	can_be_inspected = yes
	is_designable = yes
	enable_default_design = yes
	can_have_federation_design = yes
	components_add_to_cost = yes
	auto_upgrade = no
	can_disable = no
	flip_control_on_disable = no

	icon = ship_size_military_1
	icon_frame = 1
	role_background = "GFX_role_selection_corvette"
	ship_roles = { screen gunship artillery brawler }
	triggered_ship_roles = { { name = brawler_stealth trigger = { has_technology = tech_cloaking_1 } } }

	default_behavior = swarm
	base_buildtime = @corvette_build_time
	prerequisites = { "tech_corvettes" }

	class = shipclass_military        # shipclass_military / _military_special / _constructor /
	                                  # _colonizer / _science_ship / _transport / _starbase /
	                                  # _military_station / _mining_station / _orbital_station /
	                                  # _research_station / _observation_station
	construction_type = starbase_shipyard
	required_component_set = "power_core"
	required_component_set = "ftl_components"
	required_component_set = "thruster_components"
	required_component_set = "sensor_components"
	required_component_set = "combat_computers"

	potential_construction = { }      # 可在哪建造
	possible_construction = { }
	empire_limit = { base = 1 }

	resources = {
		category = ships
		upkeep = { energy = @corvette_upkeep_energy alloys = @corvette_upkeep_alloys }
	}
	min_upgrade_cost = { alloys = 1 }
}
```

`modifier` 与 `ship_modifier` 的分工是硬性规定。`modifier` 只接受：`ship_evasion_(add|mult)`、`ship_speed_mult`/`ship_base_speed_mult`、`ship_(hull|armor|shield)_(add|mult)` 与其 regen、`ship_weapon_damage`、`<槽位尺寸>_weapon_damage_mult`、`ships_upkeep_mult` 与 `ships_<resource>_upkeep_mult`、`ship_piracy_suppression_add`；基地还可加 `starbase_(module|building|defense_platform|shipyard)_capacity_add` 与 `starbase_(trade_collection_range|protection_range|protection)_add`。其余一律进 `ship_modifier`。

### section_templates

```pdx
# common/section_templates/99_my_sections.txt
ship_section_template = {
	key = "MY_FRIGATE_BOW"
	ship_size = my_frigate          # 可重复，声明兼容的 ship_size
	fits_on_slot = bow              # 可重复，匹配 ship_size 的 section_slots 名
	entity = "battleship_bow_XL1_entity"
	icon = "GFX_ship_part_core_bow"
	should_draw_components = yes    # 2.3.3 后失效
	prerequisites = { tech_energy_lance_1 tech_mass_accelerator_1 }  # 只需满足其一

	component_slot = {
		name = "EXTRA_LARGE_01"     # 同 section 内不可重名
		template = "invisible_extra_large_fixed"   # 指向 component_slot_templates
		locatorname = "xl_gun_01"   # 舰段实体上的定位点
	}

	large_utility_slots = 3
	medium_utility_slots = 0
	small_utility_slots = 0
	aux_utility_slots = 1

	resources = { category = ship_sections cost = { alloys = @section_cost } }

	ai_weight = {
		modifier = { factor = 10.0 NOT = { is_preferred_weapons = weapon_type_explosive } }
		modifier = { factor = 0.1 is_preferred_weapons = weapon_type_explosive }
	}
}
```

**注意**：`section_template` 的 `prerequisites` 只要求满足**其中任意一个**，与别的游戏对象"需全部满足"的语义相反。

### component_slot_templates

```pdx
# common/component_slot_templates/99_my_slots.txt
my_small_turret = {
	size = small                    # point_defence/small/medium/large/extra_large/titanic/
	                                # torpedo/planet_killer；舰载机用 small/medium/large
	component = weapon              # weapon 或 strike_craft
	is_fixed = no                   # yes = 炮塔不转，整舰转向瞄准
	entities = {                    # 按组件 tag 指定炮塔实体
		weapon_type_kinetic = "small_kinetic_gun_entity"
		weapon_type_energy = "small_laser_gun_entity"
		weapon_type_explosive = "turret_missile_small_entity"
	}
}
```

### component_templates

```pdx
# common/component_templates/99_my_weapons.txt
weapon_component_template = {
	key = "MY_SMALL_RED_LASER"
	size = small
	type = instant                  # 武器类字段之一
	icon = "GFX_ship_part_laser_1"
	icon_frame = 1
	power = @power_S1               # 负数=消耗电力，正数=提供电力
	prerequisites = { "tech_lasers_1" }
	component_set = "RED_LASER"
	projectile_gfx = "infrared_laser_s"
	tags = { weapon_type_energy s_slot }
	ai_tags = { weapon_role_anti_armor gunship }   # 需在 common/component_tags/00_tags.txt 预注册
	upgrades_to = "SMALL_BLUE_LASER"
	build_time = 5
	entity = "some_turret_entity"
	hidden = no
	should_ai_use = yes

	potential = {                   # THIS = 舰船设计, FROM = 国家
		from = { country_uses_bio_ships = no }
	}
	possible = { }                  # 限制与其它组件共存

	resources = {
		category = ship_components
		cost = { alloys = @s_t1_cost }
		upkeep = { energy = @s_t1_upkeep_energy alloys = @s_t1_upkeep_alloys }
	}
	ai_weight = { weight = @T1_weight }

	# —— 武器专属字段（在文件里或 weapon_components.csv 中定义）——
	# damage / min_damage / max_damage / min_windup / max_windup / total_fire_time
	# cooldown / range / max_range / min_range / accuracy / tracking / firing_arc
	# shield_damage / armor_damage / hull_damage / shield_penetration / armor_penetration
	# size_damage_factor / missile_speed / missile_evasion / missile_health / missile_armor
	# missile_retarget_range / point_defence_targets / prio_projectile
	# target_type / target_focus / use_ship_main_target / can_destroy_stars
	# on_hit / hide_damage_values_from_tooltip
}
```

`weapon_component_template` 的**数值字段主要来自 `common/component_templates/weapon_components.csv`**，而不是脚本体。CSV 表头为：

```
key;cost;power;min_damage;max_damage;hull_damage;shield_damage;shield_penetration;armor_damage;armor_penetration;min_windup;max_windup;cooldown;range;accuracy;tracking;size_damage_factor;military_power_multiplier;missile_speed;missile_evasion;missile_shield;missile_armor;missile_health;missile_retarget_range;end
```

CSV 中的值**会覆盖** `.txt` 里的同名值（`99_README_WEAPON_COMPONENTS_STAT_DOCS.txt` 明确说明：改 `.ods` 再导出为 **分号分隔、无文本定界符** 的 `.csv`）。CSV 中的 `cost` 与 `power` 会被用于生成组件；`.txt` 里的 `resources` 才是实际造价来源。

```pdx
# 通用组件
utility_component_template = {
	key = "MY_SMALL_SHIELD_1"
	size = small
	icon = "GFX_ship_part_shield_1"
	icon_frame = 1
	power = @power_S1
	modifier = { ship_shield_add = @shield_S1 ship_shield_regen_add_static = @regen_S1 }
	prerequisites = { "tech_shields_1" }
	component_set = "SHIELD_1"
	upgrades_to = "SMALL_SHIELD_2"
	resources = { category = ship_components cost = { alloys = @shield_s_t1_cost } upkeep = { energy = @shield_s_t1_upkeep_energy } }
	# 通用专属字段：sensor_range / hyperlane_range / ship_behavior / ftl / ftl_inhibitor
	#               / jumpdrive / armor_value / ftl_magnet / military_power
}
```

```pdx
# 舰载机（4.x 实测根键；没有 common/strike_craft/ 目录）
strike_craft_component_template = {
	key = "MY_STRIKE_CRAFT_HANGAR_1"
	size = LARGE
	entity = "bomber_entity"
	weapon_type = point_defence
	projectile_gfx = "strike_craft_laser_1"
	power = @power2
	count = 8
	regeneration_per_day = 0.5
	launch_time = 2
	damage = { min = 4 max = 8 }
	cooldown = 2.3
	range = 10
	engagement_range = 125
	accuracy = 1.00
	tracking = 0.70
	health = 5
	armor = 0
	shield = 10
	evasion = 0.60
	speed = 550
	rotation_speed = 0.8
	acceleration = 1
	shield_penetration = 1.0
	armor_damage = 1.5
	ship_behavior = "fighters_behavior"
	icon = "GFX_ship_part_strike_craft_scout_1"
	icon_frame = 1
	component_set = "SCOUT_HANGAR_1"
	upgrades_to = "STRIKE_CRAFT_HANGAR_1"
	tags = { weapon_type_strike_craft }
	ai_tags = { weapon_role_point_defense carrier }
	point_defence_targets = { "strike_craft" }
	resources = { category = ship_components cost = { alloys = @l_t1_cost } upkeep = { energy = @l_t3_upkeep_energy } }
}
```

### component_sets

```pdx
# common/component_sets/99_my_sets.txt
# 设计器用（可装多个不同尺寸）
component_set = {
	key = "RED_LASER"
	icon = "GFX_ship_part_laser_1"
	icon_frame = 1
}

# 核心组件用（每个 ship_size 必须至少能满足一个 required_component_set）
component_set = {
	key = "combat_computers"
	required_component_set = yes
	icon = "GFX_ship_part_computer"
	icon_frame = 1
}
```

### global_ship_designs

```pdx
# common/global_ship_designs/99_my_designs.txt
ship_design = {
	name = "NAME_Constructor"
	ship_size = constructor
	section = {
		template = "DEFAULT_CONSTRUCTION_SECTION"
		slot = "mid"
	}
	# 事件/太空生物常用：role / upgrades_to / creature_designer_template /
	# newborn_ship_design / country_type / fleet_specialization_tag /
	# use_design_name / is_event_design / allow_buildable_trigger /
	# is_special_buildable / graphical_culture / growth_stages = { { ... } }
}
```

### 图标与实体的对应关系

- **ship_size**：`icon = <sprite key>`（如 `ship_size_military_1`），会围绕它生成 `GFX_text_<key>`、`GFX_<key>`、`GFX_<key>_top`、`GFX_<key>_top_damaged`。`icon_frame` 现在只对恒星基地有意义。
- **核心实体（壳）**：按 `<gfx_culture>_<ship_size>_entity` 查找（如 `mammalian_01_corvette_entity`）。名字里不带文化前缀时，`<ship_size>_entity` 作为回退。`ship_size` 可用 `entity = some_entity` 直接覆盖这一查找。
- **舰段实体**：游戏按 `<gfx_culture>_<section_template 的 entity>_entity` 查找，再挂到 `section_slots` 指定的 locator 上。
- **炮塔实体**：按 `<gfx_culture>_<component_slot_template 的 entities 里的实体>_entity` 查找，挂到 `component_slot` 的 `locatorname` 上；炮塔实体需有 `turret_muzzle_01` 定位点。
- **组件图标**：`icon` 是 **GFX 键**（`"GFX_ship_part_laser_1"`），与 static_modifier 用 `.dds` 路径不同。
- **巨型结构/事件设计**用 `portrait = "GFX_..."`。

## 校验要点

1. 新建 ship_size 时，每个 `class` 都需要 `required_component_set` 覆盖到 `power_core`、`ftl_components`、`thruster_components`、`sensor_components`、`combat_computers`（民用船按需减少），否则自动设计生成失败、船造不出来。
2. `size` 与槽位尺寸必须匹配：武器组件只能进 `component = weapon` 的槽，舰载机只能进 `component = strike_craft` 的槽，且尺寸一致。
3. `component_slot` 的 `name` 在同一 section 内不可重复。
4. `tags` 用于组件分组与炮塔实体选择，`weapon_type_kinetic/energy/explosive` 这几个 tag 决定 `entities` 里取哪个炮塔实体。
5. 改武器数值优先改 `weapon_components.csv`（或 `.ods` 后导出），改 `.txt` 可能被 CSV 覆盖。
6. 检查 `error.log` 中缺失 GFX/entity 的报错；`-debug_mode` 有助于定位。

## 常见错误

- **找 `common/strike_craft/`**：4.x 不存在，写 `strike_craft_component_template` 到 `common/component_templates/`。
- **把武器数值写进 `.txt` 却发现不生效**：被 `weapon_components.csv` 覆盖了。
- **`modifier` 里写了非白名单修正**：静默失效，应放 `ship_modifier`。
- **`section_template` 的 `prerequisites` 以为要全部满足**：实际只需满足其一。
- **组件图标写成 `.dds` 路径**：组件用 GFX 键。
- **新 ship_size 少了 `required_component_set`**：AI 与自动设计生成失败。
- **`section_slots` 的 locator 名与实体上的 locator 不符**：舰段看不见或错位。

## 待确认

- `weapon_components.csv` 中 `type` / `windup` 等字段与 `.txt` 字段的**完整优先级规则**：README 只说明"CSV 值覆盖 `.txt` 值"，未逐字段列出。
- `component_templates/000_documentation.txt` 中 `class_restriction` / `size_restriction` / `ship_limit` / `blocked_by` 标注为 DEPRECATED（改用 `potential`/`possible`），但旧 mod 中仍常见，4.1.7 是否仍解析未实测。
- `friendly_aura` / `hostile_aura` 的完整子字段（`stack_info`、`graphics.area_effect`、`damage_per_day` 等）取自 3.0 时期文档，未逐字对照 4.1.7。
- `common/ship_behaviors/` 的字段未核对（Wiki 有 Data Structure 章节，本次未取）。
- `section_template` 的 `should_draw_components` 标注为 2.3.3 后失效，但 vanilla 4.1.7 仍写着 `yes`，其真实作用未确认。

## vanilla 核实记录（4.1.7）

| 结论 | 证据 |
| --- | --- |
| **`common/strike_craft/` 不存在** | `Test-Path` = **False**；舰载机定义在 `common/component_templates/00_strike_craft.txt`，根键 `strike_craft_component_template` |
| 舰载机字段 | 同上，`LARGE_SCOUT_HANGAR_1` 实测含 `count`/`regeneration_per_day`/`launch_time`/`damage = { min max }`/`cooldown`/`range`/`engagement_range`/`accuracy`/`tracking`/`health`/`armor`/`shield`/`evasion`/`speed`/`rotation_speed`/`acceleration`/`shield_penetration`/`armor_damage`/`ship_behavior`/`point_defence_targets`/`weapon_type`/`projectile_gfx` |
| `ship_size` 字段 | `common/ship_sizes/00_ship_sizes.txt` `corvette`（含 `section_slots = { "mid" = { locator = "part1" } }`、`fleet_slot_size`、`size_multiplier`、`num_target_locators`、`ship_roles`、`triggered_ship_roles`、`role_background`、`required_component_set`、`resources = { category = ships upkeep = {...} logistics = {...} }`、`enable_3dview_in_ship_browser`） |
| `modifier` vs `ship_modifier` 白名单 | `common/ship_sizes/00_ship_sizes.txt` 文件头注释：`modifier` 仅接受 hull/shield/armor/evasion/speed/weapon damage/upkeep 等，其余"use ship_modifier" |
| `icon` 生成规则 | 同文件头：`ship_size_military_1` 会生成 `GFX_text_<key>` / `GFX_<key>` / `GFX_<key>_top` / `GFX_<key>_top_damaged` |
| 舰段字段 | `common/section_templates/` + `common/component_templates/000_documentation.txt`；真实例 `ships` 中 `ship_section_template = { key = "BATTLESHIP_BOW_M2S4" ... }` |
| 炮塔槽字段 | `common/component_slot_templates/00_component_slots_turrets.txt`（`point_defence_turret` / `small_turret`，含 `size`/`component`/`entities`） |
| 组件全字段 | `common/component_templates/000_documentation.txt`（含 `power`、`modifier`、`ship_modifier`、`triggered_ship_modifier`、`triggered_ship_design_modifier`、`upgrades_to`、`upgrade_path`、`slot_restriction`、`target_weights`、`build_time`、`entity`、`hidden`、`friendly_aura`/`hostile_aura`、`should_ai_use`、`ai_weight`、`ai_tags`、`scripted_action`） |
| 武器数值来自 CSV | `common/component_templates/weapon_components.csv` 表头实测；`99_README_WEAPON_COMPONENTS_STAT_DOCS.txt` 说明"CSV 值覆盖脚本值" |
| 组件 tag 注册表 | **`common/component_tags/00_tags.txt`**（`weapon_role_anti_armor` 在第 11 行）；**`common/weapon_tags/` 不存在**（`Test-Path` = False） |
| `component_set` 字段 | `common/component_sets/00_required_sets.txt` 等；`required_component_set = yes` 为核心组件集标志 |
| `global_ship_designs` 字段 | `common/global_ship_designs/000_documentation.txt`；真实例 `common/global_ship_designs/global_ship_designs.txt` 的 `NAME_Constructor` / `NAME_Colonizer` 设计 |

**被推翻的假设**：`common/strike_craft/` 与 `common/weapon_tags/` 在 4.1.7 均**不存在**；武器伤害类字段（`damage`、`windup`、`range`、`accuracy`、`tracking`）**不在 `.txt` 脚本里**，而在 `weapon_components.csv`。

## 参考

- [Ship modding](https://stellaris.paradoxwikis.com/Ship_modding)
- [Ship designer（槽位尺寸与图标）](https://stellaris.paradoxwikis.com/Ship_designer)
- 游戏自带：`common/component_templates/000_documentation.txt`、`common/component_templates/99_README_WEAPON_COMPONENTS_STAT_DOCS.txt`、`common/global_ship_designs/000_documentation.txt`、`common/ship_sizes/00_ship_sizes.txt` 文件头注释
