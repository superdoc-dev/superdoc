import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '../../core/Editor.js';
import type { PlanReceipt } from '@superdoc/document-api';
import type { ListItemProjection } from '../helpers/list-item-resolver.js';
import { registerPartDescriptor, clearPartDescriptors } from '../../core/parts/registry/part-registry.js';
import { numberingPartDescriptor } from '../../core/parts/adapters/numbering-part-descriptor.js';
import { clearInvalidationHandlers } from '../../core/parts/invalidation/part-invalidation-registry.js';

// ---------------------------------------------------------------------------
// Module mocks — hoisted before any imports of the module under test
// ---------------------------------------------------------------------------

vi.mock('./plan-wrappers.js', () => ({
  executeDomainCommand: vi.fn((_editor: Editor, handler: () => boolean): PlanReceipt => {
    const applied = handler();
    return {
      success: true,
      revision: { before: '0', after: '0' },
      steps: [
        {
          stepId: 'step-1',
          op: 'domain.command',
          effect: applied ? 'changed' : 'noop',
          matchCount: applied ? 1 : 0,
          data: { domain: 'command', commandDispatched: applied },
        },
      ],
      timing: { totalMs: 0 },
    };
  }),
}));

vi.mock('../helpers/index-cache.js', () => ({
  getBlockIndex: vi.fn(),
  clearIndexCache: vi.fn(),
}));

vi.mock('../helpers/list-item-resolver.js', () => ({
  resolveListItem: vi.fn(),
}));

vi.mock('../helpers/list-sequence-helpers.js', () => ({
  getAbstractNumId: vi.fn(),
  getContiguousSequence: vi.fn(() => []),
  findAdjacentSequence: vi.fn(() => null),
}));

vi.mock('../../core/helpers/list-numbering-helpers.js', () => ({
  ListHelpers: {
    removeLvlOverride: vi.fn(),
  },
}));

vi.mock('../../core/commands/changeListLevel.js', () => ({
  updateNumberingProperties: vi.fn(),
}));

vi.mock('../helpers/mutation-helpers.js', () => ({
  rejectTrackedMode: vi.fn(),
}));

vi.mock('../../core/helpers/list-level-formatting-helpers.js', () => ({
  LevelFormattingHelpers: {
    getPresetTemplate: vi.fn(),
    applyTemplateToAbstract: vi.fn(),
    hasLevel: vi.fn(() => true),
    hasLevelOverride: vi.fn(() => false),
    clearLevelOverride: vi.fn(),
    captureTemplate: vi.fn(),
    setLevelNumberingFormat: vi.fn(() => true),
    setLevelBulletMarker: vi.fn(() => true),
    setLevelPictureBullet: vi.fn(() => true),
    setLevelAlignment: vi.fn(() => true),
    setLevelIndents: vi.fn(() => true),
    setLevelTrailingCharacter: vi.fn(() => true),
    setLevelMarkerFont: vi.fn(() => true),
  },
}));

// ---------------------------------------------------------------------------
// Now import wrappers and mocked modules
// ---------------------------------------------------------------------------

import { listsSetTypeWrapper } from './lists-formatting-wrappers.js';
import { resolveListItem } from '../helpers/list-item-resolver.js';
import { getAbstractNumId, getContiguousSequence, findAdjacentSequence } from '../helpers/list-sequence-helpers.js';
import { LevelFormattingHelpers } from '../../core/helpers/list-level-formatting-helpers.js';
import { updateNumberingProperties } from '../../core/commands/changeListLevel.js';
import { ListHelpers } from '../../core/helpers/list-numbering-helpers.js';
import { rejectTrackedMode } from '../helpers/mutation-helpers.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Creates a mock editor.
 *
 * `state.tr` is a **getter** that returns a new transaction object on every
 * access — matching real ProseMirror behaviour. This lets tests detect the
 * bug class where code accidentally grabs multiple fresh transactions instead
 * of threading a single one.
 */
function makeBaseNumberingXml() {
  return {
    elements: [
      {
        type: 'element',
        name: 'w:numbering',
        elements: [],
      },
    ],
  };
}

