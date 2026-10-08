//------------------------------------------------------------------------------------
// tools/index.mjs -- Part of RStellarScribe
//
// The tool registry. RHoiScribe registers 36 tools and declares JSON input schemas
// for only 7 of them; every tool here declares a full schema, because an agent that
// cannot see a parameter guesses it. The tool *names* follow RHoiScribe's
// `verb_subject` convention with `stellaris` as the subject.
//
// Mapping against RHoiScribe's CWT-backed language service, which has no Stellaris
// equivalent:
//
//   open_hoi4_language_workspace / get_hoi4_language_status
//      -> open_stellaris_workspace / get_stellaris_workspace_status  (native index)
//   validate_hoi4_file / validate_hoi4_project
//      -> validate_stellaris_file / validate_stellaris_project       (native checks)
//   explain_hoi4_diagnostic                     -> explain_stellaris_diagnostic
//   inspect_hoi4_scope / inspect_hoi4_type_rule -> covered by the `scopes` knowledge topic
//   generate_gui_gfx_asset                      -> register_image_asset / validate_image_asset
//                                                  and register_audio_asset / validate_audio_asset
//                                                  (registration only: they read the real texture or
//                                                  audio header and write the .gfx / .asset / song /
//                                                  localisation text; they still emit no binary)
//   launch_hoi4_debug_with_rchadow              -> plan_stellaris_debug_run (plans only) and
//                                                  run_stellaris_debug_session (the whole
//                                                  launch -> watch log -> stop loop)
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//------------------------------------------------------------------------------------

import {
  classifyErrorLog,
  editStellarisScriptFile,
  explainStellarisDiagnostic,
  formatParadoxScript,
  generateMissingLocalisation,
  scanUniqueIdentifiers,
  validateStellarisFile,
  validateStellarisLocalisation,
  validateStellarisPaths,
  validateStellarisProject,
} from './validators.mjs';
import { validateStellarisScriptSignatures } from './signature-checks.mjs';
import { validateStellarisInterface } from './interface-checks.mjs';
import {
  registerAudioAsset,
  registerImageAsset,
  validateAudioAsset,
  validateImageAsset,
} from './assets.mjs';
import {
  generateButtonEffectBatch,
  generateScriptedActionBatch,
  generateSectionTemplateBatch,
  generateStarbaseBuildingBatch,
} from './generators-systems.mjs';
import {
  generatePlanetClassBatch,
  generateSolarSystemInitializerBatch,
} from './generators-galaxy.mjs';
import {
  generateCivicBatch,
  generateDecisionBatch,
  generateEventBatch,
  generateLocalisationBatch,
  generateStellarisModDescriptor,
  generateTechnologyBatch,
  generateTraditionBatch,
  setupStellarisModSkeleton,
} from './generators.mjs';
import {
  generateEventChainBatch,
  generateNameListBatch,
  generatePrescriptedEmpire,
  generateShipSizeBatch,
  generateSituationBatch,
  generateSpeciesClassBatch,
  generateTraditionTree,
} from './generators-content.mjs';
import {
  discoverStellarisEnvironment,
  planStellarisDebugRun,
  runStellarisDebugSession,
  validateStellarisDebugRun,
  waitForStellarisLogSettle,
} from './environment.mjs';
import {
  exportToolLogs,
  getStellarisWorkspaceStatus,
  inspectRststellariscribeState,
  openStellarisWorkspace,
  queryToolLogs,
  searchStellarisKnowledge,
} from './state.mjs';
import { LOCALISATION_LANGUAGES } from '../lib/paths.mjs';
import { GFX_KINDS } from '../lib/gfx-kinds.mjs';
import { IMAGE_USE_NAMES } from '../lib/image-assets.mjs';
import { SOUND_CATEGORIES } from '../lib/audio-assets.mjs';
const string = (description) => ({ type: 'string', description });const boolean = (description) => ({ type: 'boolean', description });
const number = (description) => ({ type: 'number', description });
const integer = (description, minimum, maximum) => ({
  type: 'integer',
  description,
  ...(minimum !== undefined ? { minimum } : {}),
  ...(maximum !== undefined ? { maximum } : {}),
});
const array = (description, items) => ({ type: 'array', description, items });
const strings = (description) => array(description, { type: 'string' });
const language = (description) => ({
  type: 'string',
  description: `${description} One of: ${LOCALISATION_LANGUAGES.join(', ')}.`,
  enum: LOCALISATION_LANGUAGES,
});
const object = (description) => ({ type: 'object', description, additionalProperties: true });
const objectArray = (description) => array(description, { type: 'object', additionalProperties: true });

const DRY_RUN = {
  dry_run: boolean('Defaults to true. A dry run returns the full file plan and writes nothing.'),
  output_root: string(
    'Absolute path of the target mod root. Required when dry_run is false; ignored on a dry run. Paths in the plan are always mod-root-relative.',
  ),
};

