//------------------------------------------------------------------------------------
// workspace.mjs -- Part of RStellarScribe
//
// A native replacement for RHoiScribe's CWT-backed language workspace. Stellaris
// ships no schema, so instead of a symbol table this builds the index that can be
// proven from the files themselves: descriptor metadata, the file inventory,
// definition keys per subsystem, and the localisation keys that exist.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//------------------------------------------------------------------------------------

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

import { findEventIds, findTopLevelDefinitions } from './paradox.mjs';
import { parseLocalisationFile } from './localisation.mjs';
import { analyseLocalisationFileName } from './paths.mjs';

/**
 * Databases whose top-level block NAME is a type keyword and whose real definition key sits
 * inside the block as `key = "..."`:
 *
 *   component_set = { key = "MUSTERING_PLATFORM" ... }
 *   utility_component_template = { key = "MUSTERING_PLATFORM" ... }
 *   section_template = { key = "..." ... }
 *
 * Treating the block name as the key makes every such file look like it defines one entity
 * called `component_set`, which then shows up as a bogus "missing localisation" entry.
 */
export const TYPE_KEYED_ENTITY_KINDS = new Set([
  'component_set',
  'component_template',
  'section_template',
  'message_type',
  'special_project',
]);

/** Collect the `key = "..."` values (and their lines) from a type-keyed database file. */
export function findTypeKeys(text) {
  const keys = [];
  const pattern = /(^|\n)[ \t]*key[ \t]*=[ \t]*"([^"]+)"/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const line = text.slice(0, match.index).split('\n').length;
    keys.push({ key: match[2], line });
  }
  return keys;
}

const SKIP_DIRECTORIES = new Set(['.git', '.github', 'node_modules', '.vscode', '__pycache__']);
const SCRIPT_EXTENSIONS = ['.txt', '.gui', '.gfx', '.asset', '.mod'];

/**
 * `common/<folder>` -> the entity kind that folder defines. Keys are the real
 * directory names in Stellaris 4.1.7; `common/archaeological_site_types` and
 * `common/bypass` are singular, and 4.0 added `zones` and `zone_slots`.
 */
export const COMMON_ENTITY_KINDS = {
  anomalies: 'anomaly',
  archaeological_site_types: 'archaeological_site',
  artifact_actions: 'artifact_action',
  ascension_perks: 'ascension_perk',
  astral_actions: 'astral_action',
  buildings: 'building',
  bypass: 'bypass',
  component_sets: 'component_set',
  component_templates: 'component_template',
  council_agendas: 'council_agenda',
  crisis_paths: 'crisis_path',
  decisions: 'decision',
  deposits: 'deposit',
  districts: 'district',
  edicts: 'edict',
  ethics: 'ethic',
  event_chains: 'event_chain',
  federation_types: 'federation_type',
  game_rules: 'game_rule',
  governments: 'government',
  leader_classes: 'leader_class',
  megastructures: 'megastructure',
  missions: 'mission',
  mutations: 'mutation',
  on_actions: 'on_action',
  opinion_modifiers: 'opinion_modifier',
  planet_classes: 'planet_class',
  planet_modifiers: 'planet_modifier',
  policies: 'policy',
  pop_faction_types: 'pop_faction_type',
  pop_jobs: 'pop_job',
  precursor_civilizations: 'precursor_civilization',
  relics: 'relic',
  resolutions: 'resolution',
  scripted_effects: 'scripted_effect',
  scripted_loc: 'scripted_loc',
  scripted_modifiers: 'scripted_modifier',
  scripted_triggers: 'scripted_trigger',
  scripted_variables: 'scripted_variable',
  section_templates: 'section_template',
  sector_types: 'sector_type',
  ship_sizes: 'ship_size',
  situations: 'situation',
  solar_system_initializers: 'solar_system_initializer',
  special_projects: 'special_project',
  species_classes: 'species_class',
  specimens: 'specimen',
  star_classes: 'star_class',
  starbase_buildings: 'starbase_building',
  starbase_modules: 'starbase_module',
  starbase_types: 'starbase_type',
  static_modifiers: 'static_modifier',
  storm_types: 'storm_type',
  system_types: 'system_type',
  technology: 'technology',
  tradition_categories: 'tradition_category',
  traditions: 'tradition',
  traits: 'trait',
  war_goals: 'war_goal',
  zone_slots: 'zone_slot',
  zones: 'zone',
};

