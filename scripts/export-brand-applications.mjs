// Brand applications outside the UI (issue #114): README banner, social preview, thumbnail and
// video vignette, all on the dark tokens of docs/DESIGN.md. Text is outlined with Inter so no file
// depends on an installed font. Needs rsvg-convert on PATH for the PNGs.
// Run: node scripts/export-brand-applications.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import opentype from 'opentype.js';

const OUT = 'design/brand/applications';
const FONTS = 'node_modules/@fontsource/inter/files';
const C = {
  bg: '#0e1318',
  paper: '#161c23',
  line: '#2a343f',
  ink: '#e8edf2',
  muted: '#9aa7b5',
  accent: '#3ccfb7',
  on: '#04201c',
};

const load = (weight) => {
  const buf = readFileSync(join(FONTS, `inter-latin-${weight}-normal.woff`));
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
};
const fonts = { 700: load(700), 500: load(500) };

// Glyph by glyph: opentype.js 2.0 throws on Inter's GSUB tables when shaping a whole string.
function text(str, { x, y, size, weight, fill, anchor = 'start' }) {
  const font = fonts[weight];
  const width = [...str].reduce(
    (sum, ch) => sum + (font.charToGlyph(ch).advanceWidth * size) / font.unitsPerEm,
    0,
  );
  let pen = anchor === 'middle' ? x - width / 2 : x;
  let d = '';
  for (const ch of str) {
    const g = font.charToGlyph(ch);
    d += g.getPath(pen, y, size).toPathData(2);
    pen += (g.advanceWidth * size) / font.unitsPerEm;
  }
  return { svg: `<path d="${d}" fill="${fill}"/>`, width };
}

// Symbol on its 48 grid, scaled and moved.
const symbol = (x, y, s) =>
  `<g transform="translate(${x} ${y}) scale(${s / 48})"><rect x="3" y="3" width="42" height="42" rx="11" fill="${C.accent}"/><circle cx="24" cy="24" r="8.75" fill="none" stroke="${C.on}" stroke-width="4.5"/><path d="M32.75 13v22" stroke="${C.on}" stroke-width="4.5" fill="none"/></g>`;

// Wordmark with the cursor underscore, left edge at x, baseline at y.
function wordmark(x, y, size) {
  const w = text('anymark', { x, y, size, weight: 700, fill: C.ink });
  const cursor = `<rect x="${x + w.width + size * 0.05}" y="${y + size * 0.08}" width="${size * 0.47}" height="${size * 0.14}" rx="${size * 0.04}" fill="${C.accent}"/>`;
  return { svg: w.svg + cursor, width: w.width + size * 0.05 + size * 0.47 };
}

const svg = (w, h, body, title) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${title}"><rect width="${w}" height="${h}" fill="${C.bg}"/>${body}</svg>\n`;

// Faint rows of Markdown markers behind the lockup: the output the library produces.
const markers = (w, h) =>
  ['#', '##', '-', '>', '```', '**', '1.', '~']
    .map(
      (m, i) =>
        text(m, {
          x: w - 60 - (i % 2) * 90,
          y: h * 0.18 + Math.floor(i / 2) * (h * 0.22),
          size: Math.round(h * 0.07),
          weight: 700,
          fill: C.line,
          anchor: 'middle',
        }).svg,
    )
    .join('');

function lockup(w, h, { symbolSize, wordSize, tagSize, tagline, extra = '', lift = 0 }) {
  const gap = symbolSize * 0.3;
  const wm = wordmark(0, 0, wordSize);
  const total = symbolSize + gap + wm.width;
  const x0 = (w - total) / 2;
  const cy = h / 2 - (tagline ? tagSize : 0) - lift;
  const word = wordmark(x0 + symbolSize + gap, cy + wordSize * 0.35, wordSize);
  const tag = tagline
    ? text(tagline, {
        x: w / 2,
        y: cy + symbolSize * 0.5 + tagSize * 2,
        size: tagSize,
        weight: 500,
        fill: C.muted,
        anchor: 'middle',
      }).svg
    : '';
  return svg(
    w,
    h,
    `${markers(w, h)}${symbol(x0, cy - symbolSize / 2, symbolSize)}${word.svg}${tag}${extra}`,
    'anymark',
  );
}

const files = {
  banner: lockup(1280, 320, {
    symbolSize: 96,
    wordSize: 96,
    tagSize: 28,
    tagline: 'Qualquer arquivo, em Markdown.',
  }),
  'social-preview': lockup(1280, 640, {
    symbolSize: 150,
    wordSize: 150,
    tagSize: 40,
    tagline: 'Qualquer arquivo, em Markdown.',
  }),
  vignette: lockup(1920, 1080, {
    symbolSize: 220,
    wordSize: 220,
    tagSize: 52,
    tagline: 'Design Patterns, PUCPR 2026/2',
  }),
};

// Thumbnail 1280x720: the lockup high, the question of the video below.
const q1 = text('Um arquivo qualquer.', {
  x: 640,
  y: 470,
  size: 64,
  weight: 700,
  fill: C.ink,
  anchor: 'middle',
});
const q2 = text('Oito padrões de projeto.', {
  x: 640,
  y: 560,
  size: 64,
  weight: 700,
  fill: C.accent,
  anchor: 'middle',
});
files.thumbnail = lockup(1280, 720, {
  symbolSize: 110,
  wordSize: 110,
  tagSize: 0,
  tagline: '',
  lift: 150,
  extra: `${q1.svg}${q2.svg}`,
});

mkdirSync(OUT, { recursive: true });
const sizes = {
  banner: [1280, 320],
  'social-preview': [1280, 640],
  thumbnail: [1280, 720],
  vignette: [1920, 1080],
};
for (const [name, body] of Object.entries(files)) {
  writeFileSync(join(OUT, `${name}.svg`), body);
  const [w, h] = sizes[name];
  execFileSync('rsvg-convert', [
    '-w',
    String(w),
    '-h',
    String(h),
    join(OUT, `${name}.svg`),
    '-o',
    join(OUT, `${name}.png`),
  ]);
}
process.stdout.write(`brand applications written to ${OUT}\n`);
