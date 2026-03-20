/**
 * Convenience wrappers — bridge the positional TextAddress-based API to
 * the plan engine's single execution path.
 *
 * Each wrapper builds a pre-resolved CompiledPlan and delegates to
 * executeCompiledPlan, so all mutations flow through the same execution core.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  MutationOptions,
  MutationStep,
  InsertInput,
  TextAddress,
  TextMutationReceipt,
  TextMutationResolution,
  SDMutationReceipt,
  WriteRequest,
  StyleApplyInput,
  InlineRunPatchKey,
  PlanReceipt,
  ReceiptFailure,
  SDInsertInput,
  SDReplaceInput,
  ReplaceInput,
  BlockNodeAddress,
  StepWhere,
  SelectionMutationRequest,
  SelectionTarget,
  SelectionPoint,
  SelectionEdgeNodeType,
  StepOutcome,
  SelectionStepResolution,
  StoryLocator,
} from '@superdoc/document-api';
import {
  isStructuralInsertInput,
  isStructuralReplaceInput,
  textReceiptToSDReceipt,
  buildStructuralReceipt,
  INLINE_PROPERTY_BY_KEY,
} from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';
import type { CompiledPlan } from './compiler.js';
import { compilePlan } from './compiler.js';
import type { CompiledTarget, CompiledSpanTarget } from './executor-registry.types.js';
import { executeCompiledPlan } from './executor.js';
import { checkRevision, getRevision } from './revision-tracker.js';
import { compoundMutation } from '../../core/parts/mutation/compound-mutation.js';
import { DocumentApiAdapterError } from '../errors.js';
import {
  insertParagraphAtEnd,
  resolveDefaultInsertTarget,
  resolveTextTarget,
  resolveWriteTarget,
  type ResolvedTextTarget,
  type ResolvedWrite,
} from '../helpers/adapter-utils.js';
import { buildTextMutationResolution, readTextAtResolvedRange } from '../helpers/text-mutation-resolution.js';
import { ensureTrackedCapability, requireEditorCommand, rejectTrackedMode } from '../helpers/mutation-helpers.js';
import { TrackFormatMarkName } from '../../extensions/track-changes/constants.js';
import { applyDirectMutationMeta, applyTrackedMutationMeta } from '../helpers/transaction-meta.js';
import { markdownToPmFragment } from '../../core/helpers/markdown/markdownToPmContent.js';
import {
  executeStructuralInsert as executeStructuralInsertEngine,
  executeStructuralReplace as executeStructuralReplaceEngine,
  resolveReplaceTarget as resolveStructuralReplaceTarget,
  resolveInsertTarget as resolveStructuralInsertTarget,
  resolvePlacement,
} from '../structural-write-engine/index.js';
import { resolveSelectionTarget } from '../helpers/selection-target-resolver.js';
import { getBlockIndex } from '../helpers/index-cache.js';
import {
  findBlockByNodeIdOnly,
  isTextBlockCandidate,
  type BlockCandidate,
  type BlockIndex,
} from '../helpers/node-address-resolver.js';
import { getInlinePropertyCapabilityIssue, getTrackedInlinePropertySupportIssue } from './inline-property-guards.js';
import { resolveStoryRuntime } from '../story-runtime/resolve-story-runtime.js';
import { resolveMutationStory } from '../story-runtime/resolve-story-context.js';
import type { StoryRuntime } from '../story-runtime/story-types.js';
import { decodeRef } from '../story-runtime/story-ref-codec.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check whether the editor has a DOM document available for HTML parsing. */
function editorHasDom(editor: Editor): boolean {
  const opts = (editor as any).options;
  return !!(opts?.document ?? opts?.mockDocument ?? (typeof document !== 'undefined' ? document : null));
}

function isMismatchedTransactionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('Applying a mismatched transaction');
}

