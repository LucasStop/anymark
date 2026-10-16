import { extractText, getDocumentProxy } from 'unpdf';
import { ConversionError } from '../core/errors.js';
import { MarkdownBuilder } from '../core/MarkdownBuilder.js';
import type {
  ConversionResult,
  ConversionWarning,
  Converter,
  ConverterContext,
  Source,
} from '../core/types.js';

const MIME = 'application/pdf';

/** Plain text only, one section per page. Structure (tables, columns) is a stretch goal. */
export class PdfConverter implements Converter {
  readonly name = 'pdf';
  readonly mimes = [MIME];

  async convert(source: Source, ctx: ConverterContext): Promise<ConversionResult> {
    ctx.options.signal?.throwIfAborted();
    let pages: string[];
    let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | undefined;
    try {
      // The library may transfer the buffer, so it gets a copy. verbosity 0: pdf.js logs to the console.
      // ponytail: the signal is checked only before parsing; add a deadline if hostile PDFs matter.
      pdf = await getDocumentProxy(new Uint8Array(source.data), { verbosity: 0 });
      pages = (await extractText(pdf, { mergePages: false })).text;
    } catch {
      // Corrupted and password-protected files both land here; the library message quotes the file.
      throw new ConversionError('pdf');
    } finally {
      // pdf.js keeps the parsed document and fonts until destroyed.
      await pdf?.loadingTask.destroy();
    }
    const builder = new MarkdownBuilder();
    pages.forEach((text, i) => {
      builder.heading(2, `Page ${i + 1}`);
      if (text.trim() !== '') builder.paragraph(text);
    });
    // A scan has pages but no text layer; the headings alone would look like an empty document.
    const warnings: ConversionWarning[] = pages.some((text) => text.trim() !== '')
      ? []
      : [{ code: 'PDF_NO_TEXT', message: 'No page has a text layer; a scanned PDF needs OCR' }];
    return {
      markdown: builder.build(),
      metadata: { schemaVersion: 1, sourceId: ctx.sourceId, mime: MIME },
      warnings,
    };
  }
}
