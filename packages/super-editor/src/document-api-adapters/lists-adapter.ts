import { v4 as uuidv4 } from 'uuid';
import type { Editor } from '../core/Editor.js';
import type {
  ListInsertInput,
  ListItemInfo,
  ListSetTypeInput,
  ListsExitResult,
  ListsGetInput,
  ListsInsertResult,
  ListsListQuery,
  ListsListResult,
  ListsMutateItemResult,
  ListTargetInput,
  MutationOptions,
} from '@superdoc/document-api';
import { DocumentApiAdapterError } from './errors.js';
import { clearIndexCache, getBlockIndex } from './helpers/index-cache.js';
import { collectTrackInsertRefsInRange } from './helpers/tracked-change-refs.js';
import {
  listItemProjectionToInfo,
  listListItems,
  resolveListItem,
  type ListItemProjection,
} from './helpers/list-item-resolver.js';
import { ListHelpers } from '../core/helpers/list-numbering-helpers.js';

type InsertListItemAtCommand = (options: {
  pos: number;
  position: 'before' | 'after';
  text?: string;
  sdBlockId?: string;
  tracked?: boolean;
}) => boolean;

type SetListTypeAtCommand = (options: { pos: number; kind: 'ordered' | 'bullet' }) => boolean;
type ExitListItemAtCommand = (options: { pos: number }) => boolean;
type SetTextSelectionCommand = (options: { from: number; to?: number }) => boolean;

function requireCommand<T>(command: T | undefined, message: string): T {
  if (command) return command;
  throw new DocumentApiAdapterError('COMMAND_UNAVAILABLE', message);
}

function toListsFailure(code: 'NO_OP' | 'INVALID_TARGET', message: string, details?: unknown) {
  return { success: false as const, failure: { code, message, details } };
}

function ensureDirectOnly(operation: string, options?: MutationOptions): void {
  const mode = options?.changeMode ?? 'direct';
  if (mode === 'direct') return;
  throw new DocumentApiAdapterError(
    'TRACK_CHANGE_COMMAND_UNAVAILABLE',
    `${operation} does not support tracked mode in v1.`,
  );
}

function ensureTrackedInsertCapability(editor: Editor, mode: 'direct' | 'tracked'): void {
  if (mode !== 'tracked') return;
  const hasTrackedInsertCommand = typeof editor.commands?.insertTrackedChange === 'function';
  if (!hasTrackedInsertCommand) {
    throw new DocumentApiAdapterError(
      'TRACK_CHANGE_COMMAND_UNAVAILABLE',
      'lists.insert tracked mode is not available on this editor instance.',
    );
  }
}

function resolveInsertedListItem(editor: Editor, sdBlockId: string): ListItemProjection {
  const index = getBlockIndex(editor);
  const byNodeId = index.candidates.find(
    (candidate) => candidate.nodeType === 'listItem' && candidate.nodeId === sdBlockId,
  );
  if (byNodeId) return resolveListItem(editor, { kind: 'block', nodeType: 'listItem', nodeId: byNodeId.nodeId });

  const bySdBlockId = index.candidates.find((candidate) => {
    if (candidate.nodeType !== 'listItem') return false;
    const attrs = (candidate.node as { attrs?: { sdBlockId?: unknown } }).attrs;
    return typeof attrs?.sdBlockId === 'string' && attrs.sdBlockId === sdBlockId;
  });

  if (bySdBlockId) {
    return resolveListItem(editor, { kind: 'block', nodeType: 'listItem', nodeId: bySdBlockId.nodeId });
  }

  throw new DocumentApiAdapterError(
    'TARGET_NOT_FOUND',
    `Inserted list item with sdBlockId "${sdBlockId}" could not be resolved after insertion.`,
  );
}

function selectionAnchorPos(item: ListItemProjection): number {
  return item.candidate.pos + 1;
}

function setSelectionToListItem(editor: Editor, item: ListItemProjection): boolean {
  const setTextSelection = requireCommand<SetTextSelectionCommand>(
    editor.commands?.setTextSelection as SetTextSelectionCommand | undefined,
    'List selection command is not available on this editor instance.',
  );
  const anchor = selectionAnchorPos(item);
  return Boolean(setTextSelection({ from: anchor, to: anchor }));
}

function isAtMaximumLevel(editor: Editor, item: ListItemProjection): boolean {
  if (item.numId == null || item.level == null) return false;
  return !ListHelpers.hasListDefinition(editor, item.numId, item.level + 1);
}

