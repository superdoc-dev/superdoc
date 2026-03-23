/**
 * Lists formatting wrappers — bridge SD-1973 list formatting operations
 * (template/preset/level formatting) to the plan engine.
 *
 * Structural list operations (insert, create, attach, detach, join, separate, etc.)
 * remain in `lists-wrappers.ts`. This file handles only formatting operations.
 *
 * All level mutations are definition-scoped (no `scope` parameter in v1).
 * `clearLevelOverrides` is the only instance-scope operation (removes w:lvlOverride).
 */

import type { Editor } from '../../core/Editor.js';
import type {
  ListsApplyTemplateInput,
  ListsApplyPresetInput,
  ListsSetTypeInput,
  ListPresetId,
  ListsCaptureTemplateInput,
  ListsCaptureTemplateResult,
  ListsSetLevelNumberingInput,
  ListsSetLevelBulletInput,
  ListsSetLevelPictureBulletInput,
  ListsSetLevelAlignmentInput,
  ListsSetLevelIndentsInput,
  ListsSetLevelTrailingCharacterInput,
  ListsSetLevelMarkerFontInput,
  ListsClearLevelOverridesInput,
  ListsMutateItemResult,
  ListTemplate,
  MutationOptions,
  ReceiptFailureCode,
  ListsGetStyleInput,
  ListsGetStyleResult,
  ListsApplyStyleInput,
  ListsRestartAtInput,
  ListsSetLevelNumberStyleInput,
  ListsSetLevelTextInput,
  ListsSetLevelStartInput,
  ListsSetLevelLayoutInput,
} from '@superdoc/document-api';
import { rejectTrackedMode } from '../helpers/mutation-helpers.js';
import { mutatePart } from '../../core/parts/mutation/mutate-part.js';
import { compoundMutation } from '../../core/parts/mutation/compound-mutation.js';
import { syncNumberingToXmlTree } from '../../core/parts/adapters/numbering-part-descriptor.js';
import type { PartId } from '../../core/parts/types.js';
import { resolveListItem, type ListItemProjection } from '../helpers/list-item-resolver.js';
import {
  getAbstractNumId,
  getAllListItemProjections,
  getContiguousSequence,
  findAdjacentSequence,
} from '../helpers/list-sequence-helpers.js';
import { clearIndexCache } from '../helpers/index-cache.js';
import { LevelFormattingHelpers } from '../../core/helpers/list-level-formatting-helpers.js';
import { updateNumberingProperties } from '../../core/commands/changeListLevel.js';
import { ListHelpers } from '../../core/helpers/list-numbering-helpers.js';

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
  }
}

/**
 * Validate that a level index is within the valid range (0–8).
 * Returns a failure result if invalid, or null if valid.
 */
function validateLevel(level: number): ListsMutateItemResult | null {
  if (level < 0 || level > 8) {
    return toListsFailure('LEVEL_OUT_OF_RANGE', 'Level must be between 0 and 8.', { level });
  }
  return null;
}

/**
 * Validate and normalize the `levels` array for multi-level operations.
 * Range-checks each entry (0–8). Silently deduplicates and sorts.
 * Returns a failure result if out-of-range, or null if valid.
 */
function validateLevelsArray(
  levels: number[] | undefined,
): { success: false; failure: { code: ReceiptFailureCode; message: string; details?: unknown } } | null {
  if (!levels) return null;

  for (const lvl of levels) {
    if (lvl < 0 || lvl > 8) {
      return toListsFailure('LEVEL_OUT_OF_RANGE', 'Each level must be between 0 and 8.', { level: lvl });
    }
  }

  return null;
}

/**
 * Normalize a levels array: deduplicate and sort ascending.
 */
function normalizeLevels(levels: number[] | undefined): number[] | undefined {
  if (!levels) return undefined;
  return [...new Set(levels)].sort((a, b) => a - b);
}

/**
 * Preflight check for template/preset application — validates that every
 * requested level exists in the template. This runs before dry-run returns
 * success so that dry-run faithfully reflects whether real execution would
 * succeed for template-side constraints. Abstract-side checks (level exists
 * in the numbering definition) are deferred to `applyTemplateToAbstract`.
 */
function preflightTemplateLevels(
  template: ListTemplate,
  levels: number[] | undefined,
  target: { kind: 'block'; nodeType: 'listItem'; nodeId: string },
): ListsMutateItemResult | null {
  const templateLevelSet = new Set(template.levels.map((l) => l.level));
  const targetLevels = levels ?? template.levels.map((l) => l.level);

  for (const ilvl of targetLevels) {
    if (!templateLevelSet.has(ilvl)) {
      return toListsFailure('INVALID_INPUT', 'Requested level does not exist in the template.', { target });
    }
  }

  return null;
}

/**
 * Map `applyTemplateToAbstract` error strings to proper failure results.
 */
function toApplyTemplateError(
  error: string,
  target: { kind: 'block'; nodeType: 'listItem'; nodeId: string },
): ListsMutateItemResult {
  switch (error) {
    case 'ABSTRACT_NOT_FOUND':
      return toListsFailure('INVALID_TARGET', 'Abstract numbering definition not found.', { target });
    case 'LEVEL_NOT_IN_TEMPLATE':
      return toListsFailure('INVALID_INPUT', 'Requested level does not exist in the template.', { target });
    case 'LEVEL_NOT_IN_ABSTRACT':
      return toListsFailure('INVALID_TARGET', 'Requested level does not exist in the abstract definition.', { target });
    default:
      return toListsFailure('INVALID_INPUT', `Template application failed: ${error}.`, { target });
  }
}