export const TOOL_SPECS = [
  // ------------------------------------------------------------------ knowledge
  {
    name: 'search_stellaris_knowledge',
    description:
      'Search the bundled Stellaris modding knowledge base. Every whitespace-separated term must match, so prefer a few specific terms. Returns topic ids and MCP resource URIs to read in full before writing any script.',
    inputSchema: {
      type: 'object',
      properties: {
        query: string('Search terms, for example "on_actions random_events" or "localisation bom".'),
        limit: integer('Maximum topics to return (1-20, default 8).', 1, 20),
      },
      required: ['query'],
    },
    handler: searchStellarisKnowledge,
  },

  // ------------------------------------------------------------------ workspace
  {
    name: 'open_stellaris_workspace',
    description:
      'Scan a Stellaris mod root and cache the index in this server process: descriptor metadata, file inventory, definition keys per subsystem, and the localisation keys that exist. Call this before file-changing work.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_root: string('Absolute path of the mod root (the folder that contains descriptor.mod).'),
        mode: { type: 'string', description: 'Scan depth.', enum: ['mod_root', 'single_file'], default: 'mod_root' },
      },
      required: ['workspace_root'],
    },
    handler: openStellarisWorkspace,
  },
  {
    name: 'get_stellaris_workspace_status',
    description: 'Report the workspaces currently cached in this server process and their scan statistics.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_root: string('Optional: restrict the report to one workspace.'),
      },
    },
    handler: getStellarisWorkspaceStatus,
  },
  {
    name: 'inspect_rststellariscribe_state',
    description:
      'Report server identity, knowledge-base statistics, tool-log statistics and open workspaces. Use it to confirm which knowledge build and which workspace this process is serving.',
    inputSchema: { type: 'object', properties: {} },
    handler: inspectRststellariscribeState,
  },
  {
    name: 'query_tool_logs',
    description:
      'Query this server\'s tool call log (append-only JSONL). Every call except the log readers is recorded with its arguments, outcome and duration.',
    inputSchema: {
      type: 'object',
      properties: {
        tool: string('Optional: only entries for this tool name.'),
        ok: boolean('Optional: only successful (true) or failed (false) calls.'),
        since: string('Optional ISO timestamp; only entries at or after it.'),
        limit: integer('Maximum entries (1-32767, default 100). Newest last.', 1, 32767),
      },
    },
    handler: queryToolLogs,
  },
  {
    name: 'export_tool_logs',
    description: 'Write the tool log to a file for sharing or archiving.',
    inputSchema: {
      type: 'object',
      properties: {
        path: string('Absolute path of the file to write.'),
        limit: integer('Maximum entries to export (1-32767, default all).', 1, 32767),
      },
      required: ['path'],
    },
    handler: exportToolLogs,
  },

  // ------------------------------------------------------------------ validation
  {
    name: 'validate_stellaris_paths',
    description:
      'Check mod-root-relative paths before writing: rejections for absolute paths, drive letters, `..` traversal and reserved device names; warnings for folders Stellaris does not read and for localisation filenames that will be ignored.',
    inputSchema: {
      type: 'object',
      properties: {
        paths: strings('Mod-root-relative paths to check.'),
        workspace_root: string('Optional: also report whether each path already exists in this mod.'),
      },
      required: ['paths'],
    },
    handler: validateStellarisPaths,
  },
  {
    name: 'validate_stellaris_localisation',
    description:
      'Check localisation the way the game does: UTF-8 with BOM, `<name>_l_<language>.yml` filename, matching `l_<language>:` first line, indented entries, balanced `£` icon codes, invalid punctuation, duplicate keys, and per-language coverage gaps.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_root: string('Check every .yml under this mod root (whole-mod mode).'),
        path: string('Check a single localisation file instead (single-file mode).'),
      },
    },
    handler: validateStellarisLocalisation,
  },
  {
    name: 'validate_stellaris_file',
    description:
      'Check one file: bracket balance, BOM rules for its type, definition keys it introduces, localisation keys it references, and which of those keys no localisation file defines.',
    inputSchema: {
      type: 'object',
      properties: {
        path: string('Mod-root-relative path of the file.'),
        content: string('Optional: check this text instead of reading the file from disk.'),
        workspace_root: string('Mod root, so the file can be read and its localisation keys resolved.'),
        game_root: string(
          'Optional Stellaris install folder. When given, localisation keys the base game already defines are reported separately instead of as missing.',
        ),
      },
      required: ['path'],
    },
    handler: validateStellarisFile,
  },
  {
    name: 'validate_stellaris_project',
    description:
      'Whole-mod structural review: descriptor fields, vanilla `00_` overrides, duplicate definition keys, bracket balance across every script file, localisation encoding and coverage, and definition keys with no localisation entry. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_root: string('Absolute path of the mod root.'),
        game_root: string(
          'Optional Stellaris install folder. When given, definition keys that reuse vanilla text are reported separately from keys that no localisation defines.',
        ),
      },
      required: ['workspace_root'],
    },
    handler: validateStellarisProject,
  },
  {
    name: 'generate_missing_localisation',
    description:
      'List the localisation keys the mod needs but does not define, with suggested placeholder values. This tool NEVER writes files: review the candidates, replace the placeholders with finished prose, then write them through generate_localisation_batch.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_root: string('Absolute path of the mod root.'),
        language: language('Language the report is for.'),
        limit: integer('Maximum candidates (1-1000, default 200).', 1, 1000),
      },
      required: ['workspace_root'],
    },
    handler: generateMissingLocalisation,
  },
  {
    name: 'scan_unique_identifiers',
    description:
      'Check identifier availability: with intent "create" a key that is already defined is a duplicate; with intent "edit" a missing key is reported. Also reports definition-key collisions across the whole mod.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_root: string('Absolute path of the mod root.'),
        intent: {
          type: 'string',
          description: 'What you intend to do with the identifiers.',
          enum: ['create', 'edit', 'check'],
          default: 'check',
        },
        identifiers: objectArray(
          'Optional: the identifiers to check, as {key, kind?} objects or plain strings. Omit to scan everything the mod defines.',
        ),
      },
      required: ['workspace_root'],
    },
    handler: scanUniqueIdentifiers,
  },
  {
    name: 'classify_error_log',
    description:
      'Bucket the error lines of a Stellaris log by subsystem (localisation, interface, event, decision, technology, civic, jobs, ships, map, script syntax) and relate them to the paths you changed. Use it after a -debug_mode run.',
    inputSchema: {
      type: 'object',
      properties: {
        error_log_path: string('Absolute path of error.log, usually under Documents/Paradox Interactive/Stellaris/logs.'),
        changed_paths: strings('Mod-relative paths you changed, so the report can attribute errors.'),
        limit: integer('Examples per category (1-20, default 5).', 1, 20),
      },
      required: ['error_log_path'],
    },
    handler: classifyErrorLog,
  },
  {
    name: 'explain_stellaris_diagnostic',
    description:
      'Explain a log line by classifying it and looking up the matching knowledge topics, instead of guessing from the wording. Accepts the message directly, or a log path and line number.',
    inputSchema: {
      type: 'object',
      properties: {
        message: string('The log line to explain.'),
        error_log_path: string('Alternative: read the line from this log file.'),
        line: integer('1-based line number to read from error_log_path. Defaults to the last non-empty line.', 1),
      },
    },
    handler: explainStellarisDiagnostic,
  },
  {
    name: 'format_paradox_script',
    description:
      'Rewrite a Paradox script fragment in canonical form: one assignment per line, one tab per nesting level, normalised `key = value` spacing, comments preserved. Also reports bracket problems.',
    inputSchema: {
      type: 'object',
      properties: {
        script: string('The script text to format.'),
        indent: { type: 'string', description: 'Indent style.', enum: ['tabs', 'spaces'], default: 'tabs' },
      },
      required: ['script'],
    },
    handler: formatParadoxScript,
  },
  {
    name: 'edit_stellaris_script_file',
    description:
      'Replace an exact string inside one existing script file, with a dry run by default. Refuses the edit if the match is ambiguous or if it would introduce new bracket errors.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_root: string('Absolute path of the mod root.'),
        path: string('Mod-root-relative path of an existing file.'),
        find: string('Exact text to replace.'),
        replace: string('Replacement text.'),
        expected_replacements: integer('Optional guard: fail unless `find` occurs exactly this many times.', 1),
        dry_run: boolean('Defaults to true.'),
      },
      required: ['workspace_root', 'path', 'find'],
    },
    handler: editStellarisScriptFile,
  },

  // ------------------------------------------------------------------ generation
  {
    name: 'setup_stellaris_mod_skeleton',
    description:
      'Create a loadable Stellaris mod skeleton: descriptor.mod, an event namespace with one triggered event and its localisation, plus scripted effect, trigger, variable and on_action starter files. Also returns the launcher .mod content for the Documents mod folder.',
    inputSchema: {
      type: 'object',
      properties: {
        mod_name: string('Display name of the mod.'),
        folder_name: string('Folder name; also the default key prefix. Defaults to a slug of mod_name.'),
        prefix: string('Key prefix for generated identifiers, lowercase ASCII. Defaults to folder_name.'),
        supported_version: string('descriptor supported_version, for example "v4.1.*". Defaults to "v4.1.*", the version this build was verified against.'),
        language: language('Localisation language to create. Defaults to english.'),
        tags: strings('descriptor tags. Defaults to ["Gameplay"].'),
        ...DRY_RUN,
      },
      required: ['mod_name'],
    },
    handler: setupStellarisModSkeleton,
  },
  {
    name: 'generate_stellaris_mod_descriptor',
    description:
      'Write descriptor.mod, and return the launcher .mod content to place in Documents/Paradox Interactive/Stellaris/mod. Warns when replace_path or a stray path field would change what the game loads.',
    inputSchema: {
      type: 'object',
      properties: {
        mod_name: string('Display name of the mod.'),
        version: string('descriptor version field. Defaults to "0.1".'),
        supported_version: string('For example "v4.1.*". Defaults to "v4.1.*".'),
        tags: strings('descriptor tags. Defaults to ["Gameplay"].'),
        dependencies: strings('Names of mods that must load before this one.'),
        replace_path: strings('Vanilla folders this mod replaces entirely. Warned about loudly: it hides every vanilla file in that folder.'),
        ...DRY_RUN,
      },
      required: ['mod_name'],
    },
    handler: generateStellarisModDescriptor,
  },
  {
    name: 'generate_localisation_batch',
    description:
      'Write a Stellaris localisation file as UTF-8 with BOM and the correct `l_<language>:` header. Keys stay ASCII; add `_desc` and `_effects` entries per key.',
    inputSchema: {
      type: 'object',
      properties: {
        language: language('Target language. Defaults to english.'),
        file_stem: string('Mod-relative stem, for example "common/autonomy/CHI" or "mymod_civics". The file is named `<stem>_l_<language>.yml`.'),
        key_prefix: string('Optional prefix applied to every entry id.'),
        entries: array('Entries to write.', {
          type: 'object',
          properties: {
            id: string('Key id, relative to key_prefix.'),
            title: string('Visible text for the key.'),
            description: string('Optional: written as `<key>_desc`.'),
            effects: string('Optional: written as `<key>_effects`.'),
          },
          required: ['id', 'title'],
          additionalProperties: false,
        }),
        include_descriptions: boolean('Write `<key>_desc` entries when a description is given. Defaults to true.'),
        ...DRY_RUN,
      },
      required: ['file_stem', 'entries'],
    },
    handler: generateLocalisationBatch,
  },
  {
    name: 'generate_event_batch',
    description:
      'Write a Stellaris event file plus its localisation. Event keys follow the vanilla convention `<namespace>.<id>.name`, `.desc` and `.a`/`.b`. Trigger, immediate, after and option effects are passed through as validated script bodies.',
    inputSchema: {
      type: 'object',
      properties: {
        namespace: string('Event namespace, lowercase ASCII.'),
        file_name: string('File stem under events/. Defaults to `<namespace>_events`.'),
        language: language('Localisation language. Defaults to english.'),
        generate_localisation: boolean('Also write the matching localisation file. Defaults to true.'),
        events: array('Events to generate.', {
          type: 'object',
          properties: {
            id: integer('Numeric id inside the namespace; defaults to the event position.'),
            title: string('Event title text.'),
            description: string('Event description text.'),
            trigger: string('Script body for `trigger = { ... }`.'),
            immediate: string('Script body for `immediate = { ... }`.'),
            after: string('Script body for `after = { ... }`.'),
            abort_trigger: string('Script body for `abort_trigger = { ... }`.'),
            abort_effect: string('Script body for `abort_effect = { ... }`.'),
            mean_time_to_happen: string('Script body for `mean_time_to_happen = { ... }`. Requires is_triggered_only = false.'),
            weight_multiplier: string('Script body for `weight_multiplier = { ... }`.'),
            is_triggered_only: boolean('Defaults to true, matching generated content. Set false for a pulse event.'),
            hide_window: boolean('Write `hide_window = yes` and skip title/desc localisation.'),
            fire_only_once: boolean('Write `fire_only_once = yes`.'),
            picture: string('Event picture sprite name, for example GFX_evt_...'),
            options: array('Event options. The localisation key defaults to `<id>.<a|b|c>`.', {
              type: 'object',
              properties: {
                text: string('Visible option text.'),
                key: string('Override the localisation key.'),
                trigger: string('Script body for the option `trigger`.'),
                allow: string('Script body for the option `allow`.'),
                ai_chance: string('Script body for the option `ai_chance`.'),
                effect: string('Script body for the option `effect`.'),
                hidden_effect: string('Script body for the option `hidden_effect`.'),
              },
              required: ['text'],
              additionalProperties: false,
            }),
          },
          required: ['title', 'description'],
          additionalProperties: true,
        }),
        ...DRY_RUN,
      },
      required: ['namespace', 'events'],
    },
    handler: generateEventBatch,
  },
  {
    name: 'generate_decision_batch',
    description:
      'Write country or planetary decisions to common/decisions/ plus localisation. Fields follow the schema Stellaris ships in common/decisions/example.txt.',
    inputSchema: {
      type: 'object',
      properties: {
        prefix: string('File and key prefix, lowercase ASCII.'),
        language: language('Localisation language. Defaults to english.'),
        generate_localisation: boolean('Also write localisation. Defaults to true.'),
        decisions: array('Decisions to generate.', {
          type: 'object',
          properties: {
            key: string('Decision key.'),
            title: string('Visible name.'),
            description: string('Visible description.'),
            potential: string('Script body for `potential`. Defaults to `always = yes`.'),
            allow: string('Script body for `allow`.'),
            effect: string('Script body for `effect`. Required.'),
            icon: string('Icon name under gfx/interface/icons/decisions/. Defaults to decision_resources.'),
            sound: string('Sound played when the decision is taken.'),
            owned_planets_only: boolean('Write `owned_planets_only = yes`.'),
            enactment_time: integer('Enactment time in days. Omit for an instant decision.'),
            prerequisites: strings('Technology keys required before the decision shows.'),
            resources: {
              type: 'object',
              description: 'Resource cost block, for example {category: "decisions", cost: {food: 1000}}.',
              additionalProperties: true,
            },
            on_queued: string('Script body for `on_queued`.'),
            on_unqueued: string('Script body for `on_unqueued`.'),
            abort_trigger: string('Script body for `abort_trigger`.'),
            abort_effect: string('Script body for `abort_effect`.'),
            show_tech_unlock_if: string('Script body for `show_tech_unlock_if`.'),
            ai_weight: string('Script body for `ai_weight`. Defaults to `weight = 5`.'),
          },
          required: ['key', 'title', 'description', 'effect'],
          additionalProperties: false,
        }),
        ...DRY_RUN,
      },
      required: ['prefix', 'decisions'],
    },
    handler: generateDecisionBatch,
  },
  {
    name: 'generate_civic_batch',
    description:
      'Write civics and origins to common/governments/civics/ plus localisation, using the field set the shipped origin definitions use.',
    inputSchema: {
      type: 'object',
      properties: {
        prefix: string('File prefix, lowercase ASCII.'),
        language: language('Localisation language. Defaults to english.'),
        generate_localisation: boolean('Also write localisation. Defaults to true.'),
        civics: array('Civics or origins to generate.', {
          type: 'object',
          properties: {
            key: string('Definition key.'),
            title: string('Visible name.'),
            description: string('Visible description.'),
            is_origin: boolean('Write `is_origin = yes`.'),
            icon: string('Texture path, for example "gfx/interface/icons/civics/civic_x.dds". Defaults to a vanilla-looking placeholder path.'),
            playable: string('Script body for `playable`.'),
            possible: string('Script body for `possible`.'),
            potential: string('Script body for `potential`.'),
            modifier: string('Script body for `modifier`.'),
            random_weight: integer('`random_weight = { base = N }`. Defaults to 0, which keeps the civic out of random empire generation.'),
            description_key: string('Override the description localisation key. Defaults to `<key>_desc`.'),
            negative_description: string('Localisation key for the drawback text (42 occurrences in 4.1.7 civics).'),
            max_once_global: boolean('Write `max_once_global = yes`: at most one empire in the galaxy may take this.'),
            effects: string('Optional: written as `<key>_effects`.'),
          },
          required: ['key', 'title', 'description'],
          additionalProperties: false,
        }),
        ...DRY_RUN,
      },
      required: ['prefix', 'civics'],
    },
    handler: generateCivicBatch,
  },
  {
    name: 'generate_technology_batch',
    description:
      'Write technologies to common/technology/ plus localisation. Fields follow common/technology/000_documentation.txt, including the `cost = { factor, modifier }` form, weight and weight_modifier, and technology_swap.',
    inputSchema: {
      type: 'object',
      properties: {
        prefix: string('File prefix, lowercase ASCII.'),
        language: language('Localisation language. Defaults to english.'),
        generate_localisation: boolean('Also write localisation. Defaults to true.'),
        technologies: array('Technologies to generate.', {
          type: 'object',
          properties: {
            key: string('Technology key.'),
            title: string('Visible name.'),
            description: string('Visible description.'),
            area: { type: 'string', description: 'Research area.', enum: ['physics', 'society', 'engineering'] },
            tier: integer('Technology tier (0-5 in vanilla).', 0, 10),
            cost: integer('Fixed cost, or the base factor when cost_modifier is given. Defaults to 1000.'),
            cost_modifier: string('Script body for the cost modifier, which turns cost into `{ factor, modifier }`.'),
            prerequisites: strings('Technology keys that must be researched first.'),
            category: strings('Technology categories, for example archaeostudies.'),
            weight: integer('Base draw weight.'),
            weight_modifier: string('Script body for `weight_modifier`, which uses `factor =`.'),
            potential: string('Script body for `potential`.'),
            modifier: string('Script body for `modifier`, the effect the technology grants.'),
            ai_weight: string('Script body for `ai_weight`.'),
            feature_flags: strings('Feature flags unlocked, for example gateway_activation.'),
            gateway: string('Gateway technology this tech links to.'),
            is_rare: boolean('Write `is_rare = yes`.'),
            is_dangerous: boolean('Write `is_dangerous = yes`.'),
            start_tech: boolean('Write `start_tech = yes`.'),
            levels: integer('Number of levels; use -1 for an endlessly repeatable technology. There is no `is_repeatable` field in 4.1.7.'),
            cost_per_level: integer('Cost added per level, used together with `levels`.'),
            weight_groups: strings('Weight groups this technology belongs to.'),
            mod_weight_if_group_picked: object('Map of weight group to factor, for example {"physics_weapon_1": 0.5}.'),
            technology_swap: object('technology_swap block: {name, inherit_icon, inherit_effects, trigger}.'),
          },
          required: ['key', 'title', 'description'],
          additionalProperties: false,
        }),
        ...DRY_RUN,
      },
      required: ['prefix', 'technologies'],
    },
    handler: generateTechnologyBatch,
  },
  {
    name: 'generate_tradition_batch',
    description:
      'Write traditions to common/traditions/ and ascension perks to common/ascension_perks/, plus localisation. Registering a tradition tree also needs common/tradition_categories/, which this tool does not generate.',
    inputSchema: {
      type: 'object',
      properties: {
        prefix: string('File prefix, lowercase ASCII.'),
        language: language('Localisation language. Defaults to english.'),
        generate_localisation: boolean('Also write localisation. Defaults to true.'),
        traditions: array('Traditions to generate.', {
          type: 'object',
          properties: {
            key: string('Tradition key.'),
            title: string('Visible name.'),
            description: string('Visible description.'),
            modifier: string('Script body for `modifier`. Required.'),
            custom_tooltip: string('Localisation key for a custom tooltip, which suppresses the generated modifier list.'),
            unlocks_agenda: string('Agenda key unlocked by this tradition.'),
            possible: string('Script body for `possible`, which is how traditions are gated. Note: traditions have no `prerequisites` field in 4.1.7.'),
            on_enabled: string('Script body for `on_enabled`.'),
            ai_weight: string('Script body for `ai_weight`. Defaults to `factor = 1000`.'),
          },
          required: ['key', 'title', 'description', 'modifier'],
          additionalProperties: false,
        }),
        ascension_perks: array('Ascension perks to generate.', {
          type: 'object',
          properties: {
            key: string('Ascension perk key.'),
            title: string('Visible name.'),
            description: string('Visible description.'),
            potential: string('Script body for `potential`.'),
            possible: string('Script body for `possible`. Ascension perks have no `prerequisites` field in 4.1.7.'),
            on_enabled: string('Script body for `on_enabled`.'),
            modifier: string('Script body for `modifier`.'),
          },
          required: ['key', 'title', 'description'],
          additionalProperties: false,
        }),
        ...DRY_RUN,
      },
      required: ['prefix'],
    },
    handler: generateTraditionBatch,
  },

  {
    name: 'generate_species_class_batch',
    description:
      'Write a complete new species class - a peer of the vanilla Humanoid/Plantoid/Lithoid entries - which needs three files to be selectable: common/species_classes/, common/portrait_sets/ and common/portrait_categories/. Optionally declares the trait the class grants to every species of that class.',
    inputSchema: {
      type: 'object',
      properties: {
        prefix: string('File prefix, lowercase ASCII.'),
        language: language('Localisation language. Defaults to english.'),
        generate_localisation: boolean('Also write localisation. Defaults to true.'),
        classes: objectArray(
          'Species classes. Each: {key, title, title_plural?, archetype? (default BIOLOGICAL), possible?, graphical_culture? (default arthropoid_01), move_pop_sound_effect?, random_weight? (base value), portraits: [portrait names, required], conditional_portraits?: {trigger, portraits}, trait_key? (reuse an existing trait) OR trait: {key?, title, description, modifier, tags?, allowed_archetypes?, icon?}}. `random_weight` is written as `{ base = N }`; a bare number is not the same field.',
        ),
        ...DRY_RUN,
      },
      required: ['prefix', 'classes'],
    },
    handler: generateSpeciesClassBatch,
  },
  {
    name: 'generate_name_list_batch',
    description:
      'Write common/name_lists/ entries (naming groups) plus their display names. Supports ship_names, fleet_names, army_names, planet_names and character_names with their male/female/regnal variants.',
    inputSchema: {
      type: 'object',
      properties: {
        prefix: string('File prefix, lowercase ASCII.'),
        language: language('Localisation language. Defaults to english.'),
        generate_localisation: boolean('Also write localisation. Defaults to true.'),
        lists: objectArray(
          'Name lists. Each: {key, title, title_plural?, selectable?, randomized?, alias?, trigger?, category?, customize_random_override?, should_name_home_system_planets?, ship_names?: {generic:[], <ship size>:[]}, fleet_names?: {random_names:[], sequential_name?}, army_names?: {generic:{random_names:[], sequential_name?}, <army type>:...}, planet_names?: {generic:[], pc_<class>:[]}, character_names?: [{culture?: "default", full_names?, first_names?, second_names?, full_names_male?, first_names_female?, ... , weight?}]}. The display name is looked up by the lowercased key, so both cases and `_plural` are written.',
        ),
        ...DRY_RUN,
      },
      required: ['prefix', 'lists'],
    },
    handler: generateNameListBatch,
  },
  {
    name: 'generate_prescripted_empire',
    description:
      'Write prescripted_countries entries (a fixed empire design with its own species, flag and ruler) plus localisation. Note this folder sits at the mod root, not under common/.',
    inputSchema: {
      type: 'object',
      properties: {
        prefix: string('File prefix, lowercase ASCII.'),
        language: language('Localisation language. Defaults to english.'),
        generate_localisation: boolean('Also write localisation. Defaults to true.'),
        empires: objectArray(
          'Empires. Each: {key, name, adjective?, spawn_enabled? (yes|no|always), ignore_portrait_duplication?, ship_prefix?, species: {class, portrait, name, plural?, adjective?, name_list?, traits: []}, playable?, room?, authority?, civics: [], government?, ethics: [], origin?, flag?, planet_name?, planet_class?, initializer?, system_name?, graphical_culture?, city_graphical_culture?, empire_flag?: {icon:{category,file}, background:{category,file}, colors:[]}, ruler?: {name, gender?, portrait?, texture?, attachment?, clothes?, trait?, traits?: [], leader_class?}}',
        ),
        ...DRY_RUN,
      },
      required: ['prefix', 'empires'],
    },
    handler: generatePrescriptedEmpire,
  },
  {
    name: 'generate_ship_size_batch',
    description:
      'Write common/ship_sizes/ entries plus localisation, so a new ship class appears in the ship designer and the fleet manager.',
    inputSchema: {
      type: 'object',
      properties: {
        prefix: string('File prefix, lowercase ASCII.'),
        language: language('Localisation language. Defaults to english.'),
        generate_localisation: boolean('Also write localisation. Defaults to true.'),
        ships: objectArray(
          'Ship sizes. Each: {key, title, title_plural?, entity? (default ancient_corvette_entity), max_speed?, rotation_speed?, acceleration?, modifier?, max_hitpoints?, size_multiplier?, map_counter_icon?, icon?, fleet_slot_size?, section_slots: [{slot, locator}] (required), num_target_locators?, class? (default shipclass_military), is_designable?, graphical_culture?, components_add_to_cost?, upgrades_from?, prerequisites?: [], potential?, resources?: {category?, cost?: {<resource>: N}}}. The entity and locators must match a real ship entity; reusing a vanilla pair is how you add a size without new art.',
        ),
        ...DRY_RUN,
      },
      required: ['prefix', 'ships'],
    },
    handler: generateShipSizeBatch,
  },
  {
    name: 'generate_event_chain_batch',
    description:
      'Write common/event_chains/ entries plus localisation. Chains are started from script with begin_event_chain and appear in the situation log.',
    inputSchema: {
      type: 'object',
      properties: {
        prefix: string('File prefix, lowercase ASCII.'),
        language: language('Localisation language. Defaults to english.'),
        generate_localisation: boolean('Also write localisation. Defaults to true.'),
        chains: objectArray(
          'Event chains. Each: {key, title, description, icon? (a .dds path), picture? (a GFX_ sprite), situation_log_category? (default developments), counters?: [{key, max}], abort_trigger?}. Localisation keys are `<key>_title` and `<key>_desc`.',
        ),
        ...DRY_RUN,
      },
      required: ['prefix', 'chains'],
    },
    handler: generateEventChainBatch,
  },
  {
    name: 'generate_situation_batch',
    description:
      'Write common/situations/ entries plus localisation: a progress bar with stages, monthly progress and player approaches.',
    inputSchema: {
      type: 'object',
      properties: {
        prefix: string('File prefix, lowercase ASCII.'),
        language: language('Localisation language. Defaults to english.'),
        generate_localisation: boolean('Also write localisation. Defaults to true.'),
        situations: objectArray(
          'Situations. Each: {key, title, type_title?, description, monthly_change_tooltip, picture?, category? (positive|negative|neutral), situation_log_category?, potential?, modifier?, abort_trigger?, start_value?, initial_progress?, progress_direction?, total_progress?, permanent?, show_in_outliner?, on_start?, on_monthly_events: [event ids], monthly_progress?: {base, modifier?}, stages: [{key, title?, icon?, icon_background?, color?, end? OR section_weight?, on_enter?, on_first_enter?, modifier?, custom_tooltip?}], approaches?: [{key, title, icon?, icon_background?, potential?, allow?, on_select?, default?, modifier?, upkeep?: {<resource>: N}}], on_progress_complete?, on_fail?, on_abort?}. `total_progress` and per-stage `end` are mutually exclusive - the game logs an error if mixed. All four keys `<key>`, `<key>_type`, `<key>_desc`, `<key>_monthly_change_tooltip` are required.',
        ),
        ...DRY_RUN,
      },
      required: ['prefix', 'situations'],
    },
    handler: generateSituationBatch,
  },
  {
    name: 'generate_tradition_tree',
    description:
      'Write a whole tradition tree: the category (which is what makes the tree exist), its adoption and finish bonuses, its traditions, and optionally ascension perks, with the correct localisation keys.',
    inputSchema: {
      type: 'object',
      properties: {
        prefix: string('File prefix, lowercase ASCII.'),
        language: language('Localisation language. Defaults to english.'),
        generate_localisation: boolean('Also write localisation. Defaults to true.'),
        tree: object('The tree. {key, title, description?, tree_template? (default tree_11_12), potential?, ai_weight?, adoption?: {key?, title, description, modifier?, ...}, finish?: {key?, title, description, modifier?, ...}, traditions: [{key, title, description, modifier?, possible?, potential?, unlocks_agenda?, custom_tooltip?, on_enabled?, on_disabled?, triggered_modifier?, ai_weight?}]}. Tradition descriptions are written as `<key>_delayed`; ascension perks use `<key>_desc`.'),
        ascension_perks: objectArray(
          'Optional ascension perks. Each: {key, title, description, potential?, possible?, on_enabled?, modifier?}.',
        ),
        ...DRY_RUN,
      },
      required: ['prefix', 'tree'],
    },
    handler: generateTraditionTree,
  },

  {
    name: 'validate_stellaris_script_signatures',
    description:
      "Check a mod's script against the game's own script documentation (logs/script_documentation/effects.log, triggers.log, modifiers.log), which the engine regenerates on every run. It reports effect and trigger names that do not exist, documented names used in the wrong scope, event blocks whose keyword is not an event type, the option-plus-effect wrapper, and *_compare triggers written with 'value = N' instead of 'value >= N'. The game must have been run at least once so the logs exist.",
    inputSchema: {
      type: 'object',
      properties: {
        workspace_root: string('Mod root to check.'),
        game_root: string(
          'Game install, used to accept scripted effects and triggers the base game defines. Optional but recommended.',
        ),
        docs_dir: string(
          'Directory holding effects.log and triggers.log. Optional; by default the usual user-data locations are searched.',
        ),
      },
      required: ['workspace_root'],
    },
    handler: validateStellarisScriptSignatures,
  },

  {
    name: 'validate_stellaris_interface',
    description:
      "Check a mod's interface layer against what the engine can resolve: that every .gui file's root is guiTypes, that each effectbuttonType effect names a real common/button_effects/ key, that each event custom_gui / custom_gui_option names a real containerWindowType, and that every spriteType / quadTextureSprite names a real sprite. Also warns when a file replaces a base-game .gui file wholesale, or when a container name shadows a vanilla one. Pass game_root so base-game sprites and containers are accepted.",
    inputSchema: {
      type: 'object',
      properties: {
        workspace_root: string('Mod root to check.'),
        game_root: string(
          'Game install, used to resolve sprites, containers and button effects the base game defines. Strongly recommended.',
        ),
      },
      required: ['workspace_root'],
    },
    handler: validateStellarisInterface,
  },

  {
    name: 'generate_scripted_action_batch',
    description:
      "Write common/scripted_actions/ entries (the buttons a ship, fleet or megastructure can offer) plus their localisation. user_scope and scope are always emitted first and second, as the shipped README requires. Trigger and effect fields take raw script text (for example 'always = yes'), not objects.",
    inputSchema: {
      type: 'object',
      properties: {
        prefix: string('File prefix, lowercase ASCII.'),
        language: language('Localisation language. Defaults to english.'),
        generate_localisation: boolean('Also write localisation. Defaults to true.'),
        actions: objectArray(
          'Scripted actions to write.',
          {
            key: string('Action key.'),
            title: string('Button label, written to localisation.'),
            desc: string('Optional description, written to <key>_desc.'),
            user_scope: string('Scope of the action user, for example fleet. Required, must be first.'),
            scope: string('Target scope, for example self or planet. Required, must be second.'),
            possible: string('Raw trigger text. Defaults to always = yes.'),
            finished: string('Raw trigger text.'),
            button_visible: string('Raw trigger text; evaluated in user_scope.'),
            button_clickable: string('Raw trigger text; evaluated in user_scope.'),
            hide_from_context_menu: string('Raw trigger text.'),
            on_completed: string('Name of the on_action to run when the action completes.'),
            on_started: string('Name of the on_action to run when the action starts.'),
            on_queued: string('Name of the on_action to run when the action is queued.'),
            on_progress_start: string('Name of the on_action to run when progress starts.'),
            on_cancelled: string('Name of the on_action to run when the action is cancelled.'),
            icon: string('Sprite name for the button, for example GFX_fleet_action_button_logistic_harvest_resources.'),
            icon_selected: string('Sprite name for the selected state.'),
            tooltip: string('Localisation key for the tooltip. Defaults to the action key.'),
            context_menu_name: string('Localisation key for the right-click menu entry. Defaults to <key>_menu.'),
            automation: object('Optional automation block: priority, default_on, tooltip, also_automate.'),
          },
          ['key', 'title', 'user_scope', 'scope'],
        ),
        output_root: string('Where to write. Defaults to the session workspace.'),
        dry_run: boolean('Plan only. Defaults to true.'),
      },
      required: ['prefix', 'actions'],
    },
    handler: generateScriptedActionBatch,
  },

  {
    name: 'generate_button_effect_batch',
    description:
      "Write common/button_effects/ entries - the script behind a hand-written GUI button - and optionally the interface/*.gui that contains the matching effectbuttonType elements (rooted at guiTypes, with a close button). Scope reminder baked into the output: this is the selected object, from is the player country. Effect and trigger fields take raw script text.",
    inputSchema: {
      type: 'object',
      properties: {
        prefix: string('File prefix, lowercase ASCII.'),
        language: language('Localisation language. Defaults to english.'),
        generate_localisation: boolean('Also write localisation. Defaults to true.'),
        generate_gui: boolean('Also write interface/<prefix>_button_effects.gui with the buttons. Defaults to false.'),
        window_name: string('Name of the generated containerWindowType. Used by events as custom_gui.'),
        window_width: number('Window width in pixels. Defaults to 420.'),
        window_height: number('Window height in pixels. Defaults to 260.'),
        buttons: objectArray(
          'Button effects to write.',
          {
            key: string('Button effect key; this is what effectbuttonType.effect names.'),
            title: string('Button label, written to localisation.'),
            tooltip: string('Localisation key for the tooltip. Defaults to <key>_tooltip.'),
            scope_type: string('Scope checked in potential. Defaults to fleet.'),
            potential: string('Raw trigger text. Defaults to is_scope_type = <scope_type>.'),
            allow: string('Raw trigger text, with an optional custom_tooltip fail_text.'),
            effect: string('Raw effect text.'),
            effect_lines: array('Alternative to effect: an array of raw lines.'),
            gui: object('Button placement for the generated .gui: name, x, y, width, height, sprite, font.'),
          },
          ['key', 'title'],
        ),
        output_root: string('Where to write. Defaults to the session workspace.'),
        dry_run: boolean('Plan only. Defaults to true.'),
      },
      required: ['prefix', 'buttons'],
    },
    handler: generateButtonEffectBatch,
  },

  {
    name: 'generate_section_template_batch',
    description:
      "Write common/section_templates/ entries. Every slot a ship size names in section_slots needs a template whose fits_on_slot matches it, or the designer offers no section. component_slot entries need a template key and a locatorname that exists on the entity; utility slots are plain counts.",
    inputSchema: {
      type: 'object',
      properties: {
        prefix: string('File prefix, lowercase ASCII.'),
        sections: objectArray(
          'Section templates to write.',
          {
            key: string('Section key.'),
            ship_size: string('Ship size this section belongs to.'),
            fits_on_slot: string('Slot name from the ship size section_slots, for example mid.'),
            entity: string('Ship entity; reuse a vanilla one so its locators exist.'),
            icon: string('Section icon sprite.'),
            component_slots: objectArray(
              'Weapon/utility slots with explicit locators.',
              {
                name: string('Slot name, for example LARGE_GUN_01.'),
                template: string('Component template key from common/component_templates/.'),
                locatorname: string('Locator on the entity, for example large_gun_01.'),
                is_side_slot: boolean('Optional is_side_slot flag.'),
              },
              ['name', 'template', 'locatorname'],
            ),
            small_utility_slots: number('Count of small utility slots.'),
            medium_utility_slots: number('Count of medium utility slots.'),
            large_utility_slots: number('Count of large utility slots.'),
            aux_utility_slots: number('Count of aux utility slots.'),
          },
          ['key', 'ship_size', 'fits_on_slot'],
        ),
        output_root: string('Where to write. Defaults to the session workspace.'),
        dry_run: boolean('Plan only. Defaults to true.'),
      },
      required: ['prefix', 'sections'],
    },
    handler: generateSectionTemplateBatch,
  },

  {
    name: 'generate_starbase_building_batch',
    description:
      "Write common/starbase_buildings/ entries (starbase buildings and modules) plus localisation. A bare modifier field is rejected on purpose: these blocks have none, and writing one fails to load with Unexpected token: modifier - attach behaviour through equipped_component instead. potential is evaluated with the starbase as the scope, so wrap country triggers in owner = { ... }.",
    inputSchema: {
      type: 'object',
      properties: {
        prefix: string('File prefix, lowercase ASCII.'),
        language: language('Localisation language. Defaults to english.'),
        generate_localisation: boolean('Also write localisation. Defaults to true.'),
        buildings: objectArray(
          'Starbase buildings to write.',
          {
            key: string('Building key.'),
            title: string('Display name, written to localisation.'),
            desc: string('Optional description, written to <key>_desc.'),
            icon: string('Icon sprite name.'),
            starbase_type: string('Which starbase type can build it, for example starbase or arkship.'),
            construction_days: number('Build time in days. Defaults to 360.'),
            category: string('Building category key.'),
            starbase_limit: number('Base limit for starbase_limit = { base = N }.'),
            potential: string('Raw trigger text, evaluated in starbase scope.'),
            equipped_component: string('Component template key whose own modifier does the work.'),
            show_in_tech: string('Technology key that shows this building in its tooltip.'),
            show_tech_unlock_if: string('Raw trigger text for showing the tech unlock.'),
            resources: object('resources block: category, cost, upkeep.'),
          },
          ['key', 'title', 'icon', 'starbase_type'],
        ),
        output_root: string('Where to write. Defaults to the session workspace.'),
        dry_run: boolean('Plan only. Defaults to true.'),
      },
      required: ['prefix', 'buildings'],
    },
    handler: generateStarbaseBuildingBatch,
  },
  {
    name: 'generate_solar_system_initializer_batch',
    description:
      "Write common/solar_system_initializers/ entries (star class, flags, usage = misc_system_init with usage_odds = 0, and planet entries with orbit_distance / orbit_angle / size / has_ring / moons) plus optional localisation. Given a spawn block it also writes the scripted effect that puts the systems on the map with spawn_system, using the min_distance >= X / max_distance <= Y band (a 0-100 percentage of the galaxy radius from the centre, which is how a cluster is pinned around the galactic core) and hyperlane = no for an isolated system. spawn.bands gives each spawn its own cycled distance band instead of one shared band, and spawn.batch (default: on when more than one system is spawned) wraps the group in `set_spawn_system_batch = begin` / `end` so the placement caches are recalculated once instead of per system - vanilla needs that or the later spawns fail with 'Failed to find position at minimum distance SPAWN_SYSTEM_BUFFER_DISTANCE = 10 from other systems'.",
    inputSchema: {
      type: 'object',
      properties: {
        prefix: string('File prefix, lowercase ASCII.'),
        language: language('Localisation language. Defaults to english.'),
        generate_localisation: boolean('Also write localisation. Defaults to true.'),
        systems: objectArray(
          'Initializers to write: key, star_class, flags, and planet entries (class, size, orbit_distance, orbit_angle, has_ring, moons).',
        ),
        spawn: object(
          'Optional spawn block: effect_key, min_distance, max_distance, direction, hyperlane, times, initializers, bands, batch. `bands` is an array of { min_distance, max_distance } applied to the spawns in order (cycled) so each system gets its own distance band; `batch` (boolean, default true when more than one system is spawned) wraps the whole group in set_spawn_system_batch = begin/end so the placement caches are recalculated once instead of per system.',
        ),
        output_root: string('Where to write. Defaults to the session workspace.'),
        dry_run: boolean('Plan only. Defaults to true.'),
      },
      required: ['prefix', 'systems'],
    },
    handler: generateSolarSystemInitializerBatch,
  },

  {
    name: 'generate_planet_class_batch',
    description:
      "Write common/planet_classes/ entries for colonisable artificial celestial bodies, modelled on pc_habitat and pc_ringworld_habitable (habitat or ringworld shape, district_set, starting_district, planet_size, colonizable, is_artificial_planet). Art is never invented: the caller supplies the entity and sprite names, which is how an existing model such as the Dyson sphere can be reused for a body that behaves like a planet. Localisation is written unless disabled.",
    inputSchema: {
      type: 'object',
      properties: {
        prefix: string('File prefix, lowercase ASCII.'),
        language: language('Localisation language. Defaults to english.'),
        generate_localisation: boolean('Also write localisation. Defaults to true.'),
        planet_classes: objectArray(
          'Bodies to write: key, title, entity, icon, shape (habitat or ringworld), planet_size, colonizable, district_set, starting_district, climate, modifier and friends.',
        ),
        output_root: string('Where to write. Defaults to the session workspace.'),
        dry_run: boolean('Plan only. Defaults to true.'),
      },
      required: ['prefix', 'planet_classes'],
    },
    handler: generatePlanetClassBatch,
  },

  // ------------------------------------------------------------------ media assets
  {
    name: 'register_image_asset',
    description:
      'Register textures as game sprites: writes one `interface/**/*.gfx` file, UTF-8 without BOM, with one correctly-shaped block per sprite. The kind matters because each one accepts a different field set, measured over 9197 sprite declarations in the install: `spriteType` takes no `size` and no `borderSize` (0 of 8539 declare either), a 9-slice panel is a `corneredTileSpriteType` with `borderSize`, a bar is a `progressBarType` with `textureFile1`/`textureFile2` and `size`, and an inline `\u00a3token\u00a3` icon MUST be named `GFX_text_<token>` (interface/astral_planes_resources.gfx:13 declares that alias for a texture that already has a plain GFX_ name at line 3). It reads the real texture header (dimensions, format, mip count, alpha), reports it, refuses a container the engine does not load, and reports a name collision against the install\'s own sprite index with file:line when `game_root` is given. This server writes no binary files: the texture must already be at the path the block references. Returns what was written, the measured header facts, collisions, warnings, and the list of things still to do by hand (a .gui reference, localisation, the \u00a3 code) before the sprite appears in game.',
    inputSchema: {
      type: 'object',
      properties: {
        prefix: string('File and key prefix, lowercase ASCII. Names the generated `interface/<prefix>_gfx.gfx` unless `gfx_file` is given.'),
        gfx_file: string('Mod-root-relative path of the .gfx to write. Must be under `interface/`; the engine reads sprite registrations from interface/**/*.gfx only. Defaults to `interface/<prefix>_gfx.gfx`.'),
        sprites: array('Sprites to register. Each entry needs a texture and a name; the per-kind fields are optional and are rejected when the chosen kind does not accept them.', {
          type: 'object',
          properties: {
            sprite_name: string('The `name = "..."` value. Every declared sprite name in the install starts with a letter, and 9171 of 9197 `GFX_` blocks use the `GFX_` prefix (a warning, not an error, when it is missing).'),
            text_icon_token: string('For `use: inline_text_icon`: the `\u00a3token\u00a3` name. The sprite is named `GFX_text_<token>` and the report echoes the `\u00a3<token>\u00a3` reference to paste into localisation.'),
            kind: { type: 'string', description: `The .gfx block kind. One of: ${GFX_KINDS.join(', ')}. Defaults to spriteType.`, enum: GFX_KINDS },
            use: { type: 'string', description: `What the sprite is for; it selects the kind and, for inline text icons, enforces the name. One of: ${IMAGE_USE_NAMES.join(', ')}.`, enum: IMAGE_USE_NAMES },
            texture_file: string('Absolute path of the texture file to read and register. Required for every kind that names a texture (all of them except PieChartType): the header is read so the report carries the real dimensions and format.'),
            texture_relpath: string('Mod-root-relative path the .gfx block should reference, for example `gfx/interface/icons/mymod_icon.dds`. Derived from `texture_file` when the texture is already inside `output_root`; required otherwise, because this server never guesses a path or copies a file.'),
            texture_file_1: string('progressBarType fill texture (mod-relative path).'),
            texture_file_2: string('progressBarType empty-background texture (mod-relative path).'),
            masking_texture: string('Masking texture path (spriteType, flagSpriteType, portraitType).'),
            effect_file: string('Shader path: `gfx/FX/buttonstate_onlydisable.shader`, `gfx/FX/progress.shader`, `gfx/FX/flag_sprite.shader` or `gfx/FX/buttonstate_rendertarget.shader` are the four the install uses. progressBarType, flagSpriteType and portraitType get the right one by default.'),
            size: object('`{ x, y }` declared sprite size. Accepted by corneredTileSpriteType, progressBarType and PieChartType; refused by spriteType, which has no size field.'),
            border_size: object('`{ x, y }` 9-slice border for corneredTileSpriteType. Required for that kind: 290 of 335 vanilla blocks declare one, and without it the sprite is stretched instead of sliced.'),
            no_of_frames: integer('`noOfFrames`, a sprite-sheet frame count (1 is common; vanilla uses 1-16).', 1),
            always_transparent: boolean('`alwaystransparent = yes` (1500 vanilla uses).'),
            transparence_check: boolean('`transparencecheck = yes`; the install spells it three different ways, all accepted.'),
            legacy_lazy_load: boolean('`legacy_lazy_load`; 71 vanilla uses, all on key icons.'),
            load_type: string('`loadType`; 3 vanilla uses.'),
            tiling_center: boolean('`tilingCenter` on a corneredTileSpriteType (6 vanilla uses).'),
            horizontal: boolean('progressBarType orientation.'),
            flip_direction: boolean('progressBarType `flipdirection`.'),
            animation_rate_fps: integer('frameAnimatedSpriteType playback rate. Required for that kind.', 1),
            looping: boolean('frameAnimatedSpriteType `looping`. Required for that kind.'),
            play_on_show: boolean('frameAnimatedSpriteType `play_on_show`. Required for that kind.'),
            is_hover: boolean('PieChartType `is_hover`.'),
            colors: array('PieChartType `colors`, a bare list such as [1, 0, 0] (interface/government_view.gfx:215).', { type: 'number' }),
            clicksound: string('textSpriteType `clicksound`.'),
            portrait_type: string('portraitType `type`. Required for that kind.'),
            portrait_character: string('portraitType `character`. Required for that kind.'),
            mid_close_up: number('portraitType `mid_close_up`.'),
            close_up: number('portraitType `close_up`.'),
            bg_position: object('flagSpriteType `{ x, y }` background origin, from interface/game_setup/customization.gfx:16.'),
            bg_size: object('flagSpriteType `{ width, height }` background rect.'),
            symbol_position: object('flagSpriteType `{ x, y }` symbol origin.'),
            symbol_size: object('flagSpriteType `{ width, height }` symbol rect.'),
            mask_size: object('flagSpriteType `{ width, height }` mask rect (2 vanilla uses).'),
            mask_offset: object('flagSpriteType `{ x, y }` mask offset (2 vanilla uses).'),
            color: array('progressBarType `color`, a bare triple such as [1.0, 1.0, 1.0].', { type: 'number' }),
            color_two: array('progressBarType `colorTwo`, a bare triple.', { type: 'number' }),
            extra_fields: object('Scalar fields outside the measured set for this kind, written verbatim. Only use it for a field you have measured yourself.'),
            extra_blocks: object('Block-shaped fields outside the measured set, written verbatim (for example `animation` or `upper_left`).'),
            allow_unverified_fields: boolean('Write unknown field names verbatim instead of failing. Required for the two kinds with no vanilla example in 4.4.6.'),
          },
          additionalProperties: true,
        }),
        game_root: string('Optional Stellaris install folder. Pass it so sprite names the base game already declares are reported as collisions with file:line instead of being missed.'),
        ...DRY_RUN,
      },
      required: ['sprites'],
    },
    handler: registerImageAsset,
  },

  {
    name: 'validate_image_asset',
    description:
      'Check image assets without writing anything, in either of two modes, or both at once. Given `workspace_root` it audits the whole mod: every sprite the mod declares, whether its `texturefile` resolves to a file that actually exists here or in the install, names that are declared twice, and names that shadow a vanilla sprite. Given `prefix`/`gfx_file` plus `sprites: [...]` it validates a registration before you write it - the same checks `register_image_asset` runs, including the install\'s sprite index - and reports the exact `.gfx` text it would emit. Vanilla itself is not a clean reference here: 16 `texturefile` keys in the install point at `.tga` files that do not exist anywhere in the install, so the "texture missing" check is a real one.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_root: string('Absolute path of a mod root to audit. Optional, but one of `workspace_root` and `sprites` is required.'),
        game_root: string('Optional Stellaris install folder, used both to accept base-game sprite names and to resolve textures the mod inherits.'),
        prefix: string('File and key prefix for the registration being validated.'),
        gfx_file: string('Mod-root-relative path of the .gfx the registration would be written to; must be under `interface/`.'),
        sprites: array('The sprite registrations to validate. Same shape as `register_image_asset`.', {
          type: 'object',
          properties: {
            sprite_name: string('The `name = "..."` value to check for collisions and for the naming rules.'),
            text_icon_token: string('The `\u00a3token\u00a3` name, when the sprite is an inline text icon.'),
            kind: { type: 'string', description: 'The .gfx block kind.', enum: GFX_KINDS },
            use: { type: 'string', description: 'What the sprite is for.', enum: IMAGE_USE_NAMES },
            texture_file: string('Absolute path of the texture to read.'),
            texture_relpath: string('Mod-root-relative path the block would reference.'),
            size: object('`{ x, y }` declared size where the kind allows one.'),
            border_size: object('`{ x, y }` 9-slice border for corneredTileSpriteType.'),
            no_of_frames: integer('`noOfFrames`.', 1),
            always_transparent: boolean('`alwaystransparent`.'),
            effect_file: string('Shader path.'),
            masking_texture: string('Masking texture path.'),
            texture_file_1: string('progressBarType fill texture.'),
            texture_file_2: string('progressBarType background texture.'),
            extra_fields: object('Extra scalar fields, written verbatim only with `allow_unverified_fields`.'),
            extra_blocks: object('Extra block fields, written verbatim.'),
            allow_unverified_fields: boolean('Accept field names outside the measured set for this kind.'),
          },
          additionalProperties: true,
        }),
      },
    },
    handler: validateImageAsset,
  },

  {
    name: 'register_audio_asset',
    description:
      'Register a WAV as a game sound or an OGG as a music track, and emit every file the registration actually needs. For a sound that is `sound/<...>.asset` holding `sound = { name file volume }`, plus an optional `soundeffect` group (the only name a .gui `clicksound =` accepts) and an optional mixer category. For music it is three files: `music/<x>.asset` with the `music` block, `music/<x>_songs.txt` with the `song` entry that makes the track appear in the music player, and a BOM-prefixed localisation file giving it a title. Two measured rules drive the output: `file` resolves relative to the .asset file\'s OWN folder (4569 of the install\'s 5931 audio blocks resolve only that way, 0 resolve only relative to sound/ or music/), so the .asset is written next to the audio by default; and the engine wants 44.1 kHz, which it states itself in error.log as `[pdx_audiomusic_sdl.cpp:88]: For best performance and quality music files should be in 44.1kHz` - every one of the install\'s 30 music tracks and 6890 sounds is 44100 Hz, so anything else is an error for music and a warning for a sound. The header is read for real (sample rate, channels, bit depth, exact duration) and sound/ takes .wav only while music/ takes .ogg only: soundtrack/\'s 23 .mp3 and 23 .flac are the distributable original soundtrack and are not loaded by the engine. This server writes no binary files, so the audio must already be in place.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', description: 'Which registry to write into. `sound` expects a .wav, `music` an .ogg.', enum: ['sound', 'music'], default: 'sound' },
        prefix: string('File and key prefix, lowercase ASCII. Names the generated .asset file and the default registry key.'),
        name: string('The registry key script will use. Defaults to `<prefix>_<audio file stem>`.'),
        audio_file: string('Absolute path of the .wav or .ogg to read and register. Required: the header is read so the report carries the real sample rate, channel count and duration.'),
        audio_relpath: string('Mod-root-relative path of the audio, for example `sound/mymod/click.wav` or `music/mymod_theme.ogg`. Derived from `audio_file` when the audio is already inside `output_root`; required otherwise.'),
        asset_file: string('Mod-root-relative path of the .asset to write. Defaults next to the audio for a sound, and `music/<prefix>_music.asset` for music; must be under `sound/` or `music/`.'),
        file_value: string('Override the `file = "..."` value. By default it is derived so that it resolves, from the .asset file\'s own folder, to the audio path.'),
        volume: number('Volume multiplier, 0-1. The install writes 4254 volumes on `sound` blocks and 21 on `music` blocks.'),
        always_load: boolean('`always_load = yes`; 415 vanilla sound blocks set it, mostly UI sounds.'),
        priority: integer('`priority`; 28 vanilla sound blocks set it.'),
        falloff: string('A `falloff` key from sound/falloff.asset, such as `falloff_100`. Only meaningful with `is3d`.'),
        is3d: boolean('`is3d = yes` on the `soundeffect`, for a positional sound (1654 vanilla uses).'),
        loop: boolean('`loop = yes` on the `soundeffect` (1306 vanilla uses).'),
        category: { type: 'string', description: `Mixer category to add the sound to. One of: ${SOUND_CATEGORIES.join(', ')}. Omitted by default, and the report explains the consequence.`, enum: SOUND_CATEGORIES },
        soundeffect_name: string('Also emit a `soundeffect` block with this name, grouping the sound with volume/fade control. This is the name a .gui element can use as `clicksound`.'),
        soundeffect_volume: number('Volume for the generated `soundeffect`. Defaults to `volume`, or 0.5.'),
        max_audible: integer('`max_audible` on the `soundeffect` (2519 vanilla uses).', 1),
        max_audible_behaviour: string('`max_audible_behaviour`, `fail` in 2331 of the install\'s blocks.'),
        fade_in: number('`fade_in` seconds (531 vanilla uses).'),
        fade_out: number('`fade_out` seconds (987 vanilla uses).'),
        title: string('Music only: the visible track title, written to localisation as the key `<name>`. Without it the placeholder value is the key itself.'),
        language: language('Music only: language of the generated music-player localisation file. Defaults to english.'),
        generate_localisation: boolean('Music only: write the track-title localisation file. Defaults to true.'),
        song_file: string('Music only: mod-root-relative path of the `song` entry file. Defaults to `music/<prefix>_songs.txt`.'),
        localisation_file: string('Music only: mod-root-relative path of the track-title localisation file. Defaults to `localisation/<language>/<prefix>_musicplayer_l_<language>.yml`.'),
        game_root: string('Optional Stellaris install folder. Pass it so sound, soundeffect, music and song names the base game already declares are reported as collisions with file:line.'),
        ...DRY_RUN,
      },
      required: ['audio_file', 'prefix'],
    },
    handler: registerAudioAsset,
  },

  {
    name: 'validate_audio_asset',
    description:
      'Check audio assets without writing anything, in either of two modes, or both at once. Given `workspace_root` it audits the mod\'s own sound/music registrations: every `sound` and `music` block with a `file` is resolved the way the engine resolves it (relative to the .asset file\'s own folder), and any that points at a file which does not exist is an error; names that shadow a vanilla sound, soundeffect, music or song are warnings. Given `kind`/`prefix`/`audio_file` it validates a registration before you write it - the real header (sample rate, channels, bit depth, duration), whether the container belongs in that registry at all, the 44.1 kHz rule, name collisions, and the exact `song`/localisation files it would need. Returns a verdict plus the remaining manual steps.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_root: string('Absolute path of a mod root to audit. Optional, but one of `workspace_root` and `audio_file` is required.'),
        game_root: string('Optional Stellaris install folder, used to report names that shadow vanilla ones.'),
        kind: { type: 'string', description: 'Which registry the audio is for.', enum: ['sound', 'music'], default: 'sound' },
        prefix: string('File and key prefix for the registration being validated.'),
        name: string('The registry key to check for collisions.'),
        audio_file: string('Absolute path of the .wav or .ogg to read.'),
        audio_relpath: string('Mod-root-relative path the .asset would reference.'),
        asset_file: string('Mod-root-relative path of the .asset that would be written.'),
        file_value: string('Override the `file = "..."` value to check.'),
        volume: number('Volume multiplier to report on.'),
        category: { type: 'string', description: 'Mixer category to check against the six the install declares.', enum: SOUND_CATEGORIES },
        soundeffect_name: string('Also validate a generated `soundeffect` name.'),
        title: string('Music only: the track title that would be written to localisation.'),
        language: language('Music only: language of the localisation file.'),
        generate_localisation: boolean('Music only: whether a localisation file would be written.'),
        song_file: string('Music only: the `song` entry file that would be written.'),
        localisation_file: string('Music only: the localisation file that would be written.'),
      },
    },
    handler: validateAudioAsset,
  },

  // ------------------------------------------------------------------ environment
  {
    name: 'discover_stellaris_environment',    description:
      'Find the Stellaris install, the user data folder, the logs folder and the mod folder. Steam libraries are read from libraryfolders.vdf; every reported path is verified to exist.',
    inputSchema: {
      type: 'object',
      properties: {
        game_root: string('Optional explicit install folder (the one containing stellaris.exe).'),
        documents_root: string('Optional explicit user data folder.'),
      },
    },
    handler: discoverStellarisEnvironment,
  },
  {
    name: 'plan_stellaris_debug_run',
    description:
      'Work out which mods must be enabled for a meaningful test, compare that against dlc_load.json, list the newest logs, and print the exact command line. Never starts the game.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_mod_path: string('Absolute path of the mod root.'),
        game_root: string('Optional explicit install folder.'),
        documents_root: string('Optional explicit user data folder.'),
        dependencies: strings('Additional mod names this test needs enabled.'),
      },
      required: ['workspace_mod_path'],
    },
    handler: planStellarisDebugRun,
  },
  {
    name: 'validate_stellaris_debug_run',
    description:
      'Report whether the enabled mod set matches exactly what the workspace needs (workspace name plus dependencies). A mismatch means a test run tells you nothing about your files.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_mod_path: string('Absolute path of the mod root.'),
        game_root: string('Optional explicit install folder.'),
        documents_root: string('Optional explicit user data folder.'),
        dependencies: strings('Additional mod names this test needs enabled.'),
      },
      required: ['workspace_mod_path'],
    },
    handler: validateStellarisDebugRun,
  },
  {
    name: 'run_stellaris_debug_session',
    description:
      'Run one automated test pass and clean up after it. Launches stellaris.exe directly (never through the Paradox launcher, which rewrites dlc_load.json) with -debug_mode, then polls logs/error.log and treats the run as finished as soon as the log has not changed for settle_ms (default 20000 ms, the "nothing new within 20 s means the test is over" rule). It then terminates the game with `Stop-Process -Name stellaris -Force` so nothing keeps burning CPU, and returns a compact result: elapsed_seconds, log_settled, the mod-caused error lines (or "none"), and whether the process was stopped or left running. Set `keep_running: true` (alias `awaiting_visual_check: true`) when a human must look at the screen: the log is still watched to completion, but the process is left alive. Pass `run_started: true` (alias `skip_launch`) to attach to a game you already launched - that game is never killed, because this tool only stops the process it started itself.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_mod_path: string('Optional absolute path of the mod root, used to attribute error lines to your mod.'),
        game_root: string('Optional explicit install folder.'),
        documents_root: string('Optional explicit user data folder.'),
        dependencies: strings('Additional mod names this test needs enabled.'),
        keep_running: boolean(
          'Leave the game running for a visual check instead of killing it once the log settles. Defaults to false. Also accepted as awaiting_visual_check.',
        ),
        awaiting_visual_check: boolean('Alias of keep_running.'),
        settle_ms: number('Quiet window that ends the run. Defaults to 20000 ms.'),
        poll_ms: number('How often to stat error.log. Defaults to 2000 ms.'),
        max_wait_ms: number('Give up waiting after this long and leave the process running. Defaults to 900000 ms.'),
        grace_ms: number('Extra wait after the log settles, before stopping. Defaults to 5000 ms.'),
        run_started: boolean('Attach to an already running game instead of launching one.'),
        skip_launch: boolean('Alias of run_started.'),
        debugtooltip: boolean('Also pass -debugtooltip.'),
        no_logall: boolean('Do not pass -logall (it stops the log from dropping repeated identical messages).'),
      },
    },
    handler: runStellarisDebugSession,
  },
  {
    name: 'wait_for_stellaris_log_settle',
    description:
      'Watch logs/error.log of an already running game and report when it has gone quiet for settle_ms (default 20000 ms). Never launches and never kills anything - it exists so a caller that started the game itself can still use the "no new log output for 20 s means the test is over" rule without losing its own process handle.',
    inputSchema: {
      type: 'object',
      properties: {
        documents_root: string('Optional explicit user data folder.'),
        keep_running: boolean('Report that the process must be left alone. Defaults to true in effect: this tool never kills.'),
        awaiting_visual_check: boolean('Alias of keep_running.'),
        settle_ms: number('Quiet window that ends the wait. Defaults to 20000 ms.'),
        poll_ms: number('How often to stat error.log. Defaults to 2000 ms.'),
        max_wait_ms: number('Give up waiting after this long. Defaults to 900000 ms.'),
      },
    },
    handler: waitForStellarisLogSettle,
  },
];

