//------------------------------------------------------------------------------------
// state.mjs -- Part of RStellarScribe
//
// Knowledge search, the warm workspace kept by the resident server, and the tool
// log. RHoiScribe keeps a warm CWT language workspace and an RNMDB state store;
// this port keeps the same tools with the same limits over a plain file, so the
// state can be inspected with any editor.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//------------------------------------------------------------------------------------

import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { clamp, DEFAULT_EXPORT_LIMIT, DEFAULT_QUERY_LIMIT, MAX_LOG_ENTRIES } from '../lib/tool-log.mjs';
import { openWorkspace } from '../lib/workspace.mjs';

export const KNOWLEDGE_SEARCH_DEFAULT_LIMIT = 8;

/** search_stellaris_knowledge */
export function searchStellarisKnowledge(args = {}, context = {}) {
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  if (query === '') throw new Error('`query` is required');
  const limit = clamp(args.limit ?? KNOWLEDGE_SEARCH_DEFAULT_LIMIT, 1, 20);
  const matches = context.knowledge.search(query);
  const results = matches.slice(0, limit).map((topic) => ({
    id: topic.id,
    title: topic.title,
    title_zh: topic.title_zh || undefined,
    category: topic.category,
    uri: `rstellariscribe://stellaris/knowledge/${topic.id}`,
    file_types: topic.file_types,
    tags: topic.tags,
    verified_version: topic.verified_version || undefined,
    validation_preview: topic.validation.slice(0, 3),
    source_refs: topic.source_refs,
  }));

  return {
    query,
    terms: query.split(/\s+/).filter(Boolean),
    total_matches: matches.length,
    returned: results.length,
    results,
    messages: [
      'Every whitespace-separated term must appear in the topic, so fewer, more specific terms match better.',
      'Read the full topic with `resources/read` on the returned URI before writing script: the preview here is only the validation list.',
    ],
  };
}

/** open_stellaris_workspace */
export function openStellarisWorkspace(args = {}, context = {}) {
  const root = typeof args.workspace_root === 'string' ? args.workspace_root.trim() : '';
  if (root === '') throw new Error('`workspace_root` is required');
  const resolved = resolve(root);
  if (!existsSync(resolved)) throw new Error(`\`${resolved}\` does not exist`);

  const mode = args.mode === 'single_file' ? 'single_file' : 'mod_root';
  const workspace = openWorkspace(resolved);
  context.workspaces?.set(resolved, { workspace, mode, opened_at: new Date().toISOString() });

  return {
    workspace_root: resolved,
    mode,
    opened: true,
    descriptor_name: workspace.descriptor?.fields.name ?? null,
    supported_version: workspace.descriptor?.fields.supported_version ?? null,
    stats: workspace.stats,
    messages: [
      'The workspace is cached in this server process. A `--skill` invocation is a short-lived process, so use MCP server mode to keep it warm.',
      workspace.descriptor
        ? 'descriptor.mod was found and parsed.'
        : 'No descriptor.mod was found: the game will not treat this folder as a mod.',
    ],
  };
}

/** get_stellaris_workspace_status */
export function getStellarisWorkspaceStatus(args = {}, context = {}) {
  const root = typeof args.workspace_root === 'string' ? resolve(args.workspace_root.trim()) : null;
  const entries = [...(context.workspaces?.entries() ?? [])];
  if (entries.length === 0) {
    return {
      open_workspaces: [],
      message: 'No workspace is open. Call `open_stellaris_workspace` first, or pass `workspace_root` to a tool that accepts it.',
    };
  }
  const selected = root ? entries.filter(([key]) => key === root) : entries;
  const reports = selected.map(([key, value]) => ({
    workspace_root: key,
    mode: value.mode,
    opened_at: value.opened_at,
    descriptor_name: value.workspace.descriptor?.fields.name ?? null,
    stats: value.workspace.stats,
    duplicate_definitions: value.workspace.errors.length,
  }));
  return {
    open_workspaces: reports,
    count: reports.length,
    messages: [
      'Counts are from the scan performed when the workspace was opened. Re-open it after large changes.',
    ],
  };
}

/** inspect_rststellariscribe_state */
export function inspectRststellariscribeState(args = {}, context = {}) {
  const log = context.toolLog.inspect();
  const knowledge = context.knowledge;
  return {
    server: {
      name: context.serverInfo?.name ?? 'rstellariscribe',
      version: context.serverInfo?.version ?? '0.0.0',
      project_root: context.projectRoot,
      pid: process.pid,
    },
    knowledge: {
      source_format: knowledge.sourceFormat,
      backend: knowledge.databaseBackend,
      topics: knowledge.topics.length,
      source_paths: knowledge.sourcePaths?.length ?? knowledge.topics.length,
      categories: [...new Set(knowledge.topics.map((topic) => topic.category))].sort(),
    },
    tool_log: log,
    open_workspaces: [...(context.workspaces?.keys() ?? [])],
    storage_note:
      'The tool log is an append-only JSONL file. RHoiScribe uses an RNMDB page store; the observable query/export tools are the same.',
  };
}

/** query_tool_logs */
export function queryToolLogs(args = {}, context = {}) {
  const limit = clamp(args.limit ?? DEFAULT_QUERY_LIMIT, 1, MAX_LOG_ENTRIES);
  const ok = args.ok === undefined || args.ok === null ? null : Boolean(args.ok);
  return context.toolLog.query({
    tool: typeof args.tool === 'string' && args.tool.trim() !== '' ? args.tool.trim() : null,
    ok,
    limit,
    since: typeof args.since === 'string' && args.since.trim() !== '' ? args.since.trim() : null,
  });
}

/** export_tool_logs */
export function exportToolLogs(args = {}, context = {}) {
  const path = typeof args.path === 'string' ? args.path.trim() : '';
  if (path === '') throw new Error('`path` is required: an absolute file path to write the export to');
  const absolute = resolve(path);
  if (!existsSync(dirname(absolute))) {
    mkdirSync(dirname(absolute), { recursive: true });
  }
  return context.toolLog.exportTo(absolute, { limit: clamp(args.limit ?? DEFAULT_EXPORT_LIMIT, 1, MAX_LOG_ENTRIES) });
}
