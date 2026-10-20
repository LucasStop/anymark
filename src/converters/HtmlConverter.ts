import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { ConversionError } from '../core/errors.js';
import type { ConversionResult, Converter, ConverterContext, Source } from '../core/types.js';
import { decodeText } from './decodeText.js';

const MIME = 'text/html';
// Same cap as the OCR input: turndown builds a DOM and several copies of the text in memory.
const MAX_BYTES = 25 * 1024 * 1024;

/** Parsed by turndown's DOM (no script execution, no fetching); these never reach the output. */
const DROPPED = [
  'head',
  'title',
  'script',
  'style',
  'noscript',
  'template',
  'textarea',
  'object',
  'iframe',
] as const;

const HIDDEN_STYLE = /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\s*(?:;|$)/i;
const UNSAFE_TARGET = /^[\s\p{Cc}]*(?:javascript|data|vbscript):/iu;

/** Text a reader never sees can still carry instructions for the model that reads the output. */
interface Attributes {
  getAttribute(name: string): string | null;
}
const isHidden = (node: unknown): boolean => {
  const element = node as Partial<Attributes>;
  if (typeof element.getAttribute !== 'function') return false;
  return (
    element.getAttribute('hidden') !== null ||
    element.getAttribute('aria-hidden') === 'true' ||
    HIDDEN_STYLE.test(element.getAttribute('style') ?? '')
  );
};
const inCell = (node: {
  parentNode?: { nodeName: string; parentNode?: unknown } | null;
}): boolean => {
  for (let at = node.parentNode; at; at = at.parentNode as typeof at) {
    // Markdown does not read HTML inside a code span, so the reader would see the tag as text.
    if (at.nodeName === 'CODE' || at.nodeName === 'PRE') return false;
    if (at.nodeName === 'TD' || at.nodeName === 'TH') return true;
  }
  return false;
};
const targetOf = (node: unknown, attribute: string): string =>
  (node as Attributes).getAttribute(attribute) ?? '';

/** turndown pads list markers to four columns ("-   item"); one space reads better and diffs cleanly. */
interface ListNode {
  readonly nextSibling: unknown;
  readonly parentNode: {
    readonly nodeName: string;
    readonly children: ArrayLike<unknown>;
    getAttribute(name: string): string | null;
  } | null;
}

function listItem(content: string, node: unknown): string {
  const { parentNode: parent, nextSibling } = node as ListNode;
  const index = parent === null ? 0 : Array.from(parent.children).indexOf(node);
  const start = Number(parent?.getAttribute('start') ?? 1);
  const marker = parent?.nodeName === 'OL' ? `${start + index}. ` : '- ';
  const body = content
    .replace(/^\n+/, '')
    .replace(/\n+$/, '\n')
    .replace(/\n/g, `\n${' '.repeat(marker.length)}`);
  return marker + body + (nextSibling !== null && !body.endsWith('\n') ? '\n' : '');
}

export class HtmlConverter implements Converter {
  readonly name = 'html';
  readonly mimes = [MIME];

  async convert(source: Source, ctx: ConverterContext): Promise<ConversionResult> {
    ctx.options.signal?.throwIfAborted();
    if (source.data.byteLength > MAX_BYTES) throw new ConversionError('html');
    const turndown = new TurndownService({
      headingStyle: 'atx',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
    })
      .use(gfm)
      .addRule('listItem', { filter: 'li', replacement: listItem })
      .remove([...DROPPED])
      // A hard break ("  \n") would end the GFM row; a literal <br> keeps the cell on one line.
      .addRule('cellBreak', {
        filter: (node) => node.nodeName === 'BR' && inCell(node),
        replacement: () => '<br>',
      })
      .addRule('hidden', { filter: isHidden, replacement: () => '' })
      .addRule('unsafeLink', {
        filter: (node) => node.nodeName === 'A' && UNSAFE_TARGET.test(targetOf(node, 'href')),
        replacement: (content) => content,
      })
      .addRule('unsafeImage', {
        filter: (node) => node.nodeName === 'IMG' && UNSAFE_TARGET.test(targetOf(node, 'src')),
        replacement: () => '',
      });
    let markdown: string;
    try {
      markdown = turndown.turndown(decodeText(source.data)).trim();
    } catch {
      // Deep nesting overflows the stack in turndown's recursion; the message would add nothing.
      throw new ConversionError('html');
    }
    return {
      markdown: markdown === '' ? '' : `${markdown}\n`,
      metadata: { schemaVersion: 1, sourceId: ctx.sourceId, mime: MIME },
      warnings: [],
    };
  }
}
