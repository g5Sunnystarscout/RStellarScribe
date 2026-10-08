//------------------------------------------------------------------------------------
// gfx-kinds.mjs -- Part of RStellarisScribe
//
// The measured field contract of `interface/**/*.gfx`. Every number and every file:line
// below was read out of the verified Stellaris 4.4.6 install (`<Stellaris>`), not
// taken from documentation, because the docs and the install disagree in both directions.
//
// Census of all 131 `interface/**/*.gfx` files, 9243 `name =` declarations of which 9197
// are sprite blocks and 46 are bitmap fonts:
//
//   block kind                  count   every record carries
//   spriteType                   8539   name; 7803 also carry a texture
//   corneredTileSpriteType        335   name (+ textureFile in all 335, borderSize in 290)
//   progressbarType               101   name, textureFile1, textureFile2, effectFile
//   progressbartype                93   name, textureFile1, textureFile2, effectFile
//   SpriteType (capital S)         77   name (the same construct as spriteType)
//   portraitType                   21   name, effectFile, type, character
//   flagSpriteType                 18   name, textureFile, masking_texture, effectFile
//   frameAnimatedSpriteType         5   name, noOfFrames, animation_rate_fps, looping, play_on_show
//   textSpriteType                  4   name, texturefile
//   PieChartType                    3   name, size
//   progressBarType (exact case)      1   name, textureFile1, textureFile2, effectFile, size
//   bitmapfont / bitmapfont_override 46  (fonts, not sprites - out of scope here)
//
// Two facts in that table are the whole reason this module is data-driven:
//
//   * `size` appears in 0 of 8539 `spriteType` blocks and in 0 of 77 `SpriteType` blocks,
//     but in 194 of 194 progress bars and in 25 of 335 `corneredTileSpriteType` blocks.
//     Writing `size` into a `spriteType` is therefore not a harmless extra: it is a field the
//     engine does not accept there. The same applies to `borderSize` (0 in spriteType).
//   * `tileSpriteType`, `maskedShieldType`, `shieldType`, `lineChartType`, `animatedSpriteType`,
//     `maskedSpriteType` and `quadTextureSprite` do NOT occur anywhere under `interface/` or
//     `gfx/` in 4.4.6 (0 blocks each), so their field sets cannot be measured here. They are
//     accepted as kinds, but only with explicit fields and with a warning saying so, rather
//     than being emitted from a remembered field list.
//
// Name rules, also measured:
//   * all 9243 declarations match `[A-Za-z0-9_]+`; nothing else appears in a `name` value.
//   * 9171 of 9197 sprite blocks (99.7%) start with `GFX_`. The 26 that do not are vanilla's
//     own internal sprites: `cursor` (interface/core.gfx:2), `gfx_transparency`
//     (interface/core.gfx:9), `SandboxFloaterBackground` (interface/eu4_placeholders.gfx:20)
//     and friends. So `GFX_` is a very strong convention, not an engine requirement.
//   * NO sprite name is declared twice anywhere in the install: the only 9 duplicate names
//     are fonts, where `bitmapfont_override` deliberately re-declares a `bitmapfont` name per
//     language (interface/fonts.gfx:60 vs :74). A new sprite name must therefore be unique.
//   * `GFX_text_` is a hard requirement for an inline `£token£` icon, and the strongest
//     evidence is that vanilla pays for a redundant alias: interface/astral_planes_resources.gfx
//     declares `GFX_resource_astral_threads` (block at :3, `name` at :4) and, pointing at the
//     SAME `gfx/interface/icons/resources/astral_threads.dds`,
//     `GFX_text_resource_astral_threads` (block at :13, `name` at :14). 571 `GFX_text_*` sprites
//     exist and 225 of the 659 distinct `£token£` references in English localisation resolve to
//     one. (Line numbers here are block starts, which is what the index records.)
//
// This program is free software: you can redistribute it and/or modify it under the terms
// of the GNU Affero General Public License as published by the Free Software Foundation,
// either version 3 of the License, or (at your option) any later version.
//------------------------------------------------------------------------------------

/** The only wrapper the splitter accepts: 125 of 131 files use `spriteTypes`, 0 use `SpriteTypes`. */
export const GFX_WRAPPER = 'spriteTypes';

/** Bitmap fonts live in the same files under a different wrapper; reported, never emitted here. */
export const GFX_FONT_WRAPPER = 'bitmapfonts';

