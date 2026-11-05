// Scene 2 of docs/DEMO.md: the default case. Run: yarn build && node examples/demo/caso-padrao.mjs <files>
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { createAnymark } from '../../dist/index.js';
import process from 'node:process';

const log = (text = '') => process.stdout.write(`${text}\n`);

const anymark = createAnymark();
for (const path of process.argv.slice(2)) {
  const { markdown, metadata, warnings } = await anymark.convert({
    data: await readFile(path),
    name: basename(path),
  });
  log(`\n=== ${basename(path)}: ${metadata.mime}\n`);
  log(markdown.trim());
  log(`\nsourceId: ${metadata.sourceId.slice(0, 16)}...  warnings: ${warnings.length}`);
}
