//------------------------------------------------------------------------------------
// generation.mjs -- Part of RStellarScribe
//
// The generation pipeline shared by every write tool. It mirrors RHoiScribe's
// `GeneratedFile` / `finish_generation` contract:
//
//   dry run  -> the same file plan is returned, nothing is written;
//   write    -> every path is re-validated, then written below `output_root`.
//
// Encoding is explicit per file. Stellaris localisation must be UTF-8 *with*
// BOM while script files must not carry one, so the plan records the encoding and
// the writer honours it.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//------------------------------------------------------------------------------------

import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

import { isInsideRoot, resolveModRelativePath } from './paths.mjs';
import { assertWritableModPath, analyseMountability, suggestedAsciiModRoot } from './paths.mjs';

export const ENCODING_UTF8 = 'utf-8';
export const ENCODING_UTF8_BOM = 'utf-8-bom';

export const MAX_FILES_PER_CALL = 500;
export const MAX_FILE_BYTES = 2 * 1024 * 1024;

export class ToolError extends Error {
  constructor(message) {
    super(message);
    // The MCP layer maps this name onto JSON-RPC `invalid_params`, mirroring
    // RHoiScribe, which returns ToolError as a protocol error rather than a tool
    // result. Without an explicit name the check would never match.
    this.name = 'ToolError';
  }
}

/** Build one entry of the returned file plan. */
export function generatedFile(path, content, { encoding = null, summary = '' } = {}) {
  return { path, content, encoding, summary };
}

/**
 * Validate a plan, optionally write it, and return the tool result.
 *
 * @param {{dryRun: boolean, outputRoot?: string|null, files: Array, messages?: string[], createRoot?: boolean}} options
 */
export function finishGeneration({ dryRun, outputRoot, files, messages = [], createRoot = true }) {
  if (files.length === 0) {
    throw new ToolError('the generation plan is empty; nothing to write');
  }
  if (files.length > MAX_FILES_PER_CALL) {
    throw new ToolError(
      `the plan contains ${files.length} files, above the ${MAX_FILES_PER_CALL} file ceiling for one call; split the request`,
    );
  }

  const plan = [];
  const rejected = [];

  for (const file of files) {
    const resolved = resolveModRelativePath(file.path);
    if (!resolved.ok) {
      rejected.push(`${file.path}: ${resolved.reason}`);
      continue;
    }
    const allowed = assertWritableModPath(resolved.path);
    if (!allowed.ok) {
      rejected.push(`${file.path}: ${allowed.reason}`);
      continue;
    }
    const content = file.content ?? '';
    const bytes = Buffer.byteLength(content, 'utf8') + (file.encoding === ENCODING_UTF8_BOM ? 3 : 0);
    if (bytes > MAX_FILE_BYTES) {
      rejected.push(`${file.path}: ${bytes} bytes exceeds the ${MAX_FILE_BYTES} byte per-file limit`);
      continue;
    }
    plan.push({
      path: resolved.path,
      content,
      encoding: file.encoding,
      summary: file.summary,
      bytes,
    });
  }

  if (rejected.length > 0) {
    throw new ToolError(`unsafe or oversized paths were rejected:\n- ${rejected.join('\n- ')}`);
  }

  const result = {
    dry_run: Boolean(dryRun),
    files: plan.map((entry) => ({
      path: entry.path,
      encoding: entry.encoding ?? ENCODING_UTF8,
      summary: entry.summary,
      bytes: entry.bytes,
    })),
    messages: [...messages],
  };

  if (dryRun) {
    result.messages.push(`dry-run only; ${plan.length} file(s) were not written`);
    return result;
  }

  if (typeof outputRoot !== 'string' || outputRoot.trim() === '') {
    throw new ToolError('write mode requires output_root: the absolute path of the target mod root');
  }
  const root = resolve(outputRoot.trim());
  // A mod written to a non-ASCII path is written successfully and then never loaded by
  // the game. Say so at write time, when the user can still act on it.
  const mountProblems = analyseMountability(root);
  let rootStat = null;
  try {
    rootStat = statSync(root);
  } catch {
    rootStat = null;
  }
  if (rootStat && !rootStat.isDirectory()) {
    throw new ToolError(`output_root \`${root}\` exists but is not a directory`);
  }
  if (!rootStat) {
    if (!createRoot) {
      throw new ToolError(`output_root \`${root}\` does not exist`);
    }
    mkdirSync(root, { recursive: true });
    result.messages.push(`created output_root \`${root}\``);
  }

  for (const entry of plan) {
    if (!isInsideRoot(root, entry.path)) {
      throw new ToolError(
        `refusing to write \`${entry.path}\`: it resolves outside output_root \`${root}\``,
      );
    }
    const target = join(root, entry.path.replace(/\//g, sep));
    mkdirSync(dirname(target), { recursive: true });
    const payload =
      entry.encoding === ENCODING_UTF8_BOM ? '\uFEFF' + entry.content : entry.content;
    writeFileSync(target, payload, { encoding: 'utf8' });
  }

  result.messages.push(`wrote ${plan.length} file(s) under \`${root}\``);
  if (mountProblems.length > 0) {
    result.mount_warnings = mountProblems;
    for (const problem of mountProblems) {
      result.messages.push(`MOUNT WARNING (${problem.code}): ${problem.message} Fix: ${problem.fix}`);
    }
    result.messages.push(
      `Suggested ASCII mod root: ${suggestedAsciiModRoot(root.split(/[\\/]/).pop())}`,
    );
  }
  return result;
}

/** Reject a request that asks for a write path while only accepting dry runs. */
export function ensureDryRun(dryRun, reason) {
  if (!dryRun) {
    throw new ToolError(reason);
  }
}

/** Validate that a value is a non-empty string and return it trimmed. */
export function requireString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ToolError(`\`${field}\` is required and must be a non-empty string`);
  }
  return value.trim();
}

/** Validate an optional string with a default. */
export function optionalString(value, fallback = null) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

/** Read an array field, rejecting non-arrays so callers get a clear error. */
export function requireArray(value, field) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ToolError(`\`${field}\` is required and must be a non-empty array`);
  }
  return value;
}

/**
 * Turn arbitrary text into a lowercase identifier fragment usable in Stellaris
 * script keys and localisation keys.
 */
export function asciiKey(value, { uppercase = false, fallback = 'key' } = {}) {
  const token = String(value ?? '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const resolved = token === '' ? fallback : token;
  return uppercase ? resolved.toUpperCase() : resolved.toLowerCase();
}

/** Escape a string for a Stellaris localisation value. */
export function escapeLocalisationText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, '\\n');
}

/** Escape a string for a quoted Paradox script value. */
export function escapeScriptString(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
