import type { ConversionResult, Converter, ConverterContext, Source } from '../core/types.js';
import { decodeText } from './decodeText.js';

const MIME = 'text/markdown';

/** Markdown is already the target format: only the encoding is normalised. */
export class MdConverter implements Converter {
  readonly name = 'md';
  readonly mimes = [MIME];

  async convert(source: Source, ctx: ConverterContext): Promise<ConversionResult> {
    ctx.options.signal?.throwIfAborted();
    return {
      markdown: decodeText(source.data),
      metadata: { schemaVersion: 1, sourceId: ctx.sourceId, mime: MIME },
      warnings: [],
    };
  }
}
