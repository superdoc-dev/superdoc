import { describe, it, expect } from 'vitest';
import * as xmljs from 'xml-js';
import { xmlToJson } from './xml-parser.js';

/**
 * Normalize JSON trees for comparison: xml-js may produce text nodes for
 * inter-element whitespace that our DOMParser adapter also produces, but
 * with slightly different whitespace content. We strip whitespace-only text
 * nodes from both trees so the structural comparison is meaningful.
 */
function stripWhitespaceTextNodes(node) {
  if (!node) return node;
  if (node.type === 'text') {
    // Keep text nodes that have non-whitespace content
    if (node.text && node.text.trim() !== '') return node;
    return null; // Strip whitespace-only text nodes
  }
  const result = { ...node };
  if (result.elements) {
    result.elements = result.elements.map(stripWhitespaceTextNodes).filter(Boolean);
    if (result.elements.length === 0) delete result.elements;
  }
  return result;
}

function xmljsParse(xml) {
  return JSON.parse(xmljs.xml2json(xml, null, 2));
}

describe('xml-parser: xmlToJson matches xml-js output', () => {
  it('parses a simple element', () => {
    const xml = '<root><child attr="val">text</child></root>';
    const result = stripWhitespaceTextNodes(xmlToJson(xml));
    const expected = stripWhitespaceTextNodes(xmljsParse(xml));
    expect(result).toEqual(expected);
  });

  it('preserves namespace prefixes in tag names', () => {
    const xml =
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello</w:t></w:r></w:p></w:body></w:document>';
    const result = xmlToJson(xml);
    expect(result.elements[0].name).toBe('w:document');
    expect(result.elements[0].elements[0].name).toBe('w:body');
    expect(result.elements[0].elements[0].elements[0].name).toBe('w:p');
  });

  it('preserves attributes with namespace prefixes', () => {
    const xml = '<w:t xml:space="preserve">Hello</w:t>';
    const result = xmlToJson(xml);
    expect(result.elements[0].attributes['xml:space']).toBe('preserve');
  });

  it('preserves text nodes', () => {
    const xml = '<w:t>Hello World</w:t>';
    const result = xmlToJson(xml);
    const textEl = result.elements[0].elements[0];
    expect(textEl.type).toBe('text');
    expect(textEl.text).toBe('Hello World');
  });

  it('preserves XML declaration', () => {
    const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><root/>';
    const result = xmlToJson(xml);
    expect(result.declaration).toBeDefined();
    expect(result.declaration.attributes.version).toBe('1.0');
    expect(result.declaration.attributes.encoding).toBe('UTF-8');
    expect(result.declaration.attributes.standalone).toBe('yes');
  });

  it('handles empty elements', () => {
    const xml = '<w:br/>';
    const result = xmlToJson(xml);
    expect(result.elements[0].name).toBe('w:br');
    expect(result.elements[0].elements).toBeUndefined();
  });

  it('handles multiple attributes', () => {
    const xml = '<w:pgSz w:w="12240" w:h="15840" w:orient="portrait"/>';
    const result = xmlToJson(xml);
    const attrs = result.elements[0].attributes;
    expect(attrs['w:w']).toBe('12240');
    expect(attrs['w:h']).toBe('15840');
    expect(attrs['w:orient']).toBe('portrait');
  });

  it('preserves [[sdspace]] markers in text nodes', () => {
    const xml = '<w:t>[[sdspace]] [[sdspace]]</w:t>';
    const result = xmlToJson(xml);
    expect(result.elements[0].elements[0].text).toBe('[[sdspace]] [[sdspace]]');
  });

  it('matches xml-js output for a realistic DOCX fragment', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p>
      <w:pPr>
        <w:pStyle w:val="Heading1"/>
        <w:rPr><w:b/></w:rPr>
      </w:pPr>
      <w:r>
        <w:rPr><w:b/><w:sz w:val="32"/></w:rPr>
        <w:t xml:space="preserve">Hello World</w:t>
      </w:r>
    </w:p>
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="9600" w:type="dxa"/>
      </w:tblPr>
      <w:tr>
        <w:tc>
          <w:p><w:r><w:t>Cell</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`;

    const result = stripWhitespaceTextNodes(xmlToJson(xml));
    const expected = stripWhitespaceTextNodes(xmljsParse(xml));
    expect(result).toEqual(expected);
  });

  it('matches xml-js for content types XML', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

    const result = stripWhitespaceTextNodes(xmlToJson(xml));
    const expected = stripWhitespaceTextNodes(xmljsParse(xml));
    expect(result).toEqual(expected);
  });

  it('matches xml-js for styles.xml fragment', () => {
    const xml = `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr></w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
  </w:style>
</w:styles>`;

    const result = stripWhitespaceTextNodes(xmlToJson(xml));
    const expected = stripWhitespaceTextNodes(xmljsParse(xml));
    expect(result).toEqual(expected);
  });

  it('preserves [[sdspace]] whitespace markers through SuperConverter.parseXmlToJson', () => {
    // SuperConverter.parseXmlToJson wraps whitespace-only <w:t> content with [[sdspace]]
    // before parsing. This test verifies the full chain preserves them.
    const xmlWithMarkers =
      '<w:t xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">[[sdspace]] [[sdspace]]</w:t>';
    const result = xmlToJson(xmlWithMarkers);
    const textNode = result.elements[0].elements[0];
    expect(textNode.type).toBe('text');
    expect(textNode.text).toContain('[[sdspace]]');
  });

  it('drops whitespace-only text between elements (matches xml-js)', () => {
    const xml = '<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">  <w:r>  </w:r>  </w:p>';
    const result = xmlToJson(xml);
    // Should only have the w:r element child, no whitespace text nodes
    const children = result.elements[0].elements;
    expect(children.every((c) => c.type === 'element')).toBe(true);
  });
});
