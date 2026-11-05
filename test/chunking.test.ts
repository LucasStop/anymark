import { describe, expect, it } from 'vitest';
import { ChunkingDecorator } from '../src/index.js';
import type { Converter, ConverterContext, Source } from '../src/index.js';
import { assertConverterContract } from '../src/testing/index.js';

const source: Source = { data: new TextEncoder().encode('x'), name: 'a.md', mime: 'text/markdown' };
const ctx: ConverterContext = {
  sourceId: 'id1',
  options: {},
  backends: { run: () => Promise.reject(new Error('no backend')) },
};

const converterOf = (markdown: string): Converter => ({
  name: 'inner',
  mimes: ['text/markdown'],
  convert: async (_source, c) => {
    c.options.signal?.throwIfAborted();
    return {
      markdown,
      metadata: { schemaVersion: 1, sourceId: c.sourceId, mime: 'text/markdown' },
      warnings: [],
    };
  },
});

const chunksOf = async (markdown: string, options?: { maxChars?: number; overlap?: number }) =>
  (await new ChunkingDecorator(converterOf(markdown), options).convert(source, ctx)).chunks ?? [];

describe('ChunkingDecorator', () => {
  it('cuts at headings and records the heading path of each chunk', async () => {
    const chunks = await chunksOf(
      '# A\n\nintro\n\n## B\n\nbody b\n\n## C\n\nbody c\n\n# D\n\nbody d\n',
    );

    expect(chunks.map((c) => c.headingPath)).toEqual([['A'], ['A', 'B'], ['A', 'C'], ['D']]);
    expect(chunks[1]?.text).toBe('## B\n\nbody b');
  });

  it('numbers chunks from zero and keeps text before the first heading under an empty path', async () => {
    const chunks = await chunksOf('preamble\n\n# A\n\nx\n');

    expect(chunks.map((c) => c.index)).toEqual([0, 1]);
    expect(chunks[0]?.headingPath).toEqual([]);
  });

  it('does not treat a # line inside a fenced code block as a heading', async () => {
    const chunks = await chunksOf('# A\n\n```sh\n# comment\n```\n');

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.text).toContain('# comment');
  });

  it('pops the path when a heading of the same or higher level shows up', async () => {
    const chunks = await chunksOf('# A\n\n### deep\n\nx\n\n## B\n\ny\n');

    expect(chunks.map((c) => c.headingPath)).toEqual([['A'], ['A', 'deep'], ['A', 'B']]);
  });

  it('splits a section larger than maxChars and repeats the overlap at the start of the next piece', async () => {
    const words = Array.from({ length: 60 }, (_, i) => `w${i}`).join(' ');
    const chunks = await chunksOf(`# A\n\n${words}\n`, { maxChars: 80, overlap: 20 });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(80);
      expect(chunk.headingPath).toEqual(['A']);
    }
    for (let i = 1; i < chunks.length; i += 1) {
      const tail = chunks[i - 1]?.text.slice(-10) ?? '';
      expect(chunks[i]?.text).toContain(tail.trim().split(' ').pop());
    }
  });

  it('never drops text: every word of the source appears in some chunk', async () => {
    const words = Array.from({ length: 200 }, (_, i) => `token${i}`);
    const chunks = await chunksOf(`# A\n\n${words.join(' ')}\n`, { maxChars: 120, overlap: 30 });
    const all = chunks.map((c) => c.text).join('\n');

    for (const word of words) expect(all).toContain(word);
  });

  it('splits a single word longer than maxChars instead of looping or exceeding it', async () => {
    const chunks = await chunksOf(`# A\n\n${'x'.repeat(500)}\n`, { maxChars: 100, overlap: 10 });

    expect(chunks.every((c) => c.text.length <= 100)).toBe(true);
    expect(chunks.length).toBeGreaterThan(4);
  });

  it('is stable: same input and options give the same chunks', async () => {
    const markdown = `# A\n\n${'lorem ipsum '.repeat(100)}\n\n## B\n\nz\n`;

    expect(await chunksOf(markdown, { maxChars: 150, overlap: 25 })).toEqual(
      await chunksOf(markdown, { maxChars: 150, overlap: 25 }),
    );
  });

  it('rejects an overlap that is not smaller than maxChars', () => {
    expect(() => new ChunkingDecorator(converterOf(''), { maxChars: 50, overlap: 50 })).toThrow(
      RangeError,
    );
    expect(() => new ChunkingDecorator(converterOf(''), { maxChars: 0 })).toThrow(RangeError);
  });

  it('returns no chunks for an empty document', async () => {
    expect(await chunksOf('')).toEqual([]);
  });

  it('leaves the wrapped converter, its markdown, warnings and metadata untouched', async () => {
    const wrapped = converterOf('# A\n\nx\n');
    const decorated = new ChunkingDecorator(wrapped);
    const plain = await wrapped.convert(source, ctx);
    const result = await decorated.convert(source, ctx);

    expect(decorated.name).toBe(wrapped.name);
    expect(decorated.mimes).toBe(wrapped.mimes);
    expect(result.markdown).toBe(plain.markdown);
    expect(result.metadata).toEqual(plain.metadata);
    expect(result.warnings).toEqual(plain.warnings);
  });

  it('passes the converter contract', async () => {
    await assertConverterContract(new ChunkingDecorator(converterOf('# A\n\nx\n')), source);
  });
});
