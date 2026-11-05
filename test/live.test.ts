import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WhisperBackend } from '../src/backends/WhisperBackend.js';
import { createAnymark } from '../src/index.js';
import type { Backend } from '../src/index.js';

// Real binaries, no AI quota: whisper-cli with a local model, ffmpeg and yt-dlp (network only).
// Skipped unless ANYMARK_LIVE=1, so CI and `yarn test` never need them.
const live = process.env.ANYMARK_LIVE === '1';
const YOUTUBE = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'; // 3.5 min, public since 2009; the shorter test videos tried were unavailable

/** Stands in for a transcriber and keeps the bytes the converter handed it. */
function recorder() {
  const seen: Uint8Array[] = [];
  const backend: Backend = {
    name: 'recorder',
    capability: 'transcription',
    locality: 'local',
    isAvailable: async () => true,
    run: async (input) => {
      seen.push(input as Uint8Array);
      return 'heard';
    },
  };
  return { seen, backend };
}

const isWav = (data: Uint8Array) =>
  new TextDecoder().decode(data.subarray(0, 4)) === 'RIFF' &&
  new TextDecoder().decode(data.subarray(8, 12)) === 'WAVE';

describe.skipIf(!live)('live binaries', () => {
  let scratch: string;
  beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), 'anymark-live-'));
  });
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  it.skipIf(!process.env.ANYMARK_WHISPER_MODEL)(
    'transcribes specs/audio/silence.wav with the real whisper-cli',
    async () => {
      const result = await createAnymark().convert(
        { data: readFileSync('specs/audio/silence.wav'), name: 'silence.wav' },
        { backends: [new WhisperBackend()], allowCli: true },
      );

      expect(result.metadata.mime).toBe('audio/wav');
      expect(typeof result.markdown).toBe('string');
    },
    120_000,
  );

  // macOS `say` gives speech without a binary fixture; elsewhere the test is skipped.
  const hasSay = process.platform === 'darwin';
  it.skipIf(!process.env.ANYMARK_WHISPER_MODEL || !hasSay)(
    'hears spoken words in a real mp4 through ffmpeg and whisper-cli',
    async () => {
      const speech = join(scratch, 'speech.aiff');
      const file = join(scratch, 'speech.mp4');
      execFileSync('say', ['-o', speech, 'hello world, this is a test']);
      execFileSync('ffmpeg', [
        ...['-v', 'error', '-i', speech, '-f', 'lavfi', '-i', 'color=c=black:s=64x64'],
        ...['-shortest', '-y', file],
      ]);

      const result = await createAnymark().convert(
        { data: readFileSync(file), name: 'speech.mp4' },
        { backends: [new WhisperBackend()], allowCli: true, lang: 'en' },
      );

      expect(result.markdown.toLowerCase()).toContain('hello world');
    },
    120_000,
  );

  it('extracts 16 kHz mono PCM from a real mp4 with the real ffmpeg', async () => {
    const file = join(scratch, 'clip.mp4');
    execFileSync('ffmpeg', [
      ...['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2'],
      ...['-f', 'lavfi', '-i', 'color=c=black:s=64x64:d=2', '-shortest', '-y', file],
    ]);
    const { seen, backend } = recorder();

    const result = await createAnymark().convert(
      { data: readFileSync(file), name: 'clip.mp4' },
      { backends: [backend], allowCli: true },
    );

    expect(result.metadata.mime).toBe('video/mp4');
    expect(result.markdown).toBe('heard\n');
    expect(isWav(seen[0]!)).toBe(true);
    // 2 s of 16 kHz, 16-bit, mono is about 64 kB plus the header.
    expect(seen[0]!.length).toBeGreaterThan(60_000);
    expect(seen[0]!.length).toBeLessThan(70_000);
  }, 60_000);

  it('downloads a short public YouTube video with the real yt-dlp', async () => {
    const { seen, backend } = recorder();

    const result = await createAnymark().convertYoutube(YOUTUBE, {
      backends: [backend],
      allowCli: true,
      allowNetwork: true,
    });

    expect(result.markdown).toBe('heard\n');
    expect(isWav(seen[0]!)).toBe(true);
    expect(JSON.stringify(result)).not.toContain('dQw4w9WgXcQ');
  }, 180_000);
});
