// Writes specs/pdf/simple.pdf (two pages, one line of Helvetica text each) and specs/pdf/no-text.pdf
// (two pages that only draw a rectangle, like a scan with no text layer) and specs/pdf/mixed.pdf (a
// scanned cover, then a page with text) and specs/pdf/scanned.pdf (two pages, each one embedded JPEG of
// "HELLO HOLE" and nothing else, like a real scan) and specs/pdf/scanned-many.pdf (101 such pages). Run: node scripts/make-pdf-fixture.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { URL } from 'node:url';

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
