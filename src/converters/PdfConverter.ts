import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import {
  definePDFJSModule,
  extractImages,
  extractText,
  getDocumentProxy,
  getResolvedPDFJS,
} from 'unpdf';
import { ConversionError, NoBackendError } from '../core/errors.js';
import { MarkdownBuilder } from '../core/MarkdownBuilder.js';
import type {
  ConversionResult,
  ConversionWarning,
  Converter,
  ConvertOptions,
  ConverterContext,
  Source,
} from '../core/types.js';
import { encodePng, rotateClockwise, type Raster } from './encodePng.js';
import { textRuns, wordScore } from './orientation.js';
import { dehyphenate } from './cleanText.js';
import { splitSpread, trimBorders } from './scanPrep.js';

const MIME = 'application/pdf';

// OCR is the slow part: bound the pages looked at, the images per page and the pixels per image.
const MAX_OCR_PAGES = 100;
const MAX_PAGE_IMAGES = 4;
const MAX_IMAGE_BYTES = 64 * 1024 * 1024;

type Document = Awaited<ReturnType<typeof getDocumentProxy>>;

// unpdf's bundled pdf.js cannot load its JBIG2 and CCITT decoders (wasm), so every 1-bit fax scan
// came out empty. The full pdfjs-dist ships them; its folder is passed as `wasmUrl`.
const wasmUrl = `${join(dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json')), 'wasm')}/`;
let engine: Promise<void> | undefined;
const useFullPdfjs = (): Promise<void> =>
  (engine ??= definePDFJSModule(() => import('pdfjs-dist/legacy/build/pdf.mjs')));

/**
 * 1-bit images (fax scans: CCITT, JBIG2) are the ones `extractImages` drops. Read them from the
 * page's operator list instead and widen the bits to 8-bit gray, which is what the backends take.
 */
async function bitonalImages(pdf: Document, pageNumber: number): Promise<Raster[]> {
  const { OPS } = await getResolvedPDFJS();
  const page = await pdf.getPage(pageNumber);
  const list = await page.getOperatorList();
  const images: Raster[] = [];
  for (const [at, fn] of list.fnArray.entries()) {
    if (fn !== OPS.paintImageXObject) continue;
    const id = list.argsArray[at]?.[0] as string;
    // Once the operator list is done the objects are resolved; `get` with a callback would wait
    // forever for one that is not there (an image shared by pages lives in commonObjs, `g_` ids).
    const store = id.startsWith('g_') ? page.commonObjs : page.objs;
    if (!store.has(id)) continue;
    const image = store.get(id) as {
      data?: Uint8Array;
      width: number;
      height: number;
      kind: number;
    } | null;
    // kind 1 is GRAYSCALE_1BPP: one bit per pixel, rows padded to a whole byte, 1 is white.
    if (image?.kind !== 1 || image.data === undefined) continue;
    // Past the per-page cap nothing is expanded (8 bits per pixel is 8 times the source); the empty
    // image only tells the caller to count it as left out.
    const tooBig = image.width * image.height > MAX_IMAGE_BYTES;
    const short = image.data.length < Math.ceil(image.width / 8) * image.height;
    if (images.length >= MAX_PAGE_IMAGES || tooBig || short) {
      images.push({ data: new Uint8ClampedArray(0), width: 0, height: 0, channels: 1 });
      continue;
    }
    const { data, width, height } = image;
    const stride = Math.ceil(width / 8);
    const gray = new Uint8ClampedArray(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        gray[y * width + x] = (data[y * stride + (x >> 3)]! >> (7 - (x & 7))) & 1 ? 255 : 0;
      }
    }
    images.push({ data: gray, width, height, channels: 1 });
  }
  return images;
}

/** The images of a page as stored, with the page's /Rotate (only a hint for which way is up). */
async function pageImages(
  pdf: Document,
  pageNumber: number,
): Promise<{ images: Raster[]; rotate: number }> {
  const found: Raster[] = (await extractImages(pdf, pageNumber)).map((image) => ({
    data: image.data,
    width: image.width,
    height: image.height,
    channels: image.channels as 1 | 3 | 4,
  }));
  const images = found.length > 0 ? found : await bitonalImages(pdf, pageNumber);
  const { rotate } = await pdf.getPage(pageNumber);
  return { images, rotate };
}

/** Below this share of word-like tokens the first guess at "up" is doubted. */
const MIN_WORD_SCORE = 0.85;
/** Shorter texts say too little about the orientation to justify a second OCR pass. */
const MIN_CHARS_TO_DOUBT = 20;

/** What the caller declared about the scan, checked at the edge: an unknown value is an error. */
interface ScanKind {
  layout: 'single' | 'spread';
  rotation: 0 | 90 | 180 | 270 | 'auto';
  binding: 'left' | 'right';
  trim: boolean;
  dehyphenate: boolean;
}

function scanKind(declared: ConvertOptions['pdf']): ScanKind {
  try {
    if (declared !== undefined && (typeof declared !== 'object' || declared === null))
      throw new Error('not an object');
    const { layout = 'single', rotation = 'auto', binding = 'left', cleanup = {} } = declared ?? {};
    if (typeof cleanup !== 'object' || cleanup === null) throw new Error('not an object');
    const { trim = false, dehyphenate = false } = cleanup;
    if (
      !['single', 'spread'].includes(layout) ||
      ![0, 90, 180, 270, 'auto'].includes(rotation) ||
      !['left', 'right'].includes(binding) ||
      typeof trim !== 'boolean' ||
      typeof dehyphenate !== 'boolean'
    )
      throw new Error('unknown value');
    return { layout, rotation, binding, trim, dehyphenate };
  } catch {
    throw new ConversionError('pdf'); // a getter that throws lands here too
  }
}

