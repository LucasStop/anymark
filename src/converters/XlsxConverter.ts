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
const WORKBOOK_RELS = 'xl/_rels/workbook.xml.rels';
// A real sheet list is a few KB; this only bounds the extra parse.
const MAX_WORKBOOK = 5 * 1024 * 1024;
const MAX_COLUMN = 16_384;
// The only values a t="e" cell can hold; anything else is not echoed.
const ERRORS = new Set([
  '#NULL!',
  '#DIV/0!',
  '#VALUE!',
  '#REF!',
  '#NAME?',
  '#NUM!',
  '#N/A',
  '#GETTING_DATA',
]);

/** What the sheet XML says and read-excel-file drops: visibility of rows and columns, error cells. */
interface SheetInfo {
  hidden: boolean;
  hiddenRows: Set<number>;
  hiddenColumns: [number, number][];
  errors: { row: number; column: number; text: string }[];
}

const columnNumber = (letters: string): number =>
  [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const flag = (tag: string, name: string): boolean => new RegExp(`\\b${name}="(1|true)"`).test(tag);
const attribute = (tag: string, name: string): string | undefined =>
  new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];

/** Reads the sheet XML once, counting rows against the cap on the way. */
function scanSheet(xml: string): Omit<SheetInfo, 'hidden'> {
  let count = 0;
  const hiddenRows = new Set<number>();
  for (const [tag] of xml.matchAll(/<row\b[^>]*>/g)) {
    const index = attribute(tag, 'r');
    if (index === undefined) continue;
    count += 1;
    if (count > MAX_ROWS || Number(index) > MAX_ROWS) throw new Error('too many rows');
    if (flag(tag, 'hidden')) hiddenRows.add(Number(index));
  }
  const hiddenColumns: [number, number][] = [];
  for (const [tag] of xml.matchAll(/<col\b[^>]*>/g)) {
    const min = Number(attribute(tag, 'min'));
    const max = Number(attribute(tag, 'max'));
    if (flag(tag, 'hidden') && min >= 1 && max >= min)
      hiddenColumns.push([min, Math.min(max, MAX_COLUMN)]);
  }
  const errors: SheetInfo['errors'] = [];
  for (const [, tag, value = ''] of xml.matchAll(/(<c\b[^>]*\bt="e"[^>]*>)\s*<v>([^<]*)<\/v>/g)) {
    const ref = /\br="([A-Z]{1,3})(\d+)"/.exec(tag ?? '');
    const column = columnNumber(ref?.[1] ?? '');
    const row = Number(ref?.[2]);
    if (ERRORS.has(value) && column >= 1 && column <= MAX_COLUMN && row >= 1 && row <= MAX_ROWS)
      errors.push({ row, column, text: value });
  }
  return { hiddenRows, hiddenColumns, errors };
}

/**
 * read-excel-file pads a sparse sheet into a dense array and does not cap inflation, so a tiny
 * hostile file can exhaust memory. Sizes come from the zip directory, rows from the sheet XML.
 * Returns, per sheet in workbook order, what the library does not expose (see SheetInfo).
 */
function assertWithinLimits(data: Uint8Array): SheetInfo[] {
  let unpacked = 0;
  const parts = unzipSync(data, {
    filter: ({ name, originalSize }) => {
      unpacked += originalSize;
      if (unpacked > MAX_UNPACKED) throw new Error('too large');
      return (
        name === WORKBOOK || name === WORKBOOK_RELS || /^xl\/worksheets\/[^/]+\.xml$/.test(name)
      );
    },
  });
  const { [WORKBOOK]: workbook, [WORKBOOK_RELS]: rels, ...worksheets } = parts;
  const scanned = new Map(
    Object.entries(worksheets).map(([path, xml]) => [
      path,
      scanSheet(new TextDecoder().decode(xml)),
    ]),
  );
  if ((workbook?.length ?? 0) > MAX_WORKBOOK || (rels?.length ?? 0) > MAX_WORKBOOK)
    throw new Error('workbook too large');
  return sheetEntries(workbook).map(({ hidden, id }) => ({
    hidden,
    ...(scanned.get(worksheetPath(rels, id)) ?? {
      hiddenRows: new Set(),
      hiddenColumns: [],
      errors: [],
    }),
  }));
}

