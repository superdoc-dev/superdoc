import { describe, expect, it, vi } from 'vitest';
import { addDefaultStylesIfMissing, createDocumentJson } from '@core/super-converter/v2/importer/docxImporter';
import { DEFAULT_LINKED_STYLES } from '../../core/super-converter/exporter-docx-defs';
import { parseXmlToJson } from '@converter/v2/docxHelper.js';
import { getTestDataByFileName } from '@tests/helpers/helpers.js';
import { extractParagraphText } from '@tests/helpers/getParagraphText.js';

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

describe('addDefaultStylesIfMissing', () => {
  const styles = {
    declaration: {
      attributes: {
        version: '1.0',
        encoding: 'UTF-8',
        standalone: 'yes',
      },
    },
    elements: [
      {
        type: 'element',
        name: 'w:styles',
        attributes: {
          'xmlns:mc': 'http://schemas.openxmlformats.org/markup-compatibility/2006',
          'xmlns:r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
          'xmlns:w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
          'xmlns:w14': 'http://schemas.microsoft.com/office/word/2010/wordml',
          'xmlns:w15': 'http://schemas.microsoft.com/office/word/2012/wordml',
          'xmlns:w16cex': 'http://schemas.microsoft.com/office/word/2018/wordml/cex',
          'xmlns:w16cid': 'http://schemas.microsoft.com/office/word/2016/wordml/cid',
          'xmlns:w16': 'http://schemas.microsoft.com/office/word/2018/wordml',
          'xmlns:w16du': 'http://schemas.microsoft.com/office/word/2023/wordml/word16du',
          'xmlns:w16sdtdh': 'http://schemas.microsoft.com/office/word/2020/wordml/sdtdatahash',
          'xmlns:w16sdtfl': 'http://schemas.microsoft.com/office/word/2024/wordml/sdtformatlock',
          'xmlns:w16se': 'http://schemas.microsoft.com/office/word/2015/wordml/symex',
          'mc:Ignorable': 'w14 w15 w16se w16cid w16 w16cex w16sdtdh w16sdtfl w16du',
        },
        // Assuming there's no elements for simplicity, otherwise the mock would be huge
        elements: [],
      },
    ],
  };

  it.each(Object.keys(DEFAULT_LINKED_STYLES))('adds %s as a default style', (styleId) => {
    const result = addDefaultStylesIfMissing(styles);
    const foundStyle = result.elements[0].elements.find((element) => element.attributes?.['w:styleId'] === styleId);
    expect(foundStyle).toEqual(DEFAULT_LINKED_STYLES[styleId]);
  });
});

