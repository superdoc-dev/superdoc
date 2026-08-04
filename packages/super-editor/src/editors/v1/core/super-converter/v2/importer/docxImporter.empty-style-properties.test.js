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

/** Styles.xml where Table Grid inherits from a bare base and carries an empty w:rPr. */
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${WORDPROCESSING_NS}">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="table" w:styleId="TableNormal"/>
  <w:style w:type="table" w:styleId="TableGrid">
    <w:name w:val="Table Grid"/>
    <w:basedOn w:val="TableNormal"/>
    <w:rPr/>
  </w:style>
</w:styles>`;

const buildDocx = () => ({
  'word/document.xml': parse(DOCUMENT_XML),
  'word/styles.xml': parse(STYLES_XML),
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

describe('DOCX import with empty style property containers', () => {
  it('keeps a table whose style has an empty w:rPr and a bare basedOn target', () => {
    const exceptions = [];
    const editor = {
      emit: (name, payload) => {
        if (name === 'exception') exceptions.push(payload.error);
      },
      options: {},
    };

    const result = createDocumentJson(buildDocx(), buildConverter(), editor);

    const body = (result?.pmDoc?.content ?? []).map((node) => `${node.type}:${textOf(node)}`);
    expect(body).toEqual(['paragraph:before', 'table:cell', 'paragraph:after']);
    expect(exceptions).toEqual([]);
  });
});
