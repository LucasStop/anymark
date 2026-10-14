import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAnymark } from '../src/index.js';

const spec = (path: string) => readFileSync(new URL(`../specs/${path}`, import.meta.url));

describe('convert() on a .txt', () => {
  it('matches the golden Markdown (BOM and CRLF normalized)', async () => {
    const result = await createAnymark().convert({
      data: new Uint8Array(spec('txt/simple.txt')),
      name: 'simple.txt',
    });

    expect(result.markdown).toBe(spec('txt/simple.md').toString('utf8'));
  });
});
