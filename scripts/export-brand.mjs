// Generates the brand assets in design/brand/logo/ from the geometry below.
// Needs rsvg-convert and magick on PATH (PNG and ICO only); the SVGs need nothing.
// Run: node scripts/export-brand.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import opentype from 'opentype.js';

const OUT = 'design/brand/logo';
const PNG = 'design/brand/logo/png';
const FONT = 'node_modules/@fontsource/inter/files/inter-latin-700-normal.woff';

// Tokens of docs/DESIGN.md: --accent, --accent-on, --ink.
const C = {
  light: { box: '#0b7a6b', neg: '#ffffff', ink: '#16202a' },
  dark: { box: '#3ccfb7', neg: '#04201c', ink: '#e8edf2' },
};

// One style block: light by default, dark through the viewer's color scheme.
const style = `<style>.box{fill:${C.light.box}}.neg{fill:none;stroke:${C.light.neg};stroke-width:4.5}.ink{fill:${C.light.ink}}.cur{fill:${C.light.box}}@media (prefers-color-scheme:dark){.box,.cur{fill:${C.dark.box}}.neg{stroke:${C.dark.neg}}.ink{fill:${C.dark.ink}}}</style>`;

// Symbol on a 48 grid: rounded block (the cursor) with a single-storey `a` knocked out of it.
const glyph = (cls = 'neg') =>
  `<circle class="${cls}" cx="24" cy="24" r="8.75"/><path class="${cls}" d="M32.75 13v22"/>`;
const symbol = (radius = 11, inset = 3, size = 42) =>
  `<rect class="box" x="${inset}" y="${inset}" width="${size}" height="${size}" rx="${radius}"/>${glyph()}`;

const svg = (w, h, body, title) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${title}">${style}${body}</svg>\n`;

// Wordmark as outlines so the file never depends on an installed font.
const buf = readFileSync(FONT);
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const SIZE = 36;
// Glyph by glyph: opentype.js 2.0 throws on Inter's GSUB tables when shaping a whole string.
const word = (x, baseline) => {
  let pen = x;
  let d = '';
  for (const ch of 'anymark') {
    const g = font.charToGlyph(ch);
    d += g.getPath(pen, baseline, SIZE).toPathData(2);
    pen += (g.advanceWidth * SIZE) / font.unitsPerEm;
  }
  return {
    d,
    // The underscore is the cursor of the wordmark.
    cursor: { x: pen + 2, y: baseline + 3, w: 17, h: 5 },
    end: pen + 2 + 17,
  };
};

function horizontal(mono) {
  const w = word(60, 33);
  const body = mono
    ? `<mask id="anymark-knockout"><rect width="48" height="48" fill="#fff"/><circle cx="24" cy="24" r="8.75" fill="none" stroke="#000" stroke-width="4.5"/><path d="M32.75 13v22" stroke="#000" stroke-width="4.5"/></mask><rect x="3" y="3" width="42" height="42" rx="11" fill="currentColor" mask="url(#anymark-knockout)"/><path d="${w.d}" fill="currentColor"/><rect x="${w.cursor.x}" y="${w.cursor.y}" width="${w.cursor.w}" height="${w.cursor.h}" rx="1.5" fill="currentColor"/>`
    : `${symbol()}<path class="ink" d="${w.d}"/><rect class="cur" x="${w.cursor.x}" y="${w.cursor.y}" width="${w.cursor.w}" height="${w.cursor.h}" rx="1.5"/>`;
  return svg(Math.ceil(w.end + 3), 48, body, 'anymark');
}

mkdirSync(PNG, { recursive: true });
writeFileSync(join(OUT, 'symbol.svg'), svg(48, 48, symbol(), 'anymark'));
writeFileSync(join(OUT, 'favicon.svg'), svg(48, 48, symbol(), 'anymark'));
writeFileSync(join(OUT, 'logo.svg'), horizontal(false));
writeFileSync(join(OUT, 'logo-mono.svg'), horizontal(true));
// Full-bleed square for the iOS icon: the system applies its own rounded mask.
writeFileSync(join(OUT, 'symbol-bleed.svg'), svg(48, 48, symbol(0, 0, 48), 'anymark'));

const render = (src, size, dest) =>
  execFileSync('rsvg-convert', [
    '-w',
    String(size),
    '-h',
    String(size),
    join(OUT, src),
    '-o',
    dest,
  ]);
render('symbol-bleed.svg', 180, join(PNG, 'apple-touch-icon-180.png'));
render('symbol.svg', 192, join(PNG, 'icon-192.png'));
render('symbol.svg', 512, join(PNG, 'icon-512.png'));

const tmp = mkdtempSync(join(tmpdir(), 'anymark-ico-'));
const sizes = [16, 32, 48].map((s) => {
  const f = join(tmp, `${s}.png`);
  render('favicon.svg', s, f);
  return f;
});
execFileSync('magick', [...sizes, join(OUT, 'favicon.ico')]);
rmSync(tmp, { recursive: true });
process.stdout.write(`brand assets written to ${OUT}\n`);
