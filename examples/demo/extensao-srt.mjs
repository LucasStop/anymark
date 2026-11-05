// Scene 3 of docs/DEMO.md: a format added from outside. Run: node scripts/demo.mjs 3
// Needs `node scripts/demo.mjs preparar` first: it compiles the plugin that lives in TypeScript.
import { readFile } from 'node:fs/promises';
import { createAnymark } from '../../dist/index.js';
import { srtPlugin } from '../../.demo/examples/plugins/srt/index.js';
import process from 'node:process';

const log = (text = '') => process.stdout.write(`${text}\n`);

const input = { data: await readFile('specs/srt/simple.srt'), name: 'simple.srt' };

log('--- sem o plugin ---');
log((await createAnymark().convert(input)).markdown);

log('--- createAnymark().use(srtPlugin) ---');
log((await createAnymark().use(srtPlugin).convert(input)).markdown);
