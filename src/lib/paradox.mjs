//------------------------------------------------------------------------------------
// paradox.mjs -- Part of RStellarScribe
//
// Paradox script lexing, canonical formatting and structural checks. Stellaris
// ships no schema, so these checks cover what can be proven locally: bracket
// balance, tab indentation, identifier shape, duplicate definitions and the
// localisation keys a script block implies.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//------------------------------------------------------------------------------------

export const OPERATORS = ['<=', '>=', '!=', '?=', '==', '=', '<', '>'];

/**
 * Tokenise Paradox script. Comments are preserved as tokens so formatting never
 * silently drops a line the author wrote.
 *
 * @returns {Array<{type: string, value: string, line: number}>}
 */
export function tokenize(source) {
  const text = String(source ?? '');
  const tokens = [];
  let index = 0;
  let line = 1;

  const push = (type, value) => tokens.push({ type, value, line });

  while (index < text.length) {
    const character = text[index];

    if (character === '\n') {
      line += 1;
      index += 1;
      continue;
    }
    if (character === ' ' || character === '\t' || character === '\r') {
      index += 1;
      continue;
    }
    if (character === '#') {
      let end = text.indexOf('\n', index);
      if (end === -1) end = text.length;
      push('comment', text.slice(index, end).replace(/\s+$/, ''));
      index = end;
      continue;
    }
    if (character === '"') {
      let cursor = index + 1;
      let value = '';
      while (cursor < text.length) {
        const current = text[cursor];
        if (current === '\\' && cursor + 1 < text.length) {
          value += current + text[cursor + 1];
          cursor += 2;
          continue;
        }
        if (current === '"') break;
        if (current === '\n') line += 1;
        value += current;
        cursor += 1;
      }
      push('string', value);
      if (cursor >= text.length) {
        push('unterminated-string', '');
        index = cursor;
        continue;
      }
      index = cursor + 1;
      continue;
    }
    if (character === '{' || character === '}') {
      push('brace', character);
      index += 1;
      continue;
    }
    if ('=<>!?'.includes(character)) {
      const two = text.slice(index, index + 2);
      const operator = OPERATORS.includes(two) ? two : character;
      push('operator', operator);
      index += operator.length;
      continue;
    }

    let cursor = index;
    while (cursor < text.length && !/[\s#"{}=<>!?]/.test(text[cursor])) cursor += 1;
    if (cursor === index) {
      cursor += 1;
    }
    push('word', text.slice(index, cursor));
    index = cursor;
  }

  return tokens;
}

/**
 * Rewrite a script fragment in canonical form: one assignment per line, one tab
 * per nesting level, `key = value` spacing, comments on their own line.
 */
export function formatParadoxScript(source, { indent = '\t', blankLineBetweenBlocks = true } = {}) {
  const tokens = tokenize(source);
  const lines = [];
  let depth = 0;
  let buffer = '';

  const flush = () => {
    const trimmed = buffer.trim();
    if (trimmed) lines.push(indent.repeat(Math.max(depth, 0)) + trimmed);
    buffer = '';
  };

  for (let position = 0; position < tokens.length; position += 1) {
    const token = tokens[position];

    if (token.type === 'comment') {
      flush();
      lines.push(indent.repeat(Math.max(depth, 0)) + token.value);
      continue;
    }
    if (token.type === 'unterminated-string') {
      flush();
      lines.push(indent.repeat(Math.max(depth, 0)) + '# [RStellarScribe] unterminated string literal');
      continue;
    }
    if (token.type === 'brace') {
      if (token.value === '{') {
        buffer = buffer ? `${buffer} {` : '{';
        flush();
        depth += 1;
        continue;
      }
      flush();
      depth = Math.max(depth - 1, 0);
      lines.push(indent.repeat(depth) + '}');
      continue;
    }
    if (token.type === 'operator') {
      buffer = buffer ? `${buffer} ${token.value}` : token.value;
      continue;
    }
    if (token.type === 'string') {
      buffer = buffer ? `${buffer} "${token.value}"` : `"${token.value}"`;
      continue;
    }

    const previous = tokens[position - 1];
    if (buffer && previous && previous.type === 'operator') {
      buffer = `${buffer} ${token.value}`;
      continue;
    }
    if (buffer) {
      flush();
    }
    buffer = token.value;
  }
  flush();

  return tidyBlankLines(lines, blankLineBetweenBlocks).join('\n') + '\n';
}

function tidyBlankLines(lines, insert) {
  if (!insert) return lines;
  const out = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (index > 0 && !line.startsWith('\t') && !line.startsWith('}') && line.trim() !== '') {
      const previous = lines[index - 1];
      if (previous.trim() !== '' && previous.trim() !== '{') out.push('');
    }
    out.push(line);
  }
  return out;
}

/**
 * Structural checks that do not need a schema: bracket balance and indentation.
 *
 * @returns {{errors: Array, warnings: Array}}
 */
export function checkScriptStructure(source, filePath = '<script>') {
  const errors = [];
  const warnings = [];
  const text = String(source ?? '');
  const tokens = tokenize(text);
  const stack = [];

  for (const token of tokens) {
    if (token.type === 'brace') {
      if (token.value === '{') {
        stack.push(token.line);
      } else if (stack.length === 0) {
        errors.push({ file: filePath, line: token.line, message: 'closing brace without an opening brace' });
      } else {
        stack.pop();
      }
    }
    if (token.type === 'unterminated-string') {
      errors.push({ file: filePath, line: token.line, message: 'unterminated string literal' });
    }
  }
  for (const line of stack) {
    errors.push({ file: filePath, line, message: 'opening brace is never closed' });
  }

  if (/^(?:\uFEFF)/.test(text)) {
    // Not an error: Stellaris 4.1.7 ships `common/name_lists/*.txt` with a UTF-8
    // BOM, so a BOM in a script file is tolerated by the engine. Localisation must
    // have one, which validateLocalisationFile checks separately.
    warnings.push({
      file: filePath,
      line: 1,
      message:
        'this script file starts with a UTF-8 BOM. The engine tolerates it (vanilla `common/name_lists/` files carry one), but localisation is the only place a BOM is required',
    });
  }
  text.split('\n').forEach((line, index) => {
    if (/^( +)\S/.test(line) && !/^\t/.test(line)) {
      warnings.push({
        file: filePath,
        line: index + 1,
        message: 'vanilla script files indent with tabs; spaces still parse but look inconsistent',
      });
    }
  });

  return { errors, warnings };
}

/**
 * Top-level definitions of a script file, one per depth-1 assignment whose value
 * is a block. These are the keys Stellaris registers (a technology, a civic, an
 * event id, and so on).
 */
export function findTopLevelDefinitions(source) {
  const tokens = tokenize(source);
  const definitions = [];
  let depth = 0;

  for (let position = 0; position < tokens.length; position += 1) {
    const token = tokens[position];
    if (token.type === 'brace') {
      depth += token.value === '{' ? 1 : -1;
      continue;
    }
    if (depth !== 0 || token.type !== 'word') continue;
    const operator = tokens[position + 1];
    const value = tokens[position + 2];
    if (operator?.type === 'operator' && operator.value === '=' && value?.type === 'brace' && value.value === '{') {
      definitions.push({ key: token.value, line: token.line });
    }
  }
  return definitions;
}

/**
 * Parse a token stream into a block tree: `{key, value, line, children}`.
 *
 * `tokenize` is enough for top-level key discovery, but `.gfx` and `.asset` registries need
 * the structure as well: which *kind* declared a name, and which fields that kind accepts.
 * The node shape mirrors `RStellarisGui/src/lib/paradox.mjs`'s `parseTokens`
 * (AGPL-3.0-or-later, same author) so the two checkouts read the same way, but it is built on
 * this project's own lexer rather than importing that file: RStellarisGui is a separate
 * checkout, not a dependency of this package.
 *
 * `value` is set for scalar assignments, `children` for block assignments. A bare word with
 * no `=` keeps its text in `key` with `children: null`, which is how the additive lists in
 * `sound/*.asset` (`soundeffects = { laser_fire laser_hit }`) appear.
 *
 * @returns {Array<{key: string, value: string|null, line: number, children: Array|null}>}
 */
export function parseParadoxBlocks(source) {
  const tokens = tokenize(source);
  let position = 0;

  const parseEntries = (stopAtClose) => {
    const entries = [];
    while (position < tokens.length) {
      const token = tokens[position];
      if (token.type === 'comment') {
        position += 1;
        continue;
      }
      if (token.type === 'brace') {
        position += 1;
        if (token.value === '}' && stopAtClose) return entries;
        // A stray `{`, or an unmatched `}` at the top level, is skipped rather than fatal.
        continue;
      }
      if (token.type !== 'word' && token.type !== 'string') {
        position += 1;
        continue;
      }
      const key = token.value;
      const line = token.line;
      position += 1;
      const operator = tokens[position];
      if (!operator || operator.type !== 'operator') {
        entries.push({ key, value: null, line, children: null });
        continue;
      }
      position += 1;
      const value = tokens[position];
      if (!value) {
        entries.push({ key, value: null, line, children: null });
        break;
      }
      if (value.type === 'brace' && value.value === '{') {
        position += 1;
        entries.push({ key, value: null, line, children: parseEntries(true) });
        continue;
      }
      position += 1;
      entries.push({ key, value: value.value, line, children: null });
    }
    return entries;
  };

  return parseEntries(false);
}

/** First child of a parsed block with the given key, compared case-insensitively. */
export function firstBlockChild(block, key) {
  const wanted = String(key).toLowerCase();
  return (block?.children ?? []).find((child) => child.key && child.key.toLowerCase() === wanted) ?? null;
}

/**
 * Definition kinds that conventionally carry a `<key>_desc` localisation entry.
 * Deliberately a list rather than "every kind": a species class, an event or a
 * scripted effect has no `_desc` key in Stellaris 4.1.7 (species classes: 0
 * occurrences), so assuming one produces phantom missing-localisation reports.
 */
const DESC_BEARING_KINDS = new Set([
  'technology',
  'civic',
  'origin',
  'government',
  'tradition',
  'ascension_perk',
  'decision',
  'district',
  'building',
  'pop_job',
  'megastructure',
  'relic',
  'edict',
  'resolution',
  'static_modifier',
  'opinion_modifier',
  'anomaly',
  'archaeological_site',
  'ship_size',
  'component_template',
  'solar_system_initializer',
  'situation',
  'policy',
  'leader_class',
  'zone',
]);

/**
 * Event ids inside an event file, as `namespace.number`.
 *
 * The top-level keys of `events/*.txt` are always event *type* keywords
 * (country_event, planet_event, fleet_event, ... - all 16 of them end in `_event`)
 * and never definition keys, so a name-based filter is unsafe: `common/` legitimately
 * contains keys such as `has_active_event`. File location is the reliable signal.
 */
export function findEventIds(source) {
  const ids = new Set();
  for (const match of String(source ?? '').matchAll(/\bid\s*=\s*([A-Za-z0-9_]+\.[A-Za-z0-9_.]+)/g)) {
    ids.add(match[1]);
  }
  return [...ids];
}

/**
 * Localisation keys implied by a script fragment. The heuristics follow Stellaris
 * conventions: event `title`/`desc`/`name` hold literal keys, definition blocks
 * imply `<key>` (and `<key>_desc` for the kinds that actually use one), and
 * `custom_tooltip = X` references X.
 *
 * @param {string} source
 * @param {{kinds?: string[], includeDefinitions?: boolean}} [options]
 *   `kinds` decides whether a `_desc` key is plausible for this file type;
 *   `includeDefinitions: false` skips the top-level pass entirely, which is what an
 *   event file needs.
 */
export function findLocalisationKeyReferences(source, options = {}) {
  const tokens = tokenize(source);
  const references = new Set();
  const literalKeys = new Set([
    'title',
    'desc',
    'name',
    'text',
    'custom_tooltip',
    'description',
    'tooltip',
  ]);

  for (let position = 0; position < tokens.length; position += 1) {
    const token = tokens[position];
    if (token.type !== 'word' || !literalKeys.has(token.value)) continue;
    const operator = tokens[position + 1];
    if (operator?.type !== 'operator' || operator.value !== '=') continue;
    const value = tokens[position + 2];
    if (!value) continue;
    if (value.type === 'word' && !/^(yes|no)$/i.test(value.value)) {
      references.add(value.value);
    }
    if (value.type === 'brace' && value.value === '{') {
      // desc = { trigger = { ... } text = some_key }
      const block = collectBlockText(tokens, position + 2);
      for (const match of block.matchAll(/\btext\s*=\s*([A-Za-z0-9_.]+)/g)) {
        references.add(match[1]);
      }
    }
  }

  const knownKinds = Array.isArray(options.kinds) ? options.kinds : null;
  const includeDefinitions = options.includeDefinitions !== false;
  if (includeDefinitions) {
    for (const definition of findTopLevelDefinitions(source)) {
      references.add(definition.key);
      if (!knownKinds || knownKinds.some((kind) => DESC_BEARING_KINDS.has(kind))) {
        references.add(`${definition.key}_desc`);
      }
    }
  }

  return [...references].sort();
}

function collectBlockText(tokens, bracePosition) {
  let depth = 0;
  const parts = [];
  for (let position = bracePosition; position < tokens.length; position += 1) {
    const token = tokens[position];
    if (token.type === 'brace') {
      depth += token.value === '{' ? 1 : -1;
      if (depth === 0) break;
      continue;
    }
    if (depth >= 1 && token.value) parts.push(token.value);
  }
  return parts.join(' ');
}
