//------------------------------------------------------------------------------------
// audio.mjs -- Part of RStellarisScribe
//
// Audio *header* reading plus the install's own sound/music registry, for the audio half
// of asset registration. Two questions have to be answered from real bytes rather than
// from documentation, because the engine answers neither one out loud:
//
//   1. which container is this, at what sample rate, how long is it?
//   2. is that container and rate one the engine accepts?
//
// Measured on the verified Stellaris 4.4.6 install (`<Stellaris>`):
//
//   sound/**/*.wav     6890 files - 6890 at 44100 Hz, 6804 at 16-bit, 86 at 24-bit,
//                      4760 stereo and 2130 mono, every one PCM (format tag 0x1).
//   sound/**/*.ogg        0 files.
//   music/**/*.ogg       30 files - 30 at 44100 Hz, all 2-channel Vorbis (stream version 0,
//                      block sizes 184/1).
//   music/**/*.wav        0 files.
//   sound/**/*.{flac,mp3} 0, music/**/*.{flac,mp3} 0.
//   soundtrack/          23 .flac and 23 .mp3 - the distributable original soundtrack, a
//                      folder of listening files that no .asset file references and that the
//                      engine never loads. It is not an audio registry.
//
//   Exactly one declaration shape per kind (file:line):
//     sound/**/*.asset       sound = { name file volume always_load }   sound/sound.asset:3
//     sound/**/*.asset       soundeffect = { name sounds volume ... }   sound/gui/gui_sound_effects.asset:1
//     sound/**/*.asset       category = { name soundeffects }           sound/category.asset:3
//     sound/**/*.asset       falloff = { name min_distance max_distance } sound/falloff.asset:1
//     sound/**/*.asset       soundgroup = { name soundoverride }        sound/soundgroups.asset:3
//     music/**/*.asset       music = { name file volume }               music/maintheme.asset:1
//     music/**/*.txt         song = { name }                            music/maintheme.txt:1
//
//   And the sample-rate rule the engine states itself, from the user's own log
//   (`%USERPROFILE%/Documents/Paradox Interactive/Stellaris/logs/error.log`, lines 574-585
//   of the run this feature was written against):
//     [pdx_audiomusic_sdl.cpp:88]: For best performance and quality music files should be
//     in 44.1kHz (<track name>)
//   All 30 vanilla music tracks are 44.1 kHz, and so are all 6890 vanilla sounds, so the
//   warning is a real, checkable requirement rather than a suggestion.
//
// This program is free software: you can redistribute it and/or modify it under the terms
// of the GNU Affero General Public License as published by the Free Software Foundation,
// either version 3 of the License, or (at your option) any later version.
//------------------------------------------------------------------------------------

import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { parseParadoxBlocks } from './paradox.mjs';

/** The engine's stated preferred rate, from `pdx_audiomusic_sdl.cpp:88`. */
export const ENGINE_SAMPLE_RATE = 44100;

/** Containers measured under `sound/`, keyed by extension. */
export const SOUND_CONTAINERS = ['.wav'];
/** Containers measured under `music/`, keyed by extension. */
export const MUSIC_CONTAINERS = ['.ogg'];

/** WAVE format tags, by number. */
const WAVE_FORMAT_TAGS = {
  0x0001: 'PCM',
  0x0003: 'IEEE float',
  0x0006: 'A-law',
  0x0007: 'mu-law',
  0x0011: 'IMA ADPCM',
  0x0055: 'MPEG Layer 3',
  0xfffe: 'WAVE_FORMAT_EXTENSIBLE',
};

/** Registry blocks the install's `.asset` files use, with the kind they declare. */
export const SOUND_BLOCK_KINDS = ['sound', 'soundeffect', 'category', 'falloff', 'soundgroup'];
export const MUSIC_BLOCK_KINDS = ['music'];
export const SONG_BLOCK_KINDS = ['song'];

/** Read `length` bytes at `offset` without reading the whole file. */
function readAt(path, offset, length, fileSize = null) {
  const size = fileSize ?? statSync(path).size;
  if (offset >= size) return Buffer.alloc(0);
  const want = Math.min(length, size - offset);
  const buffer = Buffer.alloc(want);
  const fd = openSync(path, 'r');
  try {
    readSync(fd, buffer, 0, want, offset);
  } finally {
    closeSync(fd);
  }
  return buffer;
}

