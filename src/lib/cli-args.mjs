//------------------------------------------------------------------------------------
// cli-args.mjs -- Part of RStellarScribe
//
// JSON argument handling for the `--skill` command surface.
//
// Why this exists: Windows PowerShell 5.1 strips double quotes out of arguments it
// passes to a native program, so `--skill call-tool search '{"query":"a b"}'` reaches
// the process as `{query:a b}`. A documented command that fails is worse than no
// documentation, so the parser accepts three forms and tells the caller which one to
// use when all three fail:
//
//   1. strict JSON                                                        (bash, zsh, pwsh 7)
//   2. quote-stripped JSON, rescanned structurally                         (Windows PS 5.1)
//   3. `--json-file <path>` or `-` for stdin, which no shell can mangle     (always)
//
// Strict JSON is always attempted first, so a shell that passes quotes through
// correctly is never reinterpreted.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//------------------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export class ArgumentError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ArgumentError';
  }
}

/**
 * Collect a JSON object from the operands that follow a subcommand.
 *
 * @param {string[]} rest operands after the prompt or tool name
 * @param {{readStdin?: () => Promise<string>}} [io]
 */
export async function collectJsonOperand(rest, io = {}) {
  if (!Array.isArray(rest) || rest.length === 0) return {};

  if (rest[0] === '--json-file') {
    if (!rest[1]) throw new ArgumentError('--json-file needs a path');
    return parseJsonArgument(readFileSync(rest[1], 'utf8'), { source: rest[1] });
  }
  if (rest[0] === '-') {
    const readStdin = io.readStdin ?? defaultReadStdin;
    return parseJsonArgument(await readStdin(), { source: 'stdin' });
  }

  // Other shells may split one quoted argument into several; rejoin before parsing.
  return parseJsonArgument(rest.join(' ').trim(), { source: 'command line' });
}

/**
 * Parse strict JSON, then fall back to a structural rescan that tolerates missing
 * quotes.
 *
 * @returns {object} the parsed object (never an array or a scalar)
 */
