//------------------------------------------------------------------------------------
// localisation.mjs -- Part of RStellarScribe
//
// Stellaris localisation is the most common silent failure in a mod: a file saved
// as UTF-8 without BOM, a filename without `_l_<language>`, or a missing first
// line make the whole file invisible to the game, with no error the author would
// notice. Everything here exists to make those three rules impossible to miss.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//------------------------------------------------------------------------------------

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { escapeLocalisationText } from './generation.mjs';
import { analyseLocalisationFileName, LOCALISATION_LANGUAGES } from './paths.mjs';

/** Characters Stellaris replaces with `?` inside localisation values. */
export const INVALID_LOCALISATION_CHARACTERS = ['„', '“', '‚', '‘', '–', '”', '’', '…', '—'];

export const BOM = '\uFEFF';

/**
 * Render a complete localisation file. The BOM is added by the writer (the plan
 * records `utf-8-bom`), so this returns text without it.
 *
 * @param {{language: string, entries: Array<{key: string, value: string, comment?: string}>}} options
 */
export function renderLocalisationFile({ language, entries }) {
  if (!LOCALISATION_LANGUAGES.includes(language)) {
    throw new Error(`\`${language}\` is not a Stellaris language`);
  }
  if (entries.length === 0) {
    throw new Error('at least one localisation entry is required');
  }
  const lines = [`l_${language}:`];
  for (const entry of entries) {
    if (entry.comment) lines.push(` # ${entry.comment}`);
    lines.push(` ${entry.key}:0 "${escapeLocalisationText(entry.value)}"`);
  }
  return lines.join('\n') + '\n';
}

/** Build the localisation entries implied by one generated definition. */
export function buildLocalisationEntries({ keyPrefix, entries, includeDescriptions = true }) {
  const out = [];
  for (const entry of entries) {
    const id = entry.id ?? entry.key;
    if (!id) throw new Error('every localisation entry needs an `id`');
    const key = keyPrefix ? `${keyPrefix}${id}` : id;
    out.push({ key, value: entry.title ?? entry.value ?? id });
    if (includeDescriptions && (entry.description ?? entry.desc)) {
      out.push({ key: `${key}_desc`, value: entry.description ?? entry.desc });
    }
    if (entry.effects) {
      out.push({ key: `${key}_effects`, value: entry.effects });
    }
  }
  return out;
}

/**
 * Validate a localisation file the way Stellaris does. `bytes` must be the raw
 * buffer so the BOM can be observed.
 *
 * @returns {{errors: Array<{file: string, line: number, message: string}>, warnings: Array, keys: string[]}}
 */
