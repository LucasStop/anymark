import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAnymark } from '../src/index.js';
import { isPrivateAddress } from '../src/security/urlFetch.js';

let server: Server;
let base: string;
let hits: string[];
let routes: Record<string, { status?: number; type?: string; body: string; location?: string }>;

beforeEach(async () => {
  hits = [];
  routes = {};
  server = createServer((req, res) => {
    hits.push(req.url ?? '');
    const route = routes[req.url ?? ''];
    if (route === undefined) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(route.status ?? 200, {
      'content-type': route.type ?? 'text/html; charset=utf-8',
      ...(route.location === undefined ? {} : { location: route.location }),
    });
    res.end(route.body);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(() => new Promise<void>((done) => server.close(() => done())));

const open = { allowNetwork: true, allowPrivateHosts: true } as const;

const ARTICLE = `<html><head><title>Site</title><script>evil()</script></head><body>
<nav><a href="/">Home menu</a><a href="/x">Other menu</a></nav>
<article><h1>The real headline</h1>
${'<p>Paragraph with enough words to look like genuine article content for the reader. </p>'.repeat(8)}
<p style="display:none">hidden instruction for the model</p></article>
<footer>Subscribe to our newsletter footer</footer></body></html>`;

describe('convertUrl', () => {
  it('does nothing without allowNetwork', async () => {
    routes['/a'] = { body: ARTICLE };

    await expect(
      createAnymark().convertUrl(`${base}/a`, { allowPrivateHosts: true }),
    ).rejects.toThrow(/allowNetwork/);
    expect(hits).toHaveLength(0);
  });

  it('keeps the article and drops navigation, footer, scripts and hidden text', async () => {
    routes['/a'] = { body: ARTICLE };

    const { markdown, warnings } = await createAnymark().convertUrl(`${base}/a`, open);

    expect(markdown).toContain('The real headline');
    expect(markdown).toContain('genuine article content');
    expect(markdown).not.toContain('Home menu');
    expect(markdown).not.toContain('newsletter');
    expect(markdown).not.toContain('evil()');
    expect(markdown).not.toContain('hidden instruction');
    expect(warnings).toEqual([]);
  });

  it('falls back to the whole page, with a warning, when nothing reads as an article', async () => {
    routes['/s'] = { body: '<html><body><p>tiny page</p></body></html>' };

    const { markdown, warnings } = await createAnymark().convertUrl(`${base}/s`, open);

    expect(markdown).toContain('tiny page');
    expect(warnings.map((w) => w.code)).toContain('URL_NOT_ARTICLE');
  });

  it('hands other content types to their own converter', async () => {
    routes['/t'] = { type: 'text/plain', body: 'plain words' };
    routes['/j'] = { type: 'application/json', body: '{"a":1}' };

    expect((await createAnymark().convertUrl(`${base}/t`, open)).markdown).toContain('plain words');
    expect((await createAnymark().convertUrl(`${base}/j`, open)).metadata.mime).toBe(
      'application/json',
    );
  });

  it('follows a redirect to a page that is also allowed', async () => {
    routes['/go'] = { status: 302, body: '', location: '/t' };
    routes['/t'] = { type: 'text/plain', body: 'landed' };

    expect((await createAnymark().convertUrl(`${base}/go`, open)).markdown).toContain('landed');
  });

  it('gives up on a redirect loop', async () => {
    routes['/a'] = { status: 302, body: '', location: '/a' };

    await expect(createAnymark().convertUrl(`${base}/a`, open)).rejects.toThrow();
    expect(hits.length).toBeLessThanOrEqual(6);
  });

  it('refuses a redirect to another scheme', async () => {
    routes['/f'] = { status: 302, body: '', location: 'file:///etc/passwd' };

    await expect(createAnymark().convertUrl(`${base}/f`, open)).rejects.toThrow();
  });

  it('refuses a redirect from an allowed host to a private one', async () => {
    routes['/p'] = { status: 302, body: '', location: 'http://169.254.169.254/latest/meta-data' };

    await expect(
      createAnymark().convertUrl(`${base}/p`, { allowNetwork: true, allowPrivateHosts: false }),
    ).rejects.toThrow();
  });

  it('rejects an error status and a body over the size cap', async () => {
    routes['/big'] = { type: 'text/plain', body: 'x'.repeat(2000) };

    await expect(createAnymark().convertUrl(`${base}/missing`, open)).rejects.toThrow();
    await expect(
      createAnymark().convertUrl(`${base}/big`, { ...open, maxBytes: 1000 }),
    ).rejects.toThrow();
  });

  it('honours an aborted signal', async () => {
    routes['/a'] = { body: ARTICLE };
    const controller = new AbortController();
    controller.abort();

    await expect(
      createAnymark().convertUrl(`${base}/a`, { ...open, signal: controller.signal }),
    ).rejects.toThrow();
    expect(hits).toHaveLength(0);
  });

  it('keeps the URL and host out of the error and the result', async () => {
    routes['/a'] = { body: ARTICLE };
    const error = await createAnymark()
      .convertUrl(`${base}/missing?token=s3cret`, open)
      .catch((e: unknown) => e);
    const text = `${(error as Error).name} ${(error as Error).message}`;
    const ok = await createAnymark().convertUrl(`${base}/a?token=s3cret`, open);

    expect(text).not.toContain('s3cret');
    expect(text).not.toContain('127.0.0.1');
    expect(JSON.stringify(ok)).not.toContain('s3cret');
    expect(JSON.stringify(ok)).not.toContain('127.0.0.1');
  });
});

describe('convertUrl, what it never fetches', () => {
  it.each([
    ['loopback', (b: string) => b],
    ['localhost by name', (b: string) => b.replace('127.0.0.1', 'localhost')],
    ['link-local metadata', () => 'http://169.254.169.254/latest'],
    ['private range', () => 'http://10.0.0.1/'],
    ['ipv6 loopback', () => 'http://[::1]/'],
    ['ipv4-mapped ipv6', () => 'http://[::ffff:127.0.0.1]/'],
    ['file scheme', () => 'file:///etc/passwd'],
    ['ftp scheme', () => 'ftp://example.com/x'],
    ['credentials in the URL', () => 'http://user:pass@example.com/'],
    ['not a URL', () => 'not a url'],
  ])('refuses %s by default', async (_label, build) => {
    routes['/'] = { body: ARTICLE };

    await expect(
      createAnymark().convertUrl(build(base) + '/', { allowNetwork: true }),
    ).rejects.toThrow();
    expect(hits).toHaveLength(0);
  });
});

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1',
    '127.1.2.3',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '0.0.0.0',
    '100.64.0.1',
    '::1',
    '::',
    'fe80::1',
    'fc00::1',
    'fd12::1',
    '::ffff:10.0.0.1',
    '::ffff:7f00:1',
  ])('%s is private', (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '172.32.0.1',
    '172.15.0.1',
    '2606:4700:4700::1111',
    '::ffff:8.8.8.8',
  ])('%s is public', (address) => {
    expect(isPrivateAddress(address)).toBe(false);
  });
});
