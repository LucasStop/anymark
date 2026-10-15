import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAnymark } from '../src/index.js';
import { assertConverterContract } from '../src/testing/index.js';
import { HtmlConverter } from '../src/converters/HtmlConverter.js';

const html = (value: string) => ({ data: new TextEncoder().encode(value), name: 'a.html' });

describe('html converter', () => {
  it('converts title, list, table and link to GFM', async () => {
    const result = await createAnymark().convert({
      data: new Uint8Array(readFileSync(new URL('../specs/html/simple.html', import.meta.url))),
      name: 'simple.html',
    });

    expect(result.markdown).toBe(
      [
        '# Título',
        '',
        'Texto com **negrito** e um [link](https://example.com/a).',
        '',
        '- um',
        '- dois',
        '',
        '| Nome | Idade |',
        '| --- | --- |',
        '| Ana | 30 |',
        '| Bruno | 28 |',
        '',
      ].join('\n'),
    );
    expect(result.metadata.mime).toBe('text/html');
  });

  it('keeps script, style and head out of the output', async () => {
    const { markdown } = await createAnymark().convert(
      html(
        '<html><head><title>T</title><style>p{}</style></head><body><p>ok</p><script>evil()</script><noscript>nojs</noscript><style>.a{}</style></body></html>',
      ),
    );

    expect(markdown).toBe('ok\n');
  });

  it('does not run or fetch anything from the document', async () => {
    const { markdown } = await createAnymark().convert(
      html('<p onclick="x()">a</p><iframe src="http://t/x"></iframe><img src="http://t/p.png">'),
    );

    expect(markdown).not.toMatch(/onclick|iframe|<script/);
  });

  it('returns empty Markdown for an empty document', async () => {
    const { markdown } = await createAnymark().convert(html(''));

    expect(markdown).toBe('');
  });

  it('passes the converter contract', async () => {
    await assertConverterContract(new HtmlConverter(), html('<h1>a</h1>'));
  });
});
