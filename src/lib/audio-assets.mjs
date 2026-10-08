//------------------------------------------------------------------------------------
// audio-assets.mjs -- Part of RStellarisScribe
//
// Registering a sound or a music track, and saying what else has to exist before it is heard.
// Everything here comes from `audio.mjs`'s measurements of the verified 4.4.6 install:
//
//   sound/**/*.asset   sound = { name file volume always_load }        sound/sound.asset:3
//   sound/**/*.asset   soundeffect = { name sounds volume ... }        sound/gui/gui_sound_effects.asset:1
//   sound/**/*.asset   category = { name soundeffects }                sound/category.asset:3
//   sound/**/*.asset   falloff = { name min_distance max_distance }    sound/falloff.asset:1
//   music/**/*.asset   music = { name file volume }                    music/maintheme.asset:1
//   music/**/*.txt     song = { name }                                 music/maintheme.txt:1
//   localisation/<lang>/musicplayer_l_<lang>.yml  <name>:0 "Title"     localisation/english/musicplayer_l_english.yml
//
// The single most important measured rule is how `file` resolves. For all 5931 `sound`/`music`
// blocks in the install that carry a `file`, the value was tested against both
// `<registry>/<value>` and `<directory of the .asset file>/<value>`:
//
//   4569 resolve ONLY relative to the directory of the .asset file that declares them
//      0 resolve only relative to sound/ or music/
//   1362 resolve both ways (the .asset sits at the registry root, so the two coincide)
//      0 resolve neither way
//
//   sound/ambient/System VFX/system_vfx.asset:31  file = "sfx_amb_crisis_contingency_01.wav"
//     -> sound/ambient/System VFX/sfx_amb_crisis_contingency_01.wav   (exists)
//     -> sound/sfx_amb_crisis_contingency_01.wav                      (does not exist)
//
// So `file` is relative to the .asset file's own folder, and this module writes the .asset next
// to the audio whenever it can, which makes the two-line registration self-consistent.
//
// This program is free software: you can redistribute it and/or modify it under the terms
// of the GNU Affero General Public License as published by the Free Software Foundation,
// either version 3 of the License, or (at your option) any later version.
//------------------------------------------------------------------------------------

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

import { asciiKey, ENCODING_UTF8_BOM, generatedFile, optionalString, ToolError } from './generation.mjs';
import { renderLocalisationFile } from './localisation.mjs';
import { analyseLocalisationFileName, normaliseLanguage } from './paths.mjs';
import { parseParadoxBlocks } from './paradox.mjs';
import {
  describeAudioHeader,
  indexAudioRoot,
  judgeAudioFormat,
  readAudioHeader,
  ENGINE_SAMPLE_RATE,
} from './audio.mjs';

/**
 * The six mixer groups the install declares. Measured: `sound/**\/*.asset` declares exactly
 * these six `category` names, and none of them is referenced from any of the 177 `.gui` files,
 * so the volume sliders that drive them are hardcoded in the engine rather than scripted. A mod
 * cannot add a seventh slider.
 */
export const SOUND_CATEGORIES = ['Ambient', 'Effects', 'Weapon', 'Menu', 'Ships', 'Voice'];

/** Where each category is declared, as file:line, for the report. */
export const SOUND_CATEGORY_EVIDENCE = {
  Ambient: 'sound/ambient/System VFX/system_vfx.asset:1',
  Effects: 'sound/category.asset:143 and sound/ancient_relics/ancient_relics.asset:1',
  Weapon: 'sound/category.asset:3 and sound/apocalypse/apocalypse.asset:62',
  Menu: 'sound/apocalypse/apocalypse.asset:155',
  Ships: 'sound/biogenesis/weapons/bio_weapons.asset:8',
  Voice: 'sound/category.asset:449',
};

export const AUDIO_KINDS = ['sound', 'music'];

/** `sound/<prefix>/<prefix>_sound.asset`, or next to the audio when its path is known. */
export function defaultSoundAssetPath(prefix, audioRelPath = null) {
  if (audioRelPath && audioRelPath.includes('/')) {
    return `${audioRelPath.slice(0, audioRelPath.lastIndexOf('/'))}/${prefix}_sound.asset`;
  }
  return `sound/${prefix}/${prefix}_sound.asset`;
}