const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });
const asList = (value: unknown): Record<string, unknown>[] =>
  (Array.isArray(value) ? value : value === undefined ? [] : [value]) as Record<string, unknown>[];

/**
 * The visibility lives in the workbook part, which read-excel-file does not expose. Matched by
 * position: the two parsers decode a sheet name differently, and a mismatch would leak the sheet.
 */
function sheetEntries(workbook: Uint8Array | undefined): { hidden: boolean; id: unknown }[] {
  if (workbook === undefined) return [];
  const parsed = parser.parse(new TextDecoder().decode(workbook));
  return asList(parsed?.workbook?.sheets?.sheet).map((sheet) => ({
    hidden: sheet['@_state'] === 'hidden' || sheet['@_state'] === 'veryHidden',
    id: sheet['@_id'],
  }));
}

function worksheetPath(rels: Uint8Array | undefined, id: unknown): string {
  if (rels === undefined) return '';
  const parsed = parser.parse(new TextDecoder().decode(rels));
  const target = asList(parsed?.Relationships?.Relationship).find((r) => r['@_Id'] === id)?.[
    '@_Target'
  ];
  if (typeof target !== 'string') return '';
  return target.startsWith('/') ? target.slice(1) : `xl/${target}`;
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
    let info: SheetInfo[];
    try {
      const copy = new Uint8Array(source.data);
      info = assertWithinLimits(copy);
      sheets = await readExcelFile(copy.buffer);
      // Fail closed: if the counts disagree the visibility cannot be trusted.
      if (info.length !== sheets.length) throw new Error('sheet count mismatch');
    } catch {
      // The library's messages describe the file; only the format is reported.
      throw new ConversionError('xlsx');
    }
    const builder = new MarkdownBuilder();
    const include = ctx.options.includeHidden === true;
    let skippedSheets = 0;
    let skippedRows = 0;
    let skippedColumns = 0;
    for (const [index, { sheet, data: read }] of sheets.entries()) {
      const { hidden, hiddenRows, hiddenColumns, errors } = info[index] as SheetInfo;
      if (!include && hidden) {
        skippedSheets += 1;
        continue;
      }
      for (const { row, column, text: error } of errors) {
        const cells = (read[row - 1] ??= []);
        cells[column - 1] = error;
      }
      const columnHidden = (column: number) =>
        hiddenColumns.some(([min, max]) => column >= min && column <= max);
      // A row that only held errors may have been missing from the library's output: fill the holes.
      const data = Array.from(read, (cells) => cells ?? []);
      const width = data.reduce((most, cells) => Math.max(most, cells.length), 0);
      const keptColumns = [...Array(width).keys()].filter((c) => include || !columnHidden(c + 1));
      const keptRows = data.flatMap((cells, r) =>
        include || !hiddenRows.has(r + 1) ? [cells] : [],
      );
      skippedRows += data.length - keptRows.length;
      skippedColumns += width - keptColumns.length;
      builder.heading(2, label(sheet));
      const [header = [], ...rows] = keptRows.map((cells) =>
        keptColumns.map((c) => text(cells[c])),
      );
      if (data.length > 0 && keptColumns.length > 0 && keptRows.length > 0)
        builder.table(header, rows);
    }
    const warnings: ConversionWarning[] = [];
    const skipped = (code: string, count: number, noun: string) => {
      if (count > 0)
        warnings.push({
          code,
          message: `${count} hidden ${count === 1 ? noun : `${noun}s`} skipped`,
        });
    };
    skipped('HIDDEN_SHEETS_SKIPPED', skippedSheets, 'sheet');
    skipped('HIDDEN_ROWS_SKIPPED', skippedRows, 'row');
    skipped('HIDDEN_COLUMNS_SKIPPED', skippedColumns, 'column');
    return {
      markdown: builder.build(),
      metadata: { schemaVersion: 1, sourceId: ctx.sourceId, mime: MIME },
      warnings,
    };
  }
}
