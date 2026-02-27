import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '../../core/Editor.js';
import {
  COMMAND_CATALOG,
  MUTATING_OPERATION_IDS,
  OPERATION_IDS,
  buildInternalContractSchemas,
  type OperationId,
} from '@superdoc/document-api';
import {
  TrackDeleteMarkName,
  TrackFormatMarkName,
  TrackInsertMarkName,
} from '../../extensions/track-changes/constants.js';
import { ListHelpers } from '../../core/helpers/list-numbering-helpers.js';
import { createCommentsWrapper } from '../plan-engine/comments-wrappers.js';
import { createParagraphWrapper, createHeadingWrapper } from '../plan-engine/create-wrappers.js';
import { blocksDeleteWrapper } from '../plan-engine/blocks-wrappers.js';
import { styleApplyWrapper } from '../plan-engine/plan-wrappers.js';
import {
  formatFontSizeWrapper,
  formatFontFamilyWrapper,
  formatColorWrapper,
  formatAlignWrapper,
} from '../plan-engine/format-value-wrappers.js';
import { stylesApplyAdapter } from '../styles-adapter.js';
import { createTableWrapper } from '../plan-engine/create-table-wrapper.js';
import {
  tablesDeleteWrapper,
  tablesClearContentsWrapper,
  tablesMoveWrapper,
  tablesSetLayoutWrapper,
  tablesSetAltTextWrapper,
  tablesConvertFromTextWrapper,
  tablesSplitWrapper,
  tablesConvertToTextWrapper,
  tablesInsertRowWrapper,
  tablesDeleteRowWrapper,
  tablesSetRowHeightWrapper,
  tablesDistributeRowsWrapper,
  tablesSetRowOptionsWrapper,
  tablesInsertColumnWrapper,
  tablesDeleteColumnWrapper,
  tablesSetColumnWidthWrapper,
  tablesDistributeColumnsWrapper,
  tablesInsertCellWrapper,
  tablesDeleteCellWrapper,
  tablesMergeCellsWrapper,
  tablesUnmergeCellsWrapper,
  tablesSplitCellWrapper,
  tablesSetCellPropertiesWrapper,
  tablesSortWrapper,
  tablesSetStyleWrapper,
  tablesClearStyleWrapper,
  tablesSetStyleOptionWrapper,
  tablesSetBorderWrapper,
  tablesClearBorderWrapper,
  tablesApplyBorderPresetWrapper,
  tablesSetShadingWrapper,
  tablesClearShadingWrapper,
  tablesSetTablePaddingWrapper,
  tablesSetCellPaddingWrapper,
  tablesSetCellSpacingWrapper,
  tablesClearCellSpacingWrapper,
} from '../plan-engine/tables-wrappers.js';
import { getDocumentApiCapabilities } from '../capabilities-adapter.js';
import {
  listsInsertWrapper,
  listsSetTypeWrapper,
  listsIndentWrapper,
  listsOutdentWrapper,
  listsRestartWrapper,
  listsExitWrapper,
} from '../plan-engine/lists-wrappers.js';
import { trackChangesAcceptWrapper, trackChangesRejectWrapper } from '../plan-engine/track-changes-wrappers.js';
import { registerBuiltInExecutors } from '../plan-engine/register-executors.js';
import { getRevision, initRevision } from '../plan-engine/revision-tracker.js';
import { executePlan } from '../plan-engine/executor.js';
import { toCanonicalTrackedChangeId } from '../helpers/tracked-change-resolver.js';
import { writeAdapter } from '../write-adapter.js';
import { tablesGetCellsAdapter, tablesGetPropertiesAdapter } from '../tables-adapter.js';
import {
  createSectionBreakAdapter,
  sectionsSetBreakTypeAdapter,
  sectionsSetPageMarginsAdapter,
  sectionsSetHeaderFooterMarginsAdapter,
  sectionsSetPageSetupAdapter,
  sectionsSetColumnsAdapter,
  sectionsSetLineNumberingAdapter,
  sectionsSetPageNumberingAdapter,
  sectionsSetTitlePageAdapter,
  sectionsSetOddEvenHeadersFootersAdapter,
  sectionsSetVerticalAlignAdapter,
  sectionsSetSectionDirectionAdapter,
  sectionsSetHeaderFooterRefAdapter,
  sectionsClearHeaderFooterRefAdapter,
  sectionsSetLinkToPreviousAdapter,
  sectionsSetPageBordersAdapter,
  sectionsClearPageBordersAdapter,
} from '../sections-adapter.js';
import { validateJsonSchema } from './schema-validator.js';

const mockedDeps = vi.hoisted(() => ({
  resolveCommentAnchorsById: vi.fn(() => []),
  listCommentAnchors: vi.fn(() => []),
  getTrackChanges: vi.fn(() => []),
  insertRowAtIndex: vi.fn(() => {}),
}));

vi.mock('../helpers/comment-target-resolver.js', () => ({
  resolveCommentAnchorsById: mockedDeps.resolveCommentAnchorsById,
  listCommentAnchors: mockedDeps.listCommentAnchors,
}));

vi.mock('../../extensions/track-changes/trackChangesHelpers/getTrackChanges.js', () => ({
  getTrackChanges: mockedDeps.getTrackChanges,
}));

vi.mock('../../extensions/table/tableHelpers/appendRows.js', () => ({
  insertRowAtIndex: mockedDeps.insertRowAtIndex,
}));

vi.mock('prosemirror-tables', () => ({
  TableMap: {
    get: vi.fn(() => ({
      width: 2,
      height: 2,
      // Positions of cells within table content tree (matches nodeAt traversal):
      // Row 0: cell-1 at pos 1, cell-2 at pos 10
      // Row 1: cell-3 at pos 21, cell-4 at pos 29
      map: [1, 10, 21, 29],
      positionAt: vi.fn(() => 1),
      colCount: vi.fn(() => 0),
    })),
  },
}));

vi.mock('prosemirror-model', async (importOriginal) => {
  const original = await importOriginal<typeof import('prosemirror-model')>();
  return {
    ...original,
    Fragment: { from: vi.fn((node: unknown) => node) },
  };
});

const INTERNAL_SCHEMAS = buildInternalContractSchemas();

type MutationVector = {
  throwCase: () => unknown;
  applyCase: () => unknown;
  failureCase?: () => unknown;
};

type NodeOptions = {
  attrs?: Record<string, unknown>;
  text?: string;
  isInline?: boolean;
  isBlock?: boolean;
  isLeaf?: boolean;
  inlineContent?: boolean;
  nodeSize?: number;
};

type MockParagraphNode = {
  type: { name: 'paragraph' };
  attrs: Record<string, unknown>;
  nodeSize: number;
  isBlock: true;
  textContent: string;
};

function createNode(typeName: string, children: ProseMirrorNode[] = [], options: NodeOptions = {}): ProseMirrorNode {
  const attrs = options.attrs ?? {};
  const text = options.text ?? '';
  const isText = typeName === 'text';
  const isInline = options.isInline ?? isText;
  const isBlock = options.isBlock ?? (!isInline && typeName !== 'doc');
  const inlineContent = options.inlineContent ?? isBlock;
  const isLeaf = options.isLeaf ?? (isInline && !isText && children.length === 0);

  const contentSize = children.reduce((sum, child) => sum + child.nodeSize, 0);
  const nodeSize = isText ? text.length : options.nodeSize != null ? options.nodeSize : isLeaf ? 1 : contentSize + 2;

  const node = {
    type: {
      name: typeName,
      create(newAttrs: Record<string, unknown>, newContent: unknown) {
        return createNode(typeName, [], { attrs: newAttrs, isBlock, inlineContent });
      },
      createAndFill() {
        return createNode(typeName, [], { attrs: {}, isBlock, inlineContent });
      },
    },
    attrs,
    text: isText ? text : undefined,
    content: { size: contentSize },
    nodeSize,
    isText,
    isInline,
    isBlock,
    inlineContent,
    isTextblock: inlineContent,
    isLeaf,
    childCount: children.length,
    child(index: number) {
      return children[index]!;
    },
    forEach(fn: (node: ProseMirrorNode, offset: number, index: number) => void) {
      let offset = 0;
      children.forEach((child, index) => {
        fn(child, offset, index);
        offset += child.nodeSize;
      });
    },
    nodeAt(pos: number): ProseMirrorNode | null {
      let offset = 0;
      for (const child of children) {
        if (pos === offset) return child;
        if (pos < offset + child.nodeSize) {
          return (child as unknown as { nodeAt: (p: number) => ProseMirrorNode | null }).nodeAt(pos - offset - 1);
        }
        offset += child.nodeSize;
      }
      return null;
    },
    copy(_content?: unknown) {
      return node;
    },
    get textContent(): string {
      if (isText) return text;
      return children.map((c) => c.textContent).join('');
    },
    _children: children,
    descendants(callback: (node: ProseMirrorNode, pos: number) => boolean | void) {
      function walk(kids: ProseMirrorNode[], startPos: number) {
        let offset = startPos;
        for (const child of kids) {
          const childStart = offset;
          const result = callback(child, childStart);
          if (result !== false) {
            const innerKids = (child as unknown as { _children?: ProseMirrorNode[] })._children;
            if (innerKids && innerKids.length > 0) {
              walk(innerKids, childStart + 1);
            }
          }
          offset += child.nodeSize;
        }
      }
      walk(children, 0);
    },
  };
  return node as unknown as ProseMirrorNode;
}

function makeTextEditor(
  text = 'Hello',
  overrides: Partial<Editor> & {
    commands?: Record<string, unknown>;
    schema?: Record<string, unknown>;
  } = {},
): {
  editor: Editor;
  dispatch: ReturnType<typeof vi.fn>;
  tr: {
    insertText: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    addMark: ReturnType<typeof vi.fn>;
    removeMark: ReturnType<typeof vi.fn>;
    replaceWith: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    setMeta: ReturnType<typeof vi.fn>;
  };
} {
  const textNode = createNode('text', [], { text });
  const paragraph = createNode('paragraph', [textNode], {
    attrs: { sdBlockId: 'p1' },
    isBlock: true,
    inlineContent: true,
  });
  const doc = createNode('doc', [paragraph], { isBlock: false });

  const tr = {
    insertText: vi.fn(),
    delete: vi.fn(),
    addMark: vi.fn(),
    removeMark: vi.fn(),
    replaceWith: vi.fn(),
    insert: vi.fn(),
    setMeta: vi.fn(),
    mapping: { map: (pos: number) => pos },
    docChanged: false,
    doc: {
      resolve: () => ({ marks: () => [] }),
    },
  };
  tr.insertText.mockReturnValue(tr);
  tr.delete.mockReturnValue(tr);
  tr.addMark.mockReturnValue(tr);
  tr.removeMark.mockReturnValue(tr);
  tr.replaceWith.mockReturnValue(tr);
  tr.insert.mockReturnValue(tr);
  tr.setMeta.mockReturnValue(tr);

  const dispatch = vi.fn();

  const baseCommands = {
    insertTrackedChange: vi.fn(() => true),
    setTextSelection: vi.fn(() => true),
    addComment: vi.fn(() => true),
    editComment: vi.fn(() => true),
    addCommentReply: vi.fn(() => true),
    moveComment: vi.fn(() => true),
    resolveComment: vi.fn(() => true),
    removeComment: vi.fn(() => true),
    setCommentInternal: vi.fn(() => true),
    setActiveComment: vi.fn(() => true),
    setCursorById: vi.fn(() => true),
    acceptTrackedChangeById: vi.fn(() => true),
    rejectTrackedChangeById: vi.fn(() => true),
    acceptAllTrackedChanges: vi.fn(() => true),
    rejectAllTrackedChanges: vi.fn(() => true),
    insertParagraphAt: vi.fn(() => true),
    insertHeadingAt: vi.fn(() => true),
    insertListItemAt: vi.fn(() => true),
    setListTypeAt: vi.fn(() => true),
    increaseListIndent: vi.fn(() => true),
    decreaseListIndent: vi.fn(() => true),
    restartNumbering: vi.fn(() => true),
    exitListItemAt: vi.fn(() => true),
    setFontSize: vi.fn(() => true),
    unsetFontSize: vi.fn(() => true),
    setFontFamily: vi.fn(() => true),
    unsetFontFamily: vi.fn(() => true),
    setColor: vi.fn(() => true),
    unsetColor: vi.fn(() => true),
    setTextAlign: vi.fn(() => true),
    unsetTextAlign: vi.fn(() => true),
  };

  const baseMarks = {
    bold: {
      create: vi.fn(() => ({ type: 'bold' })),
    },
    italic: {
      create: vi.fn(() => ({ type: 'italic' })),
    },
    underline: {
      create: vi.fn(() => ({ type: 'underline' })),
    },
    strike: {
      create: vi.fn(() => ({ type: 'strike' })),
    },
    textStyle: {
      create: vi.fn(() => ({ type: 'textStyle' })),
    },
    [TrackFormatMarkName]: {
      create: vi.fn(() => ({ type: TrackFormatMarkName })),
    },
  };

  const stateSchema = {
    marks: baseMarks,
    text: (t: string, m?: unknown[]) => ({ type: { name: 'text' }, text: t, marks: m ?? [] }),
    nodes: {
      paragraph: {
        createAndFill: vi.fn((attrs?: unknown, content?: unknown) => ({
          type: { name: 'paragraph' },
          attrs,
          content,
          nodeSize: 2,
        })),
        create: vi.fn((attrs?: unknown, content?: unknown) => ({
          type: { name: 'paragraph' },
          attrs,
          content,
          nodeSize: 2,
        })),
      },
    },
  };

  const editor = {
    state: {
      doc: {
        ...doc,
        nodeAt: vi.fn((pos: number) => {
          if (pos === 0) return paragraph;
          if (pos === 1) return textNode;
          return null;
        }),
        textBetween: vi.fn((from: number, to: number) => {
          const start = Math.max(0, from - 1);
          const end = Math.max(start, to - 1);
          return text.slice(start, end);
        }),
        nodesBetween: vi.fn((_from: number, _to: number, callback: (node: any, pos: number) => boolean | void) => {
          // Visit paragraph at pos 0, then text child at pos 1
          if (callback({ ...paragraph, marks: [] }, 0) !== false) {
            callback({ ...textNode, marks: [] }, 1);
          }
        }),
      },
      tr,
      schema: stateSchema,
    },
    can: vi.fn(() => ({
      insertParagraphAt: vi.fn(() => true),
      insertHeadingAt: vi.fn(() => true),
      insertListItemAt: vi.fn(() => true),
      setListTypeAt: vi.fn(() => true),
      increaseListIndent: vi.fn(() => true),
      decreaseListIndent: vi.fn(() => true),
      restartNumbering: vi.fn(() => true),
      exitListItemAt: vi.fn(() => true),
    })),
    dispatch,
    ...overrides,
    schema: {
      marks: baseMarks,
      ...(overrides.schema ?? {}),
    },
    commands: {
      ...baseCommands,
      ...(overrides.commands ?? {}),
    },
  } as unknown as Editor;

  return { editor, dispatch, tr };
}

