import { XMLValidator } from 'fast-xml-parser';
import { ConversionError } from '../core/errors.js';
import { MarkdownBuilder } from '../core/MarkdownBuilder.js';
import type { ConversionResult, Converter, ConverterContext, Source } from '../core/types.js';
import { decodeText } from './decodeText.js';

const MIME = 'application/xml';

/** Well-formedness is checked, never parsed into a tree: no entity expansion, nothing to exhaust. */
export class XmlConverter implements Converter {
  readonly name = 'xml';
  readonly mimes = [MIME];

  async convert(source: Source, ctx: ConverterContext): Promise<ConversionResult> {
    ctx.options.signal?.throwIfAborted();
    const text = decodeText(source.data).trim();
    // The validator's message quotes tag names from the document; only the format is reported.
    if (XMLValidator.validate(text) !== true) throw new ConversionError('xml');
    return {
      markdown: new MarkdownBuilder().code(text, 'xml').build(),
      metadata: { schemaVersion: 1, sourceId: ctx.sourceId, mime: MIME },
      warnings: [],
    };
  }
}
