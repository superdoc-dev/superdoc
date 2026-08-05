// @ts-check
import { describe, expect, it } from 'vitest';
import * as xmljs from 'xml-js';
import { createDocumentJson } from './docxImporter.js';

/**
 * End-to-end import cover for empty OOXML property containers (issue #3861).
 *
 * AIDEV-NOTE: Fixtures are parsed from XML strings because xml-js omits the
 * `elements` key on empty elements. Object literals using `elements: []` do not
 * reproduce the failing shape.
 */

const WORDPROCESSING_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const RELATIONSHIPS_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const parse = (xml) => xmljs.xml2js(xml, { compact: false });

const DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${WORDPROCESSING_NS}" xmlns:r="${RELATIONSHIPS_NS}">
  <w:body>
    <w:p><w:r><w:t>before</w:t></w:r></w:p>
    <w:tbl>
      <w:tblPr><w:tblStyle w:val="TableGrid"/></w:tblPr>
      <w:tblGrid><w:gridCol w:w="2880"/></w:tblGrid>
      <w:tr><w:tc><w:p><w:r><w:t>cell</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
    <w:p><w:r><w:t>after</w:t></w:r></w:p>
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>
  </w:body>
</w:document>`;

/** Table Grid inherits from a bare base and carries an empty w:rPr. */
const TABLE_STYLES = `
  <w:style w:type="table" w:styleId="TableNormal"/>
  <w:style w:type="table" w:styleId="TableGrid">
    <w:name w:val="Table Grid"/>
    <w:basedOn w:val="TableNormal"/>
    <w:rPr/>
  </w:style>`;

/**
 * @param {string} [extraStyles] Raw XML for additional `<w:style>` elements.
 */
const buildDocx = (extraStyles = '') => ({
  'word/document.xml': parse(DOCUMENT_XML),
  'word/styles.xml': parse(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
     <w:styles xmlns:w="${WORDPROCESSING_NS}">
       <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
       ${TABLE_STYLES}
       ${extraStyles}
     </w:styles>`,
  ),
  'word/_rels/document.xml.rels': parse(
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`,
  ),
});

const buildConverter = () => ({
  headerIds: {},
  headers: {},
  footers: {},
  docHiglightColors: new Set(),
  trackedChangesOptions: {},
  convertedXml: {},
});

const textOf = (node) => {
  if (!node) return '';
  if (node.type === 'text') return node.text ?? '';
  return (node.content ?? []).map(textOf).join('');
};

/**
 * Import a document whose body is always `before` / table / `after`.
 * @param {string} [extraStyles] Raw XML for additional `<w:style>` elements.
 */
const importDocument = (extraStyles) => {
  const exceptions = [];
  const editor = {
    emit: (name, payload) => {
      if (name === 'exception') exceptions.push(payload.error);
    },
    options: {},
  };

  const result = createDocumentJson(buildDocx(extraStyles), buildConverter(), editor);

  return {
    body: (result?.pmDoc?.content ?? []).map((node) => `${node.type}:${textOf(node)}`),
    styleIds: (result?.linkedStyles ?? []).map((style) => style.id),
    exceptions,
  };
};

const FULL_BODY = ['paragraph:before', 'table:cell', 'paragraph:after'];

describe('DOCX import with empty style property containers', () => {
  it('keeps a table whose style has an empty w:rPr and a bare basedOn target', () => {
    const { body, exceptions } = importDocument();

    expect(body).toEqual(FULL_BODY);
    expect(exceptions).toEqual([]);
  });

  // AIDEV-NOTE: The style catalogue is built outside the importer's per-node recovery
  // boundary, so one unreadable w:style used to abort createDocumentJson entirely.
  // getSchema then returned null and createDocument fell back to an empty document,
  // losing the whole body rather than one node. These cases must stay import-level.
  describe('incomplete style records do not discard the document', () => {
    it.each([
      [
        'w:outlineLvl without w:val',
        '<w:style w:type="paragraph" w:styleId="A"><w:pPr><w:outlineLvl/></w:pPr></w:style>',
      ],
      [
        'w:tab without attributes',
        '<w:style w:type="paragraph" w:styleId="B"><w:pPr><w:tabs><w:tab/></w:tabs></w:pPr></w:style>',
      ],
      [
        'a duplicate w:styleId whose second record is empty',
        '<w:style w:type="paragraph" w:styleId="C"><w:qFormat/></w:style><w:style w:type="paragraph" w:styleId="C"/>',
      ],
      ['a w:style without attributes', '<w:style><w:name w:val="Orphan"/></w:style>'],
    ])('imports the full body when styles.xml contains %s', (_label, extraStyles) => {
      const { body, exceptions } = importDocument(extraStyles);

      expect(body).toEqual(FULL_BODY);
      expect(exceptions).toEqual([]);
    });

    it('omits unusable style records from the catalogue but keeps the rest', () => {
      const { styleIds } = importDocument('<w:style><w:name w:val="Orphan"/></w:style>');

      expect(styleIds).toContain('TableGrid');
      expect(styleIds).not.toContain(undefined);
    });
  });
});
