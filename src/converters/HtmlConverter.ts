import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import type { ConversionResult, Converter, ConverterContext, Source } from '../core/types.js';
import { decodeText } from './decodeText.js';

const MIME = 'text/html';

/** Parsed by turndown's DOM (no script execution, no fetching); these never reach the output. */
const DROPPED = ['head', 'title', 'script', 'style', 'noscript', 'template'] as const;

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
    const turndown = new TurndownService({
      headingStyle: 'atx',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
    })
      .use(gfm)
      .addRule('listItem', { filter: 'li', replacement: listItem })
      .remove([...DROPPED]);
    const markdown = turndown.turndown(decodeText(source.data)).trim();
    return {
      markdown: markdown === '' ? '' : `${markdown}\n`,
      metadata: { schemaVersion: 1, sourceId: ctx.sourceId, mime: MIME },
      warnings: [],
    };
  }
}
