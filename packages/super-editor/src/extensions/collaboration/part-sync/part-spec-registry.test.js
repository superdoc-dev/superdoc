import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockStylesModel = { docDefaults: { fonts: 'default' }, latentStyles: { count: 10 }, styles: [{ id: 'Normal' }] };

vi.mock('../../../core/super-converter/translated-linked-styles-model.js', () => ({
  ensureTranslatedLinkedStylesModel: vi.fn(() => mockStylesModel),
}));
vi.mock('../../../document-api-adapters/styles-xml-sync.js', () => ({
  syncDocDefaultsToConvertedXml: vi.fn(),
  syncLatentStylesToConvertedXml: vi.fn(),
  syncAllStyleDefinitionsToConvertedXml: vi.fn(),
}));
vi.mock('../../../core/super-converter/v3/handlers/w/docDefaults/docDefaults-translator.js', () => ({
  translator: { name: 'docDefaults' },
}));
vi.mock('../../../core/super-converter/v3/handlers/w/latentStyles/latentStyles-translator.js', () => ({
  translator: { name: 'latentStyles' },
}));
vi.mock('../../../core/super-converter/v3/handlers/w/style/style-translator.js', () => ({
  translator: { name: 'style' },
}));
vi.mock('../../../document-api-adapters/plan-engine/revision-tracker.js', () => ({
  incrementRevision: vi.fn(),
}));

const mockNumberingTranslator = vi.hoisted(() => ({
  encode: vi.fn(() => ({ abstracts: { 0: {} }, definitions: { 1: {} } })),
}));
vi.mock('../../../core/super-converter/v3/handlers/w/numbering/numbering-translator.js', () => ({
  translator: mockNumberingTranslator,
}));

import {
  STYLES_SPEC,
  NUMBERING_SPEC,
  SETTINGS_SPEC,
  DOCUMENT_RELS_SPEC,
  FOOTNOTES_SPEC,
  FOOTNOTES_RELS_SPEC,
  COMMENTS_SPEC,
  COMMENTS_EXTENDED_SPEC,
  COMMENTS_IDS_SPEC,
  COMMENTS_EXTENSIBLE_SPEC,
  PEOPLE_SPEC,
  CUSTOM_PROPS_SPEC,
  CORE_PROPS_SPEC,
  FONT_TABLE_RELS_SPEC,
  THEME_SPEC,
  HEADER_FOOTER_RELS_SPEC,
  HEADER_FOOTER_CONTENT_SPEC,
  CONTENT_TYPES_SPEC,
  EXCLUDED_PART_PATHS,
  getOoxmlPartSpecs,
  getAllSpecs,
  getSpecById,
  resolveOoxmlPartKey,
  resolvePartChangedSpec,
  isExcludedFromDiscovery,
  discoverGenericSpecs,
  invalidateDiscoveredSpecs,
} from './part-spec-registry.js';

import { ensureTranslatedLinkedStylesModel } from '../../../core/super-converter/translated-linked-styles-model.js';
import {
  syncDocDefaultsToConvertedXml,
  syncLatentStylesToConvertedXml,
  syncAllStyleDefinitionsToConvertedXml,
} from '../../../document-api-adapters/styles-xml-sync.js';
import { incrementRevision } from '../../../document-api-adapters/plan-engine/revision-tracker.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockStylesModel.docDefaults = { fonts: 'default' };
  mockStylesModel.latentStyles = { count: 10 };
  mockStylesModel.styles = [{ id: 'Normal' }];
});

// ---------------------------------------------------------------------------
// Registry functions
// ---------------------------------------------------------------------------

describe('Registry functions', () => {
  it('getAllSpecs() includes STYLES_SPEC, HEADER_FOOTER_CONTENT_SPEC, and all ooxmlPartModels specs', () => {
    const all = getAllSpecs();
    expect(all).toContain(STYLES_SPEC);
    expect(all).toContain(HEADER_FOOTER_CONTENT_SPEC);
    for (const spec of getOoxmlPartSpecs()) {
      expect(all).toContain(spec);
    }
    // +2 for STYLES_SPEC and HEADER_FOOTER_CONTENT_SPEC
    expect(all.length).toBe(getOoxmlPartSpecs().length + 2);
  });

  it('getOoxmlPartSpecs() does NOT include STYLES_SPEC or HEADER_FOOTER_CONTENT_SPEC', () => {
    expect(getOoxmlPartSpecs()).not.toContain(STYLES_SPEC);
    expect(getOoxmlPartSpecs()).not.toContain(HEADER_FOOTER_CONTENT_SPEC);
  });

  it('getOoxmlPartSpecs() includes commentsExtensible and contentTypes specs', () => {
    const specs = getOoxmlPartSpecs();
    expect(specs).toContain(COMMENTS_EXTENSIBLE_SPEC);
    expect(specs).toContain(CONTENT_TYPES_SPEC);
  });

  it('getSpecById("styles") returns STYLES_SPEC', () => {
    expect(getSpecById('styles')).toBe(STYLES_SPEC);
  });

  it('getSpecById("numbering") returns NUMBERING_SPEC', () => {
    expect(getSpecById('numbering')).toBe(NUMBERING_SPEC);
  });

  it('getSpecById("commentsExtensible") returns COMMENTS_EXTENSIBLE_SPEC', () => {
    expect(getSpecById('commentsExtensible')).toBe(COMMENTS_EXTENSIBLE_SPEC);
  });

  it('getSpecById("contentTypes") returns CONTENT_TYPES_SPEC', () => {
    expect(getSpecById('contentTypes')).toBe(CONTENT_TYPES_SPEC);
  });

  it('getSpecById("nonexistent") returns undefined', () => {
    expect(getSpecById('nonexistent')).toBeUndefined();
  });

  it('resolveOoxmlPartKey("numbering/root") returns matching spec and section', () => {
    const result = resolveOoxmlPartKey('numbering/root');
    expect(result).toEqual({ spec: NUMBERING_SPEC, section: 'root' });
  });

  it('THEME_SPEC.id is "theme" (must match PresentationEditor PART_INVALIDATION key)', () => {
    expect(THEME_SPEC.id).toBe('theme');
  });

  it('resolveOoxmlPartKey("unknown/something") returns null', () => {
    expect(resolveOoxmlPartKey('unknown/something')).toBeNull();
  });

  it('resolveOoxmlPartKey works for dynamic spec (headerFooterRels)', () => {
    const result = resolveOoxmlPartKey('headerFooterRels/word/_rels/header1.xml.rels');
    expect(result).toEqual({
      spec: HEADER_FOOTER_RELS_SPEC,
      section: 'word/_rels/header1.xml.rels',
    });
  });
});

