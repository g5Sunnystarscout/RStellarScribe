//------------------------------------------------------------------------------------
// knowledge.mjs -- Part of RStellarScribe
//
// Stellaris port of RHoiScribe's knowledge catalogue. The observable contract is
// kept identical to the original:
//
//   * topics are addressed by id and exposed as markdown resources,
//   * the catalogue index is TOML with the same field names,
//   * search splits the query on whitespace and requires every term to appear in
//     the topic haystack.
//
// The differences are internal and deliberate: RStellarScribe loads authored
// markdown directly (or a generated snapshot produced by scripts/build-knowledge.mjs)
// instead of paging a serialised snapshot through an in-memory database.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//------------------------------------------------------------------------------------

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { KnowledgeSourceError, readKnowledgeSources } from './knowledge-source.mjs';
import { tomlMultiline, tomlString, tomlStringArray } from './toml.mjs';

export const SOURCE_FORMAT = 'toml';
export const DATABASE_BACKEND = 'in-memory topic index (RStellarScribe)';
export const LATEST_UPDATE_SOURCE = 'updates/latest-update';

/** Topics that never appear in the catalogue index. */
export function isTopicSource(id) {
  return !id.startsWith('updates/');
}

export class KnowledgeCatalog {
  constructor(topics, sourcePaths) {
    this.topics = topics;
    this.sourcePaths = sourcePaths;
    this.topicIndex = new Map();
    this.fileTypeIndex = new Map();
    this.searchDocuments = [];

    topics.forEach((topic, position) => {
      this.topicIndex.set(topic.id, position);
      for (const fileType of topic.file_types) {
        const key = fileType.toLowerCase();
        if (!this.fileTypeIndex.has(key)) this.fileTypeIndex.set(key, []);
        this.fileTypeIndex.get(key).push(position);
      }
      this.searchDocuments.push(
        `${haystack(topic)} ${(sourcePaths[position] ?? '').toLowerCase()}`,
      );
    });
  }

  /** Load the bundled catalogue from the generated snapshot or the sources. */
  static async load({ projectRoot }) {
    const generatedPath = join(projectRoot, 'src', 'generated', 'knowledge.mjs');
    if (existsSync(generatedPath)) {
      const module = await import(pathToFileUrl(generatedPath));
      const topics = module.topics ?? [];
      const sourcePaths = module.sourcePaths ?? topics.map((topic) => topic.source_path ?? '');
      return new KnowledgeCatalog(topics, sourcePaths);
    }

    const knowledgeRoot = join(projectRoot, 'knowledge');
    const topics = readKnowledgeSources(knowledgeRoot);
    return new KnowledgeCatalog(
      topics,
      topics.map((topic) => topic.source_path),
    );
  }

  get sourceFormat() {
    return SOURCE_FORMAT;
  }

  get databaseBackend() {
    return DATABASE_BACKEND;
  }

  get runtimePageCount() {
    return this.topics.length;
  }

  topic(id) {
    const position = this.topicIndex.get(id);
    return position === undefined ? undefined : this.topics[position];
  }

  byFileType(fileType) {
    const positions = this.fileTypeIndex.get(fileType.toLowerCase()) ?? [];
    return positions.map((position) => this.topics[position]);
  }

  /** Mirrors RHoiScribe: every whitespace-separated term must match. */
  search(query) {
    const terms = String(query ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .map((term) => term.toLowerCase());
    if (terms.length === 0) return [];
    // Enumerate *before* filtering. Filtering first and then reading `topics[index]`
    // would renumber the matches and return unrelated topics.
    return this.searchDocuments
      .map((document, index) => ({ document, index }))
      .filter(({ document }) => terms.every((term) => document.includes(term)))
      .map(({ index }) => this.topics[index])
      .filter(Boolean);
  }

  catalogIndexToml() {
    const lines = [
      `source_format = ${tomlString(this.sourceFormat)}`,
      `database_backend = ${tomlString(this.databaseBackend)}`,
      '',
      `source_paths = ${tomlStringArray(this.sourcePaths)}`,
      '',
    ];
    this.topics.forEach((topic, position) => {
      lines.push('[[topics]]');
      lines.push(`id = ${tomlString(topic.id)}`);
      lines.push(`title = ${tomlString(topic.title)}`);
      lines.push(`category = ${tomlString(topic.category)}`);
      lines.push(`source_path = ${tomlString(this.sourcePaths[position] ?? '')}`);
      lines.push(`tags = ${tomlStringArray(topic.tags)}`);
      lines.push('');
    });
    return lines.join('\n');
  }
}

/** Read the bundled `updates/latest-update` topic. */
export function loadLatestUpdate(projectRoot) {
  const generatedPath = join(projectRoot, 'src', 'generated', 'knowledge.mjs');
  if (existsSync(generatedPath)) {
    const text = readFileSync(generatedPath, 'utf8');
    const match = /export const latestUpdate = (\{[\s\S]*?\});/.exec(text);
    if (match) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed?.title && parsed?.body) return parsed;
      } catch {
        // fall through to the authored source
      }
    }
  }

  const sourcePath = join(projectRoot, 'knowledge', 'updates', 'latest-update.md');
  if (!existsSync(sourcePath)) {
    return {
      title: 'Stellaris latest update',
      body: 'No bundled update snapshot is present in this checkout.',
    };
  }
  const { title, body } = splitAuthoredDocument(readFileSync(sourcePath, 'utf8'), sourcePath);
  return { title, body };
}

