import { readFileSync } from 'node:fs';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { XlsxConverter } from '../src/converters/XlsxConverter.js';
import { ConversionError, createAnymark } from '../src/index.js';
import { assertConverterContract } from '../src/testing/index.js';

const spec = (path: string) => readFileSync(new URL(`../specs/${path}`, import.meta.url));
const xlsx = () => ({ data: new Uint8Array(spec('xlsx/simple.xlsx')), name: 'simple.xlsx' });

describe('xlsx converter', () => {
  it('writes one section per sheet, each a table', async () => {
    const result = await createAnymark().convert(xlsx());

    expect(result.markdown).toBe(spec('xlsx/simple.md').toString('utf8'));
    expect(result.metadata.mime).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  });

  it('passes the converter contract', async () => {
    await assertConverterContract(new XlsxConverter(), xlsx());
  });

  it('rejects a corrupted file without echoing its content', async () => {
    const attempt = new XlsxConverter().convert(
      { data: new TextEncoder().encode('secret-token'), name: 'bad.xlsx' },
      { sourceId: 'x', options: {}, backends: { run: () => Promise.reject(new Error('n/a')) } },
    );

    await expect(attempt).rejects.toBeInstanceOf(ConversionError);
    await expect(attempt).rejects.not.toThrow(/secret-token/);
  });
});

/** Smallest workbook that reads: one sheet whose rows come from the caller. */
const workbook = (sheetData: string, sheetName = 'S') => {
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const files: Record<string, string> = {
    '[Content_Types].xml': `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0"?><workbook xmlns="${ns}" xmlns:r="${rel}"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    'xl/worksheets/sheet1.xml': `<?xml version="1.0"?><worksheet xmlns="${ns}"><sheetData>${sheetData}</sheetData></worksheet>`,
  };
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
};
const cell = (ref: string, text: string) =>
  `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`;

describe('xlsx converter on hostile files', () => {
  it('refuses a tiny file that declares a row a million rows down', async () => {
    const data = workbook(
      `<row r="1">${cell('A1', 'a')}</row><row r="1048576">${cell('A1048576', 'z')}</row>`,
    );

    await expect(createAnymark().convert({ data, name: 'sparse.xlsx' })).rejects.toBeInstanceOf(
      ConversionError,
    );
  });

  it('refuses a workbook that inflates past the size limit', async () => {
    const data = workbook(`<row r="1">${cell('A1', 'x'.repeat(120 * 1024 * 1024))}</row>`);

    expect(data.length).toBeLessThan(1024 * 1024);
    await expect(createAnymark().convert({ data, name: 'bomb.xlsx' })).rejects.toBeInstanceOf(
      ConversionError,
    );
  });

  it('keeps Markdown in a sheet name from becoming live Markdown', async () => {
    const data = workbook(`<row r="1">${cell('A1', 'a')}</row>`, '# x *y* [l](http://e)');
    const { markdown } = await createAnymark().convert({ data, name: 'name.xlsx' });

    expect(markdown.split('\n')[0]).toBe('## \\# x \\*y\\* \\[l\\](http://e)');
  });
});

/** A workbook with one single-cell sheet per entry; `state` is the sheet's visibility attribute. */
const sheetsWorkbook = (sheets: { name: string; state?: string }[]) => {
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const files: Record<string, string> = {
    '[Content_Types].xml': `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0"?><workbook xmlns="${ns}" xmlns:r="${rel}"><sheets>${sheets
      .map(
        (s, i) =>
          `<sheet name="${s.name}" sheetId="${i + 1}"${s.state === undefined ? '' : ` state="${s.state}"`} r:id="rId${i + 1}"/>`,
      )
      .join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="${rel}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join('')}</Relationships>`,
  };
  sheets.forEach((s, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] =
      `<?xml version="1.0"?><worksheet xmlns="${ns}"><sheetData><row r="1">${cell('A1', `in ${s.name}`)}</row></sheetData></worksheet>`;
  });
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
};

describe('xlsx hidden sheets', () => {
  const data = sheetsWorkbook([
    { name: 'Open' },
    { name: 'Draft', state: 'hidden' },
    { name: 'Secret', state: 'veryHidden' },
    { name: 'Closing', state: 'visible' },
  ]);

  it('skips hidden and veryHidden sheets by default and says how many', async () => {
    const result = await createAnymark().convert({ data, name: 'book.xlsx' });

    expect(result.markdown).toContain('## Open');
    expect(result.markdown).toContain('## Closing');
    expect(result.markdown).not.toMatch(/Draft|Secret/);
    expect(result.warnings).toEqual([
      { code: 'HIDDEN_SHEETS_SKIPPED', message: '2 hidden sheets skipped' },
    ]);
  });

  it('includes them, in workbook order and without a warning, when asked', async () => {
    const result = await createAnymark().convert(
      { data, name: 'book.xlsx' },
      { includeHiddenSheets: true },
    );

    const headings = result.markdown.split('\n').filter((line) => line.startsWith('## '));
    expect(headings).toEqual(['## Open', '## Draft', '## Secret', '## Closing']);
    expect(result.warnings).toEqual([]);
  });

  it('stays silent when no sheet is hidden', async () => {
    const result = await createAnymark().convert(xlsx());

    expect(result.warnings).toEqual([]);
  });

  it('matches hidden sheets by position, not by a name the two parsers may decode differently', async () => {
    const odd = sheetsWorkbook([{ name: 'Open' }, { name: 'caf&#xE9; &#x41;', state: 'hidden' }]);
    const result = await createAnymark().convert({ data: odd, name: 'odd.xlsx' });

    expect(result.markdown).not.toMatch(/caf/);
    expect(result.warnings).toEqual([
      { code: 'HIDDEN_SHEETS_SKIPPED', message: '1 hidden sheet skipped' },
    ]);
  });

  it('refuses a workbook part far larger than any real sheet list', async () => {
    const huge = sheetsWorkbook([{ name: 'a'.repeat(6 * 1024 * 1024) }]);

    await expect(createAnymark().convert({ data: huge, name: 'huge.xlsx' })).rejects.toBeInstanceOf(
      ConversionError,
    );
  });
});
