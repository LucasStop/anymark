import { createHash } from 'node:crypto';
import type { BackendRunner, ConversionResult, Converter, Source } from '../core/types.js';

/** A broken rule. The message names the rule, never the sample content. */
export class ContractError extends Error {
  constructor(converter: string, rule: string) {
    super(`Converter contract violated (${converter || '<unnamed>'}): ${rule}`);
    this.name = 'ContractError';
  }
}

const noBackends: BackendRunner = {
  run: () => Promise.reject(new Error('No backend in the contract kit')),
};

const MIME = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i;

const contextFor = (source: Source, signal?: AbortSignal) => ({
  sourceId: createHash('sha256').update(source.data).digest('hex'),
  options: signal === undefined ? {} : { signal },
  backends: noBackends,
});

/**
 * Throws a `ContractError` on the first rule a converter breaks. Pass a small
 * sample the converter can read. No test framework needed: any runner works.
 */
export async function assertConverterContract(converter: Converter, sample: Source): Promise<void> {
  const fail = (rule: string): never => {
    throw new ContractError(converter.name, rule);
  };

  if (typeof converter.name !== 'string' || converter.name.length === 0) {
    fail('name must be a non-empty string');
  }
  if (!Array.isArray(converter.mimes) || converter.mimes.length === 0) {
    fail('mimes must list at least one mime');
  }
  if (converter.mimes.some((mime) => !MIME.test(mime))) {
    fail('every mime must look like type/subtype');
  }

  const ctx = contextFor(sample);
  const first: ConversionResult = await converter.convert(sample, ctx);
  const { metadata } = first;
  if (typeof first.markdown !== 'string') fail('markdown must be a string');
  if (metadata.schemaVersion !== 1) fail('metadata.schemaVersion must be 1');
  if (metadata.sourceId !== ctx.sourceId) fail('metadata.sourceId must be the context sourceId');
  if (typeof metadata.mime !== 'string' || metadata.mime.length === 0) {
    fail('metadata.mime must be a non-empty string');
  }
  if (metadata.name !== undefined && /[\\/]/.test(metadata.name)) {
    fail('metadata.name must be a base name, never a path');
  }
  if (!Array.isArray(first.warnings)) fail('warnings must be an array');

  const second = await converter.convert(sample, contextFor(sample));
  if (JSON.stringify(first) !== JSON.stringify(second)) {
    fail('output must be deterministic for the same input');
  }

  const controller = new AbortController();
  controller.abort();
  const settled = await converter.convert(sample, contextFor(sample, controller.signal)).then(
    () => 'resolved',
    () => 'rejected',
  );
  if (settled === 'resolved') fail('must reject when the signal is already aborted');
}