export function parseJsonArgument(text, { source = 'command line' } = {}) {
  const raw = String(text ?? '').trim();
  if (raw === '') return {};

  const strict = tryStrictJson(raw);
  if (strict !== undefined) return requireObject(strict, source, raw);
  const strictError = lastStrictError(raw);

  // Fallback 1: scan the argument as received.
  let rescanned = tryRescan(raw);
  // Fallback 2: PowerShell 5.1 keeps the backslashes of an escaped inline argument, so
  // `{\"query\":\"x\"}` arrives verbatim. Unescape the quotes and scan again.
  if (rescanned === undefined && raw.includes('\\"')) {
    rescanned = tryRescan(raw.replace(/\\"/g, '"'));
  }
  if (rescanned !== undefined) return requireObject(rescanned, source, raw);

  // The advice has to match where the text came from: an unparseable file is an
  // encoding or syntax problem, not a shell-quoting problem.
  const fromShell = source === 'command line';
  const hint = fromShell
    ? 'Windows PowerShell 5.1 changes double quotes in native-command arguments. Use one of these instead:\n' +
      "  PowerShell 5.1 inline:  node src/index.mjs --skill call-tool search_stellaris_knowledge '{\\\"query\\\":\\\"localisation bom\\\"}'\n" +
      '  any shell, reliable:    node src/index.mjs --skill call-tool search_stellaris_knowledge --json-file args.json\n' +
      '  any shell, pipe:        echo {"query":"localisation bom"} | node src/index.mjs --skill call-tool search_stellaris_knowledge -'
    : 'The argument was read from a whole file or stream, so shell quoting is not the problem.\n' +
      '  Check that it is valid JSON and that it is UTF-8 without a BOM.\n' +
      '  On Windows PowerShell 5.1 do not pass the file through Get-Content/Set-Content: they\n' +
      '  read and write the ANSI code page and will corrupt non-ASCII text. Write the file with\n' +
      '  an editor that saves UTF-8, or pipe it in with `-`.';

  throw new ArgumentError(
    `could not parse the JSON argument from the ${source}.\n` +
      `Received: ${raw.slice(0, 400)}\n` +
      (strictError ? `JSON error: ${strictError}\n` : '') +
      hint +
      (raw.length > 400 ? `\n(received text was truncated here at 400 characters; it is ${raw.length} characters long)` : ''),
  );
}

/**
 * A small JSON reader that tolerates unquoted object keys and unquoted scalar values.
 *
 * It is a real scanner rather than a set of regex rewrites because quote-stripped input
 * is structurally ambiguous: a bare value may legitimately contain braces, as in the
 * Paradox script `tech_x={cost=100 area=physics}`. Brace and bracket depth decides where
 * a value ends, so nested objects, arrays of objects and embedded script all survive.
 */
export class QuoteStrippedParser {
  constructor(text) {
    this.text = String(text ?? '');
    this.index = 0;
  }

  parseDocument() {
    const value = this.parseValue();
    this.skipWhitespace();
    if (!this.atEnd()) throw new SyntaxError('trailing content after the value');
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new SyntaxError('the JSON argument must be an object');
    }
    return value;
  }

  atEnd() {
    return this.index >= this.text.length;
  }

  skipWhitespace() {
    while (this.index < this.text.length && /\s/.test(this.text[this.index])) this.index += 1;
  }

  peek() {
    return this.text[this.index];
  }

  parseValue() {
    this.skipWhitespace();
    const character = this.peek();
    if (character === '{') return this.parseObject();
    if (character === '[') return this.parseArray();
    if (character === '"') return this.parseQuotedString();
    return this.parseBareScalar();
  }

  parseObject() {
    this.index += 1; // consume '{'
    const result = {};
    this.skipWhitespace();
    if (this.peek() === '}') {
      this.index += 1;
      return result;
    }
    for (;;) {
      this.skipWhitespace();
      const key = this.peek() === '"' ? this.parseQuotedString() : this.parseBareKey();
      this.skipWhitespace();
      if (this.peek() !== ':') throw new SyntaxError(`expected \`:\` after key \`${key}\``);
      this.index += 1;
      result[key] = this.parseValue();
      this.skipWhitespace();
      const character = this.peek();
      if (character === ',') {
        this.index += 1;
        continue;
      }
      if (character === '}') {
        this.index += 1;
        return result;
      }
      throw new SyntaxError('expected `,` or `}`');
    }
  }

  parseArray() {
    this.index += 1; // consume '['
    const result = [];
    this.skipWhitespace();
    if (this.peek() === ']') {
      this.index += 1;
      return result;
    }
    for (;;) {
      result.push(this.parseValue());
      this.skipWhitespace();
      const character = this.peek();
      if (character === ',') {
        this.index += 1;
        continue;
      }
      if (character === ']') {
        this.index += 1;
        return result;
      }
      throw new SyntaxError('expected `,` or `]`');
    }
  }

  parseBareKey() {
    let key = '';
    while (this.index < this.text.length && /[A-Za-z0-9_.\-@$]/.test(this.text[this.index])) {
      key += this.text[this.index];
      this.index += 1;
    }
    if (key === '') throw new SyntaxError('expected an object key');
    return key;
  }

  parseQuotedString() {
    this.index += 1; // consume opening quote
    let value = '';
    while (this.index < this.text.length) {
      const character = this.text[this.index];
      if (character === '\\' && this.index + 1 < this.text.length) {
        value += this.text[this.index + 1];
        this.index += 2;
        continue;
      }
      if (character === '"') {
        this.index += 1;
        return value;
      }
      value += character;
      this.index += 1;
    }
    throw new SyntaxError('unterminated string');
  }

  /**
   * Read a value that lost its quotes. Braces and brackets inside the value raise the
   * depth, so only a delimiter at depth zero ends it.
   */
  parseBareScalar() {
    let depth = 0;
    let raw = '';
    while (this.index < this.text.length) {
      const character = this.text[this.index];
      if (character === '{' || character === '[') {
        depth += 1;
        raw += character;
        this.index += 1;
        continue;
      }
      if (character === '}' || character === ']') {
        if (depth === 0) break;
        depth -= 1;
        raw += character;
        this.index += 1;
        continue;
      }
      if (character === ',' && depth === 0) break;
      raw += character;
      this.index += 1;
    }

    const trimmed = raw.trim();
    if (trimmed === '') throw new SyntaxError('empty value');
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (trimmed === 'null') return null;
    if (/^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(trimmed)) return Number(trimmed);
    return trimmed;
  }
}

function tryStrictJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** The message from the strict parse, kept so a failure can explain itself. */
function lastStrictError(text) {
  try {
    JSON.parse(text);
    return '';
  } catch (thrown) {
    return thrown instanceof Error ? thrown.message : String(thrown);
  }
}

function tryRescan(text) {
  try {
    return new QuoteStrippedParser(text).parseDocument();
  } catch {
    return undefined;
  }
}

function requireObject(value, source, raw) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ArgumentError(
      `the JSON argument from the ${source} must be an object, received: ${raw.slice(0, 120)}`,
    );
  }
  return value;
}

function defaultReadStdin() {
  return new Promise((resolve, reject) => {
    let text = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      text += chunk;
    });
    process.stdin.on('end', () => resolve(text));
    process.stdin.on('error', reject);
  });
}
