import { createHash } from 'node:crypto';
import type {
  Backend,
  BackendRunner,
  Capability,
  ConversionResult,
  Converter,
  Locality,
  Source,
} from '../core/types.js';

/** A broken rule. The message names the rule, never the sample content. */
export class ContractError extends Error {
  constructor(subject: string, rule: string, kind: 'Converter' | 'Backend' = 'Converter') {
    super(`${kind} contract violated (${subject || '<unnamed>'}): ${rule}`);
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

const CAPABILITIES: readonly Capability[] = ['ocr', 'transcription'];
const LOCALITIES: readonly Locality[] = ['local', 'cli', 'remote'];

/**
 * Throws a `ContractError` on the first rule a backend breaks. `sample` is whatever
 * input the backend takes (an image, an audio file). A backend that is not available
 * on this machine is checked on its static shape only. An available backend is really
 * called, so hand a CLI or remote adapter its fake (`fixtures/bin/`) to keep tests free.
 */
export async function assertBackendContract(backend: Backend, sample: unknown): Promise<void> {
  const fail = (rule: string): never => {
    throw new ContractError(backend.name, rule, 'Backend');
  };

  if (typeof backend.name !== 'string' || backend.name.length === 0) {
    fail('name must be a non-empty string');
  }
  if (!CAPABILITIES.includes(backend.capability)) {
    fail(`capability must be one of ${CAPABILITIES.join(', ')}`);
  }
  if (!LOCALITIES.includes(backend.locality)) {
    fail(`locality must be one of ${LOCALITIES.join(', ')}`);
  }
  const available: unknown = await backend.isAvailable();
  if (typeof available !== 'boolean') fail('isAvailable must resolve to a boolean');
  if (available === false) return;

  // The backend's own error can quote the sample or a key: report the rule, not the cause.
  const result: unknown = await backend
    .run(sample, {})
    .catch(() => fail('run must resolve for the sample'));
  if (result === undefined) fail('run must resolve to a result');

  const controller = new AbortController();
  controller.abort();
  const settled = await backend.run(sample, { signal: controller.signal }).then(
    () => 'resolved',
    () => 'rejected',
  );
  if (settled === 'resolved') fail('run must reject when the signal is already aborted');
}
