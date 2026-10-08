---
id: governments-authorities
category: content
title: Government Types and Authorities
title_zh: 政府类型与政体
file_types: [common/governments/*.txt, common/governments/authorities/*.txt]
tags: [possible, weight, ruler_title, election_type, has_heir, country_modifier, advanced_authority_swap]
related: [civics-origins, technologies]
sources: [https://stellaris.paradoxwikis.com/Government_modding, https://stellaris.paradoxwikis.com/Modding]
verified_version: "4.1.7 / 3.14"
---
## 概要

政府类型（government）只是给帝国挑一个**名字与统治者头衔**的外观层：它由政体（authority）、伦理、civic 推导出来，本身几乎没有游戏效果。真正承载效果的是 `authority`——它决定选举、继承人、议会席位与 `country_modifier`。权威文档是 `common/governments/99_README_GOVERNMENT.txt`。

## 文件位置与命名

- `common/governments/*.txt`：`gov_key` 政府类型。vanilla 按来源分文件（`01_authority_governments.txt`、`02_ethic_governments.txt`、`03_civic_governments.txt`、`04_machine_age_governments.txt`、`05_biogenesis_governments.txt`、`06_shroud_governments.txt` 等）。覆盖类型 **LIOS** + error.log `Object key already exists`。
- `common/governments/authorities/*.txt`：`auth_key` 政体。Wiki 的 Common folder 表把该目录标为 **FIOS** 并注"Specific override is impossible. Entries override ONLY."；但 4.1.7 的 `00_authorities.txt` 文件头明言政体是**可扩展的**："These may be overwritten in an 'extendable' manner, meaning (for example) you can create a second `auth_democratic` with extra swaps in it."，同时警告运行时改动会导致扩展失效、必须重启。因此 4.x 的行为与 Wiki（3.x 时代）不一致，属于版本差异。
- 需要再强调一次前缀规则的真相：**`00_` 前缀本身不等于覆盖 vanilla**。游戏按文件名的 ASCII 序加载，`00_` 只是排最前；能否覆盖取决于该目录是 FIOS 还是 LIOS。同目录同名文件才是整文件替换。

## 语法与字段

政府类型（4.1.7 已核对）：`possible`（AND trigger，country scope，**只允许** `has_ethic` / `has_authority` / `has_valid_civic`，其它 trigger 属未定义行为）、`weight`（scriptable value，`base = @gov_*`）、`ruler_title`、`ruler_title_female`、`heir_title`、`heir_title_female`、`use_regnal_names`、`dynastic_last_names`、`should_force_rename`（默认 no）。

选中顺序（高优先者胜出）：1 AI 政府 → 2 政体替换政府 → 3 civic 政府 → 4 伦理政府 → 5 政体政府 → 6 兜底政府。权值常量在 `common/scripted_variables/08_scripted_variables_governments.txt`：`@gov_authority_weight`、`@gov_civic_weight`、`@gov_civic_prio_weight`、`@gov_civic_override_weight`、`@gov_fallback_weight`、`@gov_ethic_weight`。多 civic 同时命中时按优先级用更高的权值常量。

政体（4.1.7 已核对）：`potential`、`possible`（需求清单语法，支持 `country_type`、`ethics`、`ship_categories`、`graphical_culture`；vanilla 亦用 `origin`）、`random_weight`、`traits`、`has_heir`、`election_type`（`oligarchic` / `democratic` / `none`）、`election_term_years`、`election_term_variance`、`re_election_allowed`、`can_have_emergency_elections`、`max_election_candidates`（-1 为无限）、`can_reform`、`ruler_council_position`、`color = { r g b a }`、`tags`、`country_modifier`、`advanced_authority_swap`（内含 `name`、`description`、`inherit_icon`、`inherit_effects`、`ruler_council_position`、`trigger`、`modifier`、`tags`、`has_heir`、`election_type`、`weight` 等）。注意：`has_agendas` 与 `uses_mandates` 在文件头被明确标为**已被 Council Agendas 取代**。

```pdx
# common/governments/authorities/zz_tidal_authorities.txt
auth_tidal_synod = {
	random_weight = { base = 2 }

	has_heir = no
	election_type = oligarchic
	election_term_years = 30
	election_term_variance = 5
	max_election_candidates = 4

	color = { 60 140 170 255 }
	ruler_council_position = councilor_ruler_democratic

	possible = {
		ethics = {
			NOR = {
				value = ethic_gestalt_consciousness
				text = auth_tidal_synod_no_gestalt
			}
		}
	}

	country_modifier = {
		faction_approval = 0.10
		country_leader_pool_size = 1
		country_starbase_influence_cost_mult = -0.10
	}

	advanced_authority_swap = {
		name = "auth_tidal_synod_ascendant"
		description = "auth_tidal_synod_ascendant_desc"
		inherit_icon = yes
		inherit_effects = no
		trigger = {
			is_scope_valid = yes
			has_country_flag = tidal_synod_ascended
		}
		modifier = {
			planet_jobs_energy_produces_mult = 0.15
		}
		weight = { base = 1 }
	}
}

# common/governments/zz_tidal_governments.txt
gov_tidal_synod = {
	ruler_title = RT_SPEAKER
	ruler_title_female = RT_SPEAKER_FEMALE

	possible = {
		has_authority = auth_tidal_synod
	}

	weight = {
		base = @gov_authority_weight
	}
}

# 某个 civic 只允许在自家政体下使用（civic 侧写法，见 civics-origins）
#	potential = { authority = { value = auth_tidal_synod } }
```

## 校验要点

- 新政府类型必须给 `possible`，否则永远不会被选中；只有 `ruler_title` 而没有匹配条件时会与其它政府争抢同一政体。
- `ruler_title` 等四个键是 **localisation 键**，必须自己在 `localisation/*_l_english.yml` 定义；缺失会在 UI 显示原始键名。
- 用 `has_authority = auth_x` 判断政体，`has_government = gov_x` 判断政府类型（`common/technology/tier/00_tier.txt` 的示例注释里就是这么写的）。
- 政体 `country_modifier` 内的修正作用于国家；想改帝国规模、领袖池、派系支持率都放这里。
- 新建政体后，若希望 AI 也能抽到，务必给 `random_weight` 并确认 `possible` 在 AI 国家上可通过。

## 常见错误

1. 在 `possible` 里写 `has_technology` 等 trigger —— 该块只接受需求清单语法与指定的少数 trigger（政府类型 `possible` 只接受 `has_ethic` / `has_authority` / `has_valid_civic`）。
2. 试图用新文件"改一点点"vanilla 政体的字段。3.x 下 authorities 是 FIOS，局部覆盖不可行；4.x 虽然支持"扩展同一 `auth_key` 追加 `advanced_authority_swap`"，但改动其余字段仍不可靠，且需重启游戏。
3. 只定义了政体却忘了配套的 `gov_key`，帝国会落到兜底政府，名字与头衔都不对。
4. 复用 vanilla 文件名（如自己写一个 `00_authorities.txt`）——那是整文件替换，会覆盖掉全部 vanilla 政体。

## 待确认

- 计数证据（4.1.7，仅 `common/governments/`）：`election_candidates` **0 处**（只存在 `max_election_candidates` 2 处）、`leader_class` **0 处**、`emergency_election_cost` **0 处**——这三者属 3.0 时代写法，**4.1.7 已无此写法，不要使用**。反之 `valid_for_released_vassal`（3 处）、`has_factions`（2 处）、`localization_postfix`（5 处）虽未写进文件头文档，但 vanilla 仍在使用。
- `random_weight` 的子键：文件头注释写 `{ value = 1 }`，而 vanilla 实际写 `{ base = 2 }`（`00_authorities.txt:81`），两者是否等价未确认；建议照 vanilla 用 `base`。
- 政府类型 `weight` 若多个政府同时满足且权值相同，实际取舍（README 只说取最大权值，`01_authority_governments.txt` 注释说取文件中**最先列出**的那个）。

## 参考

- [Government modding (Stellaris Wiki)](https://stellaris.paradoxwikis.com/Government_modding)
- [Modding — Common folder 覆盖类型表 (Stellaris Wiki)](https://stellaris.paradoxwikis.com/Modding)
- 本地核对：`common/governments/99_README_GOVERNMENT.txt`、`01_authority_governments.txt`、`authorities/00_authorities.txt`（Stellaris Lyra v4.1.7）
