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
import { writeWrapper, styleApplyWrapper } from '../plan-engine/plan-wrappers.js';
import {
  formatFontSizeWrapper,
  formatFontFamilyWrapper,
  formatColorWrapper,
  formatAlignWrapper,
} from '../plan-engine/format-value-wrappers.js';
import { getDocumentApiCapabilities } from '../capabilities-adapter.js';
import {
  listsExitWrapper,
  listsIndentWrapper,
  listsInsertWrapper,
  listsOutdentWrapper,
  listsRestartWrapper,
  listsSetTypeWrapper,
} from '../plan-engine/lists-wrappers.js';
import {
  trackChangesAcceptWrapper,
  trackChangesAcceptAllWrapper,
  trackChangesRejectWrapper,
  trackChangesRejectAllWrapper,
} from '../plan-engine/track-changes-wrappers.js';
import { toCanonicalTrackedChangeId } from '../helpers/tracked-change-resolver.js';
import { executePlan, executeCompiledPlan } from '../plan-engine/executor.js';
import { registerBuiltInExecutors } from '../plan-engine/register-executors.js';
import { validateJsonSchema } from './schema-validator.js';

// Ensure built-in executors are registered for tests that call executePlan directly
registerBuiltInExecutors();

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
  failureCase?: () => unknown;
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
    mapping: { map: (pos: number) => pos },
    docChanged: false,
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
      return writeWrapper(
        editor,
        { kind: 'insert', target: { kind: 'text', blockId: 'missing', range: { start: 0, end: 0 } }, text: 'X' },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const { editor } = makeTextEditor();
      return writeWrapper(
        editor,
        { kind: 'insert', target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 0 } }, text: '' },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const { editor } = makeTextEditor();
      return writeWrapper(
        editor,
        { kind: 'insert', target: { kind: 'text', blockId: 'p1', range: { start: 1, end: 1 } }, text: 'X' },
        { changeMode: 'direct' },
      );
    },
  },
  replace: {
    throwCase: () => {
      const { editor } = makeTextEditor();
      return writeWrapper(
        editor,
        { kind: 'replace', target: { kind: 'text', blockId: 'missing', range: { start: 0, end: 1 } }, text: 'X' },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const { editor } = makeTextEditor('Hello');
      return writeWrapper(
        editor,
        { kind: 'replace', target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } }, text: 'Hello' },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const { editor } = makeTextEditor('Hello');
      return writeWrapper(
        editor,
        { kind: 'replace', target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } }, text: 'World' },
        { changeMode: 'direct' },
      );
    },
  },
  delete: {
    throwCase: () => {
      const { editor } = makeTextEditor();
      return writeWrapper(
        editor,
        { kind: 'delete', target: { kind: 'text', blockId: 'missing', range: { start: 0, end: 1 } } },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const { editor } = makeTextEditor();
      return writeWrapper(
        editor,
        { kind: 'delete', target: { kind: 'text', blockId: 'p1', range: { start: 2, end: 2 } } },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const { editor } = makeTextEditor();
      return writeWrapper(
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
        { target: { kind: 'text', blockId: 'missing', range: { start: 0, end: 1 } }, inline: { bold: true } },
        { changeMode: 'direct' },
      );
    },
    failureCase: () => {
      const { editor } = makeTextEditor();
      return styleApplyWrapper(
        editor,
        { target: { kind: 'text', blockId: 'p1', range: { start: 2, end: 2 } }, inline: { bold: true } },
        { changeMode: 'direct' },
      );
    },
    applyCase: () => {
      const { editor } = makeTextEditor();
      return styleApplyWrapper(
        editor,
        { target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } }, inline: { bold: true, italic: false } },
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
    // No failureCase — align allows collapsed ranges (paragraph-level operation)
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
  'mutations.apply': {
    throwCase: () => {
      const { editor } = makeTextEditor();
      return executePlan(editor, {
        expectedRevision: '0',
        atomic: true,
        changeMode: 'direct',
        steps: [],
      });
    },
    applyCase: () => {
      const { editor } = makeTextEditor();
      return executeCompiledPlan(editor, { mutationSteps: [], assertSteps: [] }, { changeMode: 'direct' });
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
    const result = writeWrapper(
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
    const result = writeWrapper(
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
    const result = writeWrapper(
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
      { target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } }, inline: { bold: true } },
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
      if (COMMAND_CATALOG[operationId].possibleFailureCodes.length > 0) {
        expect(schema.failure).toBeDefined();
      }
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
      if (!vector.failureCase) continue;
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
    const reject = trackChangesRejectWrapper(editor, { id: requireCanonicalTrackChangeId(editor, 'tc-delete-1') });
    expect(reject.success).toBe(true);
    assertSchema('trackChanges.decide', 'output', reject);
    assertSchema('trackChanges.decide', 'success', reject);
  });
});