function insertContentAtWithRetry(
  editor: Editor,
  range: { from: number; to: number },
  content: Record<string, unknown>[] | string,
): boolean {
  try {
    return Boolean(editor.commands.insertContentAt(range, content));
  } catch (error) {
    if (!isMismatchedTransactionError(error)) throw error;
    // Retry once with a fresh command transaction. This covers rare races where
    // another dispatch lands between transaction creation and dispatch.
    return Boolean(editor.commands.insertContentAt(range, content));
  }
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Resolves a story runtime with write intent.
 *
 * Convenience wrapper around {@link resolveStoryRuntime} that always passes
 * `{ intent: 'write' }`, enabling story-specific resolvers to materialize
 * parts that do not yet exist (e.g., blank header/footer slots).
 *
 * @param editor  - The host (body) editor.
 * @param locator - Target story. `undefined` defaults to body.
 */
export function resolveWriteStoryRuntime(editor: Editor, locator?: StoryLocator): StoryRuntime {
  return resolveStoryRuntime(editor, locator, { intent: 'write' });
}

/**
 * Disposes a story runtime only if it is ephemeral (non-cacheable).
 *
 * Cacheable runtimes are managed by the LRU cache and must not be
 * disposed by the caller. Ephemeral runtimes (e.g., temporary write-only
 * views) must be cleaned up after use to avoid leaking editor instances.
 *
 * @param runtime - The story runtime to conditionally dispose.
 */
export function disposeEphemeralWriteRuntime(runtime: StoryRuntime): void {
  if (runtime.cacheable === false) {
    runtime.dispose?.();
  }
}

function resolveSelectionMutationStory(request: SelectionMutationRequest): StoryLocator | undefined {
  return resolveMutationStory({
    in: request.in,
    target: request.target as { story?: StoryLocator } | undefined,
    ref: request.ref,
  });
}

/**
 * Ensure every inserted markdown image node has a stable `sdImageId`.
 *
 * The markdown converter should already provide this, but we enforce it at the
 * insert boundary so `images.list/get` remain reliable even if upstream
 * conversion changes or misses an edge-case image shape.
 */
function ensureMarkdownImageIds(nodes: Record<string, unknown>[]): void {
  const visit = (node: Record<string, unknown>) => {
    if (node.type === 'image') {
      const attrs = isJsonObject(node.attrs) ? { ...node.attrs } : {};
      const hasStableId = typeof attrs.sdImageId === 'string' && attrs.sdImageId.length > 0;
      if (!hasStableId) {
        attrs.sdImageId = uuidv4();
      }
      node.attrs = attrs;
    }

    if (!Array.isArray(node.content)) return;
    for (const child of node.content) {
      if (isJsonObject(child)) visit(child);
    }
  };

  for (const node of nodes) {
    visit(node);
  }
}

/**
 * Mutate `jsonNodes` in place so that consecutive table nodes within the
 * array are separated by an empty paragraph. Only handles within-fragment
 * adjacency — document-context separators (leading/trailing) are handled
 * by the caller after inspecting the insertion position.
 */
function ensureTableSeparators(jsonNodes: Record<string, unknown>[]): void {
  for (let i = jsonNodes.length - 2; i >= 0; i--) {
    if (jsonNodes[i].type === 'table' && jsonNodes[i + 1].type === 'table') {
      jsonNodes.splice(i + 1, 0, { type: 'paragraph' });
    }
  }
}

/**
 * Extracts the block ID from a structural target, regardless of its kind.
 */
function targetBlockId(target: TextAddress | BlockNodeAddress): string {
  return target.kind === 'block' ? target.nodeId : target.blockId;
}

/**
 * Coerces a structural target to a TextAddress for internal resolution APIs
 * that require it (e.g. text mutation resolution).
 *
 * The zero range is a lookup sentinel — it does not affect behavior.
 */
function toTextAddress(target: TextAddress | BlockNodeAddress): TextAddress {
  if (target.kind === 'text') return target;
  return { kind: 'text', blockId: target.nodeId, range: { start: 0, end: 0 } };
}

// ---------------------------------------------------------------------------
// Locator normalization (same validation as the old adapters)
// ---------------------------------------------------------------------------

function normalizeWriteLocator(request: WriteRequest): WriteRequest {
  const hasBlockId = request.blockId !== undefined;
  const hasOffset = request.offset !== undefined;

  if (hasOffset && request.target) {
    throw new DocumentApiAdapterError('INVALID_TARGET', 'Cannot combine target with offset on insert request.', {
      fields: ['target', 'offset'],
    });
  }
  if (hasOffset && !hasBlockId) {
    throw new DocumentApiAdapterError('INVALID_TARGET', 'offset requires blockId on insert request.', {
      fields: ['offset', 'blockId'],
    });
  }
  if (!hasBlockId) return request;
  if (request.target) {
    throw new DocumentApiAdapterError('INVALID_TARGET', 'Cannot combine target with blockId on insert request.', {
      fields: ['target', 'blockId'],
    });
  }

  const effectiveOffset = request.offset ?? 0;
  const target: TextAddress = {
    kind: 'text',
    blockId: request.blockId!,
    range: { start: effectiveOffset, end: effectiveOffset },
  };
  return { kind: 'insert', target, text: request.text };
}

type FormatOperationInput = {
  target?: TextAddress | SelectionTarget;
  ref?: string;
  blockId?: string;
  start?: number;
  end?: number;
};

function normalizeFormatLocator(input: FormatOperationInput): FormatOperationInput {
  const hasBlockId = input.blockId !== undefined;
  const hasStart = input.start !== undefined;
  const hasEnd = input.end !== undefined;

  if (input.target && (hasBlockId || hasStart || hasEnd)) {
    throw new DocumentApiAdapterError(
      'INVALID_TARGET',
      'Cannot combine target with blockId/start/end on format request.',
      { fields: ['target', 'blockId', 'start', 'end'] },
    );
  }
  if (!hasBlockId && (hasStart || hasEnd)) {
    throw new DocumentApiAdapterError('INVALID_TARGET', 'start/end require blockId on format request.', {
      fields: ['blockId', 'start', 'end'],
    });
  }
  if (!hasBlockId) return input;
  if (!hasStart || !hasEnd) {
    throw new DocumentApiAdapterError('INVALID_TARGET', 'blockId requires both start and end on format request.', {
      fields: ['blockId', 'start', 'end'],
    });
  }

  const target: TextAddress = {
    kind: 'text',
    blockId: input.blockId!,
    range: { start: input.start!, end: input.end! },
  };
  return { target };
}

// ---------------------------------------------------------------------------
// Receipt mapping: PlanReceipt → TextMutationReceipt
// ---------------------------------------------------------------------------

function mapPlanReceiptToTextReceipt(_receipt: PlanReceipt, resolution: TextMutationResolution): TextMutationReceipt {
  return { success: true, resolution };
}

// ---------------------------------------------------------------------------
// Stub step builder — wrapper steps bypass compilation, so the `where` clause
// is never evaluated. We build a structurally-valid MutationStep for the type
// system; only `id`, `op`, and `args` matter at execution time.
// ---------------------------------------------------------------------------

export const STUB_WHERE = {
  by: 'select' as const,
  select: { type: 'text' as const, pattern: '', mode: 'exact' as const },
  require: 'exactlyOne' as const,
};

// ---------------------------------------------------------------------------
// Target → CompiledTarget
// ---------------------------------------------------------------------------

function toCompiledTarget(stepId: string, op: string, resolved: ResolvedWrite): CompiledTarget {
  return {
    kind: 'range',
    stepId,
    op,
    blockId: resolved.effectiveTarget.blockId,
    from: resolved.effectiveTarget.range.start,
    to: resolved.effectiveTarget.range.end,
    absFrom: resolved.range.from,
    absTo: resolved.range.to,
    text: resolved.resolution.text,
    marks: [],
  };
}

// ---------------------------------------------------------------------------
// Domain command execution helper
// ---------------------------------------------------------------------------

/**
 * Execute a domain command through the plan engine. Builds a single-step
 * CompiledPlan with a `domain.command` executor that delegates to the
 * provided handler closure.
 *
 * This is the bridge for all domain wrappers (create, lists, comments,
 * trackChanges) to route their mutations through executeCompiledPlan.
 */
export function executeDomainCommand(
  editor: Editor,
  handler: () => boolean,
  options?: { expectedRevision?: string; changeMode?: 'direct' | 'tracked' },
): PlanReceipt {
  const stepId = uuidv4();
  const step = {
    id: stepId,
    op: 'domain.command',
    where: STUB_WHERE,
    args: {},
    _handler: handler,
  } as unknown as MutationStep;
  const compiled: CompiledPlan = {
    mutationSteps: [{ step, targets: [] }],
    assertSteps: [],
    compiledRevision: getRevision(editor),
  };
  return executeCompiledPlan(editor, compiled, {
    expectedRevision: options?.expectedRevision,
    changeMode: options?.changeMode,
  });
}

// ---------------------------------------------------------------------------
// Write wrappers (insert / replace / delete)
// ---------------------------------------------------------------------------

function validateWriteRequest(request: WriteRequest, resolved: ResolvedWrite): ReceiptFailure | null {
  if (!request.text) return { code: 'INVALID_TARGET', message: 'Insert operations require non-empty text.' };
  if (resolved.range.from !== resolved.range.to) {
    return { code: 'INVALID_TARGET', message: 'Insert operations require a collapsed target range.' };
  }
  return null;
}

/**
 * Write wrapper for insert operations only.
 *
 * Delete and replace now route through `selectionMutationWrapper` via
 * `SelectionMutationAdapter`. This wrapper handles the legacy insert path
 * that still uses `TextAddress`-based `InsertWriteRequest`.
 */
export function writeWrapper(editor: Editor, request: WriteRequest, options?: MutationOptions): TextMutationReceipt {
  const runtime = resolveWriteStoryRuntime(editor, request.in);

  try {
    const storyEditor = runtime.editor;
    const normalizedRequest = normalizeWriteLocator(request);

    const resolved = resolveWriteTarget(storyEditor, normalizedRequest);
    if (!resolved) {
      throw new DocumentApiAdapterError('TARGET_NOT_FOUND', 'Mutation target could not be resolved.', {
        target: normalizedRequest.target,
      });
    }

    const validationFailure = validateWriteRequest(normalizedRequest, resolved);
    if (validationFailure) {
      return { success: false, resolution: resolved.resolution, failure: validationFailure };
    }

    const mode = options?.changeMode ?? 'direct';
    if (mode === 'tracked') ensureTrackedCapability(storyEditor, { operation: 'write' });

    if (options?.dryRun) {
      return { success: true, resolution: resolved.resolution };
    }

    // Structural-end: the doc ends with non-text blocks. Create a paragraph
    // containing the text at the structural document end via a domain command,
    // since raw `tr.insert(pos, textNode)` cannot place text between blocks.
    if (resolved.structuralEnd) {
      const insertPos = resolved.range.from;
      const text = normalizedRequest.text ?? '';
      const receipt = executeDomainCommand(
        storyEditor,
        (): boolean => {
          const meta = mode === 'tracked' ? applyTrackedMutationMeta : applyDirectMutationMeta;
          insertParagraphAtEnd(storyEditor, insertPos, text, meta);
          return true;
        },
        { expectedRevision: options?.expectedRevision },
      );
      if (runtime.commit) runtime.commit(editor);
      return mapPlanReceiptToTextReceipt(receipt, resolved.resolution);
    }

    // Build single-step compiled plan with pre-resolved target.
    const stepId = uuidv4();
    const step = {
      id: stepId,
      op: 'text.insert',
      where: STUB_WHERE,
      args: { position: 'before', content: { text: normalizedRequest.text ?? '' } },
    } as unknown as MutationStep;

    const target = toCompiledTarget(stepId, 'text.insert', resolved);
    const compiled: CompiledPlan = {
      mutationSteps: [{ step, targets: [target] }],
      assertSteps: [],
      compiledRevision: getRevision(storyEditor),
    };

    const receipt = executeCompiledPlan(storyEditor, compiled, {
      changeMode: mode,
      expectedRevision: options?.expectedRevision,
    });

    if (runtime.commit) runtime.commit(editor);
    return mapPlanReceiptToTextReceipt(receipt, resolved.resolution);
  } finally {
    disposeEphemeralWriteRuntime(runtime);
  }
}

// ---------------------------------------------------------------------------
// Canonical format.apply wrapper (multi-style inline patch semantics)
// ---------------------------------------------------------------------------

interface ResolvedFormatTarget {
  target: TextAddress;
  range: ResolvedTextTarget;
  resolution: TextMutationResolution;
}

function resolveFormatTarget(editor: Editor, target: TextAddress, operation: string): ResolvedFormatTarget {
  const range = resolveTextTarget(editor, target);
  if (!range) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', `${operation} target could not be resolved.`, { target });
  }
  const resolution = buildTextMutationResolution({
    requestedTarget: target,
    target,
    range,
    text: readTextAtResolvedRange(editor, range),
  });
  return { target, range, resolution };
}

