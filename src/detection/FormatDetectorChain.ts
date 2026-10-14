/** What a handler may look at. Same shape as a `Source`. */
export interface DetectionInput {
  readonly data: Uint8Array;
  readonly name?: string;
  readonly mime?: string;
}

/**
 * One link of the chain. Answer with a mime, or call `next()` to pass the input on.
 * The handler decides; the chain never inspects the input itself.
 */
export interface FormatHandler {
  handle(input: DetectionInput, next: () => string | undefined): string | undefined;
}

/** Chain of Responsibility: the first handler that answers ends the walk (ADR 0003). */
export class FormatDetectorChain {
  readonly #handlers: readonly FormatHandler[];

  constructor(handlers: readonly FormatHandler[]) {
    this.#handlers = handlers;
  }

  detect(input: DetectionInput): string | undefined {
    const from = (index: number): string | undefined => {
      const handler = this.#handlers[index];
      return handler?.handle(input, () => from(index + 1));
    };
    return from(0);
  }
}
