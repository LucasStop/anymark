import { describe, expect, it } from 'vitest';
import { UnsupportedFormatError, createAnymark } from '../src/index.js';

// OLE2 compound file signature shared by .doc, .ppt and .xls.
const ole2 = (tail = 64) => {
  const data = new Uint8Array(8 + tail).fill(0x41);
  data.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  return data;
};

describe('legacy Office formats', () => {
  it.each(['a.doc', 'a.ppt', 'a.xls'])(
    'rejects %s as unsupported, not as binary text',
    async (name) => {
      const error = await createAnymark()
        .convert({ data: ole2(), name })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(UnsupportedFormatError);
    },
  );

  it('rejects an OLE2 file even without a useful name', async () => {
    const error = await createAnymark()
      .convert({ data: ole2() })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UnsupportedFormatError);
  });
});
