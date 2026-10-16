import { XMLParser } from 'fast-xml-parser';
import { unzipSync } from 'fflate';
import readExcelFile from 'read-excel-file/universal';
import { ConversionError } from '../core/errors.js';
import { MarkdownBuilder } from '../core/MarkdownBuilder.js';
import type {
  ConversionResult,
  ConversionWarning,
  Converter,
  ConverterContext,
  Source,
} from '../core/types.js';

const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const MAX_UNPACKED = 100 * 1024 * 1024;
const MAX_ROWS = 100_000;
const WORKBOOK = 'xl/workbook.xml';

/**
 * read-excel-file pads a sparse sheet into a dense array and does not cap inflation, so a tiny
 * hostile file can exhaust memory. Sizes come from the zip directory, rows from the sheet XML.
 * Returns the names of the hidden and veryHidden sheets, read from the workbook part.
 */
function assertWithinLimits(data: Uint8Array): Set<string> {
  let unpacked = 0;
  const sheets = unzipSync(data, {
    filter: ({ name, originalSize }) => {
      unpacked += originalSize;
      if (unpacked > MAX_UNPACKED) throw new Error('too large');
      return name === WORKBOOK || /^xl\/worksheets\/[^/]+\.xml$/.test(name);
    },
  });
  const { [WORKBOOK]: workbook, ...worksheets } = sheets;
  for (const xml of Object.values(worksheets)) {
    const rows = new TextDecoder().decode(xml).matchAll(/<row\b[^>]*?\br="(\d+)"/g);
    let count = 0;
    for (const [, index] of rows) {
      count += 1;
      if (count > MAX_ROWS || Number(index) > MAX_ROWS) throw new Error('too many rows');
    }
  }
  return hiddenSheets(workbook);
}

/** The visibility lives in the workbook part, which read-excel-file does not expose. */
function hiddenSheets(workbook: Uint8Array | undefined): Set<string> {
  if (workbook === undefined) return new Set();
  const parsed = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true }).parse(
    new TextDecoder().decode(workbook),
  );
  const entries: unknown = parsed?.workbook?.sheets?.sheet ?? [];
  const sheets = (Array.isArray(entries) ? entries : [entries]) as Record<string, unknown>[];
  return new Set(
    sheets
      .filter((sheet) => sheet['@_state'] === 'hidden' || sheet['@_state'] === 'veryHidden')
      .map((sheet) => String(sheet['@_name'])),
  );
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
    let hidden: Set<string>;
    try {
      const copy = new Uint8Array(source.data);
      hidden = assertWithinLimits(copy);
      sheets = await readExcelFile(copy.buffer);
    } catch {
      // The library's messages describe the file; only the format is reported.
      throw new ConversionError('xlsx');
    }
    const builder = new MarkdownBuilder();
    const warnings: ConversionWarning[] = [];
    const include = ctx.options.includeHiddenSheets === true;
    let skipped = 0;
    for (const { sheet, data } of sheets) {
      if (!include && hidden.has(sheet)) {
        skipped += 1;
        continue;
      }
      builder.heading(2, label(sheet));
      const [header = [], ...rows] = data.map((row) => row.map(text));
      if (data.length > 0) builder.table(header, rows);
    }
    if (skipped > 0) {
      warnings.push({
        code: 'HIDDEN_SHEETS_SKIPPED',
        message: `${skipped} hidden ${skipped === 1 ? 'sheet' : 'sheets'} skipped`,
      });
    }
    return {
      markdown: builder.build(),
      metadata: { schemaVersion: 1, sourceId: ctx.sourceId, mime: MIME },
      warnings,
    };
  }
}
