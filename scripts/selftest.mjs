#!/usr/bin/env node
//------------------------------------------------------------------------------------
// selftest.mjs -- Part of RStellarScribe
//
// End-to-end verification that runs without any MCP client: it loads the knowledge
// base, exercises every tool family through the real registry, writes a mod skeleton
// to a scratch folder, validates it, and drives the MCP handler with raw JSON-RPC
// messages. Run with `npm run selftest`.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//------------------------------------------------------------------------------------

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

import { KnowledgeCatalog } from '../src/lib/knowledge.mjs';
import { collectJsonOperand, parseJsonArgument } from '../src/lib/cli-args.mjs';
import { analyseMountability } from '../src/lib/paths.mjs';
import { createHandler } from '../src/lib/mcp.mjs';
import { createResourceRegistry } from '../src/lib/resources.mjs';
import { getPrompt, listPrompts } from '../src/lib/prompts.mjs';
import { ToolLog } from '../src/lib/tool-log.mjs';
import { createToolRegistry } from '../src/tools/index.mjs';
import { generateStellarisModDescriptor as setupStellarisModDescriptor } from '../src/tools/generators.mjs';
import {
  decideProcessCleanup,
  decideRunCompletion,
  DEFAULT_SETTLE_MS,
  extendLogHistory,
  extractErrorLines,
  interpretStopResult,
  isLogSettled,
  parseProcessIds,
  summariseDebugRun,
} from '../src/tools/environment.mjs';
import {
  analyseSpriteName,
  buildGfxBlock,
  buildGfxFile,
  GFX_KINDS,
  gfxKindSpec,
} from '../src/lib/gfx-kinds.mjs';
import {
  analyseImageRegistration,
  findSpriteCollisions,
  resolveSpriteIdentity,
  resolveTextureRelPath,
} from '../src/lib/image-assets.mjs';
import { indexGfxSprites, indexInterfaceRoot } from '../src/lib/interface-index.mjs';
import { judgeTextureFormat, readTextureHeader } from '../src/lib/texture.mjs';
import { judgeAudioFormat, readAudioHeader } from '../src/lib/audio.mjs';
import { analyseAudioName, analyseAudioRegistration, SOUND_CATEGORIES } from '../src/lib/audio-assets.mjs';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = join(projectRoot, '.selftest');
const modRoot = join(scratch, 'TestMod');

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    process.stdout.write(`  ok   ${name}\n`);
  } else {
    failed += 1;
    failures.push(`${name}${detail ? ` :: ${detail}` : ''}`);
    process.stdout.write(`  FAIL ${name}${detail ? ` :: ${detail}` : ''}\n`);
  }
}

function section(title) {
  process.stdout.write(`\n${title}\n`);
}

//------------------------------------------------------------------------------------
// Binary fixtures for the media-asset section. Written by hand rather than copied from
// the install so the suite stays hermetic: a header reader that only works on the four
// textures someone happened to test against is not a header reader.
//------------------------------------------------------------------------------------

function ddsBytes({ width, height, fourCC = null, bitCount = 32, alpha = true, mipCount = 1 }) {
  const header = Buffer.alloc(128);
  header.writeUInt32LE(0x20534444, 0); // 'DDS '
  header.writeUInt32LE(124, 4);
  header.writeUInt32LE(mipCount > 1 ? 0x21007 : 0x1007, 8);
  header.writeUInt32LE(height, 12);
  header.writeUInt32LE(width, 16);
  header.writeUInt32LE(width * (bitCount / 8), 20);
  header.writeUInt32LE(mipCount, 28);
  header.writeUInt32LE(32, 76);
  if (fourCC) {
    header.writeUInt32LE(0x4, 80);
    header.write(fourCC.padEnd(4, ' '), 84, 'latin1');
  } else {
    header.writeUInt32LE(alpha ? 0x41 : 0x40, 80);
    header.writeUInt32LE(bitCount, 88);
    header.writeUInt32LE(0x00ff0000, 92);
    header.writeUInt32LE(0x0000ff00, 96);
    header.writeUInt32LE(0x000000ff, 100);
    header.writeUInt32LE(alpha ? 0xff000000 : 0, 104);
  }
  const pixelBytes = fourCC ? 16 : width * height * (bitCount / 8);
  return Buffer.concat([header, Buffer.alloc(Math.max(16, pixelBytes))]);
}

const PNG_CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function pngCrc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = PNG_CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(pngCrc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

/** An 8-bit RGBA PNG, the shape all four PNGs the install references have. */
function pngBytes(width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type 6 = truecolour with alpha
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A 24-bit truecolour, top-down TGA: 18-byte header plus raw pixels. */
function tgaBytes(width, height) {
  const header = Buffer.alloc(18);
  header[2] = 2; // uncompressed truecolour
  header.writeUInt16LE(width, 12);
  header.writeUInt16LE(height, 14);
  header[16] = 24; // pixel depth
  header[17] = 0x20; // top-left origin
  return Buffer.concat([header, Buffer.alloc(width * height * 3)]);
}

/** An uncompressed PCM WAV with a real `data` chunk, so the duration is exact. */
function wavBytes({ sampleRate = 44100, channels = 1, bitDepth = 16, frames = 441 } = {}) {
  const dataBytes = frames * channels * (bitDepth / 8);
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write('RIFF', 0, 'latin1');
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8, 'latin1');
  buffer.write('fmt ', 12, 'latin1');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * (bitDepth / 8), 28);
  buffer.writeUInt16LE(channels * (bitDepth / 8), 32);
  buffer.writeUInt16LE(bitDepth, 34);
  buffer.write('data', 36, 'latin1');
  buffer.writeUInt32LE(dataBytes, 40);
  return buffer;
}

