'use server';

import { anymark } from '../lib/anymark';

export type ConvertState =
  | { status: 'idle' }
  | { status: 'ok'; name: string; markdown: string; warnings: string[] }
  | { status: 'error'; message: string };

const MAX_BYTES = 10 * 1024 * 1024;

export async function convertFile(_prev: ConvertState, form: FormData): Promise<ConvertState> {
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { status: 'error', message: 'Choose a file.' };
  }
  if (file.size > MAX_BYTES) return { status: 'error', message: 'File larger than 10 MB.' };
  try {
    // The name is only a hint for detection; the library keeps just its base name.
    const result = await anymark.convert({
      data: new Uint8Array(await file.arrayBuffer()),
      name: file.name,
    });
    return {
      status: 'ok',
      name: file.name.replace(/\.[^.]+$/, '') || 'document',
      markdown: result.markdown,
      warnings: result.warnings.map((w) => w.message),
    };
  } catch (error) {
    // Library errors are generic by design; anything else is not shown to the user.
    const message =
      error instanceof Error && 'code' in error ? error.message : 'Conversion failed.';
    return { status: 'error', message };
  }
}
