/**
 * Bootstrap-only: generates backend/skills/mille-create-quotation/assets/mille-quotation.docx (OOXML + Docxtemplater tags).
 * Includes a simple header/footer and bold title — replace with a hand-crafted Word file for full branding.
 * Do not run this without backing up assets/mille-quotation.docx if you have customized it in Word.
 *
 *   npx tsx src/scripts/generate-mille-quotation-template.ts
 */

import fs from 'fs/promises';
import path from 'path';
import PizZip from 'pizzip';

const outPath = path.join(process.cwd(), 'skills/mille-create-quotation/assets/mille-quotation.docx');

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`;

const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>`;

const headerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="4F81BD"/></w:pBdr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>Mille — Quotation</w:t></w:r>
  </w:p>
  <w:p><w:r><w:t>Reference: {quote_ref}</w:t></w:r></w:p>
</w:hdr>`;

const footerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:pPr><w:pBdr><w:top w:val="single" w:sz="4" w:space="1" w:color="CCCCCC"/></w:pBdr></w:pPr>
    <w:r><w:t xml:space="preserve">Mille Cake Shop · </w:t></w:r>
    <w:r><w:t>Valid until {valid_until}</w:t></w:r>
  </w:p>
</w:ftr>`;

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:xml="http://www.w3.org/XML/1998/namespace">
  <w:body>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Customer &amp; order details</w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>
    <w:p><w:r><w:t>Date: {quote_date}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Valid until: {valid_until}</w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>
    <w:p><w:r><w:t>Client: {client_name}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Company: {company}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Phone: {phone}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Email: {email}</w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Line items</w:t></w:r></w:p>
    <w:p><w:r><w:t>{line_items}</w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Total (HKD): {total_hkd}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Prepared by: {prepared_by}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Notes: {notes}</w:t></w:r></w:p>
    <w:sectPr>
      <w:headerReference w:type="default" r:id="rId1"/>
      <w:footerReference w:type="default" r:id="rId2"/>
      <w:pgSz w:w="11906" w:h="16838"/>
    </w:sectPr>
  </w:body>
</w:document>`;

async function main() {
  const zip = new PizZip();
  zip.file('[Content_Types].xml', contentTypes);
  zip.file('_rels/.rels', rels);
  zip.file('word/_rels/document.xml.rels', documentRels);
  zip.file('word/header1.xml', headerXml);
  zip.file('word/footer1.xml', footerXml);
  zip.file('word/document.xml', documentXml);
  const buf = zip.generate({ type: 'nodebuffer' }) as Buffer;
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, buf);
  console.log('Wrote', outPath, `(${buf.length} bytes)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