/**
 * Parse a RIFF/WAVE header and its chunk chain.
 *
 * Chunks are walked by offset rather than assumed to be `fmt ` then `data`, because RIFF
 * does not order them and a `LIST`/`bext` chunk may sit in between. Duration comes from the
 * real `data` chunk size divided by the byte rate, so it is exact rather than estimated.
 */
export function parseWavHeader(buffer, { fileSize = null, path = null } = {}) {
  if (!buffer || buffer.length < 12) return { ok: false, reason: 'shorter than a RIFF header' };
  if (buffer.toString('latin1', 0, 4) !== 'RIFF' || buffer.toString('latin1', 8, 12) !== 'WAVE') {
    return { ok: false, reason: 'not a RIFF/WAVE file' };
  }
  if (buffer.length < 44) return { ok: false, reason: 'file is too short to hold a fmt chunk' };

  let offset = 12;
  let format = null;
  let dataBytes = null;
  const chunks = [];
  const limit = path && fileSize !== null ? fileSize : buffer.length;

  while (offset + 8 <= limit) {
    const header = path ? readAt(path, offset, 8, fileSize) : buffer.subarray(offset, offset + 8);
    if (header.length < 8) break;
    const id = header.toString('latin1', 0, 4);
    const size = header.readUInt32LE(4);
    chunks.push({ id, size, at: offset });
    if (id === 'fmt ') {
      const body = path ? readAt(path, offset + 8, Math.min(size, 40), fileSize) : buffer.subarray(offset + 8, offset + 8 + size);
      if (body.length < 16) return { ok: false, reason: 'fmt chunk is shorter than 16 bytes' };
      let codec = body.readUInt16LE(0);
      let bitDepth = body.readUInt16LE(14);
      let extra = null;
      if (codec === 0xfffe && body.length >= 26) {
        // WAVE_FORMAT_EXTENSIBLE: the real format tag is the first two bytes of the
        // sub-format GUID.
        extra = { subFormatTag: body.readUInt16LE(24), validBitsPerSample: body.readUInt16LE(18) };
        codec = extra.subFormatTag;
      }
      format = {
        codec,
        codecName: WAVE_FORMAT_TAGS[codec] ?? `unknown (0x${codec.toString(16)})`,
        channels: body.readUInt16LE(2),
        sampleRate: body.readUInt32LE(4),
        byteRate: body.readUInt32LE(8),
        blockAlign: body.readUInt16LE(12),
        bitDepth,
        extensible: extra !== null,
        extra,
      };
    } else if (id === 'data') {
      dataBytes = size;
    }
    // Chunks are word-aligned: an odd size is followed by one pad byte.
    offset += 8 + size + (size % 2);
    if (format && dataBytes !== null) break;
  }

  if (!format) return { ok: false, reason: 'no fmt chunk found' };
  const durationSeconds =
    dataBytes !== null && format.byteRate > 0 ? dataBytes / format.byteRate : null;
  return {
    ok: true,
    container: 'wav',
    format: `${format.codecName} ${format.bitDepth}-bit`,
    ...format,
    dataBytes,
    durationSeconds,
    chunks: chunks.map((chunk) => `${chunk.id}(${chunk.size})`),
    hasAlpha: false,
  };
}

/** Read and parse a WAV file's header plus its chunk chain. */
export function readWavHeader(path) {
  if (!existsSync(path)) return { ok: false, reason: 'file not found', path };
  const stats = statSync(path);
  const probe = readAt(path, 0, Math.min(1024, stats.size), stats.size);
  return { ...parseWavHeader(probe, { fileSize: stats.size, path }), path, size: stats.size, extension: '.wav' };
}

const OGG_CAPTURE = Buffer.from('OggS', 'latin1');
const VORBIS_IDENT = Buffer.from([0x01, 0x76, 0x6f, 0x72, 0x62, 0x69, 0x73], 'latin1'); // \x01vorbis

/**
 * Parse the Ogg page stream far enough to read the Vorbis identification header.
 *
 * Layout: page header (27 bytes + segment table) then the packet. The identification
 * packet is `\x01vorbis` + version(u32) + channels(u8) + sample rate(u32) +
 * bitrate_max(i32) + bitrate_nominal(i32) + bitrate_min(i32) + blocksizes(u8) +
 * framing(u8).
 */
