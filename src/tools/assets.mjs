//------------------------------------------------------------------------------------
// assets.mjs -- Part of RStellarisScribe
//
// The four asset-registration tools. They are thin: all the measured knowledge lives in
// `lib/gfx-kinds.mjs`, `lib/texture.mjs`, `lib/image-assets.mjs`, `lib/audio.mjs` and
// `lib/audio-assets.mjs`. What these handlers add is the plugin's own contract:
//
//   * a write tool defaults to `dry_run = true` and funnels its plan through `finishGeneration`,
//     so a dry run and a real write reject exactly the same paths;
//   * a bad argument is a `ToolError`, which the MCP layer maps to JSON-RPC `invalid_params`;
//   * a validator never throws for content problems: it returns a report with a `verdict`, the
//     same shape `validate_stellaris_project` uses.
//
// This program is free software: you can redistribute it and/or modify it under the terms
// of the GNU Affero General Public License as published by the Free Software Foundation,
// either version 3 of the License, or (at your option) any later version.
//------------------------------------------------------------------------------------

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { finishGeneration, optionalString, ToolError } from '../lib/generation.mjs';
import { analyseImageRegistration, auditModSprites } from '../lib/image-assets.mjs';
import { analyseAudioRegistration, auditModAudio } from '../lib/audio-assets.mjs';

/** `green` / `warnings` / `errors`, matching `validate_stellaris_project`'s verdict values. */
function verdictFor(errors, warnings) {
  if (errors > 0) return 'errors';
  return warnings > 0 ? 'warnings' : 'green';
}