/** Build the callable registry around a shared context. */
export function createToolRegistry(context) {
  const byName = new Map(TOOL_SPECS.map((spec) => [spec.name, spec]));
  const LOGGED_EXEMPT = new Set(['query_tool_logs', 'export_tool_logs', 'inspect_rststellariscribe_state']);

  return {
    list() {
      return TOOL_SPECS.map((spec) => ({
        name: spec.name,
        description: spec.description,
        inputSchema: spec.inputSchema,
      }));
    },

    async call(name, args) {
      const spec = byName.get(name);
      if (!spec) {
        throw new Error(`unknown tool \`${name}\`; call tools/list for the available tools`);
      }
      const startedAt = Date.now();
      try {
        const result = await spec.handler(args ?? {}, context);
        if (!LOGGED_EXEMPT.has(name)) {
          context.toolLog.record({
            tool: name,
            ok: true,
            durationMs: Date.now() - startedAt,
            arguments: summariseArguments(args),
            summary: summariseResult(result),
          });
        }
        return result;
      } catch (thrown) {
        if (!LOGGED_EXEMPT.has(name)) {
          context.toolLog.record({
            tool: name,
            ok: false,
            durationMs: Date.now() - startedAt,
            arguments: summariseArguments(args),
            error: thrown instanceof Error ? thrown.message : String(thrown),
          });
        }
        throw thrown;
      }
    },
  };
}

function summariseArguments(args) {
  if (!args || typeof args !== 'object') return null;
  const summary = {};
  for (const [key, value] of Object.entries(args)) {
    if (Array.isArray(value)) {
      summary[key] = `[${value.length} item(s)]`;
    } else if (typeof value === 'string' && value.length > 200) {
      summary[key] = value.slice(0, 200) + '…';
    } else if (value && typeof value === 'object') {
      summary[key] = `{${Object.keys(value).join(',')}}`;
    } else {
      summary[key] = value;
    }
  }
  return summary;
}

function summariseResult(result) {
  if (result === null || result === undefined) return null;
  if (typeof result !== 'object') return String(result).slice(0, 500);
  const keys = Object.keys(result);
  const files = Array.isArray(result.files) ? result.files.length : undefined;
  return JSON.stringify({
    keys: keys.slice(0, 20),
    ...(files !== undefined ? { files } : {}),
    ...(result.verdict ? { verdict: result.verdict } : {}),
    ...(result.error_count !== undefined ? { error_count: result.error_count } : {}),
    ...(result.warning_count !== undefined ? { warning_count: result.warning_count } : {}),
  });
}
