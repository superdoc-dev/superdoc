import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NodeSelection } from 'prosemirror-state';
import type { ResolveRangeOutput } from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';
import {
  resolveCurrentEditorSelectionRange,
  resolveEffectiveEditorSelectionRange,
} from './selection-range-resolver.js';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  resolveAbsoluteRange: vi.fn(),
  getPreservedSelection: vi.fn(() => null),
  mapBlockNodeType: vi.fn(),
}));

vi.mock('./range-resolver.js', () => ({
  resolveAbsoluteRange: mocks.resolveAbsoluteRange,
}));

vi.mock('../../core/selection-state.js', () => ({
  CustomSelectionPluginKey: { getState: vi.fn() },
  getPreservedSelection: mocks.getPreservedSelection,
}));

vi.mock('./node-address-resolver.js', () => ({
  mapBlockNodeType: mocks.mapBlockNodeType,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockOutput(absFrom: number, absTo: number): ResolveRangeOutput {
  return {
    evaluatedRevision: '42',
    handle: { ref: `text:mock-${absFrom}-${absTo}`, refStability: 'ephemeral', coversFullTarget: true },
    target: {
      kind: 'selection',
      start: { kind: 'text', blockId: 'p1', offset: absFrom },
      end: { kind: 'text', blockId: 'p1', offset: absTo },
    },
    preview: { text: 'mock', truncated: false, blocks: [] },
  };
}

function makeTextSelection(from: number, to: number, empty?: boolean) {
  return {
    from,
    to,
    empty: empty ?? from === to,
  };
}

/**
 * Creates a mock that passes `instanceof NodeSelection`.
 *
 * ProseMirror's `Selection` base class uses getters for `from`/`to`/`empty`,
 * so we must use `defineProperty` to override them on the prototype chain.
 */
function makeRealNodeSelection(
  from: number,
  to: number,
  node: { type: { name: string }; isBlock: boolean; isLeaf: boolean; isInline: boolean; nodeSize: number },
) {
  const sel = Object.create(NodeSelection.prototype);
  Object.defineProperty(sel, 'from', { value: from, configurable: true });
  Object.defineProperty(sel, 'to', { value: to, configurable: true });
  Object.defineProperty(sel, 'empty', { value: false, configurable: true });
  Object.defineProperty(sel, 'node', { value: node, configurable: true });
  return sel as NodeSelection;
}

function makeCellSelection(from: number, to: number) {
  return {
    from,
    to,
    empty: false,
    $anchorCell: {}, // marker property for CellSelection detection
  };
}

function makeAllSelection(docContentSize: number) {
  return {
    from: 0,
    to: docContentSize,
    empty: false,
  };
}

function makeEditor(
  selection: unknown,
  docOptions?: { resolve?: (pos: number) => unknown; contentSize?: number },
): Editor {
  return {
    state: {
      selection,
      doc: {
        content: { size: docOptions?.contentSize ?? 100 },
        resolve: docOptions?.resolve ?? (() => ({ parent: { inlineContent: true } })),
      },
    },
  } as unknown as Editor;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveAbsoluteRange.mockImplementation((_editor: Editor, input: { absFrom: number; absTo: number }) =>
    makeMockOutput(input.absFrom, input.absTo),
  );
  // Default: mapBlockNodeType returns undefined (not a block)
  mocks.mapBlockNodeType.mockReturnValue(undefined);
});

// ---------------------------------------------------------------------------
// resolveCurrentEditorSelectionRange
// ---------------------------------------------------------------------------

describe('resolveCurrentEditorSelectionRange', () => {
  it('resolves a non-collapsed TextSelection', () => {
    const selection = makeTextSelection(5, 15);
    const editor = makeEditor(selection);

    const result = resolveCurrentEditorSelectionRange(editor);

    expect(mocks.resolveAbsoluteRange).toHaveBeenCalledWith(editor, { absFrom: 5, absTo: 15 });
    expect(result.evaluatedRevision).toBe('42');
  });

  it('resolves a collapsed TextSelection (caret)', () => {
    const selection = makeTextSelection(10, 10, true);
    const editor = makeEditor(selection);

    const result = resolveCurrentEditorSelectionRange(editor);

    expect(mocks.resolveAbsoluteRange).toHaveBeenCalledWith(editor, { absFrom: 10, absTo: 10 });
    expect(result).toBeDefined();
  });

  it('ignores preserved selection', () => {
    const liveSelection = makeTextSelection(10, 10, true);
    const preservedSelection = makeTextSelection(5, 20);
    mocks.getPreservedSelection.mockReturnValue(preservedSelection);

    const editor = makeEditor(liveSelection);
    resolveCurrentEditorSelectionRange(editor);

    expect(mocks.resolveAbsoluteRange).toHaveBeenCalledWith(editor, { absFrom: 10, absTo: 10 });
  });

  it('resolves AllSelection through normal from/to path', () => {
    const selection = makeAllSelection(100);
    const editor = makeEditor(selection);

    resolveCurrentEditorSelectionRange(editor);

    expect(mocks.resolveAbsoluteRange).toHaveBeenCalledWith(editor, { absFrom: 0, absTo: 100 });
  });

  it('rejects CellSelection with INVALID_CONTEXT error', () => {
    const selection = makeCellSelection(5, 25);
    const editor = makeEditor(selection);

    expect(() => resolveCurrentEditorSelectionRange(editor)).toThrow(
      'CellSelection cannot be converted to SelectionTarget',
    );
  });

  it('returns payload with evaluatedRevision, handle, target, preview', () => {
    const selection = makeTextSelection(3, 8);
    const editor = makeEditor(selection);

    const result = resolveCurrentEditorSelectionRange(editor);

    expect(result).toHaveProperty('evaluatedRevision');
    expect(result).toHaveProperty('handle.ref');
    expect(result).toHaveProperty('handle.coversFullTarget');
    expect(result).toHaveProperty('target');
    expect(result).toHaveProperty('preview');
  });
});

// ---------------------------------------------------------------------------
// resolveEffectiveEditorSelectionRange
// ---------------------------------------------------------------------------

describe('resolveEffectiveEditorSelectionRange', () => {
  it('prefers non-collapsed live selection over preserved selection', () => {
    const liveSelection = makeTextSelection(5, 20);
    const preservedSelection = makeTextSelection(1, 50);
    mocks.getPreservedSelection.mockReturnValue(preservedSelection);

    const editor = makeEditor(liveSelection);
    resolveEffectiveEditorSelectionRange(editor);

    expect(mocks.resolveAbsoluteRange).toHaveBeenCalledWith(editor, { absFrom: 5, absTo: 20 });
  });

  it('falls back to preserved selection when live is collapsed', () => {
    const liveSelection = makeTextSelection(10, 10, true);
    const preservedSelection = makeTextSelection(5, 20);
    mocks.getPreservedSelection.mockReturnValue(preservedSelection);

    const editor = makeEditor(liveSelection);
    resolveEffectiveEditorSelectionRange(editor);

    expect(mocks.resolveAbsoluteRange).toHaveBeenCalledWith(editor, { absFrom: 5, absTo: 20 });
  });

  it('falls back to collapsed live selection when preserved is absent', () => {
    const liveSelection = makeTextSelection(10, 10, true);
    mocks.getPreservedSelection.mockReturnValue(null);

    const editor = makeEditor(liveSelection);
    resolveEffectiveEditorSelectionRange(editor);

    expect(mocks.resolveAbsoluteRange).toHaveBeenCalledWith(editor, { absFrom: 10, absTo: 10 });
  });

  it('falls back to collapsed live selection when preserved is also collapsed', () => {
    const liveSelection = makeTextSelection(10, 10, true);
    const preservedSelection = makeTextSelection(15, 15, true);
    mocks.getPreservedSelection.mockReturnValue(preservedSelection);

    const editor = makeEditor(liveSelection);
    resolveEffectiveEditorSelectionRange(editor);

    expect(mocks.resolveAbsoluteRange).toHaveBeenCalledWith(editor, { absFrom: 10, absTo: 10 });
  });

  it('reads preserved selection from PM plugin state via getPreservedSelection', () => {
    const liveSelection = makeTextSelection(10, 10, true);
    const preservedSelection = makeTextSelection(2, 8);
    mocks.getPreservedSelection.mockReturnValue(preservedSelection);

    const editor = makeEditor(liveSelection);
    resolveEffectiveEditorSelectionRange(editor);

    expect(mocks.getPreservedSelection).toHaveBeenCalledWith(editor.state);
  });

  it('gracefully skips when custom-selection plugin is absent', () => {
    const liveSelection = makeTextSelection(10, 10, true);
    mocks.getPreservedSelection.mockReturnValue(null);

    const editor = makeEditor(liveSelection);
    const result = resolveEffectiveEditorSelectionRange(editor);

    expect(result).toBeDefined();
    expect(mocks.resolveAbsoluteRange).toHaveBeenCalledWith(editor, { absFrom: 10, absTo: 10 });
  });

  it('rejects CellSelection even as preserved fallback', () => {
    const liveSelection = makeTextSelection(10, 10, true);
    const preservedCellSelection = makeCellSelection(5, 25);
    mocks.getPreservedSelection.mockReturnValue(preservedCellSelection);

    const editor = makeEditor(liveSelection);

    expect(() => resolveEffectiveEditorSelectionRange(editor)).toThrow(
      'CellSelection cannot be converted to SelectionTarget',
    );
  });
});

// ---------------------------------------------------------------------------
// NodeSelection classification — mapped block types
// ---------------------------------------------------------------------------

describe('NodeSelection classification with mapped block types', () => {
  it('allows NodeSelection on a plain paragraph (maps to "paragraph")', () => {
    const node = { type: { name: 'paragraph' }, isBlock: true, isLeaf: false, isInline: false, nodeSize: 10 };
    mocks.mapBlockNodeType.mockReturnValue('paragraph');

    const selection = makeRealNodeSelection(5, 15, node);
    const editor = makeEditor(selection);

    resolveCurrentEditorSelectionRange(editor);

    expect(mocks.resolveAbsoluteRange).toHaveBeenCalledWith(editor, { absFrom: 5, absTo: 15 });
  });

  it('rejects NodeSelection on a list paragraph (maps to "listItem")', () => {
    const node = { type: { name: 'paragraph' }, isBlock: true, isLeaf: false, isInline: false, nodeSize: 10 };
    // A numbered paragraph: PM type is "paragraph" but adapter maps it to "listItem"
    mocks.mapBlockNodeType.mockReturnValue('listItem');

    const selection = makeRealNodeSelection(5, 15, node);
    const editor = makeEditor(selection);

    expect(() => resolveCurrentEditorSelectionRange(editor)).toThrow(
      'NodeSelection for node type "listItem" cannot be converted to SelectionTarget',
    );
  });

  it('allows NodeSelection on structuredContentBlock (maps to "sdt")', () => {
    const node = {
      type: { name: 'structuredContentBlock' },
      isBlock: true,
      isLeaf: false,
      isInline: false,
      nodeSize: 20,
    };
    // PM type is "structuredContentBlock" but adapter maps it to "sdt" (allowed)
    mocks.mapBlockNodeType.mockReturnValue('sdt');

    const selection = makeRealNodeSelection(10, 30, node);
    const editor = makeEditor(selection);

    resolveCurrentEditorSelectionRange(editor);

    expect(mocks.resolveAbsoluteRange).toHaveBeenCalledWith(editor, { absFrom: 10, absTo: 30 });
  });

  it('rejects NodeSelection on tableRow (maps to "tableRow")', () => {
    const node = { type: { name: 'tableRow' }, isBlock: true, isLeaf: false, isInline: false, nodeSize: 50 };
    mocks.mapBlockNodeType.mockReturnValue('tableRow');

    const selection = makeRealNodeSelection(5, 55, node);
    const editor = makeEditor(selection);

    expect(() => resolveCurrentEditorSelectionRange(editor)).toThrow(
      'NodeSelection for node type "tableRow" cannot be converted to SelectionTarget',
    );
  });

  it('rejects NodeSelection on tableCell (maps to "tableCell")', () => {
    const node = { type: { name: 'tableCell' }, isBlock: true, isLeaf: false, isInline: false, nodeSize: 30 };
    mocks.mapBlockNodeType.mockReturnValue('tableCell');

    const selection = makeRealNodeSelection(5, 35, node);
    const editor = makeEditor(selection);

    expect(() => resolveCurrentEditorSelectionRange(editor)).toThrow(
      'NodeSelection for node type "tableCell" cannot be converted to SelectionTarget',
    );
  });

  it('allows NodeSelection on table (maps to "table")', () => {
    const node = { type: { name: 'table' }, isBlock: true, isLeaf: false, isInline: false, nodeSize: 100 };
    mocks.mapBlockNodeType.mockReturnValue('table');

    const selection = makeRealNodeSelection(5, 105, node);
    const editor = makeEditor(selection);

    resolveCurrentEditorSelectionRange(editor);

    expect(mocks.resolveAbsoluteRange).toHaveBeenCalledWith(editor, { absFrom: 5, absTo: 105 });
  });

  it('allows inline image NodeSelection (isLeaf + isInline inside text block)', () => {
    const node = { type: { name: 'image' }, isBlock: false, isLeaf: true, isInline: true, nodeSize: 1 };
    // mapBlockNodeType returns undefined for inline nodes (they're not block-level)
    mocks.mapBlockNodeType.mockReturnValue(undefined);

    const selection = makeRealNodeSelection(5, 6, node);
    const editor = makeEditor(selection, {
      resolve: () => ({ parent: { inlineContent: true } }),
    });

    resolveCurrentEditorSelectionRange(editor);

    expect(mocks.resolveAbsoluteRange).toHaveBeenCalledWith(editor, { absFrom: 5, absTo: 6 });
  });

  it('rejects NodeSelection on unknown block type (mapBlockNodeType returns undefined)', () => {
    const node = { type: { name: 'unknownBlock' }, isBlock: true, isLeaf: false, isInline: false, nodeSize: 10 };
    mocks.mapBlockNodeType.mockReturnValue(undefined);

    const selection = makeRealNodeSelection(5, 15, node);
    const editor = makeEditor(selection);

    expect(() => resolveCurrentEditorSelectionRange(editor)).toThrow('cannot be converted to SelectionTarget');
  });

  it('includes mapped type in error details', () => {
    const node = { type: { name: 'paragraph' }, isBlock: true, isLeaf: false, isInline: false, nodeSize: 10 };
    mocks.mapBlockNodeType.mockReturnValue('listItem');

    const selection = makeRealNodeSelection(5, 15, node);
    const editor = makeEditor(selection);

    try {
      resolveCurrentEditorSelectionRange(editor);
      expect.unreachable('should have thrown');
    } catch (err: any) {
      expect(err.code).toBe('INVALID_CONTEXT');
      expect(err.details).toMatchObject({ nodeType: 'listItem', pmNodeType: 'paragraph' });
    }
  });
});

// ---------------------------------------------------------------------------
// current vs effective — observably different
// ---------------------------------------------------------------------------

describe('current vs effective are observably different', () => {
  it('current returns collapsed, effective returns preserved when selection is preserved', () => {
    const liveSelection = makeTextSelection(10, 10, true);
    const preservedSelection = makeTextSelection(3, 12);
    mocks.getPreservedSelection.mockReturnValue(preservedSelection);

    const editor = makeEditor(liveSelection);

    const currentResult = resolveCurrentEditorSelectionRange(editor);
    const effectiveResult = resolveEffectiveEditorSelectionRange(editor);

    // Current should use the live collapsed selection
    expect(mocks.resolveAbsoluteRange).toHaveBeenNthCalledWith(1, editor, { absFrom: 10, absTo: 10 });
    // Effective should use the preserved selection
    expect(mocks.resolveAbsoluteRange).toHaveBeenNthCalledWith(2, editor, { absFrom: 3, absTo: 12 });

    // They produce different outputs
    expect(currentResult.target.start.offset).toBe(10);
    expect(effectiveResult.target.start.offset).toBe(3);
  });
});