function isRestartNoOp(editor: Editor, item: ListItemProjection): boolean {
  if (item.ordinal !== 1) return false;
  if (item.numId == null) return false;

  const index = getBlockIndex(editor);
  const currentIndex = index.candidates.findIndex(
    (candidate) => candidate.nodeType === 'listItem' && candidate.nodeId === item.address.nodeId,
  );
  if (currentIndex <= 0) return true;

  for (let cursor = currentIndex - 1; cursor >= 0; cursor -= 1) {
    const previous = index.candidates[cursor]!;
    if (previous.node.type.name !== 'paragraph') {
      return true;
    }
    if (previous.nodeType !== 'listItem') {
      return true;
    }

    const previousProjection = resolveListItem(editor, {
      kind: 'block',
      nodeType: 'listItem',
      nodeId: previous.nodeId,
    });

    return previousProjection.numId !== item.numId;
  }

  return true;
}

function withListTarget(editor: Editor, input: ListTargetInput): ListItemProjection {
  return resolveListItem(editor, input.target);
}

export function listsListAdapter(editor: Editor, query?: ListsListQuery): ListsListResult {
  return listListItems(editor, query);
}

export function listsGetAdapter(editor: Editor, input: ListsGetInput): ListItemInfo {
  const item = resolveListItem(editor, input.address);
  return listItemProjectionToInfo(item);
}

export function listsInsertAdapter(
  editor: Editor,
  input: ListInsertInput,
  options?: MutationOptions,
): ListsInsertResult {
  const target = withListTarget(editor, { target: input.target });
  const changeMode = options?.changeMode ?? 'direct';
  const mode = changeMode === 'tracked' ? 'tracked' : 'direct';
  ensureTrackedInsertCapability(editor, mode);

  const insertListItemAt = requireCommand<InsertListItemAtCommand>(
    editor.commands?.insertListItemAt as InsertListItemAtCommand | undefined,
    'Insert list item command is not available on this editor instance.',
  );

  if (options?.dryRun) {
    return {
      success: true,
      item: { kind: 'block', nodeType: 'listItem', nodeId: '(dry-run)' },
      insertionPoint: {
        kind: 'text',
        blockId: '(dry-run)',
        range: { start: 0, end: 0 },
      },
    };
  }

  const createdId = uuidv4();
  const didApply = insertListItemAt({
    pos: target.candidate.pos,
    position: input.position,
    text: input.text ?? '',
    sdBlockId: createdId,
    tracked: mode === 'tracked',
  });

  if (!didApply) {
    return toListsFailure('INVALID_TARGET', 'List item insertion could not be applied at the requested target.', {
      target: input.target,
      position: input.position,
    });
  }

  clearIndexCache(editor);

  let created: ListItemProjection;
  try {
    created = resolveInsertedListItem(editor, createdId);
  } catch {
    // Insertion succeeded but the new item could not be located in the index.
    // Return a degraded success with the generated sdBlockId as the address.
    return {
      success: true,
      item: { kind: 'block', nodeType: 'listItem', nodeId: createdId },
      insertionPoint: {
        kind: 'text',
        blockId: createdId,
        range: { start: 0, end: 0 },
      },
    };
  }

  return {
    success: true,
    item: created.address,
    insertionPoint: {
      kind: 'text',
      blockId: created.address.nodeId,
      range: { start: 0, end: 0 },
    },
    trackedChangeRefs:
      mode === 'tracked'
        ? collectTrackInsertRefsInRange(editor, created.candidate.pos, created.candidate.end)
        : undefined,
  };
}

export function listsSetTypeAdapter(
  editor: Editor,
  input: ListSetTypeInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  ensureDirectOnly('lists.setType', options);
  const target = withListTarget(editor, { target: input.target });
  if (target.kind === input.kind) {
    return toListsFailure('NO_OP', 'List item already has the requested list kind.', {
      target: input.target,
      kind: input.kind,
    });
  }

  const setListTypeAt = requireCommand<SetListTypeAtCommand>(
    editor.commands?.setListTypeAt as SetListTypeAtCommand | undefined,
    'Set list type command is not available on this editor instance.',
  );

  if (options?.dryRun) {
    return { success: true, item: target.address };
  }

  const didApply = setListTypeAt({
    pos: target.candidate.pos,
    kind: input.kind,
  });

  if (!didApply) {
    return toListsFailure('INVALID_TARGET', 'List type conversion could not be applied.', {
      target: input.target,
      kind: input.kind,
    });
  }

  return {
    success: true,
    item: target.address,
  };
}