export function validateLocalisationFile(filePath, bytes) {
  const errors = [];
  const warnings = [];
  const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
  const nameAnalysis = analyseLocalisationFileName(fileName);

  if (filePath.includes('/replace/') || filePath.includes('\\replace\\')) {
    warnings.push({
      file: filePath,
      line: 1,
      message: 'files inside `localisation/replace/` overwrite vanilla keys for every mod; keep overrides narrow',
    });
  }

  const raw = Buffer.isBuffer(bytes) ? bytes.toString('utf8') : String(bytes);
  const hasBom = raw.startsWith(BOM);
  const text = hasBom ? raw.slice(1) : raw;

  if (!hasBom) {
    errors.push({
      file: filePath,
      line: 1,
      message:
        'missing UTF-8 BOM: Stellaris does not parse localisation saved as plain UTF-8, and reports nothing',
    });
  }
  if (!nameAnalysis.ok) {
    errors.push({ file: filePath, line: 1, message: nameAnalysis.reason });
  }

  const lines = text.split(/\r?\n/);
  const header = (lines[0] ?? '').trim();
  const headerMatch = /^l_([a-z_]+):$/.exec(header);
  if (!headerMatch) {
    errors.push({
      file: filePath,
      line: 1,
      message: `the first line must be a language header such as \`l_english:\`, found \`${header}\``,
    });
  } else if (nameAnalysis.ok && headerMatch[1] !== nameAnalysis.language) {
    errors.push({
      file: filePath,
      line: 1,
      message: `header language \`${headerMatch[1]}\` does not match the filename language \`${nameAnalysis.language}\``,
    });
  }

  const keys = [];
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      errors.push({
        file: filePath,
        line: index + 1,
        message: 'every entry after the header must start with whitespace, otherwise the line is ignored',
      });
      continue;
    }
    const entry = /^\s+([A-Za-z0-9_.\-|]+):(\d*)\s+"(.*)"\s*$/.exec(line);
    if (!entry) {
      errors.push({
        file: filePath,
        line: index + 1,
        message: 'entry must look like ` key:0 "Text"`',
      });
      continue;
    }
    keys.push(entry[1]);
    const value = entry[3];
    for (const character of INVALID_LOCALISATION_CHARACTERS) {
      if (value.includes(character)) {
        warnings.push({
          file: filePath,
          line: index + 1,
          message: `\`${character}\` inside a localisation value renders as \`?\` in game; use plain ASCII punctuation`,
        });
      }
    }
    const poundCount = (value.match(/£/g) ?? []).length;
    if (poundCount % 2 !== 0) {
      warnings.push({
        file: filePath,
        line: index + 1,
        message: 'unbalanced `£` icon code; icon codes must be closed with a second `£`',
      });
    }
  }

  const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
  for (const key of new Set(duplicates)) {
    warnings.push({
      file: filePath,
      line: 1,
      message: `key \`${key}\` is defined more than once in this file; only the last entry is served`,
    });
  }

  return { errors, warnings, keys };
}

/** Parse a localisation file into a key -> value map. */
export function parseLocalisationFile(bytes) {
  const raw = Buffer.isBuffer(bytes) ? bytes.toString('utf8') : String(bytes);
  const text = raw.startsWith(BOM) ? raw.slice(1) : raw;
  const entries = new Map();
  for (const line of text.split(/\r?\n/).slice(1)) {
    const match = /^\s+([A-Za-z0-9_.\-|]+):\d*\s+"(.*)"\s*$/.exec(line);
    if (match) entries.set(match[1], match[2]);
  }
  return entries;
}

/** Collect every localisation key defined below a `localisation/` folder. */
export function readLocalisationKeys(localisationRoot) {
  const keys = new Map();
  const walk = (directory) => {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.toLowerCase().endsWith('.yml')) continue;
      if (!statSync(full).isFile()) continue;
      try {
        for (const [key, value] of parseLocalisationFile(readFileSync(full))) {
          if (!keys.has(key)) keys.set(key, { value, file: full });
        }
      } catch {
        // unreadable files are reported by validateLocalisationFile instead
      }
    }
  };
  walk(localisationRoot);
  return keys;
}

/** Report keys that exist in only some languages, which shows as raw keys in game. */
export function compareLanguageCoverage(localisationRoot) {
  const byLanguage = new Map();
  const walk = (directory) => {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      const analysis = analyseLocalisationFileName(entry.name);
      if (!analysis.ok) continue;
      if (!byLanguage.has(analysis.language)) byLanguage.set(analysis.language, new Set());
      for (const key of parseLocalisationFile(readFileSync(full)).keys()) {
        byLanguage.get(analysis.language).add(key);
      }
    }
  };
  walk(localisationRoot);

  const languages = [...byLanguage.keys()].sort();
  const allKeys = new Set();
  for (const keys of byLanguage.values()) for (const key of keys) allKeys.add(key);

  const missing = [];
  for (const language of languages) {
    const keys = byLanguage.get(language);
    const gaps = [...allKeys].filter((key) => !keys.has(key));
    if (gaps.length > 0) missing.push({ language, missing_count: gaps.length, examples: gaps.slice(0, 10) });
  }
  return { languages, total_keys: allKeys.size, gaps: missing };
}
