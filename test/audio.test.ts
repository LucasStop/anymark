import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WhisperBackend } from '../src/backends/WhisperBackend.js';
import { createAnymark } from '../src/index.js';
import type { Backend } from '../src/index.js';
import { assertBackendContract, assertConverterContract } from '../src/testing/index.js';

const FAKE = resolve('fixtures/bin/fake-whisper');
const MODEL = resolve('specs/audio/silence.wav'); // any readable file stands in for the model
const wav = () =>
  new Uint8Array(readFileSync(new URL('../specs/audio/silence.wav', import.meta.url)));
const whisper = (extra: ConstructorParameters<typeof WhisperBackend>[0] = {}) =>
  new WhisperBackend({ command: FAKE, model: MODEL, ...extra });

describe('audio detection', () => {
  const mimeOf = async (data: Uint8Array, name?: string) =>
    (await createAnymark().convert({ data, ...(name ? { name } : {}) }, { backends: [fake()] }))
      .metadata.mime;
  const fake = (): Backend => ({
    name: 'fake',
    capability: 'transcription',
    locality: 'local',
    isAvailable: async () => true,
    run: async () => 'ok',
  });
  const bytes = (...values: number[]) => new Uint8Array([...values, ...new Array(64).fill(0)]);
  const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

  it.each([
    ['wav', wav(), 'audio/wav'],
    ['flac', bytes(...ascii('fLaC')), 'audio/flac'],
    ['ogg', bytes(...ascii('OggS')), 'audio/ogg'],
    ['mp3 with an ID3 tag', bytes(...ascii('ID3')), 'audio/mpeg'],
    ['mp3 frame', bytes(0xff, 0xfb, 0x90, 0x00), 'audio/mpeg'],
  ])('detects %s by its bytes, with no name', async (_label, data, mime) => {
    expect(await mimeOf(data)).toBe(mime);
  });

  it('still reads a RIFF webp as an image and a jpeg as an image', async () => {
    const webp = bytes(...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP'));
    const jpeg = bytes(0xff, 0xd8, 0xff, 0xe0);
    await expect(createAnymark().convert({ data: webp }, { backends: [] })).rejects.toThrow(); // image path: no OCR backend, but not mistaken for audio
    await expect(createAnymark().convert({ data: jpeg }, { backends: [] })).rejects.toThrow();
  });

  it('uses the extension for a name the bytes do not settle', async () => {
    expect(await mimeOf(wav(), 'talk.wav')).toBe('audio/wav');
  });
});

describe('AudioConverter', () => {
  const transcriber = (text: string): Backend =>
    ({
      name: 'fake-asr',
      capability: 'transcription',
      locality: 'local',
      isAvailable: async () => true,
      run: async () => text,
    }) as Backend;

  it('turns the transcript into one paragraph, whatever line breaks the backend used', async () => {
    const { markdown, metadata } = await createAnymark().convert(
      { data: wav(), name: 'a.wav' },
      { backends: [transcriber('\n hello there\n general kenobi \n')] },
    );

    expect(markdown).toBe('hello there general kenobi\n');
    expect(metadata.mime).toBe('audio/wav');
  });

  it('warns AUDIO_NO_SPEECH and returns empty Markdown when nothing was heard', async () => {
    const result = await createAnymark().convert(
      { data: wav(), name: 'a.wav' },
      { backends: [transcriber(' \n ')] },
    );

    expect(result.markdown).toBe('');
    expect(result.warnings.map((w) => w.code)).toContain('AUDIO_NO_SPEECH');
  });

  it('fails with NoBackendError when no backend does transcription', async () => {
    await expect(
      createAnymark().convert({ data: wav(), name: 'a.wav' }, { backends: [] }),
    ).rejects.toThrow(/transcription/);
  });

  it('passes the converter contract', async () => {
    const { AudioConverter } = await import('../src/converters/AudioConverter.js');
    await assertConverterContract(new AudioConverter(), {
      data: wav(),
      name: 'a.wav',
      mime: 'audio/wav',
    });
  });
});

describe('WhisperBackend', () => {
  it('passes the backend contract with the fake CLI', async () => {
    await assertBackendContract(whisper(), wav());
  });

  it('hands the CLI a no-timestamps, no-context run and the language hint', async () => {
    const out = await whisper().run(wav(), { lang: 'pt' });

    expect(out).toContain('lang=pt');
    expect(out).toContain('ctx=0');
    expect(out).toContain('nt=true');
  });

  it('falls back to auto-detected language when the hint is not a plain code', async () => {
    expect(await whisper().run(wav(), { lang: '../../etc' })).toContain('lang=auto');
    expect(await whisper().run(wav(), {})).toContain('lang=auto');
  });

  it('is unavailable without a model, with a missing model file or with a missing command', async () => {
    const old = process.env.ANYMARK_WHISPER_MODEL;
    delete process.env.ANYMARK_WHISPER_MODEL;
    try {
      expect(await new WhisperBackend({ command: FAKE }).isAvailable()).toBe(false);
      expect(await whisper({ model: '/nope/model.bin' }).isAvailable()).toBe(false);
      expect(await whisper({ command: 'definitely-not-installed-xyz' }).isAvailable()).toBe(false);
      expect(await whisper().isAvailable()).toBe(true);
    } finally {
      if (old !== undefined) process.env.ANYMARK_WHISPER_MODEL = old;
    }
  });

  it('reads the model from ANYMARK_WHISPER_MODEL', async () => {
    const old = process.env.ANYMARK_WHISPER_MODEL;
    process.env.ANYMARK_WHISPER_MODEL = MODEL;
    try {
      expect(await new WhisperBackend({ command: FAKE }).isAvailable()).toBe(true);
    } finally {
      if (old === undefined) delete process.env.ANYMARK_WHISPER_MODEL;
      else process.env.ANYMARK_WHISPER_MODEL = old;
    }
  });

  it('is skipped by the chain without allowCli, and used with it', async () => {
    const anymark = createAnymark();
    const input = { data: wav(), name: 'a.wav' };

    await expect(anymark.convert(input, { backends: [whisper() as Backend] })).rejects.toThrow(
      /transcription/,
    );
    const ok = await anymark.convert(input, { backends: [whisper() as Backend], allowCli: true });
    expect(ok.markdown).toContain('heard lang=auto');
  });

  it('fails generically: neither the CLI output nor the model path reach the error', async () => {
    process.env.FAKE_WHISPER_MODE = 'fail';
    try {
      const error = await whisper()
        .run(wav(), {})
        .catch((e: unknown) => e);
      const text = `${(error as Error).name} ${(error as Error).message}`;
      expect(text).not.toContain('leaked-secret');
      expect(text).not.toContain(MODEL);
    } finally {
      delete process.env.FAKE_WHISPER_MODE;
    }
  });

  it('keeps the model path and command out of the result', async () => {
    const result = await createAnymark().convert(
      { data: wav(), name: 'a.wav' },
      { backends: [whisper() as Backend], allowCli: true },
    );

    expect(JSON.stringify(result)).not.toContain(MODEL);
    expect(JSON.stringify(result)).not.toContain(FAKE);
  });
});
