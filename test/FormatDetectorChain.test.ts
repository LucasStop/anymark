import { describe, expect, it } from 'vitest';
import {
  createAnymark,
  ExtensionHandler,
  FormatDetectorChain,
  HintHandler,
  PlainTextHandler,
  SignatureHandler,
  StructuredTextHandler,
  ZipHandler,
} from '../src/index.js';
import type { FormatHandler } from '../src/index.js';
import { zip } from './helpers/zip.js';

const text = (value: string) => ({ data: new TextEncoder().encode(value) });
const bytes = (...values: number[]) => ({ data: new Uint8Array(values) });
const ascii = (value: string) => [...value].map((char) => char.charCodeAt(0));
const PASSED = 'passed-on';
const pass = () => PASSED;

describe('FormatDetectorChain', () => {
  const spy = (calls: string[], label: string, mime?: string): FormatHandler => ({
    handle(_input, next) {
      calls.push(label);
      return mime ?? next();
    },
  });

  it('stops at the first handler that answers and never calls the rest', () => {
    const calls: string[] = [];
    const chain = new FormatDetectorChain([
      spy(calls, 'a'),
      spy(calls, 'b', 'x/b'),
      spy(calls, 'c', 'x/c'),
    ]);

    expect(chain.detect(text(''))).toBe('x/b');
    expect(calls).toEqual(['a', 'b']);
  });

  it('answers undefined when every handler passes, or when it is empty', () => {
    expect(new FormatDetectorChain([spy([], 'a'), spy([], 'b')]).detect(text(''))).toBeUndefined();
    expect(new FormatDetectorChain([]).detect(text(''))).toBeUndefined();
  });

  it('adding a handler does not change what the others answer', () => {
    const base = [spy([], 'a', 'x/a')];
    const before = new FormatDetectorChain(base).detect(text(''));
    const after = new FormatDetectorChain([spy([], 'new'), ...base]).detect(text(''));

    expect(after).toBe(before);
  });
});

describe('HintHandler', () => {
  it('trusts an explicit mime from the caller', () => {
    expect(new HintHandler().handle({ ...text('%PDF-'), mime: 'text/csv' }, pass)).toBe('text/csv');
  });

  it('passes when there is no hint', () => {
    expect(new HintHandler().handle(text(''), pass)).toBe(PASSED);
  });
});

