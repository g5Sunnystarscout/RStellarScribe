//------------------------------------------------------------------------------------
// prompts.mjs -- Part of RStellarScribe
//
// The bundled prompt templates. They mirror RHoiScribe's prompt set, retargeted
// at Stellaris file types and at the failure modes Stellaris actually has. Each
// prompt is self-contained: an agent that reads only the prompt still knows which
// knowledge resources to read, that generation must start as a dry run, and which
// localisation and encoding rules are not negotiable.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//------------------------------------------------------------------------------------

const KNOWLEDGE_URI = 'rstellariscribe://stellaris/knowledge';
const CATALOG_URI = 'rstellariscribe://stellaris/knowledge/catalog';

const SHARED_RULES = `## Non-negotiable Stellaris rules

1. Read before writing. Fetch ${CATALOG_URI} and every relevant ${KNOWLEDGE_URI}/<topic_id> resource before you plan or edit. Do not rely on memory or on the wiki you half remember; if a topic is missing, say so instead of guessing a field name.
2. Script files are UTF-8 **without** BOM and indent with tabs. Localisation files are UTF-8 **with** BOM, are named \`<name>_l_<language>.yml\`, and their first line is \`l_<language>:\`. A localisation file that breaks any of those three rules is silently ignored by the game.
3. Never override a vanilla file. Vanilla files start with \`00_\`; give every generated file a mod-specific prefix so both files load.
4. Dry run first. Every generation tool defaults to \`dry_run = true\`; inspect the returned file plan, then repeat with \`dry_run = false\` **and** an explicit absolute \`output_root\`. Paths are always mod-root-relative.
5. Keep implementation helpers hidden from players (\`hidden_effect\`, \`hidden_trigger\`) and never ship placeholder, design-note or TODO text as player-facing localisation. Player-facing prose must read as finished prose; if the project already contains narrative prose, match its voice.
6. Verify what can be verified locally: \`validate_stellaris_paths\`, \`validate_stellaris_project\`, \`validate_stellaris_localisation\`, and \`classify_error_log\` after a test run in \`-debug_mode\`. Report the exact files you wrote at the end.`;

const NO_INVENTION = `## Honesty requirement

If a field, trigger, effect or file path is not confirmed by a knowledge resource or by the user's own files, do not invent it. Write it down as an open question for the user and continue with the parts you can prove. A confidently wrong field name costs the user a broken mod and an evening of log reading.`;

