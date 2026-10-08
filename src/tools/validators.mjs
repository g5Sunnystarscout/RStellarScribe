//------------------------------------------------------------------------------------
// validators.mjs -- Part of RStellarScribe
//
// Read-only tools. RHoiScribe delegates most of this to the CWTools Rust engine
// and an HOI4 rule set; Stellaris has no equivalent published rule set, so these
// tools report only what the files themselves prove, and say when they cannot
// prove something. Everything here is a dry run by construction — no tool in this
// module writes a file.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//------------------------------------------------------------------------------------

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

import {
  analyseLocalisationFileName,
  analyseMountability,
  assertWritableModPath,
  classifyPath,
  KNOWN_DESCRIPTOR_TAGS,
  LOCALISATION_LANGUAGES,
  normaliseLanguage,
  resolveModRelativePath,
  suggestedAsciiModRoot,
} from '../lib/paths.mjs';
import {
  checkScriptStructure,
  findEventIds,
  findLocalisationKeyReferences,
  findTopLevelDefinitions,
  formatParadoxScript as formatParadoxSource,
} from '../lib/paradox.mjs';
import {
  compareLanguageCoverage,
  readLocalisationKeys,
  validateLocalisationFile,
} from '../lib/localisation.mjs';
import { clamp } from '../lib/tool-log.mjs';
import { entityKindForPath, openWorkspace } from '../lib/workspace.mjs';
import { readGameVersion } from './environment.mjs';

/**
 * Vanilla localisation keys, cached per game root. Used to tell "this key is missing
 * everywhere" apart from "this key comes from the base game", which is the difference
 * between a real defect and a false alarm on a mod that legitimately reuses vanilla text.
 */
const vanillaKeyCache = new Map();

function loadVanillaLocalisationKeys(gameRoot) {
  if (typeof gameRoot !== 'string' || gameRoot.trim() === '') return null;
  const root = resolve(gameRoot.trim());
  if (vanillaKeyCache.has(root)) return vanillaKeyCache.get(root);
  const localisationRoot = join(root, 'localisation');
  const keys = existsSync(localisationRoot) ? readLocalisationKeys(localisationRoot) : new Map();
  vanillaKeyCache.set(root, keys);
  return keys;
}

// ------------------------------------------------------------------------------------
// validate_stellaris_paths
// ------------------------------------------------------------------------------------

export function validateStellarisPaths(args = {}) {
  const paths = Array.isArray(args.paths) ? args.paths : [];
  if (paths.length === 0) {
    throw new Error('`paths` is required: an array of mod-root-relative paths to check');
  }
  const workspaceRoot = typeof args.workspace_root === 'string' ? args.workspace_root : null;

  const results = paths.map((rawPath) => {
    const resolved = resolveModRelativePath(rawPath);
    if (!resolved.ok) {
      return { path: String(rawPath), ok: false, errors: [resolved.reason], warnings: [] };
    }
    const errors = [];
    const warnings = [];
    const writable = assertWritableModPath(resolved.path);
    if (!writable.ok) warnings.push(writable.reason);

    const classification = classifyPath(resolved.path);
    warnings.push(...classification.warnings);

    if (classification.kind === 'localisation') {
      const nameAnalysis = analyseLocalisationFileName(resolved.path.split('/').pop());
      if (!nameAnalysis.ok) errors.push(nameAnalysis.reason);
    }
    if (classification.kind === 'localisation-replace') {
      warnings.push(
        '`localisation/replace/` overrides vanilla keys for every player; keep the file minimal',
      );
    }

    let exists = null;
    if (workspaceRoot) {
      const absolute = join(resolve(workspaceRoot), resolved.path.split('/').join(sep));
      exists = existsSync(absolute);
    }

    return {
      path: resolved.path,
      ok: errors.length === 0,
      kind: classification.kind,
      exists,
      errors,
      warnings,
    };
  });

  return {
    checked: results.length,
    invalid: results.filter((result) => !result.ok).length,
    workspace_root: workspaceRoot,
    results,
    messages: [
      'Checklist validation is structural only. It cannot confirm that a trigger, effect or modifier name exists in the current game version.',
    ],
  };
}

// ------------------------------------------------------------------------------------
// validate_stellaris_localisation
// ------------------------------------------------------------------------------------

