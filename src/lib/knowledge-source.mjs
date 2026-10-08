//------------------------------------------------------------------------------------
// knowledge-source.mjs -- Part of RStellarScribe
//
// RStellarScribe is a Stellaris port of RHoiScribe
// (https://github.com/czxieddan/RHoiScribe, AGPL-3.0-or-later).
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//------------------------------------------------------------------------------------

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Canonical knowledge categories, mirroring RHoiScribe's `category` field and
 * extended for Stellaris-only subsystems.
 */
export const KNOWLEDGE_CATEGORIES = [
  'structure',
  'localisation',
  'script',
  'content',
  'media',
  'debug',
];

/** Front-matter keys that survive into the canonical TOML. */
const SCALAR_KEYS = ['id', 'category', 'title', 'title_zh', 'verified_version'];

/** Front-matter keys parsed as inline arrays. */
const ARRAY_KEYS = ['file_types', 'tags', 'related', 'sources', 'aliases'];

/** Section title fragments that map onto RHoiScribe's structured fields. */
const VALIDATION_TITLES = ['校验要点', 'validation', '校验清单', '检查清单'];
const SYNTAX_TITLES = ['语法与字段', 'syntax', '语法', '字段'];
const RELATION_TITLES = ['关系', 'relationships', '关联'];
const SOURCE_TITLES = ['参考', 'sources', 'source references', '来源'];

export class KnowledgeSourceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'KnowledgeSourceError';
  }
}

/**
 * Parse one authored `knowledge/**\/*.md` topic into the RHoiScribe knowledge
 * topic shape: {id,title,category,file_types,tags,body,syntax_blocks,
 * relationships,validation,source_refs}.
 */
export function parseTopicSource(text, sourcePath = '<memory>') {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const { frontMatter, body } = splitFrontMatter(normalized, sourcePath);
  const meta = parseFrontMatter(frontMatter, sourcePath);

  const sections = splitSections(body);
  const syntaxBlocks = [];
  const validation = [];
  const relationships = [];
  const sourceRefs = [...(meta.arrays.sources ?? [])];
  const proseSections = [];

  const hasSyntaxSection = sections.some((section) =>
    matchesAny(section.title, SYNTAX_TITLES),
  );

  for (const section of sections) {
    const isValidation = matchesAny(section.title, VALIDATION_TITLES);
    const isSyntax = matchesAny(section.title, SYNTAX_TITLES);
    const isRelation = matchesAny(section.title, RELATION_TITLES);
    const isSource = matchesAny(section.title, SOURCE_TITLES);

    if (isValidation) {
      validation.push(...bulletItems(section.content));
      continue;
    }
    if (isRelation) {
      relationships.push(...bulletItems(section.content), ...paragraphItems(section.content));
      continue;
    }
    if (isSource) {
      sourceRefs.push(...linkItems(section.content), ...bulletItems(section.content));
      continue;
    }
    if (isSyntax || !hasSyntaxSection) {
      syntaxBlocks.push(...codeFences(section.content));
      if (isSyntax) {
        const leftover = stripCodeFences(section.content).trim();
        if (leftover) {
          proseSections.push({ title: section.title, content: leftover });
        }
        continue;
      }
    }
    proseSections.push(section);
  }

  const bodyText = proseSections
    .map((section) => (section.title ? `## ${section.title}\n\n${section.content.trim()}` : section.content.trim()))
    .filter(Boolean)
    .join('\n\n');

  const topic = {
    id: requireString(meta.scalars.id, 'id', sourcePath),
    title: requireString(meta.scalars.title, 'title', sourcePath),
    category: requireString(meta.scalars.category, 'category', sourcePath),
    file_types: meta.arrays.file_types ?? [],
    tags: meta.arrays.tags ?? [],
    body: bodyText,
    syntax_blocks: dedupe(syntaxBlocks),
    relationships: dedupe([...(meta.arrays.related ?? []), ...relationships]),
    validation: dedupe(validation),
    source_refs: dedupe(sourceRefs),
    // Extensions over RHoiScribe's schema. A serde-based reader ignores unknown
    // fields by default, so these stay portable back to the Rust original.
    title_zh: meta.scalars.title_zh ?? '',
    verified_version: meta.scalars.verified_version ?? '',
    aliases: meta.arrays.aliases ?? [],
    source_path: sourcePath.split(sep).join('/'),
  };

  validateTopic(topic, sourcePath);
  return topic;
}

/** Read every authored topic below `knowledgeRoot`, sorted by id. */
export function readKnowledgeSources(knowledgeRoot) {
  const paths = [];
  walk(knowledgeRoot, paths);
  const topics = paths.map((path) =>
    parseTopicSource(readFileSync(path, 'utf8'), relative(knowledgeRoot, path)),
  );
  topics.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const seen = new Map();
  for (const topic of topics) {
    const previous = seen.get(topic.id);
    if (previous) {
      throw new KnowledgeSourceError(
        `duplicate knowledge topic id \`${topic.id}\` in ${previous} and ${topic.source_path}`,
      );
    }
    seen.set(topic.id, topic.source_path);
  }

  return topics;
}

