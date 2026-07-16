/**
 * Lists convenience wrappers — bridge list operations to the plan engine's
 * revision management and execution path.
 *
 * Read operations (list, get, canJoin, canContinuePrevious) are pure queries.
 * Mutating operations delegate to editor commands / direct PM transactions
 * with plan-engine revision tracking.
 */

import { v4 as uuidv4 } from 'uuid';
import type { Editor } from '../../core/Editor.js';
import type {
  ListInsertInput,
  ListItemInfo,
  ListsGetInput,
  ListsInsertResult,
  ListsListQuery,
  ListsListResult,
  ListsMutateItemResult,
  ListTargetInput,
  ListsCreateInput,
  ListsCreateResult,
  ListsAttachInput,
  ListsDetachInput,
  ListsDetachResult,
  ListsDeleteInput,
  ListsDeleteResult,
  ListsJoinInput,
  ListsJoinResult,
  ListsCanJoinInput,
  ListsCanJoinResult,
  ListsSeparateInput,
  ListsSeparateResult,
  ListsMergeInput,
  ListsMergeResult,
  ListsSplitInput,
  ListsSplitResult,
  ListsSetLevelInput,
  ListsSetValueInput,
  ListsContinuePreviousInput,
  ListsCanContinuePreviousInput,
  ListsCanContinuePreviousResult,
  ListsSetLevelRestartInput,
  ListsConvertToTextInput,
  ListsConvertToTextResult,
  ListTemplate,
  ListPresetId,
  MutationOptions,
  ReceiptFailureCode,
  PlanReceipt,
} from '@superdoc/document-api';
import { DocumentApiAdapterError } from '../errors.js';
import { requireEditorCommand, ensureTrackedCapability, rejectTrackedMode } from '../helpers/mutation-helpers.js';
import { executeDomainCommand } from './plan-wrappers.js';
import { compoundMutation } from '../../core/parts/mutation/compound-mutation.js';
import { clearIndexCache, getBlockIndex } from '../helpers/index-cache.js';
import { collectTrackInsertRefsInRange } from '../helpers/tracked-change-refs.js';
import {
  listItemProjectionToInfo,
  listListItems,
  resolveListItem,
  type ListItemProjection,
} from '../helpers/list-item-resolver.js';
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
  findPreviousCompatibleSequence,
  evaluateCanJoin,
  evaluateCanContinuePrevious,
} from '../helpers/list-sequence-helpers.js';
import { ListHelpers } from '../../core/helpers/list-numbering-helpers.js';
import { LevelFormattingHelpers } from '../../core/helpers/list-level-formatting-helpers.js';
import { updateNumberingProperties } from '../../core/commands/changeListLevel.js';
import { syncNumberingToXmlTree } from '../../core/parts/adapters/numbering-part-descriptor.js';
import { getPart } from '../../core/parts/store/part-store.js';
import type { PartId } from '../../core/parts/types.js';

// ---------------------------------------------------------------------------
// Command types
// ---------------------------------------------------------------------------

type InsertListItemAtCommand = (options: {
  pos: number;
  position: 'before' | 'after';
  text?: string;
  sdBlockId?: string;
  paraId?: string;
  tracked?: boolean;
}) => boolean;

type SetTextSelectionCommand = (options: { from: number; to?: number }) => boolean;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function toListsFailure(code: ReceiptFailureCode, message: string, details?: unknown) {
  return { success: false as const, failure: { code, message, details } };
}

function dispatchEditorTransaction(editor: Editor, tr: unknown): void {
  if (typeof editor.dispatch === 'function') {
    editor.dispatch(tr as Parameters<Editor['dispatch']>[0]);
    return;
  }
  if (typeof editor.view?.dispatch === 'function') {
    editor.view.dispatch(tr as Parameters<NonNullable<Editor['view']>['dispatch']>[0]);
    return;
  }
  throw new DocumentApiAdapterError(
    'INTERNAL_ERROR',
    'Cannot apply list mutation because no transaction dispatcher is available.',
    { reason: 'missing_dispatch' },
  );
}

type NumberingModel = Parameters<typeof syncNumberingToXmlTree>[1];

function getConverterNumbering(editor: Editor): NumberingModel {
  return (
    editor as unknown as {
      converter?: { numbering: NumberingModel };
    }
  ).converter!.numbering;
}

/**
 * Execute a domain command with automatic numbering rollback.
 *
 * Wraps the handler in a compound mutation that snapshots
 * `word/numbering.xml` and converter metadata. If the PM dispatch
 * inside the handler fails, all numbering changes are rolled back.
 */
