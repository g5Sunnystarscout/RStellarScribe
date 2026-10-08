---
id: tradition-trees
category: content
title: Tradition Trees
title_zh: 传统树
file_types: [common/tradition_categories/*.txt, common/traditions/*.txt, common/ascension_perks/*.txt]
tags: [adoption_bonus, finish_bonus, tree_template, _delayed, ascension_perk]
related: [traditions-perks, localisation-basics, ai-weights]
sources: [https://stellaris.paradoxwikis.com/Tradition_modding]
verified_version: "Pegasus 4.4.6 实机文件核对"
---
## 概要

本条目只解决一件事：**从 0 造一棵完整、能被游戏加载并正确显示的传统树**。一棵树要同时落地四处：分类定义、传统（含采纳/完成奖励）、本地化键、图标 sprite。全部字段核对自 `<Stellaris>`（Pegasus 4.4.6，含全部 DLC）。

权威注释只有两处：`common/tradition_categories/99_README_TRADITION_CATEGORIES.txt`（8 行）与 `common/traditions/99_README_TRADITIONS.txt`（28 行）。两者都极短，且**不完整**——真正在用的 `tree_template`、`potential`、`ai_weight`、`desc` 都没写进 category 的 README。

## 文件位置与命名

- `common/tradition_categories/*.txt`：34 个 = 33 个实体 + 1 个 README。文件名与分类键**无关**（`00_commerce.txt` → `tradition_mercantile`；`00_fortification.txt` → `tradition_unyielding`）。
- `common/traditions/*.txt`：33 个 = 32 个实体 + 1 个 README。README 第 27 行是本条目最关键的一句话：传统描述键 = 传统键 + `_delayed`，飞升天赋才是 `_desc`。
- `common/ascension_perks/*.txt`：只有 2 个（`00_ascension_paths.txt` 18441 字节、`00_ascension_perks.txt` 49862 字节），共定义 49 个 `ap_*` 键。注意 `00_ascension_perks.txt:1` 写的是 `# See traditions/README.txt for format`，但该文件**不存在**（`Test-Path` 为 False），真名是 `99_README_TRADITIONS.txt`。
- 本地化：`localisation/<lang>/traditions_l_<lang>.yml`，10 种语言齐全。UTF-8 **带 BOM**（首字节 `EF BB BF`），第一行 `l_english:`，键行以一个前导空格开头。DLC 新增的树名与 AP 键在各自 DLC 的 loc（`tradition_cloning` 在 `biogenesis_l_english.yml:1397`，`tradition_modularity` 在 `machine_age_l_english.yml:3220`）。
- 图标：sprite 定义在 `interface/traditions.gfx`（363 个 spriteType）与 `interface/texticons.gfx`；纹理在 `gfx/interface/icons/traditions/`（165 个 `.dds`）。

## 语法与字段

**分类（33 个实体文件逐字段统计）**：`tree_template` 33/33、`adoption_bonus` 33/33、`finish_bonus` 33/33、`traditions` 33/33、`ai_weight` 33/33、`potential` 28/33。README 未记载但真实存在的还有 `desc`（25 个块 / 8 个文件）。`possible`、`on_enabled`、`icon`、`name`、`cost` 在分类上均为 0 处。

- `tree_template`：值是 `interface/topbar_traditions_view.gui` 里的 `containerWindowType` 名（容器定义在第 735/790/845/900/955/1014/1079/1145/1204/1270/1337 行）。4.4.6 共 11 个可用值，括号内为使用的分类数：`tree_11_12`(8)、`tree_12_11`(5)、`tree_21_11`(4)、`tree_111_11`(3)、`tree_12_12`(3)、`tree_12_11_11`(3)、`tree_11_11_21`(2)、`tree_11_111`(2)、`tree_21_12`(2)、`tree_11_12_21`(1)、`tree_21_21`(0，vanilla 未使用)。**每个模板固定提供 5 个节点槽** `<模板名>_tradition_1` … `_tradition_5`，位置与连线（`GFX_arrow_single` / `GFX_arrow_double`）都硬编码在 GUI 里；例 `tree_11_12` 五个槽位坐标为 (61,55)/(61,125)/(166,55)/(131,125)/(201,125)。`traditions` 列表**第 N 项落在 `_tradition_N`**——旁证：`00_diplomacy.txt` 列表第 1、2 项是 the_federation、entente_coordination，而 `tr_diplomacy_entente_coordination` 的 `possible = { has_tradition = tr_diplomacy_the_federation }`，且该模板 1、2 号槽正好同列上下相邻。
- `adoption_bonus` / `finish_bonus`：必须是 `common/traditions/` 里**已定义**的传统键。**不要**把它们写进 `traditions` 列表——README 第 4 行明说 "adoption and finish bonus are added automatically"，实测也成立：`tr_adaptability_adopt` 全库只出现在 `00_adaptability.txt:3` 的 `adoption_bonus` 行；`tr_cloning_genomic_growth`（定义在 `01_cloning.txt:187`，带 `possible = { always = no }`）没有出现在任何 `traditions` 列表里，却是 `02_flexible_dummy.txt:4` 的 `adoption_bonus`。
- `traditions`：33 个实体分类中，除隐藏的 `02_flexible_dummy`（8 条）外**全部正好 5 条**。
- `potential`：country 作用域触发器，决定这棵树是否出现在可选列表。常用 `is_machine_empire`、`is_gestalt`、`is_individual_machine`、`has_origin`、`has_machine_age_dlc`、`has_ascension_perk`，也可以直接用 `has_tradition = tr_nanotech_adopt`（`01_modularity.txt:13`）。缺省即恒可选（discovery、domination、expansion、prosperity、supremacy 这 5 个就没有）。整棵树藏掉用 `potential = { always = no }`（`02_flexible_dummy.txt:7`）。
- `ai_weight`：`factor` + `modifier` 结构，写法见 `ai-weights` 条目。分类里常见 `factor = @ap_pending_tradition_suppress` 配 `has_ap_pending = yes`；该变量在 `common/scripted_variables/00_scripted_variables.txt:620` 定义为 `0.01`（全库引用 21 次）。
- `desc`：可重复块，形如 `desc = { trigger = {...} text = <loc 键> }`，按触发器选中的一条作为树的描述，通常按政体分叉（`tradition_aptitude_desc` / `_hive_desc` / `_machine_desc`）。

**单条传统（32 个实体文件）**，作用域一律 country：`modifier` 243、`tradition_swap` 194、`custom_tooltip` 152、`ai_weight` 141、`possible` 124、`custom_tooltip_with_modifiers` 68、`on_enabled` 57、`unlocks_agenda` 32、`triggered_modifier` 28、`potential` 27、`inline_script` 37。**`on_disabled` 为 0 处**（README 第 8 行有，vanilla 4.4.6 无实例）；`cost`、`icon`、`prerequisites` 也都是 0 处——前置关系一律写在 `possible = { has_tradition = ... }`。`tradition_swap` 的子字段（`name`、`inherit_effects`、`inherit_icon`、`inherit_name`、`trigger`、`modifier`、`triggered_modifier`、`on_enabled`、`weight`、`custom_tooltip*`）见真实实例 `01_cloning.txt`（其中空 `modifier = { }` 合法）。

**本地化键（本条目重点）**。以 english 全部 yml 建键集合，对 `common/traditions/` 里 234 个键逐键核对：

| 键类别 | 数量 | 有 `<key>` | 有 `<key>_delayed` | 有 `<key>_desc` |
| --- | --- | --- | --- | --- |
| 常规传统 | 161 | 161 | **161** | 61 |
| adopt / finish / swap | 73 | 73 | **0** | 19 |

结论：**传统的描述键是 `_delayed`，不是 `_desc`**（README 第 27 行 + 上表 161/161 全中）。`_desc` 对传统是**可选**的，且只有被 `custom_tooltip` / `custom_tooltip_with_modifiers` 引用时才生效，作用是替换/补充 `modifier = {}` 自动生成的数值提示。实例：`tr_adaptability_recycling` 定义里有 `custom_tooltip = tr_adaptability_recycling_desc`（`00_adaptability.txt:27`），`traditions_l_english.yml:455` 的 `_desc` 是数值摘要，`:456` 的 `_delayed` 才是风味描述。采纳/完成奖励只需要名字键（73/73），实测**没有**任何一个有 `_delayed`。

- 树名键：就是**分类键本身**（`tradition_adaptability`，`traditions_l_english.yml:446`）。32/33 有，唯一没有的是隐藏的 `tradition_dummy`。
- 树描述键：`tradition_<category>_desc`，32/33 有。其中 25 处被分类的 `desc = { text = ... }` 显式引用（25/25 都能在 english loc 找到），涵盖 `_hive_desc` / `_machine_desc` / `_void_desc` / `_nomad_desc` 等变体。
- 议程：`unlocks_agenda` 共 32 处、31 个不同的 agenda 键，31/31 都能在 `common/council_agendas/*.txt` 找到定义（如 `agenda_conquer_nature` 在 `01_council_agendas_traditions.txt:3`），并且 31/31 都有 `council_agenda_<agenda 键>_name` 与 `_desc` 本地化（`paragon_1_l_english.yml:1302-1303`）。README 第 4 行说该字段"只用于生成解锁该议程的提示"——所以树作者**不需要**为议程补键，但被引用的议程必须已存在（原版议程或你自己定义的）。
- 飞升天赋：49 个 `ap_*` 键，`<key>` 49/49、`<key>_desc` 49/49，README 的 `_desc` 规则对 AP 完全成立。base 的 AP 就地写在 `traditions_l_<lang>.yml`（`ap_technological_ascendancy` 在 `:1331`，`_desc` 在 `:1386`）。AP 常用字段：`modifier` 187、`custom_tooltip` 93、`potential` 52、`ai_weight` 39、`on_enabled` 33、`possible` 26、`triggered_modifier` 11；`cost`、`prereq_traditions` 均 0 处。AP 与传统树的关系是**反向**的：树不引用 AP，而是 `finish_bonus` 那条传统用 `modifier = { ascension_perks_add = 1 }` 发飞升点——32/32 个非隐藏树的 `finish_bonus` 都含这一句。范例：

```pdx
# common/ascension_perks/00_ascension_perks.txt（真实原文，节选）
ap_technological_ascendancy = {
	modifier = {
		rare_tech_draw_chance_mult = 0.5
	}

	custom_tooltip_with_modifiers = ap_technological_ascendancy_tt

	potential = {
		NOT = {
			has_ascension_perk = ap_technological_ascendancy
		}
	}

	ai_weight = {
		factor = 40 #it's better than average
		modifier = {
			factor = 2
			has_ethic = ethic_materialist
		}
	}
}
```

**图标**：每个出现在 `traditions` 列表里的键都需要一个 `GFX_<传统键>` sprite。168 个被列表引用的键，**168/168** 在 `interface/*.gfx` 里有定义，0 缺失。`adoption_bonus` / `finish_bonus` 指向的键**不需要**图标（它们不占模板槽位）；`tradition_swap` 的 `name` 变体也不需要（179 个 swap 名没有一个出现在任何 `traditions` 列表里，靠 `inherit_icon = yes` 继承）；唯一例外是 9 个 `_stage_N_swap`，因为它们本身被列进树里当节点。树按钮图标是 `GFX_tradition_category_icon_<分类键>`，33/33 分类都有（另有通用 `GFX_tradition_category_icon_available` / `_locked`），隐藏的 `tradition_dummy` 没有。

**完整示例（一棵新树：分类 + 传统 + 本地化 + 图标）**：

```pdx
# common/tradition_categories/zz_tidalwatch.txt
tradition_tidalwatch = {
	tree_template = "tree_11_12"          # 复用 vanilla 模板，见 GUI 第 845 行

	desc = {
		trigger = { is_regular_empire = yes }
		text = tradition_tidalwatch_desc
	}

	adoption_bonus = "tr_tidalwatch_adopt"
	finish_bonus = "tr_tidalwatch_finish"

	traditions = {
		"tr_tidalwatch_survey_grid"
		"tr_tidalwatch_pressure_hulls"
		"tr_tidalwatch_deep_currents"
		# 模板 tree_11_12 有 5 个槽位（_tradition_1.._5），
		# 这里只填 3 条，会留下 2 个空槽（vanilla 33/33 树都填满 5 条）。
	}

	potential = {
		NOT = { is_gestalt = yes }
	}

	ai_weight = {
		factor = 5
		modifier = {
			factor = 3
			has_ethic = ethic_materialist
		}
		modifier = {
			factor = @ap_pending_tradition_suppress
			has_ap_pending = yes
		}
	}
}

# common/traditions/zz_tidalwatch_traditions.txt
tr_tidalwatch_adopt = {
	unlocks_agenda = agenda_conquer_nature   # 只生成"解锁该议程"的提示；要用本树真正授予的议程
	modifier = {
		country_starbase_influence_cost_mult = -0.15
	}
}

tr_tidalwatch_finish = {
	modifier = {
		ascension_perks_add = 1
		planet_jobs_energy_produces_mult = 0.10
	}
}

tr_tidalwatch_survey_grid = {
	modifier = {
		science_ship_survey_speed = 0.25
	}
	ai_weight = {
		factor = 1000
	}
}

tr_tidalwatch_pressure_hulls = {
	possible = {
		has_tradition = tr_tidalwatch_survey_grid
	}
	modifier = {
		ship_hull_mult = 0.10
	}
	ai_weight = {
		factor = 5000
	}

	tradition_swap = {
		name = tr_tidalwatch_pressure_hulls_gestalt
		inherit_effects = no
		inherit_icon = yes
		trigger = { is_gestalt = yes }
		modifier = {
			ship_hull_mult = 0.20
		}
		weight = {
			factor = 1
		}
	}
}

tr_tidalwatch_deep_currents = {
	modifier = {
		ship_emergency_ftl_mult = -0.20
	}
	ai_weight = { factor = 5000 }
}
```

```yml
# localisation/simp_chinese/zz_tidalwatch_l_simp_chinese.yml（UTF-8 带 BOM，首行 l_simp_chinese:）
l_simp_chinese:
 tradition_tidalwatch:0 "潮汐守望"
 tradition_tidalwatch_desc:0 "我们学会读懂海与星的呼吸。"
 tr_tidalwatch_adopt:0 "潮汐守望传统"
 tr_tidalwatch_finish:0 "潮汐守望传统（完成）"
 tr_tidalwatch_survey_grid:0 "测绘网格"
 tr_tidalwatch_survey_grid_delayed:0 "把每一道洋流都画进星图，远航便不再是赌博。"
 tr_tidalwatch_pressure_hulls:0 "耐压船体"
 tr_tidalwatch_pressure_hulls_delayed:0 "深海教我们的第一课：外壳必须比骄傲更厚。"
 tr_tidalwatch_pressure_hulls_gestalt:0 "同调耐压船体"
 tr_tidalwatch_pressure_hulls_gestalt_delayed:0 "集体意识让每一层装甲同时呼吸。"
 tr_tidalwatch_deep_currents:0 "深层洋流"
 tr_tidalwatch_deep_currents_delayed:0 "顺着洋流走，连空间都为你让路。"
```

```pdx
# interface/zz_tidalwatch.gfx（新增 sprite，无需改 vanilla 文件）
spriteTypes = {
	spriteType = {
		name = "GFX_tr_tidalwatch_survey_grid"
		textureFile = "gfx/interface/icons/traditions/tradition_tidalwatch_survey_grid.dds"
	}
	spriteType = {
		name = "GFX_tr_tidalwatch_pressure_hulls"
		textureFile = "gfx/interface/icons/traditions/tradition_tidalwatch_pressure_hulls.dds"
	}
	spriteType = {
		name = "GFX_tr_tidalwatch_deep_currents"
		textureFile = "gfx/interface/icons/traditions/tradition_tidalwatch_deep_currents.dds"
	}
	spriteType = {
		name = "GFX_tradition_category_icon_tradition_tidalwatch"
		textureFile = "gfx/interface/icons/traditions/tree_icons/tradition_icon_tidalwatch.dds"
	}
}
```

## 校验要点

以下每条都写成了可判定的形式，可直接做成生成器的事后自查（`L` = `localisation/<lang>/*.yml` 的键集合，`T` = `common/traditions/*.txt` 定义的键集合，`G` = `interface/*.gfx` 的 sprite 名集合）：

1. 对每个分类文件：`adoption_bonus` 与 `finish_bonus` 的值 ∈ `T`。
2. `traditions` 列表内每个元素 ∈ `T`，且**不得**等于任何分类的 `adoption_bonus` / `finish_bonus` 值（README：自动加入）。
3. `len(traditions)` == 模板槽位数；`tree_template` 的值必须能在 `interface/topbar_traditions_view.gui` 中找到 `name = "<值>"`。vanilla 恒为 5。
4. 每个列表内传统键：`<key>` ∈ `L` 且 `<key>_delayed` ∈ `L`（**不要求** `_desc`）。
5. `adoption_bonus` / `finish_bonus` 指向的键：`<key>` ∈ `L`（`_delayed` 不要求、写了也不用）。
6. 分类键 `C`：`C` ∈ `L`（树显示名）且 `C + "_desc"` ∈ `L`（树描述）。
7. 若分类用了 `desc = { text = X }`，则 `X` ∈ `L`。
8. 每个列表内传统键：`"GFX_" + key` ∈ `G`。
9. `"GFX_tradition_category_icon_" + C` ∈ `G`。
10. 若写了 `unlocks_agenda = A`，则 `A` 在 `common/council_agendas/*.txt` 中有定义，且 `"council_agenda_" + A + "_name"` ∈ `L`。
11. 若写了 `custom_tooltip` / `custom_tooltip_with_modifiers = K`，则 `K` ∈ `L`；若 `K` 以 `_desc` 结尾，对应传统必须存在。
12. `finish_bonus` 那条传统的 `modifier` 应包含 `ascension_perks_add`。
13. loc 文件：UTF-8 带 BOM、首行 `l_<lang>:`、键行有前导空格、文件名形如 `*_l_<lang>.yml`。
14. 分类里不出现 `possible` / `on_enabled` / `icon` / `cost`（4.4.6 vanilla 0 用法）。

## 常见错误

- **一棵树需要 4 个 `interface/*.gfx` 精灵，名字由类别键拼出**，缺任何一个都会在打开传统界面时报
  `Trying to change sprite to unknown sprite 'GFX_tradition_...'`：
  `GFX_tradition_hex_bg_<类别键>`、`GFX_tradition_category_bg_<类别键>`、
  `GFX_tradition_category_tile_<类别键>`（`corneredTileSpriteType`，带 `borderSize`/`effectFile`）、
  `GFX_tradition_category_icon_<类别键>`。vanilla 全部定义在 `interface/traditions.gfx`；模组可以自带
  `interface/*.gfx`（多个工坊模组这么做）。**树即使缺这些也照样显示**，只是没有图标/背景并刷日志。
  可安全复用 vanilla 贴图：`gfx/interface/traditions/tradition_hex_bg_blue.dds`、
  `gfx/interface/tiles/tradition_category_tile_locked.dds`、
  `gfx/interface/icons/traditions/tree_icons/tradition_icon_locked.dds`。

1. **用 `_desc` 当传统描述键** —— 这是最贵的一个坑（旧 Wiki 与 `traditions-perks` 条目的表述会误导）。传统名 + 描述 = `<key>` + `<key>_delayed`；`_desc` 只有被 `custom_tooltip*` 引用才显示。
2. **把 `adoption_bonus` / `finish_bonus` 的键也列进 `traditions`** —— 会在树上多出重复/错位节点；反之，忘了在 `common/traditions/` 里定义这两个键，则 `adoption_bonus` 指向空键。
3. **`tree_template` 填了 GUI 里不存在的容器名** —— 它不是自由格式的数字组合，必须与 `interface/topbar_traditions_view.gui` 的 `name` 完全一致。
4. **列表条目数与模板槽位数不匹配** —— 少了则多出的传统无处安放，多了则留下空节点。
5. **忘了 `GFX_<传统键>` sprite** —— 节点无图标；引擎不会因为缺 sprite 报错，只会静默显示空图标。
6. **忘了 `tradition_<分类键>` / `tradition_<分类键>_desc`** —— 树按钮显示原始键名、描述空白。
7. **相信 `00_ascension_perks.txt:1` 的 "See traditions/README.txt"** —— `common/traditions/README.txt` 不存在，要看 `99_README_TRADITIONS.txt`。
8. **给传统写 `cost`** —— README 提到 "cannot have cost"，但 4.4.6 里 `\bcost\b` 在 `common/traditions/` 出现 0 次（分类里仅有的 1 次在 README 注释中）。
9. **假设 `_desc` 会自动生效** —— 数值提示由 `modifier` 自动生成（默认行为），`_desc` 只有被 `custom_tooltip*` 引用时才显示。

## 待确认

- `tree_template` 名里数字（如 `tree_11_12`）的精确语义未验证；已确认的只有"它是 GUI 容器名，且该容器固定含 5 个 `_tradition_1..5` 槽位与硬编码连线"。
- `traditions` 列表第 N 项 → `_tradition_N` 的映射由旁证（`00_diplomacy.txt` 的顺序 + `possible` 链 + 槽位坐标同列）推断，未找到官方文档或引擎侧证据。
- 列表条目数 ≠ 5（如只写 3 条）时空槽位的实际渲染行为未验证；vanilla 33/33 非隐藏树都恰好 5 条。
- 26 个 `<传统键>_desc` 只存在于 loc、脚本里完全没被引用（另 35 个被 `custom_tooltip*` 引用），引擎是否存在"未写 `custom_tooltip` 时回退到 `_desc`"未确认；同理 15 个 `tradition_<分类>_desc`（所属分类无 `desc` 块）是否被自动使用也未确认。
- 若新树不是 5 个节点或需要新形状，能否在 mod 里新增 `containerWindowType` 让 `tree_template` 指过去，未验证（`.gui` 的覆盖/合并语义未核对）。现阶段建议复用 vanilla 的 11 个模板。
- `on_disabled` 在 4.4.6 无任何 vanilla 实例（仅 README 提及），语义未验证。
- `02_flexible_dummy` 所服务的"灵活传统/混搭"系统是数据驱动还是硬编码，未确认。

## 参考

- [Tradition modding (Stellaris Wiki)](https://stellaris.paradoxwikis.com/Tradition_modding)
- 本地权威注释：`common/tradition_categories/99_README_TRADITION_CATEGORIES.txt`、`common/traditions/99_README_TRADITIONS.txt`
- 实机核对文件（`<Stellaris>`，Pegasus 4.4.6）：`common/tradition_categories/00_adaptability.txt`、`00_aptitude.txt`、`00_logistics.txt`、`00_diplomacy.txt`、`01_modularity.txt`、`02_flexible_dummy.txt`；`common/traditions/00_adaptability.txt`、`00_expansion.txt`、`01_cloning.txt`；`common/ascension_perks/00_ascension_perks.txt`、`00_ascension_paths.txt`；`common/council_agendas/01_council_agendas_traditions.txt`；`common/scripted_variables/00_scripted_variables.txt:619-620`；`interface/topbar_traditions_view.gui`（模板定义，735–1337 行）、`interface/traditions.gfx`、`interface/texticons.gfx`；`localisation/english/traditions_l_english.yml`
