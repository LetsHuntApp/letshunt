/**
 * Generates public/splash-logo-1024.png from the deer icon used on the
 * score dial (src/components/DeerIcon.tsx): a BLACK deer on a pure WHITE
 * 1024x1024 canvas.
 *
 * Rendered dependency-free (Node built-ins only — no sharp / cairosvg),
 * so it runs anywhere Node is installed:
 *
 *   Usage: node scripts/generate-splash.mjs
 *
 * The deer path is flattened to polylines, rasterized with the SVG
 * nonzero winding rule at 4x supersampling for antialiased edges, then
 * box-downsampled onto a white background and written as an RGB PNG.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import zlib from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const deerIconPath = path.join(root, 'src', 'components', 'DeerIcon.tsx');
const outPath = path.join(root, 'public', 'splash-logo-1024.png');

const SIZE = 1024; // final canvas size (square)
const SS = 4; // supersample factor (SS*SS == antialiasing levels)
const RASTER = SIZE * SS;
const FIT = 0.85; // the deer fills up to 85% of the canvas

// ---------------------------------------------------------------------------
// 1. Extract the deer path `d` attribute from DeerIcon.tsx
// ---------------------------------------------------------------------------
const tsx = readFileSync(deerIconPath, 'utf8');
const dMatch = tsx.match(/\bd="([^"]+)"/);
if (!dMatch) throw new Error(`Could not find the deer path 'd' attribute in ${deerIconPath}`);
const d = dMatch[1];

// ---------------------------------------------------------------------------
// 2. Parse the path (only M / L / C / Z appear in the deer icon)
// ---------------------------------------------------------------------------
const tokens = d.match(/[MLCZ]|-?\d*\.?\d+(?:[eE][+-]?\d+)?/g);
if (!tokens) throw new Error('Deer path contains no tokens');

function isNumber(token) {
  return /^-?\d/.test(token);
}

/**
 * Parses the path into subpaths of control points (raw SVG coordinates).
 * Every segment is normalized to cubic beziers so the same flattening
 * code handles lines and moves.
 */
function parsePath() {
  let i = 0;
  const num = () => parseFloat(tokens[i++]);
  const subpaths = [];
  let sub = [];
  let cur = null;
  let start = null;

  const pushSubpath = () => {
    if (sub.length) subpaths.push(sub);
  };

  while (i < tokens.length) {
    const c = tokens[i++];
    if (c === 'M') {
      pushSubpath();
      sub = [];
      cur = [num(), num()];
      start = cur;
      // Implicit line-to segments after M (per SVG spec).
      while (i < tokens.length && isNumber(tokens[i])) {
        const prev = cur;
        cur = [num(), num()];
        sub.push([prev, cur]);
      }
    } else if (c === 'L') {
      while (i < tokens.length && isNumber(tokens[i])) {
        const prev = cur;
        cur = [num(), num()];
        sub.push([prev, cur]);
      }
    } else if (c === 'C') {
      while (i < tokens.length && isNumber(tokens[i])) {
        const c1 = [num(), num()];
        const c2 = [num(), num()];
        const end = [num(), num()];
        sub.push([cur, c1, c2, end]);
        cur = end;
      }
    } else if (c === 'Z') {
      if (cur && start && (cur[0] !== start[0] || cur[1] !== start[1])) {
        sub.push([cur, start]);
      }
      cur = start;
    }
  }
  pushSubpath();
  return subpaths;
}

// ---------------------------------------------------------------------------
// 3. Bounds, then map SVG coordinates into the supersampled raster space
// ---------------------------------------------------------------------------
const rawSubpaths = parsePath();
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
for (const sub of rawSubpaths) {
  for (const seg of sub) {
    for (const pt of seg) {
      if (pt[0] < minX) minX = pt[0];
      if (pt[1] < minY) minY = pt[1];
      if (pt[0] > maxX) maxX = pt[0];
      if (pt[1] > maxY) maxY = pt[1];
    }
  }
}
const spanX = maxX - minX;
const spanY = maxY - minY;
const scale = (FIT * RASTER) / Math.max(spanX, spanY);
const tx = (RASTER - spanX * scale) / 2 - minX * scale;
const ty = (RASTER - spanY * scale) / 2 - minY * scale;

// Transform each point into raster space: x' = x*scale + tx, y' = y*scale + ty.
const map = (pt) => [pt[0] * scale + tx, pt[1] * scale + ty];
const subpaths = rawSubpaths.map((sub) => sub.map((seg) => seg.map(map)));

// ---------------------------------------------------------------------------
// 4. Flatten cubics to polylines (de Casteljau, flatness in raster pixels)
// ---------------------------------------------------------------------------
const FLAT_EPS = 0.25;

