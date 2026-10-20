import { zlibSync } from 'fflate';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(body, 8);
  view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
  return out;
}

const COLOR_TYPE = { 1: 0, 3: 2, 4: 6 } as const;

/** 8-bit gray, RGB or RGBA pixels to a PNG. The OCR backends take encoded images, not raw pixels. */
export function encodePng(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  channels: 1 | 3 | 4,
): Uint8Array {
  const stride = width * channels;
  const raw = new Uint8Array(height * (1 + stride));
  for (let y = 0; y < height; y += 1) {
    // Filter type 0 (none) at the start of every row.
    raw.set(pixels.subarray(y * stride, (y + 1) * stride), y * (1 + stride) + 1);
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8;
  header[9] = COLOR_TYPE[channels];
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlibSync(raw)),
    chunk('IEND', new Uint8Array()),
  ];
  const png = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}

export interface Raster {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly channels: 1 | 3 | 4;
}

/** Turns the pixels clockwise by 90, 180 or 270 degrees, like a PDF page's /Rotate. */
export function rotateClockwise(image: Raster, degrees: number): Raster {
  const turns = (((Math.round(degrees / 90) % 4) + 4) % 4) as 0 | 1 | 2 | 3;
  if (turns === 0) return image;
  const { data, width, height, channels } = image;
  const swap = turns !== 2;
  const outWidth = swap ? height : width;
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [nx, ny] =
        turns === 1
          ? [height - 1 - y, x]
          : turns === 2
            ? [width - 1 - x, height - 1 - y]
            : [y, width - 1 - x];
      out.set(
        data.subarray((y * width + x) * channels, (y * width + x + 1) * channels),
        (ny * outWidth + nx) * channels,
      );
    }
  }
  return { data: out, width: outWidth, height: swap ? width : height, channels };
}
