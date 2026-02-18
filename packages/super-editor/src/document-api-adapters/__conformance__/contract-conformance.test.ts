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
import { createCommentsAdapter } from '../comments-adapter.js';
import { createParagraphAdapter, createHeadingAdapter } from '../create-adapter.js';
import {
  formatBoldAdapter,
  formatItalicAdapter,
  formatUnderlineAdapter,
  formatStrikethroughAdapter,
} from '../format-adapter.js';
import { getDocumentApiCapabilities } from '../capabilities-adapter.js';
import {
  listsExitAdapter,
  listsIndentAdapter,
  listsInsertAdapter,
  listsOutdentAdapter,
  listsRestartAdapter,
  listsSetTypeAdapter,
} from '../lists-adapter.js';
import {
  trackChangesAcceptAdapter,
  trackChangesAcceptAllAdapter,
  trackChangesRejectAdapter,
  trackChangesRejectAllAdapter,
} from '../track-changes-adapter.js';
import { toCanonicalTrackedChangeId } from '../helpers/tracked-change-resolver.js';
import { writeAdapter } from '../write-adapter.js';
import { validateJsonSchema } from './schema-validator.js';

const mockedDeps = vi.hoisted(() => ({
  resolveCommentAnchorsById: vi.fn(() => []),
  listCommentAnchors: vi.fn(() => []),
  getTrackChanges: vi.fn(() => []),
}));

vi.mock('../helpers/comment-target-resolver.js', () => ({
  resolveCommentAnchorsById: mockedDeps.resolveCommentAnchorsById,
  listCommentAnchors: mockedDeps.listCommentAnchors,
}));

vi.mock('../../extensions/track-changes/trackChangesHelpers/getTrackChanges.js', () => ({
  getTrackChanges: mockedDeps.getTrackChanges,
}));

const INTERNAL_SCHEMAS = buildInternalContractSchemas();

