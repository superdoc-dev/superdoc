import { describe, expect, it } from 'vitest';
import { createDocumentJson } from '@core/super-converter/v2/importer/docxImporter';
import { parseXmlToJson } from '@converter/v2/docxHelper.js';

const minimalStylesXml =
  '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  '<w:docDefaults>' +
  '<w:rPrDefault><w:rPr/></w:rPrDefault>' +
  '<w:pPrDefault><w:pPr/></w:pPrDefault>' +
  '</w:docDefaults>' +
  '<w:style w:type="paragraph" w:styleId="Normal">' +
  '<w:name w:val="Normal"/>' +
  '<w:qFormat/>' +
  '<w:pPr/>' +
  '<w:rPr/>' +
  '</w:style>' +
  '</w:styles>';

const collectNodeTypes = (node, types = []) => {
  if (!node) return types;
  if (typeof node.type === 'string') types.push(node.type);
  const content = Array.isArray(node.content) ? node.content : [];
  content.forEach((child) => collectNodeTypes(child, types));
  return types;
};

const extractPlainText = (nodes) => {
  if (!Array.isArray(nodes) || nodes.length === 0) return '';
  const parts = [];
  const walk = (node) => {
    if (!node) return;
    if (node.type === 'text' && typeof node.text === 'string') {
      parts.push(node.text);
      return;
    }
    if (Array.isArray(node.content)) {
      node.content.forEach(walk);
    }
  };
  nodes.forEach(walk);
  return parts.join('').replace(/\s+/g, ' ').trim();
};

describe('footnotes import', () => {
  it('imports w:footnoteReference and loads matching footnotes.xml entry', () => {
    const documentXml =
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body>' +
      '<w:p>' +
      '<w:r><w:t>Hello</w:t></w:r>' +
      '<w:r><w:footnoteReference w:id="1"/></w:r>' +
      '</w:p>' +
      '</w:body>' +
      '</w:document>';

    const footnotesXml =
      '<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:footnote w:id="-1" w:type="separator"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>' +
      '<w:footnote w:id="1"><w:p><w:r><w:t>Footnote text</w:t></w:r></w:p></w:footnote>' +
      '</w:footnotes>';

    const docx = {
      'word/document.xml': parseXmlToJson(documentXml),
      'word/footnotes.xml': parseXmlToJson(footnotesXml),
      'word/styles.xml': parseXmlToJson(minimalStylesXml),
    };

    const converter = { headers: {}, footers: {}, headerIds: {}, footerIds: {}, docHiglightColors: new Set() };
    const editor = { options: {}, emit: () => {} };

    const result = createDocumentJson(docx, converter, editor);
    expect(result).toBeTruthy();

    expect(Array.isArray(result.footnotes)).toBe(true);
    const footnote = result.footnotes.find((f) => f?.id === '1');
    expect(footnote).toBeTruthy();
    expect(Array.isArray(footnote.content)).toBe(true);
    expect(extractPlainText(footnote.content)).toBe('Footnote text');

    const types = collectNodeTypes(result.pmDoc);
    expect(types).toContain('footnoteReference');
  });
});