// ---------------------------------------------------------------------------
// createXmlPartSpec (tested via NUMBERING_SPEC)
// ---------------------------------------------------------------------------

describe('createXmlPartSpec (NUMBERING_SPEC)', () => {
  it('has correct id and partPath', () => {
    expect(NUMBERING_SPEC.id).toBe('numbering');
    expect(NUMBERING_SPEC.partPath).toBe('word/numbering.xml');
  });

  it('channel is ooxmlPartModels', () => {
    expect(NUMBERING_SPEC.channel).toBe('ooxmlPartModels');
  });

  it('sectionKey("root") returns "numbering/root"', () => {
    expect(NUMBERING_SPEC.sectionKey('root')).toBe('numbering/root');
  });

  it('parseKey("numbering/root") returns "root"', () => {
    expect(NUMBERING_SPEC.parseKey('numbering/root')).toBe('root');
  });

  it('parseKey("settings/root") returns null (wrong prefix)', () => {
    expect(NUMBERING_SPEC.parseKey('settings/root')).toBeNull();
  });

  it('listSections returns ["root"] when convertedXml has the part', () => {
    const converter = {
      convertedXml: {
        'word/numbering.xml': { elements: [{ name: 'w:numbering' }] },
      },
    };
    expect(NUMBERING_SPEC.listSections(converter)).toEqual(['root']);
  });

  it('listSections returns [] when convertedXml is missing the part', () => {
    const converter = { convertedXml: {} };
    expect(NUMBERING_SPEC.listSections(converter)).toEqual([]);
  });

  it('listSections returns [] when elements array is empty', () => {
    const converter = {
      convertedXml: { 'word/numbering.xml': { elements: [] } },
    };
    expect(NUMBERING_SPEC.listSections(converter)).toEqual([]);
  });

  it('readSection returns the root element', () => {
    const rootEl = { name: 'w:numbering', elements: [] };
    const converter = {
      convertedXml: { 'word/numbering.xml': { elements: [rootEl] } },
    };
    expect(NUMBERING_SPEC.readSection(converter, 'root')).toBe(rootEl);
  });

  it('readSection returns null when part is missing', () => {
    const converter = { convertedXml: {} };
    expect(NUMBERING_SPEC.readSection(converter, 'root')).toBeNull();
  });

  it('validateSection returns true for objects', () => {
    expect(NUMBERING_SPEC.validateSection('root', { name: 'w:numbering' })).toBe(true);
    expect(NUMBERING_SPEC.validateSection('root', [])).toBe(true);
  });

  it('validateSection returns false for null and primitives', () => {
    expect(NUMBERING_SPEC.validateSection('root', null)).toBe(false);
    expect(NUMBERING_SPEC.validateSection('root', undefined)).toBe(false);
    expect(NUMBERING_SPEC.validateSection('root', 'string')).toBe(false);
    expect(NUMBERING_SPEC.validateSection('root', 42)).toBe(false);
  });

  it('applySection creates container if needed', () => {
    const converter = { convertedXml: {} };
    const value = { name: 'w:numbering' };
    NUMBERING_SPEC.applySection(converter, 'root', value);
    expect(converter.convertedXml['word/numbering.xml']).toEqual({ elements: [value] });
  });

  it('applySection overwrites existing root element', () => {
    const converter = {
      convertedXml: {
        'word/numbering.xml': { elements: [{ name: 'old' }] },
      },
    };
    const value = { name: 'w:numbering' };
    NUMBERING_SPEC.applySection(converter, 'root', value);
    expect(converter.convertedXml['word/numbering.xml'].elements[0]).toBe(value);
  });

  describe('afterApply', () => {
    it('re-translates numbering XML into converter.translatedNumbering', () => {
      const rootElement = { name: 'w:numbering', elements: [{ name: 'w:abstractNum' }] };
      const converter = {
        convertedXml: { 'word/numbering.xml': { elements: [rootElement] } },
        translatedNumbering: null,
      };
      const editor = { converter };

      NUMBERING_SPEC.afterApply(editor, ['root']);

      expect(mockNumberingTranslator.encode).toHaveBeenCalledWith({ nodes: [rootElement] });
      expect(converter.translatedNumbering).toEqual({ abstracts: { 0: {} }, definitions: { 1: {} } });
    });

    it('calls incrementRevision', () => {
      const rootElement = { name: 'w:numbering' };
      const converter = {
        convertedXml: { 'word/numbering.xml': { elements: [rootElement] } },
        translatedNumbering: null,
      };
      const editor = { converter };

      NUMBERING_SPEC.afterApply(editor, ['root']);

      expect(incrementRevision).toHaveBeenCalledWith(editor);
    });

    it('skips translation when converter is missing', () => {
      const editor = { converter: null };
      expect(() => NUMBERING_SPEC.afterApply(editor, ['root'])).not.toThrow();
      expect(mockNumberingTranslator.encode).not.toHaveBeenCalled();
    });

    it('clears translatedNumbering to empty model when numbering XML is deleted', () => {
      const converter = {
        convertedXml: { 'word/numbering.xml': { elements: [] } },
        translatedNumbering: { abstracts: { 0: { levels: {} } }, definitions: { 1: {} } },
      };
      const editor = { converter };

      NUMBERING_SPEC.afterApply(editor, ['root']);

      expect(mockNumberingTranslator.encode).not.toHaveBeenCalled();
      expect(converter.translatedNumbering).toEqual({ abstracts: {}, definitions: {} });
      expect(incrementRevision).toHaveBeenCalledWith(editor);
    });

    it('reads from converter.parts when convertedXml is missing the part', () => {
      const rootElement = { name: 'w:numbering' };
      const converter = {
        parts: { 'word/numbering.xml': { elements: [rootElement] } },
        convertedXml: {},
        translatedNumbering: null,
      };
      const editor = { converter };

      NUMBERING_SPEC.afterApply(editor, ['root']);

      expect(mockNumberingTranslator.encode).toHaveBeenCalledWith({ nodes: [rootElement] });
    });
  });
});

