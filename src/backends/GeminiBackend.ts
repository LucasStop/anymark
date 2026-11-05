import type { Backend, BackendContext, Capability } from '../core/types.js';
import { languageCode, mimeOf, postJson, RemoteError } from './remote.js';

export interface GeminiOptions {
  /** `ocr` reads images, `transcription` listens to audio. One adapter, two capabilities. */
  readonly capability: Capability;
  /** Default: `GEMINI_API_KEY`. Never read from anywhere else. */
  readonly apiKey?: string;
  readonly model?: string;
  /** Test seam. Default: the public Gemini API. */
  readonly baseUrl?: string;
}

// Gemini takes about 20 MB of inline data per request.
const MAX_BYTES = 20 * 1024 * 1024;
const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_BASE = 'https://generativelanguage.googleapis.com';

const PROMPTS: Readonly<Record<Capability, string>> = {
  ocr: 'Transcribe all the text visible in this image. Reply with the text only.',
  transcription: 'Transcribe the speech in this audio. Reply with the transcript only.',
};

/** Adapter: the Gemini REST API behind the OCR or transcription backend contract. Needs `allowNetwork`. */
export class GeminiBackend implements Backend<Uint8Array, string> {
  readonly name = 'gemini';
  readonly capability: Capability;
  readonly locality = 'remote' as const;

  constructor(private readonly options: GeminiOptions) {
    this.capability = options.capability;
  }

  get #key(): string | undefined {
    return this.options.apiKey ?? process.env.GEMINI_API_KEY;
  }

  async isAvailable(): Promise<boolean> {
    return this.#key !== undefined && this.#key !== '';
  }

  async run(input: Uint8Array, ctx: BackendContext): Promise<string> {
    ctx.signal?.throwIfAborted();
    const key = this.#key;
    const mime = mimeOf(input);
    const wanted = this.capability === 'ocr' ? 'image/' : 'audio/';
    if (!key || input.length > MAX_BYTES || mime === undefined || !mime.startsWith(wanted)) {
      throw new RemoteError('Gemini');
    }
    const lang = languageCode(ctx.lang);
    const prompt =
      lang === undefined
        ? PROMPTS[this.capability]
        : `${PROMPTS[this.capability]} Language: ${lang}.`;
    const base = this.options.baseUrl ?? DEFAULT_BASE;
    const model = this.options.model ?? DEFAULT_MODEL;
    const body = await postJson(
      'Gemini',
      `${base}/v1beta/models/${model}:generateContent`,
      {
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                { inline_data: { mime_type: mime, data: Buffer.from(input).toString('base64') } },
              ],
            },
          ],
        }),
      },
      ctx.signal,
    );
    return textOf(body);
  }
}

function textOf(body: unknown): string {
  const parts = (body as { candidates?: { content?: { parts?: { text?: unknown }[] } }[] })
    .candidates?.[0]?.content?.parts;
  const texts = (parts ?? []).map((part) => part.text).filter((t) => typeof t === 'string');
  if (texts.length === 0) throw new RemoteError('Gemini');
  return texts.join('');
}
