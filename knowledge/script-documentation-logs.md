---
id: script-documentation-logs
category: debug
title: The Game's Own Script Documentation Logs
title_zh: 游戏自带的脚本签名文档日志
file_types: [logs/script_documentation/effects.log, logs/script_documentation/triggers.log, logs/script_documentation/modifiers.log, logs/script_documentation/scopes.log]
tags: [effects.log, triggers.log, modifiers.log, Supported Scopes, signature, validate_stellaris_script_signatures]
related: [effects, triggers, script-basics, common-errors]
sources: []
verified_version: "Pegasus 4.4.6 本机实测（effects 1056 / triggers 1087 / modifiers 45842 / scopes 99）"
---

## 概要

**游戏每次运行都会把自己的全部效果、触发器、修正的签名写进用户数据目录**，这是比任何 wiki 都权威的一手资料：

```
%USERPROFILE%\Documents\Paradox Interactive\Stellaris\logs\script_documentation\
    effects.log     1056 个效果：名字 + 参数签名 + Supported Scopes
    triggers.log    1087 个触发器：同上
    modifiers.log  45842 个修正：名字 + Category
    scopes.log        99 个作用域类型
    localizations.log
```

**关键价值：它告诉你每个效果/触发器接受哪些作用域**（`Supported Scopes: country ship`）。"Wrong scope for trigger" 这类报错以前只能靠猜，现在可以直接查。

## 格式

`effects.log` / `triggers.log` 以空行分隔条目，每条三部分：

```
create_army - Creates a new army
create_army = {
  name = <string>
  owner = <target>
  species = <target>/random
  type = <key>
}
Supported Scopes: planet ship colony
```

`modifiers.log` 是纯列表：`- ship_orbital_bombardment_mult, Category: Ships`。
行首可能带引擎前缀 `[14:41:45][game_application.cpp:1400]: `，解析时要剥掉。

## 怎么用（两个层次）

**1) 直接查**：想知道 `resource_stockpile_compare` 支持什么作用域、参数怎么写，直接查这份日志，比搜 wiki 快且准确。实战案例——`value` 的比较运算符**属于键名**：

```
resource_stockpile_compare = {
  resource = <resource_name>
  value ><= <value>      # 注意：>  <  >=  <=  是键名的一部分
}
```

写成 `value = 100` 会被当成"恰好等于 100"（于是"有 5000 能量币却提示能量不足"），而**引擎不报任何错**。

**2) 用工具跑**：`validate_stellaris_script_signatures` 会拿这些日志校验整个模组，报四类问题：

| 代码 | 抓什么 | 严重度 |
| :--- | :--- | :--- |
| `unknown-script-name` | 效果/触发器名不存在（如 `every_ship`——它根本不存在，正确的是 `every_owned_ship`） | 效果上下文=error，触发器上下文=warning |
| `wrong-scope` | 已收录的名字用在了错误作用域（如 `has_technology` 用在 `potential_construction`——那里作用域是恒星基地） | error |
| `invalid-event-type` | `events/*.txt` 顶层关键字不是事件类型（写 `<namespace>_event` 会刷 `Corrupt Event Table Entry`） | error |
| `event-option-effect-wrapper` | `option = { effect = { ... } }`（option 没有 `effect` 这一层） | error |
| `missing-comparison-operator` | `*_compare` 里写成 `value = N` | error |

实测：在一个故意埋了 6 个历史 bug 的模组上全部命中（8 条 error，含同一行的复合问题）；在真实模组上 **0 error**。

## 为什么触发器上下文里"未收录"只是警告

`triggers.log` **并不收录所有合法触发器**——数据库字段型的触发器经常缺失（例如 `authority` 在 `possible = { authority = { value = auth_x } }` 里完全合法，却不在日志里）。所以工具在触发器上下文里只给 warning，在效果上下文里才给 error（`every_ship` 就在那里）。

## 作用域是怎么被推断的

工具不解析完整作用域链，而是按优先级推：

1. **固定作用域**：`potential_construction` / `possible_construction` → 恒星基地（建造者作用域）；`potential_country` → 国家；`on_start`/`on_monthly`/`on_progress_complete`/`on_fail`/`on_abort` → 局势；`on_enabled`/`on_disabled` → 国家
2. **事件根作用域**：按事件类型（`country_event` → country、`fleet_event` → fleet…）
3. **作用域切换键**：`owner`/`from`/`capital_scope`/`every_owned_ship`/`every_owned_planet`…（只在脚本上下文里生效，参数块里的同名键不算）
4. **`is_scope_type = <scope>` 推断**：在 `potential`/`allow` 里出现时，同一段定义的 `effect = { }` 也按该作用域判断——没有这条，舰队按钮里的 `create_army` 根本无法判断
5. 推断不出来就保持 `unknown`，**不报**（宁缺勿滥）

## 校验要点

- 日志只有**运行过游戏**才存在；工具在缺失时会明确说明，而不是抛错。
- 行首 `[时间][文件:行]: ` 前缀要剥掉再解析。
- 事件/触发器条目靠 `Supported Scopes:` 行分隔，条目首行是 `<名字> - <描述>`。
- 判"名字不存在"时必须排除：作用域关键字（`from`/`owner`/`root`/`this`/`prev`）、逻辑字（`AND`/`OR`/`NOT`/`NOR`）、参数名（`value`/`text`/`mult`/`base`…），否则真实模组会刷出十几条误报。

## 参考

- 工具：`validate_stellaris_script_signatures`（`src/tools/signature-checks.mjs` + `src/lib/game-signatures.mjs`）