/** `music/<prefix>_music.asset` - vanilla keeps every music .asset at the music/ root. */
export function defaultMusicAssetPath(prefix) {
  return `music/${prefix}_music.asset`;
}

/** `music/<prefix>_songs.txt` - the `song` entry that puts a track in the music player. */
export function defaultMusicSongPath(prefix) {
  return `music/${prefix}_songs.txt`;
}

/** `localisation/<language>/<prefix>_musicplayer_l_<language>.yml`, matching vanilla's own name. */
export function defaultMusicLocalisationPath(prefix, language) {
  return `localisation/${language}/${prefix}_musicplayer_l_${language}.yml`;
}

/** A script-visible registry key from a prefix and an audio file name. */
export function deriveAudioName(prefix, audioFile) {
  const stem = asciiKey(basename(String(audioFile ?? '')).replace(/\.[^.]+$/, ''), { fallback: 'audio' });
  return `${prefix}_${stem}`;
}

/**
 * Work out the mod-root-relative path of the audio file, the same way textures are resolved:
 * an explicit path first, then the file's own location inside the mod, never a guess.
 *
 * @returns {{ok: boolean, path?: string, source?: string, warnings: string[], reason?: string}}
 */
export function resolveAudioRelPath({ audioFile, audioRelPath, outputRoot, kind }) {
  const warnings = [];
  const registry = kind === 'music' ? 'music' : 'sound';
  if (typeof audioRelPath === 'string' && audioRelPath.trim() !== '') {
    const path = audioRelPath.trim().replace(/\\/g, '/').replace(/^\/+/, '');
    if (!path.startsWith(`${registry}/`)) {
      warnings.push(
        `\`${path}\` does not start with \`${registry}/\`. The engine's audio registries live under sound/ and music/ - the install ships 6890 .wav under sound/ ` +
          'and 30 .ogg under music/, with nothing outside those trees.',
      );
    }
    return { ok: true, path, source: 'audio_relpath', warnings };
  }
  if (typeof audioFile !== 'string' || audioFile.trim() === '') {
    return { ok: false, warnings, reason: '`audio_relpath` is required when `audio_file` is not given: the .asset block needs a path to point at' };
  }
  if (typeof outputRoot !== 'string' || outputRoot.trim() === '') {
    return {
      ok: false,
      warnings,
      reason:
        '`audio_relpath` is required: without `output_root` there is no way to know where the audio sits inside the mod. Give the path the engine should use, ' +
        `for example \`${registry}/mymod/${basename(audioFile)}\`.`,
    };
  }
  const root = resolve(outputRoot.trim());
  const absolute = resolve(audioFile.trim());
  const rel = relative(root, absolute);
  if (rel.startsWith('..') || rel.includes(`..${sep}`)) {
    return {
      ok: false,
      warnings,
      reason:
        `the audio \`${absolute}\` is outside output_root \`${root}\`, so its in-mod path cannot be derived - this server does not copy binary files. ` +
        `Copy it into the mod yourself (for example to \`${registry}/mymod/\`) and either point \`audio_file\` at that copy or pass \`audio_relpath\` explicitly.`,
    };
  }
  const path = rel.split(sep).join('/');
  if (!path.startsWith(`${registry}/`)) {
    warnings.push(
      `the audio is at \`${path}\` inside the mod, which is not under \`${registry}/\`. The engine reads sound registrations from sound/ and music/ only, ` +
        'so move it there or pass `audio_relpath` if you know better.',
    );
  }
  return { ok: true, path, source: 'derived-from-output_root', warnings };
}

/** Where the audio must actually be, checked against the mod and the install. */
export function locateAudio({ audioRelPath, outputRoot, gameRoot }) {
  const tried = [];
  for (const [label, root] of [['mod', outputRoot], ['install', gameRoot]]) {
    if (typeof root !== 'string' || root.trim() === '') continue;
    const candidate = join(resolve(root.trim()), ...audioRelPath.split('/'));
    tried.push({ root: label, path: candidate, exists: existsSync(candidate) });
  }
  const found = tried.find((entry) => entry.exists) ?? null;
  return { found, tried, present: found !== null };
}