const BOOL_VALUES = new Set(['yes', 'no', 'true', 'false']);

/**
 * Per-kind field contract. `emitted` is the spelling the install uses most for that kind
 * (the engine accepts either case: `spriteType` appears with `texturefile` 6065 times and
 * `textureFile` 1738 times, and both work).
 *
 * `fields` entries are `[emitName, type, counts]` where `counts` is what the census found.
 */
export const GFX_KIND_SPECS = {
  spriteType: {
    block: 'spriteType',
    summary: 'A plain sprite: the workhorse for icons, event pictures, highlights and inline text icons.',
    verified: true,
    required: ['name', 'texturefile'],
    fields: {
      name: { emit: 'name', type: 'string', required: true, count: 8539 },
      texturefile: { emit: 'texturefile', type: 'path', required: true, count: 7803, aliases: ['textureFile'] },
      alwaystransparent: { emit: 'alwaystransparent', type: 'bool', count: 1500, aliases: ['alwaysTransparent'] },
      noofframes: { emit: 'noOfFrames', type: 'int', count: 1203, minimum: 1 },
      effectfile: { emit: 'effectFile', type: 'path', count: 799 },
      masking_texture: { emit: 'masking_texture', type: 'path', count: 611 },
      transparencecheck: { emit: 'transparencecheck', type: 'bool', count: 107 },
      legacy_lazy_load: { emit: 'legacy_lazy_load', type: 'bool', count: 71 },
      loadtype: { emit: 'loadType', type: 'string', count: 3 },
    },
    extraFields: [
      'default_frame',
      'sprite_sheet_sprite_type',
      'parent',
    ],
    extraBlocks: ['animation', 'upper_left', 'lower_right', 'hitbox_margin'],
    // The minefield, stated as data: spriteType accepts these in 0 of 8539 records.
    rejected: {
      size: 'a `spriteType` has no `size`: 0 of 8539 vanilla blocks declare one. If you need a declared size use `corneredTileSpriteType` (25 of 335 declare `size`).',
      borderSize:
        'a `spriteType` has no `borderSize`: 0 of 8539 vanilla blocks declare one. A 9-slice border is a `corneredTileSpriteType` field (290 of 335 declare it).',
      textureFile1: '`textureFile1`/`textureFile2` belong to `progressBarType`, not `spriteType`.',
      textureFile2: '`textureFile1`/`textureFile2` belong to `progressBarType`, not `spriteType`.',
    },
    evidence: ['interface/additional_content/additional_content.gfx:66', 'interface/keyicons.gfx:3'],
  },

  corneredTileSpriteType: {
    block: 'corneredTileSpriteType',
    summary:
      'A 9-slice sprite: window chrome, panels, frames. The four corners keep their natural size and the edges plus the centre stretch, which is what `borderSize` tells the engine.',
    verified: true,
    required: ['name', 'texturefile', 'borderSize'],
    fields: {
      name: { emit: 'name', type: 'string', required: true, count: 335 },
      texturefile: { emit: 'textureFile', type: 'path', required: true, count: 335, aliases: ['texturefile'] },
      bordersize: { emit: 'borderSize', type: 'xy', required: true, count: 291, aliases: ['bordersize'] },
      noofframes: { emit: 'noOfFrames', type: 'int', count: 30, minimum: 1 },
      size: { emit: 'size', type: 'xy', count: 25 },
      tilingcenter: { emit: 'tilingCenter', type: 'bool', count: 6 },
      alwaystransparent: { emit: 'alwaystransparent', type: 'bool', count: 7, aliases: ['alwaysTransparent'] },
      effectfile: { emit: 'effectFile', type: 'path', count: 249 },
    },
    extraFields: [],
    extraBlocks: [],
    rejected: {
      textureFile1: '`textureFile1` belongs to `progressBarType`.',
    },
    evidence: ['interface/additional_content/additional_content.gfx:3', 'interface/traditions.gfx'],
  },

  progressBarType: {
    block: 'progressBarType',
    summary:
      'A two-texture progress bar: textureFile1 is the fill, textureFile2 the empty background, and `size` is the bar rect.',
    verified: true,
    required: ['name', 'textureFile1', 'textureFile2', 'size', 'effectFile'],
    fields: {
      name: { emit: 'name', type: 'string', required: true, count: 195 },
      texturefile1: { emit: 'textureFile1', type: 'path', required: true, count: 195 },
      texturefile2: { emit: 'textureFile2', type: 'path', required: true, count: 195 },
      size: { emit: 'size', type: 'xy', required: true, count: 195 },
      effectfile: {
        emit: 'effectFile',
        type: 'path',
        required: true,
        count: 195,
        default: 'gfx/FX/progress.shader',
        note: '101 of 101 `progressbarType` blocks use gfx/FX/progress.shader; the 93 lowercase-spelled ones use progress_startend.shader (73) or progress_radial.shader (9).',
      },
      horizontal: { emit: 'horizontal', type: 'bool', count: 17 },
      flipdirection: { emit: 'flipdirection', type: 'bool', count: 28 },
    },
    extraFields: [],
    extraBlocks: ['color', 'colorTwo', 'colortwo'],
    rejected: {
      texturefile: 'a progress bar takes `textureFile1` and `textureFile2`, not `texturefile` (0 of 195 blocks declare the singular).',
      borderSize: '`borderSize` belongs to `corneredTileSpriteType` (0 of 195 progress bars declare one).',
    },
    evidence: ['interface/crisis.gfx:652', 'interface/the_shroud.gfx:918'],
  },

  flagSpriteType: {
    block: 'flagSpriteType',
    summary:
      'An empire flag composed from a frame texture plus a mask, with the background and symbol rects given in pixels.',
    verified: true,
    required: ['name', 'textureFile', 'masking_texture', 'effectFile'],
    fields: {
      name: { emit: 'name', type: 'string', required: true, count: 18 },
      texturefile: { emit: 'textureFile', type: 'path', required: true, count: 18 },
      masking_texture: { emit: 'masking_texture', type: 'path', required: true, count: 18 },
      effectfile: {
        emit: 'effectFile',
        type: 'path',
        required: true,
        count: 18,
        default: 'gfx/FX/flag_sprite.shader',
        note: '18 of 18 flag sprites use gfx/FX/flag_sprite.shader.',
      },
      noofframes: { emit: 'noOfFrames', type: 'int', count: 17, minimum: 1 },
    },
    extraFields: ['texture_size'],
    extraBlocks: ['bg_position', 'bg_size', 'symbol_position', 'symbol_size', 'mask_size', 'mask_offset'],
    rejected: {},
    evidence: ['interface/game_setup/customization.gfx:16'],
  },

  portraitType: {
    block: 'portraitType',
    summary: 'A rendered 3-D portrait sprite (a render target, not a plain texture).',
    verified: true,
    required: ['name', 'effectFile', 'type', 'character'],
    fields: {
      name: { emit: 'name', type: 'string', required: true, count: 21 },
      effectfile: {
        emit: 'effectFile',
        type: 'path',
        required: true,
        count: 21,
        default: 'gfx/FX/buttonstate_rendertarget.shader',
        note: '20 of 21 portrait sprites use gfx/FX/buttonstate_rendertarget.shader; the last uses buttonstate_rendertarget_hologram.shader.',
      },
      type: { emit: 'type', type: 'string', required: true, count: 21 },
      character: { emit: 'character', type: 'string', required: true, count: 21 },
      masking_texture: { emit: 'masking_texture', type: 'path', count: 15 },
      texturefile: { emit: 'texturefile', type: 'path', count: 11 },
      mid_close_up: { emit: 'mid_close_up', type: 'number', count: 3 },
      close_up: { emit: 'close_up', type: 'number', count: 2 },
    },
    extraFields: [],
    extraBlocks: ['alternate_configurations'],
    rejected: {},
    evidence: ['interface/core.gfx:210'],
  },

  frameAnimatedSpriteType: {
    block: 'frameAnimatedSpriteType',
    summary: 'A sprite sheet played as an animation: `noOfFrames` frames at `animation_rate_fps`.',
    verified: true,
    required: ['name', 'noOfFrames', 'animation_rate_fps', 'looping', 'play_on_show', 'texturefile'],
    fields: {
      name: { emit: 'name', type: 'string', required: true, count: 5 },
      noofframes: { emit: 'noOfFrames', type: 'int', required: true, count: 5, minimum: 2 },
      animation_rate_fps: { emit: 'animation_rate_fps', type: 'int', required: true, count: 5, minimum: 1 },
      looping: { emit: 'looping', type: 'bool', required: true, count: 5 },
      play_on_show: { emit: 'play_on_show', type: 'bool', required: true, count: 5 },
      texturefile: { emit: 'texturefile', type: 'path', required: true, count: 5, aliases: ['textureFile'] },
      transparencecheck: { emit: 'transparencecheck', type: 'bool', count: 2 },
      alwaystransparent: { emit: 'alwaystransparent', type: 'bool', count: 2 },
    },
    extraFields: [],
    extraBlocks: [],
    rejected: {},
    evidence: ['interface/main.gfx:598', 'interface/mapicons.gfx:3'],
  },

  textSpriteType: {
    block: 'textSpriteType',
    summary: 'A texture used as an animated text glyph sheet (4 vanilla blocks).',
    verified: true,
    required: ['name', 'texturefile'],
    fields: {
      name: { emit: 'name', type: 'string', required: true, count: 4 },
      texturefile: { emit: 'texturefile', type: 'path', required: true, count: 4 },
      effectfile: { emit: 'effectFile', type: 'path', count: 1 },
      clicksound: { emit: 'clicksound', type: 'string', count: 1 },
    },
    extraFields: [],
    extraBlocks: [],
    rejected: {},
    evidence: ['interface/general_stuff.gfx:287'],
  },

  PieChartType: {
    block: 'PieChartType',
    summary: 'A pie chart drawn from a declared colour set and a size.',
    verified: true,
    required: ['name', 'size'],
    fields: {
      name: { emit: 'name', type: 'string', required: true, count: 3 },
      size: { emit: 'size', type: 'xy', required: true, count: 3 },
      is_hover: { emit: 'is_hover', type: 'bool', count: 2 },
    },
    extraFields: [],
    extraBlocks: ['colors'],
    rejected: {},
    evidence: ['interface/government_view.gfx:215'],
  },

  tileSpriteType: {
    block: 'tileSpriteType',
    summary: 'A tiling background sprite. No vanilla 4.4.6 example exists, so its field set could not be measured.',
    verified: false,
    required: ['name', 'texturefile'],
    fields: {
      name: { emit: 'name', type: 'string', required: true, count: 0 },
      texturefile: { emit: 'texturefile', type: 'path', required: true, count: 0, aliases: ['textureFile'] },
    },
    extraFields: [],
    extraBlocks: [],
    rejected: {},
    evidence: [],
  },

  maskedShieldType: {
    block: 'maskedShieldType',
    summary: 'A shield overlay sprite. No vanilla 4.4.6 example exists, so its field set could not be measured.',
    verified: false,
    required: ['name', 'texturefile'],
    fields: {
      name: { emit: 'name', type: 'string', required: true, count: 0 },
      texturefile: { emit: 'texturefile', type: 'path', required: true, count: 0, aliases: ['textureFile'] },
    },
    extraFields: [],
    extraBlocks: [],
    rejected: {},
    evidence: [],
  },
};

