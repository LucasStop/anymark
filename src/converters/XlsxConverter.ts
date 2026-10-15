import readExcelFile from 'read-excel-file/universal';
import { ConversionError } from '../core/errors.js';
import { MarkdownBuilder } from '../core/MarkdownBuilder.js';
import type { ConversionResult, Converter, ConverterContext, Source } from '../core/types.js';

const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

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
      sheets = await readExcelFile(copy.buffer);
    } catch {
      // The library's messages describe the file; only the format is reported.
      throw new ConversionError('xlsx');
    }
    const builder = new MarkdownBuilder();
    for (const { sheet, data } of sheets) {
      builder.heading(2, sheet);
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
