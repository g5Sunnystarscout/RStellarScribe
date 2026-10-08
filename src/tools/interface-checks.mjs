//------------------------------------------------------------------------------------
// interface-checks.mjs -- Part of RStellarisScribe
//
// Validates a mod's interface layer against what the engine can actually resolve. Written from
// the mistakes made while hand-authoring the aerospace carrier's bridge window and its override
// of the fleet view:
//
//   * the root of a .gui file must be `guiTypes = { }` - a bare containerWindowType at the top
//     level is a parse error, and nothing documents that
//   * an `effectbuttonType`'s `effect` must name a real common/button_effects/ key
//   * an event's `custom_gui` / `custom_gui_option` must name a real containerWindowType
//   * every `spriteType` / `quadTextureSprite` must name a real sprite, or the game logs
//     `Trying to change sprite to unknown sprite '<name>'`
//   * shipping a file whose path also exists in vanilla replaces it wholesale (the fleet view
//     override), which is version-fragile and conflicts with any other mod doing the same
//
// This program is free software: you can redistribute it and/or modify it under the terms of
// the GNU Affero General Public License as published by the Free Software Foundation, either
// version 3 of the License, or (at your option) any later version.
//------------------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

import {
  collectBlockNames,
  collectEffectButtons,
  collectSpriteReferences,
  guiRootKeyword,
  indexInterfaceRoot,
} from '../lib/interface-index.mjs';
import { optionalString, requireString } from '../lib/generation.mjs';
import { tokenize } from '../lib/paradox.mjs';
import { openWorkspace } from '../lib/workspace.mjs';

/** Collect `custom_gui` / `custom_gui_option` references from an event file. */
function collectCustomGuiReferences(text) {
  const references = [];
  const tokens = tokenize(text);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type !== 'word') continue;
    if (token.value !== 'custom_gui' && token.value !== 'custom_gui_option') continue;
    const operator = tokens[index + 1];
    const value = tokens[index + 2];
    if (!operator || operator.value !== '=') continue;
    if (!value || (value.type !== 'word' && value.type !== 'string')) continue;
    references.push({ key: token.value, name: value.value, line: token.line });
  }
  return references;
}