function makeListParagraph(options: {
  id: string;
  text?: string;
  numId?: number;
  ilvl?: number;
  numberingType?: string;
  markerText?: string;
  path?: number[];
}): MockParagraphNode {
  const text = options.text ?? '';
  const numberingProperties =
    options.numId != null
      ? {
          numId: options.numId,
          ilvl: options.ilvl ?? 0,
        }
      : undefined;

  return {
    type: { name: 'paragraph' },
    attrs: {
      paraId: options.id,
      sdBlockId: options.id,
      paragraphProperties: numberingProperties ? { numberingProperties } : {},
      listRendering:
        options.numId != null
          ? {
              markerText: options.markerText ?? '',
              path: options.path ?? [1],
              numberingType: options.numberingType ?? 'decimal',
            }
          : null,
    },
    nodeSize: Math.max(2, text.length + 2),
    isBlock: true,
    textContent: text,
  };
}

function makeListEditor(children: MockParagraphNode[], commandOverrides: Record<string, unknown> = {}): Editor {
  const doc = {
    get content() {
      return {
        size: children.reduce((sum, child) => sum + child.nodeSize, 0),
      };
    },
    descendants(callback: (node: MockParagraphNode, pos: number) => void) {
      let pos = 0;
      for (const child of children) {
        callback(child, pos);
        pos += child.nodeSize;
      }
      return undefined;
    },
    nodesBetween(_from: number, _to: number, callback: (node: unknown) => void) {
      for (const child of children) {
        callback(child);
      }
      return undefined;
    },
  };

  const baseCommands = {
    insertListItemAt: vi.fn(() => true),
    setListTypeAt: vi.fn(() => true),
    setTextSelection: vi.fn(() => true),
    increaseListIndent: vi.fn(() => true),
    decreaseListIndent: vi.fn(() => true),
    restartNumbering: vi.fn(() => true),
    exitListItemAt: vi.fn(() => true),
    insertTrackedChange: vi.fn(() => true),
  };

  const tr = {
    setMeta: vi.fn().mockReturnThis(),
    insertText: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    mapping: {
      maps: [] as unknown[],
      map: (p: number) => p,
      slice: () => ({ map: (p: number) => p }),
    },
    doc,
  };

  return {
    state: { doc, tr },
    dispatch: vi.fn(),
    commands: {
      ...baseCommands,
      ...commandOverrides,
    },
    converter: {
      numbering: { definitions: {}, abstracts: {} },
    },
  } as unknown as Editor;
}

function makeBlockDeleteEditor(
  overrides: {
    deleteBlockNodeById?: unknown;
    getBlockNodeById?: unknown;
    hasParagraph?: boolean;
  } = {},
): Editor {
  const hasParagraph = overrides.hasParagraph ?? true;
  const paragraph = hasParagraph
    ? createNode('paragraph', [createNode('text', [], { text: 'Hello' })], {
        attrs: { paraId: 'p1', sdBlockId: 'p1' },
        isBlock: true,
        inlineContent: true,
      })
    : null;
  const doc = createNode('doc', paragraph ? [paragraph] : [], { isBlock: false });

  const dispatch = vi.fn();
  const tr = {
    setMeta: vi.fn().mockReturnThis(),
    mapping: { map: (pos: number) => pos },
    docChanged: false,
  };

  return {
    state: { doc, tr },
    dispatch,
    commands: {
      deleteBlockNodeById: overrides.deleteBlockNodeById ?? vi.fn(() => true),
    },
    helpers: {
      blockNode: {
        getBlockNodeById:
          overrides.getBlockNodeById ??
          vi.fn((id: string) => (id === 'p1' && hasParagraph ? [{ node: paragraph, pos: 0 }] : [])),
      },
    },
  } as unknown as Editor;
}