type TargetAbstractSuccess = {
  ok: true;
  resolved: ReturnType<typeof resolveListItem>;
  abstractNumId: number;
  numId: number;
};
type TargetAbstractFailure = { ok: false; failure: ReturnType<typeof toListsFailure> };

/**
 * Resolve target list item and its abstract definition ID.
 * Returns `{ ok: true, ... }` on success, `{ ok: false, failure }` on failure.
 */
function resolveTargetAbstract(
  editor: Editor,
  target: { kind: 'block'; nodeType: 'listItem'; nodeId: string },
): TargetAbstractSuccess | TargetAbstractFailure {
  const resolved = resolveListItem(editor, target);
  if (resolved.numId == null) {
    return {
      ok: false,
      failure: toListsFailure('INVALID_TARGET', 'Target must have numbering metadata.', { target }),
    };
  }
  const abstractNumId = getAbstractNumId(editor, resolved.numId);
  if (abstractNumId == null) {
    return {
      ok: false,
      failure: toListsFailure('INVALID_TARGET', 'Could not resolve abstract definition for target.', { target }),
    };
  }
  return { ok: true, resolved, abstractNumId, numId: resolved.numId };
}

// ---------------------------------------------------------------------------
// Single-level mutation helper (DRY pattern for all setLevel* operations)
// ---------------------------------------------------------------------------

const NUMBERING_PART: PartId = 'word/numbering.xml';
type NumberingModel = Parameters<typeof syncNumberingToXmlTree>[1];
type NumberingTransaction = Parameters<typeof updateNumberingProperties>[4];

function getConverterNumbering(editor: Editor): NumberingModel {
  return (
    editor as unknown as {
      converter?: { numbering: NumberingModel };
    }
  ).converter!.numbering;
}

/**
 * Execute a single-level mutation operation on an abstract definition.
 * Handles: tracked mode rejection, target resolution, level validation,
 * level existence check, dry-run short-circuit, no-op detection, and
 * mutation via the centralized parts pipeline.
 */
function executeSingleLevelMutation(
  editor: Editor,
  operationId: string,
  target: { kind: 'block'; nodeType: 'listItem'; nodeId: string },
  level: number,
  options: MutationOptions | undefined,
  mutate: (abstractNumId: number, ilvl: number) => boolean,
): ListsMutateItemResult {
  rejectTrackedMode(operationId, options);

  const levelError = validateLevel(level);
  if (levelError) return levelError;

  const targetResult = resolveTargetAbstract(editor, target);
  if (!targetResult.ok) return (targetResult as TargetAbstractFailure).failure;

  // Verify the requested level actually exists in the abstract definition
  if (!LevelFormattingHelpers.hasLevel(editor, targetResult.abstractNumId, level)) {
    return toListsFailure('LEVEL_NOT_FOUND', `Level ${level} does not exist in the abstract definition.`, {
      target,
      level,
    });
  }

  if (options?.dryRun) {
    return { success: true, item: targetResult.resolved.address };
  }

  let noOp = false;

  const compound = compoundMutation({
    editor,
    source: operationId,
    affectedParts: [NUMBERING_PART],
    execute() {
      const result = mutatePart({
        editor,
        partId: NUMBERING_PART,
        operation: 'mutate',
        source: operationId,
        expectedRevision: options?.expectedRevision,
        mutate({ part }) {
          const changed = mutate(targetResult.abstractNumId, level);
          if (!changed) return false;
          syncNumberingToXmlTree(part, getConverterNumbering(editor));
          return true;
        },
      });

      if (!result.changed) {
        noOp = true;
        return false;
      }

      dispatchEditorTransaction(editor, editor.state.tr);
      return true;
    },
  });

  if (noOp) {
    return toListsFailure('NO_OP', `${operationId}: values already match.`, { target });
  }
  if (!compound.success) {
    return toListsFailure('NO_OP', `${operationId}: mutation failed.`, { target });
  }

  return { success: true, item: targetResult.resolved.address };
}

// ---------------------------------------------------------------------------
// Shared template application helper (used by applyTemplate + applyPreset)
// ---------------------------------------------------------------------------

/**
 * Apply a template to an abstract numbering definition with full atomicity.
 * Shared by `listsApplyTemplateWrapper` and `listsApplyPresetWrapper` —
 * both resolve a template then apply it to the same abstract-definition pipeline.
 */
function applyTemplateCompound(
  editor: Editor,
  source: string,
  target: { kind: 'block'; nodeType: 'listItem'; nodeId: string },
  template: ListTemplate,
  levels: number[] | undefined,
  options: MutationOptions | undefined,
  noOpMessage: string,
  failMessage: string,
): ListsMutateItemResult {
  const levelsError = validateLevelsArray(levels);
  if (levelsError) return levelsError;

  const targetResult = resolveTargetAbstract(editor, target);
  if (!targetResult.ok) return (targetResult as TargetAbstractFailure).failure;

  const preflightError = preflightTemplateLevels(template, levels, target);
  if (preflightError) return preflightError;

  if (options?.dryRun) {
    return { success: true, item: targetResult.resolved.address };
  }

  let applyError: string | undefined;
  let noOp = false;

  const compound = compoundMutation({
    editor,
    source,
    affectedParts: [NUMBERING_PART],
    execute() {
      const result = mutatePart({
        editor,
        partId: NUMBERING_PART,
        operation: 'mutate',
        source,
        expectedRevision: options?.expectedRevision,
        mutate({ part }) {
          const applyResult = LevelFormattingHelpers.applyTemplateToAbstract(
            editor,
            targetResult.abstractNumId,
            template,
            levels,
          ) as { changed: boolean; error?: string };
          if (applyResult.error) {
            applyError = applyResult.error;
            return false;
          }
          if (!applyResult.changed) return false;
          syncNumberingToXmlTree(part, getConverterNumbering(editor));
          return true;
        },
      });

      if (applyError || !result.changed) {
        noOp = !applyError;
        return false;
      }

      dispatchEditorTransaction(editor, editor.state.tr);
      return true;
    },
  });

  if (applyError) return toApplyTemplateError(applyError, target);
  if (noOp) return toListsFailure('NO_OP', noOpMessage, { target });
  if (!compound.success) return toListsFailure('NO_OP', failMessage, { target });

  return { success: true, item: targetResult.resolved.address };
}

