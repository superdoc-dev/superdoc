import { describe, it, expect, vi, beforeEach } from 'vitest';
import { commitXmlModelMutation } from './commit-xml-model-mutation.js';
import type { CommitXmlModelMutationConfig } from './commit-xml-model-mutation.js';

// ---------------------------------------------------------------------------
// Mock revision tracker (same pattern as out-of-band-mutation.test.ts)
// ---------------------------------------------------------------------------

vi.mock('../out-of-band-mutation.js', async () => {
  const actual = await vi.importActual<typeof import('../out-of-band-mutation.js')>('../out-of-band-mutation.js');
  return actual;
});

vi.mock('../plan-engine/revision-tracker.js', () => ({
  checkRevision: vi.fn(),
  incrementRevision: vi.fn((editor: { _revision: number }) => {
    editor._revision += 1;
    return String(editor._revision);
  }),
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface TestModel {
  docDefaults: Record<string, unknown>;
  styles: Record<string, unknown>;
}

interface TestConverter {
  model: TestModel;
  documentModified: boolean;
  documentGuid: string;
  promoteToGuid: ReturnType<typeof vi.fn>;
}

function createMockEditor() {
  return {
    converter: undefined as TestConverter | undefined,
    options: {},
    on: vi.fn(),
    emit: vi.fn(),
    _revision: 0,
  };
}

function createConverter(model?: Partial<TestModel>): TestConverter {
  return {
    model: {
      docDefaults: {},
      styles: {},
      ...model,
    },
    documentModified: false,
    documentGuid: 'test-guid',
    promoteToGuid: vi.fn(() => 'new-guid'),
  };
}

const DEFAULT_OPTIONS = { dryRun: false, expectedRevision: undefined };
const DRY_RUN_OPTIONS = { dryRun: true, expectedRevision: undefined };

type TestConfig = CommitXmlModelMutationConfig<TestConverter, TestModel, unknown>;

function buildConfig(overrides: Partial<TestConfig> & Pick<TestConfig, 'editor' | 'converter'>): TestConfig {
  return {
    options: DEFAULT_OPTIONS,
    ensureModel: (converter) => converter.model,
    mutate: () => ({}),
    syncXml: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('commitXmlModelMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Dry-run isolation
  // -----------------------------------------------------------------------

  describe('dry-run isolation', () => {
    it('does not mutate the live model during dry-run', () => {
      const editor = createMockEditor();
      const converter = createConverter({ docDefaults: { bold: false } });
      editor.converter = converter;

      const result = commitXmlModelMutation(
        buildConfig({
          editor: editor as never,
          converter,
          options: DRY_RUN_OPTIONS,
          mutate: ({ model }) => {
            model.docDefaults.bold = true;
            return { patched: true };
          },
        }),
      );

      expect(result.changed).toBe(true);
      expect(result.changedPaths).toEqual(['docDefaults.bold']);
      // Live model should be untouched
      expect(converter.model.docDefaults.bold).toBe(false);
    });

    it('does not call syncXml on dry-run even when changed', () => {
      const editor = createMockEditor();
      const converter = createConverter();
      editor.converter = converter;
      const syncXml = vi.fn();

      commitXmlModelMutation(
        buildConfig({
          editor: editor as never,
          converter,
          options: DRY_RUN_OPTIONS,
          mutate: ({ model }) => {
            model.docDefaults.fontSize = 24;
          },
          syncXml,
        }),
      );

      expect(syncXml).not.toHaveBeenCalled();
    });

    it('does not call emitChanged on dry-run even when changed', () => {
      const editor = createMockEditor();
      const converter = createConverter();
      editor.converter = converter;
      const emitChanged = vi.fn();

      commitXmlModelMutation(
        buildConfig({
          editor: editor as never,
          converter,
          options: DRY_RUN_OPTIONS,
          mutate: ({ model }) => {
            model.docDefaults.fontSize = 24;
          },
          emitChanged,
        }),
      );

      expect(emitChanged).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // No-op detection
  // -----------------------------------------------------------------------

  describe('no-op detection', () => {
    it('returns changed: false when mutate does not alter the model', () => {
      const editor = createMockEditor();
      const converter = createConverter({ docDefaults: { bold: true } });
      editor.converter = converter;

      const result = commitXmlModelMutation(
        buildConfig({
          editor: editor as never,
          converter,
          mutate: () => 'no-op',
        }),
      );

      expect(result.changed).toBe(false);
      expect(result.changedPaths).toEqual([]);
      expect(result.result).toBe('no-op');
    });

    it('skips syncXml and emitChanged on no-op', () => {
      const editor = createMockEditor();
      const converter = createConverter({ docDefaults: { bold: true } });
      editor.converter = converter;
      const syncXml = vi.fn();
      const emitChanged = vi.fn();

      commitXmlModelMutation(
        buildConfig({
          editor: editor as never,
          converter,
          syncXml,
          emitChanged,
          mutate: () => 'no-op',
        }),
      );

      expect(syncXml).not.toHaveBeenCalled();
      expect(emitChanged).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Changed mutation (non-dry)
  // -----------------------------------------------------------------------

  describe('changed mutation (non-dry)', () => {
    it('calls syncXml and emitChanged with correct context', () => {
      const editor = createMockEditor();
      const converter = createConverter();
      editor.converter = converter;
      const syncXml = vi.fn();
      const emitChanged = vi.fn();

      const result = commitXmlModelMutation(
        buildConfig({
          editor: editor as never,
          converter,
          syncXml,
          emitChanged,
          mutate: ({ model }) => {
            model.docDefaults.bold = true;
            return { patched: true };
          },
        }),
      );

      expect(result.changed).toBe(true);
      expect(syncXml).toHaveBeenCalledWith({ converter, model: converter.model, changedPaths: ['docDefaults.bold'] });
      expect(emitChanged).toHaveBeenCalledWith({
        editor: editor as never,
        converter,
        model: converter.model,
        changedPaths: ['docDefaults.bold'],
        result: { patched: true },
      });
    });

    it('mutates the live model on non-dry run', () => {
      const editor = createMockEditor();
      const converter = createConverter();
      editor.converter = converter;

      commitXmlModelMutation(
        buildConfig({
          editor: editor as never,
          converter,
          mutate: ({ model }) => {
            model.docDefaults.italic = true;
          },
        }),
      );

      expect(converter.model.docDefaults.italic).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // diffScopePaths
  // -----------------------------------------------------------------------

  describe('diffScopePaths', () => {
    it('scopes diff to specified sub-trees', () => {
      const editor = createMockEditor();
      const converter = createConverter({
        docDefaults: { runProperties: { bold: false } },
        styles: { Heading1: { name: 'Heading 1' } },
      });
      editor.converter = converter;

      const result = commitXmlModelMutation(
        buildConfig({
          editor: editor as never,
          converter,
          diffScopePaths: ['docDefaults'],
          mutate: ({ model }) => {
            (model.docDefaults as Record<string, unknown>).runProperties = { bold: true };
            // This change is outside the diff scope — should NOT appear in changedPaths
            model.styles.Heading1 = { name: 'Modified' };
          },
        }),
      );

      expect(result.changed).toBe(true);
      expect(result.changedPaths).toEqual(['docDefaults.runProperties.bold']);
      // The styles change DID happen on the live model, but wasn't diffed
      expect(converter.model.styles.Heading1).toEqual({ name: 'Modified' });
    });

    it('diffs full model when diffScopePaths is omitted', () => {
      const editor = createMockEditor();
      const converter = createConverter({
        docDefaults: {},
        styles: { Heading1: { name: 'Heading 1' } },
      });
      editor.converter = converter;

      const result = commitXmlModelMutation(
        buildConfig({
          editor: editor as never,
          converter,
          mutate: ({ model }) => {
            model.styles.Heading1 = { name: 'Modified' };
          },
        }),
      );

      expect(result.changedPaths).toEqual(['styles.Heading1.name']);
    });
  });

  // -----------------------------------------------------------------------
  // Custom cloneModel
  // -----------------------------------------------------------------------

  describe('custom cloneModel', () => {
    it('uses provided cloneModel function for snapshots', () => {
      const editor = createMockEditor();
      const converter = createConverter();
      editor.converter = converter;
      const customClone = vi.fn(<T>(v: T): T => JSON.parse(JSON.stringify(v)) as T);

      commitXmlModelMutation(
        buildConfig({
          editor: editor as never,
          converter,
          cloneModel: customClone,
          mutate: ({ model }) => {
            model.docDefaults.bold = true;
          },
        }),
      );

      // Called for dry-run clone (if dry) or before-snapshot clone
      expect(customClone).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // emitChanged is optional
  // -----------------------------------------------------------------------

  describe('optional emitChanged', () => {
    it('does not throw when emitChanged is omitted and mutation changes the model', () => {
      const editor = createMockEditor();
      const converter = createConverter();
      editor.converter = converter;

      expect(() =>
        commitXmlModelMutation(
          buildConfig({
            editor: editor as never,
            converter,
            mutate: ({ model }) => {
              model.docDefaults.bold = true;
            },
            // emitChanged intentionally omitted
          }),
        ),
      ).not.toThrow();
    });
  });
});
