import { describe, expect, it } from 'vitest';
import { MarkdownBuilder } from '../src/index.js';

describe('MarkdownBuilder', () => {
  it('builds nothing from an empty builder', () => {
    expect(new MarkdownBuilder().build()).toBe('');
  });

  it('separates blocks with one blank line and ends with a single newline', () => {
    const md = new MarkdownBuilder().heading(1, 'Title').paragraph('Body text.').build();

    expect(md).toBe('# Title\n\nBody text.\n');
  });

  it('keeps a heading on one line', () => {
    expect(new MarkdownBuilder().heading(2, 'two\nlines').build()).toBe('## two lines\n');
  });

  describe('table', () => {
    it('writes a table of a few hundred thousand rows without overflowing the stack', () => {
      const rows = Array.from({ length: 300_000 }, () => ['x']);

      expect(() => new MarkdownBuilder().table(['h'], rows).build()).not.toThrow();
    });

    it('writes a GFM table', () => {
      const md = new MarkdownBuilder()
        .table(
          ['name', 'city'],
          [
            ['Ana', 'Recife'],
            ['Bruno', 'Curitiba'],
          ],
        )
        .build();

      expect(md).toBe(
        ['| name | city |', '| --- | --- |', '| Ana | Recife |', '| Bruno | Curitiba |', ''].join(
          '\n',
        ),
      );
    });

    it('escapes pipes so a cell cannot break the row', () => {
      const md = new MarkdownBuilder().table(['a|b'], [['x|y']]).build();

      expect(md).toBe('| a\\|b |\n| --- |\n| x\\|y |\n');
    });

    it('escapes a backslash before a pipe', () => {
      const md = new MarkdownBuilder().table(['h'], [['a\\|b']]).build();

      expect(md).toContain('| a\\\\\\|b |');
    });

    it('turns a newline inside a cell into <br>', () => {
      const md = new MarkdownBuilder().table(['h'], [['one\ntwo']]).build();

      expect(md).toContain('| one<br>two |');
    });

    it('pads short rows and widens the header to the widest row', () => {
      const md = new MarkdownBuilder().table(['a'], [['1', '2'], []]).build();

      expect(md).toBe('| a |  |\n| --- | --- |\n| 1 | 2 |\n|  |  |\n');
    });
  });

  describe('list', () => {
    it('writes a bullet list', () => {
      expect(new MarkdownBuilder().list(['one', 'two']).build()).toBe('- one\n- two\n');
    });

    it('writes an ordered list', () => {
      expect(new MarkdownBuilder().list(['one', 'two'], { ordered: true }).build()).toBe(
        '1. one\n2. two\n',
      );
    });

    it('nests children under their parent', () => {
      const md = new MarkdownBuilder()
        .list([
          { text: 'parent', children: ['child a', { text: 'child b', children: ['leaf'] }] },
          'sibling',
        ])
        .build();

      expect(md).toBe('- parent\n  - child a\n  - child b\n    - leaf\n- sibling\n');
    });

    it('indents nested ordered items to the marker width', () => {
      const md = new MarkdownBuilder()
        .list([{ text: 'parent', children: ['child'] }], { ordered: true })
        .build();

      expect(md).toBe('1. parent\n   1. child\n');
    });
  });

  describe('code', () => {
    it('fences code with the language', () => {
      expect(new MarkdownBuilder().code('a = 1', 'ts').build()).toBe('```ts\na = 1\n```\n');
    });

    it('uses a longer fence when the code contains backticks', () => {
      const md = new MarkdownBuilder().code('```\ninner\n```').build();

      expect(md).toBe('````\n```\ninner\n```\n````\n');
    });
  });
});
