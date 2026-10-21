import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { PdfConverter } from '../src/converters/PdfConverter.js';
import { ConversionError, createAnymark, TesseractBackend } from '../src/index.js';
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

  it('reads a 1-bit scan stored sideways and turned upright by /Rotate', async () => {
    const data = new Uint8Array(spec('pdf/scanned-1bit.pdf'));

    const result = await createAnymark().convert({ data, name: 'scanned-1bit.pdf' });

    expect(result.markdown).toBe('## Page 1\n\nHELLO HOLE\n');
    expect(result.warnings).toEqual([]);
  }, 60_000);

  it('reads a 1-bit image shared by several pages instead of hanging', async () => {
    const data = new Uint8Array(spec('pdf/scanned-1bit-shared.pdf'));

    const result = await createAnymark().convert({ data, name: 'shared.pdf' });

    expect(result.markdown).toBe(
      '## Page 1\n\nHELLO HOLE\n\n## Page 2\n\nHELLO HOLE\n\n## Page 3\n\nHELLO HOLE\n',
    );
  }, 60_000);

  it('finds the upright side of a scan whatever its /Rotate says', async () => {
    const data = new Uint8Array(spec('pdf/scanned-orientations.pdf'));

    const { markdown } = await createAnymark().convert({ data, name: 'orientations.pdf' });

    // Page 1 turned by /Rotate 270, page 2 sideways with /Rotate 0, page 3 upside down.
    const pages = markdown.split(/^## Page \d+\n/m).slice(1);
    expect(pages).toHaveLength(3);
    for (const page of pages) expect(page.match(/HELLO HOLE/g)).toHaveLength(4);
  }, 120_000);

  describe('declared scan layout', () => {
    const sheets = () => new Uint8Array(spec('pdf/scanned-spread.pdf'));
    const pagesOf = (markdown: string) => markdown.split(/^## Page \d+\n/m).slice(1);

    it('reads the left printed page before the right one, whatever the sheet rotation', async () => {
      const { markdown } = await createAnymark().convert(
        { data: sheets(), name: 'spread.pdf' },
        { pdf: { layout: 'spread' } },
      );

      const pages = pagesOf(markdown);
      expect(pages).toHaveLength(4);
      for (const page of pages) {
        expect(page.match(/HELLO/g)).toHaveLength(18);
        expect(page.match(/HOLE/g)).toHaveLength(18);
        expect(page.lastIndexOf('HELLO')).toBeLessThan(page.indexOf('HOLE'));
      }
    }, 240_000);

    it('reads the right printed page first when the binding is on the right', async () => {
      const { markdown } = await createAnymark().convert(
        { data: sheets(), name: 'spread.pdf' },
        { pdf: { layout: 'spread', binding: 'right', rotation: 'auto' } },
      );

      for (const page of pagesOf(markdown))
        expect(page.lastIndexOf('HOLE')).toBeLessThan(page.indexOf('HELLO'));
    }, 240_000);

    it('turns by the declared rotation and asks the backend once per printed page', async () => {
      const run = vi.spyOn(TesseractBackend.prototype, 'run');
      const data = new Uint8Array(spec('pdf/scanned-spread-sideways.pdf'));

      const { markdown } = await createAnymark().convert(
        { data, name: 'sideways.pdf' },
        { pdf: { layout: 'spread', rotation: 270 } },
      );

      expect(run).toHaveBeenCalledTimes(4); // 2 sheets x 2 printed pages, no second look
      for (const page of pagesOf(markdown)) expect(page.match(/HELLO/g)).toHaveLength(18);
      run.mockRestore();
    }, 240_000);

    it('reads a sheet with a dark frame and a gutter shadow once trim is on', async () => {
      const data = new Uint8Array(spec('pdf/scanned-spread-framed.pdf'));

      const { markdown } = await createAnymark().convert(
        { data, name: 'framed.pdf' },
        { pdf: { layout: 'spread', rotation: 0, cleanup: { trim: true } } },
      );

      const pages = pagesOf(markdown);
      expect(pages.length).toBeGreaterThan(0);
      for (const page of pages.slice(0, 1)) {
        expect(page.match(/HELLO/g)).toHaveLength(18);
        expect(page.match(/HOLE/g)).toHaveLength(18);
        expect(page).not.toMatch(/^[|!:]/m);
      }
    }, 240_000);

    it.each([
      { layout: 'triple' },
      { rotation: 45 },
      { binding: 'top' },
      { cleanup: { trim: 'yes' } },
      { cleanup: { dehyphenate: 1 } },
      { cleanup: null },
      { cleanup: [] },
    ])('rejects the unknown option %j without echoing it', async (pdfOptions) => {
      const error = await createAnymark()
        .convert(pdf(), { pdf: pdfOptions as never })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConversionError);
      expect(String((error as Error).message)).not.toMatch(/triple|45|top|yes/);
    });
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
