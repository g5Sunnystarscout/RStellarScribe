//------------------------------------------------------------------------------------
// interface-index.mjs -- Part of RStellarisScribe
//
// Indexes what a Stellaris install actually defines in its interface layer, so a mod's own
// interface files can be checked against it:
//
//   interface/**/*.gui  -> containerWindowType / windowType names (what `custom_gui` resolves to)
//   interface/**/*.gfx  -> sprite names and the block *kind* that declared each one
//   common/button_effects/*.txt -> top-level keys (what `effectbuttonType.effect` resolves to)
//
// Verified against 4.4.6: 177 .gui files holding 3320 container definitions, and 131 .gfx
// files holding 9197 sprite declarations (9210 distinct names across every `name =` key
// including fonts) and 8559 `GFX_`-quoted names. Small enough (a few MB) to parse directly,
// and results are cached per root because the vanilla side never changes while the game runs.
//
// The richer sprite index (kind, texturefile, file:line) exists because a name-only set cannot
// answer the question the asset tools ask: "is this name taken, and by what?" A collision report
// that cannot say `corneredTileSpriteType at interface/x.gfx:12` sends the author hunting.
//
// This program is free software: you can redistribute it and/or modify it under the terms of
// the GNU Affero General Public License as published by the Free Software Foundation, either
// version 3 of the License, or (at your option) any later version.
//------------------------------------------------------------------------------------

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { firstBlockChild, findTopLevelDefinitions, parseParadoxBlocks } from './paradox.mjs';
import { GFX_FONT_BLOCK_KINDS } from './gfx-kinds.mjs';

const cache = new Map();

/**
 * The first construct of a .gui file, ignoring comments and `@variable = value` lines.
 *
 * This is the rule that matters most in practice: the root of a .gui file must be
 * `guiTypes = { ... }`, and a bare `containerWindowType` at the top level is a parse error.
 * Verified across all 177 vanilla files: 176 spell it `guiTypes` and one (`traits.gui`) spells
 * it `guitypes`, so the engine compares case-insensitively and so must we.
 */
export function guiRootKeyword(text) {
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.replace(/#[^\n]*/g, '').trim();
    if (line === '' || line.startsWith('@')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    return match ? match[1] : `(unparsed: ${line.slice(0, 40)})`;
  }
  return '(empty)';
}

/** Collect `name = <value>` from each block introduced by one of `blockKeys`. */
export function collectBlockNames(text, blockKeys) {
  const names = new Set();
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const openPattern = new RegExp(`^\\s*(${blockKeys.join('|')})\\s*=\\s*\\{`);

  for (let index = 0; index < lines.length; index += 1) {
    if (!openPattern.test(lines[index])) continue;
    let depth = 0;
    let found = null;
    for (let scan = index; scan < Math.min(lines.length, index + 40); scan += 1) {
      const line = lines[scan].replace(/#[^\n]*/g, '');
      depth += (line.match(/\{/g) ?? []).length;
      depth -= (line.match(/\}/g) ?? []).length;
      if (found === null) {
        const match = /(?:^|\s)name\s*=\s*"?([A-Za-z0-9_]+)"?/.exec(line);
        if (match) found = match[1];
      }
      if (depth <= 0 && scan > index) break;
    }
    if (found) names.add(found);
  }
  return names;
}

/** Every `spriteType = <value>` / `quadTextureSprite = <value>` reference in a .gui file. */
export function collectSpriteReferences(text) {
  const references = [];
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].replace(/#[^\n]*/g, '');
    const pattern = /(spriteType|quadTextureSprite)\s*=\s*"?([A-Za-z0-9_]+)"?/g;
    let match;
    while ((match = pattern.exec(line)) !== null) {
      // In .gui files `spriteType = {` would be a definition; those live in .gfx instead.
      const after = line.slice(match.index + match[0].length).trim();
      if (after.startsWith('{')) continue;
      references.push({ kind: match[1], name: match[2], line: index + 1 });
    }
  }
  return references;
}

/** Every `effectbuttonType = { ... }` block in a .gui file, with its effect key. */
export function collectEffectButtons(text) {
  const buttons = [];
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^\s*effectbuttonType\s*=\s*\{/.test(lines[index])) continue;
    let depth = 0;
    let effect = null;
    let name = null;
    for (let scan = index; scan < Math.min(lines.length, index + 60); scan += 1) {
      const line = lines[scan].replace(/#[^\n]*/g, '');
      depth += (line.match(/\{/g) ?? []).length;
      depth -= (line.match(/\}/g) ?? []).length;
      if (name === null) {
        const nameMatch = /(?:^|\s)name\s*=\s*"?([A-Za-z0-9_]+)"?/.exec(line);
        if (nameMatch) name = nameMatch[1];
      }
      if (effect === null) {
        const effectMatch = /(?:^|\s)effect\s*=\s*"?([A-Za-z0-9_]+)"?/.exec(line);
        if (effectMatch) effect = effectMatch[1];
      }
      if (depth <= 0 && scan > index) break;
    }
    buttons.push({ name, effect, line: index + 1 });
  }
  return buttons;
}

function listFiles(root, subdirectory, extension) {
  const base = join(root, subdirectory);
  const files = [];
  if (!existsSync(base)) return files;
  const walk = (current) => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(extension)) files.push(full);
    }
  };
  walk(base);
  return files;
}

