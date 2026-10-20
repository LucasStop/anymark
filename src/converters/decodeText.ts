import { detect } from 'chardet';

const SAMPLE = 4096;
const SHARE = 0.9;

/**
 * Latin text in UTF-16 has a zero in the high byte of almost every code unit: odd positions for
 * little endian, even for big endian. UTF-8 and the legacy encodings never do this, and chardet
 * would not name it, so it is checked first.
 */
function utf16WithoutBom(data: Uint8Array): 'utf-16le' | 'utf-16be' | undefined {
  const pairs = Math.floor(Math.min(data.length, SAMPLE) / 2);
  if (pairs < 2) return undefined;
  let even = 0;
  let odd = 0;
  for (let i = 0; i < pairs; i += 1) {
    if (data[2 * i] === 0) even += 1;
    if (data[2 * i + 1] === 0) odd += 1;
  }
  if (odd >= SHARE * pairs && even <= (1 - SHARE) * pairs) return 'utf-16le';
  if (even >= SHARE * pairs && odd <= (1 - SHARE) * pairs) return 'utf-16be';
  return undefined;
}

/**
 * UTF-16 without a BOM by its zero bytes, then strict UTF-8 (a BOM is dropped); only bytes that are not valid UTF-8 go to chardet.
 * TextDecoder reads the legacy encodings chardet names, so no iconv is needed.
 */
export function decodeText(data: Uint8Array): string {
  const utf16 = utf16WithoutBom(data);
  if (utf16 !== undefined) return new TextDecoder(utf16).decode(data);
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