function noOpFailure(resolution: TextMutationResolution, operation: string): TextMutationReceipt {
  return {
    success: false,
    resolution,
    failure: { code: 'NO_OP', message: `${operation} produced no change.` },
  };
}

function ensureInlinePropertyCapabilities(editor: Editor, keys: readonly InlineRunPatchKey[]): void {
  const issue = getInlinePropertyCapabilityIssue(editor, keys);
  if (!issue) return;
  throw new DocumentApiAdapterError(issue.code, issue.message, issue.details);
}

function ensureTrackedInlinePropertySupport(keys: readonly InlineRunPatchKey[]): void {
  const issue = getTrackedInlinePropertySupportIssue(keys);
  if (!issue) return;
  throw new DocumentApiAdapterError(issue.code, issue.message, issue.details);
}

/** @deprecated Legacy wrapper. New code routes through selectionMutationWrapper. */
export function styleApplyWrapper(
  editor: Editor,
  input: StyleApplyInput,
  options?: MutationOptions,
): TextMutationReceipt {
  const normalizedInput = normalizeFormatLocator(input as unknown as FormatOperationInput);
  const textTarget = normalizedInput.target as TextAddress | undefined;
  const resolved = resolveFormatTarget(editor, textTarget!, 'format.apply');

  if (resolved.range.from === resolved.range.to) {
    return {
      success: false,
      resolution: resolved.resolution,
      failure: { code: 'INVALID_TARGET', message: 'format.apply requires a non-collapsed target range.' },
    };
  }

  const inlineKeys = Object.keys(input.inline) as InlineRunPatchKey[];
  ensureInlinePropertyCapabilities(editor, inlineKeys);

  const mode = options?.changeMode ?? 'direct';
  if (mode === 'tracked') {
    ensureTrackedInlinePropertySupport(inlineKeys);
    ensureTrackedCapability(editor, { operation: 'format.apply', requireMarks: [TrackFormatMarkName] });
  }

  if (options?.dryRun) {
    return { success: true, resolution: resolved.resolution };
  }

  // Build single-step compiled plan using the full inline payload
  const stepId = uuidv4();
  const step = {
    id: stepId,
    op: 'format.apply',
    where: STUB_WHERE,
    args: { inline: input.inline },
  } as unknown as MutationStep;

  const target: CompiledTarget = {
    kind: 'range',
    stepId,
    op: 'format.apply',
    blockId: textTarget!.blockId,
    from: textTarget!.range.start,
    to: textTarget!.range.end,
    absFrom: resolved.range.from,
    absTo: resolved.range.to,
    text: resolved.resolution.text,
    marks: [],
  };

  const compiled: CompiledPlan = {
    mutationSteps: [{ step, targets: [target] }],
    assertSteps: [],
    compiledRevision: getRevision(editor),
  };

  const receipt = executeCompiledPlan(editor, compiled, {
    changeMode: mode,
    expectedRevision: options?.expectedRevision,
  });

  return mapPlanReceiptToTextReceipt(receipt, resolved.resolution);
}

// ---------------------------------------------------------------------------
// Selection mutation wrapper — routes delete/replace/format through the
// compiler's where.by: 'target' or where.by: 'ref' path.
// ---------------------------------------------------------------------------

/**
 * Builds the `where` clause for a selection mutation request.
 * Returns either `{ by: 'target', target }` or `{ by: 'ref', ref }`.
 */
function buildSelectionWhere(request: SelectionMutationRequest): StepWhere {
  if (request.target) {
    return { by: 'target', target: request.target };
  }
  if (request.ref) {
    return { by: 'ref', ref: request.ref };
  }
  throw new DocumentApiAdapterError('INVALID_TARGET', 'Selection mutation requires either target or ref.');
}

/**
 * Maps a SelectionMutationRequest to a plan step op and args.
 */
function buildSelectionStepDef(stepId: string, request: SelectionMutationRequest, where: StepWhere): MutationStep {
  switch (request.kind) {
    case 'delete':
      return {
        id: stepId,
        op: 'text.delete',
        where,
        args: { behavior: request.behavior },
      } as unknown as MutationStep;

    case 'replace':
      return {
        id: stepId,
        op: 'text.rewrite',
        where,
        args: {
          replacement: { text: request.text },
          style: { inline: { mode: 'preserve' } },
        },
      } as unknown as MutationStep;

    case 'format':
      return {
        id: stepId,
        op: 'format.apply',
        where,
        args: { inline: request.inline },
      } as unknown as MutationStep;
  }
}

/**
 * Bridge between SelectionMutationAdapter.execute() and the plan engine.
 *
 * Builds a one-step MutationPlan with a proper where clause and routes
 * it through compile → validate → execute. This is the single execution
 * path for all selection-based mutations (delete, replace-text, format.apply).
 */
export function selectionMutationWrapper(
  editor: Editor,
  request: SelectionMutationRequest,
  options?: MutationOptions,
): TextMutationReceipt {
  // Resolve story runtime from the full mutation context:
  // - explicit input.in
  // - target.story threaded by discovery APIs
  // - V4 ref storyKey when the mutation is ref-only
  const effectiveLocator = resolveSelectionMutationStory(request);
  const runtime = resolveWriteStoryRuntime(editor, effectiveLocator);

  try {
    const storyEditor = runtime.editor;
    const mode = options?.changeMode ?? 'direct';
    if (mode === 'tracked') ensureTrackedCapability(storyEditor, { operation: request.kind });

    // Capability checks for format operations.
    if (request.kind === 'format') {
      const inlineKeys = Object.keys(request.inline) as InlineRunPatchKey[];
      ensureInlinePropertyCapabilities(storyEditor, inlineKeys);
      if (mode === 'tracked') ensureTrackedInlinePropertySupport(inlineKeys);
    }

    const stepId = uuidv4();
    const where = buildSelectionWhere(request);
    const step = buildSelectionStepDef(stepId, request, where);

    // Compile the one-step plan through the real compiler.
    // Compilation is side-effect-free — it resolves targets against the current
    // document state without mutating anything. The story editor is used so that
    // the compiler resolves against the correct story's document state.
    const compiled = compilePlan(storyEditor, [step]);

    // Enforce expectedRevision even on dry-run — callers need to know if the
    // document has drifted since their last query, regardless of execution.
    checkRevision(storyEditor, options?.expectedRevision);

    // Dry-run: compile and resolve, but do NOT execute.
    if (options?.dryRun) {
      const resolution = buildSelectionResolutionFromCompiled(compiled, stepId);
      return { success: true, resolution };
    }

    // Execute through the shared execution engine.
    const receipt = executeCompiledPlan(storyEditor, compiled, {
      changeMode: mode,
      expectedRevision: options?.expectedRevision,
    });

    // Map PlanReceipt → TextMutationReceipt.
    const stepOutcome = receipt.steps.find((s) => s.stepId === stepId);
    const resolution = buildSelectionResolutionFromOutcome(stepOutcome, compiled, stepId);

    const success = stepOutcome?.effect === 'changed';
    if (!success) {
      return {
        success: false,
        resolution,
        failure: { code: 'NO_OP', message: `${request.kind} produced no change.` },
      };
    }

    // Persist non-body story changes back to the canonical OOXML parts.
    // Body stories are handled by ProseMirror's normal persistence path.
    if (runtime.commit) {
      runtime.commit(editor);
    }

    return { success: true, resolution };
  } finally {
    disposeEphemeralWriteRuntime(runtime);
  }
}

