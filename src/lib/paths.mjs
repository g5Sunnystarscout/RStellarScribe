//------------------------------------------------------------------------------------
// paths.mjs -- Part of RStellarScribe
//
// Mod-root-relative path handling and Stellaris layout knowledge. Every write
// tool funnels through `resolveModRelativePath`, so the same rejections apply to
// dry runs and real writes: unsafe paths never reach the filesystem, and the
// reported plan always matches what would be written.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//------------------------------------------------------------------------------------

import { existsSync, readdirSync } from 'node:fs';
import { isAbsolute, join, normalize, resolve, sep } from 'node:path';

/**
 * Top-level entries a Stellaris mod root may contain. Taken from the top-level
 * directory listing of Stellaris 4.1.7, restricted to what a mod can ship. Anything
 * else is reported as a warning, never a hard failure: the game tolerates extra
 * folders, and an explicit `game_root` cross-check is authoritative.
 */
export const KNOWN_TOP_LEVEL = [
  'common',
  'events',
  'localisation',
  'gfx',
  'interface',
  'map',
  'music',
  'sound',
  'flags',
  'fonts',
  'prescripted_countries',
  'descriptor.mod',
  'thumbnail.png',
  'README.md',
  'LICENSE',
];

/**
 * Subfolders of `common/` in Stellaris 4.1.7, generated from the installed game's
 * own directory listing. `map/` is top-level, and `buildable_districts`,
 * `strike_craft`, `leaders`, `custom_tooltips` and `event_modifiers` do not exist
 * in this version; 4.0 added `zones` and `zone_slots`.
 */
export const KNOWN_COMMON_SUBFOLDERS = [
  'achievements',
  'agreement_presets',
  'agreement_resources',
  'agreement_terms',
  'agreement_term_values',
  'ai_budget',
  'ai_espionage',
  'ambient_objects',
  'anomalies',
  'archaeological_site_types',
  'armies',
  'artifact_actions',
  'ascension_perks',
  'asteroid_belts',
  'astral_actions',
  'astral_rifts',
  'attitudes',
  'bombardment_stances',
  'buildings',
  'button_effects',
  'bypass',
  'casus_belli',
  'cloaking_strength_levels',
  'colony_automation',
  'colony_automation_categories',
  'colony_automation_exceptions',
  'colony_types',
  'colors',
  'component_sets',
  'component_slot_templates',
  'component_tags',
  'component_templates',
  'council_agendas',
  'country_container',
  'country_customization',
  'country_focus',
  'country_limits',
  'country_types',
  'crisis_levels',
  'crisis_objectives',
  'crisis_paths',
  'decisions',
  'defines',
  'deposit_categories',
  'deposits',
  'diplomacy_economy',
  'diplo_phrases',
  'diplomatic_actions',
  'districts',
  'dust_clouds',
  'dynamic_text',
  'economic_categories',
  'economic_plans',
  'edicts',
  'espionage_assets',
  'espionage_operation_categories',
  'espionage_operation_types',
  'ethic_categories',
  'ethics',
  'event_chains',
  'fallen_empires',
  'federation_law_categories',
  'federation_laws',
  'federation_perks',
  'federation_types',
  'first_contact',
  'galactic_community_actions',
  'galactic_focuses',
  'game_concept_categories',
  'game_concepts',
  'game_rules',
  'gamesetup_settings',
  'global_ship_designs',
  'governments',
  'graphical_culture',
  'greeting_overlay_sounds',
  'inline_scripts',
  'intel_categories',
  'intel_levels',
  'job_tags',
  'lawsuits',
  'leader_classes',
  'leader_tiers',
  'map_modes',
  'megastructures',
  'menace_perks',
  'message_types',
  'missions',
  'mutations',
  'name_lists',
  'named_colors',
  'notification_modifiers',
  'observation_station_missions',
  'on_actions',
  'opinion_modifiers',
  'patrons',
  'personalities',
  'planet_classes',
  'planet_modifiers',
  'policies',
  'pop_categories',
  'pop_faction_types',
  'pop_jobs',
  'portrait_categories',
  'portrait_sets',
  'precursor_civilizations',
  'prescripted_flags',
  'random_names',
  'relics',
  'resolution_categories',
  'resolution_groups',
  'resolutions',
  'script_values',
  'scripted_effects',
  'scripted_loc',
  'scripted_modifiers',
  'scripted_triggers',
  'scripted_variables',
  'section_templates',
  'sector_focuses',
  'sector_types',
  'ship_behaviors',
  'ship_categories',
  'ship_sets',
  'ship_sizes',
  'situations',
  'solar_system_initializers',
  'special_projects',
  'specialist_subject_perks',
  'specialist_subject_types',
  'species_archetypes',
  'species_classes',
  'species_names',
  'species_rights',
  'specimens',
  'star_classes',
  'starbase_buildings',
  'starbase_levels',
  'starbase_modules',
  'starbase_types',
  'start_screen_messages',
  'static_modifiers',
  'storm_types',
  'strategic_resources',
  'system_tooltips',
  'system_types',
  'target_types',
  'technology',
  'technology_ages',
  'terraform',
  'timeline_events',
  'tradable_actions',
  'tradition_categories',
  'traditions',
  'trait_tags',
  'traits',
  'war_goals',
  'zone_slots',
  'zones',
];

