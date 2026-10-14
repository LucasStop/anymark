import { extname } from 'node:path';
import type { DetectionInput, FormatHandler } from './FormatDetectorChain.js';
import { isZip, zipEntryNames } from './zip.js';

const ascii = (value: string): number[] => [...value].map((char) => char.charCodeAt(0));
const startsWith = (data: Uint8Array, bytes: readonly number[], at = 0): boolean =>
  data.length >= at + bytes.length && bytes.every((byte, i) => data[at + i] === byte);

/** The caller knows best: an explicit mime ends the walk. */
export class HintHandler implements FormatHandler {
  handle(input: DetectionInput, next: () => string | undefined): string | undefined {
    return input.mime ?? next();
  }
}

const SIGNATURES: readonly { readonly mime: string; readonly bytes: readonly number[] }[] = [
  { mime: 'application/pdf', bytes: ascii('%PDF-') },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/gif', bytes: ascii('GIF8') },
];

/** Magic bytes. Wins over the extension: a PDF renamed to .docx is still a PDF. */
export class SignatureHandler implements FormatHandler {
  handle(input: DetectionInput, next: () => string | undefined): string | undefined {
    const known = SIGNATURES.find((signature) => startsWith(input.data, signature.bytes));
    if (known !== undefined) return known.mime;
    const isWebp =
      startsWith(input.data, ascii('RIFF')) && startsWith(input.data, ascii('WEBP'), 8);
    return isWebp ? 'image/webp' : next();
  }
}

const OOXML = 'application/vnd.openxmlformats-officedocument';
const OOXML_MARKERS: readonly (readonly [string, string])[] = [
  ['word/document.xml', `${OOXML}.wordprocessingml.document`],
  ['ppt/presentation.xml', `${OOXML}.presentationml.presentation`],
  ['xl/workbook.xml', `${OOXML}.spreadsheetml.sheet`],
];

/** A ZIP is a zip until its entries say it is an Office file. */
export class ZipHandler implements FormatHandler {
  handle(input: DetectionInput, next: () => string | undefined): string | undefined {
    if (!isZip(input.data)) return next();
    const names = new Set(zipEntryNames(input.data));
    const office = OOXML_MARKERS.find(([entry]) => names.has(entry));
    return office?.[1] ?? 'application/zip';
  }
}

/** Looks the extension up in whatever the instance has registered, so plugins add their own. */
export class ExtensionHandler implements FormatHandler {
  readonly #lookup: (extension: string) => string | undefined;

  constructor(lookup: (extension: string) => string | undefined) {
    this.#lookup = lookup;
  }

  handle(input: DetectionInput, next: () => string | undefined): string | undefined {
    const extension = input.name === undefined ? '' : extname(input.name).toLowerCase();
    return (extension === '' ? undefined : this.#lookup(extension)) ?? next();
  }
}

const SAMPLE = 4096;

const isControl = (byte: number): boolean =>
  byte <= 8 || (byte >= 14 && byte <= 26) || (byte >= 28 && byte <= 31);

/** UTF-8 text from the first bytes, or undefined for binary or invalid input. */
function sniffText(data: Uint8Array): string | undefined {
  const sample = data.subarray(0, SAMPLE);
  if (sample.some(isControl)) return undefined;
  try {
    // stream: a multibyte character cut by the sample boundary is not an error.
    return new TextDecoder('utf-8', { fatal: true }).decode(sample, { stream: true });
  } catch {
    return undefined;
  }
}

/** Text that says what it is: HTML, XML or JSON. Runs after the extension, never before. */
export class StructuredTextHandler implements FormatHandler {
  handle(input: DetectionInput, next: () => string | undefined): string | undefined {
    const head = sniffText(input.data)?.trimStart();
    if (head === undefined) return next();
    const lower = head.slice(0, 15).toLowerCase();
    if (lower.startsWith('<!doctype html') || lower.startsWith('<html')) return 'text/html';
    if (lower.startsWith('<?xml')) return 'application/xml';
    if ((head.startsWith('{') || head.startsWith('[')) && isJson(input.data)) {
      return 'application/json';
    }
    return next();
  }
}

// ponytail: parses the whole file once to be sure; only files starting with { or [ pay this.
function isJson(data: Uint8Array): boolean {
  try {
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data));
    return true;
  } catch {
    return false;
  }
}

/** Last resort: any text that is valid UTF-8 and has no control bytes. */
export class PlainTextHandler implements FormatHandler {
  handle(input: DetectionInput, next: () => string | undefined): string | undefined {
    return sniffText(input.data) === undefined ? next() : 'text/plain';
  }
}
