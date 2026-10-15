// Writes specs/pdf/simple.pdf: two pages, one line of Helvetica text each. Run: node scripts/make-pdf-fixture.mjs
import { writeFileSync } from 'node:fs';

const pages = ['Hello page one', 'Second page text'];
const objects = ['<< /Type /Catalog /Pages 2 0 R >>'];
const kids = pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ');
objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
for (const [i, text] of pages.entries()) {
  const stream = `BT /F1 18 Tf 72 700 Td (${text}) Tj ET`;
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
writeFileSync(new URL('../specs/pdf/simple.pdf', import.meta.url), pdf, 'latin1');