/**
 * Top-level keys a file kind may repeat BY DESIGN, so a second occurrence is not a duplicate
 * definition.
 *
 * `common/scripted_loc/*.txt` is the case that produced 42 false findings on a real mod: that file
 * kind is `defined_text = { name = Get... value = ... }` repeated once per function, which is both
 * this mod's own working pattern and vanilla's. The uniqueness constraint that IS real inside such a
 * file is the `name = "..."` INSIDE each block.
 *
 * Deliberately a set of EXACT `<kind>:<key>` pairs rather than "anything that repeats is fine": the
 * repeatable form is a property of the engine's parser for that file kind, and a key that merely
 * happens to be written twice in an ordinary kind is exactly the duplicate this check exists to
 * catch.
 */
export const REPEATABLE_SECTION_KEYS = new Set([
  'scripted_loc:defined_text',
  // Vanilla repeats these inside their own container files, for the same reason.
  'component_set:component_set',
  'component_template:utility_component_template',
  'section_template:section_template',
  'special_project:special_project',
  'message_type:message_type',
]);

/** True when this key may legally appear more than once in a file of this kind. */
export function isRepeatableSectionKey(kind, key) {
  return REPEATABLE_SECTION_KEYS.has(`${kind}:${String(key).toLowerCase()}`);
}

export class WorkspaceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WorkspaceError';
  }
}

/** Scan a mod root into the index every other tool works from. */
export function openWorkspace(root, { maxFiles = 20000 } = {}) {
  const resolvedRoot = resolve(root);
  let rootStat;
  try {
    rootStat = statSync(resolvedRoot);
  } catch {
    throw new WorkspaceError(`mod root \`${resolvedRoot}\` does not exist`);
  }
  if (!rootStat.isDirectory()) {
    throw new WorkspaceError(`mod root \`${resolvedRoot}\` is not a directory`);
  }

  const files = [];
  const walk = (directory) => {
    if (files.length > maxFiles) return;
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name)) continue;
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      let size = 0;
      try {
        size = statSync(full).size;
      } catch {
        continue;
      }
      files.push({
        path: relative(resolvedRoot, full).split(sep).join('/'),
        absolute: full,
        size,
      });
      if (files.length > maxFiles) return;
    }
  };
  walk(resolvedRoot);

  const descriptorPath = join(resolvedRoot, 'descriptor.mod');
  const descriptor = files.some((file) => file.path === 'descriptor.mod')
    ? parseDescriptor(readFileSync(descriptorPath, 'utf8'))
    : null;

  const definitions = new Map();
  const localisationKeys = new Map();
  const errors = [];

  for (const file of files) {
    if (file.path.startsWith('localisation/') && file.path.toLowerCase().endsWith('.yml')) {
      const analysis = analyseLocalisationFileName(file.path.split('/').pop());
      const language = analysis.ok ? analysis.language : 'unknown';
      try {
        for (const [key, value] of parseLocalisationFile(readFileSync(file.absolute))) {
          if (!localisationKeys.has(key)) {
            localisationKeys.set(key, { file: file.path, language, value });
          }
        }
      } catch (thrown) {
        errors.push({ file: file.path, message: thrown.message });
      }
      continue;
    }

    const kind = entityKindForPath(file.path);
    if (!kind) continue;
    let text;
    try {
      text = readFileSync(file.absolute, 'utf8');
    } catch (thrown) {
      errors.push({ file: file.path, message: thrown.message });
      continue;
    }
    // An event file's top-level keys are event type keywords, not definition keys, so
    // its identifiers come from the `id = namespace.number` lines instead.
    const found =
      kind === 'event'
        ? findEventIds(text).map((key) => ({ key, line: 0 }))
        : TYPE_KEYED_ENTITY_KINDS.has(kind)
          ? findTypeKeys(text)
          : findTopLevelDefinitions(text);
    for (const definition of found) {
      // A REPEATABLE section is not a definition key at all: `common/scripted_loc/*.txt` declares
      // `defined_text` once per function by design, so a second one is the file working, not a
      // duplicate. Without this exemption the real mod reported 42 false errors, one per block.
      if (isRepeatableSectionKey(kind, definition.key)) continue;
      if (!definitions.has(kind)) definitions.set(kind, new Map());
      const kindMap = definitions.get(kind);
      if (!kindMap.has(definition.key)) {
        kindMap.set(definition.key, { file: file.path, line: definition.line });
      } else {
        const previous = kindMap.get(definition.key);
        errors.push({
          file: file.path,
          message: `duplicate ${kind} key \`${definition.key}\` also defined in ${previous.file}:${previous.line}`,
        });
      }
    }
  }

  return {
    root: resolvedRoot,
    descriptor,
    files,
    definitions,
    localisationKeys,
    errors,
    truncated: files.length > maxFiles,
    stats: {
      files: files.length,
      script_files: files.filter((file) => SCRIPT_EXTENSIONS.some((ext) => file.path.endsWith(ext))).length,
      localisation_files: files.filter(
        (file) => file.path.startsWith('localisation/') && file.path.toLowerCase().endsWith('.yml'),
      ).length,
      localisation_keys: localisationKeys.size,
      entity_kinds: definitions.size,
    },
  };
}

