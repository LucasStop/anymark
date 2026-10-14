import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import { builtInEntries } from './converters/index.js';
import { ConverterRegistry } from './core/ConverterRegistry.js';
import { UnsupportedFormatError } from './core/errors.js';
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

/** Last segment of a POSIX or Windows path, or undefined when nothing is left. */
const baseName = (name: string | undefined): string | undefined =>
  name?.split(/[\\/]/).pop() || undefined;

/** Facade: detects the format, resolves the converter and runs it. */
export class Anymark {
  readonly registry: ConverterRegistry;

  constructor(registry: ConverterRegistry = new ConverterRegistry()) {
    this.registry = registry;
  }

  async convert(input: Input, options: ConvertOptions = {}): Promise<ConversionResult> {
    options.signal?.throwIfAborted();
    const { data, ...hints } = toSource(input);
    // A directory in the name would leak a local path into every output.
    const name = baseName(hints.name);
    // Tracer: mime hint, then extension. FormatDetectorChain replaces this.
    const mime =
      hints.mime ??
      (name === undefined ? undefined : this.registry.mimeForExtension(extname(name)));
    const converter = mime === undefined ? undefined : await this.registry.resolve(mime);
    if (mime === undefined || converter === undefined) throw new UnsupportedFormatError();

    const sourceId = createHash('sha256').update(data).digest('hex');
    const source: Source = name === undefined ? { data, mime } : { data, mime, name };
    options.signal?.throwIfAborted();
    const result = await converter.convert(source, { sourceId, options, backends: noBackends });
    // The facade owns identity: a plugin cannot spoof the hash or smuggle a path in the name.
    const { name: _ignored, ...metadata } = result.metadata;
    return {
      ...result,
      metadata: name === undefined ? { ...metadata, sourceId } : { ...metadata, sourceId, name },
    };
  }
}

/** Each call builds its own registry: no shared state between instances. */
export function createAnymark(): Anymark {
  const anymark = new Anymark();
  for (const entry of builtInEntries) anymark.registry.register(entry);
  return anymark;
}