/** Every collision for a `sound` / `soundeffect` / `music` / `song` name, with file:line. */
export function findAudioCollisions({ name, kind, gameRoot, outputRoot }) {
  const collisions = [];
  const wanted =
    kind === 'music'
      ? [
          ['music', 'music'],
          ['song', 'songs'],
        ]
      : [
          ['sound', 'sounds'],
          ['soundeffect', 'soundeffects'],
        ];
  for (const [scope, root] of [['mod', outputRoot], ['install', gameRoot]]) {
    if (typeof root !== 'string' || root.trim() === '' || !existsSync(root.trim())) continue;
    let index;
    try {
      index = indexAudioRoot(resolve(root.trim()));
    } catch {
      continue;
    }
    for (const [label, bag] of wanted) {
      const found = index[bag]?.get(name);
      if (found) collisions.push({ scope, kind: found.kind, name, file: found.file, line: found.line, registry: label });
    }
  }
  return collisions;
}

/**
 * A `sound`/`music`/`soundeffect` registry key is a bare script identifier: vanilla writes
 * `name = test_interface`, `name = "test_interface"` and `name = falloff_50` all in one tree.
 */
export function analyseAudioName(name) {
  const errors = [];
  const warnings = [];
  const value = typeof name === 'string' ? name.trim() : '';
  if (value === '') {
    errors.push('the registry name is empty');
    return { ok: false, name: value, errors, warnings };
  }
  if (!/^[A-Za-z0-9_]+$/.test(value)) {
    errors.push(
      `\`${value}\` is not a bare identifier. Every one of the install's 5901 \`sound\`, 2897 \`soundeffect\`, 30 \`music\` and 30 \`song\` names matches [A-Za-z0-9_], ` +
        'and script references them unquoted (`sound = <name>`), so anything else cannot be referenced.',
    );
  }
  if (/^[0-9]/.test(value)) {
    warnings.push(`\`${value}\` starts with a digit; no install name does, and a leading digit reads like a literal in script`);
  }
  return { ok: errors.length === 0, name: value, errors, warnings };
}

/** The checklist of things a registered sound or track still needs. */
export function authorTodoForAudio({ kind, name, audioRelPath, audioPresent, category, soundeffectName, title }) {
  const todo = [];
  if (!audioPresent) {
    todo.push(
      `Put the audio file at \`${audioRelPath}\` inside the mod. The \`.asset\` block's \`file\` field resolves relative to that block's own folder, and this server never writes binary files.`,
    );
  }
  if (kind === 'sound') {
    todo.push(
      `Play it from script by its registered name: \`sound = ${name}\` on an alert (common/alerts.txt), a decision, an event, a button effect or a component. ` +
        'The name is a script key, not a localisation key, so nothing displays it.',
    );
    todo.push(
      soundeffectName
        ? `The \`soundeffect\` block \`${soundeffectName}\` is what a .gui element can play (\`clicksound = ${soundeffectName}\`) or what a soundeffect list can reference.`
        : 'Optional: a `soundeffect` block groups several `sound` entries with volume, fade and `max_audible` control, and is the only name a .gui `clicksound =` accepts. Pass `soundeffect_name` to have one generated.',
    );
    if (!category) {
      todo.push(
        'No mixer category was attached, so the sound follows the master volume and none of the six category sliders controls it. ' +
          `Pass \`category\` as one of ${SOUND_CATEGORIES.join(', ')} to add it to a group. There is no seventh slider: none of the 177 .gui files mentions a category name.`,
      );
    }
  } else {
    todo.push(`The \`song = { name = ${name} }\` entry is what puts the track in the in-game music player; the \`music\` block alone only makes it available.`);
    todo.push(
      title
        ? `The visible track title comes from the localisation key \`${name}\`; the file written here must stay UTF-8 with BOM or the music player shows the raw key.`
        : `Give the localisation key \`${name}\` a value in a UTF-8-with-BOM \`localisation/<lang>/<stem>_l_<lang>.yml\`, or the music player lists the raw key. Vanilla keeps these in \`localisation/<lang>/musicplayer_l_<lang>.yml\`.`,
    );
    todo.push('A mod cannot add a new mixer group: music has one slider, declared by the engine.');
  }
  todo.push(
    'Verify in game: a wrong `file` path or a rejected container is logged in `logs/error.log`, not raised as a crash, and a sample rate other than 44100 Hz is reported by `pdx_audiomusic_sdl.cpp:88`.',
  );
  return todo;
}

