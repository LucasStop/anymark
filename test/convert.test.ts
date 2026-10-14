import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAnymark, UnsupportedFormatError } from '../src/index.js';
import type { ConverterEntry } from '../src/index.js';

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

describe('instances and unsupported formats', () => {
  const fooEntry: ConverterEntry = {
    name: 'foo',
    mimes: ['application/x-foo'],
    extensions: ['.foo'],
    load: async () => ({
      name: 'foo',
      mimes: ['application/x-foo'],
      convert: async (_source, ctx) => ({
        markdown: 'foo',
        metadata: { schemaVersion: 1, sourceId: ctx.sourceId, mime: 'application/x-foo' },
        warnings: [],
      }),
    }),
  };
  const fooFile = { data: new Uint8Array([1]), name: 'a.foo' };

  it('two instances do not share a registry', async () => {
    const a = createAnymark();
    const b = createAnymark();
    a.registry.register(fooEntry);

    expect((await a.convert(fooFile)).markdown).toBe('foo');
    await expect(b.convert(fooFile)).rejects.toBeInstanceOf(UnsupportedFormatError);
  });

  it('rejects an extension nobody registered', async () => {
    await expect(
      createAnymark().convert({ data: new Uint8Array([1]), name: 'a.unknown' }),
    ).rejects.toBeInstanceOf(UnsupportedFormatError);
  });

  it('rejects bytes with no hint at all (detector chain comes later)', async () => {
    await expect(createAnymark().convert(new Uint8Array([1]))).rejects.toBeInstanceOf(
      UnsupportedFormatError,
    );
  });
});
