import { access, constants } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import type { Backend, BackendContext } from '../core/types.js';
import { runCli } from '../security/spawn.js';

export interface WhisperOptions {
  /** Executable name or path. Default `whisper-cli` (whisper.cpp). */
  readonly command?: string;
  /** Path to the ggml model. Default: `ANYMARK_WHISPER_MODEL`. Without one the backend is unavailable. */
  readonly model?: string;
  readonly timeoutMs?: number;
}

// The hint reaches argv: only plain ISO-style codes get through, anything else means auto-detect.
const CODE = /^[a-z]{2,3}$/;
const MAX_BYTES = 200 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10 * 60_000;

class TranscriptionError extends Error {
  constructor() {
    super('Whisper transcription failed');
    this.name = 'TranscriptionError';
  }
}

async function readable(path: string, mode: number): Promise<boolean> {
  try {
    await access(path, mode);
    return true;
  } catch {
    return false;
  }
}

/** Adapter: the whisper.cpp CLI behind the transcription backend contract. Needs `allowCli`. */
export class WhisperBackend implements Backend<Uint8Array, string> {
  readonly name = 'whisper-cli';
  readonly capability = 'transcription' as const;
  readonly locality = 'cli' as const;

  constructor(private readonly options: WhisperOptions = {}) {}

  get #command(): string {
    return this.options.command ?? 'whisper-cli';
  }

  get #model(): string | undefined {
    return this.options.model ?? process.env.ANYMARK_WHISPER_MODEL;
  }

  async isAvailable(): Promise<boolean> {
    const model = this.#model;
    if (model === undefined || !(await readable(model, constants.R_OK))) return false;
    const command = this.#command;
    if (command.includes('/')) return readable(command, constants.X_OK);
    for (const dir of (process.env.PATH ?? '').split(delimiter)) {
      if (dir !== '' && (await readable(join(dir, command), constants.X_OK))) return true;
    }
    return false;
  }

  async run(input: Uint8Array, ctx: BackendContext): Promise<string> {
    ctx.signal?.throwIfAborted();
    const model = this.#model;
    // run() is a door of its own: isAvailable() guards the chain, not a direct caller.
    if (model === undefined || input.length > MAX_BYTES) throw new TranscriptionError();
    const lang = ctx.lang !== undefined && CODE.test(ctx.lang) ? ctx.lang : 'auto';
    try {
      return await runCli(
        {
          command: this.#command,
          // -nt no timestamps, -np no progress prints, -mc 0 no cross-segment context (less hallucinated repetition)
          args: (path) => ['-m', model, '-nt', '-np', '-l', lang, '-mc', '0', path],
          input,
          inputName: 'audio',
          timeoutMs: this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        },
        { allowCli: true, ...(ctx.signal === undefined ? {} : { signal: ctx.signal }) },
      );
    } catch (error) {
      if (ctx.signal?.aborted === true) throw error;
      // The CLI's stderr and the model path are not for the caller.
      throw new TranscriptionError();
    }
  }
}
