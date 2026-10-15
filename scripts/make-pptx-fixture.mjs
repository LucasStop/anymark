// Writes specs/pptx/simple.pptx: slide 1 (title + two paragraphs), slide 2 (table + speaker notes).
// Slide order lives in presentation.xml, so the files are listed in reverse to prove it is honoured.
// Run: node scripts/make-pptx-fixture.mjs
import { writeFileSync } from 'node:fs';
import { URL } from 'node:url';
import { strToU8, zipSync } from 'fflate';

const NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';
const paragraph = (text) => `<a:p><a:r><a:t>${text}</a:t></a:r></a:p>`;
const shape = (placeholder, paragraphs) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="1" name="s"/><p:cNvSpPr/><p:nvPr>${placeholder}</p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/>${paragraphs.map(paragraph).join('')}</p:txBody></p:sp>`;
const slide = (inner) =>
  `<?xml version="1.0" encoding="UTF-8"?><p:sld ${NS}><p:cSld><p:spTree>${inner}</p:spTree></p:cSld></p:sld>`;
const cell = (text) => `<a:tc><a:txBody><a:bodyPr/>${paragraph(text)}</a:txBody></a:tc>`;
const table = (rows) =>
  `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="2" name="t"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><a:graphic><a:graphicData><a:tbl><a:tblGrid/>${rows
    .map((r) => `<a:tr>${r.map(cell).join('')}</a:tr>`)
    .join('')}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
const notes = (text) =>
  `<?xml version="1.0" encoding="UTF-8"?><p:notes ${NS}><p:cSld><p:spTree>${shape('<p:ph type="sldImg"/>', [])}${shape('<p:ph type="body" idx="1"/>', [text])}${shape('<p:ph type="sldNum"/>', ['2'])}</p:spTree></p:cSld></p:notes>`;
const rels = (items) =>
  `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${PKG}">${items
    .map(
      ([id, type, target]) => `<Relationship Id="${id}" Type="${R}/${type}" Target="${target}"/>`,
    )
    .join('')}</Relationships>`;

const files = {
  '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>`,
  '_rels/.rels': rels([['rId1', 'officeDocument', 'ppt/presentation.xml']]),
  'ppt/presentation.xml': `<?xml version="1.0" encoding="UTF-8"?><p:presentation ${NS}><p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst></p:presentation>`,
  'ppt/_rels/presentation.xml.rels': rels([
    ['rId1', 'slide', 'slides/slide2.xml'],
    ['rId2', 'slide', 'slides/slide1.xml'],
  ]),
  // slide2.xml is the FIRST slide by order, slide1.xml the second.
  'ppt/slides/slide2.xml': slide(
    shape('<p:ph type="title"/>', ['Welcome']) +
      shape('<p:ph type="body" idx="1"/>', ['First point', 'Second point']),
  ),
  'ppt/slides/slide1.xml': slide(
    table([
      ['A', 'B'],
      ['1', '2'],
    ]),
  ),
  'ppt/slides/_rels/slide1.xml.rels': rels([
    ['rId1', 'notesSlide', '../notesSlides/notesSlide1.xml'],
  ]),
  'ppt/notesSlides/notesSlide1.xml': notes('Say hello.'),
};
writeFileSync(
  new URL('../specs/pptx/simple.pptx', import.meta.url),
  zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])), {
    mtime: new Date(Date.UTC(2026, 0, 1)),
  }),
);
