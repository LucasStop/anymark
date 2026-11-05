import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Backend, ProgressEvent } from '../src/index.js';

// Same seam as the OCR limits test: extractImages is replaced so the page count is the spec's.
const extractImages = vi.hoisted(() => vi.fn());
vi.mock('unpdf', async (original) => ({
  ...(await original<typeof import('unpdf')>()),
  extractImages,
}));

const { createAnymark } = await import('../src/index.js');

const spec = (name: string) => ({
  data: new Uint8Array(readFileSync(new URL(`../specs/pdf/${name}`, import.meta.url))),
  name,
});
const image = {
  data: new Uint8ClampedArray(12),
  width: 4,
  height: 1,
  channels: 3 as const,
  key: 'img',
};
const fakeOcr = (): Backend<Uint8Array, string> => ({
  name: 'fake-ocr',
  capability: 'ocr',
  locality: 'local',
  isAvailable: async () => true,
  run: async () => 'text',
});

const ocrEvents = (events: ProgressEvent[]) => events.filter((e) => e.stage === 'ocr');

beforeEach(() => extractImages.mockReset().mockResolvedValue([image]));

describe('per-page progress', () => {
  it('reports each scanned page as it is read, with the total known up front', async () => {
    const events: ProgressEvent[] = [];

    await createAnymark().convert(spec('scanned.pdf'), {
      backends: [fakeOcr() as Backend],
      onProgress: (event) => void events.push(event),
    });

    expect(ocrEvents(events)).toEqual([
      { stage: 'ocr', current: 1, total: 2 },
      { stage: 'ocr', current: 2, total: 2 },
    ]);
  });

  it('delivers the same events to a registered sink, between the convert 0/1 and 1/1 events', async () => {
    const stages: string[] = [];

    await createAnymark()
      .addSink({ onProgress: (e) => void stages.push(`${e.stage}:${e.current}`) })
      .convert(spec('scanned.pdf'), { backends: [fakeOcr() as Backend] });

    expect(stages).toEqual(['convert:0', 'ocr:1', 'ocr:2', 'convert:1']);
  });

  it('reports nothing per page for a pdf that already has a text layer', async () => {
    const events: ProgressEvent[] = [];

    await createAnymark().convert(spec('simple.pdf'), {
      onProgress: (event) => void events.push(event),
    });

    expect(ocrEvents(events)).toEqual([]);
  });

  it('does not let a throwing onProgress stop the conversion', async () => {
    const result = await createAnymark().convert(spec('scanned.pdf'), {
      backends: [fakeOcr() as Backend],
      onProgress: () => {
        throw new Error('boom');
      },
    });

    expect(result.markdown).toContain('text');
    expect(result.warnings.map((w) => w.code)).toContain('SINK_FAILED');
  });
});