function executeDomainCommandWithRollback(
  editor: Editor,
  handler: () => boolean,
  options?: { expectedRevision?: string },
): PlanReceipt {
  let receipt!: PlanReceipt;
  compoundMutation({
    editor,
    source: 'lists',
    affectedParts: ['word/numbering.xml'],
    execute() {
      receipt = executeDomainCommand(editor, handler, options);
      return receipt.steps[0]?.effect === 'changed';
    },
  });
  return receipt;
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

// paraId survives OOXML roundtrips (written as w14:paraId on export); sdBlockId
// does not. Generate an 8-char hex paraId alongside sdBlockId so newly-inserted
// items have a stable public identity that persists across save/reload cycles.
function generateRuntimeParaId(): string {
  return uuidv4().replace(/-/g, '').slice(0, 8).toUpperCase();
}

function withListTarget(editor: Editor, input: ListTargetInput): ListItemProjection {
  return resolveListItem(editor, input.target);
}

function hasLevelOverride(editor: Editor, numId: number, level: number): boolean {
  const converter = editor as unknown as {
    converter?: {
      numbering?: {
        definitions?: Record<number, { elements?: Array<{ name?: string; attributes?: Record<string, unknown> }> }>;
      };
    };
  };
  const definition = converter.converter?.numbering?.definitions?.[numId];
  const ilvl = String(level);
  return (
    definition?.elements?.some(
      (element) => element.name === 'w:lvlOverride' && element.attributes?.['w:ilvl'] === ilvl,
    ) ?? false
  );
}

/**
 * Shared core of setLevel, indent, and outdent.
 * Validates preconditions and performs the level change.
 */
function executeSetLevel(
  editor: Editor,
  target: ListItemProjection,
  newLevel: number,
  options?: MutationOptions,
): ListsMutateItemResult {
  if (target.numId == null) {
    return toListsFailure('INVALID_TARGET', 'Target must have numbering metadata.', {
      target: target.address,
    });
  }

  if (newLevel < 0 || newLevel > 8) {
    return toListsFailure('LEVEL_OUT_OF_RANGE', 'Level must be between 0 and 8.', { level: newLevel });
  }

  if (target.level === newLevel) {
    return toListsFailure('NO_OP', 'Item is already at the requested level.', {
      target: target.address,
      level: newLevel,
    });
  }

  if (!ListHelpers.hasListDefinition(editor, target.numId, newLevel)) {
    return toListsFailure('LEVEL_OUT_OF_RANGE', 'Target level is not defined in the active numbering definition.', {
      target: target.address,
      level: newLevel,
    });
  }

  if (options?.dryRun) {
    return { success: true, item: target.address };
  }

  const receipt = executeDomainCommand(
    editor,
    () => {
      const { tr } = editor.state;
      updateNumberingProperties(
        { numId: target.numId!, ilvl: newLevel },
        target.candidate.node,
        target.candidate.pos,
        editor,
        tr,
      );
      dispatchEditorTransaction(editor, tr);
      clearIndexCache(editor);
      return true;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (receipt.steps[0]?.effect !== 'changed') {
    return toListsFailure('INVALID_TARGET', 'Level change could not be applied.', {
      target: target.address,
      level: newLevel,
    });
  }

  return { success: true, item: target.address };
}

/**
 * Determine if a target is a BlockRange (has `from` property) or a single BlockAddress.
 */
function isBlockRange(target: unknown): target is { from: { nodeId: string }; to: { nodeId: string } } {
  return typeof target === 'object' && target !== null && 'from' in target;
}

// ---------------------------------------------------------------------------
// Read operations (queries)
// ---------------------------------------------------------------------------

export function listsListWrapper(editor: Editor, query?: ListsListQuery): ListsListResult {
  return listListItems(editor, query);
}

export function listsGetWrapper(editor: Editor, input: ListsGetInput): ListItemInfo {
  const item = resolveListItem(editor, input.address);
  return listItemProjectionToInfo(item, computeSequenceId(editor, item));
}

export function listsCanJoinWrapper(editor: Editor, input: ListsCanJoinInput): ListsCanJoinResult {
  const target = resolveListItem(editor, input.target);
  return evaluateCanJoin(editor, target, input.direction);
}

export function listsCanContinuePreviousWrapper(
  editor: Editor,
  input: ListsCanContinuePreviousInput,
): ListsCanContinuePreviousResult {
  const target = resolveListItem(editor, input.target);
  return evaluateCanContinuePrevious(editor, target);
}

// ---------------------------------------------------------------------------
// Kept mutations (insert, indent, outdent)
// ---------------------------------------------------------------------------

export function listsInsertWrapper(
  editor: Editor,
  input: ListInsertInput,
  options?: MutationOptions,
): ListsInsertResult {
  const target = withListTarget(editor, input);
  const changeMode = options?.changeMode ?? 'direct';
  const mode = changeMode === 'tracked' ? 'tracked' : 'direct';
  if (mode === 'tracked') ensureTrackedCapability(editor, { operation: 'lists.insert' });

  const insertListItemAt = requireEditorCommand(
    editor.commands?.insertListItemAt as InsertListItemAtCommand | undefined,
    'lists.insert (insertListItemAt)',
  ) as InsertListItemAtCommand;

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
  const createdParaId = generateRuntimeParaId();
  let created: ListItemProjection | null = null;

  const receipt = executeDomainCommand(
    editor,
    () => {
      const didApply = insertListItemAt({
        pos: target.candidate.pos,
        position: input.position,
        text: input.text ?? '',
        sdBlockId: createdId,
        paraId: createdParaId,
        tracked: mode === 'tracked',
      });
      if (didApply) {
        clearIndexCache(editor);
        try {
          created = resolveInsertedListItem(editor, createdId);
        } catch {
          /* fallback below */
        }
      }
      return didApply;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (receipt.steps[0]?.effect !== 'changed') {
    return toListsFailure('INVALID_TARGET', 'List item insertion could not be applied at the requested target.', {
      target: input.target,
      position: input.position,
    });
  }

  // TypeScript cannot track closure mutations — cast after the null guard.
  const resolved = created as ListItemProjection | null;

  if (!resolved) {
    // paraId (not sdBlockId) survives OOXML roundtrips, so the caller can reuse it.
    return {
      success: true,
      item: { kind: 'block', nodeType: 'listItem', nodeId: createdParaId },
      insertionPoint: {
        kind: 'text',
        blockId: createdParaId,
        range: { start: 0, end: 0 },
      },
    };
  }

  return {
    success: true,
    item: resolved.address,
    insertionPoint: {
      kind: 'text',
      blockId: resolved.address.nodeId,
      range: { start: 0, end: 0 },
    },
    trackedChangeRefs:
      mode === 'tracked'
        ? collectTrackInsertRefsInRange(editor, resolved.candidate.pos, resolved.candidate.end)
        : undefined,
  };
}

export function listsIndentWrapper(
  editor: Editor,
  input: ListTargetInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  rejectTrackedMode('lists.indent', options);
  const target = withListTarget(editor, input);
  const currentLevel = target.level ?? 0;
  return executeSetLevel(editor, target, currentLevel + 1, options);
}

export function listsOutdentWrapper(
  editor: Editor,
  input: ListTargetInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  rejectTrackedMode('lists.outdent', options);
  const target = withListTarget(editor, input);
  const currentLevel = target.level ?? 0;
  if (currentLevel <= 0) {
    return toListsFailure('NO_OP', 'List item is already at level 0.', { target: input.target });
  }
  return executeSetLevel(editor, target, currentLevel - 1, options);
}

// ---------------------------------------------------------------------------
// New SD-1272 mutations
// ---------------------------------------------------------------------------

/** Ordered presets map to 'ordered' kind, bullet presets to 'bullet'. */
const PRESET_KIND_MAP: Record<string, 'ordered' | 'bullet'> = {
  decimal: 'ordered',
  decimalParenthesis: 'ordered',
  lowerLetter: 'ordered',
  upperLetter: 'ordered',
  lowerRoman: 'ordered',
  upperRoman: 'ordered',
  disc: 'bullet',
  circle: 'bullet',
  square: 'bullet',
  dash: 'bullet',
};

/**
 * Resolve the effective list kind from the create input.
 * Returns the kind or a failure result.
 */
function resolveCreateKind(input: ListsCreateInput): { kind: 'ordered' | 'bullet' } | { failure: ListsCreateResult } {
  const raw = input as Record<string, unknown>;

  // style and preset cannot both be provided
  if (raw.style != null && raw.preset != null) {
    return { failure: toListsFailure('INVALID_INPUT', 'Cannot provide both style and preset.', {}) };
  }

  if (raw.preset != null) {
    const presetKind = PRESET_KIND_MAP[raw.preset as string];
    if (!presetKind) {
      return { failure: toListsFailure('INVALID_INPUT', `Unknown preset: ${raw.preset}.`, { preset: raw.preset }) };
    }
    if (raw.kind != null && raw.kind !== presetKind) {
      return {
        failure: toListsFailure(
          'INVALID_INPUT',
          `Preset kind (${presetKind}) conflicts with provided kind (${raw.kind}).`,
          {
            preset: raw.preset,
            kind: raw.kind,
          },
        ),
      };
    }
    return { kind: presetKind };
  }

  if (raw.style != null) {
    // When style is provided, kind is required
    if (raw.kind == null) {
      return { failure: toListsFailure('INVALID_INPUT', 'kind is required when style is provided.', {}) };
    }
    return { kind: raw.kind as 'ordered' | 'bullet' };
  }

  // Neither style nor preset — kind is required
  if (raw.kind == null) {
    return {
      failure: toListsFailure('INVALID_INPUT', 'kind is required when neither preset nor style is provided.', {}),
    };
  }
  return { kind: raw.kind as 'ordered' | 'bullet' };
}

function isListKind(value: unknown): value is 'ordered' | 'bullet' {
  return value === 'ordered' || value === 'bullet';
}

export function listsCreateWrapper(
  editor: Editor,
  input: ListsCreateInput,
  options?: MutationOptions,
): ListsCreateResult {
  rejectTrackedMode('lists.create', options);

  // Runtime guard: the TypeScript union enforces mode-conditional fields at compile time,
  // but JSON/HTTP callers bypass that. Validate before destructuring.
  const raw = input as Record<string, unknown>;
  if (input.mode === 'empty' && raw.at == null) {
    return toListsFailure('INVALID_TARGET', 'Mode "empty" requires an "at" field.', { mode: 'empty' });
  }
  if (input.mode === 'fromParagraphs' && raw.target == null) {
    return toListsFailure('INVALID_TARGET', 'Mode "fromParagraphs" requires a "target" field.', {
      mode: 'fromParagraphs',
    });
  }

  const level = input.level ?? 0;
  if (level < 0 || level > 8) {
    return toListsFailure('LEVEL_OUT_OF_RANGE', 'Level must be between 0 and 8.', { level });
  }

  // Resolve style template to apply (if any)
  let styleTemplate: ListTemplate | undefined;
  if (raw.style != null) {
    styleTemplate = raw.style as ListTemplate;
    if (styleTemplate.version !== 1) {
      return toListsFailure('INVALID_INPUT', 'Unsupported style version.', { version: styleTemplate.version });
    }
  } else if (raw.preset != null) {
    styleTemplate = LevelFormattingHelpers.getPresetTemplate(raw.preset as string) as ListTemplate | undefined;
    if (!styleTemplate) {
      return toListsFailure('INVALID_INPUT', `Unknown preset: ${raw.preset}.`, { preset: raw.preset });
    }
  }

  // Resolve target blocks — narrowing via the mode discriminant
  let blocks: ReturnType<typeof resolveBlock>[];
  if (input.mode === 'empty') {
    blocks = [resolveBlock(editor, input.at.nodeId)];
  } else {
    blocks = isBlockRange(input.target)
      ? resolveBlocksInRange(editor, input.target.from.nodeId, input.target.to.nodeId)
      : [resolveBlock(editor, input.target.nodeId)];
  }

  if (blocks.length === 0) {
    return toListsFailure('INVALID_TARGET', 'No paragraphs found in the specified range.', {});
  }

  const alreadyListItem = blocks.find((t) => t.nodeType === 'listItem');
  if (alreadyListItem) {
    return toListsFailure('INVALID_TARGET', 'One or more target paragraphs are already list items.', {
      nodeId: alreadyListItem.nodeId,
    });
  }

  if (options?.dryRun) {
    return {
      success: true,
      listId: '(dry-run)',
      item: { kind: 'block', nodeType: 'listItem', nodeId: blocks[0]!.nodeId },
    };
  }

  // Sequence mode resolution
  const sequenceInput = (raw.sequence as { mode: string; startAt?: number } | undefined) ?? { mode: 'new' };
  const requestedKind = raw.kind;
  if (requestedKind != null && !isListKind(requestedKind)) {
    return toListsFailure('INVALID_INPUT', `Unknown list kind: ${String(requestedKind)}.`, { kind: requestedKind });
  }

  let kind: 'ordered' | 'bullet' | undefined;
  let listType: 'orderedList' | 'bulletList' | undefined;

  if (sequenceInput.mode !== 'continuePrevious') {
    const kindResult = resolveCreateKind(input);
    if ('failure' in kindResult) return kindResult.failure;
    kind = kindResult.kind;
    listType = kind === 'ordered' ? 'orderedList' : 'bulletList';
  } else {
    kind = requestedKind as 'ordered' | 'bullet' | undefined;
  }

  // Pre-flight continuePrevious compatibility BEFORE any mutations.
  // continuePrevious binds the new paragraphs to an existing sequence's
  // numId — applying a different style/preset is contradictory since the
  // formatting comes from the previous sequence's definition.
  let continuePreviousNumId: number | undefined;
  if (sequenceInput.mode === 'continuePrevious') {
    if (styleTemplate) {
      return toListsFailure(
        'INVALID_INPUT',
        'preset/style cannot be combined with sequence.mode "continuePrevious". ' +
          'The new items inherit formatting from the previous sequence.',
        {},
      );
    }

    const allItems = getAllListItemProjections(editor);
    const firstBlockPos = blocks[0]!.pos;
    for (let i = allItems.length - 1; i >= 0; i--) {
      const item = allItems[i]!;
      if (item.candidate.pos >= firstBlockPos) continue;
      if (item.numId == null) continue;
      if (kind != null && item.kind !== kind) continue;
      continuePreviousNumId = item.numId;
      break;
    }
    if (continuePreviousNumId == null) {
      return toListsFailure('NO_COMPATIBLE_PREVIOUS', 'No compatible previous list sequence found.', {});
    }
  }

  let numId: number | undefined;

  const receipt = executeDomainCommandWithRollback(
    editor,
    () => {
      if (sequenceInput.mode === 'continuePrevious') {
        // Use the previous sequence's numId directly — no fresh allocation,
        // no orphan definitions. Style/preset is NOT applied to the previous
        // sequence (the plan says preset/style applies to the new list only,
        // not as a constraint on the previous sequence's formatting).
        numId = continuePreviousNumId!;

        const { tr } = editor.state;
        for (const block of blocks) {
          updateNumberingProperties({ numId, ilvl: level }, block.node, block.pos, editor, tr);
        }
        dispatchEditorTransaction(editor, tr);
        clearIndexCache(editor);
      } else {
        // mode: 'new' — allocate a fresh definition
        numId = ListHelpers.getNewListId(editor);
        ListHelpers.generateNewListDefinition({ numId, listType: listType!, editor });

        // Apply style/preset template if provided
        if (styleTemplate) {
          const abstractNumId = getAbstractNumId(editor, numId!);
          if (abstractNumId != null) {
            LevelFormattingHelpers.applyTemplateToAbstract(editor, abstractNumId, styleTemplate, undefined);
            const numberingPart = getPart(editor, 'word/numbering.xml' as PartId);
            if (numberingPart) {
              syncNumberingToXmlTree(numberingPart, getConverterNumbering(editor));
            }
          }
        }

        // Convert paragraphs to list items
        const { tr } = editor.state;
        for (const block of blocks) {
          updateNumberingProperties({ numId: numId!, ilvl: level }, block.node, block.pos, editor, tr);
        }
        dispatchEditorTransaction(editor, tr);
        clearIndexCache(editor);

        if (sequenceInput.startAt != null) {
          ListHelpers.setLvlOverride(editor, numId!, level, { startOverride: sequenceInput.startAt });
        }
      }

      return true;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (receipt.steps[0]?.effect !== 'changed') {
    return toListsFailure('INVALID_TARGET', 'List creation could not be applied.', { mode: input.mode });
  }

  return {
    success: true,
    listId: `${numId!}:${blocks[0]!.nodeId}`,
    item: { kind: 'block', nodeType: 'listItem', nodeId: blocks[0]!.nodeId },
  };
}

export function listsAttachWrapper(
  editor: Editor,
  input: ListsAttachInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  // Tracked mode is supported for attach: the former (unnumbered) paragraph
  // properties are recorded as a w:pPrChange so accept/reject toggles the
  // numbering. (Other list ops still reject tracked mode.)
  const trackChange = (options?.changeMode ?? 'direct') === 'tracked';
  // A tracked pPrChange carries author/date revision metadata; require a
  // configured user so we never stamp a blank author (mirrors the ins/del and
  // lists.insert tracked paths — never allow a tracked change with no author).
  if (trackChange) ensureTrackedCapability(editor, { operation: 'lists.attach' });

  const attachTo = resolveListItem(editor, input.attachTo);
  if (attachTo.numId == null) {
    return toListsFailure('INVALID_TARGET', 'attachTo target must be a list item with numbering metadata.', {
      attachTo: input.attachTo,
    });
  }

  const numId = attachTo.numId;
  const level = input.level ?? attachTo.level ?? 0;

  const targets = isBlockRange(input.target)
    ? resolveBlocksInRange(editor, input.target.from.nodeId, input.target.to.nodeId)
    : [resolveBlock(editor, (input.target as { nodeId: string }).nodeId)];

  if (targets.length === 0) {
    return toListsFailure('INVALID_TARGET', 'No paragraphs found in the specified target.', { target: input.target });
  }

  const alreadyListItem = targets.find((t) => t.nodeType === 'listItem');
  if (alreadyListItem) {
    return toListsFailure('INVALID_TARGET', 'Target paragraphs are already list items.', {
      nodeId: alreadyListItem.nodeId,
    });
  }

  if (options?.dryRun) {
    return { success: true, item: { kind: 'block', nodeType: 'listItem', nodeId: targets[0]!.nodeId } };
  }

  const receipt = executeDomainCommand(
    editor,
    () => {
      const { tr } = editor.state;
      for (const block of targets) {
        updateNumberingProperties({ numId, ilvl: level }, block.node, block.pos, editor, tr, { trackChange });
      }
      dispatchEditorTransaction(editor, tr);
      clearIndexCache(editor);
      return true;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (receipt.steps[0]?.effect !== 'changed') {
    return toListsFailure('INVALID_TARGET', 'List attachment could not be applied.', { target: input.target });
  }

  return { success: true, item: { kind: 'block', nodeType: 'listItem', nodeId: targets[0]!.nodeId } };
}

export function listsDetachWrapper(
  editor: Editor,
  input: ListsDetachInput,
  options?: MutationOptions,
): ListsDetachResult {
  rejectTrackedMode('lists.detach', options);
  const target = resolveListItem(editor, input.target);

  if (options?.dryRun) {
    return { success: true, paragraph: { kind: 'block', nodeType: 'paragraph', nodeId: target.address.nodeId } };
  }

  const receipt = executeDomainCommand(
    editor,
    () => {
      const { tr } = editor.state;
      updateNumberingProperties(null, target.candidate.node, target.candidate.pos, editor, tr);
      dispatchEditorTransaction(editor, tr);
      clearIndexCache(editor);
      return true;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (receipt.steps[0]?.effect !== 'changed') {
    return toListsFailure('INVALID_TARGET', 'List detach could not be applied.', { target: input.target });
  }

  return { success: true, paragraph: { kind: 'block', nodeType: 'paragraph', nodeId: target.address.nodeId } };
}

/**
 * lists.delete — delete the entire list that contains the targeted item.
 * Walks the contiguous numbered sequence and removes every item (and its
 * content) as a block. Returns the count of removed items.
 */
export function listsDeleteWrapper(
  editor: Editor,
  input: ListsDeleteInput,
  options?: MutationOptions,
): ListsDeleteResult {
  rejectTrackedMode('lists.delete', options);
  const target = resolveListItem(editor, input.target);
  const sequence = getContiguousSequence(editor, target);
  if (sequence.length === 0) {
    return toListsFailure('INVALID_TARGET', 'List sequence could not be resolved.', { target: input.target });
  }

  if (options?.dryRun) {
    return { success: true, deletedCount: sequence.length };
  }

  const receipt = executeDomainCommand(
    editor,
    () => {
      const { tr } = editor.state;
      // Delete in reverse so earlier positions stay valid as we mutate.
      const sortedDesc = [...sequence].sort((a, b) => b.candidate.pos - a.candidate.pos);
      for (const item of sortedDesc) {
        const start = item.candidate.pos;
        const end = start + item.candidate.node.nodeSize;
        // Re-resolve the position through prior mappings.
        const mappedStart = tr.mapping.map(start, -1);
        const mappedEnd = tr.mapping.map(end, 1);
        if (mappedEnd > mappedStart) tr.delete(mappedStart, mappedEnd);
      }
      dispatchEditorTransaction(editor, tr);
      clearIndexCache(editor);
      return true;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (receipt.steps[0]?.effect !== 'changed') {
    return toListsFailure('INVALID_TARGET', 'List deletion could not be applied.', { target: input.target });
  }

  return { success: true, deletedCount: sequence.length };
}

export function listsJoinWrapper(editor: Editor, input: ListsJoinInput, options?: MutationOptions): ListsJoinResult {
  rejectTrackedMode('lists.join', options);

  const target = resolveListItem(editor, input.target);
  if (target.numId == null) {
    return toListsFailure('INVALID_TARGET', 'Target must have numbering metadata.', { target: input.target });
  }

  const canJoinResult = evaluateCanJoin(editor, target, input.direction);
  if (!canJoinResult.canJoin) {
    return toListsFailure(canJoinResult.reason!, `Cannot join: ${canJoinResult.reason}`, {
      target: input.target,
      direction: input.direction,
    });
  }

  const adjacent = findAdjacentSequence(editor, target, input.direction)!;

  // Determine absorbing numId, merged anchor, and items to reassign.
  // The anchor is the first item of the absorbing sequence (pre-mutation),
  // which becomes the first item of the merged sequence post-mutation.
  let absorbingNumId: number;
  let absorbedItems: ListItemProjection[];
  let anchorNodeId: string;

  if (input.direction === 'withPrevious') {
    absorbingNumId = adjacent.numId;
    absorbedItems = getContiguousSequence(editor, target);
    anchorNodeId = adjacent.sequence[0]?.address.nodeId ?? target.address.nodeId;
  } else {
    absorbingNumId = target.numId;
    absorbedItems = adjacent.sequence;
    const targetSequence = getContiguousSequence(editor, target);
    anchorNodeId = targetSequence[0]?.address.nodeId ?? target.address.nodeId;
  }

  const mergedListId = `${absorbingNumId}:${anchorNodeId}`;

  if (options?.dryRun) {
    return { success: true, listId: mergedListId };
  }

  const receipt = executeDomainCommand(
    editor,
    () => {
      const { tr } = editor.state;
      for (const item of absorbedItems) {
        const currentLevel = item.level ?? 0;
        updateNumberingProperties(
          { numId: absorbingNumId, ilvl: currentLevel },
          item.candidate.node,
          item.candidate.pos,
          editor,
          tr,
        );
      }
      dispatchEditorTransaction(editor, tr);
      clearIndexCache(editor);
      return true;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (receipt.steps[0]?.effect !== 'changed') {
    return toListsFailure('INVALID_TARGET', 'List join could not be applied.', {
      target: input.target,
      direction: input.direction,
    });
  }

  return { success: true, listId: mergedListId };
}

export function listsSeparateWrapper(
  editor: Editor,
  input: ListsSeparateInput,
  options?: MutationOptions,
): ListsSeparateResult {
  rejectTrackedMode('lists.separate', options);

  const target = resolveListItem(editor, input.target);
  if (target.numId == null) {
    return toListsFailure('INVALID_TARGET', 'Target must have numbering metadata.', { target: input.target });
  }

  if (isFirstInSequence(editor, target)) {
    return toListsFailure('NO_OP', 'Target is already the first item in its sequence.', { target: input.target });
  }

  const copyOverrides = input.copyOverrides !== false;
  const abstractNumId = getAbstractNumId(editor, target.numId);
  if (abstractNumId == null) {
    return toListsFailure('INVALID_TARGET', 'Could not resolve abstract definition for target.', {
      target: input.target,
    });
  }

  const itemsToReassign = getSequenceFromTarget(editor, target);

  if (options?.dryRun) {
    return { success: true, listId: '(dry-run)', numId: 0 };
  }

  let newNumId: number | undefined;
  const receipt = executeDomainCommandWithRollback(
    editor,
    () => {
      const result = ListHelpers.createNumDefinition(editor, abstractNumId, {
        copyOverridesFrom: copyOverrides ? target.numId! : undefined,
      });
      newNumId = result.numId;

      const { tr } = editor.state;
      for (const item of itemsToReassign) {
        const currentLevel = item.level ?? 0;
        updateNumberingProperties(
          { numId: newNumId, ilvl: currentLevel },
          item.candidate.node,
          item.candidate.pos,
          editor,
          tr,
        );
      }
      dispatchEditorTransaction(editor, tr);
      clearIndexCache(editor);
      return true;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (receipt.steps[0]?.effect !== 'changed') {
    return toListsFailure('INVALID_TARGET', 'List separation could not be applied.', { target: input.target });
  }

  return { success: true, listId: `${newNumId!}:${target.address.nodeId}`, numId: newNumId! };
}

/**
 * Compound merge: structurally merge two adjacent list sequences into one.
 *
 * Unlike lists.join, merge does NOT require identical abstractNumId — absorbed
 * items adopt the absorbing sequence's numbering definition. Additionally,
 * empty paragraphs between the two sequences are removed so numbering flows
 * continuously.
 */
export function listsMergeWrapper(editor: Editor, input: ListsMergeInput, options?: MutationOptions): ListsMergeResult {
  rejectTrackedMode('lists.merge', options);

  const target = resolveListItem(editor, input.target);
  if (target.numId == null) {
    return toListsFailure('INVALID_TARGET', 'Target must have numbering metadata.', { target: input.target });
  }

  const adjacent = findAdjacentSequence(editor, target, input.direction);
  if (!adjacent) {
    return toListsFailure('NO_ADJACENT_SEQUENCE', 'No adjacent list sequence found in the given direction.', {
      target: input.target,
      direction: input.direction,
    });
  }

  const targetSequence = getContiguousSequence(editor, target);
  if (adjacent.numId === target.numId) {
    return toListsFailure('NO_OP', 'Target and adjacent items already belong to the same sequence.', {
      target: input.target,
    });
  }

  let absorbingNumId: number;
  let absorbedItems: ListItemProjection[];
  let anchorNodeId: string;
  let gapFromPos: number;
  let gapToPos: number;

  if (input.direction === 'withPrevious') {
    absorbingNumId = adjacent.numId;
    absorbedItems = targetSequence;
    anchorNodeId = adjacent.sequence[0]?.address.nodeId ?? target.address.nodeId;
    const lastOfAdjacent = adjacent.sequence[adjacent.sequence.length - 1]!;
    const firstOfTarget = targetSequence[0]!;
    gapFromPos = lastOfAdjacent.candidate.pos + lastOfAdjacent.candidate.node.nodeSize;
    gapToPos = firstOfTarget.candidate.pos;
  } else {
    absorbingNumId = target.numId;
    absorbedItems = adjacent.sequence;
    anchorNodeId = targetSequence[0]?.address.nodeId ?? target.address.nodeId;
    const lastOfTarget = targetSequence[targetSequence.length - 1]!;
    const firstOfAdjacent = adjacent.sequence[0]!;
    gapFromPos = lastOfTarget.candidate.pos + lastOfTarget.candidate.node.nodeSize;
    gapToPos = firstOfAdjacent.candidate.pos;
  }

  // Top-level only (avoid empty paragraphs inside table cells), and require
  // structural emptiness (a paragraph holding an image/break has empty
  // textContent but is still meaningful).
  const gapEmptyParagraphs: Array<{ pos: number; node: (typeof targetSequence)[0]['candidate']['node'] }> = [];
  if (gapFromPos < gapToPos) {
    editor.state.doc.forEach((child, offset) => {
      if (child.type.name !== 'paragraph') return;
      if (offset < gapFromPos) return;
      if (offset + child.nodeSize > gapToPos) return;
      if (child.childCount > 0) return;
      gapEmptyParagraphs.push({ pos: offset, node: child });
    });
  }

  const mergedListId = `${absorbingNumId}:${anchorNodeId}`;

  if (options?.dryRun) {
    return {
      success: true,
      listId: mergedListId,
      absorbedCount: absorbedItems.length,
      removedEmptyBlocks: gapEmptyParagraphs.length,
    };
  }

  const receipt = executeDomainCommand(
    editor,
    () => {
      const { tr } = editor.state;
      for (const item of absorbedItems) {
        const currentLevel = item.level ?? 0;
        updateNumberingProperties(
          { numId: absorbingNumId, ilvl: currentLevel },
          item.candidate.node,
          item.candidate.pos,
          editor,
          tr,
        );
      }
      // Delete empty gap paragraphs in descending position order so earlier
      // deletions do not shift subsequent positions.
      const sorted = [...gapEmptyParagraphs].sort((a, b) => b.pos - a.pos);
      for (const gap of sorted) {
        tr.delete(gap.pos, gap.pos + gap.node.nodeSize);
      }
      dispatchEditorTransaction(editor, tr);
      clearIndexCache(editor);
      return true;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (receipt.steps[0]?.effect !== 'changed') {
    return toListsFailure('INVALID_TARGET', 'List merge could not be applied.', {
      target: input.target,
      direction: input.direction,
    });
  }

  return {
    success: true,
    listId: mergedListId,
    absorbedCount: absorbedItems.length,
    removedEmptyBlocks: gapEmptyParagraphs.length,
  };
}

/**
 * Compound split: separate a list sequence at the target and restart the new
 * half's numbering at 1 (by default).
 *
 * Runs as two sequential steps (separate, then setValue). If the second step
 * fails after the first succeeds, the doc is left split without the renumber
 * and the caller gets a failure result. Pass restartNumbering: false to skip
 * the second step and get raw separate semantics.
 */
export function listsSplitWrapper(editor: Editor, input: ListsSplitInput, options?: MutationOptions): ListsSplitResult {
  rejectTrackedMode('lists.split', options);

  const separateResult = listsSeparateWrapper(editor, { target: input.target }, options);
  if (!separateResult.success) {
    // Failure shape (ListsFailureResult) is shared between Separate and Split,
    // but TS can't infer that from the union narrowing alone — cast through.
    return separateResult as ListsSplitResult;
  }

  const restartNumbering = input.restartNumbering !== false;
  if (!restartNumbering) {
    return {
      success: true,
      listId: separateResult.listId,
      numId: separateResult.numId,
      restartedAt: null,
    };
  }

  if (options?.dryRun) {
    return {
      success: true,
      listId: separateResult.listId,
      numId: separateResult.numId,
      restartedAt: 1,
    };
  }

  // The separate step above bumped the revision; reusing the caller's
  // expectedRevision here would throw REVISION_MISMATCH and leave the doc
  // partially-applied.
  const setValueOptions = options ? { ...options, expectedRevision: undefined } : options;
  const setValueResult = listsSetValueWrapper(editor, { target: input.target, value: 1 }, setValueOptions);
  if (!setValueResult.success) {
    return setValueResult as ListsSplitResult;
  }

  return {
    success: true,
    listId: separateResult.listId,
    numId: separateResult.numId,
    restartedAt: 1,
  };
}

export function listsSetLevelWrapper(
  editor: Editor,
  input: ListsSetLevelInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  rejectTrackedMode('lists.setLevel', options);
  const target = resolveListItem(editor, input.target);
  return executeSetLevel(editor, target, input.level, options);
}

export function listsSetValueWrapper(
  editor: Editor,
  input: ListsSetValueInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  rejectTrackedMode('lists.setValue', options);

  const target = resolveListItem(editor, input.target);
  if (target.numId == null) {
    return toListsFailure('INVALID_TARGET', 'Target must have numbering metadata.', { target: input.target });
  }

  const level = target.level ?? 0;

  if (options?.dryRun) {
    return { success: true, item: target.address };
  }

  // Remove override
  if (input.value === null) {
    if (!hasLevelOverride(editor, target.numId, level)) {
      return toListsFailure('NO_OP', 'No startOverride to remove.', { target: input.target });
    }

    const receipt = executeDomainCommandWithRollback(
      editor,
      () => {
        ListHelpers.removeLvlOverride(editor, target.numId!, level);
        dispatchEditorTransaction(editor, editor.state.tr);
        return true;
      },
      { expectedRevision: options?.expectedRevision },
    );

    if (receipt.steps[0]?.effect !== 'changed') {
      return toListsFailure('NO_OP', 'No startOverride to remove.', { target: input.target });
    }

    return { success: true, item: target.address };
  }

  const isFirst = isFirstInSequence(editor, target);

  if (isFirst) {
    // Simple case: set startOverride on existing numId
    const receipt = executeDomainCommandWithRollback(
      editor,
      () => {
        ListHelpers.setLvlOverride(editor, target.numId!, level, { startOverride: input.value as number });
        dispatchEditorTransaction(editor, editor.state.tr);
        return true;
      },
      { expectedRevision: options?.expectedRevision },
    );

    if (receipt.steps[0]?.effect !== 'changed') {
      return toListsFailure('INVALID_TARGET', 'setValue could not be applied.', { target: input.target });
    }

    return { success: true, item: target.address };
  }

  // Mid-sequence: separate first, then set value
  const abstractNumId = getAbstractNumId(editor, target.numId);
  if (abstractNumId == null) {
    return toListsFailure('INVALID_TARGET', 'Could not resolve abstract definition for target.', {
      target: input.target,
    });
  }

  const itemsToReassign = getSequenceFromTarget(editor, target);

  const receipt = executeDomainCommandWithRollback(
    editor,
    () => {
      // 1. Create new numId pointing to same abstract, copying overrides
      const { numId: newNumId } = ListHelpers.createNumDefinition(editor, abstractNumId, {
        copyOverridesFrom: target.numId!,
      });

      // 2. Set startOverride on the new numId
      ListHelpers.setLvlOverride(editor, newNumId, level, { startOverride: input.value as number });

      // 3. Reassign items from target onwards to new numId
      const { tr } = editor.state;
      for (const item of itemsToReassign) {
        const currentLevel = item.level ?? 0;
        updateNumberingProperties(
          { numId: newNumId, ilvl: currentLevel },
          item.candidate.node,
          item.candidate.pos,
          editor,
          tr,
        );
      }
      dispatchEditorTransaction(editor, tr);
      clearIndexCache(editor);
      return true;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (receipt.steps[0]?.effect !== 'changed') {
    return toListsFailure('INVALID_TARGET', 'setValue could not be applied.', { target: input.target });
  }

  return { success: true, item: target.address };
}

export function listsContinuePreviousWrapper(
  editor: Editor,
  input: ListsContinuePreviousInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  rejectTrackedMode('lists.continuePrevious', options);

  const target = resolveListItem(editor, input.target);
  if (target.numId == null) {
    return toListsFailure('INVALID_TARGET', 'Target must have numbering metadata.', { target: input.target });
  }

  const canContinue = evaluateCanContinuePrevious(editor, target);
  if (!canContinue.canContinue) {
    // Map read-only query reasons to declared mutation failure codes
    const reasonToFailureCode: Record<string, ReceiptFailureCode> = {
      NO_PREVIOUS_LIST: 'NO_COMPATIBLE_PREVIOUS',
      INCOMPATIBLE_DEFINITIONS: 'NO_COMPATIBLE_PREVIOUS',
      ALREADY_CONTINUOUS: 'ALREADY_CONTINUOUS',
    };
    const code = reasonToFailureCode[canContinue.reason!] ?? 'INVALID_TARGET';
    return toListsFailure(code, `Cannot continue previous: ${canContinue.reason}`, {
      target: input.target,
    });
  }

  const previous = findPreviousCompatibleSequence(editor, target)!;

  if (options?.dryRun) {
    return { success: true, item: target.address };
  }

  const sequence = getContiguousSequence(editor, target);
  const level = target.level ?? 0;

  const receipt = executeDomainCommandWithRollback(
    editor,
    () => {
      // Remove startOverride on target's level (if any)
      ListHelpers.removeLvlOverride(editor, target.numId!, level);

      const { tr } = editor.state;
      for (const item of sequence) {
        const currentLevel = item.level ?? 0;
        updateNumberingProperties(
          { numId: previous.numId, ilvl: currentLevel },
          item.candidate.node,
          item.candidate.pos,
          editor,
          tr,
        );
      }
      dispatchEditorTransaction(editor, tr);
      clearIndexCache(editor);
      return true;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (receipt.steps[0]?.effect !== 'changed') {
    return toListsFailure('INVALID_TARGET', 'continuePrevious could not be applied.', { target: input.target });
  }

  return { success: true, item: target.address };
}

export function listsSetLevelRestartWrapper(
  editor: Editor,
  input: ListsSetLevelRestartInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  rejectTrackedMode('lists.setLevelRestart', options);

  const target = resolveListItem(editor, input.target);
  if (target.numId == null) {
    return toListsFailure('INVALID_TARGET', 'Target must have numbering metadata.', { target: input.target });
  }

  if (input.level < 0 || input.level > 8) {
    return toListsFailure('LEVEL_OUT_OF_RANGE', 'Level must be between 0 and 8.', { level: input.level });
  }

  if (options?.dryRun) {
    return { success: true, item: target.address };
  }

  const scope = input.scope ?? 'definition';

  const receipt = executeDomainCommandWithRollback(
    editor,
    () => {
      if (scope === 'instance') {
        ListHelpers.setLvlOverride(editor, target.numId!, input.level, {
          lvlRestart: input.restartAfterLevel,
        });
      } else {
        const abstractNumId = getAbstractNumId(editor, target.numId!);
        if (abstractNumId == null) return false;
        ListHelpers.setLvlRestartOnAbstract(editor, abstractNumId, input.level, input.restartAfterLevel);
      }
      dispatchEditorTransaction(editor, editor.state.tr);
      return true;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (receipt.steps[0]?.effect !== 'changed') {
    return toListsFailure('INVALID_TARGET', 'setLevelRestart could not be applied.', { target: input.target });
  }

  return { success: true, item: target.address };
}

export function listsConvertToTextWrapper(
  editor: Editor,
  input: ListsConvertToTextInput,
  options?: MutationOptions,
): ListsConvertToTextResult {
  rejectTrackedMode('lists.convertToText', options);

  const target = resolveListItem(editor, input.target);
  const includeMarker = input.includeMarker ?? false;

  if (options?.dryRun) {
    return { success: true, paragraph: { kind: 'block', nodeType: 'paragraph', nodeId: target.address.nodeId } };
  }

  const receipt = executeDomainCommand(
    editor,
    () => {
      const { tr } = editor.state;

      // Optionally prepend marker text before clearing numbering
      if (includeMarker && target.marker) {
        const startPos = target.candidate.pos + 1;
        tr.insertText(target.marker, startPos);
      }

      // Clear numbering properties (uses original node position — still valid
      // because insertText only modifies content inside the node, not the node boundary)
      updateNumberingProperties(null, target.candidate.node, target.candidate.pos, editor, tr);

      dispatchEditorTransaction(editor, tr);
      clearIndexCache(editor);
      return true;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (receipt.steps[0]?.effect !== 'changed') {
    return toListsFailure('INVALID_TARGET', 'convertToText could not be applied.', { target: input.target });
  }

  return { success: true, paragraph: { kind: 'block', nodeType: 'paragraph', nodeId: target.address.nodeId } };
}
