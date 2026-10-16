// Writes specs/image/hello.{png,gif,webp}: "HELLO HOLE" in a 5x7 pixel font, 8x scale, black on white.
// Pure node (zlib, a CRC table, a hand-written GIF LZW stream and a VP8L lossless stream), so the golden
// OCR fixtures need no image tool. Run: node scripts/make-image-fixture.mjs
// hello.jpg is the one exception: node has no JPEG encoder, so it comes from the png on macOS:
//   sips -s format jpeg -s formatOptions 90 specs/image/hello.png --out specs/image/hello.jpg
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

// GIF89a, 2-colour palette. LZW with a clear code every 2 pixels keeps the code width at 3 bits.
const bitmap = rows.map((row) => row.subarray(1));
const bits = [];
const pushBits = (value, count) => {
  for (let i = 0; i < count; i += 1) bits.push((value >> i) & 1);
};
const packBits = () => {
  const out = Buffer.alloc(Math.ceil(bits.length / 8));
  bits.forEach((bit, i) => (out[i >> 3] |= bit << (i & 7)));
  bits.length = 0;
  return out;
};
const pixels = bitmap.flatMap((row) => [...row].map((v) => (v === 0 ? 0 : 1)));
for (let i = 0; i < pixels.length; i += 2) {
  pushBits(4, 3); // clear
  pushBits(pixels[i], 3);
  if (i + 1 < pixels.length) pushBits(pixels[i + 1], 3);
}
pushBits(5, 3); // end of information
const lzw = packBits();
const subBlocks = [];
for (let i = 0; i < lzw.length; i += 255) {
  const part = lzw.subarray(i, i + 255);
  subBlocks.push(Buffer.from([part.length]), part);
}
const gifHeader = Buffer.alloc(13);
gifHeader.write('GIF89a', 0, 'ascii');
gifHeader.writeUInt16LE(width, 6);
gifHeader.writeUInt16LE(height, 8);
gifHeader[10] = 0x80; // global colour table, 2 entries
const gifImage = Buffer.alloc(10);
gifImage[0] = 0x2c;
gifImage.writeUInt16LE(width, 5);
gifImage.writeUInt16LE(height, 7);
writeFileSync(
  new URL('../specs/image/hello.gif', import.meta.url),
  Buffer.concat([
    gifHeader,
    Buffer.from([0, 0, 0, 255, 255, 255]),
    gifImage,
    Buffer.from([2]), // minimum code size
    ...subBlocks,
    Buffer.from([0, 0x3b]),
  ]),
);

// WebP lossless (VP8L): no transforms, no colour cache, one 1-bit prefix code per colour channel.
pushBits(0x2f, 8);
pushBits(width - 1, 14);
pushBits(height - 1, 14);
pushBits(0, 1); // alpha is not used
pushBits(0, 3); // version
pushBits(0, 1); // no transform
pushBits(0, 1); // no colour cache
pushBits(0, 1); // no meta prefix codes
const simpleCode = (...symbols) => {
  pushBits(1, 1); // simple code
  pushBits(symbols.length - 1, 1);
  pushBits(1, 1); // first symbol takes 8 bits
  pushBits(symbols[0], 8);
  if (symbols.length === 2) pushBits(symbols[1], 8);
};
simpleCode(0, 255); // green
simpleCode(0, 255); // red
simpleCode(0, 255); // blue
simpleCode(255); // alpha
simpleCode(0); // distance, never used
for (const value of pixels) for (let channel = 0; channel < 3; channel += 1) pushBits(value, 1);
let vp8l = packBits();
if (vp8l.length % 2 === 1) vp8l = Buffer.concat([vp8l, Buffer.from([0])]);
const riff = Buffer.alloc(20);
riff.write('RIFF', 0, 'ascii');
riff.writeUInt32LE(4 + 8 + vp8l.length, 4);
riff.write('WEBPVP8L', 8, 'ascii');
riff.writeUInt32LE(vp8l.length, 16);
writeFileSync(new URL('../specs/image/hello.webp', import.meta.url), Buffer.concat([riff, vp8l]));
