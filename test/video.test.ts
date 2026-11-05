import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAnymark } from '../src/index.js';
import type { Backend } from '../src/index.js';
import { runCliFile } from '../src/security/spawn.js';

const FFMPEG = resolve('fixtures/bin/fake-ffmpeg');
const FAKE_CLI = resolve('fixtures/bin/fake-cli');
const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));
const pad = (...head: number[]) => new Uint8Array([...head, ...new Array(64).fill(0)]);
const mp4 = pad(0, 0, 0, 0x18, ...ascii('ftypisom'));
const mkv = pad(0x1a, 0x45, 0xdf, 0xa3);

const transcriber = (text = 'spoken in the video'): Backend => ({
  name: 'fake-asr',
  capability: 'transcription',
  locality: 'local',
  isAvailable: async () => true,
  run: async () => text,
});

let scratch: string;
const LOG = () => join(scratch, 'ffmpeg.log');
const saved = { tmp: process.env.TMPDIR, ffmpeg: process.env.ANYMARK_FFMPEG };

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'video-test-'));
  process.env.TMPDIR = scratch;
  process.env.ANYMARK_FFMPEG = FFMPEG;
});

afterEach(() => {
  for (const [key, value] of [
    ['TMPDIR', saved.tmp],
    ['ANYMARK_FFMPEG', saved.ffmpeg],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(scratch, { recursive: true, force: true });
});

const convert = (
  data: Uint8Array,
  extra: Parameters<ReturnType<typeof createAnymark>['convert']>[1] = {},
) => createAnymark().convert({ data }, { backends: [transcriber()], allowCli: true, ...extra });

describe('video detection', () => {
  it.each([
    ['mp4 by its ftyp box', mp4, 'video/mp4'],
    ['matroska or webm by its EBML header', mkv, 'video/x-matroska'],
  ])('reads %s', async (_label, data, mime) => {
    expect((await convert(data)).metadata.mime).toBe(mime);
  });

  it('uses the extension when the bytes do not settle it', async () => {
    const result = await createAnymark().convert(
      { data: pad(1, 2, 3, 4), name: 'clip.mov' },
      { backends: [transcriber()], allowCli: true },
    );
    expect(result.metadata.mime).toBe('video/mp4');
  });
});

describe('VideoConverter', () => {
  it('extracts the audio with ffmpeg and returns what the chain heard', async () => {
    const { markdown, warnings } = await convert(mp4);

    expect(markdown).toBe('spoken in the video\n');
    expect(warnings).toEqual([]);
    expect(existsSync(LOG())).toBe(true);
  });

  it('does nothing without allowCli: ffmpeg is never started', async () => {
    await expect(convert(mp4, { allowCli: false })).rejects.toThrow(/allowCli/);
    expect(existsSync(LOG())).toBe(false);
  });

  it('fails with the transcription capability named when no backend can listen', async () => {
    await expect(convert(mp4, { backends: [] })).rejects.toThrow(/transcription/);
  });

  it('honours an aborted signal before starting ffmpeg', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(convert(mp4, { signal: controller.signal })).rejects.toThrow();
    expect(existsSync(LOG())).toBe(false);
  });

  it('fails generically when ffmpeg fails: no stderr, no path', async () => {
    writeFileSync(join(scratch, 'ffmpeg.fail'), '');

    const error = await convert(mp4).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    const text = `${(error as Error).name} ${(error as Error).message}`;

    expect(text).not.toContain('leaked-secret');
    expect(text).not.toContain('video.mp4');
    expect(text).not.toContain(FFMPEG);
  });

  it('fails generically when ffmpeg is not installed', async () => {
    process.env.ANYMARK_FFMPEG = 'definitely-not-installed-xyz';

    await expect(convert(mp4)).rejects.toThrow();
  });

  it('keeps every path out of the result and cleans its temp dir', async () => {
    const result = await convert(mp4);

    expect(JSON.stringify(result)).not.toContain(FFMPEG);
    expect(JSON.stringify(result)).not.toContain(scratch);
    expect(readdirSync(scratch).filter((entry) => entry.startsWith('anymark-'))).toEqual([]);
  });
});

describe('runCliFile', () => {
  const run = (mode: string, extra: object = {}) =>
    runCliFile(
      {
        command: FAKE_CLI,
        args: (input, output) => [mode, input, output],
        input: new TextEncoder().encode('payload'),
        outputName: 'result.bin',
        ...extra,
      },
      { allowCli: true },
    );

  it('returns the bytes of the file the child wrote, and removes the temp dir', async () => {
    expect(Buffer.from(await run('copy')).toString()).toBe('payload');
    expect(readdirSync(scratch).filter((entry) => entry.startsWith('anymark-'))).toEqual([]);
  });

  it('fails when the child wrote no file', async () => {
    await expect(run('nothing')).rejects.toThrow(/failed/);
  });

  it('needs allowCli', async () => {
    await expect(
      runCliFile(
        {
          command: FAKE_CLI,
          args: (i, o) => ['copy', i, o],
          input: new Uint8Array(),
          outputName: 'o',
        },
        {},
      ),
    ).rejects.toThrow(/allowCli/);
  });

  it('refuses an output name with a separator', async () => {
    await expect(run('copy', { outputName: '../escape' })).rejects.toThrow();
  });

  it('refuses a file over the output cap', async () => {
    await expect(run('copy', { maxOutputBytes: 3 })).rejects.toThrow(/output-too-large/);
  });
});
