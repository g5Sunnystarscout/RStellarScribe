//------------------------------------------------------------------------------------
// texture.mjs -- Part of RStellarisScribe
//
// Texture *header* reading for the three containers the engine actually loads. This is
// the read-only half of what a sprite registration needs: dimensions, pixel format, mip
// count and whether the alpha channel is real, so `register_image_asset` can report an
// honest texture fact sheet and refuse a format the engine cannot sample.
//
// Reuse note (the sibling-plugin rule). `RStellarisGui/src/lib/dds.mjs` already parses
// DDS headers, and `RStellarisGui/src/lib/png.mjs` already reads PNG. Both are
// AGPL-3.0-or-later and by the same author. `parseDdsHeader`, `readDdsHeader`,
// `readTextureHeader` and the PNG branch of the latter are VENDORED here verbatim in
// behaviour - same byte offsets, same constants, same `{ok, reason}` result shape - so
// there is no second, divergent parser of the same bytes. The parts of the sibling file
// that are deliberately NOT carried over are the BC1/BC2/BC3 decoder, the mip walker that
// finds each level's offset, and the PNG *writer* in png.mjs: this plugin never renders a
// pixel, and importing them would drag ~950 lines of GUI-preview code into a package that
// must stay standalone (RStellarisGui is a separate checkout, not a dependency of this
// one). The TGA header has no sibling implementation and is written here.
//
// Measured on the verified Stellaris 4.4.6 install (`<Stellaris>`):
//
//   gfx/**/*.dds (21305 files)          container / pixel format
//     uncompressed 32bpp + alpha  13290
//     fourcc DXT5                   6579
//     fourcc DXT1                    645
//     uncompressed 24bpp             621
//     fourcc DXT3                    153
//     uncompressed 16bpp + alpha      15
//     unparsable                       2   (the format check below reports these by name)
//   gfx/**/*.tga   19 files, 16 of them referenced from a `texturefile` key, e.g.
//     interface/core.gfx:11   texturefile = "gfx/interface/tiles/invisible.tga"
//   gfx/**/*.png   16 files, 4 referenced from a `texturefile` key, e.g.
//     interface/main.gfx:293  texturefile = "gfx/interface/main/avoid_system_bg.png"
//   nothing else under gfx/ is a texture the .gfx registry points at (the rest is
//   .mesh/.anim/.asset/.shader and font atlases).
//
// So DDS (BC1/BC2/BC3 or 16/24/32-bit uncompressed), TGA and PNG are all engine-loadable
// containers, and that is the set accepted here.
//
// This program is free software: you can redistribute it and/or modify it under the terms
// of the GNU Affero General Public License as published by the Free Software Foundation,
// either version 3 of the License, or (at your option) any later version.
//------------------------------------------------------------------------------------

import { existsSync, openSync, readSync, closeSync, statSync } from 'node:fs';

export const DDS_MAGIC = 0x20534444; // 'DDS '
const DDS_HEADER_SIZE = 124;
const DDS_PIXELFORMAT_SIZE = 32;

const DDPF_ALPHAPIXELS = 0x1;
const DDPF_FOURCC = 0x4;
const DDPF_RGB = 0x40;
const DDPF_LUMINANCE = 0x20000;

const D3D10_RESOURCE_DIMENSION_TEXTURE2D = 3;
const DXGI_FORMAT_BC1_UNORM = 71;
const DXGI_FORMAT_BC2_UNORM = 74;
const DXGI_FORMAT_BC3_UNORM = 77;
const DXGI_FORMAT_BC7_UNORM = 98;

/** FourCC codes whose bit layout the install ships (all S3TC/BC1-3 or BC4/BC5). */
export const DECODABLE_FOURCC = ['DXT1', 'DXT2', 'DXT3', 'DXT4', 'DXT5', 'ATI1', 'BC4U', 'ATI2', 'BC5U'];

/** Block-compressed formats present in 4.4.6, mapped from the FourCC / DXGI code. */
export const COMPRESSED_FORMATS = ['BC1', 'BC2', 'BC3'];

/** Uncompressed bit depths present in 4.4.6 (`gfx/interface/removed.dds` and friends). */
export const UNCOMPRESSED_DEPTHS = [16, 24, 32];

