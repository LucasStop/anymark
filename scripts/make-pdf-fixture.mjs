// Writes specs/pdf/simple.pdf (two pages, one line of Helvetica text each) and specs/pdf/no-text.pdf
// (two pages that only draw a rectangle, like a scan with no text layer) and specs/pdf/mixed.pdf (a
// scanned cover, then a page with text) and specs/pdf/scanned.pdf (two pages, each one embedded JPEG of
// "HELLO HOLE" and nothing else, like a real scan) and specs/pdf/scanned-many.pdf (101 such pages) and
// specs/pdf/scanned-1bit.pdf (one 1-bit page stored sideways, fixed by /Rotate 270, like a fax scan). Run: node scripts/make-pdf-fixture.mjs
import { Buffer } from 'node:buffer';
import { readFileSync, writeFileSync } from 'node:fs';
import { URL } from 'node:url';
import { inflateSync } from 'node:zlib';

/** `streams` holds one content stream per page. */
function build(streams) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>'];
  const kids = streams.map((_, i) => `${4 + i * 2} 0 R`).join(' ');
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${streams.length} >>`);
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  for (const [i, stream] of streams.entries()) {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${5 + i * 2} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`,
    );
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return pdf;
}

const write = (name, pdf) =>
  writeFileSync(new URL(`../specs/pdf/${name}`, import.meta.url), pdf, 'latin1');

write(
  'simple.pdf',
  build(['Hello page one', 'Second page text'].map((t) => `BT /F1 18 Tf 72 700 Td (${t}) Tj ET`)),
);
const scan = '0.5 g 72 72 468 648 re f';
write('no-text.pdf', build([scan, scan]));
write('mixed.pdf', build([scan, 'BT /F1 18 Tf 72 700 Td (Body text) Tj ET']));

