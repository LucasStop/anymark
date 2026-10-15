import { extractText, getDocumentProxy } from 'unpdf';
import { ConversionError } from '../core/errors.js';
import { MarkdownBuilder } from '../core/MarkdownBuilder.js';
import type { ConversionResult, Converter, ConverterContext, Source } from '../core/types.js';

const MIME = 'application/pdf';

/** Plain text only, one section per page. Structure (tables, columns) is a stretch goal. */
export class PdfConverter implements Converter {
  readonly name = 'pdf';
  readonly mimes = [MIME];

  async convert(source: Source, ctx: ConverterContext): Promise<ConversionResult> {
    ctx.options.signal?.throwIfAborted();
    let pages: string[];
    try {
      // The library may transfer the buffer, so it gets a copy. verbosity 0: pdf.js logs to the console.
      const pdf = await getDocumentProxy(new Uint8Array(source.data), { verbosity: 0 });
      pages = (await extractText(pdf, { mergePages: false })).text;
    } catch {
      // Corrupted and password-protected files both land here; the library message quotes the file.
      throw new ConversionError('pdf');
    }
    const builder = new MarkdownBuilder();
    pages.forEach((text, i) => {
      builder.heading(2, `Page ${i + 1}`);
      if (text.trim() !== '') builder.paragraph(text);
    });
    return {
      markdown: builder.build(),
      metadata: { schemaVersion: 1, sourceId: ctx.sourceId, mime: MIME },
      warnings: [],
    };
  }
}