function makeEditor(): Editor {
  return {
    state: {
      doc: { content: { size: 100 } },
      get tr() {
        return { setNodeMarkup: vi.fn().mockReturnThis(), _id: Math.random() };
      },
    },
    view: { dispatch: vi.fn() },
    dispatch: vi.fn(),
    emit: vi.fn(),
    converter: {
      convertedXml: {
        'word/numbering.xml': makeBaseNumberingXml(),
      },
      numbering: { definitions: {}, abstracts: {} },
      translatedNumbering: { definitions: {} },
      documentModified: false,
      documentGuid: 'test-guid',
    },
  } as unknown as Editor;
}

function makeProjection(overrides: Partial<ListItemProjection> = {}): ListItemProjection {
  return {
    address: { kind: 'block', nodeType: 'listItem', nodeId: 'p1' },
    candidate: {
      nodeType: 'listItem',
      nodeId: 'p1',
      node: { attrs: { paragraphProperties: { numberingProperties: { numId: 1, ilvl: 0 } } } },
      pos: 10,
      end: 20,
    },
    numId: 1,
    level: 0,
    kind: 'ordered',
    marker: '1.',
    ordinal: 1,
    ...overrides,
  } as unknown as ListItemProjection;
}

const MOCK_TEMPLATE = { version: 1, levels: [{ level: 0, numFmt: 'decimal', lvlText: '%1.' }] };

/**
 * Mock `applyTemplateToAbstract` so it reports `changed: true` AND
 * actually modifies `converter.numbering`, making the XML tree diff
 * detect a real change via `syncNumberingToXmlTree`.
 */
