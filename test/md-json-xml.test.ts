import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ConversionError, createAnymark } from '../src/index.js';

const spec = (path: string) => readFileSync(new URL(`../specs/${path}`, import.meta.url));
const text = (path: string) => spec(path).toString('utf8');
const run = (path: string, name: string) =>
  createAnymark().convert({ data: new Uint8Array(spec(path)), name });
const inline = (value: string, name: string) =>
  createAnymark().convert({ data: new TextEncoder().encode(value), name });

describe('md converter', () => {
  it('passes Markdown through unchanged', async () => {
    const result = await run('md/simple.md', 'simple.md');

    expect(result.markdown).toBe(text('md/simple.md'));
    expect(result.metadata.mime).toBe('text/markdown');
  });

  it('detects and converts a non-UTF-8 file', async () => {
    const result = await run('md/latin1.md', 'latin1.md');

    expect(result.markdown).toBe(text('md/simple.md'));
  });

  it('drops a UTF-8 BOM', async () => {
    const result = await createAnymark().convert({
      data: new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('# a\n')]),
      name: 'a.md',
    });

    expect(result.markdown).toBe('# a\n');
  });
});

describe('json converter', () => {
  it('turns a list of flat objects into a table, with the union of the keys', async () => {
    const result = await run('json/people.json', 'people.json');

    expect(result.markdown).toBe(text('json/people.md'));
    expect(result.metadata.mime).toBe('application/json');
  });

  it('puts anything else in a pretty-printed code block', async () => {
    const result = await run('json/nested.json', 'nested.json');

    expect(result.markdown).toBe(text('json/nested.md'));
  });

  it('keeps a list with nested values out of the table', async () => {
    const result = await inline('[{"a":[1]}]', 'x.json');

    expect(result.markdown.startsWith('```json\n')).toBe(true);
  });

  it('rejects invalid JSON without echoing its content', async () => {
    const attempt = inline('{"token": "secret-token",', 'bad.json');

    await expect(attempt).rejects.toBeInstanceOf(ConversionError);
    await expect(attempt).rejects.not.toThrow(/secret-token/);
  });
});

describe('xml converter', () => {
  it('puts well-formed XML in a code block', async () => {
    const result = await run('xml/simple.xml', 'simple.xml');

    expect(result.markdown).toBe(text('xml/simple.md'));
    expect(result.metadata.mime).toBe('application/xml');
  });

  it('rejects malformed XML without echoing its content', async () => {
    const attempt = inline('<a><secret-token></a>', 'bad.xml');

    await expect(attempt).rejects.toBeInstanceOf(ConversionError);
    await expect(attempt).rejects.not.toThrow(/secret-token/);
  });
});
