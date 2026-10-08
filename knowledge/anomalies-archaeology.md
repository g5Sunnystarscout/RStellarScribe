---
id: anomalies-archaeology
category: content
title: Anomalies, Archaeological Sites & Special Projects
title_zh: 异常、考古遗址与特殊项目
file_types: [common/anomalies/*.txt, common/archaeological_site_types/*.txt, common/special_projects/*.txt, events/*.txt]
tags: [anomaly, anomaly_event, archaeological_site, stage, special_project, enable_special_project]
related: [events, event-chains, scopes, triggers, effects, localisation-basics, decisions]
sources: [https://stellaris.paradoxwikis.com/Anomalies_modding, https://stellaris.paradoxwikis.com/Special_Project_modding, https://stellaris.paradoxwikis.com/Ancestral_Relics_modding]
verified_version: "本机正式版 4.1.7 (Lyra) 文件实测；wiki 各页标注 3.2 / 3.1 / 3.3"
---

## 概要

三者是"探索发现"类的三套不同数据结构，分散在三个目录，**互不通用**：

| 机制 | 目录 | 顶层写法 | 产出的事件类型 |
| --- | --- | --- | --- |
| 异常类别 (anomaly category) | `common/anomalies/*.txt` | 裸键 `<category_key> = { }` | `ship_event`（在 `events/` 里） |
| 考古遗址 (archaeological site) | `common/archaeological_site_types/*.txt` | 裸键 `<site_key> = { }` | `fleet_event`（在 `events/` 里） |
| 特殊项目 (special project) | `common/special_projects/*.txt` | **包裹键** `special_project = { key = "KEY" }` | `ship_event` 或 `planet_event`，由 `event_scope` 决定 |

必须纠正 brief 的两处：**考古目录是 `common/archaeological_site_types/`，不是 `common/archaeological_sites/`**（后者在本机不存在，且 wiki 的 "Archaeological sites" 链接指向 `Ancestral_Relics_modding#Archaeological_Sites`）；**异常类别不是 `an_anomaly_category = { }` 包裹**——`an_anomaly_category` 这个字符串在本机 `common/anomalies/` 中只出现 1 次，即 `99_README_ANOMALIES.txt` 第 1 行的注释标题，21 个本体数据文件全部是裸键。

异常的生成率是硬编码的：`common/defines/00_defines.txt` 里的 `ANOMALY_SPAWN_CHANCE = 0.050` 与 `ANOMALY_SPAWN_CHANCE_INCREMENT = 0.005`（每次勘测天体失败后累加）。异常类别**只能在天体第一次被勘测时**生成，所以用 `survey` 控制台命令无法反复测试自定义异常。

## 文件位置与命名

- `common/anomalies/`：本体 21 个文件，`99_README_ANOMALIES.txt` 是引擎自带字段说明，**先读它**。
- `common/archaeological_site_types/`：本体 20 个文件，`99_README_ARC_SITES.txt` 是引擎自带字段说明。
- `common/special_projects/`：本体 25 个文件（`00_projects_1.txt` 等）。
- 异常事件与考古各阶段的事件都写在 `events/*.txt`，不要放进上述目录。特殊项目本身不写事件，只写 `on_success` 等效果块调用事件。
- mod 用唯一前缀命名文件与所有 key（如 `my_mod_`），避免与本体及其他 mod 撞键。

## 语法与字段

### 一、异常类别（`common/anomalies/*.txt`）

作用域：`this` / `root` = planet，`from` = ship。**没有 `potential`、也没有 `trigger` 字段**——"只在什么天体上出现"完全靠 `spawn_chance` 的 `modifier` 实现。

```pdx
# common/anomalies/zz_my_mod_anomalies.txt
my_mod_beacon_category = {
	should_ai_use = no                  # 默认 no：只有玩家能刷到
	should_ai_and_humans_use = yes      # 一旦写了，覆盖上面的 should_ai_use

	desc = "my_mod_beacon_category_desc"   # 省略时引擎回退到 "<category_key>_desc"
	picture = GFX_evt_satellite_in_orbit
	level = 3                           # 1~10，决定需要的科学家等级

	null_spawn_chance = 0               # 0~1；被抽中后再掷一次"不生成"的概率
	max_once = yes                      # 每帝国只生成一次类别
	max_once_global = no                # 每局只生成一次类别

	spawn_chance = {                    # 相对权重，不是百分比
		base = 0
		modifier = {
			add = 1
			is_asteroid = yes
		}
	}

	on_spawn = {                        # 类别生成瞬间（this=planet, from=ship）；控制台生成不会触发
		set_planet_flag = my_mod_beacon_site
	}

	on_success = {                      # 语义等同 random_list，调查完成后抽一个结果
		2 = {
			max_once = yes
			max_once_global = no
			anomaly_event = my_mod_anomaly.1     # 新效果：this=ship, from=planet
		}
		1 = {
			modifier = {
				factor = 0
				from = { has_any_strategic_resource = yes }
			}
			anomaly_event = my_mod_anomaly.2
		}
	}
}
```

`on_success` 的三种简写形式：`<权重> = <事件ID>`、`on_success = <事件ID>`（只有一个结果时）、以及块内可改用 `ship_event = <id>`（此时作用域变为 `this`=ship, `from`=ship, `fromfrom`=planet）。

### 二、异常事件（`events/*.txt`）

必须是 `ship_event`，`root` = ship，`from` = planet，且必须 `is_triggered_only = yes`（依据 `events/anomaly_events_1.txt` 文件头注释 `# ROOT = ship scope / # FROM = planet scope`）。

```pdx
# events/zz_my_mod_anomaly_events.txt
namespace = my_mod_anomaly

ship_event = {
	id = my_mod_anomaly.1
	title = my_mod_anomaly.1.name
	desc = my_mod_anomaly.1.desc
	picture = GFX_evt_mining_station
	show_sound = event_ship_bridge
	location = FROM

	is_triggered_only = yes

	immediate = {
		from = { clear_deposits = yes }
	}

	option = {
		name = my_mod_anomaly.1.a
		from = { set_deposit = d_engineering_2 }
		owner = { add_resource = { influence = 50 } }
	}

	option = {
		name = my_mod_anomaly.1.b
		from = { set_deposit = d_minerals_5 }
	}
}
```

### 三、考古遗址（`common/archaeological_site_types/*.txt`）

裸键 `<site_key> = { }`。作用域：`potential` / `allow` / `on_roll_failed` 为 `this`=fleet、`from`=site；`visible` / `on_visible` 为 `this`=country、`from`=site；`on_create` 为 `this`=site。**没有 `rewards` 字段，也没有 `on_roll_success`**（本机 0 处），奖励一律写在 `stage` 触发的 `fleet_event` 里。

```pdx
# common/archaeological_site_types/zz_my_mod_arc_sites.txt
my_mod_beacon_digsite = {
	desc = "my_mod_beacon_digsite_desc"     # triggered desc，this = 考古遗址
	picture = GFX_evt_archaeological_dig
	stages = 2                              # 必须与下面 stage 块的数量完全一致
	max_instances = 1                       # 只在 create_archaeological_site = random 时生效
	weight = 0                              # 同上；通常由当地初始化器显式生成故设 0

	allow = {                               # this=fleet, from=site；不满足则按钮禁用
		is_ship_class = shipclass_science_ship
		exists = leader
	}

	visible = {                             # this=country, from=site
		default_site_visible_trigger = yes
	}

	on_create = {                           # this=site
		set_planet_flag = my_mod_beacon_site
	}

	stage = {
		difficulty = 1                      # 可写 { min = 1 max = 3 }
		icon = GFX_archaeology_runes_F1
		event = my_mod_arc.1                # 必须是 fleet_event
	}

	stage = {
		difficulty = 2
		icon = GFX_archaeology_runes_F2
		event = my_mod_arc.2
	}

	on_roll_failed = {                      # this=fleet, from=site
		from = {
			standard_archaeological_site_on_roll_failed = { RANDOM_EVENTS = my_mod_arc_random_events }
		}
	}
}
```

生成遗址用效果 `create_archaeological_site = <site_key>`（本机 85 处），或 `create_archaeological_site = random`（此时才会用到 `max_instances` / `weight`）。阶段事件必须是 `fleet_event`——本机核对：`00_base_game_arc_sites.txt` 里 `stage.event = federations2.2`，而 `federations2.2` 在 `events/` 中的定义块是 `fleet_event = {`；`ancrel.2` / `ancrel.3` 同样是 `fleet_event`。

### 四、特殊项目（`common/special_projects/*.txt`）

**只有这是包裹结构**，名字是 `special_project`（不是 `special_project_key`），键在块内的 `key` 字段，且是**大写字符串**。

```pdx
# common/special_projects/zz_my_mod_projects.txt
special_project = {
	key = "MY_MOD_BEACON_PROJECT"
	cost = 0                                   # 与 days_to_research 二选一（cost 非 0 时不要写 days）
	days_to_research = 180
	tech_department = physics_technology        # physics_technology / society_technology / engineering_technology
	picture = GFX_evt_archaeological_dig
	icon = "gfx/interface/icons/situation_log/situation_log_debris.dds"

	event_scope = ship_event                   # 或 planet_event

	requirements = {
		shipclass_science_ship = 1
		leader = scientist
		skill > 1
	}

	on_start = {
		owner = { set_country_flag = my_mod_beacon_project_started }
	}

	on_success = {
		ship_event = { id = my_mod_anomaly.2 }
	}

	on_fail = {
		owner = { country_event = { id = my_mod_anomaly.3 } }
	}
}
```

- 已核实字段（本机 `common/special_projects/*.txt` 次数）：`special_project`(629)、`key`(609)、`picture`(621)、`event_scope`(568)、`on_success`(558)、`tech_department`(471)、`requirements`(451)、`icon`(445)、`days_to_research`(380)、`cost`(365)、`on_fail`(303)、`timelimit`(252)、`event_chain`(234)、`location`(156)、`abort_trigger`(110)、`same_option_group_as`(22)、`on_start`(22)、`on_cancel`(9)、`on_progress_25`(7)、`on_progress_50`(10)、`on_progress_75`(5)、`sound`(29)、`AI_wait_days`(6)。
- `requirements` 不是普通触发器，是专用条件集（`leader` / `skill` / `has_trait` / `shipclass_*` / `assault_armies` / `defense_armies` / `research_station` / `mining_station` / `observation_station` / `fleet_power` / `is_founder_species`），**不支持 `AND` / `OR`**。
- 生命周期作用域：`on_start` / `on_success` / `on_progress_*` 为 `this`=事件作用域（ship 或 planet）、`from`=项目创建作用域；`abort_trigger` / `on_cancel` 为 `this`=project owner（country）、`from`=事件作用域、`fromfrom`=创建作用域；`on_fail` 为 `this`=country、`from`=创建作用域。
- 起停与查询：效果 `enable_special_project = { name = "MY_MOD_BEACON_PROJECT" location = this owner = root }`、`abort_special_project = { type = MY_MOD_BEACON_PROJECT location = from }`（`type` 写裸键，不加引号也可）；触发器 `has_special_project = MY_MOD_BEACON_PROJECT`。

## 校验要点

- **localisation 键约定（本机实测）**：
  - 异常类别：名称键 = `<category_key>`，描述键 = `<category_key>_desc`（或在脚本里用 `desc = "..."` 显式指定别的键）。证据：`localisation/english/anomaly_l_english.yml` 中 `crashed_ship_asteroid_category:0 "Crashed Ship"` 与 `crashed_ship_asteroid_category_desc:0 "..."`，对应 `common/anomalies/00_anomaly_categories.txt:8`。
  - 异常事件：与普通事件相同，`<namespace>.<id>.name` / `.desc` / `.a` / `.b`。证据：`anomaly.1.name` / `anomaly.1.desc` 对应 `events/anomaly_events_1.txt` 的 `id = anomaly.1`。
  - 考古遗址：**遗址 key 本身就是名称 loc 键**，`desc` 指向另一个键。证据：键 `site_ruins_of_shallash:0 "Ruined Star System"`、`site_space_shanty_dig:0 "Message in a Bottle"`、`zroni_digsite_1:0 "Abandoned Colony Ruins"` 全部存在，且 `zroni_digsite_1_desc` 也被 `desc = zroni_digsite_1_desc` 引用。阶段事件仍是普通事件键 `<ns>.<id>.name` / `.desc` / `.a`。
  - 特殊项目：标题键 = `key` 原样，描述键 = `<key>_DESC`。证据：`GAS_GIANT_BODIES_PROJECT:0 "Analyze Dead Space Creatures"` 与 `GAS_GIANT_BODIES_PROJECT_DESC:0 "..."`，对应 `common/special_projects/00_projects_1.txt:3` 的 `key = "GAS_GIANT_BODIES_PROJECT"`。**注意这里后缀是大写 `_DESC`**，与事件/决议的小写 `_desc` 不同。
- 所有 loc 文件必须 UTF-8 with BOM、文件名 `*_l_english.yml`、首行 `l_english:`、键前有缩进。
- 资源名与 GFX 名必须真实存在；本条目示例中用到的 `GFX_evt_satellite_in_orbit`、`GFX_evt_mining_station`、`GFX_evt_archaeological_dig`、`GFX_archaeology_runes_F1/F2`、`d_engineering_2`、`d_minerals_5` 均已在本机 `interface/*.gfx` 与 `common/deposits/` 中核对存在。
- `stages = N` 必须与 `stage` 块数量逐一相等，多了少了都会让遗址无法正常推进。
- `spawn_chance` 的 `base` 是**相对权重**（默认 0）。只写 `modifier` 而不给 `base`，只要 modifier 不满足权重就是 0，异常永远不生成。
- 调试异常时不要指望 `survey` 控制台命令能复现（天体一旦勘测过就不再参与异常生成）；`on_spawn` 也不会在控制台生成时执行。

## 常见错误

- 考古目录写成 `common/archaeological_sites/`（不存在），或异常类别外面套一层 `an_anomaly_category = { }`（本机 0 处真实使用）。
- 在异常类别里写 `potential` / `trigger`：这两个字段在该结构中不存在，限制出现条件是写 `spawn_chance = { modifier = { ... } }`。
- 把异常事件写成 `country_event` 或 `planet_event`：异常事件必须是 `ship_event`，否则作用域全线错位。
- 把考古阶段事件写成 `country_event` / `ship_event`：必须是 `fleet_event`。
- 在考古遗址里找 `rewards` 或 `on_roll_success`：字段不存在，奖励要写在阶段事件里，失败处理写在 `on_roll_failed`。
- 特殊项目用 `special_project_key = { }` 或把 `key` 写成小写/带引号不一致：包裹键固定是 `special_project`，`key` 是大写字符串且被 loc 与 `enable_special_project` 逐字匹配。
- 特殊项目的 loc 键用了小写 `_desc`：正确后缀是 `_DESC`，写错会显示原始键名。
- `cost` 与 `days_to_research` 同时给非 0 值：文档明确要求用 `days_to_research` 时 `cost` 必须为 0。
- 忘了 `is_triggered_only = yes`：异常事件会被每日轮询（异常事件本身永远不该自触发）。

## 待确认

- brief 的 `common/archaeological_sites/*.txt`：本机实际目录名是 **`common/archaeological_site_types/*.txt`**，正文已按实测修正。
- brief 的 `anomaly_key = { ... }`：实际是**裸键 `<category_key> = { }`**，没有 `anomaly_key` 包裹（本机 0 处）。brief 提到的 `potential` 字段在异常类别中**不存在**；`trigger` 也不存在。`level` / `spawn_chance` / `on_success` / `picture` 均存在。
- brief 的 `common/archaeological_sites/*.txt` 字段 `rewards` / `on_roll_success`：本机 **0 处**，不存在。实际失败处理字段是 `on_roll_failed`。
- brief 问特殊项目是 `special_project_key` 还是别的：实际包裹键是 `special_project`，键名写在内部 `key` 字段。
- 考古阶段 `fleet_event` 的确切作用域（`root` / `from` 分别指向 fleet、site 还是别的）未在 `99_README_ARC_SITES.txt` 中说明，本机也未找到官方注释；写阶段事件时建议先只用 `root`，并在游戏内用 `debugtooltip` 验证后再引用 `from`。
- 异常 `on_success` 中 `modifier` 的 `add` / `factor` 与权重的组合上限（是否会因权重全为 0 而静默不生成）未实测。
- 4.1.7 是否给考古遗址新增了字段（如多目标、共享进度），未与 3.3 文档逐字段比对。
- `special_project` 的 `location` 字段（156 处）语义为 yes/no 还是作用域，wiki 与本体用法不一致，未确认，故示例中未使用。

## 参考

- [Anomalies modding（异常类别与异常事件完整说明）](https://stellaris.paradoxwikis.com/Anomalies_modding)
- [Special Project modding（字段表、requirements、localisation）](https://stellaris.paradoxwikis.com/Special_Project_modding)
- [Ancestral Relics modding §Archaeological Sites（遗址字段表）](https://stellaris.paradoxwikis.com/Ancestral_Relics_modding)
- 本机 `Stellaris/common/anomalies/99_README_ANOMALIES.txt`（引擎自带字段说明，4.1.7）
- 本机 `Stellaris/common/anomalies/00_anomaly_categories.txt`（裸键结构与 `on_success` 权重范例）
- 本机 `Stellaris/common/archaeological_site_types/99_README_ARC_SITES.txt`（引擎自带字段说明，4.1.7）
- 本机 `Stellaris/common/archaeological_site_types/00_base_game_arc_sites.txt`（`stage` / `on_roll_failed` 范例）
- 本机 `Stellaris/events/anomaly_events_1.txt`（`ship_event` + `root=ship / from=planet` 证据）
- 本机 `Stellaris/common/special_projects/00_projects_1.txt`（`special_project` 结构与 `on_success` 范例）
- 本机 `Stellaris/localisation/english/*_l_english.yml`（各机制 loc 键命名证据）
- [cwtools-stellaris-config: config/common/anomalies_and_archaeology.cwt](https://github.com/cwtools/cwtools-stellaris-config/blob/master/config/common/anomalies_and_archaeology.cwt)、[config/common/special_projects.cwt](https://github.com/cwtools/cwtools-stellaris-config/blob/master/config/common/special_projects.cwt)（CWTools 字段定义，用于游戏外静态校验）
