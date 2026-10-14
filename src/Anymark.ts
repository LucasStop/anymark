import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import { builtInEntries } from './converters/index.js';
import { ConverterRegistry } from './core/ConverterRegistry.js';
import type {
  BackendRunner,
  ConversionResult,
  ConvertOptions,
  Input,
  Source,
} from './core/types.js';

// No backend chain yet: any capability request fails until one is wired in.
const noBackends: BackendRunner = {
  run: () => Promise.reject(new Error('No backend configured')),
};

const toSource = (input: Input): Source => (input instanceof Uint8Array ? { data: input } : input);

/** Facade: detects the format, resolves the converter and runs it. */
export class Anymark {
  readonly registry: ConverterRegistry;

  constructor(registry: ConverterRegistry = new ConverterRegistry()) {
    this.registry = registry;
  }

  async convert(input: Input, options: ConvertOptions = {}): Promise<ConversionResult> {
    const source = toSource(input);
    // Tracer: mime hint, then extension. FormatDetectorChain replaces this.
    const mime =
      source.mime ??
      (source.name === undefined
        ? undefined
        : this.registry.mimeForExtension(extname(source.name)));
    const converter = mime === undefined ? undefined : await this.registry.resolve(mime);
    if (mime === undefined || converter === undefined) throw new Error('Unsupported format');

    const sourceId = createHash('sha256').update(source.data).digest('hex');
    return converter.convert({ ...source, mime }, { sourceId, options, backends: noBackends });
  }
}

/** Each call builds its own registry: no shared state between instances. */
export function createAnymark(): Anymark {
  const anymark = new Anymark();
  for (const entry of builtInEntries) anymark.registry.register(entry);
  return anymark;
}
