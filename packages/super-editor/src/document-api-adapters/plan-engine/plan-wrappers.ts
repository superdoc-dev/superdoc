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
  WriteRequest,
  StyleApplyInput,
  SetMarks,
  PlanReceipt,
  ReceiptFailure,
} from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';
import type { CompiledPlan } from './compiler.js';
import type { CompiledTarget } from './executor-registry.types.js';
import { executeCompiledPlan } from './executor.js';
import { getRevision } from './revision-tracker.js';
import { DocumentApiAdapterError } from '../errors.js';
import { resolveDefaultInsertTarget, resolveTextTarget, type ResolvedTextTarget } from '../helpers/adapter-utils.js';
import { buildTextMutationResolution, readTextAtResolvedRange } from '../helpers/text-mutation-resolution.js';
import { ensureTrackedCapability, requireSchemaMark } from '../helpers/mutation-helpers.js';
import { TrackFormatMarkName } from '../../extensions/track-changes/constants.js';
import { markdownToPmFragment } from '../../core/helpers/markdown/markdownToPmContent.js';
import { processContent } from '../../core/helpers/contentProcessor.js';

// ---------------------------------------------------------------------------
// Locator normalization (same validation as the old adapters)
// ---------------------------------------------------------------------------

function normalizeWriteLocator(request: WriteRequest): WriteRequest {
  if (request.kind === 'insert') {
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

  if (request.kind === 'replace' || request.kind === 'delete') {
    const hasBlockId = request.blockId !== undefined;
    const hasStart = request.start !== undefined;
    const hasEnd = request.end !== undefined;

    if (request.target && (hasBlockId || hasStart || hasEnd)) {
      throw new DocumentApiAdapterError(
        'INVALID_TARGET',
        `Cannot combine target with blockId/start/end on ${request.kind} request.`,
        { fields: ['target', 'blockId', 'start', 'end'] },
      );
    }
    if (!hasBlockId && (hasStart || hasEnd)) {
      throw new DocumentApiAdapterError('INVALID_TARGET', `start/end require blockId on ${request.kind} request.`, {
        fields: ['blockId', 'start', 'end'],
      });
    }
    if (!hasBlockId) return request;
    if (!hasStart || !hasEnd) {
      throw new DocumentApiAdapterError(
        'INVALID_TARGET',
        `blockId requires both start and end on ${request.kind} request.`,
        { fields: ['blockId', 'start', 'end'] },
      );
    }

    const target: TextAddress = {
      kind: 'text',
      blockId: request.blockId!,
      range: { start: request.start!, end: request.end! },
    };
    if (request.kind === 'replace') return { kind: 'replace', target, text: request.text };
    return { kind: 'delete', target, text: '' };
  }

  return request;
}

type FormatOperationInput = { target?: TextAddress; blockId?: string; start?: number; end?: number };

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
// Resolution helpers
// ---------------------------------------------------------------------------

interface ResolvedWrite {
  requestedTarget?: TextAddress;
  effectiveTarget: TextAddress;
  range: ResolvedTextTarget;
  resolution: TextMutationResolution;
}

function resolveWriteTarget(editor: Editor, request: WriteRequest): ResolvedWrite | null {
  const requestedTarget = request.target;

  if (request.kind === 'insert' && !request.target) {
    const fallback = resolveDefaultInsertTarget(editor);
    if (!fallback) return null;
    const text = readTextAtResolvedRange(editor, fallback.range);
    return {
      requestedTarget,
      effectiveTarget: fallback.target,
      range: fallback.range,
      resolution: buildTextMutationResolution({
        requestedTarget,
        target: fallback.target,
        range: fallback.range,
        text,
      }),
    };
  }

  const target = request.target;
  if (!target) return null;

  const range = resolveTextTarget(editor, target);
  if (!range) return null;

  const text = readTextAtResolvedRange(editor, range);
  return {
    requestedTarget,
    effectiveTarget: target,
    range,
    resolution: buildTextMutationResolution({ requestedTarget, target, range, text }),
  };
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
  options?: { expectedRevision?: string },
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
  return executeCompiledPlan(editor, compiled, { expectedRevision: options?.expectedRevision });
}

// ---------------------------------------------------------------------------
// Write wrappers (insert / replace / delete)
// ---------------------------------------------------------------------------

function validateWriteRequest(request: WriteRequest, resolved: ResolvedWrite): ReceiptFailure | null {
  if (request.kind === 'insert') {
    if (!request.text) return { code: 'INVALID_TARGET', message: 'Insert operations require non-empty text.' };
    if (resolved.range.from !== resolved.range.to) {
      return { code: 'INVALID_TARGET', message: 'Insert operations require a collapsed target range.' };
    }
    return null;
  }
  if (request.kind === 'replace') {
    if (request.text == null || request.text.length === 0) {
      return { code: 'INVALID_TARGET', message: 'Replace operations require non-empty text. Use delete for removals.' };
    }
    if (resolved.resolution.text === request.text) {
      return { code: 'NO_OP', message: 'Replace operation produced no change.' };
    }
    return null;
  }
  // delete
  if (resolved.range.from === resolved.range.to) {
    return { code: 'NO_OP', message: 'Delete operation produced no change for a collapsed range.' };
  }
  return null;
}

export function writeWrapper(editor: Editor, request: WriteRequest, options?: MutationOptions): TextMutationReceipt {
  const normalizedRequest = normalizeWriteLocator(request);

  const resolved = resolveWriteTarget(editor, normalizedRequest);
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
  if (mode === 'tracked') ensureTrackedCapability(editor, { operation: 'write' });

  if (options?.dryRun) {
    return { success: true, resolution: resolved.resolution };
  }

  // Build single-step compiled plan with pre-resolved target.
  // The step's `where` clause is a structural stub — it is never evaluated
  // because targets are already resolved.
  const stepId = uuidv4();
  let op: string;
  let stepDef: { id: string; op: string; where: typeof STUB_WHERE; args: unknown };

  if (normalizedRequest.kind === 'insert') {
    op = 'text.insert';
    stepDef = {
      id: stepId,
      op,
      where: STUB_WHERE,
      args: { position: 'before', content: { text: normalizedRequest.text ?? '' } },
    };
  } else if (normalizedRequest.kind === 'replace') {
    op = 'text.rewrite';
    stepDef = {
      id: stepId,
      op,
      where: STUB_WHERE,
      args: { replacement: { text: normalizedRequest.text ?? '' }, style: { inline: { mode: 'preserve' } } },
    };
  } else {
    op = 'text.delete';
    stepDef = {
      id: stepId,
      op,
      where: STUB_WHERE,
      args: {},
    };
  }

  const step = stepDef as unknown as MutationStep;
  const target = toCompiledTarget(stepId, op, resolved);
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
// Canonical format.apply wrapper (multi-style inline patch semantics)
// ---------------------------------------------------------------------------

/** Map from mark key to editor schema mark name. */
const MARK_KEY_TO_SCHEMA_NAME: Record<string, string> = {
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
  strike: 'strike',
};

export function styleApplyWrapper(
  editor: Editor,
  input: StyleApplyInput,
  options?: MutationOptions,
): TextMutationReceipt {
  const normalizedInput = normalizeFormatLocator(input);
  const range = resolveTextTarget(editor, normalizedInput.target!);
  if (!range) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', 'format.apply target could not be resolved.', {
      target: normalizedInput.target,
    });
  }

  const resolution = buildTextMutationResolution({
    requestedTarget: input.target,
    target: normalizedInput.target!,
    range,
    text: readTextAtResolvedRange(editor, range),
  });

  if (range.from === range.to) {
    return {
      success: false,
      resolution,
      failure: { code: 'INVALID_TARGET', message: 'format.apply requires a non-collapsed target range.' },
    };
  }

  // Validate that at least one requested inline style exists in the schema
  const markKeys = Object.keys(input.inline).filter((k) => input.inline[k as keyof SetMarks] !== undefined);
  for (const key of markKeys) {
    const schemaName = MARK_KEY_TO_SCHEMA_NAME[key];
    if (schemaName) {
      requireSchemaMark(editor, schemaName, 'format.apply');
    }
  }

  const mode = options?.changeMode ?? 'direct';
  if (mode === 'tracked') {
    ensureTrackedCapability(editor, { operation: 'format.apply', requireMarks: [TrackFormatMarkName] });
  }

  if (options?.dryRun) {
    return { success: true, resolution };
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
    blockId: normalizedInput.target!.blockId,
    from: normalizedInput.target!.range.start,
    to: normalizedInput.target!.range.end,
    absFrom: range.from,
    absTo: range.to,
    text: resolution.text,
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

  return mapPlanReceiptToTextReceipt(receipt, resolution);
}

