# 移植说明：RHoiScribe → RStellarScribe

这份文档记录**逐工具的对应关系**、**每一处刻意的偏离及其原因**，以及**用真机文件核实后
被推翻的常见说法**。目的是让读过 RHoiScribe 源码的人能一眼看出哪里一致、哪里不同、为什么。

- 上游：RHoiScribe `0.4.1`（Rust 2024，`rmcp` + CWTools Rust crates + `rnmdb` / `rchadow`）
- 本移植：`0.1.0`（Node.js 20+，零依赖）
- 核对基线：**Stellaris 4.1.7 "Lyra"**（本机实际安装）；素材注册相关的四节（见下）另按 **4.4.6 "Pegasus"**（`<Stellaris>`）逐字段重新实测

## 一、工具面对照

RHoiScribe 注册 **36** 个工具（`src/tools/mod.rs` 的 `TOOL_SPECS`），其中只有 7 个在 JSON
Schema 里声明了 `properties`。RStellarScribe 注册 **48** 个工具，**每一个都带完整 JSON Schema**——
Agent 看不到参数就只能猜，而猜错的代价是生成一堆加载不了的脚本。

### 直接对应（21 个）

| RHoiScribe | RStellarScribe | 一致性说明 |
| :--- | :--- | :--- |
| `open_hoi4_language_workspace` | `open_stellaris_workspace` | 都缓存工作区；本项目缓存的是原生扫描索引（descriptor、文件清单、各子系统定义键、已有本地化键） |
| `get_hoi4_language_status` | `get_stellaris_workspace_status` | 同上 |
| `validate_hoi4_file` | `validate_stellaris_file` | 校验对象从 CWT 诊断改为括号配平、编码、定义键、本地化键引用 |
| `validate_hoi4_project` | `validate_stellaris_project` | 保留「默认混合模式 + verdict/error_count/warning_count」的结果形状 |
| `explain_hoi4_diagnostic` | `explain_stellaris_diagnostic` | 都由日志文本反查知识；本项目的搜索在「全部词必须命中」之外增加了单词并集回退，否则带路径的日志行永远搜不到 |
| `validate_hoi4_paths` | `validate_stellaris_paths` | 路径拒绝规则与可写白名单语义一致（见下节） |
| `generate_missing_localisation` | `generate_missing_localisation` | 同样**永不落盘**，只给候选；上限同为 200，clamp 1..=1000 |
| `generate_localisation_batch` | `generate_localisation_batch` | `language` / `file_stem` / `key_prefix` / `entries[{id,title,description}]`；写盘同为 UTF-8 BOM |
| `generate_event_batch` | `generate_event_batch` | 事件脚本 + 本地化成对生成 |
| `generate_decision_batch` | `generate_decision_batch` | 字段集改用群星自带的 `common/decisions/example.txt` |
| `search_hoi4_knowledge` | `search_stellaris_knowledge` | 检索语义完全一致：按空白切词、**每个词都必须命中**；默认 8，clamp 1..=20 |
| `scan_unique_identifiers` | `scan_unique_identifiers` | 保留 `intent = create/edit` 与 `availability = duplicate/free/existing/missing`、`available` 的判定 |
| `classify_error_log` | `classify_error_log` | 保留「关键词 `contains` 判错误行 + 有序规则取首个命中 + `changed_paths` 子串关联 + `limit` 只控 examples」的实现，未引入正则 |
| `discover_hoi4_environment` | `discover_stellaris_environment` | 同样只报告真实存在的路径；Steam 库改从 `libraryfolders.vdf` 读取 |
| `validate_hoi4_debug_run` | `validate_stellaris_debug_run` | 语义一致：期望 mod 集合 = 工作区 descriptor 的 `name` + 其 `dependencies` + 请求 `dependencies`，与 `dlc_load.json` 的 `enabled_mods` 比对 |
| `query_tool_logs` | `query_tool_logs` | 默认 100、上限 32767、单条 8192 字符截断 |
| `export_tool_logs` | `export_tool_logs` | 默认 32767 |
| `inspect_rhoiscribe_state` | `inspect_rststellariscribe_state` | 改为报告知识库规模、工具日志规模、已打开工作区 |
| `edit_hoi4_script_file` | `edit_stellaris_script_file` | 都要求文件**已存在**、都在根内做前缀比较；本项目增加 `expected_replacements` 歧义保护与「引入新括号错误则拒绝」 |
| `setup_hoi4_mod_skeleton` | `setup_stellaris_mod_skeleton` | 目录从 HOI4 的 `common/ideas`、`history/countries` 换成群星的 `common/scripted_variables`、`common/on_actions` |
| `format_paradox_script` | `format_paradox_script` | 同一语法族；本项目额外返回格式校验结果 |

### 替代（5 → 5）