/**
 * Extracts a backward-compatible blockId from a SelectionPoint.
 *
 * For `text` points the blockId is the point's own blockId.
 * For `nodeEdge` points we use the addressed node's nodeId — this is the
 * block-level node that the edge refers to, which is the closest valid
 * block identifier we can provide for the legacy TextAddress shape.
 */
function blockIdFromPoint(point: SelectionPoint): string {
  return point.kind === 'text' ? point.blockId : point.node.nodeId;
}

/**
 * Converts a SelectionTarget and its absolute range into a TextMutationResolution.
 *
 * The backward-compatible `target` (TextAddress) is derived from the start
 * point — nodeEdge points use the node's nodeId so callers always get a
 * meaningful blockId. The full `selectionTarget` is included whenever the
 * two endpoints refer to different blocks or different point kinds.
 */
function selectionTargetToResolution(
  selectionTarget: SelectionTarget,
  range: { from: number; to: number },
  text: string,
): TextMutationResolution {
  const startPoint = selectionTarget.start;
  const endPoint = selectionTarget.end;

  const blockId = blockIdFromPoint(startPoint);
  const startOffset = startPoint.kind === 'text' ? startPoint.offset : 0;
  const endOffset = endPoint.kind === 'text' && endPoint.blockId === blockId ? endPoint.offset : startOffset;

  const isCrossBlock =
    startPoint.kind !== 'text' ||
    endPoint.kind !== 'text' ||
    blockIdFromPoint(startPoint) !== blockIdFromPoint(endPoint);

  return {
    target: { kind: 'text', blockId, range: { start: startOffset, end: endOffset } },
    range,
    text,
    ...(isCrossBlock ? { selectionTarget } : undefined),
  };
}

/** Fallback resolution when no target data is available. */
const EMPTY_RESOLUTION: TextMutationResolution = {
  target: { kind: 'text', blockId: '', range: { start: 0, end: 0 } },
  range: { from: 0, to: 0 },
  text: '',
};

/**
 * Builds a TextMutationResolution directly from the compiled plan's
 * CompiledSelectionTarget. This produces correct resolution data
 * regardless of how the executor internally represents targets.
 */
function buildSelectionResolutionFromCompiled(compiled: CompiledPlan, stepId: string): TextMutationResolution {
  const compiledStep = compiled.mutationSteps.find((s) => s.step.id === stepId);
  const target = compiledStep?.targets[0];

  if (target?.kind === 'selection') {
    return selectionTargetToResolution(
      target.normalizedTarget,
      { from: target.absFrom, to: target.absTo },
      target.text,
    );
  }

  if (target?.kind === 'range') {
    return {
      target: { kind: 'text', blockId: target.blockId, range: { start: target.from, end: target.to } },
      range: { from: target.absFrom, to: target.absTo },
      text: target.text,
    };
  }

  if (target?.kind === 'span') {
    return spanTargetToResolution(target);
  }

  return EMPTY_RESOLUTION;
}

/** Converts a CompiledSpanTarget to a TextMutationResolution using its segments. */
function spanTargetToResolution(target: CompiledSpanTarget): TextMutationResolution {
  const first = target.segments[0];
  const last = target.segments[target.segments.length - 1];
  if (!first || !last) {
    return EMPTY_RESOLUTION;
  }

  const isCrossBlock = first.blockId !== last.blockId;
  const selectionTarget: SelectionTarget | undefined = isCrossBlock
    ? {
        kind: 'selection',
        start: { kind: 'text', blockId: first.blockId, offset: first.from },
        end: { kind: 'text', blockId: last.blockId, offset: last.to },
      }
    : undefined;

  return {
    target: { kind: 'text', blockId: first.blockId, range: { start: first.from, end: first.to } },
    range: { from: first.absFrom, to: last.absTo },
    text: target.text,
    ...(selectionTarget ? { selectionTarget } : undefined),
  };
}

/**
 * Builds resolution from a step outcome, falling back to compiled target
 * data when the outcome doesn't carry resolutions.
 */
function buildSelectionResolutionFromOutcome(
  stepOutcome: StepOutcome | undefined,
  compiled: CompiledPlan,
  stepId: string,
): TextMutationResolution {
  // Try plan outcome first — executors may produce detailed resolutions.
  if (stepOutcome?.data) {
    const data = stepOutcome.data;

    // Prefer selection-aware resolutions when available — these carry
    // absolute ranges and full SelectionTarget metadata.
    if (
      'selectionResolutions' in data &&
      Array.isArray(data.selectionResolutions) &&
      data.selectionResolutions.length > 0
    ) {
      const selRes = data.selectionResolutions[0] as SelectionStepResolution;
      return selectionTargetToResolution(selRes.selectionTarget, selRes.range, selRes.text);
    }

    // Skip data.resolutions — TextStepResolution.range carries block-relative
    // offsets, but TextMutationResolution.range requires absolute document
    // positions. The compiled target fallback always has correct absolute ranges.
  }

  // Fall back to the compiled target data, which is always correct.
  return buildSelectionResolutionFromCompiled(compiled, stepId);
}

// ---------------------------------------------------------------------------
// Structured content insertion (markdown / html)
// ---------------------------------------------------------------------------

/**
 * Insert structured content (markdown or html) at a target position.
 *
 * Routes through `executeDomainCommand` to enforce the revision guard.
 * Conversion (markdown → AST → PM, or html → insertContentAt) happens
 * inside the handler, so list-definition side effects only occur after the
 * revision check passes. HTML content is passed directly to
 * `editor.commands.insertContentAt` to avoid prosemirror-model dual-copy
 * issues when the Editor is loaded from a bundled dist.
 *
 * Tracked mode is explicitly rejected for structured content in this implementation.
 */
export function insertStructuredWrapper(
  editor: Editor,
  input: InsertInput,
  options?: MutationOptions,
): SDMutationReceipt {
  // Resolve story runtime from the input's `in` field.
  const runtime = resolveWriteStoryRuntime(editor, (input as { in?: StoryLocator }).in);

  try {
    const storyEditor = runtime.editor;
    let result: SDMutationReceipt;

    // Structural (SDFragment) inserts with a BlockNodeAddress target produce
    // a block-level receipt directly, avoiding the synthetic TextAddress bridge.
    if (isStructuralInsertInput(input) && input.target) {
      result = executeStructuralInsertDirect(storyEditor, input, options);
    } else {
      result = textReceiptToSDReceipt(insertStructuredInner(storyEditor, input, options));
    }

    // Persist non-body story changes
    if (result.success !== false && runtime.commit) {
      runtime.commit(editor);
    }

    return result;
  } finally {
    disposeEphemeralWriteRuntime(runtime);
  }
}

