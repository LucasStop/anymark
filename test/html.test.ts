import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ConversionError, createAnymark } from '../src/index.js';
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

  it('drops text a reader never sees, which could carry hidden instructions', async () => {
    const { markdown } = await createAnymark().convert(
      html(
        '<p>shown</p><p hidden>H1</p><p aria-hidden="true">H2</p><p style="display: none">H3</p><p style="visibility:hidden">H4</p><textarea>H5</textarea><object>H6</object><iframe>H7</iframe>',
      ),
    );

    expect(markdown).toBe('shown\n');
  });

  it('keeps the text of a link but not a javascript: or data: target', async () => {
    const { markdown } = await createAnymark().convert(
      html(
        '<a href="javascript:alert(1)">one</a> <a href=" JavaScript:x">two</a> <a href="data:text/html,x">three</a><img src="data:image/png;base64,AAAA" alt="pic"> <a href="https://ok.example/">ok</a>',
      ),
    );

    expect(markdown).toBe('one two three [ok](https://ok.example/)\n');
  });

  it('fails with a ConversionError, not a stack overflow, on absurd nesting', async () => {
    const deep = `${'<div>'.repeat(5000)}x${'</div>'.repeat(5000)}`;

    await expect(createAnymark().convert(html(deep))).rejects.toBeInstanceOf(ConversionError);
  });

  it('refuses an input past 25 MB with a generic ConversionError', async () => {
    const big = { data: new Uint8Array(25 * 1024 * 1024 + 1).fill(97), name: 'big.html' };

    const error = await createAnymark()
      .convert(big)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConversionError);
    expect((error as Error).message).toBe('Could not convert html content');
  });

  it('still converts an input of exactly 25 MB', async () => {
    const edge = { data: new Uint8Array(25 * 1024 * 1024).fill(97), name: 'edge.html' };

    const { markdown } = await createAnymark().convert(edge);

    expect(markdown.startsWith('aaaa')).toBe(true);
  });

  it('returns empty Markdown for an empty document', async () => {
    const { markdown } = await createAnymark().convert(html(''));

    expect(markdown).toBe('');
  });

  it('passes the converter contract', async () => {
    await assertConverterContract(new HtmlConverter(), html('<h1>a</h1>'));
  });

  it('keeps a line break inside a table cell on one Markdown row', async () => {
    const html = '<table><tr><th>A</th></tr><tr><td>um<br>dois</td></tr></table>';

    const { markdown } = await createAnymark().convert({
      data: new TextEncoder().encode(html),
      name: 'cell.html',
    });

    expect(markdown).toBe(['| A |', '| --- |', '| um<br>dois |', ''].join('\n'));
  });

  it('keeps a break nested in a cell (inside bold) on one row', async () => {
    const html = '<table><tr><th>A</th></tr><tr><td><b>um<br>dois</b></td></tr></table>';

    const { markdown } = await createAnymark().convert({
      data: new TextEncoder().encode(html),
      name: 'bold.html',
    });

    expect(markdown).toContain('| **um<br>dois** |');
  });

  it('does not turn a break inside a code span into a literal <br> the reader sees', async () => {
    const html = '<table><tr><th>A</th></tr><tr><td><code>a<br>b</code></td></tr></table>';

    const { markdown } = await createAnymark().convert({
      data: new TextEncoder().encode(html),
      name: 'code.html',
    });

    expect(markdown).not.toContain('<br>');
  });
});
