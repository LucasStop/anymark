import { ConversionError } from '../core/errors.js';
import { MarkdownBuilder } from '../core/MarkdownBuilder.js';
import type { ConversionResult, Converter, ConverterContext, Source } from '../core/types.js';
import { decodeText } from './decodeText.js';

const MIME = 'application/json';

type Row = Record<string, string | number | boolean | null>;

const isScalar = (value: unknown): boolean =>
  value === null || ['string', 'number', 'boolean'].includes(typeof value);

/** A non-empty array of objects whose values are all scalars: the only shape a table shows without loss. */
function isFlatRows(value: unknown): value is Row[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (row) =>
        typeof row === 'object' &&
        row !== null &&
        !Array.isArray(row) &&
        Object.values(row).every(isScalar),
    )
  );
}

export class JsonConverter implements Converter {
  readonly name = 'json';
  readonly mimes = [MIME];

  async convert(source: Source, ctx: ConverterContext): Promise<ConversionResult> {
    ctx.options.signal?.throwIfAborted();
    let value: unknown;
    try {
      value = JSON.parse(decodeText(source.data));
    } catch {
      // SyntaxError messages quote the offending text; the document must not reach logs.
      throw new ConversionError('json');
    }
    const builder = new MarkdownBuilder();
    if (isFlatRows(value)) {
      const header = [...new Set(value.flatMap((row) => Object.keys(row)))];
      builder.table(
        header,
        value.map((row) => header.map((key) => (key in row ? String(row[key]) : ''))),
      );
    } else {
      builder.code(JSON.stringify(value, null, 2), 'json');
    }
    return {
      markdown: builder.build(),
      metadata: { schemaVersion: 1, sourceId: ctx.sourceId, mime: MIME },
      warnings: [],
    };
  }
}
