export type ListItem = string | { readonly text: string; readonly children?: readonly ListItem[] };

const oneLine = (text: string): string => text.replace(/\s*[\r\n]+\s*/g, ' ').trim();

// Only what breaks the table structure: backslash first, so an escaped pipe stays one pipe.
const cell = (text: string): string =>
  text
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r\n|\r|\n/g, '<br>');

function listLines(items: readonly ListItem[], ordered: boolean): string[] {
  return items.flatMap((item, index) => {
    const marker = ordered ? `${index + 1}. ` : '- ';
    const { text, children } = typeof item === 'string' ? { text: item, children: [] } : item;
    const indent = ' '.repeat(marker.length);
    const nested = listLines(children ?? [], ordered).map((line) => indent + line);
    return [marker + oneLine(text), ...nested];
  });
}

/**
 * Builder: the one place that knows how to escape and separate Markdown blocks.
 * Converters describe structure; they never concatenate Markdown strings.
 */
export class MarkdownBuilder {
  readonly #blocks: string[] = [];

  heading(level: 1 | 2 | 3 | 4 | 5 | 6, text: string): this {
    this.#blocks.push(`${'#'.repeat(level)} ${oneLine(text)}`);
    return this;
  }

  paragraph(text: string): this {
    this.#blocks.push(text.trim());
    return this;
  }

  list(items: readonly ListItem[], options: { readonly ordered?: boolean } = {}): this {
    this.#blocks.push(listLines(items, options.ordered ?? false).join('\n'));
    return this;
  }

  table(header: readonly string[], rows: readonly (readonly string[])[]): this {
    const width = Math.max(header.length, ...rows.map((row) => row.length));
    const line = (cells: readonly string[]) =>
      `| ${Array.from({ length: width }, (_, i) => cell(cells[i] ?? '')).join(' | ')} |`;
    this.#blocks.push(
      [line(header), line(Array.from({ length: width }, () => '---')), ...rows.map(line)].join(
        '\n',
      ),
    );
    return this;
  }

  code(code: string, language = ''): this {
    const longestRun = Math.max(0, ...(code.match(/`+/g) ?? []).map((run) => run.length));
    const fence = '`'.repeat(Math.max(3, longestRun + 1));
    this.#blocks.push(`${fence}${language}\n${code}\n${fence}`);
    return this;
  }

  build(): string {
    return this.#blocks.length === 0 ? '' : `${this.#blocks.join('\n\n')}\n`;
  }
}