// ---------------------------------------------------------------------------
// createDynamicXmlPartSpec (tested via HEADER_FOOTER_RELS_SPEC)
// ---------------------------------------------------------------------------

describe('createDynamicXmlPartSpec (HEADER_FOOTER_RELS_SPEC)', () => {
  it('has correct id and channel', () => {
    expect(HEADER_FOOTER_RELS_SPEC.id).toBe('headerFooterRels');
    expect(HEADER_FOOTER_RELS_SPEC.channel).toBe('ooxmlPartModels');
  });

  it('listSections returns paths matching the regex', () => {
    const converter = {
      convertedXml: {
        'word/_rels/header1.xml.rels': { elements: [{}] },
        'word/_rels/footer2.xml.rels': { elements: [{}] },
        'word/_rels/document.xml.rels': { elements: [{}] },
        'word/numbering.xml': { elements: [{}] },
      },
    };
    const sections = HEADER_FOOTER_RELS_SPEC.listSections(converter);
    expect(sections).toContain('word/_rels/header1.xml.rels');
    expect(sections).toContain('word/_rels/footer2.xml.rels');
    expect(sections).toHaveLength(2);
  });

  it('listSections excludes non-matching paths', () => {
    const converter = {
      convertedXml: {
        'word/_rels/document.xml.rels': { elements: [{}] },
        'word/styles.xml': { elements: [{}] },
      },
    };
    expect(HEADER_FOOTER_RELS_SPEC.listSections(converter)).toEqual([]);
  });

  it('listSections handles missing convertedXml', () => {
    const converter = {};
    expect(HEADER_FOOTER_RELS_SPEC.listSections(converter)).toEqual([]);
  });

  it('readSection reads from the specific path', () => {
    const rootEl = { name: 'Relationships' };
    const converter = {
      convertedXml: {
        'word/_rels/header1.xml.rels': { elements: [rootEl] },
      },
    };
    expect(HEADER_FOOTER_RELS_SPEC.readSection(converter, 'word/_rels/header1.xml.rels')).toBe(rootEl);
  });

  it('readSection returns null for missing path', () => {
    const converter = { convertedXml: {} };
    expect(HEADER_FOOTER_RELS_SPEC.readSection(converter, 'word/_rels/header1.xml.rels')).toBeNull();
  });

  it('applySection creates container for new path', () => {
    const converter = { convertedXml: {} };
    const value = { name: 'Relationships' };
    HEADER_FOOTER_RELS_SPEC.applySection(converter, 'word/_rels/header1.xml.rels', value);
    expect(converter.convertedXml['word/_rels/header1.xml.rels']).toEqual({ elements: [value] });
  });

  it('applySection overwrites existing element at path', () => {
    const converter = {
      convertedXml: {
        'word/_rels/header1.xml.rels': { elements: [{ name: 'old' }] },
      },
    };
    const value = { name: 'Relationships' };
    HEADER_FOOTER_RELS_SPEC.applySection(converter, 'word/_rels/header1.xml.rels', value);
    expect(converter.convertedXml['word/_rels/header1.xml.rels'].elements[0]).toBe(value);
  });

  it('sectionKey and parseKey round-trip correctly', () => {
    const path = 'word/_rels/footer3.xml.rels';
    const key = HEADER_FOOTER_RELS_SPEC.sectionKey(path);
    expect(key).toBe(`headerFooterRels/${path}`);
    expect(HEADER_FOOTER_RELS_SPEC.parseKey(key)).toBe(path);
  });
});

// ---------------------------------------------------------------------------
// STYLES_SPEC
// ---------------------------------------------------------------------------