describe('SignatureHandler', () => {
  it.each([
    ['pdf', ascii('%PDF-1.7'), 'application/pdf'],
    ['png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'image/png'],
    ['jpeg', [0xff, 0xd8, 0xff, 0xe0], 'image/jpeg'],
    ['gif', ascii('GIF89a'), 'image/gif'],
    ['webp', [...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP')], 'image/webp'],
  ])('recognizes %s by its bytes', (_name, signature, mime) => {
    expect(new SignatureHandler().handle(bytes(...signature), pass)).toBe(mime);
  });

  it('wins over a misleading extension', () => {
    const input = { ...bytes(...ascii('%PDF-1.4')), name: 'report.docx' };

    expect(new SignatureHandler().handle(input, pass)).toBe('application/pdf');
  });

  it('passes on bytes it does not know, and on empty input', () => {
    expect(new SignatureHandler().handle(text('just text'), pass)).toBe(PASSED);
    expect(new SignatureHandler().handle(bytes(), pass)).toBe(PASSED);
  });

  it('does not take RIFF without WEBP for an image', () => {
    const wave = bytes(...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WAVE'));

    expect(new SignatureHandler().handle(wave, pass)).toBe(PASSED);
  });
});

describe('ZipHandler', () => {
  const OOXML = 'application/vnd.openxmlformats-officedocument';

  it.each([
    ['docx', ['[Content_Types].xml', 'word/document.xml'], `${OOXML}.wordprocessingml.document`],
    [
      'pptx',
      ['[Content_Types].xml', 'ppt/presentation.xml'],
      `${OOXML}.presentationml.presentation`,
    ],
    ['xlsx', ['[Content_Types].xml', 'xl/workbook.xml'], `${OOXML}.spreadsheetml.sheet`],
  ])('tells %s apart by its entries', (_name, entries, mime) => {
    expect(new ZipHandler().handle({ data: zip(entries) }, pass)).toBe(mime);
  });

  it('calls any other ZIP a zip', () => {
    expect(new ZipHandler().handle({ data: zip(['a.txt', 'b.txt']) }, pass)).toBe(
      'application/zip',
    );
  });

  it('survives a ZIP header with a broken directory', () => {
    const broken = bytes(0x50, 0x4b, 0x03, 0x04, 1, 2, 3);

    expect(new ZipHandler().handle(broken, pass)).toBe('application/zip');
  });

  it('passes on anything that is not a ZIP', () => {
    expect(new ZipHandler().handle(text('PK but not really'), pass)).toBe(PASSED);
  });
});

describe('ExtensionHandler', () => {
  const lookup = (extension: string) => (extension === '.csv' ? 'text/csv' : undefined);

  it('maps a known extension, ignoring case', () => {
    expect(new ExtensionHandler(lookup).handle({ ...text(''), name: 'DATA.CSV' }, pass)).toBe(
      'text/csv',
    );
  });

  it('passes on an unknown extension and when there is no name', () => {
    expect(new ExtensionHandler(lookup).handle({ ...text(''), name: 'a.xyz' }, pass)).toBe(PASSED);
    expect(new ExtensionHandler(lookup).handle(text(''), pass)).toBe(PASSED);
  });
});

describe('StructuredTextHandler', () => {
  it.each([
    ['an html doctype', '<!DOCTYPE html><html></html>', 'text/html'],
    ['an html tag after whitespace and a BOM', '﻿  \n<html lang="pt">', 'text/html'],
    ['an xml declaration', '<?xml version="1.0"?><a/>', 'application/xml'],
    ['a json object', '{"a": [1, 2]}', 'application/json'],
    ['a json array', ' [1, 2, 3] ', 'application/json'],
  ])('recognizes %s', (_name, content, mime) => {
    expect(new StructuredTextHandler().handle(text(content), pass)).toBe(mime);
  });

  it('passes on text that only looks like json', () => {
    expect(new StructuredTextHandler().handle(text('{oops'), pass)).toBe(PASSED);
    expect(new StructuredTextHandler().handle(text('[not json'), pass)).toBe(PASSED);
  });

  it('passes on plain prose and on binary', () => {
    expect(new StructuredTextHandler().handle(text('hello'), pass)).toBe(PASSED);
    expect(new StructuredTextHandler().handle(bytes(0, 1, 2, 3), pass)).toBe(PASSED);
  });
});

describe('PlainTextHandler', () => {
  it('takes UTF-8 text, including accents and a cut multibyte tail', () => {
    expect(new PlainTextHandler().handle(text('Olá, mundo'), pass)).toBe('text/plain');
    const cut = new TextEncoder().encode('é'.repeat(3000)).subarray(0, 4095);

    expect(new PlainTextHandler().handle({ data: cut }, pass)).toBe('text/plain');
  });

  it.each([
    ['a NUL byte', bytes(104, 0, 105)],
    ['control bytes', bytes(1)],
    ['invalid UTF-8', bytes(0xff, 0xfe, 0xfd)],
  ])('passes on %s', (_name, input) => {
    expect(new PlainTextHandler().handle(input, pass)).toBe(PASSED);
  });
});

describe('default detection in createAnymark', () => {
  it('reads a text file with no extension as plain text', async () => {
    const result = await createAnymark().convert({ ...text('no name hint\n'), name: 'notes' });

    expect(result.metadata.mime).toBe('text/plain');
  });

  it('prefers a registered extension over the plain-text fallback', async () => {
    const result = await createAnymark().convert({ ...text('a,b\n1,2\n'), name: 'data.csv' });

    expect(result.metadata.mime).toBe('text/csv');
  });

  it('lets content beat the extension for a renamed binary', async () => {
    const renamed = { ...bytes(...ascii('%PDF-1.4')), name: 'notes.txt' };

    // Reached the pdf converter (which rejects these bytes), not the txt one the name asks for.
    await expect(createAnymark().convert(renamed)).rejects.toThrow('Could not convert pdf content');
  });
});
