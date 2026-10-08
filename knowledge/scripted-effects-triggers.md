---
id: scripted-effects-triggers
category: script
title: Scripted Effects and Triggers
title_zh: 脚本化效果与脚本化触发器
file_types: [common/scripted_effects/*.txt, common/scripted_triggers/*.txt]
tags: [reuse, parameters, scope, metascript]
related: [on-actions, custom-tooltips, ai-weights]
sources: [https://stellaris.paradoxwikis.com/Dynamic_modding, https://stellaris.paradoxwikis.com/Effects, https://stellaris.paradoxwikis.com/Conditions]
verified_version: "本机正式版 4.1.7 (Lyra) 实际文件核对；本页正文与 3.x 语法兼容"
---

## 概要

`scripted_effects` 与 `scripted_triggers` 是把一段**效果**或一段**条件**起个名字复用的机制，本体就是普通的效果块/条件块，没有额外字段。定义在 `common/scripted_effects/*.txt` 与 `common/scripted_triggers/*.txt`，两边的语法完全一致（参数、内联数学、`[[PARAM]` 条件块在两边通用），唯一区别是**效果文件只能写效果，触发器文件只能写条件**。调用点可以传参数，参数全部按**字符串**做文本替换。本机正式版为 4.1.7（`launcher-settings.json` 中 `Lyra v4.1.7 (6486)`），下文语法均已在该版本 `common/scripted_effects/99_advanced_documentation.txt` 与 `common/scripted_triggers/00_scripted_triggers.txt` 中核对。

## 文件位置与命名

- 效果：`common/scripted_effects/<任意名>.txt`（本体有 40 个文件，如 `00_scripted_effects.txt`、`99_advanced_documentation.txt`）。
- 触发器：`common/scripted_triggers/<任意名>.txt`。
- 同一个键在多个文件中重复定义时，按文件名字典序最后加载者生效（LIOS 覆盖语义）；多文件拆分的同名前缀（`00_`、`01_`…）是本体的惯例，用于强制加载顺序。
- 官方速查文档就在本体：`99_advanced_documentation.txt`（参数、`[[PARAM]`、内联数学、`optimize_memory`），修改前先读它比查 wiki 更准。

## 语法与字段

定义 + 无参调用 + 带参调用：

```pdx
# common/scripted_effects/my_mod_rewards.txt
my_mod_grant_tech_bonus = {
	add_research = {
		area = $AREA$
		technology = $TECH$
		progress = $PROGRESS|10$
	}
}

# 调用（效果位置）
my_mod_grant_tech_bonus = yes
my_mod_grant_tech_bonus = {
	AREA = physics
	TECH = tech_lasers_1
}
```

参数可选块与默认值：`[[PARAM]` 在参数存在且不为 `no` 时执行，`[[!PARAM]` 在参数缺失或为 `no` 时执行；参数内用 `|` 给默认值。参数可以做前缀拼接：

```pdx
# common/scripted_effects/my_mod_flags.txt
my_mod_mark_empire = {
	# 未传 FLAG 时使用默认名
	set_country_flag = my_mod_$FLAG|marked$
	[[TIER]
		set_country_flag = my_mod_tier_$TIER$
	]
	[[!TIER]
		set_country_flag = my_mod_tier_base
	]
}

# 调用
my_mod_mark_empire = yes                     # 设 my_mod_marked 与 my_mod_tier_base
my_mod_mark_empire = { FLAG = vassal TIER = 2 }
```

触发器定义与调用（触发器不能写效果）：

```pdx
# common/scripted_triggers/my_mod_triggers.txt
my_mod_is_ready_for_war = {
	is_country_type = default
	NOT = { has_country_flag = my_mod_at_peace_lock }
	check_variable = { which = my_mod_fleet_power value >= 500 }
}

# 调用（条件位置）
trigger = {
	my_mod_is_ready_for_war = yes
}
trigger = {
	NOT = { my_mod_is_ready_for_war = yes }
}
```

内联数学与脚本变量：脚本化效果/触发器里必须写成 `@\[ ... ]`（多一个反斜杠），且**同一段定义里只有第一个 `@\[ ... ]` 会被正确求值**；需要多次运算就把中间结果作为参数传给另一个脚本化效果：

```pdx
my_mod_scaled_reward = {
	add_resource = {
		unity = @\[ $COUNT|1$ * 10 ]
	}
}
```

`THIS` / `FROM` / `ROOT` 与调用点：脚本化块本身不改变作用域，块内第一层语句就在**调用点当时的 THIS** 上执行；`ROOT` 仍指向事件/触发链的根作用域，`FROM` 仍是调用链上一层。所以脚本化效果要复用时，应在调用点先把作用域摆好（`owner = { my_mod_effect = yes }`），而不是在定义里假设自己挂在哪个作用域。需要传作用域时用事件目标参数（`TARGET = event_target:foo`）后在块内写 `event_target:$TARGET$`。

"返回值"约定：脚本化效果没有函数式返回值，惯用做法是写变量（`set_variable` / `set_variable_to_scope` / `change_variable`），调用方再用 `check_variable`、`value:xxx` 或本地化 `[This.xxx]` 读回；脚本化触发器则直接把条件写在块里，调用方只拿到 yes/no。

## 校验要点

- 效果文件里出现纯条件（如 `has_technology`、`is_country_type`）不会被当条件执行，只会静默失效或报错；反之触发器文件里出现 `add_resource` 之类效果同样错误。定义后先跑一次游戏看 `error.log`。
- 调用形式只能是 `<key> = yes`、`<key> = no`（无参触发器）或 `<key> = { PARAM = value }`；带参的脚本化触发器**不能**用 `xxx = no`，要用 `NOT = { xxx = { ... } }`。
- `$PARAM$` 漏传且没写 `|默认值` 会留下空串甚至空语句，是最高频的错误；给每个参数写默认值是硬性建议。
- 参数块用 `[[PARAM]` / `[[!PARAM]`（单层方括号）；写成 `[[PARAM]]` 会解析失败。
- 在脚本化效果/触发器里写本地化指令（如 `[This.GetName]`）必须写成 `\\[This.GetName]`，否则第二次使用起会出错。
- 语句量极大的脚本化块加 `optimize_memory`（裸 token，无值）以避免重复入内存；代价是报错不再给出精确文件位置。

## 常见错误

- 把脚本化触发器当效果用（例如在 `immediate = { my_mod_is_ready_for_war = yes }` 里调用），条件不产生任何行为，效果静默丢失。
- 以为参数会做类型转换：参数是文本替换，`$DELAY$` 传 `1-2` 之类非法内容会直接语法错误。
- 在定义内部再定义一个脚本化效果（嵌套命名），这不是允许的写法；拆成两个键互相调用。
- 在一个脚本化块里依赖"上一次调用留下的作用域"：调用点不同，THIS 就不同。
- 忘掉参数名大小写敏感（`$COUNT$` 与 `$count$` 是两回事）。

## 待确认

- `common/scripted_effects` 与 `scripted_triggers` 的加载覆盖顺序在本机未做实测（只按 LIOS 惯例与文件名前缀推断），如需严格依赖覆盖顺序请用一个最小 mod 验证。
- 参数块官方文档只写 `[[PARAM]` 单层括号；部分 wiki 与第三方教程写作 `[[PARAM]]`，本机本体文件全部为单层，故本条按单层记录。

## 参考

- [Dynamic modding（Scripted effects / Scripted triggers / 参数 / 内联数学）](https://stellaris.paradoxwikis.com/Dynamic_modding)
- [Effects](https://stellaris.paradoxwikis.com/Effects)
- [Conditions](https://stellaris.paradoxwikis.com/Conditions)
- 本机 `Stellaris/common/scripted_effects/99_advanced_documentation.txt`（引擎自带说明，4.1.7）
- [cwtools-stellaris-config: config/common/scripted_effects_and_triggers.cwt](https://github.com/cwtools/cwtools-stellaris-config/blob/master/config/common/scripted_effects_and_triggers.cwt)