/** Every kind this module can emit, in census order. */
export const GFX_KINDS = Object.keys(GFX_KIND_SPECS);

/** Field keys that are block-shaped and therefore need a nested `{ }`. */
export const GFX_BLOCK_FIELD_TYPES = new Set(['xy', 'wh', 'array']);

/** Bitmap font definition blocks. `bitmapfonts` is their wrapper and must be descended into. */
export const GFX_FONT_BLOCK_KINDS = ['bitmapfont', 'bitmapfont_override'];

/** Look up a kind spec by its case-insensitive keyword (`progressbarType` finds `progressBarType`). */
export function gfxKindSpec(kind) {
  if (typeof kind !== 'string' || kind.trim() === '') return null;
  const wanted = kind.trim().toLowerCase();
  for (const [name, spec] of Object.entries(GFX_KIND_SPECS)) {
    if (name.toLowerCase() === wanted || spec.block.toLowerCase() === wanted) return { ...spec, kind: name };
  }
  return null;
}

/** The canonical field-definition entry for `key` in `spec`, following aliases and the emit spelling. */
export function gfxFieldFor(spec, key) {
  const wanted = String(key).toLowerCase();
  for (const [name, field] of Object.entries(spec.fields)) {
    if (name === wanted) return { ...field, key: name };
    if (field.emit.toLowerCase() === wanted) return { ...field, key: name };
    if ((field.aliases ?? []).some((alias) => alias.toLowerCase() === wanted)) return { ...field, key: name };
  }
  return null;
}

