import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PptxConverter } from '../src/converters/PptxConverter.js';
import { ConversionError, createAnymark } from '../src/index.js';
import { assertConverterContract } from '../src/testing/index.js';

const spec = (path: string) => readFileSync(new URL(`../specs/${path}`, import.meta.url));
const pptx = () => ({ data: new Uint8Array(spec('pptx/simple.pptx')), name: 'simple.pptx' });

describe('pptx converter', () => {
  it('writes slides in presentation order, with tables and speaker notes', async () => {
    const result = await createAnymark().convert(pptx());

    expect(result.markdown).toBe(spec('pptx/simple.md').toString('utf8'));
    expect(result.metadata.mime).toBe(
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    );
  });

  it('leaves the slide number and the slide image out of the notes', async () => {
    const { markdown } = await createAnymark().convert(pptx());

    expect(markdown.endsWith('Say hello.\n')).toBe(true);
  });

  it('passes the converter contract', async () => {
    await assertConverterContract(new PptxConverter(), pptx());
  });

  it('rejects a corrupted file without echoing its content', async () => {
    const attempt = createAnymark().convert({
      data: new TextEncoder().encode('PK secret-token'),
      name: 'bad.pptx',
      mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });

    await expect(attempt).rejects.toBeInstanceOf(ConversionError);
    await expect(attempt).rejects.not.toThrow(/secret-token/);
  });
});