/** Nested `common/` folders whose entity kind differs from their parent folder. */
export const NESTED_ENTITY_KINDS = {
  'governments/civics': 'civic',
  'governments/authorities': 'authority',
  'decisions/categories': 'decision_category',
  'technology/tier': 'technology_tier',
};

/** Map a mod-relative path onto the entity kind it defines, if any. */
export function entityKindForPath(path) {
  const segments = path.split('/');
  if (segments[0] === 'common' && segments.length >= 3) {
    const nested = `${segments[1]}/${segments[2]}`;
    if (NESTED_ENTITY_KINDS[nested]) return NESTED_ENTITY_KINDS[nested];
    return COMMON_ENTITY_KINDS[segments[1]] ?? null;
  }
  if (segments[0] === 'events' && segments.length >= 2) return 'event';
  return null;
}

/** Parse `descriptor.mod`, including its block-valued fields. */
export function parseDescriptor(text) {
  const fields = {};
  const blocks = {};
  const withoutComments = text.replace(/#[^\n]*/g, '');
  const pattern = /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*("(?:[^"\\]|\\.)*"|\{[^}]*\})/g;
  let match;
  while ((match = pattern.exec(withoutComments)) !== null) {
    const key = match[1];
    const rawValue = match[2];
    if (rawValue.startsWith('{')) {
      const items = [...rawValue.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((entry) => entry[1]);
      blocks[key] = items;
    } else {
      fields[key] = rawValue.slice(1, -1).replace(/\\(.)/g, '$1');
    }
  }
  return { fields, blocks, raw: text };
}

/** Everything the validators need about one file, without re-reading it twice. */
export function readWorkspaceFile(workspace, relativePath) {
  const normalised = relativePath.replace(/\\/g, '/');
  const entry = workspace.files.find((file) => file.path === normalised);
  if (!entry) {
    throw new WorkspaceError(`\`${normalised}\` is not part of the workspace at ${workspace.root}`);
  }
  return { entry, bytes: readFileSync(entry.absolute) };
}
