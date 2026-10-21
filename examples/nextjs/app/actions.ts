'use server';

import {
  type ConvertOptions,
  type PdfOptions,
  ConversionError,
  NoBackendError,
  OptInRequiredError,
  UnsupportedFormatError,
} from 'anymark';
import { anymark } from '../lib/anymark';
import { MAX_BYTES } from '../lib/limits';

export type ConvertState =
  | { status: 'idle' }
  | {
      status: 'ok';
      name: string;
      markdown: string;
      warnings: { code: string; message: string }[];
      mime: string;
      sourceId: string;
    }
  // `lib` carries the library's own generic message; the rest are codes the client translates.
  | { status: 'error'; code: 'chooseFile' | 'tooBig' | 'failed' }
  | { status: 'error'; code: 'lib'; message: string };

const TIMEOUT_MS = 30_000;

// Form values are untrusted: anything outside these lists is dropped, never echoed back.
const pick = <T extends string>(value: FormDataEntryValue | null, allowed: readonly T[]) =>
  allowed.find((a) => a === value);

function readOptions(form: FormData): ConvertOptions {
  const lang = String(form.get('lang') ?? '').toLowerCase();
  const layout = pick(form.get('layout'), ['single', 'spread']);
  const binding = pick(form.get('binding'), ['left', 'right']);
  const turn = pick(form.get('rotation'), ['0', '90', '180', '270']);
  const trim = form.get('trim') === 'on';
  const dehyphenate = form.get('dehyphenate') === 'on';
  const pdf: PdfOptions = {
    ...(layout && { layout }),
    ...(binding && { binding }),
    ...(turn && { rotation: Number(turn) as 0 | 90 | 180 | 270 }),
    ...((trim || dehyphenate) && { cleanup: { trim, dehyphenate } }),
  };
  return {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    ...(/^[a-z]{2,3}$/.test(lang) && { lang }),
    ...(form.get('includeHidden') === 'on' && { includeHidden: true }),
    pdf,
  };
}

export async function convertFile(_prev: ConvertState, form: FormData): Promise<ConvertState> {
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { status: 'error', code: 'chooseFile' };
  }
  if (file.size > MAX_BYTES) return { status: 'error', code: 'tooBig' };
  try {
    // The name is only a hint for detection; the library keeps just its base name.
    const result = await anymark.convert(
      {
        data: new Uint8Array(await file.arrayBuffer()),
        name: file.name,
      },
      readOptions(form),
    );
    return {
      status: 'ok',
      name: file.name.replace(/\.[^.]+$/, '') || 'document',
      markdown: result.markdown,
      warnings: result.warnings.map((w) => ({ code: w.code, message: w.message })),
      mime: result.metadata.mime,
      sourceId: result.metadata.sourceId,
    };
  } catch (error) {
    // Only the library's own errors are generic by design; anything else may carry a path.
    const known =
      error instanceof ConversionError ||
      error instanceof UnsupportedFormatError ||
      error instanceof OptInRequiredError ||
      error instanceof NoBackendError;
    return known
      ? { status: 'error', code: 'lib', message: error.message }
      : { status: 'error', code: 'failed' };
  }
}
