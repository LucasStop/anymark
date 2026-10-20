import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { PdfConverter } from '../src/converters/PdfConverter.js';
import { ConversionError, createAnymark } from '../src/index.js';
import type { Backend } from '../src/index.js';
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

  it('does not warn when only some pages are scans', async () => {
    const data = new Uint8Array(spec('pdf/mixed.pdf'));
    const result = await createAnymark().convert({ data, name: 'mixed.pdf' });

    expect(result.markdown).toContain('Body text');
    expect(result.warnings).toEqual([]);
  });

  it('runs OCR on the embedded image of each scanned page, one section per page', async () => {
    const data = new Uint8Array(spec('pdf/scanned.pdf'));

    const result = await createAnymark().convert({ data, name: 'scanned.pdf' });

    expect(result.markdown).toBe('## Page 1\n\nHELLO HOLE\n\n## Page 2\n\nHELLO HOLE\n');
    expect(result.warnings).toEqual([]);
  }, 60_000);

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

describe('pdf OCR of scanned pages', () => {
  const scanned = (name: string) => ({ data: new Uint8Array(spec(`pdf/${name}`)), name });
  const fakeOcr = (text = 'ocr text', inputs: Uint8Array[] = []): Backend<Uint8Array, string> => ({
    name: 'fake-ocr',
    capability: 'ocr',
    locality: 'local',
    isAvailable: async () => true,
    run: async (input) => {
      inputs.push(input);
      return text;
    },
  });

  it('hands the backend a valid PNG with the size of the embedded image', async () => {
    const inputs: Uint8Array[] = [];

    await createAnymark().convert(scanned('scanned.pdf'), {
      backends: [fakeOcr('x', inputs) as Backend],
    });

    const png = inputs[0]!;
    const view = new DataView(png.buffer, png.byteOffset);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([544, 120]);
    expect(inputs).toHaveLength(2);
  });

  it('never calls the backend for pages that have a text layer', async () => {
    const inputs: Uint8Array[] = [];

    const result = await createAnymark().convert(pdf(), {
      backends: [fakeOcr('x', inputs) as Backend],
    });

    expect(inputs).toHaveLength(0);
    expect(result.markdown).toBe(spec('pdf/simple.md').toString('utf8'));
  });

  it('keeps PDF_NO_TEXT, without failing, when there is no backend to read the image', async () => {
    const result = await createAnymark().convert(scanned('scanned.pdf'), { backends: [] });

    expect(result.warnings.map((w) => w.code)).toEqual(['PDF_NO_TEXT']);
    expect(result.markdown).toBe('## Page 1\n\n## Page 2\n');
  });

  it('keeps PDF_NO_TEXT when the page has no image to read', async () => {
    const inputs: Uint8Array[] = [];

    const result = await createAnymark().convert(scanned('no-text.pdf'), {
      backends: [fakeOcr('x', inputs) as Backend],
    });

    expect(inputs).toHaveLength(0);
    expect(result.warnings.map((w) => w.code)).toEqual(['PDF_NO_TEXT']);
  });

  it('stops at 100 scanned pages and says how many were left out, with a count only', async () => {
    const inputs: Uint8Array[] = [];

    const result = await createAnymark().convert(scanned('scanned-many.pdf'), {
      backends: [fakeOcr('x', inputs) as Backend],
    });

    expect(inputs).toHaveLength(100);
    expect(result.warnings).toEqual([
      { code: 'PDF_OCR_SKIPPED', message: '1 page or image left out of OCR by the limits' },
    ]);
  });

  it('stops when the signal aborts during OCR instead of returning a partial document', async () => {
    const controller = new AbortController();
    const aborting: Backend<Uint8Array, string> = {
      ...fakeOcr(),
      run: async () => {
        controller.abort();
        return 'late';
      },
    };

    await expect(
      createAnymark().convert(scanned('scanned.pdf'), {
        backends: [aborting as Backend],
        signal: controller.signal,
      }),
    ).rejects.toThrow();
  });
});