/** Texture containers a `texturefile` key may name, measured under `gfx/`. */
export const TEXTURE_EXTENSIONS = ['.dds', '.tga', '.png'];

/** Header layout offsets, relative to the start of the 128-byte DDS header. */
const OFFSET = {
  size: 4,
  flags: 8,
  height: 12,
  width: 16,
  pitchOrLinearSize: 20,
  depth: 24,
  mipMapCount: 28,
  pfSize: 76,
  pfFlags: 80,
  pfFourCC: 84,
  pfRGBBitCount: 88,
  pfRMask: 92,
  pfGMask: 96,
  pfBMask: 100,
  pfAMask: 104,
};

/**
 * Parse a DDS header from a buffer (at least 128 bytes).
 *
 * Returns `{ok: false, reason}` rather than throwing: the install has files that are not
 * readable textures, and a header reader that throws turns one odd file into a failed tool
 * call instead of a reported finding.
 */
export function parseDdsHeader(buffer) {
  if (!buffer || buffer.length < 128) return { ok: false, reason: 'shorter than 128 bytes' };
  if (buffer.readUInt32LE(0) !== DDS_MAGIC) return { ok: false, reason: 'missing DDS magic' };
  if (buffer.readUInt32LE(OFFSET.size) !== DDS_HEADER_SIZE) {
    return { ok: false, reason: `header size ${buffer.readUInt32LE(OFFSET.size)} != 124` };
  }

  const height = buffer.readUInt32LE(OFFSET.height);
  const width = buffer.readUInt32LE(OFFSET.width);
  const declaredMipCount = buffer.readUInt32LE(OFFSET.mipMapCount);
  const pfFlags = buffer.readUInt32LE(OFFSET.pfFlags);
  const fourCC = buffer.toString('latin1', OFFSET.pfFourCC, OFFSET.pfFourCC + 4);
  const rgbBitCount = buffer.readUInt32LE(OFFSET.pfRGBBitCount);

  let mipCount = declaredMipCount;
  if (!(buffer.readUInt32LE(OFFSET.flags) & 0x20000) || mipCount === 0) {
    // DDS_HEADER_FLAGS_MIPMAP (0x20000) not set: exactly one mip is present.
    mipCount = 1;
  }
  // A texture can never have more mips than its dimensions allow, so a bogus count is
  // clamped instead of being reported as fact.
  const maxMips = Math.floor(Math.log2(Math.max(width, height))) + 1;
  const mipCountPlausible = mipCount >= 1 && mipCount <= Math.max(1, maxMips);

  const pixelFormat = { flags: pfFlags, fourCC: fourCC.trim(), rgbBitCount };
  let format;
  let blockBytes = 0; // bytes per 4x4 block for BC formats
  let bytesPerPixel = 0;
  let dx10 = null;
  let dataOffset = 128;

  if (pfFlags & DDPF_FOURCC) {
    const code = fourCC.trim();
    if (code === 'DX10') {
      if (buffer.length < 148) return { ok: false, reason: 'DX10 header truncated' };
      const dxgiFormat = buffer.readUInt32LE(128);
      const dimension = buffer.readUInt32LE(132);
      dx10 = {
        dxgiFormat,
        dimension,
        arraySize: buffer.readUInt32LE(136),
        miscFlags2: buffer.readUInt32LE(144),
      };
      dataOffset = 148;
      if (dimension !== D3D10_RESOURCE_DIMENSION_TEXTURE2D) {
        return { ok: false, reason: `DX10 dimension ${dimension} is not a 2D texture`, width, height, dx10 };
      }
      if (dxgiFormat === DXGI_FORMAT_BC1_UNORM) {
        format = 'BC1';
        blockBytes = 8;
      } else if (dxgiFormat === DXGI_FORMAT_BC2_UNORM) {
        format = 'BC2';
        blockBytes = 16;
      } else if (dxgiFormat === DXGI_FORMAT_BC3_UNORM) {
        format = 'BC3';
        blockBytes = 16;
      } else {
        return {
          ok: false,
          reason: dxgiFormat === DXGI_FORMAT_BC7_UNORM ? 'BC7 is not supported' : `unsupported DXGI format ${dxgiFormat}`,
          width,
          height,
          dx10,
        };
      }
    } else if (code === 'DXT1' || code === 'ATI1' || code === 'BC4U') {
      format = 'BC1';
      blockBytes = 8;
    } else if (code === 'DXT3') {
      format = 'BC2';
      blockBytes = 16;
    } else if (code === 'DXT5' || code === 'ATI2' || code === 'BC5U') {
      format = 'BC3';
      blockBytes = 16;
    } else if (code === 'DXT2') {
      // DXT2 is BC2 with premultiplied alpha; the bit layout is identical.
      format = 'BC2';
      blockBytes = 16;
    } else if (code === 'DXT4') {
      format = 'BC3';
      blockBytes = 16;
    } else {
      return { ok: false, reason: `unsupported FourCC ${code || '(empty)'}`, width, height };
    }
  } else if (pfFlags & (DDPF_RGB | DDPF_LUMINANCE)) {
    if (!UNCOMPRESSED_DEPTHS.includes(rgbBitCount)) {
      return { ok: false, reason: `unsupported uncompressed depth ${rgbBitCount}`, width, height };
    }
    format = `RGBA${rgbBitCount}`;
    bytesPerPixel = rgbBitCount / 8;
  } else {
    return { ok: false, reason: `pixel format flags 0x${pfFlags.toString(16)} not understood`, width, height };
  }

  return {
    ok: true,
    width,
    height,
    mipCount: mipCountPlausible ? mipCount : 1,
    declaredMipCount,
    mipCountPlausible,
    format,
    blockBytes,
    bytesPerPixel,
    compressed: blockBytes > 0,
    pixelFormat,
    dx10,
    dataOffset,
    fileSize: buffer.length,
    masks: {
      r: buffer.readUInt32LE(OFFSET.pfRMask),
      g: buffer.readUInt32LE(OFFSET.pfGMask),
      b: buffer.readUInt32LE(OFFSET.pfBMask),
      a: buffer.readUInt32LE(OFFSET.pfAMask),
    },
    // DDPF_ALPHAPIXELS says the pixel format *has* an alpha field. It does not prove the
    // field is used: vanilla ships 32-bit BGRA files whose alpha bytes are all zero while
    // the flag is set, which is why the sibling preview forces those opaque. Header-only
    // reading cannot see that, so the distinction is kept in the name.
    hasAlpha: Boolean(pfFlags & DDPF_ALPHAPIXELS),
  };
}