describe('STYLES_SPEC', () => {
  it('channel is stylesModel', () => {
    expect(STYLES_SPEC.channel).toBe('stylesModel');
  });

  it('id is styles', () => {
    expect(STYLES_SPEC.id).toBe('styles');
  });

  it('listSections returns sections with non-null values', () => {
    const converter = {};
    const sections = STYLES_SPEC.listSections(converter);
    expect(sections).toEqual(['docDefaults', 'latentStyles', 'styles']);
    expect(ensureTranslatedLinkedStylesModel).toHaveBeenCalledWith(converter);
  });

  it('listSections excludes sections with null values', () => {
    mockStylesModel.latentStyles = null;
    const sections = STYLES_SPEC.listSections({});
    expect(sections).toEqual(['docDefaults', 'styles']);
  });

  it('readSection reads from translatedLinkedStyles model', () => {
    const converter = {};
    expect(STYLES_SPEC.readSection(converter, 'docDefaults')).toEqual({ fonts: 'default' });
    expect(STYLES_SPEC.readSection(converter, 'latentStyles')).toEqual({ count: 10 });
    expect(STYLES_SPEC.readSection(converter, 'styles')).toEqual([{ id: 'Normal' }]);
  });

  describe('validateSection', () => {
    it('styles accepts arrays', () => {
      expect(STYLES_SPEC.validateSection('styles', [])).toBe(true);
      expect(STYLES_SPEC.validateSection('styles', [{ id: 'Normal' }])).toBe(true);
    });

    it('styles rejects non-arrays', () => {
      expect(STYLES_SPEC.validateSection('styles', {})).toBe(false);
      expect(STYLES_SPEC.validateSection('styles', null)).toBe(false);
      expect(STYLES_SPEC.validateSection('styles', 'string')).toBe(false);
    });

    it('docDefaults accepts plain objects', () => {
      expect(STYLES_SPEC.validateSection('docDefaults', {})).toBe(true);
      expect(STYLES_SPEC.validateSection('docDefaults', { fonts: 'default' })).toBe(true);
    });

    it('docDefaults rejects arrays', () => {
      expect(STYLES_SPEC.validateSection('docDefaults', [])).toBe(false);
    });

    it('docDefaults rejects null', () => {
      expect(STYLES_SPEC.validateSection('docDefaults', null)).toBe(false);
    });

    it('latentStyles accepts plain objects', () => {
      expect(STYLES_SPEC.validateSection('latentStyles', { count: 5 })).toBe(true);
    });

    it('latentStyles rejects arrays and null', () => {
      expect(STYLES_SPEC.validateSection('latentStyles', [])).toBe(false);
      expect(STYLES_SPEC.validateSection('latentStyles', null)).toBe(false);
    });
  });

  it('applySection writes to the model', () => {
    const converter = {};
    const newDocDefaults = { fonts: 'updated' };
    STYLES_SPEC.applySection(converter, 'docDefaults', newDocDefaults);
    expect(mockStylesModel.docDefaults).toBe(newDocDefaults);
  });

  it('applySection writes styles array to the model', () => {
    const converter = {};
    const newStyles = [{ id: 'Heading1' }, { id: 'Heading2' }];
    STYLES_SPEC.applySection(converter, 'styles', newStyles);
    expect(mockStylesModel.styles).toBe(newStyles);
  });

  describe('afterApply', () => {
    it('only syncs changed sections (docDefaults + styles)', () => {
      const converter = {};
      const editor = { converter, emit: vi.fn() };

      STYLES_SPEC.afterApply(editor, ['docDefaults', 'styles']);

      expect(syncDocDefaultsToConvertedXml).toHaveBeenCalledWith(converter, { name: 'docDefaults' });
      expect(syncLatentStylesToConvertedXml).not.toHaveBeenCalled();
      expect(syncAllStyleDefinitionsToConvertedXml).toHaveBeenCalledWith(converter, { name: 'style' });
      expect(incrementRevision).toHaveBeenCalledWith(editor);
      expect(editor.emit).not.toHaveBeenCalled();
    });

    it('only syncs latentStyles when only that section changed', () => {
      const converter = {};
      const editor = { converter, emit: vi.fn() };

      STYLES_SPEC.afterApply(editor, ['latentStyles']);

      expect(syncDocDefaultsToConvertedXml).not.toHaveBeenCalled();
      expect(syncLatentStylesToConvertedXml).toHaveBeenCalledWith(converter, { name: 'latentStyles' });
      expect(syncAllStyleDefinitionsToConvertedXml).not.toHaveBeenCalled();
      expect(incrementRevision).toHaveBeenCalledWith(editor);
    });

    it('syncs all three when all sections changed', () => {
      const converter = {};
      const editor = { converter, emit: vi.fn() };

      STYLES_SPEC.afterApply(editor, ['docDefaults', 'latentStyles', 'styles']);

      expect(syncDocDefaultsToConvertedXml).toHaveBeenCalledWith(converter, { name: 'docDefaults' });
      expect(syncLatentStylesToConvertedXml).toHaveBeenCalledWith(converter, { name: 'latentStyles' });
      expect(syncAllStyleDefinitionsToConvertedXml).toHaveBeenCalledWith(converter, { name: 'style' });
      expect(incrementRevision).toHaveBeenCalledWith(editor);
    });
  });

  it('parseKey accepts known sections', () => {
    expect(STYLES_SPEC.parseKey('docDefaults')).toBe('docDefaults');
    expect(STYLES_SPEC.parseKey('latentStyles')).toBe('latentStyles');
    expect(STYLES_SPEC.parseKey('styles')).toBe('styles');
  });

  it('parseKey rejects unknown sections', () => {
    expect(STYLES_SPEC.parseKey('unknown')).toBeNull();
    expect(STYLES_SPEC.parseKey('numbering/root')).toBeNull();
    expect(STYLES_SPEC.parseKey('')).toBeNull();
  });

  it('sectionKey returns the section name directly', () => {
    expect(STYLES_SPEC.sectionKey('docDefaults')).toBe('docDefaults');
    expect(STYLES_SPEC.sectionKey('styles')).toBe('styles');
  });
});

// ---------------------------------------------------------------------------
// HEADER_FOOTER_CONTENT_SPEC
// ---------------------------------------------------------------------------

