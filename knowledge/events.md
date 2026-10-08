---
id: events
category: content
title: Events
title_zh: 事件
file_types: [events/*.txt]
tags: [namespace, is_triggered_only, option, immediate, after, mean_time_to_happen, event_target, hide_window]
related: [scopes, triggers, effects, on-actions, custom-tooltips, localisation-basics, event-chains, decisions, anomalies-archaeology]
sources: [https://stellaris.paradoxwikis.com/Event_modding, https://stellaris.paradoxwikis.com/Scopes]
verified_version: "本机正式版 4.1.7 (Lyra) 文件实测；wiki Event_modding 页标注 3.6"
---

## 概要

事件写在 `events/*.txt`。文件顶部必须有 `namespace = xxx`，文件内每个事件是 `事件类型 = { id = xxx.N ... }`。**id 只能是数字**：本体实测带字母的 ID 会被引擎当成 `namespace.0`，前导零被截断（`xxx.003` 等同 `xxx.3`）。ID 无官方上限，本机 loc key 中出现的最大编号为 `crisis.99999`、`ancrel.40182`、`distar.13035`、`anomaly.8000`，所以五位数编号是安全的。命名冲突风险来自 namespace 而非 ID：两个 mod 用同一 namespace 就会撞 ID，必须用独有前缀。

事件类型（`^事件类型 = {` 在本机 `events/*.txt` 163 个文件中的实际出现次数）：

| 类型 | 次数 | root 作用域 |
| --- | --- | --- |
| `country_event` | 8592 | country |
| `planet_event` | 1545 | planet |
| `fleet_event` | 1139 | fleet |
| `ship_event` | 1092 | ship |
| `situation_event` | 734 | situation |
| `observer_event` | 167 | 无（仅开发用，控制台 `observe`） |
| `first_contact_event` | 177 | first_contact |
| `espionage_operation_event` | 126 | espionage_operation |
| `leader_event` | 89 | leader |
| `system_event` | 75 | galactic_object |
| `pop_group_event` | 16 | pop_group |
| `starbase_event` | 12 | starbase |
| `agreement_event` | 6 | agreement |
| `pop_faction_event` | 2 | pop_faction |
| `event` | 137 | 全局（无固定 scope，见 `events/game_start.txt`） |

`pop_event` 在 4.1.7 中**出现 0 次**——4.0 起改名为 `pop_group_event`。`major` / `major_trigger` / `is_dangerous` 在本机 `events/` 中同样**出现 0 次**，wiki 也标注 `major` 已于 3.8 移除，不要使用。

## 文件位置与命名

- 目录：`events/*.txt`，本体有 163 个文件；`events/` 下没有字段说明文档，字段以本机真实用法与 wiki 为准。
- **加载规则特殊**：`events/` 是 First-In-Only-Served（先加载者胜），而其他目录是 Last-In。要覆盖本体某个事件 ID，必须让新文件的文件名字节序排在本体文件之后（mod 惯例是在文件名前加 `!!`），不能只覆盖单个事件块。[wiki Event_modding §Best Practices]
- 一个文件可以包含多个 `namespace`；同一个 namespace 可以跨多个文件。
- namespace 可含数字（本体有 `paragon_2`）。社区实测最长 100 字符，但这不是官方文档承诺值。

## 语法与字段

下面是一个完整可加载的可见国家事件：namespace + 触发条件 + `immediate` 里保存 `event_target` + 两个带 `trigger` / `allow` / `ai_chance` 的选项 + `after`。`my_mod` / `my_mod_probe_sent` 等为占位名，替换成自己的唯一前缀即可直接进游戏。

```pdx
# events/my_mod_events.txt
namespace = my_mod

country_event = {
	id = my_mod.1
	title = my_mod.1.name
	desc = my_mod.1.desc
	picture = GFX_evt_ship_in_orbit
	show_sound = event_ship_bridge
	location = root.capital_scope

	is_triggered_only = yes
	fire_only_once = yes

	trigger = {
		is_regular_empire = yes
		NOT = { has_country_flag = my_mod_probe_sent }
	}

	immediate = {
		set_country_flag = my_mod_probe_sent
		capital_scope = {
			save_event_target_as = my_mod_capital   # 本 namespace 内后续事件可用
		}
	}

	option = {
		name = my_mod.1.a
		custom_tooltip = my_mod.1.a.tooltip
		hidden_effect = {                            # 效果不生成 tooltip
			event_target:my_mod_capital = {
				add_deposit = d_engineering_2
			}
		}
		country_event = { id = my_mod.2 days = 30 random = 30 }   # 延迟 30~60 天
	}

	option = {
		name = my_mod.1.b
		trigger = { has_country_flag = my_mod_sensor_unlocked } # 不满足则整个选项不显示
		allow = { has_resource = { type = influence amount >= 50 } } # 不满足则灰显但可见
		ai_chance = {
			factor = 100
			modifier = {
				factor = 0
				NOT = { has_country_flag = my_mod_sensor_unlocked }
			}
		}
		add_resource = { influence = -50 }
	}

	after = {                                        # 与 option 平级，选中任一选项后都执行
		hidden_effect = { set_country_flag = my_mod_probe_resolved }
	}
}
```

多态描述与 MTTH（两者都是真实字段；`success_text` / `fail_text` 在本机 events 中出现 131 / 142 次）：

```pdx
country_event = {
	id = my_mod.10
	title = my_mod.10.name
	desc = {
		trigger = { has_authority = auth_machine_intelligence }
		text = my_mod.10.desc.mach
	}
	desc = my_mod.10.desc          # 静态兜底；若多个 desc 都命中则随机取一个
	desc = {
		trigger = { always = yes }
		text = my_mod.10.desc.top
		success_text = { text = my_mod.10.desc.ok }      # trigger 通过时追加
		fail_text = { text = my_mod.10.desc.bad }        # trigger 不通过时追加
		exclusive_trigger = { has_country_flag = my_mod_x }  # 命中则其余 desc 全部作废
	}
	picture = { picture = GFX_evt_ship_in_orbit trigger = { always = yes } }

	mean_time_to_happen = {         # 本机 events/ 中共 137 处
		months = 60
		modifier = {
			factor = 0.1
			has_technology = tech_galactic_administration
		}
	}
	trigger = { is_regular_empire = yes }
	immediate = { set_country_flag = my_mod_mtth_fired }
	option = { name = my_mod.10.a }
}
```

其余已核实字段：

- 事件级：`title`、`desc`、`picture`、`show_sound`、`location`、`hide_window`（本体 2529 处，隐藏事件不需要 title/desc/option）、`is_triggered_only`（8857 处）、`fire_only_once`（196 处）、`trigger`、`pre_triggers`（211 处）、`immediate`、`after`（1968 处）、`abort_trigger`（23 处）、`abort_effect`、`weight_multiplier`（75 处，只在被 `on_action` 的 `random_events` 抽选时有意义）、`event_chain`（1290 处，把该事件挂到某条事件链）、`specimen`（182 处，4.x 新增）、`event_window_type`（4 个取值：`leader_conversation` / `leader_recruit` / `leader_story` / `crisis_leader_conversation`）、`diplomatic`、`custom_gui`、`custom_gui_option`、`picture_event_data`、`auto_select`、`auto_opens`、`force_open`、`trackable`。
- `base = <已有事件ID>` 事件继承（3.4+，423 处），配合 `desc_clear`（325）/ `option_clear`（261）/ `picture_clear`（3）/ `show_sound_clear`（3）覆盖继承来的内容；base 事件必须先定义。
- `option` 子键：`name`（可写 loc key、内置键如 `EXCELLENT` / `OK` / `EXIT`，也可写 `name = { trigger = {} text = {} }` 多态块）、`trigger`、`exclusive_trigger`、`allow`、`ai_chance = { factor = X modifier = { ... } }`、`custom_tooltip`、`tooltip`、`hidden_effect`、`icon`、`sound`、`default_hide_option`（267 处，仅表示"按 Esc 默认选它"，**不是**隐藏）、`hide_option_if_not_allowed`、`tag`、`response_text` / `is_dialog_only`（外交事件用，569 / 761 处）。

## 校验要点

- **localisation 键约定（本机实测）**：`title` 用 `<namespace>.<id>.name`，`desc` 用 `<namespace>.<id>.desc`，选项依次 `<namespace>.<id>.a` / `.b` / `.c`。这三个是**约定而非引擎强制**：引擎只会去查你写的那串字符串。可见事件若 loc key 不存在，游戏界面会直接显示 key 原文，所以"title/desc/option 三件套必须在 `localisation/*_l_english.yml` 里存在"是硬要求。依据：`localisation/english/anomaly_l_english.yml` 中 `anomaly.1.name`、`anomaly.1.desc` 与 `events/anomaly_events_1.txt` 的 `id = anomaly.1` 一一对应。
- loc 文件必须是 **UTF-8 with BOM**，文件名以 `_l_english.yml` 结尾，首行必须是 `l_english:`，每条键前必须有空白缩进；缺 BOM 会静默不加载。
- `hide_window = yes` 的事件不需要 title/desc/option；其余事件**至少一个 option**，否则出现空白事件框。
- 交叉引用检查：所有 `event_target:<name>` 必须在同一条调用链上游被 `save_event_target_as` 保存过；跨事件/跨 namespace 用 `save_global_event_target_as`（本机 590 处）并在用完后 `clear_global_event_target`。
- 性能：`is_triggered_only = yes` 会免除每日全对象轮询；`mean_time_to_happen` 只是拉长轮询间隔，带 `modifier` 时引擎会**每天对每个对象**检查一次条件，代价极高。给 planet / system / starbase / leader / pop 事件加 `pre_triggers` 做廉价前置筛选（见 `events/000_added_pre_triggers_to_planet_events.txt`）。

## 常见错误

- **`<namespace>_event` 不是事件类型。** 事件类型只有上表那些关键字。把命名空间当类型用（`mymod_event = { ... }`）时，引擎会**对块里每一个 token 各报一条 `Corrupt Event Table Entry`**，而且这个事件根本不会注册。实机实测：一个写错类型的事件刷出 20 条这种报错，改成 `country_event = {` 后立刻归零。这类报错极易被误读成"括号配平错误"。
- **事件选项的效果必须内联，没有 `effect = { }` 这一层。** 统计本体 12958 个 `option = { }` 的直接子键，只有 `name` / `hidden_effect` / `trigger` / `custom_tooltip` / `owner` / `ai_chance` / `allow` 加上效果本身，**没有 `effect`**。写成：

  ```pdx
  option = {
  	name = my_mod.1.a
  	effect = { add_resource = { influence = 10 } }   # 错
  }
  ```

  引擎会把 `effect` 当成脚本化效果名去找，报 `Script Error: Invalid scripted effect: effect`，并让整个 option 块被判定为损坏。正确写法是把效果直接写在 option 里：

  ```pdx
  option = {
  	name = my_mod.1.a
  	add_resource = { influence = 10 }               # 对
  	hidden_effect = { set_country_flag = my_flag }  # 玩家看不到的效果
  }
  ```

- 忘写 `is_triggered_only` 也没写 `mean_time_to_happen`：事件会在**每个**满足条件的对象上每天触发一次，银河系瞬间失控。
- 用 `major = yes` / `is_dangerous = yes`：4.1.7 中不存在这两个键（本体 0 处），写了既不报错也不生效。
- 在 id 里写字母，例如 `id = my_mod.alpha`——会被当成 `my_mod.0`，与真正的 `.0` 冲突。
- 花括号不配对：整个文件会被解析成损坏状态，之后的参数（title/desc/is_triggered_only）被"掏空"，游戏每天弹出无标题无文本的空事件框。用 `debugtooltip` 悬停 OK 按钮可看到肇事事件 ID。
- 覆盖本体事件时只写了同 ID 的新事件块：`events/` 是先到先得，必须让文件名排序靠后（`!!` 前缀）。
- 事件 ID 与 namespace 不一致（`namespace = a` 但 `country_event = { id = b.1 }`），引擎按 ID 前缀而非 namespace 行归档，容易和其他 mod 撞车。

## 待确认

- brief 里列的 `major` / `is_dangerous` 在 4.1.7 本体完全不存在（`events/` 全量搜索 0 处），正文已按"不存在"处理。
- brief 说 `pop_event` 是有效类型；4.1.7 实测为 0 处，实际是 `pop_group_event`（16 处）。wiki 亦记 4.0 起改名。若目标平台是 3.x，需回退用 `pop_event`。
- `abort_effect` 只出现在 wiki 的完整示例里，本机 `events/` 中 0 处使用，其真实生效条件（是否必须与 `abort_trigger` 配对、暂停时是否求值）未做实测。
- namespace 最长 100 字符来自社区 Discord 的验证帖，非官方文档值。
- 事件 ID 的引擎侧上限未见诸任何文档；本机观察到 `crisis.99999`，更大值未测。
- `scopes = { from = ... }` 覆盖调用作用域时，wiki 指出 event_target 不会被正确重新作用域化，本机未复测该行为在 4.1.7 是否仍存在。

## 参考

- [Event modding（事件类型、字段全表、空事件框 bug）](https://stellaris.paradoxwikis.com/Event_modding)
- [Scopes / Event target（`save_event_target_as`、`event_target:` 用法）](https://stellaris.paradoxwikis.com/Scopes)
- 本机 `Stellaris/events/anomaly_events_1.txt`（`ship_event` + `.name`/`.desc`/`.a` 键名范例，4.1.7）
- 本机 `Stellaris/events/000_added_pre_triggers_to_planet_events.txt`（pre_triggers 官方说明，4.1.7）
- 本机 `Stellaris/common/on_actions/99_README_ON_ACTIONS.txt`（`weight_multiplier` 与 random_events 语义）
- 本机 `Stellaris/localisation/english/anomaly_l_english.yml`（loc 键与事件 id 的对应证据）
- [cwtools-stellaris-config: config/events.cwt](https://github.com/cwtools/cwtools-stellaris-config/blob/master/config/events.cwt)、[config/common/event_chains.cwt](https://github.com/cwtools/cwtools-stellaris-config/blob/master/config/common/event_chains.cwt)（CWTools 的事件与事件链字段定义，用于游戏外静态校验）
