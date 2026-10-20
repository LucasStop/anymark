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

describe('text encodings without a BOM', () => {
  const sample = 'Olá, ação\nsegunda linha\n';
  const utf16le = () => new Uint8Array(Buffer.from(sample, 'utf16le'));

  it('decodes UTF-16LE', async () => {
    const result = await createAnymark().convert({ data: utf16le(), name: 'a.txt' });

    expect(result.markdown).toBe(sample);
  });

  it('decodes UTF-16BE, also through the md converter', async () => {
    const be = new Uint8Array(Buffer.from(sample, 'utf16le').swap16());

    const result = await createAnymark().convert({ data: be, name: 'a.md' });

    expect(result.markdown).toBe(sample);
  });

  it('leaves Latin-1, UTF-8 with a BOM and plain UTF-8 as they were', async () => {
    const latin1 = new Uint8Array(Buffer.from(sample, 'latin1'));
    const bom = new Uint8Array(Buffer.from(`\ufeff${sample}`, 'utf8'));
    const plain = new Uint8Array(Buffer.from(sample, 'utf8'));

    for (const data of [latin1, bom, plain]) {
      const result = await createAnymark().convert({ data, name: 'a.txt' });
      expect(result.markdown).toBe(sample);
    }
  });

  it('does not take a short ASCII file or binary noise for UTF-16', async () => {
    const short = await createAnymark().convert({
      data: new Uint8Array([0x68, 0x69]),
      name: 'a.txt',
    });
    const noisy = new Uint8Array(64).map((_, i) => (i % 2 === 0 ? 0x41 : i % 7));
    const text = await createAnymark().convert({ data: noisy, name: 'a.txt' });

    // 60% of the odd bytes are zero: too few to call it UTF-16, whose letters would turn into U+4241.
    const mixed = new Uint8Array(80).map((_, i) =>
      i % 2 === 0 ? 0x41 : (i - 1) / 2 < 24 ? 0 : 0x42,
    );
    const ambiguous = await createAnymark().convert({ data: mixed, name: 'a.txt' });

    expect(ambiguous.markdown).not.toContain('\u4241');
    expect(short.markdown).toBe('hi');
    expect(text.markdown).not.toContain('\u4141');
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