// ---------------------------------------------------------------------------
// Exported wrappers
// ---------------------------------------------------------------------------

export function listsApplyTemplateWrapper(
  editor: Editor,
  input: ListsApplyTemplateInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  rejectTrackedMode('lists.applyTemplate', options);

  if (input.template.version !== 1) {
    return toListsFailure('INVALID_INPUT', 'Unsupported template version.', { version: input.template.version });
  }

  return applyTemplateCompound(
    editor,
    'lists.applyTemplate',
    input.target,
    input.template,
    input.levels,
    options,
    'All template levels already match.',
    'Template application failed.',
  );
}

export function listsApplyPresetWrapper(
  editor: Editor,
  input: ListsApplyPresetInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  rejectTrackedMode('lists.applyPreset', options);

  const template = LevelFormattingHelpers.getPresetTemplate(input.preset) as ListTemplate | undefined;
  if (!template) {
    return toListsFailure('INVALID_INPUT', `Unknown preset: ${input.preset}.`, { preset: input.preset });
  }

  return applyTemplateCompound(
    editor,
    'lists.applyPreset',
    input.target,
    template,
    input.levels,
    options,
    'All preset levels already match.',
    'Preset application failed.',
  );
}

// ---------------------------------------------------------------------------
// setType — compound operation: convert kind + preserve continuity (SD-2052)
// ---------------------------------------------------------------------------

const DEFAULT_PRESET_FOR_KIND: Record<string, ListPresetId> = {
  ordered: 'decimal',
  bullet: 'disc',
};

/**
 * Two sequences are compatible for merging when they share the same
 * abstractNumId — meaning they derive from the same definition and
 * will produce identical level formatting after the preset is applied.
 *
 * This is conservative by design: sequences with different abstracts
 * are never merged, even if they happen to look the same visually.
 */
function areAbstractsCompatibleForMerge(
  targetAbstractNumId: number,
  adjacentAbstractNumId: number | undefined,
): boolean {
  return adjacentAbstractNumId != null && targetAbstractNumId === adjacentAbstractNumId;
}

/**
 * Determine the list kind of an adjacent sequence from its first item's
 * projection. Returns undefined if the sequence is empty or has no numId.
 */
function resolveSequenceKind(sequence: ListItemProjection[]): 'ordered' | 'bullet' | undefined {
  const first = sequence[0];
  if (!first || first.numId == null) return undefined;
  return first.kind;
}

/**
 * Merge an adjacent sequence into the target's numId by reassigning
 * all items. Clears any startOverride on the absorbed sequence's
 * *original* numId before reassignment to prevent numbering restart.
 */
function mergeAdjacentSequence(
  editor: Editor,
  tr: unknown,
  absorbingNumId: number,
  absorbedItems: ListItemProjection[],
): void {
  // Remove startOverride on the absorbed sequence's original numId
  // *before* reassignment, so the old definition doesn't carry restart
  // semantics if it's ever re-referenced. This mirrors listsContinuePreviousWrapper.
  const firstAbsorbed = absorbedItems[0];
  if (firstAbsorbed?.numId != null) {
    ListHelpers.removeLvlOverride(editor, firstAbsorbed.numId, firstAbsorbed.level ?? 0);
  }

  for (const item of absorbedItems) {
    updateNumberingProperties(
      { numId: absorbingNumId, ilvl: item.level ?? 0 },
      item.candidate.node,
      item.candidate.pos,
      editor,
      tr as Parameters<Editor['dispatch']>[0],
    );
  }
}