export function validateStellarisLocalisation(args = {}) {
  const workspaceRoot = typeof args.workspace_root === 'string' ? args.workspace_root : null;
  const singlePath = typeof args.path === 'string' ? args.path : null;
  if (!workspaceRoot && !singlePath) {
    throw new Error('provide either `workspace_root` (whole mod) or `path` (one file)');
  }

  const findings = [];
  const filePaths = [];

  if (singlePath) {
    filePaths.push({ relative: singlePath, absolute: resolve(singlePath) });
  } else {
    const root = resolve(workspaceRoot);
    const localisationRoot = join(root, 'localisation');
    if (!existsSync(localisationRoot)) {
      return {
        checked: 0,
        errors: [],
        warnings: [],
        messages: [`\`${localisationRoot}\` does not exist; this mod ships no localisation`],
      };
    }
    const walk = (directory) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const full = join(directory, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.name.toLowerCase().endsWith('.yml')) continue;
        filePaths.push({ relative: relative(root, full).split(sep).join('/'), absolute: full });
      }
    };
    walk(localisationRoot);
  }

  let errorCount = 0;
  let warningCount = 0;
  for (const file of filePaths) {
    let bytes;
    try {
      bytes = readFileSync(file.absolute);
    } catch (thrown) {
      findings.push({ file: file.relative, errors: [{ message: thrown.message }], warnings: [] });
      errorCount += 1;
      continue;
    }
    const outcome = validateLocalisationFile(file.relative, bytes);
    if (outcome.errors.length > 0) errorCount += outcome.errors.length;
    if (outcome.warnings.length > 0) warningCount += outcome.warnings.length;
    if (outcome.errors.length > 0 || outcome.warnings.length > 0) {
      findings.push({ file: file.relative, errors: outcome.errors, warnings: outcome.warnings });
    }
  }

  let coverage = null;
  if (workspaceRoot) {
    const localisationRoot = join(resolve(workspaceRoot), 'localisation');
    if (existsSync(localisationRoot)) coverage = compareLanguageCoverage(localisationRoot);
  }

  return {
    checked: filePaths.length,
    error_count: errorCount,
    warning_count: warningCount,
    findings,
    language_coverage: coverage,
    messages: [
      'A localisation file that is not UTF-8 with BOM, is not named `<name>_l_<language>.yml`, or lacks the `l_<language>:` first line is ignored by the game without any log entry.',
      'Stellaris has no fallback language: a key missing in a language is displayed to the player as the raw key.',
    ],
  };
}

// ------------------------------------------------------------------------------------
// validate_stellaris_file
// ------------------------------------------------------------------------------------

export function validateStellarisFile(args = {}) {
  const path = typeof args.path === 'string' ? args.path : null;
  if (!path) throw new Error('`path` is required');
  const workspaceRoot = typeof args.workspace_root === 'string' ? args.workspace_root : null;

  const resolved = resolveModRelativePath(path);
  if (!resolved.ok) throw new Error(`\`${path}\`: ${resolved.reason}`);

  let bytes;
  if (typeof args.content === 'string') {
    bytes = Buffer.from(args.content, 'utf8');
  } else if (workspaceRoot) {
    const absolute = join(resolve(workspaceRoot), resolved.path.split('/').join(sep));
    if (!existsSync(absolute)) throw new Error(`\`${resolved.path}\` does not exist under ${workspaceRoot}`);
    bytes = readFileSync(absolute);
  } else {
    throw new Error('provide `content`, or `workspace_root` so the file can be read');
  }

  const classification = classifyPath(resolved.path);
  const errors = [];
  const warnings = [...classification.warnings];
  const info = { kind: classification.kind, definitions: [], localisation_keys_referenced: [] };

  if (classification.kind.startsWith('localisation')) {
    const outcome = validateLocalisationFile(resolved.path, bytes);
    errors.push(...outcome.errors);
    warnings.push(...outcome.warnings);
    info.localisation_keys_referenced = outcome.keys;
    return summarise(resolved.path, errors, warnings, info);
  }

  const text = bytes.toString('utf8');
  const structure = checkScriptStructure(text, resolved.path);
  errors.push(...structure.errors);
  warnings.push(...structure.warnings);

  const entityKind = entityKindForPath(resolved.path);
  const isEventFile = resolved.path.startsWith('events/');
  // Event files name their keys literally (`title = ns.1.name`); their top-level keys
  // are event type keywords, so no definition-derived keys are implied.
  info.definitions = isEventFile
    ? findEventIds(text)
    : findTopLevelDefinitions(text).map((definition) => definition.key);
  info.localisation_keys_referenced = findLocalisationKeyReferences(text, {
    kinds: entityKind ? [entityKind] : [],
    includeDefinitions: !isEventFile,
  });

  if (workspaceRoot) {
    const root = resolve(workspaceRoot);
    const modKeys = existsSync(join(root, 'localisation'))
      ? readLocalisationKeys(join(root, 'localisation'))
      : new Map();
    const vanillaKeys = loadVanillaLocalisationKeys(args.game_root);
    const missingFromMod = info.localisation_keys_referenced.filter(
      (key) => !modKeys.has(key) && !/^(yes|no)$/i.test(key),
    );
    const providedByVanilla = vanillaKeys
      ? missingFromMod.filter((key) => vanillaKeys.has(key))
      : [];
    const trulyMissing = vanillaKeys
      ? missingFromMod.filter((key) => !vanillaKeys.has(key))
      : missingFromMod;

    info.provided_by_vanilla = providedByVanilla;
    if (trulyMissing.length > 0) {
      warnings.push(
        `no localisation defines: ${trulyMissing.slice(0, 12).join(', ')}${
          trulyMissing.length > 12 ? ` (+${trulyMissing.length - 12} more)` : ''
        }${
          vanillaKeys
            ? ' (checked against this mod and the vanilla install)'
            : '. This mod does not define them; keys supplied by the base game are not checked unless `game_root` is passed'
        }`,
      );
    }
  }

  return summarise(resolved.path, errors, warnings, info);
}

