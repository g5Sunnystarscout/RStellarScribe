//------------------------------------------------------------------------------------
// game-signatures.mjs -- Part of RStellarisScribe
//
// Parses the game's own script documentation, which every Stellaris install generates into
// the user data folder:
//
//   logs/script_documentation/effects.log    <name> - <desc> / <signature> / Supported Scopes: ...
//   logs/script_documentation/triggers.log   same shape
//   logs/script_documentation/modifiers.log  "- <name>, Category: <category>"
//   logs/script_documentation/scopes.log
//
// This is the authoritative list of effect/trigger names and the scopes they accept, which is
// what makes it possible to catch a script that names something that does not exist (a live
// test produced `every_ship`, which is not an iterator at all) or uses a documented effect in
// the wrong scope (`has_technology` evaluated where the starbase is the scope).
//
// This program is free software: you can redistribute it and/or modify it under the terms of
// the GNU Affero General Public License as published by the Free Software Foundation, either
// version 3 of the License, or (at your option) any later version.
//------------------------------------------------------------------------------------

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Candidate locations of the script documentation, in priority order. */
export function candidateDocsDirs({ gameRoot, userDataPath } = {}) {
  const dirs = [];
  const suffixes = [
    join('logs', 'script_documentation'),
    join('Paradox Interactive', 'Stellaris', 'logs', 'script_documentation'),
  ];
  const bases = [];
  if (userDataPath) bases.push(userDataPath);
  if (process.env.USERPROFILE) {
    bases.push(join(process.env.USERPROFILE, 'Documents'));
    bases.push(join(process.env.USERPROFILE, 'Documents', 'Paradox Interactive', 'Stellaris'));
  }
  if (process.env.HOME) bases.push(join(process.env.HOME, 'Documents'));
  if (gameRoot) bases.push(gameRoot);
  for (const base of bases) {
    for (const suffix of suffixes) dirs.push(join(base, suffix));
  }
  return [...new Set(dirs)];
}

/** Locate the documentation directory, or null when the game has never been run. */
export function findDocsDir(options = {}) {
  for (const dir of candidateDocsDirs(options)) {
    try {
      if (existsSync(dir) && statSync(dir).isDirectory() && existsSync(join(dir, 'effects.log'))) {
        return dir;
      }
    } catch {
      // Unreadable candidates are simply skipped.
    }
  }
  return null;
}

/** Strip the engine's `[HH:MM:SS][file.cpp:line]: ` prefix. */
function stripLogPrefix(line) {
  return line.replace(/^\[\d{2}:\d{2}:\d{2}\]\[[^\]]*\]:\s?/, '');
}

/**
 * Parse an effects.log / triggers.log file into `name -> { scopes, signature, description }`.
 * Entries are separated by a `Supported Scopes:` line; the first line of each entry is
 * `<name> - <description>` (some entries have no description separator).
 */
export function parseSignatureLog(text, kind) {
  const entries = new Map();
  let block = [];
  const flush = () => {
    if (block.length === 0) return;
    const scopes = block.find((line) => line.startsWith('Supported Scopes:'));
    const nameLine = block.find((line) => line.trim() !== '' && !line.startsWith('Supported Scopes:'));
    if (nameLine) {
      const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*(?:-\s*(.*))?$/.exec(nameLine.trim());
      if (match) {
        const signature = block
          .filter((line) => !line.startsWith('Supported Scopes:') && line !== nameLine)
          .join('\n')
          .trim();
        entries.set(match[1], {
          kind,
          name: match[1],
          description: (match[2] ?? '').trim(),
          scopes: scopes
            ? scopes
                .slice('Supported Scopes:'.length)
                .trim()
                .split(/[\s,]+/)
                .filter(Boolean)
            : [],
          signature,
        });
      }
    }
    block = [];
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripLogPrefix(rawLine);
    if (line.trim() === '' || line.startsWith('==')) {
      if (line.trim() === '') flush();
      continue;
    }
    block.push(line);
    if (line.startsWith('Supported Scopes:')) flush();
  }
  flush();
  return entries;
}

/** Parse modifiers.log (`- name, Category: X`) into a name -> category map. */
export function parseModifierLog(text) {
  const entries = new Map();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripLogPrefix(rawLine).trim();
    const match = /^-\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*Category:\s*(.+)$/.exec(line);
    if (match) entries.set(match[1], { name: match[1], category: match[2].trim() });
  }
  return entries;
}

/** Parse scopes.log, which lists the scope types the engine knows. */
export function parseScopeLog(text) {
  const scopes = new Set();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripLogPrefix(rawLine).trim();
    if (line === '' || line.startsWith('==') || line.startsWith('--')) continue;
    const match = /^([a-z_][a-z0-9_]*)\s*(?:-|$)/.exec(line);
    if (match) scopes.add(match[1]);
  }
  return scopes;
}

/**
 * Load the whole documentation set once. Returns null when the docs are missing, so callers
 * can report that the game has to be run at least once instead of failing.
 */
