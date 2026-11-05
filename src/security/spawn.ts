import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
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
  readonly args: (inputPath: string, outputPath: string) => readonly string[];
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

/** `runCli` for a child that writes a file instead of stdout (ffmpeg, yt-dlp). */
export interface FileSpawnRequest extends SpawnRequest {
  /** Plain file name the child writes inside the temp dir; `args` receives its full path. */
  readonly outputName: string;
  /** Cap on the file it may leave behind. Default 200 MB. */
  readonly maxOutputBytes?: number;
}

const DEFAULT_MAX_OUTPUT = 200 * 1024 * 1024;

const isPlainName = (name: string): boolean =>
  PLAIN_FILE_NAME.test(name) && name !== '.' && name !== '..';

async function execute<T>(
  request: SpawnRequest,
  options: ConvertOptions,
  outputName: string,
  collect: (stdout: string, outputPath: string) => Promise<T>,
): Promise<T> {
  assertOptIn('cli', options);
  options.signal?.throwIfAborted();
  const name = request.inputName ?? 'input';
  if (!isPlainName(name) || !isPlainName(outputName) || name === outputName) {
    throw new SpawnError('failed');
  }

  const dir = await mkdtemp(join(tmpdir(), 'anymark-'));
  try {
    const inputPath = join(dir, name);
    const outputPath = join(dir, outputName);
    await writeFile(inputPath, request.input, { mode: 0o600 });
    const env: Record<string, string> = {};
    for (const key of [...BASE_ENV, ...(request.envAllow ?? [])]) {
      const value = process.env[key];
      if (value !== undefined) env[key] = value;
    }
    const { stdout } = await run(request.command, [...request.args(inputPath, outputPath)], {
      cwd: dir,
      env: { ...env, ...request.env },
      timeout: request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxBuffer: request.maxBuffer ?? DEFAULT_MAX_BUFFER,
      encoding: 'utf8',
      killSignal: 'SIGKILL',
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    return await collect(stdout, outputPath);
  } catch (error) {
    throw error instanceof SpawnError ? error : failure(error);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * The single place a child process is started (ADR 0005). `execFile` with an argv
 * array and no shell, the input copied to a private temp dir, hard limits, a
 * filtered environment, and cleanup whatever happens. Document content and the
 * child's output are untrusted data: neither is ever interpreted here.
 */
export async function runCli(request: SpawnRequest, options: ConvertOptions): Promise<string> {
  return execute(request, options, 'output', async (stdout) => stdout);
}

/** Same guarantees as `runCli`; returns the file the child wrote instead of its stdout. */
export async function runCliFile(
  request: FileSpawnRequest,
  options: ConvertOptions,
): Promise<Uint8Array> {
  return execute(request, options, request.outputName, async (_stdout, outputPath) => {
    const max = request.maxOutputBytes ?? DEFAULT_MAX_OUTPUT;
    // A missing file is a failed child, not a crash: the caller sees the same generic error.
    const size = await stat(outputPath).then(
      (info) => info.size,
      () => -1,
    );
    if (size < 0) throw new SpawnError('failed');
    if (size > max) throw new SpawnError('output-too-large');
    return new Uint8Array(await readFile(outputPath));
  });
}
