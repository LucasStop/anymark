import { describe, expect, it } from 'vitest';
import { BackendChain, createAnymark, NoBackendError } from '../src/index.js';
import type {
  Backend,
  Capability,
  ConverterContext,
  ConvertOptions,
  Locality,
} from '../src/index.js';

interface Fake extends Backend<string, string> {
  calls: number;
}

const fake = (
  name: string,
  {
    locality = 'local',
    capability = 'ocr',
    available = true,
    run = async (input: string) => `${name}:${input}`,
  }: {
    locality?: Locality;
    capability?: Capability;
    available?: boolean;
    run?: (input: string) => Promise<string>;
  } = {},
): Fake => {
  const backend: Fake = {
    name,
    capability,
    locality,
    calls: 0,
    isAvailable: async () => available,
    run: async (input) => {
      backend.calls += 1;
      return run(input);
    },
  };
  return backend;
};

const chain = (backends: Backend<string, string>[], options: ConvertOptions = {}) =>
  new BackendChain(backends as Backend[], options);

describe('BackendChain', () => {
  it('uses the first backend in the configured order that answers', async () => {
    const first = fake('first');
    const second = fake('second');

    await expect(chain([first, second]).run('ocr', 'x')).resolves.toBe('first:x');
    expect(second.calls).toBe(0);
    await expect(chain([second, first]).run('ocr', 'x')).resolves.toBe('second:x');
  });

  it('skips an unavailable backend without calling it', async () => {
    const down = fake('down', { available: false });
    const up = fake('up');

    await expect(chain([down, up]).run('ocr', 'x')).resolves.toBe('up:x');
    expect(down.calls).toBe(0);
  });

  it('treats a throwing isAvailable as unavailable', async () => {
    const broken: Fake = { ...fake('broken'), isAvailable: () => Promise.reject(new Error('x')) };

    await expect(chain([broken, fake('ok')]).run('ocr', 'x')).resolves.toBe('ok:x');
  });

  it('treats an isAvailable that throws synchronously as unavailable', async () => {
    const broken: Fake = {
      ...fake('broken'),
      isAvailable: () => {
        throw new Error('/Users/someone/key');
      },
    };
    const backends = chain([broken, fake('ok')]);

    await expect(backends.run('ocr', 'x')).resolves.toBe('ok:x');
    expect(backends.warnings).toEqual([]);
  });

  it('skips backends of another capability', async () => {
    const speech = fake('speech', { capability: 'transcription' });
    const ocr = fake('ocr');

    await expect(chain([speech, ocr]).run('ocr', 'x')).resolves.toBe('ocr:x');
    expect(speech.calls).toBe(0);
  });

  describe('opt-in', () => {
    it('never calls a cli backend without allowCli, nor a remote one without allowNetwork', async () => {
      const cli = fake('cli', { locality: 'cli' });
      const remote = fake('remote', { locality: 'remote' });
      const local = fake('local');

      await expect(chain([cli, remote, local]).run('ocr', 'x')).resolves.toBe('local:x');
      expect(cli.calls + remote.calls).toBe(0);
    });

    it('does not let one flag stand in for the other', async () => {
      const cli = fake('cli', { locality: 'cli' });
      const remote = fake('remote', { locality: 'remote' });

      await expect(chain([cli, remote], { allowNetwork: true }).run('ocr', 'x')).resolves.toBe(
        'remote:x',
      );
      expect(cli.calls).toBe(0);

      const otherCli = fake('cli', { locality: 'cli' });
      const otherRemote = fake('remote', { locality: 'remote' });
      await expect(
        chain([otherRemote, otherCli], { allowCli: true }).run('ocr', 'x'),
      ).resolves.toBe('cli:x');
      expect(otherRemote.calls).toBe(0);
    });

    it('does not even ask a backend without opt-in whether it is available', async () => {
      let asked = false;
      const cli: Fake = {
        ...fake('cli', { locality: 'cli' }),
        isAvailable: async () => {
          asked = true;
          return true;
        },
      };

      await expect(chain([cli]).run('ocr', 'x')).rejects.toBeInstanceOf(NoBackendError);
      expect(asked).toBe(false);
    });
  });

  describe('failure', () => {
    const leaky = () =>
      fake('leaky', {
        run: () =>
          Promise.reject(new Error('boom at /Users/someone/doc.pdf with key sk-SECRET-123')),
      });

    it('falls through to the next backend and records a warning', async () => {
      const backends = chain([leaky(), fake('ok')]);

      await expect(backends.run('ocr', 'x')).resolves.toBe('ok:x');
      expect(backends.warnings).toEqual([
        { code: 'BACKEND_FAILED', message: 'Backend leaky failed' },
      ]);
    });

    it('keeps keys and absolute paths out of the warning', async () => {
      const backends = chain([leaky(), fake('ok')]);
      await backends.run('ocr', 'x');

      expect(JSON.stringify(backends.warnings)).not.toMatch(/sk-SECRET|\/Users|doc\.pdf|boom/);
    });

    it('throws NoBackendError naming only the capability when all fail', async () => {
      const backends = chain([leaky(), fake('down', { available: false })]);
      const error = await backends.run('ocr', 'x').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NoBackendError);
      expect(error).toMatchObject({ code: 'NO_BACKEND' });
      expect((error as Error).message).toBe('No backend available for ocr');
      expect(backends.warnings).toHaveLength(1);
    });

    it('throws NoBackendError for an empty chain', async () => {
      await expect(chain([]).run('transcription', 'x')).rejects.toBeInstanceOf(NoBackendError);
    });
  });

  describe('abort', () => {
    it('does not call any backend when the signal is already aborted', async () => {
      const backend = fake('a');
      const run = chain([backend], { signal: AbortSignal.abort() }).run('ocr', 'x');

      await expect(run).rejects.toThrow();
      expect(backend.calls).toBe(0);
    });

    it('stops when the signal aborts while availability is being checked', async () => {
      const controller = new AbortController();
      const slow: Fake = {
        ...fake('slow'),
        isAvailable: async () => {
          controller.abort();
          return false;
        },
      };
      const next = fake('next');

      await expect(
        chain([slow, next], { signal: controller.signal }).run('ocr', 'x'),
      ).rejects.toThrow(/abort/i);
      expect(next.calls).toBe(0);
    });

    it('does not return a result that arrives after the signal aborted', async () => {
      const controller = new AbortController();
      const stubborn = fake('stubborn', {
        run: async (input) => {
          controller.abort();
          return input;
        },
      });

      await expect(
        chain([stubborn], { signal: controller.signal }).run('ocr', 'x'),
      ).rejects.toThrow(/abort/i);
    });

    it('stops instead of falling through when the signal aborts mid-run', async () => {
      const controller = new AbortController();
      const first = fake('first', {
        run: async () => {
          controller.abort();
          throw new Error('aborted');
        },
      });
      const second = fake('second');

      await expect(
        chain([first, second], { signal: controller.signal }).run('ocr', 'x'),
      ).rejects.toThrow();
      expect(second.calls).toBe(0);
    });
  });
});