export function parseOggHeader(buffer) {
  if (!buffer || buffer.length < 32) return { ok: false, reason: 'shorter than an Ogg page header' };
  if (buffer.toString('latin1', 0, 4) !== 'OggS') return { ok: false, reason: 'missing OggS capture pattern' };
  const streamVersion = buffer[4];
  const headerType = buffer[5];
  const segmentCount = buffer[26];
  const packetStart = 27 + segmentCount;
  const ident = buffer.indexOf(VORBIS_IDENT, Math.max(0, packetStart - 1));
  if (ident === -1) {
    return {
      ok: false,
      reason: 'no Vorbis identification packet: the file is Ogg but not Vorbis (Opus/FLAC-in-Ogg is not what the install ships)',
      streamVersion,
    };
  }
  if (buffer.length < ident + 30) return { ok: false, reason: 'Vorbis identification packet truncated' };
  const vorbisVersion = buffer.readUInt32LE(ident + 7);
  const channels = buffer[ident + 11];
  const sampleRate = buffer.readUInt32LE(ident + 12);
  const bitrateMax = buffer.readInt32LE(ident + 16);
  const bitrateNominal = buffer.readInt32LE(ident + 20);
  const bitrateMin = buffer.readInt32LE(ident + 24);
  const blockSizes = buffer[ident + 28];
  const framing = buffer[ident + 29];
  return {
    ok: true,
    container: 'ogg',
    format: 'Vorbis',
    streamVersion,
    headerType,
    vorbisVersion,
    channels,
    sampleRate,
    bitrateNominal: bitrateNominal > 0 ? bitrateNominal : null,
    bitrateMin: bitrateMin > 0 ? bitrateMin : null,
    bitrateMax: bitrateMax > 0 ? bitrateMax : null,
    blockSizes: { small: blockSizes & 0x0f, large: (blockSizes >> 4) & 0x0f },
    framingOk: framing === 1,
    bitDepth: null,
    hasAlpha: false,
  };
}

/**
 * Read the granule position of the last Ogg page, which is the total sample count and
 * therefore gives an exact duration. Scans the final 64 KiB backwards for a page whose
 * segment table fits inside the buffer and whose granule is not the `-1` "no packet
 * finishes here" marker.
 */
export function readOggDuration(path, { fileSize = null, sampleRate = null } = {}) {
  const size = fileSize ?? statSync(path).size;
  const window = Math.min(65536, size);
  const tail = readAt(path, size - window, window, size);
  for (let index = tail.length - 27; index >= 0; index -= 1) {
    if (tail.toString('latin1', index, index + 4) !== 'OggS') continue;
    const segmentCount = tail[index + 26];
    if (index + 27 + segmentCount > tail.length) continue;
    const granule = tail.readBigUInt64LE(index + 6);
    if (granule === 0xffffffffffffffffn) continue;
    const samples = Number(granule);
    return {
      granulePosition: samples,
      durationSeconds: sampleRate ? samples / sampleRate : null,
    };
  }
  return { granulePosition: null, durationSeconds: null };
}

/** Read an Ogg/Vorbis file's identification header plus its exact duration. */
export function readOggHeader(path) {
  if (!existsSync(path)) return { ok: false, reason: 'file not found', path };
  const stats = statSync(path);
  const probe = readAt(path, 0, Math.min(65536, stats.size), stats.size);
  const parsed = parseOggHeader(probe);
  if (!parsed.ok) return { ...parsed, path, size: stats.size, extension: '.ogg' };
  const duration = readOggDuration(path, { fileSize: stats.size, sampleRate: parsed.sampleRate });
  return {
    ...parsed,
    ...duration,
    path,
    size: stats.size,
    extension: '.ogg',
    estimatedBitrate:
      duration.durationSeconds && duration.durationSeconds > 0
        ? Math.round((stats.size * 8) / duration.durationSeconds)
        : parsed.bitrateNominal,
  };
}

/**
 * Read either container, dispatching on the signature rather than the extension, and
 * report which registry (sound or music) the container belongs to.
 */