type MutationVector = {
  throwCase: () => unknown;
  failureCase: () => unknown;
  applyCase: () => unknown;
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

  return {
    type: { name: typeName },
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
    descendants(callback: (node: ProseMirrorNode, pos: number) => void) {
      let offset = 0;
      for (const child of children) {
        callback(child, offset);
        offset += child.nodeSize;
      }
    },
  } as unknown as ProseMirrorNode;
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
    setMeta: vi.fn(),
  };
  tr.insertText.mockReturnValue(tr);
  tr.delete.mockReturnValue(tr);
  tr.addMark.mockReturnValue(tr);
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
  };

  const baseSchema = {
    marks: {
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
      [TrackFormatMarkName]: {
        create: vi.fn(() => ({ type: TrackFormatMarkName })),
      },
    },
  };

  const editor = {
    state: {
      doc: {
        ...doc,
        textBetween: vi.fn((from: number, to: number) => {
          const start = Math.max(0, from - 1);
          const end = Math.max(start, to - 1);
          return text.slice(start, end);
        }),
      },
      tr,
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
      ...baseSchema,
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

  return {
    state: { doc },
    commands: {
      ...baseCommands,
      ...commandOverrides,
    },
    converter: {
      numbering: { definitions: {}, abstracts: {} },
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

  const result = validateJsonSchema(schema as Parameters<typeof validateJsonSchema>[0], value);
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
  'format.bold': {
    throwCase: () => {
      const { editor } = makeTextEditor();
      return formatBoldAdapter(
        editor,
        {
          target: { kind: 'text', blockId: 'missing', range: { start: 0, end: 1 } },
        },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const { editor } = makeTextEditor();
      return formatBoldAdapter(
        editor,
        {
          target: { kind: 'text', blockId: 'p1', range: { start: 2, end: 2 } },
        },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const { editor } = makeTextEditor();
      return formatBoldAdapter(
        editor,
        {
          target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
        },
        { changeMode: 'direct' },
      );
    },
  },
  'format.italic': {
    throwCase: () => {
      const { editor } = makeTextEditor();
      return formatItalicAdapter(
        editor,
        { target: { kind: 'text', blockId: 'missing', range: { start: 0, end: 1 } } },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const { editor } = makeTextEditor();
      return formatItalicAdapter(
        editor,
        { target: { kind: 'text', blockId: 'p1', range: { start: 2, end: 2 } } },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const { editor } = makeTextEditor();
      return formatItalicAdapter(
        editor,
        { target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } } },
        { changeMode: 'direct' },
      );
    },
  },
  'format.underline': {
    throwCase: () => {
      const { editor } = makeTextEditor();
      return formatUnderlineAdapter(
        editor,
        { target: { kind: 'text', blockId: 'missing', range: { start: 0, end: 1 } } },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const { editor } = makeTextEditor();
      return formatUnderlineAdapter(
        editor,
        { target: { kind: 'text', blockId: 'p1', range: { start: 2, end: 2 } } },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const { editor } = makeTextEditor();
      return formatUnderlineAdapter(
        editor,
        { target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } } },
        { changeMode: 'direct' },
      );
    },
  },
  'format.strikethrough': {
    throwCase: () => {
      const { editor } = makeTextEditor();
      return formatStrikethroughAdapter(
        editor,
        { target: { kind: 'text', blockId: 'missing', range: { start: 0, end: 1 } } },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const { editor } = makeTextEditor();
      return formatStrikethroughAdapter(
        editor,
        { target: { kind: 'text', blockId: 'p1', range: { start: 2, end: 2 } } },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const { editor } = makeTextEditor();
      return formatStrikethroughAdapter(
        editor,
        { target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } } },
        { changeMode: 'direct' },
      );
    },
  },
  'create.paragraph': {
    throwCase: () => {
      const { editor } = makeTextEditor('Hello', { commands: { insertParagraphAt: undefined } });
      return createParagraphAdapter(editor, { at: { kind: 'documentEnd' }, text: 'X' }, { changeMode: 'direct' });
    },
    failureCase: () => {
      const { editor } = makeTextEditor('Hello', { commands: { insertParagraphAt: vi.fn(() => false) } });
      return createParagraphAdapter(editor, { at: { kind: 'documentEnd' }, text: 'X' }, { changeMode: 'direct' });
    },
    applyCase: () => {
      const { editor } = makeTextEditor('Hello', { commands: { insertParagraphAt: vi.fn(() => true) } });
      return createParagraphAdapter(editor, { at: { kind: 'documentEnd' }, text: 'X' }, { changeMode: 'direct' });
    },
  },
  'create.heading': {
    throwCase: () => {
      const { editor } = makeTextEditor('Hello', { commands: { insertHeadingAt: undefined } });
      return createHeadingAdapter(
        editor,
        { level: 1, at: { kind: 'documentEnd' }, text: 'X' },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const { editor } = makeTextEditor('Hello', { commands: { insertHeadingAt: vi.fn(() => false) } });
      return createHeadingAdapter(
        editor,
        { level: 1, at: { kind: 'documentEnd' }, text: 'X' },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const { editor } = makeTextEditor('Hello', { commands: { insertHeadingAt: vi.fn(() => true) } });
      return createHeadingAdapter(
        editor,
        { level: 2, at: { kind: 'documentEnd' }, text: 'X' },
        { changeMode: 'direct' },
      );
    },
  },
  'lists.insert': {
    throwCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, numberingType: 'decimal' })]);
      return listsInsertAdapter(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'missing' }, position: 'after', text: 'X' },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, numberingType: 'decimal' })], {
        insertListItemAt: vi.fn(() => false),
      });
      return listsInsertAdapter(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, position: 'after', text: 'X' },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, numberingType: 'decimal' })]);
      return listsInsertAdapter(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, position: 'after', text: 'X' },
        { changeMode: 'direct' },
      );
    },
  },
  'lists.setType': {
    throwCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, numberingType: 'bullet' })]);
      return listsSetTypeAdapter(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' }, kind: 'ordered' },
        { changeMode: 'tracked' },
      );
    },
    failureCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, numberingType: 'bullet' })]);
      return listsSetTypeAdapter(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        kind: 'bullet',
      });
    },
    applyCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, numberingType: 'bullet' })]);
      return listsSetTypeAdapter(editor, {
        target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' },
        kind: 'ordered',
      });
    },
  },
  'lists.indent': {
    throwCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsIndentAdapter(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } },
        { changeMode: 'tracked' },
      );
    },
    failureCase: () => {
      const hasDefinitionSpy = vi.spyOn(ListHelpers, 'hasListDefinition').mockReturnValue(false);
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      const result = listsIndentAdapter(editor, { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } });
      hasDefinitionSpy.mockRestore();
      return result;
    },
    applyCase: () => {
      const hasDefinitionSpy = vi.spyOn(ListHelpers, 'hasListDefinition').mockReturnValue(true);
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      const result = listsIndentAdapter(editor, { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } });
      hasDefinitionSpy.mockRestore();
      return result;
    },
  },
  'lists.outdent': {
    throwCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 1, numberingType: 'decimal' })]);
      return listsOutdentAdapter(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } },
        { changeMode: 'tracked' },
      );
    },
    failureCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsOutdentAdapter(editor, { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } });
    },
    applyCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 1, numberingType: 'decimal' })]);
      return listsOutdentAdapter(editor, { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } });
    },
  },
  'lists.restart': {
    throwCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsRestartAdapter(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } },
        { changeMode: 'tracked' },
      );
    },
    failureCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsRestartAdapter(editor, { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } });
    },
    applyCase: () => {
      const editor = makeListEditor([
        makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal', markerText: '1.', path: [1] }),
        makeListParagraph({ id: 'li-2', numId: 1, ilvl: 0, numberingType: 'decimal', markerText: '2.', path: [2] }),
      ]);
      return listsRestartAdapter(editor, { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-2' } });
    },
  },
  'lists.exit': {
    throwCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsExitAdapter(
        editor,
        { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } },
        { changeMode: 'tracked' },
      );
    },
    failureCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })], {
        exitListItemAt: vi.fn(() => false),
      });
      return listsExitAdapter(editor, { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } });
    },
    applyCase: () => {
      const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, ilvl: 0, numberingType: 'decimal' })]);
      return listsExitAdapter(editor, { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } });
    },
  },
  'comments.add': {
    throwCase: () => {
      const editor = makeCommentsEditor([], { addComment: undefined });
      return createCommentsAdapter(editor).add({
        target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 3 } },
        text: 'X',
      });
    },
    failureCase: () => {
      const editor = makeCommentsEditor();
      return createCommentsAdapter(editor).add({
        target: { kind: 'text', blockId: 'p1', range: { start: 1, end: 1 } },
        text: 'X',
      });
    },
    applyCase: () => {
      const editor = makeCommentsEditor();
      return createCommentsAdapter(editor).add({
        target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 3 } },
        text: 'X',
      });
    },
  },
  'comments.edit': {
    throwCase: () => {
      const editor = makeCommentsEditor();
      return createCommentsAdapter(editor).edit({ commentId: 'missing', text: 'X' });
    },
    failureCase: () => {
      const editor = makeCommentsEditor([makeCommentRecord('c1', { commentText: 'Same' })]);
      return createCommentsAdapter(editor).edit({ commentId: 'c1', text: 'Same' });
    },
    applyCase: () => {
      const editor = makeCommentsEditor([makeCommentRecord('c1', { commentText: 'Old' })]);
      return createCommentsAdapter(editor).edit({ commentId: 'c1', text: 'New' });
    },
  },
  'comments.reply': {
    throwCase: () => {
      const editor = makeCommentsEditor();
      return createCommentsAdapter(editor).reply({ parentCommentId: 'missing', text: 'X' });
    },
    failureCase: () => {
      const editor = makeCommentsEditor([makeCommentRecord('c1')]);
      return createCommentsAdapter(editor).reply({ parentCommentId: '', text: 'X' });
    },
    applyCase: () => {
      const editor = makeCommentsEditor([makeCommentRecord('c1')]);
      return createCommentsAdapter(editor).reply({ parentCommentId: 'c1', text: 'Reply' });
    },
  },
  'comments.move': {
    throwCase: () => {
      const editor = makeCommentsEditor([makeCommentRecord('c1')]);
      return createCommentsAdapter(editor).move({
        commentId: 'c1',
        target: { kind: 'text', blockId: 'missing', range: { start: 0, end: 2 } },
      });
    },
    failureCase: () => {
      mockedDeps.resolveCommentAnchorsById.mockImplementation(() => []);
      const editor = makeCommentsEditor([makeCommentRecord('c1')]);
      return createCommentsAdapter(editor).move({
        commentId: 'c1',
        target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 2 } },
      });
    },
    applyCase: () => {
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
      const editor = makeCommentsEditor([makeCommentRecord('c1')]);
      return createCommentsAdapter(editor).move({
        commentId: 'c1',
        target: { kind: 'text', blockId: 'p1', range: { start: 1, end: 3 } },
      });
    },
  },
  'comments.resolve': {
    throwCase: () => {
      const editor = makeCommentsEditor();
      return createCommentsAdapter(editor).resolve({ commentId: 'missing' });
    },
    failureCase: () => {
      const editor = makeCommentsEditor([makeCommentRecord('c1', { isDone: true })]);
      return createCommentsAdapter(editor).resolve({ commentId: 'c1' });
    },
    applyCase: () => {
      const editor = makeCommentsEditor([makeCommentRecord('c1', { isDone: false })]);
      return createCommentsAdapter(editor).resolve({ commentId: 'c1' });
    },
  },
  'comments.remove': {
    throwCase: () => {
      const editor = makeCommentsEditor();
      return createCommentsAdapter(editor).remove({ commentId: 'missing' });
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
      return createCommentsAdapter(editor).remove({ commentId: 'c1' });
    },
    applyCase: () => {
      const editor = makeCommentsEditor([makeCommentRecord('c1')], { removeComment: vi.fn(() => true) });
      return createCommentsAdapter(editor).remove({ commentId: 'c1' });
    },
  },
  'comments.setInternal': {
    throwCase: () => {
      const editor = makeCommentsEditor();
      return createCommentsAdapter(editor).setInternal({ commentId: 'missing', isInternal: true });
    },
    failureCase: () => {
      const editor = makeCommentsEditor([makeCommentRecord('c1', { isInternal: true })]);
      return createCommentsAdapter(editor).setInternal({ commentId: 'c1', isInternal: true });
    },
    applyCase: () => {
      const editor = makeCommentsEditor([makeCommentRecord('c1', { isInternal: false })]);
      return createCommentsAdapter(editor).setInternal({ commentId: 'c1', isInternal: true });
    },
  },
  'comments.setActive': {
    throwCase: () => {
      const editor = makeCommentsEditor();
      return createCommentsAdapter(editor).setActive({ commentId: 'missing' });
    },
    failureCase: () => {
      const editor = makeCommentsEditor([], { setActiveComment: vi.fn(() => false) });
      return createCommentsAdapter(editor).setActive({ commentId: null });
    },
    applyCase: () => {
      const editor = makeCommentsEditor([], { setActiveComment: vi.fn(() => true) });
      return createCommentsAdapter(editor).setActive({ commentId: null });
    },
  },
  'trackChanges.accept': {
    throwCase: () => {
      setTrackChanges([]);
      const { editor } = makeTextEditor();
      return trackChangesAcceptAdapter(editor, { id: 'missing' });
    },
    failureCase: () => {
      setTrackChanges([makeTrackedChange('tc-1')]);
      const { editor } = makeTextEditor('Hello', { commands: { acceptTrackedChangeById: vi.fn(() => false) } });
      return trackChangesAcceptAdapter(editor, { id: requireCanonicalTrackChangeId(editor, 'tc-1') });
    },
    applyCase: () => {
      setTrackChanges([makeTrackedChange('tc-1')]);
      const { editor } = makeTextEditor('Hello', { commands: { acceptTrackedChangeById: vi.fn(() => true) } });
      return trackChangesAcceptAdapter(editor, { id: requireCanonicalTrackChangeId(editor, 'tc-1') });
    },
  },
  'trackChanges.reject': {
    throwCase: () => {
      setTrackChanges([]);
      const { editor } = makeTextEditor();
      return trackChangesRejectAdapter(editor, { id: 'missing' });
    },
    failureCase: () => {
      setTrackChanges([makeTrackedChange('tc-1')]);
      const { editor } = makeTextEditor('Hello', { commands: { rejectTrackedChangeById: vi.fn(() => false) } });
      return trackChangesRejectAdapter(editor, { id: requireCanonicalTrackChangeId(editor, 'tc-1') });
    },
    applyCase: () => {
      setTrackChanges([makeTrackedChange('tc-1')]);
      const { editor } = makeTextEditor('Hello', { commands: { rejectTrackedChangeById: vi.fn(() => true) } });
      return trackChangesRejectAdapter(editor, { id: requireCanonicalTrackChangeId(editor, 'tc-1') });
    },
  },
  'trackChanges.acceptAll': {
    throwCase: () => {
      const { editor } = makeTextEditor('Hello', { commands: { acceptAllTrackedChanges: undefined } });
      return trackChangesAcceptAllAdapter(editor, {});
    },
    failureCase: () => {
      const { editor } = makeTextEditor('Hello', { commands: { acceptAllTrackedChanges: vi.fn(() => false) } });
      return trackChangesAcceptAllAdapter(editor, {});
    },
    applyCase: () => {
      setTrackChanges([makeTrackedChange('tc-1')]);
      const { editor } = makeTextEditor('Hello', { commands: { acceptAllTrackedChanges: vi.fn(() => true) } });
      return trackChangesAcceptAllAdapter(editor, {});
    },
  },
  'trackChanges.rejectAll': {
    throwCase: () => {
      const { editor } = makeTextEditor('Hello', { commands: { rejectAllTrackedChanges: undefined } });
      return trackChangesRejectAllAdapter(editor, {});
    },
    failureCase: () => {
      const { editor } = makeTextEditor('Hello', { commands: { rejectAllTrackedChanges: vi.fn(() => false) } });
      return trackChangesRejectAllAdapter(editor, {});
    },
    applyCase: () => {
      setTrackChanges([makeTrackedChange('tc-1')]);
      const { editor } = makeTextEditor('Hello', { commands: { rejectAllTrackedChanges: vi.fn(() => true) } });
      return trackChangesRejectAllAdapter(editor, {});
    },
  },
};

