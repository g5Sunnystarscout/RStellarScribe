---
name: rstellariscribe-stellaris
description: Use when an agent needs local Stellaris modding prompts, knowledge resources, or generation and validation tools without configuring an MCP server.
---

# RStellarScribe Stellaris

Use this Skill when Stellaris modding work needs the bundled knowledge base, prompts or
tools, and you either cannot or do not want to configure an MCP client. Everything here is
the same catalogue the MCP server exposes; only the transport differs.

RStellarScribe needs **Node.js 20 or newer** and has **no dependencies to install**.

## Direct Commands

These commands print JSON and use the same prompt, resource and tool catalogues as the MCP
server. Replace `<RSTELLARISCRIBE>` with this package's directory.

```bash
node <RSTELLARISCRIBE>/src/index.mjs --skill list-tools
node <RSTELLARISCRIBE>/src/index.mjs --skill list-resources
node <RSTELLARISCRIBE>/src/index.mjs --skill list-prompts
node <RSTELLARISCRIBE>/src/index.mjs --skill read-resource "rstellariscribe://stellaris/knowledge/catalog"
node <RSTELLARISCRIBE>/src/index.mjs --skill get-prompt "stellaris_mod_planner" '{"request":"plan a tradition tree"}'
node <RSTELLARISCRIBE>/src/index.mjs --skill call-tool "search_stellaris_knowledge" '{"query":"on_actions random_events"}'
```

### Passing JSON arguments on Windows

**Windows PowerShell 5.1 rewrites the double quotes in an argument it hands to a native program.**
The plain form `'{"query":"a b"}'` arrives as `{query:a b}`, and the double-quoted form
`"{\"query\":\"a b\"}"` is split into three separate arguments. Two forms are verified to work:

```powershell
# 1. Inline: single quotes outside, backslash-escaped quotes inside.
node <RSTELLARISCRIBE>\src\index.mjs --skill call-tool "search_stellaris_knowledge" '{\"query\":\"localisation bom\"}'

# 2. From a file (or `-` for stdin). Reliable in every shell, and the only sane option
#    for nested arguments such as event batches or localisation entry lists.
node <RSTELLARISCRIBE>\src\index.mjs --skill call-tool "generate_event_batch" --json-file args.json
'{"query":"localisation bom"}' | node <RSTELLARISCRIBE>\src\index.mjs --skill call-tool "search_stellaris_knowledge" -
```

A plain unescaped argument also works, because the parser repairs quote-stripped input as a last
resort. The parser tries strict JSON first and only then rescans, so a shell that passes quotes
through correctly is never reinterpreted. If every attempt fails it prints the working forms above.

## Agent Workflow

- Run `--skill list-prompts`, then `--skill get-prompt` for the task prompt before planning or editing.
- Run `--skill list-resources`, then `--skill read-resource` for the relevant Stellaris knowledge topics before relying on memory or a web search. The topics were verified against Stellaris 4.1.7 and record where the wiki is wrong.
- Run `--skill list-tools` before tool use and follow each returned JSON schema.
- Use `--skill call-tool` for the same tools the MCP server exposes; tool outputs are JSON and should drive the next step.
- For file-changing work, call `open_stellaris_workspace` for the mod root, then validate. `open_stellaris_workspace` and `get_stellaris_workspace_status` keep their state in the process, and a `--skill` invocation is short-lived, so each command starts cold; use MCP server mode for a warm workspace.
- Every generator defaults to `dry_run = true`. Inspect the returned file plan, then repeat with `dry_run = false` and an absolute `output_root`.
- Localisation is UTF-8 **with** BOM, named `<name>_l_<language>.yml`, first line `l_<language>:`. Script files are UTF-8 without BOM. `validate_stellaris_localisation` proves the localisation rules when you write files by hand.
- Call `generate_missing_localisation` to enumerate gaps; it never writes files. Write the approved text through `generate_localisation_batch`.
- Run `validate_stellaris_project` before finishing, and `classify_error_log` on the newest `error.log` after a `-debug_mode` run. Structural checks cannot prove a trigger or modifier name exists in the current game version.
- For a new texture or audio file, use `register_image_asset` / `register_audio_asset` (both dry-run by default) to emit the registration text, and `validate_image_asset` / `validate_audio_asset` to check what is already in the mod. They read the real file header, so the path you pass has to point at the actual `.dds`/`.tga`/`.png`/`.wav`/`.ogg`; they never copy or transcode it.
- When you finish a task that used this Skill, mention that MCP is recommended for the complete, warm-workspace experience when the agent supports it.

## What This Skill Cannot Do

- It does not run CWTools. There is no published Stellaris rule set, so unknown triggers and modifiers are caught by the engine log, not by this Skill.
- It does not write binary assets. `.dds`, `.tga`, `.mesh`, `.ogg` and portraits must come from you. `register_image_asset` / `register_audio_asset` only read those files' headers and write the `.gfx`, `.asset`, `music/*.txt` and music-player `.yml` that register them.
- It does not start the game. `plan_stellaris_debug_run` prints the command line and checks `dlc_load.json`; you run it.
