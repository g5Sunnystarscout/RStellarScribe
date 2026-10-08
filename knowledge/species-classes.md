---
id: species-classes
category: content
title: Species Classes
title_zh: 物种类别
file_types: [common/species_classes/*.txt, common/portrait_sets/*.txt, common/portrait_categories/*.txt, common/species_archetypes/*.txt]
tags: [archetype, possible, graphical_culture, random_weight, ethics_to_prefer, portrait_sets, portrait_categories, localized_key]
related: [traits-species, name-lists, species-modding, portraits]
sources: [https://stellaris.paradoxwikis.com/Species_modding, https://stellaris.paradoxwikis.com/Portrait_modding, https://stellaris.paradoxwikis.com/Modding]
verified_version: "Pegasus 4.4.6 实机文件核对"
---
## 概要

物种类别（Species Class）是"物种所属的种族大类"，决定可用头像、性别、特质点数、默认获得的特质、舰船/城市美术风格（`graphical_culture`）。它和**物种原型**（`common/species_archetypes/*.txt`，`BIOLOGICAL` / `ROBOT` / `MACHINE` / `PRESAPIENT` / `LITHOID` / `OTHER` 共 6 个）是两件事：class 通过 `archetype = X` 挂到 archetype 上，特质点数、`robotic`、资源产出实际定义在 archetype 里，不在 class 里。

4.4.6 的权威数据是 `common/species_classes/00_species_classes.txt`（416 行）与 `01_base_species_classes.txt`（379 行），两个文件顶部 13 行注释就是官方字段清单。全部 42 个顶层键：`HUM PRE_MAM PRE_REP PRE_AVI PRE_ART PRE_MOL PRE_FUN PRE_PLANT PRE_LITHOID PRE_AQUATIC PRE_TOX PRE_INF AI SWARM EXD ROBOT MACHINE SALVAGER SHROUDWALKER MINDWARDEN_ENCLAVE PARAGON MSI_SLAVER SOLARPUNK MAM REP AVI ART MOL FUN PLANT LITHOID NECROID IMPERIAL AQUATIC TOX CYBERNETIC BIOGENESIS_02 BIOGENESIS_01 WILDERNESS PSIONIC MINDWARDEN INF`。`00_` 是"AI 帝国/事件用"，`01_` 是"帝国设计器可选"，但**两个文件加载顺序不决定优先级**，不要靠文件名控制覆盖。

## 文件位置与命名

- `common/species_classes/*.txt`：类别定义。42 个 vanilla 键**全是全大写**（`MAM`、`ART`、`LITHOID`、`BIOGENESIS_01`）。
- `common/portrait_sets/*.txt`：`00_portrait_sets.txt` 里用 `species_class = MAM`（67 处 `species_class =` 赋值）把头像集挂到类上。
- `common/portrait_categories/*.txt`：`00_portrait_categories.txt` 里用 `name = MAM`（17 个 category）把 portrait set 分组显示成帝国设计器的一个标签页。
- `common/species_archetypes/00_species_archetypes.txt`：`species_trait_points` / `species_max_traits` / `robotic` / `uses_modifiers` / `inherit_trait_points_from` / `inherit_traits_from` 在这里（例如 `@species_trait_points = 2`、`@species_max_traits = 5`）。**把这两个字段写进 species_classes 在 4.4.6 是 0 处**（只有文件头注释提到名字），能写但不生效，生效点在 archetype。

**类键大小写**：vanilla 全大写；工坊模组 `3404965433`（赛马娘）用**全小写** `umamusume`（`common/species_classes/uma_species_classes.txt:1`），并且在 `common/portrait_sets/uma_portrait_set.txt:17` 写 `species_class = umamusume`、`common/portrait_categories/uma_portrait_categories.txt:2` 写 `name = umamusume`、`localisation/simp_chinese/uma_l_simp_chinese.yml:2` 写 `umamusume:0 "赛马娘"`——自洽且可选。**结论：大小写不敏感，两种都能用**，但不能半路混用（`species_class = Mam` 去指 `MAM` 这类拼写不一致仍建议避免）。唯一的硬约定是"类键在哪出现就在三处（class / portrait_sets / portrait_categories / loc）用同一个字符串"。为了和 vanilla 风格一致、减少工具误判，**新键建议全大写**。

## 语法与字段

4.4.6 实证字段（来源均为上述两个 species_classes 文件，括号内为出现次数）：

- `archetype`：取值只有 `BIOLOGICAL`、`ROBOT`、`MACHINE`、`PRESAPIENT`、`LITHOID`、`OTHER`（来源 `common/species_archetypes/00_species_archetypes.txt`，键名逐个可查）。不写时默认 `BIOLOGICAL`（`AI`、`IMPERIAL`、`CYBERNETIC`、`WILDERNESS`、`PSIONIC` 都省略了）。
- `possible`（16 处）：**政府/伦理需求语法**，不是普通触发器。语法权威是 `common/governments/99_README_GOVERNMENT.txt`，可用 `authority = { ... }`、`ethics = { ... }`、`civics = { ... }`、`origin = { ... }`，块内用 `value = <键>` 判定，`text = <本地化键>` 覆盖自动生成的提示。样例：`authority = { NOT = { value = auth_machine_intelligence text = SPECIES_CLASS_MUST_NOT_USE_MACHINE_INTELLIGENCE } }`；`MACHINE` 里还有 `ethics = { NOR = { value = ethic_fanatic_authoritarian ... text = SPECIES_CLASS_MUST_USE_GESTALT_CONSCIOUSNESS } }`。`text` 键真实存在：`SPECIES_CLASS_MUST_NOT_USE_MACHINE_INTELLIGENCE`、`..._USE_MACHINE_INTELLIGENCE`、`..._USE_GESTALT_CONSCIOUSNESS` 在 `localisation/english/main_3_l_english.yml:3441-3443`，`SECONDARY_SPECIES_CLASS_INVALID` 在同文件 3444 行。
- `possible_secondary`（仅 1 处，`00_species_classes.txt:304`，在 `MACHINE` 上）：限制该类能否当"次要物种"，块尾 `text = SECONDARY_SPECIES_CLASS_INVALID` 给提示。
- `trait = "..."`：**授予机制是"该类所有物种自动获得该特质"**，可重复多行，也可只写一个。vanilla 用例：`trait_organic`（BIOLOGICAL 系）、`trait_lithoid`（`LITHOID` 与 `PRE_LITHOID`）、`trait_machine_unit`（`MACHINE`）、`trait_exd`（`EXD`）、`trait_infernal`（`INF`/`PRE_INF`）。这些键都真实存在于 traits：`02_species_traits_basic_characteristics.txt:41 trait_machine_unit`、`:192 trait_organic`、`:255 trait_lithoid`、`16_infernals_traits.txt:1 trait_infernal`、`12_astral_planes_traits.txt:425 trait_exd`。注意 `trait_organic` 的 `opposites = { "trait_infernal" }`、`allowed_archetypes = { BIOLOGICAL PRESAPIENT }`——**授予的特质必须对该 archetype 合法**，否则静默失败。这类特质通常是 `cost = 0` 且 `species_possible_remove = { always = no }`（不可移除）。
- `graphical_culture`（45 处）：指向 `common/graphical_culture/00_graphical_culture.txt` 的键（436 个块，如 `humanoid_01`、`mammalian_01`、`lithoid_01`、`swarm_01`）。同时决定舰船与城市外观；拆开时用国家的 `city_graphical_culture`。
- `move_pop_sound_effect`（35 处）：取值是**声音分类名**，`sound/category.asset:242-248` 定义了 `moving_pop_confirmation`、`robot_pops_move`、`arthopoid_pops_move`（注意 vanilla 自己拼错了 arthopoid）、`avian_pops_move`、`fungoid_pops_move`、`molluscoid_pops_move`、`reptilian_pops_move`。
- `playable`（32 处）/ `randomized`（32 处）：`yes` / `no` / **触发块**三选一，默认 `yes`。触发块示例：`playable = { has_lithoids = yes }`、`playable = { OR = { host_has_dlc = "Plantoids Species Pack" local_has_dlc = "Ancient Relics Story Pack" } }`、`randomized = { always = no }`。注意 `PLANT`/`NECROID` 等在 `playable` 里用 DLC 判定，`randomized` 独立判定。
- `gender = yes/no`（默认 yes）：`robot`/`machine`/`AI`/`SWARM`/`EXD`/`SALVAGER` 等写 `no`；`HUM`/`MAM` 等省略即 yes。
- `portrait_modding = yes/no`（默认 yes，2 处显式）：能否被基因/机器人改造修改头像。
- `resources = {}`（16 处）：空块或 `category = planet_pops` + 产出块；实际产出逻辑在 archetype 的 `resources` 里，class 里写 `resources = {}` 是 vanilla 的显式覆盖/占位写法，新类可省略。
- `ethics_to_prefer`（1 处，`00_species_classes.txt:329`）：**纯列表**，`{ ethic_gestalt_consciousness }`。
- `preferred_ethics_weight`（1 处，同文件 332 行）：**script value 块** `{ base = 6.5 }`，注释说"约 50% 的机械帝国会生成格式塔"。
- 其余 4.4.6 实证字段（vanilla 有，Wiki 常漏）：`uplifted_into = "MAM"`（12 处，PRE_* → 成熟类）、`use_climate_preference = no`（2 处）、`leader_age_min` / `leader_age_max`（2 处）、`generate_shipset = no`（2 处，`SOLARPUNK`/`WILDERNESS`）、`removed_climate_labels` / `added_climate_labels` / `removed_planet_types` / `added_planet_types`（各 1 处，`INF`）。

### `random_weight` 的写法（重点结论）

**4.4.6 里它是块，不是裸数字。** 证据：

1. vanilla 唯一一处 species_classes 用例是 `00_species_classes.txt:326-328`：
   ```pdx
   random_weight = {
       base = 1
   }
   ```
2. 全 `common/` 递归统计：`random_weight = {` **716 处**；形如 `random_weight = 5` 的赋值**0 处**（只有 3 处 `@xxx_random_weight = N` 是 scripted variable 定义，写法完全不同）。
3. 同类引擎字段的一致性：`common/ethics/00_ethics.txt:22-24` 的 `random_weight = { base = 150 }`；`common/ethics/99_documentation.txt:279-285` 明确写 `random_weight = { <scriptable value> }`。

**结论：写 `random_weight = 2` 是错的**，正确写法是 `random_weight = { base = 2 }`。裸数字不会按"权重"解析（引擎按 script value 块解析该键），这与"实测裸数字有问题"一致。同理 `preferred_ethics_weight` 也必须是块。

## 语法与字段（示例）

```pdx
# common/species_classes/zz_vulpine_species_classes.txt
VULP = {
	archetype = BIOLOGICAL

	possible = {
		authority = {
			NOT = {
				value = auth_machine_intelligence
				text = SPECIES_CLASS_MUST_NOT_USE_MACHINE_INTELLIGENCE
			}
		}
	}

	trait = "trait_organic"

	playable = yes
	randomized = yes

	gender = yes
	portrait_modding = yes

	graphical_culture = mammalian_01
	move_pop_sound_effect = "moving_pop_confirmation"

	resources = {}

	random_weight = {
		base = 3
	}
}
```

```pdx
# common/portrait_sets/zz_vulpine_portrait_sets.txt
# 头像必须在这里列，species_classes 里没有 portraits 字段了
vulpines = {
	species_class = VULP

	portraits = {
		"mam1"
		"mam2"
		"mam_rat"
	}

	# 这些不参与随机生成（只给玩家/预设帝国用）
	non_randomized_portraits = {
		"mam_rat"
	}
}
```

```pdx
# common/portrait_categories/zz_vulpine_portrait_categories.txt
# 这个块决定帝国设计器里出现一个名为 VULP 的标签页
vulpines = {
	name = VULP

	sets = {
		vulpines
	}
}
```

```yaml
# localisation/simp_chinese/zz_vulpine_l_simp_chinese.yml
# 至少要有 <KEY> 与 <KEY>_plural 两条，标签页才显示中文
l_simp_chinese:
 VULP:0 "狐类"
 VULP_plural:0 "狐类"
 VULP_desc:0 "狐类物种。"
```

## 校验要点

- **显示名键 = 类键本身，全大写，且必须有 `<KEY>_plural`。** 位置是 `localisation/<lang>/name_lists/name_lists_l_<lang>.yml`（注意多一层 `name_lists` 子目录，不是 `localisation/<lang>/` 根下）。实证：`localisation/english/name_lists/name_lists_l_english.yml:42 MAM:0 "Mammalian"`、`:44 MAM_plural:0 "Mammalians"`、`:134 ART:0 "Arthropoid"`、`:136 ART_plural`、`:506 LITHOID:0 "Lithoid"`、`:508 LITHOID_plural`；中文 `localisation/simp_chinese/name_lists/name_lists_l_simp_chinese.yml:38 MAM: "哺乳类"`、`:127 ART: "节肢类"`、`:486 LITHOID: "石质类"`——**"哺乳类/节肢类/石质类"确实就是这个键**（中英文里单复数同形，但键仍然分开定义）。**新增类至少定义 `<KEY>` 和 `<KEY>_plural` 两条，否则设计器标签页显示为原始键名或空白。** 可选 `<KEY>_desc`（`HUM_desc` 在 english 8-9 行附近）。
- 其他类的名字键**不限于 name_lists**：`ROBOT` 在 `main_1_l_english.yml:492`、`PSIONIC` 在 `shroud_l_english.yml:5933`、`WILDERNESS` 在 `wilderness_l_english.yml:625`、`BIOGENESIS_01/02` 与 `BIOGENESIS_CAT` 在 `biogenesis_bioships_l_english.yml:20-23`、`MINDWARDEN_ENCLAVE` 在 `shroud_l_english.yml:4836`。也就是说键可以放任意 loc 文件，**key 名本身才是契约**。`SALVAGER`/`MSI_SLAVER` 直接用 `$MAM$` 之类的嵌套引用。
- 头像：4.4.6 里类头像由 `common/portrait_sets/` + `common/portrait_categories/` 决定。`00_portrait_sets.txt` 头部注释是权威说明：`portraits`（无条件可用）、`conditional_portraits`（块内 `randomizable` / `playable` / `portraits`，可重复多个块）、`non_randomized_portraits`、`non_pre_ftl_portraits`、`uplifted_portraits`（数量必须与 `portraits` 一一对应，用于 uplift 后换头像）。`portrait_categories` 的 `sets = { ... }` 列出要显示的 set 键名，`name = <类键>` 决定归属哪个类。
- **`portraits` / `custom_portraits` 直接写在 species_classes 里**：vanilla 4.4.6 里 `portraits =` 是 **0 处**、`custom_portraits` 也是 **0 处**（两个 species_classes 文件全查）；但工坊模组 uma 在 `common/species_classes/uma_species_classes.txt:8-13` 写了 `portraits = { "umamusume" "umamusume_winning_suit" }`。`custom_portraits` 这个 token 在 `stellaris.exe` 的字符串表里**仍存在 1 次**，说明解析器没删干净。**风险结论：直写 `portraits` 属于未文档化的遗留路径，4.4.6 的 vanilla 完全不使用、也不保证被读取（uma 同时提供了 `portrait_sets`/`portrait_categories`，很可能真正生效的是后者而非前者）。新模组务必走 `portrait_sets` + `portrait_categories`，不要依赖直写。**
- 一个类要"在设计器里出现"，需要同时满足：`playable` 求值为真（DLC/触发块）+ `randomized` 允许 + 至少一个 `portrait_categories` 条目 `name = <该类键>` + `<KEY>`/`<KEY>_plural` 本地化。只有 `portrait_sets` 没有 category 时，头像不会出现在设计器。
- 特质授予要校验：`trait = "..."` 里的键必须在 `common/traits/` 存在，且其 `allowed_archetypes` 包含本类 archetype。

## 常见错误

- **`randomized` 的后果**：`randomized = yes/no/trigger (default: yes)`。保持默认 yes 但没有配对的命名组
  （见 `name-lists` 条目：命名组 `category` 必须等于本类别英文名）时，引擎每次随机生成该类物种都会报
  `Failed to get a random class namelist in create_species effect`。vanilla 对多数非核心类别显式写 `randomized = no`。

1. **`random_weight = 2`（裸数字）**：4.4.6 全 `common/` 0 处裸数字，716 处都是块。写 `random_weight = { base = 2 }`。
2. **把 `species_trait_points` / `species_max_traits` 写进 species_classes**：这两个字段在 `common/species_classes/*.txt` 里 0 处赋值，实际定义在 `common/species_archetypes/00_species_archetypes.txt`（`@species_trait_points = 2`、`@species_max_traits = 5`，`ROBOT` 0/4、`MACHINE` 1/5）。要给自定义类别不同点数，得新建 archetype（用 `inherit_trait_points_from` / `inherit_traits_from`）。
3. **以为类键必须大写**：uma 用小写 `umamusume` 全套自洽可用。真正的错误是"三处字符串不一致"（class 写 `Vulp`、portrait_sets 写 `VULP`）。
4. **只定义 `<KEY>` 不定义 `<KEY>_plural`**：vanilla 每个类都有 `_plural`（`MAM_plural`、`ART_plural`…）。
5. **把 `possible` 当普通触发器写**：它只吃 `authority` / `ethics` / `civics` / `origin` 子句 + `value` / `text`，写 `has_technology = ...` 之类无效。
6. **直写 `custom_portraits` / `portraits`**：vanilla 0 处，改用 portrait_sets。
7. **`possible` 里忘了 `text =` 时提示会很难懂**：`text` 是可选覆盖，写了才能给出"需要非机械智能政体"这类人类可读提示。
8. **`trait = "trait_organic"` 配 `archetype = ROBOT`/`MACHINE`**：`trait_organic` 的 `allowed_archetypes = { BIOLOGICAL PRESAPIENT }`，机器人系要用 `trait_machine_unit`。

## 待确认

- **重复顶层类键是否静默覆盖**：本机无法在 4.4.6 启动游戏抓 `error.log`，因此只能给出"文件层可证实"的结论——**加载模型是同一路径下所有文件并入同一数据库，重复键按加载顺序后者覆盖前者**，且 `common/species_classes/` 不在任何"DUPL/NO（整文件覆盖）"白名单里，这与"不写日志"的实测现象一致（vanilla 两个文件无任何重复类键，无法从 vanilla 取证）。**未实测确认**：
  1. 是否真的一条 log 都不写（建议自测：同一键在两个文件里给不同 `archetype`，看设计器里生效的是哪个、`logs/error.log` 是否报 `duplicate`）。
  2. `00_` 与 `01_` 之外，其他文件名前缀（如 `zz_`）的加载先后是否严格按字母序。
- `portraits` 直写在 species_classes 里是否被 4.4.6 引擎读取（uma 模组没法排除"它其实靠 portrait_sets 生效"）。
- `random_weight` 的具体数值尺度（相对权重还是绝对权重、与 `ethics_to_prefer`/`preferred_ethics_weight` 的相互作用）未实测；vanilla 只给了 `base = 1`（MACHINE）这一个物种类的样本。
- `resources = {}` 在 class 层为空块时的实际语义（是"清空继承"还是"无操作"）未确认。
- `possible_secondary` 的完整可用子句集（vanilla 只有 `MACHINE` 一例，用了 `origin` / `civics`）。

## 参考

- [Species modding (Stellaris Wiki)](https://stellaris.paradoxwikis.com/Species_modding)
- [Portrait modding (Stellaris Wiki)](https://stellaris.paradoxwikis.com/Portrait_modding)
- [Modding — Common folder 覆盖类型表 (Stellaris Wiki)](https://stellaris.paradoxwikis.com/Modding)
- 本地核对（Pegasus v4.4.6，`<Stellaris>`）：
  - `common/species_classes/00_species_classes.txt`（416 行；`:15 HUM`、`:31 PRE_MAM`、`:194 AI`、`:233 ROBOT`、`:251 MACHINE`、`:326-334 random_weight/ethics_to_prefer/preferred_ethics_weight`、`:304 possible_secondary`、`:405-416 SOLARPUNK`）
  - `common/species_classes/01_base_species_classes.txt`（379 行；`:15 MAM`、`:68 ART`、`:143 LITHOID`、`:196 IMPERIAL`、`:352-379 INF`）
  - `common/species_archetypes/00_species_archetypes.txt`（`BIOLOGICAL` / `ROBOT` / `MACHINE` / `PRESAPIENT` / `LITHOID` / `OTHER`；`@species_trait_points = 2`、`@species_max_traits = 5`）
  - `common/portrait_sets/00_portrait_sets.txt`（1523 行；头部注释 `:1-11`，`species_class = MAM` `:14`，`conditional_portraits` `:74`，`uplifted_portraits` `:561`）
  - `common/portrait_categories/00_portrait_categories.txt`（203 行；`humanoids/name = HUM` `:4-5`，`lithoids/name = LITHOID` `:104-105`，共 17 个 category）
  - `common/governments/99_README_GOVERNMENT.txt`（`possible` / `weight` 语法的官方说明，`:10-70`）
  - `localisation/english/name_lists/name_lists_l_english.yml`（`MAM` `:42`、`MAM_plural` `:44`、`ART` `:134`、`LITHOID` `:506`）
  - `localisation/simp_chinese/name_lists/name_lists_l_simp_chinese.yml`（`MAM` `:38`、`ART` `:127`、`LITHOID` `:486`）
  - `localisation/english/main_3_l_english.yml:3441-3444`（`SPECIES_CLASS_MUST_*` / `SECONDARY_SPECIES_CLASS_INVALID`）
  - `common/traits/02_species_traits_basic_characteristics.txt:41,192,255`、`16_infernals_traits.txt:1`、`12_astral_planes_traits.txt:425`
  - `sound/category.asset:242-248`（`move_pop_sound_effect` 的合法取值）
  - `common/graphical_culture/00_graphical_culture.txt`（436 个 culture 键）
  - 工坊对照模组：`D:\SteamLibrary\steamapps\workshop\content\281990\3404965433`（`common/species_classes/uma_species_classes.txt`、`common/portrait_sets/uma_portrait_set.txt`、`common/portrait_categories/uma_portrait_categories.txt`、`localisation/simp_chinese/uma_l_simp_chinese.yml`）
  - `stellaris.exe` 字符串表：`random_weight` ×2、`preferred_ethics_weight` ×2、`ethics_to_prefer` ×1、`custom_portraits` ×1、`species_max_traits` ×1、`species_trait_points` ×6