export function listsSetTypeWrapper(
  editor: Editor,
  input: ListsSetTypeInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  rejectTrackedMode('lists.setType', options);

  const preset = DEFAULT_PRESET_FOR_KIND[input.kind];
  if (!preset) {
    return toListsFailure('INVALID_INPUT', `Unknown list kind: ${input.kind}.`, { kind: input.kind });
  }

  const template = LevelFormattingHelpers.getPresetTemplate(preset) as ListTemplate | undefined;
  if (!template) {
    return toListsFailure('INVALID_INPUT', `No template found for preset: ${preset}.`, { preset });
  }

  const targetResult = resolveTargetAbstract(editor, input.target);
  if (!targetResult.ok) return (targetResult as TargetAbstractFailure).failure;

  if (options?.dryRun) {
    return { success: true, item: targetResult.resolved.address };
  }

  const continuity = input.continuity ?? 'preserve';
  let applyError: string | undefined;
  let noOp = false;

  const compound = compoundMutation({
    editor,
    source: 'lists.setType',
    affectedParts: [NUMBERING_PART],
    execute() {
      let didAnything = false;

      // Phase 1: Apply the preset formatting via mutatePart
      const formatResult = mutatePart({
        editor,
        partId: NUMBERING_PART,
        operation: 'mutate',
        source: 'lists.setType',
        expectedRevision: options?.expectedRevision,
        mutate({ part }) {
          const result = LevelFormattingHelpers.applyTemplateToAbstract(
            editor,
            targetResult.abstractNumId,
            template,
            undefined, // apply to all levels
          ) as { changed: boolean; error?: string };
          if (result.error) {
            applyError = result.error;
            return false;
          }
          if (result.changed) {
            syncNumberingToXmlTree(part, getConverterNumbering(editor));
          }
          return result.changed;
        },
      });

      if (applyError) return false;
      if (formatResult.changed) didAnything = true;

      // Phase 2: Merge adjacent compatible sequences via PM transaction.
      let mergeDispatched = false;
      if (continuity === 'preserve') {
        clearIndexCache(editor);
        const freshTarget = resolveListItem(editor, input.target);
        if (freshTarget.numId != null) {
          const { tr } = editor.state;
          const merged = mergeAdjacentCompatibleSequences(editor, tr, freshTarget, targetResult.abstractNumId);
          if (merged) {
            didAnything = true;
            mergeDispatched = true;
            dispatchEditorTransaction(editor, tr);
            clearIndexCache(editor);
          }
        }
      }

      if (!didAnything) {
        noOp = true;
        return false;
      }

      // Dispatch re-render if formatting changed but no merge transaction was already dispatched
      if (formatResult.changed && !mergeDispatched) {
        dispatchEditorTransaction(editor, editor.state.tr);
      }

      return true;
    },
  });

  if (applyError) {
    return toApplyTemplateError(applyError, input.target);
  }
  if (noOp) {
    return toListsFailure('NO_OP', 'List type is already the requested kind.', { target: input.target });
  }
  if (!compound.success) {
    return toListsFailure('NO_OP', 'setType mutation failed.', { target: input.target });
  }

  return { success: true, item: targetResult.resolved.address };
}

/**
 * After converting a sequence's kind, find and merge adjacent sequences
 * that now share the same kind and have compatible abstract definitions.
 *
 * Merge rules (all must hold):
 * - Adjacent sequence's kind matches the target kind after conversion
 * - Adjacent shares the same abstractNumId (formatting-equivalent)
 * - No conflicting level/override semantics
 *
 * Returns true if any merge was performed.
 */
function mergeAdjacentCompatibleSequences(
  editor: Editor,
  tr: unknown,
  target: ListItemProjection,
  targetAbstractNumId: number,
): boolean {
  const targetNumId = target.numId!;
  let merged = false;

  // Try merging with the previous adjacent sequence
  const prev = findAdjacentSequence(editor, target, 'withPrevious');
  if (prev && canMergeSequences(prev.abstractNumId, targetAbstractNumId, prev.sequence, target.kind)) {
    const targetSequence = getContiguousSequence(editor, target);
    mergeAdjacentSequence(editor, tr, prev.numId, targetSequence);
    clearIndexCache(editor);
    merged = true;

    // After absorbing into prev, try merging the *next* adjacent sequence
    // into prev.numId as well (since target is now part of prev)
    const freshTarget = resolveListItem(editor, target.address);
    const next = findAdjacentSequence(editor, freshTarget, 'withNext');
    if (
      next &&
      prev.abstractNumId != null &&
      canMergeSequences(next.abstractNumId, prev.abstractNumId, next.sequence, freshTarget.kind)
    ) {
      mergeAdjacentSequence(editor, tr, prev.numId, next.sequence);
      clearIndexCache(editor);
    }
    return merged;
  }

  // No prev merge — try merging with the next adjacent sequence only
  const next = findAdjacentSequence(editor, target, 'withNext');
  if (next && canMergeSequences(next.abstractNumId, targetAbstractNumId, next.sequence, target.kind)) {
    mergeAdjacentSequence(editor, tr, targetNumId, next.sequence);
    clearIndexCache(editor);
    merged = true;
  }

  return merged;
}

/**
 * Safety check: can we merge the adjacent sequence into the target?
 */
function canMergeSequences(
  adjacentAbstractNumId: number | undefined,
  targetAbstractNumId: number,
  adjacentSequence: ListItemProjection[],
  targetKind: ListItemProjection['kind'],
): boolean {
  const adjacentKind = resolveSequenceKind(adjacentSequence);
  if (adjacentKind == null || adjacentKind !== targetKind) return false;
  return areAbstractsCompatibleForMerge(targetAbstractNumId, adjacentAbstractNumId);
}

export function listsCaptureTemplateWrapper(
  editor: Editor,
  input: ListsCaptureTemplateInput,
): ListsCaptureTemplateResult {
  const levelsError = validateLevelsArray(input.levels);
  if (levelsError) return levelsError;

  const targetResult = resolveTargetAbstract(editor, input.target);
  if (!targetResult.ok) return (targetResult as TargetAbstractFailure).failure;

  const template = LevelFormattingHelpers.captureTemplate(
    editor,
    targetResult.abstractNumId,
    input.levels,
  ) as ListTemplate | null;
  if (!template) {
    return toListsFailure('INVALID_TARGET', 'Could not capture template from target.', { target: input.target });
  }

  return { success: true, template };
}

export function listsSetLevelNumberingWrapper(
  editor: Editor,
  input: ListsSetLevelNumberingInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  return executeSingleLevelMutation(
    editor,
    'lists.setLevelNumbering',
    input.target,
    input.level,
    options,
    (abstractNumId, ilvl) =>
      LevelFormattingHelpers.setLevelNumberingFormat(editor, abstractNumId, ilvl, {
        numFmt: input.numFmt,
        lvlText: input.lvlText,
        start: input.start,
      }),
  );
}

