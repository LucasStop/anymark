import type {
  Chunk,
  ConversionResult,
  Converter,
  ConverterContext,
  Source,
} from '../core/types.js';

export interface ChunkingOptions {
  /** Largest chunk, in characters. Default 2000. */
  readonly maxChars?: number;
  /** Characters repeated at the start of the next piece of an oversized section. Default 200. */
  readonly overlap?: number;
}

interface Section {
  readonly headingPath: readonly string[];
  readonly text: string;
}

const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const FENCE = /^\s{0,3}(```|~~~)/;

/** Cuts at headings, skipping fenced code, and tracks the heading path of each section. */
function sections(markdown: string): Section[] {
  const out: Section[] = [];
  const path: { level: number; title: string }[] = [];
  let current: string[] = [];
  let currentPath: readonly string[] = [];
  let fenced = false;
  const flush = () => {
    const text = current.join('\n').trim();
    if (text !== '') out.push({ headingPath: currentPath, text });
    current = [];
  };
  for (const line of markdown.split(/\r?\n/)) {
    if (FENCE.test(line)) fenced = !fenced;
    const match = fenced ? null : HEADING.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      flush();
      const level = match[1].length;
      while (path.length > 0 && (path.at(-1)?.level ?? 0) >= level) path.pop();
      path.push({ level, title: match[2] });
      currentPath = path.map((p) => p.title);
    }
    current.push(line);
  }
  flush();
  return out;
}

/** Window of at most `max` characters, ended at a paragraph, line or word break when one is near. */
function pieces(text: string, max: number, overlap: number): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + max, text.length);
    if (end < text.length) {
      const window = text.slice(start, end);
      const floor = Math.floor(max / 2);
      const cut = Math.max(
        window.lastIndexOf('\n\n'),
        window.lastIndexOf('\n'),
        window.lastIndexOf(' '),
      );
      if (cut >= floor) end = start + cut;
    }
    out.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    // Always move forward, even when the overlap would pull the window back to where it began.
    start = Math.max(end - overlap, start + 1);
  }
  return out.filter((piece) => piece !== '');
}

/**
 * Decorator: wraps any `Converter` behind the same interface and adds `chunks` for RAG indexing.
 * The Markdown, metadata and warnings of the wrapped converter pass through unchanged.
 */
export class ChunkingDecorator implements Converter {
  readonly name: string;
  readonly mimes: readonly string[];
  readonly #inner: Converter;
  readonly #maxChars: number;
  readonly #overlap: number;

  constructor(inner: Converter, options: ChunkingOptions = {}) {
    const { maxChars = 2000, overlap = 200 } = options;
    if (!Number.isInteger(maxChars) || maxChars < 1)
      throw new RangeError('maxChars must be a positive integer');
    if (!Number.isInteger(overlap) || overlap < 0 || overlap >= maxChars) {
      throw new RangeError('overlap must be an integer from 0 up to maxChars - 1');
    }
    this.#inner = inner;
    this.name = inner.name;
    this.mimes = inner.mimes;
    this.#maxChars = maxChars;
    this.#overlap = overlap;
  }

  async convert(source: Source, ctx: ConverterContext): Promise<ConversionResult> {
    const result = await this.#inner.convert(source, ctx);
    const chunks: Chunk[] = sections(result.markdown).flatMap(({ headingPath, text }) =>
      pieces(text, this.#maxChars, this.#overlap).map((piece) => ({
        index: 0,
        headingPath,
        text: piece,
      })),
    );
    return { ...result, chunks: chunks.map((chunk, index) => ({ ...chunk, index })) };
  }
}