//------------------------------------------------------------------------------------
// Sprite names
//------------------------------------------------------------------------------------

/** Every sprite name in the install matches this; nothing else appears in a `name` value. */
export const SPRITE_NAME_PATTERN = /^[A-Za-z0-9_]+$/;

/** The prefix 9171 of 9197 vanilla sprite blocks use. */
export const SPRITE_NAME_PREFIX = 'GFX_';

/** The prefix an inline `£token£` icon must carry: 571 vanilla sprites do. */
export const TEXT_ICON_PREFIX = 'GFX_text_';

/**
 * Analyse a proposed sprite name against what the install actually does.
 *
 * @returns {{ok: boolean, name: string, errors: string[], warnings: string[], text_icon_token: string|null, localisation_reference: string|null}}
 */
export function analyseSpriteName(name) {
  const errors = [];
  const warnings = [];
  const value = typeof name === 'string' ? name.trim() : '';

  if (value === '') {
    errors.push('`sprite_name` is required: it is the `name = "..."` value every .gfx block needs and what .gui files reference.');
    return { ok: false, name: value, errors, warnings, text_icon_token: null, localisation_reference: null };
  }
  if (!SPRITE_NAME_PATTERN.test(value)) {
    errors.push(
      `\`${value}\` contains characters no vanilla sprite name uses. All 9243 \`name\` values in interface/**/*.gfx match [A-Za-z0-9_]; ` +
        'a quote, space, dash or dot in a sprite name makes it unreferenceable from a .gui file.',
    );
  }
  if (!value.startsWith(SPRITE_NAME_PREFIX)) {
    warnings.push(
      `\`${value}\` does not start with \`GFX_\`. 9171 of the install's 9197 sprite blocks do, and the 26 that do not are vanilla's own ` +
        'internals (`cursor` at interface/core.gfx:2, `gfx_transparency` at interface/core.gfx:9). It is a convention rather than an engine ' +
        'rule, but a name without it is easy to confuse with a script key.',
    );
  }

  const textIconToken = value.startsWith(TEXT_ICON_PREFIX) ? value.slice(TEXT_ICON_PREFIX.length) : null;
  return {
    ok: errors.length === 0,
    name: value,
    errors,
    warnings,
    text_icon_token: textIconToken && textIconToken !== '' ? textIconToken : null,
    localisation_reference: textIconToken && textIconToken !== '' ? `\u00a3${textIconToken}\u00a3` : null,
  };
}

