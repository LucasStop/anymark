import { readFileSync } from 'node:fs';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { DocxConverter } from '../src/converters/DocxConverter.js';
import { ConversionError, createAnymark } from '../src/index.js';
import { assertConverterContract } from '../src/testing/index.js';

const spec = (path: string) => readFileSync(new URL(`../specs/${path}`, import.meta.url));
const docx = () => ({ data: new Uint8Array(spec('docx/simple.docx')), name: 'simple.docx' });

describe('docx converter', () => {
  it('converts heading, paragraph, list and table to the golden Markdown', async () => {
    const result = await createAnymark().convert(docx());

    expect(result.markdown).toBe(spec('docx/simple.md').toString('utf8'));
    expect(result.metadata.mime).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
  });

  it('leaves embedded images out', async () => {
    const { markdown } = await createAnymark().convert(docx());

    expect(markdown).not.toMatch(/!\[|data:image|base64/);
  });

  it('keeps the fixture under 20 KB', () => {
    expect(spec('docx/simple.docx').length).toBeLessThan(20 * 1024);
  });

  it('passes the converter contract', async () => {
    await assertConverterContract(new DocxConverter(), docx());
  });

  it('rejects a corrupted file without echoing its content', async () => {
    const attempt = createAnymark().convert({
      data: new TextEncoder().encode('PK secret-token'),
      name: 'bad.docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    await expect(attempt).rejects.toBeInstanceOf(ConversionError);
    await expect(attempt).rejects.not.toThrow(/secret-token/);
  });
});

/** The fixture with its document.xml rewritten by the caller. */
const withBody = (edit: (xml: string) => string) => {
  const files = unzipSync(new Uint8Array(spec('docx/simple.docx')));
  files['word/document.xml'] = strToU8(edit(strFromU8(files['word/document.xml'] as Uint8Array)));
  return zipSync(files);
};

describe('docx converter on hostile files', () => {
  it('drops hidden text, which could carry instructions nobody sees', async () => {
    const data = withBody((xml) =>
      xml.replace(
        '</w:body>',
        '<w:p><w:r><w:rPr><w:vanish/></w:rPr><w:t>SECRET-INSTRUCTION</w:t></w:r><w:r><w:rPr><w:vanish w:val="0"/></w:rPr><w:t>shown</w:t></w:r></w:p></w:body>',
      ),
    );
    const { markdown } = await createAnymark().convert({ data, name: 'h.docx' });

    expect(markdown).not.toContain('SECRET-INSTRUCTION');
    expect(markdown).toContain('shown');
  });

  it('refuses a document that inflates past the size limit', async () => {
    const data = withBody((xml) =>
      xml.replace(
        '</w:body>',
        `<w:p><w:r><w:t>${'x'.repeat(120 * 1024 * 1024)}</w:t></w:r></w:p></w:body>`,
      ),
    );

    expect(data.length).toBeLessThan(1024 * 1024);
    await expect(createAnymark().convert({ data, name: 'bomb.docx' })).rejects.toBeInstanceOf(
      ConversionError,
    );
  });
});

describe('docx merged cells and nested tables', () => {
  const run = (name: string) =>
    createAnymark().convert({ data: new Uint8Array(spec(`docx/${name}`)), name });

  it('expands merged cells into a plain Markdown table and counts them', async () => {
    const result = await run('merged.docx');

    expect(result.markdown).toBe(
      [
        '| A | B | C |',
        '| --- | --- | --- |',
        '| wide |  | c2 |',
        '| tall | x | y |',
        '|  | p | q |',
        '',
      ].join('\n'),
    );
    expect(result.warnings).toEqual([
      { code: 'DOCX_MERGED_CELLS', message: '2 merged cells expanded' },
    ]);
  });

  it('flattens a nested table into the text of its parent cell and counts it', async () => {
    const result = await run('nested.docx');

    expect(result.markdown).toBe(
      ['| H1 | H2 |', '| --- | --- |', '| outer | i1, i2; i3, i4 |', ''].join('\n'),
    );
    expect(result.warnings).toEqual([
      { code: 'DOCX_NESTED_TABLE', message: '1 nested table flattened into the cell text' },
    ]);
  });

  it('leaves no raw table markup behind', async () => {
    for (const name of ['merged.docx', 'nested.docx']) {
      expect((await run(name)).markdown).not.toMatch(/<\/?(table|tr|td|th)\b|colspan|rowspan/);
    }
  });

  it('stays silent on a plain table', async () => {
    expect((await createAnymark().convert(docx())).warnings).toEqual([]);
  });

  it('does not expand a colspan far past any real table', async () => {
    const data = withBody((xml) =>
      xml.replace('<w:tc>', '<w:tc><w:tcPr><w:gridSpan w:val="1000000000"/></w:tcPr>'),
    );

    const { markdown } = await createAnymark().convert({ data, name: 'span.docx' });

    expect(markdown.length).toBeLessThan(100_000);
  });

  const table = (rows: string) => `<w:tbl>${rows}</w:tbl>`;
  const tc = (text: string, props = '') =>
    `<w:tc><w:tcPr>${props}</w:tcPr><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:tc>`;
  const tr = (cells: string) => `<w:tr>${cells}</w:tr>`;
  const withTable = (xml: string) => withBody((doc) => doc.replace(/<w:tbl>.*<\/w:tbl>/s, xml));

  it('refuses a table whose expanded size would be absurd instead of exhausting memory', async () => {
    const wide = tc('x', '<w:gridSpan w:val="1000"/>');
    const data = withTable(table(tr(wide) + tr(tc('y')).repeat(2000)));

    await expect(createAnymark().convert({ data, name: 'wide.docx' })).rejects.toBeInstanceOf(
      ConversionError,
    );
  });

  it('keeps words apart around a nested table', async () => {
    const inner = table(tr(tc('i1') + tc('i2')));
    const data = withTable(
      table(
        tr(tc('H')) +
          tr(
            `<w:tc><w:p><w:r><w:t>before</w:t></w:r></w:p>${inner}<w:p><w:r><w:t>after</w:t></w:r></w:p></w:tc>`,
          ),
      ),
    );

    const { markdown } = await createAnymark().convert({ data, name: 'around.docx' });

    expect(markdown).toContain('before');
    expect(markdown).not.toMatch(/beforei1|i2after/);
  });

  it('does not count a merged cell inside a nested table as expanded', async () => {
    const inner = table(tr(tc('m', '<w:gridSpan w:val="2"/>')));
    const data = withTable(table(tr(tc('H')) + tr(`<w:tc>${inner}<w:p/></w:tc>`)));

    const { warnings } = await createAnymark().convert({ data, name: 'inner.docx' });

    expect(warnings.map((w) => w.code)).toEqual(['DOCX_NESTED_TABLE']);
  });

  it('carries a rowspan that is also a colspan down every column it covers', async () => {
    const data = withTable(
      table(
        tr(tc('A') + tc('B') + tc('C')) +
          tr(tc('big', '<w:gridSpan w:val="2"/><w:vMerge w:val="restart"/>') + tc('c1')) +
          tr(tc('', '<w:gridSpan w:val="2"/><w:vMerge/>') + tc('c2')),
      ),
    );

    const { markdown } = await createAnymark().convert({ data, name: 'both.docx' });

    expect(markdown).toContain(
      ['| A | B | C |', '| --- | --- | --- |', '| big |  | c1 |', '|  |  | c2 |', ''].join('\n'),
    );
  });

  it('keeps a cell with two paragraphs on one Markdown row', async () => {
    const two =
      '<w:tc><w:p><w:r><w:t>um</w:t></w:r></w:p><w:p><w:r><w:t>dois</w:t></w:r></w:p></w:tc>';
    const data = withTable(table(tr(tc('H')) + tr(two)));

    const { markdown } = await createAnymark().convert({ data, name: 'paras.docx' });

    expect(markdown).toContain(['| H |', '| --- |', '| um<br>dois |'].join('\n'));
  });
});
