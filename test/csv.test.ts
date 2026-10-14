import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAnymark } from '../src/index.js';

const spec = (path: string) => readFileSync(new URL(`../specs/${path}`, import.meta.url));

describe('csv converter', () => {
  it('matches the golden table (quotes, comma in a cell, pipe, blank line)', async () => {
    const result = await createAnymark().convert({
      data: new Uint8Array(spec('csv/simple.csv')),
      name: 'simple.csv',
    });

    expect(result.markdown).toBe(spec('csv/simple.md').toString('utf8'));
    expect(result.metadata.mime).toBe('text/csv');
  });
});
