import { detect } from 'chardet';

/**
 * Strict UTF-8 first (a BOM is dropped); only bytes that are not valid UTF-8 go to chardet.
 * TextDecoder reads the legacy encodings chardet names, so no iconv is needed.
 */
export function decodeText(data: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    const label = detect(data) ?? 'windows-1252';
    try {
      return new TextDecoder(label).decode(data);
    } catch {
      // A name TextDecoder does not know: windows-1252 never fails and keeps ASCII intact.
      return new TextDecoder('windows-1252').decode(data);
    }
  }
}