export const PROMPTS = [
  {
    name: 'stellaris_mod_planner',
    title: 'Plan a Stellaris mod feature',
    description:
      'Plan a Stellaris mod feature (civic, origin, technology, tradition, event chain, megastructure) against the bundled knowledge base before any file is written.',
    arguments: [
      { name: 'request', description: 'What the user wants to build.', required: true },
      { name: 'mod_root', description: 'Absolute path of the target mod root, if it exists.', required: false },
      { name: 'game_version', description: 'Target Stellaris version, for example 4.0.', required: false },
    ],
    build: (args) => ({
      description: 'Plan a Stellaris mod feature',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `You are planning a Stellaris mod feature. Produce a plan only; write no files yet.

## Request
${args.request ?? '(missing: describe the feature)'}

${args.mod_root ? `## Target mod root\n${args.mod_root}\n` : ''}${args.game_version ? `## Target game version\n${args.game_version}\n` : ''}
## What the plan must contain

1. **Files to create**, as mod-root-relative paths, each with the definition(s) it holds and a mod-specific prefix. Say explicitly which vanilla file, if any, the file sits beside.
2. **Localisation keys** the feature needs, listed per language you will ship, with the language header each file will carry.
3. **Version sensitivity.** State whether the feature touches systems that changed in 4.0 (pops, jobs, districts, buildings, traditions, ascension perks) and which writing you will use.
4. **Open questions** where the bundled knowledge does not confirm a field or a hook.
5. **Verification steps** the user can run afterwards, including the console commands and the log files to read.

Prefer a small, loadable first slice over an ambitious feature that cannot be tested.

${SHARED_RULES}

${NO_INVENTION}`,
          },
        },
      ],
    }),
  },
  {
    name: 'stellaris_script_writer',
    title: 'Write Stellaris script',
    description:
      'Write Stellaris script for a named subsystem (common/ definitions, events, decisions, technologies, civics, traditions) with correct scopes, triggers and effects.',
    arguments: [
      { name: 'request', description: 'What script to write.', required: true },
      { name: 'scope', description: 'Target scope, for example country, planet or fleet.', required: false },
      { name: 'file_type', description: 'Target subsystem, for example common/technology or events.', required: false },
    ],
    build: (args) => ({
      description: 'Write Stellaris script',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Write Stellaris script for the request below.

## Request
${args.request ?? '(missing: describe the script)'}

${args.file_type ? `## Target subsystem\n${args.file_type}\n` : ''}${args.scope ? `## Target scope\n${args.scope}\n` : ''}
## Method

1. Read ${KNOWLEDGE_URI}/script-basics, plus the topic for the subsystem you are writing and ${KNOWLEDGE_URI}/scopes, ${KNOWLEDGE_URI}/triggers and ${KNOWLEDGE_URI}/effects.
2. Confirm the scope every trigger and effect you use actually supports. Where a scope is unconfirmed, restructure the script to use one you can prove or ask the user.
3. Use \`format_paradox_script\` to normalise what you wrote, and \`validate_stellaris_project\` on the written file to catch bracket and localisation problems.
4. Every definition key you introduce needs localisation. Note the keys you therefore owe, and either generate them with \`generate_localisation_batch\` or hand them to the user.
5. Do not touch files other than the ones the feature needs. Do not reformat existing files you were not asked to change.

${SHARED_RULES}

${NO_INVENTION}`,
          },
        },
      ],
    }),
  },
  {
    name: 'stellaris_localisation_writer',
    title: 'Write Stellaris localisation',
    description:
      'Write Stellaris localisation files with the required BOM, filename suffix and language header, in finished player-facing prose.',
    arguments: [
      { name: 'request', description: 'What text to write, or which keys to fill.', required: true },
      { name: 'language', description: 'Target language, for example english or simp_chinese.', required: false },
      { name: 'keys', description: 'Newline- or comma-separated keys that must be defined.', required: false },
    ],
    build: (args) => ({
      description: 'Write Stellaris localisation',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Write Stellaris localisation for the request below.

## Request
${args.request ?? '(missing: describe the text)'}

${args.language ? `## Language\n${args.language}\n` : '## Language\nAsk the user, or default to english.\n'}${args.keys ? `## Keys that must exist\n${args.keys}\n` : ''}
## Method

1. Read ${KNOWLEDGE_URI}/localisation-basics, ${KNOWLEDGE_URI}/localisation-codes and ${KNOWLEDGE_URI}/localisation-style.
2. Recall that Stellaris has **no fallback language**: keys missing in a language display as raw keys. Ship a file per language the mod already supports, or say clearly which languages are covered.
3. Prefer \`generate_localisation_batch\`, which writes UTF-8 with BOM and the correct header; if you write files by hand, \`validate_stellaris_localisation\` must pass afterwards.
4. Use \`$KEY$ references\`, \`£resource£\` icon codes and \`[Root.GetName]\` bracket commands where they make the text better, and check every code is balanced.
5. Follow the style guide: event names Title Case, event descriptions and options Sentence case with terminal punctuation, no placeholder wording, no design notes.

${SHARED_RULES}

${NO_INVENTION}`,
          },
        },
      ],
    }),
  },
  {
    name: 'stellaris_gui_assistant',
    title: 'Work on Stellaris interface, GFX and icons',
    description:
      'Work on Stellaris .gui, .gfx, sprite, flag, icon and event picture assets with correct paths and sprite names.',
    arguments: [
      { name: 'request', description: 'What interface or asset work is needed.', required: true },
      { name: 'target', description: 'One of gui, gfx, flags, icons or portraits.', required: false },
    ],
    build: (args) => ({
      description: 'Work on Stellaris interface and assets',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Work on Stellaris interface and asset files.

## Request
${args.request ?? '(missing: describe the interface or asset work)'}

${args.target ? `## Target\n${args.target}\n` : ''}
## Method

1. Read ${KNOWLEDGE_URI}/gui-files, ${KNOWLEDGE_URI}/gfx-interface and ${KNOWLEDGE_URI}/flags-icons-ports.
2. Sprite names are \`GFX_\`-prefixed in \`.gfx\` files; text icons are referenced in localisation without the prefix, as \`£name£\`. Confirm the prefix rule for the asset type you are touching.
3. State the exact file names, dimensions, formats and folder paths the user must supply for binary assets; you cannot generate \`.dds\`, \`.tga\` or \`.mesh\` content, so say what is missing rather than referencing a file that does not exist.
4. Modifying vanilla \`.gui\` files requires a deliberate override decision. Explain the compatibility cost before proposing it.

${SHARED_RULES}

${NO_INVENTION}`,
          },
        },
      ],
    }),
  },
  {
    name: 'stellaris_review',
    title: 'Review generated Stellaris content',
    description:
      'Review Stellaris content for silent loading failures: encoding, localisation coverage, scope misuse, overrides and placeholder text.',
    arguments: [
      { name: 'request', description: 'What to review, and why.', required: true },
      { name: 'changed_paths', description: 'Newline- or comma-separated mod-relative paths that changed.', required: false },
    ],
    build: (args) => ({
      description: 'Review generated Stellaris content',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Review the Stellaris content described below. Report findings; change nothing unless the user asks.

## Request
${args.request ?? '(missing: describe what to review)'}

${args.changed_paths ? `## Changed paths\n${args.changed_paths}\n` : ''}
## Checklist

1. **Encoding and naming.** Localisation with BOM, \`_l_<language>.yml\` suffix and matching header; script files without BOM.
2. **Localisation coverage.** Every definition key and every event \`title\`/\`desc\`/\`name\` has a key in each shipped language. Run \`generate_missing_localisation\` to enumerate gaps instead of eyeballing them.
3. **Overrides.** Any file that shadows a vanilla \`00_\` file, or any \`replace_path\`, is called out with its blast radius.
4. **Scope and structure.** Bracket balance, trigger and effect scope compatibility, and whether a \`potential\`/\`allow\`/\`trigger\` block is in the right place for the file type.
5. **Silent failures.** Duplicate identifiers (\`scan_unique_identifiers\`), unbalanced \`£\` icon codes, invalid punctuation in localisation values, missing \`.gfx\` definitions for referenced sprites.
6. **Voice.** Flag any placeholder, TODO or design-note text that would reach a player.

Order findings by how expensive they are to discover later, and give the exact file and line.

${SHARED_RULES}`,
          },
        },
      ],
    }),
  },
];

export function listPrompts() {
  return PROMPTS.map((prompt) => ({
    name: prompt.name,
    title: prompt.title,
    description: prompt.description,
    arguments: prompt.arguments,
  }));
}

export function getPrompt(name, args = {}) {
  const prompt = PROMPTS.find((candidate) => candidate.name === name);
  if (!prompt) {
    throw new Error(`unknown prompt \`${name}\`; available: ${PROMPTS.map((p) => p.name).join(', ')}`);
  }
  return prompt.build(args);
}
