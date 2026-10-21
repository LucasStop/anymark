// Builds design/brand/icons/ (sprite, one SVG per icon, sheet page) from the paths below.
// Grid 24, stroke 1.5, round caps and joins, currentColor. Run: node scripts/build-icons.mjs && yarn prettier --write design/brand/icons
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const OUT = 'design/brand/icons';

// Document frame (x 5..19, y 3..21) with the folded corner; details live in x 8..16, y 10..15.5.
const PAGE =
  '<path d="M7 3h7.5L19 7.5V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14.5 3v4.5H19"/>';
// The Markdown cursor: a solid block under the content, on every document icon.
const CURSOR =
  '<rect x="8" y="17" width="3" height="2" rx=".5" fill="currentColor" stroke="none"/>';
const doc = (detail) => PAGE + detail + CURSOR;

const FORMATS = {
  txt: doc('<path d="M8 10.5h8M8 13.5h5"/>'),
  md: doc('<path d="M8 14.5v-4.5l2 2.5 2-2.5v4.5M14.5 10.5v4M13.25 13.25l1.25 1.25 1.25-1.25"/>'),
  pdf: doc(
    '<path d="M8 10.5h8M8 13.5h2.5"/><rect x="12" y="12.25" width="4" height="3.25" rx=".5"/>',
  ),
  docx: doc('<path d="M8 10l1.5 5.5L12 11l2.5 4.5L16 10"/>'),
  pptx: doc('<path d="M9 15.5v-3M12 15.5V10M15 15.5v-4.5"/>'),
  xlsx: doc('<rect x="8" y="10" width="8" height="5.5" rx=".75"/><path d="M8 12.75h8M12 10v5.5"/>'),
  csv: doc('<path d="M8 10.5h2M12 10.5h.01M13.75 10.5H16M8 13.5h2M12 13.5h.01M13.75 13.5H16"/>'),
  json: doc(
    '<path d="M10.5 10c-1.5 0-1.75.75-1.75 1.75v.5c0 .5-.5.75-.75.75.25 0 .75.25.75.75v.5c0 1 .25 1.75 1.75 1.75M13.5 10c1.5 0 1.75.75 1.75 1.75v.5c0 .5.5.75.75.75-.25 0-.75.25-.75.75v.5c0 1-.25 1.75-1.75 1.75"/>',
  ),
  xml: doc('<path d="M10.5 10.5L8 12.75l2.5 2.25M13.5 10.5l2.5 2.25-2.5 2.25M12.75 10l-1.5 5.5"/>'),
  html: doc('<path d="M10.5 10.5L8 12.75l2.5 2.25M13.5 10.5l2.5 2.25-2.5 2.25M11 12.75h2"/>'),
  image: doc('<path d="M8 15.5l2.75-3.25 2 2.25 1.25-1.5 2 2.5M14.5 10.75h.01"/>'),
  audio: doc('<path d="M8.75 12.5v1.5M11 11v4.5M13.25 10v5.5M15.5 11.5V14"/>'),
  video: doc('<path d="M10 10.25v5l4.5-2.5z"/>'),
  // A URL is not a file: a globe, no page.
  url: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.75 5.5 3.75 9S14.5 18.5 12 21c-2.5-2.5-3.75-5.5-3.75-9S9.5 5.5 12 3z"/>',
};

const TRAY = '<path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15"/>';
const ACTIONS = {
  upload: `<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5"/>${TRAY}`,
  download: `<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5"/>${TRAY}`,
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  warning:
    '<path d="M10.7 4.9L3.2 18a1.5 1.5 0 0 0 1.3 2.25h15a1.5 1.5 0 0 0 1.3-2.25L13.3 4.9a1.5 1.5 0 0 0-2.6 0z"/><path d="M12 10v4M12 16.75h.01"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  error: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
};

const ALL = { ...FORMATS, ...ACTIONS };
const ATTR =
  'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';
const one = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" ${ATTR}>${body}</svg>\n`;

mkdirSync(join(OUT, 'svg'), { recursive: true });
for (const [name, body] of Object.entries(ALL))
  writeFileSync(join(OUT, 'svg', `${name}.svg`), one(body));

const sprite = Object.entries(ALL)
  .map(([n, b]) => `<symbol id="i-${n}" viewBox="0 0 24 24" ${ATTR}>${b}</symbol>`)
  .join('');
writeFileSync(
  join(OUT, 'icons.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">${sprite}</svg>\n`,
);

const use = (n, px) =>
  `<svg width="${px}" height="${px}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const cell = (n) =>
  `<figure><div class="sz">${[16, 24, 32, 48].map((p) => use(n, p)).join('')}</div><figcaption>${n}</figcaption></figure>`;
const section = (title, obj) =>
  `<h2>${title}</h2><div class="grid">${Object.keys(obj).map(cell).join('')}</div>`;

writeFileSync(
  join(OUT, 'index.html'),
  `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>anymark: ícones</title>
    <link rel="stylesheet" href="../../prototype/tokens.css" />
    <style>
      body { margin: 0; padding: 32px 16px 64px; background: var(--bg); color: var(--ink); font: 15px/1.55 var(--font-sans); }
      main { max-width: 1000px; margin: 0 auto; }
      h1 { margin: 0 0 8px; font-size: 28px; letter-spacing: -0.02em; }
      h2 { margin: 40px 0 12px; font-size: 18px; }
      p { margin: 0 0 16px; color: var(--muted); }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
      figure { margin: 0; padding: 16px 8px 8px; text-align: center; background: var(--paper); border: 1px solid var(--line); border-radius: var(--r-md); }
      .sz { display: flex; align-items: flex-end; justify-content: center; gap: 8px; color: var(--ink); }
      svg { color: var(--ink); }
      .sz svg:nth-child(odd) { color: var(--accent); }
      figcaption { margin-top: 10px; font: 12px var(--font-mono); color: var(--muted); }
    </style>
  </head>
  <body>
    <main>
      <h1>anymark: ícones</h1>
      <p>Grade de 24 px, traço de 1,5 px, pontas e junções arredondadas, <code>currentColor</code>. Cada ícone aparece em 16, 24, 32 e 48 px (os de tamanho ímpar na cor de destaque); o cursor só se lê de 24 px para cima. O bloco sólido é o cursor do Markdown, presente em todo ícone de documento. Gerado por <code>scripts/build-icons.mjs</code>.</p>
      ${section('Formatos', FORMATS)}
      ${section('Ações', ACTIONS)}
    </main>
    <svg width="0" height="0" style="position:absolute" aria-hidden="true">${sprite}</svg>
  </body>
</html>
`,
);
process.stdout.write(`icons written to ${OUT}\n`);
