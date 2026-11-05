import { describe, expect, it } from 'vitest';
import { logSink, metricsSink } from '../examples/sinks/index.js';
import { createAnymark } from '../src/index.js';
import type { ConversionResult, ProgressEvent, ResultSink } from '../src/index.js';

const bytes = new TextEncoder().encode('hello');
const input = { data: bytes, name: 'a.txt' };

const recorder = () => {
  const results: ConversionResult[] = [];
  const progress: ProgressEvent[] = [];
  const sink: ResultSink = {
    onResult: (result) => void results.push(result),
    onProgress: (event) => void progress.push(event),
  };
  return { sink, results, progress };
};

describe('Anymark.addSink', () => {
  it('returns the instance and delivers the final result to every sink', async () => {
    const a = recorder();
    const b = recorder();
    const anymark = createAnymark();
    expect(anymark.addSink(a.sink)).toBe(anymark);
    anymark.addSink(b.sink);

    const result = await anymark.convert(input);

    expect(a.results).toEqual([result]);
    expect(b.results).toEqual([result]);
  });

  it('reports convert progress from 0 to 1 before the result', async () => {
    const { sink, progress } = recorder();

    await createAnymark().addSink(sink).convert(input);

    expect(progress).toEqual([
      { stage: 'convert', current: 0, total: 1 },
      { stage: 'convert', current: 1, total: 1 },
    ]);
  });

  it('accepts a sink with only one of the two hooks', async () => {
    const seen: string[] = [];
    const anymark = createAnymark()
      .addSink({ onResult: (r) => void seen.push(r.markdown) })
      .addSink({ onProgress: (e) => void seen.push(e.stage) });

    await anymark.convert(input);

    expect(seen).toEqual(['convert', 'convert', 'hello']);
  });

  it('keeps converting when a sink throws or rejects, tells the others, and warns without leaking', async () => {
    const good = recorder();
    const anymark = createAnymark()
      .addSink({
        onProgress: () => {
          throw new Error('secret /Users/me/key');
        },
        onResult: () => Promise.reject(new Error('secret /Users/me/key')),
      })
      .addSink(good.sink);

    const result = await anymark.convert(input);

    expect(result.markdown).toBe('hello');
    expect(good.results).toHaveLength(1);
    expect(good.progress).toHaveLength(2);
    const failures = result.warnings.filter((w) => w.code === 'SINK_FAILED');
    expect(failures.length).toBeGreaterThan(0);
    expect(JSON.stringify(failures)).not.toContain('secret');
  });

  it('does not call a sink on a failed conversion', async () => {
    const { sink, results } = recorder();

    await expect(
      createAnymark()
        .addSink(sink)
        .convert({ data: new Uint8Array([0, 1, 2, 255]) }),
    ).rejects.toThrow();

    expect(results).toEqual([]);
  });

  it('keeps sinks per instance', async () => {
    const { sink, results } = recorder();
    createAnymark().addSink(sink);

    await createAnymark().convert(input);

    expect(results).toEqual([]);
  });
});

describe('example sinks', () => {
  it('logSink writes one line with the base name and size, never the content', async () => {
    const lines: string[] = [];

    await createAnymark()
      .addSink(logSink((line) => lines.push(line)))
      .convert({ data: bytes, name: '/tmp/x/a.txt' });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('a.txt');
    expect(lines[0]).not.toContain('/tmp');
    expect(lines[0]).not.toContain('hello');
  });

  it('metricsSink counts conversions, warnings and characters', async () => {
    const metrics = metricsSink();
    const anymark = createAnymark().addSink(metrics);

    await anymark.convert(input);
    await anymark.convert(input);

    expect(metrics.snapshot()).toEqual({ conversions: 2, warnings: 0, characters: 10 });
  });
});
