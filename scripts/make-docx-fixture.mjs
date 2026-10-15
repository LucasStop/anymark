// Writes specs/docx/simple.docx: heading, paragraph, bullet list, table and an embedded image.
// Run: node scripts/make-docx-fixture.mjs
import { Buffer } from 'node:buffer';
import { writeFileSync } from 'node:fs';
import { URL } from 'node:url';
import { strToU8, zipSync } from 'fflate';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const para = (text, props = '') => `<w:p>${props}<w:r><w:t>${text}</w:t></w:r></w:p>`;
const bullet = (text) =>
  para(
    text,
    '<w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>',
  );
const cell = (text) => `<w:tc>${para(text)}</w:tc>`;
const row = (cells) => `<w:tr>${cells.map(cell).join('')}</w:tr>`;
// 1x1 transparent PNG: proves embedded images stay out of the output.
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const image = `<w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="9525" cy="9525"/><wp:docPr id="1" name="Picture"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1" name="p.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId3"/></pic:blipFill><pic:spPr/></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;

const files = {
  '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`,
  '_rels/.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>`,
  'word/_rels/document.xml.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/numbering" Target="numbering.xml"/><Relationship Id="rId2" Type="${R}/styles" Target="styles.xml"/><Relationship Id="rId3" Type="${R}/image" Target="media/p.png"/></Relationships>`,
  'word/styles.xml': `<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="${W}"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style><w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/></w:style></w:styles>`,
  'word/numbering.xml': `<?xml version="1.0" encoding="UTF-8"?><w:numbering xmlns:w="${W}"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="-"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`,
  'word/document.xml': `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${[
    para('Título', '<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>'),
    para('Um parágrafo simples.'),
    bullet('um'),
    bullet('dois'),
    `<w:tbl>${row(['Nome', 'Idade'])}${row(['Ana', '30'])}</w:tbl>`,
    image,
  ].join('')}</w:body></w:document>`,
};
const entries = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)]));
entries['word/media/p.png'] = png;
writeFileSync(
  new URL('../specs/docx/simple.docx', import.meta.url),
  zipSync(entries, { mtime: new Date(Date.UTC(2026, 0, 1)) }),
);
