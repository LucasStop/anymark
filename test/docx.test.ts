import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DocxConverter } from '../src/converters/DocxConverter.js';
import { ConversionError, createAnymark } from '../src/index.js';
import { assertConverterContract } from '../src/testing/index.js';

const spec = (path: string) => readFileSync(new URL(`../specs/${path}`, import.meta.url));
const docx = () => ({ data: new Uint8Array(spec('docx/simple.docx')), name: 'simple.docx' });

describe('docx converter', () => {
  it('converts heading, paragraph, list and table to the golden Markdown', async () => {
    const result = await createAnymark().convert(docx());

    expect(result.markdown).toBe(spec('docx/simple.md').toString('utf8'));
    expect(result.metadata.mime).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
  });

  it('leaves embedded images out', async () => {
    const { markdown } = await createAnymark().convert(docx());

    expect(markdown).not.toMatch(/!\[|data:image|base64/);
  });

  it('keeps the fixture under 20 KB', () => {
    expect(spec('docx/simple.docx').length).toBeLessThan(20 * 1024);
  });

  it('passes the converter contract', async () => {
    await assertConverterContract(new DocxConverter(), docx());
  });

  it('rejects a corrupted file without echoing its content', async () => {
    const attempt = createAnymark().convert({
      data: new TextEncoder().encode('PK secret-token'),
      name: 'bad.docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    await expect(attempt).rejects.toBeInstanceOf(ConversionError);
    await expect(attempt).rejects.not.toThrow(/secret-token/);
  });
});
