import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ConversionError, createAnymark } from '../src/index.js';

const csv = (text: string) => ({ data: new TextEncoder().encode(text), name: 'a.csv' });

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

  it('detects a semicolon delimiter (Excel in pt-BR)', async () => {
    const result = await createAnymark().convert(csv('a;b\n1,5;2\n'));

    expect(result.markdown).toBe('| a | b |\n| --- | --- |\n| 1,5 | 2 |\n');
  });

  it('detects a tab delimiter', async () => {
    const result = await createAnymark().convert(csv('a\tb\n1\t2\n'));

    expect(result.markdown).toBe('| a | b |\n| --- | --- |\n| 1 | 2 |\n');
  });

  it('does not count a delimiter inside quotes when sniffing', async () => {
    const result = await createAnymark().convert(csv('"a;b;c",d\n1,2\n'));

    expect(result.markdown).toBe('| a;b;c | d |\n| --- | --- |\n| 1 | 2 |\n');
  });

  it('returns empty Markdown for an empty file', async () => {
    const result = await createAnymark().convert(csv(''));

    expect(result.markdown).toBe('');
  });

  it('rejects malformed CSV without echoing its content', async () => {
    const attempt = createAnymark().convert(csv('a,b\n"secret-token,2\n'));

    await expect(attempt).rejects.toBeInstanceOf(ConversionError);
    await expect(attempt).rejects.not.toThrow(/secret-token/);
  });
});
