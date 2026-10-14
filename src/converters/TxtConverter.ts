import type { ConversionResult, Converter, ConverterContext, Source } from '../core/types.js';

const MIME = 'text/plain';

export class TxtConverter implements Converter {
  readonly name = 'txt';
  readonly mimes = [MIME];

  async convert(source: Source, ctx: ConverterContext): Promise<ConversionResult> {
    // TextDecoder drops a leading BOM. UTF-8 only for now; other encodings arrive with the md converter.
    const text = new TextDecoder('utf-8').decode(source.data);
    return {
      markdown: text.replace(/\r\n?/g, '\n'),
      metadata: { schemaVersion: 1, sourceId: ctx.sourceId, mime: MIME },
      warnings: [],
    };
  }
}
