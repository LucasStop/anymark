import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { SpawnError } from '../core/errors.js';
import type { ConvertOptions } from '../core/types.js';
import { assertOptIn } from './optIn.js';

const run = promisify(execFile);

export interface SpawnRequest {
  /** Executable, never a shell command line. */
  readonly command: string;
  /** Builds argv from the path of the copied input. Each element is one argument. */
  readonly args: (inputPath: string) => readonly string[];
  readonly input: Uint8Array;
  /** Fixed name inside the temp dir. A plain file name: no separators. */
  readonly inputName?: string;
  readonly timeoutMs?: number;
  readonly maxBuffer?: number;
  /** Names copied from the parent env. Everything else stays behind. */
  readonly envAllow?: readonly string[];
  /** Explicit values, e.g. a credential handed in by the caller. */
  readonly env?: Readonly<Record<string, string>>;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;
// A child that cannot find its interpreter is useless; nothing else is inherited by default.
const BASE_ENV = ['PATH'];
const PLAIN_FILE_NAME = /^[A-Za-z0-9._-]+$/;

function failure(error: unknown): SpawnError {
  const { code, killed } = error as { code?: unknown; killed?: unknown };
  if (code === 'ABORT_ERR') return new SpawnError('aborted');
  if (code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return new SpawnError('output-too-large');
  return new SpawnError(killed === true ? 'timeout' : 'failed');
}

/**
 * The single place a child process is started (ADR 0005). `execFile` with an argv
 * array and no shell, the input copied to a private temp dir, hard limits, a
 * filtered environment, and cleanup whatever happens. Document content and the
 * child's output are untrusted data: neither is ever interpreted here.
 */
export async function runCli(request: SpawnRequest, options: ConvertOptions): Promise<string> {
  assertOptIn('cli', options);
  options.signal?.throwIfAborted();
  const name = request.inputName ?? 'input';
  if (!PLAIN_FILE_NAME.test(name) || name === '.' || name === '..') {
    throw new SpawnError('failed');
  }

  const dir = await mkdtemp(join(tmpdir(), 'anymark-'));
  try {
    const inputPath = join(dir, name);
    await writeFile(inputPath, request.input, { mode: 0o600 });
    const env: Record<string, string> = {};
    for (const key of [...BASE_ENV, ...(request.envAllow ?? [])]) {
      const value = process.env[key];
      if (value !== undefined) env[key] = value;
    }
    const { stdout } = await run(request.command, [...request.args(inputPath)], {
      cwd: dir,
      env: { ...env, ...request.env },
      timeout: request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxBuffer: request.maxBuffer ?? DEFAULT_MAX_BUFFER,
      encoding: 'utf8',
      killSignal: 'SIGKILL',
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    return stdout;
  } catch (error) {
    throw failure(error);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
