/**
 * Generates the LetsHunt PWA icon set from the HUNT logo photo:
 *
 *   Source:  "HUNT (120 x 120 px).png" (project root)
 *   Outputs: public/hunt-icon-120.png        (120x120  — original)
 *            public/icon-192-v8.png          (192x192)
 *            public/icon-512-v8.png          (512x512)
 *            public/apple-touch-icon-v8.png  (180x180)
 *            public/splash-logo-1024.png     (1024x1024 — PWA launch-splash icon)
 *
 * Rendered dependency-free (Node built-ins only — no sharp / cairosvg):
 * the PNG is decoded (zlib inflate + scanline unfiltering), up-scaled with
 * bilinear interpolation, and re-encoded as an RGB PNG.
 *
 *   Usage: node scripts/generate-splash.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import zlib from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcPath = path.join(root, 'HUNT (120 x 120 px).png');
const outDir = path.join(root, 'public');

const TARGETS = [
  { out: 'hunt-icon-120.png', size: 120 },
  { out: 'icon-192-v8.png', size: 192 },
  { out: 'icon-512-v8.png', size: 512 },
  { out: 'apple-touch-icon-v8.png', size: 180 },
  { out: 'splash-logo-1024.png', size: 1024 },
];

// ---------------------------------------------------------------------------
// 1. Decode the source PNG (8-bit RGB/RGBA, non-interlaced)
// ---------------------------------------------------------------------------
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('Not a PNG file');

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let idat = Buffer.alloc(0);
  let offset = 8;

  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat = Buffer.concat([idat, data]);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + len;
  }

  if (bitDepth !== 8) throw new Error(`Unsupported bit depth: ${bitDepth}`);
  // Color types: 2 = RGB, 6 = RGBA. Flatten RGBA onto white.
  if (colorType !== 2 && colorType !== 6) throw new Error(`Unsupported color type: ${colorType}`);
  const bpp = colorType === 6 ? 4 : 3;

  const raw = zlib.inflateSync(idat);
  const stride = 1 + width * bpp;
  const rgb = Buffer.alloc(width * height * 3);

  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
  };

  for (let y = 0; y < height; y++) {
    const filter = raw[y * stride];
    const row = raw.subarray(y * stride + 1, (y + 1) * stride);
    for (let x = 0; x < width; x++) {
      for (let k = 0; k < 3; k++) {
        const cur = row[x * bpp + k];
        const a = x > 0 ? rgb[(y * width + x - 1) * 3 + k] : 0;
        const b = y > 0 ? rgb[((y - 1) * width + x) * 3 + k] : 0;
        const c = y > 0 && x > 0 ? rgb[((y - 1) * width + x - 1) * 3 + k] : 0;
        let val;
        switch (filter) {
          case 0: val = cur; break;
          case 1: val = cur + a; break;
          case 2: val = cur + b; break;
          case 3: val = cur + ((a + b) >> 1); break;
          case 4: val = cur + paeth(a, b, c); break;
          default: throw new Error(`Unknown PNG filter: ${filter}`);
        }
        rgb[(y * width + x) * 3 + k] = val & 0xff;
      }
    }
  }

  return { width, height, rgb };
}

// ---------------------------------------------------------------------------
// 2. Bilinear up-scale (also handles RGBA flattened over white on decode)
// ---------------------------------------------------------------------------
function resizeBilinear(src, sw, sh, size) {
  const out = Buffer.alloc(size * size * 3);
  const get = (x, y) => {
    const xi = Math.min(sw - 1, Math.max(0, x));
    const yi = Math.min(sh - 1, Math.max(0, y));
    const o = (yi * sw + xi) * 3;
    return [src[o], src[o + 1], src[o + 2]];
  };
  for (let ty = 0; ty < size; ty++) {
    const sy = ((ty + 0.5) * sh) / size - 0.5;
    const y0 = Math.floor(sy);
    const fy = sy - y0;
    for (let tx = 0; tx < size; tx++) {
      const sx = ((tx + 0.5) * sw) / size - 0.5;
      const x0 = Math.floor(sx);
      const fx = sx - x0;
      const p00 = get(x0, y0);
      const p10 = get(x0 + 1, y0);
      const p01 = get(x0, y0 + 1);
      const p11 = get(x0 + 1, y0 + 1);
      const o = (ty * size + tx) * 3;
      for (let k = 0; k < 3; k++) {
        const top = p00[k] + (p10[k] - p00[k]) * fx;
        const bot = p01[k] + (p11[k] - p01[k]) * fx;
        out[o + k] = Math.round(top + (bot - top) * fy);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 3. Encode as an RGB PNG (zlib is built into Node)
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width, height, rgb) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---------------------------------------------------------------------------
// 4. Generate every size and write the files
// ---------------------------------------------------------------------------
const src = readFileSync(srcPath);
const { width, height, rgb } = decodePng(src);
console.log(`Source: ${width}x${height} — ${srcPath}`);

for (const target of TARGETS) {
  const outPath = path.join(outDir, target.out);
  let output;
  if (target.size === width && target.size === height) {
    output = encodePng(target.size, target.size, rgb);
  } else {
    const scaled = resizeBilinear(rgb, width, height, target.size);
    output = encodePng(target.size, target.size, scaled);
  }
  writeFileSync(outPath, output);
  console.log(`Wrote ${outPath} (${target.size}x${target.size})`);
}
console.log('Done — remember to bump APP_VERSION (src/main.tsx) and the SW cache version on deploy.');
