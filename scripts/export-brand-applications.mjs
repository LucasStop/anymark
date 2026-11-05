// Brand applications outside the UI (issue #114): README banner, social preview, thumbnail and
// video vignette, 16:9 slide template and lower thirds, all on the dark tokens of docs/DESIGN.md. Text is outlined with Inter so no file
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
  let pen = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x;
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

const svg = (w, h, body, title, background = true) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${title}">${background ? `<rect width="${w}" height="${h}" fill="${C.bg}"/>` : ''}${body}</svg>\n`;

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

// 16:9 slide template, 1920x1080: margins of 120, title baseline at 220, content area below.
const W = 1920;
const H = 1080;
const M = 120;
const t = (str, o) => text(str, o).svg;
const header = (title) =>
  `${symbol(M, 80, 56)}${t(title, { x: M + 56 + 24, y: 124, size: 56, weight: 700, fill: C.ink })}<rect x="${M}" y="168" width="${W - 2 * M}" height="2" fill="${C.line}"/>`;
const footer = `${t('anymark', { x: M, y: H - 56, size: 24, weight: 500, fill: C.muted })}${t('Design Patterns, PUCPR 2026/2', { x: W - M, y: H - 56, size: 24, weight: 500, fill: C.muted, anchor: 'end' })}`;
const panel = (x, y, w, h) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${C.paper}" stroke="${C.line}" stroke-width="2"/>`;

files['slide-cover'] = lockup(W, H, {
  symbolSize: 180,
  wordSize: 180,
  tagSize: 44,
  tagline: 'Qualquer arquivo, em Markdown.',
});
files['slide-title'] = svg(
  W,
  H,
  `${header('Título do slide')}${[
    'Um ponto por linha, até quatro.',
    'Frase curta, sem rodapé de texto.',
    'O padrão e o problema que ele resolve.',
  ]
    .map(
      (line, i) =>
        `<rect x="${M}" y="${300 + i * 130 - 14}" width="12" height="12" rx="3" fill="${C.accent}"/>${t(line, { x: M + 40, y: 300 + i * 130, size: 48, weight: 500, fill: C.ink })}`,
    )
    .join('')}${footer}`,
  'slide-title',
);
files['slide-code'] = svg(
  W,
  H,
  `${header('Trecho de código')}${panel(M, 220, W - 2 * M, 640)}${[
    'class BackendChain {',
    '  async run(input, ctx) {',
    '    // cada handler decide: trato ou passo adiante',
    '  }',
    '}',
  ]
    .map((line, i) =>
      t(line, {
        x: M + 48,
        y: 310 + i * 96,
        size: 44,
        weight: 500,
        fill: i === 2 ? C.muted : C.ink,
      }),
    )
    .join('')}${footer}`,
  'slide-code',
);
const box = (x, label) =>
  `${panel(x, 380, 420, 220)}${t(label, { x: x + 210, y: 505, size: 44, weight: 700, fill: C.ink, anchor: 'middle' })}`;
const arrow = (x) =>
  `<path d="M${x} 490h100m-24-24 24 24-24 24" stroke="${C.accent}" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
files['slide-diagram'] = svg(
  W,
  H,
  `${header('Diagrama')}${box(M, 'Entrada')}${arrow(M + 420 + 55)}${box(M + 630, 'Converter')}${arrow(M + 630 + 420 + 55)}${box(M + 1260, 'Markdown')}${t('Cada caixa é um ponto do fluxo; a seta é o contrato entre eles.', { x: M, y: 760, size: 36, weight: 500, fill: C.muted })}${footer}`,
  'slide-diagram',
);
files['slide-closing'] = lockup(W, H, {
  symbolSize: 150,
  wordSize: 150,
  tagSize: 44,
  tagline: 'Obrigado. github.com/LucasStop/anymark',
});

// Lower thirds, 1920x1080 with an alpha channel: drop on the video, bottom left.
const lowerThird = (name, role) =>
  svg(
    W,
    H,
    `${panel(M, 840, 820, 130)}<rect x="${M}" y="840" width="12" height="130" rx="6" fill="${C.accent}"/>${t(name, { x: M + 48, y: 898, size: 44, weight: 700, fill: C.ink })}${t(role, { x: M + 48, y: 944, size: 30, weight: 500, fill: C.muted })}`,
    `lower-third ${name}`,
    false,
  );
files['lower-third-stopinski'] = lowerThird('Lucas Stopinski', 'Adapter e Chain of Responsibility');
files['lower-third-bruno'] = lowerThird('Lucas Bruno', 'Strategy, Registry e Builder');

mkdirSync(OUT, { recursive: true });
const sizes = {
  banner: [1280, 320],
  'social-preview': [1280, 640],
  thumbnail: [1280, 720],
  vignette: [1920, 1080],
  ...Object.fromEntries(
    Object.keys(files)
      .filter((name) => name.startsWith('slide-') || name.startsWith('lower-third'))
      .map((name) => [name, [W, H]]),
  ),
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
