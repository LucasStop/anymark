import { posix } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { unzipSync } from 'fflate';
import { ConversionError } from '../core/errors.js';
import { MarkdownBuilder } from '../core/MarkdownBuilder.js';
import type {
  ConversionResult,
  ConversionWarning,
  Converter,
  ConverterContext,
  Source,
} from '../core/types.js';

const MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const MAX_UNPACKED = 100 * 1024 * 1024;
const MAX_SLIDES = 2000;
const PARTS =
  /^ppt\/(?:presentation\.xml|_rels\/presentation\.xml\.rels|slides\/[^/]+\.xml|slides\/_rels\/[^/]+\.rels|notesSlides\/[^/]+\.xml)$/;
const TITLES = new Set(['title', 'ctrTitle']);
// Chrome around the content, not content: slide thumbnail, number, footer, date, header.
const CHROME = new Set(['sldImg', 'sldNum', 'ftr', 'dt', 'hdr']);

/** fast-xml-parser with preserveOrder: [{ tag: children, ':@': attributes }, ...] */
type XNode = Record<string, unknown>;

// parseTagValue off: text like 007 or 1.50 must not be rewritten as a number.
const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  trimValues: false,
  parseTagValue: false,
});
const parse = (bytes: Uint8Array): XNode[] =>
  parser.parse(new TextDecoder().decode(bytes)) as XNode[];

const tagOf = (node: XNode): string => Object.keys(node).find((key) => key !== ':@') ?? '';
const kids = (node: XNode): XNode[] => {
  const children = node[tagOf(node)];
  return Array.isArray(children) ? (children as XNode[]) : []; // a #text leaf holds a string
};
const attr = (node: XNode, name: string): string | undefined =>
  (node[':@'] as Record<string, string> | undefined)?.[`@_${name}`];
const named = (nodes: readonly XNode[], tag: string): XNode[] =>
  nodes.filter((n) => tagOf(n) === tag);
const first = (nodes: readonly XNode[], tag: string): XNode | undefined => named(nodes, tag)[0];

/** Every descendant with this tag, in document order. */
function descendants(nodes: readonly XNode[], tag: string): XNode[] {
  return nodes.flatMap((n) => (tagOf(n) === tag ? [n] : descendants(kids(n), tag)));
}

function textOf(nodes: readonly XNode[]): string {
  return nodes
    .map((n) => {
      if ('#text' in n) return String(n['#text']);
      return tagOf(n) === 'a:br' ? ' ' : textOf(kids(n));
    })
    .join('');
}

/** One string per `a:p`, empty ones dropped. */
const paragraphs = (nodes: readonly XNode[]): string[] =>
  descendants(nodes, 'a:p')
    .map((p) => textOf(p[tagOf(p)] as XNode[]).trim())
    .filter((text) => text !== '');

function placeholder(shape: XNode): string | undefined {
  const nvPr = first(kids(first(kids(shape), 'p:nvSpPr') ?? {}), 'p:nvPr');
  const ph = nvPr === undefined ? undefined : first(kids(nvPr), 'p:ph');
  return ph === undefined ? undefined : (attr(ph, 'type') ?? 'body');
}

type Block = { kind: 'title' | 'text'; text: string } | { kind: 'table'; rows: string[][] };

/** The visible content of one slide or notes part, in shape order. */
function blocksOf(root: XNode[]): Block[] {
  const tree = first(
    kids(first(kids(root.find((n) => !tagOf(n).startsWith('?')) ?? {}), 'p:cSld') ?? {}),
    'p:spTree',
  );
  const walk = (nodes: readonly XNode[]): Block[] =>
    nodes.flatMap((node): Block[] => {
      switch (tagOf(node)) {
        case 'p:grpSp':
          return walk(kids(node));
        case 'mc:AlternateContent': {
          // Choice is for newer Office, Fallback for older: the same content, so read one of them.
          const choice = walk(kids(first(kids(node), 'mc:Choice') ?? {}));
          return choice.length > 0 ? choice : walk(kids(first(kids(node), 'mc:Fallback') ?? {}));
        }
        case 'p:sp': {
          const type = placeholder(node);
          if (type !== undefined && CHROME.has(type)) return [];
          const kind = type !== undefined && TITLES.has(type) ? 'title' : 'text';
          return paragraphs(kids(node)).map((text) => ({ kind, text }));
        }
        case 'p:graphicFrame':
          return descendants(kids(node), 'a:tbl').map((table) => ({
            kind: 'table',
            rows: named(kids(table), 'a:tr').map((row) =>
              named(kids(row), 'a:tc').map((cell) => paragraphs(kids(cell)).join(' ')),
            ),
          }));
        default:
          return [];
      }
    });
  return walk(tree === undefined ? [] : kids(tree));
}

