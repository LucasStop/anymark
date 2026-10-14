import type { Converter, ConverterEntry } from './types.js';

/** One per instance, never global (ADR 0001). Converters load on first use (ADR 0006). */
export class ConverterRegistry {
  readonly #byMime = new Map<string, ConverterEntry>();
  readonly #mimeByExtension = new Map<string, string>();
  readonly #loaded = new Map<ConverterEntry, Promise<Converter>>();

  register(entry: ConverterEntry): void {
    for (const mime of entry.mimes) this.#byMime.set(mime, entry);
    const [firstMime] = entry.mimes;
    if (firstMime === undefined) return;
    for (const extension of entry.extensions ?? []) this.#mimeByExtension.set(extension, firstMime);
  }

  mimeForExtension(extension: string): string | undefined {
    return this.#mimeByExtension.get(extension.toLowerCase());
  }

  async resolve(mime: string): Promise<Converter | undefined> {
    const entry = this.#byMime.get(mime);
    if (entry === undefined) return undefined;
    let converter = this.#loaded.get(entry);
    if (converter === undefined) {
      converter = entry.load();
      this.#loaded.set(entry, converter);
    }
    return converter;
  }
}
