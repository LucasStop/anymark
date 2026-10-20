import { access } from 'node:fs/promises';
import { join } from 'node:path';
import type { Backend, BackendContext } from '../core/types.js';

export interface TesseractOptions {
  /** Directories holding `<lang>.traineddata.gz`, searched in order. Without it nothing is read locally. */
  readonly langPath?: string | readonly string[];
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

// ponytail: no timeout of its own; callers pass a signal. Add one if hostile images matter.
const MAX_BYTES = 25 * 1024 * 1024;

class OcrError extends Error {
  constructor() {
    super('Tesseract OCR failed');
    this.name = 'OcrError';
  }
}

/** Adapter: tesseract.js (WASM, local) behind the OCR backend contract. */
export class TesseractBackend implements Backend<Uint8Array, string> {
  readonly name = 'tesseract';
  readonly capability = 'ocr' as const;
  readonly locality = 'local' as const;

  constructor(private readonly options: TesseractOptions = {}) {}

  async isAvailable(): Promise<boolean> {
    return this.#hasLanguage('eng');
  }

  /** The folder that holds `lang`, or `undefined` when the data is not local. */
  async #folderOf(lang: string): Promise<string | undefined> {
    const { langPath } = this.options;
    for (const folder of langPath === undefined ? [] : [langPath].flat()) {
      try {
        await access(join(folder, `${lang}.traineddata.gz`));
        return folder;
      } catch {
        // not in this one; try the next
      }
    }
    return undefined;
  }

  /** The data for `lang` is local, or the caller allowed a download. */
  async #hasLanguage(lang: string): Promise<boolean> {
    return this.options.allowDownload === true || (await this.#folderOf(lang)) !== undefined;
  }

  async run(input: Uint8Array, ctx: BackendContext): Promise<string> {
    ctx.signal?.throwIfAborted();
    const lang = languageOf(ctx.lang);
    // run() is a door of its own: isAvailable() guards the chain, not a direct caller.
    if (input.length > MAX_BYTES || !(await this.#hasLanguage(lang))) throw new OcrError();
    const { createWorker } = await import('tesseract.js');
    const { cachePath, allowDownload } = this.options;
    const langPath = await this.#folderOf(lang);
    let worker: Awaited<ReturnType<typeof createWorker>>;
    try {
      worker = await createWorker(lang, 1, {
        // langPath wins over the CDN: with it set, nothing is downloaded.
        ...(langPath === undefined ? {} : { langPath }),
        ...(allowDownload === true && cachePath !== undefined
          ? { cachePath }
          : { cacheMethod: 'none' }),
        logger: () => {},
      });
    } catch {
      throw new OcrError();
    }
    const stop = () => void worker.terminate();
    ctx.signal?.addEventListener('abort', stop, { once: true });
    try {
      // Aborted while the worker was starting: the listener was not there yet.
      ctx.signal?.throwIfAborted();
      const { data } = await worker.recognize(Buffer.from(input));
      ctx.signal?.throwIfAborted();
      return data.text;
    } catch (error) {
      if (ctx.signal?.aborted === true) throw error;
      // tesseract.js messages can carry local paths; the chain drops them, a direct caller must not see them.
      throw new OcrError();
    } finally {
      ctx.signal?.removeEventListener('abort', stop);
      await worker.terminate();
    }
  }
}
