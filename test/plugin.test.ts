import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { srtPlugin } from '../examples/plugins/srt/index.js';
import { createAnymark } from '../src/index.js';
import type { Converter, ConverterEntry, Plugin } from '../src/index.js';
import { assertConverterContract } from '../src/testing/index.js';

const spec = (path: string) => readFileSync(new URL(`../specs/${path}`, import.meta.url));

/** A converter that answers with its own label, so tests can tell who handled a mime. */
const labelled = (label: string, mime: string, onLoad: () => void = () => {}): ConverterEntry => ({
  name: label,
  mimes: [mime],
  extensions: ['.lbl'],
  load: async () => {
    onLoad();
    const converter: Converter = {
      name: label,
      mimes: [mime],
      convert: async (_source, ctx) => ({
        markdown: `${label}\n`,
        metadata: { schemaVersion: 1, sourceId: ctx.sourceId, mime },
        warnings: [],
      }),
    };
    return converter;
  },
});

const pluginOf = (...entries: ConverterEntry[]): Plugin => ({
  name: 'test-plugin',
  install: (host) => entries.forEach((entry) => host.register(entry)),
});

describe('use(plugin)', () => {
  it('installs the plugin and returns the instance for chaining', () => {
    const anymark = createAnymark();

    expect(anymark.use(pluginOf())).toBe(anymark);
  });

  it('keeps a plugin to the instance that installed it', async () => {
    const a = createAnymark().use(pluginOf(labelled('a', 'x/a')));
    const b = createAnymark();
    const file = { data: new Uint8Array([1]), name: 'f.lbl' };

    expect((await a.convert(file)).markdown).toBe('a\n');
    await expect(b.convert(file)).rejects.toThrow('Unsupported format');
  });
});

describe('the .srt example plugin', () => {
  it('converts a subtitle file to the golden Markdown, with no change to src/', async () => {
    const result = await createAnymark()
      .use(srtPlugin)
      .convert({ data: new Uint8Array(spec('srt/simple.srt')), name: 'simple.srt' });

    expect(result.markdown).toBe(spec('srt/simple.md').toString('utf8'));
    expect(result.metadata.mime).toBe('application/x-subrip');
  });

  it('passes the converter contract', async () => {
    let entry: ConverterEntry | undefined;
    srtPlugin.install({ register: (e) => (entry = e) });
    const converter = await entry?.load();

    expect(converter).toBeDefined();
    await assertConverterContract(converter as Converter, {
      data: new Uint8Array(spec('srt/simple.srt')),
      name: 'simple.srt',
    });
  });

  it('turns a malformed file into an empty document instead of throwing', async () => {
    const result = await createAnymark()
      .use(srtPlugin)
      .convert({ data: new TextEncoder().encode('not a subtitle file'), name: 'x.srt' });

    expect(result.markdown).toBe('');
  });
});

describe('lazy load()', () => {
  const file = { data: new Uint8Array([1]), name: 'f.lbl' };

  it('does not run until the first conversion of that format', () => {
    let loads = 0;
    createAnymark().use(pluginOf(labelled('a', 'x/a', () => (loads += 1))));

    expect(loads).toBe(0);
  });

  it('runs once, however many conversions follow, even concurrent ones', async () => {
    let loads = 0;
    const anymark = createAnymark().use(pluginOf(labelled('a', 'x/a', () => (loads += 1))));

    await Promise.all([anymark.convert(file), anymark.convert(file)]);
    await anymark.convert(file);

    expect(loads).toBe(1);
  });

  it('never loads a plugin for a format that is not converted', async () => {
    let loads = 0;
    const anymark = createAnymark().use(pluginOf(labelled('a', 'x/a', () => (loads += 1))));

    await anymark.convert({ data: new TextEncoder().encode('plain'), name: 'n.txt' });

    expect(loads).toBe(0);
  });
});

describe('two plugins claiming the same mime', () => {
  const file = { data: new Uint8Array([1]), mime: 'x/shared' };

  it('lets the one installed last win, so a plugin can replace a built-in', async () => {
    const anymark = createAnymark()
      .use(pluginOf(labelled('first', 'x/shared')))
      .use(pluginOf(labelled('second', 'x/shared')));

    expect((await anymark.convert(file)).markdown).toBe('second\n');
  });

  it('replaces a built-in mime the same way', async () => {
    const anymark = createAnymark().use(pluginOf(labelled('custom', 'text/plain')));

    const result = await anymark.convert({ data: new TextEncoder().encode('hi'), name: 'a.txt' });

    expect(result.markdown).toBe('custom\n');
  });

  it('does not touch the mimes the loser registered besides the shared one', async () => {
    const both: ConverterEntry = { ...labelled('wide', 'x/shared'), mimes: ['x/shared', 'x/own'] };
    const anymark = createAnymark()
      .use(pluginOf(both))
      .use(pluginOf(labelled('narrow', 'x/shared')));

    expect((await anymark.convert(file)).markdown).toBe('narrow\n');
    expect((await anymark.convert({ ...file, mime: 'x/own' })).markdown).toBe('wide\n');
  });
});
