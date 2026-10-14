import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createAnymark } from '../src/index.js';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('conversion result', () => {
  it('carries schemaVersion 1 and the sha256 of the content as sourceId', async () => {
    const data = bytes('same content');
    const anymark = createAnymark();

    const first = await anymark.convert({ data, name: 'a.txt' });
    const second = await anymark.convert({ data, name: 'b.txt' });

    expect(first.metadata.schemaVersion).toBe(1);
    expect(first.metadata.sourceId).toBe(createHash('sha256').update(data).digest('hex'));
    expect(second.metadata.sourceId).toBe(first.metadata.sourceId);
  });

  it('gives different content a different sourceId', async () => {
    const anymark = createAnymark();
    const a = await anymark.convert({ data: bytes('one'), name: 'a.txt' });
    const b = await anymark.convert({ data: bytes('two'), name: 'a.txt' });

    expect(a.metadata.sourceId).not.toBe(b.metadata.sourceId);
  });

  it('keeps only the base name, never a directory', async () => {
    const result = await createAnymark().convert({
      data: bytes('x'),
      name: '/Users/someone/secret/notes.txt',
    });

    expect(result.metadata.name).toBe('notes.txt');
    expect(JSON.stringify(result)).not.toContain('someone');
  });

  it('also strips Windows-style directories', async () => {
    const result = await createAnymark().convert({
      data: bytes('x'),
      name: 'C:\\Users\\someone\\notes.txt',
    });

    expect(result.metadata.name).toBe('notes.txt');
  });

  it('rejects when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      createAnymark().convert({ data: bytes('x'), name: 'a.txt' }, { signal: controller.signal }),
    ).rejects.toThrow();
  });
});
