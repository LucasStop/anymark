import { MarkdownBuilder } from '../core/MarkdownBuilder.js';
import type { ConversionResult, Converter, ConverterContext, Source } from '../core/types.js';

/** Reads text from an image. Never names a provider: the backend chain decides who does the OCR (ADR 0002). */
export class ImageConverter implements Converter {
  readonly name = 'image';
  readonly mimes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

  async convert(source: Source, ctx: ConverterContext): Promise<ConversionResult> {
    ctx.options.signal?.throwIfAborted();
    const text = await ctx.backends.run<Uint8Array, string>('ocr', source.data);
    const trimmed = text.trim();
    return {
      markdown: trimmed === '' ? '' : new MarkdownBuilder().paragraph(trimmed).build(),
      metadata: { schemaVersion: 1, sourceId: ctx.sourceId, mime: source.mime ?? 'image/png' },
      warnings: [],
    };
  }
}