export function listsSetLevelBulletWrapper(
  editor: Editor,
  input: ListsSetLevelBulletInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  return executeSingleLevelMutation(
    editor,
    'lists.setLevelBullet',
    input.target,
    input.level,
    options,
    (abstractNumId, ilvl) => LevelFormattingHelpers.setLevelBulletMarker(editor, abstractNumId, ilvl, input.markerText),
  );
}

export function listsSetLevelPictureBulletWrapper(
  editor: Editor,
  input: ListsSetLevelPictureBulletInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  // Tracked mode must reject before any domain checks (conformance contract)
  rejectTrackedMode('lists.setLevelPictureBullet', options);

  // Guard: picture bullet requires numbering.xml, matching the capability predicate.
  // Only reject when we can definitively determine the feature is unavailable
  // (converter has convertedXml but it lacks numbering.xml).
  const converter = (editor as unknown as { converter?: { convertedXml?: Record<string, unknown> } }).converter;
  if (converter?.convertedXml && !converter.convertedXml['word/numbering.xml']) {
    return toListsFailure(
      'CAPABILITY_UNAVAILABLE',
      'Picture bullets require a numbering definition (word/numbering.xml).',
      {
        target: input.target,
      },
    );
  }

  return executeSingleLevelMutation(
    editor,
    'lists.setLevelPictureBullet',
    input.target,
    input.level,
    options,
    (abstractNumId, ilvl) =>
      LevelFormattingHelpers.setLevelPictureBulletId(editor, abstractNumId, ilvl, input.pictureBulletId),
  );
}

export function listsSetLevelAlignmentWrapper(
  editor: Editor,
  input: ListsSetLevelAlignmentInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  return executeSingleLevelMutation(
    editor,
    'lists.setLevelAlignment',
    input.target,
    input.level,
    options,
    (abstractNumId, ilvl) => LevelFormattingHelpers.setLevelAlignment(editor, abstractNumId, ilvl, input.alignment),
  );
}

export function listsSetLevelIndentsWrapper(
  editor: Editor,
  input: ListsSetLevelIndentsInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  // Runtime validation: at least one indent field required, hanging + firstLine mutually exclusive
  const hasLeft = input.left != null;
  const hasHanging = input.hanging != null;
  const hasFirstLine = input.firstLine != null;

  if (!hasLeft && !hasHanging && !hasFirstLine) {
    return toListsFailure('INVALID_INPUT', 'At least one indent property is required.', {});
  }
  if (hasHanging && hasFirstLine) {
    return toListsFailure('INVALID_INPUT', 'hanging and firstLine are mutually exclusive.', {});
  }

  return executeSingleLevelMutation(
    editor,
    'lists.setLevelIndents',
    input.target,
    input.level,
    options,
    (abstractNumId, ilvl) => {
      const indents: { left?: number; hanging?: number; firstLine?: number } = {};
      if (hasLeft) indents.left = input.left;
      if (hasHanging) indents.hanging = input.hanging;
      if (hasFirstLine) indents.firstLine = input.firstLine;
      return LevelFormattingHelpers.setLevelIndents(editor, abstractNumId, ilvl, indents);
    },
  );
}

export function listsSetLevelTrailingCharacterWrapper(
  editor: Editor,
  input: ListsSetLevelTrailingCharacterInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  return executeSingleLevelMutation(
    editor,
    'lists.setLevelTrailingCharacter',
    input.target,
    input.level,
    options,
    (abstractNumId, ilvl) =>
      LevelFormattingHelpers.setLevelTrailingCharacter(editor, abstractNumId, ilvl, input.trailingCharacter),
  );
}

export function listsSetLevelMarkerFontWrapper(
  editor: Editor,
  input: ListsSetLevelMarkerFontInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  return executeSingleLevelMutation(
    editor,
    'lists.setLevelMarkerFont',
    input.target,
    input.level,
    options,
    (abstractNumId, ilvl) => LevelFormattingHelpers.setLevelMarkerFont(editor, abstractNumId, ilvl, input.fontFamily),
  );
}

// ---------------------------------------------------------------------------
// SD-2025 — Clone-on-write helper
// ---------------------------------------------------------------------------

/**
 * Result of a clone-on-write check. If cloning was needed, `pendingRebind`
 * contains the items that must be rebound to the new numId. The caller
 * MUST apply the rebinding in the same PM transaction as the actual mutation
 * so that a subsequent NO_OP / failure leaves the document unchanged.
 */
type SequenceLocalResult = {
  abstractNumId: number;
  numId: number;
  sourceNumId: number;
  pendingRebind: ListItemProjection[] | null;
};

/**
 * Ensure the target sequence has its own private abstract definition.
 * If the abstract is shared, prefer retargeting the existing w:num when
 * the sequence already owns its numId. Only allocate a fresh w:num when
 * that numId is reused outside the target sequence.
 */
function ensureSequenceLocalAbstract(
  editor: Editor,
  target: ListItemProjection,
  targetAbstractNumId: number,
  targetNumId: number,
): SequenceLocalResult {
  if (!LevelFormattingHelpers.isAbstractShared(editor, targetAbstractNumId, targetNumId)) {
    return { abstractNumId: targetAbstractNumId, numId: targetNumId, sourceNumId: targetNumId, pendingRebind: null };
  }

  const sequence = getContiguousSequence(editor, target);
  const sequenceNodeIds = new Set(sequence.map((item) => item.address.nodeId));
  const allItemsWithNumId = getAllListItemProjections(editor).filter((item) => item.numId === targetNumId);

  if (
    allItemsWithNumId.length === sequence.length &&
    allItemsWithNumId.every((item) => sequenceNodeIds.has(item.address.nodeId))
  ) {
    const { newAbstractNumId } = LevelFormattingHelpers.cloneAbstractIntoNum(editor, targetAbstractNumId, targetNumId);
    return { abstractNumId: newAbstractNumId, numId: targetNumId, sourceNumId: targetNumId, pendingRebind: null };
  }

  const { newAbstractNumId, newNumId } = LevelFormattingHelpers.cloneAbstractAndNum(
    editor,
    targetAbstractNumId,
    targetNumId,
  );

  return { abstractNumId: newAbstractNumId, numId: newNumId, sourceNumId: targetNumId, pendingRebind: sequence };
}