/**
 * Inner implementation for insertStructuredWrapper.
 * Returns a TextMutationReceipt that the public wrapper converts to SDMutationReceipt.
 */
function insertStructuredInner(editor: Editor, input: InsertInput, options?: MutationOptions): TextMutationReceipt {
  // Structural SDFragment path — delegate to the structural write engine
  if (isStructuralInsertInput(input)) {
    return executeStructuralInsertWrapper(editor, input, options);
  }

  // Legacy markdown/html path
  const contentType = input.type ?? 'text';
  const { value, target } = input;

  // Tracked mode not supported for structured content
  const mode = options?.changeMode ?? 'direct';
  if (mode === 'tracked') {
    throw new DocumentApiAdapterError(
      'CAPABILITY_UNAVAILABLE',
      `Tracked mode is not supported for type: '${contentType}' insert operations.`,
    );
  }

  // Resolve target position
  let resolvedRange: ResolvedTextTarget;
  let effectiveTarget: TextAddress;

  if (target) {
    const range = resolveTextTarget(editor, target);
    if (!range) {
      throw new DocumentApiAdapterError('TARGET_NOT_FOUND', 'Structured insert target could not be resolved.', {
        target,
      });
    }
    resolvedRange = range;
    effectiveTarget = target;
  } else {
    const fallback = resolveDefaultInsertTarget(editor);
    if (!fallback) {
      throw new DocumentApiAdapterError('TARGET_NOT_FOUND', 'No default insertion point available.');
    }
    if (fallback.kind === 'structural-end') {
      // Doc ends with non-text blocks — insert structured content at the
      // structural document end. Structured content (markdown/html) produces
      // block-level nodes that ProseMirror can place between blocks.
      const pos = fallback.insertPos;
      resolvedRange = { from: pos, to: pos };
      effectiveTarget = { kind: 'text', blockId: '', range: { start: 0, end: 0 } };
    } else {
      resolvedRange = fallback.range;
      effectiveTarget = fallback.target;
    }
  }

  const resolution = buildTextMutationResolution({
    requestedTarget: target,
    target: effectiveTarget,
    range: resolvedRange,
    text: readTextAtResolvedRange(editor, resolvedRange),
  });

  const { from, to } = resolvedRange;

  // Insert semantics are point-only for doc.insert, regardless of content type.
  if (from !== to) {
    return {
      success: false,
      resolution,
      failure: { code: 'INVALID_TARGET', message: 'Insert operations require a collapsed target range.' },
    };
  }

  // Dry-run: parse + validate but do not mutate
  if (options?.dryRun) {
    if (contentType === 'markdown') {
      // Parse to validate structure (side-effect-free with dryRun: true)
      const { fragment } = markdownToPmFragment(value, editor, { dryRun: true });
      if (fragment.childCount === 0) {
        return {
          success: false,
          resolution,
          failure: { code: 'NO_OP', message: 'Markdown produced no content to insert.' },
        };
      }
    } else if (contentType === 'html') {
      // Dry-run for HTML: validate that a DOM is available and input is non-empty.
      // Full PM parsing validation happens at insert time via the Editor's
      // bundled command infrastructure (see the non-dry-run path below).
      if (!value || typeof value !== 'string' || value.trim().length === 0) {
        return {
          success: false,
          resolution,
          failure: { code: 'NO_OP', message: 'HTML content is empty.' },
        };
      }
      if (!editorHasDom(editor)) {
        return {
          success: false,
          resolution,
          failure: {
            code: 'UNSUPPORTED_ENVIRONMENT',
            message: 'HTML insert requires a DOM environment. Provide { document } in editor options.',
          },
        };
      }
    }
    return { success: true, resolution };
  }

  // Convert and insert inside executeDomainCommand so the revision guard
  // runs before any conversion side effects (e.g. list numbering allocation).
  // compoundMutation provides automatic rollback of numbering state, revision,
  // and converter metadata if the insert fails.
  let insertFailure: ReceiptFailure | undefined;

  const { success: commandSucceeded } = compoundMutation({
    editor,
    source: 'doc.insert:structured',
    affectedParts: ['word/numbering.xml'],
    execute() {
      const receipt = executeDomainCommand(
        editor,
        (): boolean => {
          if (contentType === 'markdown') {
            const { fragment } = markdownToPmFragment(value, editor);

            if (fragment.childCount === 0) {
              insertFailure = { code: 'NO_OP', message: 'Markdown produced no content to insert.' };
              return false;
            }

            // Convert Fragment to a JSON array — insertContentAt routes arrays
            // through Fragment.fromArray(content.map(schema.nodeFromJSON)), which
            // correctly materializes the nodes. Passing a Fragment directly fails
            // because createNodeFromContent treats it as a single JSON object.
            const jsonNodes: Record<string, unknown>[] = [];
            fragment.forEach((node) => jsonNodes.push(node.toJSON()));
            ensureMarkdownImageIds(jsonNodes);

            // Word always separates adjacent tables with a paragraph. Without a
            // trailing separator, consecutive markdown inserts produce adjacent
            // <w:tbl> elements that Word merges into one visual table.
            ensureTableSeparators(jsonNodes);

            // insertContentAt replaces empty textblocks when inserting block
            // content. Check whether the replaced paragraph's neighbors are tables
            // and add separators to prevent adjacency in the result.
            if (from === to) {
              const $pos = editor.state.doc.resolve(from);
              const parent = $pos.parent;
              if (parent.isTextblock && !parent.childCount) {
                const grandparent = $pos.node($pos.depth - 1);
                const idx = $pos.index($pos.depth - 1);
                const prevIsTable = idx > 0 && grandparent.child(idx - 1).type.name === 'table';
                const nextIsTable =
                  idx + 1 < grandparent.childCount && grandparent.child(idx + 1).type.name === 'table';
                const atEnd = idx + 1 >= grandparent.childCount;

                if (jsonNodes[0]?.type === 'table' && prevIsTable) {
                  jsonNodes.unshift({ type: 'paragraph' });
                }
                if (jsonNodes[jsonNodes.length - 1]?.type === 'table' && (nextIsTable || atEnd)) {
                  jsonNodes.push({ type: 'paragraph' });
                }
              }
            }

            const ok = insertContentAtWithRetry(editor, { from, to }, jsonNodes);
            if (!ok) {
              insertFailure = {
                code: 'INVALID_TARGET',
                message: 'Structured content could not be inserted at the target position.',
              };
            }
            return ok;
          } else if (contentType === 'html') {
            // Pass HTML string directly to insertContentAt. This avoids a
            // prosemirror-model dual-copy issue: calling processContent from this
            // source file imports DOMParser from node_modules, but the Editor's
            // schema uses the bundled copy from the superdoc dist. Routing through
            // the Editor's command infrastructure uses the same bundled copy for
            // both DOMParser and the schema — avoiding the mismatch.
            if (!editorHasDom(editor)) {
              insertFailure = {
                code: 'UNSUPPORTED_ENVIRONMENT',
                message: 'HTML insert requires a DOM environment. Provide { document } in editor options.',
              };
              return false;
            }
            try {
              const ok = insertContentAtWithRetry(editor, { from, to }, value);
              if (!ok) {
                insertFailure = {
                  code: 'INVALID_TARGET',
                  message: 'HTML content could not be inserted at the target position.',
                };
              }
              return ok;
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              insertFailure = {
                code: 'UNSUPPORTED_ENVIRONMENT',
                message: `HTML structured insert requires a DOM environment. ${message}`,
              };
              return false;
            }
          }
          return false;
        },
        { expectedRevision: options?.expectedRevision },
      );
      return receipt.steps[0]?.effect === 'changed';
    },
  });

  // Schedule list migration after successful html/markdown insert,
  // matching the insertContent command's post-insert hook.
  if (commandSucceeded) {
    Promise.resolve()
      .then(() => (editor as any).migrateListsToV2?.())
      .catch(() => {});
  }

  if (!commandSucceeded) {
    return {
      success: false,
      resolution,
      failure: insertFailure ?? { code: 'INVALID_TARGET', message: 'Structured insert failed.' },
    };
  }

  return { success: true, resolution };
}

