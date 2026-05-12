import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '../../core/Editor.js';
import type { PlanReceipt } from '@superdoc/document-api';
import type { ListItemProjection } from '../helpers/list-item-resolver.js';

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
  listItemProjectionToInfo: vi.fn((proj: ListItemProjection, listId: string) => ({
    address: proj.address,
    listId,
    level: proj.level,
  })),
  listListItems: vi.fn(() => ({ items: [], total: 0 })),
  resolveListItem: vi.fn(),
}));

vi.mock('../helpers/list-sequence-helpers.js', () => ({
  resolveBlock: vi.fn(),
  resolveBlocksInRange: vi.fn(),
  getAbstractNumId: vi.fn(),
  getAllListItemProjections: vi.fn(),
  getContiguousSequence: vi.fn(),
  getSequenceFromTarget: vi.fn(),
  isFirstInSequence: vi.fn(),
  computeSequenceId: vi.fn(() => '1:p1'),
  findAdjacentSequence: vi.fn(),
  findPreviousCompatibleSequence: vi.fn(),
  evaluateCanJoin: vi.fn(),
  evaluateCanContinuePrevious: vi.fn(),
}));

vi.mock('../../core/helpers/list-numbering-helpers.js', () => ({
  ListHelpers: {
    hasListDefinition: vi.fn(() => true),
    getNewListId: vi.fn(() => 42),
    generateNewListDefinition: vi.fn(),
    createNumDefinition: vi.fn(() => ({ numId: 43 })),
    setLvlOverride: vi.fn(),
    removeLvlOverride: vi.fn(),
    setLvlRestartOnAbstract: vi.fn(),
  },
}));

vi.mock('../../core/commands/changeListLevel.js', () => ({
  updateNumberingProperties: vi.fn(),
}));

vi.mock('../helpers/mutation-helpers.js', () => ({
  requireEditorCommand: vi.fn((cmd: unknown) => cmd),
  ensureTrackedCapability: vi.fn(),
  rejectTrackedMode: vi.fn(),
}));

vi.mock('../helpers/tracked-change-refs.js', () => ({
  collectTrackInsertRefsInRange: vi.fn(() => []),
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid'),
}));

// ---------------------------------------------------------------------------
// Now import wrappers and mocked modules
// ---------------------------------------------------------------------------

import {
  listsListWrapper,
  listsGetWrapper,
  listsCanJoinWrapper,
  listsCanContinuePreviousWrapper,
  listsCreateWrapper,
  listsAttachWrapper,
  listsDetachWrapper,
  listsDeleteWrapper,
  listsJoinWrapper,
  listsSeparateWrapper,
  listsSetLevelWrapper,
  listsSetValueWrapper,
  listsContinuePreviousWrapper,
  listsSetLevelRestartWrapper,
  listsConvertToTextWrapper,
  listsIndentWrapper,
  listsOutdentWrapper,
  listsInsertWrapper,
  listsMergeWrapper,
  listsSplitWrapper,
} from './lists-wrappers.js';

import { getBlockIndex } from '../helpers/index-cache.js';

