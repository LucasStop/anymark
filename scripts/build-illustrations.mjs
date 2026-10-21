// Builds design/brand/illustrations/ (one SVG per scene and a review sheet) from the scenes below.
// 240x160 canvas, stroke 1.5, round caps and joins. Lines use currentColor, the accent comes from
// --ill-accent (use through <img> only: the classes and `svg{}` rule are global when inlined; falls back to the DESIGN.md accent, light and dark). Run:
// node scripts/build-illustrations.mjs && yarn prettier --write design/brand/illustrations
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const OUT = 'design/brand/illustrations';

// Standalone <img> use has no page CSS, so the palette lives in the file and follows the scheme.
const STYLE =
  '<style>svg{color:#16202a;--a:var(--ill-accent,#0b7a6b)}@media (prefers-color-scheme:dark){svg{color:#e8edf2;--a:var(--ill-accent,#3ccfb7)}}.l{fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}.a{fill:none;stroke:var(--a);stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}.f{fill:var(--a);stroke:none}.d{stroke-dasharray:4 5}.s{opacity:.35}</style>';

// A document: body with the folded corner, top-left at (x, y).
const page = (x, y, w, h, cls = 'l') =>
  `<path class="${cls}" d="M${x + 4} ${y}h${w - 14}l10 10v${h - 14}a4 4 0 0 1-4 4h${-(w - 8)}a4 4 0 0 1-4-4v${-(h - 8)}a4 4 0 0 1 4-4z"/><path class="${cls}" d="M${x + w - 10} ${y}v10h10"/>`;
const lines = (x, y, ws, gap = 8) =>
  ws.map((w, i) => `<path class="l" d="M${x} ${y + i * gap}h${w}"/>`).join('');
const cursor = (x, y, w = 8, h = 5) =>
  `<rect class="f" x="${x}" y="${y}" width="${w}" height="${h}" rx="1"/>`;
const arrow = (x1, y, x2, cls = 'a') =>
  `<path class="${cls}" d="M${x1} ${y}H${x2}M${x2 - 5} ${y - 5}l5 5-5 5"/>`;

const SCENES = {
  // Drop a file into the zone.
  empty:
    `<rect class="l d" x="36" y="30" width="168" height="100" rx="12"/>` +
    page(104, 44, 32, 42) +
    lines(112, 58, [16, 10]) +
    cursor(112, 76) +
    `<path class="a" d="M120 98v14M113 106l7 7 7-7"/>` +
    `<path class="l s" d="M20 146h200"/>`,

  // Reading: a scan line crosses the page while text lines come out as Markdown.
  reading:
    page(40, 24, 68, 88) +
    lines(54, 46, [38, 30, 38, 22, 34]) +
    `<path class="a" d="M32 78h84"/><rect class="f s" x="32" y="70" width="84" height="8" rx="2"/>` +
    arrow(122, 68, 142) +
    `<rect class="l" x="148" y="40" width="56" height="56" rx="8"/>` +
    `<path class="l" d="M158 58h24M158 70h36M158 82h14"/>` +
    cursor(176, 79, 8, 6) +
    `<path class="l s" d="M20 136h200"/>`,

  // Result: the page became Markdown, with a check.
  result:
    page(56, 24, 72, 96) +
    `<path class="l" d="M68 46h20"/>` +
    `<path class="l" d="M68 62h44M68 72h36M68 82h44M68 92h20"/>` +
    cursor(92, 89, 8, 6) +
    `<circle class="a" cx="164" cy="84" r="26"/><path class="a" d="M152 85l9 9 17-19"/>` +
    `<path class="l s" d="M20 136h200"/>`,

  // Error: the page with a crack and a warning mark.
  error:
    page(60, 24, 72, 96) +
    lines(72, 50, [40, 32, 40]) +
    `<path class="l d" d="M66 98l14-8 10 10 14-12 14 8"/>` +
    `<path class="a" d="M172 56l30 52h-60z"/><path class="a" d="M172 74v16M172 99h.01"/>` +
    `<path class="l s" d="M20 136h200"/>`,

  // Many formats, one Markdown.
  converge:
    [34, 70, 106]
      .map((y, i) => page(32, y - 16, 28, 30) + lines(39, y - 6, i === 1 ? [10, 6] : [12, 8], 6))
      .join('') +
    [34, 70, 106]
      .map((y) => `<path class="a s" d="M66 ${y - 1}C96 ${y - 1} 100 80 132 80"/>`)
      .join('') +
    `<rect class="l" x="138" y="52" width="68" height="56" rx="8"/>` +
    `<path class="l" d="M148 70h28M148 82h44M148 94h16"/>` +
    cursor(170, 91, 10, 6) +
    `<path class="l s" d="M20 136h200"/>`,
};

const one = (body, title) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 160" width="240" height="160" role="img" aria-label="${title}">${STYLE}${body}</svg>\n`;

const TITLES = {
  empty: 'Solte um arquivo',
  reading: 'Lendo o documento',
  result: 'Markdown pronto',
  error: 'Algo deu errado',
  converge: 'Vários formatos, um Markdown',
};

mkdirSync(OUT, { recursive: true });
for (const [name, body] of Object.entries(SCENES))
  writeFileSync(join(OUT, `${name}.svg`), one(body, TITLES[name]));

const card = (n) =>
  `<figure><img src="${n}.svg" width="240" height="160" alt="${TITLES[n]}" /><figcaption>${n}</figcaption></figure>`;

writeFileSync(
  join(OUT, 'index.html'),
  `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>anymark: ilustrações</title>
    <link rel="stylesheet" href="../../prototype/tokens.css" />
    <style>
      body { margin: 0; padding: 32px 16px 64px; background: var(--bg); color: var(--ink); font: 15px/1.55 var(--font-sans); }
      main { max-width: 1000px; margin: 0 auto; }
      h1 { margin: 0 0 8px; font-size: 28px; letter-spacing: -0.02em; }
      p { margin: 0 0 24px; color: var(--muted); }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
      figure { margin: 0; padding: 16px; text-align: center; background: var(--paper); border: 1px solid var(--line); border-radius: var(--r-lg); }
      figure img { max-width: 100%; height: auto; }
      figcaption { margin-top: 8px; font: 12px var(--font-mono); color: var(--muted); }
    </style>
  </head>
  <body>
    <main>
      <h1>anymark: ilustrações</h1>
      <p>Cinco cenas de linha em 240x160, traço de 1,5 px, cor de destaque só no que importa. Cada arquivo traz a paleta e segue o esquema claro ou escuro do sistema. Gerado por <code>scripts/build-illustrations.mjs</code>.</p>
      <div class="grid">${Object.keys(SCENES).map(card).join('')}</div>
    </main>
  </body>
</html>
`,
);
process.stdout.write(`illustrations written to ${OUT}\n`);
