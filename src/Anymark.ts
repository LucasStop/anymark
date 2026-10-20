import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { BackendChain } from './backends/BackendChain.js';
import { TesseractBackend } from './backends/TesseractBackend.js';
import { builtInEntries } from './converters/index.js';
import { ConverterRegistry } from './core/ConverterRegistry.js';
import { UnsupportedFormatError } from './core/errors.js';
import type {
  Backend,
  ConversionResult,
  ConvertOptions,
  Input,
  Plugin,
  Source,
} from './core/types.js';
import { createDefaultDetector } from './detection/index.js';
import type { FormatDetectorChain } from './detection/FormatDetectorChain.js';

const toSource = (input: Input): Source => (input instanceof Uint8Array ? { data: input } : input);

/** Last segment of a POSIX or Windows path, or undefined when nothing is left. */
const baseName = (name: string | undefined): string | undefined =>
  name?.split(/[\\/]/).pop() || undefined;

/** Facade: detects the format, resolves the converter and runs it. */
export class Anymark {
  readonly registry: ConverterRegistry;
  readonly #detector: FormatDetectorChain;
  readonly #backends: readonly Backend[];

  constructor(
    registry: ConverterRegistry = new ConverterRegistry(),
    detector: FormatDetectorChain = createDefaultDetector(registry),
    backends: readonly Backend[] = [],
  ) {
    this.registry = registry;
    this.#detector = detector;
    this.#backends = backends;
  }

  /** Installs a plugin on this instance only. Returns the instance so installs can chain. */
  use(plugin: Plugin): this {
    plugin.install({ register: (entry) => this.registry.register(entry) });
    return this;
  }

  async convert(input: Input, options: ConvertOptions = {}): Promise<ConversionResult> {
    options.signal?.throwIfAborted();
    const { data, ...hints } = toSource(input);
    // A directory in the name would leak a local path into every output.
    const name = baseName(hints.name);
    const mime = this.#detector.detect({ data, ...hints, ...(name === undefined ? {} : { name }) });
    const converter = mime === undefined ? undefined : await this.registry.resolve(mime);
    if (mime === undefined || converter === undefined) throw new UnsupportedFormatError();

    const sourceId = createHash('sha256').update(data).digest('hex');
    const source: Source = name === undefined ? { data, mime } : { data, mime, name };
    options.signal?.throwIfAborted();
    // One chain per call: it carries this call's opt-in flags, signal and absorbed failures.
    const backends = new BackendChain(options.backends ?? this.#backends, options);
    const result = await converter.convert(source, { sourceId, options, backends });
    // The facade owns identity: a plugin cannot spoof the hash or smuggle a path in the name.
    const { name: _ignored, ...metadata } = result.metadata;
    return {
      ...result,
      warnings: [...result.warnings, ...backends.warnings],
      metadata: name === undefined ? { ...metadata, sourceId } : { ...metadata, sourceId, name },
    };
  }
}

/** Language data shipped with the package (English and Portuguese), so the default OCR never needs the network. */
const bundledLangPath = (): string[] =>
  ['eng', 'por'].map((lang) =>
    join(
      dirname(createRequire(import.meta.url).resolve(`@tesseract.js-data/${lang}/package.json`)),
      '4.0.0_best_int',
    ),
  );

/**
 * Each call builds its own registry: no shared state between instances.
 * Images go through local tesseract by default; `options.backends` replaces it per call.
 */
export function createAnymark(): Anymark {
  const anymark = new Anymark(undefined, undefined, [
    new TesseractBackend({ langPath: bundledLangPath() }),
  ]);
  for (const entry of builtInEntries) anymark.registry.register(entry);
  return anymark;
}