function summarise(path, errors, warnings, info) {
  return {
    path,
    ok: errors.length === 0,
    error_count: errors.length,
    warning_count: warnings.length,
    errors,
    warnings,
    info,
    messages:
      errors.length === 0
        ? ['No structural problem was found. This does not prove the script references only names that exist in the current game version.']
        : ['Fix the errors first; warnings are conventions that still load.'],
  };
}

// ------------------------------------------------------------------------------------
// validate_stellaris_project
// ------------------------------------------------------------------------------------

/**
 * The localisation keys a definition of this kind is expected to have.
 *
 * Most databases localise their bare definition key, but several do not, and asserting the
 * bare key produces false "missing localisation" warnings on a perfectly good mod:
 *   events         -> `<id>.name` / `<id>.desc` (the id itself is never a loc key)
 *   event chains   -> `<key>_title` / `<key>_desc`
 *   static/opinion modifiers -> `MOD_<KEY>` (auto-generated uppercase form)
 *   situations     -> `<key>` plus `<key>_type`
 */
function expectedLocalisationKeys(kind, key) {
  switch (kind) {
    case 'event':
      return [`${key}.name`, `${key}.desc`];
    case 'event_chain':
      return [`${key}_title`, `${key}_desc`];
    case 'static_modifier':
    case 'opinion_modifier':
      return [`MOD_${key.toUpperCase()}`, key];
    case 'situation':
      return [key, `${key}_type`];
    default:
      return [key];
  }
}

/**
 * Kinds whose definition key is a script hook or an internal template name. They are
 * referenced from other files and never rendered, so requiring localisation for the bare
 * key would report a mod that loads perfectly as having missing text.
 */
const NO_LOCALISATION_KINDS = new Set([
  'on_action',
  'section_template',
  'scripted_effect',
  'scripted_trigger',
  'scripted_variable',
  'game_rule',
]);