/** Localisation languages Stellaris reads, as used in `l_<language>:` headers. */
export const LOCALISATION_LANGUAGES = [  'english',
  'braz_por',
  'french',
  'german',
  'polish',
  'russian',
  'spanish',
  'simp_chinese',
  'japanese',
  'korean',
];

/**
 * `tags` values observed across 33 installed .mod files and 32 descriptor.mod files
 * in Stellaris 4.1.7. This is the observed set, not a published allow-list, so an
 * unknown tag is a warning rather than a rejection.
 */
export const KNOWN_DESCRIPTOR_TAGS = [
  'Sound',
  'Galaxy Generation',
  'Graphics',
  'Translation',
  'Species',
  'Leaders',
  'Utilities',
  'Gameplay',
  'Buildings',
  'Loading Screen',
  'Overhaul',
  'Military',
  'Events',
];

/** The Stellaris version this build's knowledge was verified against. */
export const VERIFIED_GAME_VERSION = '4.1.7';

/**
 * Why this exists: Stellaris silently fails to mount a local mod whose folder path
 * contains non-ASCII characters. The `.mod` descriptor is still parsed - so the engine
 * happily reports things like an invalid `supported_version` for it - but none of the
 * mod's content is ever loaded, and **nothing about the failure reaches error.log**.
 *
 * Verified live on Stellaris 4.4.6 with a duplicate-key probe that the engine logs by
 * filename: the identical mod mounted from `<mods>\vanadic_species` produced
 * the log line, and the same mod at
 * `C:\Users\<non-ASCII>\Documents\Paradox Interactive\Stellaris\mod\vanadic_species`
 * produced nothing.
 *
 * This is a common trap on Windows accounts with non-Latin names, and it looks exactly
 * like "my mod is broken".
 *
 * @returns {Array<{code: string, message: string, fix: string}>}
 */
export function analyseMountability(absolutePath) {
  const path = String(absolutePath ?? '');
  const problems = [];
  if (path === '') return problems;

  if (/[^\u0000-\u007F]/.test(path)) {
    problems.push({
      code: 'non-ascii-path',
      message:
        `the path contains non-ASCII characters: ${path.replace(/[^\u0000-\u007F]/g, '?')}. ` +
        'Stellaris reads the descriptor from such a path but never mounts the mod content, and reports nothing in error.log.',
      fix:
        'Keep the mod content on an all-ASCII path (for example <mods>/<mod>) and leave only the tiny `<mod>.mod` launcher file in the Documents mod folder, with `path=` pointing at the ASCII location.',
    });
  }
  if (path.length > 190) {
    problems.push({
      code: 'long-path',
      message: `the path is ${path.length} characters long; Windows path limits and the game's own file handling get unreliable past roughly 190.`,
      fix: 'Shorten the mod root, for example to <mods>/<mod>.',
    });
  }
  return problems;
}

/** A conventional all-ASCII location to suggest when a path cannot be mounted. */
export function suggestedAsciiModRoot(folderName) {
  const safe = String(folderName ?? 'mymod').replace(/[^A-Za-z0-9_.-]/g, '_');
  return `<mods>/${safe}`;
}

/**
 * Top-level roots a generated file may be written into. RHoiScribe rejects any
 * generated path outside its own six-root whitelist; the Stellaris equivalent is
 * this list, plus the single `descriptor.mod` file. The gate is applied on the
 * plan, so a dry run and a real write reject exactly the same paths.
 */
export const WRITE_ALLOWED_ROOTS = [
  'common',
  'events',
  'localisation',
  'gfx',
  'interface',
  'map',
  'sound',
  'music',
  'flags',
  'fonts',
  'prescripted_countries',
];

