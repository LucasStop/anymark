import { describe, expect, it } from 'vitest';
import { createAnymark, FrontMatterDecorator } from '../src/index.js';
import type { Converter } from '../src/index.js';

const bytes = new TextEncoder().encode('hello');

describe('Anymark.decorate', () => {
  it('wraps the resolved converter, returns the instance and leaves a plain instance alone', async () => {
    const decorated = createAnymark();
    expect(decorated.decorate((converter) => new FrontMatterDecorator(converter))).toBe(decorated);

    const withFrontMatter = await decorated.convert({ data: bytes, name: 'a.txt' });
    const plain = await createAnymark().convert({ data: bytes, name: 'a.txt' });

    expect(withFrontMatter.markdown.startsWith('---\n')).toBe(true);
    expect(withFrontMatter.markdown.endsWith(plain.markdown)).toBe(true);
    expect(plain.markdown.startsWith('---')).toBe(false);
  });

  it('applies decorators in registration order, the first one outermost', async () => {
    const tag =
      (label: string) =>
      (inner: Converter): Converter => ({
        name: inner.name,
        mimes: inner.mimes,
        convert: async (source, ctx) => {
          const result = await inner.convert(source, ctx);
          return { ...result, markdown: `${label}(${result.markdown.trim()})` };
        },
      });
    const anymark = createAnymark().decorate(tag('a')).decorate(tag('b'));

    const { markdown } = await anymark.convert({ data: bytes, name: 'a.txt' });

    expect(markdown).toBe('b(a(hello))');
  });

  it('keeps the facade as owner of the identity even through a decorator', async () => {
    const anymark = createAnymark().decorate((converter) => new FrontMatterDecorator(converter));

    const { metadata, markdown } = await anymark.convert({
      data: bytes,
      name: '/tmp/secret/a.txt',
    });

    expect(metadata.name).toBe('a.txt');
    expect(markdown).toContain('source: "a.txt"');
    expect(markdown).not.toContain('secret');
  });
});