export function validateStellarisInterface(args = {}) {
  const workspaceRoot = requireString(args.workspace_root ?? args.root, 'workspace_root');
  const workspace = openWorkspace(workspaceRoot);
  const gameRoot = optionalString(args.game_root);

  const modIndex = indexInterfaceRoot(workspaceRoot);
  const vanillaIndex = gameRoot ? indexInterfaceRoot(gameRoot) : null;

  const knownContainers = new Set(modIndex.containers);
  const knownSprites = new Set(modIndex.sprites);
  const knownButtonEffects = new Set(modIndex.buttonEffects);
  if (vanillaIndex) {
    for (const name of vanillaIndex.containers) knownContainers.add(name);
    for (const name of vanillaIndex.sprites) knownSprites.add(name);
    for (const name of vanillaIndex.buttonEffects) knownButtonEffects.add(name);
  }

  const findings = [];
  const push = (severity, code, file, line, message) =>
    findings.push({ severity, code, file, line, message });

  let guiFilesChecked = 0;

  // ---- .gui files ---------------------------------------------------------------------
  for (const [path] of modIndex.guiFiles) {
    const absolute = `${workspaceRoot.replace(/\\/g, '/')}/${path}`;
    let text;
    try {
      text = readFileSync(absolute, 'utf8');
    } catch {
      continue;
    }
    guiFilesChecked += 1;

    const root = guiRootKeyword(text);
    if (root.toLowerCase() !== 'guitypes') {
      push(
        'error',
        'gui-root-not-guitypes',
        path,
        1,
        `A .gui file's root must be \`guiTypes = { ... }\`, but this one starts with \`${root}\`. A bare \`containerWindowType\` at the top level fails to parse. (All 177 vanilla .gui files use this root; one spells it \`guitypes\`, so the keyword is compared case-insensitively.)`,
      );
    }

    for (const button of collectEffectButtons(text)) {
      if (!button.effect) {
        push(
          'warning',
          'effectbutton-without-effect',
          path,
          button.line,
          `\`effectbuttonType\` ${button.name ? `"${button.name}" ` : ''}has no \`effect =\` field, so clicking it does nothing. Point it at a key in common/button_effects/.`,
        );
        continue;
      }
      if (!knownButtonEffects.has(button.effect)) {
        push(
          'error',
          'unknown-button-effect',
          path,
          button.line,
          `\`effect = ${button.effect}\` does not match any key in common/button_effects/ (checked this mod${vanillaIndex ? ' and the base game' : ''}). Known keys: ${[...knownButtonEffects].slice(0, 6).join(', ') || '(none)'}.`,
        );
      }
    }

    for (const reference of collectSpriteReferences(text)) {
      if (reference.name === '' || !reference.name.startsWith('GFX_')) continue;
      if (!knownSprites.has(reference.name)) {
        push(
          'error',
          'unknown-sprite',
          path,
          reference.line,
          `\`${reference.kind} = ${reference.name}\` is not defined in any interface/*.gfx${vanillaIndex ? ' here or in the base game' : ''}; the game logs \`Trying to change sprite to unknown sprite '${reference.name}'\` and draws nothing.`,
        );
      }
    }

    if (vanillaIndex && vanillaIndex.guiFiles.has(path)) {
      push(
        'warning',
        'vanilla-file-override',
        path,
        1,
        'This file has the same path as a base-game .gui file, so it replaces it wholesale. That means re-copying the vanilla file after every game patch, and it conflicts with any other mod that overrides the same file (only one can win). Prefer a hand-written window referenced by `custom_gui` when you can.',
      );
    }
  }

  // ---- `custom_gui` references in events -------------------------------------------------
  for (const file of workspace.files) {
    if (!file.path.startsWith('events/') || !file.path.endsWith('.txt')) continue;
    let text;
    try {
      text = readFileSync(file.absolute, 'utf8');
    } catch {
      continue;
    }
    for (const reference of collectCustomGuiReferences(text)) {
      if (knownContainers.has(reference.name)) continue;
      push(
        'error',
        'unknown-custom-gui',
        file.path,
        reference.line,
        `\`${reference.key} = ${reference.name}\` does not name any \`containerWindowType\` defined in interface/*.gui${vanillaIndex ? ' here or in the base game' : ''}. The event will not find its window.`,
      );
    }
  }

  // ---- container names that shadow a vanilla window ---------------------------------------
  if (vanillaIndex) {
    // Containers defined by a file that replaces a vanilla file already produced the
    // vanilla-file-override warning above; do not repeat it once per container.
    const overriddenFiles = new Set(
      [...modIndex.guiFiles.keys()].filter((path) => vanillaIndex.guiFiles.has(path)),
    );
    const containersFromOverrides = new Set();
    for (const path of overriddenFiles) {
      let text;
      try {
        text = readFileSync(`${workspaceRoot.replace(/\\/g, '/')}/${path}`, 'utf8');
      } catch {
        continue;
      }
      for (const name of collectBlockNames(text, ['containerWindowType', 'windowType'])) {
        containersFromOverrides.add(name);
      }
    }
    for (const name of modIndex.containers) {
      if (containersFromOverrides.has(name)) continue;
      if (!vanillaIndex.containers.has(name)) continue;
      push(
        'warning',
        'duplicate-container-name',
        '(mod interface)',
        0,
        `\`${name}\` is also defined by the base game. Interface lookups are by name, so a duplicate can shadow (or be shadowed by) the vanilla window depending on load order; rename yours unless the shadowing is intended.`,
      );
    }
  }

  const byCode = {};
  for (const finding of findings) byCode[finding.code] = (byCode[finding.code] ?? 0) + 1;
  const errorCount = findings.filter((finding) => finding.severity === 'error').length;
  const warningCount = findings.length - errorCount;

  const messages = [
    `Indexed ${modIndex.guiFiles.size} mod .gui file(s); ${modIndex.containers.size} container name(s) and ${modIndex.sprites.size} sprite name(s) come from this mod.`,
  ];
  if (vanillaIndex) {
    messages.push(
      `Base game index: ${vanillaIndex.guiFiles.size} .gui files, ${vanillaIndex.containers.size} container names, ${vanillaIndex.sprites.size} sprite names, ${vanillaIndex.buttonEffects.size} button effect key(s).`,
    );
  } else {
    messages.push(
      'No `game_root` was given, so sprite and container names from the base game could not be accepted - expect false positives for anything vanilla-defined.',
    );
  }
  messages.push(
    findings.length === 0
      ? 'No interface problems found.'
      : `${findings.length} finding(s): ${Object.entries(byCode)
          .map(([code, count]) => `${code} x${count}`)
          .join(', ')}.`,
  );

  return {
    gui_files_checked: guiFilesChecked,
    mod_index: {
      gui_files: modIndex.guiFiles.size,
      containers: modIndex.containers.size,
      sprites: modIndex.sprites.size,
      button_effects: modIndex.buttonEffects.size,
    },
    findings,
    by_code: byCode,
    error_count: errorCount,
    warning_count: warningCount,
    messages,
  };
}

export default { validateStellarisInterface };