describe('HEADER_FOOTER_CONTENT_SPEC', () => {
  const createMockConverter = () => {
    const headerDoc = { type: 'doc', content: [] };
    const footerDoc = { type: 'doc', content: [] };
    return {
      headers: { rId1: headerDoc },
      footers: { rId2: footerDoc },
      parts: { 'header:rId1': headerDoc, 'footer:rId2': footerDoc },
      headerEditors: [],
      footerEditors: [],
      headerFooterModified: false,
    };
  };

  it('channel is headerFooterModel', () => {
    expect(HEADER_FOOTER_CONTENT_SPEC.channel).toBe('headerFooterModel');
  });

  describe('parseKey', () => {
    it('recognizes header:rId1', () => {
      expect(HEADER_FOOTER_CONTENT_SPEC.parseKey('header:rId1')).toBe('header:rId1');
    });

    it('recognizes footer:rId2', () => {
      expect(HEADER_FOOTER_CONTENT_SPEC.parseKey('footer:rId2')).toBe('footer:rId2');
    });

    it('rejects invalid keys', () => {
      expect(HEADER_FOOTER_CONTENT_SPEC.parseKey('invalid')).toBeNull();
    });

    it('rejects keys with unrecognized prefix', () => {
      expect(HEADER_FOOTER_CONTENT_SPEC.parseKey('something:else:extra')).toBeNull();
    });

    it('accepts header/footer keys with colons in sectionId', () => {
      expect(HEADER_FOOTER_CONTENT_SPEC.parseKey('header:rId:with:colons')).toBe('header:rId:with:colons');
    });
  });

  describe('listSections', () => {
    it('returns all header and footer keys', () => {
      const converter = createMockConverter();
      const sections = HEADER_FOOTER_CONTENT_SPEC.listSections(converter);
      expect(sections).toContain('header:rId1');
      expect(sections).toContain('footer:rId2');
      expect(sections).toHaveLength(2);
    });

    it('returns empty array when no headers or footers', () => {
      const converter = { headers: {}, footers: {} };
      expect(HEADER_FOOTER_CONTENT_SPEC.listSections(converter)).toEqual([]);
    });

    it('handles missing headers/footers gracefully', () => {
      const converter = {};
      expect(HEADER_FOOTER_CONTENT_SPEC.listSections(converter)).toEqual([]);
    });
  });

  describe('readSection', () => {
    it('reads from converter.headers', () => {
      const converter = createMockConverter();
      const result = HEADER_FOOTER_CONTENT_SPEC.readSection(converter, 'header:rId1');
      expect(result).toEqual({ type: 'doc', content: [] });
    });

    it('reads from converter.footers', () => {
      const converter = createMockConverter();
      const result = HEADER_FOOTER_CONTENT_SPEC.readSection(converter, 'footer:rId2');
      expect(result).toEqual({ type: 'doc', content: [] });
    });

    it('returns null for missing section', () => {
      const converter = createMockConverter();
      expect(HEADER_FOOTER_CONTENT_SPEC.readSection(converter, 'header:rId99')).toBeNull();
    });
  });

  describe('validateSection', () => {
    it('accepts objects', () => {
      expect(HEADER_FOOTER_CONTENT_SPEC.validateSection('header:rId1', { type: 'doc' })).toBe(true);
    });

    it('rejects arrays', () => {
      expect(HEADER_FOOTER_CONTENT_SPEC.validateSection('header:rId1', [])).toBe(false);
    });

    it('rejects null', () => {
      expect(HEADER_FOOTER_CONTENT_SPEC.validateSection('header:rId1', null)).toBe(false);
    });

    it('rejects primitives', () => {
      expect(HEADER_FOOTER_CONTENT_SPEC.validateSection('header:rId1', 'string')).toBe(false);
      expect(HEADER_FOOTER_CONTENT_SPEC.validateSection('header:rId1', 42)).toBe(false);
    });
  });

  describe('applySection', () => {
    it('writes to converter.headers and sets headerFooterModified', () => {
      const converter = createMockConverter();
      const newContent = { type: 'doc', content: [{ type: 'paragraph' }] };
      HEADER_FOOTER_CONTENT_SPEC.applySection(converter, 'header:rId1', newContent);
      expect(converter.headers['rId1']).toBe(newContent);
      expect(converter.headerFooterModified).toBe(true);
    });

    it('writes to converter.footers and sets headerFooterModified', () => {
      const converter = createMockConverter();
      const newContent = { type: 'doc', content: [{ type: 'paragraph' }] };
      HEADER_FOOTER_CONTENT_SPEC.applySection(converter, 'footer:rId2', newContent);
      expect(converter.footers['rId2']).toBe(newContent);
      expect(converter.headerFooterModified).toBe(true);
    });
  });

  describe('removeSection', () => {
    it('deletes from converter.headers and sets headerFooterModified', () => {
      const converter = createMockConverter();
      HEADER_FOOTER_CONTENT_SPEC.removeSection(converter, 'header:rId1');
      expect(converter.headers['rId1']).toBeUndefined();
      expect(converter.headerFooterModified).toBe(true);
    });

    it('deletes from converter.footers and sets headerFooterModified', () => {
      const converter = createMockConverter();
      HEADER_FOOTER_CONTENT_SPEC.removeSection(converter, 'footer:rId2');
      expect(converter.footers['rId2']).toBeUndefined();
      expect(converter.headerFooterModified).toBe(true);
    });
  });

  describe('afterApply', () => {
    it('calls replaceContent on matching header editors', () => {
      const replaceContent = vi.fn();
      const converter = createMockConverter();
      converter.headerEditors = [{ id: 'rId1', editor: { replaceContent } }];
      const editor = { converter, emit: vi.fn() };

      HEADER_FOOTER_CONTENT_SPEC.afterApply(editor, ['header:rId1']);

      expect(replaceContent).toHaveBeenCalledWith(converter.headers['rId1']);
    });

    it('calls replaceContent on matching footer editors', () => {
      const replaceContent = vi.fn();
      const converter = createMockConverter();
      converter.footerEditors = [{ id: 'rId2', editor: { replaceContent } }];
      const editor = { converter, emit: vi.fn() };

      HEADER_FOOTER_CONTENT_SPEC.afterApply(editor, ['footer:rId2']);

      expect(replaceContent).toHaveBeenCalledWith(converter.footers['rId2']);
    });

    it('does not call replaceContent on non-matching editors', () => {
      const replaceContent = vi.fn();
      const converter = createMockConverter();
      converter.headerEditors = [{ id: 'rId99', editor: { replaceContent } }];
      const editor = { converter, emit: vi.fn() };

      HEADER_FOOTER_CONTENT_SPEC.afterApply(editor, ['header:rId1']);

      expect(replaceContent).not.toHaveBeenCalled();
    });

    it('replaces content in section editors without emitting (engine handles emit)', () => {
      const converter = createMockConverter();
      const replaceContentSpy = vi.fn();
      converter.headerEditors = [{ id: 'rId1', editor: { replaceContent: replaceContentSpy } }];
      converter.footerEditors = [{ id: 'rId2', editor: { replaceContent: replaceContentSpy } }];
      // Seed parts so readPart returns content
      converter.parts['header:rId1'] = { type: 'doc', content: [{ type: 'paragraph' }] };
      converter.parts['footer:rId2'] = { type: 'doc', content: [{ type: 'paragraph' }] };
      const editor = { converter, emit: vi.fn() };

      HEADER_FOOTER_CONTENT_SPEC.afterApply(editor, ['header:rId1', 'footer:rId2']);

      // afterApply replaces content in editors but does NOT emit partChanged
      expect(editor.emit).not.toHaveBeenCalled();
      expect(replaceContentSpy).toHaveBeenCalledTimes(2);
    });
  });
});

