/**
 * Core contracts. Frozen early: change only with both owners' approval (see docs/SDD.md).
 * Types only, no behavior.
 */

/** Bytes plus the hints a caller may know. `name` is a base name, never a path. */
export interface Source {
  readonly data: Uint8Array;
  readonly name?: string;
  readonly mime?: string;
}

/** What `convert()` accepts: raw bytes, or bytes with hints. */
export type Input = Uint8Array | Source;

/** Work a backend can do. Converters ask the chain for a capability, never for a provider. */
export type Capability = 'ocr' | 'transcription';

/** Where a backend runs. `cli` needs `allowCli`; `remote` needs `allowNetwork`. */
export type Locality = 'local' | 'cli' | 'remote';

export interface ConvertOptions {
  readonly signal?: AbortSignal;
  /** Off by default: spawning a CLI is opt-in. */
  readonly allowCli?: boolean;
  /** Off by default: any network call is opt-in. */
  readonly allowNetwork?: boolean;
  /** Overrides the default backend order. */
  readonly backends?: readonly Backend<unknown, unknown>[];
  /** Language hint, e.g. `pt`. */
  readonly lang?: string;
}

/** A non-fatal problem. Never carries keys, absolute paths or user data. */
export interface ConversionWarning {
  readonly code: string;
  readonly message: string;
}

export interface Metadata {
  readonly schemaVersion: 1;
  /** sha256 of the content, hex. Stable across runs. */
  readonly sourceId: string;
  readonly mime: string;
  /** Base name only, never a path. */
  readonly name?: string;
  readonly title?: string;
}

export interface ConversionResult {
  readonly markdown: string;
  readonly metadata: Metadata;
  readonly warnings: readonly ConversionWarning[];
}

/** Runs a capability through the ordered backends, with fallback. Implemented by `BackendChain`. */
export interface BackendRunner {
  run<In, Out>(capability: Capability, input: In): Promise<Out>;
}

export interface ConverterContext {
  readonly sourceId: string;
  readonly options: ConvertOptions;
  readonly backends: BackendRunner;
}

/** Strategy: turns one format into Markdown. Never talks to a provider directly. */
export interface Converter {
  readonly name: string;
  readonly mimes: readonly string[];
  convert(source: Source, ctx: ConverterContext): Promise<ConversionResult>;
}

/** Registry entry. `load()` runs on first use so heavy dependencies stay out of the way. */
export interface ConverterEntry {
  readonly name: string;
  readonly mimes: readonly string[];
  /** Extensions with the dot, e.g. `.srt`. Lets the detector map an extension to a mime. */
  readonly extensions?: readonly string[];
  load(): Promise<Converter>;
}

export interface BackendContext {
  readonly signal?: AbortSignal;
  readonly lang?: string;
}

/** Adapter: one provider (CLI, API or WASM) behind a fixed contract. */
export interface Backend<In = unknown, Out = unknown> {
  readonly name: string;
  readonly capability: Capability;
  readonly locality: Locality;
  isAvailable(): Promise<boolean>;
  run(input: In, ctx: BackendContext): Promise<Out>;
}

/** What a plugin may do to an instance. */
export interface PluginHost {
  register(entry: ConverterEntry): void;
}

/** Extension unit: adds formats to one instance without touching the library. */
export interface Plugin {
  readonly name: string;
  install(host: PluginHost): void;
}