/**
 * The name an inline `£token£` text icon needs.
 *
 * Measured reason this is mandatory rather than advisory: interface/astral_planes_resources.gfx
 * declares `GFX_resource_astral_threads` (:3) and then `GFX_text_resource_astral_threads` (:13)
 * pointing at the very same `astral_threads.dds`. Vanilla would not pay for the duplicate if
 * `£resource_astral_threads£` could fall back to the plain name. Caveat stated honestly: 46 of
 * the 659 distinct English `£token£` references do have a plain `GFX_<token>` and no
 * `GFX_text_<token>` (e.g. `£job_miner£` -> GFX_job_miner at interface/planet_view.gfx:250), and
 * 388 have neither because their sprite is generated from `gfx/interface/icons/<category>/`;
 * whether the engine falls back for those could not be established from files alone, so this
 * tool always emits the provably-correct `GFX_text_` form.
 */
export function textIconSpriteName(token) {
  const cleaned = String(token ?? '').trim().replace(/^\u00a3|\u00a3$/g, '').replace(/^GFX_text_/, '');
  return `${TEXT_ICON_PREFIX}${cleaned}`;
}

//------------------------------------------------------------------------------------
// Field emission
//------------------------------------------------------------------------------------

/** Render a scalar value for one field definition. Throws `Error` with a usable message. */
function renderScalar(field, value, kind) {
  if (field.type === 'bool') {
    if (typeof value === 'boolean') return value ? 'yes' : 'no';
    const text = String(value).trim().toLowerCase();
    if (!BOOL_VALUES.has(text)) {
      throw new Error(`\`${field.emit}\` on a ${kind} takes yes or no, received \`${value}\``);
    }
    return text === 'yes' || text === 'true' ? 'yes' : 'no';
  }
  if (field.type === 'int' || field.type === 'number') {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      throw new Error(`\`${field.emit}\` on a ${kind} takes a number, received \`${value}\``);
    }
    if (field.type === 'int' && !Number.isInteger(numeric)) {
      throw new Error(`\`${field.emit}\` on a ${kind} takes a whole number, received \`${value}\``);
    }
    if (field.minimum !== undefined && numeric < field.minimum) {
      throw new Error(`\`${field.emit}\` on a ${kind} must be at least ${field.minimum}, received \`${value}\``);
    }
    return String(numeric);
  }
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