/** Turn an absolute path into a forward-slashed path relative to the install root. */
function toKey(root, absolute) {
  return `${relative(root, absolute).split(sep).join('/')}`;
}

/**
 * Index every sprite declaration under `interface/**\/*.gfx`.
 *
 * A `.gfx` name is not only introduced by `spriteType`: the install also declares them as
 * `corneredTileSpriteType`, `progressBarType` (both spellings), `portraitType`,
 * `flagSpriteType`, `frameAnimatedSpriteType`, `textSpriteType` and `PieChartType`, and a
 * `SpriteType` with a capital S is the same construct as `spriteType`. Indexing only
 * `spriteType` is what made an earlier interface checker report every one of those as unknown.
 *
 * `name = value` and `name = { ... }` are both legal, which is why this walks the block tree
 * rather than matching `name\\s*=\\s*"..."`: 72 of the install's 9243 declarations are
 * unquoted or oddly cased, and a regex keyed on a quoted `GFX_` misses them.
 *
 * @returns {{sprites: Map<string, {kind: string, file: string, line: number, textureFile: string|null}>,
 *            duplicates: Array, fonts: Map<string, {kind: string, file: string, line: number}>,
 *            kindCensus: Map<string, number>, gfxFiles: Map<string, number>}}
 */
export function indexGfxSprites(root) {
  const sprites = new Map();
  const fonts = new Map();
  const duplicates = [];
  const kindCensus = new Map();
  const gfxFiles = new Map();

  for (const file of listFiles(root, 'interface', '.gfx')) {
    const key = toKey(root, file);
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    let recordCount = 0;

    const visit = (blocks) => {
      for (const block of blocks) {
        if (!block.children) continue;
        const lowered = block.key.toLowerCase();
        // `bitmapfonts` is the wrapper for the font definitions; `bitmapfont` and
        // `bitmapfont_override` are the definitions themselves. Treating the wrapper as a
        // definition and stopping there indexes exactly zero fonts.
        const isFont = GFX_FONT_BLOCK_KINDS.includes(lowered);
        // `spriteTypes = { ... }` is the wrapper, not a definition; only `<x>Type` blocks are.
        const isSprite = /type$/.test(lowered) && !isFont;
        if (isSprite || isFont) {
          const nameEntry = firstBlockChild(block, 'name');
          const name = nameEntry?.value;
          if (typeof name === 'string' && name !== '') {
            recordCount += 1;
            kindCensus.set(block.key, (kindCensus.get(block.key) ?? 0) + 1);
            if (isFont) {
              if (!fonts.has(name)) fonts.set(name, { kind: block.key, file: key, line: block.line });
            } else if (!sprites.has(name)) {
              const texture = (block.children ?? []).find(
                (child) => child.key && /^texturef/i.test(child.key) && !child.children,
              );
              sprites.set(name, {
                kind: block.key,
                file: key,
                line: block.line,
                textureFile: texture?.value ?? null,
              });
            } else {
              duplicates.push({ name, first: sprites.get(name), duplicate: { kind: block.key, file: key, line: block.line } });
            }
          }
          continue; // never descend into a definition looking for more definitions
        }
        if (block.children) visit(block.children);
      }
    };

    visit(parseParadoxBlocks(text));
    gfxFiles.set(key, recordCount);
  }

  return { sprites, fonts, duplicates, kindCensus, gfxFiles };
}

/**
 * Index an install (or a mod) root. Cached: the vanilla side is re-read only once per process.
 * Returns { containers, sprites, guiFiles, gfxFiles, buttonEffects } where `sprites` is the
 * set of every declared name, which is what reference validation needs.
 */
export function indexInterfaceRoot(root) {
  const cached = cache.get(root);
  if (cached) return cached;

  const containers = new Set();
  const guiFiles = new Map();
  const gfxFiles = new Map();

  for (const file of listFiles(root, 'interface', '.gui')) {
    const key = toKey(root, file);
    guiFiles.set(key, true);
    const text = readFileSync(file, 'utf8');
    for (const name of collectBlockNames(text, ['containerWindowType', 'windowType'])) {
      containers.add(name);
    }
  }

  const spriteIndex = indexGfxSprites(root);
  const sprites = new Set(spriteIndex.sprites.keys());
  for (const [key, count] of spriteIndex.gfxFiles) gfxFiles.set(key, count);

  const buttonEffects = new Set();
  for (const file of listFiles(root, join('common', 'button_effects'), '.txt')) {
    for (const definition of findTopLevelDefinitions(readFileSync(file, 'utf8'))) {
      buttonEffects.add(definition.key);
    }
  }

  const index = {
    root,
    containers,
    sprites,
    guiFiles,
    gfxFiles,
    buttonEffects,
    spriteIndex,
    kindCensus: spriteIndex.kindCensus,
  };
  cache.set(root, index);
  return index;
}

export default {
  indexInterfaceRoot,
  indexGfxSprites,
  guiRootKeyword,
  collectSpriteReferences,
  collectEffectButtons,
};
