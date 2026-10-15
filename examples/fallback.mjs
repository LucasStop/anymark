// Fallback in a few lines. Run: npm run build && node examples/fallback.mjs
import { stdout } from 'node:process';
import { BackendChain } from '../dist/index.js';

const backend = (name, run) => ({
  name,
  capability: 'ocr',
  locality: 'local',
  isAvailable: async () => true,
  run,
});
const broken = backend('broken-ocr', async () => {
  throw new Error('boom at /Users/someone/secret.png');
});
const working = backend('working-ocr', async (input) => `text read from ${input}`);

const chain = new BackendChain([broken, working], {});
stdout.write(`${await chain.run('ocr', 'page.png')}\n`);
stdout.write(`${JSON.stringify(chain.warnings)}\n`);
