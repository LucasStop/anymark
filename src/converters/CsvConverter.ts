import { parse } from 'csv-parse/sync';
import { MarkdownBuilder } from '../core/MarkdownBuilder.js';
import type { ConversionResult, Converter, ConverterContext, Source } from '../core/types.js';

const MIME = 'text/csv';

export class CsvConverter implements Converter {
  readonly name = 'csv';
  readonly mimes = [MIME];

  async convert(source: Source, ctx: ConverterContext): Promise<ConversionResult> {
    // TextDecoder drops a leading BOM, which Excel adds to UTF-8 CSV.
    const text = new TextDecoder('utf-8').decode(source.data);
    const rows = parse(text, { skip_empty_lines: true, relax_column_count: true }) as string[][];
    const [header = [], ...body] = rows;
    return {
      markdown: rows.length === 0 ? '' : new MarkdownBuilder().table(header, body).build(),
      metadata: { schemaVersion: 1, sourceId: ctx.sourceId, mime: MIME },
      warnings: [],
    };
  }
}