function relationships(
  bytes: Uint8Array | undefined,
  base: string,
): Map<string, { type: string; path: string }> {
  const rels = new Map<string, { type: string; path: string }>();
  if (bytes === undefined) return rels;
  for (const rel of descendants(parse(bytes), 'Relationship')) {
    const id = attr(rel, 'Id');
    const target = attr(rel, 'Target');
    if (id !== undefined && target !== undefined) {
      rels.set(id, {
        type: attr(rel, 'Type') ?? '',
        path: target.startsWith('/') ? target.slice(1) : posix.join(base, target),
      });
    }
  }
  return rels;
}

/** Own parser on fflate and fast-xml-parser: slides in presentation order, tables, speaker notes. */
export class PptxConverter implements Converter {
  readonly name = 'pptx';
  readonly mimes = [MIME];

  async convert(source: Source, ctx: ConverterContext): Promise<ConversionResult> {
    ctx.options.signal?.throwIfAborted();
    const builder = new MarkdownBuilder();
    let hiddenSlides = 0;
    try {
      let unpacked = 0;
      const parts = unzipSync(new Uint8Array(source.data), {
        filter: ({ name, originalSize }) => {
          unpacked += originalSize;
          if (unpacked > MAX_UNPACKED) throw new Error('too large');
          return PARTS.test(name);
        },
      });
      const presentation = parts['ppt/presentation.xml'];
      if (presentation === undefined) throw new Error('not a presentation');
      const rels = relationships(parts['ppt/_rels/presentation.xml.rels'], 'ppt');
      const slides = descendants(parse(presentation), 'p:sldId')
        .map((slide) => rels.get(attr(slide, 'r:id') ?? '')?.path)
        .filter((path): path is string => path !== undefined)
        .slice(0, MAX_SLIDES);
      slides.forEach((path, index) => {
        const part = parts[path];
        if (part === undefined) return;
        const slide = parse(part);
        const root = slide.find((n) => !tagOf(n).startsWith('?'));
        if (
          ctx.options.includeHidden !== true &&
          ['0', 'false'].includes(attr(root ?? {}, 'show') ?? '')
        ) {
          hiddenSlides += 1;
          return;
        }
        const blocks = blocksOf(slide);
        const title = blocks.flatMap((block) => (block.kind === 'title' ? [block.text] : []));
        builder.heading(2, title.length > 0 ? title.join(' ') : `Slide ${index + 1}`);
        for (const block of blocks) {
          if (block.kind === 'text') builder.paragraph(block.text);
          if (block.kind === 'table') {
            const [header = [], ...rows] = block.rows;
            builder.table(header, rows);
          }
        }
        const slideRels = relationships(
          parts[posix.join(posix.dirname(path), '_rels', `${posix.basename(path)}.rels`)],
          posix.dirname(path),
        );
        const notesPath = [...slideRels.values()].find((rel) =>
          rel.type.endsWith('/notesSlide'),
        )?.path;
        const notes = (
          notesPath === undefined ? [] : blocksOf(parse(parts[notesPath] ?? new Uint8Array()))
        ).flatMap((block) => (block.kind === 'text' ? [block.text] : []));
        if (notes.length > 0) {
          builder.heading(3, 'Notes');
          notes.forEach((text) => builder.paragraph(text));
        }
      });
    } catch {
      // Part names and parser messages describe the file; only the format is reported.
      throw new ConversionError('pptx');
    }
    const warnings: ConversionWarning[] = [];
    if (hiddenSlides > 0) {
      warnings.push({
        code: 'HIDDEN_SLIDES_SKIPPED',
        message: `${hiddenSlides} hidden ${hiddenSlides === 1 ? 'slide' : 'slides'} skipped`,
      });
    }
    return {
      markdown: builder.build(),
      metadata: { schemaVersion: 1, sourceId: ctx.sourceId, mime: MIME },
      warnings,
    };
  }
}
