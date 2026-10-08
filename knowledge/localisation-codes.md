---
id: localisation-codes
category: localisation
title: Localisation Rich Text Codes
title_zh: 本地化富文本代码
file_types: [localisation/**/*.yml, common/scripted_loc/*.txt, common/scripted_variables/*.txt, interface/*.gfx]
tags: [dollar-codes, icons, colour-codes, bracket-commands, scripted-loc, concepts]
related: [localisation-basics, localisation-style, custom-tooltips]
sources: [https://stellaris.paradoxwikis.com/Localisation_modding, https://stellaris.paradoxwikis.com/Modding_tutorial, https://windea.icu/Paradox-Language-Support/zh/ref-syntax.html]
verified_version: "实机核对 Stellaris 4.1.7 英文本地化（方括号命令、概念指令、$@ 变量用量）"
---

## 概要

本地化字符串内的富文本由五类标记组成：`$...$`（引用其他 key、变量、数字格式化）、`£...£`（图标）、`§X...§!`（颜色）、`[...]`（作用域命令 / scripted loc / 概念）、`@name = value`（脚本封装变量，配合 `$@name$` 使用）。全部标记都可以自由嵌在同一个字符串里。写之前优先照抄 vanilla 里已存在的写法：任何"看起来该有但实际没有"的标记都会原样显示出来。

## 文件位置与命名

- `localisation/**/*_l_<language>.yml`：承载富文本的位置。
- `common/scripted_variables/*.txt`：`@name = value` 封装变量的定义处（vanilla 共 20 个此类文件）。
- `common/scripted_loc/*.txt`：`defined_text = { ... }` 块，用来生成可被 `[Scope.名字]` 调用的动态文本。
- `interface/*.gfx`：自定义 `£...£` 图标所需的 sprite 定义（名字必须以 `GFX_text_` 开头）。

## 语法与字段

```pdx
l_english:
 mymod_tooltip:0 "Upkeep: §R+$@mymod_upkeep|*1$§! £energy£ per §Ymonth§!.\nOwner: [Root.Owner.GetName]"
 mymod_list:0 "[[$INDEX$] $FLEET_NAME$ ($SYSTEM_NAME$ system)"
 mymod_concept:0 "See ['concept_hyperlanes'] for details."
```

`@` 封装变量在脚本文件里定义（`common/scripted_variables/`），在本地化里用 `$@名字$` 引用：

```pdx
@mymod_upkeep = 0.20
```

颜色码（`§` 后跟一个字符，`§!` 恢复上一次的颜色）：

```text
W 白  T 浅灰(正文默认)  g 深灰(禁用)  L 棕/土黄(背景设定)  P 浅脏粉(攻击性措辞)
R 红(负面)  S 深橙(轻微强调)  H 或 K 芒果橙(强调)  Y 或 I 黄(中性/次优)
G 绿(正面)  V 深绿(事件文本)  E 青绿(大段文字)  C 青(概念文字)  B 青蓝(影响 pop 的效果)
M 紫(稀有科技)  _ 洋红(占位符)  c 蓝绿(领袖特质)  v 褪绿(老兵特质)
d 棕褐(命运特质)  r 浅紫(Renowned)  l 浅绿(Legendary)  ! 结束/回到上一颜色
```

`spriteType` 名字必须以 `GFX_text_` 开头，本地化里则省掉前缀用 `£名字£`：

```pdx
spriteTypes = {
	spriteType = {
		name = "GFX_text_mymod_scrap"
		texturefile = "gfx/interface/icons/text_icons/mymod_scrap.dds"
	}
}
```

`scripted_loc` 块（`common/scripted_loc/*.txt`）生成动态文本键，用 `[Scope.名字]` 调用：

```pdx
defined_text = {
	name = GetMymodHullName
	text = {
		trigger = { is_species_class = AVI }
		localization_key = mymod_hull_avian
	}
	text = {
		localization_key = mymod_hull_default
	}
}
```

## 校验要点

- `$KEY$` 引用的 key 必须真实存在（含 `$OUTLINER_FLEETS$` 这类全大写 vanilla key）；不确定就查 `logs/script_documentation/localizations.log`。
- `$@名字$` 的 `名字` 必须在 `common/scripted_variables/` 或某个脚本文件里用 `@名字 = 值` 定义过（实机：vanilla 英文 loc 中有 392 处 `$@...` 引用）。
- 数字格式化写成 `$VALUE|*x$`（x 位小数），例如 `$@mymod_upkeep|*1$`；颜色写成 `$VALUE|Y$`，二者可组合使用于 `$@var$`。
- `£` 必须**成对**包围图标名（`£energy£`）；带帧的写法是 `£leader_skill|3£`。
- 颜色码以 `§` 开头、以 `§!` 结束；`§!` 只恢复到上一次颜色，不一定是白色。
- 方括号命令形如 `[主作用域.次作用域.取值]`，主作用域只能是 `Root`、`This`、`From`、`Prev`、`Actor`/`Recipient`/`Third_party`，或事件目标标签（写成 `[mytarget.GetName]`，不带 `event_target:` 前缀）。
- 次作用域用 `Capital`、`Leader`、`Owner`、`System`、`Planet`、`MainAttacker`、`MainDefender` 等（如 `[Root.Capital.GetName]`）。
- 取值必须是真实存在的 `Get*` 指令，例如 `GetName`、`GetRealName`、`GetAdjective`/`GetAdj`、`GetSpeciesName`、`GetSpeciesNamePlural`、`GetSpeciesAdj`、`GetRulerName`、`GetRulerTitle`、`GetHeirName`、`GetLeaderName`、`GetOwnerName`、`GetHomeWorldName`、`GetStarName`、`GetClassName`、`GetAAnPlanetClass`、`GetPlanetMoon`、`GetPlanetHabitat`、`GetPopFactionName`、`GetPersonalityName`、`GetAllianceName`、`GetControllerName`、`GetFleetName`、`GetAge`、`GetSheHe`/`GetHerHis`/`GetHerHim`、`GetIsAre`/`GetHasHave`/`GetWasWere`、以及会按蜂群/机仆变化的 `GetScientist`、`GetEngineer`、`GetResearchers`。
- 无作用域指令：`GetDate`、`GetMidGameDate`、`GetLateGameDate`、`GetYear`、`LastKilledCountryName`。
- 变量用 `[Scope.my_variable]`，日期旗标用 `[Scope.my_date_flag]`（3.1 起）。
- 要在文本里显示字面量 `[`，写 `[[`（实机 vanilla 有 4 处此类用法，如 `[[$INDEX$]`）；不要为了显示 `[` 而写别的转义。
- `scripted_loc` 定义里**不能再使用方括号命令**（会原样打印）。
- 在 scripted effect / trigger 里写 `log = [This.GetName]` 需要转义成 `\[This.GetName]`。
- 概念指令 `['concept_x']` 是 Stellaris 专有语法（实机 vanilla 英文 loc 中 1334 处），指向 `common/game_concepts/` 里的定义。
- 转义只用 `\n`、`\t`、`\"`（以及 `\\`）；`#bold ... #!` 这类文本格式标记是 CK3/VIC3/EU5 的，**Stellaris 不支持**。

## 常见错误

- 只写一个 `£energy` 或漏掉尾部的 `£`：图标不显示，还可能吃掉后续文本。
- `§R` 忘了配 `§!`：后面整段文字都被染色。
- 用 `[Owner.GetName]` 却没意识到事件里没有 Owner 作用域，或把事件目标写成 `[event_target:mytarget.GetName]`。
- 在 `common/scripted_loc/` 的 `defined_text` 里塞 `[Root.GetName]`：原样输出方括号文本。
- 把变量当 loc key 用（写 `$my_variable$` 而不是 `[Scope.my_variable]`）。
- 以为 `$VALUE|*2$` 是乘 100 或百分比：它只是小数点位数。
- 在 Stellaris 里用 `#bold text#!`：不被识别，直接显示成字面量。

## 待确认

- `Get*` 指令清单以 wiki 表格为准（该表自称"只是一部分"，完整列表需查 `logs/script_documentation/localizations.log`）；本条目只收录已在本机或 wiki 中确证存在的名字。
- wiki 的数字格式化示例 `"$EXAMPLE|*0$" # 10044` 明显是页面笔误（`100` 加上杂散数字），本条目只采用其文字说明"`|*x` 表示 x 位小数"，并用 vanilla 真实用例 `$@...|*0$` 作为佐证。
- 颜色码表来自 wiki（并注明定义在 `interface/fonts.gfx`），本机未逐字符渲染验证；`§!` 之外是否存在其他终止写法未验证。
- `£` 图标的完整清单：wiki 明言"实际数量多于表中列出"，其余需在 vanilla 文件里以 `£` 搜索确认。
- 概念指令 `['concept']` 与带自定义富文本的 `['concept', text]` 两种形态：前者在 4.1.7 实机确证，后者仅见于第三方解析器文档，未在 vanilla 文件中找到实例。

## 参考

- [Localisation modding（$ 码、数字格式化、£ 码、颜色码全表、方括号命令、scripted_loc 限制）](https://stellaris.paradoxwikis.com/Localisation_modding)
- [Modding tutorial（`$` 引用其他 key 的用法）](https://stellaris.paradoxwikis.com/Modding_tutorial)
- [Paradox Language Support — 附录：语法参考（`$@var$` 封装变量引用、`£icon|frame£`、概念指令仅 Stellaris、`[[` 转义）](https://windea.icu/Paradox-Language-Support/zh/ref-syntax.html)
