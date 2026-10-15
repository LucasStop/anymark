import { access } from 'node:fs/promises';
import { join } from 'node:path';
import type { Backend, BackendContext } from '../core/types.js';

export interface TesseractOptions {
  /** Directory holding `<lang>.traineddata.gz`. Without it nothing is read locally. */
  readonly langPath?: string;
  /** Where downloaded language data is cached. Only used together with `allowDownload`. */
  readonly cachePath?: string;
  /** Lets tesseract.js fetch language data from its CDN. Off unless the caller turns it on. */
  readonly allowDownload?: boolean;
}

const SHORT: Readonly<Record<string, string>> = {
  en: 'eng',
  pt: 'por',
  es: 'spa',
  fr: 'fra',
  de: 'deu',
};
// The hint becomes a file name under langPath: only plain codes get through.
const CODE = /^[a-z]{3}(?:_[a-z]{1,8})?$/;

function languageOf(hint: string | undefined): string {
  const lang = hint === undefined ? undefined : (SHORT[hint] ?? hint);
  return lang !== undefined && CODE.test(lang) ? lang : 'eng';
}

/** Adapter: tesseract.js (WASM, local) behind the OCR backend contract. */
export class TesseractBackend implements Backend<Uint8Array, string> {
  readonly name = 'tesseract';
  readonly capability = 'ocr' as const;
  readonly locality = 'local' as const;

  constructor(private readonly options: TesseractOptions = {}) {}

  async isAvailable(): Promise<boolean> {
    const { langPath, allowDownload } = this.options;
    if (langPath === undefined) return allowDownload === true;
    try {
      await access(join(langPath, 'eng.traineddata.gz'));
      return true;
    } catch {
      return allowDownload === true;
    }
  }

  async run(input: Uint8Array, ctx: BackendContext): Promise<string> {
    ctx.signal?.throwIfAborted();
    const { createWorker } = await import('tesseract.js');
    const { langPath, cachePath, allowDownload } = this.options;
    const worker = await createWorker(languageOf(ctx.lang), 1, {
      // langPath wins over the CDN: with it set, nothing is downloaded.
      ...(langPath === undefined ? {} : { langPath }),
      ...(allowDownload === true && cachePath !== undefined
        ? { cachePath }
        : { cacheMethod: 'none' }),
      logger: () => {},
    });
    const stop = () => void worker.terminate();
    ctx.signal?.addEventListener('abort', stop, { once: true });
    try {
      const { data } = await worker.recognize(Buffer.from(input));
      ctx.signal?.throwIfAborted();
      return data.text;
    } finally {
      ctx.signal?.removeEventListener('abort', stop);
      await worker.terminate();
    }
  }
}