describe('backends through the facade', () => {
  const entry = {
    name: 'needs-ocr',
    mimes: ['x/needs-ocr'],
    load: async () => ({
      name: 'needs-ocr',
      mimes: ['x/needs-ocr'],
      convert: async (_source: unknown, ctx: ConverterContext) => ({
        markdown: `${await ctx.backends.run<string, string>('ocr', 'page')}\n`,
        metadata: { schemaVersion: 1 as const, sourceId: ctx.sourceId, mime: 'x/needs-ocr' },
        warnings: [],
      }),
    }),
  };
  const input = { data: new Uint8Array([1]), mime: 'x/needs-ocr' };

  it('hands the converter a chain built from options.backends and surfaces its warnings', async () => {
    const anymark = createAnymark();
    anymark.registry.register(entry);
    const failing = fake('failing', { run: () => Promise.reject(new Error('/secret/path')) });

    const result = await anymark.convert(input, {
      backends: [failing, fake('fallback')] as Backend[],
    });

    expect(result.markdown).toBe('fallback:page\n');
    expect(result.warnings).toEqual([
      { code: 'BACKEND_FAILED', message: 'Backend failing failed' },
    ]);
  });

  it('fails with NoBackendError when nothing is configured', async () => {
    const anymark = createAnymark();
    anymark.registry.register(entry);

    await expect(anymark.convert(input)).rejects.toBeInstanceOf(NoBackendError);
  });
});
