//------------------------------------------------------------------------------------
// resources.mjs -- Part of RStellarScribe
//
// MCP resources. The URI shapes are RHoiScribe's, with `stellaris` as the subject:
//
//   rh...://stellaris/latest-update            text/markdown
//   rh...://stellaris/knowledge/catalog        application/toml
//   rh...://stellaris/knowledge/<topic_id>     text/markdown
//
// The catalog is TOML with the same field names RHoiScribe emits, so a reader built
// for the original parses it unchanged.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//------------------------------------------------------------------------------------

import { loadLatestUpdate, topicToMarkdown } from './knowledge.mjs';

export const URI_SCHEME = 'rstellariscribe';
export const LATEST_UPDATE_URI = `${URI_SCHEME}://stellaris/latest-update`;
export const KNOWLEDGE_CATALOG_URI = `${URI_SCHEME}://stellaris/knowledge/catalog`;
export const KNOWLEDGE_TOPIC_PREFIX = `${URI_SCHEME}://stellaris/knowledge/`;

export class ResourceReadError extends Error {}

/** Build the resource registry for a loaded knowledge catalogue. */
export function createResourceRegistry({ knowledge, projectRoot }) {
  const latestUpdate = loadLatestUpdate(projectRoot);

  function list() {
    const resources = [
      {
        uri: LATEST_UPDATE_URI,
        name: 'stellaris_latest_update',
        title: latestUpdate.title,
        description: 'Bundled snapshot of what changed in the newest Stellaris release this build was written against.',
        mimeType: 'text/markdown',
        size: Buffer.byteLength(latestUpdate.body, 'utf8'),
      },
      {
        uri: KNOWLEDGE_CATALOG_URI,
        name: 'stellaris_knowledge_catalog',
        title: 'Stellaris knowledge catalog',
        description: 'Structured index of every bundled Stellaris modding knowledge topic.',
        mimeType: 'application/toml',
        size: Buffer.byteLength(knowledge.catalogIndexToml(), 'utf8'),
      },
    ];
    for (const topic of knowledge.topics) {
      const text = topicToMarkdown(topic);
      resources.push({
        uri: `${KNOWLEDGE_TOPIC_PREFIX}${topic.id}`,
        name: `stellaris_${topic.id.replace(/[.]/g, '_')}`,
        title: topic.title,
        description: `Stellaris ${topic.category} guidance: ${topic.file_types.join(', ') || 'general'}.`,
        mimeType: 'text/markdown',
        size: Buffer.byteLength(text, 'utf8'),
      });
    }
    return resources;
  }

  function templates() {
    return [
      {
        uriTemplate: `${KNOWLEDGE_TOPIC_PREFIX}{topic_id}`,
        name: 'stellaris_knowledge_topic',
        title: 'Stellaris knowledge topic',
        description: 'One bundled knowledge topic, addressed by topic id from the catalog.',
        mimeType: 'text/markdown',
      },
    ];
  }

  function read(uri) {
    if (typeof uri !== 'string' || uri === '') {
      throw new ResourceReadError('a resource uri is required');
    }
    if (uri === LATEST_UPDATE_URI) {
      return { uri, mimeType: 'text/markdown', text: latestUpdate.body };
    }
    if (uri === KNOWLEDGE_CATALOG_URI) {
      return { uri, mimeType: 'application/toml', text: knowledge.catalogIndexToml() };
    }
    if (uri.startsWith(KNOWLEDGE_TOPIC_PREFIX)) {
      const topicId = uri.slice(KNOWLEDGE_TOPIC_PREFIX.length);
      const topic = knowledge.topic(topicId);
      if (!topic) {
        throw new ResourceReadError(
          `unknown resource \`${uri}\`; read ${KNOWLEDGE_CATALOG_URI} for the topic list`,
        );
      }
      return { uri, mimeType: 'text/markdown', text: topicToMarkdown(topic) };
    }
    throw new ResourceReadError(
      `unknown resource \`${uri}\`; known resources are ${LATEST_UPDATE_URI}, ${KNOWLEDGE_CATALOG_URI} and ${KNOWLEDGE_TOPIC_PREFIX}<topic_id>`,
    );
  }

  return { list, templates, read };
}
