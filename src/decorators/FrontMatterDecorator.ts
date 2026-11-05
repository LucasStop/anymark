import type { ConversionResult, Converter, ConverterContext, Source } from '../core/types.js';

// A JSON string is a valid YAML double-quoted scalar, so one escape covers quotes and newlines.
const field = (key: string, value: string | undefined): string[] =>
  value === undefined ? [] : [`${key}: ${JSON.stringify(value)}`];

/**
 * Decorator: wraps any `Converter` behind the same interface and puts a YAML front matter block
 * on top of its Markdown. Identity comes from the facade's context, not from the wrapped converter.
 */
export class FrontMatterDecorator implements Converter {
  readonly name: string;
  readonly mimes: readonly string[];
  readonly #inner: Converter;

  constructor(inner: Converter) {
    this.#inner = inner;
    this.name = inner.name;
    this.mimes = inner.mimes;
  }

  async convert(source: Source, ctx: ConverterContext): Promise<ConversionResult> {
    const result = await this.#inner.convert(source, ctx);
    const lines = [
      ...field('title', result.metadata.title),
      ...field('source', source.name),
      ...field('mime', result.metadata.mime),
      ...field('sourceId', ctx.sourceId),
    ];
    return { ...result, markdown: `---\n${lines.join('\n')}\n---\n\n${result.markdown}` };
  }
}
