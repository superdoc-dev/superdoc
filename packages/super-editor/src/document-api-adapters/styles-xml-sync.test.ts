import { describe, it, expect } from 'vitest';
import {
  syncDocDefaultsToConvertedXml,
  syncLatentStylesToConvertedXml,
  syncStyleDefinitionToConvertedXml,
  syncAllStyleDefinitionsToConvertedXml,
} from './styles-xml-sync.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createConverter(stylesElements: unknown[] = []) {
  return {
    convertedXml: {
      'word/styles.xml': {
        name: 'root',
        elements: [{ name: 'w:styles', elements: stylesElements }],
      },
    },
    translatedLinkedStyles: {
      docDefaults: {},
      latentStyles: { lsdExceptions: [] },
      styles: [] as unknown[],
    },
  };
}

/** Stub translator that wraps the input in a named XML element. */
function createStubTranslator(xmlName: string, attrKey: string) {
  return {
    decode: ({ node }: { node: { attrs: Record<string, unknown> } }) => {
      const value = node.attrs[attrKey];
      if (!value) return undefined;
      return { name: xmlName, decoded: value };
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('syncDocDefaultsToConvertedXml', () => {
  const translator = createStubTranslator('w:docDefaults', 'docDefaults');

  it('inserts w:docDefaults when none exists', () => {
    const converter = createConverter();
    converter.translatedLinkedStyles.docDefaults = { runProperties: { bold: true } };

    syncDocDefaultsToConvertedXml(converter, translator);

    const root = converter.convertedXml['word/styles.xml'].elements![0];
    expect(root.elements![0]).toEqual({
      name: 'w:docDefaults',
      decoded: { runProperties: { bold: true } },
    });
  });

  it('replaces existing w:docDefaults in-place', () => {
    const converter = createConverter([
      { name: 'w:docDefaults', elements: [{ name: 'old' }] },
      { name: 'w:latentStyles' },
    ]);
    converter.translatedLinkedStyles.docDefaults = { runProperties: { italic: true } };

    syncDocDefaultsToConvertedXml(converter, translator);

    const root = converter.convertedXml['word/styles.xml'].elements![0];
    expect(root.elements).toHaveLength(2);
    expect(root.elements![0]).toEqual({
      name: 'w:docDefaults',
      decoded: { runProperties: { italic: true } },
    });
  });

  it('removes w:docDefaults when translator returns undefined', () => {
    const converter = createConverter([{ name: 'w:docDefaults' }]);
    // docDefaults is empty {} → translator receives empty object → returns undefined
    converter.translatedLinkedStyles.docDefaults = {};

    const emptyTranslator = {
      decode: () => undefined,
    };

    syncDocDefaultsToConvertedXml(converter, emptyTranslator);

    const root = converter.convertedXml['word/styles.xml'].elements![0];
    expect(root.elements).toHaveLength(0);
  });
});

describe('syncLatentStylesToConvertedXml', () => {
  const translator = createStubTranslator('w:latentStyles', 'latentStyles');

  it('inserts w:latentStyles when none exists', () => {
    const converter = createConverter();
    converter.translatedLinkedStyles.latentStyles = { defQFormat: true, lsdExceptions: [] };

    syncLatentStylesToConvertedXml(converter, translator);

    const root = converter.convertedXml['word/styles.xml'].elements![0];
    expect(root.elements![0]).toEqual({
      name: 'w:latentStyles',
      decoded: { defQFormat: true, lsdExceptions: [] },
    });
  });

  it('replaces existing w:latentStyles in-place', () => {
    const converter = createConverter([
      { name: 'w:docDefaults' },
      { name: 'w:latentStyles', attributes: { old: 'data' } },
    ]);
    converter.translatedLinkedStyles.latentStyles = { defQFormat: false, lsdExceptions: [] };

    syncLatentStylesToConvertedXml(converter, translator);

    const root = converter.convertedXml['word/styles.xml'].elements![0];
    expect(root.elements).toHaveLength(2);
    expect(root.elements![1]).toEqual({
      name: 'w:latentStyles',
      decoded: { defQFormat: false, lsdExceptions: [] },
    });
  });

  it('inserts w:latentStyles before w:style elements (OOXML ordering)', () => {
    const converter = createConverter([
      { name: 'w:docDefaults' },
      { name: 'w:style', attributes: { 'w:styleId': 'Normal' } },
      { name: 'w:style', attributes: { 'w:styleId': 'Heading1' } },
    ]);
    converter.translatedLinkedStyles.latentStyles = { defQFormat: true, lsdExceptions: [] };

    syncLatentStylesToConvertedXml(converter, translator);

    const root = converter.convertedXml['word/styles.xml'].elements![0];
    const names = root.elements!.map((el: Record<string, unknown>) => el.name);
    // w:latentStyles must come after w:docDefaults but before w:style
    expect(names).toEqual(['w:docDefaults', 'w:latentStyles', 'w:style', 'w:style']);
  });

  it('inserts w:latentStyles at position 0 when no w:docDefaults exists', () => {
    const converter = createConverter([{ name: 'w:style', attributes: { 'w:styleId': 'Normal' } }]);
    converter.translatedLinkedStyles.latentStyles = { defQFormat: true, lsdExceptions: [] };

    syncLatentStylesToConvertedXml(converter, translator);

    const root = converter.convertedXml['word/styles.xml'].elements![0];
    const names = root.elements!.map((el: Record<string, unknown>) => el.name);
    expect(names).toEqual(['w:latentStyles', 'w:style']);
  });
});

describe('syncStyleDefinitionToConvertedXml', () => {
  const translator = {
    decode: ({ node }: { node: { attrs: Record<string, unknown> } }) => {
      const style = node.attrs.style as { styleId?: string };
      if (!style) return undefined;
      return {
        name: 'w:style',
        attributes: { 'w:styleId': style.styleId },
        decoded: style,
      };
    },
  };

  it('replaces an existing style with matching styleId', () => {
    const converter = createConverter([
      { name: 'w:style', attributes: { 'w:styleId': 'Normal' } },
      { name: 'w:style', attributes: { 'w:styleId': 'Heading1' } },
    ]);
    converter.translatedLinkedStyles.styles = [
      { styleId: 'Normal', name: 'Normal', runProperties: { bold: true } },
      { styleId: 'Heading1', name: 'Heading 1' },
    ];

    syncStyleDefinitionToConvertedXml(converter, translator, 'Normal');

    const root = converter.convertedXml['word/styles.xml'].elements![0];
    expect(root.elements).toHaveLength(2);
    expect((root.elements![0] as Record<string, unknown>).decoded).toEqual({
      styleId: 'Normal',
      name: 'Normal',
      runProperties: { bold: true },
    });
  });

  it('appends a new style when no match found', () => {
    const converter = createConverter([{ name: 'w:style', attributes: { 'w:styleId': 'Normal' } }]);
    converter.translatedLinkedStyles.styles = [
      { styleId: 'Normal', name: 'Normal' },
      { styleId: 'Heading1', name: 'Heading 1' },
    ];

    syncStyleDefinitionToConvertedXml(converter, translator, 'Heading1');

    const root = converter.convertedXml['word/styles.xml'].elements![0];
    expect(root.elements).toHaveLength(2);
    expect(root.elements![1]).toEqual(
      expect.objectContaining({ name: 'w:style', attributes: { 'w:styleId': 'Heading1' } }),
    );
  });

  it('does nothing when styleId is not in the model', () => {
    const converter = createConverter([{ name: 'w:style', attributes: { 'w:styleId': 'Normal' } }]);
    converter.translatedLinkedStyles.styles = [{ styleId: 'Normal', name: 'Normal' }];

    syncStyleDefinitionToConvertedXml(converter, translator, 'DoesNotExist');

    const root = converter.convertedXml['word/styles.xml'].elements![0];
    expect(root.elements).toHaveLength(1);
  });
});

describe('syncAllStyleDefinitionsToConvertedXml', () => {
  const translator = {
    decode: ({ node }: { node: { attrs: Record<string, unknown> } }) => {
      const style = node.attrs.style as { styleId?: string };
      if (!style) return undefined;
      return {
        name: 'w:style',
        attributes: { 'w:styleId': style.styleId },
        decoded: style,
      };
    },
  };

  it('replaces all w:style elements while preserving non-style elements', () => {
    const converter = createConverter([
      { name: 'w:docDefaults' },
      { name: 'w:latentStyles' },
      { name: 'w:style', attributes: { 'w:styleId': 'OldStyle' } },
    ]);
    converter.translatedLinkedStyles.styles = [
      { styleId: 'Normal', name: 'Normal' },
      { styleId: 'Heading1', name: 'Heading 1' },
    ];

    syncAllStyleDefinitionsToConvertedXml(converter, translator);

    const root = converter.convertedXml['word/styles.xml'].elements![0];
    // docDefaults + latentStyles + 2 new styles
    expect(root.elements).toHaveLength(4);
    expect(root.elements![0]).toEqual({ name: 'w:docDefaults' });
    expect(root.elements![1]).toEqual({ name: 'w:latentStyles' });
    expect(root.elements![2]).toEqual(expect.objectContaining({ attributes: { 'w:styleId': 'Normal' } }));
    expect(root.elements![3]).toEqual(expect.objectContaining({ attributes: { 'w:styleId': 'Heading1' } }));
  });

  it('preserves model order in the output', () => {
    const converter = createConverter();
    converter.translatedLinkedStyles.styles = [
      { styleId: 'B', name: 'Beta' },
      { styleId: 'A', name: 'Alpha' },
    ];

    syncAllStyleDefinitionsToConvertedXml(converter, translator);

    const root = converter.convertedXml['word/styles.xml'].elements![0];
    const styleIds = root.elements!.map(
      (el: Record<string, unknown>) => (el.attributes as Record<string, string>)?.['w:styleId'],
    );
    expect(styleIds).toEqual(['B', 'A']);
  });
});