// ---------------------------------------------------------------------------
// Structural SDFragment insert wrapper
// ---------------------------------------------------------------------------

/**
 * Handles structural insert (SDFragment content).
 * Wraps the structural write engine to produce a TextMutationReceipt.
 */
function executeStructuralInsertWrapper(
  editor: Editor,
  input: SDInsertInput,
  options?: MutationOptions,
): TextMutationReceipt {
  const { content, target, placement, nestingPolicy } = input;
  const mode = options?.changeMode ?? 'direct';

  // Block-level resolution for metadata — uses the structural engine's resolver
  // so ALL block types (tables, images, etc.) are addressable, not just text blocks.
  let resolved;
  try {
    resolved = resolveStructuralInsertTarget(editor, target);
  } catch (err) {
    if (err instanceof DocumentApiAdapterError) throw err;
    throw new DocumentApiAdapterError(
      'TARGET_NOT_FOUND',
      `Cannot resolve insert target${target ? ` for block "${target.nodeId}"` : ''}.`,
    );
  }

  const effectiveTarget: TextAddress = resolved.effectiveTarget ?? {
    kind: 'text',
    blockId: '',
    range: { start: 0, end: 0 },
  };

  // Compute the placement-adjusted insertion position (same logic as the engine).
  // Without this, the receipt would report the pre-placement position, which differs
  // from the actual insertion point for 'before', 'insideStart', 'insideEnd'.
  let insertPos: number;
  if (resolved.targetNode && resolved.targetNodePos !== undefined) {
    insertPos = resolvePlacement(editor.state.doc, resolved.targetNodePos, resolved.targetNode, placement);
  } else {
    insertPos = resolved.insertPos;
  }

  const resolvedRange = { from: insertPos, to: insertPos };
  const resolution = buildTextMutationResolution({
    target: effectiveTarget,
    range: resolvedRange,
    text: '',
  });

  try {
    // Dry-run: run full structural engine validation (target, materialization, nesting),
    // but skip dispatch.
    if (options?.dryRun) {
      executeStructuralInsertEngine(editor, {
        target,
        content,
        placement,
        nestingPolicy,
        changeMode: mode,
        dryRun: true,
      });
      return { success: true, resolution };
    }

    const receipt = executeDomainCommand(
      editor,
      () => {
        const result = executeStructuralInsertEngine(editor, {
          target,
          content,
          placement,
          nestingPolicy,
          changeMode: mode,
        });
        return result.success;
      },
      { expectedRevision: options?.expectedRevision, changeMode: mode },
    );

    const succeeded = receipt.steps[0]?.effect === 'changed';
    if (!succeeded) {
      return {
        success: false,
        resolution,
        failure: { code: 'INVALID_TARGET', message: 'Structural insert failed.' },
      };
    }

    return { success: true, resolution };
  } catch (err) {
    if (err instanceof DocumentApiAdapterError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      resolution,
      failure: { code: 'INVALID_TARGET', message: `Structural insert failed: ${message}` },
    };
  }
}

/**
 * Builds an SDMutationReceipt directly for structural inserts that target a
 * BlockNodeAddress, preserving the original block address in the resolution
 * instead of normalizing it to a synthetic TextAddress.
 */
