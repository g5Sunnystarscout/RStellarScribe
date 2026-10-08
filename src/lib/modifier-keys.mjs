//------------------------------------------------------------------------------------
// modifier-keys.mjs -- Part of RStellarisScribe
//
// The two rules the signature checker was missing, both of them SILENT-DEFECT classes the engine
// does not report:
//
//   1. `common/static_modifiers/*.txt`: every scalar key = number assignment inside a top-level
//      modifier block must be a modifier the engine defines. A key that does not exist is not an
//      error the engine logs - the modifier simply does nothing - so the only defence is the
//      engine's own list, which `loadGameSignatures` already parses out of `modifiers.log`
//      (48,555 keys in the verified 4.4.6 install).
//
//   2. `common/script_values/*.txt`: an OPERAND that is identified by name - `add = <name>`,
//      `value = <name>`, `mult = <name>`, ... - must resolve to a named script value, a variable
//      the script sets, or a name the engine documents. `value = <script value>` as an OPERATION is
//      the trap this project already hit once: the engine logs "unknown command 'value' ... will
//      always be 0 as it is modifying a base value of 0", and a `divide = <unknown name>` is the
//      same class with no log at all.
//
// WHAT IS DELIBERATELY NOT A FINDING, because the rule has to stay usable:
//
//   * macro spellings (`$MULT$`, `$BASE|0$`). These are inline_script parameters, not names.
//   * a dotted path (`owner.num_x`, `this.leader_pending`, `target.num_districts`): the engine
//     resolves it as a scope path, and this checker does not model scope paths.
//   * a name with a `:` (a `value:`-qualified or scope-qualified reference).
//   * a name that any file in the workspace DEFINES, or that the script SETS with
//     `set_variable = { which = <name> ... }` - the second one matters because a script value reads
//     a variable by naming it (`add = <var>`), and a variable is not a script value.
//
// The severity is `warning` and never `error`: the set of legal names is genuinely open (a vanilla
// script value is a legal operand and so are several engine keywords), so this rule reports what it
// cannot resolve rather than claiming the file is broken.
//
// This program is free software: you can redistribute it and/or modify it under the terms of
// the GNU Affero General Public License as published by the Free Software Foundation, either
// version 3 of the License, or (at your option) any later version.
//------------------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

/** The operation keys a script value can carry. */
export const SCRIPT_VALUE_OPERATIONS = new Set([
  'value',
  'add',
  'subtract',
  'multiply',
  'divide',
  'mod',
  'min',
  'max',
  'mult',
]);

/**
 * Keys that live inside a `static_modifiers` block but are NOT modifier keys: the block's own
 * metadata. Taken from the engine's own `common/static_modifiers/example.txt` shape.
 */
export const STATIC_MODIFIER_PLUMBING = new Set([
  'icon',
  'name',
  'desc',
  'hidden',
  'category',
  'custom_tooltip',
  'show_only_for_owner',
  'color',
  'colour',
  'rarity',
  'sort_order',
  'ai_weight',
  'weight',
  'weight_modifier',
  'modifier',
  'days',
  'years',
  'months',
  'multiplier',
  'time_multiplier',
  'clear_on_owner_change',
  'potential',
  'allow',
  'trigger',
  'effect',
]);

/**
 * Flatten Paradox script text into `{key, value, depth, path}` records, comments stripped.
 *
 * `value` is the scalar on the right of `=`, or null when the right side is a `{` block. `path` is
 * the enclosing block keys, which is what keeps an inner field distinguishable from a top-level one.
 * Both quote styles and `key {` (no `=`) are accepted, because vanilla writes all of them.
 */
export function flattenScript(text) {
  const source = String(text ?? '').replace(/#[^\n]*/g, '');
  const tokens = source.match(/[{}]|"(?:[^"\\]|\\.)*"|[^\s{}]+/g) ?? [];
  const out = [];
  const stack = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '}') {
      stack.pop();
      continue;
    }
    if (token === '{') continue;
    const next = tokens[index + 1];
    if (next === '=' && tokens[index + 2] === '{') {
      stack.push(token.replace(/"/g, '').toLowerCase());
      index += 2;
      continue;
    }
    if (next === '{') {
      stack.push(token.replace(/"/g, '').toLowerCase());
      index += 1;
      continue;
    }
    if (next === '=') {
      const raw = tokens[index + 2] ?? '';
      out.push({ key: token.replace(/"/g, '').toLowerCase(), value: raw.replace(/^"|"$/g, ''), depth: stack.length, path: [...stack] });
      index += 2;
      continue;
    }
    out.push({ key: token.replace(/"/g, '').toLowerCase(), value: null, depth: stack.length, path: [...stack] });
  }
  return out;
}

/** The number of spaces a key is indented by, which is how a block's own fields are told apart. */
function lineNumberOf(text, key, from = 0) {
  const pattern = new RegExp(`^[ \\t]*${key.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}[ \\t]*=`, 'm');
  const match = pattern.exec(String(text).slice(from));
  if (!match) return null;
  return String(text).slice(0, from + match.index).split('\n').length;
}

/**
 * Every key a `common/static_modifiers/*.txt` file assigns a scalar to, with its line.
 *
 * The shape: a top-level `<modifier_name> = { ... }` block whose body is `key = <number>` lines,
 * optionally carrying a `modifier = { ... }` condition block (the engine's own scoped-modifier form)
 * whose INNER keys are also modifier keys.
 */
export function staticModifierAssignments(text) {
  const records = flattenScript(text);
  const assignments = [];
  for (const record of records) {
    if (record.value === null) continue;
    if (record.depth === 0) continue; // the modifier block's own name, not a key
    if (STATIC_MODIFIER_PLUMBING.has(record.key)) continue;
    // Inside a CONDITION block a scalar is a trigger, not a modifier key. The first path element is
    // the modifier's own name and `modifier` is the engine's scoped-modifier clause
    // (`modifier = { ... }` scales the whole block), so every OTHER nested block -
    // `potential`, `allow`, `trigger`, `weight_modifier`, or any condition block a script wrote -
    // holds trigger fields. Measured on the real mod: without this, `is_variable_set = x` inside a
    // condition was reported as an unknown modifier key.
    const conditionBlocks = record.path.slice(1).filter((block) => block !== 'modifier');
    if (conditionBlocks.length > 0) continue;
    assignments.push({ key: record.key, value: record.value, depth: record.depth, path: record.path });
  }
  return assignments;
}

/** Levenshtein distance, bounded: only used to suggest a near miss for a key that does not exist. */
export function editDistance(left, right) {
  const a = String(left);
  const b = String(right);
  if (Math.abs(a.length - b.length) > 3) return Number.MAX_SAFE_INTEGER;
  let previous = Array.from({ length: b.length + 1 }, (_value, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

/** The nearest modifier keys to `key`, for a "did you mean" suggestion. */
export function nearestModifierKeys(key, modifiers, limit = 3) {
  const scored = [];
  for (const candidate of modifiers.keys()) {
    const distance = editDistance(key, candidate);
    if (distance <= 4) scored.push({ key: candidate, distance, category: modifiers.get(candidate)?.category ?? null });
  }
  return scored.sort((a, b) => a.distance - b.distance || a.key.localeCompare(b.key)).slice(0, limit);
}

/** A plausible NAME rather than a macro, a scope path or a literal. */
export function looksLikeScriptName(value) {
  const text = String(value ?? '');
  if (text === '') return false;
  if (text.includes('$') || text.includes(':') || text.includes('.') || text.includes('@')) return false;
  if (/^-?[0-9.]+%?%?$/.test(text)) return false;
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(text);
}