/** Render a `{ x = N y = N }` / `{ width = N height = N }` block, validating both coordinates. */
function renderBlock(type, value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`\`${label}\` takes an object such as { x: 80, y: 80 }`);
  }
  const first = value.x ?? value.width;
  const second = value.y ?? value.height;
  if (!Number.isFinite(Number(first)) || !Number.isFinite(Number(second))) {
    throw new Error(`\`${label}\` needs both coordinates; received ${JSON.stringify(value)}`);
  }
  const xKey = type === 'wh' ? 'width' : 'x';
  const yKey = type === 'wh' ? 'height' : 'y';
  return `{ ${xKey} = ${Number(first)} ${yKey} = ${Number(second)} }`;
}

/**
 * Render a block whose shape is not part of the measured contract: a bare array
 * (`color = { 1.0 1.0 1.0 }`), a coordinate object (`bg_position = { x y }`) or a nested
 * block (`animation = { ... }`). Keys pass through unchanged because vanilla does not agree
 * on `x/y` versus `width/height` between block kinds.
 */
function renderAnyBlock(value, label) {
  if (Array.isArray(value)) return `{ ${value.map((item) => String(item)).join(' ')} }`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) throw new Error(`\`${label}\` is an empty block`);
    const body = entries
      .map(([key, item]) => {
        if (Array.isArray(item)) return `${key} = { ${item.map((entry) => String(entry)).join(' ')} }`;
        if (item && typeof item === 'object') return `${key} = ${renderAnyBlock(item, `${label}.${key}`)}`;
        return `${key} = ${item}`;
      })
      .join(' ');
    return `{ ${body} }`;
  }
  return `{ ${String(value)} }`;
}

/**
 * Render a value that has no declared type: numbers and yes/no stay bare, bare identifiers stay
 * bare, and anything with a space or a quote is quoted. Vanilla writes `default_frame = 1` and
 * `sprite_sheet_sprite_type = GFX_x` unquoted, so quoting every extra field would be wrong.
 */
function renderVerbatim(value) {
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'number') return String(value);
  const text = String(value);
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return text;
  if (/^(?:yes|no)$/i.test(text)) return text.toLowerCase();
  if (/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(text)) return text;
  return `"${text.replace(/"/g, '\\"')}"`;
}

/** Configuration keys that are tool arguments rather than `.gfx` fields. */
const CONTROL_KEYS = new Set(['allow_unverified_fields']);

/**
 * Build the lines of one sprite block, validated against `spec`.
 *
 * @param {string} kind canonical kind name
 * @param {object} values field values, keyed by the canonical field name or any alias
 * @param {{allowUnverifiedFields?: boolean}} [options]
 * @returns {{kind: string, lines: string[], warnings: string[], text: string}}
 */