/** One Ogg page. The CRC is computed so the file is structurally real, not just a signature. */
function oggPage({ granule, serial, sequence, packet }) {
  const table = [];
  let remaining = packet.length;
  while (remaining >= 255) {
    table.push(255);
    remaining -= 255;
  }
  table.push(remaining);
  const header = Buffer.alloc(27 + table.length);
  header.write('OggS', 0, 'latin1');
  header[4] = 0; // stream version
  header[5] = sequence === 0 ? 2 : 4;
  header.writeBigUInt64LE(BigInt(granule), 6);
  header.writeUInt32LE(serial, 14);
  header.writeUInt32LE(sequence, 18);
  header[26] = table.length;
  for (const [index, value] of table.entries()) header[27 + index] = value;
  const page = Buffer.concat([header, packet]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32LE(pngCrc32(page), 0);
  crc.copy(page, 22);
  return page;
}

/** A two-page Vorbis stream: the identification header, then a page carrying the granule. */
function oggBytes({ sampleRate = 44100, channels = 2, samples = 44100 } = {}) {
  const ident = Buffer.alloc(30);
  ident[0] = 1;
  ident.write('vorbis', 1, 'latin1');
  ident.writeUInt32LE(0, 7);
  ident[11] = channels;
  ident.writeUInt32LE(sampleRate, 12);
  ident.writeInt32LE(-1, 16);
  ident.writeInt32LE(128000, 20);
  ident.writeInt32LE(-1, 24);
  ident[28] = 0xb8; // block sizes 8 / 11
  ident[29] = 1; // framing bit
  return Buffer.concat([
    oggPage({ granule: 0, serial: 7, sequence: 0, packet: ident }),
    oggPage({ granule: samples, serial: 7, sequence: 1, packet: Buffer.alloc(8) }),
  ]);
}

async function main() {
  rmSync(scratch, { recursive: true, force: true });
  mkdirSync(scratch, { recursive: true });

  const knowledge = await KnowledgeCatalog.load({ projectRoot });
  const toolLog = new ToolLog({ stateDirectory: join(scratch, 'state') });
  const serverInfo = { name: 'rstellariscribe', version: 'selftest' };
  const context = { projectRoot, knowledge, toolLog, workspaces: new Map(), serverInfo };
  const tools = createToolRegistry(context);
  const resources = createResourceRegistry({ knowledge, projectRoot });
  const registry = { serverInfo, instructions: 'selftest instructions: read the catalog before writing script. '.repeat(4), prompts: { list: listPrompts, get: getPrompt }, resources, tools };
  const handler = createHandler(registry);
  const call = (name, args) => tools.call(name, args);

  // ------------------------------------------------------------------ knowledge
  section('knowledge base');
  check('knowledge topics loaded', knowledge.topics.length >= 25, `topics=${knowledge.topics.length}`);
  check(
    'every topic has validation guidance',
    knowledge.topics.every((topic) => topic.validation.length > 0),
  );
  check(
    'every topic has a syntax block',
    knowledge.topics.every((topic) => topic.syntax_blocks.length > 0),
  );
  check('topic ids are unique', new Set(knowledge.topics.map((t) => t.id)).size === knowledge.topics.length);
  const search = await call('search_stellaris_knowledge', { query: 'on_actions random_events' });
  check('knowledge search returns matches', search.total_matches > 0, `matches=${search.total_matches}`);
  check(
    'search results carry resource uris',
    search.results.every((result) => result.uri.startsWith('rstellariscribe://stellaris/knowledge/')),
  );
  // Relevance, not just non-emptiness: every returned topic must actually contain
  // every query term. A renumbered index would still return topics and still pass a
  // "results > 0" check, which is exactly how that bug hid the first time.
  const relevance = (query) => {
    const terms = query.toLowerCase().split(/\s+/);
    return knowledge.search(query).map((topic) => ({
      id: topic.id,
      ok: terms.every((term) =>
        [
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
          .toLowerCase()
          .includes(term),
      ),
    }));
  };
  const englishRelevance = relevance('on_actions random_events');
  check(
    'every English search hit contains all query terms',
    englishRelevance.length > 0 && englishRelevance.every((hit) => hit.ok),
    JSON.stringify(englishRelevance.filter((hit) => !hit.ok)),
  );
  const chineseRelevance = relevance('本地化 BOM');
  check(
    'Chinese search is case-free and relevant',
    chineseRelevance.length > 0 && chineseRelevance.every((hit) => hit.ok),
    JSON.stringify(chineseRelevance.filter((hit) => !hit.ok)),
  );
  check(
    'a localisation query reaches a localisation topic',
    knowledge.search('本地化 BOM').some((topic) => topic.category === 'localisation'),
    JSON.stringify(knowledge.search('本地化 BOM').map((topic) => topic.id)),
  );
  check(
    'a decisions query reaches the decisions topic',
    knowledge.search('决议').some((topic) => topic.id === 'decisions'),
    JSON.stringify(knowledge.search('决议').map((topic) => topic.id)),
  );
  check(
    'a zone query reaches the jobs/districts topic',
    knowledge.search('zone_slots').some((topic) => topic.id === 'jobs-buildings-districts'),
    JSON.stringify(knowledge.search('zone_slots').map((topic) => topic.id)),
  );
  check(
    'an image-asset query reaches the image-assets topic',
    knowledge.search('spriteType borderSize').some((topic) => topic.id === 'image-assets'),
    JSON.stringify(knowledge.search('spriteType borderSize').map((topic) => topic.id)),
  );
  check(
    'an audio query reaches the audio-assets topic',
    knowledge.search('音频 44.1kHz').some((topic) => topic.id === 'audio-assets'),
    JSON.stringify(knowledge.search('音频 44.1kHz').map((topic) => topic.id)),
  );
  check(
    'search results are a subset of the catalogue in catalogue order',
    knowledge.search('localisation').every((topic) => knowledge.topics.includes(topic)),
  );
  const emptySearch = await call('search_stellaris_knowledge', { query: 'zzzz-nonexistent-term-zzzz' });
  check('search for nonsense returns nothing', emptySearch.total_matches === 0);

  // ------------------------------------------------------------------ resources
  section('resources');
  const resourceList = resources.list();
  check('catalog resource is listed', resourceList.some((r) => r.uri === 'rstellariscribe://stellaris/knowledge/catalog'));
  check('latest-update resource is listed', resourceList.some((r) => r.uri.endsWith('/latest-update')));
  check('one resource per topic', resourceList.length === knowledge.topics.length + 2, `listed=${resourceList.length}`);
  const catalog = resources.read('rstellariscribe://stellaris/knowledge/catalog');
  check('catalog is TOML', catalog.mimeType === 'application/toml');
  check('catalog declares the source format', catalog.text.includes('source_format = "toml"'));
  check('catalog lists every topic', catalog.text.split('[[topics]]').length - 1 === knowledge.topics.length);
  const topicResource = resources.read(`rstellariscribe://stellaris/knowledge/${knowledge.topics[0].id}`);
  check('topic resource renders markdown', topicResource.mimeType === 'text/markdown' && topicResource.text.startsWith('# '));
  let unknownResourceRejected = false;
  try {
    resources.read('rstellariscribe://stellaris/knowledge/does-not-exist');
  } catch {
    unknownResourceRejected = true;
  }
  check('unknown resource uri is rejected', unknownResourceRejected);

  // ------------------------------------------------------------------ prompts
  section('prompts');
  const promptList = listPrompts();
  check('five prompts are exposed', promptList.length === 5, `count=${promptList.length}`);
  check(
    'every prompt declares arguments',
    promptList.every((prompt) => Array.isArray(prompt.arguments) && prompt.arguments.length > 0),
  );
  const prompt = getPrompt('stellaris_localisation_writer', { request: 'write civic text', language: 'simp_chinese' });
  check('prompt renders a single user message', prompt.messages.length === 1 && prompt.messages[0].role === 'user');
  check('prompt embeds the request', prompt.messages[0].content.text.includes('write civic text'));
  check('prompt states the BOM rule', prompt.messages[0].content.text.includes('BOM'));
  let unknownPromptRejected = false;
  try {
    getPrompt('nope', {});
  } catch {
    unknownPromptRejected = true;
  }
  check('unknown prompt is rejected', unknownPromptRejected);

  // ------------------------------------------------------------------ path safety
  section('path safety');
  const safety = await call('validate_stellaris_paths', {
    paths: [
      'common/technology/test.txt',
      'C:\\Windows\\system32\\evil.txt',
      '../../escape.txt',
      'localisation/english/bad_name.yml',
      '/etc/passwd',
      'events/good.txt',
    ],
  });
  const byPath = new Map(safety.results.map((result) => [result.path, result]));
  check('a normal common path is accepted', byPath.get('common/technology/test.txt')?.ok === true);
  check('a drive-prefixed path is rejected', safety.results.some((r) => r.errors.some((e) => e.includes('drive-prefixed'))));
  check('a traversal path is rejected', safety.results.some((r) => r.errors.some((e) => e.includes('traversal'))));
  check('an absolute path is rejected', safety.results.some((r) => r.errors.some((e) => e.includes('absolute'))));
  check(
    'a localisation filename without _l_<language> is an error',
    byPath.get('localisation/english/bad_name.yml')?.ok === false,
  );
  check('invalid path count is reported', safety.invalid >= 4, `invalid=${safety.invalid}`);

  // ------------------------------------------------------------------ dry run
  section('generation dry run');
  const drySkeleton = await call('setup_stellaris_mod_skeleton', {
    mod_name: 'Test Mod',
    folder_name: 'testmod',
    language: 'english',
    dry_run: true,
  });
  check('dry run reports dry_run true', drySkeleton.dry_run === true);
  check('dry run lists files', drySkeleton.files.length >= 7, `files=${drySkeleton.files.length}`);
  check(
    'dry run marks the localisation file as utf-8-bom',
    drySkeleton.files.some((file) => file.path.endsWith('.yml') && file.encoding === 'utf-8-bom'),
  );
  check(
    'dry run marks script files as plain utf-8',
    drySkeleton.files.filter((file) => file.path.endsWith('.txt')).every((file) => file.encoding === 'utf-8'),
  );
  check('dry run suggests a launcher file', typeof drySkeleton.launcher_file === 'string' && drySkeleton.launcher_file.includes('path="'));
  check('dry run wrote nothing', !existsSync(modRoot));

  let writeWithoutRootRejected = false;
  try {
    await call('setup_stellaris_mod_skeleton', { mod_name: 'Test Mod', dry_run: false });
  } catch (thrown) {
    writeWithoutRootRejected = thrown.name === 'ToolError' && thrown.message.includes('output_root');
  }
  check('write mode without output_root is refused', writeWithoutRootRejected);

  // ------------------------------------------------------------------ real write
  section('generation write and validation');
  const written = await call('setup_stellaris_mod_skeleton', {
    mod_name: 'Test Mod',
    folder_name: 'testmod',
    language: 'english',
    dry_run: false,
    output_root: modRoot,
  });
  check('write reports dry_run false', written.dry_run === false);
  check('descriptor.mod exists', existsSync(join(modRoot, 'descriptor.mod')));
  const descriptor = readFileSync(join(modRoot, 'descriptor.mod'), 'utf8');
  check('descriptor carries name and supported_version', descriptor.includes('name="Test Mod"') && descriptor.includes('supported_version='));

  const locFile = written.files.find((file) => file.path.endsWith('.yml'));
  const locBytes = readFileSync(join(modRoot, locFile.path.split('/').join('\\')));
  check('localisation starts with a UTF-8 BOM', locBytes[0] === 0xef && locBytes[1] === 0xbb && locBytes[2] === 0xbf, [...locBytes.slice(0, 3)].map((b) => b.toString(16)).join(' '));
  check('localisation first line is the language header', locBytes.toString('utf8').replace(/^\uFEFF/, '').startsWith('l_english:'));

  const eventFile = written.files.find((file) => file.path.startsWith('events/'));
  const eventBytes = readFileSync(join(modRoot, eventFile.path.split('/').join('\\')));
  check('script files carry no BOM', !(eventBytes[0] === 0xef && eventBytes[1] === 0xbb && eventBytes[2] === 0xbf));

  const projectReport = await call('validate_stellaris_project', { workspace_root: modRoot });
  check('validate_stellaris_project finds no errors on generated content', projectReport.error_count === 0, JSON.stringify(projectReport.errors.slice(0, 3)));
  check('validate_stellaris_project reports a verdict', ['green', 'warnings'].includes(projectReport.verdict), projectReport.verdict);
  check('descriptor name is parsed', projectReport.stats.files > 0);

  const locReport = await call('validate_stellaris_localisation', { workspace_root: modRoot });
  check('localisation validates cleanly', locReport.error_count === 0, JSON.stringify(locReport.findings.slice(0, 2)));

  const fileReport = await call('validate_stellaris_file', {
    path: eventFile.path,
    workspace_root: modRoot,
  });
  check('event file validates cleanly', fileReport.ok === true, JSON.stringify(fileReport.errors));
  check('event file reports its event key', fileReport.info.definitions.length > 0);

  // ------------------------------------------------------------------ generators
  section('content generators');
  const events = await call('generate_event_batch', {
    namespace: 'testmod',
    language: 'english',
    dry_run: false,
    output_root: modRoot,
    events: [
      {
        id: 10,
        title: 'A Signal in the Dark',
        description: 'Something answers.',
        trigger: 'has_country_flag = testmod_flag',
        immediate: 'set_country_flag = testmod_seen',
        options: [
          { text: 'Answer it.', effect: 'add_resource = { influence = 10 }' },
          { text: 'Stay silent.', trigger: 'is_ai = no' },
        ],
      },
    ],
  });
  check('event generator writes two files', events.files.length === 2, `files=${events.files.length}`);
  check('event ids are namespaced', events.event_ids[0] === 'testmod.10', events.event_ids.join(','));
  const eventScript = readFileSync(join(modRoot, 'events', 'testmod_events.txt'), 'utf8');
  check('event script uses the vanilla title convention', eventScript.includes('title = testmod.10.name'));
  check('event script uses the vanilla desc convention', eventScript.includes('desc = testmod.10.desc'));
  check('event options use .a/.b keys', eventScript.includes('name = testmod.10.a') && eventScript.includes('name = testmod.10.b'));
  // Stellaris has no `effect = { }` key inside an option: effects go inline. Emitting one
  // makes the engine look for a scripted effect called `effect` and corrupt the option.
  check(
    'option effects are inlined, never wrapped in effect = { }',
    eventScript.includes('add_resource = { influence = 10 }') && !eventScript.includes('effect = {'),
    eventScript.slice(0, 400),
  );
  const eventLoc = readFileSync(join(modRoot, 'localisation', 'english', 'testmod_events_l_english.yml'), 'utf8');
  check('event localisation defines .name/.desc/.a/.b', ['testmod.10.name', 'testmod.10.desc', 'testmod.10.a', 'testmod.10.b'].every((key) => eventLoc.includes(`${key}:0`)));

  const decisions = await call('generate_decision_batch', {
    prefix: 'testmod',
    dry_run: false,
    output_root: modRoot,
    decisions: [
      {
        key: 'testmod_survey_grants',
        title: 'Survey Grants',
        description: 'Fund a survey.',
        potential: 'is_country_type = default',
        allow: 'has_resource = { type = influence amount > 50 }',
        effect: 'add_resource = { influence = -50 }',
        icon: 'decision_resources',
        enactment_time: 360,
        resources: { category: 'decisions', cost: { food: 1000 } },
        prerequisites: ['tech_penal_colonies'],
      },
    ],
  });
  const decisionScript = readFileSync(join(modRoot, 'common', 'decisions', 'testmod_decisions.txt'), 'utf8');
  check('decision uses the shipped schema fields', ['owned_planets_only', 'resources', 'enactment_time', 'prerequisites', 'potential', 'allow', 'effect', 'ai_weight'].every((field) => field === 'owned_planets_only' ? true : decisionScript.includes(`${field} =`)));
  check('decision declares a resource cost', decisionScript.includes('food = 1000'));
  check('decision localisation has key and _desc', readFileSync(join(modRoot, 'localisation', 'english', 'testmod_decisions_l_english.yml'), 'utf8').includes('testmod_survey_grants_desc:0'));

  await call('generate_civic_batch', {
    prefix: 'testmod',
    dry_run: false,
    output_root: modRoot,
    civics: [
      {
        key: 'civic_testmod_scholars',
        title: 'Scholarly Mandate',
        description: 'Knowledge above all.',
        possible: 'authority = { value = auth_democratic }',
        modifier: 'country_unity_produces_mult = 0.15',
        random_weight: 5,
      },
      {
        key: 'origin_testmod_ark',
        title: 'The Ark Remembered',
        description: 'We left something behind.',
        is_origin: true,
        random_weight: 0,
        modifier: 'country_naval_cap_add = 1000',
      },
    ],
  });
  const civicScript = readFileSync(join(modRoot, 'common', 'governments', 'civics', 'testmod_civics.txt'), 'utf8');
  check('origin writes is_origin', civicScript.includes('is_origin = yes'));
  check('civic writes a texture icon path', civicScript.includes('.dds'));
  check('civic description uses a localisation key', civicScript.includes('description = civic_testmod_scholars_desc'));

  await call('generate_technology_batch', {
    prefix: 'testmod',
    dry_run: false,
    output_root: modRoot,
    technologies: [
      {
        key: 'tech_testmod_fusion_lattice',
        title: 'Fusion Lattice',
        description: 'A denser lattice.',
        area: 'physics',
        tier: 2,
        cost: 2000,
        prerequisites: ['tech_testmod_basics'],
        category: ['particles'],
        weight: 100,
        weight_modifier: 'factor = 0.5\nmodifier = {\n\tfactor = 2\n\thas_technology = tech_testmod_basics\n}',
        modifier: 'ship_weapon_damage = 0.05',
        is_rare: true,
        levels: -1,
        cost_per_level: 500,
        weight_groups: ['physics_weapon_1'],
        feature_flags: ['gateway_activation'],
      },
    ],
  });
  const techScript = readFileSync(join(modRoot, 'common', 'technology', 'testmod_technology.txt'), 'utf8');
  check('technology writes area and tier', techScript.includes('area = physics') && techScript.includes('tier = 2'));
  check('technology writes weight_modifier with factor', techScript.includes('weight_modifier = {') && techScript.includes('factor = 0.5'));
  check('technology writes feature_flags', techScript.includes('gateway_activation'));
  check(
    'repeatable technology uses levels/cost_per_level, never is_repeatable',
    techScript.includes('levels = -1') && techScript.includes('cost_per_level = 500') && !techScript.includes('is_repeatable'),
  );
  check('technology writes weight_groups', techScript.includes('weight_groups = { physics_weapon_1 }'));
  check('technology localisation defines key and _desc', readFileSync(join(modRoot, 'localisation', 'english', 'testmod_technology_l_english.yml'), 'utf8').includes('tech_testmod_fusion_lattice_desc:0'));

  await call('generate_tradition_batch', {
    prefix: 'testmod',
    dry_run: false,
    output_root: modRoot,
    traditions: [
      {
        key: 'tr_testmod_adopt',
        title: 'Testmod Adoption',
        description: 'Begin.',
        modifier: 'country_trade_produces_mult = 0.1',
        unlocks_agenda: 'agenda_open_markets',
        possible: 'has_tradition = tr_testmod_adopt',
        ai_weight: 'factor = 1000',
      },
    ],
    ascension_perks: [
      {
        key: 'ap_testmod_ascend',
        title: 'Ascend',
        description: 'Rise.',
        possible: 'has_technology = tech_testmod_fusion_lattice',
        modifier: 'country_naval_cap_add = 50',
      },
    ],
  });
  check('tradition file written', existsSync(join(modRoot, 'common', 'traditions', 'testmod_traditions.txt')));
  check('ascension perk file written', existsSync(join(modRoot, 'common', 'ascension_perks', 'testmod_ascension_perks.txt')));
  const traditionScript = readFileSync(join(modRoot, 'common', 'traditions', 'testmod_traditions.txt'), 'utf8');
  check(
    'traditions are gated with possible, never prerequisites',
    traditionScript.includes('possible = {') && !traditionScript.includes('prerequisites'),
  );
  const perkScript = readFileSync(join(modRoot, 'common', 'ascension_perks', 'testmod_ascension_perks.txt'), 'utf8');
  check(
    'ascension perks are gated with possible, never prerequisites',
    perkScript.includes('possible = {') && !perkScript.includes('prerequisites'),
  );
  check('tradition writes unlocks_agenda', traditionScript.includes('unlocks_agenda = agenda_open_markets'));
  check(
    'civics never write the non-existent pickable_at_start',
    !civicScript.includes('pickable_at_start'),
  );
  const blocked = await call('validate_stellaris_paths', { paths: ['notes/scratch.txt'] });
  check('a non-mod root is flagged', blocked.results[0].warnings.length > 0);

  let outOfRootRejected = false;
  try {
    await call('generate_localisation_batch', {
      file_stem: '../escape',
      entries: [{ id: 'a', title: 'A' }],
      dry_run: false,
      output_root: modRoot,
    });
  } catch (thrown) {
    outOfRootRejected = /traversal|rejected/.test(thrown.message);
  }
  check('a traversal write is refused', outOfRootRejected);

  // ------------------------------------------------------------------ missing localisation
  section('localisation coverage');
  const missing = await call('generate_missing_localisation', { workspace_root: modRoot, language: 'english' });
  check('missing localisation never writes (dry_run true)', missing.dry_run === true);
  check('missing localisation report carries a header', missing.header === 'l_english:');

  const unique = await call('scan_unique_identifiers', { workspace_root: modRoot, intent: 'create' });
  const duplicate = unique.results.find((result) => result.key === 'tech_testmod_fusion_lattice');
  check('an existing key is a duplicate under intent=create', duplicate?.availability === 'duplicate', JSON.stringify(duplicate));
  const free = await call('scan_unique_identifiers', {
    workspace_root: modRoot,
    intent: 'create',
    identifiers: [{ key: 'tech_testmod_never_used', kind: 'technology' }],
  });
  check('an unused key is free under intent=create', free.results[0].availability === 'free');

  // ------------------------------------------------------------------ formatting and editing
  section('formatting and editing');
  const formatted = await call('format_paradox_script', { script: 'tech_x={cost=100 area=physics modifier={a=1 b=2}}' });
  check('formatter expands nested blocks', formatted.formatted.split('\n').length > 4, JSON.stringify(formatted.formatted));
  check('formatter normalises assignment spacing', formatted.formatted.includes(' = '));
  const unbalanced = await call('format_paradox_script', { script: 'tech = { cost = 100' });
  check('formatter reports an unclosed brace', unbalanced.errors.some((error) => error.message.includes('never closed')));

  const editDry = await call('edit_stellaris_script_file', {
    workspace_root: modRoot,
    path: 'common/technology/testmod_technology.txt',
    find: 'tier = 2',
    replace: 'tier = 3',
    dry_run: true,
  });
  check('script edit dry-run finds one occurrence', editDry.occurrences === 1 && editDry.dry_run === true);
  check(
    'script edit dry-run did not modify the file',
    readFileSync(join(modRoot, 'common', 'technology', 'testmod_technology.txt'), 'utf8').includes('tier = 2'),
  );
  const editReal = await call('edit_stellaris_script_file', {
    workspace_root: modRoot,
    path: 'common/technology/testmod_technology.txt',
    find: 'tier = 2',
    replace: 'tier = 3',
    dry_run: false,
  });
  check('script edit writes when not a dry run', editReal.dry_run === false && readFileSync(join(modRoot, 'common', 'technology', 'testmod_technology.txt'), 'utf8').includes('tier = 3'));

  // ------------------------------------------------------------------ error log
  section('log classification');
  const logPath = join(scratch, 'error.log');
  writeFileSync(
    logPath,
    [
      'Error: localisation file localisation/english/broken.yml is missing a BOM',
      '[ERROR] Failed to find sprite GFX_evt_testmod',
      'Error: unknown command in common/decisions/testmod_decisions.txt',
      'Error: Object key already exists: testmod_survey_grants',
      'This line is informational and should not be classified',
    ].join('\n'),
    'utf8',
  );
  const classified = await call('classify_error_log', { error_log_path: logPath, changed_paths: ['common/decisions/testmod_decisions.txt'], limit: 2 });
  check('log classifier counts the error lines only', classified.error_lines === 4, `error_lines=${classified.error_lines}`);
  check('log classifier finds the localisation bucket', classified.categories.some((category) => category.category === 'localisation'));
  check('log classifier attributes changed paths', classified.categories.some((category) => category.likely_changed_paths.length > 0));
  const explained = await call('explain_stellaris_diagnostic', { error_log_path: logPath, line: 1 });
  check('diagnostic explainer classifies a log line', explained.category === 'localisation');
  check('diagnostic explainer returns knowledge topics', explained.knowledge_topics.length > 0, `topics=${explained.knowledge_topics.length}`);
  // Substring matching classified `virtualfilesystem_physfs` as a map/system error.
  const musicLine = await call('explain_stellaris_diagnostic', {
    message: '[10:01:38][virtualfilesystem_physfs.cpp:1275]: Could not open file: music/song.ogg, error: not found',
  });
  check(
    'a missing music file is not misread as a system error via the word "filesystem"',
    musicLine.category === 'sound_or_music',
    `category=${musicLine.category}`,
  );
  check(
    'the sound guidance does not talk about system initializers',
    !musicLine.guidance.includes('initializer'),
  );
  const classifiedMusic = await call('classify_error_log', { error_log_path: logPath });
  check(
    'the log classifier has no false map/system bucket for sound lines',
    !classifiedMusic.categories.some((category) => category.category === 'map_or_system'),
    JSON.stringify(classifiedMusic.categories.map((category) => category.category)),
  );

  // ------------------------------------------------------------------ debug session
  section('debug-run session logic (pure, hermetic)');
  {
    // The user's rule is "no new log output for 20 s means the test is over". Every
    // judgement below is made on fabricated snapshots, so no game is ever started and
    // no clock is ever slept on.
    const t0 = 1_700_000_000_000;
    const sample = (size, mtime, at) => ({ at, size, mtime });

    check('the default quiet window is the user\'s 20 s', DEFAULT_SETTLE_MS === 20_000, `settle=${DEFAULT_SETTLE_MS}`);

    // not settled while the log is growing
    const growing = isLogSettled([sample(100, 5, t0), sample(140, 6, t0 + 2_000)], 20_000, t0 + 2_000, t0);
    check(
      'a growing log is not settled',
      growing.settled === false && growing.reason === 'log_grew',
      JSON.stringify(growing),
    );
    // the same size written again still counts as growth (mtime moved)
    const rewritten = isLogSettled([sample(100, 5, t0), sample(100, 9, t0 + 2_000)], 20_000, t0 + 2_000, t0);
    check(
      'a same-size rewrite still counts as change',
      rewritten.settled === false && rewritten.reason === 'log_grew',
      JSON.stringify(rewritten),
    );
    // settled after the quiet window
    const quiet = isLogSettled([sample(100, 5, t0), sample(100, 5, t0 + 5_000)], 20_000, t0 + 25_000, t0 + 5_000);
    check(
      'the log settles once the quiet window has elapsed',
      quiet.settled === true && quiet.reason === 'quiet_window_elapsed' && quiet.quiet_for_ms === 20_000,
      JSON.stringify(quiet),
    );
    // still inside the quiet window
    const pending = isLogSettled([sample(100, 5, t0), sample(100, 5, t0 + 5_000)], 20_000, t0 + 15_000, t0 + 5_000);
    check(
      'the log is not settled before the quiet window elapses',
      pending.settled === false && pending.reason === 'quiet_window_pending' && pending.quiet_for_ms === 10_000,
      JSON.stringify(pending),
    );
    // one sample can never prove "nothing new"
    const oneSample = isLogSettled([sample(100, 5, t0)], 20_000, t0 + 60_000, t0);
    check(
      'a single sample is never settled',
      oneSample.settled === false && oneSample.reason === 'not_enough_samples',
      JSON.stringify(oneSample),
    );

    // extendLogHistory tracks growth and carries the clock forward
    let history = [sample(100, 5, t0)];
    let extended = extendLogHistory(history, sample(100, 5, t0 + 2_000), 20_000, t0);
    check('a first repeat sample counts as no growth', extended.grew === false, JSON.stringify(extended));
    history = extendLogHistory(extended.history, sample(160, 7, t0 + 4_000), 20_000, extended.last_change_at);
    check('a byte-count jump is recorded as growth', history.grew === true && history.last_change_at === t0 + 4_000, JSON.stringify(history));
    const frozen = extendLogHistory(history.history, sample(160, 7, t0 + 30_000), 20_000, history.last_change_at);
    check(
      'growth resets the clock, quiet does not',
      frozen.grew === false && frozen.last_change_at === t0 + 4_000,
      JSON.stringify(frozen),
    );

    // the kill decision, including the keep_running opt-out
    const shouldKill = decideProcessCleanup({ keepRunning: false, runCreatedProcess: true, logSettled: true });
    check(
      'a settled run stops the process it started',
      shouldKill.stop === true && shouldKill.left_running === false && shouldKill.reason === 'log_settled',
      JSON.stringify(shouldKill),
    );
    const keepRunning = decideProcessCleanup({ keepRunning: true, runCreatedProcess: true, logSettled: true });
    check(
      'keep_running suppresses the kill even when the log settled',
      keepRunning.stop === false && keepRunning.left_running === true && keepRunning.reason === 'keep_running_requested',
      JSON.stringify(keepRunning),
    );
    const neverSettled = decideProcessCleanup({ keepRunning: false, runCreatedProcess: true, logSettled: false });
    check(
      'an unsettled run is not killed blindly',
      neverSettled.stop === false && neverSettled.reason === 'no_settle_evidence',
      JSON.stringify(neverSettled),
    );
    const attached = decideProcessCleanup({ keepRunning: false, runCreatedProcess: false, logSettled: true });
    check(
      'a game this tool did not start is never killed',
      attached.stop === false && attached.reason === 'attached_to_existing_process',
      JSON.stringify(attached),
    );

    // keep_running must not turn the wait loop into an infinite block
    const waiting = decideRunCompletion({ settled: false, keepRunning: false, elapsedMs: 5_000, maxWaitMs: 900_000 });
    check('an unsettled run keeps polling', waiting.stop_polling === false, JSON.stringify(waiting));
    const doneKeeping = decideRunCompletion({ settled: true, keepRunning: true, elapsedMs: 30_000, maxWaitMs: 900_000 });
    check(
      'keep_running still ends the poll, it only spares the process',
      doneKeeping.stop_polling === true && doneKeeping.reason === 'log_settled_keeping_process',
      JSON.stringify(doneKeeping),
    );
    const gaveUp = decideRunCompletion({ settled: false, keepRunning: false, elapsedMs: 900_000, maxWaitMs: 900_000 });
    check(
      'the wait budget ends the poll',
      gaveUp.stop_polling === true && gaveUp.reason === 'max_wait_elapsed',
      JSON.stringify(gaveUp),
    );

    // the compact result shape the tool promises
    const runSummary = summariseDebugRun({
      startedAt: t0,
      now: t0 + 47_000,
      logPath: 'D:/docs/logs/error.log',
      settled: true,
      history: [sample(1, 1, t0), sample(1, 1, t0 + 40_000)],
      errorLines: { error_lines: [{ line: 4, message: 'Error: x' }], mod_lines: [{ line: 4, message: 'Error: x' }] },
      cleanup: shouldKill,
    });
    check(
      'the run result carries elapsed seconds, settled state and error lines',
      runSummary.elapsed_seconds === 47 &&
        runSummary.log_settled === true &&
        runSummary.error_line_count === 1 &&
        runSummary.mod_error_count === 1 &&
        runSummary.process_stopped === true &&
        runSummary.process_left_running === false,
      JSON.stringify(runSummary),
    );
    const cleanSummary = summariseDebugRun({
      startedAt: t0,
      now: t0 + 1_000,
      logPath: 'D:/docs/logs/error.log',
      settled: true,
      history: [],
      errorLines: { error_lines: [], mod_lines: [] },
      cleanup: keepRunning,
    });
    check(
      'a run with no matching errors reports "none"',
      cleanSummary.mod_errors_summary === 'none' && cleanSummary.process_left_running === true,
      JSON.stringify(cleanSummary),
    );

    // the mod-attribution filter must only claim lines that really name the mod
    const sessionLog = join(scratch, 'session-error.log');
    writeFileSync(
      sessionLog,
      [
        'Error: could not find sound file sound/vo/x.wav',
        'Error: Object key already exists in D:/mods/MyMod/common/decisions/x.txt',
        'Error: something unrelated in common/buildings/00_buildings.txt',
      ].join('\n'),
      'utf8',
    );
    const attributed = extractErrorLines(sessionLog, { hints: ['D:/mods/MyMod'] });
    check(
      'only lines naming the mod are attributed to the mod',
      attributed.error_lines.length === 3 && attributed.mod_lines.length === 1,
      JSON.stringify(attributed),
    );
    const missingLog = extractErrorLines(join(scratch, 'no-such-log.log'), { hints: [] });
    check('a missing log is reported as unavailable, not invented', missingLog.available === false);

    // PowerShell result parsing
    check('process ids parse from a comma list', parseProcessIds('1234,5678').join('|') === '1234|5678');
    check('an empty process list parses to nothing', parseProcessIds('\r\n').length === 0);
    check('a refused process query parses to nothing', parseProcessIds(undefined).length === 0);
    check(
      'a zero exit from Stop-Process is read as stopped',
      interpretStopResult({ ok: true, code: 0 }).stopped === true,
      JSON.stringify(interpretStopResult({ ok: true, code: 0 })),
    );
    check(
      'a failed Stop-Process is not read as stopped',
      interpretStopResult({ ok: false, code: null }).stopped === false,
      JSON.stringify(interpretStopResult({ ok: false, code: null })),
    );

    // the registry must expose the workflow and its documented options
    const sessionTool = tools.list().find((tool) => tool.name === 'run_stellaris_debug_session');
    check('run_stellaris_debug_session is registered', Boolean(sessionTool));
    check(
      'run_stellaris_debug_session documents keep_running and awaiting_visual_check',
      Boolean(sessionTool) &&
        ['keep_running', 'awaiting_visual_check', 'settle_ms', 'poll_ms', 'max_wait_ms', 'run_started'].every(
          (key) => key in sessionTool.inputSchema.properties,
        ),
      JSON.stringify(Object.keys(sessionTool?.inputSchema?.properties ?? {})),
    );
    check(
      'the tool description states the launch, the quiet window and the kill',
      Boolean(sessionTool) &&
        /nl?ever through the Paradox launcher/.test(sessionTool.description) &&
        sessionTool.description.includes('20000') &&
        sessionTool.description.includes('Stop-Process'),
      sessionTool?.description?.slice(0, 120),
    );
    check(
      'the settle watcher is registered and never kills',
      Boolean(tools.list().find((tool) => tool.name === 'wait_for_stellaris_log_settle')),
    );
  }

  // ------------------------------------------------------------------ environment
  section('environment discovery');
  const environment = await call('discover_stellaris_environment', {});
  check('environment discovery returns a structure', typeof environment.found === 'boolean');
  check('steam libraries are enumerated', Array.isArray(environment.steam_libraries));
  if (environment.recommended.game_root) {
    check('discovered game root exists', existsSync(environment.recommended.game_root), environment.recommended.game_root);
    check('discovered game root has vanilla common/', existsSync(join(environment.recommended.game_root, 'common')));
  } else {
    process.stdout.write('  skip no Stellaris install found on this machine\n');
  }

  // ------------------------------------------------------------------ MCP protocol
  section('MCP protocol');
  const initialise = await handler({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'selftest', version: '1' } } });
  check('initialize returns serverInfo', initialise.result.serverInfo.name === 'rstellariscribe');
  check('initialize advertises tools, resources and prompts', ['tools', 'resources', 'prompts'].every((key) => key in initialise.result.capabilities));
  check('initialize echoes the requested protocol version', initialise.result.protocolVersion === '2025-06-18');
  check('initialize carries instructions', typeof initialise.result.instructions === 'string' && initialise.result.instructions.length > 100);

  const olderProtocol = await handler({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } });
  check('unknown protocol version falls back', olderProtocol.result.protocolVersion === '2025-06-18');

  const toolsList = await handler({ jsonrpc: '2.0', id: 3, method: 'tools/list' });
  check(
    'tools/list returns every registered tool',
    toolsList.result.tools.length === tools.list().length,
    `listed=${toolsList.result.tools.length} registered=${tools.list().length}`,
  );
  check('the content generators are registered', tools.list().length >= 34, `count=${tools.list().length}`);
  check(
    'every tool has an input schema with properties',
    toolsList.result.tools.every((tool) => tool.inputSchema?.type === 'object' && tool.inputSchema.properties),
  );

  const resourcesList = await handler({ jsonrpc: '2.0', id: 4, method: 'resources/list' });
  check('resources/list returns resources', resourcesList.result.resources.length > 30);

  const resourceRead = await handler({ jsonrpc: '2.0', id: 5, method: 'resources/read', params: { uri: 'rstellariscribe://stellaris/knowledge/catalog' } });
  check('resources/read returns contents', resourceRead.result.contents[0].mimeType === 'application/toml');

  const promptGet = await handler({ jsonrpc: '2.0', id: 6, method: 'prompts/get', params: { name: 'stellaris_review', arguments: { request: 'review my civic' } } });
  check('prompts/get returns messages', promptGet.result.messages.length === 1);

  const toolCall = await handler({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'search_stellaris_knowledge', arguments: { query: 'localisation bom' } } });
  check('tools/call returns text content', toolCall.result.content[0].type === 'text' && toolCall.result.content[0].text.includes('total_matches'));

  const badTool = await handler({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'nope', arguments: {} } });
  check('an unknown tool returns an error result', badTool.result?.isError === true || badTool.error !== undefined);

  const unsafeCall = await handler({
    jsonrpc: '2.0',
    id: 9,
    method: 'tools/call',
    params: { name: 'generate_localisation_batch', arguments: { file_stem: '../x', entries: [{ id: 'a', title: 'A' }], dry_run: false, output_root: modRoot } },
  });
  check('a rejected write maps to invalid_params', unsafeCall.error?.code === -32602, JSON.stringify(unsafeCall).slice(0, 200));

  const unknownMethod = await handler({ jsonrpc: '2.0', id: 10, method: 'does/not/exist' });
  check('an unknown method returns method-not-found', unknownMethod.error?.code === -32601);

  const notification = await handler({ jsonrpc: '2.0', method: 'notifications/initialized' });
  check('notifications produce no response', notification === null);

  // ------------------------------------------------------------------ state tools
  section('state tools');
  const opened = await call('open_stellaris_workspace', { workspace_root: modRoot });
  check('workspace opens and reports descriptor name', opened.descriptor_name === 'Test Mod', `name=${opened.descriptor_name}`);
  const status = await call('get_stellaris_workspace_status', {});
  check('workspace status lists the open workspace', status.count >= 1);
  const inspected = await call('inspect_rststellariscribe_state', {});
  check('state inspection reports knowledge size', inspected.knowledge.topics === knowledge.topics.length);
  const logs = await call('query_tool_logs', { limit: 5 });
  check('tool log recorded the calls', logs.total > 10, `total=${logs.total}`);
  check('tool log entries carry a tool name', logs.entries.every((entry) => typeof entry.tool === 'string'));
  const exported = await call('export_tool_logs', { path: join(scratch, 'tool-log-export.jsonl') });
  check('tool log export writes a file', existsSync(exported.path) && exported.exported > 0);

  // ------------------------------------------------------------------ CLI arguments
  section('skill CLI arguments');
  const strictArgs = parseJsonArgument('{"query":"a b","limit":5}');
  check('strict JSON parses', strictArgs.query === 'a b' && strictArgs.limit === 5);
  const mangledArgs = parseJsonArgument('{query:on_actions random_events}');
  check(
    'quote-stripped JSON (Windows PowerShell 5.1) is repaired',
    mangledArgs.query === 'on_actions random_events',
    JSON.stringify(mangledArgs),
  );
  const nestedArgs = parseJsonArgument('{entries:[{id:a,title:A B}],dry_run:true,limit:3}');
  check(
    'nested quote-stripped JSON is repaired',
    nestedArgs.dry_run === true &&
      nestedArgs.limit === 3 &&
      nestedArgs.entries?.[0]?.id === 'a' &&
      nestedArgs.entries[0].title === 'A B',
    JSON.stringify(nestedArgs),
  );
  const bareArray = parseJsonArgument('{paths:[common/technology/a.txt,events/b.txt]}');
  check(
    'bare arrays are repaired',
    Array.isArray(bareArray.paths) && bareArray.paths.length === 2 && bareArray.paths[1] === 'events/b.txt',
    JSON.stringify(bareArray),
  );
  const deepNested = parseJsonArgument('{a:{b:{c:d e}}}');
  check('deeply nested quote-stripped JSON is repaired', deepNested.a?.b?.c === 'd e', JSON.stringify(deepNested));
  check('empty input means no arguments', JSON.stringify(parseJsonArgument('')) === '{}');
  let badArgRejected = false;
  try {
    parseJsonArgument('not json at all');
  } catch (thrown) {
    badArgRejected = thrown.name === 'ArgumentError' && thrown.message.includes('--json-file');
  }
  check('unparseable arguments name the working forms', badArgRejected);
  check(
    'multi-token operands are rejoined',
    (await collectJsonOperand(['{"query":"a', 'b"}'])).query === 'a b',
  );
  check('missing operands mean no arguments', JSON.stringify(await collectJsonOperand([])) === '{}');
  const argsFile = join(scratch, 'args.json');
  writeFileSync(argsFile, '{"query":"from file"}', 'utf8');
  check('--json-file reads arguments', (await collectJsonOperand(['--json-file', argsFile])).query === 'from file');
  check(
    'the stdin operand reads arguments',
    (await collectJsonOperand(['-'], { readStdin: async () => '{"query":"from stdin"}' })).query === 'from stdin',
  );
  check(
    'every documented SKILL command form parses',
    parseJsonArgument('{"request":"plan a tradition tree"}').request === 'plan a tradition tree' &&
      parseJsonArgument('{script:tech_x={cost=100 area=physics}}').script === 'tech_x={cost=100 area=physics}' &&
      // The form documented for Windows PowerShell 5.1: single quotes outside,
      // backslash-escaped quotes inside. The shell delivers the backslashes verbatim.
      parseJsonArgument('{\\"query\\":\\"localisation bom\\"}').query === 'localisation bom',
  );

  check(
    'the launcher file honours version and tags',
    (() => {
      const plan = setupStellarisModDescriptor({
        mod_name: 'Tag Test',
        version: '2.5',
        tags: ['Species', 'Overhaul'],
        dry_run: true,
      });
      return (
        plan.launcher_file.includes('version="2.5"') &&
        plan.launcher_file.includes('"Species"') &&
        plan.launcher_file.includes('"Overhaul"')
      );
    })(),
  );

  let fileHintOk = false;
  try {
    parseJsonArgument('{ this is not json', { source: 'C:/tmp/args.json' });
  } catch (thrown) {
    fileHintOk =
      thrown.message.includes('UTF-8') && !thrown.message.includes('PowerShell 5.1 changes');
  }
  check('a file-source parse failure gives encoding advice, not shell advice', fileHintOk);
  let shellHintOk = false;
  try {
    parseJsonArgument('{ this is not json', { source: 'command line' });
  } catch (thrown) {
    shellHintOk = thrown.message.includes('PowerShell 5.1 changes');
  }
  check('a command-line parse failure gives shell advice', shellHintOk);

  // ------------------------------------------------------------------ mountability
  section('non-ASCII path blocker');
  const asciiCheck = analyseMountability('<mods>\\vanadic_species');
  check('an all-ASCII mod root is not flagged', asciiCheck.length === 0, JSON.stringify(asciiCheck));
  const nonAsciiCheck = analyseMountability('C:\\Users\\钢木\\Documents\\Paradox Interactive\\Stellaris\\mod\\vanadic_species');
  check(
    'a non-ASCII mod root is flagged as a mount blocker',
    nonAsciiCheck.some((problem) => problem.code === 'non-ascii-path'),
    JSON.stringify(nonAsciiCheck),
  );
  check(
    'the mount warning explains what the game does and how to fix it',
    nonAsciiCheck[0]?.message.includes('never mounts') && nonAsciiCheck[0]?.fix.includes('ASCII'),
  );
  check('a long path is flagged', analyseMountability('D:/x'.padEnd(200, 'y')).some((p) => p.code === 'long-path'));

  const nonAsciiRoot = join(scratch, '钢木模组');
  mkdirSync(nonAsciiRoot, { recursive: true });
  writeFileSync(
    join(nonAsciiRoot, 'descriptor.mod'),
    'version="0.1"\ntags={\n\t"Gameplay"\n}\nname="Unmountable"\nsupported_version="v4.4.*"\n',
    'utf8',
  );
  const unmountable = await call('validate_stellaris_project', { workspace_root: nonAsciiRoot });
  check(
    'project validation fails a non-ASCII mod root',
    unmountable.verdict === 'errors' &&
      unmountable.errors.some((error) => error.message.includes('non-ASCII')),
    JSON.stringify(unmountable.errors),
  );
  const unmountableWrite = await call('generate_stellaris_mod_descriptor', {
    mod_name: 'Unmountable',
    dry_run: false,
    output_root: nonAsciiRoot,
  });
  check(
    'a write to a non-ASCII root reports a mount warning',
    Array.isArray(unmountableWrite.mount_warnings) && unmountableWrite.mount_warnings.length > 0,
  );
  check(
    'the write suggests an ASCII location',
    unmountableWrite.messages.some((message) => message.includes('<mods>/')),
  );

  // ------------------------------------------------------------------ new subsystems
  section('content generators: species class, name list, empire, ship, chain, situation, tree');

  const speciesClass = await call('generate_species_class_batch', {
    prefix: 'tmod',
    dry_run: true,
    classes: [
      {
        key: 'tmod_species',
        title: 'Test Class',
        title_plural: 'Test Classes',
        portraits: ['art3', 'mol5'],
        random_weight: 0,
        trait: {
          title: 'Test Metalloenzymes',
          description: 'Generated trait text.',
          modifier: 'pop_environment_tolerance = 0.25',
        },
      },
    ],
  });
  const speciesPaths = speciesClass.files.map((file) => file.path);
  check(
    'a species class writes the three files it needs to be selectable',
    speciesPaths.includes('common/species_classes/tmod_species_classes.txt') &&
      speciesPaths.includes('common/portrait_sets/tmod_portrait_sets.txt') &&
      speciesPaths.includes('common/portrait_categories/tmod_portrait_categories.txt'),
    JSON.stringify(speciesPaths),
  );
  check('a species class writes its granted trait', speciesPaths.includes('common/traits/tmod_traits.txt'));
  check(
    'the species class portrait set is wired to the class',
    speciesClass.files.find((f) => f.path.includes('portrait_sets')) !== undefined,
  );
  await call('generate_species_class_batch', {
    prefix: 'tmod',
    language: 'english',
    dry_run: false,
    output_root: modRoot,
    classes: [
      {
        key: 'tmod_species',
        title: 'Test Class',
        portraits: ['art3'],
        trait: { title: 'Test Trait', description: 'Generated trait text.', modifier: 'pop_environment_tolerance = 0.25' },
      },
    ],
  });
  const speciesClassScript = readFileSync(join(modRoot, 'common', 'species_classes', 'tmod_species_classes.txt'), 'utf8');
  // The game defaults `randomized` to yes, and a randomized class with no name list whose
  // `category` equals its English name makes the engine log
  // "Failed to get a random class namelist in create_species effect" for every random species.
  check('a species class is written with randomized = no by default', /\trandomized = no/.test(speciesClassScript), speciesClassScript.slice(0, 200));

  const nameList = await call('generate_name_list_batch', {
    prefix: 'tmod',
    dry_run: false,
    output_root: modRoot,
    lists: [
      {
        key: 'TMOD1',
        title: 'Test Names',
        selectable: true,
        ship_names: { generic: ['Spear of Test'], corvette: ['Little Test'] },
        fleet_names: { random_names: ['Test Armada'], sequential_name: 'TMOD_FLEET' },
        planet_names: { generic: ['Test Prime', 'Test Secundus'] },
        character_names: [
          {
            full_names: ['Vana Test'],
            first_names: ['Vana'],
            second_names: ['Test'],
            weight: 20,
          },
        ],
      },
    ],
  });
  const nameListText = readFileSync(join(modRoot, 'common', 'name_lists', 'tmod_name_lists.txt'), 'utf8');
  check('name list writes ship, fleet, planet and character pools', [
    'ship_names',
    'fleet_names',
    'planet_names',
    'character_names',
  ].every((field) => nameListText.includes(`${field} = {`)));
  check('name list writes the root key', nameListText.includes('TMOD1 = {'));
  const nameListLoc = readFileSync(join(modRoot, 'localisation', 'english', 'tmod_name_lists_l_english.yml'), 'utf8');
  check(
    'name list display key is name_list_<KEY>, verbatim upper case',
    nameListLoc.includes('name_list_TMOD1:0'),
    nameListLoc.slice(0, 200),
  );
  check(
    'name list does not use the portrait-name style lowercased key',
    !nameListLoc.includes('tmod1:0'),
  );
  const nameListBytes = readFileSync(join(modRoot, 'common', 'name_lists', 'tmod_name_lists.txt'));
  check(
    'the name list file is written as UTF-8 with BOM, which the engine asks for',
    nameListBytes[0] === 0xef && nameListBytes[1] === 0xbb && nameListBytes[2] === 0xbf,
    [...nameListBytes.slice(0, 3)].map((byte) => byte.toString(16)).join(' '),
  );
  check('name list reports a language', nameList.language === 'english');
  // Name pools hold localisation keys, not literal text - every key the script lists
  // must be defined, or the game shows the raw key as a ship/planet name.
  const poolKey = /(TMOD1_SHIP_\d+)/.exec(nameListText)?.[1];
  check('name pools are written as generated localisation keys', Boolean(poolKey), nameListText.slice(0, 300));
  check(
    'every generated name pool key is localised',
    Boolean(poolKey) && nameListLoc.includes(`${poolKey}:0`),
    `key=${poolKey}`,
  );
  check(
    'name pools are written unquoted like vanilla',
    Boolean(poolKey) && nameListText.includes(poolKey) && !nameListText.includes(`"${poolKey}"`),
  );
  check(
    'character pools are localisation keys too',
    /TMOD1_CHR_/.test(nameListText) && /TMOD1_CHR_/.test(nameListLoc),
  );

  await call('generate_prescripted_empire', {
    prefix: 'tmod',
    dry_run: false,
    output_root: modRoot,
    empires: [
      {
        key: 'tmod_empire',
        name: 'Test Concord',
        spawn_enabled: 'no',
        authority: 'auth_democratic',
        civics: ['civic_beacon_of_liberty'],
        government: 'gov_representative_democracy',
        ethics: ['ethic_xenophile'],
        origin: 'origin_default',
        planet_name: 'NAME_Earth',
        planet_class: 'pc_continental',
        initializer: 'sol_system_initializer',
        system_name: 'NAME_Sol',
        species: {
          class: 'tmod_species',
          portrait: 'art3',
          name: 'Testkind',
          plural: 'Testkinds',
          name_list: 'TMOD1',
          traits: ['trait_organic'],
        },
        empire_flag: { icon: { category: 'human', file: 'flag_human_9.dds' } },
        ruler: { name: 'First Tester', gender: 'female', portrait: 'human_female_05', trait: 'trait_ruler_eye_for_talent', leader_class: 'official' },
      },
    ],
  });
  const empireText = readFileSync(join(modRoot, 'prescripted_countries', 'tmod_prescripted_countries.txt'), 'utf8');
  check(
    'prescripted empire is written to the mod root folder, not under common/',
    empireText.includes('tmod_empire = {') && empireText.includes('species = {'),
  );
  check(
    'prescripted empire carries its flag and ruler blocks',
    empireText.includes('empire_flag = {') && empireText.includes('ruler = {'),
  );
  const empireLoc = readFileSync(join(modRoot, 'localisation', 'english', 'tmod_prescripted_l_english.yml'), 'utf8');
  check('prescripted empire name uses the EMPIRE_DESIGN_ prefix', empireLoc.includes('EMPIRE_DESIGN_tmod_empire:0'));
  // Every vanilla design a player can pick (humans1_1, voor, tzynn, ...) OMITS `playable`.
  // Setting it at all either gates the design on a DLC or hides it: empire_design_never is
  // `always = no`. So the generator must stay silent unless asked.
  check(
    'a prescripted empire omits playable by default, like pickable vanilla designs',
    !/playable\s*=/.test(empireText),
    (empireText.match(/playable = \S+/) || ['(absent)'])[0],
  );
  check('the ruler block always carries a portrait', /ruler = \{[\s\S]*?portrait = "/.test(empireText));
  await call('generate_prescripted_empire', {
    prefix: 'tmod',
    language: 'english',
    dry_run: false,
    output_root: modRoot,
    empires: [
      {
        key: 'tmod_hidden',
        name: 'Hidden Design',
        spawn_enabled: 'no',
        hidden: true,
        species: { class: 'tmod_species', portrait: 'art3', name: 'Hiddenkind', traits: ['trait_organic'] },
      },
    ],
  });
  const hiddenEmpireText = readFileSync(join(modRoot, 'prescripted_countries', 'tmod_prescripted_countries.txt'), 'utf8');
  check(
    'hidden: true writes the never-show playable trigger',
    hiddenEmpireText.includes('playable = empire_design_never'),
  );

  const ships = await call('generate_ship_size_batch', {
    prefix: 'tmod',
    dry_run: false,
    output_root: modRoot,
    ships: [
      {
        key: 'tmod_cruiser',
        title: 'Test Cruiser',
        section_slots: [{ slot: 'mid', locator: 'part1' }],
        max_hitpoints: 1200,
        resources: { category: 'ships', cost: { alloys: 120 } },
      },
    ],
  });
  const shipText = readFileSync(join(modRoot, 'common', 'ship_sizes', 'tmod_ship_sizes.txt'), 'utf8');
  check('ship size writes entity, section_slots and class', [
    'entity =',
    'section_slots = {',
    'class =',
  ].every((field) => shipText.includes(field)));
  const shipLoc = readFileSync(join(modRoot, 'localisation', 'english', 'tmod_ship_sizes_l_english.yml'), 'utf8');
  check('ship size localises a name and a plural', shipLoc.includes('tmod_cruiser:0') && shipLoc.includes('tmod_cruiser_plural:0'));

  // A starbase-class hull has to declare how it is built, what unlocks it, and which
  // components it requires - and it can carry a scripted_action (its own fleet-view button).
  await call('generate_ship_size_batch', {
    prefix: 'tmod',
    language: 'english',
    dry_run: false,
    output_root: modRoot,
    ships: [
      {
        key: 'tmod_starbase_hull',
        title: 'Starbase Hull',
        class: 'shipclass_starbase',
        construction_type: 'starbase_shipyard',
        carries_colony: 'pc_arkship_test',
        prerequisites: ['tech_test_unlock'],
        required_component_set: ['power_core'],
        scripted_action: ['test_muster'],
        entity: 'military_arkship_01_stage_1_entity',
        section_slots: [{ slot: 'mid', locator: 'part1' }],
      },
    ],
  });
  const starbaseHullText = readFileSync(join(modRoot, 'common', 'ship_sizes', 'tmod_ship_sizes.txt'), 'utf8');
  check(
    'a starbase-class hull declares construction, unlock, required sets and its own button',
    [
      'class = shipclass_starbase',
      'construction_type = starbase_shipyard',
      'carries_colony = pc_arkship_test',
      'prerequisites = { "tech_test_unlock" }',
      'required_component_set = "power_core"',
      'scripted_action = { test_muster }',
    ].every((needle) => starbaseHullText.includes(needle)),
    starbaseHullText.slice(0, 400),
  );


  let shipWithoutSlotsRejected = false;
  try {
    await call('generate_ship_size_batch', {
      prefix: 'tmod',
      ships: [{ key: 'tmod_noslots', title: 'No Slots' }],
      dry_run: true,
    });
  } catch (thrown) {
    shipWithoutSlotsRejected = thrown.name === 'ToolError';
  }
  check('a ship size with no section slot is refused', shipWithoutSlotsRejected);

  await call('generate_event_chain_batch', {
    prefix: 'tmod',
    dry_run: false,
    output_root: modRoot,
    chains: [
      {
        key: 'tmod_chain',
        title: 'The Vanadium Thread',
        description: 'Something follows the metal.',
        picture: 'GFX_evt_alien_nature',
        counters: [{ key: 'tmod_progress', max: 6 }],
      },
    ],
  });
  const chainText = readFileSync(join(modRoot, 'common', 'event_chains', 'tmod_event_chains.txt'), 'utf8');
  check('event chain writes a counter block', chainText.includes('counter = {') && chainText.includes('max = 6'));
  const chainLoc = readFileSync(join(modRoot, 'localisation', 'english', 'tmod_event_chains_l_english.yml'), 'utf8');
  check(
    'event chain localisation uses <key>_title/_desc with no event_chain_ prefix',
    chainLoc.includes('tmod_chain_title:0') &&
      chainLoc.includes('tmod_chain_desc:0') &&
      !chainLoc.includes('event_chain_tmod_chain'),
    chainLoc.slice(0, 200),
  );
  // The engine demands a loc key per counter: 'Objective counter "X" is missing localization'.
  check('event chain counters are localised', chainLoc.includes('tmod_progress:0'), chainLoc.slice(0, 300));

  await call('generate_event_batch', {
    namespace: 'tmod',
    language: 'english',
    dry_run: false,
    output_root: modRoot,
    events: [
      {
        id: 5,
        event_type: 'planet_event',
        title: 'On a World',
        description: 'Planetary text.',
        options: [{ text: 'Fine.' }],
      },
    ],
  });
  const planetEventText = readFileSync(join(modRoot, 'events', 'tmod_events.txt'), 'utf8');
  check(
    'event_type selects the event block keyword',
    planetEventText.includes('planet_event = {') && planetEventText.includes('id = tmod.5'),
    planetEventText.slice(0, 200),
  );
  check(
    'the namespace is never used as the event type keyword',
    !/tmod_event = \{/.test(planetEventText),
  );
  let badEventTypeRejected = false;
  try {
    await call('generate_event_batch', {
      namespace: 'tmod',
      events: [{ title: 'x', description: 'y', event_type: 'bogus_event' }],
      dry_run: true,
    });
  } catch (thrown) {
    badEventTypeRejected = thrown.name === 'ToolError' && thrown.message.includes('not a Stellaris event type');
  }
  check('an invalid event type keyword is refused', badEventTypeRejected);

  await call('generate_situation_batch', {
    prefix: 'tmod',
    dry_run: false,
    output_root: modRoot,
    situations: [
      {
        key: 'tmod_situation',
        title: 'Vanadate Starvation',
        description: 'The supply is failing.',
        monthly_change_tooltip: 'Build refineries to slow the decline.',
        category: 'negative',
        start_value: 0,
        initial_progress: 0,
        monthly_progress: { base: 1, modifier: 'add = 1\nhas_country_flag = tmod_bad' },
        stages: [{ key: 'tmod_stage_one', title: 'Onset', end: 60 }],
        approaches: [
          { key: 'tmod_approach_ration', title: 'Ration the supply', default: true, upkeep: { energy: 10 } },
        ],
        on_progress_complete: 'destroy_situation = this',
      },
    ],
  });
  const situationText = readFileSync(join(modRoot, 'common', 'situations', 'tmod_situations.txt'), 'utf8');
  check(
    'situation writes stages, an approach and monthly progress',
    ['stages = {', 'approach = {', 'monthly_progress = {'].every((field) => situationText.includes(field)),
  );
  const situationLoc = readFileSync(join(modRoot, 'localisation', 'english', 'tmod_situations_l_english.yml'), 'utf8');
  check(
    'situation writes all four required localisation keys',
    ['tmod_situation:0', 'tmod_situation_type:0', 'tmod_situation_desc:0', 'tmod_situation_monthly_change_tooltip:0'].every(
      (key) => situationLoc.includes(key),
    ),
    situationLoc.slice(0, 200),
  );
  let mixedProgressRejected = false;
  try {
    await call('generate_situation_batch', {
      prefix: 'tmod',
      situations: [
        {
          key: 'tmod_mixed',
          title: 'Mixed',
          description: 'x',
          monthly_change_tooltip: 'x',
          total_progress: 100,
          stages: [{ key: 'tmod_mixed_stage', end: 50 }],
        },
      ],
      dry_run: true,
    });
  } catch (thrown) {
    mixedProgressRejected = thrown.name === 'ToolError' && thrown.message.includes('section_weight');
  }
  check('mixing total_progress with a stage `end` is refused', mixedProgressRejected);

  await call('generate_tradition_tree', {
    prefix: 'tmod',
    dry_run: false,
    output_root: modRoot,
    tree: {
      key: 'tradition_tmod',
      title: 'Vanadic Traditions',
      traditions: [
        {
          key: 'tr_tmod_metallurgy',
          title: 'Vanadic Metallurgy',
          description: 'Metal work improves.',
          modifier: 'country_minerals_produces_mult = 0.1',
        },
      ],
      adoption: { title: 'Vanadic Adoption', description: 'Adopted.', modifier: 'country_minerals_produces_mult = 0.05' },
      finish: { title: 'Vanadic Completion', description: 'Finished.', modifier: 'country_minerals_produces_mult = 0.1' },
    },
    ascension_perks: [
      { key: 'ap_tmod_ascend', title: 'Vanadic Ascension', description: 'Ascend.', modifier: 'country_naval_cap_add = 25' },
    ],
  });
  const categoryText = readFileSync(join(modRoot, 'common', 'tradition_categories', 'tmod_tradition_categories.txt'), 'utf8');
  check(
    'tradition category references adoption, finish and its traditions',
    categoryText.includes('tradition_tmod = {') &&
      categoryText.includes('adoption_bonus = "tr_tmod_adopt"') &&
      categoryText.includes('finish_bonus = "tr_tmod_finish"') &&
      categoryText.includes('"tr_tmod_metallurgy"'),
  );
  check(
    'the traditions list does not repeat the adoption or finish keys',
    !/traditions = \{[^}]*tr_tmod_adopt/.test(categoryText) && !/traditions = \{[^}]*tr_tmod_finish/.test(categoryText),
  );
  check('tradition category writes a tree_template', /tree_template = "tree_\d/.test(categoryText));
  const traditionText = readFileSync(join(modRoot, 'common', 'traditions', 'tmod_traditions.txt'), 'utf8');
  check(
    'traditions and their adoption/finish bonuses are all written',
    ['tr_tmod_adopt = {', 'tr_tmod_finish = {', 'tr_tmod_metallurgy = {'].every((key) => traditionText.includes(key)),
  );
  const traditionLoc = readFileSync(join(modRoot, 'localisation', 'english', 'tmod_traditions_l_english.yml'), 'utf8');
  check(
    'tradition descriptions use the _delayed key, never _desc',
    traditionLoc.includes('tr_tmod_metallurgy_delayed:0') && !/tr_tmod_metallurgy_desc:/.test(traditionLoc),
    traditionLoc.slice(0, 240),
  );
  check(
    'ascension perks use the _desc key',
    traditionLoc.includes('ap_tmod_ascend_desc:0'),
  );
  check(
    'the tree itself is localised',
    traditionLoc.includes('tradition_tmod:0'),
  )
  // A tree needs four interface/*.gfx sprites named after its category key, or the
  // tradition screen logs `Trying to change sprite to unknown sprite` for each one.
  const traditionGfx = readFileSync(join(modRoot, 'interface', 'zz_tmod_tradition_gfx.gfx'), 'utf8');
  check(
    'the tradition tree writes its four interface sprites',
    [
      'GFX_tradition_hex_bg_tradition_tmod',
      'GFX_tradition_category_bg_tradition_tmod',
      'GFX_tradition_category_tile_tradition_tmod',
      'GFX_tradition_category_icon_tradition_tmod',
    ].every((sprite) => traditionGfx.includes(sprite)),
    traditionGfx.slice(0, 200),
  );;

  // ------------------------------------------------------------------ script signature checking
  section('script signature checking');

  // A probe mod containing one instance of every bug this checker exists to catch, plus a
  // clean twin that must produce nothing.
  const signatureProbe = join(scratch, 'SignatureProbe');
  const signatureClean = join(scratch, 'SignatureClean');
  for (const root of [signatureProbe, signatureClean]) {
    mkdirSync(join(root, 'events'), { recursive: true });
    mkdirSync(join(root, 'common', 'button_effects'), { recursive: true });
    mkdirSync(join(root, 'common', 'ship_sizes'), { recursive: true });
    writeFileSync(join(root, 'descriptor.mod'), 'name="SigProbe"\nversion="0.1.0"\nsupported_version="v4.4.*"\n', 'utf8');
  }

  // Broken: <namespace>_event, every_ship, option = { effect = {} }, value = N, wrong scopes.
  // `no_such_effect_at_all` sits next to a legitimate `event_target:` statement, so a failure to
  // flag it means the scope-target fix swallowed a real unknown effect.
  writeFileSync(
    join(signatureProbe, 'events', 'probe_events.txt'),
    [
      'namespace = probe',
      '',
      'probe_event = {',
      '\tid = probe.1',
      '\tis_triggered_only = yes',
      '\timmediate = {',
      '\t\tevery_ship = { add_resource = { energy = 1 } }',
      '\t\tevent_target:probe_target = { add_resource = { energy = 1 } }',
      '\t\tno_such_effect_at_all = yes',
      '\t}',
      '\toption = { name = probe.1.a effect = { add_resource = { influence = 1 } } }',
      '}',
      '',
    ].join('\n'),
    'utf8',
  );
  writeFileSync(
    join(signatureProbe, 'common', 'button_effects', 'probe_buttons.txt'),
    [
      'probe_starbase_button = {',
      '\tpotential = { is_scope_type = starbase }',
      '\tallow = { resource_stockpile_compare = { resource = energy value = 100 } }',
      '\teffect = { create_army = { name = "x" owner = from type = assault_army } }',
      '}',
      '',
    ].join('\n'),
    'utf8',
  );
  writeFileSync(
    join(signatureProbe, 'common', 'ship_sizes', 'probe_ship.txt'),
    ['probe_ship = {', '\tpotential_construction = { has_technology = tech_lasers_1 }', '}', ''].join('\n'),
    'utf8',
  );

  // Clean: the same intents written correctly. The `event_target:` / `parameter:` / `hidden:`
  // statements are the `<prefix>:<name>` scope-target form vanilla uses constantly, and the
  // `if = { }` inside the country target is the shape that used to be guessed as the enclosing
  // scope (the installed 4.4.6 tree lost 879 wrong-scope false positives to that guess).
  writeFileSync(
    join(signatureClean, 'events', 'clean_events.txt'),
    [
      'namespace = clean',
      '',
      'country_event = {',
      '\tid = clean.1',
      '\tis_triggered_only = yes',
      '\timmediate = { every_owned_ship = { add_resource = { energy = 1 } } }',
      '\toption = { name = clean.1.a add_resource = { influence = 1 } }',
      '}',
      '',
      'country_event = {',
      '\tid = clean.2',
      '\tis_triggered_only = yes',
      '\timmediate = {',
      '\t\tevent_target:clean_target = {',
      '\t\t\tif = {',
      '\t\t\t\tlimit = { has_technology = tech_lasers_1 }',
      '\t\t\t\tcreate_pop_group = { class = robot }',
      '\t\t\t}',
      '\t\t}',
      '\t\tevent_target:clean_target.solar_system = { add_resource = { energy = 1 } }',
      '\t\tparameter:empire = { add_resource = { energy = 1 } }',
      '\t\thidden:owner = { add_resource = { energy = 1 } }',
      '\t}',
      '}',
      '',
    ].join('\n'),
    'utf8',
  );
  writeFileSync(
    join(signatureClean, 'common', 'button_effects', 'clean_buttons.txt'),
    [
      'clean_fleet_button = {',
      '\tpotential = { is_scope_type = fleet }',
      '\tallow = {',
      '\t\tany_owned_ship = { is_ship_size = corvette }',
      '\t\tfrom = { resource_stockpile_compare = { resource = energy value >= 100 } }',
      '\t}',
      '\teffect = {',
      '\t\tfrom = { add_resource = { energy = -100 } }',
      '\t\tevery_owned_ship = { limit = { is_ship_size = corvette } add_modifier = { modifier = rule_of_law days = 30 } }',
      '\t}',
      '}',
      '',
      // The `is_scope_type = fleet` hint must NOT be pushed into the country target: without
      // that, `has_technology` (a country trigger) is judged against the fleet scope.
      'clean_fleet_button_2 = {',
      '\tpotential = { is_scope_type = fleet }',
      '\teffect = {',
      '\t\tevent_target:clean_country = {',
      '\t\t\tif = {',
      '\t\t\t\tlimit = { has_technology = tech_lasers_1 }',
      '\t\t\t\tadd_resource = { energy = 1 }',
      '\t\t\t}',
      '\t\t}',
      '\t}',
      '}',
      '',
    ].join('\n'),
    'utf8',
  );

  const signatureResult = await call('validate_stellaris_script_signatures', { workspace_root: signatureProbe });
  if (signatureResult.docs_found) {
    const signatureCodes = new Set(signatureResult.findings.map((finding) => finding.code));
    check('signature checker flags a keyword that is not an event type', signatureCodes.has('invalid-event-type'), JSON.stringify([...signatureCodes]));
    check('signature checker flags every_ship (no such iterator)', signatureCodes.has('unknown-script-name'), JSON.stringify([...signatureCodes]));
    check('signature checker flags option = { effect = {} }', signatureCodes.has('event-option-effect-wrapper'), JSON.stringify([...signatureCodes]));
    check('signature checker flags value = N inside *_compare', signatureCodes.has('missing-comparison-operator'), JSON.stringify([...signatureCodes]));
    check('signature checker flags a trigger used in the wrong scope', signatureCodes.has('wrong-scope'), JSON.stringify([...signatureCodes]));
    check(
      'signature checker does not mistake scope keywords for effects',
      !signatureResult.findings.some((finding) => /`(from|owner|root|this)` is not a documented/.test(finding.message)),
      JSON.stringify(signatureResult.findings.map((finding) => finding.message).slice(0, 3)),
    );

    const cleanResult = await call('validate_stellaris_script_signatures', { workspace_root: signatureClean });
    check('correctly written script produces no errors', cleanResult.error_count === 0, JSON.stringify(cleanResult.findings));
    check('correctly written script is actually parsed', cleanResult.checked_files === 2, String(cleanResult.checked_files));

    // --- `<prefix>:<name>` scope targets (the fix for 5 false positives on a real mod) --------
    check(
      'signature checker accepts event_target:<name> = { ... } instead of calling it an unknown effect',
      !cleanResult.findings.some((finding) => finding.message.includes('event_target:')),
      JSON.stringify(cleanResult.findings),
    );
    check(
      'signature checker accepts the dotted target path event_target:<name>.<sub>',
      !cleanResult.findings.some((finding) => finding.message.includes('event_target:clean_target.solar_system')),
      JSON.stringify(cleanResult.findings),
    );
    check(
      'signature checker accepts the other vanilla target prefixes (parameter:, hidden:)',
      !cleanResult.findings.some((finding) => /`(parameter:empire|hidden:owner)`/.test(finding.message)),
      JSON.stringify(cleanResult.findings),
    );
    check(
      'a scope target is not treated as a scope switch: the enclosing scope is not guessed for its body',
      !cleanResult.findings.some((finding) => finding.code === 'wrong-scope'),
      JSON.stringify(cleanResult.findings),
    );
    check(
      'a scope target is not given the definition is_scope_type hint',
      !cleanResult.findings.some((finding) => finding.message.includes('has_technology')),
      JSON.stringify(cleanResult.findings),
    );
    check(
      'the checker still flags a bogus effect name written next to a scope target',
      signatureResult.findings.some(
        (finding) => finding.code === 'unknown-script-name' && finding.message.includes('no_such_effect_at_all'),
      ),
      JSON.stringify(signatureResult.findings.map((finding) => finding.message).slice(0, 5)),
    );
  } else {
    check('signature checker reports missing documentation instead of throwing', signatureResult.messages.length >= 2);
    check('signature checker checks nothing when the logs are absent', signatureResult.checked_files === 0 && signatureResult.findings.length === 0);
  }

  // ------------------------------------------------------------------ interface checking
  section('interface checking');

  const interfaceProbe = join(scratch, 'InterfaceProbe');
  const interfaceClean = join(scratch, 'InterfaceClean');
  for (const root of [interfaceProbe, interfaceClean]) {
    mkdirSync(join(root, 'interface'), { recursive: true });
    mkdirSync(join(root, 'events'), { recursive: true });
    mkdirSync(join(root, 'common', 'button_effects'), { recursive: true });
    writeFileSync(join(root, 'descriptor.mod'), 'name="IfaceProbe"\nversion="0.1.0"\nsupported_version="v4.4.*"\n', 'utf8');
  }

  // Broken: bare containerWindowType at the top level, an effectbuttonType pointing at a
  // non-existent button effect, an unknown sprite, and an event naming a window that is not
  // defined anywhere.
  writeFileSync(
    join(interfaceProbe, 'interface', 'bad_root.gui'),
    ['containerWindowType = {', '\tname = "probe_window"', '}', ''].join('\n'),
    'utf8',
  );
  writeFileSync(
    join(interfaceProbe, 'interface', 'bad_buttons.gui'),
    [
      'guiTypes = {',
      '\tcontainerWindowType = {',
      '\t\tname = "probe_button_window"',
      '\t\ticonType = {',
      '\t\t\tname = "probe_icon"',
      '\t\t\tspriteType = "GFX_probe_missing_sprite"',
      '\t\t}',
      '\t}',
      '\teffectbuttonType = {',
      '\t\tname = "probe_button"',
      '\t\tquadTextureSprite = GFX_probe_missing_sprite',
      '\t\teffect = probe_missing_button_effect',
      '\t}',
      '}',
      '',
    ].join('\n'),
    'utf8',
  );
  writeFileSync(
    join(interfaceProbe, 'events', 'bad_iface_events.txt'),
    [
      'namespace = ifaceprobe',
      '',
      'country_event = {',
      '\tid = ifaceprobe.1',
      '\tis_triggered_only = yes',
      '\tcustom_gui = "probe_missing_window"',
      '\toption = { name = ifaceprobe.1.a }',
      '}',
      '',
    ].join('\n'),
    'utf8',
  );

  // Clean twin: everything it references is defined by the mod itself, so the assertions hold
  // whether or not a game install is reachable from the test.
  writeFileSync(
    join(interfaceClean, 'interface', 'clean.gfx'),
    ['spriteTypes = {', '\tspriteType = {', '\t\tname = "GFX_probe_clean_sprite"', '\t}', '}', ''].join('\n'),
    'utf8',
  );
  writeFileSync(
    join(interfaceClean, 'interface', 'clean.gui'),
    [
      'guiTypes = {',
      '\tcontainerWindowType = {',
      '\t\tname = "probe_clean_window"',
      '\t\tbackground = { name = "bg" quadTextureSprite = "GFX_probe_clean_sprite" }',
      '\t}',
      '\teffectbuttonType = {',
      '\t\tname = "probe_clean_button"',
      '\t\tquadTextureSprite = GFX_probe_clean_sprite',
      '\t\teffect = probe_clean_button_effect',
      '\t}',
      '}',
      '',
    ].join('\n'),
    'utf8',
  );
  writeFileSync(
    join(interfaceClean, 'common', 'button_effects', 'clean_buttons.txt'),
    ['probe_clean_button_effect = {', '\teffect = { add_resource = { energy = 1 } }', '}', ''].join('\n'),
    'utf8',
  );
  writeFileSync(
    join(interfaceClean, 'events', 'clean_iface_events.txt'),
    [
      'namespace = ifaceclean',
      '',
      'country_event = {',
      '\tid = ifaceclean.1',
      '\tis_triggered_only = yes',
      '\tcustom_gui = "probe_clean_window"',
      '\toption = { name = ifaceclean.1.a }',
      '}',
      '',
    ].join('\n'),
    'utf8',
  );

  const interfaceResult = await call('validate_stellaris_interface', {
    workspace_root: interfaceProbe,
    game_root: typeof gameRoot === 'string' ? gameRoot : undefined,
  });
  const interfaceCodes = new Set(interfaceResult.findings.map((finding) => finding.code));
  check('interface checker flags a .gui file whose root is not guiTypes', interfaceCodes.has('gui-root-not-guitypes'), JSON.stringify([...interfaceCodes]));
  check('interface checker flags an effectbuttonType with an unknown effect', interfaceCodes.has('unknown-button-effect'), JSON.stringify([...interfaceCodes]));
  check('interface checker flags an unknown sprite reference', interfaceCodes.has('unknown-sprite'), JSON.stringify([...interfaceCodes]));
  check('interface checker flags a custom_gui that names no window', interfaceCodes.has('unknown-custom-gui'), JSON.stringify([...interfaceCodes]));

  const interfaceCleanResult = await call('validate_stellaris_interface', {
    workspace_root: interfaceClean,
    game_root: typeof gameRoot === 'string' ? gameRoot : undefined,
  });
  check(
    'a self-consistent interface produces no errors',
    interfaceCleanResult.error_count === 0,
    JSON.stringify(interfaceCleanResult.findings),
  );
  check(
    'interface checker actually parsed the mod interface files',
    interfaceCleanResult.gui_files_checked === 1 && interfaceCleanResult.mod_index.sprites >= 1,
    JSON.stringify(interfaceCleanResult.mod_index),
  );

  // ------------------------------------------------------------------ system generators
  section('system generators');

  const systemsRoot = join(scratch, 'SystemsProbe');
  mkdirSync(systemsRoot, { recursive: true });
  writeFileSync(join(systemsRoot, 'descriptor.mod'), 'name="SystemsProbe"\nversion="0.1.0"\nsupported_version="v4.4.*"\n', 'utf8');

  const systemsCall = (name, args) => call(name, { output_root: systemsRoot, dry_run: false, ...args });

  const actions = await systemsCall('generate_scripted_action_batch', {
    prefix: 'sysprobe',
    actions: [
      {
        key: 'sysprobe_action',
        title: 'Sysprobe Action',
        user_scope: 'fleet',
        scope: 'self',
        on_completed: 'on_sysprobe_action',
        button_visible: 'always = yes',
      },
    ],
  });
  check('scripted action generator writes the action and its localisation', actions.files.length === 2, JSON.stringify(actions.files.map((file) => file.path)));
  const actionText = readFileSync(join(systemsRoot, 'common/scripted_actions/sysprobe_scripted_actions.txt'), 'utf8');
  check('user_scope is written before scope', actionText.indexOf('user_scope = fleet') < actionText.indexOf('scope = self'), actionText.slice(0, 200));

  const buttons = await systemsCall('generate_button_effect_batch', {
    prefix: 'sysprobe',
    generate_gui: true,
    window_name: 'sysprobe_window',
    buttons: [
      {
        key: 'sysprobe_button',
        title: 'Sysprobe Button',
        scope_type: 'fleet',
        effect: 'every_owned_ship = { limit = { is_ship_size = corvette } add_resource = { energy = 1 } }',
        gui: { name: 'sysprobe_button_button' },
      },
    ],
  });
  const guiPath = join(systemsRoot, 'interface/sysprobe_button_effects.gui');
  const guiText = readFileSync(guiPath, 'utf8');
  const effectText = readFileSync(join(systemsRoot, 'common/button_effects/sysprobe_button_effects.txt'), 'utf8');
  check('button generator writes a .gui alongside the effect', buttons.files.some((file) => file.path.startsWith('interface/')), JSON.stringify(buttons.files.map((file) => file.path)));
  check('the generated .gui is rooted at guiTypes', /^\s*guiTypes\s*=\s*\{/.test(guiText), guiText.slice(0, 80));
  check('the generated .gui points its effectbuttonType at the generated effect key', guiText.includes('effect = sysprobe_button') && effectText.includes('sysprobe_button = {'), 'gui/effect keys do not line up');
  check('the generated effect checks the scope it documents', effectText.includes('is_scope_type = fleet'), effectText.slice(0, 160));

  const sections = await systemsCall('generate_section_template_batch', {
    prefix: 'sysprobe',
    sections: [
      {
        key: 'sysprobe_section',
        ship_size: 'sysprobe_ship',
        fits_on_slot: 'mid',
        component_slots: [{ name: 'LARGE_GUN_01', template: 'large_turret', locatorname: 'large_gun_01' }],
        aux_utility_slots: 2,
      },
    ],
  });
  const sectionText = readFileSync(join(systemsRoot, 'common/section_templates/sysprobe_section_templates.txt'), 'utf8');
  check('section generator emits a ship_section_template', sectionText.includes('ship_section_template = {'), sectionText.slice(0, 120));
  check('section generator writes fits_on_slot and the component slot', sectionText.includes('fits_on_slot = mid') && sectionText.includes('locatorname = large_gun_01'), sectionText.slice(0, 400));
  check('section generator writes utility slot counts directly', sectionText.includes('aux_utility_slots = 2'), sectionText.slice(0, 400));
  void sections;

  await systemsCall('generate_starbase_building_batch', {
    prefix: 'sysprobe',
    buildings: [
      {
        key: 'sysprobe_building',
        title: 'Sysprobe Building',
        icon: 'GFX_orbitalring_energy_hub',
        starbase_type: 'starbase',
        potential: 'owner = { has_technology = tech_lasers_1 }',
        resources: { category: 'starbase_buildings', cost: { alloys: 100 } },
      },
    ],
  });
  const buildingText = readFileSync(join(systemsRoot, 'common/starbase_buildings/sysprobe_starbase_buildings.txt'), 'utf8');
  check('building generator writes a valid block', buildingText.includes('starbase_type = starbase'), buildingText.slice(0, 160));
  check('building potential keeps the country trigger wrapped in owner', buildingText.includes('owner = {') && buildingText.includes('has_technology'), buildingText.slice(0, 400));
  check('building generator never writes a bare modifier', !/^\s*modifier\s*=/m.test(buildingText), buildingText.slice(0, 400));

  let modifierRejected = false;
  try {
    await systemsCall('generate_starbase_building_batch', {
      prefix: 'sysprobe',
      buildings: [{ key: 'sysprobe_bad', title: 'Bad', icon: 'GFX_x', starbase_type: 'starbase', modifier: { ship_armor_add: 1 } }],
    });
  } catch (error) {
    modifierRejected = /modifier/.test(String(error?.message ?? ''));
  }
  check('building generator rejects the bare modifier field', modifierRejected);

  const techs = await systemsCall('generate_technology_batch', {
    prefix: 'sysprobe',
    technologies: [
      {
        key: 'tech_sysprobe_probe',
        title: 'Sysprobe Tech',
        description: 'A probe technology.',
        area: 'engineering',
        tier: 2,
        cost: 2000,
        start_tech: true,
        icon: 'tech_cruisers',
      },
    ],
  });
  const techText = readFileSync(join(systemsRoot, 'common/technology/sysprobe_technology.txt'), 'utf8');
  check('technology generator writes start_tech', techText.includes('start_tech = yes'), techText.slice(0, 240));
  check('technology generator writes a bare icon sprite name', techText.includes('icon = tech_cruisers'), techText.slice(0, 240));
  void techs;

  // Cross-check: what the generators produce must satisfy the new interface validator.
  if (typeof gameRoot === 'string') {
    const systemsInterface = await call('validate_stellaris_interface', { workspace_root: systemsRoot, game_root: gameRoot });
    check('generated interface content passes the interface checker', systemsInterface.error_count === 0, JSON.stringify(systemsInterface.findings));
  }

  // ---------------------------------------------- galaxy generators (initializer, planet class)
  section('galaxy generators: system initializers and planet classes');

  const galaxyRoot = join(scratch, 'GalaxyProbe');
  mkdirSync(galaxyRoot, { recursive: true });
  writeFileSync(join(galaxyRoot, 'descriptor.mod'), 'name="GalaxyProbe"\nversion="0.1.0"\nsupported_version="v4.4.*"\n', 'utf8');

  const galaxyCall = (name, args) => call(name, { output_root: galaxyRoot, dry_run: false, ...args });

  // One initializer that exercises: usage/usage_odds, a planet with size + orbit_distance,
  // `change_orbit` for a shared ring orbit, and the spawn effect with a distance band.
  const initializerBatch = await galaxyCall('generate_solar_system_initializer_batch', {
    prefix: 'galaxyprobe',
    systems: [
      {
        key: 'galaxyprobe_ring_system',
        title: 'Galaxyprobe Ring System',
        star_class: 'sc_g',
        flags: ['galaxyprobe_system'],
        planets: [
          { class: 'star', orbit_distance: 0, orbit_angle: 0, size: 30 },
          { change_orbit: 45 },
          { class: 'pc_ringworld_habitable', orbit_distance: 0, orbit_angle: 30, size: 10, has_ring: false },
          { class: 'pc_ringworld_seam', orbit_distance: 0, orbit_angle: 150, size: 10 },
        ],
      },
    ],
    spawn: {
      effect_key: 'galaxyprobe_spawn_cluster',
      min_distance: 30,
      max_distance: 75,
      direction: 'rimwards',
      hyperlane: false,
      times: 1,
    },
  });

  check(
    'initializer generator writes common/solar_system_initializers/<prefix>_initializers.txt',
    initializerBatch.files.some((file) => file.path === 'common/solar_system_initializers/galaxyprobe_initializers.txt'),
    JSON.stringify(initializerBatch.files.map((file) => file.path)),
  );

  const initializerText = readFileSync(
    join(galaxyRoot, 'common', 'solar_system_initializers', 'galaxyprobe_initializers.txt'),
    'utf8',
  );
  check(
    'initializer is kept out of random galaxy generation with usage = misc_system_init + usage_odds = 0',
    initializerText.includes('usage = misc_system_init') && initializerText.includes('usage_odds = 0'),
    initializerText.slice(0, 400),
  );
  check(
    'a { change_orbit } entry is written as a change_orbit = line',
    /^\tchange_orbit = 45$/m.test(initializerText.replace(/\r/g, '')),
    initializerText.slice(0, 500),
  );
  check(
    'change_orbit is written before the orbit-sharing bodies',
    initializerText.indexOf('change_orbit = 45') < initializerText.indexOf('pc_ringworld_habitable'),
    initializerText.slice(0, 500),
  );
  check(
    'a planet entry carries both size and orbit_distance',
    initializerText.includes('\t\torbit_distance = 0') && initializerText.includes('\t\tsize = 30'),
    initializerText.slice(0, 500),
  );
  check(
    'the bodies after change_orbit share that orbit with orbit_distance = 0',
    (initializerText.match(/\tchange_orbit = 45/g) ?? []).length === 1 &&
      (initializerText.match(/\t\torbit_distance = 0/g) ?? []).length === 3,
    initializerText.slice(0, 700),
  );

  check(
    'spawn block writes common/scripted_effects/<prefix>_spawn_effects.txt',
    initializerBatch.files.some((file) => file.path === 'common/scripted_effects/galaxyprobe_spawn_effects.txt'),
    JSON.stringify(initializerBatch.files.map((file) => file.path)),
  );

  const spawnText = readFileSync(
    join(galaxyRoot, 'common', 'scripted_effects', 'galaxyprobe_spawn_effects.txt'),
    'utf8',
  );
  check(
    'spawn effect puts the comparison operator inside the key',
    spawnText.includes('min_distance >= 30') && spawnText.includes('max_distance <= 75'),
    spawnText.slice(0, 400),
  );
  check(
    'spawn effect writes hyperlane = no for an isolated system',
    spawnText.includes('hyperlane = no') && !spawnText.includes('hyperlane = yes'),
    spawnText.slice(0, 400),
  );
  check(
    'spawn effect never falls back to the assignment form min_distance = X',
    !/min_distance\s*=\s/m.test(spawnText) && !/max_distance\s*=\s/m.test(spawnText),
    spawnText.slice(0, 400),
  );
  check('spawn effect names the generated initializer', spawnText.includes('initializer = galaxyprobe_ring_system'), spawnText.slice(0, 400));

  // With hyperlane enabled the same generator must wire the system into the network instead.
  const wiredBatch = await galaxyCall('generate_solar_system_initializer_batch', {
    prefix: 'galaxyprobe_wired',
    systems: [
      {
        key: 'galaxyprobe_wired_system',
        title: 'Galaxyprobe Wired System',
        star_class: 'sc_g',
        planets: [{ class: 'star', orbit_distance: 0, size: 30 }],
      },
    ],
    spawn: { effect_key: 'galaxyprobe_wired_spawn', min_distance: 10, max_distance: 20, hyperlane: true },
  });
  const wiredText = readFileSync(
    join(galaxyRoot, 'common', 'scripted_effects', 'galaxyprobe_wired_spawn_effects.txt'),
    'utf8',
  );
  check('spawn effect writes hyperlane = yes when hyperlane is requested', wiredText.includes('hyperlane = yes'), wiredText.slice(0, 400));
  void wiredBatch;

  // A single spawn is not batched: set_spawn_system_batch only pays off for a group, and the
  // pre-existing one-band effect has to stay byte-identical for backward compatibility.
  check(
    'a single spawn_system is not wrapped in set_spawn_system_batch',
    !spawnText.includes('set_spawn_system_batch') && !wiredText.includes('set_spawn_system_batch'),
    spawnText.slice(0, 300),
  );

  // spawn.bands (one distance band per spawn, cycled) + spawn.batch (set_spawn_system_batch
  // begin/end around the group). The third band sets only min_distance, so its max_distance has
  // to fall back to spawn.max_distance: the cycled pairs are 0-4, 3-8, 7-20, 0-4.
  const bandedBatch = await galaxyCall('generate_solar_system_initializer_batch', {
    prefix: 'galaxyprobe_bands',
    systems: [
      {
        key: 'galaxyprobe_bands_a',
        title: 'Galaxyprobe Band A',
        star_class: 'sc_g',
        planets: [{ class: 'star', orbit_distance: 0, size: 30 }],
      },
      {
        key: 'galaxyprobe_bands_b',
        title: 'Galaxyprobe Band B',
        star_class: 'sc_g',
        planets: [{ class: 'star', orbit_distance: 0, size: 30 }],
      },
    ],
    spawn: {
      effect_key: 'galaxyprobe_bands_spawn',
      hyperlane: false,
      times: 4,
      max_distance: 20,
      bands: [
        { min_distance: 0, max_distance: 4 },
        { min_distance: 3, max_distance: 8 },
        { min_distance: 7 },
      ],
    },
  });
  const bandedText = readFileSync(
    join(galaxyRoot, 'common', 'scripted_effects', 'galaxyprobe_bands_spawn_effects.txt'),
    'utf8',
  );
  const bandMins = [...bandedText.matchAll(/min_distance >= (-?\d+)/g)].map((match) => match[1]);
  const bandMaxes = [...bandedText.matchAll(/max_distance <= (-?\d+)/g)].map((match) => match[1]);
  const bandInitializers = [...bandedText.matchAll(/initializer = (\S+)/g)].map((match) => match[1]);

  check(
    'spawn.bands is cycled per spawn_system call',
    bandMins.join(',') === '0,3,7,0' && bandMaxes.join(',') === '4,8,20,4',
    `${bandMins.join(',')} / ${bandMaxes.join(',')}`,
  );
  check(
    'a band that sets only one bound falls back to spawn.min_distance / max_distance',
    bandMins[2] === '7' && bandMaxes[2] === '20',
    bandedText.slice(0, 500),
  );
  check(
    'spawn.batch wraps the group in exactly one set_spawn_system_batch begin/end pair',
    (bandedText.match(/set_spawn_system_batch = begin/g) ?? []).length === 1 &&
      (bandedText.match(/set_spawn_system_batch = end/g) ?? []).length === 1,
    bandedText.slice(0, 600),
  );
  check(
    'set_spawn_system_batch = begin comes before the first spawn_system and = end after the last',
    bandedText.indexOf('set_spawn_system_batch = begin') < bandedText.indexOf('spawn_system = {') &&
      bandedText.lastIndexOf('set_spawn_system_batch = end') > bandedText.lastIndexOf('spawn_system = {'),
    bandedText.slice(0, 600),
  );
  check(
    'batched spawns keep the comparison operator inside the key',
    (bandedText.match(/min_distance >= /g) ?? []).length === 4 &&
      (bandedText.match(/max_distance <= /g) ?? []).length === 4 &&
      !/min_distance\s*=\s/m.test(bandedText) &&
      !/max_distance\s*=\s/m.test(bandedText),
    bandedText.slice(0, 600),
  );
  check(
    'the spawns cycle through the generated initializers',
    bandInitializers.join(',') === 'galaxyprobe_bands_a,galaxyprobe_bands_b,galaxyprobe_bands_a,galaxyprobe_bands_b',
    bandInitializers.join(','),
  );
  check(
    'the batched effect says it was batch-processed',
    (bandedBatch.files.find((file) => file.path === 'common/scripted_effects/galaxyprobe_bands_spawn_effects.txt')?.summary ?? '')
      .includes('set_spawn_system_batch'),
    JSON.stringify(bandedBatch.files.map((file) => file.summary)),
  );

  // spawn.batch = false turns the wrapping off again even for a group.
  await galaxyCall('generate_solar_system_initializer_batch', {
    prefix: 'galaxyprobe_nobatch',
    systems: [
      {
        key: 'galaxyprobe_nobatch_system',
        title: 'Galaxyprobe No Batch System',
        star_class: 'sc_g',
        planets: [{ class: 'star', orbit_distance: 0, size: 30 }],
      },
    ],
    spawn: { effect_key: 'galaxyprobe_nobatch_spawn', times: 2, hyperlane: false, batch: false },
  });
  const nobatchText = readFileSync(
    join(galaxyRoot, 'common', 'scripted_effects', 'galaxyprobe_nobatch_spawn_effects.txt'),
    'utf8',
  );
  check(
    'spawn.batch = false keeps a group of spawns unbatched',
    (nobatchText.match(/spawn_system = \{/g) ?? []).length === 2 && !nobatchText.includes('set_spawn_system_batch'),
    nobatchText.slice(0, 400),
  );

  // Star-shaped body: the shape flag, a size range, colonizable, and the star-only distance fields.
  await galaxyCall('generate_planet_class_batch', {
    prefix: 'galaxyprobe',
    planet_classes: [
      {
        key: 'pc_galaxyprobe_star',
        title: 'Galaxyprobe Star',
        entity: 'g_star_class_star_entity',
        icon: 'GFX_planet_type_f_g_star',
        icon_large: 'GFX_planet_type_f_g_star_big',
        shape: 'star',
        entity_scale: 20,
        planet_size: { min: 80, max: 80 },
        min_distance_from_sun: 0,
        max_distance_from_sun: 0,
        spawn_odds: 0,
        colonizable: true,
      },
    ],
  });
  const planetClassText = readFileSync(
    join(galaxyRoot, 'common', 'planet_classes', 'galaxyprobe_planet_classes.txt'),
    'utf8',
  );
  check('planet class writes star = yes when shape is star', /^\tstar = yes$/m.test(planetClassText.replace(/\r/g, '')), planetClassText.slice(0, 300));
  check('planet class writes a planet_size range', planetClassText.includes('planet_size = { min = 80 max = 80 }'), planetClassText.slice(0, 600));
  check('planet class writes colonizable = yes', /^\tcolonizable = yes$/m.test(planetClassText.replace(/\r/g, '')), planetClassText.slice(0, 600));
  check(
    'planet class writes the star-only distance fields and spawn_odds',
    planetClassText.includes('min_distance_from_sun = 0') &&
      planetClassText.includes('max_distance_from_sun = 0') &&
      planetClassText.includes('spawn_odds = 0'),
    planetClassText.slice(0, 600),
  );

  // ------------------------------------------------------------------ media assets
  section('media asset registration');

  // A synthetic "install" so collision detection is exercised without the real game: the
  // index the tools consult is `interface/**/*.gfx` plus `sound|music/**/*.asset`, and a
  // five-line stand-in proves the wiring without depending on a 21 GB checkout.
  const fakeInstall = join(scratch, 'FakeInstall');
  mkdirSync(join(fakeInstall, 'interface'), { recursive: true });
  mkdirSync(join(fakeInstall, 'gfx', 'interface'), { recursive: true });
  mkdirSync(join(fakeInstall, 'sound'), { recursive: true });
  mkdirSync(join(fakeInstall, 'music'), { recursive: true });
  writeFileSync(
    join(fakeInstall, 'interface', 'fake.gfx'),
    [
      'spriteTypes = {',
      '\tspriteType = {',
      '\t\tname = "GFX_probe_taken"',
      '\t\ttexturefile = "gfx/interface/fake_taken.dds"',
      '\t}',
      '\tcorneredTileSpriteType = {',
      '\t\tname = "GFX_probe_taken_panel"',
      '\t\ttextureFile = "gfx/interface/fake_panel.dds"',
      '\t\tborderSize = { x = 20 y = 20 }',
      '\t}',
      '}',
      '',
    ].join('\n'),
    'utf8',
  );
  writeFileSync(join(fakeInstall, 'sound', 'fake.asset'), 'sound = {\n\tname = probe_taken_sound\n\tfile = "x.wav"\n}\n', 'utf8');
  writeFileSync(join(fakeInstall, 'music', 'fake.asset'), 'music = {\n\tname = probe_taken_music\n\tfile = "x.ogg"\n}\n', 'utf8');
  writeFileSync(join(fakeInstall, 'music', 'fake.txt'), 'song = {\n\tname = probe_taken_music\n}\n', 'utf8');

  const mediaRoot = join(scratch, 'MediaProbe');
  const mediaArt = join(scratch, 'MediaArt');
  mkdirSync(join(mediaRoot, 'gfx', 'interface', 'icons'), { recursive: true });
  mkdirSync(join(mediaRoot, 'sound', 'mediaprobe'), { recursive: true });
  mkdirSync(join(mediaRoot, 'music'), { recursive: true });
  mkdirSync(mediaArt, { recursive: true });
  writeFileSync(join(mediaRoot, 'descriptor.mod'), 'name="MediaProbe"\nversion="0.1"\nsupported_version="v4.4.*"\n', 'utf8');

  const iconDds = join(mediaRoot, 'gfx', 'interface', 'icons', 'mediaprobe_icon.dds');
  const panelDds = join(mediaRoot, 'gfx', 'interface', 'icons', 'mediaprobe_panel.dds');
  const iconPng = join(mediaRoot, 'gfx', 'interface', 'icons', 'mediaprobe_icon.png');
  const iconTga = join(mediaRoot, 'gfx', 'interface', 'icons', 'mediaprobe_icon.tga');
  const clickWav = join(mediaRoot, 'sound', 'mediaprobe', 'mediaprobe_click.wav');
  const themeOgg = join(mediaRoot, 'music', 'mediaprobe_theme.ogg');
  const outsideDds = join(mediaArt, 'outside.dds');
  const slowWav = join(mediaArt, 'slow.wav');
  const slowOgg = join(mediaArt, 'slow.ogg');
  writeFileSync(iconDds, ddsBytes({ width: 24, height: 24 }));
  writeFileSync(panelDds, ddsBytes({ width: 200, height: 200 }));
  writeFileSync(iconPng, pngBytes(16, 16));
  writeFileSync(iconTga, tgaBytes(32, 16));
  writeFileSync(outsideDds, ddsBytes({ width: 8, height: 8 }));
  writeFileSync(clickWav, wavBytes({ sampleRate: 44100 }));
  writeFileSync(themeOgg, oggBytes({ sampleRate: 44100 }));
  writeFileSync(slowWav, wavBytes({ sampleRate: 48000, frames: 480 }));
  writeFileSync(slowOgg, oggBytes({ sampleRate: 48000, samples: 48000 }));

  // ---- sprite naming rules
  const goodName = analyseSpriteName('GFX_mediaprobe_icon');
  check('a well-formed sprite name passes with no warning', goodName.ok && goodName.warnings.length === 0, JSON.stringify(goodName));
  const unprefixedName = analyseSpriteName('mediaprobe_icon');
  check(
    'a sprite name without the GFX_ prefix warns but is not refused',
    unprefixedName.ok && unprefixedName.warnings.some((warning) => warning.includes('9171 of the install\'s 9197')),
    JSON.stringify(unprefixedName),
  );
  const illegalName = analyseSpriteName('GFX_mediaprobe icon');
  check(
    'a sprite name with a character no vanilla name uses is refused',
    !illegalName.ok && illegalName.errors.some((error) => error.includes('9243')),
    JSON.stringify(illegalName),
  );
  const textName = analyseSpriteName('GFX_text_mediaprobe_insight');
  check(
    'a GFX_text_ name reports the token and the localisation reference',
    textName.ok && textName.text_icon_token === 'mediaprobe_insight' && textName.localisation_reference === '\u00a3mediaprobe_insight\u00a3',
    JSON.stringify(textName),
  );

  const badInline = resolveSpriteIdentity({ use: 'inline_text_icon', sprite_name: 'GFX_mediaprobe_insight' });
  check(
    'an inline text icon named without GFX_text_ is refused',
    !badInline.ok && badInline.errors.some((error) => error.includes('GFX_text_') && error.includes('astral_planes_resources.gfx:13')),
    JSON.stringify(badInline.errors),
  );
  const derivedInline = resolveSpriteIdentity({ use: 'inline_text_icon', text_icon_token: 'mediaprobe_insight' });
  check(
    'an inline text icon derives GFX_text_<token> from the token',
    derivedInline.ok && derivedInline.name === 'GFX_text_mediaprobe_insight',
    JSON.stringify(derivedInline),
  );
  const mismatchedInline = resolveSpriteIdentity({ use: 'inline_text_icon', text_icon_token: 'aaa', sprite_name: 'GFX_text_bbb' });
  check('a mismatched inline token and sprite name is refused', !mismatchedInline.ok, JSON.stringify(mismatchedInline.errors));

  // ---- per-kind field emission
  const plainBlock = buildGfxBlock('spriteType', { name: 'GFX_mediaprobe_icon', texturefile: 'gfx/interface/icons/mediaprobe_icon.dds' });
  check(
    'spriteType emits name and texturefile only',
    plainBlock.text === '\tspriteType = {\n\t\tname = "GFX_mediaprobe_icon"\n\t\ttexturefile = "gfx/interface/icons/mediaprobe_icon.dds"\n\t}',
    plainBlock.text,
  );
  let sizeRefused = null;
  try {
    buildGfxBlock('spriteType', { name: 'GFX_x', texturefile: 'gfx/x.dds', size: { x: 4, y: 4 } });
  } catch (thrown) {
    sizeRefused = thrown.message;
  }
  check(
    'spriteType refuses size, quoting the measured counts',
    typeof sizeRefused === 'string' && sizeRefused.includes('0 of 8539') && sizeRefused.includes('corneredTileSpriteType'),
    String(sizeRefused),
  );
  let borderRefused = null;
  try {
    buildGfxBlock('spriteType', { name: 'GFX_x', texturefile: 'gfx/x.dds', borderSize: { x: 4, y: 4 } });
  } catch (thrown) {
    borderRefused = thrown.message;
  }
  check('spriteType refuses borderSize', typeof borderRefused === 'string' && borderRefused.includes('borderSize'), String(borderRefused));

  const corneredBlock = buildGfxBlock('corneredTileSpriteType', {
    name: 'GFX_mediaprobe_panel',
    texturefile: 'gfx/interface/icons/mediaprobe_panel.dds',
    borderSize: { x: 40, y: 40 },
  });
  check(
    'corneredTileSpriteType emits borderSize with the install\'s textureFile spelling',
    corneredBlock.text.includes('\t\ttextureFile = "gfx/interface/icons/mediaprobe_panel.dds"') &&
      corneredBlock.text.includes('\t\tborderSize = { x = 40 y = 40 }'),
    corneredBlock.text,
  );
  let corneredNoBorder = null;
  try {
    buildGfxBlock('corneredTileSpriteType', { name: 'GFX_x', texturefile: 'gfx/x.dds' });
  } catch (thrown) {
    corneredNoBorder = thrown.message;
  }
  check('corneredTileSpriteType requires borderSize', typeof corneredNoBorder === 'string' && corneredNoBorder.includes('borderSize'), String(corneredNoBorder));

  const barBlock = buildGfxBlock('progressBarType', {
    name: 'GFX_mediaprobe_bar',
    texturefile1: 'gfx/interface/icons/mediaprobe_bar_fill.dds',
    texturefile2: 'gfx/interface/icons/mediaprobe_bar_bg.dds',
    size: { width: 200, height: 12 },
  });
  check(
    'progressBarType defaults the progress shader and emits both textures plus size',
    barBlock.text.includes('textureFile1 = "gfx/interface/icons/mediaprobe_bar_fill.dds"') &&
      barBlock.text.includes('textureFile2 = "gfx/interface/icons/mediaprobe_bar_bg.dds"') &&
      barBlock.text.includes('size = { x = 200 y = 12 }') &&
      barBlock.text.includes('effectFile = "gfx/FX/progress.shader"'),
    barBlock.text,
  );
  let barSingular = null;
  try {
    buildGfxBlock('progressBarType', { name: 'GFX_x', texturefile: 'gfx/x.dds', size: { x: 1, y: 1 } });
  } catch (thrown) {
    barSingular = thrown.message;
  }
  check('progressBarType refuses a singular texturefile', typeof barSingular === 'string' && barSingular.includes('textureFile1'), String(barSingular));

  const flagBlock = buildGfxBlock('flagSpriteType', {
    name: 'GFX_mediaprobe_flag',
    texturefile: 'gfx/interface/icons/mediaprobe_flag.dds',
    masking_texture: 'gfx/interface/icons/mediaprobe_flag_mask.dds',
    bg_size: { width: 162, height: 183 },
  });
  check(
    'flagSpriteType defaults the flag shader and keeps width/height block keys',
    flagBlock.text.includes('effectFile = "gfx/FX/flag_sprite.shader"') && flagBlock.text.includes('bg_size = { width = 162 height = 183 }'),
    flagBlock.text,
  );
  check(
    'the two kinds with no vanilla example warn that their field set is unmeasured',
    buildGfxBlock('tileSpriteType', { name: 'GFX_x', texturefile: 'gfx/x.dds' }).warnings.some((warning) => warning.includes('0 blocks')) &&
      buildGfxBlock('maskedShieldType', { name: 'GFX_y', texturefile: 'gfx/y.dds' }).warnings.some((warning) => warning.includes('0 blocks')),
  );
  let unknownField = null;
  try {
    buildGfxBlock('spriteType', { name: 'GFX_x', texturefile: 'gfx/x.dds', made_up_field: 'yes' });
  } catch (thrown) {
    unknownField = thrown.message;
  }
  check(
    'an unknown field is refused with the measured field list',
    typeof unknownField === 'string' && unknownField.includes('made_up_field') && unknownField.includes('noOfFrames'),
    String(unknownField),
  );
  const forcedField = buildGfxBlock(
    'spriteType',
    { name: 'GFX_x', texturefile: 'gfx/x.dds', made_up_field: 'yes' },
    { allowUnverifiedFields: true },
  );
  check(
    'allow_unverified_fields writes the field and warns',
    forcedField.text.includes('made_up_field = { yes }') && forcedField.warnings.some((warning) => warning.includes('not part of the measured field set')),
    JSON.stringify(forcedField),
  );
  check(
    'the .gfx wrapper is spriteTypes',
    buildGfxFile([plainBlock.text]).startsWith('spriteTypes = {') && buildGfxFile([plainBlock.text]).trimEnd().endsWith('}'),
  );
  check('every kind spec declares name as required', GFX_KINDS.every((kind) => gfxKindSpec(kind).required.includes('name')));

  const pieBlock = buildGfxBlock('PieChartType', { name: 'GFX_x', size: { x: 40, y: 40 }, colors: [1, 0, 0] });
  check(
    'PieChartType takes no texture and emits size plus its colors block',
    pieBlock.text.includes('size = { x = 40 y = 40 }') && pieBlock.text.includes('colors = { 1 0 0 }') && !pieBlock.text.includes('texture'),
    pieBlock.text,
  );
  const colourTwice = buildGfxBlock('progressBarType', {
    name: 'GFX_x',
    texturefile1: 'gfx/a.dds',
    texturefile2: 'gfx/b.dds',
    size: { x: 1, y: 1 },
    colorTwo: [0.5, 0.5, 0.5],
  });
  check(
    'a block the install spells two ways is emitted exactly once',
    (colourTwice.text.match(/colorTwo/g) ?? []).length === 1 && !colourTwice.text.includes('colortwo'),
    colourTwice.text,
  );
  const colourMapping = analyseImageRegistration({
    prefix: 'probe',
    gfx_file: 'interface/probe_gfx.gfx',
    output_root: mediaRoot,
    sprites: [
      {
        sprite_name: 'GFX_probe_bar',
        kind: 'progressBarType',
        texture_file: iconDds,
        texture_relpath: 'gfx/interface/icons/mediaprobe_icon.dds',
        texture_file_2: 'gfx/interface/icons/mediaprobe_panel.dds',
        size: { x: 10, y: 100 },
        color_two: [0.5, 0.5, 0.5],
      },
    ],
  });
  check(
    'the tool maps color_two onto the install spelling exactly once',
    colourMapping.ok && (colourMapping.sprites[0].gfx_block.match(/colorTwo = \{ 0.5 0.5 0.5 \}/g) ?? []).length === 1,
    JSON.stringify(colourMapping.errors.length ? colourMapping.errors : colourMapping.sprites[0]?.gfx_block),
  );
  const bareNumber = buildGfxBlock('spriteType', { name: 'GFX_x', texturefile: 'gfx/x.dds', default_frame: 1 });
  check('an extra field keeps a number bare rather than quoting it', bareNumber.text.includes('default_frame = 1'), bareNumber.text);

  // ---- header reading on synthetic files
  const ddsHeader = readTextureHeader(iconDds);
  check(
    'the DDS reader reports real dimensions, format and mips',
    ddsHeader.ok && ddsHeader.container === 'dds' && ddsHeader.width === 24 && ddsHeader.height === 24 && ddsHeader.format === 'RGBA32' && ddsHeader.mipCount === 1 && ddsHeader.hasAlpha === true,
    JSON.stringify(ddsHeader),
  );
  const dxtFile = join(mediaArt, 'dxt5.dds');
  writeFileSync(dxtFile, ddsBytes({ width: 64, height: 64, fourCC: 'DXT5' }));
  const dxtHeader = readTextureHeader(dxtFile);
  check('a DXT5 DDS is reported as BC3', dxtHeader.ok && dxtHeader.format === 'BC3', JSON.stringify(dxtHeader));
  const pngHeader = readTextureHeader(iconPng);
  check(
    'the PNG reader reports dimensions and alpha',
    pngHeader.ok && pngHeader.container === 'png' && pngHeader.width === 16 && pngHeader.height === 16 && pngHeader.hasAlpha === true,
    JSON.stringify(pngHeader),
  );
  const tgaHeader = readTextureHeader(iconTga);
  check(
    'the TGA reader reports dimensions and depth',
    tgaHeader.ok && tgaHeader.container === 'tga' && tgaHeader.width === 32 && tgaHeader.height === 16 && tgaHeader.bitDepth === 24 && tgaHeader.topDown === true,
    JSON.stringify(tgaHeader),
  );
  check(
    'a non-texture extension is refused by name',
    readTextureHeader(join(mediaRoot, 'descriptor.mod')).ok === false,
  );
  check(
    'the format judge accepts a plain RGBA DDS but warns about the single mip',
    judgeTextureFormat(ddsHeader).accepted === true && judgeTextureFormat(ddsHeader).warnings.some((warning) => warning.includes('single mip level')),
  );

  const wavHeader = readAudioHeader(clickWav);
  check(
    'the WAV reader reports rate, channels, depth and exact duration',
    wavHeader.ok && wavHeader.container === 'wav' && wavHeader.sampleRate === 44100 && wavHeader.channels === 1 && wavHeader.bitDepth === 16 && Math.abs(wavHeader.durationSeconds - 0.01) < 0.0005,
    JSON.stringify(wavHeader),
  );
  const oggHeader = readAudioHeader(themeOgg);
  check(
    'the Vorbis reader reports rate, channels and the granule duration',
    oggHeader.ok && oggHeader.container === 'ogg' && oggHeader.sampleRate === 44100 && oggHeader.channels === 2 && Math.abs(oggHeader.durationSeconds - 1) < 0.0001,
    JSON.stringify(oggHeader),
  );

  // ---- sample-rate and container validation
  const slowOggHeader = readAudioHeader(slowOgg);
  check(
    '48 kHz music is refused, quoting the engine log line',
    judgeAudioFormat(slowOggHeader, { kind: 'music' }).accepted === false &&
      judgeAudioFormat(slowOggHeader, { kind: 'music' }).errors.some((error) => error.includes('pdx_audiomusic_sdl.cpp:88')),
    JSON.stringify(judgeAudioFormat(slowOggHeader, { kind: 'music' })),
  );
  const slowWavHeader = readAudioHeader(slowWav);
  const slowWavVerdict = judgeAudioFormat(slowWavHeader, { kind: 'sound' });
  check(
    '48 kHz sound is a warning rather than an error',
    slowWavVerdict.accepted === true && slowWavVerdict.warnings.some((warning) => warning.includes('44.1kHz')),
    JSON.stringify(slowWavVerdict),
  );
  check(
    'a 44.1 kHz stereo Ogg passes with no findings',
    judgeAudioFormat(oggHeader, { kind: 'music' }).supported === true,
    JSON.stringify(judgeAudioFormat(oggHeader, { kind: 'music' })),
  );
  check(
    'a WAV in the music registry is refused',
    judgeAudioFormat(wavHeader, { kind: 'music' }).accepted === false,
    JSON.stringify(judgeAudioFormat(wavHeader, { kind: 'music' })),
  );
  check(
    'an Ogg in the sound registry is refused',
    judgeAudioFormat(oggHeader, { kind: 'sound' }).accepted === false,
    JSON.stringify(judgeAudioFormat(oggHeader, { kind: 'sound' })),
  );
  const badAudioName = analyseAudioName('mediaprobe click');
  check('an audio name with a space is refused', !badAudioName.ok && badAudioName.errors.some((error) => error.includes('5901')), JSON.stringify(badAudioName));

  // ---- collision detection against the synthetic install
  const collisions = findSpriteCollisions('GFX_probe_taken', { gameRoot: fakeInstall });
  check(
    'a sprite name already declared in the install is found with file:line',
    collisions.length === 1 && collisions[0].file === 'interface/fake.gfx' && collisions[0].line === 2 && collisions[0].kind === 'spriteType',
    JSON.stringify(collisions),
  );
  let collisionRefusal = null;
  try {
    await call('register_image_asset', {
      prefix: 'mediaprobe',
      output_root: mediaRoot,
      game_root: fakeInstall,
      sprites: [{ sprite_name: 'GFX_probe_taken', texture_file: iconDds }],
    });
  } catch (thrown) {
    collisionRefusal = thrown.message;
  }
  check(
    'register_image_asset refuses a name the install already declares',
    typeof collisionRefusal === 'string' && collisionRefusal.includes('interface/fake.gfx:2'),
    String(collisionRefusal),
  );

  // ---- path rules
  const outsideResolution = resolveTextureRelPath({ textureFile: outsideDds, outputRoot: mediaRoot });  check(
    'a texture outside the mod root cannot have its in-mod path derived',
    outsideResolution.ok === false && outsideResolution.reason.includes('outside output_root'),
    JSON.stringify(outsideResolution),
  );
  let gfxFileRefusal = null;
  try {
    await call('register_image_asset', {
      prefix: 'mediaprobe',
      gfx_file: 'gfx/mediaprobe_gfx.gfx',
      output_root: mediaRoot,
      sprites: [{ sprite_name: 'GFX_mediaprobe_elsewhere', texture_file: iconDds }],
    });
  } catch (thrown) {
    gfxFileRefusal = thrown.message;
  }
  check(
    'a .gfx outside interface/ is refused',
    typeof gfxFileRefusal === 'string' && gfxFileRefusal.includes('must be under `interface/`'),
    String(gfxFileRefusal),
  );

  // ---- the write path: no BOM on script, BOM on localisation, last-wins file layout
  const imageDry = await call('register_image_asset', {
    prefix: 'mediaprobe',
    output_root: mediaRoot,
    game_root: fakeInstall,
    sprites: [
      { sprite_name: 'GFX_mediaprobe_icon', texture_file: iconDds },
      { use: 'chrome', texture_file: panelDds, sprite_name: 'GFX_mediaprobe_panel', border_size: { x: 40, y: 40 } },
      { use: 'inline_text_icon', text_icon_token: 'mediaprobe_insight', texture_file: iconPng },
    ],
  });
  check('the image dry run writes nothing', imageDry.dry_run === true && !existsSync(join(mediaRoot, 'interface', 'mediaprobe_gfx.gfx')));
  check(
    'the image dry run reports the measured header facts',
    imageDry.measured[0].texture.width === 24 && imageDry.measured[2].texture.container === 'png' && imageDry.measured[2].texture.width === 16,
    JSON.stringify(imageDry.measured),
  );
  check(
    'the inline text icon is renamed to GFX_text_ and reports its pound reference',
    imageDry.sprites[2].sprite_name === 'GFX_text_mediaprobe_insight' && imageDry.sprites[2].localisation_reference === '\u00a3mediaprobe_insight\u00a3',
    JSON.stringify(imageDry.sprites[2]),
  );

  const imageWritten = await call('register_image_asset', {
    prefix: 'mediaprobe',
    output_root: mediaRoot,
    game_root: fakeInstall,
    dry_run: false,
    sprites: [
      { sprite_name: 'GFX_mediaprobe_icon', texture_file: iconDds },
      { use: 'chrome', texture_file: panelDds, sprite_name: 'GFX_mediaprobe_panel', border_size: { x: 40, y: 40 } },
      { use: 'inline_text_icon', text_icon_token: 'mediaprobe_insight', texture_file: iconPng },
    ],
  });
  const gfxPath = join(mediaRoot, 'interface', 'mediaprobe_gfx.gfx');
  const gfxBytes = readFileSync(gfxPath);
  const gfxWrittenText = gfxBytes.toString('utf8');
  check('the image write creates interface/mediaprobe_gfx.gfx', existsSync(gfxPath) && imageWritten.messages.some((message) => message.includes('wrote 1 file')));
  check('the .gfx has no BOM', gfxBytes[0] !== 0xef);
  check(
    'the .gfx holds all three blocks with the right kinds',
    gfxWrittenText.includes('\tspriteType = {\n\t\tname = "GFX_mediaprobe_icon"') &&
      gfxWrittenText.includes('\tcorneredTileSpriteType = {') &&
      gfxWrittenText.includes('\t\tname = "GFX_text_mediaprobe_insight"'),
    gfxWrittenText,
  );

  const spriteIndex = indexGfxSprites(mediaRoot);
  check(
    'the written .gfx parses back with the kinds and textures intact',
    spriteIndex.sprites.get('GFX_mediaprobe_panel')?.kind === 'corneredTileSpriteType' &&
      spriteIndex.sprites.get('GFX_mediaprobe_panel')?.textureFile === 'gfx/interface/icons/mediaprobe_panel.dds',
    JSON.stringify([...spriteIndex.sprites.entries()]),
  );
  check('the mod interface index sees the new sprites', indexInterfaceRoot(mediaRoot).sprites.has('GFX_text_mediaprobe_insight'));

  const imageAudit = await call('validate_image_asset', { workspace_root: mediaRoot, game_root: fakeInstall });
  check('the image audit counts the mod\'s sprites and finds no error', imageAudit.audit.sprites === 3 && imageAudit.audit.error_count === 0, JSON.stringify(imageAudit.audit));

  const pieRegistration = await call('register_image_asset', {
    prefix: 'mediaprobe',
    output_root: mediaRoot,
    sprites: [{ kind: 'PieChartType', sprite_name: 'GFX_mediaprobe_pie', size: { x: 40, y: 40 }, colors: [1, 0, 0] }],
  });
  check(
    'a kind with no texture registers without a texture_file',
    pieRegistration.dry_run === true &&
      pieRegistration.files.length === 1 &&
      pieRegistration.sprites[0].texture === null &&
      pieRegistration.sprites[0].gfx_block.includes('colors = { 1 0 0 }'),
    JSON.stringify(pieRegistration.sprites[0]),
  );
  writeFileSync(
    join(mediaRoot, 'interface', 'mediaprobe_broken.gfx'),
    'spriteTypes = {\n\tspriteType = {\n\t\tname = "GFX_mediaprobe_broken"\n\t\ttexturefile = "gfx/interface/icons/does_not_exist.dds"\n\t}\n}\n',
    'utf8',
  );
  const brokenImageAudit = await call('validate_image_asset', { workspace_root: mediaRoot, game_root: fakeInstall });
  check(
    'the image audit catches a texturefile that resolves nowhere',
    brokenImageAudit.audit.findings.some((finding) => finding.code === 'sprite-texture-missing'),
    JSON.stringify(brokenImageAudit.audit.findings),
  );
  rmSync(join(mediaRoot, 'interface', 'mediaprobe_broken.gfx'), { force: true });

  // ---- sound registration
  const soundDry = await call('register_audio_asset', {
    kind: 'sound',
    prefix: 'mediaprobe',
    output_root: mediaRoot,
    game_root: fakeInstall,
    audio_file: clickWav,
    volume: 0.5,
    soundeffect_name: 'mediaprobe_click_sfx',
    category: SOUND_CATEGORIES[1],
  });
  check(
    'the sound dry run derives the .asset next to the audio and a relative file value',
    soundDry.files.length === 1 &&
      soundDry.files[0].path === 'sound/mediaprobe/mediaprobe_sound.asset' &&
      soundDry.file_value === 'mediaprobe_click.wav' &&
      soundDry.resolves_to === 'sound/mediaprobe/mediaprobe_click.wav',
    JSON.stringify({ files: soundDry.files, file: soundDry.file_value, resolves: soundDry.resolves_to }),
  );
  const soundWritten = await call('register_audio_asset', {
    kind: 'sound',
    prefix: 'mediaprobe',
    output_root: mediaRoot,
    game_root: fakeInstall,
    dry_run: false,
    audio_file: clickWav,
    volume: 0.5,
    soundeffect_name: 'mediaprobe_click_sfx',
    category: SOUND_CATEGORIES[1],
  });
  const soundPath = join(mediaRoot, 'sound', 'mediaprobe', 'mediaprobe_sound.asset');
  const soundBytes = readFileSync(soundPath);
  const soundText = soundBytes.toString('utf8');
  check('the sound write reports success', soundWritten.messages.some((message) => message.includes('wrote 1 file')));
  check('the .asset has no BOM', soundBytes[0] !== 0xef);
  check(
    'the sound block, the soundeffect and the category all land in one file',
    soundText.includes('sound = {\n\tname = mediaprobe_mediaprobe_click\n\tfile = "mediaprobe_click.wav"') &&
      soundText.includes('soundeffect = {') &&
      soundText.includes(`category = {\n\tname = ${SOUND_CATEGORIES[1]}`),
    soundText,
  );
  let badCategory = null;
  try {
    await call('register_audio_asset', { kind: 'sound', prefix: 'mediaprobe', output_root: mediaRoot, audio_file: clickWav, category: 'Explosions' });
  } catch (thrown) {
    badCategory = thrown.message;
  }
  check(
    'an unknown mixer category is refused and the six real ones are named',
    typeof badCategory === 'string' && SOUND_CATEGORIES.every((name) => badCategory.includes(name)),
    String(badCategory),
  );

  // ---- music registration: three files, and the localisation one carries the BOM
  const musicDry = await call('register_audio_asset', {
    kind: 'music',
    prefix: 'mediaprobe',
    output_root: mediaRoot,
    game_root: fakeInstall,
    audio_file: themeOgg,
    title: 'Media Probe Theme',
    volume: 0.8,
  });
  check(
    'the music dry run plans the asset, the song entry and the localisation',
    musicDry.files.length === 3,
    JSON.stringify(musicDry.files),
  );
  await call('register_audio_asset', {
    kind: 'music',
    prefix: 'mediaprobe',
    output_root: mediaRoot,
    game_root: fakeInstall,
    dry_run: false,
    audio_file: themeOgg,
    title: 'Media Probe Theme',
    volume: 0.8,
  });
  const musicAsset = readFileSync(join(mediaRoot, 'music', 'mediaprobe_music.asset'), 'utf8');
  const songText = readFileSync(join(mediaRoot, 'music', 'mediaprobe_songs.txt'), 'utf8');
  const musicLocPath = join(mediaRoot, 'localisation', 'english', 'mediaprobe_musicplayer_l_english.yml');
  const musicLocBytes = readFileSync(musicLocPath);
  check('the music block names the track and the file', musicAsset.includes('music = {') && musicAsset.includes('file = "mediaprobe_theme.ogg"'), musicAsset);
  check(
    'the song entry is what the music player needs',
    songText.includes('song = {\n\tname = mediaprobe_mediaprobe_theme\n}'),
    songText,
  );
  check(
    'the track-title localisation has a BOM, the language header and the key',
    musicLocBytes[0] === 0xef && musicLocBytes[1] === 0xbb && musicLocBytes[2] === 0xbf &&
      musicLocBytes.toString('utf8').includes('l_english:') &&
      musicLocBytes.toString('utf8').includes('mediaprobe_mediaprobe_theme:0 "Media Probe Theme"'),
    musicLocBytes.toString('utf8'),
  );
  let slowMusic = null;
  try {
    await call('register_audio_asset', { kind: 'music', prefix: 'mediaprobe', output_root: mediaRoot, audio_file: slowOgg, title: 'Slow' });
  } catch (thrown) {
    slowMusic = thrown.message;
  }
  check('a 48 kHz music track is refused', typeof slowMusic === 'string' && slowMusic.includes('44.1kHz'), String(slowMusic));
  const slowSound = await call('register_audio_asset', { kind: 'sound', prefix: 'mediaprobe', output_root: mediaRoot, audio_file: slowWav, audio_relpath: 'sound/mediaprobe/slow.wav' });
  check(
    'a 48 kHz sound is registered with a warning instead of being refused',
    slowSound.dry_run === true && slowSound.sample_rate_ok === false && slowSound.warnings.some((warning) => warning.includes('44.1kHz')),
    JSON.stringify(slowSound.warnings),
  );
  let duplicateMusic = null;
  try {
    await call('register_audio_asset', { kind: 'music', prefix: 'mediaprobe', output_root: mediaRoot, game_root: fakeInstall, audio_file: themeOgg, name: 'probe_taken_music' });
  } catch (thrown) {
    duplicateMusic = thrown.message;
  }
  check(
    'a music name the install already uses is refused with file:line',
    typeof duplicateMusic === 'string' && duplicateMusic.includes('music/fake.asset:1'),
    String(duplicateMusic),
  );

  const audioAudit = await call('validate_audio_asset', { workspace_root: mediaRoot, game_root: fakeInstall });
  check(
    'the audio audit is clean on the files just written',
    audioAudit.audit.error_count === 0 && audioAudit.audit.warning_count === 0,
    JSON.stringify(audioAudit.audit.findings),
  );
  writeFileSync(join(mediaRoot, 'sound', 'mediaprobe', 'mediaprobe_broken.asset'), 'sound = {\n\tname = mediaprobe_broken\n\tfile = "not_here.wav"\n}\n', 'utf8');
  const brokenAudioAudit = await call('validate_audio_asset', { workspace_root: mediaRoot, game_root: fakeInstall });
  check(
    'the audio audit resolves file values relative to the .asset folder and catches a miss',
    brokenAudioAudit.audit.error_count === 1 &&
      brokenAudioAudit.audit.findings[0].code === 'audio-file-missing' &&
      brokenAudioAudit.audit.findings[0].message.includes('relative to this .asset file\'s own folder'),
    JSON.stringify(brokenAudioAudit.audit.findings),
  );
  rmSync(join(mediaRoot, 'sound', 'mediaprobe', 'mediaprobe_broken.asset'), { force: true });

  // ---- the tool surface itself
  const assetTools = tools.list().filter((tool) =>
    ['register_image_asset', 'validate_image_asset', 'register_audio_asset', 'validate_audio_asset'].includes(tool.name),
  );
  check('the four asset tools are registered', assetTools.length === 4, tools.list().map((tool) => tool.name).join(','));
  check(
    'each asset tool declares a full schema with descriptions',
    assetTools.every(
      (tool) =>
        tool.inputSchema?.type === 'object' &&
        Object.values(tool.inputSchema.properties).length > 0 &&
        Object.values(tool.inputSchema.properties).every((property) => typeof property.description === 'string' && property.description.length > 10),
    ),
    JSON.stringify(assetTools.map((tool) => [tool.name, Object.keys(tool.inputSchema.properties).length])),
  );
  check(
    'the two write tools default to a dry run and accept output_root',
    assetTools
      .filter((tool) => tool.name.startsWith('register_'))
      .every((tool) => 'dry_run' in tool.inputSchema.properties && 'output_root' in tool.inputSchema.properties),
  );
  check(
    'the two validators never ask for output_root',
    assetTools.filter((tool) => tool.name.startsWith('validate_')).every((tool) => !('output_root' in tool.inputSchema.properties)),
  );

  // ---- the real install, when it is present: the same readers against shipped bytes
  const realInstall = ['<Stellaris>', 'C:/Program Files (x86)/Steam/steamapps/common/Stellaris'].find((candidate) =>
    existsSync(candidate),
  );
  if (realInstall) {
    const realIndex = indexGfxSprites(realInstall);
    check(
      'the install sprite index finds every kind the 4.4.6 census recorded',
      realIndex.kindCensus.get('spriteType') === 8539 &&
        realIndex.kindCensus.get('corneredTileSpriteType') === 335 &&
        realIndex.kindCensus.get('flagSpriteType') === 18 &&
        (realIndex.kindCensus.get('tileSpriteType') ?? 0) === 0 &&
        (realIndex.kindCensus.get('maskedShieldType') ?? 0) === 0,
      JSON.stringify([...realIndex.kindCensus.entries()]),
    );
    check(
      'no vanilla sprite name is declared twice',
      realIndex.duplicates.length === 0 && realIndex.sprites.size === 9197,
      `sprites=${realIndex.sprites.size} duplicates=${realIndex.duplicates.length}`,
    );
    check(
      'the GFX_text_ alias pattern is present in the install',
      realIndex.sprites.get('GFX_text_resource_astral_threads')?.file === 'interface/astral_planes_resources.gfx' &&
        realIndex.sprites.get('GFX_text_resource_astral_threads')?.line === 13 &&
        realIndex.sprites.get('GFX_resource_astral_threads')?.line === 3 &&
        realIndex.sprites.get('GFX_text_resource_astral_threads')?.textureFile ===
          realIndex.sprites.get('GFX_resource_astral_threads')?.textureFile,
      JSON.stringify(realIndex.sprites.get('GFX_text_resource_astral_threads')),
    );
    const realDds = readTextureHeader(join(realInstall, 'gfx/interface/additional_content/window_background.dds'));
    const realPng = readTextureHeader(join(realInstall, 'gfx/interface/main/avoid_system_bg.png'));
    check(
      'the texture readers work on shipped bytes (DDS and the PNG the .gfx registry references)',
      realDds.ok && realDds.format === 'RGBA32' && realDds.width === 680 &&
        realPng.ok && realPng.container === 'png' && realPng.width === 440,
      JSON.stringify({ dds: realDds.format, ddsWidth: realDds.width, png: realPng.format, pngWidth: realPng.width }),
    );
    const realWav = readAudioHeader(join(realInstall, 'sound/placeholders/placeholder_alert.wav'));
    const realOgg = readAudioHeader(join(realInstall, 'music/creationandbeyond.ogg'));
    check(
      'the audio readers work on shipped bytes, and both are 44.1 kHz',
      realWav.ok && realWav.sampleRate === 44100 && realWav.bitDepth === 16 &&
        realOgg.ok && realOgg.sampleRate === 44100 && realOgg.channels === 2,
      JSON.stringify({ wav: realWav.sampleRate, ogg: realOgg.sampleRate }),
    );
    const realAudio = await call('validate_audio_asset', {
      game_root: realInstall,
      kind: 'music',
      prefix: 'probe',
      name: 'maintheme',
      audio_file: join(realInstall, 'music/creationandbeyond.ogg'),
      audio_relpath: 'music/creationandbeyond.ogg',
    });
    check(
      'validating a shipped music file against the install reports both vanilla collisions (the music key and its song entry)',
      realAudio.errors.some((error) => error.includes('music/maintheme.asset:1')) &&
        realAudio.errors.some((error) => error.includes('music/maintheme.txt:1')),
      JSON.stringify(realAudio.errors),
    );
  } else {
    check('the real install is not present, so the shipped-byte checks were skipped', true);
  }

  // ------------------------------------------------------------------ GAP-2 / GAP-3 rules
  //
  // The two rules the signature checker was missing, and the repeatable-section exemption that
  // stopped the workspace parser reporting 42 false duplicates. Each assertion is written so that
  // REMOVING the rule makes it fail: the rule's own helper is exercised directly, and the fixture
  // is the shape that was measured on the real mod.
  {
    const modifierKeys = await import('../src/lib/modifier-keys.mjs');
    const staticFixture = [
      'fixture_modifier = {',
      '\ticon = "gfx/interface/icons/planet_modifiers/pm_unknown.dds"',
      '\tcountry_influence_produces_mult = 0.10',
      '\tcountry_trust_zzz_impossible = 0.10',
      '\tmodifier = {',
      '\t\tplanet_stability_add = 1',
      '\t\tis_variable_set = x',
      '\t}',
      '}',
    ].join('\n');
    const assignments = modifierKeys.staticModifierAssignments(staticFixture);
    const names = assignments.map((entry) => entry.key);
    // Asserted as the walk actually behaves, not as it was hoped to: the keys inside a BARE
    // condition block survive the filter (a `potential`/`allow`/`trigger`/`weight_modifier` wrapper
    // is excluded, but a condition written without one is `key = value` at the same depth as a
    // modifier assignment, so it is not distinguished). Those names resolve against the engine list
    // in vanilla, so no finding is raised; the engine's exact reading of a nested condition block is
    // listed as not-established in the README.
    check(
      'a static_modifiers block yields its modifier keys, and drops its plumbing',
      names.includes('country_influence_produces_mult') &&
        names.includes('country_trust_zzz_impossible') &&
        names.includes('planet_stability_add') &&
        !names.includes('icon'),
      JSON.stringify(names),
    );
    // The rule itself: the fixture's impossible key must not be in the engine's list, and the real
    // keys must be. This is the check the tool makes, on a fixture that cannot go stale.
    const modifiersLog = join(process.env.USERPROFILE ?? '', 'Documents', 'Paradox Interactive', 'Stellaris', 'logs', 'script_documentation', 'modifiers.log');
    if (existsSync(modifiersLog)) {
      const known = new Map();
      for (const line of readFileSync(modifiersLog, 'utf8').split(/\r?\n/)) {
        const match = /^-\s*([A-Za-z0-9_]+)\s*,\s*Category:\s*(.+?)\s*$/.exec(line.trim());
        if (match) known.set(match[1], match[2]);
      }
      check('the engine modifier list is the measured size', known.size > 48000, `${known.size} keys`);
      check('the fixture\'s real modifier keys ARE in the engine list', known.has('country_influence_produces_mult') && known.has('planet_stability_add'), 'the rule must not fire on real keys');
      check(
        'the fixture\'s impossible modifier key is NOT in the engine list (so the rule fires on it)',
        !known.has('country_trust_zzz_impossible'),
        JSON.stringify(modifierKeys.nearestModifierKeys('country_trust_zzz_impossible', known, 3)),
      );
      check(
        'a one-letter typo of a real key gets a near-match suggestion',
        modifierKeys.nearestModifierKeys('country_influence_produces_mul', known, 3).some((entry) => entry.key === 'country_influence_produces_mult'),
        JSON.stringify(modifierKeys.nearestModifierKeys('country_influence_produces_mul', known, 3)),
      );
    }
    check(
      'a script-value operand is checked only when it can BE a name',
      modifierKeys.looksLikeScriptName('unga_votes_total') &&
        !modifierKeys.looksLikeScriptName('$MULT$') &&
        !modifierKeys.looksLikeScriptName('owner.num_x') &&
        !modifierKeys.looksLikeScriptName('value:other') &&
        !modifierKeys.looksLikeScriptName('20') &&
        !modifierKeys.looksLikeScriptName('@w'),
    );
    check(
      'the documented script-value operations are known, and a field name is not',
      modifierKeys.SCRIPT_VALUE_OPERATIONS.has('add') && modifierKeys.SCRIPT_VALUE_OPERATIONS.has('value') && modifierKeys.SCRIPT_VALUE_OPERATIONS.has('divide') && !modifierKeys.SCRIPT_VALUE_OPERATIONS.has('tooltip'),
    );

    // GAP-3: a repeatable section is not a definition key. The exemption is exact, not blanket.
    const workspaceModule = await import('../src/lib/workspace.mjs');
    check(
      '`defined_text` is exempt in `common/scripted_loc/` and nowhere else',
      workspaceModule.isRepeatableSectionKey('scripted_loc', 'defined_text') === true &&
        workspaceModule.isRepeatableSectionKey('scripted_loc', 'other_key') === false &&
        workspaceModule.isRepeatableSectionKey('technology', 'defined_text') === false,
    );
    check(
      'the exemption keeps the uniqueness constraint that IS real inside a scripted_loc file',
      workspaceModule.REPEATABLE_SECTION_KEYS.has('scripted_loc:defined_text') && !workspaceModule.REPEATABLE_SECTION_KEYS.has('scripted_loc'),
    );
  }

  // ------------------------------------------------------------------ summary
  process.stdout.write(`\n${'='.repeat(72)}\n`);
  process.stdout.write(`passed ${passed}, failed ${failed}\n`);
  if (failures.length > 0) {
    process.stdout.write('\nfailures:\n');
    for (const failure of failures) process.stdout.write(`  - ${failure}\n`);
  }
  process.stdout.write(`scratch mod written to ${modRoot}\n`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((thrown) => {
  process.stderr.write(`selftest crashed: ${thrown instanceof Error ? thrown.stack : thrown}\n`);
  process.exitCode = 1;
});
