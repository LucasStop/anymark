import { extractImages, extractText, getDocumentProxy } from 'unpdf';
import { ConversionError, NoBackendError } from '../core/errors.js';
import { MarkdownBuilder } from '../core/MarkdownBuilder.js';
import type {
  ConversionResult,
  ConversionWarning,
  Converter,
  ConverterContext,
  Source,
} from '../core/types.js';
import { encodePng } from './encodePng.js';

const MIME = 'application/pdf';

// OCR is the slow part: bound the pages looked at, the images per page and the pixels per image.
const MAX_OCR_PAGES = 100;
const MAX_PAGE_IMAGES = 4;
const MAX_IMAGE_BYTES = 64 * 1024 * 1024;

type Document = Awaited<ReturnType<typeof getDocumentProxy>>;

/**
 * A page without a text layer is read through the `ocr` capability, from the images embedded in it
 * (rasterizing vector pages would need a canvas, a native dependency). Returns the page texts and how
 * many pages or images were left out by the limits. Without a usable backend the pages stay empty.
 */
async function ocrScans(
  pdf: Document,
  texts: readonly string[],
  ctx: ConverterContext,
): Promise<{ pages: string[]; skipped: number; failed: boolean }> {
  const pages = [...texts];
  let skipped = 0;
  let looked = 0;
  for (const [index, text] of texts.entries()) {
    if (text.trim() !== '') continue;
    ctx.options.signal?.throwIfAborted();
    if (looked >= MAX_OCR_PAGES) {
      skipped += 1;
      continue;
    }
    looked += 1;
    let images: Awaited<ReturnType<typeof extractImages>>;
    try {
      images = await extractImages(pdf, index + 1);
    } catch {
      continue; // an image pdf.js cannot decode: the page stays empty
    }
    const found: string[] = [];
    for (const image of images) {
      if (found.length >= MAX_PAGE_IMAGES || image.data.length > MAX_IMAGE_BYTES) {
        skipped += 1;
        continue;
      }
      try {
        const png = encodePng(image.data, image.width, image.height, image.channels);
        found.push((await ctx.backends.run<Uint8Array, string>('ocr', png)).trim());
      } catch (error) {
        // An abort is the caller's call. Anything else ends the OCR but keeps what was already read;
        // no backend at all and nothing read is not a failure, PDF_NO_TEXT covers it.
        ctx.options.signal?.throwIfAborted();
        pages[index] = found.filter((text) => text !== '').join('\n\n');
        return { pages, skipped, failed: found.length > 0 || !(error instanceof NoBackendError) };
      }
    }
    pages[index] = found.filter((text) => text !== '').join('\n\n');
  }
  return { pages, skipped, failed: false };
}

/** Plain text only, one section per page. Structure (tables, columns) is a stretch goal. */
export class PdfConverter implements Converter {
  readonly name = 'pdf';
  readonly mimes = [MIME];

  async convert(source: Source, ctx: ConverterContext): Promise<ConversionResult> {
    ctx.options.signal?.throwIfAborted();
    let pages: string[];
    let skipped: number;
    let failed: boolean;
    let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | undefined;
    try {
      // The library may transfer the buffer, so it gets a copy. verbosity 0: pdf.js logs to the console.
      // ponytail: the signal is checked only before parsing; add a deadline if hostile PDFs matter.
      pdf = await getDocumentProxy(new Uint8Array(source.data), { verbosity: 0 });
      const layers = (await extractText(pdf, { mergePages: false })).text;
      ({ pages, skipped, failed } = await ocrScans(pdf, layers, ctx));
    } catch {
      ctx.options.signal?.throwIfAborted();
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
    const warnings: ConversionWarning[] = [];
    if (!pages.some((text) => text.trim() !== '')) {
      warnings.push({
        code: 'PDF_NO_TEXT',
        message: 'No page has a text layer; a scanned PDF needs OCR',
      });
    }
    if (failed) {
      warnings.push({
        code: 'PDF_OCR_FAILED',
        message: 'OCR stopped on a failure; later pages were not read',
      });
    }
    if (skipped > 0) {
      warnings.push({
        code: 'PDF_OCR_SKIPPED',
        message: `${skipped} ${skipped === 1 ? 'page or image' : 'pages or images'} left out of OCR by the limits`,
      });
    }
    return {
      markdown: builder.build(),
      metadata: { schemaVersion: 1, sourceId: ctx.sourceId, mime: MIME },
      warnings,
    };
  }
}
