import { parse } from 'csv-parse/sync';
import { ConversionError } from '../core/errors.js';
import { MarkdownBuilder } from '../core/MarkdownBuilder.js';
import type { ConversionResult, Converter, ConverterContext, Source } from '../core/types.js';

const MIME = 'text/csv';
const CANDIDATES = [',', ';', '\t'];

/** Most frequent candidate on the first line, ignoring quotes. Ties go to the comma. */
// ponytail: first-line heuristic; add an explicit delimiter option if real files outgrow it.
function sniffDelimiter(text: string): string {
  const counts = new Map(CANDIDATES.map((c) => [c, 0]));
  let quoted = false;
  for (const char of text.replace(/^[\r\n]+/, '')) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === '\n' || char === '\r')) break;
    else if (!quoted && counts.has(char)) counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  let best = ',';
  for (const [char, n] of counts) if (n > (counts.get(best) ?? 0)) best = char;
  return best;
}

export class CsvConverter implements Converter {
  readonly name = 'csv';
  readonly mimes = [MIME];

  async convert(source: Source, ctx: ConverterContext): Promise<ConversionResult> {
    // TextDecoder drops a leading BOM, which Excel adds to UTF-8 CSV.
    const text = new TextDecoder('utf-8').decode(source.data);
    let rows: string[][];
    try {
      rows = parse(text, {
        delimiter: sniffDelimiter(text),
        skip_empty_lines: true,
        relax_column_count: true,
      }) as string[][];
    } catch {
      // The parser's message quotes the offending row; the file content must not reach logs.
      throw new ConversionError('csv');
    }
    const [header = [], ...body] = rows;
    return {
      markdown: rows.length === 0 ? '' : new MarkdownBuilder().table(header, body).build(),
      metadata: { schemaVersion: 1, sourceId: ctx.sourceId, mime: MIME },
      warnings: [],
    };
  }
}