const dryRunVectors: Partial<Record<OperationId, () => unknown>> = {
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
  'format.bold': () => {
    const { editor, dispatch, tr } = makeTextEditor();
    const result = formatBoldAdapter(
      editor,
      { target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } } },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    expect(tr.addMark).not.toHaveBeenCalled();
    return result;
  },
  'format.italic': () => {
    const { editor, dispatch, tr } = makeTextEditor();
    const result = formatItalicAdapter(
      editor,
      { target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } } },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    expect(tr.addMark).not.toHaveBeenCalled();
    return result;
  },
  'format.underline': () => {
    const { editor, dispatch, tr } = makeTextEditor();
    const result = formatUnderlineAdapter(
      editor,
      { target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } } },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    expect(tr.addMark).not.toHaveBeenCalled();
    return result;
  },
  'format.strikethrough': () => {
    const { editor, dispatch, tr } = makeTextEditor();
    const result = formatStrikethroughAdapter(
      editor,
      { target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } } },
      { changeMode: 'direct', dryRun: true },
    );
    expect(dispatch).not.toHaveBeenCalled();
    expect(tr.addMark).not.toHaveBeenCalled();
    return result;
  },
  'create.paragraph': () => {
    const insertParagraphAt = vi.fn(() => true);
    const { editor } = makeTextEditor('Hello', { commands: { insertParagraphAt } });
    const result = createParagraphAdapter(
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
    const result = createHeadingAdapter(
      editor,
      { level: 1, at: { kind: 'documentEnd' }, text: 'Dry run heading' },
      { changeMode: 'direct', dryRun: true },
    );
    expect(insertHeadingAt).not.toHaveBeenCalled();
    return result;
  },
  'lists.insert': () => {
    const editor = makeListEditor([makeListParagraph({ id: 'li-1', numId: 1, numberingType: 'decimal' })]);
    const insertListItemAt = editor.commands!.insertListItemAt as ReturnType<typeof vi.fn>;
    const result = listsInsertAdapter(
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
    const result = listsSetTypeAdapter(
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
    const result = listsIndentAdapter(
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
    const result = listsOutdentAdapter(
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
    const result = listsRestartAdapter(
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
    const result = listsExitAdapter(
      editor,
      { target: { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } },
      { changeMode: 'direct', dryRun: true },
    );
    expect(exitListItemAt).not.toHaveBeenCalled();
    return result;
  },
};

beforeEach(() => {
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
      expect(schema.failure).toBeDefined();
    }
  });

  it('covers every mutating operation with throw/failure/apply vectors', () => {
    const vectorKeys = Object.keys(mutationVectors).sort();
    const expectedKeys = [...MUTATING_OPERATION_IDS].sort();
    expect(vectorKeys).toEqual(expectedKeys);
  });

  it('enforces pre-apply throw behavior for every mutating operation', () => {
    for (const operationId of MUTATING_OPERATION_IDS) {
      const vector = mutationVectors[operationId];
      expect(vector).toBeDefined();
      expectThrowCode(operationId, () => vector!.throwCase());
    }
  });

  it('enforces structured non-applied outcomes for every mutating operation', () => {
    for (const operationId of MUTATING_OPERATION_IDS) {
      const vector = mutationVectors[operationId]!;
      const result = vector.failureCase() as { success?: boolean; failure?: { code: string } };
      expect(result.success).toBe(false);
      if (result.success !== false || !result.failure) continue;
      expect(COMMAND_CATALOG[operationId].possibleFailureCodes).toContain(result.failure.code);
      assertSchema(operationId, 'output', result);
      assertSchema(operationId, 'failure', result);
    }
  });

  it('enforces no post-apply throws across every mutating operation', () => {
    for (const operationId of MUTATING_OPERATION_IDS) {
      const vector = mutationVectors[operationId]!;
      const apply = () => vector.applyCase();
      expect(apply).not.toThrow();
      const result = apply() as { success?: boolean };
      expect(result.success).toBe(true);
      assertSchema(operationId, 'output', result);
      assertSchema(operationId, 'success', result);
    }
  });

  it('enforces dryRun non-mutation invariants for every dryRun-capable mutation', () => {
    const expectedDryRunOperations = MUTATING_OPERATION_IDS.filter(
      (operationId) => COMMAND_CATALOG[operationId].supportsDryRun,
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
    const reject = trackChangesRejectAdapter(editor, { id: requireCanonicalTrackChangeId(editor, 'tc-delete-1') });
    expect(reject.success).toBe(true);
    assertSchema('trackChanges.reject', 'output', reject);
    assertSchema('trackChanges.reject', 'success', reject);
  });
});