export function validateStellarisProject(args = {}) {
  const workspaceRoot = typeof args.workspace_root === 'string' ? args.workspace_root : null;
  if (!workspaceRoot) throw new Error('`workspace_root` is required');

  const workspace = openWorkspace(workspaceRoot);
  const errors = [];
  const warnings = [];
  const findings = [];

  // A non-ASCII mod root is a hard blocker: everything else can be perfect and the game
  // still mounts nothing, with no log entry to explain it.
  for (const problem of analyseMountability(workspace.root)) {
    errors.push({
      file: '(mod root)',
      message: `${problem.message} Fix: ${problem.fix} Suggested location: ${suggestedAsciiModRoot(
        workspace.root.split(/[\\/]/).pop(),
      )}`,
    });
  }

  if (!workspace.descriptor) {
    errors.push({
      file: 'descriptor.mod',
      message:
        'no `descriptor.mod` in the mod root: the launcher will not recognise this folder as a mod',
    });
  } else {
    const fields = workspace.descriptor.fields;
    if (!fields.name) {
      errors.push({ file: 'descriptor.mod', message: '`name` is missing from descriptor.mod' });
    }
    if (!fields.supported_version) {
      warnings.push({
        file: 'descriptor.mod',
        message: '`supported_version` is missing; the launcher shows the mod as outdated',
      });
    }
    if (!workspace.descriptor.blocks.tags || workspace.descriptor.blocks.tags.length === 0) {
      warnings.push({ file: 'descriptor.mod', message: '`tags` is empty; the mod cannot be browsed by category' });
    } else {
      const unknownTags = workspace.descriptor.blocks.tags.filter(
        (tag) => !KNOWN_DESCRIPTOR_TAGS.includes(tag),
      );
      if (unknownTags.length > 0) {
        warnings.push({
          file: 'descriptor.mod',
          message: `tag(s) not observed in any installed mod: ${unknownTags.join(', ')}. Observed values are ${KNOWN_DESCRIPTOR_TAGS.join(', ')}.`,
        });
      }
    }
    if (fields.path) {
      warnings.push({
        file: 'descriptor.mod',
        message:
          '`path` belongs in the launcher copy of the descriptor under `Documents/Paradox Interactive/Stellaris/mod`, not in the mod root copy',
      });
    }
    if (fields.replace_path) {
      warnings.push({
        file: 'descriptor.mod',
        message: `\`replace_path\` makes the game ignore all vanilla files in the replaced folder: ${fields.replace_path}`,
      });
    }
    // Version drift is the quietest way to validate a mod against the wrong game: the
    // files all parse, and the launcher simply marks the mod as outdated.
    if (args.game_root) {
      const game = readGameVersion(resolve(String(args.game_root)));
      const supported = fields.supported_version;
      if (game.compatibility && supported) {
        const wanted = /(\d+)\.(\d+)/.exec(String(supported));
        if (wanted && `${wanted[1]}.${wanted[2]}` !== game.compatibility) {
          warnings.push({
            file: 'descriptor.mod',
            message: `supported_version "${supported}" does not match the install at ${args.game_root} (${game.raw ?? 'version unknown'}, modsCompatibilityVersion ${game.compatibility}). The launcher marks such a mod as outdated, and any field checked against the wrong install may be wrong too.`,
          });
        }
      } else if (!game.compatibility) {
        warnings.push({
          file: 'descriptor.mod',
          message: `could not read a game version from ${args.game_root}\\launcher-settings.json, so supported_version "${supported ?? '(unset)'}" could not be compared`,
        });
      }
    }
  }

  for (const error of workspace.errors) {
    (error.message.includes('duplicate') ? errors : warnings).push(error);
  }

  const overrideFiles = workspace.files.filter((file) => {
    const base = file.path.split('/').pop() ?? '';
    return base.startsWith('00_');
  });
  for (const file of overrideFiles) {
    warnings.push({
      file: file.path,
      message:
        'a `00_`-prefixed file is not automatically an override. Whether it merges with or replaces a vanilla file depends on the engine\'s per-directory rules (last-in-only-served, first-in-only-served, or duplicate-only) and on ASCII filename order. A mod-specific prefix keeps your definitions in their own file instead of relying on that ordering.',
    });
  }

  const localisationRoot = join(resolve(workspaceRoot), 'localisation');
  if (!existsSync(localisationRoot)) {
    warnings.push({
      file: 'localisation/',
      message: 'the mod defines no localisation; every generated key will display as a raw key in game',
    });
  } else {
    const outcome = validateStellarisLocalisation({ workspace_root: workspaceRoot });
    for (const finding of outcome.findings) {
      for (const error of finding.errors) errors.push({ file: finding.file, message: error.message, line: error.line });
      for (const warning of finding.warnings) warnings.push({ file: finding.file, message: warning.message, line: warning.line });
    }
  }

  const scriptFiles = workspace.files.filter((file) => file.path.endsWith('.txt'));
  for (const file of scriptFiles) {
    let text;
    try {
      text = readFileSync(join(resolve(workspaceRoot), file.path.split('/').join(sep)), 'utf8');
    } catch {
      continue;
    }
    const structure = checkScriptStructure(text, file.path);
    for (const error of structure.errors) errors.push(error);
    if (structure.errors.length > 0) findings.push(file.path);
  }

  const localisationKeys = workspace.localisationKeys;
  const vanillaKeys = loadVanillaLocalisationKeys(args.game_root);
  const missingLocalisation = [];
  const vanillaProvided = [];
  for (const [kind, definitions] of workspace.definitions) {
    if (NO_LOCALISATION_KINDS.has(kind)) continue;
    for (const [key] of definitions) {
      const expected = expectedLocalisationKeys(kind, key);
      if (expected.some((candidate) => localisationKeys.has(candidate))) continue;
      if (vanillaKeys && expected.some((candidate) => vanillaKeys.has(candidate))) {
        vanillaProvided.push({ kind, key });
        continue;
      }
      missingLocalisation.push({ kind, key, expected });
    }
  }
  if (missingLocalisation.length > 0) {
    warnings.push({
      file: '(project)',
      message: `${missingLocalisation.length} definition key(s) have no localisation entry, for example ${missingLocalisation
        .slice(0, 8)
        .map((entry) => `${entry.expected.join(' or ')} (${entry.kind})`)
        .join(', ')}${
        vanillaKeys
          ? ''
          : '. Only this mod\'s localisation was searched; pass `game_root` to also accept keys that the base game provides'
      }`,
    });
  }
  if (vanillaProvided.length > 0) {
    warnings.push({
      file: '(project)',
      message: `${vanillaProvided.length} definition key(s) reuse localisation that the vanilla install already defines: ${vanillaProvided
        .slice(0, 8)
        .map((entry) => entry.key)
        .join(', ')}. That is valid, but the text will be the base game's wording.`,
    });
  }

  const languages = new Set(
    workspace.files
      .filter((file) => file.path.startsWith('localisation/'))
      .map((file) => analyseLocalisationFileName(file.path.split('/').pop()))
      .filter((analysis) => analysis.ok)
      .map((analysis) => analysis.language),
  );
  const missingLanguages = LOCALISATION_LANGUAGES.filter((language) => languages.has(language) === false);

  return {
    workspace_root: workspace.root,
    verdict: errors.length === 0 ? (warnings.length === 0 ? 'green' : 'warnings') : 'errors',
    error_count: errors.length,
    warning_count: warnings.length,
    errors: errors.slice(0, 200),
    warnings: warnings.slice(0, 200),
    stats: {
      ...workspace.stats,
      languages_present: [...languages].sort(),
      languages_absent: missingLanguages,
      definition_keys: [...workspace.definitions.entries()].map(([kind, map]) => ({
        kind,
        count: map.size,
      })),
      missing_localisation_count: missingLocalisation.length,
      vanilla_provided_localisation: vanillaProvided.length,
      override_files: overrideFiles.map((file) => file.path),
    },
    messages: [
      'This is a structural review, not a schema validation: it proves encoding, naming, bracket balance, duplicate definition keys, vanilla overrides and localisation coverage, and nothing about whether a trigger or modifier name exists in game.',
      'Run the game with -debug_mode and then call classify_error_log on the newest error.log for the errors only the engine can see.',
    ],
  };
}

