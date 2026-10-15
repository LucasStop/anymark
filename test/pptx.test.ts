import { readFileSync } from 'node:fs';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
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

/** The fixture with one part rewritten by the caller. */
const withPart = (part: string, edit: (xml: string) => string) => {
  const files = unzipSync(new Uint8Array(spec('pptx/simple.pptx')));
  files[part] = strToU8(edit(strFromU8(files[part] as Uint8Array)));
  return zipSync(files);
};
const convert = (data: Uint8Array) => createAnymark().convert({ data, name: 'x.pptx' });

describe('pptx converter on real-world quirks', () => {
  it('keeps text that looks like a number exactly as written', async () => {
    const data = withPart('ppt/slides/slide2.xml', (xml) =>
      xml.replace('First point', '007').replace('Second point', '1.50'),
    );
    const { markdown } = await convert(data);

    expect(markdown).toContain('007\n\n1.50\n');
  });

  it('follows an absolute relationship target', async () => {
    const data = withPart('ppt/_rels/presentation.xml.rels', (xml) =>
      xml.replace('slides/slide2.xml', '/ppt/slides/slide2.xml'),
    );
    const { markdown } = await convert(data);

    expect(markdown.startsWith('## Welcome\n')).toBe(true);
  });

  it('keeps every line of a multi-line title', async () => {
    const data = withPart('ppt/slides/slide2.xml', (xml) =>
      xml.replace(
        '<a:t>Welcome</a:t></a:r></a:p>',
        '<a:t>Welcome</a:t></a:r></a:p><a:p><a:r><a:t>to the talk</a:t></a:r></a:p>',
      ),
    );
    const { markdown } = await convert(data);

    expect(markdown.startsWith('## Welcome to the talk\n')).toBe(true);
  });
});
