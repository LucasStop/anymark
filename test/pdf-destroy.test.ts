import { describe, expect, it, vi } from 'vitest';

const destroy = vi.fn(async () => {});
vi.mock('unpdf', () => ({
  getDocumentProxy: async () => ({ destroy }),
  extractText: () => Promise.reject(new Error('boom')),
}));

describe('pdf converter, document lifetime', () => {
  it('destroys the parsed document even when extraction fails', async () => {
    const { PdfConverter } = await import('../src/converters/PdfConverter.js');
    await new PdfConverter()
      .convert(
        { data: new Uint8Array([1]), name: 'p.pdf' },
        { sourceId: 'x', options: {}, backends: { run: () => Promise.reject(new Error('n/a')) } },
      )
      .catch(() => {});

    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