// ------------------------------------------------------------------------------------
// generate_missing_localisation  (never writes)
// ------------------------------------------------------------------------------------

export function generateMissingLocalisation(args = {}, context = {}) {
  const workspaceRoot = typeof args.workspace_root === 'string' ? args.workspace_root : null;
  if (!workspaceRoot) throw new Error('`workspace_root` is required');
  const language = normaliseLanguage(args.language ?? 'english');
  const limit = clamp(args.limit ?? 200, 1, 1000);

  const workspace = openWorkspace(workspaceRoot);
  const existing = workspace.localisationKeys;
  const candidates = [];

  for (const [kind, definitions] of workspace.definitions) {
    for (const [key, location] of definitions) {
      const keys = [key, ...(kind === 'event' ? [] : [`${key}_desc`])];
      for (const candidate of keys) {
        if (existing.has(candidate)) continue;
        candidates.push({
          key: candidate,
          kind,
          defined_in: `${location.file}:${location.line}`,
          suggested_value: humanise(candidate),
        });
        if (candidates.length >= limit) break;
      }
      if (candidates.length >= limit) break;
    }
    if (candidates.length >= limit) break;
  }

  const reference = context.knowledge?.search('localisation-basics localisation-style') ?? [];

  return {
    dry_run: true,
    language,
    header: `l_${language}:`,
    file_name_hint: `<mod_prefix>_l_${language}.yml`,
    encoding: 'utf-8-bom',
    candidates,
    candidate_count: candidates.length,
    truncated: candidates.length >= limit,
    knowledge_topics: reference.map((topic) => ({
      id: topic.id,
      uri: `rstellariscribe://stellaris/knowledge/${topic.id}`,
    })),
    messages: [
      'This tool never writes files. Review the candidates, replace every suggested value with finished player-facing prose, then write the approved entries through generate_localisation_batch.',
      'Suggested values are placeholders derived from the key name. Shipping them unchanged puts placeholder text in front of players.',
      `This report only covers keys that are absent in every language. Pass \`language\` and compare per-language gaps with validate_stellaris_localisation for coverage holes.`,
    ],
  };
}

function humanise(key) {
  const tail = key.split('.').pop() ?? key;
  return tail
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .trim();
}

// ------------------------------------------------------------------------------------
// scan_unique_identifiers
// ------------------------------------------------------------------------------------

