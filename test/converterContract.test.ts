import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CsvConverter } from '../src/converters/CsvConverter.js';
import { TxtConverter } from '../src/converters/TxtConverter.js';
import { assertConverterContract } from '../src/testing/index.js';

const spec = (path: string) =>
  new Uint8Array(readFileSync(new URL(`../specs/${path}`, import.meta.url)));

describe('built-in converters honor the contract kit', () => {
  it('TxtConverter', async () => {
    await assertConverterContract(new TxtConverter(), {
      data: spec('txt/simple.txt'),
      name: 'simple.txt',
    });
  });

  it('CsvConverter', async () => {
    await assertConverterContract(new CsvConverter(), {
      data: spec('csv/simple.csv'),
      name: 'simple.csv',
    });
  });
});

describe('anymark/testing as a package export', () => {
  const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

  it('is exported as a subpath', () => {
    const exports = JSON.parse(read('package.json')).exports;

    expect(exports['./testing'].import).toBe('./dist/testing/index.js');
    expect(exports['./testing'].types).toBe('./dist/testing/index.d.ts');
  });

  it('does not import a test framework', () => {
    expect(read('src/testing/index.ts')).not.toMatch(/vitest|jest|mocha/);
  });
});