/** Render a knowledge topic the way RHoiScribe renders its markdown resource. */
export function topicToMarkdown(topic) {
  const parts = [
    `# ${topic.title}`,
    '',
    `- ID: ${topic.id}`,
    `- Category: ${topic.category}`,
    `- File types: ${topic.file_types.join(', ')}`,
    `- Tags: ${topic.tags.join(', ')}`,
  ];
  if (topic.title_zh) parts.push(`- 中文标题: ${topic.title_zh}`);
  if (topic.verified_version) parts.push(`- 已核对版本: ${topic.verified_version}`);
  parts.push('', topic.body);
  const sections = [
    markdownList('Syntax blocks', topic.syntax_blocks, true),
    markdownList('Relationships', topic.relationships),
    markdownList('Validation', topic.validation),
    markdownList('Source references', topic.source_refs),
  ].filter(Boolean);
  if (sections.length > 0) parts.push('', sections.join('\n'));
  return parts.join('\n');
}

/** Serialise a topic into the canonical RHoiScribe-compatible TOML file. */
export function topicToToml(topic) {
  return [
    `id = ${tomlString(topic.id)}`,
    '',
    `title = ${tomlString(topic.title)}`,
    '',
    `category = ${tomlString(topic.category)}`,
    '',
    `file_types = ${tomlStringArray(topic.file_types)}`,
    '',
    `tags = ${tomlStringArray(topic.tags)}`,
    '',
    `body = ${tomlMultiline(topic.body)}`,
    '',
    `syntax_blocks = ${tomlStringArray(topic.syntax_blocks)}`,
    '',
    `relationships = ${tomlStringArray(topic.relationships)}`,
    '',
    `validation = ${tomlStringArray(topic.validation)}`,
    '',
    `source_refs = ${tomlStringArray(topic.source_refs)}`,
    '',
    'title_zh = ' + tomlString(topic.title_zh ?? ''),
    '',
    'verified_version = ' + tomlString(topic.verified_version ?? ''),
    '',
    `aliases = ${tomlStringArray(topic.aliases ?? [])}`,
    '',
  ].join('\n');
}

function markdownList(title, items, asCode = false) {
  if (!items || items.length === 0) return '';
  if (asCode) {
    const blocks = items
      .map((item) => '```pdx\n' + item.replace(/\s+$/, '') + '\n```')
      .join('\n\n');
    return `## ${title}\n\n${blocks}\n`;
  }
  return `## ${title}\n\n${items.map((item) => `- ${item}`).join('\n')}\n`;
}

function haystack(topic) {
  return [
    topic.id,
    topic.title,
    topic.title_zh ?? '',
    topic.category,
    topic.file_types.join(' '),
    topic.tags.join(' '),
    topic.aliases?.join(' ') ?? '',
    topic.body,
    topic.syntax_blocks.join(' '),
    topic.relationships.join(' '),
    topic.validation.join(' '),
    topic.source_refs.join(' '),
  ]
    .join(' ')
    .toLowerCase();
}

function splitAuthoredDocument(text, sourcePath) {
  // The update snapshot is a plain document, not a knowledge topic: it has no id,
  // category, syntax blocks or validation list. Parse it loosely rather than
  // running it through the topic validator.
  const normalised = String(text).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (!normalised.startsWith('---')) {
    throw new KnowledgeSourceError(`${sourcePath}: missing front matter block`);
  }
  const end = normalised.indexOf('\n---', 3);
  if (end === -1) {
    throw new KnowledgeSourceError(`${sourcePath}: unterminated front matter block`);
  }
  const frontMatter = normalised.slice(normalised.indexOf('\n', 3) + 1, end);
  const titleMatch = /^title:\s*(.*)$/m.exec(frontMatter);
  if (!titleMatch) {
    throw new KnowledgeSourceError(`${sourcePath}: front matter must declare \`title\``);
  }
  const afterMarker = normalised.indexOf('\n', end + 1);
  const body = afterMarker === -1 ? '' : normalised.slice(afterMarker + 1).trim();
  return { title: titleMatch[1].trim().replace(/^["']|["']$/g, ''), body };
}

function pathToFileUrl(path) {
  let resolved = path.replace(/\\/g, '/');
  if (!resolved.startsWith('/')) resolved = '/' + resolved;
  return new URL(`file://${resolved}`).href;
}