| RHoiScribe | RStellarScribe | 原因 |
| :--- | :--- | :--- |
| `generate_focus_batch` | `generate_civic_batch` + `generate_technology_batch` + `generate_tradition_batch` | **群星没有国策树**。对应的「国家成长主干」是国民理念/起源、科技、传统与飞升，拆成三个生成器各自对齐真实字段 |
| `launch_hoi4_debug_with_rchadow` | `plan_stellaris_debug_run` | 原实现依赖作者自己的 Rchadow 并硬编码 `-gdpr-compliant -debug_mode`。**MCP server 不应该启动游戏进程**：改为算出必需 mod 集合、核对 `dlc_load.json`、打印命令行 |
| `index_hoi4_project` | （并入 `open_stellaris_workspace`） | 索引在打开工作区时就建好了，单独一个索引工具只是多一次往返 |

### 未移植（12 个）

| RHoiScribe | 未移植原因 | 替代路径 |
| :--- | :--- | :--- |
| `list_hoi4_workspace_symbols` | 依赖 CWTools 符号表 | `open_stellaris_workspace` 的索引 + `scan_unique_identifiers` |
| `find_hoi4_definition` | 同上 | `scan_unique_identifiers` 会返回定义所在文件与行号 |
| `find_hoi4_references` | 同上 | 未提供；用编辑器全局搜索 |
| `suggest_hoi4_completion` | 同上 | 建议装 CWTools VSCode 扩展（见 `validation-cwtools` 主题） |
| `inspect_hoi4_scope` | 依赖 HOI4 作用域规则库 | `scopes` 知识主题（按 4.1.7 核对） |
| `inspect_hoi4_type_rule` | 依赖 CWT 类型规则 | 无；群星无公开规则集 |
| `list_agent_preference` / `set_agent_preference` / `delete_agent_preference` | 原项目的偏好存储属于产品决策，不是群星模组能力 | 无 |
| `backup_rhoiscribe_state` | 本项目状态是可读的 JSONL 文件，直接复制即可 | 文件系统 |
| `repair_hoi4_project` | 自动改写他人项目的风险高于收益；`apply` + `dry_run` 双开关更易误用 | `edit_stellaris_script_file` 逐处替换 + `validate_stellaris_project` |
| `generate_gui_gfx_asset` | 会写出 base64 解码的二进制 PNG | `register_image_asset` / `register_audio_asset`（**只**写注册用的 `.gfx` / `.asset` / `.txt` / `.yml` 文本，仍然不写二进制素材；二进制由使用者自己放到位） |

### 新增（6 个，群星特有）

| 工具 | 为什么群星需要 |
| :--- | :--- |
| `validate_stellaris_localisation` | 群星本地化有**三条**静默失效规则（BOM / `_l_<language>` 文件名 / `l_<language>:` 首行），任一不满足整份文件不被读取且**不报错**。这是群星模组最高频的失败 |
| `generate_stellaris_mod_descriptor` | 群星需要**两个** descriptor：模组根的 `descriptor.mod` 与 `Documents/Paradox Interactive/Stellaris/mod/<name>.mod`，后者多一个 `path` 字段。搞错是「启动器里看不到模组」的头号原因 |
| `register_image_asset` | 各 `.gfx` kind 的字段契约不同：`spriteType` 在 8539 条记录里 `size`/`borderSize` 出现 0 次，`progressBarType` 用 `textureFile1`/`textureFile2` 而非 `texturefile`；内联文字图标必须叫 `GFX_text_<token>`。写错不报错、只是不生效 |
| `validate_image_asset` | 精灵名是全局唯一键（9197 条声明无重名），且 `texturefile` 指向不存在的文件是**静默**的——vanilla 自己就有 13 条这样的死注册 |
| `register_audio_asset` | `file` 字段相对 `.asset` 文件自己的目录解析（5931 条里 4569 条只能这样解析），且 `music` + `song` + 本地化是**三个**文件；采样率必须 44100 Hz，否则引擎逐曲写 `pdx_audiomusic_sdl.cpp:88` 警告 |
| `validate_audio_asset` | 会把模组里每个 `sound`/`music` 块的 `file` 按引擎的解析规则还原成磁盘路径，报出指向不存在文件的条目 |

## 二、刻意保持一致的约定

1. **`dry_run` 默认 true**，写模式必须是 `dry_run = false` **且**给出绝对 `output_root`。
2. **结果形状**：`{ dry_run, files: [{ path, encoding, summary, bytes }], messages: [...] }`，路径一律模组根相对。
3. **编码**：本地化 `utf-8-bom`，脚本 `utf-8`（计划里显式标注）。
4. **路径硬白名单**：RHoiScribe 只允许写入 `common | events | gfx | history | interface | localisation` 加 `descriptor.mod`；本项目对应为 `common | events | localisation | gfx | interface | map | sound | music | flags | fonts | prescripted_countries` 加 `descriptor.mod`。**白名单在计划阶段就生效**，所以 dry-run 与真实写入拒绝完全相同的路径。
5. **拒绝规则**：空、绝对路径、盘符前缀、`../` 穿越、UNC、保留设备名、段尾点/空格、非法字符、超长路径。
6. **`ToolError` → JSON-RPC `-32602`**（`invalid_params`），与原项目把 `ToolError` 映射为协议级错误一致；其他运行时错误作为 `isError` 工具结果返回，让信息留在 Agent 眼前。
7. **知识主题 TOML 字段集**：`id / title / category / file_types / tags / body / syntax_blocks / relationships / validation / source_refs`。本项目额外写了 `title_zh / verified_version / aliases` 三个扩展字段——serde 默认忽略未知字段，所以这些 TOML **仍可被原 Rust 实现直接解析**。

