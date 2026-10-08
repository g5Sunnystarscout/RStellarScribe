---
id: armies
category: content
title: Armies and Army Recruitment
title_zh: 陆军与造兵逻辑
file_types: [common/armies/*.txt, common/army_types/*.txt, common/component_templates/*.txt]
tags: [army, defense_army, assault_army, recruit, transport]
related: [ship-sizes, ship-abilities-and-gui, ground-combat]
sources: [https://stellaris.paradoxwikis.com/Army_modding]
verified_version: "Pegasus 4.4.6 实机文件核对"
---

## 概要

以下核对自 `<Stellaris>`（`launcher-settings.json` → `"version": "Pegasus v4.4.6 (fdde)"`）。

1. 陆军定义在 **`common/armies/`**，**不存在 `common/army_types/`**（`Test-Path` 为 `False`）。4 个文件、70 个顶层键，键名即陆军 key，**无外层 wrapper**。
2. 任务单假设的 `name` / `plural` / `description` / `picture` / `army_type` / `defense_only` / `is_defense_army` / `is_occupation_army` / `can_recruit` / `can_be_recruited_on` / `transport_ship` / `build_time` 在 4.4.6 **全部 0 命中**。显示名走本地化 `<key>`/`<key>_plural`/`<key>_desc`；"是否防御军"是触发器 `is_defensive_army`，不是字段。
3. **星球面板的"建造部队"按钮是硬编码 C++ 列表**（`planet_view.gui` 的 `recruitment_list`）。脚本只能靠"加定义 + 门控通过"让陆军进入列表，**不能新增按钮**。门控 = 陆军自身的 `potential_country`/`potential`/`allow`/`prerequisites`/`resources.cost` 加两条 game rule（`can_generate_army_from_colony`、`can_generate_army_from_species`）。**`military_academy` 与造兵无关**。
4. **舰船能否造陆军，要分两种"造"**：
   - **走招募 UI**：本体只有**方舟舰**有。`planet_view.gui:776` 的 `buttonType name = "arkship_build_armies"`（文本 `"Assault Armies"`）由 `carries_colony = pc_ark` 开启，行为在 `stellaris.exe` 里硬编码，**模组舰种无法复制**。主宰、运输船、巨构、恒星基地都没有。
   - **脚本直接创建（不经招募 UI）**：**可以，且舰船作用域原生支持** —— `create_army` 的 Supported Scopes 为 `planet ship colony`。这是「空天母舰」的正解：`common/scripted_actions/` 或 `common/button_effects/` + `create_army`。
5. 效果名是 `create_army`/`create_army_transport`/`remove_army`/`damage_army`/`modify_army`；**不存在** `spawn_army`、`recruit_army`、`destroy_army`、`load_army`、`embark`。

## 文件位置与命名

| 路径 | 4.4.6 实测 | 说明 |
|---|---|---|
| `common/armies/` | **存在**，4 个文件 | 唯一陆军定义目录 |
| `common/army_types/` | **不存在**（递归 `-Filter army*` 仅命中 `gfx/interface/icons/army_attachments`） | 写进去的文件被静默忽略 |
| `common/army_attachments/` | **不存在** | 勿照抄旧教程 |

| 文件 | 行数 | 顶层键数 |
|---|---|---|
| `00_defense_armies.txt` | 377 | 10 |
| `01_assault_armies.txt` | 1508 | 21 |
| `02_event_armies.txt` | 867 | 35 |
| `03_occupation_armies.txt` | 100 | 4 |
| **合计** | | **70** |

文件内是裸的 `<army_key> = { ... }`，如 `00_defense_armies.txt:10 defense_army = {`、`01_assault_armies.txt:8 assault_army = {`、`03_occupation_armies.txt:9 occupation_army = {`。

## 语法与字段

**顶层键 = 陆军 key**，键名同时是本地化前缀。

**存在字段**（括号内为 4 文件出现次数）：

- 数值：`damage`(70)、`health`(70)、`morale`(39)、`morale_damage`(54)、`collateral_damage`(47)、`war_exhaustion`(47)。
- `icon`(70)，值为 GFX 名（`00_defense_armies.txt:18` `icon = GFX_army_type_defensive`；精灵定义在 `interface/icons.gfx:189` 起）。**不是旧版 `icon_frame`**（0 命中）。
- 开关：`defensive`(38)、`occupation`(4)、`is_pop_spawned`(14)、`rebel`(1，`02_event_armies.txt:9`)。
- 兼容：`has_morale`(33)、`has_species`(41)、`pop_limited`(5)、`use_armynames_from`(3)、`disband_if_species_lacks_rights`(1)、`spawn_chance`(2)。
- **建造时间是 `time`**（33 次，`01_assault_armies.txt:15 time = 90`，单位天）；`build_time` 0 命中。
- **经济：`resources`(44)**，内含 `category = armies`、`cost`(64)、`upkeep`(32)、`produces`(11)，`trigger` 写在 `cost`/`upkeep` 内部。**`cost`/`upkeep` 不是顶层字段**。
- 门控：`potential`(39)、`potential_country`(49)、`allow`(8)、`prerequisites`(17)、`show_tech_unlock_if`(9)、`ai_weight`(22)。
- 钩子：`on_queued`(3)、`on_unqueued`(3)、`army_modifier`(3)。

**作用域约定**（由 vanilla 用法 + 触发器作用域反推）：

- `potential_country` = **国家作用域**，裸写国家触发器（`01_assault_armies.txt:61-68` 的 `is_machine_empire = no`）。
- `potential` / `allow` = **殖民地作用域**，`owner` = 国家，`from` = 物种/人口组，`planet` = 星球。证据：`00_defense_armies.txt:36` 在 `from` 内用 `is_sapient`，而 `is_sapient` 仅支持 `pop_group species`（`triggers.log:1495`）。
- `resources.cost.trigger` 里的 `from` = **国家**：`01_assault_armies.txt:20-28` 在 `from` 内用 `is_nomadic`，该触发器仅支持 `country`（`triggers.log:708`）。

**最小可加载的新陆军**（复制 `assault_army` 改名，只用已核实字段）：

```pdx
# common/armies/zz_sky_carrier_armies.txt
sky_carrier_legion = {
	damage = 1.50
	health = 1.50
	morale = 1.50
	morale_damage = 1.50
	collateral_damage = 1.00
	war_exhaustion = 1.00
	time = 60
	icon = GFX_army_type_assault

	prerequisites = { "tech_assault_armies" }

	resources = {
		category = armies
		cost = {
			alloys = 100
		}
		upkeep = {
			energy = 1.5
		}
	}

	# country scope: does this empire get this army at all
	potential_country = {
		is_machine_empire = no
		is_wilderness_empire = no
	}

	# colony scope: owner = country, from = species/pop group
	potential = {
		from = {
			NOR = {
				has_trait = "trait_mechanical"
				has_trait = "trait_machine_unit"
				is_sapient = no
			}
		}
	}

	ai_weight = {
		base = 50
	}
}
```

配套本地化（缺失则只显示裸 key）：

```yml
l_english:
 sky_carrier_legion:0 "Sky Carrier Legion"
 sky_carrier_legion_plural:0 "Sky Carrier Legions"
 sky_carrier_legion_desc:0 "Legionaries embarked aboard the sky carrier."
```

**从舰船按钮创建陆军**（`create_army` 原生支持 `ship`，`effects.log:324`）：

```pdx
# common/button_effects/zz_sky_carrier.txt
sky_carrier_recruit_effect = {
	potential = {
		is_scope_type = ship          # This = 选中的舰船
	}
	allow = {
		owner = {
			any_owned_species = { can_be_soldier = yes }
		}
	}
	effect = {
		# 路线 A：直接在舰船作用域创建（engine 支持，落点见"待确认"）
		create_army = {
			name = "NAME_Sky_Carrier_Legion"
			owner = owner             # ship->owner = country（scopes.log: owner 支持 ship）
			species = owner
			type = sky_carrier_legion
		}
	}
}

# 路线 B：跳国家 → 首都殖民地 → 星球作用域创建（最保守）
sky_carrier_recruit_on_capital_effect = {
	potential = { is_scope_type = ship }
	effect = {
		owner = {
			capital_scope = {     # scopes.log: capital_scope，country->colony
				create_army = {
					name = "NAME_Sky_Carrier_Legion"
					owner = owner
					species = owner
					type = sky_carrier_legion
				}
			}
		}
	}
}
```

随舰队创建（`this = fleet`）：

```pdx
owner = {
	create_fleet = {
		effect = {
			create_army_transport = {
				graphical_culture = "human_01"
				army_type = "sky_carrier_legion"
			}
		}
	}
}
```

**效果签名原文**（`%USERPROFILE%\Documents\Paradox Interactive\Stellaris\logs\script_documentation\effects.log`）：

```text
:317  create_army - Creates a new army
:318  create_army = {
:319      name = <string>
:320      owner = <target>
:321      species = <target>/random
:322      type = <key>
:323  }
:324  Supported Scopes: planet ship colony

:326  modify_army - Modifies army with parameters:   (name/owner/species/type)
:333  Supported Scopes: army

:492  damage_army - Damages scoped army by a specific amount
:493  damage_army = 250
:494  Supported Scopes: army

:1138 create_army_transport - Creates a new army in a new transport ship
:1139 create_army_transport = {
:1140     ship_name = <string>
:1141     graphical_culture = <key>
:1142     army_name = <string>
:1143     army_type = <key>
:1144     species = <target>
:1145 }
:1146 Supported Scopes: fleet

:3331 remove_army - Removes the scoped army
:3332 remove_army = yes
:3333 Supported Scopes: army

:606  set_army_flag = <key>          Supported Scopes: army
:638  remove_army_flag = <key>       Supported Scopes: army
:1062 set_timed_army_flag = { ... }  Supported Scopes: army
:1289 unassign_leader                Supported Scopes: ship fleet leader army
:1293 exile_leader_as               Supported Scopes: country fleet leader army
:1297 set_leader                    Supported Scopes: country fleet army

iterators (effects.log): :3893 random_owned_army  :3904 ordered_owned_army  :3914 every_owned_army
                         :3918 random_planet_army :3929 ordered_planet_army  :3939 every_planet_army
                         :3943/3954/3964 every|random|ordered_ground_combat_attacker
                         :3968/3979/3989 every|random|ordered_ground_combat_defender
```

`triggers.log`：

```text
:1325 army_type = assault_army        Supported Scopes: army
:1329 is_defensive_army = yes         Supported Scopes: army
:1333 has_army = yes                  Supported Scopes: planet ship colony
:1008 has_army_flag                   Supported Scopes: army
:1404 is_army = <target>              Supported Scopes: army
:1761 is_in_frontline                 Supported Scopes: army
:2419 planet_garrison_strength        Supported Scopes: colony
:3716 any_owned_army / :3720 count_owned_army
:3727 any_planet_army / :3731 count_planet_army
```

`scopes.log`：`:22 planet`（ship/army 等 → planet）、`:34 spawner_planet`（army → planet）、`:194 last_created_army`（Output Scope: army）；`owner`（含 ship → country）、`capital_scope`（country → colony）。

## 校验要点

1. **目录先 `Test-Path`**：只认 `common/armies/`。写进 `common/army_types/` 会被静默忽略，控制台不报错 —— 最常见的"改了没反应"。
2. **键名 = 本地化前缀**：需存在 `<key>:0`、`<key>_plural`、`<key>_desc`。vanilla 实例：`localisation/english/main_1_l_english.yml:2505 assault_army:0`、`:2508 defense_army:0`、`:2522 clone_army:0`、`:2525 robotic_army:1`；`biogenesis_l_english.yml:1473-1474 perfected_clone_army_plural/_desc`。
3. **招募门控四件套**：陆军自身 `potential_country` + `potential` + `allow` + `prerequisites`，再叠加 `common/game_rules/00_rules.txt` 的两条规则：
   - `:472 can_generate_army_from_colony`（This = 殖民地，root = 物种）：非 `pc_cosmogenesis_world`，且 `any_owned_species = { is_same_species = root can_be_soldier = yes }`。
   - `:535 can_generate_army_from_species`（This = 国家，root = 物种）：非 `trait_tankbound`，且有 `military_service_full` 或 `military_service_limited`（或 owner 为原始文明）。
   - `can_be_soldier` 定义在 `common/scripted_triggers/00_scripted_triggers.txt:773-781`。
   **推论**：测试帝国若兵役为 `military_service_none`，陆军字段写得再对也不会出现在列表里 —— 这是排查"造兵按钮没反应"的具体抓手。
4. **防御军不是招募来的**：`is_pop_spawned = yes` 的 10 个陆军只能由职业生成。链路：`job_soldier`（`common/pop_jobs/02_specialist_jobs.txt:3301`，`:3346` 引入 `output/soldier_triggered_modifiers`）→ `common/inline_scripts/output/soldier_triggered_modifiers.txt:25-32` 的 `planet_defense_armies_add = 1`（条件 `owner? = { is_nomadic = no }`）。故防御军数量由建筑/职业给的 `planet_defense_armies_add` 决定（`common/buildings/00_capital_buildings.txt:182/271/364`）。
5. `occupation = yes` 不可建造，只在占领星球时生成（`03_occupation_armies.txt`）。
6. `defensive = yes` 不能运输（三文件第 1 行注释 "Defensive armies can't transport off the planet"）。
7. 图标须真实存在：`GFX_army_type_assault` 在 `interface/icons.gfx:189`，写错则空图标。

## 常见错误

- 写到 `common/army_types/`（本版本无此目录）。
- 把 `cost` / `upkeep` / `build_time` 当顶层字段：正确为 `resources = { category = armies cost = { ... } upkeep = { ... } }` 与 `time = <天>`。
- 用 `icon_frame`（3.0 时代写法，0 命中）。
- 以为要建 `military_academy` 才能造兵：`common/buildings/09_army_buildings.txt:4-131` 的 `building_military_academy` 只给士兵职业与 `pop_soldier_bonus_workforce_mult`，`allow` 仅要求 `has_major_upgraded_capital`，**不含造兵门控**。
- 在 `potential_country` 里多包一层 `owner = { ... }`（该块本身即国家作用域）。
- 照抄 wiki：`stellaris.paradoxwikis.com/Army_modding` 自标最后核验 **3.0**，正文用 `icon_frame`、称 `potential` 为 Planet scope，与 4.4.6 不一致。
- 想给模组舰种加"建造陆军"按钮：`arkship_build_armies` 是 exe 硬编码 + `carries_colony = pc_ark` 专属，无脚本字段、无 `scripted_actions`/`button_effects` 条目可复用。请改走 `effectbuttonType` + `create_army`。

## 待确认

1. **`create_army` 在 `ship` 作用域的落点**。文档（`effects.log:324`）写了支持 `ship`，`has_army` 也支持 `ship`（`triggers.log:1335`），但全本体 `events/*.txt` 中**没有任何 `create_army` 出现在舰船作用域**（扫描"前 25 行含 `create_ship` / `every_owned_ship` / `last_created_ship`"→ 0 命中）。陆军是驻扎该舰还是落到别处，须实机确认。保守方案用"路线 B"或 `create_army_transport`。
2. **方舟舰招募出的陆军归属与上限**：方舟舰复用行星招募列表，但 `is_nomadic = yes` 帝国下士兵职业给的是 `country_naval_cap_add = 1` 而非 `planet_defense_armies_add`（`soldier_triggered_modifiers.txt:34-41`），未实机验证。
3. **`potential` 块中 `from` / `planet` 的完整可用集合**：本文只给出被 vanilla 用法证实的部分。

## 参考

- 本地取证（Pegasus v4.4.6，`<Stellaris>`）：`common/armies/` 四文件；`common/game_rules/00_rules.txt:472`、`:535`；`common/scripted_triggers/00_scripted_triggers.txt:773`；`common/buildings/09_army_buildings.txt`；`common/pop_jobs/02_specialist_jobs.txt:3301`；`common/inline_scripts/output/soldier_triggered_modifiers.txt:25`；`common/ship_sizes/00_ship_sizes.txt:1504`（`transport`，`class = shipclass_transport`）、`18_juggernauts.txt`（0 army 命中）、`01_colossi.txt`（0）、`29_nomads_dlc_ships.txt:114`（`carries_colony = pc_ark`）；`interface/planet_view.gui:776`、`:3112`、`:7826`；`interface/icons.gfx:189`；`localisation/english/main_1_l_english.yml:2505/2508/2522/2525`；`launcher-settings.json`。
- 脚本文档日志：`%USERPROFILE%\Documents\Paradox Interactive\Stellaris\logs\script_documentation\` 下 `effects.log`、`triggers.log`、`scopes.log`。
- [Army modding — Stellaris Wiki](https://stellaris.paradoxwikis.com/Army_modding)（自标 3.0，`icon_frame` 等写法已失效，仅作对照）。
