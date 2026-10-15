import { unzipSync } from 'fflate';
import readExcelFile from 'read-excel-file/universal';
import { ConversionError } from '../core/errors.js';
import { MarkdownBuilder } from '../core/MarkdownBuilder.js';
import type { ConversionResult, Converter, ConverterContext, Source } from '../core/types.js';

const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const MAX_UNPACKED = 100 * 1024 * 1024;
const MAX_ROWS = 100_000;

/**
 * read-excel-file pads a sparse sheet into a dense array and does not cap inflation, so a tiny
 * hostile file can exhaust memory. Sizes come from the zip directory, rows from the sheet XML.
 */
function assertWithinLimits(data: Uint8Array): void {
  let unpacked = 0;
  const sheets = unzipSync(data, {
    filter: ({ name, originalSize }) => {
      unpacked += originalSize;
      if (unpacked > MAX_UNPACKED) throw new Error('too large');
      return /^xl\/worksheets\/[^/]+\.xml$/.test(name);
    },
  });
  for (const xml of Object.values(sheets)) {
    const rows = new TextDecoder().decode(xml).matchAll(/<row\b[^>]*?\br="(\d+)"/g);
    let count = 0;
    for (const [, index] of rows) {
      count += 1;
      if (count > MAX_ROWS || Number(index) > MAX_ROWS) throw new Error('too many rows');
    }
  }
}

// Markdown in a sheet name would render; the name is only a label.
const label = (name: string): string => name.replace(/[\\`*_[\]<>#|]/g, '\\$&');

const text = (value: unknown): string =>
  value === null || value === undefined
    ? ''
    : value instanceof Date
      ? value.toISOString()
      : String(value);

/** One section per sheet, the first row as the table header. */
export class XlsxConverter implements Converter {
  readonly name = 'xlsx';
  readonly mimes = [MIME];

  async convert(source: Source, ctx: ConverterContext): Promise<ConversionResult> {
    ctx.options.signal?.throwIfAborted();
    let sheets: { sheet: string; data: unknown[][] }[];
    try {
      const copy = new Uint8Array(source.data);
      assertWithinLimits(copy);
      sheets = await readExcelFile(copy.buffer);
    } catch {
      // The library's messages describe the file; only the format is reported.
      throw new ConversionError('xlsx');
    }
    const builder = new MarkdownBuilder();
    for (const { sheet, data } of sheets) {
      builder.heading(2, label(sheet));
      const [header = [], ...rows] = data.map((row) => row.map(text));
      if (data.length > 0) builder.table(header, rows);
    }
    return {
      markdown: builder.build(),
      metadata: { schemaVersion: 1, sourceId: ctx.sourceId, mime: MIME },
      warnings: [],
    };
  }
}
