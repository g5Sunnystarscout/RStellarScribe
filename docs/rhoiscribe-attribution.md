<div align="center">

<h3><strong>Based on RHoiScribe</strong></h3>

This project is a Stellaris port of **RHoiScribe**, a local MCP server and SKILL for
Hearts of Iron IV modding agents, by
[czxieddan](https://github.com/czxieddan/RHoiScribe).

RHoiScribe established the architecture this project follows: a bundled, versioned
knowledge catalogue exposed as MCP resources, task prompts that state the workflow rules,
generators that return a reviewable file plan before writing anything, and validators that
target the failure modes the engine refuses to report.

</div>

## What was reused

| Area | Reused from RHoiScribe |
| :--- | :--- |
| Knowledge topic schema | The `id` / `title` / `category` / `file_types` / `tags` / `body` / `syntax_blocks` / `relationships` / `validation` / `source_refs` field set, in TOML, grouped by category. |
| Resource URIs | `…://<game>/latest-update`, `…://<game>/knowledge/catalog`, `…://<game>/knowledge/<topic_id>`, with the catalogue emitted as TOML. |
| Tool conventions | `dry_run` defaulting to true, `output_root` required in write mode, mod-root-relative paths, the `{dry_run, files[{path, encoding, summary}], messages}` result shape, and a hard whitelist of writable roots. |
| Search semantics | Whitespace-split query where every term must match the topic haystack. |
| Encoding rule | UTF-8 with BOM for localisation, plain UTF-8 for script. |
| SKILL package | The `--skill list-tools` / `list-resources` / `list-prompts` / `read-resource` / `get-prompt` / `call-tool` command surface. |
| Prompt set | The planner / script writer / localisation writer / GUI assistant / reviewer split, and the requirement to read bundled knowledge before writing. |

## What was rewritten, and why

RHoiScribe is a Rust binary built on the CWTools Rust crates for HOI4-specific validation,
and on the author's own `rnmdb` / `rchadow` crates. Those dependencies have no Stellaris
equivalent, and no public Stellaris rule set exists to replace them. RStellarisScribe
therefore reimplements the same surface in dependency-free Node.js:

- **Validation** is what the files themselves prove: encoding, filename rules, language
  headers, bracket balance, duplicate definition keys, vanilla overrides, and localisation
  coverage. Where RHoiScribe can say "this trigger does not exist", this port says "the
  engine log is the only authority" and helps you read it.
- **No CWT language service.** The ten CWT-backed tools (`open_hoi4_language_workspace`,
  `validate_hoi4_file`, `explain_hoi4_diagnostic`, the symbol and completion tools, and so
  on) are replaced by native equivalents; `docs/porting-notes.zh-CN.md` maps every one.
- **State** is an append-only JSONL tool log instead of an RNMDB page store. The
  query / export / inspect tools keep the same names, limits and result shapes.
- **No process launching.** RHoiScribe launches HOI4 through Rchadow;
  `plan_stellaris_debug_run` prints the command line instead.
- **No binary asset generation.** `generate_gui_gfx_asset` is not ported.

## Licence and attribution

Both projects are licensed **AGPL-3.0-or-later**. The full text is in
[LICENSE](../LICENSE). RHoiScribe's copyright notice and licence header are preserved in
spirit by this notice and by the header of every source file in this project.

RHoiScribe: <https://github.com/czxieddan/RHoiScribe>