/** Read just the DDS header of a file on disk (128 or 148 bytes, never the whole image). */
export function readDdsHeader(path) {
  if (!existsSync(path)) return { ok: false, reason: 'file not found', path };
  const stats = statSync(path);
  const length = Math.min(148, stats.size);
  if (length < 128) return { ok: false, reason: 'file shorter than a DDS header', path, size: stats.size };
  const buffer = Buffer.alloc(length);
  const fd = openSync(path, 'r');
  try {
    readSync(fd, buffer, 0, length, 0);
  } finally {
    closeSync(fd);
  }
  return { ...parseDdsHeader(buffer), path, size: stats.size };
}

/** PNG colour types, as the header names them. */
const PNG_COLOUR_TYPE_NAMES = ['G', '?', 'RGB', 'PAL', 'GA', '?', 'RGBA'];

/**
 * Parse a PNG header from the first 33 bytes.
 *
 * PNG is not theoretical here: `interface/main.gfx:293` and `:298`, `:303` plus
 * `interface/market_view.gfx:9` declare `spriteType` blocks whose `texturefile` is
 * `gfx/interface/main/*.png`, so a reader that only knows DDS reports four false failures.
 */
export function parsePngHeader(buffer) {
  if (!buffer || buffer.length < 33) return { ok: false, reason: 'PNG header truncated' };
  if (buffer[0] !== 0x89 || buffer.toString('latin1', 1, 4) !== 'PNG') return { ok: false, reason: 'missing PNG signature' };
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const bitDepth = buffer[24];
  const colourType = buffer[25];
  const interlace = buffer[28];
  return {
    ok: true,
    width,
    height,
    bitDepth,
    colourType,
    compression: buffer[26],
    filter: buffer[27],
    interlace,
    format: `PNG${bitDepth}${PNG_COLOUR_TYPE_NAMES[colourType] ?? `C${colourType}`}`,
    mipCount: 1,
    hasAlpha: colourType === 4 || colourType === 6 || colourType === 3,
    // The four shipped PNGs are 8-bit colour type 6, non-interlaced.
    decodable: interlace === 0 && bitDepth === 8 && [0, 2, 3, 4, 6].includes(colourType),
    reason:
      interlace !== 0 ? 'interlaced PNG' : bitDepth !== 8 ? `bit depth ${bitDepth}` : undefined,
  };
}

