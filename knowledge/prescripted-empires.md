---
id: prescripted-empires
category: content
title: Prescripted Empires
title_zh: 预设帝国
file_types: [prescripted_countries/*.txt, common/prescripted_flags/*.txt, common/solar_system_initializers/*.txt, localisation/*/name_lists/prescripted_countries_names_l_*.yml]
tags: [spawn_enabled, ignore_portrait_duplication, empire_flag, initializer, playable, species, ruler, is_nomadic, secondary_species]
related: [species-classes, traits-species, system-initializers, flags-icons-ports, name-lists]
sources: [https://stellaris.paradoxwikis.com/Empire_modding, https://stellaris.paradoxwikis.com/Prescripted_countries, https://stellaris.paradoxwikis.com/Modding]
verified_version: "Pegasus 4.4.6 实机文件核对"
---
## 概要

预设帝国（prescripted empire）是开局银河里可能出现的"手工设计国家"，也是帝国设计器里可供玩家直接挑选的模板。全部定义在**顶层目录** `prescripted_countries/*.txt`（注意不在 `common/` 下），4.4.6 vanilla 有 20 个文件、53 个顶层块。`00_top_countries.txt`（533 行）是人类/星球人/岩质人类等示例，包含最多字段，是首选参考。

每个顶层块是一个帝国设计：`<design_key> = { ... }`。`design_key` 就是本地化与外部引用的锚点，习惯用短标识（`humans1`、`tzynn`、`blorg`、`lithoid_humans`、`knights`）。DLC 没有独立的 prescripted_countries 目录，DLC 帝国（如 `92_necroids_prescripted_countries.txt`）也放在同一目录下。

## 文件位置与命名

- `prescripted_countries/*.txt`：帝国设计。文件名前缀（`00_`、`82_`…`99_`、`default`）只是组织习惯，**一个文件的多个块、多个文件的块都并入同一数据库**；`default.txt` 里的 `default = { ... }` 是随机生成时的兜底模板（`default = yes`，全库 1 处）。
- `common/prescripted_flags/00_default_empire_flags.txt`：`flag = <key>` 指向的**起始界面标记组**（`empire_human_1 = { flags = { human_1 custom_start_screen } }`）。它和 `empire_flag` 的图标是两回事，容易混。
- `common/solar_system_initializers/*.txt`：`initializer = "<key>"` 指向的星系生成器。实证：`sol_initializers.txt:7 sol_system_initializer`、`prescripted_species_systems.txt:7 deneb_system`、同文件 `:636 vela_system`、`custom_starting_initializers.txt:813 titawin_init`。
- `common/scripted_triggers/*.txt`：`playable` 引用的 scripted trigger。
- `gfx/portraits/asset_selectors/room_textures.txt`：`room` 的合法取值（`room_selector` 块，开头注释说明会去 `gfx/portraits/city_sets/` 找 `<名字>_room.dds`）。
- `common/ship_sizes/*.txt`：`ship_size` 的合法取值（`29_nomads_dlc_ships.txt:104 civilian_arkship_tier_1`、`:486 science_arkship_tier_1`）。
- `localisation/<lang>/name_lists/prescripted_countries_names_l_<lang>.yml` 与 `localisation/<lang>/prescripted_l_<lang>.yml`：名字类与描述类文本。

## 语法与字段

下表为 4.4.6 全部 53 个预设帝国顶层字段的实测清单（数字 = 出现次数，来源 `prescripted_countries/*.txt` 递归统计）：

| 字段 | 次数 | 说明 |
|---|---|---|
| `name` | 53 | 本地化键，习惯 `EMPIRE_DESIGN_<design_key>` |
| `adjective` | 53 | 习惯 `PRESCRIPTED_adjective_<design_key>` |
| `ship_prefix` | 53 | 习惯 `PRESCRIPTED_ship_prefix_<design_key>` |
| `species` | 53 | 主物种块，见下 |
| `room` | 53 | 起始界面房间美术，须是 `room_textures.txt` 里注册的键 |
| `authority` | 53 | 政体权威键，如 `auth_democratic` |
| `government` | 53 | 政府键，如 `gov_representative_democracy` |
| `ethic` | 104 | **可重复行**，每行一个伦理（最多 3 个，点数和须合法） |
| `origin` | 53 | 起源键，如 `origin_default`、`origin_lost_colony` |
| `graphical_culture` | 53 | 舰船美术，指向 `common/graphical_culture/` |
| `city_graphical_culture` | 53 | 城市美术 |
| `empire_flag` | 53 | 国旗块，见下 |
| `planet_name` | 53 | 母星名本地化键或 `PRESCRIPTED_planet_name_<key>` |
| `planet_class` | 53 | 母星类型，如 `pc_continental`、`pc_ark` |
| `system_name` | 53 | 母星系名 |
| `civics` | 52 | `civics = { "civic_a" "civic_b" }` 一行式（52 处全是块，无裸值写法） |
| `spawn_enabled` | 51 | `yes` / `no`，见下 |
| `playable` | 39 | scripted trigger 名，见下 |
| `initializer` | 39 | 星系生成器键；**`initializer = ""` 出现 24 次**表示不使用自定义初始星系 |
| `ignore_portrait_duplication` | 38 | `yes` / `no` |
| `flag` | 24 | `common/prescripted_flags/` 的键，如 `empire_human_1` |
| `spawn_as_fallen` | 10 | `yes`（2）/ `no`（8） |
| `advisor_voice_type` | 8 | 顾问语音，如 `"l_the_technocrat"`（`nomads_1_l_english.yml` 里有对应键） |
| `secondary_species` | 6 | 第二物种块，字段结构与 `species` 相同（见 `92_necroids_prescripted_countries.txt:22-34`） |
| `ship_size` | 2 | 起始船体，如 `"science_arkship_tier_1"` |
| `is_nomadic` | 1 | `yes`（`00_top_countries.txt:319`），游牧帝国标志 |
| `ruler` | 53 | 统治者块，见下 |
| `default` | 1 | `default = yes`，标记 `default.txt` 为兜底模板 |

### `species` / `secondary_species` 块

```pdx
species = {
	class = "HUM"                        # 物种类别键，见 knowledge/species-classes.md
	portrait = "human"                   # 头像键，须在 .gfx 里存在
	name = "PRESCRIPTED_species_name_humans1"
	plural = "PRESCRIPTED_species_plural_humans1"
	adjective = "PRESCRIPTED_species_adjective_humans1"   # 可含 $1$
	name_list = "HUMAN1"                 # common/name_lists/ 的键
	gender = indeterminable              # 可选；可选值见下
	trait = "trait_organic"              # 可重复多行
	trait = "trait_adaptive"
}
```

`gender` 取值实证：`female`、`male`、`indeterminable`（`lithoid_humans`）、`not_set`（`plantoid_humans`）。`class` 必须是 `common/species_classes/` 里存在的键；`name_list` 必须是 `common/name_lists/` 的键。

### `empire_flag` 块

```pdx
empire_flag = {
	icon = {
		category = "human"               # = <Stellaris>\flags\<category>\
		file = "flag_human_9.dds"
	}
	background = {
		category = "backgrounds"
		file = "00_solid.dds"
	}
	colors = {
		"blue"
		"black"
		"null"
		"null"
	}
}
```

**`category` / `file` 的真实资源路径是 `flags/<category>/<file>`**（`flags/` 是游戏根目录下的顶层目录，不是 `gfx/`）。4.4.6 存在的 category 目录共 22 个：`aquatic backgrounds blocky corporate domination enclaves human imperial infernal legion lithoid necroid ornate paradox pirate plantoid pointy pre_ftl special spherical toxoid zoological`。53 个预设帝国实际引用过的 category 及次数：`backgrounds`(53)、`ornate`(10)、`human`(6)、`spherical`(6)、`pointy`(5)、`zoological`(4)、`blocky`(4)、`domination`(4)、`corporate`(3)、`pirate`(3)、`legion`(3)、`toxoid`(2)、`infernal`(1)、`lithoid`(1)、`plantoid`(1)。真实 dds 举例：`flags/human/flag_human_9.dds`（该目录 19 个文件，`flag_human_1..15` + `map`/`small` 子目录）、`flags/lithoid/lithoid_03.dds`、`flags/backgrounds/00_solid.dds`（该目录 63 个 dds，含 `circle.dds`、`stripe.dds`、`flag_BG_*.dds`）。`colors` 4 槽取 `common/named_colors/00_basic_colors.txt` 的颜色名（`blue`、`black`、`toxic_green`、`shadow_teal`…），不足 4 个用 `"null"` 占位。

### `ruler` 块

```pdx
ruler = {
	name = "PRESCRIPTED_ruler_name_humans1"   # 或 PRESCRIPTED_ruler_first_name_/second_name_
	ruler_title = "RT_ARCH_SURVEYOR"          # 可选，覆盖政府默认头衔
	ruler_title_female = "RT_ARCH_SURVEYOR_FEMALE"
	heir_title = "RT_SURVEYOR_APPARENT"       # 可选
	heir_title_female = "RT_SURVEYOR_APPARENT_FEMALE"
	gender = female                            # male / female / indeterminable
	portrait = "human_female_05"
	texture = 0                                # 头像变体
	attachment = 1                             # 附件槽位
	clothes = 0                                # 服装槽位
	trait = "trait_ruler_eye_for_talent"
	leader_class = official                    # commander / official / scientist
}
```

### 语义细节（逐个取证）

- **`spawn_enabled`**：取值只有 `yes`(33) / `no`(18) 两种，**全库 0 处块写法**。`yes` = 开局银河随机生成时可以把该设计放进去；`no` = 不参与随机生成（通常仍可在设计器里选到，或作为剧情专用）。`00_top_countries.txt:8` 的行内注释写 `# yes / no / always`，但 **4.4.6 vanilla 里 `always` 一次都没出现**，不要依赖它。
- **`ignore_portrait_duplication`**：`yes`(38) 时，同一个头像可以被多个物种/帝国重复使用。默认 `no` 会让引擎在随机生成时避开重复头像——玩家自己捏的帝国也受此影响，所以预设帝国几乎都写 `yes` 以免"抢掉"某头像。
- **`playable`**：取值是 **scripted trigger 名**（`common/scripted_triggers/`），不是 yes/no。`empire_design_never` 定义在 `00_scripted_triggers.txt:349-352`：
  ```pdx
  empire_design_never = {
      optimize_memory
      always = no
  }
  ```
  即**永远不显示在帝国设计器里**（常配合 `spawn_enabled = no` 做成历史遗留 stub，见 `humans1`/`humans2` 的注释"Kept as a stub (always = no) for backward compatibility with mods referencing this empire design key"）。其他真实取值：`has_machine_age_dlc`(6)、`has_megacorp`(4)、`has_not_machine_age_dlc`(3)、`has_biogenesis_dlc`(2)、`has_grand_archive_dlc`(2)、`has_toxoids`(2)、`has_first_contact_dlc`(2)、`has_astral_planes_dlc`(2)、`has_shroud_dlc`(2)、`has_lithoids`(2)、`has_plantoids`(2)、`has_necroids`、`has_aquatics`、`has_infernals`、`has_nomads_dlc`、`has_cosmic_storms_dlc`、`has_shroud_dlc_not_machine_age`、`has_shroud_dlc_and_machine_age`、`has_not_megacorp`——**全部逐个在 `common/scripted_triggers/` 里有定义**。省略 `playable`（14 个帝国省略了）等价于始终可选。
- **`initializer`**：引用 `common/solar_system_initializers/*.txt` 的顶层键，用它替换默认母星系生成。`initializer = ""` 是合法的"不用自定义星系"写法。
- **`flag`**：引用 `common/prescripted_flags/00_default_empire_flags.txt` 的键，用于开局界面标记，与 `empire_flag` 无关。

## 校验要点

- **本地化键习惯**（`localisation/<lang>/prescripted_l_<lang>.yml` 与 `localisation/<lang>/name_lists/prescripted_countries_names_l_<lang>.yml`）：
  - `name` → `EMPIRE_DESIGN_<design_key>`，描述 `EMPIRE_DESIGN_<design_key>_desc`（`prescripted_l_english.yml:3-4`）。
  - `adjective` → `PRESCRIPTED_adjective_<design_key>`（`prescripted_countries_names_l_english.yml:6`）。
  - `ship_prefix` → `PRESCRIPTED_ship_prefix_<design_key>`（同文件 `:2`，值 `"UNS"`）。
  - 物种：`PRESCRIPTED_species_name_<key>`、`PRESCRIPTED_species_plural_<key>`、`PRESCRIPTED_species_adjective_<key>`（该键常带 `$1$`，如 `"Human $1$"`，供形容词拼接）。
  - 统治者：`PRESCRIPTED_ruler_name_<key>`，另有 `PRESCRIPTED_ruler_first_name_<key>` / `_second_name_` / `PRESCRIPTED_ruler_title_<key>`（含 `_female` 变体）用于按文化拼名。
  - 星球/星系：`PRESCRIPTED_planet_name_<key>`、`PRESCRIPTED_system_name_<key>`（也可直接用 `NAME_Earth`、`NAME_Sol` 这类通用键）。
  - 文件归属一致：`EMPIRE_DESIGN_` 系列在 `prescripted_l_*.yml`，`PRESCRIPTED_` 系列在 `name_lists/prescripted_countries_names_l_*.yml`——**放错文件不会被找到**。
- 全部 10 个语言目录都有 `name_lists/prescripted_countries_names_l_<lang>.yml`（braz_por/english/french/german/japanese/korean/polish/russian/simp_chinese/spanish）。
- `class` / `portrait` / `name_list` / `trait` / `authority` / `government` / `civic` / `ethic` / `origin` / `initializer` / `room` / `flag` / `ship_size` / `advisor_voice_type` / `playable` / `graphical_culture` 每一项都要能在对应数据库里找到同名键，否则设计会静默降级或整个帝国被丢弃。`category` 要对应 `flags/` 下的真实子目录，`file` 要对应真实 `.dds`。

## 语法与字段（最小可加载示例）

```pdx
# prescripted_countries/zz_my_prescripted.txt
my_prescripted_empire = {
	name = "EMPIRE_DESIGN_my_prescripted_empire"
	adjective = "PRESCRIPTED_adjective_my_prescripted_empire"
	ship_prefix = "PRESCRIPTED_ship_prefix_my_prescripted_empire"

	# 参与随机生成；出现在帝国设计器里（省略 playable 即始终可选）
	spawn_enabled = yes
	ignore_portrait_duplication = yes

	species = {
		class = "MAM"
		portrait = "mam1"
		name = "PRESCRIPTED_species_name_my_prescripted_empire"
		plural = "PRESCRIPTED_species_plural_my_prescripted_empire"
		adjective = "PRESCRIPTED_species_adjective_my_prescripted_empire"
		name_list = "MAM1"
		trait = "trait_organic"
		trait = "trait_adaptive"
	}

	room = "personality_federation_builders_room"

	authority = "auth_democratic"
	government = "gov_representative_democracy"
	civics = { "civic_beacon_of_liberty" "civic_idealistic_foundation" }
	ethic = "ethic_xenophile"
	ethic = "ethic_fanatic_egalitarian"
	origin = "origin_default"

	planet_name = "NAME_Earth"
	planet_class = "pc_continental"
	initializer = "sol_system_initializer"
	system_name = "NAME_Sol"

	graphical_culture = "mammalian_01"
	city_graphical_culture = "mammalian_01"

	empire_flag = {
		icon = {
			category = "human"
			file = "flag_human_9.dds"
		}
		background = {
			category = "backgrounds"
			file = "00_solid.dds"
		}
		colors = {
			"blue"
			"black"
			"null"
			"null"
		}
	}

	ruler = {
		name = "PRESCRIPTED_ruler_name_my_prescripted_empire"
		gender = female
		portrait = "human_female_05"
		texture = 0
		attachment = 1
		clothes = 0
		trait = "trait_ruler_eye_for_talent"
		leader_class = official
	}
}
```

```yaml
# localisation/simp_chinese/zz_my_prescripted_l_simp_chinese.yml
l_simp_chinese:
 EMPIRE_DESIGN_my_prescripted_empire:0 "曙光共同体"
 EMPIRE_DESIGN_my_prescripted_empire_desc:0 "一个用于测试的预设帝国。"

# localisation/simp_chinese/name_lists/zz_my_prescripted_names_l_simp_chinese.yml
l_simp_chinese:
 PRESCRIPTED_adjective_my_prescripted_empire:0 "曙光"
 PRESCRIPTED_ship_prefix_my_prescripted_empire:0 "SUN"
 PRESCRIPTED_species_name_my_prescripted_empire:0 "曙族人"
 PRESCRIPTED_species_plural_my_prescripted_empire:0 "曙族"
 PRESCRIPTED_species_adjective_my_prescripted_empire:0 "曙族$1$"
 PRESCRIPTED_ruler_name_my_prescripted_empire:0 "艾琳·瓦洛"
```

### "新帝国怎么才能在游戏里出现"

1. **文件放对**：`prescripted_countries/` 必须是模组根目录下的顶层目录（与 `common/` 同级），文件名任意 `.txt`。
2. **随机生成**：`spawn_enabled = yes`（或省略）才会进 AI 帝国的随机池；`no` 就永远不会被随机抽到。
3. **帝国设计器可选**：需要 `playable` 求值为真。**省略 `playable` 即默认可选**；写 `playable = empire_design_never` 则永久隐藏；写 `playable = has_xxx_dlc` 则按 DLC 门控。
4. **头像不被抢**：多个预设帝国共用头像时都写 `ignore_portrait_duplication = yes`，否则随机生成会互相排斥。
5. **本地化齐全**：`EMPIRE_DESIGN_<key>` 与 `EMPIRE_DESIGN_<key>_desc` 至少要有，否则设计器里显示为原始键名。
6. 若使用自定义起始星系，`initializer` 指向的键必须存在；否则删掉该行或写 `initializer = ""`。
7. 全部字段引用（class/portrait/name_list/trait/authority/government/civic/ethic/origin/room/flag/category+file）必须有效——参考上面"校验要点"。

## 常见错误

- **帝国在设计器里"看不到"是完全没有日志的。** 实机复现：`playable = empire_design_never`（其定义为 `always = no`）
  使设计从设计器里彻底消失，而 `error.log` 里**一条相关记录都没有**（整份日志 900 行，模组相关 0 条）。
  因此"引擎没抱怨"**不能**当作"内容已生效"的证据——预设帝国必须靠肉眼在设计器列表里确认。
- **不要写 `playable = yes`。** 53 个 vanilla 设计里，玩家可选的一律是**省略该字段**；写了 `playable` 的要么是 DLC 门槛
  （`has_*_dlc`），要么是 `empire_design_never`（隐藏）。`yes` 这个值 vanilla 一次都没用过。
- 每个可选的 vanilla 设计都设了 `ruler.portrait`（用物种头像名，如 `art10`/`rep9`/`mam6`，不是领袖头像名），
  并设了 `room` 与 `flag`（`flag` 指向 `common/prescripted_flags/` 里的注册定义，如 `empire_human_1 = { flags = { human_1 custom_start_screen } }`）。
  实机验证：补齐这些并对齐字段后，新帝国出现在帝国设计器列表中。

- **`prescripted_countries/*.txt` 不能带 UTF-8 BOM。** vanilla 的 53 个设计所在文件全部无 BOM。实测带 BOM 时引擎报
  `Error: "Unexpected token: =, near line: 7" in file: "prescripted_countries/<file>.txt" near line: <文件最后一行>`，
  位置指向文件末尾（"文件提前结束"），极易误判成括号没配平。注意**与 `common/name_lists/` 相反**：后者要求 BOM
  （引擎原话 `should be in utf8-bom encoding`）。

1. **把文件放进 `common/prescripted_countries/`**：4.4.6 的路径是**顶层** `prescripted_countries/`，放错位置整个文件不被加载。
2. **`spawn_enabled = always`**：注释里提到，但 4.4.6 vanilla 0 处使用，只有 `yes` / `no` 有实证。
3. **`playable = yes`**：`playable` 接的是 scripted trigger 名，不是布尔。要"始终可选"就直接省略该字段。
4. **`ethic` 写成块**：正确写法是重复的行式 `ethic = "ethic_xenophile"`（104 处），不是 `ethics = { ... }`。
5. **`civics` 写成多行裸标识符**：vanilla 52 处全是 `civics = { "a" "b" }` 带引号的一行/块内列表。
6. **`empire_flag` 的 `file` 写成相对 `gfx/` 的路径**：真实路径是 `flags/<category>/<file>`，且 `category` 必须是 `flags/` 下真实存在的子目录。
7. **`colors` 里写不存在的颜色名**：名字取自 `common/named_colors/00_basic_colors.txt`；空槽必须写 `"null"` 而不是留空。
8. **本地化放错文件**：`EMPIRE_DESIGN_*` 放 `prescripted_l_*.yml`，`PRESCRIPTED_*` 放 `name_lists/prescripted_countries_names_l_*.yml`（后者多一层 `name_lists` 子目录）。
9. **`secondary_species` 里漏 `name_list`**：结构与主 `species` 相同，字段缺失会静默失败。
10. **以为 `flag` 和 `empire_flag` 是一回事**：前者是 `common/prescripted_flags/` 的起始界面标记组，后者是国旗图标/背景/配色。

## 待确认

- **`spawn_enabled = always` 是否被 4.4.6 引擎接受**（注释写了、vanilla 0 处用例、`stellaris.exe` 未逐 token 核对）——建议自测或避免使用。
- `spawn_enabled` 与 `playable` 的**精确交互**（例如 `spawn_enabled = no` + 无 `playable` 时是否仍出现在设计器里）未实测；vanilla 里 `spawn_enabled = no` 的 18 个设计大多同时带 `playable` 或 `flag` 等其它门控。
- `ignore_portrait_duplication` 的**默认值**只从"38/53 显式写 yes"和注释推断，未在文档中查到明确默认。
- `default = yes`（`default.txt`）在随机生成失败时是"唯一兜底"还是"候选之一"未确认。
- `advisor_voice_type` 的合法取值集合未定位到定义文件（`l_the_technocrat`、`l_machine`、`l_materialist` 等 8 处用例只在 prescripted 里出现，loc 键在 `nomads_1_l_english.yml` 等）。
- `texture` / `attachment` / `clothes` 三个 ruler 槽位的合法整数范围未核对（vanilla 见 `texture 0-2`、`attachment 0-84`、`clothes 0-4`）。
- 多个文件里出现**同一 `design_key`** 时是否静默覆盖，未实测（vanilla 53 个键互不重复）。

## 参考

- [Empire modding (Stellaris Wiki)](https://stellaris.paradoxwikis.com/Empire_modding)
- [Prescripted countries (Stellaris Wiki)](https://stellaris.paradoxwikis.com/Prescripted_countries)
- [Modding (Stellaris Wiki)](https://stellaris.paradoxwikis.com/Modding)
- 本地核对（Pegasus v4.4.6，`<Stellaris>`）：
  - `prescripted_countries/`（20 个文件、53 个顶层块；字段统计见上表）
  - `prescripted_countries/00_top_countries.txt`（533 行；`humans1` `:5-76`、`humans3` `:298-380` 含 `is_nomadic`/`ship_size`/`advisor_voice_type`/`spawn_as_fallen`、`lithoid_humans` `:383-456`、`plantoid_humans` `:459-533`）
  - `prescripted_countries/92_necroids_prescripted_countries.txt:22-34`（`secondary_species` 结构）
  - `prescripted_countries/default.txt`（53 行，`default = yes`）
  - `common/scripted_triggers/00_scripted_triggers.txt:349-352`（`empire_design_never`）；`has_plantoids:359`、`has_lithoids:364`、`has_necroids:374`、`has_aquatics:384`、`has_toxoids:424`、`has_first_contact_dlc:429`、`has_astral_planes_dlc:434`、`has_cosmic_storms_dlc:439`、`has_machine_age_dlc:444`、`has_not_machine_age_dlc:449`、`has_grand_archive_dlc:456`、`has_biogenesis_dlc:482`、`has_shroud_dlc:487`、`has_shroud_dlc_not_machine_age:492`、`has_shroud_dlc_and_machine_age:500`、`has_infernals:506`；`common/scripted_triggers/02_scripted_triggers_caravaneers.txt:1`（`has_megacorp`）；`common/scripted_triggers/09_scripted_triggers_nomads.txt:76`（`has_nomads_dlc`）
  - `common/solar_system_initializers/sol_initializers.txt:7`、`prescripted_species_systems.txt:7,636`、`custom_starting_initializers.txt:813`
  - `common/prescripted_flags/00_default_empire_flags.txt:1-30`（`empire_human_1/2/3`、`empire_human_lithoid`、`empire_human_plantoid`）
  - `common/named_colors/00_basic_colors.txt`（`blue`、`black`、`toxic_green`、`shadow_teal` 等）
  - `common/ship_sizes/29_nomads_dlc_ships.txt:104,486`（`civilian_arkship_tier_1`、`science_arkship_tier_1`）
  - `gfx/portraits/asset_selectors/room_textures.txt:1-12`（`room_selector`、`default = "default_room"`、`personality_federation_builders_room`）
  - `flags/`（22 个 category 子目录；`human/` 19 项含 `flag_human_9.dds`、`lithoid/lithoid_03.dds`、`backgrounds/` 63 个 dds 含 `00_solid.dds`/`circle.dds`/`stripe.dds`）
  - `localisation/english/prescripted_l_english.yml:3-20`（`EMPIRE_DESIGN_<key>` / `_desc`）
  - `localisation/english/name_lists/prescripted_countries_names_l_english.yml:2-30`（`PRESCRIPTED_*` 六类键）
  - `localisation/english/nomads_1_l_english.yml:1947-1948`（`RT_ARCH_SURVEYOR` / `RT_ARCH_SURVEYOR_FEMALE`）