/** Individual files a generated plan may target. */
export const WRITE_ALLOWED_FILES = ['descriptor.mod'];

/**
 * @returns {{ok: true}|{ok: false, reason: string}}
 */
export function assertWritableModPath(relativePath) {
  const segments = relativePath.split('/');
  if (segments.length === 1 && WRITE_ALLOWED_FILES.includes(segments[0])) {
    return { ok: true };
  }
  if (WRITE_ALLOWED_ROOTS.includes(segments[0])) {
    return { ok: true };
  }
  return {
    ok: false,
    reason:
      `\`${segments[0]}\` is not a mod root this server writes into; allowed roots are ` +
      `${WRITE_ALLOWED_ROOTS.join(', ')} and the single file ${WRITE_ALLOWED_FILES.join(', ')}`,
  };
}

/**
 * Normalise a mod-root-relative path and reject anything that could escape the
 * mod root or address a device.
 *
 * @returns {{ok: true, path: string}|{ok: false, reason: string}}
 */
export function resolveModRelativePath(input) {
  if (typeof input !== 'string' || input.trim() === '') {
    return { ok: false, reason: 'path is empty' };
  }

  const raw = input.trim();
  if (/^[a-zA-Z]:/.test(raw)) {
    return { ok: false, reason: 'drive-prefixed paths are rejected' };
  }
  if (/^[\\/]/.test(raw)) {
    return { ok: false, reason: 'absolute paths are rejected' };
  }
  if (/^\\\\/.test(raw) || raw.startsWith('//')) {
    return { ok: false, reason: 'UNC paths are rejected' };
  }

  const unified = raw.replace(/\\/g, '/');
  const segments = unified.split('/').filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    return { ok: false, reason: 'path is empty' };
  }

  for (const segment of segments) {
    if (segment === '.' || segment === '..') {
      return { ok: false, reason: `path traversal segment \`${segment}\` is rejected` };
    }
    if (/[<>:"|?*\u0000-\u001f]/.test(segment)) {
      return { ok: false, reason: `segment \`${segment}\` contains characters the game cannot use` };
    }
    if (/[. ]$/.test(segment)) {
      return { ok: false, reason: `segment \`${segment}\` ends with a dot or space` };
    }
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(segment)) {
      return { ok: false, reason: `segment \`${segment}\` is a reserved device name` };
    }
  }

  const path = segments.join('/');
  if (path.length > 240) {
    return { ok: false, reason: 'path is longer than the 240 character budget' };
  }

  return { ok: true, path };
}