function executeStructuralInsertDirect(
  editor: Editor,
  input: SDInsertInput,
  options?: MutationOptions,
): SDMutationReceipt {
  const { content, target, placement, nestingPolicy } = input;
  const mode = options?.changeMode ?? 'direct';

  // Resolve insert position directly from the BlockNodeAddress — no TextAddress conversion.
  let resolved;
  try {
    resolved = resolveStructuralInsertTarget(editor, target);
  } catch (err) {
    if (err instanceof DocumentApiAdapterError) throw err;
    throw new DocumentApiAdapterError(
      'TARGET_NOT_FOUND',
      `Cannot resolve insert target for block "${target!.nodeId}".`,
    );
  }

  let insertPos: number;
  if (resolved.targetNode && resolved.targetNodePos !== undefined) {
    insertPos = resolvePlacement(editor.state.doc, resolved.targetNodePos, resolved.targetNode, placement);
  } else {
    insertPos = resolved.insertPos;
  }

  const range = { from: insertPos, to: insertPos };
  const receiptParams = { target: target!, range };

  try {
    if (options?.dryRun) {
      executeStructuralInsertEngine(editor, {
        target,
        content,
        placement,
        nestingPolicy,
        changeMode: mode,
        dryRun: true,
      });
      return buildStructuralReceipt(true, receiptParams);
    }

    const receipt = executeDomainCommand(
      editor,
      () => {
        const result = executeStructuralInsertEngine(editor, {
          target,
          content,
          placement,
          nestingPolicy,
          changeMode: mode,
        });
        return result.success;
      },
      { expectedRevision: options?.expectedRevision, changeMode: mode },
    );

    if (receipt.steps[0]?.effect !== 'changed') {
      return buildStructuralReceipt(false, receiptParams, {
        code: 'INVALID_TARGET',
        message: 'Structural insert failed.',
      });
    }

    return buildStructuralReceipt(true, receiptParams);
  } catch (err) {
    if (err instanceof DocumentApiAdapterError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    return buildStructuralReceipt(false, receiptParams, {
      code: 'INVALID_TARGET',
      message: `Structural insert failed: ${message}`,
    });
  }
}

// ---------------------------------------------------------------------------
// Structural SDFragment replace wrapper
// ---------------------------------------------------------------------------

/**
 * Entry point for structural replace operations.
 *
 * Detects structural (SDFragment) input and delegates to the structural
 * replace engine. Non-structural input is rejected (legacy replace uses writeWrapper).
 */
export function replaceStructuredWrapper(
  editor: Editor,
  input: ReplaceInput,
  options?: MutationOptions,
): SDMutationReceipt {
  if (!isStructuralReplaceInput(input)) {
    throw new DocumentApiAdapterError(
      'INVALID_INPUT',
      'replaceStructured requires structural content input with a "content" field.',
    );
  }

  // Resolve story from the full mutation context:
  // - explicit input.in
  // - target.story threaded by discovery APIs
  // - V4 ref storyKey when the mutation is ref-only
  const effectiveLocator = resolveMutationStory({
    in: (input as { in?: StoryLocator }).in,
    target: input.target as { story?: StoryLocator } | undefined,
    ref: input.ref,
  });
  const runtime = resolveWriteStoryRuntime(editor, effectiveLocator);

  try {
    const storyEditor = runtime.editor;

    // When the target is a BlockNodeAddress, re-wrap the receipt to preserve
    // the block-level address instead of the synthetic TextAddress.
    const blockTarget =
      input.target && 'kind' in input.target && input.target.kind === 'block'
        ? (input.target as BlockNodeAddress)
        : undefined;

    const textReceipt = executeStructuralReplaceWrapper(storyEditor, input, options);

    // Only persist non-body story changes when the replace actually succeeded.
    // Committing on failure would write unchanged content back to OOXML,
    // potentially materializing inherited header/footer slots or emitting
    // spurious partChanged events.
    if (textReceipt.success && runtime.commit) {
      runtime.commit(editor);
    }

    if (!blockTarget) return textReceiptToSDReceipt(textReceipt);

    const sdReceipt = textReceiptToSDReceipt(textReceipt);
    if (sdReceipt.resolution) {
      sdReceipt.resolution.target = blockTarget;
    }
    return sdReceipt;
  } finally {
    disposeEphemeralWriteRuntime(runtime);
  }
}

/**
 * Resolved structural replace locator — contains the primary target address
 * (for the engine's target parameter) and metadata about the actual
 * replacement scope for accurate receipt resolution.
 */
interface ResolvedStructuralLocator {
  /** Primary target — BlockNodeAddress for typed inputs, TextAddress for refs/selections. */
  textTarget: TextAddress | BlockNodeAddress;
  /**
   * Pre-resolved PM range spanning the full replacement area.
   * Present for SelectionTarget and multi-segment text ref locators.
   * When absent, the engine resolves the range from `textTarget`.
   */
  resolvedRange?: { from: number; to: number };
  /**
   * Effective SelectionTarget describing the actual block-boundary-expanded
   * scope of the replacement. Present whenever the replacement spans more
   * than one block — whether the input was a SelectionTarget or a multi-block
   * ref. Used to populate `selectionTarget` on the receipt.
   */
  effectiveSelectionTarget?: SelectionTarget;
  /**
   * True when the input used a ref-based locator (no caller-supplied target).
   * Resolution should omit `requestedTarget` since the TextAddress is synthetic.
   */
  isRefBased?: boolean;
}

/**
 * Resolves the target/ref locator from an SDReplaceInput into a
 * ResolvedStructuralLocator for the structural replace engine.
 *
 * Single-block locators (BlockNodeAddress, raw nodeId ref) produce
 * only a `textTarget`. Multi-block locators (cross-block SelectionTarget,
 * multi-segment text refs) also produce a `resolvedRange` spanning the
 * full contiguous block range so the engine replaces all covered blocks.
 */
function resolveStructuralLocator(editor: Editor, input: SDReplaceInput): ResolvedStructuralLocator {
  const { target, ref } = input;

  if (target !== undefined) {
    // SelectionTarget — resolve to absolute positions.
    if (target.kind === 'selection') {
      const sel = target;
      const resolved = resolveSelectionTarget(editor, sel);

      // Expand to full block boundaries for structural replace.
      const index = getBlockIndex(editor);
      const expanded = expandToBlockBoundaries(index, resolved.absFrom, resolved.absTo, {
        startHint: resolveSelectionBoundaryHint(index, sel.start),
        endHint: resolveSelectionBoundaryHint(index, sel.end),
      });

      const textTarget: TextAddress = {
        kind: 'text',
        blockId: expanded.firstBlock.nodeId,
        range: { start: 0, end: 0 },
      };

      return {
        textTarget,
        resolvedRange: { from: expanded.blockFrom, to: expanded.blockTo },
        effectiveSelectionTarget: buildEffectiveSelectionTarget(expanded),
      };
    }
    // BlockNodeAddress — pass through directly for typed block lookup.
    return { textTarget: target };
  }

  if (ref !== undefined) {
    // V3/V4 text ref — decode payload and resolve blocks.
    if (ref.startsWith('text:')) {
      // V4 node-scope refs (from non-body block matches) carry a node.nodeId
      // instead of segments. Extract the nodeId and resolve as a single block.
      const decoded = decodeRef(ref);
      if (decoded && decoded.v === 4 && decoded.scope === 'node' && decoded.node?.nodeId) {
        return {
          textTarget: { kind: 'text', blockId: decoded.node.nodeId, range: { start: 0, end: 0 } },
          isRefBased: true,
        };
      }

      const result = resolveTextRefLocator(editor, ref);
      return { ...result, isRefBased: true };
    }
    // Raw nodeId ref — target the full block (single block).
    return {
      textTarget: { kind: 'text', blockId: ref, range: { start: 0, end: 0 } },
      isRefBased: true,
    };
  }

  throw new DocumentApiAdapterError('INVALID_TARGET', 'Structural replace requires either target or ref.');
}

/**
 * Decodes a text ref (V3 or V4) and resolves all segments to a spanning block range.
 * Single-segment refs resolve as single-block; multi-segment refs produce
 * a resolvedRange spanning from the first to last segment's block.
 */
function resolveTextRefLocator(editor: Editor, ref: string): ResolvedStructuralLocator {
  const decoded = decodeRef(ref);
  if (!decoded) {
    throw new DocumentApiAdapterError('INVALID_TARGET', `Cannot decode text ref for structural replace: ${ref}`);
  }

  const segments = decoded.segments;
  if (!Array.isArray(segments) || segments.length === 0) {
    throw new DocumentApiAdapterError(
      'INVALID_TARGET',
      'Text ref does not contain valid segments for structural replace.',
    );
  }

  const firstBlockId = segments[0].blockId;
  if (typeof firstBlockId !== 'string' || firstBlockId.length === 0) {
    throw new DocumentApiAdapterError(
      'INVALID_TARGET',
      'Text ref does not contain a valid blockId for structural replace.',
    );
  }

  const textTarget: TextAddress = { kind: 'text', blockId: firstBlockId, range: { start: 0, end: 0 } };

  // Single-segment ref → single-block replacement.
  if (segments.length === 1) {
    return { textTarget };
  }

  // Multi-segment ref → resolve all blocks and span the range.
  const index = getBlockIndex(editor);
  let rangeFrom = Infinity;
  let rangeTo = -Infinity;
  let firstCandidate: BlockCandidate | undefined;
  let lastCandidate: BlockCandidate | undefined;

  for (const seg of segments) {
    if (typeof seg.blockId !== 'string') continue;
    try {
      const block = findBlockByNodeIdOnly(index, seg.blockId);
      if (block.pos < rangeFrom) {
        rangeFrom = block.pos;
        firstCandidate = block;
      }
      if (block.end > rangeTo) {
        rangeTo = block.end;
        lastCandidate = block;
      }
    } catch {
      throw new DocumentApiAdapterError('TARGET_NOT_FOUND', `Cannot resolve text ref segment block "${seg.blockId}".`);
    }
  }

  // Build effective SelectionTarget for multi-block receipt metadata.
  const effectiveSelectionTarget: SelectionTarget | undefined =
    firstCandidate && lastCandidate && firstCandidate.nodeId !== lastCandidate.nodeId
      ? {
          kind: 'selection',
          start: buildSelectionPoint(firstCandidate, 'start'),
          end: buildSelectionPoint(lastCandidate, 'end'),
        }
      : undefined;

  return { textTarget, resolvedRange: { from: rangeFrom, to: rangeTo }, effectiveSelectionTarget };
}

/** Result of expanding a PM range to full block boundaries. */
interface ExpandedBlockRange {
  blockFrom: number;
  blockTo: number;
  /** The first block candidate in the expanded range. */
  firstBlock: BlockCandidate;
  /** The last block candidate in the expanded range. */
  lastBlock: BlockCandidate;
}

interface BoundaryHints {
  startHint?: BlockCandidate;
  endHint?: BlockCandidate;
}

/** Container node types that should not be used as block boundaries — they
 *  enclose child blocks and would cause the expansion to swallow entire tables. */
const CONTAINER_NODE_TYPES: ReadonlySet<string> = new Set(['table', 'tableRow', 'tableCell']);

function resolveSelectionBoundaryHint(index: BlockIndex, point: SelectionPoint): BlockCandidate | undefined {
  if (point.kind !== 'nodeEdge') return undefined;

  const key = `${point.node.nodeType}:${point.node.nodeId}`;
  if (index.ambiguous.has(key)) {
    throw new DocumentApiAdapterError('AMBIGUOUS_TARGET', `Multiple blocks share key "${key}".`, {
      nodeType: point.node.nodeType,
      nodeId: point.node.nodeId,
    });
  }

  const candidate = index.byId.get(key);
  if (!candidate) {
    throw new DocumentApiAdapterError(
      'TARGET_NOT_FOUND',
      `Node "${point.node.nodeType}" with id "${point.node.nodeId}" not found.`,
      { nodeType: point.node.nodeType, nodeId: point.node.nodeId },
    );
  }

  return candidate;
}

/**
 * Expands a PM position range to encompass full block boundaries.
 * Finds the first content-level block whose range intersects `absFrom` and
 * the last content-level block whose range intersects `absTo`, then returns
 * their outer boundaries plus the block IDs needed for receipt metadata.
 *
 * Container nodes (table, tableRow, tableCell) are excluded so that a
 * selection inside a table cell expands only to the cell's leaf blocks,
 * not to the entire table.
 */
function expandToBlockBoundaries(
  index: BlockIndex,
  absFrom: number,
  absTo: number,
  hints?: BoundaryHints,
): ExpandedBlockRange {
  let blockFrom = hints?.startHint?.pos ?? absFrom;
  let blockTo = hints?.endHint?.end ?? absTo;
  let firstBlock: BlockCandidate | undefined = hints?.startHint;
  let lastBlock: BlockCandidate | undefined = hints?.endHint;
  const lockStart = firstBlock !== undefined;
  const lockEnd = lastBlock !== undefined;

  for (const candidate of index.candidates) {
    if (CONTAINER_NODE_TYPES.has(candidate.nodeType)) continue;
    // Skip non-overlapping blocks.
    if (candidate.end <= absFrom || candidate.pos >= absTo) continue;
    if (!lockStart && candidate.pos <= blockFrom) {
      blockFrom = candidate.pos;
      firstBlock = candidate;
    }
    if (!lockEnd && candidate.end >= blockTo) {
      blockTo = candidate.end;
      lastBlock = candidate;
    }
  }

  if (!firstBlock || !lastBlock) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', 'Cannot resolve block boundaries for the target range.');
  }

  return { blockFrom, blockTo, firstBlock, lastBlock };
}