/** TGA image types, by number, as the format defines them. */
const TGA_IMAGE_TYPES = {
  0: 'none',
  1: 'colour-mapped',
  2: 'truecolour',
  3: 'greyscale',
  9: 'RLE colour-mapped',
  10: 'RLE truecolour',
  11: 'RLE greyscale',
};

/**
 * Parse a TGA header (the first 18 bytes).
 *
 * TGA has no magic number, so this is only attempted for a `.tga` extension. 19 `.tga`
 * files ship under `gfx/` and 16 are referenced from a `texturefile` key, e.g.
 * `interface/core.gfx:11  texturefile = "gfx/interface/tiles/invisible.tga"`, so the
 * container is engine-loadable and worth reading rather than rejecting.
 */
export function parseTgaHeader(buffer) {
  if (!buffer || buffer.length < 26) return { ok: false, reason: 'shorter than an 18-byte TGA header plus a pixel' };
  const idLength = buffer[0];
  const colourMapType = buffer[1];
  const imageType = buffer[2];
  const colourMapDepth = buffer[7];
  const width = buffer.readUInt16LE(12);
  const height = buffer.readUInt16LE(14);
  const pixelDepth = buffer[16];
  const descriptor = buffer[17];
  const attributeBits = descriptor & 0x0f;

  if (colourMapType !== 0 && colourMapType !== 1) {
    return { ok: false, reason: `colour map type ${colourMapType} is not 0 or 1` };
  }
  if (!TGA_IMAGE_TYPES[imageType]) return { ok: false, reason: `image type ${imageType} is not a TGA image type` };
  if (imageType === 0) return { ok: false, reason: 'no image data (image type 0)' };
  if (![8, 15, 16, 24, 32].includes(pixelDepth)) {
    return { ok: false, reason: `unsupported pixel depth ${pixelDepth}` };
  }
  if (width === 0 || height === 0) return { ok: false, reason: `degenerate dimensions ${width}x${height}` };
  if (idLength > 0 && buffer.length < 18 + idLength) return { ok: false, reason: 'image id field truncated' };

  const colourMapped = imageType === 1 || imageType === 9;
  const greyscale = imageType === 3 || imageType === 11;
  const rle = imageType >= 9;
  const bitsPerPixel = colourMapped ? colourMapDepth : pixelDepth;
  const format = colourMapped
    ? `TGA${pixelDepth}PAL${colourMapDepth}`
    : greyscale
      ? `TGA${pixelDepth}G`
      : `TGA${pixelDepth}${attributeBits > 0 ? 'A' : ''}`;

  return {
    ok: true,
    width,
    height,
    format,
    bitDepth: pixelDepth,
    colourMapDepth: colourMapped ? colourMapDepth : null,
    colourMapped,
    greyscale,
    rle,
    // Bit 5 of the descriptor means the first pixel is the top-left; otherwise the image
    // is stored bottom-up, which matters to anything that reads the pixels.
    topDown: Boolean(descriptor & 0x20),
    attributeBits,
    mipCount: 1,
    bytesPerPixel: bitsPerPixel / 8,
    hasAlpha: greyscale ? false : attributeBits > 0 || (!colourMapped && pixelDepth === 32),
    decodable: true,
  };
}

/**
 * Read a texture header for any container the engine loads, dispatching on the extension
 * and then on the signature. Returns a normalised `{container, width, height, format,
 * mipCount, hasAlpha, ...}` record, or `{ok: false, reason}`.
 */
