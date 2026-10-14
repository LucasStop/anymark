import { describe, expect, it } from 'vitest';
import type { ConversionResult, Converter } from '../src/index.js';
import { assertConverterContract, ContractError } from '../src/testing/index.js';

const sample = { data: new TextEncoder().encode('hello'), name: 'a.txt' };

const result = (overrides: Partial<ConversionResult['metadata']> = {}, sourceId = 'x') =>
  ({
    markdown: 'hello\n',
    metadata: { schemaVersion: 1, sourceId, mime: 'text/plain', ...overrides },
    warnings: [],
  }) as ConversionResult;

/** A converter that honors every rule; each test breaks exactly one. */
const good = (overrides: Partial<Converter> = {}): Converter => ({
  name: 'good',
  mimes: ['text/plain'],
  async convert(_source, ctx) {
    ctx.options.signal?.throwIfAborted();
    return result({}, ctx.sourceId);
  },
  ...overrides,
});

const violation = (converter: Converter) =>
  assertConverterContract(converter, sample).then(
    () => undefined,
    (error: unknown) => error,
  );

describe('assertConverterContract', () => {
  it('accepts a converter that honors the contract', async () => {
    await expect(assertConverterContract(good(), sample)).resolves.toBeUndefined();
  });

  it.each([
    ['an empty name', good({ name: '' }), /name/],
    ['no mimes', good({ mimes: [] }), /mimes/],
    ['a malformed mime', good({ mimes: ['text'] }), /mime/],
    [
      'a schemaVersion other than 1',
      good({
        convert: async (_s, ctx) => ({
          ...result({}, ctx.sourceId),
          metadata: { ...result({}, ctx.sourceId).metadata, schemaVersion: 2 as never },
        }),
      }),
      /schemaVersion/,
    ],
    [
      'a sourceId that is not the context one',
      good({ convert: async () => result({}, 'spoofed') }),
      /sourceId/,
    ],
    [
      'a path in metadata.name',
      good({ convert: async (_s, ctx) => result({ name: '/tmp/a.txt' }, ctx.sourceId) }),
      /name/,
    ],
    [
      'ignoring an aborted signal',
      good({ convert: async (_s, ctx) => result({}, ctx.sourceId) }),
      /signal/,
    ],
    [
      'non-deterministic output',
      (() => {
        let calls = 0;
        return good({
          convert: async (_s, ctx) => ({
            ...result({}, ctx.sourceId),
            markdown: `call ${(calls += 1)}\n`,
          }),
        });
      })(),
      /deterministic/,
    ],
  ])('rejects %s', async (_label, converter, rule) => {
    const error = await violation(converter);

    expect(error).toBeInstanceOf(ContractError);
    expect((error as Error).message).toMatch(rule);
  });

  it('does not put the sample content in the message', async () => {
    const error = await violation(good({ name: '' }));

    expect((error as Error).message).not.toContain('hello');
  });
});