export function scanUniqueIdentifiers(args = {}) {
  const workspaceRoot = typeof args.workspace_root === 'string' ? args.workspace_root : null;
  if (!workspaceRoot) throw new Error('`workspace_root` is required');
  const workspace = openWorkspace(workspaceRoot);
  const intent = args.intent === 'create' ? 'create' : args.intent === 'edit' ? 'edit' : 'check';

  const requested = Array.isArray(args.identifiers) ? args.identifiers : null;
  const candidates = requested
    ? requested.map((entry) =>
        typeof entry === 'string'
          ? { key: entry, kind: null, intent }
          : { key: entry.key, kind: entry.kind ?? null, intent: entry.intent ?? intent },
      )
    : [...workspace.definitions.entries()].flatMap(([kind, map]) =>
        [...map.keys()].map((key) => ({ key, kind, intent })),
      );

  const results = candidates
    .filter((candidate) => typeof candidate.key === 'string' && candidate.key !== '')
    .map((candidate) => {
      const matches = [];
      const kinds = candidate.kind ? [candidate.kind] : [...workspace.definitions.keys()];
      for (const kind of kinds) {
        const found = workspace.definitions.get(kind)?.get(candidate.key);
        if (found) matches.push({ kind, file: found.file, line: found.line });
      }

      let availability = 'unknown';
      let available = null;
      if (candidate.intent === 'create') {
        availability = matches.length > 0 ? 'duplicate' : 'free';
        available = matches.length === 0;
      } else if (candidate.intent === 'edit') {
        availability = matches.length > 0 ? 'existing' : 'missing';
        available = matches.length > 0;
      }

      const pathCandidate = `${candidate.kind ? `${candidate.kind}/` : ''}${candidate.key}`;
      const pathRisk = matches.length === 0 ? 'no_file' : 'file_exists';

      return {
        key: candidate.key,
        kind: candidate.kind,
        intent: candidate.intent,
        availability,
        available,
        matches,
        path_risk: pathRisk,
        path_checked: pathCandidate,
      };
    });

  const duplicates = results.filter((result) => result.availability === 'duplicate');

  return {
    workspace_root: workspace.root,
    intent,
    scanned: results.length,
    duplicate_count: duplicates.length,
    results: results.slice(0, 500),
    truncated: results.length > 500,
    messages: [
      'A `duplicate` verdict means the key is already defined in this mod. Keep the existing definition and edit it instead of adding a second one.',
      'An `unknown` verdict means no intent was supplied: pass `intent` as `create` or `edit` to get a decision.',
    ],
  };
}

// ------------------------------------------------------------------------------------
// classify_error_log
// ------------------------------------------------------------------------------------

export const ERROR_LINE_MARKERS = [
  '[error',
  ' error ',
  'error:',
  'exception',
  'failed',
  'object key already exists',
  ' is not defined',
  'unexpected token',
  'unknown command',
];

const CATEGORY_RULES = [
  {
    category: 'sound_or_music',
    keywords: ['music', '.ogg', '.wav', 'sound file', 'audio', 'sound/'],
  },
  { category: 'localisation', keywords: ['localisation', 'localization', '.yml', 'invalid yaml', 'bom'] },
  { category: 'interface', keywords: ['gui', '.gui', 'sprite', '.gfx', 'texture', 'bitmapfont', 'font'] },
  { category: 'event', keywords: ['event', 'namespace', 'on_action'] },
  { category: 'decision', keywords: ['decision', 'resolution', 'edict', 'mandate'] },
  { category: 'technology', keywords: ['technology', 'tech_', 'research'] },
  { category: 'civic_or_modifier', keywords: ['civic', 'origin', 'authority', 'modifier', 'trait', 'ethic'] },
  { category: 'jobs_buildings_districts', keywords: ['job', 'building', 'district', 'pop', 'zone'] },
  { category: 'ship_or_component', keywords: ['ship', 'component', 'section', 'strike_craft', 'fleet'] },
  {
    category: 'map_or_system',
    keywords: ['system', 'planet', 'solar_system', 'initializer', 'starbase', 'megastructure', 'galaxy'],
  },
  { category: 'script_syntax', keywords: ['unknown command', 'unexpected token', 'token', 'database', 'parse'] },
];

/**
 * Match a keyword against a lowercased log line.
 *
 * Bare words are matched on word boundaries, because substring matching produces real
 * misclassifications: `virtualfilesystem_physfs` contains "system" and was reported as a
 * map/system error when the actual problem was a missing music file. Keywords that carry
 * punctuation (`.yml`, `tech_`, `sound/`) are matched as substrings, which is what makes
 * them useful in the first place.
 */
function keywordMatches(line, keyword) {
  if (/[._/]/.test(keyword)) return line.includes(keyword);
  return new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(line);
}

function classifyLogLine(line) {
  const rule = CATEGORY_RULES.find((candidate) =>
    candidate.keywords.some((keyword) => keywordMatches(line, keyword)),
  );
  return rule?.category ?? 'other';
}

