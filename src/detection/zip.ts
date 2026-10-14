const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_DIRECTORY = 0x06054b50;
const END_RECORD_SIZE = 22;
const MAX_COMMENT = 0xffff;

export const isZip = (data: Uint8Array): boolean =>
  data.length >= 4 &&
  new DataView(data.buffer, data.byteOffset, data.length).getUint32(0, true) === LOCAL_HEADER;

/**
 * Entry names from the central directory, or [] when the archive is truncated or
 * inconsistent. Every offset is bounds-checked: the input is untrusted.
 */
export function zipEntryNames(data: Uint8Array): string[] {
  const view = new DataView(data.buffer, data.byteOffset, data.length);
  const lowest = Math.max(0, data.length - END_RECORD_SIZE - MAX_COMMENT);
  let end = -1;
  for (let at = data.length - END_RECORD_SIZE; at >= lowest; at -= 1) {
    if (view.getUint32(at, true) === END_OF_DIRECTORY) {
      end = at;
      break;
    }
  }
  if (end < 0) return [];

  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const names: string[] = [];
  for (let i = 0; i < count; i += 1) {
    if (at + 46 > data.length || view.getUint32(at, true) !== CENTRAL_HEADER) return names;
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    if (at + 46 + nameLength > data.length) return names;
    names.push(decoder.decode(data.subarray(at + 46, at + 46 + nameLength)));
    at += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}
