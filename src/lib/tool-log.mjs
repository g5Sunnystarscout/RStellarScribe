//------------------------------------------------------------------------------------
// tool-log.mjs -- Part of RStellarScribe
//
// RHoiScribe records every tool call in an RNMDB state store and exposes
// query/export/inspect tools over it. RStellarScribe keeps the same three tools
// and the same limits, but stores an append-only JSONL file, which needs no
// database and can be read with any editor:
//
//   <home>/.rstellariscribe/tool-log.jsonl
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//------------------------------------------------------------------------------------

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/** Mirrors RHoiScribe's logging limits. */
export const MAX_LOG_ENTRIES = 32767;
export const MAX_ENTRY_CHARACTERS = 8192;
export const DEFAULT_QUERY_LIMIT = 100;
export const DEFAULT_EXPORT_LIMIT = 32767;

export function defaultStateDirectory(home = process.env.USERPROFILE ?? process.env.HOME ?? homedir()) {
  return join(home, '.rstellariscribe');
}

export class ToolLog {
  constructor({ stateDirectory = defaultStateDirectory(), enabled = true } = {}) {
    this.stateDirectory = stateDirectory;
    this.path = join(stateDirectory, 'tool-log.jsonl');
    this.enabled = enabled;
    this.pending = 0;
  }

  /** Append one entry. Logging failures never replace a successful tool result. */
  record(entry) {
    if (!this.enabled) return;
    try {
      mkdirSync(this.stateDirectory, { recursive: true });
      const payload = JSON.stringify({
        at: new Date().toISOString(),
        tool: entry.tool,
        ok: entry.ok !== false,
        duration_ms: entry.durationMs ?? 0,
        arguments: truncate(entry.arguments),
        result_summary: truncate(entry.summary),
        error: entry.error ? truncate(entry.error) : null,
      });
      appendFileSync(this.path, payload + '\n', 'utf8');
      this.pending += 1;
      if (this.pending % 512 === 0) this.compact();
    } catch {
      // deliberately silent: the tool result matters more than the log
    }
  }

  read() {
    if (!existsSync(this.path)) return [];
    const entries = [];
    const text = readFileSync(this.path, 'utf8');
    const lines = text.split('\n');
    const start = Math.max(0, lines.length - 1 - MAX_LOG_ENTRIES);
    for (let index = start; index < lines.length; index += 1) {
      const line = lines[index].trim();
      if (!line) continue;
      try {
        entries.push(JSON.parse(line));
      } catch {
        // skip a torn line rather than failing the whole query
      }
    }
    return entries;
  }

  query({ tool = null, ok = null, limit = DEFAULT_QUERY_LIMIT, since = null } = {}) {
    const entries = this.read().filter((entry) => {
      if (tool && entry.tool !== tool) return false;
      if (ok !== null && Boolean(entry.ok) !== Boolean(ok)) return false;
      if (since && entry.at < since) return false;
      return true;
    });
    const bounded = clamp(limit, 1, MAX_LOG_ENTRIES);
    return {
      total: entries.length,
      returned: Math.min(bounded, entries.length),
      entries: entries.slice(-bounded),
    };
  }

  exportTo(targetPath, { limit = DEFAULT_EXPORT_LIMIT } = {}) {
    if (typeof targetPath !== 'string' || targetPath.trim() === '') {
      throw new Error('`path` is required for export_tool_logs');
    }
    const bounded = clamp(limit, 1, MAX_LOG_ENTRIES);
    const entries = this.read().slice(-bounded);
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n', 'utf8');
    return { path: targetPath, exported: entries.length };
  }

  inspect() {
    const entries = this.read();
    const byTool = new Map();
    let failures = 0;
    for (const entry of entries) {
      byTool.set(entry.tool, (byTool.get(entry.tool) ?? 0) + 1);
      if (entry.ok === false) failures += 1;
    }
    return {
      state_directory: this.stateDirectory,
      log_path: this.path,
      exists: existsSync(this.path),
      backend: 'append-only JSONL (RStellarScribe)',
      entries: entries.length,
      failures,
      entry_limit: MAX_LOG_ENTRIES,
      per_entry_character_limit: MAX_ENTRY_CHARACTERS,
      first_entry_at: entries[0]?.at ?? null,
      last_entry_at: entries.at(-1)?.at ?? null,
      tool_histogram: [...byTool.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([tool, count]) => ({ tool, count })),
    };
  }

  compact() {
    try {
      const entries = this.read();
      writeFileSync(
        this.path,
        entries.map((entry) => JSON.stringify(entry)).join('\n') + (entries.length ? '\n' : ''),
        'utf8',
      );
    } catch {
      // compaction is best effort
    }
  }
}

function truncate(value) {
  if (value === null || value === undefined) return null;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (text === undefined) return null;
  return text.length > MAX_ENTRY_CHARACTERS ? text.slice(0, MAX_ENTRY_CHARACTERS) + '…[truncated]' : text;
}

export function clamp(value, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return minimum;
  return Math.min(Math.max(Math.trunc(number), minimum), maximum);
}
