import { unzipSync, zipSync } from 'fflate';
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

const MAX_UNPACKED = 100 * 1024 * 1024;
// A run is hidden by <w:vanish/> or <w:vanish w:val="1|true|on"/>; w:val="0" means shown.
const HIDDEN_RUN =
  /<w:r\b(?:(?!<\/w:r>)[\s\S])*?<w:vanish(?:\s+w:val="(?:1|true|on)")?\s*\/>[\s\S]*?<\/w:r>/g;

/**
 * mammoth ignores w:vanish, so hidden text would reach the output (and any model reading it), and
 * it does not cap inflation. The zip is opened here under a size cap, hidden runs are cut from the
 * body, and the result goes to mammoth.
 */
function visibleOnly(data: Uint8Array): Uint8Array {
  let unpacked = 0;
  const files = unzipSync(data, {
    filter: ({ originalSize }) => {
      unpacked += originalSize;
      if (unpacked > MAX_UNPACKED) throw new Error('too large');
      return true;
    },
  });
  const body = files['word/document.xml'];
  if (body === undefined) throw new Error('not a document');
  files['word/document.xml'] = new TextEncoder().encode(
    new TextDecoder().decode(body).replace(HIDDEN_RUN, ''),
  );
  return zipSync(files);
}

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
        { buffer: Buffer.from(visibleOnly(new Uint8Array(source.data))) },
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