/**
 * Apply pending rebind operations to a PM transaction.
 * Must be called within the same transaction as the actual mutation.
 */
function applyPendingRebind(editor: Editor, tr: NumberingTransaction, local: SequenceLocalResult): void {
  if (!local.pendingRebind) return;
  for (const item of local.pendingRebind) {
    updateNumberingProperties(
      { numId: local.numId, ilvl: item.level ?? 0 },
      item.candidate.node,
      item.candidate.pos,
      editor,
      tr,
    );
  }
}

/**
 * Execute a single-level mutation with clone-on-write semantics.
 * Like `executeSingleLevelMutation` but ensures the abstract is sequence-local first.
 */
function executeSequenceLocalLevelMutation(
  editor: Editor,
  operationId: string,
  target: { kind: 'block'; nodeType: 'listItem'; nodeId: string },
  level: number,
  options: MutationOptions | undefined,
  mutate: (abstractNumId: number, ilvl: number) => boolean,
): ListsMutateItemResult {
  rejectTrackedMode(operationId, options);

  const levelError = validateLevel(level);
  if (levelError) return levelError;

  const targetResult = resolveTargetAbstract(editor, target);
  if (!targetResult.ok) return (targetResult as TargetAbstractFailure).failure;

  if (!LevelFormattingHelpers.hasLevel(editor, targetResult.abstractNumId, level)) {
    return toListsFailure('LEVEL_NOT_FOUND', `Level ${level} does not exist in the abstract definition.`, {
      target,
      level,
    });
  }

  if (options?.dryRun) {
    return { success: true, item: targetResult.resolved.address };
  }

  let noOp = false;

  const compound = compoundMutation({
    editor,
    source: operationId,
    affectedParts: [NUMBERING_PART],
    execute() {
      // Clone-on-write: prepare sequence-local abstract (converter-only, no PM dispatch).
      // This is cheap (just converter data) and will be rolled back by compoundMutation
      // if we return false.
      const resolved = resolveListItem(editor, target);
      const local = ensureSequenceLocalAbstract(editor, resolved, targetResult.abstractNumId, targetResult.numId);

      const result = mutatePart({
        editor,
        partId: NUMBERING_PART,
        operation: 'mutate',
        source: operationId,
        expectedRevision: options?.expectedRevision,
        mutate({ part }) {
          LevelFormattingHelpers.materializeLevelFormattingOverride(editor, local.abstractNumId, local.numId, level);
          const changed = mutate(local.abstractNumId, level);
          if (!changed) return false;
          LevelFormattingHelpers.copySequenceStateOverrides(editor, local.sourceNumId, local.numId, [level]);
          syncNumberingToXmlTree(part, getConverterNumbering(editor));
          return true;
        },
      });

      // The mutation itself must have changed something — a clone alone is not enough.
      if (!result.changed) {
        noOp = true;
        return false; // compoundMutation rolls back the clone
      }

      // Apply rebinding + re-render in a single PM transaction
      const { tr } = editor.state;
      applyPendingRebind(editor, tr, local);
      dispatchEditorTransaction(editor, tr);
      if (local.pendingRebind) clearIndexCache(editor);
      return true;
    },
  });

  if (noOp) {
    return toListsFailure('NO_OP', `${operationId}: values already match.`, { target });
  }
  if (!compound.success) {
    return toListsFailure('NO_OP', `${operationId}: mutation failed.`, { target });
  }

  return { success: true, item: targetResult.resolved.address };
}

// ---------------------------------------------------------------------------
// SD-2025 — New user-facing wrappers
// ---------------------------------------------------------------------------

export function listsGetStyleWrapper(editor: Editor, input: ListsGetStyleInput): ListsGetStyleResult {
  const levelsError = validateLevelsArray(input.levels);
  if (levelsError) return levelsError;

  const normalized = normalizeLevels(input.levels);

  const targetResult = resolveTargetAbstract(editor, input.target);
  if (!targetResult.ok) return (targetResult as TargetAbstractFailure).failure;

  const style = LevelFormattingHelpers.captureEffectiveStyle(
    editor,
    targetResult.abstractNumId,
    targetResult.numId,
    normalized,
  ) as ListTemplate | null;

  if (!style) {
    return toListsFailure('INVALID_TARGET', 'Could not capture style from target.', { target: input.target });
  }

  return { success: true, style };
}