import { listListItems, resolveListItem } from '../helpers/list-item-resolver.js';
import {
  resolveBlock,
  resolveBlocksInRange,
  getAbstractNumId,
  getAllListItemProjections,
  getContiguousSequence,
  getSequenceFromTarget,
  isFirstInSequence,
  computeSequenceId,
  findAdjacentSequence,
  evaluateCanJoin,
  evaluateCanContinuePrevious,
  findPreviousCompatibleSequence,
} from '../helpers/list-sequence-helpers.js';
import { ListHelpers } from '../../core/helpers/list-numbering-helpers.js';
import { updateNumberingProperties } from '../../core/commands/changeListLevel.js';
import { rejectTrackedMode } from '../helpers/mutation-helpers.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeEditor(overrides: Record<string, unknown> = {}): Editor {
  return {
    state: {
      doc: { content: { size: 100 } },
      tr: { setNodeMarkup: vi.fn().mockReturnThis(), insertText: vi.fn().mockReturnThis() },
    },
    view: { dispatch: vi.fn() },
    commands: { insertListItemAt: vi.fn(() => true) },
    converter: {
      numbering: { definitions: {}, abstracts: {} },
      translatedNumbering: { definitions: {} },
    },
    ...overrides,
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

function makeBlockCandidate(nodeId: string, nodeType: 'paragraph' | 'listItem' = 'paragraph') {
  return {
    nodeId,
    nodeType,
    node: { attrs: { paragraphProperties: {} } },
    pos: 10,
    end: 20,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('lists-wrappers', () => {
  let editor: Editor;

  beforeEach(() => {
    vi.clearAllMocks();
    editor = makeEditor();
  });

  // =========================================================================
  // Read operations
  // =========================================================================

  describe('listsListWrapper', () => {
    it('delegates to listListItems', () => {
      const query = { kind: 'ordered' as const };
      listsListWrapper(editor, query);
      expect(listListItems).toHaveBeenCalledWith(editor, query);
    });

    it('returns result from listListItems', () => {
      const mockResult = { items: [{ address: { nodeId: 'p1' } }], total: 1 };
      vi.mocked(listListItems).mockReturnValueOnce(mockResult as any);
      expect(listsListWrapper(editor)).toEqual(mockResult);
    });
  });

  describe('listsGetWrapper', () => {
    it('resolves target and converts to info', () => {
      const proj = makeProjection();
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);
      const result = listsGetWrapper(editor, { address: proj.address });
      expect(resolveListItem).toHaveBeenCalledWith(editor, proj.address);
      expect(result).toHaveProperty('address', proj.address);
    });
  });

  describe('listsCanJoinWrapper', () => {
    it('delegates to evaluateCanJoin', () => {
      const proj = makeProjection();
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);
      vi.mocked(evaluateCanJoin).mockReturnValueOnce({ canJoin: true });

      const result = listsCanJoinWrapper(editor, { target: proj.address, direction: 'withNext' });
      expect(evaluateCanJoin).toHaveBeenCalledWith(editor, proj, 'withNext');
      expect(result.canJoin).toBe(true);
    });
  });

  describe('listsCanContinuePreviousWrapper', () => {
    it('delegates to evaluateCanContinuePrevious', () => {
      const proj = makeProjection();
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);
      vi.mocked(evaluateCanContinuePrevious).mockReturnValueOnce({ canContinue: false, reason: 'NO_PREVIOUS_LIST' });

      const result = listsCanContinuePreviousWrapper(editor, { target: proj.address });
      expect(result.canContinue).toBe(false);
      expect(result.reason).toBe('NO_PREVIOUS_LIST');
    });
  });

  // =========================================================================
  // listsCreateWrapper
  // =========================================================================

  describe('listsCreateWrapper', () => {
    it('creates a list in empty mode', () => {
      const block = makeBlockCandidate('p1', 'paragraph');
      vi.mocked(resolveBlock).mockReturnValueOnce(block as any);

      const result = listsCreateWrapper(editor, {
        mode: 'empty',
        at: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
        kind: 'ordered',
      });
      expect(result.success).toBe(true);
      expect(result).toHaveProperty('listId', '42:p1');
    });

    it('fails in empty mode when target is already a list item', () => {
      const block = makeBlockCandidate('p1', 'listItem');
      vi.mocked(resolveBlock).mockReturnValueOnce(block as any);

      const result = listsCreateWrapper(editor, {
        mode: 'empty',
        at: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
        kind: 'bullet',
      });
      expect(result.success).toBe(false);
      expect((result as any).failure.code).toBe('INVALID_TARGET');
    });

    it('creates a list in fromParagraphs mode', () => {
      const blocks = [makeBlockCandidate('p1'), makeBlockCandidate('p2')];
      vi.mocked(resolveBlocksInRange).mockReturnValueOnce(blocks as any);

      const result = listsCreateWrapper(editor, {
        mode: 'fromParagraphs',
        target: {
          from: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
          to: { kind: 'block', nodeType: 'paragraph', nodeId: 'p2' },
        },
        kind: 'ordered',
      });
      expect(result.success).toBe(true);
    });

    it('fails in fromParagraphs mode when any target is already a list item', () => {
      const blocks = [makeBlockCandidate('p1'), makeBlockCandidate('p2', 'listItem')];
      vi.mocked(resolveBlocksInRange).mockReturnValueOnce(blocks as any);

      const result = listsCreateWrapper(editor, {
        mode: 'fromParagraphs',
        target: {
          from: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
          to: { kind: 'block', nodeType: 'paragraph', nodeId: 'p2' },
        },
        kind: 'ordered',
      });
      expect(result.success).toBe(false);
      expect((result as any).failure.code).toBe('INVALID_TARGET');
    });

    it('returns dry-run result without mutations', () => {
      const block = makeBlockCandidate('p1', 'paragraph');
      vi.mocked(resolveBlock).mockReturnValueOnce(block as any);

      const result = listsCreateWrapper(
        editor,
        { mode: 'empty', at: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' }, kind: 'ordered' },
        { dryRun: true },
      );
      expect(result.success).toBe(true);
      expect((result as any).listId).toBe('(dry-run)');
      expect(ListHelpers.generateNewListDefinition).not.toHaveBeenCalled();
    });

    it('fails with LEVEL_OUT_OF_RANGE when level exceeds bounds', () => {
      const result = listsCreateWrapper(editor, {
        mode: 'empty',
        at: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
        kind: 'ordered',
        level: 9,
      });
      expect(result.success).toBe(false);
      expect((result as any).failure.code).toBe('LEVEL_OUT_OF_RANGE');
    });

    it('allows continuePrevious without an explicit kind', () => {
      const block = makeBlockCandidate('p3', 'paragraph');
      const previous = makeProjection({
        numId: 7,
        kind: 'ordered',
        candidate: {
          nodeType: 'listItem',
          nodeId: 'prev-item',
          node: { attrs: { paragraphProperties: { numberingProperties: { numId: 7, ilvl: 0 } } } },
          pos: 5,
          end: 9,
        },
        address: { kind: 'block', nodeType: 'listItem', nodeId: 'prev-item' },
      });

      vi.mocked(resolveBlock).mockReturnValueOnce(block as any);
      vi.mocked(getAllListItemProjections).mockReturnValueOnce([previous] as any);

      const result = listsCreateWrapper(editor, {
        mode: 'empty',
        at: { kind: 'block', nodeType: 'paragraph', nodeId: 'p3' },
        sequence: { mode: 'continuePrevious' },
      });

      expect(result.success).toBe(true);
      expect(updateNumberingProperties).toHaveBeenCalledWith(
        { numId: 7, ilvl: 0 },
        block.node,
        block.pos,
        editor,
        expect.anything(),
      );
    });
  });

  // =========================================================================
  // listsInsertWrapper
  // =========================================================================

  describe('listsInsertWrapper', () => {
    it('passes both sdBlockId and paraId to insertListItemAt (paraId survives OOXML roundtrip)', () => {
      const target = makeProjection({ numId: 1, level: 0 });
      vi.mocked(resolveListItem).mockReturnValueOnce(target);
      vi.mocked(getBlockIndex).mockReturnValueOnce({ candidates: [], byId: new Map(), ambiguous: new Set() } as any);

      const insertCmd = editor.commands!.insertListItemAt as ReturnType<typeof vi.fn>;
      listsInsertWrapper(editor, { target: target.address, position: 'after', text: 'new item' });

      expect(insertCmd).toHaveBeenCalledTimes(1);
      const args = insertCmd.mock.calls[0]![0] as { sdBlockId: unknown; paraId: unknown };
      expect(typeof args.sdBlockId).toBe('string');
      expect(typeof args.paraId).toBe('string');
      // paraId is derived as `uuid.replace(/-/g, '').slice(0, 8).toUpperCase()`,
      // so it must be 8 chars, uppercase, and hyphen-free regardless of the uuid shape.
      expect((args.paraId as string).length).toBe(8);
      expect(args.paraId).toBe((args.paraId as string).toUpperCase());
      expect(args.paraId).not.toContain('-');
    });

    it('returns a short docx-style paraId in the receipt nodeId (not a UUID)', () => {
      const target = makeProjection({ numId: 1, level: 0 });
      vi.mocked(resolveListItem).mockReturnValueOnce(target);
      // Force the resolver-by-sdBlockId path to miss so the wrapper falls back
      // to returning the generated paraId directly in the receipt.
      vi.mocked(getBlockIndex).mockReturnValueOnce({ candidates: [], byId: new Map(), ambiguous: new Set() } as any);

      const result = listsInsertWrapper(editor, { target: target.address, position: 'after', text: 'new' });
      if (!result.success) throw new Error('expected success');

      // Receipt nodeId must be the 8-char paraId, not a UUID — the UUID
      // sdBlockId does not survive OOXML export/import.
      expect(result.item.nodeId.length).toBe(8);
      expect(result.item.nodeId).not.toContain('-');
      expect(result.insertionPoint.blockId).toBe(result.item.nodeId);
    });

    it('returns dry-run placeholder and does not call insertListItemAt when dryRun is set', () => {
      const target = makeProjection({ numId: 1, level: 0 });
      vi.mocked(resolveListItem).mockReturnValueOnce(target);

      const result = listsInsertWrapper(
        editor,
        { target: target.address, position: 'before', text: 'dry' },
        { dryRun: true },
      );
      if (!result.success) throw new Error('expected success');

      expect(result.item.nodeId).toBe('(dry-run)');
      expect(editor.commands!.insertListItemAt).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // listsAttachWrapper
  // =========================================================================

  describe('listsAttachWrapper', () => {
    it('attaches paragraphs to an existing list', () => {
      const attachTo = makeProjection({ numId: 5, level: 2 });
      vi.mocked(resolveListItem).mockReturnValueOnce(attachTo);
      const block = makeBlockCandidate('p2', 'paragraph');
      vi.mocked(resolveBlock).mockReturnValueOnce(block as any);

      const result = listsAttachWrapper(editor, {
        target: { kind: 'block', nodeType: 'paragraph', nodeId: 'p2' },
        attachTo: attachTo.address,
      });
      expect(result.success).toBe(true);
    });

    it('fails when target paragraphs are already list items', () => {
      const attachTo = makeProjection({ numId: 5 });
      vi.mocked(resolveListItem).mockReturnValueOnce(attachTo);
      const block = makeBlockCandidate('p2', 'listItem');
      vi.mocked(resolveBlock).mockReturnValueOnce(block as any);

      const result = listsAttachWrapper(editor, {
        target: { kind: 'block', nodeType: 'paragraph', nodeId: 'p2' },
        attachTo: attachTo.address,
      });
      expect(result.success).toBe(false);
      expect((result as any).failure.code).toBe('INVALID_TARGET');
    });

    it('fails when attachTo has no numId', () => {
      const attachTo = makeProjection({ numId: undefined as any });
      vi.mocked(resolveListItem).mockReturnValueOnce(attachTo);

      const result = listsAttachWrapper(editor, {
        target: { kind: 'block', nodeType: 'paragraph', nodeId: 'p2' },
        attachTo: attachTo.address,
      });
      expect(result.success).toBe(false);
      expect((result as any).failure.code).toBe('INVALID_TARGET');
    });
  });

  // =========================================================================
  // listsDetachWrapper
  // =========================================================================

  describe('listsDetachWrapper', () => {
    it('detaches a list item to a plain paragraph', () => {
      const proj = makeProjection();
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);

      const result = listsDetachWrapper(editor, { target: proj.address });
      expect(result.success).toBe(true);
      expect((result as any).paragraph.nodeType).toBe('paragraph');
    });

    it('returns dry-run result without mutations', () => {
      const proj = makeProjection();
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);

      const result = listsDetachWrapper(editor, { target: proj.address }, { dryRun: true });
      expect(result.success).toBe(true);
      expect(editor.view!.dispatch).not.toHaveBeenCalled();
    });

    it('rejects tracked mode', () => {
      const proj = makeProjection();
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);
      listsDetachWrapper(editor, { target: proj.address });
      expect(rejectTrackedMode).toHaveBeenCalledWith('lists.detach', undefined);
    });
  });

  // =========================================================================
  // listsDeleteWrapper — full-list deletion via getContiguousSequence
  // =========================================================================

  describe('listsDeleteWrapper', () => {
    function makeSequenceProjection(nodeId: string, pos: number): ListItemProjection {
      return makeProjection({
        address: { kind: 'block', nodeType: 'listItem', nodeId },
        candidate: {
          nodeType: 'listItem',
          nodeId,
          node: { attrs: { paragraphProperties: { numberingProperties: { numId: 1, ilvl: 0 } } }, nodeSize: 5 },
          pos,
          end: pos + 5,
        },
      } as Partial<ListItemProjection>);
    }

    /** Editor mock that exposes the tr.mapping + tr.delete shape the adapter uses. */
    function makeDeleteEditor(): { editor: Editor; deletes: Array<[number, number]> } {
      const deletes: Array<[number, number]> = [];
      const tr = {
        mapping: { map: (pos: number) => pos },
        delete: vi.fn((from: number, to: number) => {
          deletes.push([from, to]);
        }),
        setNodeMarkup: vi.fn().mockReturnThis(),
        insertText: vi.fn().mockReturnThis(),
      };
      const ed = {
        state: { doc: { content: { size: 100 } }, tr },
        view: { dispatch: vi.fn() },
        commands: { insertListItemAt: vi.fn(() => true) },
      } as unknown as Editor;
      return { editor: ed, deletes };
    }

    it('deletes the full contiguous sequence even when target is mid-list', () => {
      // 5-item list, caller targets the THIRD item (index 2). Adapter must
      // still delete all 5 (it walks via getContiguousSequence, not from
      // the target onwards).
      const sequence = [
        makeSequenceProjection('item-1', 10),
        makeSequenceProjection('item-2', 20),
        makeSequenceProjection('item-3', 30),
        makeSequenceProjection('item-4', 40),
        makeSequenceProjection('item-5', 50),
      ];
      const target = sequence[2]!; // mid-list

      const { editor: ed, deletes } = makeDeleteEditor();
      vi.mocked(resolveListItem).mockReturnValueOnce(target);
      vi.mocked(getContiguousSequence).mockReturnValueOnce(sequence);

      const result = listsDeleteWrapper(ed, { target: target.address });

      expect(result.success).toBe(true);
      if (result.success) expect(result.deletedCount).toBe(5);
      // 5 deletes issued, in reverse pos order so earlier positions stay valid.
      expect(deletes).toEqual([
        [50, 55],
        [40, 45],
        [30, 35],
        [20, 25],
        [10, 15],
      ]);
    });

    it('returns dryRun count without dispatching', () => {
      const sequence = [makeSequenceProjection('item-1', 10), makeSequenceProjection('item-2', 20)];
      const target = sequence[0]!;

      const { editor: ed, deletes } = makeDeleteEditor();
      vi.mocked(resolveListItem).mockReturnValueOnce(target);
      vi.mocked(getContiguousSequence).mockReturnValueOnce(sequence);

      const result = listsDeleteWrapper(ed, { target: target.address }, { dryRun: true });
      expect(result.success).toBe(true);
      if (result.success) expect(result.deletedCount).toBe(2);
      expect(deletes.length).toBe(0);
      expect(ed.view!.dispatch).not.toHaveBeenCalled();
    });

    it('rejects tracked mode', () => {
      const proj = makeProjection();
      const { editor: ed } = makeDeleteEditor();
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);
      vi.mocked(getContiguousSequence).mockReturnValueOnce([proj]);
      listsDeleteWrapper(ed, { target: proj.address });
      expect(rejectTrackedMode).toHaveBeenCalledWith('lists.delete', undefined);
    });

    it('fails INVALID_TARGET when sequence resolution returns empty', () => {
      const proj = makeProjection();
      const { editor: ed } = makeDeleteEditor();
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);
      vi.mocked(getContiguousSequence).mockReturnValueOnce([]);

      const result = listsDeleteWrapper(ed, { target: proj.address });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.failure.code).toBe('INVALID_TARGET');
    });
  });

  // =========================================================================
  // listsJoinWrapper
  // =========================================================================

  describe('listsJoinWrapper', () => {
    it('joins with previous sequence', () => {
      const proj = makeProjection({ numId: 2, address: { kind: 'block', nodeType: 'listItem', nodeId: 'target' } });
      const adjAnchor = makeProjection({
        numId: 1,
        address: { kind: 'block', nodeType: 'listItem', nodeId: 'adj-first' },
      });
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);
      vi.mocked(evaluateCanJoin).mockReturnValueOnce({ canJoin: true });
      vi.mocked(findAdjacentSequence).mockReturnValueOnce({
        sequence: [adjAnchor],
        numId: 1,
        abstractNumId: 10,
      } as any);
      vi.mocked(getContiguousSequence).mockReturnValueOnce([proj]);

      const result = listsJoinWrapper(editor, { target: proj.address, direction: 'withPrevious' });
      expect(result.success).toBe(true);
      expect((result as any).listId).toBe('1:adj-first');
    });

    it('joins with next sequence', () => {
      const proj = makeProjection({ numId: 1, address: { kind: 'block', nodeType: 'listItem', nodeId: 'target' } });
      const targetAnchor = makeProjection({
        numId: 1,
        address: { kind: 'block', nodeType: 'listItem', nodeId: 'target-first' },
      });
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);
      vi.mocked(evaluateCanJoin).mockReturnValueOnce({ canJoin: true });
      const nextItems = [
        makeProjection({ numId: 2, address: { kind: 'block', nodeType: 'listItem', nodeId: 'next' } }),
      ];
      vi.mocked(findAdjacentSequence).mockReturnValueOnce({
        sequence: nextItems,
        numId: 2,
        abstractNumId: 10,
      } as any);
      vi.mocked(getContiguousSequence).mockReturnValueOnce([targetAnchor, proj]);

      const result = listsJoinWrapper(editor, { target: proj.address, direction: 'withNext' });
      expect(result.success).toBe(true);
      expect((result as any).listId).toBe('1:target-first');
    });

    it('fails when canJoin is false', () => {
      const proj = makeProjection();
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);
      vi.mocked(evaluateCanJoin).mockReturnValueOnce({ canJoin: false, reason: 'NO_ADJACENT_SEQUENCE' });

      const result = listsJoinWrapper(editor, { target: proj.address, direction: 'withNext' });
      expect(result.success).toBe(false);
      expect((result as any).failure.code).toBe('NO_ADJACENT_SEQUENCE');
    });

    it('returns dry-run result without mutations', () => {
      const proj = makeProjection({ numId: 2, address: { kind: 'block', nodeType: 'listItem', nodeId: 'target' } });
      const adjAnchor = makeProjection({
        numId: 1,
        address: { kind: 'block', nodeType: 'listItem', nodeId: 'adj-first' },
      });
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);
      vi.mocked(evaluateCanJoin).mockReturnValueOnce({ canJoin: true });
      vi.mocked(findAdjacentSequence).mockReturnValueOnce({
        sequence: [adjAnchor],
        numId: 1,
        abstractNumId: 10,
      } as any);
      vi.mocked(getContiguousSequence).mockReturnValueOnce([proj]);

      const result = listsJoinWrapper(editor, { target: proj.address, direction: 'withPrevious' }, { dryRun: true });
      expect(result.success).toBe(true);
      expect((result as any).listId).toBe('1:adj-first');
      expect(editor.view!.dispatch).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // listsSeparateWrapper
  // =========================================================================

  describe('listsSeparateWrapper', () => {
    it('separates a sequence at the target', () => {
      const proj = makeProjection({ numId: 1 });
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);
      vi.mocked(isFirstInSequence).mockReturnValueOnce(false);
      vi.mocked(getAbstractNumId).mockReturnValueOnce(10);
      vi.mocked(getSequenceFromTarget).mockReturnValueOnce([proj]);

      const result = listsSeparateWrapper(editor, { target: proj.address });
      expect(result.success).toBe(true);
      expect((result as any).numId).toBe(43); // from createNumDefinition mock
      expect((result as any).listId).toBe('43:p1'); // newNumId:target.address.nodeId
    });

    it('returns NO_OP when target is first in sequence', () => {
      const proj = makeProjection();
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);
      vi.mocked(isFirstInSequence).mockReturnValueOnce(true);

      const result = listsSeparateWrapper(editor, { target: proj.address });
      expect(result.success).toBe(false);
      expect((result as any).failure.code).toBe('NO_OP');
    });

    it('returns dry-run result', () => {
      const proj = makeProjection({ numId: 1 });
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);
      vi.mocked(isFirstInSequence).mockReturnValueOnce(false);
      vi.mocked(getAbstractNumId).mockReturnValueOnce(10);
      vi.mocked(getSequenceFromTarget).mockReturnValueOnce([proj]);

      const result = listsSeparateWrapper(editor, { target: proj.address }, { dryRun: true });
      expect(result.success).toBe(true);
      expect((result as any).listId).toBe('(dry-run)');
    });
  });

  // =========================================================================
  // listsMergeWrapper
  // =========================================================================

  describe('listsMergeWrapper', () => {
    it('merges with previous sequence — skips the strict abstractNumId check (vs join)', () => {
      // Target numId=2 with abstract=20; adjacent numId=1 with abstract=10 — DIFFERENT abstracts.
      // `lists.join` would refuse this with INCOMPATIBLE_DEFINITIONS; `lists.merge` must succeed.
      const target = makeProjection({
        numId: 2,
        address: { kind: 'block', nodeType: 'listItem', nodeId: 'target' },
      });
      const adjAnchor = makeProjection({
        numId: 1,
        address: { kind: 'block', nodeType: 'listItem', nodeId: 'adj-first' },
      });
      vi.mocked(resolveListItem).mockReturnValueOnce(target);
      vi.mocked(findAdjacentSequence).mockReturnValueOnce({
        sequence: [adjAnchor],
        numId: 1,
        abstractNumId: 10,
      } as any);
      vi.mocked(getContiguousSequence).mockReturnValueOnce([target]);
      vi.mocked(getBlockIndex).mockReturnValueOnce({ candidates: [], byId: new Map(), ambiguous: new Set() } as any);

      const result = listsMergeWrapper(editor, { target: target.address, direction: 'withPrevious' });
      expect(result.success).toBe(true);
      expect((result as any).listId).toBe('1:adj-first');
      expect((result as any).absorbedCount).toBe(1);
      expect((result as any).removedEmptyBlocks).toBe(0);
    });

    it('merges with next sequence — target absorbs adjacent', () => {
      const target = makeProjection({
        numId: 1,
        address: { kind: 'block', nodeType: 'listItem', nodeId: 'target' },
      });
      const targetAnchor = makeProjection({
        numId: 1,
        address: { kind: 'block', nodeType: 'listItem', nodeId: 'target-first' },
      });
      const adjItem1 = makeProjection({
        numId: 2,
        address: { kind: 'block', nodeType: 'listItem', nodeId: 'adj-1' },
      });
      const adjItem2 = makeProjection({
        numId: 2,
        address: { kind: 'block', nodeType: 'listItem', nodeId: 'adj-2' },
      });
      vi.mocked(resolveListItem).mockReturnValueOnce(target);
      vi.mocked(findAdjacentSequence).mockReturnValueOnce({
        sequence: [adjItem1, adjItem2],
        numId: 2,
        abstractNumId: 20,
      } as any);
      vi.mocked(getContiguousSequence).mockReturnValueOnce([targetAnchor, target]);
      vi.mocked(getBlockIndex).mockReturnValueOnce({ candidates: [], byId: new Map(), ambiguous: new Set() } as any);

      const result = listsMergeWrapper(editor, { target: target.address, direction: 'withNext' });
      expect(result.success).toBe(true);
      expect((result as any).listId).toBe('1:target-first');
      expect((result as any).absorbedCount).toBe(2); // both adj items absorbed
    });

    it('returns NO_ADJACENT_SEQUENCE when no adjacent list exists in the given direction', () => {
      const target = makeProjection({ numId: 1 });
      vi.mocked(resolveListItem).mockReturnValueOnce(target);
      vi.mocked(findAdjacentSequence).mockReturnValueOnce(null);

      const result = listsMergeWrapper(editor, { target: target.address, direction: 'withPrevious' });
      expect(result.success).toBe(false);
      expect((result as any).failure.code).toBe('NO_ADJACENT_SEQUENCE');
    });

    it('returns NO_OP when target and adjacent already share the same numId', () => {
      const target = makeProjection({
        numId: 5,
        address: { kind: 'block', nodeType: 'listItem', nodeId: 'target' },
      });
      const adj = makeProjection({
        numId: 5, // same numId — already the same sequence
        address: { kind: 'block', nodeType: 'listItem', nodeId: 'adj' },
      });
      vi.mocked(resolveListItem).mockReturnValueOnce(target);
      vi.mocked(findAdjacentSequence).mockReturnValueOnce({
        sequence: [adj],
        numId: 5,
        abstractNumId: 50,
      } as any);
      vi.mocked(getContiguousSequence).mockReturnValueOnce([target]);

      const result = listsMergeWrapper(editor, { target: target.address, direction: 'withPrevious' });
      expect(result.success).toBe(false);
      expect((result as any).failure.code).toBe('NO_OP');
    });

    it('returns INVALID_TARGET when target has no numId', () => {
      const target = makeProjection({ numId: undefined as any });
      vi.mocked(resolveListItem).mockReturnValueOnce(target);

      const result = listsMergeWrapper(editor, { target: target.address, direction: 'withPrevious' });
      expect(result.success).toBe(false);
      expect((result as any).failure.code).toBe('INVALID_TARGET');
    });

    it('returns dry-run placeholder without dispatching the transaction', () => {
      const target = makeProjection({
        numId: 2,
        address: { kind: 'block', nodeType: 'listItem', nodeId: 'target' },
      });
      const adjAnchor = makeProjection({
        numId: 1,
        address: { kind: 'block', nodeType: 'listItem', nodeId: 'adj-first' },
      });
      vi.mocked(resolveListItem).mockReturnValueOnce(target);
      vi.mocked(findAdjacentSequence).mockReturnValueOnce({
        sequence: [adjAnchor],
        numId: 1,
        abstractNumId: 10,
      } as any);
      vi.mocked(getContiguousSequence).mockReturnValueOnce([target]);
      vi.mocked(getBlockIndex).mockReturnValueOnce({ candidates: [], byId: new Map(), ambiguous: new Set() } as any);

      const result = listsMergeWrapper(editor, { target: target.address, direction: 'withPrevious' }, { dryRun: true });
      expect(result.success).toBe(true);
      expect((result as any).listId).toBe('1:adj-first');
      expect(editor.view!.dispatch).not.toHaveBeenCalled();
    });

    it('rejects tracked mode', () => {
      const proj = makeProjection();
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);
      listsMergeWrapper(editor, { target: proj.address, direction: 'withPrevious' }, { changeMode: 'tracked' });
      expect(rejectTrackedMode).toHaveBeenCalledWith('lists.merge', { changeMode: 'tracked' });
    });
  });

  // =========================================================================
  // listsSplitWrapper
  // =========================================================================

  describe('listsSplitWrapper', () => {
    function setupSeparateSucceeds() {
      const proj = makeProjection({
        numId: 1,
        address: { kind: 'block', nodeType: 'listItem', nodeId: 'target' },
      });
      vi.mocked(resolveListItem).mockReturnValue(proj);
      vi.mocked(isFirstInSequence).mockReturnValue(false);
      vi.mocked(getAbstractNumId).mockReturnValue(10);
      vi.mocked(getSequenceFromTarget).mockReturnValue([proj]);
      return proj;
    }

    it('separates then restarts numbering at 1 by default', () => {
      const proj = setupSeparateSucceeds();

      const result = listsSplitWrapper(editor, { target: proj.address });
      expect(result.success).toBe(true);
      expect((result as any).numId).toBe(43); // from ListHelpers.createNumDefinition mock
      expect((result as any).restartedAt).toBe(1);
    });

    it('restartNumbering:false skips the setValue step (raw separate semantics)', () => {
      const proj = setupSeparateSucceeds();

      const result = listsSplitWrapper(editor, { target: proj.address, restartNumbering: false });
      expect(result.success).toBe(true);
      expect((result as any).restartedAt).toBeNull();
    });

    it('propagates NO_OP when separate refuses (target is first in its sequence)', () => {
      const proj = makeProjection();
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);
      vi.mocked(isFirstInSequence).mockReturnValueOnce(true);

      const result = listsSplitWrapper(editor, { target: proj.address });
      expect(result.success).toBe(false);
      expect((result as any).failure.code).toBe('NO_OP');
    });

    it('returns dry-run placeholder with restartedAt:1 by default', () => {
      const proj = setupSeparateSucceeds();

      const result = listsSplitWrapper(editor, { target: proj.address }, { dryRun: true });
      expect(result.success).toBe(true);
      expect((result as any).listId).toBe('(dry-run)');
      expect((result as any).restartedAt).toBe(1);
    });

    it('dry-run with restartNumbering:false returns restartedAt:null', () => {
      const proj = setupSeparateSucceeds();

      const result = listsSplitWrapper(editor, { target: proj.address, restartNumbering: false }, { dryRun: true });
      expect(result.success).toBe(true);
      expect((result as any).restartedAt).toBeNull();
    });

    it('rejects tracked mode', () => {
      const proj = makeProjection();
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);
      listsSplitWrapper(editor, { target: proj.address }, { changeMode: 'tracked' });
      expect(rejectTrackedMode).toHaveBeenCalledWith('lists.split', { changeMode: 'tracked' });
    });
  });

  // =========================================================================
  // listsSetLevelWrapper
  // =========================================================================

  describe('listsSetLevelWrapper', () => {
    it('sets the level successfully', () => {
      const proj = makeProjection({ numId: 1, level: 0 });
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);

      const result = listsSetLevelWrapper(editor, { target: proj.address, level: 2 });
      expect(result.success).toBe(true);
    });

    it('returns NO_OP when already at requested level', () => {
      const proj = makeProjection({ numId: 1, level: 3 });
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);

      const result = listsSetLevelWrapper(editor, { target: proj.address, level: 3 });
      expect(result.success).toBe(false);
      expect((result as any).failure.code).toBe('NO_OP');
    });

    it('returns LEVEL_OUT_OF_RANGE for invalid level', () => {
      const proj = makeProjection({ numId: 1, level: 0 });
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);

      const result = listsSetLevelWrapper(editor, { target: proj.address, level: 9 });
      expect(result.success).toBe(false);
      expect((result as any).failure.code).toBe('LEVEL_OUT_OF_RANGE');
    });

    it('returns LEVEL_OUT_OF_RANGE when definition missing', () => {
      const proj = makeProjection({ numId: 1, level: 0 });
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);
      vi.mocked(ListHelpers.hasListDefinition).mockReturnValueOnce(false);

      const result = listsSetLevelWrapper(editor, { target: proj.address, level: 5 });
      expect(result.success).toBe(false);
      expect((result as any).failure.code).toBe('LEVEL_OUT_OF_RANGE');
    });
  });

  // =========================================================================
  // listsIndentWrapper / listsOutdentWrapper
  // =========================================================================

  describe('listsIndentWrapper', () => {
    it('increments level by 1', () => {
      const proj = makeProjection({ numId: 1, level: 2 });
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);

      const result = listsIndentWrapper(editor, { target: proj.address });
      expect(result.success).toBe(true);
    });

    it('rejects tracked mode', () => {
      const proj = makeProjection({ numId: 1, level: 0 });
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);
      listsIndentWrapper(editor, { target: proj.address });
      expect(rejectTrackedMode).toHaveBeenCalledWith('lists.indent', undefined);
    });
  });

  describe('listsOutdentWrapper', () => {
    it('decrements level by 1', () => {
      const proj = makeProjection({ numId: 1, level: 2 });
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);

      const result = listsOutdentWrapper(editor, { target: proj.address });
      expect(result.success).toBe(true);
    });

    it('returns NO_OP at level 0', () => {
      const proj = makeProjection({ numId: 1, level: 0 });
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);

      const result = listsOutdentWrapper(editor, { target: proj.address });
      expect(result.success).toBe(false);
      expect((result as any).failure.code).toBe('NO_OP');
    });
  });

  // =========================================================================
  // listsSetValueWrapper
  // =========================================================================

  describe('listsSetValueWrapper', () => {
    it('sets value on first-in-sequence item', () => {
      const proj = makeProjection({ numId: 1, level: 0 });
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);
      vi.mocked(isFirstInSequence).mockReturnValueOnce(true);

      const result = listsSetValueWrapper(editor, { target: proj.address, value: 5 });
      expect(result.success).toBe(true);
      expect(ListHelpers.setLvlOverride).toHaveBeenCalledWith(editor, 1, 0, { startOverride: 5 });
    });

    it('separates then sets value for mid-sequence item', () => {
      const proj = makeProjection({ numId: 1, level: 0 });
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);
      vi.mocked(isFirstInSequence).mockReturnValueOnce(false);
      vi.mocked(getAbstractNumId).mockReturnValueOnce(10);
      vi.mocked(getSequenceFromTarget).mockReturnValueOnce([proj]);

      const result = listsSetValueWrapper(editor, { target: proj.address, value: 3 });
      expect(result.success).toBe(true);
      expect(ListHelpers.createNumDefinition).toHaveBeenCalled();
      expect(ListHelpers.setLvlOverride).toHaveBeenCalledWith(editor, 43, 0, { startOverride: 3 });
    });

    it('removes override when value is null', () => {
      const proj = makeProjection({ numId: 1, level: 0 });
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);
      editor.converter.numbering.definitions[1] = {
        elements: [{ name: 'w:lvlOverride', attributes: { 'w:ilvl': '0' } }],
      };

      const result = listsSetValueWrapper(editor, { target: proj.address, value: null });
      expect(result.success).toBe(true);
      expect(ListHelpers.removeLvlOverride).toHaveBeenCalledWith(editor, 1, 0);
    });

    it('returns NO_OP when removing an absent override', () => {
      const proj = makeProjection({ numId: 1, level: 0 });
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);
      editor.converter.numbering.definitions[1] = {
        elements: [{ name: 'w:abstractNumId', attributes: { 'w:val': '10' } }],
      };

      const result = listsSetValueWrapper(editor, { target: proj.address, value: null });
      expect(result.success).toBe(false);
      expect((result as any).failure.code).toBe('NO_OP');
      expect(ListHelpers.removeLvlOverride).not.toHaveBeenCalled();
    });

    it('returns dry-run result', () => {
      const proj = makeProjection({ numId: 1 });
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);

      const result = listsSetValueWrapper(editor, { target: proj.address, value: 5 }, { dryRun: true });
      expect(result.success).toBe(true);
      expect(ListHelpers.setLvlOverride).not.toHaveBeenCalled();
    });

    it('fails when target has no numId', () => {
      const proj = makeProjection({ numId: undefined as any });
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);

      const result = listsSetValueWrapper(editor, { target: proj.address, value: 1 });
      expect(result.success).toBe(false);
      expect((result as any).failure.code).toBe('INVALID_TARGET');
    });
  });

  // =========================================================================
  // listsContinuePreviousWrapper
  // =========================================================================

  describe('listsContinuePreviousWrapper', () => {
    it('continues from previous compatible sequence', () => {
      const proj = makeProjection({ numId: 2, level: 0 });
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);
      vi.mocked(evaluateCanContinuePrevious).mockReturnValueOnce({ canContinue: true });
      vi.mocked(findPreviousCompatibleSequence).mockReturnValueOnce({
        sequence: [makeProjection({ numId: 1 })],
        numId: 1,
      } as any);
      vi.mocked(getContiguousSequence).mockReturnValueOnce([proj]);

      const result = listsContinuePreviousWrapper(editor, { target: proj.address });
      expect(result.success).toBe(true);
      expect(ListHelpers.removeLvlOverride).toHaveBeenCalledWith(editor, 2, 0);
    });

    it('fails with NO_COMPATIBLE_PREVIOUS when no match', () => {
      const proj = makeProjection({ numId: 2 });
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);
      vi.mocked(evaluateCanContinuePrevious).mockReturnValueOnce({ canContinue: false, reason: 'NO_PREVIOUS_LIST' });

      const result = listsContinuePreviousWrapper(editor, { target: proj.address });
      expect(result.success).toBe(false);
      expect((result as any).failure.code).toBe('NO_COMPATIBLE_PREVIOUS');
    });

    it('fails with ALREADY_CONTINUOUS when already continuous', () => {
      const proj = makeProjection({ numId: 2 });
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);
      vi.mocked(evaluateCanContinuePrevious).mockReturnValueOnce({ canContinue: false, reason: 'ALREADY_CONTINUOUS' });

      const result = listsContinuePreviousWrapper(editor, { target: proj.address });
      expect(result.success).toBe(false);
      expect((result as any).failure.code).toBe('ALREADY_CONTINUOUS');
    });

    it('returns dry-run result', () => {
      const proj = makeProjection({ numId: 2 });
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);
      vi.mocked(evaluateCanContinuePrevious).mockReturnValueOnce({ canContinue: true });
      vi.mocked(findPreviousCompatibleSequence).mockReturnValueOnce({ sequence: [], numId: 1 } as any);

      const result = listsContinuePreviousWrapper(editor, { target: proj.address }, { dryRun: true });
      expect(result.success).toBe(true);
      expect(editor.view!.dispatch).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // listsSetLevelRestartWrapper
  // =========================================================================

  describe('listsSetLevelRestartWrapper', () => {
    it('sets lvlRestart at definition scope', () => {
      const proj = makeProjection({ numId: 1 });
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);
      vi.mocked(getAbstractNumId).mockReturnValueOnce(10);

      const result = listsSetLevelRestartWrapper(editor, {
        target: proj.address,
        level: 1,
        restartAfterLevel: 0,
        scope: 'definition',
      });
      expect(result.success).toBe(true);
      expect(ListHelpers.setLvlRestartOnAbstract).toHaveBeenCalledWith(editor, 10, 1, 0);
    });

    it('sets lvlRestart at instance scope', () => {
      const proj = makeProjection({ numId: 1 });
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);

      const result = listsSetLevelRestartWrapper(editor, {
        target: proj.address,
        level: 2,
        restartAfterLevel: 1,
        scope: 'instance',
      });
      expect(result.success).toBe(true);
      expect(ListHelpers.setLvlOverride).toHaveBeenCalledWith(editor, 1, 2, { lvlRestart: 1 });
    });

    it('defaults to definition scope', () => {
      const proj = makeProjection({ numId: 1 });
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);
      vi.mocked(getAbstractNumId).mockReturnValueOnce(10);

      listsSetLevelRestartWrapper(editor, { target: proj.address, level: 0, restartAfterLevel: null });
      expect(ListHelpers.setLvlRestartOnAbstract).toHaveBeenCalled();
    });

    it('fails with LEVEL_OUT_OF_RANGE for invalid level', () => {
      const proj = makeProjection({ numId: 1 });
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);

      const result = listsSetLevelRestartWrapper(editor, { target: proj.address, level: 99, restartAfterLevel: 0 });
      expect(result.success).toBe(false);
      expect((result as any).failure.code).toBe('LEVEL_OUT_OF_RANGE');
    });

    it('returns dry-run result', () => {
      const proj = makeProjection({ numId: 1 });
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);

      const result = listsSetLevelRestartWrapper(
        editor,
        {
          target: proj.address,
          level: 0,
          restartAfterLevel: null,
        },
        { dryRun: true },
      );
      expect(result.success).toBe(true);
      expect(ListHelpers.setLvlRestartOnAbstract).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // listsConvertToTextWrapper
  // =========================================================================

  describe('listsConvertToTextWrapper', () => {
    it('converts a list item to plain text', () => {
      const proj = makeProjection();
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);

      const result = listsConvertToTextWrapper(editor, { target: proj.address });
      expect(result.success).toBe(true);
      expect((result as any).paragraph.nodeType).toBe('paragraph');
    });

    it('prepends marker text when includeMarker is true', () => {
      const proj = makeProjection({ marker: '1.' });
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);

      const result = listsConvertToTextWrapper(editor, { target: proj.address, includeMarker: true });
      expect(result.success).toBe(true);
      expect(editor.state.tr.insertText).toHaveBeenCalledWith('1.', 11); // pos + 1
    });

    it('does not prepend marker text when includeMarker is false', () => {
      const proj = makeProjection({ marker: '1.' });
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);

      listsConvertToTextWrapper(editor, { target: proj.address, includeMarker: false });
      expect(editor.state.tr.insertText).not.toHaveBeenCalled();
    });

    it('returns dry-run result without mutations', () => {
      const proj = makeProjection();
      vi.mocked(resolveListItem).mockReturnValueOnce(proj);

      const result = listsConvertToTextWrapper(editor, { target: proj.address }, { dryRun: true });
      expect(result.success).toBe(true);
      expect(editor.view!.dispatch).not.toHaveBeenCalled();
    });
  });
});
