import { describe, expect, it, vi } from 'vitest';

// No encrypted fixture can be generated without a PDF writer, so the library's own
// password failure is simulated; the converter must map it like any other failure.
vi.mock('unpdf', () => ({
  getDocumentProxy: () =>
    Promise.reject(Object.assign(new Error('secret-token'), { name: 'PasswordException' })),
  extractText: () => Promise.reject(new Error('unreachable')),
}));

describe('pdf converter, protected file', () => {
  it('throws ConversionError without echoing the library message', async () => {
    const { PdfConverter } = await import('../src/converters/PdfConverter.js');
    const { ConversionError } = await import('../src/index.js');
    const attempt = new PdfConverter().convert(
      { data: new Uint8Array([1]), name: 'p.pdf' },
      { sourceId: 'x', options: {}, backends: { run: () => Promise.reject(new Error('n/a')) } },
    );

    await expect(attempt).rejects.toBeInstanceOf(ConversionError);
    await expect(attempt).rejects.not.toThrow(/secret-token/);
  });
});
