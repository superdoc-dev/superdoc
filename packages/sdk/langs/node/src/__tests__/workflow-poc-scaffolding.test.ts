import { describe, expect, test } from 'bun:test';
import type { BoundDocApi, DocInfoResult } from '../generated/client.js';
import { SuperDocCliError } from '../runtime/errors.js';
import { dispatchWorkflowPocTool } from '../workflow-poc/dispatch.js';
import { buildWorkflowDocIndex } from '../workflow-poc/doc-index.js';
import { getWorkflowPocToolRegistry } from '../workflow-poc/registry.js';
import { createWorkflowNotImplementedReceipt, createWorkflowSuccessReceipt } from '../workflow-poc/receipt.js';
import { parseWorkflowTargetRequest, resolveWorkflowTargetFromUnknown } from '../workflow-poc/resolve.js';
import { createWorkflowSessionCache } from '../workflow-poc/session-cache.js';
import { WORKFLOW_POC_TOOL_NAMES } from '../workflow-poc/types.js';

type MockListSeed = {
  nodeId: string;
  listId: string;
  ref: string;
  ordinal: number;
  text: string;
  level?: number;
  kind?: 'ordered' | 'bullet';
};

type MockBlockSeed = {
  ordinal: number;
  nodeId: string;
  nodeType: 'paragraph' | 'table' | 'heading' | 'tableOfContents' | 'image' | 'listItem';
  ref: string;
  text?: string | null;
  textPreview?: string | null;
  styleId?: string | null;
  fontFamily?: string;
  fontSize?: number;
  bold?: boolean;
  color?: string;
  alignment?: string;
  headingLevel?: number;
};

type MockTrackedChangeSeed = {
  id: string;
  type: 'insert' | 'delete' | 'format';
  excerpt?: string;
  author?: string;
  date?: string;
  story?: { kind: 'story'; storyType: 'body' };
};

