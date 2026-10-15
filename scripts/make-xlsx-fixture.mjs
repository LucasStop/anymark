// Writes specs/xlsx/simple.xlsx: two sheets, a header row each. Run: node scripts/make-xlsx-fixture.mjs
import { writeFileSync } from 'node:fs';
import { URL } from 'node:url';
import { strToU8, zipSync } from 'fflate';

const sheets = [
  {
    name: 'People',
    rows: [
      ['Name', 'Age'],
      ['Ana', 30],
      ['Bruno | Silva', 28],
    ],
  },
  { name: 'Cities', rows: [['City'], ['Curitiba']] },
];
const esc = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const column = (i) => String.fromCharCode(65 + i);
const cell = (value, r, c) =>
  typeof value === 'number'
    ? `<c r="${column(c)}${r + 1}"><v>${value}</v></c>`
    : `<c r="${column(c)}${r + 1}" t="inlineStr"><is><t>${esc(value)}</t></is></c>`;
const sheetXml = ({ rows }) =>
  `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows
    .map((row, r) => `<row r="${r + 1}">${row.map((v, c) => cell(v, r, c)).join('')}</row>`)
    .join('')}</sheetData></worksheet>`;
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const files = {
  '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join('')}</Types>`,
  '_rels/.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${R}"><sheets>${sheets
    .map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('')}</sheets></workbook>`,
  'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="${R}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    )
    .join('')}</Relationships>`,
  ...Object.fromEntries(sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)])),
};
const zipped = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])), {
  mtime: new Date(Date.UTC(2026, 0, 1)),
});
writeFileSync(new URL('../specs/xlsx/simple.xlsx', import.meta.url), zipped);
