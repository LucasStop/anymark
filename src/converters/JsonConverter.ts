import { ConversionError } from '../core/errors.js';
import { MarkdownBuilder } from '../core/MarkdownBuilder.js';
import type { ConversionResult, Converter, ConverterContext, Source } from '../core/types.js';
import { decodeText } from './decodeText.js';

const MIME = 'application/json';

type Row = Record<string, string | number | bigint | boolean | null>;

const isScalar = (value: unknown): boolean =>
  value === null || ['string', 'number', 'bigint', 'boolean'].includes(typeof value);

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
        Object.values(row).every(isScalar) &&
        Object.keys(row).length > 0,
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
      // An integer past 2^53 would be rounded by the parse; its source text is exact, so it becomes a BigInt.
      value = JSON.parse(decodeText(source.data), (_key, parsed, { source: text = '' }) =>
        typeof parsed === 'number' && !Number.isSafeInteger(parsed) && /^-?\d+$/.test(text)
          ? BigInt(text)
          : parsed,
      );
    } catch {
      // SyntaxError messages quote the offending text; the document must not reach logs.
      throw new ConversionError('json');
    }
    const builder = new MarkdownBuilder();
    if (isFlatRows(value)) {
      const header = [...new Set(value.flatMap((row) => Object.keys(row)))];
      builder.table(
        header,
        value.map((row) => header.map((key) => (Object.hasOwn(row, key) ? String(row[key]) : ''))),
      );
    } else {
      // JSON.stringify throws on BigInt; rawJSON writes the digits as they are.
      const exact = (_key: string, item: unknown) =>
        typeof item === 'bigint' ? JSON.rawJSON(String(item)) : item;
      builder.code(JSON.stringify(value, exact, 2), 'json');
    }
    return {
      markdown: builder.build(),
      metadata: { schemaVersion: 1, sourceId: ctx.sourceId, mime: MIME },
      warnings: [],
    };
  }
}
