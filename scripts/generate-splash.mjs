/**
 * Generates public/splash-logo-1024.png from letshunthorizontallogo.svg.
 *
 * The splash icon needs the logo on a WHITE background (the old PNG had a
 * black logo background baked in). The SVG is vector, so rendering it at
 * 1024x1024 keeps the splash crisp on high-DPI Android screens.
 *
 * Usage: node scripts/generate-splash.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svgPath = path.join(root, 'letshunthorizontallogo.svg');
const outPath = path.join(root, 'public', 'splash-logo-1024.png');

const SIZE = 1024;
// Logo occupies ~86% of the canvas width, centered.
const LOGO_W = 880;
const LOGO_H = 440;

const svg = readFileSync(svgPath);

// Render the transparent-background SVG at its final size (vector → crisp).
const logo = await sharp(svg, { density: 300 })
  .resize(LOGO_W, LOGO_H, { fit: 'fill' })
  .png()
  .toBuffer();

// White canvas + logo centered → flatten drops the alpha so the result is
// a clean RGB PNG with no transparency surprises on Android.
await sharp({
  create: {
    width: SIZE,
    height: SIZE,
    channels: 4,
    background: { r: 255, g: 255, b: 255, alpha: 1 },
  },
})
  .composite([{ input: logo, left: (SIZE - LOGO_W) / 2, top: (SIZE - LOGO_H) / 2 }])
  .flatten({ background: '#ffffff' })
  .removeAlpha()
  .png()
  .toFile(outPath);

console.log(`Wrote ${outPath}`);
