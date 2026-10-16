// Writes specs/pdf/simple.pdf (two pages, one line of Helvetica text each) and specs/pdf/no-text.pdf
// (two pages that only draw a rectangle, like a scan with no text layer). Run: node scripts/make-pdf-fixture.mjs
import { writeFileSync } from 'node:fs';
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
write('no-text.pdf', build(['0.5 g 72 72 468 648 re f', '0.5 g 72 72 468 648 re f']));
