import mammoth from 'mammoth';
import { ConversionError } from '../core/errors.js';
import type { ConversionResult, Converter, ConverterContext, Source } from '../core/types.js';
import { HtmlConverter } from './HtmlConverter.js';

const MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Word cells wrap their text in paragraphs, which turndown renders as blocks that break a GFM row,
 * and Word tables have no header cells; the first row becomes the header.
 */
const tidyTables = (html: string): string =>
  html
    .replace(/<(td|th)>(.*?)<\/\1>/g, (_, tag: string, inner: string) => {
      const text = inner.replace(/<\/p><p>/g, '<br />').replace(/<\/?p>/g, '');
      return `<${tag}>${text}</${tag}>`;
    })
    .replace(
      /<table><tr>(.*?)<\/tr>/g,
      (_, cells: string) => `<table><tr>${cells.replace(/<(\/?)td>/g, '<$1th>')}</tr>`,
    );

/** mammoth to HTML, then the HtmlConverter pipeline: one place decides how HTML becomes Markdown. */
export class DocxConverter implements Converter {
  readonly name = 'docx';
  readonly mimes = [MIME];
  readonly #html = new HtmlConverter();

  async convert(source: Source, ctx: ConverterContext): Promise<ConversionResult> {
    ctx.options.signal?.throwIfAborted();
    let html: string;
    try {
      const result = await mammoth.convertToHtml(
        { buffer: Buffer.from(source.data) },
        // Embedded images are ignored by default: the empty src keeps base64 out, the <img> is stripped below.
        { convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: '' })) },
      );
      html = tidyTables(result.value.replace(/<img\b[^>]*>/g, ''));
    } catch {
      // mammoth's messages name parts of the file; only the format is reported.
      throw new ConversionError('docx');
    }
    const converted = await this.#html.convert(
      { ...source, data: new TextEncoder().encode(html) },
      ctx,
    );
    return { ...converted, metadata: { ...converted.metadata, mime: MIME } };
  }
}