describe('createDocumentJson', () => {
  it('handles missing document relationships gracefully', () => {
    const simpleDocXml =
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello</w:t></w:r></w:p></w:body></w:document>';

    const docx = {
      'word/document.xml': parseXmlToJson(simpleDocXml),
      'word/styles.xml': parseXmlToJson(minimalStylesXml),
    };

    const converter = {
      headers: {},
      footers: {},
      headerIds: {},
      footerIds: {},
    };

    const editor = { options: {}, emit: vi.fn() };

    const result = createDocumentJson(docx, converter, editor);

    expect(result).toBeTruthy();
    expect(converter.headers).toEqual({});
    expect(converter.footers).toEqual({});
  });

  it('imports alternatecontent_valid sample and preserves choice content', async () => {
    const docx = await getTestDataByFileName('alternateContent_valid.docx');

    const converter = {
      docHiglightColors: new Set(),
    };

    const editor = {
      options: {},
      emit: vi.fn(),
    };

    const result = createDocumentJson(docx, converter, editor);
    expect(result).toBeTruthy();

    const paragraphTexts = (result.pmDoc.content || [])
      .filter((node) => node?.type === 'paragraph')
      .map((paragraph) => extractParagraphText(paragraph));

    expect(paragraphTexts[0]).toBe('This document demonstrates valid uses of mc:AlternateContent for testing.');
    expect(paragraphTexts.some((text) => text.includes('Choice run (bold red, Requires=w14)'))).toBe(true);
    expect(paragraphTexts.some((text) => text.includes('Fallback run (plain)'))).toBe(false);
    expect(paragraphTexts.some((text) => text.includes('Choice paragraph at body level (Requires=w14)'))).toBe(true);
    expect(paragraphTexts.some((text) => text.includes('Fallback paragraph at body level'))).toBe(false);
    expect(paragraphTexts.some((text) => text.includes('Choice A: Requires=w15'))).toBe(true);

    const tableNode = result.pmDoc.content.find((node) => node?.type === 'table');
    expect(tableNode).toBeDefined();

    const tableParagraphTexts = (tableNode?.content || [])
      .flatMap((row) => row?.content || [])
      .flatMap((cell) => cell?.content || [])
      .filter((node) => node?.type === 'paragraph')
      .map((paragraph) => extractParagraphText(paragraph));

    expect(tableParagraphTexts).toContain('Cell-level AlternateContent follows:');
    expect(tableParagraphTexts).toContain('Choice paragraph inside table cell (Requires=w14)');
    expect(tableParagraphTexts).not.toContain('Fallback paragraph inside table cell');
  });

  it('synthesizes default section properties when missing', async () => {
    const docx = await getTestDataByFileName('missing-sectpr.docx');

    const converter = {
      headers: {},
      footers: {},
      headerIds: {},
      footerIds: {},
    };

    const editor = {
      options: {},
      emit: vi.fn(),
    };

    const result = createDocumentJson(docx, converter, editor);

    expect(result).toBeTruthy();
    expect(result.pageStyles.pageMargins.left).toBeCloseTo(1);
    expect(result.pageStyles.pageMargins.top).toBeCloseTo(1);
    expect(result.pageStyles.pageSize.width).toBeCloseTo(8.5);
    expect(result.pageStyles.pageSize.height).toBeCloseTo(11);
  });

  it('preserves existing section properties and fills missing values', () => {
    const simpleDocXml = `
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p><w:r><w:t>Content</w:t></w:r></w:p>
          <w:sectPr>
            <w:pgSz w:w="8000" w:h="10000" />
            <w:pgMar w:top="100" w:left="200" />
          </w:sectPr>
        </w:body>
      </w:document>
    `;

    const docx = {
      'word/document.xml': parseXmlToJson(simpleDocXml),
      'word/styles.xml': parseXmlToJson(minimalStylesXml),
    };

    const converter = {
      headers: {},
      footers: {},
      headerIds: {},
      footerIds: {},
    };

    const editor = {
      options: {},
      emit: vi.fn(),
    };

    const result = createDocumentJson(docx, converter, editor);
    const sectPr = result.savedTagsToRestore.elements.find((el) => el.name === 'w:sectPr');
    const pgSz = sectPr.elements.find((el) => el.name === 'w:pgSz');
    const pgMar = sectPr.elements.find((el) => el.name === 'w:pgMar');

    expect(pgSz.attributes['w:w']).toBe('8000');
    expect(pgSz.attributes['w:h']).toBe('10000');
    expect(pgMar.attributes['w:top']).toBe('100');
    expect(pgMar.attributes['w:left']).toBe('200');
    expect(pgMar.attributes['w:right']).toBe('1440');
    expect(pgMar.attributes['w:bottom']).toBe('1440');
    expect(result.pageStyles.pageSize.width).toBeCloseTo(8000 / 1440);
    expect(result.pageStyles.pageMargins.left).toBeCloseTo(200 / 1440);
    expect(result.pageStyles.pageMargins.top).toBeCloseTo(100 / 1440);
  });

  it('imports horizontal rules represented as pict rectangles', async () => {
    const docx = await getTestDataByFileName('missing-separator.docx');

    const converter = {
      docHiglightColors: new Set(),
    };

    const editor = {
      options: {},
      emit: vi.fn(),
    };

    const result = createDocumentJson(docx, converter, editor);

    const horizontalRules = (result.pmDoc.content || [])
      .filter((node) => node?.type === 'paragraph')
      .flatMap((paragraph) => paragraph?.content || [])
      .flatMap((child) => {
        // contentBlock may be nested inside a run
        if (child?.type === 'contentBlock') return [child];
        if (child?.type === 'run') return (child.content || []).filter((n) => n?.type === 'contentBlock');
        return [];
      })
      .filter((child) => child?.attrs?.horizontalRule);

    expect(horizontalRules).toHaveLength(3);
  });

  it('handles self-closing latentStyles in styles.xml without dropping content', () => {
    const docXml =
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello world</w:t></w:r></w:p></w:body></w:document>';
    const stylesXml =
      '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:docDefaults>' +
      '<w:rPrDefault><w:rPr/></w:rPrDefault>' +
      '<w:pPrDefault><w:pPr/></w:pPrDefault>' +
      '</w:docDefaults>' +
      '<w:latentStyles w:count="1" />' +
      '<w:style w:type="paragraph" w:styleId="Normal">' +
      '<w:name w:val="Normal"/>' +
      '<w:qFormat/>' +
      '<w:pPr/>' +
      '<w:rPr/>' +
      '</w:style>' +
      '</w:styles>';

    const docx = {
      'word/document.xml': parseXmlToJson(docXml),
      'word/styles.xml': parseXmlToJson(stylesXml),
    };

    const converter = {
      headers: {},
      footers: {},
      headerIds: {},
      footerIds: {},
      docHiglightColors: new Set(),
    };

    const editor = { options: {}, emit: vi.fn() };

    const result = createDocumentJson(docx, converter, editor);

    expect(result).toBeTruthy();

    const paragraphTexts = (result.pmDoc.content || [])
      .filter((node) => node?.type === 'paragraph')
      .map((paragraph) => extractParagraphText(paragraph));

    expect(paragraphTexts).toContain('Hello world');
  });
});
