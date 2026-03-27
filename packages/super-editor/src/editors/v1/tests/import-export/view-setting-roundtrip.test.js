import { describe, it, expect } from 'vitest';
import { parseXmlToJson } from '@converter/v2/docxHelper.js';
import { prepareFootnotesXmlForExport } from '@converter/v2/exporter/footnotesExporter.js';
import { carbonCopy } from '@core/utilities/carbonCopy.js';

const minimalStylesXml = parseXmlToJson(
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
    '</w:styles>',
);

const makeSettingsXml = (innerXml = '') =>
  parseXmlToJson(
    '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' + innerXml + '</w:settings>',
  );

const makeDocumentXml = () =>
  parseXmlToJson(
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body><w:p><w:r><w:t>Test</w:t></w:r></w:p></w:body>' +
      '</w:document>',
  );

const findViewInSettings = (settingsJson) => {
  const root = settingsJson?.elements?.[0];
  return root?.elements?.find((el) => el?.name === 'w:view') || null;
};

describe('w:view setting roundtrip', () => {
  describe('import', () => {
    it('imports w:view with val="web" from settings.xml', async () => {
      const settingsXml = makeSettingsXml('<w:view w:val="web"/>');
      const docx = {
        'word/document.xml': makeDocumentXml(),
        'word/settings.xml': settingsXml,
        'word/styles.xml': minimalStylesXml,
      };

      const { createDocumentJson } = await import('@converter/v2/importer/docxImporter.js');
      const converter = { headers: {}, footers: {}, headerIds: {}, footerIds: {}, docHiglightColors: new Set() };
      const editor = { options: {}, emit: () => {} };

      createDocumentJson(docx, converter, editor);

      expect(converter.viewSetting).toBeDefined();
      expect(converter.viewSetting.val).toBe('web');
      expect(converter.viewSetting.originalXml).toBeDefined();
      expect(converter.viewSetting.originalXml.name).toBe('w:view');
    });

    it('imports w:view with val="print" from settings.xml', async () => {
      const settingsXml = makeSettingsXml('<w:view w:val="print"/>');
      const docx = {
        'word/document.xml': makeDocumentXml(),
        'word/settings.xml': settingsXml,
        'word/styles.xml': minimalStylesXml,
      };

      const { createDocumentJson } = await import('@converter/v2/importer/docxImporter.js');
      const converter = { headers: {}, footers: {}, headerIds: {}, footerIds: {}, docHiglightColors: new Set() };
      const editor = { options: {}, emit: () => {} };

      createDocumentJson(docx, converter, editor);

      expect(converter.viewSetting).toBeDefined();
      expect(converter.viewSetting.val).toBe('print');
    });

    it('leaves viewSetting null when settings.xml has no w:view', async () => {
      const settingsXml = makeSettingsXml('<w:compat/>');
      const docx = {
        'word/document.xml': makeDocumentXml(),
        'word/settings.xml': settingsXml,
        'word/styles.xml': minimalStylesXml,
      };

      const { createDocumentJson } = await import('@converter/v2/importer/docxImporter.js');
      const converter = {
        headers: {},
        footers: {},
        headerIds: {},
        footerIds: {},
        docHiglightColors: new Set(),
        viewSetting: null,
      };
      const editor = { options: {}, emit: () => {} };

      createDocumentJson(docx, converter, editor);

      expect(converter.viewSetting).toBeNull();
    });

    it('leaves viewSetting null when settings.xml is missing entirely', async () => {
      const docx = {
        'word/document.xml': makeDocumentXml(),
        'word/styles.xml': minimalStylesXml,
      };

      const { createDocumentJson } = await import('@converter/v2/importer/docxImporter.js');
      const converter = {
        headers: {},
        footers: {},
        headerIds: {},
        footerIds: {},
        docHiglightColors: new Set(),
        viewSetting: null,
      };
      const editor = { options: {}, emit: () => {} };

      createDocumentJson(docx, converter, editor);

      expect(converter.viewSetting).toBeNull();
    });
  });

  describe('export', () => {
    it('preserves w:view val="web" through export', () => {
      const viewXml = { type: 'element', name: 'w:view', attributes: { 'w:val': 'web' }, elements: [] };
      const converter = { viewSetting: { val: 'web', originalXml: carbonCopy(viewXml) } };
      const convertedXml = { 'word/settings.xml': makeSettingsXml('<w:compat/>') };

      const { updatedXml } = prepareFootnotesXmlForExport({
        footnotes: [],
        editor: {},
        converter,
        convertedXml,
      });

      const viewEl = findViewInSettings(updatedXml['word/settings.xml']);
      expect(viewEl).toBeDefined();
      expect(viewEl.attributes['w:val']).toBe('web');
    });

    it('preserves w:view val="print" through export', () => {
      const viewXml = { type: 'element', name: 'w:view', attributes: { 'w:val': 'print' }, elements: [] };
      const converter = { viewSetting: { val: 'print', originalXml: carbonCopy(viewXml) } };
      const convertedXml = { 'word/settings.xml': makeSettingsXml('') };

      const { updatedXml } = prepareFootnotesXmlForExport({
        footnotes: [],
        editor: {},
        converter,
        convertedXml,
      });

      const viewEl = findViewInSettings(updatedXml['word/settings.xml']);
      expect(viewEl).toBeDefined();
      expect(viewEl.attributes['w:val']).toBe('print');
    });

    it('does not add w:view when converter has no viewSetting', () => {
      const converter = { viewSetting: null };
      const convertedXml = { 'word/settings.xml': makeSettingsXml('<w:compat/>') };

      const { updatedXml } = prepareFootnotesXmlForExport({
        footnotes: [],
        editor: {},
        converter,
        convertedXml,
      });

      const viewEl = findViewInSettings(updatedXml['word/settings.xml']);
      expect(viewEl).toBeNull();
    });

    it('preserves other settings.xml elements alongside w:view', () => {
      const viewXml = { type: 'element', name: 'w:view', attributes: { 'w:val': 'web' }, elements: [] };
      const converter = { viewSetting: { val: 'web', originalXml: carbonCopy(viewXml) } };
      const convertedXml = {
        'word/settings.xml': makeSettingsXml('<w:compat/><w:defaultTabStop w:val="720"/>'),
      };

      const { updatedXml } = prepareFootnotesXmlForExport({
        footnotes: [],
        editor: {},
        converter,
        convertedXml,
      });

      const root = updatedXml['word/settings.xml']?.elements?.[0];
      const compat = root?.elements?.find((el) => el?.name === 'w:compat');
      const tabStop = root?.elements?.find((el) => el?.name === 'w:defaultTabStop');
      const viewEl = root?.elements?.find((el) => el?.name === 'w:view');

      expect(compat).toBeDefined();
      expect(tabStop).toBeDefined();
      expect(viewEl).toBeDefined();
      expect(viewEl.attributes['w:val']).toBe('web');
    });

    it('replaces existing w:view rather than duplicating', () => {
      const viewXml = { type: 'element', name: 'w:view', attributes: { 'w:val': 'normal' }, elements: [] };
      const converter = { viewSetting: { val: 'normal', originalXml: carbonCopy(viewXml) } };
      const convertedXml = {
        'word/settings.xml': makeSettingsXml('<w:view w:val="print"/><w:compat/>'),
      };

      const { updatedXml } = prepareFootnotesXmlForExport({
        footnotes: [],
        editor: {},
        converter,
        convertedXml,
      });

      const root = updatedXml['word/settings.xml']?.elements?.[0];
      const viewElements = root?.elements?.filter((el) => el?.name === 'w:view') || [];

      expect(viewElements.length).toBe(1);
      expect(viewElements[0].attributes['w:val']).toBe('normal');
    });

    it('preserves w:view position in element order', () => {
      const viewXml = { type: 'element', name: 'w:view', attributes: { 'w:val': 'web' }, elements: [] };
      const converter = { viewSetting: { val: 'web', originalXml: carbonCopy(viewXml) } };
      const convertedXml = {
        'word/settings.xml': makeSettingsXml('<w:compat/><w:view w:val="print"/><w:defaultTabStop w:val="720"/>'),
      };

      const { updatedXml } = prepareFootnotesXmlForExport({
        footnotes: [],
        editor: {},
        converter,
        convertedXml,
      });

      const root = updatedXml['word/settings.xml']?.elements?.[0];
      const names = root?.elements?.map((el) => el?.name);

      expect(names).toEqual(['w:compat', 'w:view', 'w:defaultTabStop']);
      expect(root.elements[1].attributes['w:val']).toBe('web');
    });
  });
});