export function listsApplyStyleWrapper(
  editor: Editor,
  input: ListsApplyStyleInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  rejectTrackedMode('lists.applyStyle', options);

  if (input.style.version !== 1) {
    return toListsFailure('INVALID_INPUT', 'Unsupported style version.', { version: input.style.version });
  }

  const levelsError = validateLevelsArray(input.levels);
  if (levelsError) return levelsError;

  const normalized = normalizeLevels(input.levels);

  const targetResult = resolveTargetAbstract(editor, input.target);
  if (!targetResult.ok) return (targetResult as TargetAbstractFailure).failure;

  const preflightError = preflightTemplateLevels(input.style, normalized, input.target);
  if (preflightError) return preflightError;

  if (options?.dryRun) {
    return { success: true, item: targetResult.resolved.address };
  }

  let applyError: string | undefined;
  let noOp = false;

  const compound = compoundMutation({
    editor,
    source: 'lists.applyStyle',
    affectedParts: [NUMBERING_PART],
    execute() {
      const resolved = resolveListItem(editor, input.target);
      const local = ensureSequenceLocalAbstract(editor, resolved, targetResult.abstractNumId, targetResult.numId);

      const result = mutatePart({
        editor,
        partId: NUMBERING_PART,
        operation: 'mutate',
        source: 'lists.applyStyle',
        expectedRevision: options?.expectedRevision,
        mutate({ part }) {
          const affectedLevels = normalized ?? input.style.levels.map((l) => l.level);
          for (const ilvl of affectedLevels) {
            LevelFormattingHelpers.materializeLevelFormattingOverride(editor, local.abstractNumId, local.numId, ilvl);
          }

          const applyResult = LevelFormattingHelpers.applyTemplateToAbstract(
            editor,
            local.abstractNumId,
            input.style,
            normalized,
          ) as { changed: boolean; error?: string };
          if (applyResult.error) {
            applyError = applyResult.error;
            return false;
          }

          if (!applyResult.changed) return false;
          LevelFormattingHelpers.copySequenceStateOverrides(editor, local.sourceNumId, local.numId, affectedLevels);
          syncNumberingToXmlTree(part, getConverterNumbering(editor));
          return true;
        },
      });

      if (applyError || !result.changed) {
        noOp = !applyError;
        return false; // compoundMutation rolls back the clone
      }

      const { tr } = editor.state;
      applyPendingRebind(editor, tr, local);
      dispatchEditorTransaction(editor, tr);
      if (local.pendingRebind) clearIndexCache(editor);
      return true;
    },
  });

  if (applyError) return toApplyTemplateError(applyError, input.target);
  if (noOp) return toListsFailure('NO_OP', 'All style levels already match.', { target: input.target });
  if (!compound.success) return toListsFailure('NO_OP', 'Style application failed.', { target: input.target });

  return { success: true, item: targetResult.resolved.address };
}

type SetValueInput = { target: { kind: 'block'; nodeType: 'listItem'; nodeId: string }; value: number | null };
type SetValueDelegate = (editor: Editor, input: SetValueInput, options?: MutationOptions) => ListsMutateItemResult;

let _setValueDelegate: SetValueDelegate | undefined;

/** Register the setValue delegate so restartAt can reuse its separation + override logic. */
export function registerSetValueDelegate(fn: SetValueDelegate): void {
  _setValueDelegate = fn;
}

export function listsRestartAtWrapper(
  editor: Editor,
  input: ListsRestartAtInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  rejectTrackedMode('lists.restartAt', options);

  if (input.startAt < 1 || !Number.isInteger(input.startAt)) {
    return toListsFailure('INVALID_INPUT', 'startAt must be a positive integer (>= 1).', { startAt: input.startAt });
  }

  const resolved = resolveListItem(editor, input.target);
  if (resolved.numId == null) {
    return toListsFailure('INVALID_TARGET', 'Target must have numbering metadata.', { target: input.target });
  }

  // Reject bullet sequences
  if (resolved.kind === 'bullet') {
    return toListsFailure('INVALID_INPUT', 'Cannot restart numbering on a bullet list.', { target: input.target });
  }

  if (!_setValueDelegate) {
    return toListsFailure('INVALID_INPUT', 'restartAt: internal delegate not registered.', { target: input.target });
  }

  // Delegate to the existing setValue wrapper which handles both
  // first-in-sequence and mid-sequence (auto-separate + startOverride)
  return _setValueDelegate(editor, { target: input.target, value: input.startAt }, options);
}

export function listsSetLevelNumberStyleWrapper(
  editor: Editor,
  input: ListsSetLevelNumberStyleInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  // Reject 'bullet' — must use setLevelBullet or setLevelPictureBullet
  if (input.numberStyle === 'bullet') {
    return toListsFailure('INVALID_INPUT', 'Use setLevelBullet or setLevelPictureBullet to set bullet format.', {
      numberStyle: input.numberStyle,
    });
  }

  return executeSequenceLocalLevelMutation(
    editor,
    'lists.setLevelNumberStyle',
    input.target,
    input.level,
    options,
    (abstractNumId, ilvl) => LevelFormattingHelpers.setLevelNumberStyle(editor, abstractNumId, ilvl, input.numberStyle),
  );
}

export function listsSetLevelTextWrapper(
  editor: Editor,
  input: ListsSetLevelTextInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  return executeSequenceLocalLevelMutation(
    editor,
    'lists.setLevelText',
    input.target,
    input.level,
    options,
    (abstractNumId, ilvl) => LevelFormattingHelpers.setLevelText(editor, abstractNumId, ilvl, input.text),
  );
}