// ---------------------------------------------------------------------------
// COMMENTS_EXTENSIBLE_SPEC
// ---------------------------------------------------------------------------

describe('COMMENTS_EXTENSIBLE_SPEC', () => {
  it('has expected part path and channel', () => {
    expect(COMMENTS_EXTENSIBLE_SPEC.partPath).toBe('word/commentsExtensible.xml');
    expect(COMMENTS_EXTENSIBLE_SPEC.channel).toBe('ooxmlPartModels');
  });
});

// ---------------------------------------------------------------------------
// CONTENT_TYPES_SPEC
// ---------------------------------------------------------------------------

describe('CONTENT_TYPES_SPEC', () => {
  it('uses [Content_Types].xml in ooxmlPartModels', () => {
    expect(CONTENT_TYPES_SPEC.partPath).toBe('[Content_Types].xml');
    expect(CONTENT_TYPES_SPEC.channel).toBe('ooxmlPartModels');
    expect(CONTENT_TYPES_SPEC.sectionKey('root')).toBe('contentTypes/root');
    expect(CONTENT_TYPES_SPEC.parseKey('contentTypes/root')).toBe('root');
  });

  it('normalizes declaration ordering on readSection', () => {
    const converter = {
      convertedXml: {
        '[Content_Types].xml': {
          elements: [
            {
              name: 'Types',
              elements: [
                {
                  type: 'element',
                  name: 'Override',
                  attributes: { ContentType: 'app/doc', PartName: '/word/document.xml' },
                },
                {
                  type: 'element',
                  name: 'Default',
                  attributes: { ContentType: 'image/png', Extension: 'png' },
                },
                {
                  type: 'element',
                  name: 'Default',
                  attributes: { Extension: 'jpeg', ContentType: 'image/jpeg' },
                },
              ],
            },
          ],
        },
      },
    };

    const root = CONTENT_TYPES_SPEC.readSection(converter, 'root');
    const names = root.elements.map((el) => `${el.name}:${el.attributes.Extension ?? el.attributes.PartName}`);
    expect(names).toEqual(['Default:jpeg', 'Default:png', 'Override:/word/document.xml']);
  });

  it('validateSection accepts plain objects and rejects arrays', () => {
    expect(CONTENT_TYPES_SPEC.validateSection('root', { name: 'Types' })).toBe(true);
    expect(CONTENT_TYPES_SPEC.validateSection('root', [])).toBe(false);
  });

  it('normalizes declaration ordering on applySection', () => {
    const converter = { convertedXml: {} };

    CONTENT_TYPES_SPEC.applySection(converter, 'root', {
      name: 'Types',
      elements: [
        {
          type: 'element',
          name: 'Override',
          attributes: { ContentType: 'app/styles', PartName: '/word/styles.xml' },
        },
        {
          type: 'element',
          name: 'Default',
          attributes: { ContentType: 'application/xml', Extension: 'xml' },
        },
      ],
    });

    const root = converter.convertedXml['[Content_Types].xml'].elements[0];
    const names = root.elements.map((el) => `${el.name}:${el.attributes.Extension ?? el.attributes.PartName}`);
    expect(names).toEqual(['Default:xml', 'Override:/word/styles.xml']);
  });
});

// ---------------------------------------------------------------------------
// EXCLUDED_PART_PATHS
// ---------------------------------------------------------------------------

