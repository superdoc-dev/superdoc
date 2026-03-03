import { describe, it, expect, vi, beforeEach } from 'vitest';
import { commitPartMutation } from './commit-part-mutation.js';

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

vi.mock('../../core/super-converter/converter-parts.js', async () => {
  const actual = (await vi.importActual('../../core/super-converter/converter-parts.js')) as Record<string, unknown>;
  return {
    ...actual,
    // Override PART_XML_SYNC to avoid importing real translators
    PART_XML_SYNC: {
      styles: vi.fn(),
    },
  };
});

import { PART_XML_SYNC } from '../../core/super-converter/converter-parts.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockEditor(parts: Record<string, unknown> = {}) {
  return {
    converter: {
      parts,
      convertedXml: {},
      documentModified: false,
      documentGuid: 'test-guid',
      promoteToGuid: vi.fn(() => 'new-guid'),
    },
    options: {},
    on: vi.fn(),
    emit: vi.fn(),
    _revision: 0,
    documentModified: false,
    documentGuid: 'test-guid',
    promoteToGuid: vi.fn(() => 'new-guid'),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('commitPartMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads model from converter.parts[partId] by default', () => {
    const model = { field: 'original' };
    const editor = createMockEditor({ myPart: model });

    commitPartMutation({
      editor: editor as any,
      partId: 'myPart',
      options: { dryRun: false, expectedRevision: undefined },
      source: 'test',
      mutate: ({ model: m }) => {
        (m as any).field = 'modified';
        return 'ok';
      },
    });

    expect(model.field).toBe('modified');
  });

  it('emits partChanged with correct payload when changed', () => {
    const model = { field: 'original' };
    const editor = createMockEditor({ myPart: model });

    commitPartMutation({
      editor: editor as any,
      partId: 'myPart',
      options: { dryRun: false, expectedRevision: undefined },
      source: 'local.test',
      mutate: ({ model: m }) => {
        (m as any).field = 'modified';
        return 'ok';
      },
    });

    const partChangedCall = editor.emit.mock.calls.find((call: unknown[]) => call[0] === 'partChanged');
    expect(partChangedCall).toBeDefined();
    expect(partChangedCall![1]).toMatchObject({
      partId: 'myPart',
      source: 'local.test',
    });
    expect(partChangedCall![1].changedPaths.length).toBeGreaterThan(0);
  });

  it('does not emit partChanged on no-op mutation', () => {
    const model = { field: 'same' };
    const editor = createMockEditor({ myPart: model });

    commitPartMutation({
      editor: editor as any,
      partId: 'myPart',
      options: { dryRun: false, expectedRevision: undefined },
      source: 'test',
      mutate: () => 'noop',
    });

    const partChangedCall = editor.emit.mock.calls.find((call: unknown[]) => call[0] === 'partChanged');
    expect(partChangedCall).toBeUndefined();
  });

  it('does not emit partChanged on dry run', () => {
    const model = { field: 'original' };
    const editor = createMockEditor({ myPart: model });

    commitPartMutation({
      editor: editor as any,
      partId: 'myPart',
      options: { dryRun: true, expectedRevision: undefined },
      source: 'test',
      mutate: ({ model: m }) => {
        (m as any).field = 'modified';
        return 'ok';
      },
    });

    const partChangedCall = editor.emit.mock.calls.find((call: unknown[]) => call[0] === 'partChanged');
    expect(partChangedCall).toBeUndefined();
  });

  it('calls PART_XML_SYNC for registered partId', () => {
    const model = { field: 'original' };
    const editor = createMockEditor({ styles: model });

    commitPartMutation({
      editor: editor as any,
      partId: 'styles',
      options: { dryRun: false, expectedRevision: undefined },
      source: 'test',
      mutate: ({ model: m }) => {
        (m as any).field = 'modified';
        return 'ok';
      },
    });

    expect((PART_XML_SYNC as any).styles).toHaveBeenCalled();
  });

  it('returns result with changed flag and paths', () => {
    const model = { field: 'original' };
    const editor = createMockEditor({ myPart: model });

    const result = commitPartMutation({
      editor: editor as any,
      partId: 'myPart',
      options: { dryRun: false, expectedRevision: undefined },
      source: 'test',
      mutate: ({ model: m }) => {
        (m as any).field = 'modified';
        return 42;
      },
    });

    expect(result.changed).toBe(true);
    expect(result.result).toBe(42);
    expect(result.changedPaths.length).toBeGreaterThan(0);
  });

  it('accepts custom ensureModel', () => {
    const editor = createMockEditor({});
    const customModel = { custom: true };

    commitPartMutation({
      editor: editor as any,
      partId: 'myPart',
      options: { dryRun: false, expectedRevision: undefined },
      source: 'test',
      ensureModel: () => customModel as any,
      mutate: ({ model: m }) => {
        expect((m as any).custom).toBe(true);
        return 'ok';
      },
    });
  });
});