export function classifyErrorLog(args = {}) {
  const errorLogPath = typeof args.error_log_path === 'string' ? args.error_log_path : null;
  if (!errorLogPath) throw new Error('`error_log_path` is required');
  if (!existsSync(errorLogPath)) throw new Error(`\`${errorLogPath}\` does not exist`);
  const limit = clamp(args.limit ?? 5, 1, 20);
  const changedPaths = (Array.isArray(args.changed_paths) ? args.changed_paths : []).map((path) =>
    String(path).replace(/\\/g, '/').toLowerCase(),
  );

  const content = readFileSync(errorLogPath, 'utf8');
  const buckets = new Map();
  let totalLines = 0;

  content.split(/\r?\n/).forEach((line, index) => {
    totalLines += 1;
    const lower = line.toLowerCase();
    if (!ERROR_LINE_MARKERS.some((marker) => lower.includes(marker))) return;
    const category = classifyLogLine(lower);
    if (!buckets.has(category)) buckets.set(category, []);
    buckets.get(category).push({ line: index + 1, message: line.trim() });
  });

  const categories = [...buckets.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([category, entries]) => {
      const messages = entries
        .map((entry) => entry.message.replace(/\\/g, '/'))
        .join('\n')
        .toLowerCase();
      return {
        category,
        count: entries.length,
        examples: entries.slice(0, limit),
        likely_changed_paths: changedPaths.filter((path) => messages.includes(path)),
      };
    });

  return {
    error_log_path: errorLogPath,
    total_lines: totalLines,
    error_lines: categories.reduce((sum, category) => sum + category.count, 0),
    categories,
    messages: [
      'Use this summary to target the files that introduced errors; do not rewrite unrelated files or reset version control state.',
      'The engine log is the only authority on unknown triggers, effects and modifiers. A clean structural review does not replace it.',
    ],
  };
}

// ------------------------------------------------------------------------------------
// explain_stellaris_diagnostic
// ------------------------------------------------------------------------------------

export function explainStellarisDiagnostic(args = {}, context = {}) {
  const message = typeof args.message === 'string' && args.message.trim() !== '' ? args.message.trim() : null;
  const errorLogPath = typeof args.error_log_path === 'string' ? args.error_log_path : null;
  const lineNumber = Number.isFinite(Number(args.line)) ? Number(args.line) : null;

  let text = message;
  if (!text && errorLogPath) {
    if (!existsSync(errorLogPath)) throw new Error(`\`${errorLogPath}\` does not exist`);
    const lines = readFileSync(errorLogPath, 'utf8').split(/\r?\n/);
    if (lineNumber !== null) {
      text = lines[lineNumber - 1] ?? null;
    } else {
      const last = lines.filter((line) => line.trim() !== '').at(-1) ?? null;
      text = last;
    }
  }
  if (!text) throw new Error('provide `message`, or `error_log_path` and optionally `line`');

  const lower = text.toLowerCase();
  const category = classifyLogLine(lower);
  const explicit = ERROR_LINE_MARKERS.some((marker) => lower.includes(marker));

  // Knowledge search requires every term to match, which is the wrong shape for a
  // log line: a path or a version number in the message would filter everything
  // out. Try the whole term set first, then widen to a union of single-term hits.
  const stopwords = new Set([
    'with', 'from', 'that', 'this', 'have', 'when', 'into', 'error', 'failed', 'cannot', 'could',
    'file', 'files', 'line', 'while', 'which', 'there', 'their', 'about', 'after', 'before',
  ]);
  const searchTerms = [
    ...new Set(
      lower
        .replace(/[^a-z0-9_ ]+/g, ' ')
        .split(/\s+/)
        .filter((word) => word.length > 3 && !stopwords.has(word)),
    ),
  ].slice(0, 6);

  let topics = searchTerms.length > 0 ? (context.knowledge?.search(searchTerms.join(' ')) ?? []) : [];
  let matched_all_terms = topics.length > 0;
  if (topics.length === 0 && searchTerms.length > 0) {
    const merged = new Map();
    for (const term of searchTerms) {
      for (const topic of context.knowledge?.search(term) ?? []) {
        if (!merged.has(topic.id)) merged.set(topic.id, topic);
      }
    }
    topics = [...merged.values()];
    matched_all_terms = false;
  }

  return {
    message: text,
    looks_like_error: explicit,
    category,
    search_terms: searchTerms,
    matched_all_terms,
    knowledge_topics: topics.slice(0, 6).map((topic) => ({
      id: topic.id,
      title: topic.title,
      uri: `rstellariscribe://stellaris/knowledge/${topic.id}`,
      validation: topic.validation.slice(0, 4),
      related: topic.file_types,
    })),
    guidance: guidanceFor(category),
    messages: [
      'This is a knowledge lookup keyed on the wording of the log line, not a parser for the engine. Read the returned topic and check the file it names by hand.',
      explicit
        ? 'The line matches the markers Stellaris writes for a real error.'
        : 'The line does not match the usual error markers; it may be informational, or the real error may be on a nearby line.',
    ],
  };
}