export function listsSetLevelStartWrapper(
  editor: Editor,
  input: ListsSetLevelStartInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  if (input.startAt < 1 || !Number.isInteger(input.startAt)) {
    return toListsFailure('INVALID_INPUT', 'startAt must be a positive integer (>= 1).', { startAt: input.startAt });
  }

  // Pre-check: reject bullet levels before entering the shared mutation path
  const levelError = validateLevel(input.level);
  if (!levelError) {
    const targetResult = resolveTargetAbstract(editor, input.target);
    if (targetResult.ok && LevelFormattingHelpers.hasLevel(editor, targetResult.abstractNumId, input.level)) {
      const abstracts = getConverterNumbering(editor).abstracts as Record<number, unknown>;
      const lvlEl = LevelFormattingHelpers.findLevelElement(abstracts[targetResult.abstractNumId], input.level);
      const props = LevelFormattingHelpers.readLevelProperties(lvlEl, input.level);
      if (props.numFmt === 'bullet') {
        return toListsFailure('INVALID_INPUT', 'Cannot set start value on a bullet level.', {
          target: input.target,
          level: input.level,
        });
      }
    }
  }

  return executeSequenceLocalLevelMutation(
    editor,
    'lists.setLevelStart',
    input.target,
    input.level,
    options,
    (abstractNumId, ilvl) => LevelFormattingHelpers.setLevelStart(editor, abstractNumId, ilvl, input.startAt),
  );
}

export function listsSetLevelLayoutWrapper(
  editor: Editor,
  input: ListsSetLevelLayoutInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  rejectTrackedMode('lists.setLevelLayout', options);

  const levelError = validateLevel(input.level);
  if (levelError) return levelError;

  const targetResult = resolveTargetAbstract(editor, input.target);
  if (!targetResult.ok) return (targetResult as TargetAbstractFailure).failure;

  if (!LevelFormattingHelpers.hasLevel(editor, targetResult.abstractNumId, input.level)) {
    return toListsFailure('LEVEL_NOT_FOUND', `Level ${input.level} does not exist in the abstract definition.`, {
      target: input.target,
      level: input.level,
    });
  }

  if (options?.dryRun) {
    return { success: true, item: targetResult.resolved.address };
  }

  let noOp = false;
  let layoutError: string | undefined;

  const compound = compoundMutation({
    editor,
    source: 'lists.setLevelLayout',
    affectedParts: [NUMBERING_PART],
    execute() {
      const resolved = resolveListItem(editor, input.target);
      const local = ensureSequenceLocalAbstract(editor, resolved, targetResult.abstractNumId, targetResult.numId);

      const result = mutatePart({
        editor,
        partId: NUMBERING_PART,
        operation: 'mutate',
        source: 'lists.setLevelLayout',
        expectedRevision: options?.expectedRevision,
        mutate({ part }) {
          LevelFormattingHelpers.materializeLevelFormattingOverride(
            editor,
            local.abstractNumId,
            local.numId,
            input.level,
          );
          const layoutResult = LevelFormattingHelpers.setLevelLayout(
            editor,
            local.abstractNumId,
            input.level,
            input.layout,
          ) as { changed: boolean; error?: string };

          if (layoutResult.error) {
            layoutError = layoutResult.error;
            return false;
          }
          if (!layoutResult.changed) return false;
          syncNumberingToXmlTree(part, getConverterNumbering(editor));
          return true;
        },
      });

      if (layoutError || !result.changed) {
        noOp = !layoutError;
        return false;
      }

      const { tr } = editor.state;
      applyPendingRebind(editor, tr, local);
      dispatchEditorTransaction(editor, tr);
      if (local.pendingRebind) clearIndexCache(editor);
      return true;
    },
  });

  if (layoutError) {
    return toListsFailure('INVALID_INPUT', `Layout mutation failed: ${layoutError}.`, { target: input.target });
  }
  if (noOp) return toListsFailure('NO_OP', 'lists.setLevelLayout: values already match.', { target: input.target });
  if (!compound.success)
    return toListsFailure('NO_OP', 'lists.setLevelLayout: mutation failed.', { target: input.target });

  return { success: true, item: targetResult.resolved.address };
}

// ---------------------------------------------------------------------------
// Existing wrappers (clearLevelOverrides)
// ---------------------------------------------------------------------------

export function listsClearLevelOverridesWrapper(
  editor: Editor,
  input: ListsClearLevelOverridesInput,
  options?: MutationOptions,
): ListsMutateItemResult {
  rejectTrackedMode('lists.clearLevelOverrides', options);

  const levelError = validateLevel(input.level);
  if (levelError) return levelError;

  const resolved = resolveListItem(editor, input.target);
  if (resolved.numId == null) {
    return toListsFailure('INVALID_TARGET', 'Target must have numbering metadata.', { target: input.target });
  }

  if (options?.dryRun) {
    return { success: true, item: resolved.address };
  }

  // Check if override exists (no-op detection)
  if (!LevelFormattingHelpers.hasLevelOverride(editor, resolved.numId, input.level)) {
    return toListsFailure('NO_OP', 'No override exists for this level.', { target: input.target, level: input.level });
  }

  let noOp = false;

  const compound = compoundMutation({
    editor,
    source: 'lists.clearLevelOverrides',
    affectedParts: [NUMBERING_PART],
    execute() {
      const result = mutatePart({
        editor,
        partId: NUMBERING_PART,
        operation: 'mutate',
        source: 'lists.clearLevelOverrides',
        expectedRevision: options?.expectedRevision,
        mutate({ part }) {
          LevelFormattingHelpers.clearLevelOverride(editor, resolved.numId!, input.level);
          syncNumberingToXmlTree(part, getConverterNumbering(editor));
          return true;
        },
      });

      if (!result.changed) {
        noOp = true;
        return false;
      }

      dispatchEditorTransaction(editor, editor.state.tr);
      return true;
    },
  });

  if (noOp) {
    return toListsFailure('NO_OP', 'clearLevelOverrides could not be applied.', { target: input.target });
  }
  if (!compound.success) {
    return toListsFailure('NO_OP', 'clearLevelOverrides mutation failed.', { target: input.target });
  }

  return { success: true, item: resolved.address };
}
