---
id: static-modifiers
category: content
title: Static, Event, Planet and Opinion Modifiers
title_zh: 静态修正、事件修正、行星修正与外交观点修正
file_types: [common/static_modifiers/*.txt, common/planet_modifiers/*.txt, common/opinion_modifiers/*.txt, common/scripted_modifiers/*.txt]
tags: [static_modifiers, event_modifiers, planet_modifiers, opinion_modifiers, modifiers]
related: [jobs-buildings-districts, localisation-basics]
sources: [https://stellaris.paradoxwikis.com/Modifiers, https://stellaris.paradoxwikis.com/Opinion_modifier_modding, https://stellaris.paradoxwikis.com/Economy_modding]
verified_version: "4.1.7 (file check)"
---

## 概要

"修正"（modifier）是 Stellaris 脚本的最小效果单元，本质是 `修正名 = 数值` 的列表。定义修正的容器有四种，用途完全不同：

- `common/static_modifiers/*.txt` —— 通用容器。既放引擎硬编码引用的基础修正（`empire_base`、`*_deficit`），**也放全部事件修正**（4.x 中已无独立的事件修正目录）。
- `common/planet_modifiers/*.txt` —— 星系生成时随机贴到行星上的"行星特征"，带 `spawn_chance` 权重。
- `common/opinion_modifiers/*.txt` —— 外交观点修正，用 `opinion = { base }` 与 `decay = { base }`。
- `common/scripted_modifiers/*.txt` —— 可复用的修正片段，供其它脚本 `inline_script` 或 `scripted_modifier` 调用。

**关键结论（实测 4.1.7）**：`common/event_modifiers/` **目录不存在**。事件里用 `add_modifier = { modifier = <key> }` 添加的修正，其 `<key>` 就定义在 `common/static_modifiers/` 下。3.x 存在 `common/event_modifiers/`，从 3.x 迁移的 mod 需要把这个目录合并进 `common/static_modifiers/`。

## 文件位置与命名

| 目录 | 是否强制引用 | 说明 |
| --- | --- | --- |
| `common/static_modifiers/` | 部分键名被代码引用，不可改名 | 其余可自由命名，供 `add_modifier` 使用 |
| `common/planet_modifiers/` | 可自由命名 | 通过 `spawn_chance` 参与星系统生成 |
| `common/opinion_modifiers/` | 部分为硬编码，不可改名/删除 | 文件内明确标注 "HARD FIXED STATE" |
| `common/scripted_modifiers/` | 可自由命名 | 只作片段复用，不直接生效 |

`common/static_modifiers/000_readme.txt` 说明了 `custom_tooltip` 的 `$VARIABLE$` 格式化语法（`%`、`0-9`、`=`、`+`、`-`、`_`、`(N)` 等），写自定义 tooltip 前值得一读。

## 语法与字段

### static_modifiers

```pdx
# common/static_modifiers/99_my_modifiers.txt
my_orbital_boom = {
	planet_jobs_energy_produces_mult = 0.25
	planet_max_buildings_add = 1
	pop_happiness = 0.05

	icon = "gfx/interface/icons/planet_modifiers/pm_strong_magnetic_field.dds"
	icon_frame = 2
}

my_empire_trait = {
	country_unity_produces_mult = 0.10
	country_admin_cap_add = 20
	ship_science_speed_mult = 0.15
}
```

字段只有三类：**修正键值对**、`icon`（`.dds` 路径字符串，**不是 GFX 键**）、`icon_frame`（图标帧序号）。**static_modifier 内部没有 `triggered_` 前缀机制**——实测 4.1.7 的 `common/static_modifiers/*.txt` 中匹配 `^triggered_.* = {` 的数量为 0。需要条件化请改用 `triggered_planet_modifier`（建筑/区划/岗位）或 `scripted_modifiers`。

引擎硬编码引用的示例（不可改名）：`empire_base`、`player_empire`、`playable_ai_empire`、`non_playable_ai_empire`、`empire_size_over_cap`、`empire_size`，以及资源赤字修正 `energy_deficit` / `minerals_deficit` / `food_deficit` / `influence_deficit` / `alloys_deficit` / `consumer_goods_deficit` / `volatile_motes_deficit`。资源在 `common/strategic_resources/` 里用 `deficit_modifier = <static modifier key>` 指向它们。

4.x 已支持 **pop group 定向修正**：`triggered_planet_pop_group_modifier_for_all` 与 `triggered_planet_pop_group_modifier_for_species`（见 `common/buildings/00_example.txt`），修正值按 pop group 规模比例分摊。

### planet_modifiers（行星特征）

```pdx
# common/planet_modifiers/99_my_planet_modifiers.txt
pm_my_ion_storm = {
	spawn_chance = {
		base = 20
		modifier = {
			add = 30
			is_planet_class = "pc_desert"
		}
		modifier = {
			factor = 0
			has_modifier = pm_my_other_modifier
		}
	}

	planet_jobs_physics_research_produces_mult = 0.10
	pop_environment_tolerance = -0.05

	icon = "gfx/interface/icons/planet_modifiers/pm_hazardous_weather.dds"
	icon_frame = 2
}
```

### opinion_modifiers（外交观点）

```pdx
# common/opinion_modifiers/99_my_opinion.txt
opinion_my_border_dispute = {
	opinion = {
		base = -20
		modifier = {
			add = -10
			has_ethic = "ethic_militarist"
		}
	}

	decay = {
		base = 1
	}
}
```

`opinion` 是固定数值，`decay` 是每月自然消退量。vanilla 中大量条目属于硬编码状态（宣战、同盟等），文件里有明确警告，不要删除或改名。

### 常用修正名清单（已在 4.1.7 `modifiers.log` 中核对）

- 帝国经济：`country_unity_produces_mult`、`country_physics_research_produces_mult`、`country_society_research_produces_mult`、`country_engineering_research_produces_mult`、`country_alloys_produces_mult`、`country_consumer_goods_produces_mult`、`country_resource_max_add`、`country_naval_cap_add`、`country_admin_cap_add`、`country_edict_fund_add`
- 行星岗位（`planet_jobs_<资源>_produces_add|_mult`、`..._upkeep_mult`）：`energy`、`minerals`、`food`、`physics_research`、`society_research`、`engineering_research`、`unity`、`trade`、`influence`、`alloys`、`consumer_goods`、`volatile_motes`、`exotic_gases`、`rare_crystals`、`sr_living_metal`；另有总括的 `planet_jobs_produces_mult`
- 行星人口与秩序：`planet_housing_add`、`planet_amenities_add`、`planet_stability_add`、`planet_crime_add`、`planet_max_buildings_add`、`pop_happiness`、`pop_political_power`
- 人口增长：`logistic_growth_mult`、`bonus_pop_growth_mult`、`pop_decline_speed`、`pop_purge_speed`
- 岗位劳动力（4.x）：`pop_workforce_mult`、`pop_bonus_workforce_mult`、`job_max_workforce_add`、`job_max_workforce_mult`、`pop_cat_worker_bonus_workforce_mult`
- 舰船：`ship_hull_add`、`ship_armor_add`、`ship_shield_add`、`ship_evasion_add`、`ship_speed_mult`、`ship_weapon_damage`、`ship_fire_rate_mult`、`ship_science_speed_mult`、`ship_science_upkeep_mult`
- 恒星基地：`starbase_module_capacity_add`、`starbase_building_capacity_add`、`starbase_defense_platform_capacity_add`、`starbase_shipyard_capacity_add`、`starbase_trade_protection_add`
- 岗位数量：`job_<job_key>_add`、`job_<job_key>_per_pop`、`job_<job_key>_per_crime`（岗位根键是裸键，此处才加 `job_` 前缀）
- 上限类：`<building_key>_max_add`、`<district_key>_max_add`

**易踩的坑（这些名字在 4.1.7 中不存在）**：`ship_science_cost_mult`、`country_research_speed_mult`、`pop_growth_speed`、`ship_weapon_damage_mult`（正确是 `ship_weapon_damage`）、裸 `stability`（正确是 `planet_stability_add`）、`country_administrative_capacity`（正确是 `country_admin_cap_add`）。

### 如何自查完整修正列表

游戏运行时会导出全部合法修正名，这是**唯一权威来源**：

```
<Documents>\Paradox Interactive\Stellaris\logs\script_documentation\modifiers.log
```

同目录还有 `triggers.log`、`effects.log`、`scopes.log`、`localizations.log`。每行格式为 `- <modifier_name>, Category: <A>, <B>`，4.1.7 约有 45500 行。注意该文件在**启动一次游戏后**才生成/刷新，改完 mod 想核对新加入的修正名，需要先跑一次游戏。`Category` 只是内部用途标签，不代表严格的 scope 限制（如 Pops 类修正放在行星/国家上也有效）。

## 校验要点

1. `icon` 是 `.dds` 文件路径字符串，写成 `GFX_...` 会静默失效。
2. 修正名的拼写必须与 `modifiers.log` 完全一致，错一个词就静默无效果——不会报错。
3. 事件修正放在 `common/static_modifiers/`；不要再新建 `common/event_modifiers/`。
4. 想给修正加条件，用 `triggered_planet_modifier` / `triggered_country_modifier`（属于建筑、区划、岗位、zone），不要试图给 static_modifier 加 `triggered_` 前缀。
5. 覆盖 vanilla 的 static modifier 时注意：同名键会整体覆盖，且部分键被代码硬引用，删除会导致引用处失效。

## 常见错误

- **在 `common/event_modifiers/` 里定义事件修正**：3.x 可用，4.x 该目录不被读取（实测 4.1.7 不存在），`add_modifier` 会找不到键。
- **把 `icon` 写成 GFX 键**：不报错但无图标。
- **给 static_modifier 加 `triggered_` 前缀**：不被识别。
- **沿用 3.x 旧修正名**：静默失效。迁移 mod 时务必用 `modifiers.log` 逐个核对。
- **删除 `common/static_modifiers/00_static_modifiers.txt` 中被硬编码引用的键**（`empire_base` 等）。

## 待确认

- `common/event_modifiers/` 在 3.x 中被移除的确切版本号未逐版核对（4.1.7 确定不存在，Wiki 的 Modifiers 页面未明确给出迁移时点）。
- `icon_frame` 在 static_modifier 中的语义（推测为雪碧图帧序号）未在官方文档中说明。
- `common/planet_modifiers/` 中 `potential = { }` 的完整可用条件集合未确认（文件注释仅称"now you can use potential in these too"）。
- `notification_modifiers/` 与 `common/scripted_modifiers/` 的完整字段未逐一核对。

## vanilla 核实记录（4.1.7）

| 结论 | 证据 |
| --- | --- |
| `common/event_modifiers/` 不存在 | `Test-Path` = **False**；`Get-ChildItem common -Directory` 无此目录 |
| 事件修正定义在 static_modifiers | `evermore_science` → `common/static_modifiers/10_static_modifiers_ancient_relics.txt:413`；`lithoids_arc_site_minerals` → 同文件 `:121`；`pm_planetary_mechanocalibrator` → 同文件 `:71` |
| 用 `add_modifier` 引用 | `events/ancient_relics_arcsite_events_1.txt:3010` `add_modifier = { modifier = pm_planetary_mechanocalibrator }` |
| static_modifier 无 `triggered_` 前缀机制 | `Select-String -Path common\static_modifiers\*.txt -Pattern '^triggered_[a-z_]*\s*=\s*\{'` 命中 **0** |
| `icon` 是 `.dds` 路径 | `common/static_modifiers/00_static_modifiers.txt:272、384、393` 等，如 `icon = "gfx/interface/icons/planet_modifiers/pm_dangerous_wildlife.dds"`，紧随 `icon_frame = 2` |
| 硬编码键 | `empire_base` / `player_empire` / `playable_ai_empire` / `non_playable_ai_empire` / `empire_size_over_cap` / `empire_size` 见 `00_static_modifiers.txt:9-40`；赤字键见 `09_static_modifiers_deficit.txt` |
| opinion 结构 | `common/opinion_modifiers/00_opinion_modifiers.txt:260` `opinion_declared_war` 含 `opinion = { base = -25 }` 与 `decay = { base = 1 }`；`opinion_genocidal:271` 的 `opinion` 内有 `modifier = { add = -0.05 ... }` |
| planet_modifiers 结构 | `common/planet_modifiers/00_planet_modifiers.txt` `pm_null` / `pm_hazardous_weather`，含 `spawn_chance = { base / modifier }` |

**常用修正名清单**：全部逐条在 `logs/script_documentation/modifiers.log` 中命中。该文件 4.1.7 共约 **45551 行**，格式 `- <name>, Category: <A>, <B>`。

**被推翻的假设（这些名字在 4.1.7 的 `modifiers.log` 中命中 0 次）**：

| 常见误写 | 4.1.7 实际存在的名字 |
| --- | --- |
| `ship_science_cost_mult` | `ship_science_speed_mult`、`ship_science_upkeep_mult` |
| `country_research_speed_mult` | `country_physics_research_produces_mult`（等三系） |
| `pop_growth_speed` | `logistic_growth_mult`、`bonus_pop_growth_mult` |
| `ship_weapon_damage_mult` | `ship_weapon_damage`、`gunship_weapon_damage_mult` |
| `stability`（裸名） | `planet_stability_add` |
| `country_administrative_capacity` | `country_admin_cap_add` |
| `pop_job_bonus_workforce_mult`、`pop_job_workforce_mult` | `pop_workforce_mult`、`pop_bonus_workforce_mult`、`pop_cat_worker_bonus_workforce_mult`（Dev Diary #372 预告名未落地） |

## 参考

- [Modifiers（含 Static Modifiers 与 Economic Categories 生成规则）](https://stellaris.paradoxwikis.com/Modifiers)
- [Opinion modifier modding](https://stellaris.paradoxwikis.com/Opinion_modifier_modding)
- [Economy modding（`deficit_modifier`）](https://stellaris.paradoxwikis.com/Economy_modding)
- 游戏自带：`common/static_modifiers/000_readme.txt`
- 权威修正清单：`logs/script_documentation/modifiers.log`
