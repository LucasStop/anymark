import { NoBackendError } from '../core/errors.js';
import type {
  Backend,
  BackendContext,
  BackendRunner,
  Capability,
  ConversionWarning,
  ConvertOptions,
} from '../core/types.js';
import { isOptedIn } from '../security/optIn.js';

/** An unreachable backend is a fallback case, not a failure. */
const isAvailable = (backend: Backend): Promise<boolean> =>
  backend.isAvailable().catch(() => false);

/**
 * One link of the chain. It decides alone: serve the request, or pass it on.
 * Opt-in is checked before the backend is even asked whether it is available.
 */
class BackendHandler {
  constructor(
    private readonly backend: Backend,
    private readonly options: ConvertOptions,
    private readonly warnings: ConversionWarning[],
  ) {}

  async handle<Out>(
    capability: Capability,
    input: unknown,
    next: () => Promise<Out>,
  ): Promise<Out> {
    const { backend, options } = this;
    if (backend.capability !== capability || !isOptedIn(backend.locality, options)) return next();
    if (!(await isAvailable(backend))) return next();

    const ctx: BackendContext = {
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      ...(options.lang === undefined ? {} : { lang: options.lang }),
    };
    try {
      return (await backend.run(input, ctx)) as Out;
    } catch {
      // An abort is the caller's decision, not this backend's failure: do not fall through.
      options.signal?.throwIfAborted();
      // The cause is dropped on purpose: it can carry keys, paths or document text.
      this.warnings.push({ code: 'BACKEND_FAILED', message: `Backend ${backend.name} failed` });
      return next();
    }
  }
}

/** Chain of Responsibility over the configured backends, in order. One chain per `convert()` call. */
export class BackendChain implements BackendRunner {
  readonly #handlers: readonly BackendHandler[];
  readonly #warnings: ConversionWarning[] = [];
  readonly #options: ConvertOptions;

  constructor(backends: readonly Backend[], options: ConvertOptions) {
    this.#options = options;
    this.#handlers = backends.map(
      (backend) => new BackendHandler(backend, options, this.#warnings),
    );
  }

  /** Failures that were absorbed by falling through to the next backend. */
  get warnings(): readonly ConversionWarning[] {
    return this.#warnings;
  }

  async run<In, Out>(capability: Capability, input: In): Promise<Out> {
    this.#options.signal?.throwIfAborted();
    const from = (index: number): Promise<Out> => {
      const handler = this.#handlers[index];
      if (handler === undefined) return Promise.reject(new NoBackendError(capability));
      return handler.handle(capability, input, () => from(index + 1));
    };
    return from(0);
  }
}