function createMockHandle(options?: {
  listItems?: MockListSeed[];
  blocks?: MockBlockSeed[];
  trackedChanges?: MockTrackedChangeSeed[];
}): {
  handle: BoundDocApi;
  calls: {
    infoCalls: number;
    getTextCalls: number;
    blockListCalls: Array<{ offset: number; limit: number; includeText?: boolean }>;
    listListCalls: Array<{ offset: number; limit: number }>;
    listInsertCalls: Array<{ targetNodeId?: string; position?: string; text?: string; changeMode?: string }>;
    listCreateCalls: Array<{ targetNodeIds: string[]; kind?: string; preset?: string }>;
    listDetachCalls: Array<{ nodeId?: string; targetNodeId?: string }>;
    createParagraphCalls: Array<{ text?: string; atKind?: string; targetNodeId?: string; targetNodeType?: string }>;
    createHeadingCalls: Array<{
      text?: string;
      level?: number;
      atKind?: string;
      targetNodeId?: string;
      targetNodeType?: string;
    }>;
    createTocCalls: Array<{ atKind?: string; targetNodeId?: string }>;
    createSectionBreakCalls: Array<{ atKind?: string; targetNodeId?: string; breakType?: string }>;
    createImageCalls: Array<{ src?: string; alt?: string; atKind?: string; targetNodeId?: string }>;
    blockDeleteRangeCalls: Array<{ startNodeId?: string; endNodeId?: string; force?: boolean }>;
    imageInsertCaptionCalls: Array<{ imageId?: string; text?: string }>;
    commentCreateCalls: Array<{ text?: string; targetBlockId?: string; start?: number; end?: number }>;
    commentListCalls: Array<{ includeResolved?: boolean; offset: number; limit: number }>;
    trackChangesListCalls: Array<{ offset: number; limit: number; in?: string; type?: string }>;
    trackChangesGetCalls: Array<{ id: string; storyType?: string }>;
    trackChangesDecideCalls: Array<{ decision?: string; targetScope?: string; targetId?: string }>;
    tableGetCalls: string[];
    tableSplitCalls: Array<{ nodeId?: string; rowIndex?: number }>;
    tableInsertColumnCalls: Array<{ nodeId?: string; columnIndex?: number; position?: string }>;
    tableInsertRowCalls: Array<{ nodeId?: string; rowIndex?: number; position?: string; dryRun?: boolean }>;
    tableSetCellTextCalls: Array<{ nodeId?: string; rowIndex?: number; columnIndex?: number; text?: string }>;
    formatApplyCalls: Array<{
      blockId?: string;
      start?: number;
      end?: number;
      changeMode?: string;
      inline?: Record<string, unknown>;
    }>;
    mutationApplyCalls: Array<{
      atomic?: boolean;
      changeMode?: string;
      steps?: Array<Record<string, unknown>>;
    }>;
  };
} {
  const allBlocks: MockBlockSeed[] = (
    options?.blocks ?? [
      {
        ordinal: 1,
        nodeId: 'n-1',
        nodeType: 'paragraph' as const,
        ref: 'ref:block:1',
        text: 'First paragraph has CompanyName and delete-me.',
      },
      {
        ordinal: 2,
        nodeId: 'n-2',
        nodeType: 'table' as const,
        ref: 'ref:table:1',
        textPreview: null,
      },
      {
        ordinal: 3,
        nodeId: 'n-3',
        nodeType: 'heading' as const,
        ref: 'ref:block:3',
        text: 'Title {{name}} due {{date}}',
        headingLevel: 1,
      },
    ]
  ).map((block) => ({
    ...block,
    textPreview: block.textPreview ?? (typeof block.text === 'string' ? block.text : null),
  }));

  const baseListItems =
    options?.listItems ??
    ([
      {
        nodeId: 'n-list-1',
        listId: 'list-1',
        ref: 'ref:list:1',
        ordinal: 7,
        level: 0,
        kind: 'ordered',
        text: 'List item',
      },
    ] satisfies MockListSeed[]);

  const allLists = baseListItems.map((item, index) => ({
    id: `list-item-${index + 1}`,
    handle: {
      ref: item.ref,
      refStability: 'stable' as const,
      targetKind: {},
    },
    address: {
      kind: 'block' as const,
      nodeType: 'listItem' as const,
      nodeId: item.nodeId,
    },
    listId: item.listId,
    ordinal: item.ordinal,
    level: item.level ?? 0,
    kind: (item.kind ?? 'ordered') as const,
    text: item.text,
  }));

  const calls = {
    infoCalls: 0,
    getTextCalls: 0,
    blockListCalls: [] as Array<{ offset: number; limit: number; includeText?: boolean }>,
    listListCalls: [] as Array<{ offset: number; limit: number }>,
    listInsertCalls: [] as Array<{ targetNodeId?: string; position?: string; text?: string; changeMode?: string }>,
    listCreateCalls: [] as Array<{ targetNodeIds: string[]; kind?: string; preset?: string }>,
    listDetachCalls: [] as Array<{ nodeId?: string; targetNodeId?: string }>,
    createParagraphCalls: [] as Array<{
      text?: string;
      atKind?: string;
      targetNodeId?: string;
      targetNodeType?: string;
    }>,
    createHeadingCalls: [] as Array<{
      text?: string;
      level?: number;
      atKind?: string;
      targetNodeId?: string;
      targetNodeType?: string;
    }>,
    createTocCalls: [] as Array<{ atKind?: string; targetNodeId?: string }>,
    createSectionBreakCalls: [] as Array<{ atKind?: string; targetNodeId?: string; breakType?: string }>,
    createImageCalls: [] as Array<{ src?: string; alt?: string; atKind?: string; targetNodeId?: string }>,
    blockDeleteRangeCalls: [] as Array<{ startNodeId?: string; endNodeId?: string; force?: boolean }>,
    imageInsertCaptionCalls: [] as Array<{ imageId?: string; text?: string }>,
    commentCreateCalls: [] as Array<{ text?: string; targetBlockId?: string; start?: number; end?: number }>,
    commentListCalls: [] as Array<{ includeResolved?: boolean; offset: number; limit: number }>,
    trackChangesListCalls: [] as Array<{ offset: number; limit: number; in?: string; type?: string }>,
    trackChangesGetCalls: [] as Array<{ id: string; storyType?: string }>,
    trackChangesDecideCalls: [] as Array<{ decision?: string; targetScope?: string; targetId?: string }>,
    tableGetCalls: [] as string[],
    tableSplitCalls: [] as Array<{ nodeId?: string; rowIndex?: number }>,
    tableInsertColumnCalls: [] as Array<{ nodeId?: string; columnIndex?: number; position?: string }>,
    tableInsertRowCalls: [] as Array<{ nodeId?: string; rowIndex?: number; position?: string; dryRun?: boolean }>,
    tableSetCellTextCalls: [] as Array<{ nodeId?: string; rowIndex?: number; columnIndex?: number; text?: string }>,
    formatApplyCalls: [] as Array<{
      blockId?: string;
      start?: number;
      end?: number;
      changeMode?: string;
      inline?: Record<string, unknown>;
    }>,
    mutationApplyCalls: [] as Array<{
      atomic?: boolean;
      changeMode?: string;
      steps?: Array<Record<string, unknown>>;
    }>,
  };

  let revisionCounter = 1;
  let trackedChangeCounter = 1;
  let listItemCounter = allLists.length;
  let paragraphCounter = allBlocks.length;
  let sectionCounter = 1;
  let tableCounter = 1;
  let tocCounter = 0;
  let imageCounter = 0;
  let commentCounter = 0;
  let currentRevision = `rev-${revisionCounter}`;
  const tableShapeByNodeId = new Map<string, { rows: number; columns: number }>([['n-2', { rows: 2, columns: 3 }]]);
  const tableCellTextByNodeId = new Map<string, Map<string, string>>();
  const imagesById = new Map<
    string,
    { imageId: string; nodeId: string; src: string; alt?: string; caption?: string }
  >();
  const commentsById = new Map<
    string,
    {
      id: string;
      handle: { ref: string; refStability: 'stable'; targetKind: Record<string, never> };
      address: { kind: 'entity'; entityType: 'comment'; entityId: string };
      text?: string;
      status: 'open' | 'resolved';
      target?: {
        kind: 'text';
        segments: Array<{
          blockId: string;
          range: {
            start: number;
            end: number;
          };
        }>;
      };
      anchoredText?: string;
    }
  >();
  const trackedChangesById = new Map<
    string,
    {
      id: string;
      handle: { ref: string; refStability: 'stable'; targetKind: Record<string, never> };
      address: {
        kind: 'entity';
        entityType: 'trackedChange';
        entityId: string;
        story?: { kind: 'story'; storyType: 'body' };
      };
      type: 'insert' | 'delete' | 'format';
      excerpt?: string;
      author?: string;
      date?: string;
    }
  >(
    (options?.trackedChanges ?? []).map((change) => [
      change.id,
      {
        id: change.id,
        handle: {
          ref: `ref:tracked-change:${change.id}`,
          refStability: 'stable',
          targetKind: {},
        },
        address: {
          kind: 'entity',
          entityType: 'trackedChange',
          entityId: change.id,
          story: change.story,
        },
        type: change.type,
        excerpt: change.excerpt,
        author: change.author,
        date: change.date,
      },
    ]),
  );
  const textByNodeId: Record<string, string> = Object.fromEntries(
    allBlocks.filter((block) => typeof block.text === 'string').map((block) => [block.nodeId, block.text as string]),
  );

  function bumpRevision(): void {
    revisionCounter += 1;
    currentRevision = `rev-${revisionCounter}`;
  }

  function renumberBlocks(): void {
    for (let index = 0; index < allBlocks.length; index++) {
      allBlocks[index]!.ordinal = index + 1;
    }
  }

  function resolveTableNodeId(params: { target?: { nodeId: string }; nodeId?: string }): string {
    const nodeId = params.target?.nodeId ?? params.nodeId;
    if (nodeId == null) {
      throw new Error('Missing table node id.');
    }
    return nodeId;
  }

  function resolveBlockInsertIndex(params?: {
    kind?: 'documentStart' | 'documentEnd' | 'before' | 'after';
    target?: { nodeId: string };
  }): number {
    if (params?.kind === 'documentStart') {
      return 0;
    }

    if (params?.kind === 'documentEnd' || params?.kind == null) {
      return allBlocks.length;
    }

    const targetNodeId = params.target?.nodeId;
    if (targetNodeId == null) {
      return allBlocks.length;
    }

    const targetIndex = allBlocks.findIndex((block) => block.nodeId === targetNodeId);
    if (targetIndex < 0) {
      return allBlocks.length;
    }

    return params.kind === 'before' ? targetIndex : targetIndex + 1;
  }

  function getTableText(nodeId: string): string {
    const cells = tableCellTextByNodeId.get(nodeId);
    if (cells == null) {
      return '';
    }
    return [...cells.values()].filter((value) => value.length > 0).join(' ');
  }

  function escapeRegex(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function replaceAll(source: string, find: string, replace: string, caseSensitive: boolean): string {
    if (find.length === 0) {
      return source;
    }
    if (caseSensitive) {
      return source.split(find).join(replace);
    }
    const regex = new RegExp(escapeRegex(find), 'gi');
    return source.replace(regex, replace);
  }

  function removeAll(source: string, find: string, caseSensitive: boolean): string {
    return replaceAll(source, find, '', caseSensitive);
  }

  function getDocumentText(): string {
    return allBlocks
      .map((block) => (block.nodeType === 'table' ? getTableText(block.nodeId) : (textByNodeId[block.nodeId] ?? '')))
      .filter((text) => text.length > 0)
      .join('\n');
  }

  function serializeBlock(
    block: MockBlockSeed,
    includeText: boolean | undefined,
  ): {
    ordinal: number;
    nodeId: string;
    nodeType: MockBlockSeed['nodeType'];
    textPreview: string | null;
    text?: string;
    isEmpty?: boolean;
    styleId?: string | null;
    fontFamily?: string;
    fontSize?: number;
    bold?: boolean;
    color?: string;
    alignment?: string;
    headingLevel?: number;
    ref: string;
  } {
    const text = block.nodeType === 'table' ? getTableText(block.nodeId) : textByNodeId[block.nodeId];
    const textPreview = block.textPreview ?? (typeof text === 'string' ? text : null);
    return {
      ordinal: block.ordinal,
      nodeId: block.nodeId,
      nodeType: block.nodeType,
      textPreview,
      text: includeText && typeof text === 'string' ? text : undefined,
      isEmpty: typeof text === 'string' ? text.trim().length === 0 : undefined,
      styleId: block.styleId ?? undefined,
      fontFamily: block.fontFamily,
      fontSize: block.fontSize,
      bold: block.bold,
      color: block.color,
      alignment: block.alignment,
      headingLevel: block.headingLevel,
      ref: block.ref,
    };
  }

  function normalizeHexColor(value: string): string {
    return value.replace(/^#/, '').toUpperCase();
  }

  function normalizeCommentTarget(params: {
    target?: {
      kind?: string;
      blockId?: string;
      range?: { start?: number; end?: number };
      segments?: Array<{ blockId: string; range: { start: number; end: number } }>;
    };
    blockId?: string;
    start?: number;
    end?: number;
  }):
    | {
        kind: 'text';
        segments: Array<{
          blockId: string;
          range: {
            start: number;
            end: number;
          };
        }>;
      }
    | undefined {
    if (params.target?.kind === 'text' && Array.isArray(params.target.segments) && params.target.segments.length > 0) {
      return {
        kind: 'text',
        segments: params.target.segments.map((segment) => ({
          blockId: segment.blockId,
          range: {
            start: segment.range.start,
            end: segment.range.end,
          },
        })),
      };
    }

    if (params.target?.kind === 'text' && typeof params.target.blockId === 'string') {
      return {
        kind: 'text',
        segments: [
          {
            blockId: params.target.blockId,
            range: {
              start: params.target.range?.start ?? 0,
              end: params.target.range?.end ?? 0,
            },
          },
        ],
      };
    }

    if (typeof params.blockId === 'string') {
      return {
        kind: 'text',
        segments: [
          {
            blockId: params.blockId,
            range: {
              start: params.start ?? 0,
              end: params.end ?? 0,
            },
          },
        ],
      };
    }

    return undefined;
  }

  function registerTrackedChange(change: {
    id?: string;
    type: 'insert' | 'delete' | 'format';
    excerpt?: string;
    author?: string;
    date?: string;
    story?: { kind: 'story'; storyType: 'body' };
  }): { kind: 'entity'; entityType: 'trackedChange'; entityId: string; story?: { kind: 'story'; storyType: 'body' } } {
    const entityId = change.id ?? `tc-${trackedChangeCounter++}`;
    trackedChangesById.set(entityId, {
      id: entityId,
      handle: {
        ref: `ref:tracked-change:${entityId}`,
        refStability: 'stable',
        targetKind: {},
      },
      address: {
        kind: 'entity',
        entityType: 'trackedChange',
        entityId,
        story: change.story,
      },
      type: change.type,
      excerpt: change.excerpt,
      author: change.author,
      date: change.date,
    });
    return {
      kind: 'entity',
      entityType: 'trackedChange',
      entityId,
      story: change.story,
    };
  }

  function applyMutationStep(step: Record<string, unknown>): void {
    const op = typeof step.op === 'string' ? step.op : '';
    const where = step.where as Record<string, unknown> | undefined;
    const args = step.args as Record<string, unknown> | undefined;
    const by = typeof where?.by === 'string' ? where.by : '';

    if (op === 'text.rewrite' && by === 'select') {
      const select = where?.select as Record<string, unknown> | undefined;
      const pattern = typeof select?.pattern === 'string' ? select.pattern : undefined;
      const caseSensitive = select?.caseSensitive === true;
      const replacement = (args?.replacement as Record<string, unknown> | undefined)?.text;
      if (pattern == null || typeof replacement !== 'string') {
        return;
      }
      for (const key of Object.keys(textByNodeId)) {
        textByNodeId[key] = replaceAll(textByNodeId[key] ?? '', pattern, replacement, caseSensitive);
      }
      return;
    }

    if (op === 'text.rewrite' && by === 'block') {
      const nodeId = typeof where?.nodeId === 'string' ? where.nodeId : undefined;
      const replacement = (args?.replacement as Record<string, unknown> | undefined)?.text;
      if (nodeId == null || typeof replacement !== 'string') {
        return;
      }
      const cellMatch = /^cell:(.+):(\d+):(\d+)$/.exec(nodeId);
      if (cellMatch != null) {
        const [, tableNodeId, rowRaw, columnRaw] = cellMatch;
        const existing = tableCellTextByNodeId.get(tableNodeId!) ?? new Map<string, string>();
        existing.set(`${rowRaw}:${columnRaw}`, replacement);
        tableCellTextByNodeId.set(tableNodeId!, existing);
      }
      textByNodeId[nodeId] = replacement;
      return;
    }

    if (op === 'text.delete' && by === 'select') {
      const select = where?.select as Record<string, unknown> | undefined;
      const pattern = typeof select?.pattern === 'string' ? select.pattern : undefined;
      const caseSensitive = select?.caseSensitive === true;
      if (pattern == null) {
        return;
      }
      for (const key of Object.keys(textByNodeId)) {
        textByNodeId[key] = removeAll(textByNodeId[key] ?? '', pattern, caseSensitive);
      }
      return;
    }

    if (op === 'text.delete' && by === 'block') {
      const nodeId = typeof where?.nodeId === 'string' ? where.nodeId : undefined;
      if (nodeId == null) {
        return;
      }
      textByNodeId[nodeId] = '';
    }
  }

  const handle = {
    getText: async () => {
      calls.getTextCalls += 1;
      return getDocumentText();
    },
    extract: async () => {
      const blocks = allBlocks.flatMap((block) => {
        if (block.nodeType !== 'table') {
          return [];
        }
        const tableOrdinal = allBlocks
          .filter((entry) => entry.nodeType === 'table')
          .findIndex((entry) => entry.nodeId === block.nodeId);
        const shape = tableShapeByNodeId.get(block.nodeId);
        if (shape == null) {
          return [];
        }
        const cells: Array<{
          nodeId: string;
          type: 'paragraph';
          text: string;
          tableContext: { tableOrdinal: number; rowIndex: number; columnIndex: number };
        }> = [];
        for (let rowIndex = 0; rowIndex < shape.rows; rowIndex++) {
          for (let columnIndex = 0; columnIndex < shape.columns; columnIndex++) {
            const nodeId = `cell:${block.nodeId}:${rowIndex}:${columnIndex}`;
            cells.push({
              nodeId,
              type: 'paragraph',
              text: textByNodeId[nodeId] ?? '',
              tableContext: { tableOrdinal, rowIndex, columnIndex },
            });
          }
        }
        return cells;
      });
      return { blocks };
    },
    info: async () => {
      calls.infoCalls += 1;
      const uniqueListIds = new Set(allLists.map((item) => item.listId)).size;
      const paragraphCount = allBlocks.filter((block) => block.nodeType === 'paragraph').length;
      const headingCount = allBlocks.filter((block) => block.nodeType === 'heading').length;
      const tableCount = allBlocks.filter((block) => block.nodeType === 'table').length;
      return {
        counts: {
          words: 42,
          characters: 190,
          paragraphs: paragraphCount,
          headings: headingCount,
          tables: tableCount,
          images: imagesById.size,
          comments: commentsById.size,
          trackedChanges: trackedChangesById.size,
          sdtFields: 0,
          lists: uniqueListIds,
        },
        outline: allBlocks
          .filter((block) => block.nodeType === 'heading')
          .map((block) => ({
            level: block.headingLevel ?? 1,
            text: textByNodeId[block.nodeId] ?? block.textPreview ?? '',
            nodeId: block.nodeId,
          })),
        capabilities: {
          canFind: true,
          canGetNode: true,
          canComment: true,
          canReplace: true,
        },
        revision: currentRevision,
      } satisfies DocInfoResult;
    },
    create: {
      paragraph: async (params: {
        text?: string;
        at?: {
          kind?: 'documentStart' | 'documentEnd' | 'before' | 'after';
          target?: { nodeId: string; nodeType?: string };
        };
      }) => {
        const text = typeof params.text === 'string' ? params.text : '';
        const atKind = params.at?.kind;
        const targetNodeId = params.at?.target?.nodeId;
        const targetNodeType = params.at?.target?.nodeType;
        calls.createParagraphCalls.push({ text, atKind, targetNodeId, targetNodeType });

        paragraphCounter += 1;
        const nodeId = `n-p-${paragraphCounter}`;
        const newBlock = {
          ordinal: allBlocks.length + 1,
          nodeId,
          nodeType: 'paragraph' as const,
          ref: `ref:block:${paragraphCounter}`,
          textPreview: text.length > 0 ? text : null,
        };

        const insertIndex = resolveBlockInsertIndex(params.at);
        allBlocks.splice(insertIndex, 0, newBlock);
        renumberBlocks();
        textByNodeId[nodeId] = text;
        if (targetNodeType === 'listItem' && targetNodeId != null) {
          const targetListIndex = allLists.findIndex((item) => item.address.nodeId === targetNodeId);
          const targetList = allLists[targetListIndex];
          if (targetList != null) {
            listItemCounter += 1;
            allLists.splice(targetListIndex < 0 ? allLists.length : targetListIndex, 0, {
              id: `list-item-${listItemCounter}`,
              handle: {
                ref: `ref:list:${targetList.listId}:${listItemCounter}`,
                refStability: 'stable' as const,
                targetKind: {},
              },
              address: {
                kind: 'block' as const,
                nodeType: 'listItem' as const,
                nodeId,
              },
              listId: targetList.listId,
              ordinal: targetList.ordinal,
              level: targetList.level,
              kind: targetList.kind,
              text,
            });
          }
        }
        bumpRevision();

        return {
          success: true as const,
          paragraph: {
            kind: 'block' as const,
            nodeType: 'paragraph' as const,
            nodeId,
          },
          insertionPoint: {
            kind: 'text' as const,
            blockId: nodeId,
            range: {
              start: 0,
              end: text.length,
            },
          },
        };
      },
      heading: async (params: {
        text?: string;
        level?: number;
        at?: {
          kind?: 'documentStart' | 'documentEnd' | 'before' | 'after';
          target?: { nodeId: string; nodeType?: string };
        };
      }) => {
        const text = typeof params.text === 'string' ? params.text : '';
        const atKind = params.at?.kind;
        const targetNodeId = params.at?.target?.nodeId;
        const targetNodeType = params.at?.target?.nodeType;
        calls.createHeadingCalls.push({ text, level: params.level, atKind, targetNodeId, targetNodeType });

        paragraphCounter += 1;
        const nodeId = `n-h-${paragraphCounter}`;
        const newBlock = {
          ordinal: allBlocks.length + 1,
          nodeId,
          nodeType: 'heading' as const,
          ref: `ref:block:${paragraphCounter}`,
          textPreview: text.length > 0 ? text : null,
          headingLevel: params.level ?? 1,
        };

        const insertIndex = resolveBlockInsertIndex(params.at);
        allBlocks.splice(insertIndex, 0, newBlock);
        renumberBlocks();
        textByNodeId[nodeId] = text;
        if (targetNodeType === 'listItem' && targetNodeId != null) {
          const targetListIndex = allLists.findIndex((item) => item.address.nodeId === targetNodeId);
          const targetList = allLists[targetListIndex];
          if (targetList != null) {
            listItemCounter += 1;
            allLists.splice(targetListIndex < 0 ? allLists.length : targetListIndex, 0, {
              id: `list-item-${listItemCounter}`,
              handle: {
                ref: `ref:list:${targetList.listId}:${listItemCounter}`,
                refStability: 'stable' as const,
                targetKind: {},
              },
              address: {
                kind: 'block' as const,
                nodeType: 'listItem' as const,
                nodeId,
              },
              listId: targetList.listId,
              ordinal: targetList.ordinal,
              level: targetList.level,
              kind: targetList.kind,
              text,
            });
          }
        }
        bumpRevision();

        return {
          success: true as const,
          heading: {
            kind: 'block' as const,
            nodeType: 'heading' as const,
            nodeId,
          },
          insertionPoint: {
            kind: 'text' as const,
            blockId: nodeId,
            range: {
              start: 0,
              end: text.length,
            },
          },
        };
      },
      tableOfContents: async (params: {
        at?: { kind?: 'documentStart' | 'documentEnd' | 'before' | 'after'; target?: { nodeId: string } };
      }) => {
        const atKind = params.at?.kind;
        const targetNodeId = params.at?.target?.nodeId;
        calls.createTocCalls.push({ atKind, targetNodeId });

        tocCounter += 1;
        const nodeId = `n-toc-${tocCounter}`;
        const newBlock = {
          ordinal: allBlocks.length + 1,
          nodeId,
          nodeType: 'tableOfContents' as const,
          ref: `ref:toc:${tocCounter}`,
          textPreview: null,
        };

        const insertIndex = resolveBlockInsertIndex(params.at);
        allBlocks.splice(insertIndex, 0, newBlock);
        renumberBlocks();
        bumpRevision();

        return {
          success: true as const,
          toc: {
            kind: 'block' as const,
            nodeType: 'tableOfContents' as const,
            nodeId,
          },
        };
      },
      sectionBreak: async (params: {
        at?: { kind?: 'documentStart' | 'documentEnd' | 'before' | 'after'; target?: { nodeId: string } };
        breakType?: string;
      }) => {
        const atKind = params.at?.kind;
        const targetNodeId = params.at?.target?.nodeId;
        calls.createSectionBreakCalls.push({ atKind, targetNodeId, breakType: params.breakType });

        sectionCounter += 1;
        bumpRevision();

        return {
          success: true as const,
          section: {
            kind: 'section' as const,
            sectionId: `section-${sectionCounter}`,
          },
        };
      },
      image: async (params: {
        src: string;
        alt?: string;
        at?: { kind?: 'documentStart' | 'documentEnd' | 'before' | 'after'; target?: { nodeId: string } };
      }) => {
        const atKind = params.at?.kind;
        const targetNodeId = params.at?.target?.nodeId;
        calls.createImageCalls.push({
          src: params.src,
          alt: params.alt,
          atKind,
          targetNodeId,
        });

        imageCounter += 1;
        const nodeId = `n-img-${imageCounter}`;
        const imageId = `img-${imageCounter}`;
        const newBlock = {
          ordinal: allBlocks.length + 1,
          nodeId,
          nodeType: 'image' as const,
          ref: `ref:image:${imageCounter}`,
          textPreview: null,
        };

        const insertIndex = resolveBlockInsertIndex(params.at);
        allBlocks.splice(insertIndex, 0, newBlock);
        renumberBlocks();
        imagesById.set(imageId, {
          imageId,
          nodeId,
          src: params.src,
          alt: params.alt,
        });
        bumpRevision();

        return {
          success: true as const,
          image: {
            imageId,
            sdImageId: imageId,
            nodeId,
            src: params.src,
            alt: params.alt,
          },
        };
      },
    },
    blocks: {
      list: async (params: { offset?: number; limit?: number; includeText?: boolean } = {}) => {
        const offset = params.offset ?? 0;
        const limit = params.limit ?? 50;
        calls.blockListCalls.push({ offset, limit, includeText: params.includeText });
        return {
          total: allBlocks.length,
          blocks: allBlocks.slice(offset, offset + limit).map((block) => serializeBlock(block, params.includeText)),
          revision: currentRevision,
        };
      },
      deleteRange: async (params: { start?: { nodeId?: string }; end?: { nodeId?: string }; force?: boolean }) => {
        const startNodeId = params.start?.nodeId;
        const endNodeId = params.end?.nodeId;
        calls.blockDeleteRangeCalls.push({ startNodeId, endNodeId, force: params.force });
        const startIndex = allBlocks.findIndex((block) => block.nodeId === startNodeId);
        const endIndex = allBlocks.findIndex((block) => block.nodeId === endNodeId);
        if (startIndex < 0 || endIndex < startIndex) {
          throw new Error('Invalid deleteRange target.');
        }

        const deletedBlocks = allBlocks.splice(startIndex, endIndex - startIndex + 1);
        for (const block of deletedBlocks) {
          delete textByNodeId[block.nodeId];
        }
        renumberBlocks();
        bumpRevision();

        return {
          success: true as const,
          deletedCount: deletedBlocks.length,
          deletedBlocks,
          revision: {
            before: `rev-${revisionCounter - 1}`,
            after: currentRevision,
          },
          dryRun: false,
        };
      },
    },
    comments: {
      create: async (params: {
        text?: string;
        target?: {
          kind?: string;
          blockId?: string;
          range?: { start?: number; end?: number };
          segments?: Array<{ blockId: string; range: { start: number; end: number } }>;
        };
        blockId?: string;
        start?: number;
        end?: number;
      }) => {
        const target = normalizeCommentTarget(params);
        if (target == null) {
          throw new Error('Missing comment target.');
        }

        const primary = target.segments[0];
        calls.commentCreateCalls.push({
          text: params.text,
          targetBlockId: primary?.blockId,
          start: primary?.range.start,
          end: primary?.range.end,
        });

        commentCounter += 1;
        const commentId = `comment-${commentCounter}`;
        const commentText = typeof params.text === 'string' ? params.text : '';
        const anchoredText = target.segments
          .map((segment) => {
            const text = textByNodeId[segment.blockId] ?? '';
            return text.slice(segment.range.start, segment.range.end);
          })
          .join('');

        commentsById.set(commentId, {
          id: commentId,
          handle: {
            ref: `ref:comment:${commentCounter}`,
            refStability: 'stable',
            targetKind: {},
          },
          address: {
            kind: 'entity',
            entityType: 'comment',
            entityId: commentId,
          },
          text: commentText,
          status: 'open',
          target,
          anchoredText,
        });
        bumpRevision();

        return {
          success: true as const,
          inserted: [
            {
              kind: 'entity' as const,
              entityType: 'comment' as const,
              entityId: commentId,
            },
          ],
        };
      },
      list: async (params: { includeResolved?: boolean; offset?: number; limit?: number } = {}) => {
        const offset = params.offset ?? 0;
        const limit = params.limit ?? 50;
        calls.commentListCalls.push({ includeResolved: params.includeResolved, offset, limit });
        const comments = [...commentsById.values()].filter((comment) =>
          params.includeResolved === true ? true : comment.status !== 'resolved',
        );
        return {
          evaluatedRevision: currentRevision,
          total: comments.length,
          items: comments.slice(offset, offset + limit),
          page: {
            limit,
            offset,
            returned: Math.max(0, Math.min(limit, comments.length - offset)),
          },
        };
      },
    },
    trackChanges: {
      list: async (params: { offset?: number; limit?: number; in?: string; type?: string } = {}) => {
        const offset = params.offset ?? 0;
        const limit = params.limit ?? 50;
        calls.trackChangesListCalls.push({ offset, limit, in: params.in, type: params.type });

        const listed = [...trackedChangesById.values()].filter((change) => {
          if (params.type != null && change.type !== params.type) {
            return false;
          }
          if (params.in == null || params.in === 'all') {
            return true;
          }
          return change.address.story?.storyType === params.in.storyType;
        });

        return {
          evaluatedRevision: currentRevision,
          total: listed.length,
          items: listed.slice(offset, offset + limit),
          page: {
            limit,
            offset,
            returned: Math.max(0, Math.min(limit, listed.length - offset)),
          },
        };
      },
      get: async (params: { id: string; story?: { kind: 'story'; storyType: 'body' } }) => {
        calls.trackChangesGetCalls.push({ id: params.id, storyType: params.story?.storyType });
        const change = trackedChangesById.get(params.id);
        if (change == null) {
          throw new Error(`Unknown tracked change: ${params.id}`);
        }
        if (params.story != null && change.address.story?.storyType !== params.story.storyType) {
          throw new Error(`Tracked change story mismatch: ${params.id}`);
        }
        return change;
      },
      decide: async (params: {
        decision?: string;
        target: { scope: 'all' } | { id: string; story?: { kind: 'story'; storyType: 'body' } };
      }) => {
        calls.trackChangesDecideCalls.push({
          decision: params.decision,
          targetScope: 'scope' in params.target ? params.target.scope : undefined,
          targetId: 'id' in params.target ? params.target.id : undefined,
        });

        const removedIds =
          'scope' in params.target
            ? [...trackedChangesById.keys()]
            : trackedChangesById.has(params.target.id)
              ? [params.target.id]
              : [];

        const removed = removedIds.flatMap((id) => {
          const change = trackedChangesById.get(id);
          if (change == null) {
            return [];
          }
          trackedChangesById.delete(id);
          return [change.address];
        });

        if (removed.length > 0) {
          bumpRevision();
        }

        return {
          success: true as const,
          removed,
        };
      },
    },
    lists: {
      list: async (params: { offset?: number; limit?: number } = {}) => {
        const offset = params.offset ?? 0;
        const limit = params.limit ?? 50;
        calls.listListCalls.push({ offset, limit });
        return {
          evaluatedRevision: currentRevision,
          total: allLists.length,
          items: allLists.slice(offset, offset + limit),
          page: {
            limit,
            offset,
            returned: Math.max(0, Math.min(limit, allLists.length - offset)),
          },
        };
      },
      create: async (params: {
        target?:
          | { kind?: 'block'; nodeType?: 'paragraph'; nodeId: string }
          | {
              from: { kind?: 'block'; nodeType?: 'paragraph'; nodeId: string };
              to: { kind?: 'block'; nodeType?: 'paragraph'; nodeId: string };
            };
        kind?: string;
        preset?: string;
      }) => {
        const fromNodeId = 'from' in (params.target ?? {}) ? params.target?.from.nodeId : params.target?.nodeId;
        const toNodeId = 'to' in (params.target ?? {}) ? params.target?.to.nodeId : fromNodeId;
        const fromIndex = allBlocks.findIndex((block) => block.nodeId === fromNodeId);
        const toIndex = allBlocks.findIndex((block) => block.nodeId === toNodeId);
        if (fromNodeId == null || toNodeId == null || fromIndex < 0 || toIndex < fromIndex) {
          throw new Error('Invalid list create target.');
        }

        const targetBlocks = allBlocks.slice(fromIndex, toIndex + 1).filter((block) => block.nodeType === 'paragraph');
        const listId = `list-created-${allLists.length + 1}`;
        calls.listCreateCalls.push({
          targetNodeIds: targetBlocks.map((block) => block.nodeId),
          kind: params.kind,
          preset: params.preset,
        });

        for (const block of targetBlocks) {
          block.nodeType = 'listItem';
          listItemCounter += 1;
          allLists.push({
            id: `list-item-${listItemCounter}`,
            handle: {
              ref: `ref:list:${listId}:${listItemCounter}`,
              refStability: 'stable' as const,
              targetKind: {},
            },
            address: {
              kind: 'block' as const,
              nodeType: 'listItem' as const,
              nodeId: block.nodeId,
            },
            listId,
            ordinal: allLists.length + 1,
            level: 0,
            kind: params.kind === 'bullet' ? 'bullet' : 'ordered',
            text: textByNodeId[block.nodeId] ?? '',
          });
        }

        bumpRevision();

        const first = targetBlocks[0];
        return {
          success: true as const,
          listId,
          item: {
            kind: 'block' as const,
            nodeType: 'listItem' as const,
            nodeId: first?.nodeId ?? fromNodeId,
          },
        };
      },
      detach: async (params: { nodeId?: string; target?: { nodeId?: string } }) => {
        const nodeId = params.nodeId ?? params.target?.nodeId;
        calls.listDetachCalls.push({ nodeId: params.nodeId, targetNodeId: params.target?.nodeId });
        const index = allLists.findIndex((item) => item.address.nodeId === nodeId);
        if (index >= 0) {
          allLists.splice(index, 1);
          bumpRevision();
        }
        return {
          success: true as const,
          paragraph: {
            kind: 'block' as const,
            nodeType: 'paragraph' as const,
            nodeId: nodeId ?? '',
          },
        };
      },
      insert: async (params: {
        target?: { kind: 'block'; nodeType: 'listItem'; nodeId: string };
        position?: string;
        text?: string;
        changeMode?: string;
      }) => {
        const targetNodeId = params.target?.nodeId;
        const position = params.position === 'before' ? 'before' : 'after';
        const text = typeof params.text === 'string' ? params.text : '';
        calls.listInsertCalls.push({
          targetNodeId,
          position,
          text,
          changeMode: params.changeMode,
        });

        const targetIndex = allLists.findIndex((item) => item.address.nodeId === targetNodeId);
        if (targetIndex < 0) {
          throw new Error(`Unknown list target node: ${targetNodeId}`);
        }

        listItemCounter += 1;
        const newNodeId = `n-list-${listItemCounter}`;
        const listId = allLists[targetIndex]?.listId ?? 'list-unknown';
        const nextOrdinal =
          allLists.reduce((max, item) => (typeof item.ordinal === 'number' ? Math.max(max, item.ordinal) : max), 0) + 1;

        const inserted = {
          id: `list-item-${listItemCounter}`,
          handle: {
            ref: `ref:list:${listId}:${listItemCounter}`,
            refStability: 'stable' as const,
            targetKind: {},
          },
          address: {
            kind: 'block' as const,
            nodeType: 'listItem' as const,
            nodeId: newNodeId,
          },
          listId,
          ordinal: nextOrdinal,
          level: allLists[targetIndex]?.level ?? 0,
          kind: allLists[targetIndex]?.kind ?? ('ordered' as const),
          text,
        };

        const insertionIndex = position === 'before' ? targetIndex : targetIndex + 1;
        allLists.splice(insertionIndex, 0, inserted);

        const trackedChangeRefs =
          params.changeMode === 'tracked'
            ? [
                registerTrackedChange({
                  type: 'insert',
                  excerpt: text,
                }),
              ]
            : undefined;

        bumpRevision();

        return {
          success: true as const,
          item: inserted.address,
          insertionPoint: {
            kind: 'text' as const,
            blockId: newNodeId,
            range: {
              start: 0,
              end: text.length,
            },
          },
          trackedChangeRefs,
        };
      },
    },
    images: {
      insertCaption: async (params: { imageId?: string; text?: string }) => {
        calls.imageInsertCaptionCalls.push({
          imageId: params.imageId,
          text: params.text,
        });

        const imageId = params.imageId ?? '';
        const image = imagesById.get(imageId);
        if (image == null) {
          throw new Error(`Unknown image id: ${imageId}`);
        }

        image.caption = typeof params.text === 'string' ? params.text : '';
        bumpRevision();

        return {
          success: true as const,
          image: {
            imageId: image.imageId,
            sdImageId: image.imageId,
            nodeId: image.nodeId,
            caption: image.caption,
          },
        };
      },
    },
    tables: {
      get: async (params: { nodeId?: string }) => {
        const nodeId = params.nodeId ?? '';
        calls.tableGetCalls.push(nodeId);
        const shape = tableShapeByNodeId.get(nodeId);
        if (shape == null) {
          throw new Error(`Unknown table node: ${nodeId}`);
        }
        return {
          nodeId,
          address: { kind: 'block' as const, nodeType: 'table' as const, nodeId },
          rows: shape.rows,
          columns: shape.columns,
        };
      },
      split: async (params: { target?: { nodeId: string }; nodeId?: string; rowIndex?: number }) => {
        const nodeId = resolveTableNodeId(params);
        const rowIndex = typeof params.rowIndex === 'number' ? params.rowIndex : undefined;
        calls.tableSplitCalls.push({ nodeId, rowIndex });

        const sourceShape = tableShapeByNodeId.get(nodeId);
        if (sourceShape == null) {
          throw new Error(`Unknown table node: ${nodeId}`);
        }

        tableCounter += 1;
        const splitNodeId = `n-table-${tableCounter}`;
        const splitRef = `ref:table:${tableCounter}`;
        const splitIndex = allBlocks.findIndex((block) => block.nodeId === nodeId);
        if (splitIndex < 0) {
          throw new Error(`Unknown table block node: ${nodeId}`);
        }

        const insertedRows = Math.max(1, sourceShape.rows - (rowIndex ?? 0));
        tableShapeByNodeId.set(splitNodeId, {
          rows: insertedRows,
          columns: sourceShape.columns,
        });
        allBlocks.splice(splitIndex + 1, 0, {
          ordinal: allBlocks.length + 1,
          nodeId: splitNodeId,
          nodeType: 'table',
          ref: splitRef,
          textPreview: null,
        });
        renumberBlocks();
        bumpRevision();

        return {
          success: true as const,
          table: {
            kind: 'block' as const,
            nodeType: 'table' as const,
            nodeId: splitNodeId,
          },
        };
      },
      insertColumn: async (params: {
        target?: { nodeId: string };
        nodeId?: string;
        columnIndex?: number;
        position?: string;
      }) => {
        const nodeId = resolveTableNodeId(params);
        calls.tableInsertColumnCalls.push({
          nodeId,
          columnIndex: params.columnIndex,
          position: params.position,
        });

        const shape = tableShapeByNodeId.get(nodeId);
        if (shape == null) {
          throw new Error(`Unknown table node: ${nodeId}`);
        }
        shape.columns += 1;
        bumpRevision();

        return {
          success: true as const,
          table: {
            kind: 'block' as const,
            nodeType: 'table' as const,
            nodeId,
          },
        };
      },
      insertRow: async (params: {
        target?: { nodeId: string };
        nodeId?: string;
        rowIndex?: number;
        position?: string;
        dryRun?: boolean;
      }) => {
        const nodeId = resolveTableNodeId(params);
        const dryRun = params.dryRun === true;
        calls.tableInsertRowCalls.push({
          nodeId,
          rowIndex: params.rowIndex,
          position: params.position,
          dryRun,
        });

        const shape = tableShapeByNodeId.get(nodeId);
        if (shape == null) {
          throw new Error(`Unknown table node: ${nodeId}`);
        }
        if (!dryRun) {
          shape.rows += 1;
          bumpRevision();
        }

        return {
          success: true as const,
          table: {
            kind: 'block' as const,
            nodeType: 'table' as const,
            nodeId,
          },
        };
      },
      setCellText: async (params: {
        target?: { nodeId: string };
        nodeId?: string;
        rowIndex?: number;
        columnIndex?: number;
        text?: string;
      }) => {
        const nodeId = resolveTableNodeId(params);
        const rowIndex = typeof params.rowIndex === 'number' ? params.rowIndex : undefined;
        const columnIndex = typeof params.columnIndex === 'number' ? params.columnIndex : undefined;
        const text = typeof params.text === 'string' ? params.text : '';
        calls.tableSetCellTextCalls.push({ nodeId, rowIndex, columnIndex, text });

        const existing = tableCellTextByNodeId.get(nodeId) ?? new Map<string, string>();
        const key = `${rowIndex ?? -1}:${columnIndex ?? -1}`;
        existing.set(key, text);
        tableCellTextByNodeId.set(nodeId, existing);
        bumpRevision();

        return {
          success: true as const,
          table: {
            kind: 'block' as const,
            nodeType: 'table' as const,
            nodeId,
          },
        };
      },
    },
    format: {
      apply: async (params: {
        target?: { kind?: 'text'; blockId?: string; range?: { start?: number; end?: number } };
        blockId?: string;
        start?: number;
        end?: number;
        changeMode?: string;
        inline?: Record<string, unknown>;
      }) => {
        const blockId = params.target?.blockId ?? params.blockId;
        const start = params.target?.range?.start ?? params.start ?? 0;
        const end = params.target?.range?.end ?? params.end ?? 0;
        calls.formatApplyCalls.push({
          blockId,
          start,
          end,
          changeMode: params.changeMode,
          inline: params.inline,
        });

        if (blockId == null) {
          throw new Error('Missing format target block id.');
        }

        const block = allBlocks.find((entry) => entry.nodeId === blockId);
        if (block == null) {
          throw new Error(`Unknown format target block: ${blockId}`);
        }

        const text = textByNodeId[blockId] ?? '';
        const before = currentRevision;
        const rawColor = typeof params.inline?.color === 'string' ? params.inline.color : undefined;
        if (rawColor != null) {
          block.color = normalizeHexColor(rawColor);
        }

        const inserted =
          params.changeMode === 'tracked'
            ? [
                registerTrackedChange({
                  type: 'format',
                  excerpt: text.slice(start, end),
                }),
              ]
            : undefined;

        bumpRevision();
        return {
          success: true as const,
          resolution: {
            requestedTarget: {
              kind: 'text' as const,
              blockId,
              range: { start, end },
            },
            target: {
              kind: 'text' as const,
              blockId,
              range: { start, end },
            },
            range: {
              from: start,
              to: end,
            },
            text: text.slice(start, end),
          },
          inserted,
          revision: {
            before,
            after: currentRevision,
          },
        };
      },
    },
    mutations: {
      apply: async (params: { atomic?: boolean; changeMode?: string; steps?: Array<Record<string, unknown>> }) => {
        calls.mutationApplyCalls.push({
          atomic: params.atomic,
          changeMode: params.changeMode,
          steps: params.steps,
        });
        const before = currentRevision;
        for (const step of params.steps ?? []) {
          applyMutationStep(step);
        }
        bumpRevision();
        return {
          success: true as const,
          revision: {
            before,
            after: currentRevision,
          },
          steps: params.steps ?? [],
          timing: { totalMs: 1 },
        };
      },
    },
  } as unknown as BoundDocApi;

  return { handle, calls };
}

describe('workflow-poc session cache + doc index', () => {
  test('stores state by handle identity and caches indexes by revision', async () => {
    const { handle } = createMockHandle();
    const otherHandle = {} as BoundDocApi;
    const cache = createWorkflowSessionCache();

    const stateA = cache.getState(handle);
    const stateASecond = cache.getState(handle);
    const stateB = cache.getState(otherHandle);

    expect(stateA.documentKey).toBe(stateASecond.documentKey);
    expect(stateA.documentKey).not.toBe(stateB.documentKey);

    const index = await buildWorkflowDocIndex({
      documentHandle: handle,
      documentKey: stateA.documentKey,
      pageLimit: 2,
    });

    cache.setCachedIndex(handle, index);
    expect(cache.getCachedIndex(handle, index.revision)).toBe(index);
  });

  test('builds a compact deterministic index from info/blocks/lists/tables', async () => {
    const { handle, calls } = createMockHandle();
    const index = await buildWorkflowDocIndex({
      documentHandle: handle,
      documentKey: 'workflow-doc-test',
      pageLimit: 2,
    });

    expect(index.revision).toBe('rev-1');
    expect(index.blocks.length).toBe(3);
    expect(index.lists.length).toBe(1);
    expect(index.tables.length).toBe(1);
    expect(index.tables[0]?.rows).toBe(2);
    expect(index.tables[0]?.columns).toBe(3);
    expect(index.lookup.byBlockOrdinal.get(2)?.nodeId).toBe('n-2');
    expect(index.lookup.byListOrdinal.get(7)?.[0]?.nodeId).toBe('n-list-1');
    expect(index.lookup.byTableOrdinal.get(1)?.nodeId).toBe('n-2');
    expect(calls.blockListCalls[0]?.includeText).toBe(false);
  });
});

describe('workflow-poc deterministic resolver', () => {
  test('parses and resolves explicit ref / nodeId / ordinals', async () => {
    const { handle } = createMockHandle();
    const index = await buildWorkflowDocIndex({
      documentHandle: handle,
      documentKey: 'workflow-doc-test',
      pageLimit: 2,
    });

    const parsed = parseWorkflowTargetRequest('ref:list:1');
    expect('ok' in parsed && parsed.ok === false).toBe(false);

    const byRef = resolveWorkflowTargetFromUnknown(index, 'ref:table:1');
    expect(byRef.ok).toBe(true);
    if (!byRef.ok) return;
    expect(byRef.target.nodeId).toBe('n-2');

    const byNodeId = resolveWorkflowTargetFromUnknown(index, { nodeId: 'n-3' });
    expect(byNodeId.ok).toBe(true);
    if (!byNodeId.ok) return;
    expect(byNodeId.target.blockOrdinal).toBe(3);

    const byBlockOrdinal = resolveWorkflowTargetFromUnknown(index, { blockOrdinal: 1 });
    expect(byBlockOrdinal.ok).toBe(true);
    if (!byBlockOrdinal.ok) return;
    expect(byBlockOrdinal.target.nodeId).toBe('n-1');

    const byListOrdinal = resolveWorkflowTargetFromUnknown(index, { listOrdinal: 7 });
    expect(byListOrdinal.ok).toBe(true);
    if (!byListOrdinal.ok) return;
    expect(byListOrdinal.target.nodeId).toBe('n-list-1');

    const byTableOrdinal = resolveWorkflowTargetFromUnknown(index, { tableOrdinal: 1 });
    expect(byTableOrdinal.ok).toBe(true);
    if (!byTableOrdinal.ok) return;
    expect(byTableOrdinal.target.nodeId).toBe('n-2');
  });

  test('returns structured failure for unsupported shape', async () => {
    const { handle } = createMockHandle();
    const index = await buildWorkflowDocIndex({
      documentHandle: handle,
      documentKey: 'workflow-doc-test',
      pageLimit: 2,
    });

    const result = resolveWorkflowTargetFromUnknown(index, { nodeId: 'n-1', blockOrdinal: 1 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('TARGET_UNSUPPORTED');
  });
});

describe('workflow-poc registry + receipts', () => {
  test('registry covers every workflow tool and superdoc_context returns deterministic overview', async () => {
    const { handle } = createMockHandle();
    const registry = getWorkflowPocToolRegistry();

    expect(registry.size).toBe(WORKFLOW_POC_TOOL_NAMES.length);
    for (const toolName of WORKFLOW_POC_TOOL_NAMES) {
      expect(registry.has(toolName)).toBe(true);
    }

    const contextEntry = registry.get('superdoc_context');
    expect(contextEntry).toBeDefined();
    if (contextEntry == null) return;

    const result = await contextEntry.run({ documentHandle: handle, args: { verify: true } });
    expect(result.receipt.status).toBe('success');
    expect(result.receipt.phase).toBe('verify');
    expect(result.receipt.index.revision).toBe('rev-1');

    const output = result.output as {
      execution?: {
        mode?: string;
        revision?: string;
        topBlocks?: Array<{ ordinal?: number; nodeId?: string; nodeType?: string }>;
        tables?: Array<{ tableOrdinal?: number; nodeId?: string; rows?: number; columns?: number }>;
        lists?: Array<{ listId?: string; itemCount?: number }>;
        semanticSnippets?: Array<{ nodeId?: string; textPreview?: string }>;
      };
      verification?: {
        requested?: boolean;
        revision?: string;
        fingerprint?: { firstBlock?: string };
      };
    };

    expect(output.execution?.mode).toBe('overview');
    expect(output.execution?.revision).toBe('rev-1');
    expect(output.execution?.topBlocks?.[0]?.ordinal).toBe(1);
    expect(output.execution?.topBlocks?.[0]?.nodeId).toBe('n-1');
    expect(output.execution?.topBlocks?.[0]?.nodeType).toBe('paragraph');
    expect(output.execution?.tables?.[0]?.tableOrdinal).toBe(1);
    expect(output.execution?.tables?.[0]?.rows).toBe(2);
    expect(output.execution?.tables?.[0]?.columns).toBe(3);
    expect(output.execution?.lists?.[0]?.listId).toBe('list-1');
    expect(output.execution?.lists?.[0]?.itemCount).toBe(1);
    expect(output.execution?.semanticSnippets?.some((snippet) => snippet.nodeId === 'n-1')).toBe(true);
    expect(output.verification?.requested).toBe(true);
    expect(output.verification?.revision).toBe('rev-1');
    expect(output.verification?.fingerprint?.firstBlock).toContain('n-1');
  });

  test('superdoc_context overview surfaces risk snippets for long summary tasks', async () => {
    const { handle } = createMockHandle({
      blocks: [
        {
          ordinal: 1,
          nodeId: 'n-1',
          nodeType: 'paragraph',
          ref: 'ref:block:1',
          text: 'Introductory cover page.',
        },
        {
          ordinal: 2,
          nodeId: 'n-2',
          nodeType: 'heading',
          ref: 'ref:block:2',
          text: 'Risk factors',
          headingLevel: 1,
        },
        {
          ordinal: 3,
          nodeId: 'n-3',
          nodeType: 'paragraph',
          ref: 'ref:block:3',
          text: 'The valuation depends on assumptions, market comparables, and permit approvals.',
        },
      ],
    });
    const registry = getWorkflowPocToolRegistry();
    const contextEntry = registry.get('superdoc_context');
    expect(contextEntry).toBeDefined();
    if (contextEntry == null) return;

    const result = await contextEntry.run({ documentHandle: handle, args: {} });
    const output = result.output as {
      execution?: {
        riskSnippets?: Array<{ nodeId?: string; textPreview?: string; matchedTerms?: string[] }>;
      };
    };

    expect(output.execution?.riskSnippets?.map((snippet) => snippet.nodeId)).toContain('n-2');
    expect(output.execution?.riskSnippets?.map((snippet) => snippet.nodeId)).toContain('n-3');
    expect(output.execution?.riskSnippets?.find((snippet) => snippet.nodeId === 'n-3')?.matchedTerms).toContain(
      'valuation',
    );
  });

  test('superdoc_context returns focused context for deterministic targets', async () => {
    const { handle } = createMockHandle();
    const registry = getWorkflowPocToolRegistry();
    const contextEntry = registry.get('superdoc_context');
    expect(contextEntry).toBeDefined();
    if (contextEntry == null) return;

    const tableResult = await contextEntry.run({
      documentHandle: handle,
      args: { target: { tableOrdinal: 1 }, window: 1, verify: true },
    });

    expect(tableResult.receipt.status).toBe('success');
    const tableOutput = tableResult.output as {
      resolved?: { target?: { nodeId?: string; tableOrdinal?: number } };
      execution?: {
        mode?: string;
        focus?: {
          resolvedTarget?: { nodeId?: string; tableOrdinal?: number };
          nearbyBlocks?: { blocks?: Array<{ nodeId?: string }> };
          table?: { tableOrdinal?: number; rows?: number; columns?: number };
        };
      };
    };
    expect(tableOutput.resolved?.target?.nodeId).toBe('n-2');
    expect(tableOutput.execution?.mode).toBe('focused');
    expect(tableOutput.execution?.focus?.resolvedTarget?.tableOrdinal).toBe(1);
    expect(tableOutput.execution?.focus?.nearbyBlocks?.blocks?.some((block) => block.nodeId === 'n-2')).toBe(true);
    expect(tableOutput.execution?.focus?.table?.tableOrdinal).toBe(1);
    expect(tableOutput.execution?.focus?.table?.rows).toBe(2);
    expect(tableOutput.execution?.focus?.table?.columns).toBe(3);

    const listResult = await contextEntry.run({
      documentHandle: handle,
      args: { target: { listOrdinal: 7 }, window: 1 },
    });
    const listOutput = listResult.output as {
      execution?: {
        focus?: {
          list?: { listId?: string; itemCount?: number; focusNodeId?: string };
        };
      };
    };
    expect(listOutput.execution?.focus?.list?.listId).toBe('list-1');
    expect(listOutput.execution?.focus?.list?.focusNodeId).toBe('n-list-1');
    expect(listOutput.execution?.focus?.list?.itemCount).toBe(1);
  });

  test('superdoc_text_transform replace_all succeeds with compact verification', async () => {
    const { handle } = createMockHandle();
    const registry = getWorkflowPocToolRegistry();
    const textEntry = registry.get('superdoc_text_transform');
    expect(textEntry).toBeDefined();
    if (textEntry == null) return;

    const result = await textEntry.run({
      documentHandle: handle,
      args: {
        action: 'replace_all',
        edits: [{ find: 'CompanyName', replace: 'SuperDoc Inc.' }],
      },
    });

    expect(result.receipt.status).toBe('success');
    const output = result.output as {
      execution?: {
        action?: string;
        changeMode?: string;
        stepCount?: number;
        revision?: { before?: string; after?: string };
      };
      verification?: {
        passed?: boolean;
        summary?: string;
        checks?: { replacementsPresent?: number; replacementsExpected?: number };
      };
    };
    expect(output.execution?.action).toBe('replace_all');
    expect(output.execution?.changeMode).toBe('direct');
    expect(output.execution?.stepCount).toBe(1);
    expect(output.execution?.revision?.before).toBe('rev-1');
    expect(output.execution?.revision?.after).toBe('rev-2');
    expect(output.verification?.passed).toBe(true);
    expect(output.verification?.checks?.replacementsPresent).toBe(1);
    expect(output.verification?.checks?.replacementsExpected).toBe(1);
    expect(output.verification?.summary).toContain('replacement checks');
  });

  test('superdoc_text_transform replace_all allows replacements containing the source substring', async () => {
    const { handle } = createMockHandle();
    const registry = getWorkflowPocToolRegistry();
    const textEntry = registry.get('superdoc_text_transform');
    expect(textEntry).toBeDefined();
    if (textEntry == null) return;

    const result = await textEntry.run({
      documentHandle: handle,
      args: {
        action: 'replace_all',
        edits: [{ find: 'CompanyName', replace: 'CompanyName Inc.' }],
      },
    });

    expect(result.receipt.status).toBe('success');
    const output = result.output as {
      verification?: {
        passed?: boolean;
        checks?: { replacementsPresent?: number; deletedPatternsExpected?: number; deletedPatternsGone?: number };
      };
    };
    expect(output.verification?.passed).toBe(true);
    expect(output.verification?.checks?.replacementsPresent).toBe(1);
    expect(output.verification?.checks?.deletedPatternsExpected).toBe(0);
    expect(output.verification?.checks?.deletedPatternsGone).toBe(0);
  });

  test('superdoc_text_transform replace_all allows empty-string replacement for removals', async () => {
    const { handle, calls } = createMockHandle();
    const registry = getWorkflowPocToolRegistry();
    const textEntry = registry.get('superdoc_text_transform');
    expect(textEntry).toBeDefined();
    if (textEntry == null) return;

    const result = await textEntry.run({
      documentHandle: handle,
      args: {
        action: 'replace_all',
        edits: [{ find: 'delete-me.', replace: '' }],
      },
    });

    expect(result.receipt.status).toBe('success');
    const applyCall = calls.mutationApplyCalls[0];
    expect(applyCall?.steps?.[0]).toMatchObject({
      op: 'text.rewrite',
      args: { replacement: { text: '' } },
    });
    const output = result.output as {
      verification?: {
        passed?: boolean;
        checks?: { deletedPatternsExpected?: number; deletedPatternsGone?: number };
      };
    };
    expect(output.verification?.passed).toBe(true);
    expect(output.verification?.checks?.deletedPatternsExpected).toBe(1);
    expect(output.verification?.checks?.deletedPatternsGone).toBe(1);
  });

  test('superdoc_text_transform tracked short-title rewrite preserves novel requested keywords', async () => {
    const { handle, calls } = createMockHandle({
      blocks: [
        {
          ordinal: 1,
          nodeId: 'n-title',
          nodeType: 'paragraph',
          ref: 'ref:block:title',
          text: 'SHAREHOLDER LOAN AGREEMENT',
        },
      ],
      listItems: [],
    });
    const registry = getWorkflowPocToolRegistry();
    const textEntry = registry.get('superdoc_text_transform');
    expect(textEntry).toBeDefined();
    if (textEntry == null) return;

    const result = await textEntry.run({
      documentHandle: handle,
      args: {
        action: 'rewrite_block',
        target: { paragraphOrdinal: 1 },
        text: 'This agreement explains the terms in clear, straightforward language while keeping the same meaning, and it provides a magnificent level of clarity.',
        changeMode: 'tracked',
      },
    });

    expect(result.receipt.status).toBe('success');
    const step = calls.mutationApplyCalls[0]?.steps?.[0] as { args?: { replacement?: { text?: string } } } | undefined;
    expect(step?.args?.replacement?.text).toContain('Shareholder Loan Agreement');
    expect(step?.args?.replacement?.text).toContain('magnificent');
  });

  test('superdoc_text_transform resolves generic date descriptors to the top date value', async () => {
    const { handle, calls } = createMockHandle({
      blocks: [
        {
          ordinal: 1,
          nodeId: 'n-title',
          nodeType: 'heading',
          ref: 'ref:block:title',
          text: 'Shareholder Loan Agreement',
          headingLevel: 1,
        },
        {
          ordinal: 2,
          nodeId: 'n-date',
          nodeType: 'paragraph',
          ref: 'ref:block:date',
          text: 'DATE: 30 March 2026',
        },
        {
          ordinal: 3,
          nodeId: 'n-body',
          nodeType: 'paragraph',
          ref: 'ref:block:body',
          text: 'The Company confirms that, as at the date of this agreement, the Loan has been made available.',
        },
      ],
      listItems: [],
    });
    const registry = getWorkflowPocToolRegistry();
    const textEntry = registry.get('superdoc_text_transform');
    expect(textEntry).toBeDefined();
    if (textEntry == null) return;

    const result = await textEntry.run({
      documentHandle: handle,
      args: {
        action: 'replace_all',
        edits: [{ find: 'date', replace: '19 May 2026' }],
        preserveStyle: true,
      },
    });

    expect(result.receipt.status).toBe('success');
    const step = calls.mutationApplyCalls[0]?.steps?.[0] as
      | { where?: { select?: { pattern?: string } }; args?: { replacement?: { text?: string } } }
      | undefined;
    expect(step?.where?.select?.pattern).toBe('30 March 2026');
    expect(step?.args?.replacement?.text).toBe('19 May 2026');
    const output = result.output as {
      verification?: { passed?: boolean; checks?: { deletedPatternsGone?: number; deletedPatternsExpected?: number } };
    };
    expect(output.verification?.passed).toBe(true);
    expect(output.verification?.checks?.deletedPatternsGone).toBe(1);
    expect(output.verification?.checks?.deletedPatternsExpected).toBe(1);
  });

  test('superdoc_text_transform delete_all succeeds', async () => {
    const { handle, calls } = createMockHandle();
    const registry = getWorkflowPocToolRegistry();
    const textEntry = registry.get('superdoc_text_transform');
    expect(textEntry).toBeDefined();
    if (textEntry == null) return;

    const result = await textEntry.run({
      documentHandle: handle,
      args: {
        action: 'delete_all',
        edits: [{ find: 'delete-me.' }],
      },
    });

    expect(result.receipt.status).toBe('success');
    const applyCall = calls.mutationApplyCalls[0];
    expect(applyCall?.atomic).toBe(true);
    expect(applyCall?.steps?.[0]?.op).toBe('text.delete');
    expect((applyCall?.steps?.[0]?.where as { require?: string })?.require ?? undefined).toBe('all');
    const output = result.output as {
      verification?: { passed?: boolean; checks?: { deletedPatternsGone?: number; deletedPatternsExpected?: number } };
    };
    expect(output.verification?.passed).toBe(true);
    expect(output.verification?.checks?.deletedPatternsGone).toBe(1);
    expect(output.verification?.checks?.deletedPatternsExpected).toBe(1);
  });

  test('superdoc_text_transform fill_placeholders supports tracked mode and multiple edits', async () => {
    const { handle, calls } = createMockHandle();
    const registry = getWorkflowPocToolRegistry();
    const textEntry = registry.get('superdoc_text_transform');
    expect(textEntry).toBeDefined();
    if (textEntry == null) return;

    const result = await textEntry.run({
      documentHandle: handle,
      args: {
        action: 'fill_placeholders',
        changeMode: 'tracked',
        edits: [
          { find: '{{name}}', replace: 'Alex' },
          { find: '{{date}}', replace: 'May 24, 2026' },
        ],
      },
    });

    expect(result.receipt.status).toBe('success');
    expect(calls.mutationApplyCalls[0]?.changeMode).toBe('tracked');
    expect(calls.mutationApplyCalls[0]?.steps?.length).toBe(2);
    for (const step of calls.mutationApplyCalls[0]?.steps ?? []) {
      expect(step.op).toBe('text.rewrite');
      expect((step.where as { require?: string })?.require ?? undefined).toBe('all');
    }
    const output = result.output as {
      execution?: { action?: string; changeMode?: string; stepCount?: number };
      verification?: { passed?: boolean; checks?: { replacementsPresent?: number; replacementsExpected?: number } };
    };
    expect(output.execution?.action).toBe('fill_placeholders');
    expect(output.execution?.changeMode).toBe('tracked');
    expect(output.execution?.stepCount).toBe(2);
    expect(output.verification?.passed).toBe(true);
    expect(output.verification?.checks?.replacementsPresent).toBe(2);
    expect(output.verification?.checks?.replacementsExpected).toBe(2);
  });

  test('superdoc_text_transform rewrite_block enforces deterministic target and rejects unsupported kinds', async () => {
    const { handle } = createMockHandle();
    const registry = getWorkflowPocToolRegistry();
    const textEntry = registry.get('superdoc_text_transform');
    expect(textEntry).toBeDefined();
    if (textEntry == null) return;

    const missingTarget = await textEntry.run({
      documentHandle: handle,
      args: {
        action: 'rewrite_block',
        text: 'Updated heading',
      },
    });
    expect(missingTarget.receipt.status).toBe('failed');
    expect(missingTarget.receipt.phase).toBe('resolve');
    expect((missingTarget.receipt.details as { code?: string } | undefined)?.code).toBe('WORKFLOW_TARGET_REQUIRED');

    const unsupportedTargetKind = await textEntry.run({
      documentHandle: handle,
      args: {
        action: 'rewrite_block',
        target: { listOrdinal: 7 },
        text: 'Updated list item',
      },
    });
    expect(unsupportedTargetKind.receipt.status).toBe('failed');
    expect(unsupportedTargetKind.receipt.phase).toBe('resolve');
    expect((unsupportedTargetKind.receipt.details as { code?: string } | undefined)?.code).toBe(
      'WORKFLOW_TARGET_KIND_UNSUPPORTED',
    );
  });

  test('superdoc_list_transform insert_many succeeds for deterministic target and preserves input order', async () => {
    const { handle, calls } = createMockHandle();
    const registry = getWorkflowPocToolRegistry();
    const listEntry = registry.get('superdoc_list_transform');
    expect(listEntry).toBeDefined();
    if (listEntry == null) return;

    const items = ['Inserted A', 'Inserted B', 'Inserted C'];
    const result = await listEntry.run({
      documentHandle: handle,
      args: {
        action: 'insert_many',
        target: { listOrdinal: 7 },
        position: 'after',
        items,
      },
    });

    expect(result.receipt.status).toBe('success');
    expect(calls.listInsertCalls.length).toBe(3);
    expect(calls.listInsertCalls[0]?.targetNodeId).toBe('n-list-1');
    expect(calls.listInsertCalls[1]?.targetNodeId).toBe('n-list-2');
    expect(calls.listInsertCalls[2]?.targetNodeId).toBe('n-list-3');
    expect(calls.listInsertCalls.every((call) => call.position === 'after')).toBe(true);

    const output = result.output as {
      execution?: {
        action?: string;
        changeMode?: string;
        insertedCount?: number;
        insertedNodeIds?: string[];
        inserts?: Array<{ text?: string }>;
      };
      verification?: {
        passed?: boolean;
        checks?: {
          insertedPresent?: number;
          insertedExpected?: number;
          textsVerified?: number;
          textsExpected?: number;
        };
      };
    };
    expect(output.execution?.action).toBe('insert_many');
    expect(output.execution?.changeMode).toBe('direct');
    expect(output.execution?.insertedCount).toBe(3);
    expect(output.execution?.insertedNodeIds).toEqual(['n-list-2', 'n-list-3', 'n-list-4']);
    expect(output.execution?.inserts?.map((insert) => insert.text)).toEqual(items);
    expect(output.verification?.passed).toBe(true);
    expect(output.verification?.checks?.insertedPresent).toBe(3);
    expect(output.verification?.checks?.insertedExpected).toBe(3);
    expect(output.verification?.checks?.textsVerified).toBe(3);
    expect(output.verification?.checks?.textsExpected).toBe(3);
  });

  test('superdoc_list_transform auto-appends when target is omitted and exactly one list exists', async () => {
    const { handle, calls } = createMockHandle();
    const registry = getWorkflowPocToolRegistry();
    const listEntry = registry.get('superdoc_list_transform');
    expect(listEntry).toBeDefined();
    if (listEntry == null) return;

    const result = await listEntry.run({
      documentHandle: handle,
      args: {
        action: 'insert_many',
        items: ['Auto one', 'Auto two'],
      },
    });

    expect(result.receipt.status).toBe('success');
    expect(calls.listInsertCalls.length).toBe(2);
    expect(calls.listInsertCalls[0]?.targetNodeId).toBe('n-list-1');
    expect(calls.listInsertCalls[0]?.position).toBe('after');
    expect(calls.listInsertCalls[1]?.targetNodeId).toBe('n-list-2');

    const output = result.output as {
      execution?: {
        targetSource?: string;
        deterministicTarget?: boolean;
        position?: string;
        insertedNodeIds?: string[];
      };
    };
    expect(output.execution?.targetSource).toBe('auto_single_list');
    expect(output.execution?.deterministicTarget).toBe(false);
    expect(output.execution?.position).toBe('after');
    expect(output.execution?.insertedNodeIds).toEqual(['n-list-2', 'n-list-3']);
  });

  test('superdoc_list_transform fails cleanly when target is omitted and multiple lists exist', async () => {
    const { handle } = createMockHandle({
      listItems: [
        {
          nodeId: 'n-list-1',
          listId: 'list-1',
          ref: 'ref:list:1',
          ordinal: 7,
          level: 0,
          kind: 'ordered',
          text: 'List A item',
        },
        {
          nodeId: 'n-list-9',
          listId: 'list-2',
          ref: 'ref:list:9',
          ordinal: 9,
          level: 0,
          kind: 'ordered',
          text: 'List B item',
        },
      ],
    });
    const registry = getWorkflowPocToolRegistry();
    const listEntry = registry.get('superdoc_list_transform');
    expect(listEntry).toBeDefined();
    if (listEntry == null) return;

    const result = await listEntry.run({
      documentHandle: handle,
      args: {
        action: 'insert_many',
        items: ['Should fail'],
      },
    });

    expect(result.receipt.status).toBe('failed');
    expect(result.receipt.phase).toBe('resolve');
    expect((result.receipt.details as { code?: string } | undefined)?.code).toBe('WORKFLOW_LIST_TARGET_REQUIRED');
    expect((result.receipt.details as { listCount?: number } | undefined)?.listCount).toBe(2);
  });

  test('superdoc_list_transform passes tracked mode to inserts and surfaces tracked refs', async () => {
    const { handle, calls } = createMockHandle();
    const registry = getWorkflowPocToolRegistry();
    const listEntry = registry.get('superdoc_list_transform');
    expect(listEntry).toBeDefined();
    if (listEntry == null) return;

    const result = await listEntry.run({
      documentHandle: handle,
      args: {
        action: 'insert_many',
        target: { listOrdinal: 7 },
        changeMode: 'tracked',
        items: ['Tracked one', 'Tracked two'],
      },
    });

    expect(result.receipt.status).toBe('success');
    expect(calls.listInsertCalls.every((call) => call.changeMode === 'tracked')).toBe(true);

    const output = result.output as {
      execution?: {
        changeMode?: string;
        trackedChangeRefs?: Array<{ entityId?: string }>;
        inserts?: Array<{ trackedChangeRefIds?: string[] }>;
      };
      verification?: {
        checks?: { trackedChangeRefs?: number };
      };
    };
    expect(output.execution?.changeMode).toBe('tracked');
    expect(output.execution?.trackedChangeRefs?.length).toBe(2);
    expect(output.execution?.trackedChangeRefs?.[0]?.entityId).toBe('tc-1');
    expect(output.execution?.trackedChangeRefs?.[1]?.entityId).toBe('tc-2');
    expect(output.execution?.inserts?.[0]?.trackedChangeRefIds?.length).toBe(1);
    expect(output.execution?.inserts?.[1]?.trackedChangeRefIds?.length).toBe(1);
    expect(output.verification?.checks?.trackedChangeRefs).toBe(2);
  });

  test('superdoc_list_transform append_new_list creates paragraph label before single-item list seed', async () => {
    const { handle, calls } = createMockHandle({
      blocks: [
        {
          ordinal: 1,
          nodeId: 'n-intro',
          nodeType: 'paragraph',
          ref: 'ref:block:intro',
          text: 'Intro paragraph',
        },
      ],
      listItems: [],
    });
    const registry = getWorkflowPocToolRegistry();
    const listEntry = registry.get('superdoc_list_transform');
    expect(listEntry).toBeDefined();
    if (listEntry == null) return;

    const result = await listEntry.run({
      documentHandle: handle,
      args: {
        action: 'append_new_list',
        kind: 'ordered',
        headingText: 'Checklist',
        headingLevel: 1,
        items: ['First item', 'Second item'],
      },
    });

    expect(result.receipt.status).toBe('success');
    expect(calls.listCreateCalls[0]?.targetNodeIds).toEqual(['n-p-3']);
    expect(calls.createParagraphCalls[0]).toMatchObject({
      text: 'Checklist',
      atKind: 'documentEnd',
    });
    expect(calls.createHeadingCalls).toHaveLength(0);
    expect(calls.listInsertCalls[0]).toMatchObject({
      targetNodeId: 'n-p-3',
      position: 'after',
      text: 'Second item',
    });
  });

  test('superdoc_table_transform split_table succeeds and verifies separator text', async () => {
    const { handle, calls } = createMockHandle();
    const registry = getWorkflowPocToolRegistry();
    const tableEntry = registry.get('superdoc_table_transform');
    expect(tableEntry).toBeDefined();
    if (tableEntry == null) return;

    const result = await tableEntry.run({
      documentHandle: handle,
      args: {
        action: 'split_table',
        target: { tableOrdinal: 1 },
        afterRow: 1,
        separatorText: '--- Split Separator ---',
      },
    });

    expect(result.receipt.status).toBe('success');
    expect(calls.tableSplitCalls[0]?.nodeId).toBe('n-2');
    expect(calls.tableSplitCalls[0]?.rowIndex).toBe(0);
    expect(calls.createParagraphCalls[0]?.text).toBe('--- Split Separator ---');
    expect(calls.createParagraphCalls[0]?.atKind).toBe('after');
    expect(calls.createParagraphCalls[0]?.targetNodeId).toBe('n-2');

    const output = result.output as {
      execution?: { action?: string; targetTableNodeId?: string; revision?: { before?: string; after?: string } };
      verification?: {
        passed?: boolean;
        summary?: string;
        checks?: { tableCountBefore?: number; tableCountAfter?: number; separatorPresent?: boolean };
      };
    };
    expect(output.execution?.action).toBe('split_table');
    expect(output.execution?.targetTableNodeId).toBe('n-2');
    expect(output.execution?.revision?.before).toBe('rev-1');
    expect(output.execution?.revision?.after).not.toBe('rev-1');
    expect(output.verification?.passed).toBe(true);
    expect(output.verification?.checks?.tableCountBefore).toBe(1);
    expect(output.verification?.checks?.tableCountAfter).toBe(2);
    expect(output.verification?.checks?.separatorPresent).toBe(true);
    expect(output.verification?.summary).toContain('split_table checks');
  });

  test('superdoc_table_transform insert_column uses 1-based afterColumn semantics and can set header text', async () => {
    const { handle, calls } = createMockHandle();
    const registry = getWorkflowPocToolRegistry();
    const tableEntry = registry.get('superdoc_table_transform');
    expect(tableEntry).toBeDefined();
    if (tableEntry == null) return;

    const result = await tableEntry.run({
      documentHandle: handle,
      args: {
        action: 'insert_column',
        target: { tableOrdinal: 1 },
        afterColumn: 2,
        headerText: 'New Header',
      },
    });

    expect(result.receipt.status).toBe('success');
    expect(calls.tableInsertColumnCalls[0]?.nodeId).toBe('n-2');
    expect(calls.tableInsertColumnCalls[0]?.columnIndex).toBe(1);
    expect(calls.tableInsertColumnCalls[0]?.position).toBe('right');
    expect(calls.tableSetCellTextCalls[0]?.nodeId).toBe('n-2');
    expect(calls.tableSetCellTextCalls[0]?.rowIndex).toBe(0);
    expect(calls.tableSetCellTextCalls[0]?.columnIndex).toBe(2);
    expect(calls.tableSetCellTextCalls[0]?.text).toBe('New Header');

    const output = result.output as {
      execution?: {
        action?: string;
        targetTableNodeId?: string;
        columnIndex?: number;
        headerColumnIndex?: number;
        headerText?: string;
      };
      verification?: {
        passed?: boolean;
        checks?: { columnCountIncreased?: boolean; headerTextPresent?: boolean };
      };
    };
    expect(output.execution?.action).toBe('insert_column');
    expect(output.execution?.targetTableNodeId).toBe('n-2');
    expect(output.execution?.columnIndex).toBe(1);
    expect(output.execution?.headerColumnIndex).toBe(2);
    expect(output.execution?.headerText).toBe('New Header');
    expect(output.verification?.passed).toBe(true);
    expect(output.verification?.checks?.columnCountIncreased).toBe(true);
    expect(output.verification?.checks?.headerTextPresent).toBe(true);
  });

  test('superdoc_table_transform preview_insert_row uses dryRun and verifies no mutation', async () => {
    const { handle, calls } = createMockHandle();
    const registry = getWorkflowPocToolRegistry();
    const tableEntry = registry.get('superdoc_table_transform');
    expect(tableEntry).toBeDefined();
    if (tableEntry == null) return;

    const result = await tableEntry.run({
      documentHandle: handle,
      args: {
        action: 'preview_insert_row',
        target: { tableOrdinal: 1 },
        rowOrdinal: 2,
        position: 'after',
      },
    });

    expect(result.receipt.status).toBe('success');
    expect(calls.tableInsertRowCalls[0]?.nodeId).toBe('n-2');
    expect(calls.tableInsertRowCalls[0]?.rowIndex).toBe(1);
    expect(calls.tableInsertRowCalls[0]?.position).toBe('below');
    expect(calls.tableInsertRowCalls[0]?.dryRun).toBe(true);

    const output = result.output as {
      execution?: { action?: string; revision?: { before?: string; after?: string; unchanged?: boolean } };
      verification?: {
        passed?: boolean;
        checks?: { revisionUnchanged?: boolean; textUnchanged?: boolean; rowCountUnchanged?: boolean };
      };
    };
    expect(output.execution?.action).toBe('preview_insert_row');
    expect(output.execution?.revision?.before).toBe('rev-1');
    expect(output.execution?.revision?.after).toBe('rev-1');
    expect(output.execution?.revision?.unchanged).toBe(true);
    expect(output.verification?.passed).toBe(true);
    expect(output.verification?.checks?.revisionUnchanged).toBe(true);
    expect(output.verification?.checks?.textUnchanged).toBe(true);
    expect(output.verification?.checks?.rowCountUnchanged).toBe(true);
  });

  test('superdoc_table_transform insert_row maps plain text to the first cell', async () => {
    const { handle, calls } = createMockHandle();
    const registry = getWorkflowPocToolRegistry();
    const tableEntry = registry.get('superdoc_table_transform');
    expect(tableEntry).toBeDefined();
    if (tableEntry == null) return;

    const result = await tableEntry.run({
      documentHandle: handle,
      args: {
        action: 'insert_row',
        target: { tableOrdinal: 1 },
        rowOrdinal: 9999,
        position: 'after',
        text: 'New entry — magnificent',
      },
    });

    expect(result.receipt.status).toBe('success');
    expect(calls.tableInsertRowCalls[0]).toMatchObject({
      nodeId: 'n-2',
      rowIndex: 1,
      position: 'below',
    });
    expect(calls.mutationApplyCalls[0]?.steps?.[0]).toMatchObject({
      op: 'text.rewrite',
      where: {
        by: 'block',
        nodeId: 'cell:n-2:2:0',
      },
      args: {
        replacement: { text: 'New entry — magnificent' },
      },
    });
  });

  test('superdoc_table_transform rejects non-table targets cleanly', async () => {
    const { handle } = createMockHandle();
    const registry = getWorkflowPocToolRegistry();
    const tableEntry = registry.get('superdoc_table_transform');
    expect(tableEntry).toBeDefined();
    if (tableEntry == null) return;

    const result = await tableEntry.run({
      documentHandle: handle,
      args: {
        action: 'split_table',
        target: { blockOrdinal: 1 },
        afterRow: 1,
      },
    });

    expect(result.receipt.status).toBe('failed');
    expect(result.receipt.phase).toBe('resolve');
    expect((result.receipt.details as { code?: string } | undefined)?.code).toBe('WORKFLOW_TARGET_KIND_UNSUPPORTED');
  });

  test('superdoc_structure_insert insert_toc supports title + relative placement and verifies output', async () => {
    const { handle, calls } = createMockHandle();
    const registry = getWorkflowPocToolRegistry();
    const structureEntry = registry.get('superdoc_structure_insert');
    expect(structureEntry).toBeDefined();
    if (structureEntry == null) return;

    const result = await structureEntry.run({
      documentHandle: handle,
      args: {
        action: 'insert_toc',
        title: 'Contents',
        placement: {
          position: 'after',
          target: { blockOrdinal: 1 },
        },
      },
    });

    expect(result.receipt.status).toBe('success');
    expect(calls.createParagraphCalls[0]?.text).toBe('Contents');
    expect(calls.createParagraphCalls[0]?.atKind).toBe('after');
    expect(calls.createParagraphCalls[0]?.targetNodeId).toBe('n-1');
    expect(calls.createTocCalls[0]?.atKind).toBe('after');
    expect(calls.createTocCalls[0]?.targetNodeId).toBe('n-p-4');

    const output = result.output as {
      execution?: {
        action?: string;
        placement?: { mode?: string; position?: string; targetNodeId?: string };
        tocNodeId?: string;
        titleNodeId?: string;
        revision?: { before?: string; after?: string };
      };
      verification?: {
        passed?: boolean;
        summary?: string;
        checks?: {
          tocPresent?: boolean;
          titlePresent?: boolean;
          placementVerified?: boolean;
          placementSatisfied?: boolean;
          targetOrdinal?: number;
          tocOrdinal?: number;
          titleOrdinal?: number;
        };
      };
    };
    expect(output.execution?.action).toBe('insert_toc');
    expect(output.execution?.placement?.mode).toBe('relative');
    expect(output.execution?.placement?.position).toBe('after');
    expect(output.execution?.placement?.targetNodeId).toBe('n-1');
    expect(output.execution?.tocNodeId).toBe('n-toc-1');
    expect(output.execution?.titleNodeId).toBe('n-p-4');
    expect(output.execution?.revision?.before).toBe('rev-1');
    expect(output.execution?.revision?.after).toBe('rev-3');
    expect(output.verification?.passed).toBe(true);
    expect(output.verification?.checks?.tocPresent).toBe(true);
    expect(output.verification?.checks?.titlePresent).toBe(true);
    expect(output.verification?.checks?.placementVerified).toBe(true);
    expect(output.verification?.checks?.placementSatisfied).toBe(true);
    expect(output.verification?.checks?.targetOrdinal).toBe(1);
    expect(output.verification?.checks?.titleOrdinal).toBe(2);
    expect(output.verification?.checks?.tocOrdinal).toBe(3);
    expect(output.verification?.summary).toContain('insert_toc checks');
  });

  test('superdoc_structure_insert insert_section_break defaults to document_end', async () => {
    const { handle, calls } = createMockHandle();
    const registry = getWorkflowPocToolRegistry();
    const structureEntry = registry.get('superdoc_structure_insert');
    expect(structureEntry).toBeDefined();
    if (structureEntry == null) return;

    const result = await structureEntry.run({
      documentHandle: handle,
      args: {
        action: 'insert_section_break',
      },
    });

    expect(result.receipt.status).toBe('success');
    expect(calls.createSectionBreakCalls[0]?.atKind).toBe('documentEnd');
    expect(calls.createSectionBreakCalls[0]?.targetNodeId).toBeUndefined();
    expect(calls.createSectionBreakCalls[0]?.breakType).toBe('nextPage');

    const output = result.output as {
      execution?: {
        action?: string;
        placement?: { mode?: string; at?: string; source?: string };
        sectionId?: string;
        breakType?: string;
        revision?: { before?: string; after?: string };
      };
      verification?: {
        passed?: boolean;
        checks?: { sectionCreated?: boolean; revisionChanged?: boolean; breakType?: string };
      };
    };
    expect(output.execution?.action).toBe('insert_section_break');
    expect(output.execution?.placement?.mode).toBe('document');
    expect(output.execution?.placement?.at).toBe('document_end');
    expect(output.execution?.placement?.source).toBe('default');
    expect(output.execution?.sectionId).toBe('section-2');
    expect(output.execution?.breakType).toBe('nextPage');
    expect(output.execution?.revision?.before).toBe('rev-1');
    expect(output.execution?.revision?.after).toBe('rev-2');
    expect(output.verification?.passed).toBe(true);
    expect(output.verification?.checks?.sectionCreated).toBe(true);
    expect(output.verification?.checks?.revisionChanged).toBe(true);
    expect(output.verification?.checks?.breakType).toBe('nextPage');
  });

  test('superdoc_structure_insert insert_paragraphs preserves ordered paragraph groups', async () => {
    const { handle, calls } = createMockHandle();
    const registry = getWorkflowPocToolRegistry();
    const structureEntry = registry.get('superdoc_structure_insert');
    expect(structureEntry).toBeDefined();
    if (structureEntry == null) return;

    const result = await structureEntry.run({
      documentHandle: handle,
      args: {
        action: 'insert_paragraphs',
        texts: ['Risk summary (magnificent edition):', 'The valuation depends on assumptions and market risk.'],
        placement: 'document_start',
      },
    });

    expect(result.receipt.status).toBe('success');
    expect(calls.createParagraphCalls).toEqual([
      {
        text: 'Risk summary (magnificent edition):',
        atKind: 'documentStart',
        targetNodeId: undefined,
      },
      {
        text: 'The valuation depends on assumptions and market risk.',
        atKind: 'after',
        targetNodeId: 'n-p-4',
      },
    ]);

    const output = result.output as {
      execution?: { action?: string; paragraphNodeIds?: string[]; revision?: { before?: string; after?: string } };
      verification?: { passed?: boolean; checks?: { paragraphCount?: number; textsPresent?: boolean } };
    };
    expect(output.execution?.action).toBe('insert_paragraphs');
    expect(output.execution?.paragraphNodeIds).toEqual(['n-p-4', 'n-p-5']);
    expect(output.execution?.revision?.before).toBe('rev-1');
    expect(output.execution?.revision?.after).toBe('rev-3');
    expect(output.verification?.passed).toBe(true);
    expect(output.verification?.checks?.paragraphCount).toBe(2);
    expect(output.verification?.checks?.textsPresent).toBe(true);
  });

  test('superdoc_structure_insert move_section moves a whole section before another section', async () => {
    const { handle, calls } = createMockHandle({
      blocks: [
        { ordinal: 1, nodeId: 'n-title', nodeType: 'paragraph', ref: 'ref:block:title', text: 'Agreement' },
        {
          ordinal: 2,
          nodeId: 'n-agreed',
          nodeType: 'heading',
          ref: 'ref:block:agreed',
          text: 'AGREED TERMS',
          headingLevel: 2,
        },
        {
          ordinal: 3,
          nodeId: 'n-defs',
          nodeType: 'heading',
          ref: 'ref:block:defs',
          text: 'Definitions and Interpretation',
          headingLevel: 3,
        },
        {
          ordinal: 4,
          nodeId: 'n-defs-body',
          nodeType: 'heading',
          ref: 'ref:block:defs-body',
          text: 'This long definitions body is not a section heading because it contains many words and punctuation.',
          headingLevel: 3,
        },
        { ordinal: 5, nodeId: 'n-loan', nodeType: 'heading', ref: 'ref:block:loan', text: 'The Loan', headingLevel: 3 },
        {
          ordinal: 6,
          nodeId: 'n-loan-body',
          nodeType: 'heading',
          ref: 'ref:block:loan-body',
          text: 'Loan body text.',
          headingLevel: 3,
        },
        {
          ordinal: 7,
          nodeId: 'n-purpose',
          nodeType: 'heading',
          ref: 'ref:block:purpose',
          text: 'Purpose',
          headingLevel: 3,
        },
        {
          ordinal: 8,
          nodeId: 'n-purpose-body',
          nodeType: 'heading',
          ref: 'ref:block:purpose-body',
          text: 'Purpose body text.',
          headingLevel: 3,
        },
        {
          ordinal: 9,
          nodeId: 'n-interest',
          nodeType: 'heading',
          ref: 'ref:block:interest',
          text: 'Interest',
          headingLevel: 3,
        },
        {
          ordinal: 10,
          nodeId: 'n-interest-body',
          nodeType: 'heading',
          ref: 'ref:block:interest-body',
          text: 'Interest body text.',
          headingLevel: 3,
        },
      ],
    });
    const registry = getWorkflowPocToolRegistry();
    const structureEntry = registry.get('superdoc_structure_insert');
    expect(structureEntry).toBeDefined();
    if (structureEntry == null) return;

    const result = await structureEntry.run({
      documentHandle: handle,
      args: {
        action: 'move_section',
        sourceSection: 3,
        destinationSection: 2,
        position: 'before',
        bottomNote: 'Sections reordered — magnificent.',
      },
    });

    expect(result.receipt.status).toBe('success');
    expect(calls.createHeadingCalls.map((call) => call.text)).toEqual(['Purpose', 'Purpose body text.']);
    expect(calls.blockDeleteRangeCalls).toEqual([
      { startNodeId: 'n-purpose', endNodeId: 'n-purpose-body', force: true },
    ]);

    const text = await handle.getText();
    expect(text.indexOf('Purpose')).toBeLessThan(text.indexOf('The Loan'));
    expect(text).toContain('Sections reordered — magnificent.');

    const output = result.output as {
      execution?: {
        action?: string;
        sourceHeadingText?: string;
        destinationHeadingText?: string;
        deletedCount?: number;
      };
      verification?: { passed?: boolean; checks?: { orderSatisfied?: boolean; sourceSingleOccurrence?: boolean } };
    };
    expect(output.execution?.action).toBe('move_section');
    expect(output.execution?.sourceHeadingText).toBe('Purpose');
    expect(output.execution?.destinationHeadingText).toBe('The Loan');
    expect(output.execution?.deletedCount).toBe(2);
    expect(output.verification?.passed).toBe(true);
    expect(output.verification?.checks?.orderSatisfied).toBe(true);
    expect(output.verification?.checks?.sourceSingleOccurrence).toBe(true);
  });

  test('superdoc_media_insert defaults src to attachment and captions the created image', async () => {
    const { handle, calls } = createMockHandle();
    const registry = getWorkflowPocToolRegistry();
    const mediaEntry = registry.get('superdoc_media_insert');
    expect(mediaEntry).toBeDefined();
    if (mediaEntry == null) return;

    const result = await mediaEntry.run({
      documentHandle: handle,
      args: {
        action: 'insert_image_with_caption',
        placement: {
          position: 'after',
          target: { blockOrdinal: 1 },
        },
        alt: 'Company logo',
        caption: 'Figure 1. Company logo',
      },
    });

    expect(result.receipt.status).toBe('success');
    expect(result.receipt.phase).toBe('verify');
    expect(calls.createImageCalls).toEqual([
      {
        src: 'attachment',
        alt: 'Company logo',
        atKind: 'after',
        targetNodeId: 'n-1',
      },
    ]);
    expect(calls.imageInsertCaptionCalls).toEqual([
      {
        imageId: 'img-1',
        text: 'Figure 1. Company logo',
      },
    ]);

    const output = result.output as {
      execution?: {
        action?: string;
        src?: string;
        imageId?: string;
        caption?: string;
        captionTargetImageId?: string;
        placement?: { mode?: string; position?: string; targetNodeId?: string };
      };
      verification?: {
        passed?: boolean;
        checks?: { captionApplied?: boolean; placementSatisfied?: boolean; imageCountIncreased?: boolean };
      };
    };
    expect(output.execution?.action).toBe('insert_image_with_caption');
    expect(output.execution?.src).toBe('attachment');
    expect(output.execution?.imageId).toBe('img-1');
    expect(output.execution?.caption).toBe('Figure 1. Company logo');
    expect(output.execution?.captionTargetImageId).toBe('img-1');
    expect(output.execution?.placement?.mode).toBe('relative');
    expect(output.execution?.placement?.position).toBe('after');
    expect(output.execution?.placement?.targetNodeId).toBe('n-1');
    expect(output.verification?.passed).toBe(true);
    expect(output.verification?.checks?.captionApplied).toBe(true);
    expect(output.verification?.checks?.placementSatisfied).toBe(true);
    expect(output.verification?.checks?.imageCountIncreased).toBe(true);
  });

  test('superdoc_comment_pass comments eligible paragraphs and skips excluded styles', async () => {
    const { handle, calls } = createMockHandle({
      blocks: [
        {
          ordinal: 1,
          nodeId: 'n-1',
          nodeType: 'paragraph',
          ref: 'ref:block:1',
          text: 'First eligible paragraph',
          styleId: 'BodyText',
        },
        {
          ordinal: 2,
          nodeId: 'n-2',
          nodeType: 'paragraph',
          ref: 'ref:block:2',
          text: 'Quoted paragraph should be skipped',
          styleId: 'IntenseQuote',
        },
        {
          ordinal: 3,
          nodeId: 'n-3',
          nodeType: 'paragraph',
          ref: 'ref:block:3',
          text: 'Second eligible paragraph',
          styleId: 'BodyText',
        },
        {
          ordinal: 4,
          nodeId: 'n-4',
          nodeType: 'paragraph',
          ref: 'ref:block:4',
          text: '   ',
          styleId: 'BodyText',
        },
        {
          ordinal: 5,
          nodeId: 'n-5',
          nodeType: 'heading',
          ref: 'ref:block:5',
          text: 'Heading',
          headingLevel: 1,
        },
      ],
    });
    const registry = getWorkflowPocToolRegistry();
    const entry = registry.get('superdoc_comment_pass');
    expect(entry).toBeDefined();
    if (entry == null) return;

    const result = await entry.run({
      documentHandle: handle,
      args: {
        action: 'comment_paragraphs',
        text: 'Needs review',
        excludeStyleId: 'IntenseQuote',
      },
    });

    expect(result.receipt.status).toBe('success');
    expect(result.receipt.phase).toBe('verify');
    expect(calls.blockListCalls.some((call) => call.includeText === true)).toBe(true);
    expect(calls.commentCreateCalls).toEqual([
      {
        text: 'Needs review',
        targetBlockId: 'n-1',
        start: 0,
        end: 'First eligible paragraph'.length,
      },
      {
        text: 'Needs review',
        targetBlockId: 'n-3',
        start: 0,
        end: 'Second eligible paragraph'.length,
      },
    ]);
    expect(calls.commentListCalls.length).toBeGreaterThan(0);

    const listedComments = await handle.comments.list({ includeResolved: true });
    expect(listedComments.total).toBe(2);
    expect(listedComments.items.map((comment) => comment.target?.segments[0]?.blockId)).toEqual(['n-1', 'n-3']);

    const output = result.output as {
      execution?: {
        action?: string;
        eligibleParagraphs?: number;
        createdComments?: number;
        skipped?: { excludedStyle?: number; empty?: number };
        targets?: Array<{ blockId?: string; commentId?: string }>;
      };
      verification?: {
        passed?: boolean;
        checks?: {
          eligibleParagraphs?: number;
          verifiedComments?: number;
          skippedExcludedStyle?: number;
          skippedEmpty?: number;
        };
      };
    };
    expect(output.execution?.action).toBe('comment_paragraphs');
    expect(output.execution?.eligibleParagraphs).toBe(2);
    expect(output.execution?.createdComments).toBe(2);
    expect(output.execution?.skipped?.excludedStyle).toBe(1);
    expect(output.execution?.skipped?.empty).toBe(1);
    expect(output.execution?.targets?.map((target) => target.blockId)).toEqual(['n-1', 'n-3']);
    expect(output.execution?.targets?.every((target) => typeof target.commentId === 'string')).toBe(true);
    expect(output.verification?.passed).toBe(true);
    expect(output.verification?.checks?.eligibleParagraphs).toBe(2);
    expect(output.verification?.checks?.verifiedComments).toBe(2);
    expect(output.verification?.checks?.skippedExcludedStyle).toBe(1);
    expect(output.verification?.checks?.skippedEmpty).toBe(1);
  });

  test('superdoc_style_clone applies color across exact block text matches and verifies formatting state', async () => {
    const { handle, calls } = createMockHandle({
      blocks: [
        {
          ordinal: 1,
          nodeId: 'n-1',
          nodeType: 'paragraph',
          ref: 'ref:block:1',
          text: 'Action Needed',
        },
        {
          ordinal: 2,
          nodeId: 'n-2',
          nodeType: 'heading',
          ref: 'ref:block:2',
          text: 'Overview',
          headingLevel: 1,
        },
        {
          ordinal: 3,
          nodeId: 'n-3',
          nodeType: 'paragraph',
          ref: 'ref:block:3',
          text: 'Action Needed',
        },
      ],
    });
    const registry = getWorkflowPocToolRegistry();
    const entry = registry.get('superdoc_style_clone');
    expect(entry).toBeDefined();
    if (entry == null) return;

    const result = await entry.run({
      documentHandle: handle,
      args: {
        action: 'apply_color_to_matches',
        targetText: 'Action Needed',
        color: '#ff6600',
      },
    });

    expect(result.receipt.status).toBe('success');
    expect(result.receipt.phase).toBe('verify');
    expect(calls.formatApplyCalls).toEqual([
      {
        blockId: 'n-1',
        start: 0,
        end: 'Action Needed'.length,
        changeMode: 'direct',
        inline: { color: 'FF6600' },
      },
      {
        blockId: 'n-3',
        start: 0,
        end: 'Action Needed'.length,
        changeMode: 'direct',
        inline: { color: 'FF6600' },
      },
    ]);

    const listedBlocks = await handle.blocks.list({ includeText: true });
    expect(
      listedBlocks.blocks
        .filter((block) => block.text === 'Action Needed')
        .map((block) => ({ nodeId: block.nodeId, color: block.color })),
    ).toEqual([
      { nodeId: 'n-1', color: 'FF6600' },
      { nodeId: 'n-3', color: 'FF6600' },
    ]);

    const output = result.output as {
      execution?: {
        action?: string;
        color?: string;
        appliedCount?: number;
        targets?: Array<{ nodeId?: string }>;
      };
      verification?: {
        passed?: boolean;
        checks?: { matchedBlocks?: number; appliedBlocks?: number; verifiedBlocks?: number };
      };
    };
    expect(output.execution?.action).toBe('apply_color_to_matches');
    expect(output.execution?.color).toBe('FF6600');
    expect(output.execution?.appliedCount).toBe(2);
    expect(output.execution?.targets?.map((target) => target.nodeId)).toEqual(['n-1', 'n-3']);
    expect(output.verification?.passed).toBe(true);
    expect(output.verification?.checks?.matchedBlocks).toBe(2);
    expect(output.verification?.checks?.appliedBlocks).toBe(2);
    expect(output.verification?.checks?.verifiedBlocks).toBe(2);
  });

  test('superdoc_style_clone applies color to substring text even when matchMode exact is supplied', async () => {
    const { handle, calls } = createMockHandle({
      blocks: [
        {
          ordinal: 1,
          nodeId: 'n-1',
          nodeType: 'paragraph',
          ref: 'ref:block:1',
          text: 'The Lender and another Lender are listed here.',
        },
        {
          ordinal: 2,
          nodeId: 'n-2',
          nodeType: 'paragraph',
          ref: 'ref:block:2',
          text: 'The Company is listed here.',
        },
      ],
    });
    const registry = getWorkflowPocToolRegistry();
    const entry = registry.get('superdoc_style_clone');
    expect(entry).toBeDefined();
    if (entry == null) return;

    const result = await entry.run({
      documentHandle: handle,
      args: {
        action: 'apply_color_to_text',
        targetText: 'Lender',
        color: 'red',
        matchMode: 'exact',
      },
    });

    expect(result.receipt.status).toBe('success');
    expect(calls.formatApplyCalls).toEqual([
      {
        blockId: 'n-1',
        start: 4,
        end: 10,
        changeMode: 'direct',
        inline: { color: 'FF0000' },
      },
      {
        blockId: 'n-1',
        start: 23,
        end: 29,
        changeMode: 'direct',
        inline: { color: 'FF0000' },
      },
    ]);
  });

  test('superdoc_track_changes summary returns deterministic tracked change review surface', async () => {
    const { handle, calls } = createMockHandle({
      trackedChanges: [
        {
          id: 'chg-1',
          type: 'insert',
          excerpt: 'Added executive summary paragraph',
          author: 'Alice',
          date: '2026-05-20T10:00:00Z',
          story: { kind: 'story', storyType: 'body' },
        },
        {
          id: 'chg-2',
          type: 'delete',
          excerpt: 'Removed outdated metric',
          author: 'Bob',
          date: '2026-05-20T11:00:00Z',
          story: { kind: 'story', storyType: 'body' },
        },
        {
          id: 'chg-3',
          type: 'format',
          excerpt: 'Applied emphasis to heading',
          author: 'Alice',
          date: '2026-05-20T12:00:00Z',
          story: { kind: 'story', storyType: 'body' },
        },
      ],
    });
    const registry = getWorkflowPocToolRegistry();
    const trackChangesEntry = registry.get('superdoc_track_changes');
    expect(trackChangesEntry).toBeDefined();
    if (trackChangesEntry == null) return;

    const result = await trackChangesEntry.run({
      documentHandle: handle,
      args: {
        action: 'summary',
      },
    });

    expect(result.receipt.status).toBe('success');
    expect(result.receipt.phase).toBe('verify');
    expect(calls.trackChangesListCalls.length).toBeGreaterThanOrEqual(2);
    expect(calls.trackChangesGetCalls.map((call) => call.id)).toEqual(['chg-1', 'chg-2', 'chg-3']);

    const output = result.output as {
      execution?: {
        action?: string;
        total?: number;
        counts?: { insert?: number; delete?: number; format?: number };
        sample?: Array<{ id?: string; address?: string; author?: string }>;
        truncated?: boolean;
      };
      verification?: {
        passed?: boolean;
        checks?: { totalStable?: boolean; idsStable?: boolean; revisionStable?: boolean; sampleCount?: number };
      };
    };
    expect(output.execution?.action).toBe('summary');
    expect(output.execution?.total).toBe(3);
    expect(output.execution?.counts).toEqual({ insert: 1, delete: 1, format: 1 });
    expect(output.execution?.sample?.map((change) => change.id)).toEqual(['chg-1', 'chg-2', 'chg-3']);
    expect(output.execution?.sample?.every((change) => change.address === 'body')).toBe(true);
    expect(output.execution?.sample?.[0]?.author).toBe('Alice');
    expect(output.execution?.truncated).toBe(false);
    expect(output.verification?.passed).toBe(true);
    expect(output.verification?.checks?.totalStable).toBe(true);
    expect(output.verification?.checks?.idsStable).toBe(true);
    expect(output.verification?.checks?.revisionStable).toBe(true);
    expect(output.verification?.checks?.sampleCount).toBe(3);
  });

  test('superdoc_track_changes accept_all clears pending revisions and verifies the delta', async () => {
    const { handle, calls } = createMockHandle({
      trackedChanges: [
        {
          id: 'chg-accept-1',
          type: 'insert',
          excerpt: 'Inserted bullet item',
          story: { kind: 'story', storyType: 'body' },
        },
        {
          id: 'chg-accept-2',
          type: 'format',
          excerpt: 'Formatted heading',
          story: { kind: 'story', storyType: 'body' },
        },
      ],
    });
    const registry = getWorkflowPocToolRegistry();
    const trackChangesEntry = registry.get('superdoc_track_changes');
    expect(trackChangesEntry).toBeDefined();
    if (trackChangesEntry == null) return;

    const result = await trackChangesEntry.run({
      documentHandle: handle,
      args: {
        action: 'accept_all',
      },
    });

    expect(result.receipt.status).toBe('success');
    expect(calls.trackChangesDecideCalls).toEqual([{ decision: 'accept', targetScope: 'all', targetId: undefined }]);

    const listed = await handle.trackChanges.list({ in: 'all' });
    expect(listed.total).toBe(0);

    const output = result.output as {
      execution?: {
        action?: string;
        decision?: string;
        pendingBefore?: number;
        receipt?: { removedChangeIds?: string[] };
      };
      verification?: {
        passed?: boolean;
        checks?: { beforeTotal?: number; afterTotal?: number; removedIdsMatched?: boolean; revisionChanged?: boolean };
      };
    };
    expect(output.execution?.action).toBe('accept_all');
    expect(output.execution?.decision).toBe('accept');
    expect(output.execution?.pendingBefore).toBe(2);
    expect(output.execution?.receipt?.removedChangeIds).toEqual(['chg-accept-1', 'chg-accept-2']);
    expect(output.verification?.passed).toBe(true);
    expect(output.verification?.checks?.beforeTotal).toBe(2);
    expect(output.verification?.checks?.afterTotal).toBe(0);
    expect(output.verification?.checks?.removedIdsMatched).toBe(true);
    expect(output.verification?.checks?.revisionChanged).toBe(true);
  });

  test('shared receipt builders return stable structures', () => {
    const success = createWorkflowSuccessReceipt({
      toolName: 'superdoc_context',
      sessionKey: 'workflow-doc-1',
      message: 'ok',
      index: { revision: 'r1', blocks: 10, lists: 2, tables: 1 },
    });
    const notImplemented = createWorkflowNotImplementedReceipt({
      toolName: 'superdoc_context',
      sessionKey: 'workflow-doc-1',
      phase: 'execute',
      message: 'nyi',
      index: { revision: 'r1', blocks: 10, lists: 2, tables: 1 },
      details: { code: 'WORKFLOW_TOOL_EXECUTE_NOT_IMPLEMENTED' },
    });

    expect(success.status).toBe('success');
    expect(success.phase).toBe('verify');
    expect(notImplemented.status).toBe('not_implemented');
    expect(notImplemented.phase).toBe('execute');
  });
});

describe('workflow-poc dispatch', () => {
  test('returns superdoc_context output for workflow-poc profile', async () => {
    const { handle } = createMockHandle();
    const output = (await dispatchWorkflowPocTool(handle, 'superdoc_context', {
      target: { blockOrdinal: 3 },
      window: 1,
      verify: true,
    })) as {
      execution?: { mode?: string; focus?: { resolvedTarget?: { nodeId?: string } } };
      verification?: { requested?: boolean; revision?: string };
    };

    expect(output.execution?.mode).toBe('focused');
    expect(output.execution?.focus?.resolvedTarget?.nodeId).toBe('n-3');
    expect(output.verification?.requested).toBe(true);
    expect(output.verification?.revision).toBe('rev-1');
  });

  test('dispatches superdoc_text_transform output for workflow-poc profile', async () => {
    const { handle } = createMockHandle();
    const output = (await dispatchWorkflowPocTool(handle, 'superdoc_text_transform', {
      action: 'rewrite_block',
      target: { blockOrdinal: 3 },
      text: 'Retitled heading',
      changeMode: 'tracked',
    })) as {
      execution?: { action?: string; changeMode?: string; stepCount?: number };
      verification?: { passed?: boolean; deterministicTarget?: boolean };
    };

    expect(output.execution?.action).toBe('rewrite_block');
    expect(output.execution?.changeMode).toBe('tracked');
    expect(output.execution?.stepCount).toBe(1);
    expect(output.verification?.passed).toBe(true);
    expect(output.verification?.deterministicTarget).toBe(true);
  });

  test('dispatches superdoc_list_transform output for workflow-poc profile', async () => {
    const { handle } = createMockHandle();
    const output = (await dispatchWorkflowPocTool(handle, 'superdoc_list_transform', {
      action: 'insert_many',
      target: { listOrdinal: 7 },
      items: ['Dispatch item one', 'Dispatch item two'],
      changeMode: 'tracked',
    })) as {
      execution?: {
        action?: string;
        changeMode?: string;
        insertedCount?: number;
        trackedChangeRefs?: Array<{ entityId?: string }>;
      };
      verification?: { passed?: boolean };
    };

    expect(output.execution?.action).toBe('insert_many');
    expect(output.execution?.changeMode).toBe('tracked');
    expect(output.execution?.insertedCount).toBe(2);
    expect(output.execution?.trackedChangeRefs?.length).toBe(2);
    expect(output.verification?.passed).toBe(true);
  });

  test('dispatches superdoc_structure_insert output for workflow-poc profile', async () => {
    const { handle } = createMockHandle();
    const output = (await dispatchWorkflowPocTool(handle, 'superdoc_structure_insert', {
      action: 'insert_toc',
      placement: 'document_start',
    })) as {
      execution?: {
        action?: string;
        tocNodeId?: string;
        placement?: { mode?: string; at?: string; source?: string };
      };
      verification?: { passed?: boolean; checks?: { tocPresent?: boolean; placementSatisfied?: boolean } };
    };

    expect(output.execution?.action).toBe('insert_toc');
    expect(output.execution?.tocNodeId).toBe('n-toc-1');
    expect(output.execution?.placement?.mode).toBe('document');
    expect(output.execution?.placement?.at).toBe('document_start');
    expect(output.execution?.placement?.source).toBe('provided');
    expect(output.verification?.passed).toBe(true);
    expect(output.verification?.checks?.tocPresent).toBe(true);
    expect(output.verification?.checks?.placementSatisfied).toBe(true);
  });

  test('dispatches superdoc_media_insert output for workflow-poc profile', async () => {
    const { handle } = createMockHandle();
    const output = (await dispatchWorkflowPocTool(handle, 'superdoc_media_insert', {
      action: 'insert_image_with_caption',
      placement: 'document_start',
      caption: 'Figure 1. Attachment image',
    })) as {
      execution?: {
        action?: string;
        src?: string;
        imageId?: string;
        captionTargetImageId?: string;
        placement?: { mode?: string; at?: string; source?: string };
      };
      verification?: { passed?: boolean; checks?: { captionApplied?: boolean; placementSatisfied?: boolean } };
    };

    expect(output.execution?.action).toBe('insert_image_with_caption');
    expect(output.execution?.src).toBe('attachment');
    expect(output.execution?.imageId).toBe('img-1');
    expect(output.execution?.captionTargetImageId).toBe('img-1');
    expect(output.execution?.placement?.mode).toBe('document');
    expect(output.execution?.placement?.at).toBe('document_start');
    expect(output.execution?.placement?.source).toBe('provided');
    expect(output.verification?.passed).toBe(true);
    expect(output.verification?.checks?.captionApplied).toBe(true);
    expect(output.verification?.checks?.placementSatisfied).toBe(true);
  });

  test('dispatches superdoc_comment_pass output for workflow-poc profile', async () => {
    const { handle } = createMockHandle({
      blocks: [
        {
          ordinal: 1,
          nodeId: 'n-1',
          nodeType: 'paragraph',
          ref: 'ref:block:1',
          text: 'First eligible paragraph',
          styleId: 'BodyText',
        },
        {
          ordinal: 2,
          nodeId: 'n-2',
          nodeType: 'paragraph',
          ref: 'ref:block:2',
          text: 'Quoted paragraph should be skipped',
          styleId: 'IntenseQuote',
        },
        {
          ordinal: 3,
          nodeId: 'n-3',
          nodeType: 'paragraph',
          ref: 'ref:block:3',
          text: 'Second eligible paragraph',
          styleId: 'BodyText',
        },
      ],
    });
    const output = (await dispatchWorkflowPocTool(handle, 'superdoc_comment_pass', {
      action: 'comment_paragraphs',
      text: 'Dispatch review note',
      excludeStyleId: 'IntenseQuote',
    })) as {
      execution?: {
        action?: string;
        createdComments?: number;
        skipped?: { excludedStyle?: number };
      };
      verification?: {
        passed?: boolean;
        checks?: { verifiedComments?: number; skippedExcludedStyle?: number };
      };
    };

    expect(output.execution?.action).toBe('comment_paragraphs');
    expect(output.execution?.createdComments).toBe(2);
    expect(output.execution?.skipped?.excludedStyle).toBe(1);
    expect(output.verification?.passed).toBe(true);
    expect(output.verification?.checks?.verifiedComments).toBe(2);
    expect(output.verification?.checks?.skippedExcludedStyle).toBe(1);
  });

  test('dispatches superdoc_style_clone output for workflow-poc profile', async () => {
    const { handle } = createMockHandle({
      blocks: [
        {
          ordinal: 1,
          nodeId: 'n-1',
          nodeType: 'paragraph',
          ref: 'ref:block:1',
          text: 'Flagged',
        },
        {
          ordinal: 2,
          nodeId: 'n-2',
          nodeType: 'paragraph',
          ref: 'ref:block:2',
          text: 'Flagged',
        },
        {
          ordinal: 3,
          nodeId: 'n-3',
          nodeType: 'paragraph',
          ref: 'ref:block:3',
          text: 'Clear',
        },
      ],
    });
    const output = (await dispatchWorkflowPocTool(handle, 'superdoc_style_clone', {
      action: 'apply_color_to_matches',
      targetText: 'Flagged',
      color: 'cc0000',
      changeMode: 'tracked',
    })) as {
      execution?: {
        action?: string;
        changeMode?: string;
        appliedCount?: number;
        color?: string;
      };
      verification?: {
        passed?: boolean;
        checks?: { matchedBlocks?: number; verifiedBlocks?: number; revisionChanged?: boolean };
      };
    };

    expect(output.execution?.action).toBe('apply_color_to_matches');
    expect(output.execution?.changeMode).toBe('tracked');
    expect(output.execution?.appliedCount).toBe(2);
    expect(output.execution?.color).toBe('CC0000');
    expect(output.verification?.passed).toBe(true);
    expect(output.verification?.checks?.matchedBlocks).toBe(2);
    expect(output.verification?.checks?.verifiedBlocks).toBe(2);
    expect(output.verification?.checks?.revisionChanged).toBe(true);
  });

  test('dispatches superdoc_track_changes output for workflow-poc profile', async () => {
    const { handle } = createMockHandle({
      trackedChanges: [
        {
          id: 'chg-dispatch-1',
          type: 'delete',
          excerpt: 'Removed stale appendix row',
          story: { kind: 'story', storyType: 'body' },
        },
        {
          id: 'chg-dispatch-2',
          type: 'insert',
          excerpt: 'Added fresh KPI note',
          story: { kind: 'story', storyType: 'body' },
        },
      ],
    });
    const output = (await dispatchWorkflowPocTool(handle, 'superdoc_track_changes', {
      action: 'reject_all',
    })) as {
      execution?: {
        action?: string;
        decision?: string;
        pendingBefore?: number;
        receipt?: { removedChangeIds?: string[] };
      };
      verification?: {
        passed?: boolean;
        checks?: { beforeTotal?: number; afterTotal?: number; removedIdsMatched?: boolean; revisionChanged?: boolean };
      };
    };

    expect(output.execution?.action).toBe('reject_all');
    expect(output.execution?.decision).toBe('reject');
    expect(output.execution?.pendingBefore).toBe(2);
    expect(output.execution?.receipt?.removedChangeIds).toEqual(['chg-dispatch-1', 'chg-dispatch-2']);
    expect(output.verification?.passed).toBe(true);
    expect(output.verification?.checks?.beforeTotal).toBe(2);
    expect(output.verification?.checks?.afterTotal).toBe(0);
    expect(output.verification?.checks?.removedIdsMatched).toBe(true);
    expect(output.verification?.checks?.revisionChanged).toBe(true);
  });
});
