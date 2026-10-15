// Writes specs/image/hello.png: "HELLO HOLE" in a 5x7 pixel font, 8x scale, black on white.
// Pure node (zlib + a CRC table), so the golden OCR fixture needs no image tool. Run: node scripts/make-image-fixture.mjs
import { Buffer } from 'node:buffer';
import { writeFileSync } from 'node:fs';
import { URL } from 'node:url';
import { deflateSync } from 'node:zlib';

const GLYPHS = {
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};
const TEXT = 'HELLO HOLE';
const SCALE = 8;
const MARGIN = 4 * SCALE;
const CELL = 6; // 5 columns + 1 gap
const width = MARGIN * 2 + TEXT.length * CELL * SCALE;
const height = MARGIN * 2 + 7 * SCALE;

const rows = [];
for (let y = 0; y < height; y += 1) {
  const row = Buffer.alloc(1 + width, 255);
  row[0] = 0; // filter: none
  const gy = Math.floor((y - MARGIN) / SCALE);
  if (gy >= 0 && gy < 7) {
    for (let x = 0; x < width; x += 1) {
      const gx = Math.floor((x - MARGIN) / SCALE);
      const char = TEXT[Math.floor(gx / CELL)];
      if (gx >= 0 && char !== undefined && GLYPHS[char][gy][gx % CELL] === '1') row[1 + x] = 0;
    }
  }
  rows.push(row);
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width, 0);
ihdr.writeUInt32BE(height, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 0; // grayscale

writeFileSync(
  new URL('../specs/image/hello.png', import.meta.url),
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]),
);