function mockApplyTemplateChanged(editorRef: Editor): void {
  vi.mocked(LevelFormattingHelpers.applyTemplateToAbstract).mockImplementation(() => {
    const conv = (editorRef as unknown as { converter: { numbering: { abstracts: Record<number, unknown> } } })
      .converter;
    conv.numbering.abstracts[10] = {
      type: 'element',
      name: 'w:abstractNum',
      attributes: { 'w:abstractNumId': '10' },
      elements: [{ type: 'element', name: 'w:lvl', attributes: { 'w:ilvl': '0' }, elements: [] }],
    };
    return { changed: true };
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let editor: ReturnType<typeof makeEditor>;

beforeEach(() => {
  vi.restoreAllMocks();
  registerPartDescriptor(numberingPartDescriptor);
  editor = makeEditor();
  // Default: getPresetTemplate returns a valid template
  vi.mocked(LevelFormattingHelpers.getPresetTemplate).mockReturnValue(MOCK_TEMPLATE);
  // Default: no adjacent sequences
  vi.mocked(findAdjacentSequence).mockReturnValue(null);
  vi.mocked(getContiguousSequence).mockReturnValue([]);
});

afterEach(() => {
  clearPartDescriptors();
  clearInvalidationHandlers();
});

describe('listsSetTypeWrapper', () => {
  // =========================================================================
  // Basic operation
  // =========================================================================

  it('applies preset and succeeds when no adjacent sequences exist', () => {
    const target = makeProjection({ numId: 1, kind: 'bullet' });
    vi.mocked(resolveListItem).mockReturnValue(target);
    vi.mocked(getAbstractNumId).mockReturnValue(10);
    mockApplyTemplateChanged(editor);
    vi.mocked(findAdjacentSequence).mockReturnValue(null);

    const result = listsSetTypeWrapper(editor, {
      target: target.address,
      kind: 'ordered',
    });

    expect(result.success).toBe(true);
    expect(LevelFormattingHelpers.applyTemplateToAbstract).toHaveBeenCalled();
    expect(LevelFormattingHelpers.getPresetTemplate).toHaveBeenCalledWith('decimal');
  });

  it('maps bullet kind to disc preset', () => {
    const target = makeProjection({ numId: 1, kind: 'ordered' });
    vi.mocked(resolveListItem).mockReturnValue(target);
    vi.mocked(getAbstractNumId).mockReturnValue(10);
    mockApplyTemplateChanged(editor);

    listsSetTypeWrapper(editor, { target: target.address, kind: 'bullet' });

    expect(LevelFormattingHelpers.getPresetTemplate).toHaveBeenCalledWith('disc');
  });

  // =========================================================================
  // Sequence merging (continuity: 'preserve')
  // =========================================================================

  it('merges adjacent previous sequence with same abstractNumId and kind', () => {
    const target = makeProjection({
      numId: 2,
      kind: 'ordered',
      address: { kind: 'block', nodeType: 'listItem', nodeId: 'item-2' },
    });
    const prevItem = makeProjection({
      numId: 1,
      kind: 'ordered',
      address: { kind: 'block', nodeType: 'listItem', nodeId: 'item-1' },
    });

    vi.mocked(resolveListItem).mockReturnValue(target);
    vi.mocked(getAbstractNumId).mockReturnValue(10);
    mockApplyTemplateChanged(editor);

    // After applying preset, findAdjacentSequence finds a compatible previous
    vi.mocked(findAdjacentSequence).mockImplementation((_ed, _tgt, direction) => {
      if (direction === 'withPrevious') {
        return { sequence: [prevItem], numId: 1, abstractNumId: 10 };
      }
      return null;
    });
    vi.mocked(getContiguousSequence).mockReturnValue([target]);

    const result = listsSetTypeWrapper(editor, {
      target: target.address,
      kind: 'ordered',
    });

    expect(result.success).toBe(true);
    // The target sequence should be reassigned to the previous sequence's numId
    expect(updateNumberingProperties).toHaveBeenCalledWith(
      { numId: 1, ilvl: 0 },
      target.candidate.node,
      target.candidate.pos,
      editor,
      expect.anything(),
    );
  });

  it('merges adjacent next sequence when no previous merge is possible', () => {
    const target = makeProjection({
      numId: 1,
      kind: 'ordered',
      address: { kind: 'block', nodeType: 'listItem', nodeId: 'item-1' },
    });
    const nextItem = makeProjection({
      numId: 2,
      kind: 'ordered',
      address: { kind: 'block', nodeType: 'listItem', nodeId: 'item-2' },
    });

    vi.mocked(resolveListItem).mockReturnValue(target);
    vi.mocked(getAbstractNumId).mockReturnValue(10);
    mockApplyTemplateChanged(editor);

    vi.mocked(findAdjacentSequence).mockImplementation((_ed, _tgt, direction) => {
      if (direction === 'withNext') {
        return { sequence: [nextItem], numId: 2, abstractNumId: 10 };
      }
      return null;
    });

    const result = listsSetTypeWrapper(editor, {
      target: target.address,
      kind: 'ordered',
    });

    expect(result.success).toBe(true);
    // The next sequence should be reassigned to the target's numId
    expect(updateNumberingProperties).toHaveBeenCalledWith(
      { numId: 1, ilvl: 0 },
      nextItem.candidate.node,
      nextItem.candidate.pos,
      editor,
      expect.anything(),
    );
  });

  it('does not merge when adjacent sequence has different abstractNumId', () => {
    const target = makeProjection({ numId: 1, kind: 'ordered' });
    const nextItem = makeProjection({ numId: 2, kind: 'ordered' });

    vi.mocked(resolveListItem).mockReturnValue(target);
    vi.mocked(getAbstractNumId).mockReturnValue(10);
    mockApplyTemplateChanged(editor);

    vi.mocked(findAdjacentSequence).mockImplementation((_ed, _tgt, direction) => {
      if (direction === 'withNext') {
        return { sequence: [nextItem], numId: 2, abstractNumId: 99 }; // different abstract
      }
      return null;
    });

    const result = listsSetTypeWrapper(editor, {
      target: target.address,
      kind: 'ordered',
    });

    expect(result.success).toBe(true);
    // Should NOT call updateNumberingProperties for merging
    expect(updateNumberingProperties).not.toHaveBeenCalled();
  });

  it('does not merge when adjacent sequence has different kind', () => {
    const target = makeProjection({ numId: 1, kind: 'ordered' });
    const nextItem = makeProjection({ numId: 2, kind: 'bullet' });

    vi.mocked(resolveListItem).mockReturnValue(target);
    vi.mocked(getAbstractNumId).mockReturnValue(10);
    mockApplyTemplateChanged(editor);

    vi.mocked(findAdjacentSequence).mockImplementation((_ed, _tgt, direction) => {
      if (direction === 'withNext') {
        return { sequence: [nextItem], numId: 2, abstractNumId: 10 };
      }
      return null;
    });

    const result = listsSetTypeWrapper(editor, {
      target: target.address,
      kind: 'ordered',
    });

    expect(result.success).toBe(true);
    expect(updateNumberingProperties).not.toHaveBeenCalled();
  });

  it('clears startOverride on absorbed sequence original numId before reassignment', () => {
    const target = makeProjection({
      numId: 2,
      kind: 'ordered',
      level: 0,
      address: { kind: 'block', nodeType: 'listItem', nodeId: 'item-2' },
    });
    const prevItem = makeProjection({
      numId: 1,
      kind: 'ordered',
      address: { kind: 'block', nodeType: 'listItem', nodeId: 'item-1' },
    });

    vi.mocked(resolveListItem).mockReturnValue(target);
    vi.mocked(getAbstractNumId).mockReturnValue(10);
    mockApplyTemplateChanged(editor);
    vi.mocked(findAdjacentSequence).mockImplementation((_ed, _tgt, direction) => {
      if (direction === 'withPrevious') {
        return { sequence: [prevItem], numId: 1, abstractNumId: 10 };
      }
      return null;
    });
    vi.mocked(getContiguousSequence).mockReturnValue([target]);

    listsSetTypeWrapper(editor, { target: target.address, kind: 'ordered' });

    // Should clear startOverride on the absorbed sequence's *original* numId (2),
    // not the absorbing numId (1), to avoid wiping legitimate overrides on the survivor
    expect(ListHelpers.removeLvlOverride).toHaveBeenCalledWith(editor, 2, 0);
  });

  it('dispatches the same transaction used by merge operations (transaction identity)', () => {
    const target = makeProjection({
      numId: 2,
      kind: 'ordered',
      address: { kind: 'block', nodeType: 'listItem', nodeId: 'item-2' },
    });
    const prevItem = makeProjection({
      numId: 1,
      kind: 'ordered',
      address: { kind: 'block', nodeType: 'listItem', nodeId: 'item-1' },
    });

    vi.mocked(resolveListItem).mockReturnValue(target);
    vi.mocked(getAbstractNumId).mockReturnValue(10);
    mockApplyTemplateChanged(editor);
    vi.mocked(findAdjacentSequence).mockImplementation((_ed, _tgt, direction) => {
      if (direction === 'withPrevious') {
        return { sequence: [prevItem], numId: 1, abstractNumId: 10 };
      }
      return null;
    });
    vi.mocked(getContiguousSequence).mockReturnValue([target]);

    listsSetTypeWrapper(editor, { target: target.address, kind: 'ordered' });

    // updateNumberingProperties receives the transaction as its last argument.
    // dispatchEditorTransaction passes it to editor.dispatch.
    // Because state.tr is a getter returning a fresh object on each access,
    // this test fails if the implementation grabs multiple transactions.
    const mergeTr = vi.mocked(updateNumberingProperties).mock.calls[0]?.[4];
    const dispatchedTr = vi.mocked(editor.dispatch).mock.calls[0]?.[0];
    expect(mergeTr).toBeDefined();
    expect(dispatchedTr).toBeDefined();
    expect(mergeTr).toBe(dispatchedTr);
  });

  // =========================================================================
  // Continuity mode: 'none'
  // =========================================================================

  it('does not merge when continuity is none', () => {
    const target = makeProjection({ numId: 1, kind: 'ordered' });
    vi.mocked(resolveListItem).mockReturnValue(target);
    vi.mocked(getAbstractNumId).mockReturnValue(10);
    mockApplyTemplateChanged(editor);

    const result = listsSetTypeWrapper(editor, {
      target: target.address,
      kind: 'ordered',
      continuity: 'none',
    });

    expect(result.success).toBe(true);
    expect(findAdjacentSequence).not.toHaveBeenCalled();
    expect(updateNumberingProperties).not.toHaveBeenCalled();
  });

  // =========================================================================
  // Dry-run
  // =========================================================================

  it('returns success on dry-run without applying changes', () => {
    const target = makeProjection({ numId: 1 });
    vi.mocked(resolveListItem).mockReturnValue(target);
    vi.mocked(getAbstractNumId).mockReturnValue(10);

    const result = listsSetTypeWrapper(editor, { target: target.address, kind: 'ordered' }, { dryRun: true });

    expect(result.success).toBe(true);
    expect(LevelFormattingHelpers.applyTemplateToAbstract).not.toHaveBeenCalled();
    expect(findAdjacentSequence).not.toHaveBeenCalled();
  });

  // =========================================================================
  // Error cases
  // =========================================================================

  it('fails with INVALID_INPUT for unknown kind', () => {
    const result = listsSetTypeWrapper(editor, {
      target: { kind: 'block', nodeType: 'listItem', nodeId: 'p1' },
      kind: 'unknown' as any,
    });

    expect(result.success).toBe(false);
    expect((result as any).failure.code).toBe('INVALID_INPUT');
  });

  it('fails with INVALID_TARGET when target has no numId', () => {
    const target = makeProjection({ numId: undefined as any });
    vi.mocked(resolveListItem).mockReturnValue(target);

    const result = listsSetTypeWrapper(editor, {
      target: target.address,
      kind: 'ordered',
    });

    expect(result.success).toBe(false);
    expect((result as any).failure.code).toBe('INVALID_TARGET');
  });

  it('fails with INVALID_TARGET when abstractNumId cannot be resolved', () => {
    const target = makeProjection({ numId: 1 });
    vi.mocked(resolveListItem).mockReturnValue(target);
    vi.mocked(getAbstractNumId).mockReturnValue(undefined);

    const result = listsSetTypeWrapper(editor, {
      target: target.address,
      kind: 'ordered',
    });

    expect(result.success).toBe(false);
    expect((result as any).failure.code).toBe('INVALID_TARGET');
  });

  it('propagates applyTemplateToAbstract errors as proper failure codes', () => {
    const target = makeProjection({ numId: 1 });
    vi.mocked(resolveListItem).mockReturnValue(target);
    vi.mocked(getAbstractNumId).mockReturnValue(10);
    vi.mocked(LevelFormattingHelpers.applyTemplateToAbstract).mockReturnValue({
      changed: false,
      error: 'ABSTRACT_NOT_FOUND',
    });

    const result = listsSetTypeWrapper(editor, {
      target: target.address,
      kind: 'ordered',
    });

    expect(result.success).toBe(false);
    expect((result as any).failure.code).toBe('INVALID_TARGET');
  });

  it('returns NO_OP when preset application reports no changes', () => {
    const target = makeProjection({ numId: 1 });
    vi.mocked(resolveListItem).mockReturnValue(target);
    vi.mocked(getAbstractNumId).mockReturnValue(10);
    vi.mocked(LevelFormattingHelpers.applyTemplateToAbstract).mockReturnValue({ changed: false });

    const result = listsSetTypeWrapper(editor, {
      target: target.address,
      kind: 'ordered',
    });

    expect(result.success).toBe(false);
    expect((result as any).failure.code).toBe('NO_OP');
  });

  // =========================================================================
  // Tracked mode rejection
  // =========================================================================

  it('rejects tracked change mode', () => {
    vi.mocked(rejectTrackedMode).mockImplementation((op, opts) => {
      if (opts?.changeMode === 'tracked') {
        throw new Error('tracked mode not supported');
      }
    });

    const target = makeProjection({ numId: 1 });
    vi.mocked(resolveListItem).mockReturnValue(target);

    expect(() =>
      listsSetTypeWrapper(editor, { target: target.address, kind: 'ordered' }, { changeMode: 'tracked' }),
    ).toThrow();
  });
});