describe('EXCLUDED_PART_PATHS', () => {
  it('contains word/document.xml', () => {
    expect(EXCLUDED_PART_PATHS.has('word/document.xml')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Prefix index (resolveOoxmlPartKey)
// ---------------------------------------------------------------------------

describe('resolveOoxmlPartKey — prefix index', () => {
  it('resolves HEADER_FOOTER_RELS_SPEC via pattern fallback', () => {
    const result = resolveOoxmlPartKey('headerFooterRels/word/_rels/footer2.xml.rels');
    expect(result).toEqual({
      spec: HEADER_FOOTER_RELS_SPEC,
      section: 'word/_rels/footer2.xml.rels',
    });
  });

  it('resolves static prefix specs via O(1) index', () => {
    const result = resolveOoxmlPartKey('settings/root');
    expect(result).toEqual({ spec: SETTINGS_SPEC, section: 'root' });
  });

  it('resolves with converter for dynamic specs', () => {
    const converter = {
      parts: {
        'customXml/item1.xml': { elements: [{ name: 'root' }] },
      },
    };
    // Hex-encoded ID: customXml/item1.xml → customXml_2Fitem1_2Exml
    const result = resolveOoxmlPartKey('dyn_customXml_2Fitem1_2Exml/root', converter);
    expect(result).not.toBeNull();
    expect(result.section).toBe('root');
  });

  it('resolves dyn_* keys from incoming key even when part is not local yet', () => {
    const converter = { parts: {} };
    const result = resolveOoxmlPartKey('dyn_customXml_2FremoteOnly_2Exml/root', converter);
    expect(result).not.toBeNull();
    expect(result.spec.id).toBe('dyn_customXml_2FremoteOnly_2Exml');
    expect(result.spec.partPath).toBe('customXml/remoteOnly.xml');
    expect(result.section).toBe('root');
  });

  it('rejects inferred dyn_* keys that decode to excluded/static-covered paths', () => {
    const converter = { parts: {} };
    const result = resolveOoxmlPartKey('dyn_word_2Fdocument_2Exml/root', converter);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolvePartChangedSpec
// ---------------------------------------------------------------------------

describe('resolvePartChangedSpec', () => {
  it('routes styles with section hints from changedPaths', () => {
    const result = resolvePartChangedSpec('styles', ['docDefaults.fonts', 'styles.Normal']);
    expect(result.spec).toBe(STYLES_SPEC);
    expect(result.sectionHints).toEqual(['docDefaults', 'styles']);
  });

  it('normalizes styles array-index changed paths to valid style sections', () => {
    const result = resolvePartChangedSpec('styles', ['styles[0].name', 'styles[10].runProperties.bold']);
    expect(result.spec).toBe(STYLES_SPEC);
    expect(result.sectionHints).toEqual(['styles']);
  });

  it('falls back to full styles publish when changedPaths do not map to known sections', () => {
    const result = resolvePartChangedSpec('styles', ['unknownBranch.value']);
    expect(result.spec).toBe(STYLES_SPEC);
    expect(result.sectionHints).toBeUndefined();
  });

  it('routes header:rId1 to HEADER_FOOTER_CONTENT_SPEC', () => {
    const result = resolvePartChangedSpec('header:rId1');
    expect(result.spec).toBe(HEADER_FOOTER_CONTENT_SPEC);
    expect(result.sectionHints).toEqual(['header:rId1']);
  });

  it('routes footer:rId2 to HEADER_FOOTER_CONTENT_SPEC', () => {
    const result = resolvePartChangedSpec('footer:rId2');
    expect(result.spec).toBe(HEADER_FOOTER_CONTENT_SPEC);
    expect(result.sectionHints).toEqual(['footer:rId2']);
  });

  it('routes numbering to NUMBERING_SPEC with no sectionHints', () => {
    const result = resolvePartChangedSpec('numbering');
    expect(result.spec).toBe(NUMBERING_SPEC);
    expect(result.sectionHints).toBeUndefined();
  });

  it('returns null for unknown partId', () => {
    const result = resolvePartChangedSpec('unknown-spec-id');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Dynamic generic discovery
// ---------------------------------------------------------------------------

describe('isExcludedFromDiscovery', () => {
  it('excludes word/document.xml', () => {
    expect(isExcludedFromDiscovery('word/document.xml')).toBe(true);
  });

  it('excludes binary extensions', () => {
    expect(isExcludedFromDiscovery('word/media/image1.png')).toBe(true);
    expect(isExcludedFromDiscovery('word/media/image2.jpg')).toBe(true);
    expect(isExcludedFromDiscovery('word/embeddings/oleObject1.bin')).toBe(true);
  });

  it('excludes model keys (no / and no [)', () => {
    expect(isExcludedFromDiscovery('styles')).toBe(true);
    expect(isExcludedFromDiscovery('numbering')).toBe(true);
  });

  it('excludes static-covered paths', () => {
    expect(isExcludedFromDiscovery('word/styles.xml')).toBe(true);
    expect(isExcludedFromDiscovery('word/numbering.xml')).toBe(true);
    expect(isExcludedFromDiscovery('word/settings.xml')).toBe(true);
  });

  it('excludes paths matching static patterns (header/footer rels)', () => {
    expect(isExcludedFromDiscovery('word/_rels/header1.xml.rels')).toBe(true);
  });

  it('allows uncovered XML parts', () => {
    expect(isExcludedFromDiscovery('customXml/item1.xml')).toBe(false);
    expect(isExcludedFromDiscovery('word/glossary/document.xml')).toBe(false);
  });
});

describe('discoverGenericSpecs', () => {
  it('returns specs for uncovered XML keys', () => {
    const converter = {
      parts: {
        'customXml/item1.xml': { elements: [{ name: 'root' }] },
        'customXml/itemProps1.xml': { elements: [{ name: 'props' }] },
      },
    };
    const specs = discoverGenericSpecs(converter);
    expect(specs.length).toBe(2);
    expect(specs.every((s) => s.id.startsWith('dyn_'))).toBe(true);
  });

  it('excludes word/document.xml and binary files', () => {
    const converter = {
      parts: {
        'word/document.xml': { elements: [{}] },
        'word/media/image1.png': 'binary-data',
        'customXml/item1.xml': { elements: [{ name: 'root' }] },
      },
    };
    const specs = discoverGenericSpecs(converter);
    expect(specs.length).toBe(1);
    expect(specs[0].partPath).toBe('customXml/item1.xml');
  });

  it('excludes static-covered paths', () => {
    const converter = {
      parts: {
        'word/numbering.xml': { elements: [{}] },
        'word/settings.xml': { elements: [{}] },
      },
    };
    const specs = discoverGenericSpecs(converter);
    expect(specs.length).toBe(0);
  });

  it('caches per converter', () => {
    const converter = {
      parts: { 'customXml/item1.xml': { elements: [{ name: 'root' }] } },
    };
    const first = discoverGenericSpecs(converter);
    const second = discoverGenericSpecs(converter);
    expect(first).toBe(second);
  });

  it('returns empty array for null converter', () => {
    expect(discoverGenericSpecs(null)).toEqual([]);
  });

  it('assigns deterministic unique IDs for paths that differ only by separator', () => {
    const converter = {
      parts: {
        'custom/a-b.xml': { elements: [{ name: 'root' }] },
        'custom/a_b.xml': { elements: [{ name: 'root' }] },
        'custom/a/b.xml': { elements: [{ name: 'root' }] },
      },
    };
    invalidateDiscoveredSpecs(converter);
    const specs = discoverGenericSpecs(converter);
    expect(specs.length).toBe(3);
    const ids = specs.map((s) => s.id);
    // All IDs must be unique — hex encoding distinguishes every separator
    expect(new Set(ids).size).toBe(3);
    // Verify hex encoding: each non-alphanumeric char → _XX
    const specForDash = specs.find((s) => s.partPath === 'custom/a-b.xml');
    const specForUnderscore = specs.find((s) => s.partPath === 'custom/a_b.xml');
    const specForSlash = specs.find((s) => s.partPath === 'custom/a/b.xml');
    expect(specForDash.id).toBe('dyn_custom_2Fa_2Db_2Exml');
    expect(specForUnderscore.id).toBe('dyn_custom_2Fa_5Fb_2Exml');
    expect(specForSlash.id).toBe('dyn_custom_2Fa_2Fb_2Exml');
  });

  it('produces identical IDs across independent discovery runs for same paths', () => {
    const converter1 = {
      parts: { 'customXml/item_1.xml': { elements: [{ name: 'root' }] } },
    };
    const converter2 = {
      parts: { 'customXml/item_1.xml': { elements: [{ name: 'root' }] } },
    };
    invalidateDiscoveredSpecs(converter1);
    invalidateDiscoveredSpecs(converter2);
    const specs1 = discoverGenericSpecs(converter1);
    const specs2 = discoverGenericSpecs(converter2);
    expect(specs1[0].id).toBe(specs2[0].id);
  });

  it('re-registers cached dynamic prefixes after another converter invalidates', () => {
    const converter1 = {
      parts: { 'customXml/item1.xml': { elements: [{ name: 'root' }] } },
    };
    const converter2 = {
      parts: { 'customXml/item1.xml': { elements: [{ name: 'root' }] } },
    };

    discoverGenericSpecs(converter1);
    discoverGenericSpecs(converter2);

    // This removes dyn_customXml_2Fitem1_2Exml/ from the shared prefix index.
    invalidateDiscoveredSpecs(converter1);

    const result = resolveOoxmlPartKey('dyn_customXml_2Fitem1_2Exml/root', converter2);
    expect(result).not.toBeNull();
    expect(result.section).toBe('root');
  });
});

describe('invalidateDiscoveredSpecs', () => {
  it('clears cache so next call re-discovers', () => {
    const converter = {
      parts: { 'customXml/item1.xml': { elements: [{ name: 'root' }] } },
    };
    const first = discoverGenericSpecs(converter);
    expect(first.length).toBe(1);

    invalidateDiscoveredSpecs(converter);

    // Add a new part
    converter.parts['customXml/item2.xml'] = { elements: [{ name: 'root' }] };
    const second = discoverGenericSpecs(converter);
    expect(second.length).toBe(2);
    expect(second).not.toBe(first);
  });

  it('is safe to call with null', () => {
    expect(() => invalidateDiscoveredSpecs(null)).not.toThrow();
  });
});

describe('getOoxmlPartSpecs with converter', () => {
  it('includes dynamic specs when converter has uncovered parts', () => {
    const converter = {
      parts: { 'customXml/item1.xml': { elements: [{ name: 'root' }] } },
    };
    invalidateDiscoveredSpecs(converter);
    const specs = getOoxmlPartSpecs(converter);
    expect(specs.length).toBeGreaterThan(getOoxmlPartSpecs().length);
  });
});

describe('getAllSpecs with converter', () => {
  it('includes dynamic specs when converter has uncovered parts', () => {
    const converter = {
      parts: { 'customXml/itemFresh.xml': { elements: [{ name: 'root' }] } },
    };
    invalidateDiscoveredSpecs(converter);
    const all = getAllSpecs(converter);
    expect(all.length).toBeGreaterThan(getAllSpecs().length);
  });
});
