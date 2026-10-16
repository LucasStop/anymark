import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TesseractBackend } from '../src/backends/TesseractBackend.js';
import { createAnymark, NoBackendError } from '../src/index.js';
import type { Backend } from '../src/index.js';
import { assertBackendContract } from '../src/testing/index.js';

const png = () =>
  new Uint8Array(readFileSync(new URL('../specs/image/hello.png', import.meta.url)));
// Language data from a dev dependency: the tests never reach the network.
const langPath = join(
  new URL('..', import.meta.url).pathname,
  'node_modules/@tesseract.js-data/eng/4.0.0_best_int',
);
const SLOW = 60_000;

afterEach(() => vi.unstubAllGlobals());

const fakeOcr = (text: string): Backend<Uint8Array, string> => ({
  name: 'fake-ocr',
  capability: 'ocr',
  locality: 'local',
  isAvailable: async () => true,
  run: async () => text,
});

describe('TesseractBackend', () => {
  it(
    'passes the backend contract',
    async () => {
      await assertBackendContract(new TesseractBackend({ langPath }) as Backend, png());
    },
    SLOW,
  );

  it(
    'reads the text of a small image, offline',
    async () => {
      const text = await new TesseractBackend({ langPath }).run(png(), {});

      expect(text.trim()).toBe('HELLO HOLE');
    },
    SLOW,
  );

  it(
    'does not let a language hint reach outside the language directory',
    async () => {
      const text = await new TesseractBackend({ langPath }).run(png(), {
        lang: '../../etc/passwd',
      });

      expect(text.trim()).toBe('HELLO HOLE');
    },
    SLOW,
  );

  describe('direct run()', () => {
    it('refuses to download without the opt-in, even when called directly', async () => {
      await expect(new TesseractBackend().run(png(), {})).rejects.toThrow(/Tesseract OCR failed/);
    });

    it('fails fast when the requested language is not in langPath', async () => {
      await expect(new TesseractBackend({ langPath }).run(png(), { lang: 'por' })).rejects.toThrow(
        /Tesseract OCR failed/,
      );
    });

    it('does not leak a local path in its error', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'tess-'));
      const error = await new TesseractBackend({ langPath: dir })
        .run(png(), {})
        .catch((e: unknown) => e);

      expect((error as Error).message).not.toContain(dir);
    });

    it('rejects an input past the size limit before starting a worker', async () => {
      await expect(
        new TesseractBackend({ langPath }).run(new Uint8Array(26 * 1024 * 1024), {}),
      ).rejects.toThrow(/Tesseract OCR failed/);
    });

    it(
      'stops when the signal aborts while the worker is starting',
      async () => {
        const controller = new AbortController();
        const run = new TesseractBackend({ langPath }).run(png(), { signal: controller.signal });
        setTimeout(() => controller.abort(), 20);

        await expect(run).rejects.toThrow();
      },
      SLOW,
    );
  });

  describe('language data', () => {
    it('is unavailable, and silent on the network, without a local copy or an opt-in', async () => {
      const fetched = vi.fn();
      vi.stubGlobal('fetch', fetched);

      expect(await new TesseractBackend().isAvailable()).toBe(false);
      expect(
        await new TesseractBackend({
          langPath: mkdtempSync(join(tmpdir(), 'tess-')),
        }).isAvailable(),
      ).toBe(false);
      expect(fetched).not.toHaveBeenCalled();
    });

    it('may download only when the caller asked for it', async () => {
      expect(await new TesseractBackend({ allowDownload: true }).isAvailable()).toBe(true);
    });
  });
});

describe('images through the facade', () => {
  const image = () => ({ data: png(), name: 'hello.png' });

  it(
    'converts an image to Markdown through the backend chain',
    async () => {
      const result = await createAnymark().convert(image(), {
        backends: [new TesseractBackend({ langPath }) as Backend],
      });

      expect(result.markdown).toBe('HELLO HOLE\n');
      expect(result.metadata.mime).toBe('image/png');
    },
    SLOW,
  );

  it(
    'reads an image with no backends configured, offline',
    async () => {
      const fetched = vi.fn();
      vi.stubGlobal('fetch', fetched);

      const result = await createAnymark().convert(image());

      expect(result.markdown).toBe('HELLO HOLE\n');
      expect(fetched).not.toHaveBeenCalled();
    },
    SLOW,
  );

  it('lets explicit backends replace the default OCR', async () => {
    const result = await createAnymark().convert(image(), {
      backends: [fakeOcr('from the fake') as Backend],
    });

    expect(result.markdown).toBe('from the fake\n');
  });

  it('fails with NoBackendError when the explicit backend list is empty', async () => {
    await expect(createAnymark().convert(image(), { backends: [] })).rejects.toBeInstanceOf(
      NoBackendError,
    );
  });

  it('proves the seam: the chain falls to a second backend when the first is unavailable', async () => {
    const result = await createAnymark().convert(image(), {
      backends: [new TesseractBackend() as Backend, fakeOcr('from the fake') as Backend],
    });

    expect(result.markdown).toBe('from the fake\n');
  });

  it('proves the seam: the first available backend wins and the real one is not run', async () => {
    const result = await createAnymark().convert(image(), {
      backends: [
        fakeOcr('from the fake') as Backend,
        new TesseractBackend({ langPath }) as Backend,
      ],
    });

    expect(result.markdown).toBe('from the fake\n');
  });
});
