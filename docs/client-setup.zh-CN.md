# 客户端接入指南

RStellarScribe 是一个 **stdio MCP server**：客户端启动它，通过标准输入/输出交换 JSON-RPC。
它没有网络端口、不需要 `npm install`、只需要 Node.js 20+。

先拿到本机路径：

```powershell
node src/index.mjs --print-client-config
```

它会直接打印可以粘贴的配置（`command` 用当前 Node 可执行文件，`args` 指向本项目的
`src/index.mjs`）。下面各客户端都用这个结果。

---

## Claude Code

```powershell
claude mcp add rstellariscribe -- node "<clone>/src/index.mjs"
```

或者手工写进项目根的 `.mcp.json`：

```json
{
  "mcpServers": {
    "rstellariscribe": {
      "command": "node",
      "args": ["<clone>/src/index.mjs"]
    }
  }
}
```

## Claude Desktop / Cursor / 其他 JSON 配置的客户端

`claude_desktop_config.json`（macOS：`~/Library/Application Support/Claude/`；
Windows：`%APPDATA%\Claude\`）或 Cursor 的 MCP 设置：

```json
{
  "mcpServers": {
    "rstellariscribe": {
      "command": "node",
      "args": ["<clone>/src/index.mjs"]
    }
  }
}
```

Windows 路径用正斜杠最省事；反斜杠必须写成 `\\`。

## Codex

在 `~/.codex/config.toml` 里：

```toml
[mcp_servers.rstellariscribe]
command = "node"
args = ["<clone>/src/index.mjs"]
```

## 通用 MCP 客户端

- 传输：**stdio**，换行分隔的 JSON-RPC 2.0（MCP 标准 stdio 传输）
- 协议版本：协商支持 `2025-06-18` / `2025-03-26` / `2024-11-05`
- 能力：`prompts`（5 个）、`resources`（catalog + latest-update + 每个知识主题）、`tools`（27 个）
- `serverInfo.name` = `rstellariscribe`

如果想先用 `--skill` 模式跑通再配 MCP：

```powershell
node src/index.mjs --skill list-tools
node src/index.mjs --skill list-prompts
node src/index.mjs --skill read-resource "rstellariscribe://stellaris/knowledge/catalog"

# 带 JSON 参数时，注意 Windows PowerShell 5.1 会把参数里的双引号吃掉（见下节）
node src/index.mjs --skill get-prompt "stellaris_localisation_writer" "{\"request\":\"写一段国民理念文本\",\"language\":\"simp_chinese\"}"
```

### JSON 参数在 Windows PowerShell 里怎么传

`powershell.exe`（5.1）会改写传给原生程序的参数里的双引号：`'{"query":"a b"}'` 到程序里变成
`{query:a b}`，而写成 `"{\"query\":\"a b\"}"` 会被**拆成三个参数**（这两种我都实测过）。
下面两种写法已验证可用：

```powershell
# 1) 内联：外层单引号，内层引号加反斜杠转义
node src/index.mjs --skill call-tool "search_stellaris_knowledge" '{\"query\":\"localisation bom\"}'

# 2) 从文件读（`-` 表示从标准输入读）。任何 shell 都可靠；
#    嵌套参数（事件批次、本地化条目列表）只能用这种
node src/index.mjs --skill call-tool "generate_event_batch" --json-file args.json
'{"query":"localisation bom"}' | node src/index.mjs --skill call-tool "search_stellaris_knowledge" -
```

不加转义的普通写法**也能用**，因为解析器最后会尝试修复被剥掉引号的输入。解析顺序是
**先严格 JSON、再结构重扫**，所以正常 shell 传进来的参数永远不会被二次解释。三种方式都失败时，
它会直接打印上面这些可用写法。

---

## 第一次使用建议这样问

MCP 连上后，可以直接让 Agent：

> 用 RStellarScribe 在我的模组 `<clone>\MyStellarisMod` 里加一个「起源：方舟遗民」。
> 先读知识库里 civic/起源与本地化相关主题，给出计划，然后 dry-run 给我看文件计划再落盘。

Agent 应该会依次用 `search_stellaris_knowledge` → `read-resource` →
`open_stellaris_workspace` → `generate_civic_batch`（dry-run）→ 再真实写入 →
`validate_stellaris_project`。如果它跳过读知识库就直接写脚本，提醒它读
`rstellariscribe://stellaris/knowledge/catalog`。

## 排查「Agent 说工具不可用」

1. `node src/index.mjs --skill list-tools` 能不能输出 27 个工具？不能的话是 Node 版本或路径问题。
2. 客户端日志里有没有 `rstellariscribe failed: ...`？错误会写 stderr。
3. `node src/index.mjs --skill inspect_rststellariscribe_state`（需先启动过 server）看知识库主题数是否为 35。若为 0，说明 `src/generated/knowledge.mjs` 不存在，跑一次 `node scripts/build-knowledge.mjs`。
4. 客户端是否把 `node` 解析成了别的版本？用 `--print-client-config` 打印的绝对路径更稳。

## 状态与日志位置

| 内容 | 位置 |
| :--- | :--- |
| 工具调用日志 | `%USERPROFILE%\.rstellariscribe\tool-log.jsonl` |
| 编译后的知识 TOML | `resources\knowledge\stellaris\<category>\*.toml` |
| 内嵌知识快照 | `src\generated\knowledge.mjs` |
| 自检产物 | `.selftest\`、`.protocol-test\`（可随时删除） |

工具日志可以用 `query_tool_logs` / `export_tool_logs` 查，也可以直接 grep 那个 JSONL 文件。

## 与群星本身的路径约定

`discover_stellaris_environment` 会找这些位置（只报告真实存在的）：

| 用途 | 路径 |
| :--- | :--- |
| 游戏安装 | 由 `libraryfolders.vdf` 推出的 `<Steam库>\steamapps\common\Stellaris`，以含 `stellaris.exe` 为准 |
| 用户数据 | `Documents\Paradox Interactive\Stellaris`（中文系统可能是 `文档\`，OneDrive 重定向也会被找到） |
| 日志 | `<用户数据>\logs` |
| 启动器描述文件 | `<用户数据>\mod\<name>.mod` |
| 启用 mod 列表 | `<用户数据>\dlc_load.json` |

本机示例：游戏在 `D:\SteamLibrary\steamapps\common\Stellaris`，用户数据在
`C:\Users\<你>\Documents\Paradox Interactive\Stellaris`。
