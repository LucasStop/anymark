import { describe, expect, it } from 'vitest';
import type { Backend } from '../src/index.js';
import { assertBackendContract, ContractError } from '../src/testing/index.js';

/** A backend that honors every rule; each test breaks exactly one. */
const good = (overrides: Partial<Backend<string, string>> = {}): Backend<string, string> => ({
  name: 'good',
  capability: 'ocr',
  locality: 'local',
  isAvailable: async () => true,
  async run(input, ctx) {
    ctx.signal?.throwIfAborted();
    return `read:${input}`;
  },
  ...overrides,
});

const violation = (backend: Backend<string, string>) =>
  assertBackendContract(backend as Backend, 'sample').then(
    () => undefined,
    (error: unknown) => error,
  );

describe('assertBackendContract', () => {
  it('accepts a backend that honors the contract', async () => {
    await expect(assertBackendContract(good() as Backend, 'sample')).resolves.toBeUndefined();
  });

  it.each([
    ['an empty name', good({ name: '' }), /name/],
    ['an unknown capability', good({ capability: 'video' as never }), /capability/],
    ['an unknown locality', good({ locality: 'cloud' as never }), /locality/],
    [
      'an isAvailable that is not boolean',
      good({ isAvailable: async () => 'yes' as never }),
      /isAvailable/,
    ],
    ['a run that ignores an aborted signal', good({ run: async (input) => input }), /aborted/],
    ['a run that resolves to undefined', good({ run: async () => undefined as never }), /result/],
  ])('rejects %s', async (_name, backend, rule) => {
    const error = await violation(backend);

    expect(error).toBeInstanceOf(ContractError);
    expect((error as Error).message).toMatch(rule);
  });

  it('only checks the static rules for a backend that is unavailable here', async () => {
    const absent = good({
      isAvailable: async () => false,
      run: () => Promise.reject(new Error('x')),
    });

    await expect(assertBackendContract(absent as Backend, 'sample')).resolves.toBeUndefined();
  });

  it('never echoes the sample in the message', async () => {
    const error = await assertBackendContract(
      good({ name: '' }) as Backend,
      'super-secret-sample',
    ).catch((e: Error) => e);

    expect((error as Error).message).not.toContain('super-secret-sample');
  });
});
