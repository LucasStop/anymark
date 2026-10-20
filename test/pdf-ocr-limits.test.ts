import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Backend } from '../src/index.js';

// extractImages is replaced so the limits can be driven with images of any size and count.
const extractImages = vi.hoisted(() => vi.fn());
vi.mock('unpdf', async (original) => ({
  ...(await original<typeof import('unpdf')>()),
  extractImages,
}));

const { createAnymark } = await import('../src/index.js');

const scan = () => ({
  data: new Uint8Array(readFileSync(new URL('../specs/pdf/scanned.pdf', import.meta.url))),
  name: 'scanned.pdf',
});
const image = (bytes = 12) => ({
  data: new Uint8ClampedArray(bytes),
  width: bytes / 3,
  height: 1,
  channels: 3 as const,
  key: 'img',
});
const backend = (run: (n: number) => Promise<string>): Backend<Uint8Array, string> => {
  let calls = 0;
  return {
    name: 'fake-ocr',
    capability: 'ocr',
    locality: 'local',
    isAvailable: async () => true,
    run: () => run((calls += 1)),
  };
};

beforeEach(() => extractImages.mockReset());

describe('pdf OCR limits', () => {
  it('reads at most 4 images per page and counts the rest', async () => {
    extractImages.mockResolvedValue(Array.from({ length: 5 }, () => image()));
    let calls = 0;
    const fake = backend(async () => `t${(calls += 1)}`);

    const result = await createAnymark().convert(scan(), { backends: [fake as Backend] });

    expect(calls).toBe(8); // 4 per page, two pages
    expect(result.warnings).toEqual([
      { code: 'PDF_OCR_SKIPPED', message: '2 pages or images left out of OCR by the limits' },
    ]);
  });

  it('skips an image past 64 MB without calling the backend', async () => {
    extractImages.mockResolvedValue([image(64 * 1024 * 1024 + 3)]);
    let calls = 0;
    const fake = backend(async () => `t${(calls += 1)}`);

    const result = await createAnymark().convert(scan(), { backends: [fake as Backend] });

    expect(calls).toBe(0);
    expect(result.warnings.map((w) => w.code)).toEqual(['PDF_NO_TEXT', 'PDF_OCR_SKIPPED']);
  });

  it('keeps the text already read and says so when the OCR fails midway', async () => {
    extractImages.mockResolvedValue([image(), image()]);
    const fake = backend(async (n) => {
      if (n === 2) throw new Error('boom /secret/path');
      return `read ${n}`;
    });

    const result = await createAnymark().convert(scan(), { backends: [fake as Backend] });

    expect(result.markdown).toContain('read 1');
    expect(result.warnings.map((w) => w.code)).toContain('PDF_OCR_FAILED');
    expect(JSON.stringify(result.warnings)).not.toContain('/secret/path');
  });
});
