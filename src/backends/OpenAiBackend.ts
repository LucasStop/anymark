import type { Backend, BackendContext } from '../core/types.js';
import { languageCode, mimeOf, postJson, RemoteError } from './remote.js';

export interface OpenAiOptions {
  /** Default: `OPENAI_API_KEY`. Never read from anywhere else. */
  readonly apiKey?: string;
  readonly model?: string;
  /** Test seam. Default: the public OpenAI API. */
  readonly baseUrl?: string;
}

// OpenAI takes 25 MB per audio file.
const MAX_BYTES = 25 * 1024 * 1024;
const DEFAULT_MODEL = 'whisper-1';
const DEFAULT_BASE = 'https://api.openai.com';
const EXTENSION: Readonly<Record<string, string>> = {
  'audio/wav': 'wav',
  'audio/mpeg': 'mp3',
  'audio/flac': 'flac',
  'audio/ogg': 'ogg',
};

/** Adapter: the OpenAI transcription API behind the transcription backend contract. Needs `allowNetwork`. */
export class OpenAiBackend implements Backend<Uint8Array, string> {
  readonly name = 'openai';
  readonly capability = 'transcription' as const;
  readonly locality = 'remote' as const;

  constructor(private readonly options: OpenAiOptions = {}) {}

  get #key(): string | undefined {
    return this.options.apiKey ?? process.env.OPENAI_API_KEY;
  }

  async isAvailable(): Promise<boolean> {
    return this.#key !== undefined && this.#key !== '';
  }

  async run(input: Uint8Array, ctx: BackendContext): Promise<string> {
    ctx.signal?.throwIfAborted();
    const key = this.#key;
    const mime = mimeOf(input);
    const extension = mime === undefined ? undefined : EXTENSION[mime];
    if (!key || input.length > MAX_BYTES || mime === undefined || extension === undefined) {
      throw new RemoteError('OpenAI');
    }
    const form = new FormData();
    form.set('model', this.options.model ?? DEFAULT_MODEL);
    const lang = languageCode(ctx.lang);
    if (lang !== undefined) form.set('language', lang);
    form.set('file', new Blob([Buffer.from(input)], { type: mime }), `audio.${extension}`);
    const body = await postJson(
      'OpenAI',
      `${this.options.baseUrl ?? DEFAULT_BASE}/v1/audio/transcriptions`,
      { headers: { authorization: `Bearer ${key}` }, body: form },
      ctx.signal,
    );
    const { text } = body as { text?: unknown };
    if (typeof text !== 'string') throw new RemoteError('OpenAI');
    return text;
  }
}
