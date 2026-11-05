import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import type { ConvertOptions } from '../core/types.js';
import { assertOptIn, fetchWithOptIn } from './optIn.js';

export interface UrlOptions extends ConvertOptions {
  /** Off by default: loopback, private and link-local hosts are never fetched (SSRF). Tests and intranets turn it on. */
  readonly allowPrivateHosts?: boolean;
  /** Body cap in bytes. Default 25 MB, the same as every other input. */
  readonly maxBytes?: number;
}

export interface FetchedPage {
  readonly data: Uint8Array;
  /** Lower-cased media type without parameters; absent for a missing or generic one. */
  readonly mime?: string;
}

/** The message never carries the URL, the host or the server's answer: query strings hold tokens. */
export class UrlFetchError extends Error {
  readonly code = 'URL_FETCH_FAILED';

  constructor(readonly reason: 'invalid' | 'blocked' | 'status' | 'too-large' | 'redirects') {
    super(`URL fetch failed: ${reason}`);
    this.name = 'UrlFetchError';
  }
}

const NOT_PUBLIC = new BlockList();
for (const [net, bits] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  NOT_PUBLIC.addSubnet(net, bits, 'ipv4');
}
for (const [net, bits] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  NOT_PUBLIC.addSubnet(net, bits, 'ipv6');
}

const MAPPED = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/;

/** True for any address a public web page has no business reaching. IPv4-mapped IPv6 is unwrapped first. */
export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return NOT_PUBLIC.check(address, 'ipv4');
  if (family !== 6) return true;
  // The URL parser normalizes every spelling of an IPv6 address to the hex form.
  const normal = new URL(`http://[${address}]`).hostname.slice(1, -1);
  const mapped = MAPPED.exec(normal);
  if (mapped !== null) {
    const high = Number.parseInt(mapped[1]!, 16);
    const low = Number.parseInt(mapped[2]!, 16);
    return NOT_PUBLIC.check(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`, 'ipv4');
  }
  return NOT_PUBLIC.check(normal, 'ipv6');
}

const MAX_REDIRECTS = 5;
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
const TIMEOUT_MS = 30_000;

async function assertPublicHost(url: URL): Promise<void> {
  const host = url.hostname.startsWith('[') ? url.hostname.slice(1, -1) : url.hostname;
  // ponytail: the name is resolved here and again by fetch, so a rebinding DNS server can still swap
  // the answer in between. Pin the resolved address with a custom dispatcher if that threat matters.
  const addresses =
    isIP(host) === 0 ? (await lookup(host, { all: true })).map((a) => a.address) : [host];
  if (addresses.length === 0 || addresses.some(isPrivateAddress))
    throw new UrlFetchError('blocked');
}

function parse(raw: string | URL): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UrlFetchError('invalid');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new UrlFetchError('blocked');
  // Credentials in a URL end up in logs and in the Authorization header of whoever reads them.
  if (url.username !== '' || url.password !== '') throw new UrlFetchError('blocked');
  return url;
}

async function readCapped(response: Response, max: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > max) throw new UrlFetchError('too-large');
  const chunks: Uint8Array[] = [];
  let total = 0;
  if (response.body !== null) {
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      total += chunk.length;
      if (total > max) throw new UrlFetchError('too-large');
      chunks.push(chunk);
    }
  }
  return Buffer.concat(chunks);
}

/**
 * GET a public web page. Opt-in first (no DNS lookup before it), then scheme, credentials and host
 * checks on the URL and on every redirect hop, a body cap, and a timeout. Nothing the page says
 * is interpreted here.
 */
export async function fetchUrl(raw: string, options: UrlOptions): Promise<FetchedPage> {
  assertOptIn('remote', options);
  options.signal?.throwIfAborted();
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const signal =
    options.signal === undefined ? timeout : AbortSignal.any([options.signal, timeout]);
  let url = parse(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (options.allowPrivateHosts !== true) await assertPublicHost(url);
    signal.throwIfAborted();
    const response = await fetchWithOptIn({ allowNetwork: true, signal }, url, {
      redirect: 'manual',
      headers: { accept: 'text/html,application/xhtml+xml,text/*;q=0.8,*/*;q=0.5' },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (location === null) throw new UrlFetchError('status');
      url = parse(new URL(location, url));
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new UrlFetchError('status');
    }
    const data = await readCapped(response, options.maxBytes ?? DEFAULT_MAX_BYTES);
    const type = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
    return type === undefined || type === '' || type === 'application/octet-stream'
      ? { data }
      : { data, mime: type };
  }
  throw new UrlFetchError('redirects');
}
