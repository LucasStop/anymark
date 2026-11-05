// Scene 6 of docs/DEMO.md: Facade, Decorator and Observer in one pass. Run: node scripts/demo.mjs 6
import { readFile } from 'node:fs/promises';
import { ChunkingDecorator, createAnymark, FrontMatterDecorator } from '../../dist/index.js';
import { logSink, metricsSink } from '../../.demo/examples/sinks/index.js';
import process from 'node:process';

const log = (text = '') => process.stdout.write(`${text}\n`);

const metrics = metricsSink();
const anymark = createAnymark()
  .decorate((converter) => new ChunkingDecorator(converter, { maxChars: 400 }))
  .decorate((converter) => new FrontMatterDecorator(converter))
  .addSink(logSink(log))
  .addSink(metrics)
  .addSink({
    onProgress: (event) => log(`progress: ${event.stage} ${event.current}/${event.total}`),
  })
  .addSink({
    onResult: () => {
      throw new Error('a sink that breaks');
    },
  });

// Facade: one call, detection, registry, converter and backends stay out of sight.
const result = await anymark.convert({
  data: await readFile('specs/docx/simple.docx'),
  name: 'simple.docx',
});

log('\n--- Decorator: front matter on top, chunks beside ---');
log(result.markdown.split('\n').slice(0, 7).join('\n'));
log(`chunks: ${result.chunks?.length}`);
log('\n--- Observer: a failing sink did not stop the conversion ---');
log(`warnings: ${JSON.stringify(result.warnings.map((w) => w.code))}`);
log(`metrics: ${JSON.stringify(metrics.snapshot())}`);
