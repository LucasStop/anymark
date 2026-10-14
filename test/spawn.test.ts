import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertOptIn, fetchWithOptIn } from '../src/security/optIn.js';
import { runCli } from '../src/security/spawn.js';
import type { SpawnRequest } from '../src/security/spawn.js';

const FAKE = resolve('fixtures/bin/fake-cli');
const OPTED_IN = { allowCli: true };
const data = new TextEncoder().encode('document body');

const request = (mode: string, extra: Partial<SpawnRequest> = {}): SpawnRequest => ({
  command: FAKE,
  args: (inputPath) => [mode, inputPath],
  input: data,
  ...extra,
});

describe('runCli', () => {
  let scratch: string;
  const realTmp = process.env.TMPDIR;

  // The spawn module creates its temp dir under os.tmpdir(), which follows TMPDIR.
  beforeEach(() => {
    scratch = mkdtempSync(join(tmpdir(), 'spawn-test-'));
    process.env.TMPDIR = scratch;
  });

  afterEach(() => {
    if (realTmp === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = realTmp;
    rmSync(scratch, { recursive: true, force: true });
  });

  it('hands the child a copy of the input and returns its stdout', async () => {
    await expect(runCli(request('cat'), OPTED_IN)).resolves.toBe('document body');
  });

  it('fails with a timeout error when the child runs too long', async () => {
    const run = runCli(request('sleep', { timeoutMs: 200 }), OPTED_IN);

    await expect(run).rejects.toMatchObject({ code: 'SPAWN_FAILED', reason: 'timeout' });
  });

  it('kills the child when the signal aborts', async () => {
    const controller = new AbortController();
    const run = runCli(request('sleep'), { ...OPTED_IN, signal: controller.signal });
    setTimeout(() => controller.abort(), 100);

    await expect(run).rejects.toMatchObject({ code: 'SPAWN_FAILED', reason: 'aborted' });
  });

  it('does not start the child when the signal is already aborted', async () => {
    const marker = join(scratch, 'marker');
    const run = runCli(
      { ...request('mark'), args: () => ['mark', marker] },
      { ...OPTED_IN, signal: AbortSignal.abort() },
    );

    await expect(run).rejects.toThrow();
    expect(existsSync(marker)).toBe(false);
  });

  it('rejects output above maxBuffer', async () => {
    const run = runCli(request('flood', { maxBuffer: 1024 }), OPTED_IN);

    await expect(run).rejects.toMatchObject({ code: 'SPAWN_FAILED', reason: 'output-too-large' });
  });

  it('passes only allowlisted variables to the child', async () => {
    process.env.ANYMARK_TEST_SECRET = 'hunter2';
    process.env.ANYMARK_TEST_ALLOWED = 'ok';
    try {
      const out = await runCli(
        request('env', { envAllow: ['ANYMARK_TEST_ALLOWED'], env: { EXPLICIT: '1' } }),
        OPTED_IN,
      );
      const names = JSON.parse(out) as string[];

      expect(names).toContain('ANYMARK_TEST_ALLOWED');
      expect(names).toContain('EXPLICIT');
      expect(names).not.toContain('ANYMARK_TEST_SECRET');
      expect(names).not.toContain('HOME');
    } finally {
      delete process.env.ANYMARK_TEST_SECRET;
      delete process.env.ANYMARK_TEST_ALLOWED;
    }
  });

  it('removes the temp directory after success and after failure', async () => {
    let inputPath = '';
    const capture = (mode: string) => (path: string) => {
      inputPath = path;
      return [mode, path];
    };

    await runCli(request('cat', { args: capture('cat') }), OPTED_IN);
    expect(existsSync(dirname(inputPath))).toBe(false);

    await expect(runCli(request('fail', { args: capture('fail') }), OPTED_IN)).rejects.toThrow();
    expect(inputPath).not.toBe('');
    expect(existsSync(dirname(inputPath))).toBe(false);
    expect(readdirSync(scratch)).toEqual([]);
  });

  it('keeps the input under a fixed name, whatever the caller supplies', async () => {
    let inputPath = '';
    await runCli(
      request('cat', {
        args: (path) => {
          inputPath = path;
          return ['cat', path];
        },
      }),
      OPTED_IN,
    );

    expect(inputPath.endsWith('/input')).toBe(true);
    await expect(runCli(request('cat', { inputName: '../escape' }), OPTED_IN)).rejects.toThrow();
  });

  it('never echoes stderr, paths or the command in the error', async () => {
    const error = await runCli(request('fail'), OPTED_IN).catch((e: Error) => e);

    expect(error).toMatchObject({ code: 'SPAWN_FAILED', reason: 'failed' });
    expect((error as Error).message).not.toMatch(/leaked-secret|anymark|fake-cli|\//);
  });

  it('does not spawn without allowCli', async () => {
    const marker = join(scratch, 'marker');
    const run = runCli({ ...request('mark'), args: () => ['mark', marker] }, {});

    await expect(run).rejects.toMatchObject({ code: 'OPT_IN_REQUIRED' });
    expect(existsSync(marker)).toBe(false);
    expect(readdirSync(scratch)).toEqual([]);
  });

  it('does not treat allowNetwork as permission to spawn', async () => {
    const run = runCli(request('cat'), { allowNetwork: true });

    await expect(run).rejects.toMatchObject({ code: 'OPT_IN_REQUIRED' });
  });
});

describe('opt-in guards', () => {
  it('lets local backends run without any flag', () => {
    expect(() => assertOptIn('local', {})).not.toThrow();
  });

  it.each([
    ['cli', 'allowCli'],
    ['remote', 'allowNetwork'],
  ] as const)('requires %s to be enabled by %s, and nothing else', (locality, flag) => {
    expect(() => assertOptIn(locality, {})).toThrow(flag);
    expect(() => assertOptIn(locality, { [flag]: false })).toThrow(flag);
    expect(() => assertOptIn(locality, { [flag]: true })).not.toThrow();
  });

  describe('fetchWithOptIn', () => {
    const fetchSpy = vi.fn(() => Promise.resolve(new Response('ok')));

    beforeEach(() => vi.stubGlobal('fetch', fetchSpy));
    afterEach(() => {
      vi.unstubAllGlobals();
      fetchSpy.mockClear();
    });

    it('makes no request without allowNetwork', async () => {
      await expect(fetchWithOptIn({}, 'https://example.test')).rejects.toMatchObject({
        code: 'OPT_IN_REQUIRED',
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('requests once allowed, and forwards the abort signal', async () => {
      const signal = new AbortController().signal;
      await fetchWithOptIn({ allowNetwork: true, signal }, 'https://example.test');

      expect(fetchSpy).toHaveBeenCalledWith('https://example.test', { signal });
    });
  });
});