export function listsIndentAdapter(
  editor: Editor,
  input: ListTargetInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  ensureDirectOnly('lists.indent', options);
  const target = withListTarget(editor, input);
  if (isAtMaximumLevel(editor, target)) {
    return toListsFailure('NO_OP', 'List item is already at the maximum supported level.', { target: input.target });
  }

  const increaseListIndent = requireCommand<() => boolean>(
    editor.commands?.increaseListIndent as (() => boolean) | undefined,
    'Increase list indent command is not available on this editor instance.',
  );

  if (options?.dryRun) {
    return { success: true, item: target.address };
  }

  if (!setSelectionToListItem(editor, target)) {
    return toListsFailure('INVALID_TARGET', 'List item target could not be selected for indentation.', {
      target: input.target,
    });
  }

  const didApply = increaseListIndent();
  if (!didApply) {
    return toListsFailure('INVALID_TARGET', 'List indentation could not be applied.', { target: input.target });
  }

  return {
    success: true,
    item: target.address,
  };
}

export function listsOutdentAdapter(
  editor: Editor,
  input: ListTargetInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  ensureDirectOnly('lists.outdent', options);
  const target = withListTarget(editor, input);
  if ((target.level ?? 0) <= 0) {
    return toListsFailure('NO_OP', 'List item is already at level 0.', { target: input.target });
  }

  const decreaseListIndent = requireCommand<() => boolean>(
    editor.commands?.decreaseListIndent as (() => boolean) | undefined,
    'Decrease list indent command is not available on this editor instance.',
  );

  if (options?.dryRun) {
    return { success: true, item: target.address };
  }

  if (!setSelectionToListItem(editor, target)) {
    return toListsFailure('INVALID_TARGET', 'List item target could not be selected for outdent.', {
      target: input.target,
    });
  }

  const didApply = decreaseListIndent();
  if (!didApply) {
    return toListsFailure('INVALID_TARGET', 'List outdent could not be applied.', { target: input.target });
  }

  return {
    success: true,
    item: target.address,
  };
}

export function listsRestartAdapter(
  editor: Editor,
  input: ListTargetInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  ensureDirectOnly('lists.restart', options);
  const target = withListTarget(editor, input);
  if (target.numId == null) {
    return toListsFailure('INVALID_TARGET', 'List restart requires numbering metadata on the target item.', {
      target: input.target,
    });
  }
  if (isRestartNoOp(editor, target)) {
    return toListsFailure('NO_OP', 'List item is already the start of a sequence that effectively starts at 1.', {
      target: input.target,
    });
  }

  const restartNumbering = requireCommand<() => boolean>(
    editor.commands?.restartNumbering as (() => boolean) | undefined,
    'Restart numbering command is not available on this editor instance.',
  );

  if (options?.dryRun) {
    return { success: true, item: target.address };
  }

  if (!setSelectionToListItem(editor, target)) {
    return toListsFailure('INVALID_TARGET', 'List item target could not be selected for restart.', {
      target: input.target,
    });
  }

  const didApply = restartNumbering();
  if (!didApply) {
    return toListsFailure('INVALID_TARGET', 'List restart could not be applied.', { target: input.target });
  }

  return {
    success: true,
    item: target.address,
  };
}

export function listsExitAdapter(editor: Editor, input: ListTargetInput, options?: MutationOptions): ListsExitResult {
  ensureDirectOnly('lists.exit', options);
  const target = withListTarget(editor, input);

  const exitListItemAt = requireCommand<ExitListItemAtCommand>(
    editor.commands?.exitListItemAt as ExitListItemAtCommand | undefined,
    'Exit list item command is not available on this editor instance.',
  );

  if (options?.dryRun) {
    return {
      success: true,
      paragraph: {
        kind: 'block',
        nodeType: 'paragraph',
        nodeId: '(dry-run)',
      },
    };
  }

  const didApply = exitListItemAt({ pos: target.candidate.pos });
  if (!didApply) {
    return toListsFailure('INVALID_TARGET', 'List exit could not be applied.', { target: input.target });
  }

  return {
    success: true,
    paragraph: {
      kind: 'block',
      nodeType: 'paragraph',
      nodeId: target.address.nodeId,
    },
  };
}