export function loadGameSignatures({ docsDir, gameRoot, userDataPath } = {}) {
  const dir = docsDir && existsSync(docsDir) ? docsDir : findDocsDir({ gameRoot, userDataPath });
  if (!dir) return null;

  const read = (name) => {
    const path = join(dir, name);
    if (!existsSync(path)) return null;
    return readFileSync(path, 'utf8');
  };

  const effectsText = read('effects.log');
  const triggersText = read('triggers.log');
  if (!effectsText && !triggersText) return null;

  const effects = effectsText ? parseSignatureLog(effectsText, 'effect') : new Map();
  const triggers = triggersText ? parseSignatureLog(triggersText, 'trigger') : new Map();
  const modifiersText = read('modifiers.log');
  const modifiers = modifiersText ? parseModifierLog(modifiersText) : new Map();
  const scopesText = read('scopes.log');
  const scopes = scopesText ? parseScopeLog(scopesText) : new Set();

  return {
    docsDir: dir,
    effects,
    triggers,
    modifiers,
    scopes,
    /** Every documented script name, for "does this exist at all" checks. */
    has(name) {
      return effects.has(name) || triggers.has(name);
    },
    lookup(name) {
      return effects.get(name) ?? triggers.get(name) ?? null;
    },
    stats: {
      effects: effects.size,
      triggers: triggers.size,
      modifiers: modifiers.size,
      scopes: scopes.size,
    },
  };
}

/**
 * The scope-changing keys the checker follows, and what they move to. Deliberately partial:
 * an unknown key leaves the scope `unknown`, and unknown scopes are never reported, so the
 * checker stays quiet instead of producing noise.
 */
export const SCOPE_SWITCHES = {
  owner: 'country',
  from: 'country',
  controller: 'country',
  overlord: 'country',
  capital_scope: 'planet',
  capital_star: 'galactic_object',
  solar_system: 'galactic_object',
  star: 'galactic_object',
  planet: 'planet',
  species: 'species',
  leader: 'leader',
  fleet: 'fleet',
  ship: 'ship',
  starbase: 'starbase',
  pop: 'pop',
  pop_group: 'pop_group',
  every_owned_ship: 'ship',
  random_owned_ship: 'ship',
  any_owned_ship: 'ship',
  ordered_owned_ship: 'ship',
  every_owned_planet: 'planet',
  random_owned_planet: 'planet',
  any_owned_planet: 'planet',
  every_owned_colony: 'planet',
  random_owned_colony: 'planet',
  every_owned_fleet: 'fleet',
  random_owned_fleet: 'fleet',
  any_owned_fleet: 'fleet',
  every_fleet_in_system: 'fleet',
  every_system_planet: 'planet',
  random_system_planet: 'planet',
  every_country: 'country',
  random_country: 'country',
  any_country: 'country',
};

/**
 * The root scope of an event, by event type. Verified against 4.4.6 (see the event type
 * table in the knowledge base). Unknown types simply skip scope checking.
 */
export const EVENT_ROOT_SCOPES = {
  country_event: 'country',
  planet_event: 'planet',
  fleet_event: 'fleet',
  ship_event: 'ship',
  situation_event: 'situation',
  starbase_event: 'starbase',
  system_event: 'galactic_object',
  leader_event: 'leader',
  pop_group_event: 'pop_group',
  first_contact_event: 'first_contact',
  espionage_operation_event: 'espionage_operation',
  pop_faction_event: 'pop_faction',
};

/**
 * Blocks whose scope is fixed no matter which file they appear in. `potential_construction`
 * and `possible_construction` are evaluated in the builder scope (a starbase), which is why
 * `has_technology` - a country trigger - reports "Wrong scope for trigger" there.
 */
export const CONTEXT_SCOPES = {
  potential_country: 'country',
  potential_construction: 'starbase',
  possible_construction: 'starbase',
  on_start: 'situation',
  on_monthly: 'situation',
  on_progress_complete: 'situation',
  on_fail: 'situation',
  on_abort: 'situation',
  on_enabled: 'country',
  on_disabled: 'country',
};

/** Keys that introduce an effect context. */
export const EFFECT_CONTEXT_KEYS = new Set([
  'immediate',
  'after',
  'effect',
  'hidden_effect',
  'on_start',
  'on_monthly',
  'on_progress_complete',
  'on_fail',
  'on_abort',
  'on_enabled',
  'on_disabled',
  'on_queued',
  'on_unqueued',
  'on_select',
  'on_enter',
  'on_first_enter',
  'if',
  'else',
  'else_if',
  'while',
  'random_list',
  'locked_random_list',
  'switch',
]);

/** Keys that introduce a trigger context. */
export const TRIGGER_CONTEXT_KEYS = new Set([
  'trigger',
  'potential',
  'potential_country',
  'potential_construction',
  'possible_construction',
  'possible',
  'allow',
  'limit',
  'abort_trigger',
  'button_visible',
  'button_clickable',
  'selectable',
  'finished',
  'hide_from_context_menu',
  'species_potential_add',
  'species_possible_remove',
  'species_possible_merge_add',
  'potential_override',
  'show_tech_unlock_if',
]);

/** Effect-only iterators/controls that may appear as `key = {` inside an effect context. */
export const EFFECT_CONTROL_KEYS = new Set([
  'if',
  'else',
  'else_if',
  'while',
  'random_list',
  'locked_random_list',
  'switch',
  'inline_script',
  'custom_tooltip',
  'hidden_effect',
  'tooltip',
  'show_sound',
]);

export default {
  EVENT_ROOT_SCOPES,
  CONTEXT_SCOPES,
  loadGameSignatures,
  findDocsDir,
  candidateDocsDirs,
  parseSignatureLog,
  parseModifierLog,
  parseScopeLog,
  SCOPE_SWITCHES,
  EFFECT_CONTEXT_KEYS,
  TRIGGER_CONTEXT_KEYS,
  EFFECT_CONTROL_KEYS,
};