function walk(directory, out) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'updates' || entry.name.startsWith('.')) continue;
      walk(full, out);
      continue;
    }
    if (!entry.name.endsWith('.md')) continue;
    if (entry.name.startsWith('_')) continue;
    if (!statSync(full).isFile()) continue;
    out.push(full);
  }
}

function splitFrontMatter(text, sourcePath) {
  if (!text.startsWith('---')) {
    throw new KnowledgeSourceError(`${sourcePath}: missing front matter block`);
  }
  const end = text.indexOf('\n---', 3);
  if (end === -1) {
    throw new KnowledgeSourceError(`${sourcePath}: unterminated front matter block`);
  }
  const afterMarker = text.indexOf('\n', end + 1);
  return {
    frontMatter: text.slice(text.indexOf('\n', 3) + 1, end + 1),
    body: afterMarker === -1 ? '' : text.slice(afterMarker + 1),
  };
}

function parseFrontMatter(block, sourcePath) {
  const scalars = {};
  const arrays = {};
  for (const rawLine of block.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf(':');
    if (separator === -1) {
      throw new KnowledgeSourceError(`${sourcePath}: invalid front matter line \`${line}\``);
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (ARRAY_KEYS.includes(key)) {
      arrays[key] = parseInlineArray(value);
    } else if (SCALAR_KEYS.includes(key) || key === 'summary') {
      scalars[key] = unquote(value);
    } else {
      throw new KnowledgeSourceError(`${sourcePath}: unknown front matter key \`${key}\``);
    }
  }
  return { scalars, arrays };
}

function parseInlineArray(value) {
  const trimmed = value.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    throw new KnowledgeSourceError(`expected an inline array, received \`${value}\``);
  }
  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return [];
  return inner
    .split(',')
    .map((item) => unquote(item.trim()))
    .filter((item) => item.length > 0);
}

function unquote(value) {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

function splitSections(body) {
  const sections = [];
  let title = '';
  let buffer = [];
  for (const line of body.split('\n')) {
    const heading = /^##\s+(.*)$/.exec(line);
    if (heading) {
      sections.push({ title, content: buffer.join('\n') });
      title = heading[1].trim();
      buffer = [];
      continue;
    }
    buffer.push(line);
  }
  sections.push({ title, content: buffer.join('\n') });
  return sections.filter((section) => section.title || section.content.trim());
}

function matchesAny(title, candidates) {
  const lower = title.toLowerCase();
  return candidates.some((candidate) => lower.includes(candidate.toLowerCase()));
}

function bulletItems(content) {
  const items = [];
  let current = null;
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trimEnd();
    const bullet = /^\s*(?:[-*]|\d+\.)\s+(.*)$/.exec(line);
    if (bullet) {
      if (current) items.push(current);
      current = bullet[1].trim();
      continue;
    }
    if (current && /^\s{2,}\S/.test(line)) {
      current += ' ' + line.trim();
      continue;
    }
    if (current) {
      items.push(current);
      current = null;
    }
  }
  if (current) items.push(current);
  return items.map(stripInlineMarkdown).filter((item) => item.length > 0);
}

function paragraphItems(content) {
  return stripCodeFences(content)
    .split(/\n\s*\n/)
    .map((paragraph) => stripInlineMarkdown(paragraph.replace(/\s+/g, ' ').trim()))
    .filter((paragraph) => paragraph.length > 0 && !paragraph.startsWith('#'));
}

function linkItems(content) {
  const links = [];
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    links.push(match[2]);
  }
  if (links.length === 0) {
    for (const match2 of content.matchAll(/https?:\/\/[^\s<>)\]]+/g)) {
      links.push(match2[0]);
    }
  }
  return links;
}

function codeFences(content) {
  const blocks = [];
  const pattern = /```[^\n]*\n([\s\S]*?)```/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const block = match[1].replace(/\s+$/, '');
    if (block.trim()) blocks.push(block);
  }
  return blocks;
}

function stripCodeFences(content) {
  return content.replace(/```[^\n]*\n[\s\S]*?```/g, '');
}

function stripInlineMarkdown(text) {
  return text
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1')
    .trim();
}

function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = item.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function requireString(value, key, sourcePath) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new KnowledgeSourceError(`${sourcePath}: front matter \`${key}\` is required`);
  }
  return value.trim();
}

function validateTopic(topic, sourcePath) {
  if (!KNOWLEDGE_CATEGORIES.includes(topic.category)) {
    throw new KnowledgeSourceError(
      `${sourcePath}: category \`${topic.category}\` must be one of ${KNOWLEDGE_CATEGORIES.join(', ')}`,
    );
  }
  if (!topic.body.trim()) {
    throw new KnowledgeSourceError(`${sourcePath}: topic body is empty after parsing sections`);
  }
  if (topic.syntax_blocks.length === 0) {
    throw new KnowledgeSourceError(`${sourcePath}: at least one syntax block is required`);
  }
  if (topic.validation.length === 0) {
    throw new KnowledgeSourceError(`${sourcePath}: at least one validation item is required`);
  }
  if (/[^a-z0-9._-]/.test(topic.id)) {
    throw new KnowledgeSourceError(
      `${sourcePath}: id \`${topic.id}\` must use lowercase letters, digits, dot, dash or underscore`,
    );
  }
}