/** Collect the per-sprite author checklists into one de-duplicated list. */
function collectTodo(entries) {
  const seen = new Set();
  const out = [];
  for (const entry of entries) {
    for (const item of entry.author_todo ?? []) {
      if (seen.has(item)) continue;
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

/** register_image_asset */
export function registerImageAsset(args = {}) {
  const analysis = analyseImageRegistration(args);
  if (!analysis.ok) {
    throw new ToolError(
      `the image registration has ${analysis.errors.length} problem(s), so nothing was planned:\n- ${analysis.errors.join('\n- ')}`,
    );
  }
  const plan = finishGeneration({
    dryRun: args.dry_run !== false,
    outputRoot: optionalString(args.output_root),
    files: analysis.files,
    messages: [...analysis.messages],
  });

  const measured = analysis.sprites.map((sprite) => ({
    sprite_name: sprite.sprite_name,
    kind: sprite.kind,
    use: sprite.use,
    texture_relpath: sprite.texture_relpath,
    texture: sprite.texture,
    texture_present: sprite.texture_present,
  }));

  return {
    ...plan,
    verdict: verdictFor(0, analysis.warnings.length),
    gfx_file: analysis.gfx_file,
    prefix: analysis.prefix,
    sprites: analysis.sprites,
    measured,
    collisions: analysis.collisions,
    warnings: analysis.warnings,
    author_todo: collectTodo(analysis.sprites),
    messages: plan.messages,
  };
}

/** validate_image_asset */
export function validateImageAsset(args = {}) {
  const errors = [];
  const warnings = [];
  const messages = [];

  let registration = null;
  if (Array.isArray(args.sprites) && args.sprites.length > 0) {
    registration = analyseImageRegistration(args);
    errors.push(...registration.errors);
    warnings.push(...registration.warnings);
    messages.push(...registration.messages);
  } else {
    messages.push(
      'No `sprites` array was given, so only the whole-mod audit ran. Pass `prefix`/`gfx_file` and `sprites: [...]` to validate a registration before writing it, including against the install\'s own sprite index.',
    );
  }

  let audit = null;
  const workspaceRoot = optionalString(args.workspace_root);
  if (workspaceRoot) {
    if (!existsSync(workspaceRoot)) {
      throw new ToolError(`\`workspace_root\` \`${workspaceRoot}\` does not exist`);
    }
    audit = auditModSprites({ workspaceRoot: resolve(workspaceRoot), gameRoot: optionalString(args.game_root) });
    messages.push(
      `Audited ${audit.gfx_files} .gfx file(s) holding ${audit.sprites} sprite name(s) and ${audit.fonts} font name(s) in the mod; ` +
        `${audit.error_count} error(s) and ${audit.warning_count} warning(s).`,
    );
    if (!audit.vanilla_indexed) {
      messages.push('Pass `game_root` as well to have sprites the base game already defines accepted instead of reported.');
    }
  }
  if (!workspaceRoot && !registration) {
    throw new ToolError(
      'nothing to validate: pass `workspace_root` to audit a whole mod, or `prefix`/`gfx_file` plus `sprites: [...]` to check a registration before writing it',
    );
  }

  const totalErrors = errors.length + (audit?.error_count ?? 0);
  const totalWarnings = warnings.length + (audit?.warning_count ?? 0);

  return {
    verdict: verdictFor(totalErrors, totalWarnings),
    ok: totalErrors === 0,
    workspace_root: workspaceRoot ?? null,
    game_root: optionalString(args.game_root),
    registration: registration
      ? {
          gfx_file: registration.gfx_file,
          prefix: registration.prefix,
          sprites: registration.sprites,
          collisions: registration.collisions,
          files: registration.files.map((file) => ({ path: file.path, encoding: file.encoding, summary: file.summary })),
          author_todo: collectTodo(registration.sprites),
        }
      : null,
    audit,
    errors,
    warnings,
    error_count: totalErrors,
    warning_count: totalWarnings,
    author_todo: registration ? collectTodo(registration.sprites) : [],
    messages,
  };
}

/** register_audio_asset */
export function registerAudioAsset(args = {}) {
  const analysis = analyseAudioRegistration(args);
  if (!analysis.ok) {
    throw new ToolError(
      `the audio registration has ${analysis.errors.length} problem(s), so nothing was planned:\n- ${analysis.errors.join('\n- ')}`,
    );
  }
  const plan = finishGeneration({
    dryRun: args.dry_run !== false,
    outputRoot: optionalString(args.output_root),
    files: analysis.files,
    messages: [...analysis.messages],
  });

  return {
    ...plan,
    verdict: verdictFor(0, analysis.warnings.length),
    kind: analysis.kind,
    name: analysis.name,
    registry: analysis.registry,
    asset_file: analysis.asset_file,
    file_value: analysis.file_value,
    resolves_to: analysis.resolves_to,
    audio_relpath: analysis.audio_relpath,
    audio_present: analysis.audio_present,
    sample_rate_ok: analysis.sample_rate_ok,
    measured: analysis.audio,
    category: analysis.category,
    soundeffect_name: analysis.soundeffect_name,
    collisions: analysis.collisions,
    warnings: analysis.warnings,
    author_todo: analysis.author_todo,
    messages: plan.messages,
  };
}

/** validate_audio_asset */
export function validateAudioAsset(args = {}) {
  const errors = [];
  const warnings = [];
  const messages = [];

  let registration = null;
  if (optionalString(args.audio_file)) {
    registration = analyseAudioRegistration(args);
    errors.push(...registration.errors);
    warnings.push(...registration.warnings);
    messages.push(...registration.messages);
  } else {
    messages.push(
      'No `audio_file` was given, so only the whole-mod audit ran. Pass `kind`/`prefix`/`audio_file` to validate a registration before writing it, including against the install\'s own sound and music registries.',
    );
  }

  let audit = null;
  const workspaceRoot = optionalString(args.workspace_root);
  if (workspaceRoot) {
    if (!existsSync(workspaceRoot)) {
      throw new ToolError(`\`workspace_root\` \`${workspaceRoot}\` does not exist`);
    }
    audit = auditModAudio({ workspaceRoot: resolve(workspaceRoot), gameRoot: optionalString(args.game_root) });
    messages.push(
      `Audited the mod's ${audit.stats.asset_files} .asset file(s): ${audit.stats.sounds} sound, ${audit.stats.soundeffects} soundeffect and ${audit.stats.music} music ` +
        `registration(s); ${audit.error_count} error(s) and ${audit.warning_count} warning(s).`,
    );
  }
  if (!workspaceRoot && !registration) {
    throw new ToolError(
      'nothing to validate: pass `workspace_root` to audit a whole mod, or `kind`/`prefix`/`audio_file` to check a registration before writing it',
    );
  }

  const totalErrors = errors.length + (audit?.error_count ?? 0);
  const totalWarnings = warnings.length + (audit?.warning_count ?? 0);

  return {
    verdict: verdictFor(totalErrors, totalWarnings),
    ok: totalErrors === 0,
    workspace_root: workspaceRoot ?? null,
    game_root: optionalString(args.game_root),
    registration: registration
      ? {
          kind: registration.kind,
          name: registration.name,
          asset_file: registration.asset_file,
          file_value: registration.file_value,
          resolves_to: registration.resolves_to,
          audio_relpath: registration.audio_relpath,
          audio_present: registration.audio_present,
          sample_rate_ok: registration.sample_rate_ok,
          category: registration.category,
          collisions: registration.collisions,
          files: registration.files.map((file) => ({ path: file.path, encoding: file.encoding, summary: file.summary })),
          author_todo: registration.author_todo,
        }
      : null,
    audit,
    errors,
    warnings,
    error_count: totalErrors,
    warning_count: totalWarnings,
    author_todo: registration?.author_todo ?? [],
    messages,
  };
}
