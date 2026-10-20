import { unzipSync, zipSync } from 'fflate';
import mammoth from 'mammoth';
import { ConversionError } from '../core/errors.js';
import type {
  ConversionResult,
  ConversionWarning,
  Converter,
  ConverterContext,
  Source,
} from '../core/types.js';
import { HtmlConverter } from './HtmlConverter.js';

const MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

interface Cell {
  html: string;
  colspan: number;
  rowspan: number;
}
interface Counts {
  merged: number;
  nested: number;
}

// A hostile gridSpan could ask for a billion columns.
const MAX_SPAN = 1000;
const span = (tag: string, name: string): number => {
  const value = Number(new RegExp(`\\b${name}\\s*=\\s*["'](\\d+)["']`).exec(tag)?.[1] ?? 1);
  return Math.min(Math.max(value, 1), MAX_SPAN);
};
// Word cells wrap their text in paragraphs, which turndown renders as blocks that break a GFM row.
const inline = (html: string): string => html.replace(/<\/p><p>/g, '<br />').replace(/<\/?p>/g, '');

/**
 * Walks mammoth's table markup (no attributes besides colspan and rowspan) and rebuilds each
 * top-level table as a rectangle: a merged cell leaves empty cells behind and a table inside a cell
 * becomes its text, so turndown only sees a plain grid. Word tables have no header cells; the first
 * row becomes the header.
 */
function plainTables(html: string, counts: Counts): string {
  const tokens = html.split(/(<\/?(?:table|tr|td|th)\b[^>]*>)/);
  let at = 0;

  const parseTable = (): Cell[][] => {
    const rows: Cell[][] = [];
    while (at < tokens.length) {
      const token = tokens[at++] ?? '';
      if (/^<\/table/.test(token)) break;
      if (/^<tr\b/.test(token)) rows.push([]);
      else if (/^<t[dh]\b/.test(token)) {
        const cell: Cell = {
          html: '',
          colspan: span(token, 'colspan'),
          rowspan: span(token, 'rowspan'),
        };
        if (cell.colspan > 1 || cell.rowspan > 1) counts.merged += 1;
        while (at < tokens.length) {
          const inner = tokens[at++] ?? '';
          if (/^<\/t[dh]/.test(inner)) break;
          if (/^<table\b/.test(inner)) {
            counts.nested += 1;
            cell.html += flatten(parseTable());
          } else cell.html += inner;
        }
        (rows[rows.length - 1] ?? rows[rows.push([]) - 1])?.push(cell);
      }
    }
    return rows;
  };

  // The text of an inner table: cells joined by ", ", rows by "; ".
  const flatten = (rows: Cell[][]): string =>
    rows
      .map((row) =>
        row
          .map((cell) =>
            inline(cell.html)
              .replace(/<br \/>/g, ' ')
              .trim(),
          )
          .filter(Boolean)
          .join(', '),
      )
      .filter(Boolean)
      .join('; ');

  const render = (rows: Cell[][]): string => {
    const carry: number[] = [];
    const grid = rows.map((row) => {
      const out: string[] = [];
      const fill = () => {
        while ((carry[out.length] ?? 0) > 0) {
          carry[out.length] = (carry[out.length] ?? 0) - 1;
          out.push('');
        }
      };
      for (const cell of row) {
        fill();
        const column = out.length;
        out.push(inline(cell.html));
        for (let k = 1; k < cell.colspan; k += 1) out.push('');
        if (cell.rowspan > 1)
          for (let k = 0; k < cell.colspan; k += 1) carry[column + k] = cell.rowspan - 1;
      }
      fill();
      return out;
    });
    const width = Math.max(0, ...grid.map((row) => row.length));
    return `<table>${grid
      .map((row, r) => {
        const tag = r === 0 ? 'th' : 'td';
        const cells = Array.from({ length: width }, (_, c) => `<${tag}>${row[c] ?? ''}</${tag}>`);
        return `<tr>${cells.join('')}</tr>`;
      })
      .join('')}</table>`;
  };

  let out = '';
  while (at < tokens.length) {
    const token = tokens[at++] ?? '';
    out += /^<table\b/.test(token) ? render(parseTable()) : token;
  }
  return out;
}

const MAX_UNPACKED = 100 * 1024 * 1024;
// A run is hidden by <w:vanish/> or <w:vanish w:val="1|true|on"/>; w:val="0" means shown.
const HIDDEN_RUN =
  /<w:r\b(?:(?!<\/w:r>)[\s\S])*?<w:vanish(?:\s+w:val="(?:1|true|on)")?\s*\/>[\s\S]*?<\/w:r>/g;

/**
 * mammoth ignores w:vanish, so hidden text would reach the output (and any model reading it), and
 * it does not cap inflation. The zip is opened here under a size cap, hidden runs are cut from the
 * body, and the result goes to mammoth.
 */
function visibleOnly(data: Uint8Array): Uint8Array {
  let unpacked = 0;
  const files = unzipSync(data, {
    filter: ({ originalSize }) => {
      unpacked += originalSize;
      if (unpacked > MAX_UNPACKED) throw new Error('too large');
      return true;
    },
  });
  const body = files['word/document.xml'];
  if (body === undefined) throw new Error('not a document');
  files['word/document.xml'] = new TextEncoder().encode(
    new TextDecoder().decode(body).replace(HIDDEN_RUN, ''),
  );
  return zipSync(files);
}

/** mammoth to HTML, then the HtmlConverter pipeline: one place decides how HTML becomes Markdown. */
export class DocxConverter implements Converter {
  readonly name = 'docx';
  readonly mimes = [MIME];
  readonly #html = new HtmlConverter();

  async convert(source: Source, ctx: ConverterContext): Promise<ConversionResult> {
    ctx.options.signal?.throwIfAborted();
    let html: string;
    const counts: Counts = { merged: 0, nested: 0 };
    try {
      const result = await mammoth.convertToHtml(
        { buffer: Buffer.from(visibleOnly(new Uint8Array(source.data))) },
        // Embedded images are ignored by default: the empty src keeps base64 out, the <img> is stripped below.
        { convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: '' })) },
      );
      html = plainTables(result.value.replace(/<img\b[^>]*>/g, ''), counts);
    } catch {
      // mammoth's messages name parts of the file; only the format is reported.
      throw new ConversionError('docx');
    }
    const converted = await this.#html.convert(
      { ...source, data: new TextEncoder().encode(html) },
      ctx,
    );
    const warnings: ConversionWarning[] = [...converted.warnings];
    if (counts.merged > 0)
      warnings.push({
        code: 'DOCX_MERGED_CELLS',
        message: `${counts.merged} merged ${counts.merged === 1 ? 'cell' : 'cells'} expanded`,
      });
    if (counts.nested > 0)
      warnings.push({
        code: 'DOCX_NESTED_TABLE',
        message: `${counts.nested} nested ${counts.nested === 1 ? 'table' : 'tables'} flattened into the cell text`,
      });
    return { ...converted, metadata: { ...converted.metadata, mime: MIME }, warnings };
  }
}
