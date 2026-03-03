import { describe, it, expect, vi, beforeEach } from 'vitest';
import { commitStylesMutation } from './commit-styles-mutation.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../plan-engine/revision-tracker.js', () => ({
  checkRevision: vi.fn(),
  incrementRevision: vi.fn((editor: { _revision: number }) => {
    editor._revision += 1;
    return String(editor._revision);
  }),
}));

vi.mock('../styles-xml-sync.js', () => ({
  syncDocDefaultsToConvertedXml: vi.fn(),
  syncLatentStylesToConvertedXml: vi.fn(),
  syncAllStyleDefinitionsToConvertedXml: vi.fn(),
}));

vi.mock('../../core/super-converter/v3/handlers/w/docDefaults/docDefaults-translator.js', () => ({
  translator: { decode: vi.fn() },
}));

vi.mock('../../core/super-converter/v3/handlers/w/latentStyles/latentStyles-translator.js', () => ({
  translator: { decode: vi.fn() },
}));

vi.mock('../../core/super-converter/v3/handlers/w/style/style-translator.js', () => ({
  translator: { decode: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockEditor() {
  return {
    converter: undefined as unknown,
    options: {},
    on: vi.fn(),
    emit: vi.fn(),
    _revision: 0,
    documentModified: false,
    documentGuid: 'test-guid',
    promoteToGuid: vi.fn(() => 'new-guid'),
  };
}

function createConverter(translatedLinkedStyles?: unknown) {
  return {
    convertedXml: { 'word/styles.xml': { name: 'root', elements: [{ name: 'w:styles', elements: [] }] } },
    translatedLinkedStyles: translatedLinkedStyles ?? {
      docDefaults: {},
      latentStyles: {},
      styles: [],
    },
    documentModified: false,
    documentGuid: 'test-guid',
    promoteToGuid: vi.fn(() => 'new-guid'),
  };
}

const DEFAULT_OPTIONS = { dryRun: false, expectedRevision: undefined };
const DRY_RUN_OPTIONS = { dryRun: true, expectedRevision: undefined };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('commitStylesMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('emits stylesChanged with correct payload on real mutation', () => {
    const editor = createMockEditor();
    const converter = createConverter();
    editor.converter = converter;

    commitStylesMutation({
      editor: editor as never,
      converter,
      options: DEFAULT_OPTIONS,
      source: 'styles.apply',
      mutate: ({ model }) => {
        (model.docDefaults as Record<string, unknown>).runProperties = { bold: true };
        return { before: {}, after: { bold: 'on' } };
      },
      diffScopePaths: ['docDefaults'],
    });

    expect(editor.emit).toHaveBeenCalledWith('partChanged', {
      partId: 'styles',
      changedPaths: ['docDefaults.runProperties.bold'],
      source: 'styles.apply',
    });
  });

  it('passes source through to the emitted event', () => {
    const editor = createMockEditor();
    const converter = createConverter();
    editor.converter = converter;

    commitStylesMutation({
      editor: editor as never,
      converter,
      options: DEFAULT_OPTIONS,
      source: 'custom-source',
      mutate: ({ model }) => {
        (model.docDefaults as Record<string, unknown>).italic = true;
      },
      diffScopePaths: ['docDefaults'],
    });

    expect(editor.emit).toHaveBeenCalledWith(
      'partChanged',
      expect.objectContaining({ partId: 'styles', source: 'custom-source' }),
    );
  });

  it('does not emit stylesChanged on dry-run', () => {
    const editor = createMockEditor();
    const converter = createConverter();
    editor.converter = converter;

    commitStylesMutation({
      editor: editor as never,
      converter,
      options: DRY_RUN_OPTIONS,
      source: 'styles.apply',
      mutate: ({ model }) => {
        (model.docDefaults as Record<string, unknown>).bold = true;
      },
      diffScopePaths: ['docDefaults'],
    });

    expect(editor.emit).not.toHaveBeenCalled();
  });

  it('does not emit stylesChanged on no-op mutation', () => {
    const editor = createMockEditor();
    const converter = createConverter({ docDefaults: { runProperties: { bold: true } }, latentStyles: {}, styles: [] });
    editor.converter = converter;

    commitStylesMutation({
      editor: editor as never,
      converter,
      options: DEFAULT_OPTIONS,
      source: 'styles.apply',
      mutate: () => ({ before: {}, after: {} }),
      diffScopePaths: ['docDefaults'],
    });

    expect(editor.emit).not.toHaveBeenCalled();
  });

  it('normalizes missing translatedLinkedStyles via ensureModel', () => {
    const editor = createMockEditor();
    const converter = createConverter(null);
    editor.converter = converter;

    const result = commitStylesMutation({
      editor: editor as never,
      converter,
      options: DEFAULT_OPTIONS,
      source: 'styles.apply',
      mutate: ({ model }) => {
        (model.docDefaults as Record<string, unknown>).bold = true;
        return 'mutated';
      },
      diffScopePaths: ['docDefaults'],
    });

    expect(result.changed).toBe(true);
    expect(result.result).toBe('mutated');
    // translatedLinkedStyles should have been normalized in-place
    expect(converter.translatedLinkedStyles).toEqual(
      expect.objectContaining({
        docDefaults: expect.objectContaining({ bold: true }),
        latentStyles: expect.objectContaining({ lsdExceptions: [] }),
        styles: [],
      }),
    );
  });

  it('returns changed paths scoped to docDefaults', () => {
    const editor = createMockEditor();
    const converter = createConverter();
    editor.converter = converter;

    const result = commitStylesMutation({
      editor: editor as never,
      converter,
      options: DEFAULT_OPTIONS,
      source: 'styles.apply',
      mutate: ({ model }) => {
        (model.docDefaults as Record<string, unknown>).runProperties = { fontSize: 24 };
      },
      diffScopePaths: ['docDefaults'],
    });

    expect(result.changedPaths).toEqual(['docDefaults.runProperties.fontSize']);
  });

  it('detects mutations to styles[0] when diffScopePaths is omitted', () => {
    const editor = createMockEditor();
    const converter = createConverter({
      docDefaults: {},
      latentStyles: { lsdExceptions: [] },
      styles: [{ styleId: 'Normal', name: 'Normal' }],
    });
    editor.converter = converter;

    const result = commitStylesMutation({
      editor: editor as never,
      converter,
      options: DEFAULT_OPTIONS,
      source: 'styles.apply',
      mutate: ({ model }) => {
        (model.styles as Array<Record<string, unknown>>)[0].name = 'Normal-Updated';
      },
      // no diffScopePaths — should diff the full model
    });

    expect(result.changed).toBe(true);
    expect(result.changedPaths).toEqual(expect.arrayContaining([expect.stringContaining('styles')]));
    expect(editor.emit).toHaveBeenCalledWith(
      'partChanged',
      expect.objectContaining({
        partId: 'styles',
        changedPaths: expect.arrayContaining([expect.stringContaining('styles')]),
      }),
    );
  });

  it('invokes syncDocDefaultsToConvertedXml on real changed mutation', async () => {
    const { syncDocDefaultsToConvertedXml } = await import('../styles-xml-sync.js');
    const editor = createMockEditor();
    const converter = createConverter();
    editor.converter = converter;

    commitStylesMutation({
      editor: editor as never,
      converter,
      options: DEFAULT_OPTIONS,
      source: 'styles.apply',
      mutate: ({ model }) => {
        (model.docDefaults as Record<string, unknown>).bold = true;
      },
    });

    expect(syncDocDefaultsToConvertedXml).toHaveBeenCalledWith(converter, expect.anything());
  });
});
