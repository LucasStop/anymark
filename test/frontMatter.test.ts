import { describe, expect, it } from 'vitest';
import { FrontMatterDecorator } from '../src/index.js';
import type { Converter, ConverterContext, Source } from '../src/index.js';
import { assertConverterContract } from '../src/testing/index.js';

const source: Source = {
  data: new TextEncoder().encode('x'),
  name: 'notes.txt',
  mime: 'text/plain',
};
const ctx: ConverterContext = {
  sourceId: 'abc123',
  options: {},
  backends: { run: () => Promise.reject(new Error('no backend')) },
};

const inner = (title?: string): Converter => ({
  name: 'inner',
  mimes: ['text/plain'],
  convert: async (_source, c) => {
    c.options.signal?.throwIfAborted();
    return {
      markdown: '# Hello\n\nbody\n',
      metadata: {
        schemaVersion: 1,
        sourceId: c.sourceId,
        mime: 'text/plain',
        ...(title ? { title } : {}),
      },
      warnings: [{ code: 'W', message: 'kept' }],
    };
  },
});

describe('FrontMatterDecorator', () => {
  it('prepends a YAML block with name, mime and sourceId, then the original Markdown', async () => {
    const { markdown } = await new FrontMatterDecorator(inner()).convert(source, ctx);

    expect(markdown).toBe(
      '---\nsource: "notes.txt"\nmime: "text/plain"\nsourceId: "abc123"\n---\n\n# Hello\n\nbody\n',
    );
  });

  it('adds the title when the converter found one', async () => {
    const { markdown } = await new FrontMatterDecorator(inner('My doc')).convert(source, ctx);

    expect(markdown).toContain('title: "My doc"\n');
  });

  it('keeps a hostile title on one quoted line, so it cannot add or break YAML keys', async () => {
    const { markdown } = await new FrontMatterDecorator(inner('a"\n---\nevil: 1')).convert(
      source,
      ctx,
    );

    const block = markdown.split('\n---\n')[0] ?? '';
    expect(block.split('\n').filter((line) => line.startsWith('evil'))).toEqual([]);
    expect(markdown.startsWith('---\n')).toBe(true);
  });

  it('omits source when the input has no name', async () => {
    const { markdown } = await new FrontMatterDecorator(inner()).convert(
      { data: source.data, mime: 'text/plain' },
      ctx,
    );

    expect(markdown).not.toContain('source:');
  });

  it('leaves the wrapped converter and its warnings and metadata untouched', async () => {
    const wrapped = inner('T');
    const decorated = new FrontMatterDecorator(wrapped);
    const plain = await wrapped.convert(source, ctx);
    const result = await decorated.convert(source, ctx);

    expect(decorated.name).toBe(wrapped.name);
    expect(decorated.mimes).toBe(wrapped.mimes);
    expect(result.warnings).toEqual(plain.warnings);
    expect(result.metadata).toEqual(plain.metadata);
    expect(result.markdown.endsWith(plain.markdown)).toBe(true);
  });

  it('passes the converter contract', async () => {
    await assertConverterContract(new FrontMatterDecorator(inner()), source);
  });
});