function flattenCubic(p0, p1, p2, p3, out) {
  const dx = p3[0] - p0[0];
  const dy = p3[1] - p0[1];
  const len2 = dx * dx + dy * dy;
  // Distance from each control point to the p0->p3 chord (line distance).
  const d1 = Math.abs((p1[0] - p3[0]) * dy - (p1[1] - p3[1]) * dx) / Math.sqrt(len2 || 1);
  const d2 = Math.abs((p2[0] - p3[0]) * dy - (p2[1] - p3[1]) * dx) / Math.sqrt(len2 || 1);
  if (len2 < 1e-12 || (d1 <= FLAT_EPS && d2 <= FLAT_EPS)) {
    out.push(p3);
    return;
  }
  const p01 = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
  const p12 = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
  const p23 = [(p2[0] + p3[0]) / 2, (p2[1] + p3[1]) / 2];
  const p012 = [(p01[0] + p12[0]) / 2, (p01[1] + p12[1]) / 2];
  const p123 = [(p12[0] + p23[0]) / 2, (p12[1] + p23[1]) / 2];
  const p0123 = [(p012[0] + p123[0]) / 2, (p012[1] + p123[1]) / 2];
  flattenCubic(p0, p01, p012, p0123, out);
  flattenCubic(p0123, p123, p23, p3, out);
}

const polygons = subpaths.map((sub) => {
  const pts = [];
  for (let s = 0; s < sub.length; s++) {
    const seg = sub[s];
    if (s === 0) pts.push(seg[0]); // subpath start (flattening never emits it)
    if (seg.length === 2) {
      pts.push(seg[1]); // line: endpoint
    } else {
      flattenCubic(seg[0], seg[1], seg[2], seg[3], pts);
    }
  }
  return pts;
});

// ---------------------------------------------------------------------------
// 5. Rasterize with the nonzero winding rule (scanline fill at SS scale)
// ---------------------------------------------------------------------------
const edges = [];
for (const poly of polygons) {
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k];
    const b = poly[(k + 1) % poly.length];
    if (a[0] !== b[0] || a[1] !== b[1]) edges.push([a[0], a[1], b[0], b[1]]);
  }
}

const cover = new Uint8Array(RASTER * RASTER); // 1 = inside, 0 = outside
const rowXs = [];
for (let y = 0; y < RASTER; y++) {
  const y0 = y + 0.5;
  rowXs.length = 0;
  for (let e = 0; e < edges.length; e++) {
    const [x1, y1, x2, y2] = edges[e];
    if (y1 <= y0 && y2 > y0) {
      rowXs.push([x1 + ((x2 - x1) * (y0 - y1)) / (y2 - y1), 1]);
    } else if (y2 <= y0 && y1 > y0) {
      rowXs.push([x1 + ((x2 - x1) * (y0 - y1)) / (y2 - y1), -1]);
    }
  }
  if (!rowXs.length) continue;
  rowXs.sort((a, b) => a[0] - b[0]);
  const row = y * RASTER;
  let winding = 0;
  let spanStart = -1;
  for (let i = 0; i < rowXs.length; i++) {
    const prev = winding;
    winding += rowXs[i][1];
    if (prev === 0 && winding !== 0) {
      spanStart = rowXs[i][0];
    } else if (prev !== 0 && winding === 0) {
      const x0 = Math.max(0, Math.ceil(spanStart));
      const x1 = Math.min(RASTER, Math.floor(rowXs[i][0]));
      for (let x = x0; x < x1; x++) cover[row + x] = 1;
    }
  }
}

// ---------------------------------------------------------------------------
// 6. Downsample to SIZE and blend black onto white
// ---------------------------------------------------------------------------
const out = Buffer.alloc(SIZE * SIZE * 3);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let sum = 0;
    const r0 = y * SS * RASTER + x * SS;
    for (let dy = 0; dy < SS; dy++) {
      const r = r0 + dy * RASTER;
      for (let dx = 0; dx < SS; dx++) sum += cover[r + dx];
    }
    // Coverage in [0,1]; black ink over white paper.
    const v = 255 - Math.round((255 * sum) / (SS * SS));
    const o = (y * SIZE + x) * 3;
    out[o] = v;
    out[o + 1] = v;
    out[o + 2] = v;
  }
}

// ---------------------------------------------------------------------------
// 7. Encode as an RGB PNG (zlib is built into Node)
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

writeFileSync(outPath, encodePng(SIZE, SIZE, out));

// ---------------------------------------------------------------------------
// 8. Self-check: report what was produced
// ---------------------------------------------------------------------------
const px = (x, y) => [out[(y * SIZE + x) * 3], out[(y * SIZE + x) * 3 + 1], out[(y * SIZE + x) * 3 + 2]];
let ink = 0;
let minVal = 255;
for (let i = 0; i < out.length; i += 3) {
  if (out[i] < 255) ink++;
  if (out[i] < minVal) minVal = out[i];
}
console.log(`Wrote ${outPath}`);
console.log(`  corners: TL ${px(4, 4)}  TR ${px(SIZE - 5, 4)}  BL ${px(4, SIZE - 5)}  BR ${px(SIZE - 5, SIZE - 5)}`);
console.log(`  ink pixels: ${ink} (${((100 * ink) / (SIZE * SIZE)).toFixed(1)}% of canvas), darkest value: ${minVal}`);
console.log(`  deer scale: ${scale.toFixed(2)} raster px/unit, spans ${(spanX * scale / SS).toFixed(0)}x${(spanY * scale / SS).toFixed(0)} px at ${SIZE}`);