/** One embedded JPEG per page, drawn full page. No text layer, no fonts. */
function buildScan(jpeg, width, height, pages) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>'];
  objects.push(
    `<< /Type /Pages /Kids [${Array.from({ length: pages }, (_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pages} >>`,
  );
  objects.push(
    `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n${jpeg}\nendstream`,
  );
  const draw = '612 0 0 135 0 600 cm /Im1 Do';
  for (let i = 0; i < pages; i += 1) {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${5 + i * 2} 0 R /Resources << /XObject << /Im1 3 0 R >> >> >>`,
    );
    objects.push(`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`);
  }
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return pdf;
}

const jpeg = readFileSync(new URL('../specs/image/hello.jpg', import.meta.url)).toString('latin1');
write('scanned.pdf', buildScan(jpeg, 544, 120, 2));
// More pages than the OCR page limit, all sharing the one image object.
write('scanned-many.pdf', buildScan(jpeg, 544, 120, 101));

/** hello.png is 8-bit gray with filter 0 on every row: inflate it and pack it as 1 bit, rotated 90 degrees clockwise. */
function oneBitSideways() {
  const png = readFileSync(new URL('../specs/image/hello.png', import.meta.url));
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const idat = [];
  for (let at = 8; at < png.length;) {
    const length = png.readUInt32BE(at);
    if (png.toString('latin1', at + 4, at + 8) === 'IDAT')
      idat.push(png.subarray(at + 8, at + 8 + length));
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const gray = (x, y) => raw[y * (1 + width) + 1 + x];
  // Rotated 90 degrees clockwise: new width = height, new height = width.
  const stride = Math.ceil(height / 8);
  const bits = Buffer.alloc(stride * width);
  for (let y = 0; y < width; y += 1) {
    for (let x = 0; x < height; x += 1) {
      if (gray(y, height - 1 - x) > 127) bits[y * stride + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return { bits: bits.toString('latin1'), width: height, height: width };
}

/** One page, one raw 1-bit image drawn full page; /Rotate 270 turns the sideways image upright. */
function buildOneBit({ bits, width, height }, pages = 1) {
  const kids = Array.from({ length: pages }, (_, i) => `${4 + i * 2} 0 R`).join(' ');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${kids}] /Count ${pages} >>`,
  ];
  objects.push(
    `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceGray /BitsPerComponent 1 /Length ${bits.length} >>\nstream\n${bits}\nendstream`,
  );
  const draw = `${width} 0 0 ${height} 0 0 cm /Im1 Do`;
  for (let i = 0; i < pages; i += 1) {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Rotate 270 /Contents ${5 + i * 2} 0 R /Resources << /XObject << /Im1 3 0 R >> >> >>`,
    );
    objects.push(`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`);
  }
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return pdf;
}

write('scanned-1bit.pdf', buildOneBit(oneBitSideways()));
// The same image object on three pages: pdf.js keeps it in commonObjs, not in the page's objs.
write('scanned-1bit-shared.pdf', buildOneBit(oneBitSideways(), 3));

/** Four lines of "HELLO HOLE" (a page has many lines; the orientation guess needs more than one), turned clockwise `turns` times. */
function oneBitPage(turns) {
  const png = readFileSync(new URL('../specs/image/hello.png', import.meta.url));
  const w = png.readUInt32BE(16);
  const h = png.readUInt32BE(20);
  const idat = [];
  for (let at = 8; at < png.length;) {
    const length = png.readUInt32BE(at);
    if (png.toString('latin1', at + 4, at + 8) === 'IDAT')
      idat.push(png.subarray(at + 8, at + 8 + length));
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  let width = w;
  let height = h * 4;
  let pixels = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => raw[(y % h) * (1 + w) + 1 + x] > 127),
  );
  for (let t = 0; t < turns; t += 1) {
    pixels = Array.from({ length: width }, (_, y) =>
      Array.from({ length: height }, (_, x) => pixels[height - 1 - x][y]),
    );
    [width, height] = [height, width];
  }
  const stride = Math.ceil(width / 8);
  const bits = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1)
      if (pixels[y][x]) bits[y * stride + (x >> 3)] |= 0x80 >> (x & 7);
  return { bits: bits.toString('latin1'), width, height };
}

/** One image object per page; `rotates` is each page's /Rotate, which scanners often leave at 0. */
function buildPages(images, rotates) {
  const kids = images.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${kids}] /Count ${images.length} >>`,
  ];
  images.forEach(({ bits, width, height }, i) => {
    const draw = `${width} 0 0 ${height} 0 0 cm /Im1 Do`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Rotate ${rotates[i]} /Contents ${4 + i * 3} 0 R /Resources << /XObject << /Im1 ${5 + i * 3} 0 R >> >> >>`,
    );
    objects.push(`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`);
    objects.push(
      `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceGray /BitsPerComponent 1 /Length ${bits.length} >>\nstream\n${bits}\nendstream`,
    );
  });
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return pdf;
}

// Sideways with the right /Rotate, sideways with /Rotate 0 (the book), and upside down with /Rotate 0.
write(
  'scanned-orientations.pdf',
  buildPages([oneBitPage(1), oneBitPage(1), oneBitPage(2)], [270, 0, 0]),
);

// A book sheet scanned open: two printed pages side by side with a gutter between them, the left one
// with HELLO lines and the right one with HOLE lines (same 5x7 glyphs as the image fixture). `turns`
// is how often the stored bitmap was turned clockwise, like a scanner that laid the sheet down sideways.
const GLYPHS = {
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
};
function spreadSheet(turns, framed = false) {
  const scale = 5;
  const lines = 12; // a page-like count: the orientation guess needs many lines
  // Lines differ in length and start (like real text), so gaps between letters do not line up
  // down the page; identical lines would make the columns look as striped as the rows.
  const line = (word, row) => {
    const text = row % 2 ? word : `${word} ${word}`;
    return text
      .split('')
      .flatMap((char, i) =>
        char === ' ' ? [] : [{ glyph: GLYPHS[char], x: i * 6 * scale + ((row * 13) % 29) }],
      );
  };
  const pageWidth = 11 * 6 * scale + 2 * 4 * scale + 30;
  const gutter = 12 * scale;
  let width = pageWidth * 2 + gutter;
  let height = lines * 12 * scale + 2 * 4 * scale;
  let pixels = Array.from({ length: height }, () => Array(width).fill(true));
  for (const [word, left] of [
    ['HELLO', 0],
    ['HOLE', pageWidth + gutter],
  ]) {
    for (let row = 0; row < lines; row += 1) {
      for (const { glyph, x } of line(word, row)) {
        for (let gy = 0; gy < 7; gy += 1)
          for (let gx = 0; gx < 5; gx += 1)
            if (glyph[gy][gx] === '1')
              for (let dy = 0; dy < scale; dy += 1)
                for (let dx = 0; dx < scale; dx += 1)
                  pixels[4 * scale + row * 12 * scale + gy * scale + dy][
                    left + 4 * scale + x + gx * scale + dx
                  ] = false;
      }
    }
  }
  if (framed) {
    // What a flatbed leaves: a dark frame around the sheet and a shadow down the gutter.
    const edge = 14;
    const mid = pageWidth + Math.floor(gutter / 2);
    for (let y = 0; y < height; y += 1)
      for (let x = 0; x < width; x += 1)
        if (
          x < edge ||
          x >= width - edge ||
          y < edge ||
          y >= height - edge ||
          Math.abs(x - mid) < 10
        )
          pixels[y][x] = false;
  }
  for (let t = 0; t < turns; t += 1) {
    pixels = Array.from({ length: width }, (_, y) =>
      Array.from({ length: height }, (_, x) => pixels[height - 1 - x][y]),
    );
    [width, height] = [height, width];
  }
  const stride = Math.ceil(width / 8);
  const bits = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1)
      if (pixels[y][x]) bits[y * stride + (x >> 3)] |= 0x80 >> (x & 7);
  return { bits: bits.toString('latin1'), width, height };
}

// Four sheets, one per stored turn, /Rotate 0 on all (what the book's scanner wrote).
write(
  'scanned-spread.pdf',
  buildPages(
    [0, 1, 2, 3].map((t) => spreadSheet(t)),
    [0, 0, 0, 0],
  ),
);
// Two sheets laid down sideways, for a declared rotation.
write(
  'scanned-spread-sideways.pdf',
  buildPages(
    [1, 1].map((t) => spreadSheet(t)),
    [0, 0],
  ),
);

// Sheets with a dark frame and a gutter shadow, for pdf.cleanup.trim.
write(
  'scanned-spread-framed.pdf',
  buildPages(
    [0].map((t) => spreadSheet(t, true)),
    [0],
  ),
);
