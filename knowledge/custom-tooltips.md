---
id: custom-tooltips
category: script
title: Custom Tooltips
title_zh: 自定义提示条（custom_tooltip）
file_types: [common/custom_tooltips/*.txt, common/game_rules/*.txt, events/*.txt, common/scripted_triggers/*.txt]
tags: [tooltip, fail_text, hidden_effect, localisation, debugtooltip]
related: [scripted-effects-triggers, on-actions, game-rules]
sources: [https://stellaris.paradoxwikis.com/Event_modding, https://stellaris.paradoxwikis.com/Game_rules]
verified_version: "本机正式版 4.1.7 (Lyra) 实际文件核对；wiki 相关说明停留在 3.x"
---

## 概要

Stellaris 里的"自定义提示条"由脚本关键字 `custom_tooltip` 提供，**不是**一个只放本地化键的目录。它有且只有两种写法：`custom_tooltip = <loc_key>`（直接替换/补充显示文本）与 `custom_tooltip = { fail_text = <loc_key> ...条件... }`（条件失败时显示该文本）。前者可用于条件位置与效果位置，后者是条件位置的"失败说明"包装。注意：`common/custom_tooltips/` 目录在本机 4.1.7 中**不存在**，`stellaris.exe` 里也没有 `custom_tooltip_key` 字符串，因此旧版教程里那套"在 common/custom_tooltips 里注册 `key = "loc_key"`"的写法不要再用。

## 文件位置与命名

- 条件型提示条写在**使用它的脚本文件里**：`common/scripted_triggers/*.txt`（可复用条件）、`common/game_rules/*.txt`（失败原因）、`common/decisions/*.txt`、`events/*.txt` 等。
- 效果型提示条写在事件选项、效果块里：`events/*.txt` 的 `option = { }`、`immediate = { }`、`after = { }`。
- 文本永远来自 `localisation/<language>/*.yml` 的键，脚本里只写键名（如 `fail_text = my_mod_needs_tech_tt`），不要写整句中文/英文。
- 目录对照：本机存在 `common/system_tooltips/`（星系提示条数据），它的用途与 `custom_tooltip` 无关，不要混用。

## 语法与字段

条件位置两种写法（`00_rules.txt` 与 `00_scripted_triggers.txt` 中的真实形态）：

```pdx
# common/scripted_triggers/zz_my_mod_triggers.txt
my_mod_can_refit_fleet = {
	custom_tooltip = {
		fail_text = my_mod_can_refit_fleet_fail_tt
		any_owned_fleet = {
			has_fleet_order = refit_ship_order
		}
	}
}

# 无块形式：把 loc 键的文本直接补充进提示
my_mod_shows_extra_note = {
	custom_tooltip = my_mod_extra_note_tt
	is_country_type = default
}
```

效果位置：生成效果提示之外，再附加一段说明；不想让引擎按效果自动生成提示，就把效果塞进 `hidden_effect`：

```pdx
country_event = {
	id = my_mod_tooltip.1
	title = my_mod_tooltip.1.name
	desc = my_mod_tooltip.1.desc
	is_triggered_only = yes

	immediate = {
		hidden_effect = {
			# 这些语句照样执行，但不生成提示
			add_resource = { minerals = 250 }
			set_country_flag = my_mod_got_grant
		}
	}

	option = {
		name = my_mod_tooltip.1.a
		custom_tooltip = my_mod_tooltip.1.a.tt      # 手动说明本次奖励
		hidden_effect = { country_event = { id = my_mod_tooltip.2 days = 30 } }
	}
}
```

只给玩家看"将会发生什么"而不真的执行：用 `tooltip = { ... }`（效果位置的特殊块，块内语句只生成提示、不产生效果）：

```pdx
option = {
	name = my_mod_tooltip.1.b
	tooltip = {
		create_fleet = { name = "Preview" owner = root }
	}
	hidden_effect = {
		create_fleet = { name = "Preview" owner = root }
	}
}
```

条件位置同理有 `hidden_trigger = { ... }`：块内条件照常参与判定，但**不生成**提示。它常与 `custom_tooltip` 配合，隐藏内部实现细节只留一句人话说明。`show_if_not_potential = yes` 出现在 `common/resolutions/*.txt` 的 `triggered_modifier` 块中（本机可查到），含义是"potential 不满足时也显示这个受触发修饰符"，它**不是** `custom_tooltip` 的字段。

## 校验要点

- `custom_tooltip` 无块形式的右侧必须是**纯 loc 键**（`[A-Za-z0-9_.]` 组成的标识），不要写带空格的句子、也不要用引号包整句（这样做会把整句当键名，界面显示原始键）。
- 块形式在 4.1.7 本体中一律只出现 `fail_text`；本机全量 grep `custom_tooltip = {` 未发现 `text =` 字段，因此不要把 `custom_tooltip = { text = ... }` 当作可用写法（另见"待确认"）。
- 每个 `fail_text` 键都必须在本地化文件里有定义，否则游戏内显示原始键名；键名推荐加 `_tt` / `_fail_tt` 后缀便于检索。
- 用 `debugtooltip` 控制台命令悬停查看提示来源，是排查"提示条不显示/显示错文本"的最快手段。
- 效果块里凡是**不想**被自动生成提示的效果，一律包 `hidden_effect`；否则玩家会看到一堆内部变量变化。
- 在 `if = { limit = { ... } }` 内包 `custom_tooltip`，可让提示只在相关分支出现，避免显示无关说明。

## 常见错误

- 建 `common/custom_tooltips/xxx.txt` 并写 `key = "loc_key"`：本机 4.1.7 不加载该目录，文件完全被忽略。
- 把 `custom_tooltip` 当效果执行体：它不改变游戏状态，只是提示。
- 在触发器里写 `hidden_effect` 或在效果里写 `hidden_trigger`（两者分属条件/效果两侧，位置写反会报未知关键字）。
- 忘记 `hidden_effect`，导致效果提示里出现 `my_mod_internal_counter +1` 这类内部变量文本。
- 把 loc 键写成带 `$VALUE$` 的格式却未向提示传值，界面显示未替换的 `$VALUE$`。

## 待确认

- `common/custom_tooltips/` 目录在 3.x 的准确语法（`custom_tooltip_key = "..."` 之类）未找到可核实的官方 wiki 页面（`Custom_tooltips` 页面 404），且 4.1.7 本体已无该目录与相关字符串，故本条目不给出该写法。
- `custom_tooltip = { text = <loc_key> ... }` 形式：本机 4.1.7 全量文件中未出现，仅在旧版 wiki/第三方教程里流传；是否仍被 exe 接受未验证。
- `custom_tooltip` 在本地化侧是否有特殊键命名约定（如 `*_tt`）没有强制规则，仅为社区惯例。

## 参考

- [Event modding（选项里的 custom_tooltip / tooltip / hidden_effect 说明）](https://stellaris.paradoxwikis.com/Event_modding)
- [Game rules（大量 custom_tooltip = { fail_text = ... } 实例）](https://stellaris.paradoxwikis.com/Game_rules)
- 本机 `Stellaris/common/game_rules/00_rules.txt`、`common/scripted_triggers/00_scripted_triggers.txt`（4.1.7 实例）
- [cwtools-stellaris-config: config/events.cwt](https://github.com/cwtools/cwtools-stellaris-config/blob/master/config/events.cwt)