/** Render `soundeffect = { name sounds { sound ... } ... }`. */
function renderSoundEffectBlock({ name, soundName, fields }) {
  const lines = ['soundeffect = {', `\tname = ${name}`, '\tsounds = {', `\t\tsound = ${soundName}`, '\t}'];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === '') continue;
    lines.push(`\t${key} = ${typeof value === 'boolean' ? (value ? 'yes' : 'no') : value}`);
  }
  lines.push('}');
  return lines.join('\n');
}

/**
 * Analyse one audio registration without writing anything. Used by `register_audio_asset` as its
 * dry run and by `validate_audio_asset` as its report.
 *
 * @returns {{ok: boolean, kind: string, name: string, audio: object|null, files: Array,
 *            collisions: Array, author_todo: string[], errors: string[], warnings: string[], messages: string[]}}
 */
export function analyseAudioRegistration(args = {}) {
  const errors = [];
  const warnings = [];
  const messages = [];

  const kind = optionalString(args.kind) ?? 'sound';
  if (!AUDIO_KINDS.includes(kind)) {
    throw new ToolError(`\`kind\` must be one of ${AUDIO_KINDS.join(', ')}, received \`${kind}\``);
  }
  const prefixInput = optionalString(args.prefix);
  if (!prefixInput) {
    throw new ToolError('`prefix` is required: it names the generated .asset file and the default registry key');
  }
  const prefix = asciiKey(prefixInput, { fallback: 'mymod' });
  const outputRoot = optionalString(args.output_root);
  const gameRoot = optionalString(args.game_root);
  const audioFile = optionalString(args.audio_file);

  if (!gameRoot) {
    warnings.push(
      "No `game_root` was given, so the install's own sound/music registry was not consulted: a name vanilla already defines cannot be reported.",
    );
  } else if (!existsSync(gameRoot)) {
    warnings.push(`\`game_root\` \`${gameRoot}\` does not exist; vanilla collisions were not checked`);
  }

  // ---- the audio file and its real header
  let audio = null;
  if (!audioFile) {
    errors.push('`audio_file` is required: this tool reads the real header of the audio it registers');
  } else if (!existsSync(audioFile)) {
    errors.push(`\`audio_file\` \`${audioFile}\` does not exist`);
  } else {
    const header = readAudioHeader(audioFile);
    const verdict = judgeAudioFormat(header, { kind });
    if (!header.ok) {
      errors.push(header.reason);
      audio = { path: header.path, error: header.reason };
    } else {
      errors.push(...verdict.errors);
      warnings.push(...verdict.warnings);
      audio = {
        path: header.path,
        size: header.size,
        container: header.container,
        codec: header.codecName ?? header.format,
        sample_rate: header.sampleRate,
        sample_rate_ok: header.sampleRate === ENGINE_SAMPLE_RATE,
        required_sample_rate: ENGINE_SAMPLE_RATE,
        channels: header.channels,
        bit_depth: header.bitDepth ?? null,
        duration_seconds: header.durationSeconds ?? null,
        bitrate: header.estimatedBitrate ?? header.bitrateNominal ?? null,
        header_summary: describeAudioHeader(header),
        engine_accepted: verdict.accepted,
        engine_supported: verdict.supported,
      };
    }
  }

  // ---- where the audio has to live, and where the .asset block will point
  const audioRel = resolveAudioRelPath({ audioFile, audioRelPath: args.audio_relpath, outputRoot, kind });
  if (!audioRel.ok) errors.push(audioRel.reason);
  warnings.push(...audioRel.warnings);

  const name = optionalString(args.name) ?? deriveAudioName(prefix, audioFile ?? prefix);
  const nameAnalysis = analyseAudioName(name);
  errors.push(...nameAnalysis.errors);
  warnings.push(...nameAnalysis.warnings);

  const registry = kind === 'music' ? 'music' : 'sound';
  const assetFile =
    optionalString(args.asset_file)?.replace(/\\/g, '/') ??
    (kind === 'music' ? defaultMusicAssetPath(prefix) : defaultSoundAssetPath(prefix, audioRel.ok ? audioRel.path : null));
  if (!assetFile.startsWith(`${registry}/`)) {
    errors.push(
      `\`asset_file\` must be under \`${registry}/\`; \`${assetFile}\` is not. The engine reads those registries from \`${registry}/**/*.asset\` - the install has ` +
        `${kind === 'music' ? '7 music .asset files holding 30 tracks' : '114 sound .asset files holding 5901 sounds'} and nothing else.`,
    );
  }
  if (!assetFile.toLowerCase().endsWith('.asset')) {
    errors.push(`\`asset_file\` must end in .asset; \`${assetFile}\` does not, so the engine never reads it`);
  }

  // `file` resolves relative to the .asset file's own folder (measured: 4569 of 5931 blocks
  // resolve only that way). Deriving it from the audio path keeps the pair consistent.
  const assetDirectory = assetFile.includes('/') ? assetFile.slice(0, assetFile.lastIndexOf('/')) : '';
  let fileValue = optionalString(args.file_value);
  if (!fileValue) {
    if (audioRel.ok) {
      const insideAssetDirectory = assetDirectory !== '' && audioRel.path.startsWith(`${assetDirectory}/`);
      fileValue = insideAssetDirectory ? audioRel.path.slice(assetDirectory.length + 1) : audioRel.path;
      if (!insideAssetDirectory) {
        warnings.push(
          `\`file\` is resolved relative to the .asset file's own folder, so \`${assetFile}\` with \`file = "${fileValue}"\` means ` +
            `\`${assetDirectory ? `${assetDirectory}/` : ''}${fileValue}\`, not \`${audioRel.path}\`. Either drop \`asset_file\` to get the default next to the audio, or place the audio under \`${assetDirectory}/\`.`,
        );
      }
    } else {
      fileValue = basename(audioFile ?? `${prefix}.${kind === 'music' ? 'ogg' : 'wav'}`);
    }
  }
  const resolvesTo = `${assetDirectory ? `${assetDirectory}/` : ''}${fileValue}`;

  // ---- collisions
  const collisions = findAudioCollisions({ name, kind, gameRoot, outputRoot });
  for (const collision of collisions) {
    errors.push(
      `\`${name}\` is already declared as a ${collision.kind} in the ${collision.scope} at ${collision.file}:${collision.line}. ` +
        (collision.kind === 'song'
          ? 'A duplicate `song` entry lists the track twice in the music player.'
          : 'Registry lookups are by name, so one of the two definitions wins depending on load order.'),
    );
  }

  // ---- category (sound only)
  let category = optionalString(args.category);
  if (kind === 'music' && category) {
    errors.push('`category` applies to sounds; music has a single mixer group and takes no category');
    category = null;
  }
  if (category && !SOUND_CATEGORIES.includes(category)) {
    errors.push(`\`category\` must be one of ${SOUND_CATEGORIES.join(', ')}; the install declares exactly those six and the engine has no seventh volume slider`);
  } else if (category) {
    warnings.push(
      `Adding to \`${category}\`: the install declares that same category name in more than one file (${SOUND_CATEGORY_EVIDENCE[category]}), which is evidence the engine ` +
        'unions the `soundeffects` lists rather than replacing the block. That inference was not verified live, so check logs/error.log after loading: if the block replaces ' +
        'instead, the vanilla list for that mixer group is lost whenever this mod loads after it.',
    );
  }

  const soundeffectName = optionalString(args.soundeffect_name);
  const title = optionalString(args.title);

  // ---- the file plan
  const files = [];
  if (errors.length === 0) {
    const header = [
      `# ${assetFile}`,
      '# Generated by RStellarisScribe. UTF-8 without BOM: a .asset file is script, and the BOM rule is localisation-only.',
      `# \`file\` is relative to THIS file's folder, so it resolves to \`${resolvesTo}\` (measured on all 5931 install blocks).`,
    ].join('\n');

    if (kind === 'sound') {
      const volume = args.volume;
      const lines = ['sound = {', `\tname = ${name}`, `\tfile = "${fileValue}"`];
      if (volume !== undefined && volume !== null) lines.push(`\tvolume = ${Number(volume)}`);
      if (args.always_load !== undefined && args.always_load !== null) lines.push(`\talways_load = ${args.always_load ? 'yes' : 'no'}`);
      if (args.priority !== undefined && args.priority !== null) lines.push(`\tpriority = ${Number(args.priority)}`);
      if (optionalString(args.falloff)) lines.push(`\tfalloff = ${optionalString(args.falloff)}`);
      lines.push('}');
      const parts = [lines.join('\n')];

      if (soundeffectName) {
        parts.push(
          renderSoundEffectBlock({
            name: soundeffectName,
            soundName: name,
            fields: {
              volume: args.soundeffect_volume ?? volume ?? 0.5,
              max_audible: args.max_audible ?? 1,
              max_audible_behaviour: optionalString(args.max_audible_behaviour) ?? 'fail',
              ...(args.loop ? { loop: true } : {}),
              ...(args.is3d ? { is3d: true } : {}),
              ...(optionalString(args.falloff) ? { falloff: optionalString(args.falloff) } : {}),
              ...(args.fade_in !== undefined && args.fade_in !== null ? { fade_in: args.fade_in } : {}),
              ...(args.fade_out !== undefined && args.fade_out !== null ? { fade_out: args.fade_out } : {}),
            },
          }),
        );
      }
      if (category) {
        parts.push(`category = {\n\tname = ${category}\n\tsoundeffects = {\n\t\t${soundeffectName ?? name}\n\t}\n}`);
      }

      files.push(
        generatedFile(assetFile, `${header}\n\n${parts.join('\n\n')}\n`, {
          encoding: 'utf-8',
          summary: `sound "${name}"${soundeffectName ? ` + soundeffect "${soundeffectName}"` : ''}${category ? ` in category ${category}` : ''}`,
        }),
      );
    } else {
      const volume = args.volume;
      const musicLines = ['music = {', `\tname = ${name}`, `\tfile = "${fileValue}"`];
      if (volume !== undefined && volume !== null) musicLines.push(`\tvolume = ${Number(volume)}`);
      musicLines.push('}');
      files.push(
        generatedFile(assetFile, `${header}\n\n${musicLines.join('\n')}\n`, { encoding: 'utf-8', summary: `music "${name}"` }),
      );

      const songFile = optionalString(args.song_file)?.replace(/\\/g, '/') ?? defaultMusicSongPath(prefix);
      if (!songFile.startsWith('music/') || !songFile.toLowerCase().endsWith('.txt')) {
        errors.push(`\`song_file\` must be a .txt file under \`music/\`; \`${songFile}\` is not. Vanilla keeps the 30 song entries in music/*.txt.`);
      } else {
        files.push(
          generatedFile(
            songFile,
            `# ${songFile}\n# The song entry is what puts the track in the in-game music player; the music block alone is not enough.\n\nsong = {\n\tname = ${name}\n}\n`,
            { encoding: 'utf-8', summary: `song entry for "${name}"` },
          ),
        );
      }

      if (args.generate_localisation !== false) {
        const language = normaliseLanguage(args.language ?? 'english');
        const locFile = optionalString(args.localisation_file)?.replace(/\\/g, '/') ?? defaultMusicLocalisationPath(prefix, language);
        const locAnalysis = analyseLocalisationFileName(locFile.split('/').pop());
        if (!locAnalysis.ok) {
          errors.push(`\`localisation_file\`: ${locAnalysis.reason}`);
        } else {
          files.push(
            generatedFile(
              locFile,
              renderLocalisationFile({
                language,
                entries: [{ key: name, value: title ?? name, comment: 'music player track title' }],
              }),
              { encoding: ENCODING_UTF8_BOM, summary: `track title for "${name}"` },
            ),
          );
        }
      }
    }
  } else {
    messages.push('no file plan was produced because the request has errors; fix them and call again');
  }

  const audioPresent = audioRel.ok ? locateAudio({ audioRelPath: audioRel.path, outputRoot, gameRoot }).present : null;

  if (errors.length === 0) {
    messages.push(
      kind === 'sound'
        ? `\`file\` is written as \`${fileValue}\`, which the engine resolves to \`${resolvesTo}\` because it is relative to the .asset file's own folder.`
        : `registration is ${files.length} file(s): the music block, the song entry and the localisation key${title ? '' : ' (whose placeholder value is the key itself)'}`,
    );
    for (const file of files) {
      if (outputRoot && existsSync(join(resolve(outputRoot), ...file.path.split('/')))) {
        messages.push(`\`${file.path}\` already exists in the mod and this plan replaces it`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    kind,
    name,
    prefix,
    registry,
    asset_file: assetFile,
    file_value: fileValue,
    resolves_to: resolvesTo,
    audio_relpath: audioRel.ok ? audioRel.path : null,
    audio_relpath_source: audioRel.source ?? null,
    audio_present: audioPresent,
    sample_rate_ok: audio?.sample_rate === ENGINE_SAMPLE_RATE,
    audio,
    category: category ?? null,
    soundeffect_name: soundeffectName ?? null,
    collisions,
    files,
    author_todo: authorTodoForAudio({
      kind,
      name,
      audioRelPath: audioRel.ok ? audioRel.path : '(unknown)',
      audioPresent: audioPresent === true,
      category: category ?? null,
      soundeffectName,
      title,
    }),
    errors,
    warnings,
    messages,
  };
}

/**
 * Whole-mod audio check: does every `sound`/`music` entry in the mod resolve to a file that
 * exists, and does any name shadow a vanilla one?
 */
export function auditModAudio({ workspaceRoot, gameRoot }) {
  const findings = [];
  const push = (severity, code, file, line, message) => findings.push({ severity, code, file, line, message });
  const root = resolve(workspaceRoot);
  const index = indexAudioRoot(root, { refresh: true });
  const vanilla = gameRoot && existsSync(gameRoot) ? indexAudioRoot(resolve(gameRoot)) : null;

  const vanillaBagFor = (kind) => (kind === 'song' ? vanilla?.songs : kind === 'music' ? vanilla?.music : vanilla?.sounds);
  if (vanilla) {
    for (const record of index.recordings) {
      if (record.kind === 'song' || record.kind === 'soundgroup' || record.kind === 'falloff' || record.kind === 'category') continue;
      const other = vanillaBagFor(record.kind)?.get(record.name);
      if (other) {
        push(
          'warning',
          'duplicate-vanilla-audio-name',
          record.file,
          record.line,
          `\`${record.name}\` is also declared as a ${record.kind} in the install at ${other.file}:${other.line}; one of the two wins depending on load order.`,
        );
      }
    }
  }

  // Every `sound`/`music` block with a `file` must resolve relative to its own .asset folder.
  const assetFiles = [];
  for (const registry of ['sound', 'music']) {
    const base = join(root, registry);
    if (!existsSync(base)) continue;
    const walk = (directory) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const full = join(directory, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && entry.name.toLowerCase().endsWith('.asset')) assetFiles.push(full);
      }
    };
    walk(base);
  }
  for (const file of assetFiles) {
    const key = relative(root, file).split(sep).join('/');
    let text;
    try {
      text = statSync(file).size === 0 ? '' : readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const block of parseParadoxBlocks(text)) {
      const kind = block.key.toLowerCase();
      if (kind !== 'sound' && kind !== 'music') continue;
      const fileEntry = (block.children ?? []).find((child) => child.key && child.key.toLowerCase() === 'file' && !child.children);
      if (!fileEntry) {
        push('warning', 'audio-block-without-file', key, block.line, `this ${kind} block has no \`file\`, so the engine has nothing to load`);
        continue;
      }
      const value = String(fileEntry.value).replace(/\\/g, '/');
      const candidate = join(dirname(file), ...value.split('/'));
      if (!existsSync(candidate)) {
        push(
          'error',
          'audio-file-missing',
          key,
          block.line,
          `\`file = "${value}"\` resolves to \`${candidate}\` - relative to this .asset file's own folder, as measured on all 5931 install blocks - and no such file exists.`,
        );
      }
    }
  }

  return {
    stats: index.stats,
    categories: Object.fromEntries([...index.categoryFiles.entries()].map(([name, files]) => [name, files.length])),
    vanilla_indexed: Boolean(vanilla),
    findings,
    error_count: findings.filter((finding) => finding.severity === 'error').length,
    warning_count: findings.filter((finding) => finding.severity === 'warning').length,
  };
}

export { basename };
