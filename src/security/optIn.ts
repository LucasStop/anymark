import { OptInRequiredError } from '../core/errors.js';
import type { ConvertOptions, Locality } from '../core/types.js';

/** `cli` needs `allowCli`, `remote` needs `allowNetwork`. One flag never stands in for the other. */
export function isOptedIn(locality: Locality, options: ConvertOptions): boolean {
  if (locality === 'cli') return options.allowCli === true;
  if (locality === 'remote') return options.allowNetwork === true;
  return true;
}

export function assertOptIn(locality: Locality, options: ConvertOptions): void {
  if (isOptedIn(locality, options)) return;
  throw new OptInRequiredError(locality === 'cli' ? 'allowCli' : 'allowNetwork');
}

/** The only door to the network for backends: closed unless the caller opened it. */
export async function fetchWithOptIn(
  options: ConvertOptions,
  url: string | URL,
  init: RequestInit = {},
): Promise<Response> {
  assertOptIn('remote', options);
  return fetch(url, options.signal === undefined ? init : { ...init, signal: options.signal });
}
