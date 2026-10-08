#!/usr/bin/env node
//------------------------------------------------------------------------------------
// index.mjs -- Part of RStellarScribe
//
// Entry point. Three modes, matching RHoiScribe's shape:
//
//   (default)                 run the MCP server over stdio
//   --skill <subcommand> ...  run one command and return JSON, for Skill packages
//   --print-client-config     print the MCP client configuration for this checkout
//
// RStellarScribe is a Stellaris port of RHoiScribe
// (https://github.com/czxieddan/RHoiScribe, AGPL-3.0-or-later).
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//------------------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { KnowledgeCatalog } from './lib/knowledge.mjs';
import { collectJsonOperand } from './lib/cli-args.mjs';
import { createHandler, runStdio } from './lib/mcp.mjs';
import { createResourceRegistry } from './lib/resources.mjs';
import { getPrompt, listPrompts } from './lib/prompts.mjs';
import { ToolLog } from './lib/tool-log.mjs';
import { createToolRegistry } from './tools/index.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));

const INSTRUCTIONS = `RStellarScribe gives Stellaris modding agents a local reference layer and tools that write game-readable files.

Workflow for file-changing work:
1. Read ${'rstellariscribe://stellaris/knowledge/catalog'}, then the relevant rstellariscribe://stellaris/knowledge/<topic_id> resources. The knowledge base is the authority on field names; the topics record the Stellaris version they were verified against.
2. open_stellaris_workspace on the mod root so validators can resolve the files and localisation keys that already exist.
3. Every generator defaults to dry_run = true. Inspect the returned file plan, then repeat with dry_run = false and an explicit absolute output_root. Paths are mod-root-relative and confined to what Stellaris actually reads.
4. Localisation must be UTF-8 with BOM, named <name>_l_<language>.yml, with an l_<language>: first line; script files must be UTF-8 without BOM. validate_stellaris_localisation proves the first three rules when you write files by hand.
5. Run validate_stellaris_project before finishing, and classify_error_log on the newest error.log after a -debug_mode run. Structural checks cannot prove a trigger or modifier name exists in the current game version; the engine log can.
6. A new texture or audio file is registered with register_image_asset / register_audio_asset, which read the real file header and write the .gfx, .asset, music song list and music-player localisation. They never copy or transcode the binary: put it at the path they report first, and read the returned author_todo for what still has to reference it.`;

async function buildContext() {
  const knowledge = await KnowledgeCatalog.load({ projectRoot });
  const toolLog = new ToolLog();
  const serverInfo = { name: 'rstellariscribe', version: packageJson.version };
  const context = {
    projectRoot,
    knowledge,
    toolLog,
    workspaces: new Map(),
    serverInfo,
  };
  const registry = {
    serverInfo,
    instructions: INSTRUCTIONS,
    prompts: { list: listPrompts, get: getPrompt },
    resources: createResourceRegistry({ knowledge, projectRoot }),
    tools: createToolRegistry(context),
  };
  return { context, registry };
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(usage());
    return;
  }
  if (argv.includes('--version') || argv.includes('-v')) {
    process.stdout.write(`${packageJson.name} ${packageJson.version}\n`);
    return;
  }

  const { registry } = await buildContext();

  if (argv.includes('--print-client-config')) {
    process.stdout.write(
      JSON.stringify(
        {
          mcpServers: {
            rstellariscribe: {
              command: process.execPath,
              args: [join(projectRoot, 'src', 'index.mjs')],
              env: {},
            },
          },
        },
        null,
        2,
      ) + '\n',
    );
    return;
  }

  const skillIndex = argv.indexOf('--skill');
  if (skillIndex !== -1) {
    const rest = argv.slice(skillIndex + 1);
    const code = await runSkill(rest, registry);
    process.exitCode = code;
    return;
  }

  await runStdio(createHandler(registry));
}

async function runSkill(rest, registry) {
  const [subcommand, ...operands] = rest;
  try {
    switch (subcommand) {
      case 'list-tools':
        write(registry.tools.list());
        return 0;
      case 'list-resources':
        write(registry.resources.list().map((resource) => ({
          uri: resource.uri,
          name: resource.name,
          title: resource.title,
          mimeType: resource.mimeType,
        })));
        return 0;
      case 'list-prompts':
        write(registry.prompts.list());
        return 0;
      case 'read-resource': {
        requireOperand(operands[0], 'read-resource requires a uri');
        write(registry.resources.read(operands[0]));
        return 0;
      }
      case 'get-prompt': {
        requireOperand(operands[0], 'get-prompt requires a prompt name');
        const args = await collectJsonOperand(operands.slice(1));
        write(registry.prompts.get(operands[0], args));
        return 0;
      }
      case 'call-tool': {
        requireOperand(operands[0], 'call-tool requires a tool name');
        const args = await collectJsonOperand(operands.slice(1));
        write(await registry.tools.call(operands[0], args));
        return 0;
      }
      default:
        process.stderr.write(
          `unknown --skill subcommand \`${subcommand ?? ''}\`\n\n${usage()}`,
        );
        return 2;
    }
  } catch (thrown) {
    process.stderr.write(`${thrown instanceof Error ? thrown.message : String(thrown)}\n`);
    return 1;
  }
}

function requireOperand(value, message) {
  if (typeof value !== 'string' || value === '') throw new Error(message);
}

function write(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

function usage() {
  return `${packageJson.name} ${packageJson.version} - local MCP server and SKILL for Stellaris modding agents

Usage
  node src/index.mjs                        Run the MCP server over stdio.
  node src/index.mjs --skill <command> ...   Run one command and print JSON.
  node src/index.mjs --print-client-config   Print MCP client configuration for this checkout.
  node src/index.mjs --help | --version

Skill commands
  list-tools
  list-resources
  list-prompts
  read-resource <uri>
  get-prompt <name> [json-arguments|--json-file <path>|-]
  call-tool <name> [json-arguments|--json-file <path>|-]

Argument passing
  Windows PowerShell 5.1 rewrites the double quotes in a native-command argument, so inline
  JSON has to be escaped there. Use --json-file or `-` (stdin) when in doubt; both work in
  every shell.

Examples
  node src/index.mjs --skill list-resources
  node src/index.mjs --skill read-resource "rstellariscribe://stellaris/knowledge/events"
  node src/index.mjs --skill call-tool search_stellaris_knowledge --json-file args.json
  echo {"query":"on_actions random_events"} | node src/index.mjs --skill call-tool search_stellaris_knowledge -
  node src/index.mjs --skill get-prompt stellaris_mod_planner --json-file planner.json

  # PowerShell 5.1, inline (single quotes, backslash-escaped inner quotes):
  node src/index.mjs --skill call-tool search_stellaris_knowledge '{\"query\":\"localisation bom\"}'
`;
}

main().catch((thrown) => {
  process.stderr.write(`rstellariscribe failed: ${thrown instanceof Error ? thrown.stack : thrown}\n`);
  process.exitCode = 1;
});