function guidanceFor(category) {
  switch (category) {
    case 'localisation':
      return 'Check the BOM, the `_l_<language>.yml` suffix and the `l_<language>:` first line before anything else; a broken localisation file is skipped silently.';
    case 'interface':
      return 'Check that every referenced `GFX_` sprite is defined in a `.gfx` file and that the file paths and extensions match the files on disk.';
    case 'sound_or_music':
      return 'A missing sound or music file is reported at load but is usually harmless: it means the mod references an asset it does not ship, or ships it in the wrong folder. Fix the path or drop the reference.';
    case 'script_syntax':
      return 'Read the quoted file and line: this is usually an unknown key, a misspelled block or an unbalanced brace.';
    case 'map_or_system':
      return 'Check identifiers first: a system initializer or planet class that does not exist fails at generation time, not at load time.';
    default:
      return 'Start from the file the log names, confirm the definition key exists exactly once, and confirm its localisation keys are present.';
  }
}

// ------------------------------------------------------------------------------------
// format_paradox_script
// ------------------------------------------------------------------------------------

export function formatParadoxScript(args = {}) {
  const script = typeof args.script === 'string' ? args.script : null;
  if (script === null || script.trim() === '') throw new Error('`script` is required');
  const formatted = formatParadoxSource(script, { indent: args.indent === 'spaces' ? '    ' : '\t' });
  const structure = checkScriptStructure(formatted);
  return {
    changed: formatted !== script,
    formatted,
    errors: structure.errors,
    warnings: structure.warnings,
    messages: [
      'Formatting does not change meaning, but it does change diffs. Reformat only the files you already changed.',
    ],
  };
}

// ------------------------------------------------------------------------------------
// edit_stellaris_script_file
// ------------------------------------------------------------------------------------

export function editStellarisScriptFile(args = {}) {
  const workspaceRoot = typeof args.workspace_root === 'string' ? args.workspace_root : null;
  if (!workspaceRoot) throw new Error('`workspace_root` is required');
  const path = typeof args.path === 'string' ? args.path : null;
  if (!path) throw new Error('`path` is required');
  const find = typeof args.find === 'string' ? args.find : null;
  if (find === null || find === '') throw new Error('`find` is required');
  const replace = typeof args.replace === 'string' ? args.replace : '';
  const dryRun = args.dry_run !== false;

  const resolved = resolveModRelativePath(path);
  if (!resolved.ok) throw new Error(`\`${path}\`: ${resolved.reason}`);
  const root = resolve(workspaceRoot);
  const absolute = join(root, resolved.path.split('/').join(sep));
  if (!absolute.startsWith(root)) {
    throw new Error(`refusing to edit \`${resolved.path}\`: it resolves outside the workspace root`);
  }
  if (!existsSync(absolute)) {
    throw new Error(`\`${resolved.path}\` does not exist; this tool edits files, it does not create them`);
  }

  const original = readFileSync(absolute, 'utf8');
  const occurrences = original.split(find).length - 1;
  if (occurrences === 0) {
    throw new Error('`find` does not occur in the file; nothing was changed');
  }
  const expected = args.expected_replacements;
  if (expected !== undefined && Number(expected) !== occurrences) {
    throw new Error(
      `\`find\` occurs ${occurrences} time(s) but expected_replacements is ${expected}; refusing an ambiguous edit`,
    );
  }
  const updated = original.replaceAll(find, replace);

  const before = checkScriptStructure(original, resolved.path);
  const after = checkScriptStructure(updated, resolved.path);

  const result = {
    path: resolved.path,
    dry_run: dryRun,
    occurrences,
    before: { errors: before.errors.length, warnings: before.warnings.length },
    after: { errors: after.errors.length, warnings: after.warnings.length },
    diff_preview: buildDiffPreview(original, updated, find, replace),
    messages: [],
  };

  if (dryRun) {
    result.messages.push('dry-run only; the file was not modified');
    return result;
  }
  if (after.errors.length > before.errors.length) {
    throw new Error(
      'the edit would introduce structural errors, so it was refused:\n- ' +
        after.errors.map((error) => `line ${error.line}: ${error.message}`).join('\n- '),
    );
  }
  writeFileSync(absolute, updated, 'utf8');
  result.messages.push('the file was updated');
  return result;
}

function buildDiffPreview(original, updated, find, replace) {
  const before = original.split(/\r?\n/);
  const after = updated.split(/\r?\n/);
  const removed = [];
  const added = [];
  for (let index = 0; index < Math.max(before.length, after.length); index += 1) {
    if (before[index] === after[index]) continue;
    if (before[index] !== undefined) removed.push(`- ${before[index]}`);
    if (after[index] !== undefined) added.push(`+ ${after[index]}`);
    if (removed.length + added.length > 20) break;
  }
  return { find, replace, removed: removed.slice(0, 10), added: added.slice(0, 10) };
}
