import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { PdfConverter } from '../src/converters/PdfConverter.js';
import { ConversionError, createAnymark } from '../src/index.js';
import { assertConverterContract } from '../src/testing/index.js';

const spec = (path: string) => readFileSync(new URL(`../specs/${path}`, import.meta.url));
const pdf = () => ({ data: new Uint8Array(spec('pdf/simple.pdf')), name: 'simple.pdf' });

describe('pdf converter', () => {
  it('writes one section per page, as plain text', async () => {
    const result = await createAnymark().convert(pdf());

    expect(result.markdown).toBe(spec('pdf/simple.md').toString('utf8'));
    expect(result.metadata.mime).toBe('application/pdf');
  });

  it('warns, without naming anything, when no page has a text layer', async () => {
    const data = new Uint8Array(spec('pdf/no-text.pdf'));
    const result = await createAnymark().convert({ data, name: 'scan.pdf' });

    expect(result.warnings).toEqual([
      { code: 'PDF_NO_TEXT', message: 'No page has a text layer; a scanned PDF needs OCR' },
    ]);
  });

  it('does not warn when at least one page has text', async () => {
    const result = await createAnymark().convert(pdf());

    expect(result.warnings).toEqual([]);
  });

  it('passes the converter contract', async () => {
    await assertConverterContract(new PdfConverter(), pdf());
  });

  it('rejects a corrupted file without echoing its content', async () => {
    const attempt = createAnymark().convert({
      data: new TextEncoder().encode('%PDF-1.4 secret-token not a real pdf'),
      name: 'bad.pdf',
    });

    await expect(attempt).rejects.toBeInstanceOf(ConversionError);
    await expect(attempt).rejects.not.toThrow(/secret-token/);
  });

  it('does not write to the console while parsing', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await createAnymark()
      .convert({ data: new TextEncoder().encode('%PDF-1.4 x'), name: 'bad.pdf' })
      .catch(() => {});

    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
