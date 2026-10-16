'use server';

import {
  ConversionError,
  NoBackendError,
  OptInRequiredError,
  UnsupportedFormatError,
} from 'anymark';
import { anymark } from '../lib/anymark';
import { MAX_BYTES } from '../lib/limits';

export type ConvertState =
  | { status: 'idle' }
  | { status: 'ok'; name: string; markdown: string; warnings: string[] }
  | { status: 'error'; message: string };

const TIMEOUT_MS = 30_000;

export async function convertFile(_prev: ConvertState, form: FormData): Promise<ConvertState> {
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { status: 'error', message: 'Choose a file.' };
  }
  if (file.size > MAX_BYTES) return { status: 'error', message: 'File larger than 10 MB.' };
  try {
    // The name is only a hint for detection; the library keeps just its base name.
    const result = await anymark.convert(
      {
        data: new Uint8Array(await file.arrayBuffer()),
        name: file.name,
      },
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    return {
      status: 'ok',
      name: file.name.replace(/\.[^.]+$/, '') || 'document',
      markdown: result.markdown,
      warnings: result.warnings.map((w) => w.message),
    };
  } catch (error) {
    // Only the library's own errors are generic by design; anything else may carry a path.
    const known =
      error instanceof ConversionError ||
      error instanceof UnsupportedFormatError ||
      error instanceof OptInRequiredError ||
      error instanceof NoBackendError;
    return { status: 'error', message: known ? error.message : 'Conversion failed.' };
  }
}