export function readAudioHeader(path) {
  if (!existsSync(path)) return { ok: false, reason: 'file not found', path };
  const stats = statSync(path);
  if (stats.size < 12) return { ok: false, reason: 'file is too short to be audio', path, size: stats.size };
  const head = readAt(path, 0, 12, stats.size);
  const signature = head.toString('latin1', 0, 4);
  if (signature === 'OggS') return readOggHeader(path);
  if (signature === 'RIFF') return readWavHeader(path);
  if (head.toString('latin1', 0, 3) === 'ID3' || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)) {
    return {
      ok: false,
      reason:
        'MPEG audio (MP3) is not a container the engine loads from sound/ or music/: the install ships 6890 .wav under sound/ and 30 .ogg under music/, and the 23 .mp3 files in soundtrack/ belong to the distributable original soundtrack that no .asset file references',
      path,
      size: stats.size,
      container: 'mp3',
    };
  }
  if (signature === 'fLaC') {
    return {
      ok: false,
      reason:
        'FLAC is not a container the engine loads from sound/ or music/: the install ships 6890 .wav under sound/ and 30 .ogg under music/, and the 23 .flac files in soundtrack/ belong to the distributable original soundtrack that no .asset file references',
      path,
      size: stats.size,
      container: 'flac',
    };
  }
  return { ok: false, reason: `unrecognised audio signature \`${signature}\``, path, size: stats.size, container: null };
}

/**
 * Judge a header against what the install ships and against the sample-rate rule the engine
 * logs. `kind` is `sound` or `music`; the two registries take different containers.
 *
 * @returns {{accepted: boolean, warnings: string[], errors: string[]}}
 */
export function judgeAudioFormat(header, { kind = 'sound' } = {}) {
  const warnings = [];
  const errors = [];
  if (!header?.ok) {
    return { accepted: false, supported: false, errors: [header?.reason ?? 'the audio header could not be read'], warnings };
  }

  const wanted = kind === 'music' ? MUSIC_CONTAINERS : SOUND_CONTAINERS;
  if (!wanted.includes(header.extension)) {
    errors.push(
      kind === 'music'
        ? `music/ takes ${MUSIC_CONTAINERS.join('/')} only: all 30 installed music files are .ogg, and music/ contains no .wav`
        : `sound/ takes ${SOUND_CONTAINERS.join('/')} only: all 6890 installed sound files are .wav, and sound/ contains no .ogg`,
    );
  }
  if (header.container === 'wav' && header.codec !== 0x0001) {
    errors.push(
      `WAVE format tag 0x${header.codec.toString(16)} (${header.codecName}); all 6890 installed sounds are uncompressed PCM, so a compressed WAV is unverified`,
    );
  }
  if (header.container === 'wav' && ![16, 24].includes(header.bitDepth)) {
    warnings.push(`${header.bitDepth}-bit WAV: the install ships 6804 16-bit and 86 24-bit files and nothing else`);
  }
  if (header.container === 'ogg' && header.vorbisVersion !== 0) {
    warnings.push(`Vorbis version ${header.vorbisVersion}: all 30 installed tracks are version 0`);
  }
  if (header.container === 'ogg' && header.framingOk === false) {
    warnings.push('the Vorbis identification header is missing its framing bit; the file may be truncated');
  }
  if (header.container === 'ogg' && header.channels !== 2) {
    warnings.push(`${header.channels}-channel music: all 30 installed music tracks are stereo`);
  }

  if (header.sampleRate !== ENGINE_SAMPLE_RATE) {
    const message =
      `${header.sampleRate} Hz: the engine logs ` +
      '`[pdx_audiomusic_sdl.cpp:88]: For best performance and quality music files should be in 44.1kHz` ' +
      'for every file that is not 44100 Hz, and all 30 installed music tracks and all 6890 installed sounds are 44100 Hz';
    if (kind === 'music') errors.push(message);
    else warnings.push(message);
  }
  if (header.durationSeconds !== null && header.durationSeconds !== undefined) {
    if (header.durationSeconds <= 0) errors.push('the file declares no audio frames');
  }

  return {
    accepted: errors.length === 0,
    supported: errors.length === 0 && warnings.length === 0,
    errors,
    warnings,
    summary: describeAudioHeader(header),
  };
}

/** One-line human summary of an audio header, used in tool reports. */
export function describeAudioHeader(header) {
  if (!header?.ok) return `unreadable: ${header?.reason ?? 'unknown'}`;
  const parts = [header.container.toUpperCase(), header.format ?? ''];
  if (header.sampleRate) parts.push(`${header.sampleRate} Hz`);
  if (header.channels) parts.push(`${header.channels}ch`);
  if (header.bitDepth) parts.push(`${header.bitDepth}-bit`);
  if (header.durationSeconds !== null && header.durationSeconds !== undefined) {
    parts.push(formatDuration(header.durationSeconds));
  }
  return parts.filter(Boolean).join(', ');
}

