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

describe('pptx alternate content and hidden slides', () => {
  const MC = 'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"';
  const shape = (text: string) =>
    `<p:sp><p:nvSpPr><p:cNvPr id="9" name="s"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;
  const alternate = (choice: string, fallback: string) =>
    `<mc:AlternateContent ${MC}><mc:Choice Requires="p14">${choice}</mc:Choice><mc:Fallback>${fallback}</mc:Fallback></mc:AlternateContent>`;
  const addToSlide = (content: string) =>
    withPart('ppt/slides/slide2.xml', (xml) => xml.replace('</p:spTree>', `${content}</p:spTree>`));

  it('reads the text of an AlternateContent once, not twice', async () => {
    const { markdown } = await convert(addToSlide(alternate(shape('MODERN'), shape('MODERN'))));

    expect(markdown.match(/MODERN/g)).toHaveLength(1);
  });

  it('reads the Fallback when the Choice holds nothing readable', async () => {
    const { markdown } = await convert(addToSlide(alternate('', shape('OLDER'))));

    expect(markdown).toContain('OLDER');
  });

  it('prefers the Choice when both have text', async () => {
    const { markdown } = await convert(addToSlide(alternate(shape('NEW'), shape('OLD'))));

    expect(markdown).toContain('NEW');
    expect(markdown).not.toContain('OLD');
  });

  const hidden = () =>
    withPart('ppt/slides/slide2.xml', (xml) => xml.replace('<p:sld ', '<p:sld show="0" '));

  it('skips a hidden slide by default, keeps the numbering and says how many', async () => {
    const result = await convert(hidden());

    expect(result.markdown).not.toMatch(/Welcome|First point/);
    expect(result.markdown).toContain('## Slide 2');
    expect(result.warnings).toEqual([
      { code: 'HIDDEN_SLIDES_SKIPPED', message: '1 hidden slide skipped' },
    ]);
  });

  it('includes a hidden slide, without a warning, with includeHidden', async () => {
    const result = await createAnymark().convert(
      { data: hidden(), name: 'x.pptx' },
      { includeHidden: true },
    );

    expect(result.markdown).toContain('## Welcome');
    expect(result.warnings).toEqual([]);
  });

  it('treats show="1" and no attribute as visible', async () => {
    const shown = withPart('ppt/slides/slide2.xml', (xml) =>
      xml.replace('<p:sld ', '<p:sld show="1" '),
    );

    expect((await convert(shown)).warnings).toEqual([]);
  });

  it.each(['false', 'False', ' 0 '])('hides a slide written with show="%s"', async (value) => {
    const data = withPart('ppt/slides/slide2.xml', (xml) =>
      xml.replace('<p:sld ', `<p:sld show="${value}" `),
    );

    expect((await convert(data)).warnings.map((w) => w.code)).toEqual(['HIDDEN_SLIDES_SKIPPED']);
  });

  it('counts every hidden slide', async () => {
    const files = unzipSync(hidden());
    files['ppt/slides/slide1.xml'] = strToU8(
      strFromU8(files['ppt/slides/slide1.xml'] as Uint8Array).replace(
        '<p:sld ',
        '<p:sld show="0" ',
      ),
    );

    expect((await convert(zipSync(files))).warnings).toEqual([
      { code: 'HIDDEN_SLIDES_SKIPPED', message: '2 hidden slides skipped' },
    ]);
  });

  it('reads an AlternateContent inside a group once', async () => {
    const group = `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="8" name="g"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${alternate(shape('GROUPED'), shape('GROUPED'))}</p:grpSp>`;

    expect((await convert(addToSlide(group))).markdown.match(/GROUPED/g)).toHaveLength(1);
  });
});
