import { readFileSync } from 'node:fs';
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