## 三、刻意偏离的地方

| 项 | RHoiScribe | RStellarScribe | 原因 |
| :--- | :--- | :--- | :--- |
| 语言 | Rust 2024 + `rmcp` + CWTools crates | Node.js 20+，零依赖 | 那些 crate 是 HOI4 专属且没有群星对应物；零依赖意味着拿到就能跑，不需要工具链 |
| 校验引擎 | CWTools 规则集 | 只报文件本身能证明的事 | 群星没有公开规则集；假装能校验未知触发器名是错的 |
| 状态存储 | `~/.rhoiscribe/state.rnmdb` | `~/.rstellariscribe/tool-log.jsonl` | 可读、可 grep、无需数据库；三个查询/导出/检查工具的语义保持不变 |
| 日志写入失败 | 会把成功结果替换成 state 库错误 | 只记录、绝不影响工具结果 | 工具已经干完的活不该因为写日志失败而报错 |
| 工具 schema | 36 个里 7 个有 `properties` | 27 个全部有完整 schema | 参数不可见是 Agent 猜错的直接原因 |

## 四、被真机文件推翻的说法

以下都是社区/Wiki 里流传、但在**本机 Stellaris 4.1.7 实际文件中不成立**的写法。知识库里每一条
都记了依据（文件路径 + 出现次数），并集中在 `common-errors` 与各主题的「常见错误」。

| 说法 | 4.1.7 实际 |
| :--- | :--- |
| `common/custom_tooltips/` 存自定义 tooltip | 目录不存在；只有 `custom_tooltip = <key>` 与 `custom_tooltip = { fail_text = <key> ... }` |
| `common/game_rules/` 用 `default` / `setting` | 该目录是**脚本化触发器块**；开局选项在 `common/gamesetup_settings/`；`has_game_rule` 不是合法语法 |
| on_action 支持 `chance_to_fire` | 块内只有 `events` 与 `random_events`；概率微调靠事件内 `weight_multiplier` |
| 考古在 `common/archaeological_sites/` | 是 `common/archaeological_site_types/`；遗址**没有** `rewards`，失败字段是 `on_roll_failed` |
| 决议需要 `decisions = { }` 包裹 | 不需要；行星决议也在 `common/decisions/` |
| `common/buildable_districts/`、`common/strike_craft/`、`common/event_modifiers/` | 三者**都不存在**；4.0 新增 `common/zones/` 与 `common/zone_slots/`，区划必填 `zone_slots`、建筑必填 `building_sets` |
| `common/deposit/`（单数） | 是 `common/deposits/`（复数） |
| 科技支持 `is_repeatable` | 科技文件中 **0 次**出现（本项目因此不生成该字段） |
| 事件支持 `major` / `pop_event` | 4.1.7 **0 次**；已改名为 `pop_group_event` |
| 脚本文件绝对不能用 BOM | 本地化**必须**有 BOM；但 `common/name_lists/*.txt` 在 vanilla 里**带** BOM，所以脚本里的 BOM 只是风格警告而非错误 |
| vanilla 本地化一律写 `key:0` | 英文包里 63296 条带数字、37538 条不带，编号最大到 `:11`——`0` 可省且并非固定值 |
| 存在 `localisation_synced/` | 4.1.7 安装目录里没有任何 `*synced*` 目录 |
| `add_technology` / `for_each` / `export_to_variable` / 通用 `count = { }` | 均为 **0 次**；对应写法是 `give_technology`、`ordered_*`/`every_*`、`export_trigger_value_to_variable`、`count_<列表> = { ... }` |
| `spawn_planet`、`is_gestalt`、效果块里的 `log` 不可用 | 三者都可用（分别 64 / 2694 / 157 次） |

## 五、本移植的已知限制

- **没有游戏内实测**。所有结论来自静态核对（读文件、统计出现次数），未经「启动游戏看是否生效」验证。`## 待确认` 小节里列出的都是这一类。
- **未知字段无法本地判定**。写错的触发器/修正名只有引擎日志会说，`classify_error_log` 与 `explain_stellaris_diagnostic` 只帮你定位，不替你保证。
- **`replace_path` 的群星行为未证实**：65 个真实 descriptor 里 0 次出现，官方字段表也没有。本项目在生成时给出明确警告而不是断言其语义。
- **CWTools 的群星配置**当前权威仓库归属未确认（`cwtools/` 还是 `corsairmarks/`），所以本项目不假定任何具体配置文件路径。
