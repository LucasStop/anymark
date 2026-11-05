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
  ConversionWarning,
  ConvertOptions,
  Converter,
  Input,
  Plugin,
  ProgressEvent,
  ResultSink,
  Source,
} from './core/types.js';
import { decodeText } from './converters/decodeText.js';
import { createDefaultDetector } from './detection/index.js';
import type { FormatDetectorChain } from './detection/FormatDetectorChain.js';
import { fetchUrl, type UrlOptions } from './security/urlFetch.js';
import { extractArticle } from './url/article.js';

const SINK_FAILED: ConversionWarning = {
  code: 'SINK_FAILED',
  message: 'A result sink threw and was skipped.',
};

const toSource = (input: Input): Source => (input instanceof Uint8Array ? { data: input } : input);

/** Last segment of a POSIX or Windows path, or undefined when nothing is left. */
const baseName = (name: string | undefined): string | undefined =>
  name?.split(/[\\/]/).pop() || undefined;

/** Facade: detects the format, resolves the converter and runs it. */
export class Anymark {
  readonly registry: ConverterRegistry;
  readonly #detector: FormatDetectorChain;
  readonly #backends: readonly Backend[];
  readonly #decorators: ((converter: Converter) => Converter)[] = [];
  readonly #sinks: ResultSink[] = [];

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

  /** Wraps every converter this instance resolves. The first decorator added ends up outermost. */
  decorate(wrap: (converter: Converter) => Converter): this {
    this.#decorators.push(wrap);
    return this;
  }

  /** Tells `sink` about every conversion on this instance. Returns the instance so calls can chain. */
  addSink(sink: ResultSink): this {
    this.#sinks.push(sink);
    return this;
  }

  /**
   * Fetches a public web page and converts it. HTML is reduced to its article first; any other
   * content type goes to its own converter. Needs `allowNetwork`; private hosts need `allowPrivateHosts`.
   */
  async convertUrl(url: string, options: UrlOptions = {}): Promise<ConversionResult> {
    const page = await fetchUrl(url, options);
    if (page.mime !== 'text/html' && page.mime !== 'application/xhtml+xml') {
      return this.convert(
        page.mime === undefined ? page.data : { data: page.data, mime: page.mime },
        options,
      );
    }
    const article = await extractArticle(decodeText(page.data));
    const result = await this.convert(
      {
        data: article === undefined ? page.data : new TextEncoder().encode(article),
        mime: 'text/html',
      },
      options,
    );
    return article !== undefined
      ? result
      : {
          ...result,
          warnings: [
            ...result.warnings,
            {
              code: 'URL_NOT_ARTICLE',
              message: 'No article was found; the whole page was converted.',
            },
          ],
        };
  }

  async convert(input: Input, options: ConvertOptions = {}): Promise<ConversionResult> {
    options.signal?.throwIfAborted();
    const { data, ...hints } = toSource(input);
    // A directory in the name would leak a local path into every output.
    const name = baseName(hints.name);
    const mime = this.#detector.detect({ data, ...hints, ...(name === undefined ? {} : { name }) });
    const resolved = mime === undefined ? undefined : await this.registry.resolve(mime);
    if (mime === undefined || resolved === undefined) throw new UnsupportedFormatError();
    const converter = this.#decorators.reduceRight((inner, wrap) => wrap(inner), resolved);

    const sourceId = createHash('sha256').update(data).digest('hex');
    const source: Source = name === undefined ? { data, mime } : { data, mime, name };
    options.signal?.throwIfAborted();
    // One chain per call: it carries this call's opt-in flags, signal and absorbed failures.
    const backends = new BackendChain(options.backends ?? this.#backends, options);
    let sinkFailed = false;
    const sinks: readonly ResultSink[] =
      options.onProgress === undefined
        ? this.#sinks
        : [...this.#sinks, { onProgress: options.onProgress }];
    // A sink never stops a conversion or another sink; the failure only shows up as one generic warning.
    const notify = async (call: (sink: ResultSink) => void | Promise<void> | undefined) => {
      for (const sink of sinks) {
        try {
          await call(sink);
        } catch {
          sinkFailed = true;
        }
      }
    };
    const progress = (event: ProgressEvent) => notify((sink) => sink.onProgress?.(event));
    await progress({ stage: 'convert', current: 0, total: 1 });
    const result = await converter.convert(source, { sourceId, options, backends, progress });
    await progress({ stage: 'convert', current: 1, total: 1 });
    // The facade owns identity: a plugin cannot spoof the hash or smuggle a path in the name.
    const { name: _ignored, ...metadata } = result.metadata;
    const final: ConversionResult = {
      ...result,
      warnings: [...result.warnings, ...backends.warnings],
      metadata: name === undefined ? { ...metadata, sourceId } : { ...metadata, sourceId, name },
    };
    await notify((sink) => sink.onResult?.(final));
    return sinkFailed ? { ...final, warnings: [...final.warnings, SINK_FAILED] } : final;
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