/** True when the normalised path stays inside `root` after resolution. */
export function isInsideRoot(root, relativePath) {
  const rootResolved = resolve(root);
  const target = resolve(join(rootResolved, relativePath.replace(/\//g, sep)));
  const withSep = rootResolved.endsWith(sep) ? rootResolved : rootResolved + sep;
  return target === rootResolved || target.startsWith(withSep);
}

/**
 * Structural knowledge about a mod-relative path, used by validators and by the
 * generators to pick sane targets.
 */
export function classifyPath(relativePath) {
  const segments = relativePath.split('/');
  const top = segments[0] ?? '';
  const second = segments[1] ?? '';
  const warnings = [];
  if (!KNOWN_TOP_LEVEL.includes(top)) {
    warnings.push(
      `\`${top}\` is not a top-level folder Stellaris reads from a mod; the file will be ignored unless the game already defines it`,
    );
  }
  if (top === 'common' && second && !KNOWN_COMMON_SUBFOLDERS.includes(second)) {
    warnings.push(`\`common/${second}\` is not a known \`common/\` subfolder`);
  }
  let kind = 'other';
  if (top === 'localisation') kind = second === 'replace' ? 'localisation-replace' : 'localisation';
  else if (top === 'events') kind = 'events';
  else if (top === 'interface') kind = 'interface';
  else if (top === 'gfx') kind = 'gfx';
  else if (top === 'common') kind = `common/${second}`;
  else if (top === 'descriptor.mod') kind = 'descriptor';
  return { top, second, kind, warnings };
}

/** Localisation filename rules: `<name>_l_<language>.yml`. */
export function analyseLocalisationFileName(fileName) {
  const match = /^(.*)_l_([a-z_]+)\.yml$/i.exec(fileName);
  if (!match) {
    return {
      ok: false,
      reason:
        'localisation files must be named `<name>_l_<language>.yml`; files without the suffix are never read',
    };
  }
  const language = match[2].toLowerCase();
  if (!LOCALISATION_LANGUAGES.includes(language)) {
    return {
      ok: false,
      reason: `\`${language}\` is not a Stellaris language; expected one of ${LOCALISATION_LANGUAGES.join(', ')}`,
    };
  }
  return { ok: true, stem: match[1], language, header: `l_${language}:` };
}

/** Normalise a language input (`chinese`, `l_simp_chinese`, `simplified`) to the file-language token. */
export function normaliseLanguage(input) {
  const value = String(input ?? 'english').trim().toLowerCase().replace(/^l_/, '');
  const aliases = {
    en: 'english',
    eng: 'english',
    zh: 'simp_chinese',
    cn: 'simp_chinese',
    chinese: 'simp_chinese',
    schinese: 'simp_chinese',
    simplified: 'simp_chinese',
    'simplified chinese': 'simp_chinese',
    'zh-cn': 'simp_chinese',
    zhs: 'simp_chinese',
    ja: 'japanese',
    jp: 'japanese',
    ko: 'korean',
    kr: 'korean',
    de: 'german',
    fr: 'french',
    es: 'spanish',
    ru: 'russian',
    pl: 'polish',
    pt: 'braz_por',
    'pt-br': 'braz_por',
  };
  const resolved = aliases[value] ?? value;
  if (!LOCALISATION_LANGUAGES.includes(resolved)) {
    throw new Error(
      `unknown localisation language \`${input}\`; expected one of ${LOCALISATION_LANGUAGES.join(', ')}`,
    );
  }
  return resolved;
}

/** Resolve a localisation file target from a `file_stem`, mirroring RHoiScribe. */
export function localisationPathFor(fileStem, language) {
  const stem = fileStem.replace(/\\/g, '/').replace(/^localisation\//, '').replace(/\.yml$/i, '');
  const base = stem.split('/').pop() ?? stem;
  const withoutLanguageSuffix = base.replace(/_l_[a-z_]+$/i, '');
  const directory = stem.includes('/') ? stem.slice(0, stem.lastIndexOf('/')) : '';
  const fileName = `${withoutLanguageSuffix}_l_${language}.yml`;
  return directory ? `localisation/${directory}/${fileName}` : `localisation/${fileName}`;
}

/**
 * Best-effort discovery of the Stellaris user data directory and installed game
 * directory. Every candidate is verified by existence, never assumed.
 */
export function discoverStellarisInstall({ home = process.env.USERPROFILE ?? process.env.HOME } = {}) {
  const candidates = { documents: [], game: [], logs: [] };
  if (!home) {
    return { found: false, ...candidates, notes: ['no home directory could be determined'] };
  }

  const documentsRoots = [
    join(home, 'Documents', 'Paradox Interactive', 'Stellaris'),
    join(home, 'OneDrive', 'Documents', 'Paradox Interactive', 'Stellaris'),
    join(home, '文档', 'Paradox Interactive', 'Stellaris'),
  ];
  for (const root of documentsRoots) {
    if (!existsSync(root)) continue;
    candidates.documents.push(root);
    candidates.logs.push(join(root, 'logs'));
    const modDirectory = join(root, 'mod');
    if (existsSync(modDirectory)) {
      for (const entry of safeReadDir(modDirectory)) {
        if (entry.endsWith('.mod')) candidates.game.push(join(modDirectory, entry));
      }
    }
  }

  const steamRoots = [
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Stellaris',
    'D:\\Steam\\steamapps\\common\\Stellaris',
    'D:\\SteamLibrary\\steamapps\\common\\Stellaris',
    'E:\\SteamLibrary\\steamapps\\common\\Stellaris',
    'C:\\Program Files\\Steam\\steamapps\\common\\Stellaris',
  ];
  const games = [];
  for (const root of steamRoots) {
    if (existsSync(join(root, 'common'))) games.push(root);
  }

  return {
    found: candidates.documents.length > 0 || games.length > 0,
    documents: candidates.documents,
    logs: candidates.logs,
    game: games,
    notes: [
      'Only existing paths are reported. Steam library folders outside the searched list require an explicit path.',
    ],
  };
}

function safeReadDir(directory) {
  try {
    return readdirSync(directory);
  } catch {
    return [];
  }
}

/** Normalise a path for comparison and for log matching. */
export function toComparablePath(value) {
  return String(value).replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
}

export { isAbsolute, normalize };
