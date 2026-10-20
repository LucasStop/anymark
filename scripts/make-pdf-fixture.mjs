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
function buildOneBit({ bits, width, height }) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [4 0 R] /Count 1 >>',
  ];
  objects.push(
    `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceGray /BitsPerComponent 1 /Length ${bits.length} >>\nstream\n${bits}\nendstream`,
  );
  const draw = `${width} 0 0 ${height} 0 0 cm /Im1 Do`;
  objects.push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Rotate 270 /Contents 5 0 R /Resources << /XObject << /Im1 3 0 R >> >> >>`,
  );
  objects.push(`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`);
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
