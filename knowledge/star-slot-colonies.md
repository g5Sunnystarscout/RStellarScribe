---
id: star-slot-colonies
category: structure
title: Colonisable Bodies in the Star Slot (and the "Open Orbital Ring" Button)
title_zh: 星位天体（恒星槽位上的可殖民行星类）与星环基地按钮
file_types: [common/planet_classes/*.txt, common/star_classes/*.txt, common/megastructures/*.txt, common/ship_sizes/*.txt, common/starbase_levels/*.txt, common/starbase_types/*.txt, common/solar_system_initializers/*.txt, gfx/models/planets/*.asset, gfx/worldgfx/*.txt, interface/planet_view.gui, interface/planet_view.gfx, interface/starbase_view.gui, localisation/english/*.yml, localisation/simp_chinese/*.yml]
tags: [star_slot, star, colonizable, primary_star, orbital_ring, orbital_defence, open_orbital_ring, star_gfx, entity_lookup, starbase]
related: [system-initializers, megastructures-starbases, traits-species]
sources: [https://stellaris.paradoxwikis.com/Planet_Generation_modding, https://stellaris.paradoxwikis.com/System_modding, https://stellaris.paradoxwikis.com/Starbase_modding]
verified_version: "Pegasus 4.4.6"
---

> **出处声明**：本文所有 vanilla 行号、计数与代码片段均读自 **Pegasus 4.4.6** 安装目录 `<Stellaris>`（`launcher-settings.json` = `Pegasus v4.4.6 (fdde)`；`logs/game.log:1` = `Game Version: Pegasus v4.4.6`）。本机另有一份 Lyra 4.1.7 的旧副本，**不作为依据**，本文不引用它。少数条目注明"本机 mod"（`<mods>\geocentric_origin`），那只是现象来源，不算 vanilla 证据。
>
> 标记约定：**【实机】** = 在一次实际游戏运行中观察到的行为；**【文件】** = 只读文件/日志得到，未在游戏中复现；**【实测日志】** = 本机 `logs/` 里有对应记录的运行结果。

## 概要

星系的"恒星槽位"（STAR slot）里放的是**一个普通的行星对象**——引擎先把恒星当行星生成，再给它套上 `star = yes` 的身份（`common/solar_system_initializers/example.txt:71-75` 的注释式写法 `planet = { class = star orbit_distance = 0 }`；`common/star_classes/00_star_classes.txt:4-6` 的文件头说明 `class = <id>` 只决定光照/GFX，`planet = { key = <行星类> }` 才是"这颗恒星本体的行星类：3D 资源、大小、殖民设定"）。

由此产生一条 vanilla 从不使用、但引擎完全接受的写法：**让一个 `star = yes` + `colonizable = yes` 的行星类占据星位，它就能被殖民**。可以做，但会连带引出四个反直觉的后果：

1. **实体查找规则在两种槽位上不同**：行星槽位是"基名 + 变体后缀"，星位是**原样查找**。同一个 `entity = "..."` 在两种槽位下命中/不命中正好相反。
2. **星位天体默认由"恒星表面"路径绘制，行星类自己的 `entity` 网格根本不画**——必须在该类上写 `star_gfx = no` 才会走普通实体渲染（已实机验证；`star_gfx` 未见于任何字段文档，vanilla 只有 3 处赋值，全在这类"实体不是恒星网格"的星类上）。
3. **殖民地一旦出现在星位上，行星视图会立刻多出一个"星环基地 / Open Orbital Ring"按钮**，而用户根本没造过星环基地。
4. 该按钮打开的是**本星系的恒星基地（system starbase）**，不是任何星环。

第 3、4 条是本文的核心结论，下面给了完整链条：**星环基地在引擎里不是"巨型结构"，而是一个恒星基地（starbase）**；而**星系恒星基地本身是挂在"主星"这颗行星对象上的**。两者占的是同一个"我的轨道上有什么空间站"槽位，所以星位殖民地一开局就满足这个按钮的显示条件。

原版自己**从不**这么做：Pegasus 4.4.6 的 `common/planet_classes/` 下共 **14** 个 `star = yes` 的类，**全部 `colonizable = no`**（用花括号配平扫描全目录 69 个 `pc_*` 类得到，逐条行号见下）。所以"星位殖民地 + 星环按钮"是 **mod-only** 行为。

## 机制

### 1. 星位也是行星对象，`star = yes` + `colonizable = yes` 合法

`colonizable` 与 `star` 是两个互不约束的字段。原版 14 个星类全部写成"星类惯用组合"（`climate = "luminosity_N"` + 零距离 + `spawn_odds = 0` + `colonizable = no`），但这只是**惯例**，不是引擎校验：

```pdx
# common/planet_classes/00_planet_classes.txt:1148-1173（pc_g_star，原版星类模板）
pc_g_star = {
	entity = "g_star_class_star_entity"
	entity_scale = 20.0
	picture = "pc_g_star"
	icon = GFX_planet_type_f_g_star
	icon_large = GFX_planet_type_f_g_star_big

	atmosphere_color		= hsv { 0.09 0.7 0.7 }
	atmosphere_intensity	= 0.5
	atmosphere_width		= 1.9

	climate = "luminosity_2"
	star = yes

	min_distance_from_sun = 0
	max_distance_from_sun = 0
	spawn_odds = 0

	extra_orbit_size = 0
	extra_planet_count = 0
	chance_of_ring = 0

	planet_size = { min = 20 max = 35 }

	colonizable = no          # ← 原版 14/14 星类都是 no；改成 yes 引擎不报错
}
```

**原版 14 个 `star = yes` 类全部 `colonizable = no`（Pegasus 4.4.6，逐块扫描核实）**：

| 行星类 | 定义行 | `colonizable = no` 行 | `star_gfx` |
| --- | --- | --- | --- |
| `pc_b_star` | `common/planet_classes/00_planet_classes.txt:1064` | `:1089` | 未写（默认 yes） |
| `pc_a_star` | `00_planet_classes.txt:1092` | `:1117` | 未写 |
| `pc_f_star` | `00_planet_classes.txt:1120` | `:1145` | 未写 |
| `pc_g_star` | `00_planet_classes.txt:1148` | `:1173` | 未写 |
| `pc_k_star` | `00_planet_classes.txt:1176` | `:1201` | 未写 |
| `pc_m_star` | `00_planet_classes.txt:1204` | `:1229` | 未写 |
| `pc_m_giant_star` | `00_planet_classes.txt:1232` | `:1257` | 未写 |
| `pc_t_star` | `00_planet_classes.txt:1260` | `:1286` | `star_gfx = no`（`:1273`） |
| `pc_black_hole` | `00_planet_classes.txt:1289` | `:1314` | 未写 |
| `pc_neutron_star` | `00_planet_classes.txt:1317` | `:1337` | 未写 |
| `pc_pulsar` | `00_planet_classes.txt:1340` | `:1364` | 未写 |
| `pc_toxoid_star` | `00_planet_classes.txt:1743` | `:1768` | 未写 |
| `pc_rift_star` | `common/planet_classes/00_planet_classes_astral_planes_dlc.txt:1` | `:16` | `star_gfx = no`（`:10`） |
| `pc_protostar` | `common/planet_classes/06_planet_classes_nomads.txt:110` | `:136` | `star_gfx = no`（`:123`） |

星类通过 `planet = { key = ... }` 指定"星位上生成哪个行星类"（`common/star_classes/00_star_classes.txt:23-27`，`sc_b`）：

```pdx
# common/star_classes/00_star_classes.txt:23-27 + 39
sc_b = {
	class = b_star                          # 光照/GFX/代码用的 id
	planet = { key = pc_b_star }            # 星位真正生成的行星类
	spawn_odds = 10
	num_planets	= { min = 4 max = 10 }
	arkship_picture = "arkship_class_b"
}
```

所以要"把一颗可殖民行星塞进星位"，需要三件套：自定义行星类（`star = yes` + `colonizable = yes`）+ 自定义星类（`planet = { key = <该类> }`，`spawn_odds = 0` 以免进入随机银河）+ initializer 里 `class = <该星类>`。

### 2. 实体名查找：行星槽位补后缀，星位原样用

行星槽位上 `entity` 写的是**基名**，引擎自己补 `_<两位数字>_entity` 之类的变体后缀：

```pdx
# common/planet_classes/00_planet_classes.txt:1371-1373
pc_ringworld_habitable = {
	ringworld = yes
	entity = "ringworld_habitable_entity"      # ← 基名
```
```pdx
# gfx/models/planets/_planetary_entities.asset:2990-2993
entity = {
	name = "ringworld_habitable_entity_01_entity"   # ← 实际注册名带 _01_ 后缀
	cull_radius = 500.0
	pdxmesh = "ringworld_habitable_01_mesh"
```

星位**不走**这套变体探测，`entity` 原样查找：`pc_g_star` 写的就是完整资源名

```pdx
# common/planet_classes/00_planet_classes.txt:1148-1149
pc_g_star = {
	entity = "g_star_class_star_entity"
```
```pdx
# gfx/models/planets/_star_entities.asset:66-68
entity = { # G
	name = "g_star_class_star_entity"
	pdxmesh = "star_mesh"
```

`stellaris.exe` 内同时含格式串 `Failed to find entity "` 与 `_xx_entity" for planet `（`...\source\spatial_objects\planet_class.cpp`），即星位探测失败时才会打印 `_xx_entity` 版本的名字。**结论：星位写"基名"会找不到实体并报 `Failed to find entity "<name>_xx_entity" for planet <...>`；想覆盖外观必须写完整注册名。**（此前项目里还实测推翻过一条假设：`fixed_entity_scale` **不会**改变星位的变体族查找。）

### 3. 星环基地（orbital ring）在引擎里就是一个恒星基地（starbase）

这是理解"按钮"的关键。**巨型结构 `orbital_ring` 建成后会被删除，留下的是一个 starbase**：

```pdx
# common/megastructures/15_orbital_ring.txt
orbital_ring = {
	entity = ""
	construction_entity = "orbital_ring_construction_entity"
	place_entity_on_planet_plane = yes
	scales_with_planet = yes
	build_time = 720

	starbase = starbase_level_orbital_ring_tier_1      # ← 它创建的"基地"
	...
	placement_rules = {
		planet_possible = {
			custom_tooltip = { fail_text = "requires_colonized_planet_orbital_ring"
				is_colony = yes                        # ← 唯一的"行星侧"硬条件
				exists = owner
				exists = controller
				controller = { is_same_value = prev.owner }
			}
			...                                        # ← 注意：没有任何 is_star = no / 主星排除
			custom_tooltip = { fail_text = "requires_no_existing_megastructure"
				NOR = {
					has_carrier_flag = megastructure
					AND = { has_carrier_flag = has_megastructure
						NOR = { has_carrier_flag = has_payback_habitat
							any_megastructure = { is_megastructure_type = grand_archive_0 } } }
					has_carrier_flag = ruined_orbital_ring_planet
					solar_system = { has_star_flag = ring_world_built }
					is_artificial = yes
				}
			}
			...
		}
	}

	on_build_complete = {
		fromfrom.planet = {
			set_carrier_flag = has_megastructure        # 只留一个 carrier flag
			save_event_target_as = orbital_ring_planet
		}
		remove_megastructure = fromfrom                 # ← 巨型结构本体被移除
		from = { country_event = { id = tutorial.2121 } }
	}
}
```

（`starbase = starbase_level_orbital_ring_tier_1` 在 `:12`，`possible` 在 `:48-56`，`placement_rules.planet_possible` 在 `:58-125`，`on_build_complete` 在 `:164-173`。）

也就是说，**星环建成后行星上没有任何 `orbital_ring` 巨型结构对象**，只有：行星上的 carrier flag `has_megastructure` + 轨道上一个 starbase。因此任何"判断行星是否有星环"的引擎条件都不可能写成"有 orbital_ring 巨型结构"。

星环的"基地"定义如下，而且带的是**行星视图的巨型结构背景图**：

```pdx
# common/starbase_levels/02_orbital_ring_levels.txt:1-10
starbase_level_orbital_ring_tier_1 = {
	ship_size = orbital_ring_tier_1
	next_level = starbase_level_orbital_ring_tier_2
	level_weight = 0
	ai_weight = { weight = 1 }
	potential_home_base = yes
	picture = "GFX_orbital_ring_background"        # interface/planet_view.gfx:1937-1940
	module_slots = { 1 2 }
	can_always_dismantle = yes
}
```
```pdx
# interface/planet_view.gfx:1932-1940（注意同级还有 GFX_starbase_background）
spriteType = { name = "GFX_starbase_background"     textureFile = "gfx/interface/planetview/megastructure_background/spacehangar.dds" }
spriteType = { name = "GFX_orbital_ring_background" textureFile = "gfx/interface/planetview/megastructure_background/orbital_ring.dds" }
```

`is_orbital_ring` 是**舰船尺寸（ship_size）字段**，原版注释直说是给 UI 用的：

```pdx
# common/ship_sizes/00_orbital_rings.txt:83-84
	is_space_station = no
	is_orbital_ring = yes	# Identifies this ship size as an orbital ring for UI tooltip selection
```
```pdx
# common/scripted_triggers/00_scripted_triggers.txt:3963-3965（同名的脚本触发器，作用域是 starbase）
is_orbital_ring = {
	has_starbase_size >= orbital_ring_tier_1
}
```

星环还拥有自己的**恒星基地类型**，和普通恒星基地的 `sshipyard` 等定义在同一个文件里：

```pdx
# common/starbase_types/00_starbase_types.txt:1274-1278
### ORBITAL RINGS

sorbital_ring = { # generic
	potential = { is_orbital_ring = yes }
	weight_modifier = { base = 10 }
```
```pdx
# common/starbase_types/00_starbase_types.txt:17-20（对照：普通恒星基地类型）
# Shipyard
sshipyard = {
	potential = {
		has_starbase_size > starbase_outpost
```

而星环的"查看界面"就是**恒星基地视图**：`interface/starbase_view.gui:10-11` 定义 `containerWindowType name = "starbase_view"`，文件里多处注释写着 `#Same as planet view`（`:33`、`:49`）。**所以"星环基地"和"恒星基地"在引擎里是同一族对象（starbase），只是 starbase_level / ship_size / starbase_type 不同。**

### 4. 星系恒星基地挂在"主星"这颗行星对象上

原版每一个**星系**恒星基地的舰船尺寸都写着这样一段 `potential_construction`（`starbase_outpost` 在 `common/ship_sizes/00_starbases.txt:8` 定义）：

```pdx
# common/ship_sizes/00_starbases.txt:86-92（starbase_outpost）
	potential_construction = {
		is_scope_type = planet
		is_primary_star = yes
		NOT = {
			exists = orbital_defence
		}
	}
```

同一段（`is_primary_star = yes` + `NOT = { exists = orbital_defence }`）出现在 `00_starbases.txt` 的 `:543`（`starbase_swarm`，`:527`）、`:593`（`starbase_ai`，`:576`）、`:644`（`starbase_exd_0`，`:628`）、`:697`（`starbase_exd`，`:679`）、`:748`（`starbase_marauder`，`:731`）、`:799`（`starbase_gatebuilders`，`:783`）、`:856`（`starbase_synth_queen`，`:836`）、`:911`（`big_starbase_synth_queen`，`:891`）、`:996`（`starbase_fe_outpost`，`:950`）。**即："建恒星基地"这件事的作用域是一个 planet，而且必须是系统的主星**，并且以该行星的 `orbital_defence` 槽位是否已占用来防重复。

引擎文档把这条链讲得很清楚（`%USERPROFILE%\Documents\Paradox Interactive\Stellaris\logs\script_documentation\`，下同）：

| 文档行 | 内容 |
| --- | --- |
| `triggers.log`（`is_primary_star`） | `is_primary_star - Checks if the planet is the system's primary star`，Supported Scopes: `planet ship` |
| `scopes.log:318` | `orbital_defence - Scopes from a planet to the orbital defence station (orbital ring, starbase) orbiting the planet` |
| `scopes.log:266-268` | `starbase - Scopes from an object to its starbase.` Supported Scopes 含 `planet` |
| `scopes.log:18-20` | `orbit - Scopes to the planet the current object is in orbit of.` Supported Scopes 含 `starbase` |

合起来就是：**引擎给每个行星对象存了一个"我的轨道上的空间站"槽位**，文档里叫 `orbital_defence`，它的取值可以是星环基地，也可以是普通恒星基地；而"恒星基地"恰好就是建在主星这个行星对象上的。于是：

- 普通行星殖民地：该槽位空着，**直到造出星环基地**（因为星环就是一个 starbase）才被填上；
- 星位殖民地：该槽位在星系被占领的那一刻就被**本星系恒星基地**占住。

`orbital_defence` 在脚本里就是这么用的（取它的 `.starbase` 查星环建筑）：

```pdx
# common/scripted_triggers/01_scripted_triggers_buildings.txt:1339-1349
		if = {
			limit = {
				exists = orbital_defence
			}
			orbital_defence.starbase? = {
				NOR = {
					has_starbase_building = $RING$
					is_starbase_building_building = $RING$
				}
			}
		}
```

### 5. 按钮本身：`OPEN_ORBITAL_RING` / `open_orbital_ring`，可见性由引擎决定

**本地化键只有一个：`OPEN_ORBITAL_RING`。**（用户口语里的"查看星环基地"不是游戏里的字符串：`localisation/simp_chinese/**` 里搜 `查看星环基地` 命中 **0** 次；"星环基地"对应的按钮键只有 `OPEN_ORBITAL_RING`。）

| 语言 | 文件:行 | 文本 |
| --- | --- | --- |
| english | `localisation/english/overlord_mega_l_english.yml:156` | `OPEN_ORBITAL_RING:0 "§HOpen Orbital Ring§!"` |
| simp_chinese | `localisation/simp_chinese/overlord_mega_l_simp_chinese.yml:136` | `OPEN_ORBITAL_RING: "§H打开星环基地§!"` |

UI 元素定义在行星视图里，**整块没有任何 `visible` / `enabled` / 触发器字句**：

```pdx
# interface/planet_view.gui:430-442
		# Header Buttons
		containerWindowType = {
			name = "header_actions"
			position = { x = 877 y = 12 }
			size = { width = 283 height = 40 }

			buttonType = {
				name = "open_orbital_ring"
				quadTextureSprite = "GFX_button_orbital_ring_solid"
				position = { x = 40 y = 0 }
				clicksound = "click"
				pdx_tooltip = "OPEN_ORBITAL_RING"
			}
```

全库搜 `open_orbital_ring` 只此一处（`interface/**` 唯一命中）；键名也出现在 `stellaris.exe` 的界面元素名表里（与 `previous_planet` / `next_planet` / `move_capital` / `go_to_observation_post` 相邻），说明**可见性是 C++ 代码判定的，脚本层没有任何可覆盖的入口**。脚本侧也**不存在** `has_orbital_ring` 之类的触发器：`logs/script_documentation/triggers.log` 里含 `orbital` 的条目只有两条，都与按钮无关：

```
4680: any_owned_nonprimary_starbase - Iterate through every owned non-primary starbase (e.g. orbital rings, deep space citadels, or waystations). ...
4684: count_owned_nonprimary_starbase - Iterate through every owned non-primary starbase (e.g. orbital rings, deep space citadels, or waystations). ...
```

### 6. 现象解释（把 3 + 4 + 5 串起来）

**【实机】**在本机 geocentric mod（`<mods>\geocentric_origin`，把 `pc_geocentric_earth` 定义成 `star = yes` + `colonizable = yes`，并用 `sc_geocentric` 星类放进星位）里，星位殖民地一被殖民（**没有建造任何星环基地**），行星视图就出现该按钮；按下后跳到**本星系恒星基地**。

与文件证据完全吻合的机制链条：

1. 星环基地 = starbase（第 3 节），所以"查看星环基地"实际是"打开**挂在这颗行星轨道上的那座 starbase** 的基地视图"；
2. 星系恒星基地建在**主星行星对象**上（第 4 节），因此星位殖民地的 `orbital_defence` / `starbase` 槽位从星系被占领起就有值；
3. 按钮的显隐由引擎按该槽位判定（第 5 节），于是它**立即**出现，且打开的对象就是那座恒星基地。

**结论：这是引擎把"星环基地"和"恒星基地"当同一族对象（starbase）、并用同一个"行星轨道上的空间站"槽位驱动 UI 所导致的 UI 假象——它不是星环机制真的被触发，按钮指向的确实就是恒星基地。** 原版因为 14/14 星类都 `colonizable = no`，永远不可能出现星位殖民地，所以这个假象在原版不可见。

**至于"星位上到底能不能真的造出星环基地"**：`placement_rules.planet_possible`（`common/megastructures/15_orbital_ring.txt:58-125`）**没有** `is_star = no`、没有主星排除、也没有行星尺寸检查，唯一的行星侧硬条件是 `is_colony = yes`（`:73`）；`possible`（`:48-56`）只要求 `exists = starbase` 与 `is_inside_border = from`。**从文件看，星位殖民地并不会被规则显式挡住**，但是否真能建成（星位上会同时存在恒星基地与星环基地两座 starbase、建造船下达指令是否可行）**本机没有实测**，因此不能断言"机制真的成立"。就本次观察而言，用户尚未建造星环，按钮打开的是恒星基地 —— **是 UI 假象，不是机制生效**。

### 7. 渲染问题（**已解决，实机验证**）：星位由 `star_gfx` 决定走"恒星表面路径"还是"普通实体路径"

- **【实机】已解决并验证**：星位上的天体**默认由引擎的"恒星表面"路径绘制**，行星类自己的 `entity` 网格**根本不画**。在星位行星类上写 `star_gfx = no` 就会切回普通实体渲染，模型立刻正常显示。
- **【实机】**同一个自定义实体（包裹原版 `planet_clouded_mesh` 网格 + 地球贴图）在**行星槽位**能渲染；搬到星位后**不加** `star_gfx = no` 就什么都不画；加上它即正常。**注意：本文第 6 节里那个"星环基地按钮"的观察，是在这颗天体已经正常渲染的状态下做出的**，不是在一个空白天体上点出来的。
- **【实测日志】**出问题时 `logs/error.log` 里搜 `Failed to find entity` 命中 **0** 次——引擎不报"找不到实体"，所以这不是名字查找失败。该行星类确实被加载：`logs/setup.log:11399` = `Planet Class #70 tag = pc_geocentric_earth name = 地球`。**"没有报错但看不见"正是这条渲染路径的症状。**

原版证据链（**【文件】**，读自 `<Stellaris>`）：

- 星类的 `class = <id>` 决定 `gfx/worldgfx/star_<id>.txt` 这套**恒星表面/光照**设置：`common/star_classes/00_star_classes.txt:5` = `class = b_star  # ID as referenced by GFX and code, to determine lighting`；`gfx/worldgfx/star_g_class.txt:5` = `world = g_star`、`:94` = `system_light="g_class_star"`。
- **`star_gfx` 在 vanilla `common/` 里恰好只出现 3 次，全部是 `star_gfx = no`，且这 3 个 `star = yes` 类的实体都不是原版"恒星网格"**：

| 行星类 | `star_gfx = no` | 实体（行） | 实体用的网格 |
| --- | --- | --- | --- |
| `pc_t_star` | `common/planet_classes/00_planet_classes.txt:1273` | `t_star_class_star_entity`（`:1261`） | `planet_clouded_mesh`（`gfx/models/planets/distant_stars_planets/_distant_stars_star_entities.asset:16`） |
| `pc_protostar` | `common/planet_classes/06_planet_classes_nomads.txt:123` | `t_star_class_star_entity`（`:111`） | 同上 |
| `pc_rift_star` | `common/planet_classes/00_planet_classes_astral_planes_dlc.txt:10` | `crystal_rift_entity`（`:2`） | `Crystal_Rift`（`gfx/models/add_ons/_add_ons_entities.asset:812`） |

- 剩下 11 个 `star = yes` 类都不写 `star_gfx`（默认 yes），实体一律是**专用恒星网格** `star_mesh` / `black_hole_new_mesh` / `neutron_star_mesh` / `pulsar_mesh`，**且这些实体连贴图都没写**——恒星的外观完全由 worldgfx 的恒星表面路径提供：

```pdx
# gfx/models/planets/_star_entities.asset:66-75（G 型恒星：pdxmesh = star_mesh，没有任何 meshsettings/贴图）
entity = { # G
	name = "g_star_class_star_entity"
	pdxmesh = "star_mesh"

	default_state = "idle"
	state = { name = "idle" animation = "idle"
		event = { time = 0.0 node = "planet" particle = "g_class_star_particle"  keep_particle = no trigger_once = yes sound = { soundeffect = "amb_star_fusion" } }
	 }
	scale = 1.3
}
```

- 而**已知能在星位上正常显示的"行星风格"实体长这样**——`t_star_class_star_entity` 用行星网格 + 显式贴图 + **自发光 shader**（`PdxMeshPlanetEmissive`），这也是 `pc_t_star` / `pc_protostar` 能看见棕色矮星的原因：

```pdx
# gfx/models/planets/distant_stars_planets/_distant_stars_star_entities.asset:14-25
entity = {  # T Brown Dwarf
	name = "t_star_class_star_entity"
	pdxmesh = "planet_clouded_mesh"

	#planet surface texture override
	meshsettings = {
		name = "planet_geosphereShape"
		texture_diffuse = "brown_dwarf_01_diffuse.dds"
		texture_normal = "brown_dwarf_01_normal.dds"
		texture_specular = "brown_dwarf_01_specular.dds"
		shader = "PdxMeshPlanetEmissive"
	}
	...
}
```

两条可操作的结论：

1. **`star_gfx = no` 是"星位天体不显示"的通用解**。任何把自定义天体（尤其是行星风格网格）放进星位的 mod，都必须在那个行星类上写 `star_gfx = no`；否则引擎走恒星表面路径，`entity` 指定的网格完全不被绘制，而且**不会有任何 `Failed to find entity` 报错**——正是"存在、可殖民、但看不见"的症状。
2. **星位上的天体没有外部光源**（它自己就在系统中心），所以原版那套"被恒星照亮"的行星 shader 可能把它画成全黑；能正常显示的参照实现（`t_star_class_star_entity`）用的是 `PdxMeshPlanetEmissive`（`:24`）。要给星位天体换网格时，照抄这条自发光 shader 是安全做法。

## 语法与字段

### 星位可殖民天体的最小三件套

```pdx
# 1) common/planet_classes/zz_my_star_body.txt —— 星位行星类
pc_my_star_body = {
	entity = "my_full_entity_name"        # 星位：原样查找，必须是完整注册名
	entity_scale = 20.0
	icon = GFX_planet_type_continental
	icon_large = GFX_planet_type_continental_big

	atmosphere_color		= hsv { 0.58 0.5 0.9 }
	atmosphere_intensity	= 1.0
	atmosphere_width		= 0.5

	climate = "luminosity_2"              # 星类惯例：光照气候
	star = yes
	star_gfx = no                         # ★ 必须写！否则星位走恒星表面路径，本类的 entity 完全不画（未文档化字段，见"机制 7"）

	min_distance_from_sun = 0             # 星类惯例：不参与行星随机抽取
	max_distance_from_sun = 0
	spawn_odds = 0

	extra_orbit_size = 0
	extra_planet_count = 0
	chance_of_ring = 0

	planet_size = 100
	moon_size = 1

	colonizable = yes                     # ★ 原版 14/14 星类都是 no
	district_set = standard               # 4.x：区划可用性靠 uses_district_set，不是 is_planet_class
	starting_district = district_city

	uses_alternative_skies_for_moons = yes
	uses_alternative_skies_if_has_orbital_ring = yes   # 该字段本身是合法的行星类字段（00_planet_classes.txt:40）
}

# 2) common/star_classes/zz_my_star_classes.txt —— 让星位生成这个类
sc_my_star_body = {
	class = g_star                        # 光照/GFX id（决定 gfx/worldgfx/star_<id>.txt）
	planet = { key = pc_my_star_body }    # ★ 星位真正生成的行星类
	spawn_odds = 0                        # 不进随机银河，只由 initializer 显式使用
	num_planets = { min = 1 max = 1 }
}

# 3) common/solar_system_initializers/zz_my_initializer.txt
my_home_system = {
	class = "sc_my_star_body"
	usage = origin
	planet = {
		class = star                      # 由星类决定具体类；也可直接写 "pc_my_star_body"
		orbit_distance = 0
		orbit_angle = 0
		size = 100
		has_ring = no
		starting_planet = yes
		flags = { ignore_startup_effect }
	}
}
```

要让这个种族在创建界面有"理想行星"，还需要一个同名匹配的宜居偏好特质（`trait_<行星类键>_preference` 或 `ideal_planet_class = <行星类>`）以及对应的物种预览背景 sprite，详见 `traits-species` 主题。

### 星环基地 = starbase 的关键字段

```pdx
# common/megastructures/15_orbital_ring.txt（节选；行号见正文）
orbital_ring = {
	starbase = starbase_level_orbital_ring_tier_1   # :12  建成后遗留的基地
	placement_rules = {
		planet_possible = {
			is_colony = yes                          # :73  唯一的行星侧硬条件（没有 is_star 排除）
		}
	}
	on_build_complete = {
		fromfrom.planet = { set_carrier_flag = has_megastructure }   # :166
		remove_megastructure = fromfrom                              # :169 巨型结构本体消失
	}
}

# common/starbase_levels/02_orbital_ring_levels.txt:1-10
starbase_level_orbital_ring_tier_1 = {
	ship_size = orbital_ring_tier_1
	picture = "GFX_orbital_ring_background"
	module_slots = { 1 2 }
	can_always_dismantle = yes
}

# common/ship_sizes/00_orbital_rings.txt:84
	is_orbital_ring = yes	# Identifies this ship size as an orbital ring for UI tooltip selection

# common/starbase_types/00_starbase_types.txt:1276-1277
sorbital_ring = { # generic
	potential = { is_orbital_ring = yes }
```

### 恒星基地挂在主星上

```pdx
# common/ship_sizes/00_starbases.txt:86-92（starbase_outpost；同一段见 :543 :593 :644 :697 :748 :799 :856 :911 :996）
	potential_construction = {
		is_scope_type = planet
		is_primary_star = yes                      # ★ 恒星基地是"建在主星这颗行星上"的
		NOT = {
			exists = orbital_defence               # ★ 与星环基地共用同一个"轨道空间站"槽位
		}
	}
```

### 按钮与本地化

```pdx
# interface/planet_view.gui:430-442 —— 无 visible / enabled，显隐由引擎决定
		containerWindowType = {
			name = "header_actions"
			buttonType = {
				name = "open_orbital_ring"
				quadTextureSprite = "GFX_button_orbital_ring_solid"
				pdx_tooltip = "OPEN_ORBITAL_RING"
			}
		}
```
```yaml
# localisation/english/overlord_mega_l_english.yml:156
 OPEN_ORBITAL_RING:0 "§HOpen Orbital Ring§!"
# localisation/simp_chinese/overlord_mega_l_simp_chinese.yml:136
 OPEN_ORBITAL_RING: "§H打开星环基地§!"
```

### 两种槽位的实体名写法

```pdx
# 行星槽位：基名 + 引擎补变体后缀
# common/planet_classes/00_planet_classes.txt:1373   entity = "ringworld_habitable_entity"
# gfx/models/planets/_planetary_entities.asset:2991  name = "ringworld_habitable_entity_01_entity"

# 星位：原样查找，写完整注册名
# common/planet_classes/00_planet_classes.txt:1149   entity = "g_star_class_star_entity"
# gfx/models/planets/_star_entities.asset:67         name = "g_star_class_star_entity"
```

## 校验要点

- `star = yes` 的类必须补星类惯例字段：`climate = "luminosity_<0-4>"`、`min_distance_from_sun = 0`、`max_distance_from_sun = 0`、`spawn_odds = 0`（原版 14/14 都这么写）。想让它在星位上可殖民，再加 `colonizable = yes` + `district_set`（4.x 用 `uses_district_set` 判定区划）。
- 星类的 `planet = { key = <行星类> }` 必须是**真实存在的行星类键**；星类的 `class = <id>` 决定 `gfx/worldgfx/star_<id>.txt`（光照/表面/`system_light`），写一个没有 worldgfx 文件的 id 等于没有该恒星的光照配置。
- **星位实体的名字必须与 `.asset` 里注册的名字逐字相同**（原样查找）；写成行星槽位那种"基名"会得到 `Failed to find entity "<name>_xx_entity" for planet <...>`。行星槽位反过来：写完整名（`xxx_01_entity`）不会命中，必须写基名。
- **别指望用脚本条件复现/覆盖"星环基地按钮"**：脚本层没有 `has_orbital_ring` 之类触发器（`triggers.log` 里含 `orbital` 的只有 `any_owned_nonprimary_starbase` / `count_owned_nonprimary_starbase`），`interface/planet_view.gui` 里也没有 `visible`/`enabled` 可改；显隐在 `stellaris.exe`（C++）里。唯一可控的输入是"这颗行星的轨道上有没有 starbase"，即：它是不是主星、或它有没有星环基地。
- 要判断"行星有没有星环基地"，用脚本侧可用的等价写法：`exists = orbital_defence` / `orbital_defence.starbase? = { ... }`，或用脚本触发器 `is_orbital_ring = { has_starbase_size >= orbital_ring_tier_1 }`（作用域 starbase）。**不要**去找 `orbital_ring` 巨型结构，因为建成后它已被 `remove_megastructure` 删除（`common/megastructures/15_orbital_ring.txt:169`）。
- 星位殖民地会**从星系易主那一刻起**就满足"轨道上有空间站"，因此与星环机制无关的 UI（星环按钮）也会出现；写兼容性补丁时不要把它当成"玩家造了星环"。
- `star = yes` + `colonizable = yes` 是 **mod-only** 组合：原版 14/14 星类都是 `colonizable = no`（行号见"机制 1"表格）。若要在原版环境下复现该现象，先确认加载的 mod 里存在这样的行星类（`logs/setup.log` 会打印 `Planet Class #NN tag = <键> name = <名字>`）。
- 星位天体**必须显式写 `star_gfx = no`**，否则引擎走"恒星表面路径"（`gfx/worldgfx/star_<class>.txt`），行星类的 `entity` 网格**一个像素都不画**，而且**不会有任何报错**。判断方法：天体存在、可殖民、但看不见，`logs/error.log` 里又没有 `Failed to find entity` ⇒ 九成是漏了 `star_gfx = no`。
- 星位实体的 shader：星位天体没有外部光源，照抄原版已知能显示的 `t_star_class_star_entity` 用 `shader = "PdxMeshPlanetEmissive"`（`gfx/models/planets/distant_stars_planets/_distant_stars_star_entities.asset:24`）是安全做法；用普通受光行星 shader 可能全黑。
- 星位实体不渲染时，**先看 `logs/error.log` 有没有 `Failed to find entity`**：有 ⇒ 名字/变体问题；没有 ⇒ 名称写对了，问题在渲染路径（几乎总是 `star_gfx`）。

## 常见错误

- **在星位上写"基名"实体**（照抄行星类的写法）：星位是原样查找，得不到变体探测，报 `Failed to find entity "<name>_xx_entity" for planet <...>`。把 `.asset` 里注册的完整名字写进去。
- **以为星环基地是一个"巨型结构对象"**：建成瞬间 `remove_megastructure` 就把它删掉了（`common/megastructures/15_orbital_ring.txt:164-173`），留在行星轨道上的是一个 `starbase`（`starbase = starbase_level_orbital_ring_tier_1`，`:12`）。任何"检查行星有没有 `orbital_ring` 巨型结构"的写法都是错的。
- **把用户口语的"查看星环基地"当成本地化键去搜**：`localisation/**` 里没有这个字符串；真正的键是 `OPEN_ORBITAL_RING`（英文 `Open Orbital Ring`，简中 `打开星环基地`）。
- **在 `interface/planet_view.gui` 里给 `open_orbital_ring` 加 `visible = { ... }` 来"修好"这个按钮**：原版该元素本来就没有可见性字句（引擎判定），加了也不生效/会覆盖原版 UI 文件，属于高风险无收益改动。
- **以为 `star = yes` 的类不能 `colonizable = yes`（或反过来以为引擎会拦）**：引擎不拦；但它会带来星位殖民 + 星环按钮假象 + 需要 `star_gfx = no` 这一串副作用，原版从不这么做。
- **指望 `fixed_entity_scale` 把星位的"基名"自动补成实体资源名**：实测不会（见 `system-initializers` 主题的"被推翻的假设"）。
- **星位行星类漏写 `star_gfx = no`**：这是"星位天体看不见"的头号原因。默认值 yes 表示走恒星表面路径，`entity` 网格不参与绘制；因为没有实体查找失败，日志里也不会报错。该字段在任何字段文档里都查不到（`common/planet_classes/00_planet_classes.txt` 的文件头没有它，`logs/script_documentation/*.log` 里 0 命中），只能从原版那 3 个 `star_gfx = no` 的星类反推。

## 待确认

- **（已解决，保留记录）星位天体不显示的成因是 `star_gfx`（默认 yes）**：实机验证写成 `star_gfx = no` 即恢复显示（见"机制 7"）。仍然**未从引擎侧核实**的是：`star_gfx` 的合法取值集合（是否只有 yes/no）、默认值来源、以及它是否只影响"表面路径 / 实体路径"这一件事（例如是否还牵动光照或粒子）。该字段在 `logs/script_documentation/*.log` 里 0 命中，任何字段文档里也没有它。
- "**非恒星网格就必须 `star_gfx = no`**"目前只是**原版相关性的归纳**：3 个写 `star_gfx = no` 的星类实体都不是恒星网格（`planet_clouded_mesh` / `Crystal_Rift`），另外 11 个不写的都用 `star_mesh` / `black_hole_new_mesh` / `neutron_star_mesh` / `pulsar_mesh`。这条规律是否就是引擎的判定规则（例如引擎是否按网格类型自动判断），未从引擎侧确认。
- 星位天体是否**总是**缺外部光照（因此必须用自发光 shader）未系统测试：本文只确认原版里能正常显示的 `t_star_class_star_entity` 用的是 `PdxMeshPlanetEmissive`（`gfx/models/planets/distant_stars_planets/_distant_stars_star_entities.asset:24`），而普通行星实体用的是受光 shader。
- **星位殖民地上能否真的建成星环基地未实测。** 文件层面 `placement_rules.planet_possible` 不排斥主星（唯一硬条件 `is_colony = yes`，`common/megastructures/15_orbital_ring.txt:73`），但"主星上已经有恒星基地（`is_primary_star = yes` 的那座）时能否再放一座星环 starbase"、建造船能否在该轨道下指令，都没有测试证据。**因此本文只断言按钮是 UI 假象，不断言机制可用或不可用。**
- **`open_orbital_ring` 按钮的确切 C++ 判定条件不可从数据文件读出。** `.gui` 无 `visible`/`enabled`，脚本层无 `has_orbital_ring` 类触发器；本文的结论"条件 = 该行星的 `orbital_defence` / 轨道 starbase 槽位有值"是从 `scopes.log:318`、`scopes.log:266-268`、`scopes.log:18-20`、`common/ship_sizes/00_starbases.txt:86-92` 与实机现象**推出来的**，不是从引擎代码读出来的。它是否在普通行星上也能被"任意轨道 starbase"触发（例如别的会生成 starbase 的巨型结构）未验证。
- 星类 `planet = { key = ... }` 指向一个 `colonizable = yes` 且 `star = yes` 的类时，AI 是否会尝试殖民、以及殖民判定用的是哪套触发（`is_colonizable` 是否含 `is_star` 例外）未核对。
- 星位殖民地在 `common/scripted_effects/00_scripted_effects.txt:4540` 那类"`is_star = no`"守卫的破坏行星效果里会被跳过——即**星位殖民地是否能被常规灭星效果处理**未核对（那段 limit 明确写了 `is_star = no`）。

## 参考

- [Planet Generation modding](https://stellaris.paradoxwikis.com/Planet_Generation_modding)
- [System modding](https://stellaris.paradoxwikis.com/System_modding)
- [Starbase modding](https://stellaris.paradoxwikis.com/Starbase_modding)
- 游戏自带（权威，全部读自 `<Stellaris>`，Pegasus v4.4.6）：
  - `common/planet_classes/00_planet_classes.txt`（`:1064-1364` 11 个 `star = yes` 星类 + `:1743` `pc_toxoid_star`；`:1148` `pc_g_star`；`:1371-1373` 行星槽位基名写法）、`00_planet_classes_astral_planes_dlc.txt`、`06_planet_classes_nomads.txt`
  - `common/star_classes/00_star_classes.txt`（`:4-6` 文件头 `class` 与 `planet.key` 的分工；`:23-27` `sc_b`）
  - `common/megastructures/15_orbital_ring.txt`（`:12` starbase、`:58-125` placement_rules、`:164-173` on_build_complete）
  - `common/starbase_levels/02_orbital_ring_levels.txt`、`common/ship_sizes/00_orbital_rings.txt`（`:84`）、`common/starbase_types/00_starbase_types.txt`（`:1274-1278`）
  - `common/ship_sizes/00_starbases.txt`（`:8` `starbase_outpost`、`:86-92` 及其他 9 处 `is_primary_star = yes`）
  - `common/scripted_triggers/00_scripted_triggers.txt:3963-3965`（`is_orbital_ring` 脚本触发器）
  - `gfx/models/planets/_star_entities.asset:66-75`（`g_star_class_star_entity`：`star_mesh`，**无任何贴图**）、`gfx/models/planets/_planetary_entities.asset:2990-2993`、`gfx/models/planets/distant_stars_planets/_distant_stars_star_entities.asset:14-25`（`t_star_class_star_entity`：`planet_clouded_mesh` + `shader = "PdxMeshPlanetEmissive"`，星位可显示的参照实现）、`gfx/models/add_ons/_add_ons_entities.asset:811-812`（`crystal_rift_entity`：`Crystal_Rift`）
  - `gfx/worldgfx/star_g_class.txt:5/94`（`world = g_star`、`system_light`）
  - `interface/planet_view.gui:430-442`、`interface/planet_view.gfx:1932-1940`、`interface/starbase_view.gui:10-11`、`interface/topbar_species_view.gfx:195-355`
  - `localisation/english/overlord_mega_l_english.yml:156`、`localisation/simp_chinese/overlord_mega_l_simp_chinese.yml:136`
- 本机用户数据（`%USERPROFILE%\Documents\Paradox Interactive\Stellaris\`）：
  - `logs/script_documentation/scopes.log:18-20/266-268/318`、`triggers.log`（`is_primary_star`）
  - `logs/game.log:1`（版本）、`logs/setup.log:11399`（行星类加载）、`logs/error.log`（`Failed to find entity` 0 命中）
- 引擎二进制：`<Stellaris>\stellaris.exe`（界面元素名表内的 `open_orbital_ring`；格式串 `Failed to find entity "`、`_xx_entity" for planet `、`Trying to change sprite to unknown sprite '%s'`）
- 本机 mod（现象来源，**非 vanilla 证据**）：`<mods>\geocentric_origin`（`common/planet_classes/zz_geocentric_planet_classes.txt`、`common/star_classes/zz_geocentric_star_classes.txt`、`gfx/models/planets/zz_geocentric_entities.asset`）

> **通用结论（给任何把自定义天体放进星位的 mod）**：星位天体不显示的答案就是给该行星类加 `star_gfx = no`，并让实体用自发光 shader（如 `PdxMeshPlanetEmissive`）。这两条与具体 mod 无关，是引擎"星位默认走恒星表面路径"的直接后果。