/** Node types valid as nodeEdge selection anchors — kept in sync with SELECTION_EDGE_NODE_TYPES in document-api. */
const VALID_EDGE_NODE_TYPES: ReadonlySet<string> = new Set<SelectionEdgeNodeType>([
  'paragraph',
  'heading',
  'table',
  'tableOfContents',
  'sdt',
  'image',
]);

/**
 * Builds a SelectionPoint for a block candidate.
 * Text blocks (paragraph, heading) produce `kind: 'text'` points.
 * Non-text blocks (table, tableOfContents, sdt) produce `kind: 'nodeEdge'` points.
 */
function buildSelectionPoint(candidate: BlockCandidate, edge: 'start' | 'end'): SelectionPoint {
  if (isTextBlockCandidate(candidate)) {
    return {
      kind: 'text',
      blockId: candidate.nodeId,
      offset: edge === 'start' ? 0 : candidate.node.textContent.length,
    };
  }
  if (!VALID_EDGE_NODE_TYPES.has(candidate.nodeType)) {
    throw new DocumentApiAdapterError(
      'INVALID_TARGET',
      `Block type "${candidate.nodeType}" is not valid as a selection edge anchor.`,
    );
  }
  return {
    kind: 'nodeEdge',
    node: {
      kind: 'block',
      nodeType: candidate.nodeType as SelectionEdgeNodeType,
      nodeId: candidate.nodeId,
    },
    edge: edge === 'start' ? 'before' : 'after',
  };
}

/**
 * Builds an effective SelectionTarget describing the full block-boundary scope
 * of a structural replacement. Returns undefined for single-block ranges.
 */
function buildEffectiveSelectionTarget(expanded: ExpandedBlockRange): SelectionTarget | undefined {
  if (expanded.firstBlock.nodeId === expanded.lastBlock.nodeId) return undefined;
  return {
    kind: 'selection',
    start: buildSelectionPoint(expanded.firstBlock, 'start'),
    end: buildSelectionPoint(expanded.lastBlock, 'end'),
  };
}

/**
 * Handles structural replace (SDFragment content).
 * Wraps the structural replace engine to produce a TextMutationReceipt.
 */
function executeStructuralReplaceWrapper(
  editor: Editor,
  input: SDReplaceInput,
  options?: MutationOptions,
): TextMutationReceipt {
  const { content, nestingPolicy } = input;
  const mode = options?.changeMode ?? 'direct';

  const locator = resolveStructuralLocator(editor, input);
  const { textTarget, resolvedRange: locatorRange, effectiveSelectionTarget, isRefBased } = locator;

  // Resolve the effective replacement range.
  // For multi-block locators, use the pre-resolved range. Otherwise,
  // fall back to single-block resolution through the structural engine.
  let effectiveRange: { from: number; to: number };
  if (locatorRange) {
    effectiveRange = locatorRange;
  } else {
    let resolvedBlock;
    try {
      resolvedBlock = resolveStructuralReplaceTarget(editor, textTarget);
    } catch (err) {
      if (err instanceof DocumentApiAdapterError) throw err;
      throw new DocumentApiAdapterError(
        'TARGET_NOT_FOUND',
        `Cannot resolve replace target for block "${targetBlockId(textTarget)}".`,
      );
    }
    effectiveRange = { from: resolvedBlock.from, to: resolvedBlock.to };
  }

  // Snapshot the text currently covered by the target range.
  const coveredText = editor.state.doc.textBetween(effectiveRange.from, effectiveRange.to, '\n', '\ufffc');

  // Build resolution from the effective (expanded) selection target when present.
  // This covers both SelectionTarget inputs and multi-block ref inputs — both
  // produce an effectiveSelectionTarget describing the actual block-boundary scope.
  // For single-block inputs, fall back to the direct TextAddress resolution.
  const textAddr = toTextAddress(textTarget);
  let resolution: TextMutationResolution;
  if (effectiveSelectionTarget) {
    resolution = selectionTargetToResolution(effectiveSelectionTarget, effectiveRange, coveredText);
  } else {
    resolution = buildTextMutationResolution({
      target: textAddr,
      range: effectiveRange,
      text: coveredText,
    });
  }

  // Enforce expectedRevision even on dry-run — callers need to know if the
  // document has drifted since their last query.
  checkRevision(editor, options?.expectedRevision);

  try {
    // Dry-run: run full structural engine validation (target, materialization, nesting),
    // but skip dispatch.
    if (options?.dryRun) {
      executeStructuralReplaceEngine(editor, {
        target: textTarget,
        content,
        nestingPolicy,
        changeMode: mode,
        dryRun: true,
        resolvedRange: locatorRange,
      });
      return { success: true, resolution };
    }

    const receipt = executeDomainCommand(
      editor,
      () => {
        const result = executeStructuralReplaceEngine(editor, {
          target: textTarget,
          content,
          nestingPolicy,
          changeMode: mode,
          resolvedRange: locatorRange,
        });
        return result.success;
      },
      { expectedRevision: options?.expectedRevision, changeMode: mode },
    );

    const succeeded = receipt.steps[0]?.effect === 'changed';
    if (!succeeded) {
      return {
        success: false,
        resolution,
        failure: { code: 'INVALID_TARGET', message: 'Structural replace failed.' },
      };
    }

    return { success: true, resolution };
  } catch (err) {
    if (err instanceof DocumentApiAdapterError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      resolution,
      failure: { code: 'INVALID_TARGET', message: `Structural replace failed: ${message}` },
    };
  }
}
