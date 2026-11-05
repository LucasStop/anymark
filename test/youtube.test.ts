import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAnymark } from '../src/index.js';
import type { Backend } from '../src/index.js';

const YTDLP = resolve('fixtures/bin/fake-ytdlp');
const VIDEO = 'dQw4w9WgXcQ';

const transcriber = (text = 'said in the video'): Backend => ({
  name: 'fake-asr',
  capability: 'transcription',
  locality: 'local',
  isAvailable: async () => true,
  run: async () => text,
});

let scratch: string;
const saved = { tmp: process.env.TMPDIR, ytdlp: process.env.ANYMARK_YTDLP };

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'youtube-test-'));
  process.env.TMPDIR = scratch;
  process.env.ANYMARK_YTDLP = YTDLP;
  process.env.FAKE_YTDLP_LOG = join(scratch, 'ytdlp.log');
});

afterEach(() => {
  for (const [key, value] of [
    ['TMPDIR', saved.tmp],
    ['ANYMARK_YTDLP', saved.ytdlp],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  delete process.env.FAKE_YTDLP_LOG;
  delete process.env.FAKE_YTDLP_MODE;
  rmSync(scratch, { recursive: true, force: true });
});

const youtube = (
  url: string,
  extra: Parameters<ReturnType<typeof createAnymark>['convertYoutube']>[1] = {},
) =>
  createAnymark().convertYoutube(url, {
    backends: [transcriber()],
    allowCli: true,
    allowNetwork: true,
    ...extra,
  });

describe('convertYoutube', () => {
  it.each([
    `https://www.youtube.com/watch?v=${VIDEO}`,
    `https://youtube.com/watch?v=${VIDEO}&t=30s&list=PL123`,
    `https://m.youtube.com/watch?v=${VIDEO}`,
    `https://music.youtube.com/watch?v=${VIDEO}`,
    `https://youtu.be/${VIDEO}?si=abc`,
    `https://www.youtube.com/shorts/${VIDEO}`,
    `https://www.youtube.com/embed/${VIDEO}`,
  ])('transcribes %s through the audio path', async (url) => {
    const { markdown, warnings } = await youtube(url);

    expect(markdown).toBe('said in the video\n');
    expect(warnings).toEqual([]);
  });

  it('hands yt-dlp one canonical URL, never the caller string', async () => {
    await youtube(`https://youtu.be/${VIDEO}?si=abc&list=PL1`);

    expect(readFileSync(process.env.FAKE_YTDLP_LOG!, 'utf8')).toBe(
      `https://www.youtube.com/watch?v=${VIDEO}\n`,
    );
  });

  it.each([
    ['http scheme', `http://www.youtube.com/watch?v=${VIDEO}`],
    ['another host', `https://evil.example/watch?v=${VIDEO}`],
    ['a lookalike host', `https://youtube.com.evil.example/watch?v=${VIDEO}`],
    ['credentials', `https://user:pw@www.youtube.com/watch?v=${VIDEO}`],
    ['no video id', 'https://www.youtube.com/'],
    ['a playlist only', 'https://www.youtube.com/playlist?list=PL12345678901'],
    ['an id that could be a flag', 'https://www.youtube.com/watch?v=--exec=rm-rf'],
    ['not a URL', 'not a url'],
  ])('refuses %s without starting yt-dlp', async (_label, url) => {
    await expect(youtube(url)).rejects.toThrow(/YouTube/);
    expect(existsSync(process.env.FAKE_YTDLP_LOG!)).toBe(false);
  });

  it.each([
    ['allowCli', { allowCli: false }, /allowCli/],
    ['allowNetwork', { allowNetwork: false }, /allowNetwork/],
  ])('does nothing without %s', async (_name, extra, message) => {
    await expect(youtube(`https://youtu.be/${VIDEO}`, extra)).rejects.toThrow(message);
    expect(existsSync(process.env.FAKE_YTDLP_LOG!)).toBe(false);
  });

  it('fails with the transcription capability named when no backend can listen', async () => {
    await expect(youtube(`https://youtu.be/${VIDEO}`, { backends: [] })).rejects.toThrow(
      /transcription/,
    );
  });

  it('honours an aborted signal before starting yt-dlp', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      youtube(`https://youtu.be/${VIDEO}`, { signal: controller.signal }),
    ).rejects.toThrow();
    expect(existsSync(process.env.FAKE_YTDLP_LOG!)).toBe(false);
  });

  it('fails generically when yt-dlp fails: no stderr, no URL', async () => {
    process.env.FAKE_YTDLP_MODE = 'fail';

    const error = await youtube(`https://youtu.be/${VIDEO}`).catch((e: unknown) => e);
    const text = `${(error as Error).name} ${(error as Error).message}`;

    expect(text).not.toContain('leaked-secret');
    expect(text).not.toContain('youtube.com');
    expect(text).not.toContain(VIDEO);
    expect(text).not.toContain(YTDLP);
  });

  it('keeps the URL and every path out of the result and cleans its temp dir', async () => {
    const result = await youtube(`https://youtu.be/${VIDEO}`);

    expect(JSON.stringify(result)).not.toContain(VIDEO);
    expect(JSON.stringify(result)).not.toContain(YTDLP);
    expect(JSON.stringify(result)).not.toContain(scratch);
    expect(readdirSync(scratch).filter((entry) => entry.startsWith('anymark-'))).toEqual([]);
  });
});
