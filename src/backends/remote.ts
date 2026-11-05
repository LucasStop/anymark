import { SignatureHandler } from '../detection/handlers.js';
import { fetchWithOptIn } from '../security/optIn.js';

/** Generic on purpose: the provider's body can echo the key or the request, so none of it is kept. */
export class RemoteError extends Error {
  constructor(provider: string) {
    super(`${provider} request failed`);
    this.name = 'RemoteError';
  }
}

// The hint ends up inside a prompt or a form field: only plain ISO-style codes get through.
const CODE = /^[a-z]{2,3}$/;
export const languageCode = (hint: string | undefined): string | undefined =>
  hint !== undefined && CODE.test(hint) ? hint : undefined;

/** Mime from the bytes, reusing the detector's signatures. Untyped bytes are not sent anywhere. */
export const mimeOf = (data: Uint8Array): string | undefined =>
  new SignatureHandler().handle({ data }, () => undefined);

const TIMEOUT_MS = 120_000;
const MAX_RESPONSE_CHARS = 5 * 1024 * 1024;

/**
 * POST and parse JSON. The chain already enforced `allowNetwork`; this door is opened here
 * because a backend's `run()` can also be called directly. Redirects are refused so a
 * header carrying a key never follows a `Location` to another host.
 */
export async function postJson(
  provider: string,
  url: string,
  init: RequestInit,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const combined = signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
  try {
    const response = await fetchWithOptIn({ allowNetwork: true, signal: combined }, url, {
      ...init,
      method: 'POST',
      redirect: 'error',
    });
    if (!response.ok) throw new RemoteError(provider);
    const text = await response.text();
    if (text.length > MAX_RESPONSE_CHARS) throw new RemoteError(provider);
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (signal?.aborted === true) throw error;
    throw new RemoteError(provider);
  }
}
