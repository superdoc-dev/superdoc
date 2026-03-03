import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must precede module-under-test import
// ---------------------------------------------------------------------------

vi.mock('./bootstrap-content.js', () => ({
  writeBootstrapContent: vi.fn(),
  readBootstrapContent: vi.fn(() => null),
}));

vi.mock('@core/super-converter/SuperConverter.js', () => {
  const MockSuperConverter = vi.fn();
  MockSuperConverter.prototype.parts = {};
  MockSuperConverter.prototype.getSchema = vi.fn();
  return { SuperConverter: MockSuperConverter };
});

vi.mock('@core/super-converter/converter-parts.js', () => ({
  writePart: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { maybeRunLegacyBootstrapMigration, normalizeLegacyPayload } from './legacy-bootstrap-migration.js';
import { writeBootstrapContent, readBootstrapContent } from './bootstrap-content.js';
import { SuperConverter } from '@core/super-converter/SuperConverter.js';
import { writePart } from '@core/super-converter/converter-parts.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const createMockYMap = (initial = {}) => {
  const store = new Map(Object.entries(initial));
  return {
    get: vi.fn((k) => store.get(k)),
    set: vi.fn((k, v) => store.set(k, v)),
    has: vi.fn((k) => store.has(k)),
    forEach: (fn) => store.forEach(fn),
    store,
  };
};

const createMockYdoc = (mapOverrides = {}) => {
  const maps = {};
  const ydoc = {
    isDestroyed: false,
    getMap: vi.fn((name) => {
      if (!maps[name]) {
        maps[name] = mapOverrides[name] ?? createMockYMap();
      }
      return maps[name];
    }),
    transact: vi.fn((fn) => fn()),
  };
  ydoc._maps = maps;
  return ydoc;
};

const LEGACY_ENTRIES = [
  { name: 'word/document.xml', content: '<w:document/>' },
  { name: 'word/styles.xml', content: '<w:styles/>' },
  { name: 'word/numbering.xml', content: '<w:numbering/>' },
];

const createMockEditor = (overrides = {}) => ({
  converter: { parts: {}, convertedXml: {}, headers: {}, footers: {}, headerIds: {}, footerIds: {} },
  options: {
    ydoc: createMockYdoc({
      meta: createMockYMap({ docx: LEGACY_ENTRIES }),
      bootstrapDocxParts: createMockYMap(),
      ooxmlPartMeta: createMockYMap(),
    }),
    fonts: [{ name: 'Arial' }],
    user: { id: 'user-1' },
    ...overrides,
  },
  ...overrides,
});

// ---------------------------------------------------------------------------
// Default mock implementations
// ---------------------------------------------------------------------------

function setupDefaultSuperConverterMock() {
  SuperConverter.mockImplementation(function ({ docx }) {
    this.parts = {};
    this.convertedXml = {};
    this.headers = {};
    this.footers = {};
    this.headerIds = {};
    this.footerIds = {};
    for (const entry of docx) {
      this.parts[entry.name] = `parsed:${entry.name}`;
      this.convertedXml[entry.name] = `parsed:${entry.name}`;
    }
    this.getSchema = vi.fn(function () {
      // Simulate model-backed parts produced by getSchema
      this.parts.styles = { docDefaults: {}, styles: [] };
      this.parts['header:rId1'] = { type: 'doc', content: [] };
      // Simulate legacy collections populated by importHeadersFooters
      this.headers = { rId1: { type: 'doc', content: [] } };
      this.headerIds = { default: 'rId1', ids: ['rId1'] };
      this.footers = { rId2: { type: 'doc', content: [] } };
      this.footerIds = { default: 'rId2', ids: ['rId2'] };
    });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks();
  setupDefaultSuperConverterMock();
  readBootstrapContent.mockReturnValue(null);
});

// ===== Guard conditions =====

describe('maybeRunLegacyBootstrapMigration — guards', () => {
  it('skips when editor is null', () => {
    maybeRunLegacyBootstrapMigration(null);
    expect(writeBootstrapContent).not.toHaveBeenCalled();
  });

  it('skips when editor.converter is falsy', () => {
    maybeRunLegacyBootstrapMigration({ converter: null, options: {} });
    expect(writeBootstrapContent).not.toHaveBeenCalled();
  });

  it('skips when ydoc is absent', () => {
    const editor = createMockEditor();
    editor.options.ydoc = null;
    maybeRunLegacyBootstrapMigration(editor);
    expect(writeBootstrapContent).not.toHaveBeenCalled();
  });

  it('skips when ydoc is destroyed', () => {
    const editor = createMockEditor();
    editor.options.ydoc.isDestroyed = true;
    maybeRunLegacyBootstrapMigration(editor);
    expect(writeBootstrapContent).not.toHaveBeenCalled();
  });

  it('skips legacy migration when bootstrapDocxParts._version is already set', () => {
    const editor = createMockEditor();
    editor.options.ydoc = createMockYdoc({
      bootstrapDocxParts: createMockYMap({ _version: 1 }),
      meta: createMockYMap({ docx: LEGACY_ENTRIES }),
      ooxmlPartMeta: createMockYMap(),
    });
    maybeRunLegacyBootstrapMigration(editor);
    // No legacy migration — writeBootstrapContent not called
    expect(writeBootstrapContent).not.toHaveBeenCalled();
  });

  it('skips when meta.docx is absent', () => {
    const editor = createMockEditor();
    editor.options.ydoc = createMockYdoc({
      bootstrapDocxParts: createMockYMap(),
      meta: createMockYMap(),
      ooxmlPartMeta: createMockYMap(),
    });
    maybeRunLegacyBootstrapMigration(editor);
    expect(writeBootstrapContent).not.toHaveBeenCalled();
  });

  it('skips when _migration.bootstrap_v1 marker is already present', () => {
    const editor = createMockEditor();
    editor.options.ydoc = createMockYdoc({
      bootstrapDocxParts: createMockYMap(),
      meta: createMockYMap({ docx: LEGACY_ENTRIES }),
      ooxmlPartMeta: createMockYMap({ '_migration.bootstrap_v1': { migratedAt: '2025-01-01' } }),
    });
    maybeRunLegacyBootstrapMigration(editor);
    expect(writeBootstrapContent).not.toHaveBeenCalled();
  });

  it('skips when legacy payload is an empty array', () => {
    const editor = createMockEditor();
    editor.options.ydoc = createMockYdoc({
      bootstrapDocxParts: createMockYMap(),
      meta: createMockYMap({ docx: [] }),
      ooxmlPartMeta: createMockYMap(),
    });
    maybeRunLegacyBootstrapMigration(editor);
    expect(writeBootstrapContent).not.toHaveBeenCalled();
  });

  it('skips when no valid word/document.xml entry exists', () => {
    const editor = createMockEditor();
    editor.options.ydoc = createMockYdoc({
      bootstrapDocxParts: createMockYMap(),
      meta: createMockYMap({
        docx: [{ name: 'word/styles.xml', content: '<styles/>' }],
      }),
      ooxmlPartMeta: createMockYMap(),
    });
    maybeRunLegacyBootstrapMigration(editor);
    expect(writeBootstrapContent).not.toHaveBeenCalled();
  });

  it('skips when entries are malformed (no name/content strings)', () => {
    const editor = createMockEditor();
    editor.options.ydoc = createMockYdoc({
      bootstrapDocxParts: createMockYMap(),
      meta: createMockYMap({
        docx: [{ foo: 'bar' }, null, 42],
      }),
      ooxmlPartMeta: createMockYMap(),
    });
    maybeRunLegacyBootstrapMigration(editor);
    expect(writeBootstrapContent).not.toHaveBeenCalled();
  });

  it('is idempotent — second call is a no-op', () => {
    const ooxmlPartMeta = createMockYMap();
    const editor = createMockEditor();
    editor.options.ydoc = createMockYdoc({
      bootstrapDocxParts: createMockYMap(),
      meta: createMockYMap({ docx: LEGACY_ENTRIES }),
      ooxmlPartMeta,
    });

    maybeRunLegacyBootstrapMigration(editor);
    expect(writeBootstrapContent).toHaveBeenCalledTimes(1);

    // Second call — marker now present
    maybeRunLegacyBootstrapMigration(editor);
    expect(writeBootstrapContent).toHaveBeenCalledTimes(1);
  });
});

// ===== Happy path =====

describe('maybeRunLegacyBootstrapMigration — happy path', () => {
  it('calls writeBootstrapContent with normalized entries', () => {
    const editor = createMockEditor();
    maybeRunLegacyBootstrapMigration(editor);

    expect(writeBootstrapContent).toHaveBeenCalledTimes(1);
    expect(writeBootstrapContent).toHaveBeenCalledWith(editor.options.ydoc, LEGACY_ENTRIES, {
      fonts: editor.options.fonts,
      user: editor.options.user,
    });
  });

  it('uses meta.fonts when available', () => {
    const metaFonts = [{ name: 'Calibri' }];
    const editor = createMockEditor();
    editor.options.ydoc = createMockYdoc({
      bootstrapDocxParts: createMockYMap(),
      meta: createMockYMap({ docx: LEGACY_ENTRIES, fonts: metaFonts }),
      ooxmlPartMeta: createMockYMap(),
    });

    maybeRunLegacyBootstrapMigration(editor);

    expect(writeBootstrapContent).toHaveBeenCalledWith(
      editor.options.ydoc,
      LEGACY_ENTRIES,
      expect.objectContaining({ fonts: metaFonts }),
    );
  });

  it('writes migration marker to ooxmlPartMeta', () => {
    const ooxmlPartMeta = createMockYMap();
    const editor = createMockEditor();
    editor.options.ydoc = createMockYdoc({
      bootstrapDocxParts: createMockYMap(),
      meta: createMockYMap({ docx: LEGACY_ENTRIES }),
      ooxmlPartMeta,
    });

    maybeRunLegacyBootstrapMigration(editor);

    expect(ooxmlPartMeta.set).toHaveBeenCalledWith(
      '_migration.bootstrap_v1',
      expect.objectContaining({ partCount: 3, schemaImported: true }),
    );
  });

  it('writes migration marker inside a transaction with correct event', () => {
    const editor = createMockEditor();
    maybeRunLegacyBootstrapMigration(editor);

    expect(editor.options.ydoc.transact).toHaveBeenCalledWith(expect.any(Function), {
      event: 'legacy-bootstrap-migration',
    });
  });

  it('reconstructs model-backed parts via temp SuperConverter + getSchema', () => {
    const editor = createMockEditor();
    maybeRunLegacyBootstrapMigration(editor);

    expect(SuperConverter).toHaveBeenCalledWith({ docx: LEGACY_ENTRIES });
    const tempInstance = SuperConverter.mock.instances[0];
    expect(tempInstance.getSchema).toHaveBeenCalledTimes(1);
  });

  it('copies parts.styles (TranslatedLinkedStylesModel) into active converter', () => {
    const editor = createMockEditor();
    maybeRunLegacyBootstrapMigration(editor);

    expect(writePart).toHaveBeenCalledWith(editor.converter, 'styles', expect.objectContaining({ docDefaults: {} }));
  });

  it('copies parts["header:rId*"] (PM-JSON) into active converter', () => {
    const editor = createMockEditor();
    maybeRunLegacyBootstrapMigration(editor);

    expect(writePart).toHaveBeenCalledWith(editor.converter, 'header:rId1', expect.objectContaining({ type: 'doc' }));
  });

  it('copies raw xmljs parts (e.g., word/numbering.xml) into active converter', () => {
    const editor = createMockEditor();
    maybeRunLegacyBootstrapMigration(editor);

    expect(writePart).toHaveBeenCalledWith(editor.converter, 'word/numbering.xml', 'parsed:word/numbering.xml');
  });

  it('does NOT copy word/document.xml (owned by Yjs XmlFragment)', () => {
    const editor = createMockEditor();
    maybeRunLegacyBootstrapMigration(editor);

    const documentXmlCalls = writePart.mock.calls.filter(([, key]) => key === 'word/document.xml');
    expect(documentXmlCalls).toHaveLength(0);
  });

  it('gracefully handles getSchema failure (falls back to raw xmljs parts)', () => {
    SuperConverter.mockImplementation(function ({ docx }) {
      this.parts = {};
      this.convertedXml = {};
      this.headers = {};
      this.footers = {};
      this.headerIds = {};
      this.footerIds = {};
      for (const entry of docx) {
        this.parts[entry.name] = `parsed:${entry.name}`;
        this.convertedXml[entry.name] = `parsed:${entry.name}`;
      }
      this.getSchema = vi.fn(function () {
        throw new Error('getSchema boom');
      });
    });

    const editor = createMockEditor();
    maybeRunLegacyBootstrapMigration(editor);

    // Raw xmljs parts should still be copied
    expect(writePart).toHaveBeenCalledWith(editor.converter, 'word/styles.xml', 'parsed:word/styles.xml');
    expect(writeBootstrapContent).toHaveBeenCalledTimes(1);
  });

  it('per-key writePart failure does not abort remaining parts', () => {
    writePart.mockImplementation((converter, key) => {
      if (key === 'word/styles.xml') throw new Error('write failed');
    });

    const editor = createMockEditor();
    maybeRunLegacyBootstrapMigration(editor);

    const keys = writePart.mock.calls.map(([, k]) => k);
    expect(keys).toContain('word/numbering.xml');
  });
});

// ===== Header/footer collection copying =====

describe('maybeRunLegacyBootstrapMigration — header/footer collections', () => {
  it('copies headers dict from temp converter to active converter', () => {
    const editor = createMockEditor();
    maybeRunLegacyBootstrapMigration(editor);

    expect(editor.converter.headers).toEqual({ rId1: { type: 'doc', content: [] } });
  });

  it('copies headerIds dict from temp converter to active converter', () => {
    const editor = createMockEditor();
    maybeRunLegacyBootstrapMigration(editor);

    expect(editor.converter.headerIds).toEqual({ default: 'rId1', ids: ['rId1'] });
  });

  it('copies footers dict from temp converter to active converter', () => {
    const editor = createMockEditor();
    maybeRunLegacyBootstrapMigration(editor);

    expect(editor.converter.footers).toEqual({ rId2: { type: 'doc', content: [] } });
  });

  it('copies footerIds dict from temp converter to active converter', () => {
    const editor = createMockEditor();
    maybeRunLegacyBootstrapMigration(editor);

    expect(editor.converter.footerIds).toEqual({ default: 'rId2', ids: ['rId2'] });
  });

  it('initializes missing header/footer dicts on active converter', () => {
    const editor = createMockEditor();
    delete editor.converter.headers;
    delete editor.converter.footers;
    delete editor.converter.headerIds;
    delete editor.converter.footerIds;

    maybeRunLegacyBootstrapMigration(editor);

    expect(editor.converter.headers).toBeDefined();
    expect(editor.converter.footers).toBeDefined();
    expect(editor.converter.headerIds).toBeDefined();
    expect(editor.converter.footerIds).toBeDefined();
  });
});

// ===== Conditional migration marker =====

describe('maybeRunLegacyBootstrapMigration — conditional marker', () => {
  it('does NOT write migration marker when SuperConverter construction fails', () => {
    SuperConverter.mockImplementation(function () {
      throw new Error('construction failed');
    });

    const ooxmlPartMeta = createMockYMap();
    const editor = createMockEditor();
    editor.options.ydoc = createMockYdoc({
      bootstrapDocxParts: createMockYMap(),
      meta: createMockYMap({ docx: LEGACY_ENTRIES }),
      ooxmlPartMeta,
    });

    maybeRunLegacyBootstrapMigration(editor);

    expect(ooxmlPartMeta.set).not.toHaveBeenCalled();
  });

  it('does NOT write migration marker when all writePart calls fail', () => {
    SuperConverter.mockImplementation(function ({ docx }) {
      this.parts = {};
      this.convertedXml = {};
      this.headers = {};
      this.footers = {};
      this.headerIds = {};
      this.footerIds = {};
      // Only word/document.xml in parts (which is skipped)
      this.parts['word/document.xml'] = 'parsed';
      this.getSchema = vi.fn();
    });

    const ooxmlPartMeta = createMockYMap();
    const editor = createMockEditor();
    editor.options.ydoc = createMockYdoc({
      bootstrapDocxParts: createMockYMap(),
      meta: createMockYMap({ docx: LEGACY_ENTRIES }),
      ooxmlPartMeta,
    });

    maybeRunLegacyBootstrapMigration(editor);

    expect(ooxmlPartMeta.set).not.toHaveBeenCalled();
  });

  it('writes marker with schemaImported=true when getSchema succeeds', () => {
    const ooxmlPartMeta = createMockYMap();
    const editor = createMockEditor();
    editor.options.ydoc = createMockYdoc({
      bootstrapDocxParts: createMockYMap(),
      meta: createMockYMap({ docx: LEGACY_ENTRIES }),
      ooxmlPartMeta,
    });

    maybeRunLegacyBootstrapMigration(editor);

    expect(ooxmlPartMeta.set).toHaveBeenCalledWith(
      '_migration.bootstrap_v1',
      expect.objectContaining({ schemaImported: true }),
    );
  });

  it('writes marker with schemaImported=false when getSchema fails but raw parts copied', () => {
    SuperConverter.mockImplementation(function ({ docx }) {
      this.parts = {};
      this.convertedXml = {};
      this.headers = {};
      this.footers = {};
      this.headerIds = {};
      this.footerIds = {};
      for (const entry of docx) {
        this.parts[entry.name] = `parsed:${entry.name}`;
        this.convertedXml[entry.name] = `parsed:${entry.name}`;
      }
      this.getSchema = vi.fn(function () {
        throw new Error('getSchema failed');
      });
    });

    const ooxmlPartMeta = createMockYMap();
    const editor = createMockEditor();
    editor.options.ydoc = createMockYdoc({
      bootstrapDocxParts: createMockYMap(),
      meta: createMockYMap({ docx: LEGACY_ENTRIES }),
      ooxmlPartMeta,
    });

    maybeRunLegacyBootstrapMigration(editor);

    expect(ooxmlPartMeta.set).toHaveBeenCalledWith(
      '_migration.bootstrap_v1',
      expect.objectContaining({ schemaImported: false, partCount: 3 }),
    );
  });
});

// ===== Converter hydration from bootstrap =====

describe('maybeRunLegacyBootstrapMigration — converter hydration', () => {
  it('always hydrates from bootstrap when _version is set (even with docDefaults)', () => {
    readBootstrapContent.mockReturnValue({
      content: LEGACY_ENTRIES,
      fonts: {},
    });

    const editor = createMockEditor();
    // Simulate BLANK_DOCX converter — has docDefaults from blank template
    editor.converter.parts = { styles: { docDefaults: { rPr: {} }, styles: [] } };
    editor.options.ydoc = createMockYdoc({
      bootstrapDocxParts: createMockYMap({ _version: 1 }),
      meta: createMockYMap(),
      ooxmlPartMeta: createMockYMap(),
    });

    maybeRunLegacyBootstrapMigration(editor);

    // Should NOT do legacy migration
    expect(writeBootstrapContent).not.toHaveBeenCalled();
    // SHOULD reconstruct even though docDefaults exists (BLANK_DOCX produces them too)
    expect(SuperConverter).toHaveBeenCalledWith({ docx: LEGACY_ENTRIES });
    expect(writePart).toHaveBeenCalled();
  });

  it('hydrates blank converter from bootstrap when _version is set', () => {
    readBootstrapContent.mockReturnValue({
      content: LEGACY_ENTRIES,
      fonts: {},
    });

    const editor = createMockEditor();
    editor.converter.parts = {};
    editor.options.ydoc = createMockYdoc({
      bootstrapDocxParts: createMockYMap({ _version: 1 }),
      meta: createMockYMap(),
      ooxmlPartMeta: createMockYMap(),
    });

    maybeRunLegacyBootstrapMigration(editor);

    expect(writeBootstrapContent).not.toHaveBeenCalled();
    expect(SuperConverter).toHaveBeenCalledWith({ docx: LEGACY_ENTRIES });
    expect(writePart).toHaveBeenCalled();
  });

  it('only hydrates once per editor instance (WeakSet guard)', () => {
    readBootstrapContent.mockReturnValue({
      content: LEGACY_ENTRIES,
      fonts: {},
    });

    const editor = createMockEditor();
    editor.converter.parts = {};
    editor.options.ydoc = createMockYdoc({
      bootstrapDocxParts: createMockYMap({ _version: 1 }),
      meta: createMockYMap(),
      ooxmlPartMeta: createMockYMap(),
    });

    maybeRunLegacyBootstrapMigration(editor);
    expect(SuperConverter).toHaveBeenCalledTimes(1);

    // Second call — same editor, should be deduped
    maybeRunLegacyBootstrapMigration(editor);
    expect(SuperConverter).toHaveBeenCalledTimes(1);
  });

  it('hydrates different editors independently', () => {
    readBootstrapContent.mockReturnValue({
      content: LEGACY_ENTRIES,
      fonts: {},
    });

    const ydoc = createMockYdoc({
      bootstrapDocxParts: createMockYMap({ _version: 1 }),
      meta: createMockYMap(),
      ooxmlPartMeta: createMockYMap(),
    });

    const editor1 = createMockEditor();
    editor1.converter.parts = {};
    editor1.options.ydoc = ydoc;

    const editor2 = createMockEditor();
    editor2.converter.parts = {};
    editor2.options.ydoc = ydoc;

    maybeRunLegacyBootstrapMigration(editor1);
    maybeRunLegacyBootstrapMigration(editor2);

    expect(SuperConverter).toHaveBeenCalledTimes(2);
  });

  it('skips hydration when readBootstrapContent returns null', () => {
    readBootstrapContent.mockReturnValue(null);

    const editor = createMockEditor();
    editor.converter.parts = {};
    editor.options.ydoc = createMockYdoc({
      bootstrapDocxParts: createMockYMap({ _version: 1 }),
      meta: createMockYMap(),
      ooxmlPartMeta: createMockYMap(),
    });

    maybeRunLegacyBootstrapMigration(editor);

    expect(SuperConverter).not.toHaveBeenCalled();
  });

  it('copies header/footer collections during hydration', () => {
    readBootstrapContent.mockReturnValue({
      content: LEGACY_ENTRIES,
      fonts: {},
    });

    const editor = createMockEditor();
    editor.converter.parts = {};
    editor.options.ydoc = createMockYdoc({
      bootstrapDocxParts: createMockYMap({ _version: 1 }),
      meta: createMockYMap(),
      ooxmlPartMeta: createMockYMap(),
    });

    maybeRunLegacyBootstrapMigration(editor);

    expect(editor.converter.headers).toEqual({ rId1: { type: 'doc', content: [] } });
    expect(editor.converter.headerIds).toEqual({ default: 'rId1', ids: ['rId1'] });
    expect(editor.converter.footers).toEqual({ rId2: { type: 'doc', content: [] } });
    expect(editor.converter.footerIds).toEqual({ default: 'rId2', ids: ['rId2'] });
  });
});

// ===== normalizeLegacyPayload =====

describe('normalizeLegacyPayload', () => {
  it('handles plain Array', () => {
    const result = normalizeLegacyPayload(LEGACY_ENTRIES);
    expect(result).toEqual(LEGACY_ENTRIES);
  });

  it('handles Y.Array (.toArray())', () => {
    const yArray = {
      toArray: () => [...LEGACY_ENTRIES],
      [Symbol.iterator]: undefined,
    };
    const result = normalizeLegacyPayload(yArray);
    expect(result).toEqual(LEGACY_ENTRIES);
  });

  it('handles iterable (Array.from fallback)', () => {
    const iterable = {
      *[Symbol.iterator]() {
        for (const e of LEGACY_ENTRIES) yield e;
      },
    };
    const result = normalizeLegacyPayload(iterable);
    expect(result).toEqual(LEGACY_ENTRIES);
  });

  it('filters out malformed entries', () => {
    const mixed = [
      { name: 'word/document.xml', content: '<doc/>' },
      null,
      { name: 123, content: 'bad' },
      { name: 'word/styles.xml' },
      { content: '<orphan/>' },
    ];
    const result = normalizeLegacyPayload(mixed);
    expect(result).toEqual([{ name: 'word/document.xml', content: '<doc/>' }]);
  });

  it('returns empty array for non-iterable values', () => {
    expect(normalizeLegacyPayload(42)).toEqual([]);
    expect(normalizeLegacyPayload('string')).toEqual([]);
    expect(normalizeLegacyPayload(null)).toEqual([]);
    expect(normalizeLegacyPayload(undefined)).toEqual([]);
  });
});