/** `m:ss.mmm`, the way the music player displays a track length. */
export function formatDuration(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return 'unknown';
  const total = Math.round(seconds * 1000);
  const minutes = Math.floor(total / 60000);
  const rest = total % 60000;
  return `${minutes}:${String(Math.floor(rest / 1000)).padStart(2, '0')}.${String(rest % 1000).padStart(3, '0')}`;
}

//------------------------------------------------------------------------------------
// The install's own audio registry, for collision detection.
//------------------------------------------------------------------------------------

function listFilesWithExtension(root, extension) {
  const files = [];
  const walk = (directory) => {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(extension)) files.push(full);
    }
  };
  walk(root);
  return files;
}

const audioIndexCache = new Map();

/**
 * Index every `sound` / `soundeffect` / `category` / `falloff` / `soundgroup` name under
 * `sound/`, every `music` name under `music/`, and every `song` entry under `music/*.txt`.
 *
 * `name = value` and `name = { ... }` are both legal in `.asset` files (vanilla writes
 * `sound =\n{`), which is exactly why this uses the block parser and not a line regex: a
 * regex keyed on `name\s*=\s*\{` misses every `.asset` file whose brace is on the next line.
 *
 * @returns {{sounds: Map, soundeffects: Map, categories: Map, falloffs: Map, soundgroups: Map,
 *            music: Map, songs: Map, stats: object}}
 */
export function indexAudioRoot(root, { refresh = false } = {}) {
  const cached = audioIndexCache.get(root);
  if (cached && !refresh) return cached;

  const maps = {
    sounds: new Map(),
    soundeffects: new Map(),
    categories: new Map(),
    falloffs: new Map(),
    soundgroups: new Map(),
    music: new Map(),
    songs: new Map(),
  };
  const kindToMap = {
    sound: 'sounds',
    soundeffect: 'soundeffects',
    category: 'categories',
    falloff: 'falloffs',
    soundgroup: 'soundgroups',
    music: 'music',
    song: 'songs',
  };

  const recordings = [];
  const record = (kind, name, file, line) => {
    const bag = maps[kindToMap[kind]];
    if (!bag || typeof name !== 'string' || name === '') return;
    if (!bag.has(name)) bag.set(name, { kind, name, file, line });
    recordings.push({ kind, name, file, line });
  };

  const soundRoot = join(root, 'sound');
  const musicRoot = join(root, 'music');
  const assetFiles = [
    ...listFilesWithExtension(soundRoot, '.asset'),
    ...listFilesWithExtension(musicRoot, '.asset'),
  ];
  const songFiles = listFilesWithExtension(musicRoot, '.txt');

  for (const file of assetFiles) {
    const key = relative(root, file).split(sep).join('/');
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const block of parseParadoxBlocks(text)) {
      if (!block.children) continue;
      const kind = block.key.toLowerCase();
      if (!kindToMap[kind]) continue;
      const name = block.children.find((child) => child.key && child.key.toLowerCase() === 'name' && !child.children);
      record(kind, name?.value, key, block.line);
    }
  }
  for (const file of songFiles) {
    const key = relative(root, file).split(sep).join('/');
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const block of parseParadoxBlocks(text)) {
      if (block.key.toLowerCase() !== 'song' || !block.children) continue;
      const name = block.children.find((child) => child.key && child.key.toLowerCase() === 'name' && !child.children);
      record('song', name?.value, key, block.line);
    }
  }

  const index = {
    root,
    ...maps,
    recordings,
    categoryFiles: (() => {
      const byCategory = new Map();
      for (const entry of recordings) {
        if (entry.kind !== 'category') continue;
        if (!byCategory.has(entry.name)) byCategory.set(entry.name, []);
        byCategory.get(entry.name).push(`${entry.file}:${entry.line}`);
      }
      return byCategory;
    })(),
    stats: {
      asset_files: assetFiles.length,
      song_files: songFiles.length,
      sounds: maps.sounds.size,
      soundeffects: maps.soundeffects.size,
      categories: maps.categories.size,
      falloffs: maps.falloffs.size,
      soundgroups: maps.soundgroups.size,
      music: maps.music.size,
      songs: maps.songs.size,
    },
  };
  audioIndexCache.set(root, index);
  return index;
}

export default {
  readAudioHeader,
  readWavHeader,
  readOggHeader,
  parseWavHeader,
  parseOggHeader,
  readOggDuration,
  judgeAudioFormat,
  describeAudioHeader,
  formatDuration,
  indexAudioRoot,
  ENGINE_SAMPLE_RATE,
  SOUND_CONTAINERS,
  MUSIC_CONTAINERS,
};
