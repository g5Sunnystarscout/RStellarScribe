---
id: name-lists
category: content
title: Name Lists
title_zh: 命名组
file_types: [common/name_lists/*.txt, localisation/<lang>/name_lists/name_list_<KEY>_l_<lang>.yml]
tags: [character_names, ship_names, planet_names, category, alias, name_list, selectable, random_names, sequential_name]
related: [traits-species, localisation-basics]
sources: [https://stellaris.paradoxwikis.com/Modding, https://stellaris.paradoxwikis.com/Species_modding]
verified_version: "Pegasus 4.4.6 实机文件核对"
---
## 概要

命名组（name list）决定一个帝国/物种的**舰船名、舰队名、陆军名、行星名、领袖人名**。权威文档是游戏自带的 `common/name_lists/README_NAME_LISTS.txt`（75 行，**必须整读**）。目录内共 **76 个文件**（含 README），每个文件通常只定义一个顶层命名组。

关键结论（本次核对推翻的两个常见假设）：

1. **命名组的显示名键是 `name_list_<KEY>`，全大写 KEY**，例如 `name_list_MAM1:0 "Mammalian 1"`（`localisation/english/main_3_l_english.yml:2395`）。README 里没有写这个约定，但 `main_3_l_english.yml` 的 `#### NAMELIST EMPIRE NAMES` 段落（2380–2460 行）是**全部命名组显示名的唯一集中定义处**。
2. **`character_names` 里的名字条目是本地化键，不是字面文本**。`MAM1.txt:235` 写的是 `MAM1_CHR_Tig`，对应 `localisation/english/name_lists/name_list_MAM1_l_english.yml:2` 起的 `MAM1_CHR_Tig:0 "Tig"`。舰船/舰队/行星名同理（`MAM1_SHIP_*` / `MAM1_FLEET_*` / `MAM1_PLANET_*`）。**生成器必须同时产出 common 脚本和 yml**。

## 文件位置与命名

- `common/name_lists/*.txt`：命名组本体。覆盖类型是 **DUPL/NO**（整文件替换），要加新命名组就新开文件。
- `localisation/<lang>/name_lists/name_list_<KEY>_l_<lang>.yml`：**每个命名组一个文件**，命名与顶层键一一对应。4.4.6 实测路径是 `localisation\english\name_lists\`（有子目录，不是直接摊在 `localisation/english/` 下）。
- `localisation/<lang>/name_lists/name_lists_l_<lang>.yml`：1012 行，**这个文件的 `HUM:` / `MAM:` / `MAM_plural:` 等键是「物种类别」的本地化，不是命名组显示名**，不要混用。
- 命名组显示名集中在 `localisation/<lang>/main_3_l_english.yml` 的 NAMELIST EMPIRE NAMES 段落。

## 语法与字段

顶层字段（含实测出现次数，统计自 76 个文件）：

- `selectable = { ... }`（16 次）：**是 trigger 块，不是布尔**。所有 vanilla 用例都写成 `selectable = { always = no }`，即「不在帝国设计器里出现」。不写默认可选。例：`AI.txt:3`、`SpaceFauna.txt:2`。
- `randomized = no`（21 次）：布尔，默认 yes（README 第 2 行）。例：`HUMAN1.txt:7`、`PRT1.txt:6`。
- `alias = "Human"`（3 次，`HUMAN1.txt:8` / `HUMAN2.txt:8` / `HUMAN3.txt:8`）：脚本引用命名组时的备用名，可定义多次。
- `trigger = { ... }`（全目录 **仅 1 次**，`PRT1.txt:10` 的 `trigger = { is_pirate = yes }`）：作用域是 country，控制随机命名组能否被选中。
- `category = "Humanoid"`（61 次）：供 `name_list_category` 触发器使用。实测取值共 16 种：`"Humanoid"`(7)、`"Molluscoid"`/`"Machine"`/`"Mammalian"`/`"Reptilian"`/`"Necroid"`/`"Plantoid"`/`"Avian"`/`"Arthropoid"`/`"Aquatic"`/`"Fungoid"`/`"Lithoid"`(各 4)、`Toxoid`(4)、`Infernal`(4，**无引号**)、`"Hive Mind"`(2)。
- `customize_random_override = HUM2`（8 次）：帝国设计器里「随机」按钮改用指定命名组。例：`HUMAN1.txt:6`、`HIVE1.txt:6`、`X_MACHINE_AGE2.txt:2`。
- `should_name_home_system_planets = no`（6 次，`HIVE1/2`、`MACHINE1-4`）：母星系内非首都行星是否用 `planet_names`，默认 yes。

子块：

- `ship_names`（71 次）与 `ship_class_names`（24 次）：第二层键为 `generic` 或舰种键。实测舰种键共 37 种，主力集为 `corvette`/`destroyer`/`cruiser`/`battleship`/`titan`/`colossus`/`science`/`colonizer`/`constructor`/`transport`（各 63–66 次）、`military_station_small`(67)、`ion_cannon`(62)、`juggernaut`(29)，另有 `sponsored_colonizer`、`mining_station`、`research_station`、`military_station_large/medium`、`observation_station`、`starbase_outpost/starport/starhold/starfortress/citadel` 等。README 第 10 行：`generic` 与舰种专属名单**同时存在时各 50% 概率**。`ship_class_names` 缺失时回退到 `ship_names`（README 第 13 行）；实测 24 个文件的 `ship_class_names` **只有 `generic`**。
- `fleet_names`（72 次）：只有两个成员 —— `random_names = { ... }`(62) 与 `sequential_name = KEY`(62)，成对出现。例：`MAM1.txt:50-55`。
- `army_names`（67 次）：`generic`(59) 加具体兵种键，成员与 `fleet_names` 相同（`random_names` / `sequential_name`）。实测兵种键 30+ 种：`defense_army`、`assault_army`、`slave_army`、`robotic_army`、`robotic_defense_army`、`psionic_army`、`xenomorph_army`、`clone_army`、`occupation_army` 等。
- `planet_names`（68 次）：`generic = { names = { ... } }`(65) 加星球类别键 `pc_desert`/`pc_tropical`/`pc_arid`/`pc_continental`/`pc_ocean`/`pc_tundra`/`pc_arctic`/`pc_savannah`/`pc_alpine`（各 63–67 次），另有少量 `pc_gaia`(3)、`pc_nuked`(1)。**注意 `names = { }` 这层不能省**。
- `character_names`（70 次）：第二层是「命名文化」键，**`default`(65) 只是其中一种**；`HUMAN1.txt` 用的是 `names1` … `names11`（279–616 行），每个文化块带自己的 `weight`（全目录 23 处；`HUMAN1.txt:280` = 40）。第三层字段实测出现次数：`second_names`(79)、`regnal_second_names`(77)、`full_names`(58)、`first_names`(50)、`regnal_first_names`(49)、`first_names_female`(43)、`first_names_male`(43)、`regnal_first_names_female`(39)、`regnal_first_names_male`(39)、`second_names_male`(14)、`full_names_female`(14)、`full_names_male`(14)、`second_names_female`(14)、`regnal_full_names`(4)、`use_full_regnal_name`(4)、`use_full_regnal_name_female`(1)、`use_full_regnal_name_male`(1)。README 第 44–71 行给出了完整命名规则：全名与「首名+次名」各 50%；有性别者优先用对应性别表，空则回退非性别表；regnal 系列仅在政体 `use_regnal_names = yes` 时用于统治者与继承人。

本地化约定（**本次核实的最重要一条**）：

- 命名组显示名 = `name_list_<KEY>`（KEY 原样大写）→ `name_list_MAM1:0 "Mammalian 1"`。
- **不需要 `_plural`**：全 english loc 目录搜 `MAM1_plural` / `HUM1_plural` / `ART1_plural` 命中 0 处。`_plural` 只属于物种类别（`MAM_plural:0 "Mammalians"`）。
- `name_list_MAM1_desc` 形式存在（`federations_l_english.yml:2247` 是 `name_list_LITH_desc`，`main_3_l_english.yml:2422` 是 `name_list_MACHINE4_desc:0 ""`），可选。
- 命名组 id 与显示名键**不一定同形**：`common/name_lists/LITH1.txt` 的 id 是 `LITH1`，显示名键却是 `name_list_LITHOID1:0 "Lithoid 1"`（`main_3_l_english.yml:2425`）。`TOX1` → `name_list_TOX1`，`INF1` → `name_list_INF1`。**生成新命名组时必须保证两者都存在。**
- 名字条目是本地化键：`MAM1_CHR_Tig` → `"Tig"`；`sequential_name` 指向的键带编号占位符，如 `MAM1_STARFLEET:0 "$ORD$ Starfleet"`、`MAM1_MOLDEDTROOPS:0 "Molded Troops $R$"`。

物种与命名组的关联：

- **预设帝国**里写在 `species` 块内：`prescripted_countries/00_top_countries.txt:19` → `name_list = "HUMAN1"`（同文件 `:397` 是 `name_list = "LITHOID4"`，`82_infernals_prescripted_empires.txt:18` 是 `name_list = "INF4"`）。
- **脚本效果**里作为 `create_country` 的参数：`common/scripted_effects/01_start_of_game_effects.txt:4519` → `create_country = { species = ... name_list = HUMAN1 ... }`，此处**不加引号**。
- 也支持 `name_list = random`（`federations_event_effects.txt:725`）与事件目标（`01_start_of_game_effects.txt:4393` → `name_list = event_target:lost_colony_child`）。
- 全目录搜 `common/species_classes/*.txt` 的 `name_list` 命中 **0 处** —— 物种类别本身**不携带**命名组字段，关联只发生在 species 定义处。`category` 字符串在 vanilla 中恰好等于物种类别的英文显示名（`HUM:0 "Humanoid"` ↔ `category = "Humanoid"`），但这是约定而非文件级外键。

```pdx
# common/name_lists/zz_mycelian_names.txt
# 为新物种类别 Mycelian 配的命名组；显示名键 name_list_MYC1 需另写 yml
MYC1 = {
	category = "Mycelian"
	# 不写 selectable，默认可在帝国设计器"预设名称表"里选到
	alias = "Mycelian1"

	ship_names = {
		generic = {
			MYC1_SHIP_Sporewind MYC1_SHIP_Roothollow MYC1_SHIP_Deepsilence
			MYC1_SHIP_PaleCap MYC1_SHIP_Tanglewake
		}
		corvette = { }
		destroyer = { }
		cruiser = { }
		battleship = { }
		titan = { }
		colossus = { }
		science = { }
		colonizer = { }
		constructor = { }
		transport = { }
	}

	ship_class_names = {
		generic = { MYC1_CLASS_Sporeling MYC1_CLASS_Rootwarden MYC1_CLASS_Deepwarden }
	}

	fleet_names = {
		random_names = {
			MYC1_FLEET_Sporewind MYC1_FLEET_Roothollow MYC1_FLEET_Deepsilence
		}
		sequential_name = MYC1_STARFLEET
	}

	army_names = {
		generic = { sequential_name = MYC1_INVADERCOLUMN }
		defense_army = { sequential_name = MYC1_DEFENSIVECOLUMN }
		assault_army = { sequential_name = MYC1_INVADERCOLUMN }
	}

	planet_names = {
		generic = {
			names = {
				MYC1_PLANET_Roothollow MYC1_PLANET_Sporewind MYC1_PLANET_Deepsilence
				MYC1_PLANET_Palecap MYC1_PLANET_Tanglewake
			}
		}
		pc_continental = { names = { MYC1_PLANET_DampHollow MYC1_PLANET_Mulchrest } }
		pc_tropical    = { names = { MYC1_PLANET_Warmrot MYC1_PLANET_Greenmurk } }
	}

	character_names = {
		# culture 键自定义，带 weight
		names1 = {
			weight = 40
			full_names = { MYC1_CHR_Amanitar MYC1_CHR_Boletek MYC1_CHR_Cephalon }
			first_names = { MYC1_CHR_Ama MYC1_CHR_Bole MYC1_CHR_Ceph }
			second_names = { MYC1_CHR_nitar MYC1_CHR_tekar MYC1_CHR_alon }
			regnal_first_names = { MYC1_CHR_Ama MYC1_CHR_Bole }
			regnal_second_names = { MYC1_CHR_nitar }
			use_full_regnal_name = yes
		}
		names2 = {
			weight = 20
			first_names_male = { MYC1_CHR_Gan MYC1_CHR_Vir }
			first_names_female = { MYC1_CHR_Gani MYC1_CHR_Viri }
			second_names = { MYC1_CHR_mok MYC1_CHR_seth }
		}
	}
}
```

配套的本地化（`localisation/simp_chinese/name_lists/name_list_MYC1_l_simp_chinese.yml`）：

```yml
l_simp_chinese:
 name_list_MYC1:0 "菌丝体 1"
 MYC1_SHIP_Sporewind:0 "孢风号"
 MYC1_STARFLEET:0 "$ORD$ 星舰队"
 MYC1_PLANET_Roothollow:0 "根谷"
 MYC1_CHR_Amanitar:0 "阿玛尼塔"
```

配套的物种定义（`prescripted_countries/zz_mycelian.txt` 内）：

```pdx
mycelian1 = {
	name = "EMPIRE_DESIGN_mycelian1"
	species = {
		class = "MYC"
		portrait = "myc_portrait_01"
		name = "PRESCRIPTED_species_name_mycelian1"
		plural = "PRESCRIPTED_species_plural_mycelian1"
		adjective = "PRESCRIPTED_species_adjective_mycelian1"
		name_list = "MYC1"
		trait = "trait_organic"
	}
	playable = empire_design_always
	authority = "auth_democratic"
	civics = { "civic_beacon_of_liberty" }
	government = gov_representative_democracy
}
```

## 校验要点

1. **每个名字条目都要在 yml 里有对应键**。脚本里出现但 yml 缺失的键会在游戏内显示为裸键名（`MAM1_CHR_Tig`），不报错但很难看。可用 `Select-String -Path <yml> -Pattern '^\s*MAM1_CHR_Tig:'` 逐条核对。
2. **命名组显示名键必须是 `name_list_<KEY>` 且 KEY 大写**。写成小写 `mam1:` 不会生效（它撞的是物种肖像名键）。
3. `planet_names` 的 `names = { }` 这一层不能省略；漏掉会导致行星名不生效。
4. `fleet_names` / `army_names` 的 `random_names` 是**裸标识符列表，无逗号无引号，可换行**；写成 `= { a = 1 }` 形式是错的。
5. `selectable` 是 trigger 块：写 `selectable = no` 是语法错误，应写 `selectable = { always = no }`。
6. `customize_random_override` 与 `alias` / `trigger` / `category` 里的命名组 id **不带引号**（`alias = "Human"` 是唯一带引号的），跨文件引用前先用 `Select-String` 确认目标键存在。

## 常见错误

- **`category` 与物种类别的配对只靠字符串**：命名组的 `category` 必须**逐字等于该类别的英文显示名**。实证 `MAM1` 的
  `category = "Mammalian"` ↔ 本地化 `MAM:0 "Mammalian"`，`ART1` 的 `category = "Arthropoid"` ↔ `ART:0 "Arthropoid"`。
  脚本里**没有任何一处**互相引用，这是唯一的连接。写错（例如自定义一个标签）不会影响玩家选择，但引擎随机生成该类物种
  （前超光速文明等）时会报 `Failed to get a random class namelist in create_species effect. ClassTag = <键>`。

- **只写 common 不写 yml**：名字全部显示为裸键。这是新手最常踩的坑。
- **把 `character_names` 的名字写成中文字面量**：引擎把它当本地化键去查，查不到就原样输出。必须写成键 + yml 条目。
- **以为 `localisation/<lang>/name_lists_l_<lang>.yml` 里的 `MAM:` 是命名组显示名**：那是物种类别（`MAM:0 "Mammalian"`、`MAM_plural:0 "Mammalians"`）。命名组显示名在 `main_3_l_english.yml`。
- **给命名组加 `_plural`**：无此约定，加了也不会被读取。
- **假设命名组 id 与显示名键同形**：`LITH1` → `name_list_LITHOID1` 是反例。
- **`character_names` 里只写 `default`**：`default` 只是文化键之一；`HUMAN1.txt` 用 `names1`…`names11`，两者等价。写自定义文化键完全合法。
- **`should_name_home_system_planets` 写成 `yes` 以为能强制开启**：默认就是 yes，写它只在需要 `no` 时才有意义（6 个 vanilla 用例全是 `no`）。

## 待确认

- `name_list_category` 触发器的**匹配语义**未取证：`triggers.log:588` 只说明它是「Checks if a specific name list is used for the a species during empire creation」，作用域是 `dlc_recommendation`；全 `common/` 目录搜 `name_list_category` **命中 0 处实际用法**（只有 README 第 5 行提到），因此 `category` 字符串与物种类别的绑定究竟是字符串相等还是其他规则，无法从文件确证。
- 帝国设计器「预设名称表」下拉框**筛选命名组的具体条件**（是否要求 `selectable` 未定义、是否按 `category` 过滤、自定义物种类别需不需要额外注册）未取证。最小示例中的 `category = "Mycelian"` 是针对新物种类别写的，能否让下拉框正确分类未经实机验证。
- `by_rarity_names`（28 次）与 `design_names` 只见于 `28_biogenesis.txt` 与 `SpaceFauna.txt` 的 `default` / `bio_ship` 命名组，**未见于 README**，疑为生物船专属机制，未确认通用性。
- `alias` 在脚本中具体被哪些效果/触发器接受，未取证（README 只说「Can be referenced to in script」）。
- `sequential_name` 的编号占位符 `$ORD$` / `$R$` / `$C$` / `$SEQ$` 的确切展开规则未取证。

## 参考

- 权威文档：`common/name_lists/README_NAME_LISTS.txt`（75 行，游戏内自带）
- 显示名集中定义：`localisation/english/main_3_l_english.yml:2380-2460`
- 每命名组本地化：`localisation/english/name_lists/name_list_<KEY>_l_english.yml`
- 物种类别本地化（勿混淆）：`localisation/english/name_lists/name_lists_l_english.yml`
- 实例：`common/name_lists/MAM1.txt`、`HUMAN1.txt`、`LITH1.txt`、`ART1.txt`、`AI.txt`、`PRT1.txt`、`28_biogenesis.txt`
- [Stellaris Wiki: Modding](https://stellaris.paradoxwikis.com/Modding)