export function readTextureHeader(path) {
  if (!existsSync(path)) return { ok: false, reason: 'file not found', path };
  const stats = statSync(path);
  const lower = path.toLowerCase();
  const length = Math.min(148, stats.size);
  if (length < 18) return { ok: false, reason: 'file is too short to hold a texture header', path, size: stats.size };
  const probe = Buffer.alloc(length);
  const fd = openSync(path, 'r');
  try {
    readSync(fd, probe, 0, length, 0);
  } finally {
    closeSync(fd);
  }

  const base = { path, size: stats.size, extension: lower.slice(lower.lastIndexOf('.')) };

  if (probe[0] === 0x89 && probe.toString('latin1', 1, 4) === 'PNG') {
    return { ...parsePngHeader(probe), ...base, container: 'png' };
  }
  if (probe.toString('latin1', 0, 4) === 'DDS ') {
    return { ...parseDdsHeader(probe), ...base, container: 'dds' };
  }
  if (lower.endsWith('.tga')) {
    return { ...parseTgaHeader(probe), ...base, container: 'tga' };
  }
  if (lower.endsWith('.dds')) {
    return { ok: false, reason: 'missing DDS magic', ...base, container: 'dds' };
  }
  return {
    ok: false,
    reason:
      `the engine's .gfx registry only points at .dds, .tga and .png textures in 4.4.6; ` +
      `\`${lower.slice(lower.lastIndexOf('.'))}\` is not one of them`,
    ...base,
    container: null,
  };
}

/**
 * Judge a header against the formats the install actually ships, so a caller gets a
 * warning it can act on rather than a silent "unsupported".
 *
 * @returns {{accepted: boolean, supported: boolean, warnings: string[]}}
 */
export function judgeTextureFormat(header) {
  const warnings = [];
  if (!header?.ok) return { accepted: false, supported: false, warnings: [`the texture header could not be read: ${header?.reason ?? 'unknown'}`] };

  if (header.container === 'dds') {
    if (header.compressed && !COMPRESSED_FORMATS.includes(header.format)) {
      warnings.push(`DDS format ${header.format} is not one of ${COMPRESSED_FORMATS.join('/')}, which is all 4.4.6 ships`);
    }
    if (!header.compressed && !UNCOMPRESSED_DEPTHS.includes(header.pixelFormat?.rgbBitCount)) {
      warnings.push(`uncompressed DDS depth ${header.pixelFormat?.rgbBitCount}bpp is not one of ${UNCOMPRESSED_DEPTHS.join('/')}`);
    }
    if (header.dx10) {
      warnings.push('this DDS carries a DX10 extended header; none of the 21305 install DDS files do, so the engine path for it is unverified');
    }
    if (header.mipCount === 1) {
      warnings.push('this DDS has a single mip level; 15382 of the 21305 install DDS files do, so mips are not mandatory, but UI art usually ships them');
    }
    if (!header.mipCountPlausible) {
      warnings.push(`the declared mip count (${header.declaredMipCount}) is larger than the dimensions allow; treating it as 1`);
    }
  }
  if (header.container === 'png') {
    if (!header.decodable) warnings.push(`PNG: ${header.reason}; the four PNGs the install references are all 8-bit colour type 6, non-interlaced`);
    warnings.push('PNG is accepted but rare: only 4 of the 6916 distinct texture paths the install registers are PNG, against 6895 DDS and 16 TGA');
  }
  if (header.container === 'tga' && header.rle) {
    warnings.push('RLE-compressed TGA; the install ships none, so the engine path for it is unverified');
  }
  if (header.width > 4096 || header.height > 4096) {
    warnings.push(`${header.width}x${header.height} is larger than any texture the install ships (largest is 4096x4096)`);
  }
  return {
    accepted: true,
    supported: warnings.length === 0,
    warnings,
  };
}

export default {
  parseDdsHeader,
  readDdsHeader,
  parsePngHeader,
  parseTgaHeader,
  readTextureHeader,
  judgeTextureFormat,
  DDS_MAGIC,
  DECODABLE_FOURCC,
  COMPRESSED_FORMATS,
  UNCOMPRESSED_DEPTHS,
  TEXTURE_EXTENSIONS,
};