// ---------------------------------------------------------------------------
// Structured content insertion (markdown / html)
// ---------------------------------------------------------------------------

/**
 * Insert structured content (markdown or html) at a target position.
 *
 * Routes through `executeDomainCommand` to enforce the revision guard.
 * Conversion (markdown → AST → PM, or html → processContent → PM) happens
 * inside the handler, so list-definition side effects only occur after the
 * revision check passes. HTML content goes through the canonical
 * `processContent` pipeline, matching the `insertContent` command path.
 *
 * Tracked mode is explicitly rejected for structured content in this implementation.
 */
export function insertStructuredWrapper(
  editor: Editor,
  input: InsertInput,
  options?: MutationOptions,
): TextMutationReceipt {
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
    resolvedRange = fallback.range;
    effectiveTarget = fallback.target;
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
      // NOTE: processContent has no dryRun flag — this runs the full HTML
      // pipeline (DOM creation, wrapTextsInRuns) minus the final insertContentAt.
      // Snapshot numbering state so we can roll back after the dry-run, since
      // HTML list parsing allocates IDs/definitions on editor.converter.
      const converter = (editor as any).converter;
      const numberingSnapshot = converter?.numbering ? JSON.parse(JSON.stringify(converter.numbering)) : undefined;
      const translatedNumberingSnapshot = converter?.translatedNumbering
        ? JSON.parse(JSON.stringify(converter.translatedNumbering))
        : undefined;
      try {
        const processedDoc = processContent({ content: value, type: 'html', editor });
        if (!processedDoc || typeof (processedDoc as { toJSON?: unknown }).toJSON !== 'function') {
          return {
            success: false,
            resolution,
            failure: {
              code: 'INVALID_TARGET',
              message: 'HTML processing did not produce a valid document node.',
            },
          };
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          resolution,
          failure: {
            code: 'UNSUPPORTED_ENVIRONMENT',
            message: `HTML structured insert requires a DOM environment. ${message}`,
          },
        };
      } finally {
        // Roll back numbering mutations from the dry-run HTML pipeline.
        if (converter && numberingSnapshot !== undefined) {
          converter.numbering = numberingSnapshot;
        }
        if (converter && translatedNumberingSnapshot !== undefined) {
          converter.translatedNumbering = translatedNumberingSnapshot;
        }
      }
    }
    return { success: true, resolution };
  }

  // Convert and insert inside executeDomainCommand so the revision guard
  // runs before any conversion side effects (e.g. list numbering allocation).
  let insertFailure: ReceiptFailure | undefined;

  // Snapshot numbering state so we can roll back if the insert fails.
  // List conversion allocates IDs and definitions on editor.converter — these
  // mutations sit outside the ProseMirror transaction and aren't auto-reverted.
  const converter = (editor as any).converter;
  const numberingSnapshot = converter?.numbering ? JSON.parse(JSON.stringify(converter.numbering)) : undefined;
  const translatedNumberingSnapshot = converter?.translatedNumbering
    ? JSON.parse(JSON.stringify(converter.translatedNumbering))
    : undefined;

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

        const ok = Boolean(editor.commands.insertContentAt({ from, to }, jsonNodes));
        if (!ok) {
          insertFailure = {
            code: 'INVALID_TARGET',
            message: 'Structured content could not be inserted at the target position.',
          };
        }
        return ok;
      } else if (contentType === 'html') {
        // Route through processContent for the canonical HTML pipeline
        // (createDocFromHTML + wrapTextsInRuns), matching insertContent command behavior.
        // processContent requires a DOM; in headless environments this will throw.
        try {
          const processedDoc = processContent({ content: value, type: 'html', editor });
          if (!processedDoc || typeof (processedDoc as { toJSON?: unknown }).toJSON !== 'function') {
            insertFailure = {
              code: 'INVALID_TARGET',
              message: 'HTML processing did not produce a valid document node.',
            };
            return false;
          }
          const jsonContent = (processedDoc as { toJSON(): Record<string, unknown> }).toJSON();

          const ok = Boolean(editor.commands.insertContentAt({ from, to }, jsonContent));
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

  const commandSucceeded = receipt.steps[0]?.effect === 'changed';

  // Roll back numbering side effects if the insert failed.
  // The ProseMirror transaction is only dispatched on success, but list ID
  // allocations mutate converter state directly and need manual rollback.
  if (!commandSucceeded && converter) {
    if (numberingSnapshot !== undefined) converter.numbering = numberingSnapshot;
    if (translatedNumberingSnapshot !== undefined) converter.translatedNumbering = translatedNumberingSnapshot;
  }

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
