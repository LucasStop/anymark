// Manual test helper: converts the given files and writes the Markdown to manual-out/ (gitignored).
// Prints one line per file with no path and no content: id, ext, size, ms, result. Run `yarn build` first.
// Usage: node scripts/manual-run.mjs [--hidden] file...   (OCR needs ANYMARK_LANG_PATH=<dir with eng.traineddata>)
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { createAnymark, TesseractBackend } from '../dist/index.js';

const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith('--'));
const langPath = process.env.ANYMARK_LANG_PATH;
const options = {
  ...(langPath ? { backends: [new TesseractBackend({ langPath })] } : {}),
  ...(args.includes('--hidden') ? { includeHidden: true } : {}),
};
const anymark = createAnymark();
await mkdir('manual-out', { recursive: true });

for (const file of files) {
  const data = new Uint8Array(await readFile(file));
  const id = createHash('sha256').update(data).digest('hex').slice(0, 8);
  const start = performance.now();
  let result;
  try {
    const r = await anymark.convert({ data, name: basename(file) }, options);
    await writeFile(`manual-out/${id}.md`, r.markdown);
    result = `ok ${r.markdown.length} chars, ${r.warnings.length} warnings [${r.warnings.map((w) => w.code)}]`;
  } catch (e) {
    result = `ERROR ${e?.code ?? e?.name} ${e?.message}`;
  }
  const ms = Math.round(performance.now() - start);
  process.stdout.write(`${id} ${extname(file).slice(1)} ${data.length}B ${ms}ms ${result}\n`);
}