/** A sheet narrower than this is no spread: there is no gutter to find in a sliver. */
const MIN_SPREAD_WIDTH = 100;

/**
 * OCR one scanned image into one text per printed page (two for a spread, in reading order), pushed
 * to `out` as they are read so a failure on the second page keeps the first.
 * A declared rotation is applied as is. With `auto`, the text lines tell which axis is up and /Rotate
 * only orders the two turns on that axis; the second turn is read only when the first one reads like
 * junk, and the better text wins. A spread is judged as a whole (both pages), because the second
 * turn puts the other printed page first.
 */
async function readSheet(
  image: Raster,
  rotate: number,
  kind: ScanKind,
  ctx: ConverterContext,
  out: string[],
): Promise<void> {
  const ocr = async (page: Raster): Promise<string> => {
    const png = encodePng(page.data, page.width, page.height, page.channels);
    return (await ctx.backends.run<Uint8Array, string>('ocr', png)).trim();
  };
  // the scanner frame is dark on all four sides and fools the axis detection, so it goes first
  const sheet = kind.trim ? trimBorders(image) : image;
  const pagesTurned = (degrees: number): Raster[] => {
    const turned = rotateClockwise(sheet, degrees);
    const pages =
      kind.layout === 'spread' && turned.width >= MIN_SPREAD_WIDTH
        ? splitSpread(turned, kind.binding)
        : [turned];
    return kind.trim ? pages.map(trimBorders) : pages;
  };
  const readAll = async (pages: Raster[], sink: string[]): Promise<void> => {
    for (const page of pages) sink.push(await ocr(page));
  };

  if (kind.rotation !== 'auto') return readAll(pagesTurned(kind.rotation), out);

  const turns =
    textRuns(sheet) === 'horizontal'
      ? rotate === 180
        ? [180, 0]
        : [0, 180]
      : rotate === 90
        ? [90, 270]
        : [270, 90];
  const first: string[] = [];
  try {
    await readAll(pagesTurned(turns[0]!), first);
  } catch (error) {
    out.push(...first);
    throw error;
  }
  const firstText = first.join('\n');
  if (firstText.length < MIN_CHARS_TO_DOUBT || wordScore(firstText) >= MIN_WORD_SCORE) {
    out.push(...first);
    return;
  }
  const second: string[] = [];
  try {
    await readAll(pagesTurned(turns[1]!), second);
  } catch {
    // the second look is a bonus: its failure must not cost the text already read
    ctx.options.signal?.throwIfAborted();
    out.push(...first);
    return;
  }
  out.push(...(wordScore(second.join('\n')) > wordScore(firstText) ? second : first));
}

/**
 * A page without a text layer is read through the `ocr` capability, from the images embedded in it
 * (rasterizing vector pages would need a canvas, a native dependency). Returns the page texts and how
 * many pages or images were left out by the limits. Without a usable backend the pages stay empty.
 */
async function ocrScans(
  pdf: Document,
  texts: readonly string[],
  kind: ScanKind,
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
    let images: Raster[];
    let rotate: number;
    try {
      ({ images, rotate } = await pageImages(pdf, index + 1));
    } catch {
      continue; // an image pdf.js cannot decode: the page stays empty
    }
    const found: string[] = [];
    let read = 0; // images, not printed pages: a spread gives two texts per image
    for (const image of images) {
      if (read >= MAX_PAGE_IMAGES || image.width === 0 || image.data.length > MAX_IMAGE_BYTES) {
        skipped += 1;
        continue;
      }
      try {
        read += 1;
        await readSheet(image, rotate, kind, ctx, found);
      } catch (error) {
        // An abort is the caller's call. Anything else ends the OCR but keeps what was already read;
        // no backend at all and nothing read is not a failure, PDF_NO_TEXT covers it.
        ctx.options.signal?.throwIfAborted();
        pages[index] = joinTexts(found, kind);
        return { pages, skipped, failed: found.length > 0 || !(error instanceof NoBackendError) };
      }
    }
    pages[index] = joinTexts(found, kind);
  }
  return { pages, skipped, failed: false };
}

/** The texts read from one page, joined; with `dehyphenate`, words split at a line end are whole again. */
const joinTexts = (texts: readonly string[], kind: ScanKind): string => {
  const joined = texts.filter((text) => text !== '').join('\n\n');
  return kind.dehyphenate ? dehyphenate(joined) : joined;
};

/** Plain text only, one section per page. Structure (tables, columns) is a stretch goal. */
export class PdfConverter implements Converter {
  readonly name = 'pdf';
  readonly mimes = [MIME];

  async convert(source: Source, ctx: ConverterContext): Promise<ConversionResult> {
    ctx.options.signal?.throwIfAborted();
    const kind = scanKind(ctx.options.pdf);
    let pages: string[];
    let skipped: number;
    let failed: boolean;
    let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | undefined;
    try {
      // The library may transfer the buffer, so it gets a copy. verbosity 0: pdf.js logs to the console.
      // ponytail: the signal is checked only before parsing; add a deadline if hostile PDFs matter.
      await useFullPdfjs();
      pdf = await getDocumentProxy(new Uint8Array(source.data), {
        verbosity: 0,
        wasmUrl,
      });
      const layers = (await extractText(pdf, { mergePages: false })).text;
      ({ pages, skipped, failed } = await ocrScans(pdf, layers, kind, ctx));
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
