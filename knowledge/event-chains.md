---
id: event-chains
category: content
title: Event Chains
title_zh: 事件链
file_types: [common/event_chains/*.txt, events/*.txt]
tags: [counter, icon, picture, situation_log_category, abort_trigger, begin_event_chain, add_event_chain_counter, create_point_of_interest]
related: [events, effects, triggers, scopes, localisation-basics, on-actions, anomalies-archaeology]
sources: [https://stellaris.paradoxwikis.com/Event_modding]
verified_version: "Pegasus 4.4.6 实机文件核对"
---

## 概要

`common/event_chains/` 是活跃机制。本机 Pegasus v4.4.6 有 **24 个文件、299 个顶层链块**。它把一串事件在局势日志（Situation Log）里登记成一条有标题、图标、进度计数和放弃条件的任务线。

三点必须先纠正（本条目**以 4.4.6 为准**，与知识库里 4.1.7 时期的旧版 `event-chains.md` 有实质差异）：

1. **链块只有 5 个合法顶层字段**：`icon`、`picture`、`situation_log_category`、`counter`、`abort_trigger`。其中 `situation_log_category` 是 4.4.6 的常用字段（全量 265 次），旧版条目完全漏掉了它。
2. **链块里没有事件列表**。链只写元数据 + 计数器 + 放弃条件；事件在自己的效果里用 `begin_event_chain` / `add_event_chain_counter` / `end_event_chain` 主动推进。
3. **本地化键是 `<chain_key>_title` / `<chain_key>_desc`**，不是 `event_chain_<key>_title`。`00_event_chains.txt` 第 5–7 行的官方注释**是错的**（详见下）。

## 文件位置与命名

- 链定义：`common/event_chains/*.txt`。4.4.6 本体 24 个文件，命名如 `00_event_chains.txt`、`00_event_chains_2.txt`、`00_event_chains_3.txt`，DLC 各自成文件（`00_event_chains_shroud.txt`、`00_event_chains_nomads.txt` 等）。
- mod 应新建唯一命名文件（如 `zz_my_mod_event_chains.txt`）追加，不要改写本体文件。
- `events/` 下的文件负责实际触发；`common/on_actions/` 负责"什么时候第一次开链"。

## 语法与字段

顶层结构是**裸键** `<chain_key> = { ... }`，**没有** `event_chain_key = { }` 这种包裹写法（全量 0 次）。全 24 文件统计出的全部合法字段：

| 字段 | 次数 | 说明 |
| --- | --- | --- |
| `icon` | 298 | 局势日志里的小图标，取值形如 `"gfx/interface/icons/situation_log/situation_log_quest.dds"`（真实文件路径，已确认存在） |
| `picture` | 297 | 事件窗口背景，取值是 **GFX 精灵键**（如 `GFX_evt_alien_nature`），**不带引号也无 `gfx/` 路径** |
| `situation_log_category` | 265 | 归入哪个局势日志分类页（取值见下） |
| `counter` | 121 | 计数器容器 |
| `abort_trigger` | 21 | 放弃条件，在**链的目标国家**作用域求值 |

`situation_log_category` 的 10 个**实机出现过的取值**（用 `Select-String` 全量统计）：`developments`(70)、`contracts`(66)、`empire_concerns`(46)、`tutorial`(27)、`urgent_matters`(15)、`precursors`(13)、`crises`(11)、`anomalies`(8)、`ambitions`(7)、`dig_sites`(2)。这些字符串本身**就是本地化键**——`localisation/english/main_2_l_english.yml:925-938` 里定义了这一族裸小写键：`tutorial: "Tutorials"`、`ambitions: "Ambitions"`、`crises: "Ongoing Crises"`、`priority: "Priorities"`、`urgent_matters: "Urgent Matters"`、`empire_concerns: "Empire Concerns"`、`contracts: "Contracts"`、`precursors: "Precursors"`、`developments: "Developments"`、`first_contacts: "First Contacts"`、`dig_sites: "Archaeology Sites"`、`anomalies_sitlog: "Anomalies"`、`astral_rifts: "Astral Rifts"`、`other_findings: "Unknowns"`、`others: "$other_findings$"`，以及第 924 行 `ANOMALIES:0 "Findings"`。**注意该表比实机用到的 10 个取值更多**，所以合法取值集合很可能比"见过的那 10 个"大。

`counter` 的子结构是 `counter = { <counter_key> = { max = N } }`。全量 169 个计数器条目，其中只有 **98 个写了 `max`**——`max` 是**可选的**，`ai_crisis_chain`、`prethoryn_scourge_chain` 里的计数器就是空块 `{ }`。计数器名是自由字符串，必须与效果/触发器里的名字逐字符一致。

`abort_trigger` 真实用例：`ai_crisis_chain` 用 `has_global_flag = ai_invasion_defeated`（`00_event_chains.txt:217`）；`nemma_world_chain` 用 `owner = { NOT = { any_owned_planet = { has_carrier_flag turtle_world_colony } } }`（`:369`）；`find_the_curators` 用 `OR = { NOT = { exists = event_target:curator_enclave_country } ... }`（`:345`），可见 `abort_trigger` 里可以直接用 `event_target:`，且需要 `exists` 保护。

**本地化键（本节是重点结论）**：正确写法是 **`<chain_key>_title`** 与 **`<chain_key>_desc`**，即链键直接加后缀。

- `00_event_chains.txt:5-7` 的官方注释写的是 `event_chain_chainnkey_title` / `_desc`。
- 实测 `simp_chinese/event_chains_l_simp_chinese.yml:16-17` 是 `vultaum_chain_title` / `vultaum_chain_desc`，第 60-61 行是 `coming_storm_chain_title` / `coming_storm_chain_desc`——**没有** `event_chain_` 前缀。
- 英文本地化中 `^\s*\w+_chain_title\s*:` 命中 **281 次**；而严格 `^\s*event_chain_\w+\s*:` 只有 **2 次**，且这两次都是"链键本身以 `_event_chain` 结尾"：`red_giant_event_chain`（`00_event_chains_infernals.txt:2`）→ `red_giant_event_chain_title`（`infernals_events_l_english.yml:248`），`cosmic_dawn_anomalies_event_chain`（同文件 `:9`）→ `cosmic_dawn_anomalies_event_chain_title`（同文件 `:339`）。所以 **`event_chain_<key>_title` 这种前缀形式的真实命中数是 0**。
- 逐条抽查 `subterranean_civilization_chain`、`hunting_hyacinth`、`specimen_procurement_chain`、`nomads_observation_chain`：每条 `_title` 与 `_desc` 各命中 1 次，无例外。

一个最小可加载的链 + 事件 + 效果调用：

```pdx
# common/event_chains/zz_my_mod_event_chains.txt
my_mod_signal_chain = {
	icon = "gfx/interface/icons/situation_log/situation_log_quest.dds"
	picture = GFX_evt_satellite_in_orbit
	situation_log_category = developments

	counter = {
		my_mod_signals_followed = { max = 3 }
	}

	abort_trigger = {
		NOT = { exists = event_target:my_mod_signal_planet }
	}
}
```

```pdx
# events/zz_my_mod_chain_events.txt
namespace = my_mod

country_event = {
	id = my_mod.100
	title = my_mod.100.name
	desc = my_mod.100.desc
	picture = GFX_evt_satellite_in_orbit
	is_triggered_only = yes

	immediate = {
		capital_scope = { save_event_target_as = my_mod_signal_planet }
		begin_event_chain = {
			event_chain = my_mod_signal_chain
			target = root
		}
		create_point_of_interest = {
			id = my_mod_signal_poi
			name = "my_mod_signal_poi"
			desc = "my_mod_signal_poi_desc"
			event_chain = my_mod_signal_chain
			location = event_target:my_mod_signal_planet
		}
	}

	option = {
		name = my_mod.100.a
		add_event_chain_counter = {
			event_chain = my_mod_signal_chain
			counter = my_mod_signals_followed
			amount = 1
		}
		if = {
			limit = {
				has_completed_event_chain_counter = {
					event_chain = my_mod_signal_chain
					counter = my_mod_signals_followed
				}
			}
			end_event_chain = my_mod_signal_chain
		}
	}
}

# 后续推进事件：用 event_chain 让事件窗口显示"Event Chain: X"指示条
country_event = {
	id = my_mod.101
	title = my_mod.101.name
	desc = my_mod.101.desc
	picture = GFX_evt_satellite_in_orbit
	event_chain = my_mod_signal_chain
	is_triggered_only = yes
	fire_only_once = yes

	immediate = {
		add_event_chain_counter = {
			event_chain = my_mod_signal_chain
			counter = my_mod_signals_followed
			amount = 1
		}
	}
}
```

配套本地化（键名严格按上面的结论）：

```text
 my_mod_signal_chain_title:0 "The Silent Signal"
 my_mod_signal_chain_desc:0 "Our arrays keep catching a repeating pulse."
 my_mod_signal_poi:0 "Anomalous Repeater"
 my_mod_signal_poi_desc:0 "The pulse originates here."
 my_mod.100.name:0 "A Signal in the Dark"
 my_mod.100.desc:0 "..."
 my_mod.100.a:0 "Log it and move on."
```

脚本接口（**原文引用自游戏导出的 `logs/script_documentation/`**）。注意用户给的 `<Stellaris>\logs\` **不存在**——该目录是运行时产物，实际在 `%USERPROFILE%\Documents\Paradox Interactive\Stellaris\logs\script_documentation\`。原文如下：

效果（`effects.log`）：

- `begin_event_chain - Starts a situation log event chain for target country` / `begin_event_chain = { event_chain = <key> target = <target> }` / `Supported Scopes: all`（L734-736）
- `end_event_chain - Ends a specific situation log event chain for the scoped country` / `end_event_chain = <key>` / `Supported Scopes: country`（L738-740）
- `add_event_chain_counter - Increments (or decrements with negative values) an event chain counter for the scoped country by a specific amount` / `add_event_chain_counter = { event_chain = <key> counter = <key> amount = <int>/<variable> }` / `Supported Scopes: country`（L875-877）
- `reset_event_chain_counter - Resets n event chain counter for the scoped country` / `reset_event_chain_counter = { event_chain = <key> counter = <key> }` / `Supported Scopes: country`（L3131-3133）
- `create_point_of_interest - Creates a point of interest for the scoped country at a specific location, associated with an event chain` / `create_point_of_interest = { id = <key> name = <string> desc = <string> event_chain = <key> location = <target> }` / `Supported Scopes: planet country ship pop pop_group`（L916-918）；紧邻还有 `remove_point_of_interest = <key>`。

触发器（`triggers.log`）：

- `has_event_chain - Checks if the country has a specific event chain` / `has_event_chain = old_gods_chain` / `Supported Scopes: country`（L1420-1422）
- `has_completed_event_chain - Checks if the country has completed a specific event chain` / `has_completed_event_chain = <event_chain_key>` / `Supported Scopes: country`（L1424-1426）
- `has_completed_event_chain_counter - Checks if the country has completed a specific counter in an event chain` / `has_completed_event_chain_counter = { event_chain = amoebas_2_chain counter = amoebas_slaughtered }` / `Supported Scopes: country`（L1440-1442）
- `is_point_of_interest - Checks if the planet/country/ship/system/ambient object has a point of interest for a country. id and event_chain are optional; when omitted, matches any point of interest located at the scope for the owner.` / `is_point_of_interest = { owner = <target> } or { id = <id> event_chain = <event_chain> owner = <target> }` / `Supported Scopes: planet country ship galactic_object ambient_object`（L372-374）

**链与事件的配合**：链**不注册**事件。典型流程是 ①`on_action`（如 `on_survey`）触发一个门卫事件 → ②门卫事件 `begin_event_chain` 开链并用 `save_event_target_as` 存下目标 → ③后续事件由延迟/选项/`on_action` 触发，各自 `add_event_chain_counter` 推计数 → ④计满后 `end_event_chain`。`is_triggered_only = yes`（本机 `events/` 9499 次）与 `fire_only_once = yes`（212 次）是**事件自己的字段**，与链无关：前者表示不被 MTTH 随机抽中、只由 `country_event = { id = ... }` 显式触发；后者表示全局只允许触发一次。事件窗口里的"属于哪条链"指示条由**事件级字段** `event_chain = <chain_key>` 提供——它在事件块内与 `title`/`desc`/`picture` 同级（1 个 tab），本机精确缩进命中 **749 次**，例如 `events/ambition_events.txt:51` 与 `events/ancient_relics_arcsite_events_1.txt:3691`（`ship_event = { id = ancrel.4011 ... }`）；对应 UI 键是 `main_1_l_english.yml:445` 的 `EVENT_WINDOW_EVENT_CHAIN_INDICATOR: "Event Chain: $CHAIN$"`。注意同一字符串也出现在效果**参数位**（`begin_event_chain = { event_chain = ... }`），两者靠缩进区分：参数在 3 个 tab，事件级字段在 1 个 tab。

## 校验要点

- 链块只允许 `icon` / `picture` / `situation_log_category` / `counter` / `abort_trigger` 五个键。多写别的键既不生效也不报错（静默失效）。
- **本地化键用 `<chain_key>_title` / `<chain_key>_desc`**，别信 `00_event_chains.txt` 顶部的注释。`coming_storm_chain` → `coming_storm_chain_title`，`vultaum_chain` → `vultaum_chain_title`。
- `icon` 是**带引号的文件路径**（`"gfx/interface/icons/situation_log/*.dds"`），`picture` 是**不带引号的 GFX 精灵键**（`GFX_evt_*`）。两者格式不同，写反会静默不显示。
- 计数器名三处必须完全一致：链定义里的 `counter = { <name> = ... }`、`add_event_chain_counter` 的 `counter = <name>`、`has_completed_event_chain_counter` 的 `counter = <name>`。本机 `has_completed_event_chain_counter` 共出现 129 次。
- `begin_event_chain` 支持 `all` 作用域，`target = <target>` 指定链挂到哪个国家；`end_event_chain` / `add_event_chain_counter` / `reset_event_chain_counter` 只支持 **country** 作用域，写在天体/舰船作用域会报作用域错误。
- `abort_trigger` 在链目标国家作用域求值；引用 `event_target:` 时用 `exists` / `NOT = { exists = ... }` 保护。本机链级 `abort_trigger` 共 21 次，其中 `find_the_curators`、`nemma_world_chain`、`stratovent_world_chain` 都带 `exists` 或 `owner = { ... }` 包裹。
- `event_chain = <key>` 作为**事件级字段**写在事件块顶层（1 tab），才能让事件窗口显示链指示条。
- 链没有任何"事件权重/抽选"字段；需要按条件改变后续事件概率时，把逻辑写进事件自己的 `weight_multiplier` 或 `on_action`。

## 常见错误

- 按 `00_event_chains.txt:5-7` 的注释把键命名成 `event_chain_<key>_title`：局势日志与事件窗口会直接显示原始键名。正确形式是 `<key>_title` / `_desc`。
- 漏写 `situation_log_category`：链会落到默认分类页，玩家在预期的页签里找不到它。
- 把链当"事件容器"，在链块里塞 `events = { ... }` / `trigger` / `potential`：全部无效且无报错。
- `begin_event_chain` 的 `target` 写成事件 ID 或字符串：链挂到错误国家或直接不生效。
- 只写 `add_event_chain_counter` 而忘了 `begin_event_chain`：计数在加，但链从未登记，进度无处显示。
- 在非 country 作用域调用 `add_event_chain_counter` / `end_event_chain`（例如在 `ship_event` 里不切到 `owner`）：作用域错误。
- `create_point_of_interest` 的 `name` / `desc` 写字面英文而非 loc 键：直接把字面文本当键名查，显示键名。真实写法见 `ancient_relics_arcsite_events_1.txt:3828`。
- 在事件里写了 `event_chain = <key>` 却漏掉前面的 `begin_event_chain`：指示条指向一条并不存在的链。

## 待确认

- **`situation_log_category` 的合法取值集合没有闭集证据。** 实机出现过 10 个，但 `main_2_l_english.yml:924-939` 里另有 `priority`、`first_contacts`、`astral_rifts`、`other_findings`、`others` 等分类键，无法确定它们是否都能用于 `event_chains`（可能有的是特供 situation 系统的）。
- 实机用了 `situation_log_category = anomalies`（8 次），但 `main_2_l_english.yml` 里对应 `anomalies` 的只有大写 `ANOMALIES:0 "Findings"`（第 924 行）与 `anomalies_sitlog`（第 936 行）。**`anomalies` 到底解析到哪个显示名未做实机验证。**
- `counter` 的 `max` 达到后链是否自动结束、`has_completed_event_chain_counter` 是在达到 `max` 时返回真还是需要额外的 `end_event_chain`，**未做游戏内实测**。正文示例里显式写了 `end_event_chain`，属于保守写法。
- `counter` 不写 `max` 时（本机 169 个里有 71 个没写）`has_completed_event_chain_counter` 的行为未知。
- `create_point_of_interest` 的 `location = <target>` 是否接受星系（`galactic_object`）目标未实测；真实用例（`ancient_relics_arcsite_events_1.txt:3828`、`:4128`）传的都是星球/舰船 event_target。同一条链内复用同一个 POI `id` 是否会冲突也未实测。
- `logs/script_documentation/*.log` 属于运行时产物且位于用户文档目录，**不能保证与 `<Stellaris>`（4.4.6）严格同版本**。正文引用的签名已与本机 4.4.6 脚本用法互相印证（`begin_event_chain` 257 次、`end_event_chain` 438 次、`add_event_chain_counter` 238 次，均在 `events/*.txt`），但若要绝对确证，应在 4.4.6 上导出一次文档再比对。
- `icon` / `picture` 之外是否还有 4.4.6 新增的链级字段（本机 24 个文件里全量统计为 0，故未发现），未与更早版本逐字段比对。

## 参考

- [Event modding（`begin_event_chain` / `create_point_of_interest` 范例）](https://stellaris.paradoxwikis.com/Event_modding)
- 本机 `Stellaris/common/event_chains/00_event_chains.txt`（410 行；链定义 + 第 5-7 行**错误的** loc 注释；`situation_log_category` 首次出现在第 24 行）
- 本机 `Stellaris/common/event_chains/00_event_chains_3.txt:1-48`（`situation_log_category = anomalies` / `urgent_matters` 用法）
- 本机 `Stellaris/common/event_chains/`（全 24 文件全量统计：`icon` 298 / `picture` 297 / `situation_log_category` 265 / `counter` 121 / `abort_trigger` 21；计数器条目 169、其中带 `max` 98）
- 本机 `Stellaris/localisation/english/main_2_l_english.yml:924-939`（`situation_log_category` 的显示名 loc 键）
- 本机 `Stellaris/localisation/simp_chinese/event_chains_l_simp_chinese.yml:16-17,60-61`（`vultaum_chain_title` / `coming_storm_chain_title`，无 `event_chain_` 前缀）
- 本机 `Stellaris/localisation/english/infernals_events_l_english.yml:248-249,339-340`（`red_giant_event_chain_title`：链键本身以 `_event_chain` 结尾的反例）
- 本机 `Stellaris/localisation/english/main_1_l_english.yml:445`（`EVENT_WINDOW_EVENT_CHAIN_INDICATOR: "Event Chain: $CHAIN$"`）
- 本机 `Stellaris/events/ambition_events.txt:48-70` 与 `Stellaris/events/ancient_relics_arcsite_events_1.txt:3684-3698,3828-3833`（事件级 `event_chain` 字段与 POI 真实用法）
- 本机 `%USERPROFILE%/Documents/Paradox Interactive/Stellaris/logs/script_documentation/effects.log:734-740,875-877,916-918,3131-3133` 与 `triggers.log:372-374,1420-1426,1440-1442`（游戏导出的效果/触发器签名原文）