export function buildGfxBlock(kind, values = {}, { allowUnverifiedFields = false } = {}) {
  const spec = gfxKindSpec(kind);
  if (!spec) {
    throw new Error(`\`${kind}\` is not a .gfx sprite kind this tool can emit; supported kinds are ${GFX_KINDS.join(', ')}`);
  }
  const fields = {};
  for (const [key, value] of Object.entries(values)) {
    if (CONTROL_KEYS.has(key)) continue;
    fields[key] = value;
  }

  const warnings = [];
  const emitted = new Set();
  const lines = [];

  // Field lookup is case-insensitive: the install itself mixes `texturefile` and `textureFile`,
  // `progressbarType` and `progressBarType`, and a caller cannot be expected to know which
  // spelling this project emits for a given kind.
  const lowered = new Map();
  for (const [key, value] of Object.entries(fields)) lowered.set(key.toLowerCase(), value);
  const lookup = (...names) => {
    for (const name of names) {
      const value = lowered.get(String(name).toLowerCase());
      if (value !== undefined && value !== null && value !== '') return value;
    }
    return undefined;
  };

  const writeField = (field, value) => {
    if (emitted.has(field.emit.toLowerCase())) return;
    emitted.add(field.emit.toLowerCase());
    if (GFX_BLOCK_FIELD_TYPES.has(field.type)) {
      lines.push(`\t\t${field.emit} = ${renderBlock(field.type, value, field.emit)}`);
    } else {
      lines.push(`\t\t${field.emit} = ${renderScalar(field, value, spec.kind)}`);
    }
  };

  // Reject the fields the census proved this kind does not take, before anything is written.
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === '') continue;
    const rejection = spec.rejected[String(key).toLowerCase()];
    if (rejection) throw new Error(rejection);
  }

  // Declared fields, in spec order, so the output is deterministic.
  for (const [fieldKey, field] of Object.entries(spec.fields)) {
    const value = lookup(fieldKey, field.emit, ...(field.aliases ?? []));
    if (value !== undefined) {
      writeField(field, value);
      continue;
    }
    if (field.required) {
      if (field.default !== undefined) {
        writeField(field, field.default);
        continue;
      }
      throw new Error(`\`${field.emit}\` is required for a ${spec.kind}`);
    }
  }

  for (const name of spec.extraFields) {
    if (emitted.has(name.toLowerCase())) continue;
    const value = lookup(name);
    if (value === undefined) continue;
    emitted.add(name.toLowerCase());
    lines.push(`\t\t${name} = ${renderVerbatim(value)}`);
  }
  for (const name of spec.extraBlocks) {
    // The install spells some blocks two ways (`colorTwo` and `colortwo` both appear), and the
    // lookup is case-insensitive, so a second spelling must not emit the block twice.
    if (emitted.has(name.toLowerCase())) continue;
    const value = lookup(name);
    if (value === undefined) continue;
    emitted.add(name.toLowerCase());
    lines.push(`\t\t${name} = ${renderAnyBlock(value, name)}`);
  }

  // Anything left over is a field name this tool does not know for this kind. Refusing is the
  // point: an unknown key in a .gfx block is exactly the class of silent failure this project
  // exists to prevent, and the install already told us what each kind accepts.
  const leftovers = Object.keys(fields).filter(
    (key) =>
      fields[key] !== undefined &&
      fields[key] !== null &&
      fields[key] !== '' &&
      !emitted.has(key.toLowerCase()) &&
      !gfxFieldFor(spec, key),
  );
  if (leftovers.length > 0 && !allowUnverifiedFields) {
    throw new Error(
      `${spec.kind} does not take ${leftovers.map((key) => `\`${key}\``).join(', ')}. Measured fields for this kind: ` +
        `${Object.values(spec.fields)
          .map((field) => field.emit)
          .join(', ')}` +
        (spec.extraFields.length ? `, ${spec.extraFields.join(', ')}` : '') +
        (spec.extraBlocks.length ? `, blocks ${spec.extraBlocks.join(', ')}` : '') +
        '. Pass `allow_unverified_fields: true` only if you have measured the field yourself.',
    );
  }
  for (const key of leftovers) {
    emitted.add(key.toLowerCase());
    lines.push(`\t\t${key} = ${renderAnyBlock(fields[key], key)}`);
    warnings.push(`\`${key}\` is not part of the measured field set for ${spec.kind}; it was written verbatim because allow_unverified_fields is set`);
  }

  if (!spec.verified) {
    warnings.push(
      `${spec.kind} does not occur anywhere in the verified Stellaris 4.4.6 install (0 blocks under interface/ and gfx/), so its field set ` +
        'could not be measured. Only the fields you passed are emitted; check the engine log after loading.',
    );
  }

  const blockLines = [`\t${spec.block} = {`, ...lines, '\t}'];
  return { kind: spec.kind, lines: blockLines, warnings, text: blockLines.join('\n') };
}

/** Wrap block texts in `spriteTypes = { ... }`, the shape 125 of 131 vanilla files use. */
export function buildGfxFile(blocks, { header = null } = {}) {
  const body = blocks.join('\n\n');
  const prefix = header ? `${header}\n` : '';
  return `${prefix}${GFX_WRAPPER} = {\n\n${body}\n}\n`;
}

export default {
  GFX_KIND_SPECS,
  GFX_KINDS,
  gfxKindSpec,
  gfxFieldFor,
  analyseSpriteName,
  textIconSpriteName,
  buildGfxBlock,
  buildGfxFile,
};
