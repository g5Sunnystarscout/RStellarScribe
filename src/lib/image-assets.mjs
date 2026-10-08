//------------------------------------------------------------------------------------
// image-assets.mjs -- Part of RStellarisScribe
//
// Registering a texture as a game sprite, and saying what else has to exist before the sprite
// shows up anywhere. The rules encoded here are the measured ones from `gfx-kinds.mjs`,
// `texture.mjs` and `interface-index.mjs`:
//
//   * the emitted file must live under `interface/` (131 of the install's .gfx files do and
//     `interface/` is the tree the engine reads sprite registrations from; `gfx/` holds 340
//     .gfx files that are all model/particle definitions, and `pdx_launcher/`,
//     `previewer_assets/` and `tweakergui_assets/` hold .gfx files that belong to the
//     launcher and previewer tools, not to the game's sprite registry)
//   * the texture must live under `gfx/`: every one of the 6916 distinct texture paths the
//     install registers resolves inside `gfx/`
//   * a `.gfx` file is UTF-8 WITHOUT a BOM or the whole file is ignored - the exception to the
//     localisation rule - so the plan records `utf-8`, never `utf-8-bom`
//   * the wrapper must be `spriteTypes` (125 of 131 files; 0 spell it `SpriteTypes`)
//   * a sprite name must be unique: no sprite name is declared twice anywhere in the install
//   * an inline `£token£` icon must be `GFX_text_<token>`
//
// This program is free software: you can redistribute it and/or modify it under the terms
// of the GNU Affero General Public License as published by the Free Software Foundation,
// either version 3 of the License, or (at your option) any later version.
//------------------------------------------------------------------------------------

import { existsSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

import { indexGfxSprites, indexInterfaceRoot } from './interface-index.mjs';
import {
  analyseSpriteName,
  buildGfxBlock,
  buildGfxFile,
  GFX_KINDS,
  gfxFieldFor,
  gfxKindSpec,
  textIconSpriteName,
} from './gfx-kinds.mjs';
import { asciiKey, generatedFile, optionalString, requireArray, ToolError } from './generation.mjs';
import { readTextureHeader, judgeTextureFormat, TEXTURE_EXTENSIONS } from './texture.mjs';

/** The `use` values, each mapped onto the `.gfx` kind that implements it. */
export const IMAGE_USES = {
  sprite: {
    kind: 'spriteType',
    about: 'a general sprite referenced from a .gui element as spriteType / quadTextureSprite',
  },
  icon: {
    kind: 'spriteType',
    about:
      'an icon sprite. If the texture sits in an auto-icon directory (gfx/interface/icons/<category>/<key>.dds) the game finds it from the entity key and no .gfx is needed at all',
  },
  event_picture: {
    kind: 'spriteType',
    about: 'an event picture: 450x150 (3:1) is the vanilla size, usually with a masking_texture of gfx/interface/situation_log/event_mask.dds',
  },
  inline_text_icon: {
    kind: 'spriteType',
    about:
      'an icon embedded in localisation as \u00a3token\u00a3. The sprite MUST be named GFX_text_<token>: interface/astral_planes_resources.gfx declares both GFX_resource_astral_threads (:3) and GFX_text_resource_astral_threads (:13) for the same texture, which is only worth doing if no plain-name fallback exists',
  },
  chrome: {
    kind: 'corneredTileSpriteType',
    about: 'a 9-slice panel or frame: window backdrops and button chrome',
  },
  progress_bar: {
    kind: 'progressBarType',
    about: 'a two-texture progress bar (fill + empty background)',
  },
  flag: {
    kind: 'flagSpriteType',
    about: 'an empire flag frame with a masking texture',
  },
  portrait: {
    kind: 'portraitType',
    about: 'a rendered 3-D portrait sprite',
  },
  frame_animation: {
    kind: 'frameAnimatedSpriteType',
    about: 'a sprite sheet played back as an animation',
  },
  text_sprite: {
    kind: 'textSpriteType',
    about: 'an animated text glyph sheet (4 vanilla blocks)',
  },
  pie_chart: {
    kind: 'PieChartType',
    about: 'a pie chart drawn from a declared colour set',
  },
};

export const IMAGE_USE_NAMES = Object.keys(IMAGE_USES);

/** The `.gfx` file every registration in one call is written to, unless overridden. */
export function defaultGfxFilePath(prefix) {
  return `interface/${prefix}_gfx.gfx`;
}

/** A sprite file stem derived from a sprite name, for the default `gfx_file`. */
export function gfxFileStemFor(name) {
  return asciiKey(String(name).replace(/^GFX_(text_)?/, ''), { fallback: 'sprite' });
}

/**
 * Work out the mod-root-relative path the `.gfx` block should reference for a texture.
 *
 * Preference order: an explicit `texture_relpath`, then the texture's own location relative to
 * the mod root when it already sits inside it, and otherwise nothing - a path is never guessed,
 * because a wrong `texturefile` is a silent blank sprite.
 *
 * @returns {{ok: boolean, path?: string, source?: string, insideRoot?: boolean, warnings: string[], reason?: string}}
 */
export function resolveTextureRelPath({ textureFile, textureRelPath, outputRoot }) {
  const warnings = [];
  if (typeof textureRelPath === 'string' && textureRelPath.trim() !== '') {
    const path = textureRelPath.trim().replace(/\\/g, '/').replace(/^\/+/, '');
    if (!path.startsWith('gfx/')) {
      warnings.push(
        `the texture path \`${path}\` does not start with \`gfx/\`. Every one of the 6916 texture paths the install registers resolves inside ` +
          'gfx/, so a texture anywhere else is not found and the sprite draws nothing.',
      );
    }
    return { ok: true, path, source: 'texture_relpath', insideRoot: null, warnings };
  }
  if (typeof textureFile !== 'string' || textureFile.trim() === '') {
    return { ok: false, warnings, reason: '`texture_relpath` is required when `texture_file` is not given: the .gfx block needs a path to point at' };
  }
  if (typeof outputRoot !== 'string' || outputRoot.trim() === '') {
    return {
      ok: false,
      warnings,
      reason:
        '`texture_relpath` is required: without `output_root` there is no way to know where the texture sits inside the mod. Give it the path the engine should use, for example `gfx/interface/icons/mymod_icon.dds`.',
    };
  }
  const root = resolve(outputRoot.trim());
  const absolute = resolve(textureFile.trim());
  const rel = relative(root, absolute);
  if (rel.startsWith('..') || rel.includes(`..${sep}`)) {
    return {
      ok: false,
      warnings,
      reason:
        `the texture \`${absolute}\` is outside output_root \`${root}\`, so its in-mod path cannot be derived - this server does not copy binary files. ` +
        'Copy the texture into the mod yourself (for example to `gfx/interface/icons/`) and either point `texture_file` at that copy or pass `texture_relpath` explicitly.',
    };
  }
  const path = rel.split(sep).join('/');
  if (!path.startsWith('gfx/')) {
    warnings.push(
      `the texture is at \`${path}\` inside the mod, which is not under \`gfx/\`. Every one of the 6916 texture paths the install registers ` +
        'resolves inside gfx/, so move it there (or pass `texture_relpath` if you know better).',
    );
  }
  return { ok: true, path, source: 'derived-from-output_root', insideRoot: true, warnings };
}

/**
 * Where a texture actually is, checked against both the mod and the install, so a `.gfx` that
 * points at nothing is caught before the game silently draws a blank.
 */
export function locateTexture({ textureRelPath, outputRoot, gameRoot }) {
  const tried = [];
  for (const [label, root] of [['mod', outputRoot], ['install', gameRoot]]) {
    if (typeof root !== 'string' || root.trim() === '') continue;
    const candidate = join(resolve(root.trim()), ...textureRelPath.split('/'));
    tried.push({ root: label, path: candidate, exists: existsSync(candidate) });
  }
  const found = tried.find((entry) => entry.exists) ?? null;
  return { found, tried, present: found !== null };
}

/** Build the `.gfx` field object for one sprite spec, translating tool argument names. */
export function gfxFieldsForSprite(spec = {}) {
  const kindSpec = gfxKindSpec(spec.kind) ?? gfxKindSpec('spriteType');
  const fields = {};
  // Argument names are mapped onto the spelling the install uses for this kind, but a value is
  // never silently dropped: a field the kind does not accept stays in the map so that
  // `buildGfxBlock` can reject it by name instead of quietly writing a sprite with no size.
  const put = (key, value) => {
    if (value === undefined || value === null || value === '') return;
    const field = gfxFieldFor(kindSpec, key);
    fields[field ? field.key : key] = value;
  };

  // The primary texture goes into whichever field this kind names its texture with. A
  // `progressBarType` has no `texturefile` at all, so it must not receive one.
  const primary = spec.texture_relpath ?? spec.textureFile;
  if (gfxFieldFor(kindSpec, 'texturefile') && primary) put('texturefile', primary);
  const fill = spec.texture_file_1 ?? spec.texture_file1;
  const background = spec.texture_file_2 ?? spec.texture_file2;
  if (gfxFieldFor(kindSpec, 'textureFile1') && (fill || primary)) put('textureFile1', fill || primary);
  else if (fill) put('textureFile1', fill);
  if (background) put('textureFile2', background);

  put('masking_texture', spec.masking_texture);
  put('effectFile', spec.effect_file);
  put('size', spec.size);
  put('borderSize', spec.border_size);
  put('noOfFrames', spec.no_of_frames);
  put('alwaystransparent', spec.always_transparent);
  put('transparencecheck', spec.transparence_check);
  put('legacy_lazy_load', spec.legacy_lazy_load);
  put('loadType', spec.load_type);
  put('tilingCenter', spec.tiling_center);
  put('horizontal', spec.horizontal);
  put('flipdirection', spec.flip_direction);
  put('animation_rate_fps', spec.animation_rate_fps);
  put('looping', spec.looping);
  put('play_on_show', spec.play_on_show);
  put('is_hover', spec.is_hover);
  put('colors', spec.colors);
  put('clicksound', spec.clicksound);
  put('type', spec.portrait_type);
  put('character', spec.portrait_character);
  put('mid_close_up', spec.mid_close_up);
  put('close_up', spec.close_up);
  // Flag layout and the progress-bar colour pair are block-shaped and pass through verbatim.
  put('bg_position', spec.bg_position);
  put('bg_size', spec.bg_size);
  put('symbol_position', spec.symbol_position);
  put('symbol_size', spec.symbol_size);
  put('mask_size', spec.mask_size);
  put('mask_offset', spec.mask_offset);
  put('color', spec.color);
  put('colorTwo', spec.color_two ?? spec.colorTwo);
  for (const [key, value] of Object.entries(spec.extra_fields ?? {})) fields[key] = value;
  for (const [key, value] of Object.entries(spec.extra_blocks ?? {})) fields[key] = value;
  return fields;
}

/**
 * Resolve the kind and the sprite name for one spec, applying the `use` mapping and the
 * `GFX_text_` rule for inline text icons.
 *
 * @returns {{ok: boolean, kind: string, name: string, use: string, errors: string[], warnings: string[], text_icon_token: string|null}}
 */
export function resolveSpriteIdentity(spec = {}) {
  const errors = [];
  const warnings = [];
  const use = typeof spec.use === 'string' && spec.use.trim() !== '' ? spec.use.trim() : null;
  if (use && !IMAGE_USES[use]) {
    errors.push(`\`use\` must be one of ${IMAGE_USE_NAMES.join(', ')}, received \`${use}\``);
    return { ok: false, kind: 'spriteType', name: '', use: use ?? '', errors, warnings, text_icon_token: null };
  }

  let kind = typeof spec.kind === 'string' && spec.kind.trim() !== '' ? spec.kind.trim() : null;
  if (!kind && use) kind = IMAGE_USES[use].kind;
  if (!kind) kind = 'spriteType';
  const kindSpec = gfxKindSpec(kind);
  if (!kindSpec) {
    errors.push(`\`kind\` must be one of ${GFX_KINDS.join(', ')}, received \`${kind}\``);
    return { ok: false, kind, use: use ?? '', name: '', errors, warnings, text_icon_token: null };
  }
  kind = kindSpec.kind;

  if (use && IMAGE_USES[use].kind !== kind) {
    warnings.push(
      `\`use: ${use}\` normally means \`kind: ${IMAGE_USES[use].kind}\`, but \`kind: ${kind}\` was given; the kind wins because it is the .gfx block that is written`,
    );
  }

  const token = typeof spec.text_icon_token === 'string' ? spec.text_icon_token.trim() : '';
  let name = typeof spec.sprite_name === 'string' ? spec.sprite_name.trim() : '';
  const isInline = use === 'inline_text_icon' || token !== '';

  if (isInline) {
    if (token === '' && name === '') {
      errors.push('an inline text icon needs either `text_icon_token` (the `\u00a3token\u00a3` name) or a `sprite_name` that already starts with `GFX_text_`');
    } else if (name === '') {
      name = textIconSpriteName(token);
    } else if (!name.startsWith('GFX_text_')) {
      errors.push(
        `an inline text icon must be named \`GFX_text_<token>\`, but \`${name}\` does not start with \`GFX_text_\`. ` +
          `Localisation resolves \`\u00a3${token || name.replace(/^GFX_/, '')}\u00a3\` as \`GFX_text_${token || name.replace(/^GFX_/, '')}\`; ` +
          'interface/astral_planes_resources.gfx:13 shows vanilla declaring the GFX_text_ alias for a texture that already has a plain GFX_ name at line 3. ' +
          `Either rename to \`${textIconSpriteName(token || name)}\` or drop \`use: inline_text_icon\`.`,
      );
    } else if (name === 'GFX_text_') {
      errors.push('`GFX_text_` has an empty token, so the \u00a3 code would be `\u00a3\u00a3` and resolve to nothing');
    } else if (token !== '' && name !== textIconSpriteName(token)) {
      errors.push(`\`sprite_name\` \`${name}\` does not match \`text_icon_token\` \`${token}\` (expected \`${textIconSpriteName(token)}\`)`);
    }
  } else if (name === '') {
    errors.push('`sprite_name` is required: it is the `name = "..."` value every .gfx block needs');
  }

  const analysis = analyseSpriteName(name);
  errors.push(...analysis.errors);
  warnings.push(...analysis.warnings);

  return {
    ok: errors.length === 0,
    kind,
    name,
    use: use ?? Object.keys(IMAGE_USES).find((key) => IMAGE_USES[key].kind === kind) ?? 'sprite',
    errors,
    warnings,
    text_icon_token: analysis.text_icon_token,
  };
}

/** Every collision for `name`, across the mod root and the install, with defining file:line. */
export function findSpriteCollisions(name, { outputRoot, gameRoot }) {
  const collisions = [];
  for (const [scope, root] of [['mod', outputRoot], ['install', gameRoot]]) {
    if (typeof root !== 'string' || root.trim() === '' || !existsSync(root.trim())) continue;
    let index;
    try {
      index = indexGfxSprites(resolve(root.trim()));
    } catch {
      continue;
    }
    const found = index.sprites.get(name);
    if (found) collisions.push({ scope, name, kind: found.kind, file: found.file, line: found.line, textureFile: found.textureFile });
  }
  return collisions;
}

/** The checklist of things a registered sprite still needs before it is visible in game. */
export function authorTodoForImage({ kind, name, use, textureRelPath, texturePresent, textIconToken, collisions }) {
  const todo = [];
  if (!texturePresent) {
    todo.push(
      `Put the texture at \`${textureRelPath}\` inside the mod. The .gfx block points at that path and nothing else; this server never writes binary files.`,
    );
  }
  if (use === 'inline_text_icon' && textIconToken) {
    todo.push(
      `Reference it from localisation as \`\u00a3${textIconToken}\u00a3\` (no GFX_ and no text_ prefix in the \u00a3 code). The localisation file must be UTF-8 with BOM and named <name>_l_<language>.yml.`,
    );
    todo.push(
      'The icon is 16x16 in practice: every \u00a3 code sits inline with text, and gfx/interface/icons/text_icons/ holds the installed set.',
    );
  }
  if (use === 'chrome' || kind === 'corneredTileSpriteType') {
    todo.push(
      'A 9-slice sprite only does something when a .gui element uses it as a background: the element stretches the middle and keeps `borderSize` corners. Set the element size explicitly or the panel collapses to the texture size.',
    );
    todo.push(
      'A .gui `iconType` takes no `size` field (only `scale`), so a sized decorative panel wants a containerWindowType with a background, not an iconType.',
    );
  }
  if (kind === 'progressBarType') {
    todo.push('A progress bar is referenced by a .gui element as `spriteType = "<name>"` plus a `progressBarType`-shaped element, or from a situation/technology view; the bar alone draws nowhere.');
  }
  todo.push(
    `Reference \`${name}\` from the place that should show it: a .gui element (\`spriteType = "${name}"\` for an iconType, \`quadTextureSprite = "${name}"\` for a button or a background), an event \`picture = ${name}\`, a decision \`icon\`, or a localisation \u00a3 code.`,
  );
  todo.push(
    'If a tooltip or label needs a name for it, add the localisation key to a UTF-8-with-BOM `localisation/<lang>/<stem>_l_<lang>.yml`.',
  );
  todo.push(
    'New sprites are picked up at load; changing a texture\u2019s resolution needs a restart, `reload texture all` only re-reads content. Put the .gfx in its own file rather than editing vanilla, because interface/ loads last-wins.',
  );
  if (collisions.length > 0) {
    todo.push(
      `Resolve the name collision first: ${collisions.map((entry) => `${entry.scope} ${entry.kind} at ${entry.file}:${entry.line}`).join(', ')}. A duplicate sprite name shadows or is shadowed by the other definition depending on load order.`,
    );
  }
  return todo;
}

/**
 * Analyse one batched image registration request without writing anything. Used by
 * `register_image_asset` as its dry run and by `validate_image_asset` as its whole report.
 *
 * @returns {{ok: boolean, prefix: string|null, gfx_file: string, sprites: Array, collisions: Array,
 *            files: Array, messages: string[], errors: string[], warnings: string[]}}
 */
export function analyseImageRegistration(args = {}) {
  const errors = [];
  const warnings = [];
  const messages = [];

  const spriteSpecs = requireArray(args.sprites, 'sprites');
  const prefix =
    typeof args.prefix === 'string' && args.prefix.trim() !== '' ? asciiKey(args.prefix.trim(), { fallback: 'mymod' }) : null;
  const firstIdentity = resolveSpriteIdentity(spriteSpecs[0] ?? {});
  const gfxFile =
    typeof args.gfx_file === 'string' && args.gfx_file.trim() !== ''
      ? args.gfx_file.trim().replace(/\\/g, '/')
      : prefix
        ? defaultGfxFilePath(prefix)
        : firstIdentity.name
          ? `interface/${gfxFileStemFor(firstIdentity.name)}_gfx.gfx`
          : null;
  if (!gfxFile) {
    throw new ToolError('`prefix` is required (or an explicit `gfx_file`): it names the generated interface file');
  }
  if (!gfxFile.startsWith('interface/')) {
    errors.push(
      `\`gfx_file\` must be under \`interface/\`; \`${gfxFile}\` is not. The engine reads sprite registrations from interface/**/*.gfx - all 131 ` +
        'installed .gfx files that declare sprites live there, while gfx/**/*.gfx (340 files) are model definitions and pdx_launcher/, ' +
        'previewer_assets/ and tweakergui_assets/ belong to other tools.',
    );
  }
  if (!gfxFile.toLowerCase().endsWith('.gfx')) {
    errors.push(`\`gfx_file\` must end in .gfx; \`${gfxFile}\` does not, so the engine never reads it`);
  }

  const outputRoot = optionalString(args.output_root);
  const gameRoot = optionalString(args.game_root);
  if (!gameRoot) {
    warnings.push(
      'No `game_root` was given, so the install\'s sprite index was not consulted: a name vanilla already defines cannot be reported. Pass the install folder for real collision detection.',
    );
  } else if (!existsSync(gameRoot)) {
    warnings.push(`\`game_root\` \`${gameRoot}\` does not exist; vanilla collisions were not checked`);
  }

  const sprites = [];
  const allCollisions = [];
  const blocks = [];
  const seenNames = new Set();

  for (const [index, rawSpec] of spriteSpecs.entries()) {
    const spec = rawSpec && typeof rawSpec === 'object' ? rawSpec : {};
    const identity = resolveSpriteIdentity(spec);
    const localErrors = [...identity.errors];
    const localWarnings = [...identity.warnings];

    if (identity.name !== '' && seenNames.has(identity.name)) {
      localErrors.push(`\`${identity.name}\` appears twice in the same request; sprite names must be unique (no vanilla sprite name is declared twice)`);
    }
    seenNames.add(identity.name);

    // ---- the texture: real header facts, and where it has to be.
    // `PieChartType` is the one kind with no texture at all (all 3 vanilla blocks declare only
    // `name`, `size`, `is_hover` and a `colors` block), so a texture is only demanded when the
    // kind actually names one.
    const kindSpec = gfxKindSpec(identity.kind);
    const needsTexture = Boolean(gfxFieldFor(kindSpec, 'texturefile') || gfxFieldFor(kindSpec, 'textureFile1'));
    const textureFile = optionalString(spec.texture_file);
    let textureHeader = null;
    let format = null;
    let textureRel = { ok: true, path: null, source: 'not-applicable', warnings: [] };
    let texturePresent = null;

    if (!needsTexture) {
      if (textureFile || optionalString(spec.texture_relpath)) {
        localWarnings.push(
          `a ${identity.kind} takes no texture in the install, so \`texture_file\`/\`texture_relpath\` were ignored; ` +
            'the only fields this kind uses are name, size, is_hover and a colors block (interface/government_view.gfx:215)',
        );
      }
    } else {
      if (textureFile) {
        if (!existsSync(textureFile)) {
          localErrors.push(`\`texture_file\` \`${textureFile}\` does not exist`);
        } else {
          textureHeader = readTextureHeader(textureFile);
          if (!textureHeader.ok) {
            localErrors.push(`the texture could not be read: ${textureHeader.reason}`);
          } else {
            format = judgeTextureFormat(textureHeader);
            localWarnings.push(...format.warnings);
          }
        }
      } else {
        localErrors.push(`\`texture_file\` is required for \`${identity.name || `sprite ${index}`}\`: this tool reads the real header of the texture it registers`);
      }

      textureRel = resolveTextureRelPath({ textureFile, textureRelPath: spec.texture_relpath, outputRoot });
      if (!textureRel.ok) localErrors.push(textureRel.reason);
      localWarnings.push(...textureRel.warnings);

      if (textureRel.ok && textureRel.path) {
        const located = locateTexture({ textureRelPath: textureRel.path, outputRoot, gameRoot });
        texturePresent = located.present;
        if (!located.present) {
          localWarnings.push(
            `\`${textureRel.path}\` was not found in ${outputRoot ? 'the mod root' : '(no output_root was given)'} or in the install, so this sprite would draw nothing until the texture is placed there`,
          );
        }
        const lower = textureRel.path.toLowerCase();
        if (!TEXTURE_EXTENSIONS.some((extension) => lower.endsWith(extension))) {
          localErrors.push(
            `\`${textureRel.path}\` does not end in one of ${TEXTURE_EXTENSIONS.join(', ')}: those are the three containers the install registers (6895 DDS, 16 TGA, 4 PNG)`,
          );
        } else if (textureHeader?.ok && textureHeader.container) {
          const declared = lower.slice(lower.lastIndexOf('.'));
          if (declared !== `.${textureHeader.container}`) {
            localWarnings.push(`the file is a ${textureHeader.container.toUpperCase()} but \`${textureRel.path}\` says \`${declared}\``);
          }
        }
      }
    }

    // ---- collisions in the mod and in the install
    const collisions = identity.name ? findSpriteCollisions(identity.name, { outputRoot, gameRoot }) : [];
    allCollisions.push(...collisions);
    for (const collision of collisions) {
      localErrors.push(
        `\`${identity.name}\` is already declared as a ${collision.kind} in the ${collision.scope} at ${collision.file}:${collision.line}` +
          `${collision.textureFile ? ` (texture ${collision.textureFile})` : ''}. Interface lookups are by name, so a duplicate shadows or is ` +
          'shadowed by the other definition depending on load order.',
      );
    }

    // ---- the .gfx block
    let block = null;
    if (localErrors.length === 0) {
      const fields = gfxFieldsForSprite({
        ...spec,
        kind: identity.kind,
        texture_relpath: textureRel.ok ? textureRel.path : spec.texture_relpath,
      });
      fields.name = identity.name;
      try {
        block = buildGfxBlock(identity.kind, fields, { allowUnverifiedFields: spec.allow_unverified_fields === true });
        localWarnings.push(...block.warnings);
        blocks.push(block.text);
      } catch (thrown) {
        localErrors.push(thrown instanceof Error ? thrown.message : String(thrown));
      }
    }

    const use = IMAGE_USES[identity.use] ?? null;
    const todo = authorTodoForImage({
      kind: identity.kind,
      name: identity.name,
      use: identity.use,
      textureRelPath: textureRel.path ?? '(this kind takes no texture)',
      texturePresent: needsTexture ? texturePresent === true : true,
      textIconToken: identity.text_icon_token,
      collisions,
    });

    sprites.push({
      index,
      sprite_name: identity.name,
      kind: identity.kind,
      use: identity.use,
      use_about: use?.about ?? null,
      text_icon_token: identity.text_icon_token,
      localisation_reference: identity.text_icon_token ? `\u00a3${identity.text_icon_token}\u00a3` : null,
      texture_file: textureFile,
      texture_relpath: textureRel.path,
      texture_relpath_source: textureRel.source ?? null,
      texture: textureHeader?.ok
        ? {
            container: textureHeader.container,
            width: textureHeader.width,
            height: textureHeader.height,
            format: textureHeader.format,
            mip_count: textureHeader.mipCount,
            has_alpha: textureHeader.hasAlpha,
            bit_depth: textureHeader.bitDepth ?? textureHeader.pixelFormat?.rgbBitCount ?? null,
            bytes: textureHeader.size,
            engine_accepted: format?.accepted ?? null,
          }
        : textureHeader
          ? { error: textureHeader.reason }
          : null,
      texture_present: texturePresent,
      collisions,
      gfx_block: block?.text ?? null,
      author_todo: todo,
      errors: localErrors,
      warnings: localWarnings,
    });

    const label = identity.name || `sprite ${index}`;
    errors.push(...localErrors.map((message) => `${label}: ${message}`));
    warnings.push(...localWarnings.map((message) => `${label}: ${message}`));
  }

  const header = [
    `# ${gfxFile}`,
    '# Generated by RStellarisScribe. UTF-8 without BOM, as every .gfx must be: a BOM makes the',
    '# engine skip the whole file and every sprite in it disappears.',
  ].join('\n');

  const files =
    errors.length === 0 && blocks.length > 0
      ? [
          generatedFile(gfxFile, buildGfxFile(blocks, { header }), {
            encoding: 'utf-8',
            summary: `${blocks.length} sprite registration(s)`,
          }),
        ]
      : [];

  if (errors.length === 0) {
    messages.push(
      `one .gfx file carries ${blocks.length} sprite registration(s); interface/ loads last-wins, so a new file is the right place for them`,
    );
    if (outputRoot && existsSync(join(resolve(outputRoot), ...gfxFile.split('/')))) {
      messages.push(`\`${gfxFile}\` already exists in the mod and this plan replaces it`);
    }
  } else {
    messages.push('no file plan was produced because the request has errors; fix them and call again');
  }

  return {
    ok: errors.length === 0,
    prefix,
    gfx_file: gfxFile,
    output_root: outputRoot,
    game_root: gameRoot,
    sprites,
    collisions: allCollisions,
    files,
    errors,
    warnings,
    messages,
  };
}

/**
 * Whole-mod image check: does every sprite the mod declares resolve to a real texture, and does
 * every `texturefile` path sit where the engine looks?
 */
export function auditModSprites({ workspaceRoot, gameRoot }) {
  const findings = [];
  const push = (severity, code, file, line, message) => findings.push({ severity, code, file, line, message });
  const index = indexGfxSprites(resolve(workspaceRoot));
  const vanilla = gameRoot && existsSync(gameRoot) ? indexInterfaceRoot(resolve(gameRoot)) : null;

  for (const [name, record] of index.sprites) {
    if (record.textureFile) {
      const located = locateTexture({ textureRelPath: String(record.textureFile).replace(/\\/g, '/'), outputRoot: workspaceRoot, gameRoot });
      if (!located.present) {
        push(
          'error',
          'sprite-texture-missing',
          record.file,
          record.line,
          `\`${name}\` points at \`${record.textureFile}\`, which exists neither in this mod nor in the install, so the sprite draws nothing.`,
        );
      }
    }
    if (vanilla?.sprites.has(name)) {
      const other = vanilla.spriteIndex.sprites.get(name);
      push(
        'warning',
        'duplicate-vanilla-sprite',
        record.file,
        record.line,
        `\`${name}\` is also declared as a ${other.kind} in the install at ${other.file}:${other.line}; the duplicate shadows one of them depending on load order.`,
      );
    }
  }
  for (const duplicate of index.duplicates) {
    push(
      'warning',
      'duplicate-sprite-name',
      duplicate.duplicate.file,
      duplicate.duplicate.line,
      `\`${duplicate.name}\` is declared twice in this mod (first at ${duplicate.first.file}:${duplicate.first.line}); no vanilla sprite name is declared twice anywhere in the install.`,
    );
  }
  for (const [file, count] of index.gfxFiles) {
    if (count === 0) push('warning', 'gfx-without-sprites', file, 1, 'this .gfx declares no sprite block; a wrapper other than `spriteTypes` makes the whole file inert');
  }

  return {
    gfx_files: index.gfxFiles.size,
    sprites: index.sprites.size,
    fonts: index.fonts.size,
    kind_census: Object.fromEntries([...index.kindCensus.entries()].sort((a, b) => b[1] - a[1])),
    duplicate_names: index.duplicates.length,
    findings,
    error_count: findings.filter((finding) => finding.severity === 'error').length,
    warning_count: findings.filter((finding) => finding.severity === 'warning').length,
    vanilla_indexed: Boolean(vanilla),
  };
}
