---
id: localisation-basics
category: localisation
title: Localisation Files and Encoding
title_zh: 本地化文件与编码
file_types: [localisation/, localisation/<language>/*.yml, localisation/replace/*.yml, localisation/languages.yml]
tags: [utf-8-bom, yml, language, replace, reload-text, switchlanguage]
related: [localisation-codes, localisation-style, mod-structure]
sources: [https://stellaris.paradoxwikis.com/Localisation_modding, https://stellaris.paradoxwikis.com/Modding_tutorial, https://stellaris.paradoxwikis.com/Modding]
verified_version: "实机核对 Stellaris 4.1.7 (Lyra) 安装目录与真实模组文件"
---

## 概要

Stellaris 的本地化文件放在模组根目录的 `localisation/`（**用 s 拼写**，不是 `localization`），扩展名 `.yml`——但它**不是合法的 YAML**，只是借用了 YAML 的观感。三条硬规则同时满足才会被引擎读到：① 编码必须是 **UTF-8 with BOM**（纯 UTF-8 会解析失败）；② 文件名必须以 `_l_<language>` 结尾；③ 首行必须写 `l_<language>:`，其后的每条 `key: "text"` 都要以空白字符开头。语言子目录是可选的（只用文件名后缀也能工作），子目录还可以再嵌套（vanilla 就在 `english/name_lists/`、`english/random_names/` 下放了文件）。

## 文件位置与命名

```text
localisation/
    languages.yml            # vanilla 用来定义语言显示名，模组一般不需要动
    english/                 # 可选的语言子目录，可再嵌套（name_lists/ random_names/）
        mymod_l_english.yml
    simp_chinese/
        mymod_l_simp_chinese.yml
    mymod_l_french.yml       # 平铺在 localisation/ 根下同样合法
    replace/                 # 只覆盖个别 key；最后加载，LIOS
        mymod_l_english.yml
```

真实存在（4.1.7 vanilla）的 10 个语言子目录：`braz_por`、`english`、`french`、`german`、`japanese`、`korean`、`polish`、`russian`、`simp_chinese`、`spanish`。vanilla 的 `localisation/languages.yml` 首行是 `l_english:`，随后每行形如 ` l_simp_chinese:0 "Simplified Chinese"`，即它本身就是一份普通本地化文件。

## 语法与字段

```pdx
l_english:
 mymod_civic:0 "Semper Exploro"
 mymod_civic_desc: "This society prioritised scientific exploration over military expansion in the early space age."
```

上例同时展示了两种合法写法：冒号后的数字（`:0`）**是可省略的**，它只是 Paradox 内部的翻译追踪/修订号。实机统计 4.1.7 英文本地化约 91k 条中，带数字的 63296 条、不带的 37538 条，数字取值从 `:0` 一直到 `:11` 以上（`:0` 53735 条、`:1` 8024 条），可见它既非必须、也不是固定的 `0`。

能用的语言头（与上表目录名一一对应）：

```text
braz_por / english / french / german / japanese / korean / polish / russian / simp_chinese / spanish
```

编码自检（应当是 `EF BB BF`）：

```text
Format-Hex -Path .\localisation\english\mymod_l_english.yml   # 前 3 字节 EF BB BF
```

## 校验要点

- 目录名是 `localisation`（s），且位于模组根目录下，不在 `common/` 里。
- 每个 `.yml` 文件名以 `_l_<language>` 结尾，`<language>` 属于上面 10 个之一。
- 首行是 `l_<language>:`（与文件名后缀一致），且该行之前没有任何 BOM 之外的内容。
- 首行之后的每条 key 都以空格或制表符开头（vanilla 与真实模组都用 1 个空格）。
- 文件编码是 UTF-8 with BOM：前 3 字节为 `EF BB BF`。实机核对：vanilla 的 `localisation/english/*.yml` 与真实模组的平铺、语言子目录、嵌套子目录、`replace/` 下的 `.yml` **全部带 BOM**。
- 需要覆盖 vanilla 或其他模组的单个 key 时，文件放在 `localisation/replace/` 下（实机确认该目录在真实模组中被使用，且其文件同样带 BOM）。
- 用 `\"` 转义引号，例如 `mymod_quote:0 "He said \"yes\"."`。
- 不要出现 `„ “ ‚ ‘ – ” ’ … —` 这些字符：wiki 明确它们非法、会被渲染成 `?`；实机核对显示 vanilla 英文本地化中这 9 个字符**出现次数均为 0**，与"必须避开"一致。
- 覆盖到的每种语言都要有文件：引擎**没有** fallback，缺 key 就直接显示原始 key 名。
- 只使用 vanilla/真实模组文件中确实存在的 `£icon£` 与 loc 作用域命令（不确定就先查 `logs/script_documentation/localizations.log`）。

## 常见错误

- 存成 UTF-8 without BOM：文件被静默忽略，游戏里显示 key 名而不是文本。
- 把目录写成 `localization`（美式 z）：完全不被读取。
- 文件名忘了 `_l_english` 后缀，或后缀写 `_l_en`：不被读取。
- 首行写成 `l_english` 少了冒号，或首行有前导空格。
- 条目顶格书写（没有前导空白）：该行不被解析。
- 只做了英文就以为其他语言会自动回退：不会，非英文玩家看到 key 名。
- 用整文件同名覆盖 vanilla 本地化：风险高，且后续 vanilla 更新会带来大量冲突；应改用 `localisation/replace/`。
- 在 `localisation/` 里放非 `.yml` 文件（如 `readme.txt`）并期望不影响加载（实际会被目录扫描，属噪音来源）。

## 待确认

- **已推翻** wiki《Modding tutorial》中"`/localisation_synced/` 也是玩家可读文本目录"的说法：实机遍历 Stellaris 4.1.7 安装目录（含一层子目录）**不存在任何 `*synced*` 目录**，vanilla 只有 `localisation`。因此模组不要创建 `localisation_synced/`。
- 纯 UTF-8（无 BOM）会解析失败这一点来自 wiki 明确表述与第三方解析器文档，未在本机启动游戏实测。
- `reload text` / `toggle_string_id` 为 wiki 记载；`switchlanguage` 的正确写法 `switchlanguage l_english`（带 `l_` 前缀）来自《Console commands》与《Localisation modding》两处一致记载，而《Modding tutorial》写作 `switchlanguage english`，未实测哪一个在 4.1.7 生效。
- `$t$` 已被实机确认为 vanilla 定义的 key（`main_1_l_english.yml` 中 `t:0 "    " #single tab`），但它是否在所有语言文件里都定义、以及是否应替代 `\t` 使用，未逐一核对。
- 模组能否自行新增一个不在这 10 个语言之内的语言头（例如 `l_turkish`）未验证；游戏 UI 语言列表来自 `languages.yml`，新增语言属于高风险行为，未实证。

## 参考

- [Localisation modding（UTF-8-BOM、命名、首行、replace、转义、非法字符）](https://stellaris.paradoxwikis.com/Localisation_modding)
- [Modding tutorial（localisation 目录与语言头清单、无 fallback 的复制做法）](https://stellaris.paradoxwikis.com/Modding_tutorial)
- [Modding（Guidelines：本地化与 name list 文件用 UTF-8 with BOM）](https://stellaris.paradoxwikis.com/Modding)
- [Paradox Language Support — 附录：语法参考（本地化文件结构、编码要求、键值格式）](https://windea.icu/Paradox-Language-Support/zh/ref-syntax.html)