function makeCommentRecord(
  commentId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> & { commentId: string } {
  return {
    commentId,
    commentText: 'Original',
    isDone: false,
    isInternal: false,
    ...overrides,
  };
}

function makeCommentsEditor(
  records: Array<Record<string, unknown>> = [],
  commandOverrides: Record<string, unknown> = {},
): Editor {
  const { editor } = makeTextEditor('Hello', { commands: commandOverrides });
  return {
    ...editor,
    converter: {
      comments: [...records],
    },
    options: {
      documentId: 'doc-1',
      user: {
        name: 'Agent',
        email: 'agent@example.com',
      },
    },
  } as unknown as Editor;
}

/**
 * Creates a mock editor with a valid `word/styles.xml` structure for styles.apply tests.
 * Optionally omit the converter or styles part to test capability gates.
 */
function makeStylesEditor(
  opts: {
    hasConverter?: boolean;
    hasStylesPart?: boolean;
    boldElements?: Array<{ attributes?: Record<string, string> }>;
  } = {},
): Editor {
  const { hasConverter = true, hasStylesPart = true, boldElements = [] } = opts;

  const rPrElements = boldElements.map((el) => ({
    name: 'w:b',
    ...(el.attributes ? { attributes: el.attributes } : {}),
  }));

  const stylesXml = {
    name: 'xml',
    elements: [
      {
        name: 'w:styles',
        elements: [
          {
            name: 'w:docDefaults',
            elements: [
              {
                name: 'w:rPrDefault',
                elements: [
                  {
                    name: 'w:rPr',
                    elements: rPrElements,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const converter = hasConverter
    ? {
        convertedXml: hasStylesPart ? { 'word/styles.xml': stylesXml } : {},
        documentModified: false,
        documentGuid: 'test-guid',
        promoteToGuid: vi.fn(() => 'promoted-guid'),
        translatedLinkedStyles: {},
      }
    : undefined;

  return {
    converter,
    options: {},
    on: vi.fn(),
    emit: vi.fn(),
  } as unknown as Editor;
}

/**
 * Creates a mock editor with a table document structure for table adapter conformance tests.
 *
 * Document structure: doc > table > tableRow > tableCell > paragraph
 * The table, row, and cell all have sdBlockId attrs so they get indexed.
 */
function makeTableEditor(
  commandOverrides: Record<string, unknown> = {},
  options?: { throwOnDispatch?: boolean; rowHeight?: number | null; cellColspan?: number },
): Editor {
  const textNode = createNode('text', [], { text: 'Hello' });
  const paragraph = createNode('paragraph', [textNode], {
    attrs: { sdBlockId: 'p1', paraId: 'p1', paragraphProperties: {} },
    isBlock: true,
    inlineContent: true,
  });
  const cell1Colspan = options?.cellColspan ?? 1;
  const tableCell = createNode('tableCell', [paragraph], {
    attrs: { sdBlockId: 'cell-1', colspan: cell1Colspan, rowspan: 1 },
    isBlock: true,
    inlineContent: false,
  });
  const tableCell2 = createNode(
    'tableCell',
    [
      createNode('paragraph', [createNode('text', [], { text: 'World' })], {
        attrs: { sdBlockId: 'p2', paraId: 'p2', paragraphProperties: {} },
        isBlock: true,
        inlineContent: true,
      }),
    ],
    {
      attrs: { sdBlockId: 'cell-2', colspan: 1, rowspan: 1 },
      isBlock: true,
      inlineContent: false,
    },
  );
  const rh = options?.rowHeight ?? null;
  const tableRow = createNode('tableRow', [tableCell, tableCell2], {
    attrs: { sdBlockId: 'row-1', rowHeight: rh, cantSplit: false, tableRowProperties: {} },
    isBlock: true,
    inlineContent: false,
  });
  const tableRow2 = createNode(
    'tableRow',
    [
      createNode(
        'tableCell',
        [
          createNode('paragraph', [createNode('text', [], { text: 'R2C1' })], {
            attrs: { sdBlockId: 'p3', paraId: 'p3', paragraphProperties: {} },
            isBlock: true,
            inlineContent: true,
          }),
        ],
        {
          attrs: { sdBlockId: 'cell-3', colspan: 1, rowspan: 1 },
          isBlock: true,
          inlineContent: false,
        },
      ),
      createNode(
        'tableCell',
        [
          createNode('paragraph', [createNode('text', [], { text: 'R2C2' })], {
            attrs: { sdBlockId: 'p4', paraId: 'p4', paragraphProperties: {} },
            isBlock: true,
            inlineContent: true,
          }),
        ],
        {
          attrs: { sdBlockId: 'cell-4', colspan: 1, rowspan: 1 },
          isBlock: true,
          inlineContent: false,
        },
      ),
    ],
    {
      attrs: { sdBlockId: 'row-2', rowHeight: rh, cantSplit: false, tableRowProperties: {} },
      isBlock: true,
      inlineContent: false,
    },
  );
  const table = createNode('table', [tableRow, tableRow2], {
    attrs: {
      sdBlockId: 'table-1',
      tableProperties: {},
      tableGrid: [5000, 5000],
    },
    isBlock: true,
    inlineContent: false,
  });
  const doc = createNode('doc', [table], { isBlock: false });

  const dispatch = options?.throwOnDispatch
    ? vi.fn(() => {
        throw new Error('dispatch failed');
      })
    : vi.fn();
  const insertTableAt = vi.fn(() => true);

  const baseCommands = {
    insertTableAt,
    insertTrackedChange: vi.fn(() => true),
    ...commandOverrides,
  };

  const mockParagraph = createNode('paragraph', [], {
    attrs: { paragraphProperties: {} },
    isBlock: true,
    inlineContent: true,
  });
  const mockCell = createNode('tableCell', [mockParagraph], {
    attrs: { colspan: 1, rowspan: 1 },
    isBlock: true,
    inlineContent: false,
  });
  const mockRow = createNode('tableRow', [mockCell], {
    attrs: { sdBlockId: 'mock-row' },
    isBlock: true,
    inlineContent: false,
  });
  const mockTable = createNode('table', [mockRow], {
    attrs: { sdBlockId: 'mock-table' },
    isBlock: true,
    inlineContent: false,
  });
  const schemaNodes = {
    paragraph: {
      createAndFill: vi.fn((_attrs?: unknown, content?: unknown) => {
        const children = content ? [content] : [];
        return createNode('paragraph', children as ProseMirrorNode[], {
          attrs: { paragraphProperties: {} },
          isBlock: true,
          inlineContent: true,
        });
      }),
    },
    table: {
      createAndFill: vi.fn(() => mockTable),
      create: vi.fn((_attrs?: unknown, content?: unknown) => {
        const children =
          content && typeof (content as { forEach?: unknown }).forEach === 'function' ? [] : content ? [content] : [];
        return createNode('table', children as ProseMirrorNode[], {
          attrs: { sdBlockId: 'new-table' },
          isBlock: true,
          inlineContent: false,
        });
      }),
    },
    tableRow: {
      createAndFill: vi.fn((_attrs?: unknown, content?: unknown) => {
        const children = Array.isArray(content) ? content : content ? [content] : [];
        return createNode('tableRow', children as ProseMirrorNode[], {
          attrs: { sdBlockId: 'new-row' },
          isBlock: true,
          inlineContent: false,
        });
      }),
    },
    tableCell: {
      createAndFill: vi.fn((_attrs?: unknown, content?: unknown) => {
        const children = content ? [content] : [mockParagraph];
        return createNode('tableCell', children as ProseMirrorNode[], {
          attrs: { colspan: 1, rowspan: 1 },
          isBlock: true,
          inlineContent: false,
        });
      }),
    },
  };

  const docWithMethods = {
    ...doc,
    textBetween: vi.fn(() => ''),
  };

  const tr = {
    insertText: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    setNodeMarkup: vi.fn().mockReturnThis(),
    replaceWith: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    setMeta: vi.fn().mockReturnThis(),
    mapping: {
      maps: [] as unknown[],
      map: (p: number) => p,
      slice: () => ({ map: (p: number) => p }),
    },
    doc: docWithMethods,
  };

  return {
    state: {
      doc: docWithMethods,
      tr,
      schema: {
        nodes: schemaNodes,
        text: (t: string) => createNode('text', [], { text: t }),
      },
    },
    dispatch,
    commands: baseCommands,
    can: vi.fn(() => ({
      insertTableAt: vi.fn(() => true),
    })),
    schema: {
      marks: {},
      nodes: schemaNodes,
      text: (t: string) => createNode('text', [], { text: t }),
    },
    options: {},
  } as unknown as Editor;
}

type SectionEditorOptions = {
  bodySectPr?: Record<string, unknown> | null;
  paragraphSectPr?: Record<string, unknown> | null;
  includeConverter?: boolean;
  throwOnInsert?: boolean;
  includeParagraphNodeType?: boolean;
};

const BASE_SECTION_BODY_SECT_PR: Record<string, unknown> = {
  type: 'element',
  name: 'w:sectPr',
  elements: [
    { type: 'element', name: 'w:type', attributes: { 'w:val': 'continuous' } },
    {
      type: 'element',
      name: 'w:pgMar',
      attributes: {
        'w:top': '1440',
        'w:right': '1440',
        'w:bottom': '1440',
        'w:left': '1440',
        'w:gutter': '0',
        'w:header': '720',
        'w:footer': '720',
      },
    },
    {
      type: 'element',
      name: 'w:pgSz',
      attributes: {
        'w:w': '12240',
        'w:h': '15840',
        'w:orient': 'portrait',
        'w:code': '1',
      },
    },
    {
      type: 'element',
      name: 'w:cols',
      attributes: { 'w:num': '1', 'w:space': '720', 'w:equalWidth': '1' },
    },
    {
      type: 'element',
      name: 'w:lnNumType',
      attributes: { 'w:countBy': '1', 'w:start': '1', 'w:distance': '720', 'w:restart': 'continuous' },
    },
    {
      type: 'element',
      name: 'w:pgNumType',
      attributes: { 'w:start': '1', 'w:fmt': 'decimal' },
    },
    { type: 'element', name: 'w:titlePg', elements: [] },
    { type: 'element', name: 'w:vAlign', attributes: { 'w:val': 'top' } },
    {
      type: 'element',
      name: 'w:headerReference',
      attributes: { 'w:type': 'default', 'r:id': 'rIdHeaderDefault' },
    },
    {
      type: 'element',
      name: 'w:footerReference',
      attributes: { 'w:type': 'default', 'r:id': 'rIdFooterDefault' },
    },
    {
      type: 'element',
      name: 'w:pgBorders',
      attributes: { 'w:display': 'allPages', 'w:offsetFrom': 'page', 'w:zOrder': 'front' },
      elements: [
        {
          type: 'element',
          name: 'w:top',
          attributes: { 'w:val': 'single', 'w:sz': '8', 'w:space': '0', 'w:color': '000000' },
        },
      ],
    },
  ],
};

const PREVIOUS_SECTION_SECT_PR: Record<string, unknown> = {
  type: 'element',
  name: 'w:sectPr',
  elements: [
    { type: 'element', name: 'w:type', attributes: { 'w:val': 'nextPage' } },
    {
      type: 'element',
      name: 'w:headerReference',
      attributes: { 'w:type': 'default', 'r:id': 'rIdPrevHeader' },
    },
    {
      type: 'element',
      name: 'w:footerReference',
      attributes: { 'w:type': 'default', 'r:id': 'rIdPrevFooter' },
    },
  ],
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function makeSectionsEditor(options: SectionEditorOptions = {}): Editor {
  const {
    bodySectPr = BASE_SECTION_BODY_SECT_PR,
    paragraphSectPr = null,
    includeConverter = true,
    throwOnInsert = false,
    includeParagraphNodeType = true,
  } = options;

  const paragraphAttrs: Record<string, unknown> = {
    sdBlockId: 'p1',
    paraId: 'p1',
    paragraphProperties: paragraphSectPr ? { sectPr: clone(paragraphSectPr) } : {},
  };
  const paragraphNode = createNode('paragraph', [createNode('text', [], { text: 'Section text' })], {
    attrs: paragraphAttrs,
    isBlock: true,
    inlineContent: true,
  });

  const docAttrs: Record<string, unknown> = {};
  if (bodySectPr) {
    docAttrs.bodySectPr = clone(bodySectPr);
  }

  const doc = createNode('doc', [paragraphNode], {
    attrs: docAttrs,
    isBlock: false,
  }) as unknown as ProseMirrorNode & { toJSON?: () => unknown };

  const docJson = {
    type: 'doc',
    attrs: docAttrs,
    content: [
      {
        type: 'paragraph',
        attrs: paragraphAttrs,
      },
    ],
  };
  doc.toJSON = () => clone(docJson);

  const tr = {
    insert: vi.fn(function insert() {
      if (throwOnInsert) {
        throw new Error('insert failed');
      }
      return tr;
    }),
    setNodeMarkup: vi.fn(() => tr),
    setMeta: vi.fn(() => tr),
    mapping: {
      maps: [] as unknown[],
      map: (position: number) => position,
      slice: () => ({ map: (position: number) => position }),
    },
    doc,
  };

  const schemaNodes = includeParagraphNodeType
    ? {
        paragraph: {
          createAndFill: vi.fn((attrs?: Record<string, unknown>) =>
            createNode('paragraph', [], { attrs: attrs ?? {}, isBlock: true, inlineContent: true }),
          ),
          create: vi.fn((attrs?: Record<string, unknown>) =>
            createNode('paragraph', [], { attrs: attrs ?? {}, isBlock: true, inlineContent: true }),
          ),
        },
      }
    : {};

  const editor = {
    state: {
      doc,
      tr,
      schema: {
        nodes: schemaNodes,
      },
    },
    dispatch: vi.fn(),
    commands: {},
    schema: { marks: {}, nodes: schemaNodes },
    options: {},
  } as unknown as Editor;

  if (includeConverter) {
    (editor as unknown as { converter?: Record<string, unknown> }).converter = {
      bodySectPr: bodySectPr ? clone(bodySectPr) : undefined,
      convertedXml: {
        'word/settings.xml': {
          type: 'element',
          name: 'document',
          elements: [{ type: 'element', name: 'w:settings', elements: [] }],
        },
        'word/_rels/document.xml.rels': {
          elements: [
            {
              type: 'element',
              name: 'Relationships',
              attributes: { xmlns: 'http://schemas.openxmlformats.org/package/2006/relationships' },
              elements: [
                {
                  type: 'element',
                  name: 'Relationship',
                  attributes: {
                    Id: 'rIdHeaderDefault',
                    Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header',
                    Target: 'header1.xml',
                  },
                },
                {
                  type: 'element',
                  name: 'Relationship',
                  attributes: {
                    Id: 'rIdFooterDefault',
                    Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer',
                    Target: 'footer1.xml',
                  },
                },
                {
                  type: 'element',
                  name: 'Relationship',
                  attributes: {
                    Id: 'rIdHeaderAlt',
                    Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header',
                    Target: 'header2.xml',
                  },
                },
              ],
            },
          ],
        },
      },
      pageStyles: {},
    };
  }

  return editor;
}

/** Table operation IDs that are actually implemented (not stubs). */
const IMPLEMENTED_TABLE_OPS: ReadonlySet<OperationId> = new Set([
  'create.table',
  'tables.delete',
  'tables.clearContents',
  'tables.move',
  'tables.setLayout',
  'tables.setAltText',
  'tables.insertRow',
  'tables.deleteRow',
  'tables.setRowHeight',
  'tables.distributeRows',
  'tables.setRowOptions',
  'tables.insertColumn',
  'tables.deleteColumn',
  'tables.setColumnWidth',
  'tables.distributeColumns',
  'tables.insertCell',
  'tables.deleteCell',
  'tables.mergeCells',
  'tables.unmergeCells',
  'tables.splitCell',
  'tables.setCellProperties',
  'tables.convertFromText',
  'tables.split',
  'tables.convertToText',
  'tables.sort',
  'tables.setStyle',
  'tables.clearStyle',
  'tables.setStyleOption',
  'tables.setBorder',
  'tables.clearBorder',
  'tables.applyBorderPreset',
  'tables.setShading',
  'tables.clearShading',
  'tables.setTablePadding',
  'tables.setCellPadding',
  'tables.setCellSpacing',
  'tables.clearCellSpacing',
] as OperationId[]);

/** Table stub ops that always throw CAPABILITY_UNAVAILABLE. */
const STUB_TABLE_OPS: ReadonlySet<OperationId> = new Set([] as OperationId[]);

/**
 * Plan-engine meta-operations that don't follow the standard throw/failure/apply
 * pattern. mutations.apply returns PlanReceipt (always success: true) or throws.
 */
const PLAN_ENGINE_META_OPS: ReadonlySet<OperationId> = new Set(['mutations.apply'] as OperationId[]);
const HAS_STRUCTURED_FAILURE_RESULT = (operationId: OperationId): boolean =>
  COMMAND_CATALOG[operationId].possibleFailureCodes.length > 0;

function setTrackChanges(changes: Array<Record<string, unknown>>): void {
  mockedDeps.getTrackChanges.mockReturnValue(changes as never);
}

function makeTrackedChange(id = 'tc-1') {
  return {
    mark: {
      type: { name: TrackInsertMarkName },
      attrs: { id },
    },
    from: 1,
    to: 3,
  };
}

function requireCanonicalTrackChangeId(editor: Editor, rawId: string): string {
  const canonicalId = toCanonicalTrackedChangeId(editor, rawId);
  expect(canonicalId).toBeTruthy();
  return canonicalId!;
}

function assertSchema(operationId: OperationId, schemaType: 'output' | 'success' | 'failure', value: unknown): void {
  const schemaSet = INTERNAL_SCHEMAS.operations[operationId];
  const schema = schemaSet[schemaType];
  expect(schema).toBeDefined();

  const $defs = INTERNAL_SCHEMAS.$defs as Record<string, Parameters<typeof validateJsonSchema>[0]> | undefined;
  const result = validateJsonSchema(schema as Parameters<typeof validateJsonSchema>[0], value, $defs);
  expect(
    result.valid,
    `Schema validation failed for ${operationId} (${schemaType}):\n${result.errors.join('\n')}`,
  ).toBe(true);
}

function expectThrowCode(operationId: OperationId, run: () => unknown): void {
  let capturedCode: string | null = null;
  try {
    run();
  } catch (error) {
    capturedCode = (error as { code?: string }).code ?? null;
  }

  expect(capturedCode).toBeTruthy();
  expect(COMMAND_CATALOG[operationId].throws.preApply).toContain(capturedCode);
}

const mutationVectors: Partial<Record<OperationId, MutationVector>> = {
  'blocks.delete': {
    throwCase: () => {
      const editor = makeBlockDeleteEditor();
      return blocksDeleteWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'paragraph', nodeId: 'missing' } },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeBlockDeleteEditor();
      return blocksDeleteWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' } },
        { changeMode: 'direct' },
      );
    },
  },
  insert: {
    throwCase: () => {
      const { editor } = makeTextEditor();
      return writeAdapter(
        editor,
        { kind: 'insert', target: { kind: 'text', blockId: 'missing', range: { start: 0, end: 0 } }, text: 'X' },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const { editor } = makeTextEditor();
      return writeAdapter(
        editor,
        { kind: 'insert', target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 0 } }, text: '' },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const { editor } = makeTextEditor();
      return writeAdapter(
        editor,
        { kind: 'insert', target: { kind: 'text', blockId: 'p1', range: { start: 1, end: 1 } }, text: 'X' },
        { changeMode: 'direct' },
      );
    },
  },
  replace: {
    throwCase: () => {
      const { editor } = makeTextEditor();
      return writeAdapter(
        editor,
        { kind: 'replace', target: { kind: 'text', blockId: 'missing', range: { start: 0, end: 1 } }, text: 'X' },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const { editor } = makeTextEditor('Hello');
      return writeAdapter(
        editor,
        { kind: 'replace', target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } }, text: 'Hello' },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const { editor } = makeTextEditor('Hello');
      return writeAdapter(
        editor,
        { kind: 'replace', target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } }, text: 'World' },
        { changeMode: 'direct' },
      );
    },
  },
  delete: {
    throwCase: () => {
      const { editor } = makeTextEditor();
      return writeAdapter(
        editor,
        { kind: 'delete', target: { kind: 'text', blockId: 'missing', range: { start: 0, end: 1 } } },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const { editor } = makeTextEditor();
      return writeAdapter(
        editor,
        { kind: 'delete', target: { kind: 'text', blockId: 'p1', range: { start: 2, end: 2 } } },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const { editor } = makeTextEditor();
      return writeAdapter(
        editor,
        { kind: 'delete', target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 2 } } },
        { changeMode: 'direct' },
      );
    },
  },
  'format.apply': {
    throwCase: () => {
      const { editor } = makeTextEditor();
      return styleApplyWrapper(
        editor,
        { target: { kind: 'text', blockId: 'missing', range: { start: 0, end: 1 } }, inline: { bold: 'on' } },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const { editor } = makeTextEditor();
      return styleApplyWrapper(
        editor,
        { target: { kind: 'text', blockId: 'p1', range: { start: 2, end: 2 } }, inline: { bold: 'on' } },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const { editor } = makeTextEditor();
      return styleApplyWrapper(
        editor,
        { target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } }, inline: { bold: 'on', italic: 'off' } },
        { changeMode: 'direct' },
      );
    },
  },
  'format.fontSize': {
    throwCase: () => {
      const { editor } = makeTextEditor();
      return formatFontSizeWrapper(
        editor,
        { target: { kind: 'text', blockId: 'missing', range: { start: 0, end: 1 } }, value: '14pt' },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const { editor } = makeTextEditor();
      return formatFontSizeWrapper(
        editor,
        { target: { kind: 'text', blockId: 'p1', range: { start: 2, end: 2 } }, value: '14pt' },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const { editor } = makeTextEditor();
      return formatFontSizeWrapper(
        editor,
        { target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } }, value: '14pt' },
        { changeMode: 'direct' },
      );
    },
  },
  'format.fontFamily': {
    throwCase: () => {
      const { editor } = makeTextEditor();
      return formatFontFamilyWrapper(
        editor,
        { target: { kind: 'text', blockId: 'missing', range: { start: 0, end: 1 } }, value: 'Arial' },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const { editor } = makeTextEditor();
      return formatFontFamilyWrapper(
        editor,
        { target: { kind: 'text', blockId: 'p1', range: { start: 2, end: 2 } }, value: 'Arial' },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const { editor } = makeTextEditor();
      return formatFontFamilyWrapper(
        editor,
        { target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } }, value: 'Arial' },
        { changeMode: 'direct' },
      );
    },
  },
  'format.color': {
    throwCase: () => {
      const { editor } = makeTextEditor();
      return formatColorWrapper(
        editor,
        { target: { kind: 'text', blockId: 'missing', range: { start: 0, end: 1 } }, value: '#ff0000' },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const { editor } = makeTextEditor();
      return formatColorWrapper(
        editor,
        { target: { kind: 'text', blockId: 'p1', range: { start: 2, end: 2 } }, value: '#ff0000' },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const { editor } = makeTextEditor();
      return formatColorWrapper(
        editor,
        { target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } }, value: '#ff0000' },
        { changeMode: 'direct' },
      );
    },
  },
  'format.align': {
    throwCase: () => {
      const { editor } = makeTextEditor();
      return formatAlignWrapper(
        editor,
        { target: { kind: 'text', blockId: 'missing', range: { start: 0, end: 1 } }, alignment: 'center' },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const { editor } = makeTextEditor('Hello', { commands: { setTextAlign: vi.fn(() => false) } });
      return formatAlignWrapper(
        editor,
        { target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } }, alignment: 'center' },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const { editor } = makeTextEditor();
      return formatAlignWrapper(
        editor,
        { target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } }, alignment: 'center' },
        { changeMode: 'direct' },
      );
    },
  },
  'create.paragraph': {
    throwCase: () => {
      const { editor } = makeTextEditor('Hello', { commands: { insertParagraphAt: undefined } });
      return createParagraphWrapper(editor, { at: { kind: 'documentEnd' }, text: 'X' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const { editor } = makeTextEditor('Hello', { commands: { insertParagraphAt: vi.fn(() => false) } });
      return createParagraphWrapper(editor, { at: { kind: 'documentEnd' }, text: 'X' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const { editor } = makeTextEditor('Hello', { commands: { insertParagraphAt: vi.fn(() => true) } });
      return createParagraphWrapper(editor, { at: { kind: 'documentEnd' }, text: 'X' }, { changeMode: 'direct' });
    },
  },
  'create.heading': {
    throwCase: () => {
      const { editor } = makeTextEditor('Hello', { commands: { insertHeadingAt: undefined } });
      return createHeadingWrapper(
        editor,
        { level: 1, at: { kind: 'documentEnd' }, text: 'X' },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const { editor } = makeTextEditor('Hello', { commands: { insertHeadingAt: vi.fn(() => false) } });
      return createHeadingWrapper(
        editor,
        { level: 1, at: { kind: 'documentEnd' }, text: 'X' },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const { editor } = makeTextEditor('Hello', { commands: { insertHeadingAt: vi.fn(() => true) } });
      return createHeadingWrapper(
        editor,
        { level: 2, at: { kind: 'documentEnd' }, text: 'X' },
        { changeMode: 'direct' },
      );
    },
  },
  'create.sectionBreak': {
    throwCase: () => {
      const editor = makeSectionsEditor({ includeParagraphNodeType: false });
      return createSectionBreakAdapter(editor, { at: { kind: 'documentEnd' } }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeSectionsEditor({ throwOnInsert: true });
      return createSectionBreakAdapter(
        editor,
        { at: { kind: 'documentEnd' }, breakType: 'nextPage' },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeSectionsEditor();
      return createSectionBreakAdapter(
        editor,
        { at: { kind: 'documentEnd' }, breakType: 'nextPage' },
        { changeMode: 'direct' },
      );
    },
  },
  'sections.setBreakType': {
    throwCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetBreakTypeAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-missing' }, breakType: 'continuous' },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetBreakTypeAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-0' }, breakType: 'continuous' },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetBreakTypeAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-0' }, breakType: 'nextPage' },
        { changeMode: 'direct' },
      );
    },
  },
  'sections.setPageMargins': {
    throwCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetPageMarginsAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-missing' }, top: 1 },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetPageMarginsAdapter(
        editor,
        {
          target: { kind: 'section', sectionId: 'section-0' },
          top: 1,
          right: 1,
          bottom: 1,
          left: 1,
          gutter: 0,
        },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetPageMarginsAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-0' }, top: 1.25 },
        { changeMode: 'direct' },
      );
    },
  },
  'sections.setHeaderFooterMargins': {
    throwCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetHeaderFooterMarginsAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-missing' }, header: 0.5 },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetHeaderFooterMarginsAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-0' }, header: 0.5, footer: 0.5 },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetHeaderFooterMarginsAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-0' }, header: 0.75 },
        { changeMode: 'direct' },
      );
    },
  },
  'sections.setPageSetup': {
    throwCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetPageSetupAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-missing' }, orientation: 'portrait' },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetPageSetupAdapter(
        editor,
        {
          target: { kind: 'section', sectionId: 'section-0' },
          width: 8.5,
          height: 11,
          orientation: 'portrait',
          paperSize: '1',
        },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetPageSetupAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-0' }, orientation: 'landscape' },
        { changeMode: 'direct' },
      );
    },
  },
  'sections.setColumns': {
    throwCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetColumnsAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-missing' }, count: 1 },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetColumnsAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-0' }, count: 1, gap: 0.5, equalWidth: true },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetColumnsAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-0' }, count: 2 },
        { changeMode: 'direct' },
      );
    },
  },
  'sections.setLineNumbering': {
    throwCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetLineNumberingAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-missing' }, enabled: true },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetLineNumberingAdapter(
        editor,
        {
          target: { kind: 'section', sectionId: 'section-0' },
          enabled: true,
          countBy: 1,
          start: 1,
          distance: 0.5,
          restart: 'continuous',
        },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetLineNumberingAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-0' }, enabled: false },
        { changeMode: 'direct' },
      );
    },
  },
  'sections.setPageNumbering': {
    throwCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetPageNumberingAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-missing' }, start: 1 },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetPageNumberingAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-0' }, start: 1, format: 'decimal' },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetPageNumberingAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-0' }, start: 2 },
        { changeMode: 'direct' },
      );
    },
  },
  'sections.setTitlePage': {
    throwCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetTitlePageAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-missing' }, enabled: true },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetTitlePageAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-0' }, enabled: true },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetTitlePageAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-0' }, enabled: false },
        { changeMode: 'direct' },
      );
    },
  },
  'sections.setOddEvenHeadersFooters': {
    throwCase: () => {
      const editor = makeSectionsEditor({ includeConverter: false });
      return sectionsSetOddEvenHeadersFootersAdapter(editor, { enabled: true }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetOddEvenHeadersFootersAdapter(editor, { enabled: false }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetOddEvenHeadersFootersAdapter(editor, { enabled: true }, { changeMode: 'direct' });
    },
  },
  'sections.setVerticalAlign': {
    throwCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetVerticalAlignAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-missing' }, value: 'top' },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetVerticalAlignAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-0' }, value: 'top' },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetVerticalAlignAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-0' }, value: 'center' },
        { changeMode: 'direct' },
      );
    },
  },
  'sections.setSectionDirection': {
    throwCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetSectionDirectionAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-missing' }, direction: 'ltr' },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetSectionDirectionAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-0' }, direction: 'ltr' },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetSectionDirectionAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-0' }, direction: 'rtl' },
        { changeMode: 'direct' },
      );
    },
  },
  'sections.setHeaderFooterRef': {
    throwCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetHeaderFooterRefAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-missing' }, kind: 'header', variant: 'default', refId: 'x' },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetHeaderFooterRefAdapter(
        editor,
        {
          target: { kind: 'section', sectionId: 'section-0' },
          kind: 'header',
          variant: 'default',
          refId: 'rIdHeaderDefault',
        },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetHeaderFooterRefAdapter(
        editor,
        {
          target: { kind: 'section', sectionId: 'section-0' },
          kind: 'header',
          variant: 'default',
          refId: 'rIdHeaderAlt',
        },
        { changeMode: 'direct' },
      );
    },
  },
  'sections.clearHeaderFooterRef': {
    throwCase: () => {
      const editor = makeSectionsEditor();
      return sectionsClearHeaderFooterRefAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-missing' }, kind: 'header', variant: 'default' },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeSectionsEditor();
      return sectionsClearHeaderFooterRefAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-0' }, kind: 'header', variant: 'even' },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeSectionsEditor();
      return sectionsClearHeaderFooterRefAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-0' }, kind: 'header', variant: 'default' },
        { changeMode: 'direct' },
      );
    },
  },
  'sections.setLinkToPrevious': {
    throwCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetLinkToPreviousAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-missing' }, kind: 'header', variant: 'default', linked: true },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetLinkToPreviousAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-0' }, kind: 'header', variant: 'default', linked: true },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const bodyWithoutRefs = clone(BASE_SECTION_BODY_SECT_PR);
      const filteredBodyElements = ((bodyWithoutRefs.elements ?? []) as Array<{ name?: string }>).filter(
        (element) => element.name !== 'w:headerReference' && element.name !== 'w:footerReference',
      );
      bodyWithoutRefs.elements = filteredBodyElements as unknown as Record<string, unknown>[];

      const editor = makeSectionsEditor({
        paragraphSectPr: PREVIOUS_SECTION_SECT_PR,
        bodySectPr: bodyWithoutRefs,
      });
      return sectionsSetLinkToPreviousAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-1' }, kind: 'header', variant: 'default', linked: false },
        { changeMode: 'direct' },
      );
    },
  },
  'sections.setPageBorders': {
    throwCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetPageBordersAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-missing' }, borders: {} },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetPageBordersAdapter(
        editor,
        {
          target: { kind: 'section', sectionId: 'section-0' },
          borders: {
            display: 'allPages',
            offsetFrom: 'page',
            zOrder: 'front',
            top: { style: 'single', size: 8, space: 0, color: '000000' },
          },
        },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeSectionsEditor();
      return sectionsSetPageBordersAdapter(
        editor,
        {
          target: { kind: 'section', sectionId: 'section-0' },
          borders: {
            display: 'allPages',
            offsetFrom: 'page',
            zOrder: 'front',
            top: { style: 'double', size: 12, space: 0, color: '000000' },
          },
        },
        { changeMode: 'direct' },
      );
    },
  },
  'sections.clearPageBorders': {
    throwCase: () => {
      const editor = makeSectionsEditor();
      return sectionsClearPageBordersAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-missing' } },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const bodyWithoutBorders = clone(BASE_SECTION_BODY_SECT_PR);
      bodyWithoutBorders.elements = ((bodyWithoutBorders.elements ?? []) as Array<{ name?: string }>).filter(
        (element) => element.name !== 'w:pgBorders',
      ) as unknown as Record<string, unknown>[];
      const editor = makeSectionsEditor({ bodySectPr: bodyWithoutBorders });
      return sectionsClearPageBordersAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-0' } },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeSectionsEditor();
      return sectionsClearPageBordersAdapter(
        editor,
        { target: { kind: 'section', sectionId: 'section-0' } },
        { changeMode: 'direct' },
      );
    },
  },
  'lists.insert': {
    throwCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, numberingType: 'decimal' })]);
      return listsInsertWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'missing' }, position: 'after', text: 'X' },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, numberingType: 'decimal' })], {
        insertListItemAt: vi.fn(() => false),
      });
      return listsInsertWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, position: 'after', text: 'X' },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, numberingType: 'decimal' })]);
      return listsInsertWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, position: 'after', text: 'X' },
        { changeMode: 'direct' },
      );
    },
  },
  'lists.setType': {
    throwCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, numberingType: 'bullet' })]);
      return listsSetTypeWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, kind: 'ordered' },
        { changeMode: 'tracked' },
      );
    },
    failureCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, numberingType: 'bullet' })]);
      return listsSetTypeWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        kind: 'bullet',
      });
    },
    applyCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, numberingType: 'bullet' })]);
      return listsSetTypeWrapper(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        kind: 'ordered',
      });
    },
  },
  'lists.indent': {
    throwCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsIndentWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } },
        { changeMode: 'tracked' },
      );
    },
    failureCase: () => {
      const hasDefinitionSpy = vi.spyOn(ListHelpers, 'hasListDefinition').mockReturnValue(false);
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      const result = listsIndentWrapper(editor, { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } });
      hasDefinitionSpy.mockRestore();
      return result;
    },
    applyCase: () => {
      const hasDefinitionSpy = vi.spyOn(ListHelpers, 'hasListDefinition').mockReturnValue(true);
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      const result = listsIndentWrapper(editor, { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } });
      hasDefinitionSpy.mockRestore();
      return result;
    },
  },
  'lists.outdent': {
    throwCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 1, numberingType: 'decimal' })]);
      return listsOutdentWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } },
        { changeMode: 'tracked' },
      );
    },
    failureCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsOutdentWrapper(editor, { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } });
    },
    applyCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 1, numberingType: 'decimal' })]);
      return listsOutdentWrapper(editor, { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } });
    },
  },
  'lists.restart': {
    throwCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsRestartWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } },
        { changeMode: 'tracked' },
      );
    },
    failureCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsRestartWrapper(editor, { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } });
    },
    applyCase: () => {
      const editor = makeListEditor([
        makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal', markerText: '1.', path: [1] }),
        makeListParagraph({ id: 'li-2', numId: 1, ilvl: 0, numberingType: 'decimal', markerText: '2.', path: [2] }),
      ]);
      return listsRestartWrapper(editor, { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-2' } });
    },
  },
  'lists.exit': {
    throwCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsExitWrapper(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } },
        { changeMode: 'tracked' },
      );
    },
    failureCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })], {
        exitListItemAt: vi.fn(() => false),
      });
      return listsExitWrapper(editor, { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } });
    },
    applyCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsExitWrapper(editor, { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } });
    },
  },
  'comments.create': {
    throwCase: () => {
      const editor = makeCommentsEditor([], { addComment: undefined });
      return createCommentsWrapper(editor).add({
        target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 3 } },
        text: 'X',
      });
    },
    failureCase: () => {
      const editor = makeCommentsEditor();
      return createCommentsWrapper(editor).add({
        target: { kind: 'text', blockId: 'p1', range: { start: 1, end: 1 } },
        text: 'X',
      });
    },
    applyCase: () => {
      const editor = makeCommentsEditor();
      return createCommentsWrapper(editor).add({
        target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 3 } },
        text: 'X',
      });
    },
  },
  'comments.patch': {
    throwCase: () => {
      const editor = makeCommentsEditor();
      return createCommentsWrapper(editor).edit({ commentId: 'missing', text: 'X' });
    },
    failureCase: () => {
      const editor = makeCommentsEditor([makeCommentRecord('c1', { commentText: 'Same' })]);
      return createCommentsWrapper(editor).edit({ commentId: 'c1', text: 'Same' });
    },
    applyCase: () => {
      const editor = makeCommentsEditor([makeCommentRecord('c1', { commentText: 'Old' })]);
      return createCommentsWrapper(editor).edit({ commentId: 'c1', text: 'New' });
    },
  },
  'comments.delete': {
    throwCase: () => {
      const editor = makeCommentsEditor();
      return createCommentsWrapper(editor).remove({ commentId: 'missing' });
    },
    failureCase: () => {
      mockedDeps.resolveCommentAnchorsById.mockImplementation((_editor, id) =>
        id === 'c1'
          ? [
              {
                commentId: 'c1',
                status: 'open',
                target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 1 } },
                pos: 1,
                end: 2,
                attrs: {},
              },
            ]
          : [],
      );
      const editor = makeCommentsEditor([], { removeComment: vi.fn(() => false) });
      return createCommentsWrapper(editor).remove({ commentId: 'c1' });
    },
    applyCase: () => {
      const editor = makeCommentsEditor([makeCommentRecord('c1')], { removeComment: vi.fn(() => true) });
      return createCommentsWrapper(editor).remove({ commentId: 'c1' });
    },
  },
  'trackChanges.decide': {
    throwCase: () => {
      setTrackChanges([]);
      const { editor } = makeTextEditor();
      return trackChangesAcceptWrapper(editor, { id: 'missing' });
    },
    failureCase: () => {
      setTrackChanges([makeTrackedChange('tc-1')]);
      const { editor } = makeTextEditor('Hello', { commands: { acceptTrackedChangeById: vi.fn(() => false) } });
      return trackChangesAcceptWrapper(editor, { id: requireCanonicalTrackChangeId(editor, 'tc-1') });
    },
    applyCase: () => {
      setTrackChanges([makeTrackedChange('tc-1')]);
      const { editor } = makeTextEditor('Hello', { commands: { acceptTrackedChangeById: vi.fn(() => true) } });
      return trackChangesAcceptWrapper(editor, { id: requireCanonicalTrackChangeId(editor, 'tc-1') });
    },
  },
  // -------------------------------------------------------------------------
  // Table operations — create.table
  // -------------------------------------------------------------------------
  'create.table': {
    throwCase: () => {
      const { editor } = makeTextEditor('Hello', { commands: { insertTableAt: undefined } });
      return createTableWrapper(editor, { rows: 2, columns: 2 }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const { editor } = makeTextEditor('Hello', { commands: { insertTableAt: vi.fn(() => false) } });
      return createTableWrapper(editor, { rows: 2, columns: 2 }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const { editor } = makeTextEditor('Hello', { commands: { insertTableAt: vi.fn(() => true) } });
      return createTableWrapper(editor, { rows: 2, columns: 2 }, { changeMode: 'direct' });
    },
  },

  // -------------------------------------------------------------------------
  // Table operations — lifecycle
  // -------------------------------------------------------------------------
  'tables.delete': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesDeleteWrapper(editor, { nodeId: 'missing' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesDeleteWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesDeleteWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct' });
    },
  },
  'tables.clearContents': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesClearContentsWrapper(editor, { nodeId: 'missing' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesClearContentsWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesClearContentsWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct' });
    },
  },
  'tables.move': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesMoveWrapper(
        editor,
        { nodeId: 'missing', destination: { kind: 'documentEnd' } },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesMoveWrapper(
        editor,
        { nodeId: 'table-1', destination: { kind: 'documentEnd' } },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesMoveWrapper(
        editor,
        { nodeId: 'table-1', destination: { kind: 'documentEnd' } },
        { changeMode: 'direct' },
      );
    },
  },
  'tables.setLayout': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesSetLayoutWrapper(editor, { nodeId: 'missing', alignment: 'center' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesSetLayoutWrapper(editor, { nodeId: 'table-1', alignment: 'center' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesSetLayoutWrapper(editor, { nodeId: 'table-1', alignment: 'center' }, { changeMode: 'direct' });
    },
  },
  'tables.setAltText': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesSetAltTextWrapper(editor, { nodeId: 'missing', title: 'T' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesSetAltTextWrapper(editor, { nodeId: 'table-1', title: 'T' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesSetAltTextWrapper(editor, { nodeId: 'table-1', title: 'T' }, { changeMode: 'direct' });
    },
  },

  // -------------------------------------------------------------------------
  // Table operations — row structure
  // -------------------------------------------------------------------------
  'tables.insertRow': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesInsertRowWrapper(editor, { tableNodeId: 'missing', rowIndex: 0, position: 'below' } as any, {
        changeMode: 'direct',
      });
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesInsertRowWrapper(editor, { tableNodeId: 'table-1', rowIndex: 0, position: 'below' } as any, {
        changeMode: 'direct',
      });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesInsertRowWrapper(editor, { tableNodeId: 'table-1', rowIndex: 0, position: 'below' } as any, {
        changeMode: 'direct',
      });
    },
  },
  'tables.deleteRow': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesDeleteRowWrapper(editor, { tableNodeId: 'missing', rowIndex: 0 } as any, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesDeleteRowWrapper(editor, { tableNodeId: 'table-1', rowIndex: 0 } as any, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesDeleteRowWrapper(editor, { tableNodeId: 'table-1', rowIndex: 0 } as any, { changeMode: 'direct' });
    },
  },
  'tables.setRowHeight': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesSetRowHeightWrapper(
        editor,
        { tableNodeId: 'missing', rowIndex: 0, heightPt: 20, rule: 'atLeast' } as any,
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesSetRowHeightWrapper(
        editor,
        { tableNodeId: 'table-1', rowIndex: 0, heightPt: 20, rule: 'atLeast' } as any,
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesSetRowHeightWrapper(
        editor,
        { tableNodeId: 'table-1', rowIndex: 0, heightPt: 20, rule: 'atLeast' } as any,
        { changeMode: 'direct' },
      );
    },
  },
  'tables.distributeRows': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesDistributeRowsWrapper(editor, { nodeId: 'missing' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      // distributeRows early-returns success when no rows have explicit heights.
      // Provide rows with heights so the adapter reaches dispatch (which throws).
      const editor = makeTableEditor({}, { throwOnDispatch: true, rowHeight: 20 });
      return tablesDistributeRowsWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesDistributeRowsWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct' });
    },
  },
  'tables.setRowOptions': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesSetRowOptionsWrapper(
        editor,
        { tableNodeId: 'missing', rowIndex: 0, allowBreakAcrossPages: true } as any,
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesSetRowOptionsWrapper(
        editor,
        { tableNodeId: 'table-1', rowIndex: 0, allowBreakAcrossPages: true } as any,
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesSetRowOptionsWrapper(
        editor,
        { tableNodeId: 'table-1', rowIndex: 0, allowBreakAcrossPages: true } as any,
        { changeMode: 'direct' },
      );
    },
  },

  // -------------------------------------------------------------------------
  // Table operations — column structure
  // -------------------------------------------------------------------------
  'tables.insertColumn': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesInsertColumnWrapper(
        editor,
        { tableNodeId: 'missing', columnIndex: 0, position: 'right' },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesInsertColumnWrapper(
        editor,
        { tableNodeId: 'table-1', columnIndex: 0, position: 'right' },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesInsertColumnWrapper(
        editor,
        { tableNodeId: 'table-1', columnIndex: 0, position: 'right' },
        { changeMode: 'direct' },
      );
    },
  },
  'tables.deleteColumn': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesDeleteColumnWrapper(editor, { tableNodeId: 'missing', columnIndex: 0 }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesDeleteColumnWrapper(editor, { tableNodeId: 'table-1', columnIndex: 0 }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesDeleteColumnWrapper(editor, { tableNodeId: 'table-1', columnIndex: 0 }, { changeMode: 'direct' });
    },
  },
  'tables.setColumnWidth': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesSetColumnWidthWrapper(
        editor,
        { tableNodeId: 'missing', columnIndex: 0, widthPt: 100 },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesSetColumnWidthWrapper(
        editor,
        { tableNodeId: 'table-1', columnIndex: 0, widthPt: 100 },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesSetColumnWidthWrapper(
        editor,
        { tableNodeId: 'table-1', columnIndex: 0, widthPt: 100 },
        { changeMode: 'direct' },
      );
    },
  },
  'tables.distributeColumns': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesDistributeColumnsWrapper(editor, { nodeId: 'missing' } as any, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesDistributeColumnsWrapper(editor, { nodeId: 'table-1' } as any, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesDistributeColumnsWrapper(editor, { nodeId: 'table-1' } as any, { changeMode: 'direct' });
    },
  },
  'tables.insertCell': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesInsertCellWrapper(editor, { nodeId: 'missing', mode: 'shiftRight' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesInsertCellWrapper(editor, { nodeId: 'cell-1', mode: 'shiftRight' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesInsertCellWrapper(editor, { nodeId: 'cell-1', mode: 'shiftRight' }, { changeMode: 'direct' });
    },
  },
  'tables.deleteCell': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesDeleteCellWrapper(editor, { nodeId: 'missing', mode: 'shiftLeft' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesDeleteCellWrapper(editor, { nodeId: 'cell-1', mode: 'shiftLeft' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesDeleteCellWrapper(editor, { nodeId: 'cell-1', mode: 'shiftLeft' }, { changeMode: 'direct' });
    },
  },
  'tables.mergeCells': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesMergeCellsWrapper(
        editor,
        { tableNodeId: 'missing', start: { rowIndex: 0, columnIndex: 0 }, end: { rowIndex: 1, columnIndex: 1 } },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesMergeCellsWrapper(
        editor,
        { tableNodeId: 'table-1', start: { rowIndex: 0, columnIndex: 0 }, end: { rowIndex: 1, columnIndex: 1 } },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesMergeCellsWrapper(
        editor,
        { tableNodeId: 'table-1', start: { rowIndex: 0, columnIndex: 0 }, end: { rowIndex: 1, columnIndex: 1 } },
        { changeMode: 'direct' },
      );
    },
  },
  'tables.unmergeCells': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesUnmergeCellsWrapper(editor, { nodeId: 'missing' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      // Cell must have colspan > 1 to bypass the idempotent-success early return.
      const editor = makeTableEditor({}, { throwOnDispatch: true, cellColspan: 2 });
      return tablesUnmergeCellsWrapper(editor, { nodeId: 'cell-1' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesUnmergeCellsWrapper(editor, { nodeId: 'cell-1' }, { changeMode: 'direct' });
    },
  },
  'tables.splitCell': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesSplitCellWrapper(editor, { nodeId: 'missing', rows: 2, columns: 2 }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesSplitCellWrapper(editor, { nodeId: 'cell-1', rows: 2, columns: 2 }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesSplitCellWrapper(editor, { nodeId: 'cell-1', rows: 2, columns: 2 }, { changeMode: 'direct' });
    },
  },
  'tables.setCellProperties': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesSetCellPropertiesWrapper(
        editor,
        { nodeId: 'missing', verticalAlign: 'center' },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesSetCellPropertiesWrapper(
        editor,
        { nodeId: 'cell-1', verticalAlign: 'center' },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesSetCellPropertiesWrapper(
        editor,
        { nodeId: 'cell-1', verticalAlign: 'center' },
        { changeMode: 'direct' },
      );
    },
  },
  'tables.convertFromText': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesConvertFromTextWrapper(editor, { nodeId: 'missing' } as any, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesConvertFromTextWrapper(editor, { nodeId: 'p1' } as any, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesConvertFromTextWrapper(editor, { nodeId: 'p1' } as any, { changeMode: 'direct' });
    },
  },
  'tables.split': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesSplitWrapper(editor, { nodeId: 'missing', atRowIndex: 1 }, { changeMode: 'direct' });
    },
    failureCase: () => {
      // atRowIndex: 0 is invalid (must be >= 1).
      const editor = makeTableEditor();
      return tablesSplitWrapper(editor, { nodeId: 'table-1', atRowIndex: 0 }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesSplitWrapper(editor, { nodeId: 'table-1', atRowIndex: 1 }, { changeMode: 'direct' });
    },
  },
  'tables.convertToText': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesConvertToTextWrapper(editor, { nodeId: 'missing' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesConvertToTextWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesConvertToTextWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct' });
    },
  },
  'tables.sort': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesSortWrapper(
        editor,
        { nodeId: 'missing', keys: [{ columnIndex: 0, direction: 'ascending', type: 'text' }] },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      // Out-of-bounds column index → INVALID_TARGET failure.
      const editor = makeTableEditor();
      return tablesSortWrapper(
        editor,
        { nodeId: 'table-1', keys: [{ columnIndex: 99, direction: 'ascending', type: 'text' }] },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesSortWrapper(
        editor,
        { nodeId: 'table-1', keys: [{ columnIndex: 0, direction: 'ascending', type: 'text' }] },
        { changeMode: 'direct' },
      );
    },
  },
  // --- Batch 6: Style operations ---
  'tables.setStyle': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesSetStyleWrapper(editor, { nodeId: 'missing', styleId: 'TableGrid' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesSetStyleWrapper(editor, { nodeId: 'table-1', styleId: 'TableGrid' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesSetStyleWrapper(editor, { nodeId: 'table-1', styleId: 'TableGrid' }, { changeMode: 'direct' });
    },
  },
  'tables.clearStyle': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesClearStyleWrapper(editor, { nodeId: 'missing' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesClearStyleWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesClearStyleWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct' });
    },
  },
  'tables.setStyleOption': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesSetStyleOptionWrapper(
        editor,
        { nodeId: 'missing', flag: 'headerRow', enabled: true },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesSetStyleOptionWrapper(
        editor,
        { nodeId: 'table-1', flag: 'headerRow', enabled: true },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesSetStyleOptionWrapper(
        editor,
        { nodeId: 'table-1', flag: 'headerRow', enabled: true },
        { changeMode: 'direct' },
      );
    },
  },
  // --- Batch 7: Border + shading operations ---
  'tables.setBorder': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesSetBorderWrapper(
        editor,
        { nodeId: 'missing', edge: 'top', lineStyle: 'single', lineWeightPt: 0.5, color: '000000' },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesSetBorderWrapper(
        editor,
        { nodeId: 'table-1', edge: 'top', lineStyle: 'single', lineWeightPt: 0.5, color: '000000' },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesSetBorderWrapper(
        editor,
        { nodeId: 'table-1', edge: 'top', lineStyle: 'single', lineWeightPt: 0.5, color: '000000' },
        { changeMode: 'direct' },
      );
    },
  },
  'tables.clearBorder': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesClearBorderWrapper(editor, { nodeId: 'missing', edge: 'top' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesClearBorderWrapper(editor, { nodeId: 'table-1', edge: 'top' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesClearBorderWrapper(editor, { nodeId: 'table-1', edge: 'top' }, { changeMode: 'direct' });
    },
  },
  'tables.applyBorderPreset': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesApplyBorderPresetWrapper(editor, { nodeId: 'missing', preset: 'box' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesApplyBorderPresetWrapper(editor, { nodeId: 'table-1', preset: 'box' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesApplyBorderPresetWrapper(editor, { nodeId: 'table-1', preset: 'box' }, { changeMode: 'direct' });
    },
  },
  'tables.setShading': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesSetShadingWrapper(editor, { nodeId: 'missing', color: 'FF0000' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesSetShadingWrapper(editor, { nodeId: 'table-1', color: 'FF0000' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesSetShadingWrapper(editor, { nodeId: 'table-1', color: 'FF0000' }, { changeMode: 'direct' });
    },
  },
  'tables.clearShading': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesClearShadingWrapper(editor, { nodeId: 'missing' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesClearShadingWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesClearShadingWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct' });
    },
  },
  // --- Batch 8: Padding + spacing operations ---
  'tables.setTablePadding': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesSetTablePaddingWrapper(
        editor,
        { nodeId: 'missing', topPt: 5, rightPt: 5, bottomPt: 5, leftPt: 5 },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesSetTablePaddingWrapper(
        editor,
        { nodeId: 'table-1', topPt: 5, rightPt: 5, bottomPt: 5, leftPt: 5 },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesSetTablePaddingWrapper(
        editor,
        { nodeId: 'table-1', topPt: 5, rightPt: 5, bottomPt: 5, leftPt: 5 },
        { changeMode: 'direct' },
      );
    },
  },
  'tables.setCellPadding': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesSetCellPaddingWrapper(
        editor,
        { nodeId: 'missing', topPt: 5, rightPt: 5, bottomPt: 5, leftPt: 5 } as any,
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesSetCellPaddingWrapper(
        editor,
        { nodeId: 'cell-1', topPt: 5, rightPt: 5, bottomPt: 5, leftPt: 5 } as any,
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesSetCellPaddingWrapper(
        editor,
        { nodeId: 'cell-1', topPt: 5, rightPt: 5, bottomPt: 5, leftPt: 5 } as any,
        { changeMode: 'direct' },
      );
    },
  },
  'tables.setCellSpacing': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesSetCellSpacingWrapper(editor, { nodeId: 'missing', spacingPt: 2 }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesSetCellSpacingWrapper(editor, { nodeId: 'table-1', spacingPt: 2 }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesSetCellSpacingWrapper(editor, { nodeId: 'table-1', spacingPt: 2 }, { changeMode: 'direct' });
    },
  },
  'tables.clearCellSpacing': {
    throwCase: () => {
      const editor = makeTableEditor();
      return tablesClearCellSpacingWrapper(editor, { nodeId: 'missing' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const editor = makeTableEditor({}, { throwOnDispatch: true });
      return tablesClearCellSpacingWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const editor = makeTableEditor();
      return tablesClearCellSpacingWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct' });
    },
  },
  'styles.apply': {
    throwCase: () => {
      const editor = makeStylesEditor({ hasConverter: false });
      return stylesApplyAdapter(
        editor,
        { target: { scope: 'docDefaults', channel: 'run' }, patch: { bold: true } },
        { dryRun: false, expectedRevision: undefined },
      );
    },
    applyCase: () => {
      const editor = makeStylesEditor();
      return stylesApplyAdapter(
        editor,
        { target: { scope: 'docDefaults', channel: 'run' }, patch: { bold: true } },
        { dryRun: false, expectedRevision: undefined },
      );
    },
  },
};

const dryRunVectors: Partial<Record<OperationId, () => unknown>> = {
  'blocks.delete': () => {
    const deleteBlockNodeById = vi.fn(() => true);
    const editor = makeBlockDeleteEditor({ deleteBlockNodeById });
    const result = blocksDeleteWrapper(
      editor,
      { target: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' } },
      { changeMode: 'direct', dryRun: true },
    );
    expect(deleteBlockNodeById).not.toHaveBeenCalled();
    return result;
  },
  insert: () => {
    const { editor, dispatch, tr } = makeTextEditor();
    const result = writeAdapter(
      editor,
      { kind: 'insert', target: { kind: 'text', blockId: 'p1', range: { start: 1, end: 1 } }, text: 'X' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    expect(tr.insertText).not.toHaveBeenCalled();
    return result;
  },
  replace: () => {
    const { editor, dispatch, tr } = makeTextEditor();
    const result = writeAdapter(
      editor,
      { kind: 'replace', target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } }, text: 'World' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    expect(tr.insertText).not.toHaveBeenCalled();
    return result;
  },
  delete: () => {
    const { editor, dispatch, tr } = makeTextEditor();
    const result = writeAdapter(
      editor,
      { kind: 'delete', target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 2 } } },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    expect(tr.delete).not.toHaveBeenCalled();
    return result;
  },
  'format.apply': () => {
    const { editor, dispatch, tr } = makeTextEditor();
    const result = styleApplyWrapper(
      editor,
      { target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } }, inline: { bold: 'on' } },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    expect(tr.addMark).not.toHaveBeenCalled();
    return result;
  },
  'format.fontSize': () => {
    const { editor, dispatch } = makeTextEditor();
    const result = formatFontSizeWrapper(
      editor,
      { target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } }, value: '14pt' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'format.fontFamily': () => {
    const { editor, dispatch } = makeTextEditor();
    const result = formatFontFamilyWrapper(
      editor,
      { target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } }, value: 'Arial' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'format.color': () => {
    const { editor, dispatch } = makeTextEditor();
    const result = formatColorWrapper(
      editor,
      { target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } }, value: '#ff0000' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'format.align': () => {
    const { editor, dispatch } = makeTextEditor();
    const result = formatAlignWrapper(
      editor,
      { target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } }, alignment: 'center' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'create.paragraph': () => {
    const insertParagraphAt = vi.fn(() => true);
    const { editor } = makeTextEditor('Hello', { commands: { insertParagraphAt } });
    const result = createParagraphWrapper(
      editor,
      { at: { kind: 'documentEnd' }, text: 'Dry run paragraph' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(insertParagraphAt).not.toHaveBeenCalled();
    return result;
  },
  'create.heading': () => {
    const insertHeadingAt = vi.fn(() => true);
    const { editor } = makeTextEditor('Hello', { commands: { insertHeadingAt } });
    const result = createHeadingWrapper(
      editor,
      { level: 1, at: { kind: 'documentEnd' }, text: 'Dry run heading' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(insertHeadingAt).not.toHaveBeenCalled();
    return result;
  },
  'create.sectionBreak': () => {
    const editor = makeSectionsEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = createSectionBreakAdapter(
      editor,
      { at: { kind: 'documentEnd' }, breakType: 'nextPage' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'sections.setBreakType': () => {
    const editor = makeSectionsEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = sectionsSetBreakTypeAdapter(
      editor,
      { target: { kind: 'section', sectionId: 'section-0' }, breakType: 'nextPage' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'sections.setPageMargins': () => {
    const editor = makeSectionsEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = sectionsSetPageMarginsAdapter(
      editor,
      { target: { kind: 'section', sectionId: 'section-0' }, top: 1.25 },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'sections.setHeaderFooterMargins': () => {
    const editor = makeSectionsEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = sectionsSetHeaderFooterMarginsAdapter(
      editor,
      { target: { kind: 'section', sectionId: 'section-0' }, header: 0.75 },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'sections.setPageSetup': () => {
    const editor = makeSectionsEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = sectionsSetPageSetupAdapter(
      editor,
      { target: { kind: 'section', sectionId: 'section-0' }, orientation: 'landscape' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'sections.setColumns': () => {
    const editor = makeSectionsEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = sectionsSetColumnsAdapter(
      editor,
      { target: { kind: 'section', sectionId: 'section-0' }, count: 2 },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'sections.setLineNumbering': () => {
    const editor = makeSectionsEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = sectionsSetLineNumberingAdapter(
      editor,
      { target: { kind: 'section', sectionId: 'section-0' }, enabled: false },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'sections.setPageNumbering': () => {
    const editor = makeSectionsEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = sectionsSetPageNumberingAdapter(
      editor,
      { target: { kind: 'section', sectionId: 'section-0' }, start: 2 },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'sections.setTitlePage': () => {
    const editor = makeSectionsEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = sectionsSetTitlePageAdapter(
      editor,
      { target: { kind: 'section', sectionId: 'section-0' }, enabled: false },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'sections.setOddEvenHeadersFooters': () => {
    const editor = makeSectionsEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = sectionsSetOddEvenHeadersFootersAdapter(
      editor,
      { enabled: true },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'sections.setVerticalAlign': () => {
    const editor = makeSectionsEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = sectionsSetVerticalAlignAdapter(
      editor,
      { target: { kind: 'section', sectionId: 'section-0' }, value: 'center' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'sections.setSectionDirection': () => {
    const editor = makeSectionsEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = sectionsSetSectionDirectionAdapter(
      editor,
      { target: { kind: 'section', sectionId: 'section-0' }, direction: 'rtl' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'sections.setHeaderFooterRef': () => {
    const editor = makeSectionsEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = sectionsSetHeaderFooterRefAdapter(
      editor,
      {
        target: { kind: 'section', sectionId: 'section-0' },
        kind: 'header',
        variant: 'default',
        refId: 'rIdHeaderAlt',
      },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'sections.clearHeaderFooterRef': () => {
    const editor = makeSectionsEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = sectionsClearHeaderFooterRefAdapter(
      editor,
      { target: { kind: 'section', sectionId: 'section-0' }, kind: 'header', variant: 'default' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'sections.setLinkToPrevious': () => {
    const bodyWithoutRefs = clone(BASE_SECTION_BODY_SECT_PR);
    bodyWithoutRefs.elements = ((bodyWithoutRefs.elements ?? []) as Array<{ name?: string }>).filter(
      (element) => element.name !== 'w:headerReference' && element.name !== 'w:footerReference',
    ) as unknown as Record<string, unknown>[];
    const editor = makeSectionsEditor({
      paragraphSectPr: PREVIOUS_SECTION_SECT_PR,
      bodySectPr: bodyWithoutRefs,
    });
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = sectionsSetLinkToPreviousAdapter(
      editor,
      { target: { kind: 'section', sectionId: 'section-1' }, kind: 'header', variant: 'default', linked: false },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'sections.setPageBorders': () => {
    const editor = makeSectionsEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = sectionsSetPageBordersAdapter(
      editor,
      {
        target: { kind: 'section', sectionId: 'section-0' },
        borders: {
          display: 'allPages',
          offsetFrom: 'page',
          zOrder: 'front',
          top: { style: 'double', size: 12, space: 0, color: '000000' },
        },
      },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'sections.clearPageBorders': () => {
    const editor = makeSectionsEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = sectionsClearPageBordersAdapter(
      editor,
      { target: { kind: 'section', sectionId: 'section-0' } },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'lists.insert': () => {
    const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, numberingType: 'decimal' })]);
    const insertListItemAt = editor.commands!.insertListItemAt as ReturnType<typeof vi.fn>;
    const result = listsInsertWrapper(
      editor,
      { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, position: 'after', text: 'X' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(insertListItemAt).not.toHaveBeenCalled();
    return result;
  },
  'lists.setType': () => {
    const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, numberingType: 'bullet' })]);
    const setListTypeAt = editor.commands!.setListTypeAt as ReturnType<typeof vi.fn>;
    const result = listsSetTypeWrapper(
      editor,
      { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, kind: 'ordered' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(setListTypeAt).not.toHaveBeenCalled();
    return result;
  },
  'lists.indent': () => {
    const hasDefinitionSpy = vi.spyOn(ListHelpers, 'hasListDefinition').mockReturnValue(true);
    const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
    const increaseListIndent = editor.commands!.increaseListIndent as ReturnType<typeof vi.fn>;
    const result = listsIndentWrapper(
      editor,
      { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } },
      { changeMode: 'direct', dryRun: true },
    );
    expect(increaseListIndent).not.toHaveBeenCalled();
    hasDefinitionSpy.mockRestore();
    return result;
  },
  'lists.outdent': () => {
    const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 1, numberingType: 'decimal' })]);
    const decreaseListIndent = editor.commands!.decreaseListIndent as ReturnType<typeof vi.fn>;
    const result = listsOutdentWrapper(
      editor,
      { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } },
      { changeMode: 'direct', dryRun: true },
    );
    expect(decreaseListIndent).not.toHaveBeenCalled();
    return result;
  },
  'lists.restart': () => {
    const editor = makeListEditor([
      makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal', markerText: '1.', path: [1] }),
      makeListParagraph({ id: 'li-2', numId: 1, ilvl: 0, numberingType: 'decimal', markerText: '2.', path: [2] }),
    ]);
    const restartNumbering = editor.commands!.restartNumbering as ReturnType<typeof vi.fn>;
    const result = listsRestartWrapper(
      editor,
      { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-2' } },
      { changeMode: 'direct', dryRun: true },
    );
    expect(restartNumbering).not.toHaveBeenCalled();
    return result;
  },
  'lists.exit': () => {
    const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
    const exitListItemAt = editor.commands!.exitListItemAt as ReturnType<typeof vi.fn>;
    const result = listsExitWrapper(
      editor,
      { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } },
      { changeMode: 'direct', dryRun: true },
    );
    expect(exitListItemAt).not.toHaveBeenCalled();
    return result;
  },
  'styles.apply': () => {
    const editor = makeStylesEditor();
    const result = stylesApplyAdapter(
      editor,
      { target: { scope: 'docDefaults', channel: 'run' }, patch: { bold: true } },
      { dryRun: true, expectedRevision: undefined },
    );
    // dryRun should not mark the document as modified
    expect((editor as unknown as { converter: { documentModified: boolean } }).converter.documentModified).toBe(false);
    return result;
  },

  // -------------------------------------------------------------------------
  // Table operations — dryRun vectors
  // -------------------------------------------------------------------------
  'create.table': () => {
    const insertTableAt = vi.fn(() => true);
    const { editor } = makeTextEditor('Hello', {
      commands: { insertTableAt },
      can: vi.fn(() => ({ insertTableAt: vi.fn(() => true) })),
    } as any);
    const result = createTableWrapper(editor, { rows: 2, columns: 2 }, { changeMode: 'direct', dryRun: true });
    expect(insertTableAt).not.toHaveBeenCalled();
    return result;
  },
  'tables.delete': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = tablesDeleteWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct', dryRun: true });
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.clearContents': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = tablesClearContentsWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct', dryRun: true });
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.move': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = tablesMoveWrapper(
      editor,
      { nodeId: 'table-1', destination: { kind: 'documentEnd' } },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.setLayout': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = tablesSetLayoutWrapper(
      editor,
      { nodeId: 'table-1', alignment: 'center' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.setAltText': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = tablesSetAltTextWrapper(
      editor,
      { nodeId: 'table-1', title: 'T' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.insertRow': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = tablesInsertRowWrapper(editor, { tableNodeId: 'table-1', rowIndex: 0, position: 'below' } as any, {
      changeMode: 'direct',
      dryRun: true,
    });
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.deleteRow': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = tablesDeleteRowWrapper(editor, { tableNodeId: 'table-1', rowIndex: 0 } as any, {
      changeMode: 'direct',
      dryRun: true,
    });
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.setRowHeight': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = tablesSetRowHeightWrapper(
      editor,
      { tableNodeId: 'table-1', rowIndex: 0, heightPt: 20, rule: 'atLeast' } as any,
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.distributeRows': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = tablesDistributeRowsWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct', dryRun: true });
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.setRowOptions': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = tablesSetRowOptionsWrapper(
      editor,
      { tableNodeId: 'table-1', rowIndex: 0, allowBreakAcrossPages: true } as any,
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.insertColumn': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = tablesInsertColumnWrapper(
      editor,
      { tableNodeId: 'table-1', columnIndex: 0, position: 'right' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.deleteColumn': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = tablesDeleteColumnWrapper(
      editor,
      { tableNodeId: 'table-1', columnIndex: 0 },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.setColumnWidth': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = tablesSetColumnWidthWrapper(
      editor,
      { tableNodeId: 'table-1', columnIndex: 0, widthPt: 100 },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.distributeColumns': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = tablesDistributeColumnsWrapper(editor, { nodeId: 'table-1' } as any, {
      changeMode: 'direct',
      dryRun: true,
    });
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.insertCell': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = tablesInsertCellWrapper(
      editor,
      { nodeId: 'cell-1', mode: 'shiftRight' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.deleteCell': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = tablesDeleteCellWrapper(
      editor,
      { nodeId: 'cell-1', mode: 'shiftLeft' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.mergeCells': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = tablesMergeCellsWrapper(
      editor,
      { tableNodeId: 'table-1', start: { rowIndex: 0, columnIndex: 0 }, end: { rowIndex: 1, columnIndex: 1 } },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.unmergeCells': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = tablesUnmergeCellsWrapper(editor, { nodeId: 'cell-1' }, { changeMode: 'direct', dryRun: true });
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.splitCell': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = tablesSplitCellWrapper(
      editor,
      { nodeId: 'cell-1', rows: 2, columns: 2 },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.setCellProperties': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = tablesSetCellPropertiesWrapper(
      editor,
      { nodeId: 'cell-1', verticalAlign: 'center' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.convertFromText': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = tablesConvertFromTextWrapper(editor, { nodeId: 'p1' } as any, {
      changeMode: 'direct',
      dryRun: true,
    });
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.split': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = tablesSplitWrapper(
      editor,
      { nodeId: 'table-1', atRowIndex: 1 },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.convertToText': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = tablesConvertToTextWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct', dryRun: true });
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.sort': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = tablesSortWrapper(
      editor,
      { nodeId: 'table-1', keys: [{ columnIndex: 0, direction: 'ascending', type: 'text' }] },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  // --- Batch 6: Style operations ---
  'tables.setStyle': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = tablesSetStyleWrapper(
      editor,
      { nodeId: 'table-1', styleId: 'TableGrid' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.clearStyle': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = tablesClearStyleWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct', dryRun: true });
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.setStyleOption': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = tablesSetStyleOptionWrapper(
      editor,
      { nodeId: 'table-1', flag: 'headerRow', enabled: true },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  // --- Batch 7: Border + shading operations ---
  'tables.setBorder': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = tablesSetBorderWrapper(
      editor,
      { nodeId: 'table-1', edge: 'top', lineStyle: 'single', lineWeightPt: 0.5, color: '000000' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.clearBorder': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = tablesClearBorderWrapper(
      editor,
      { nodeId: 'table-1', edge: 'top' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.applyBorderPreset': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = tablesApplyBorderPresetWrapper(
      editor,
      { nodeId: 'table-1', preset: 'box' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.setShading': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = tablesSetShadingWrapper(
      editor,
      { nodeId: 'table-1', color: 'FF0000' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.clearShading': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = tablesClearShadingWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct', dryRun: true });
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  // --- Batch 8: Padding + spacing operations ---
  'tables.setTablePadding': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = tablesSetTablePaddingWrapper(
      editor,
      { nodeId: 'table-1', topPt: 5, rightPt: 5, bottomPt: 5, leftPt: 5 },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.setCellPadding': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = tablesSetCellPaddingWrapper(
      editor,
      { nodeId: 'cell-1', topPt: 5, rightPt: 5, bottomPt: 5, leftPt: 5 } as any,
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.setCellSpacing': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = tablesSetCellSpacingWrapper(
      editor,
      { nodeId: 'table-1', spacingPt: 2 },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
  'tables.clearCellSpacing': () => {
    const editor = makeTableEditor();
    const dispatch = (editor as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    const result = tablesClearCellSpacingWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct', dryRun: true });
    expect(dispatch).not.toHaveBeenCalled();
    return result;
  },
};

beforeEach(() => {
  registerBuiltInExecutors();
  vi.restoreAllMocks();
  mockedDeps.resolveCommentAnchorsById.mockReset();
  mockedDeps.resolveCommentAnchorsById.mockImplementation(() => []);
  mockedDeps.listCommentAnchors.mockReset();
  mockedDeps.listCommentAnchors.mockImplementation(() => []);
  mockedDeps.getTrackChanges.mockReset();
  mockedDeps.getTrackChanges.mockImplementation(() => []);
});

describe('document-api adapter conformance', () => {
  it('has schema coverage for every operation and mutation policy metadata', () => {
    for (const operationId of OPERATION_IDS) {
      const schema = INTERNAL_SCHEMAS.operations[operationId];
      expect(schema).toBeDefined();
      expect(schema.input).toBeDefined();
      expect(schema.output).toBeDefined();

      if (!COMMAND_CATALOG[operationId].mutates) continue;
      expect(COMMAND_CATALOG[operationId].throws.postApplyForbidden).toBe(true);
      expect(schema.success).toBeDefined();
      // Plan-engine meta-ops (mutations.apply) return PlanReceipt (always success) or throw — no failure schema.
      if (!PLAN_ENGINE_META_OPS.has(operationId)) {
        expect(schema.failure).toBeDefined();
      }
    }
  });

  it('covers every implemented mutating operation with throw/failure/apply vectors', () => {
    const vectorKeys = Object.keys(mutationVectors).sort();
    const expectedKeys = [...MUTATING_OPERATION_IDS]
      .filter((id) => !STUB_TABLE_OPS.has(id) && !PLAN_ENGINE_META_OPS.has(id))
      .sort();
    expect(vectorKeys).toEqual(expectedKeys);

    for (const operationId of expectedKeys) {
      const vector = mutationVectors[operationId];
      expect(typeof vector?.throwCase, `${operationId} is missing throwCase`).toBe('function');
      expect(typeof vector?.applyCase, `${operationId} is missing applyCase`).toBe('function');
      if (HAS_STRUCTURED_FAILURE_RESULT(operationId)) {
        expect(typeof vector?.failureCase, `${operationId} is missing failureCase`).toBe('function');
      }
    }
  });

  it('verifies stub table operations throw CAPABILITY_UNAVAILABLE', () => {
    const stubAdapters: Record<string, (editor: Editor, input: unknown, options?: unknown) => unknown> = {};

    // Verify all stub ops are covered
    expect(Object.keys(stubAdapters).sort()).toEqual([...STUB_TABLE_OPS].sort());

    for (const [operationId, adapter] of Object.entries(stubAdapters)) {
      const editor = makeTableEditor();
      let capturedCode: string | null = null;
      try {
        adapter(editor, {});
      } catch (error) {
        capturedCode = (error as { code?: string }).code ?? null;
      }
      expect(capturedCode, `${operationId} should throw CAPABILITY_UNAVAILABLE`).toBe('CAPABILITY_UNAVAILABLE');
    }
  });

  it('enforces pre-apply throw behavior for every mutating operation', () => {
    const implementedMutatingOps = MUTATING_OPERATION_IDS.filter(
      (id) => !STUB_TABLE_OPS.has(id) && !PLAN_ENGINE_META_OPS.has(id),
    );
    for (const operationId of implementedMutatingOps) {
      const vector = mutationVectors[operationId];
      expect(vector, `Missing vector for ${operationId}`).toBeDefined();
      expectThrowCode(operationId, () => vector!.throwCase());
    }
  });

  it('enforces structured non-applied outcomes for every mutating operation', () => {
    const implementedMutatingOps = MUTATING_OPERATION_IDS.filter(
      (id) => !STUB_TABLE_OPS.has(id) && !PLAN_ENGINE_META_OPS.has(id) && HAS_STRUCTURED_FAILURE_RESULT(id),
    );
    for (const operationId of implementedMutatingOps) {
      const vector = mutationVectors[operationId];
      expect(typeof vector?.failureCase, `${operationId} is missing failureCase`).toBe('function');
      const result = vector!.failureCase!() as { success?: boolean; failure?: { code: string } };
      expect(result.success).toBe(false);
      if (result.success !== false || !result.failure) continue;
      expect(COMMAND_CATALOG[operationId].possibleFailureCodes).toContain(result.failure.code);
      assertSchema(operationId, 'output', result);
      assertSchema(operationId, 'failure', result);
    }
  });

  it('enforces no post-apply throws across every mutating operation', () => {
    const implementedMutatingOps = MUTATING_OPERATION_IDS.filter(
      (id) => !STUB_TABLE_OPS.has(id) && !PLAN_ENGINE_META_OPS.has(id),
    );
    for (const operationId of implementedMutatingOps) {
      const vector = mutationVectors[operationId]!;
      let result: { success?: boolean };
      try {
        result = vector.applyCase() as { success?: boolean };
      } catch (error) {
        const err = error as Error;
        throw new Error(`${operationId} threw post-apply: ${err.message}\n${err.stack ?? ''}`);
      }
      expect(result.success, `${operationId} should report success on applyCase`).toBe(true);
      assertSchema(operationId, 'output', result);
      assertSchema(operationId, 'success', result);
    }
  });

  it('enforces dryRun non-mutation invariants for every dryRun-capable mutation', () => {
    const expectedDryRunOperations = MUTATING_OPERATION_IDS.filter(
      (operationId) =>
        COMMAND_CATALOG[operationId].supportsDryRun &&
        !STUB_TABLE_OPS.has(operationId) &&
        !PLAN_ENGINE_META_OPS.has(operationId),
    );
    const vectorKeys = Object.keys(dryRunVectors).sort();
    expect(vectorKeys).toEqual([...expectedDryRunOperations].sort());

    for (const operationId of expectedDryRunOperations) {
      const run = dryRunVectors[operationId]!;
      const result = run() as { success?: boolean };
      expect(result.success).toBe(true);
      assertSchema(operationId, 'output', result);
      assertSchema(operationId, 'success', result);
    }
  });

  it('does not advance revision for create.table/tables.* dry-run success paths', () => {
    const tableEditor = makeTableEditor();
    initRevision(tableEditor);
    const tableBefore = getRevision(tableEditor);
    const tableDryRun = tablesDeleteWrapper(tableEditor, { nodeId: 'table-1' }, { changeMode: 'direct', dryRun: true });
    expect(tableDryRun.success).toBe(true);
    expect(getRevision(tableEditor)).toBe(tableBefore);

    const insertTableAt = vi.fn(() => true);
    const { editor: createEditor } = makeTextEditor('Hello', {
      commands: { insertTableAt },
      can: vi.fn(() => ({ insertTableAt: vi.fn(() => true) })),
    } as any);
    initRevision(createEditor);
    const createBefore = getRevision(createEditor);
    const createDryRun = createTableWrapper(
      createEditor,
      { rows: 2, columns: 2 },
      { changeMode: 'direct', dryRun: true },
    );
    expect(createDryRun.success).toBe(true);
    expect(getRevision(createEditor)).toBe(createBefore);
    expect(insertTableAt).not.toHaveBeenCalled();
  });

  it('enforces expectedRevision for table wrappers without mutating revision directly', () => {
    const editor = makeTableEditor();
    initRevision(editor);

    expect(() => {
      tablesDeleteWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct', expectedRevision: '999' });
    }).toThrow();
    expect(getRevision(editor)).toBe('0');

    const applied = tablesDeleteWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'direct', expectedRevision: '0' });
    expect(applied.success).toBe(true);
    expect(getRevision(editor)).toBe('0');
  });

  it('keeps capabilities tracked/dryRun flags aligned with static contract metadata', () => {
    const fullCapabilities = getDocumentApiCapabilities(makeTextEditor('Hello').editor);

    for (const operationId of OPERATION_IDS) {
      const metadata = COMMAND_CATALOG[operationId];
      const runtime = fullCapabilities.operations[operationId];

      if (!metadata.supportsTrackedMode) {
        expect(runtime.tracked).toBe(false);
      }

      if (!metadata.supportsDryRun) {
        expect(runtime.dryRun).toBe(false);
      }
    }

    const noTrackedEditor = makeTextEditor('Hello', {
      commands: {
        insertTrackedChange: undefined,
        acceptTrackedChangeById: vi.fn(() => true),
        rejectTrackedChangeById: vi.fn(() => true),
        acceptAllTrackedChanges: vi.fn(() => true),
        rejectAllTrackedChanges: vi.fn(() => true),
      },
    }).editor;
    const noTrackedCapabilities = getDocumentApiCapabilities(noTrackedEditor);
    for (const operationId of OPERATION_IDS) {
      if (!COMMAND_CATALOG[operationId].supportsTrackedMode) continue;
      expect(noTrackedCapabilities.operations[operationId].tracked).toBe(false);
    }
  });

  it('returns stable cell ids from tables.getCells using table-map resolved absolute positions', () => {
    const editor = makeTableEditor();
    const result = tablesGetCellsAdapter(editor, { nodeId: 'table-1' });

    expect(result.tableNodeId).toBe('table-1');
    expect(result.cells.map((cell) => cell.nodeId)).toEqual(
      expect.arrayContaining(['cell-1', 'cell-2', 'cell-3', 'cell-4']),
    );

    const topLeft = result.cells.find((cell) => cell.rowIndex === 0 && cell.columnIndex === 0);
    expect(topLeft?.nodeId).toBe('cell-1');
  });

  it('reads tables.getProperties from nested tableProperties', () => {
    const editor = makeTableEditor();
    const tableNode = editor.state.doc.nodeAt(0) as unknown as { attrs: Record<string, unknown> };
    tableNode.attrs.tableStyleId = 'stale-style';
    tableNode.attrs.justification = 'left';
    tableNode.attrs.tableLayout = 'autofit';
    tableNode.attrs.tableProperties = {
      tableStyleId: 'fresh-style',
      justification: 'center',
      rightToLeft: true,
      tableWidth: { value: 7200, type: 'dxa' },
      tableLayout: 'fixed',
      tblLook: {
        firstRow: true,
        lastRow: false,
        noHBand: false,
        noVBand: true,
      },
    };

    const result = tablesGetPropertiesAdapter(editor, { nodeId: 'table-1' });

    expect(result).toMatchObject({
      nodeId: 'table-1',
      styleId: 'fresh-style',
      alignment: 'center',
      direction: 'rtl',
      preferredWidth: 7200,
      autoFitMode: 'fixedWidth',
      styleOptions: {
        headerRow: true,
        totalRow: false,
        bandedRows: true,
        bandedColumns: false,
      },
    });
  });

  it('keeps tracked change vectors deterministic for accept/reject coverage', () => {
    const change = {
      mark: {
        type: { name: TrackDeleteMarkName },
        attrs: { id: 'tc-delete-1' },
      },
      from: 3,
      to: 4,
    };
    setTrackChanges([change]);
    const { editor } = makeTextEditor();
    const reject = trackChangesRejectWrapper(editor, { id: requireCanonicalTrackChangeId(editor, 'tc-delete-1') });
    expect(reject.success).toBe(true);
    assertSchema('trackChanges.decide', 'output', reject);
    assertSchema('trackChanges.decide', 'success', reject);
  });

  // ---------------------------------------------------------------------------
  // Layer A gap: Tracked-mode parity tests for tracked-eligible table ops
  // ---------------------------------------------------------------------------

  it('rejects tracked mode for table operations that do not support it', () => {
    const nonTrackedTableOps: OperationId[] = [
      'tables.clearContents',
      'tables.move',
      'tables.setLayout',
      'tables.setAltText',
      'tables.setRowHeight',
      'tables.distributeRows',
      'tables.setRowOptions',
      'tables.setColumnWidth',
      'tables.distributeColumns',
      'tables.convertFromText',
      'tables.split',
      'tables.convertToText',
      'tables.mergeCells',
      'tables.unmergeCells',
      'tables.splitCell',
      'tables.setCellProperties',
      'tables.sort',
      'tables.setStyle',
      'tables.clearStyle',
      'tables.setStyleOption',
      'tables.setBorder',
      'tables.clearBorder',
      'tables.applyBorderPreset',
      'tables.setShading',
      'tables.clearShading',
      'tables.setTablePadding',
      'tables.setCellPadding',
      'tables.setCellSpacing',
      'tables.clearCellSpacing',
      'tables.insertCell',
      'tables.deleteCell',
    ] as OperationId[];

    for (const opId of nonTrackedTableOps) {
      expect(COMMAND_CATALOG[opId].supportsTrackedMode, `${opId} should not support tracked mode`).toBe(false);
    }
  });

  it('allows tracked mode for table operations that support it', () => {
    const trackedTableOps: OperationId[] = [
      'create.table',
      'tables.delete',
      'tables.insertRow',
      'tables.deleteRow',
      'tables.insertColumn',
      'tables.deleteColumn',
    ] as OperationId[];

    for (const opId of trackedTableOps) {
      expect(COMMAND_CATALOG[opId].supportsTrackedMode, `${opId} should support tracked mode`).toBe(true);
    }
  });

  it('verifies tracked-eligible table ops accept changeMode=tracked without throwing CAPABILITY_UNAVAILABLE', () => {
    // These ops support tracked mode at the contract level and have ensureTrackedCapability in the adapter.
    // The tracked path requires insertTrackedChange command and a user on the editor.
    const editor = makeTableEditor({ insertTrackedChange: vi.fn(() => true) });
    (editor as any).options = { user: { name: 'Agent', email: 'agent@test.com' } };
    initRevision(editor);

    // tables.delete with tracked mode
    const deleteResult = tablesDeleteWrapper(editor, { nodeId: 'table-1' }, { changeMode: 'tracked' });
    expect(deleteResult.success).toBe(true);

    // tables.insertRow with tracked mode
    const insertRowResult = tablesInsertRowWrapper(
      editor,
      { tableNodeId: 'table-1', rowIndex: 0, position: 'below' } as any,
      { changeMode: 'tracked' },
    );
    expect(insertRowResult.success).toBe(true);

    // tables.deleteRow with tracked mode
    const deleteRowResult = tablesDeleteRowWrapper(editor, { tableNodeId: 'table-1', rowIndex: 0 } as any, {
      changeMode: 'tracked',
    });
    expect(deleteRowResult.success).toBe(true);

    // tables.insertColumn with tracked mode
    const insertColResult = tablesInsertColumnWrapper(
      editor,
      { tableNodeId: 'table-1', columnIndex: 0, position: 'right' },
      { changeMode: 'tracked' },
    );
    expect(insertColResult.success).toBe(true);

    // tables.deleteColumn with tracked mode
    const deleteColResult = tablesDeleteColumnWrapper(
      editor,
      { tableNodeId: 'table-1', columnIndex: 0 },
      { changeMode: 'tracked' },
    );
    expect(deleteColResult.success).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Layer A gap: Wrapper parity — doc.tables.<op> vs mutations.apply
  // These tests verify that table wrappers route through executeCompiledPlan
  // (the same path as mutations.apply), eliminating the Layer A bypass.
  // Each case calls the wrapper AND executePlan with an equivalent raw step,
  // asserting both succeed with effect: 'changed'.
  // ---------------------------------------------------------------------------

  const PARITY_CASES: Array<{
    op: string;
    ref: string;
    args: Record<string, unknown>;
    wrapperFn: (e: Editor) => { success: boolean };
  }> = [
    // Lifecycle
    { op: 'tables.delete', ref: 'table-1', args: {}, wrapperFn: (e) => tablesDeleteWrapper(e, { nodeId: 'table-1' }) },
    {
      op: 'tables.clearContents',
      ref: 'table-1',
      args: {},
      wrapperFn: (e) => tablesClearContentsWrapper(e, { nodeId: 'table-1' }),
    },
    {
      op: 'tables.move',
      ref: 'table-1',
      args: { destination: { kind: 'documentEnd' } },
      wrapperFn: (e) => tablesMoveWrapper(e, { nodeId: 'table-1', destination: { kind: 'documentEnd' } } as any),
    },
    {
      op: 'tables.setLayout',
      ref: 'table-1',
      args: { alignment: 'center' },
      wrapperFn: (e) => tablesSetLayoutWrapper(e, { nodeId: 'table-1', alignment: 'center' } as any),
    },
    {
      op: 'tables.setAltText',
      ref: 'table-1',
      args: { altText: 'test' },
      wrapperFn: (e) => tablesSetAltTextWrapper(e, { nodeId: 'table-1', altText: 'test' } as any),
    },
    // Row ops
    {
      op: 'tables.insertRow',
      ref: 'table-1',
      args: { rowIndex: 0, position: 'below' },
      wrapperFn: (e) => tablesInsertRowWrapper(e, { tableNodeId: 'table-1', rowIndex: 0, position: 'below' } as any),
    },
    {
      op: 'tables.deleteRow',
      ref: 'table-1',
      args: { rowIndex: 0 },
      wrapperFn: (e) => tablesDeleteRowWrapper(e, { tableNodeId: 'table-1', rowIndex: 0 } as any),
    },
    {
      op: 'tables.setRowHeight',
      ref: 'table-1',
      args: { rowIndex: 0, heightPt: 20, rule: 'atLeast' },
      wrapperFn: (e) =>
        tablesSetRowHeightWrapper(e, { tableNodeId: 'table-1', rowIndex: 0, heightPt: 20, rule: 'atLeast' } as any),
    },
    {
      op: 'tables.distributeRows',
      ref: 'table-1',
      args: {},
      wrapperFn: (e) => tablesDistributeRowsWrapper(e, { nodeId: 'table-1' } as any),
    },
    {
      op: 'tables.setRowOptions',
      ref: 'table-1',
      args: { rowIndex: 0, allowBreakAcrossPages: true },
      wrapperFn: (e) =>
        tablesSetRowOptionsWrapper(e, { tableNodeId: 'table-1', rowIndex: 0, allowBreakAcrossPages: true } as any),
    },
    // Column ops
    {
      op: 'tables.insertColumn',
      ref: 'table-1',
      args: { columnIndex: 0, position: 'right' },
      wrapperFn: (e) =>
        tablesInsertColumnWrapper(e, { tableNodeId: 'table-1', columnIndex: 0, position: 'right' } as any),
    },
    {
      op: 'tables.deleteColumn',
      ref: 'table-1',
      args: { columnIndex: 0 },
      wrapperFn: (e) => tablesDeleteColumnWrapper(e, { tableNodeId: 'table-1', columnIndex: 0 } as any),
    },
    {
      op: 'tables.setColumnWidth',
      ref: 'table-1',
      args: { columnIndex: 0, widthPt: 100 },
      wrapperFn: (e) => tablesSetColumnWidthWrapper(e, { tableNodeId: 'table-1', columnIndex: 0, widthPt: 100 } as any),
    },
    {
      op: 'tables.distributeColumns',
      ref: 'table-1',
      args: {},
      wrapperFn: (e) => tablesDistributeColumnsWrapper(e, { nodeId: 'table-1' } as any),
    },
    // Cell ops
    {
      op: 'tables.insertCell',
      ref: 'cell-1',
      args: { mode: 'shiftRight' },
      wrapperFn: (e) => tablesInsertCellWrapper(e, { nodeId: 'cell-1', mode: 'shiftRight' } as any),
    },
    {
      op: 'tables.deleteCell',
      ref: 'cell-1',
      args: { mode: 'shiftLeft' },
      wrapperFn: (e) => tablesDeleteCellWrapper(e, { nodeId: 'cell-1', mode: 'shiftLeft' } as any),
    },
    {
      op: 'tables.mergeCells',
      ref: 'table-1',
      args: { start: { rowIndex: 0, columnIndex: 0 }, end: { rowIndex: 1, columnIndex: 1 } },
      wrapperFn: (e) =>
        tablesMergeCellsWrapper(e, {
          tableNodeId: 'table-1',
          start: { rowIndex: 0, columnIndex: 0 },
          end: { rowIndex: 1, columnIndex: 1 },
        } as any),
    },
    {
      op: 'tables.unmergeCells',
      ref: 'cell-1',
      args: {},
      wrapperFn: (e) => tablesUnmergeCellsWrapper(e, { nodeId: 'cell-1' }),
    },
    {
      op: 'tables.splitCell',
      ref: 'cell-1',
      args: { rows: 2, columns: 2 },
      wrapperFn: (e) => tablesSplitCellWrapper(e, { nodeId: 'cell-1', rows: 2, columns: 2 } as any),
    },
    {
      op: 'tables.setCellProperties',
      ref: 'cell-1',
      args: { verticalAlign: 'center' },
      wrapperFn: (e) => tablesSetCellPropertiesWrapper(e, { nodeId: 'cell-1', verticalAlign: 'center' } as any),
    },
    // Sort + conversion
    {
      op: 'tables.sort',
      ref: 'table-1',
      args: { keys: [{ columnIndex: 0, direction: 'ascending', type: 'text' }] },
      wrapperFn: (e) =>
        tablesSortWrapper(e, {
          nodeId: 'table-1',
          keys: [{ columnIndex: 0, direction: 'ascending', type: 'text' }],
        } as any),
    },
    {
      op: 'tables.convertFromText',
      ref: 'p1',
      args: {},
      wrapperFn: (e) => tablesConvertFromTextWrapper(e, { nodeId: 'p1' } as any),
    },
    {
      op: 'tables.split',
      ref: 'table-1',
      args: { atRowIndex: 1 },
      wrapperFn: (e) => tablesSplitWrapper(e, { nodeId: 'table-1', atRowIndex: 1 } as any),
    },
    {
      op: 'tables.convertToText',
      ref: 'table-1',
      args: {},
      wrapperFn: (e) => tablesConvertToTextWrapper(e, { nodeId: 'table-1' }),
    },
    // Style ops
    {
      op: 'tables.setStyle',
      ref: 'table-1',
      args: { styleId: 'TableGrid' },
      wrapperFn: (e) => tablesSetStyleWrapper(e, { nodeId: 'table-1', styleId: 'TableGrid' } as any),
    },
    {
      op: 'tables.clearStyle',
      ref: 'table-1',
      args: {},
      wrapperFn: (e) => tablesClearStyleWrapper(e, { nodeId: 'table-1' }),
    },
    {
      op: 'tables.setStyleOption',
      ref: 'table-1',
      args: { flag: 'headerRow', enabled: true },
      wrapperFn: (e) => tablesSetStyleOptionWrapper(e, { nodeId: 'table-1', flag: 'headerRow', enabled: true } as any),
    },
    // Border ops
    {
      op: 'tables.setBorder',
      ref: 'table-1',
      args: { edge: 'top', lineStyle: 'single', lineWeightPt: 0.5, color: '000000' },
      wrapperFn: (e) =>
        tablesSetBorderWrapper(e, {
          nodeId: 'table-1',
          edge: 'top',
          lineStyle: 'single',
          lineWeightPt: 0.5,
          color: '000000',
        } as any),
    },
    {
      op: 'tables.clearBorder',
      ref: 'table-1',
      args: { edge: 'top' },
      wrapperFn: (e) => tablesClearBorderWrapper(e, { nodeId: 'table-1', edge: 'top' } as any),
    },
    {
      op: 'tables.applyBorderPreset',
      ref: 'table-1',
      args: { preset: 'box' },
      wrapperFn: (e) => tablesApplyBorderPresetWrapper(e, { nodeId: 'table-1', preset: 'box' } as any),
    },
    // Shading ops
    {
      op: 'tables.setShading',
      ref: 'table-1',
      args: { color: 'FF0000' },
      wrapperFn: (e) => tablesSetShadingWrapper(e, { nodeId: 'table-1', color: 'FF0000' } as any),
    },
    {
      op: 'tables.clearShading',
      ref: 'table-1',
      args: {},
      wrapperFn: (e) => tablesClearShadingWrapper(e, { nodeId: 'table-1' }),
    },
    // Padding + spacing ops
    {
      op: 'tables.setTablePadding',
      ref: 'table-1',
      args: { topPt: 5, rightPt: 5, bottomPt: 5, leftPt: 5 },
      wrapperFn: (e) =>
        tablesSetTablePaddingWrapper(e, { nodeId: 'table-1', topPt: 5, rightPt: 5, bottomPt: 5, leftPt: 5 } as any),
    },
    {
      op: 'tables.setCellPadding',
      ref: 'cell-1',
      args: { topPt: 5, rightPt: 5, bottomPt: 5, leftPt: 5 },
      wrapperFn: (e) =>
        tablesSetCellPaddingWrapper(e, { nodeId: 'cell-1', topPt: 5, rightPt: 5, bottomPt: 5, leftPt: 5 } as any),
    },
    {
      op: 'tables.setCellSpacing',
      ref: 'table-1',
      args: { spacingPt: 2 },
      wrapperFn: (e) => tablesSetCellSpacingWrapper(e, { nodeId: 'table-1', spacingPt: 2 } as any),
    },
    {
      op: 'tables.clearCellSpacing',
      ref: 'table-1',
      args: {},
      wrapperFn: (e) => tablesClearCellSpacingWrapper(e, { nodeId: 'table-1' }),
    },
    // create.table (ref is a dummy target — executor ignores targets for create ops)
    {
      op: 'create.table',
      ref: 'p1',
      args: { rows: 2, columns: 2 },
      wrapperFn: (e) => createTableWrapper(e, { rows: 2, columns: 2 }),
    },
  ];

  it.each(PARITY_CASES)(
    'wrapper parity: $op via wrapper matches mutations.apply path',
    ({ op, ref, args, wrapperFn }) => {
      // 1. Wrapper path — calls executeCompiledPlan with _handler closure
      const wrapperEditor = makeTableEditor();
      const wrapperResult = wrapperFn(wrapperEditor);
      expect(wrapperResult.success, `${op} wrapper should succeed`).toBe(true);

      // 2. mutations.apply path — raw step without _handler, executor dispatches via adapter map
      const applyEditor = makeTableEditor();
      const receipt = executePlan(applyEditor, {
        expectedRevision: '0',
        atomic: true,
        changeMode: 'direct',
        steps: [
          {
            id: 'parity-step-1',
            op,
            where: { by: 'ref' as const, ref, require: 'exactlyOne' as const },
            args,
          },
        ],
      } as any);

      expect(receipt.success, `${op} mutations.apply should succeed`).toBe(true);
      expect(receipt.steps.length, `${op} should have step outcomes`).toBeGreaterThan(0);
      expect(receipt.steps[0].effect, `${op} outcome should be 'changed'`).toBe('changed');
    },
  );
});
