import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  Backend,
  ConversionResult,
  ConvertOptions,
  Converter,
  ConverterContext,
  ConverterEntry,
  Input,
  Metadata,
  Plugin,
  PluginHost,
  Source,
} from '../src/index.js';

const bytes = new Uint8Array([104, 105]);

describe('core contracts', () => {
  it('metadata is versioned and never carries a path', () => {
    expectTypeOf<Metadata['schemaVersion']>().toEqualTypeOf<1>();
    expectTypeOf<Metadata['sourceId']>().toEqualTypeOf<string>();
    expectTypeOf<
      Extract<keyof Metadata, 'path' | 'absolutePath' | 'filePath' | 'dir'>
    >().toEqualTypeOf<never>();
  });

  it('accepts raw bytes or a source with hints as input', () => {
    const raw: Input = bytes;
    const hinted: Input = { data: bytes, name: 'a.txt', mime: 'text/plain' };
    expectTypeOf(raw).toMatchTypeOf<Input>();
    expectTypeOf(hinted).toMatchTypeOf<Input>();
    expectTypeOf<Source['data']>().toEqualTypeOf<Uint8Array>();
  });

  it('options opt out of CLI and network unless asked', () => {
    const none: ConvertOptions = {};
    const allowed: ConvertOptions = {
      signal: new AbortController().signal,
      allowCli: true,
      allowNetwork: true,
      lang: 'pt',
    };
    expect(none.allowCli).toBeUndefined();
    expect(allowed.allowNetwork).toBe(true);
  });

  it('a converter returns a complete result from a source and a context', async () => {
    const converter: Converter = {
      name: 'fake',
      mimes: ['text/plain'],
      async convert(source: Source, ctx: ConverterContext): Promise<ConversionResult> {
        return {
          markdown: new TextDecoder().decode(source.data),
          metadata: { schemaVersion: 1, sourceId: ctx.sourceId, mime: 'text/plain' },
          warnings: [],
        };
      },
    };
    const ctx = { sourceId: 'abc', options: {} } as ConverterContext;
    const result = await converter.convert({ data: bytes }, ctx);
    expect(result.markdown).toBe('hi');
    expect(result.metadata.sourceId).toBe('abc');
  });

  it('a plugin registers lazy converter entries through the host', async () => {
    let loaded = 0;
    const entry: ConverterEntry = {
      name: 'srt',
      mimes: ['application/x-subrip'],
      extensions: ['.srt'],
      async load() {
        loaded += 1;
        return {
          name: 'srt',
          mimes: ['application/x-subrip'],
          convert: async () => {
            throw new Error('not used');
          },
        };
      },
    };
    const entries: ConverterEntry[] = [];
    const host: PluginHost = { register: (e) => entries.push(e) };
    const plugin: Plugin = { name: 'srt', install: (h) => h.register(entry) };

    plugin.install(host);

    expect(entries).toEqual([entry]);
    expect(loaded).toBe(0);
    await entries[0]?.load();
    expect(loaded).toBe(1);
  });

  it('a backend with concrete types fits the generic option slot', () => {
    const backend: Backend<Uint8Array, string> = {
      name: 'fake-ocr',
      capability: 'ocr',
      locality: 'local',
      isAvailable: async () => true,
      run: async () => 'text',
    };
    const options: ConvertOptions = { backends: [backend] };
    expect(options.backends).toHaveLength(1);
    expectTypeOf<Backend['locality']>().toEqualTypeOf<'local' | 'cli' | 'remote'>();
  });
});
