import { v4 as uuidv4 } from 'uuid';
import type { Editor } from '../core/Editor.js';
import type {
  MutationOptions,
  ReceiptFailure,
  TextAddress,
  TextMutationReceipt,
  WriteRequest,
} from '@superdoc/document-api';
import { DocumentApiAdapterError } from './errors.js';
import { ensureTrackedCapability } from './helpers/mutation-helpers.js';
import { applyDirectMutationMeta } from './helpers/transaction-meta.js';
import { resolveDefaultInsertTarget, resolveTextTarget, type ResolvedTextTarget } from './helpers/adapter-utils.js';
import { buildTextMutationResolution, readTextAtResolvedRange } from './helpers/text-mutation-resolution.js';
import { toCanonicalTrackedChangeId } from './helpers/tracked-change-resolver.js';

function validateWriteRequest(request: WriteRequest, resolvedTarget: ResolvedWriteTarget): ReceiptFailure | null {
  if (request.kind === 'insert') {
    if (!request.text) {
      return {
        code: 'INVALID_TARGET',
        message: 'Insert operations require non-empty text.',
      };
    }

    if (resolvedTarget.range.from !== resolvedTarget.range.to) {
      return {
        code: 'INVALID_TARGET',
        message: 'Insert operations require a collapsed target range.',
      };
    }

    return null;
  }

  if (request.kind === 'replace') {
    if (request.text == null || request.text.length === 0) {
      return {
        code: 'INVALID_TARGET',
        message: 'Replace operations require non-empty text. Use delete for removals.',
      };
    }

    if (resolvedTarget.resolution.text === request.text) {
      return {
        code: 'NO_OP',
        message: 'Replace operation produced no change.',
      };
    }

    return null;
  }

  if (resolvedTarget.range.from === resolvedTarget.range.to) {
    return {
      code: 'NO_OP',
      message: 'Delete operation produced no change for a collapsed range.',
    };
  }

  return null;
}

type ResolvedWriteTarget = {
  requestedTarget?: TextAddress;
  effectiveTarget: TextAddress;
  range: ResolvedTextTarget;
  resolution: ReturnType<typeof buildTextMutationResolution>;
};

/**
 * Normalize block-relative locator fields into a canonical TextAddress.
 * This runs inside the adapter layer so that the resolution uses engine-specific block lookup.
 *
 * - Insert: blockId + offset → collapsed TextAddress
 * - Replace/Delete: blockId + start + end → ranged TextAddress
 *
 * Returns the original request unchanged when no friendly locator is present.
 */
function normalizeWriteLocator(request: WriteRequest): WriteRequest {
  if (request.kind === 'insert') {
    const hasBlockId = request.blockId !== undefined;
    const hasOffset = request.offset !== undefined;

    // Defensive: reject offset mixed with canonical target.
    if (hasOffset && request.target) {
      throw new DocumentApiAdapterError('INVALID_TARGET', 'Cannot combine target with offset on insert request.', {
        fields: ['target', 'offset'],
      });
    }

    // Defensive: reject orphaned offset without blockId (safety net for direct adapter callers).
    if (hasOffset && !hasBlockId) {
      throw new DocumentApiAdapterError('INVALID_TARGET', 'offset requires blockId on insert request.', {
        fields: ['offset', 'blockId'],
      });
    }

    if (!hasBlockId) return request;

    // Defensive: reject mixed locator modes at adapter boundary (safety net).
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

  // replace / delete: range normalization (blockId + start + end → TextAddress)
  if (request.kind === 'replace' || request.kind === 'delete') {
    const hasBlockId = request.blockId !== undefined;
    const hasStart = request.start !== undefined;
    const hasEnd = request.end !== undefined;

    // Defensive: reject range fields mixed with canonical target.
    if (request.target && (hasBlockId || hasStart || hasEnd)) {
      throw new DocumentApiAdapterError(
        'INVALID_TARGET',
        `Cannot combine target with blockId/start/end on ${request.kind} request.`,
        { fields: ['target', 'blockId', 'start', 'end'] },
      );
    }

    // Defensive: reject orphaned start/end without blockId.
    if (!hasBlockId && (hasStart || hasEnd)) {
      throw new DocumentApiAdapterError('INVALID_TARGET', `start/end require blockId on ${request.kind} request.`, {
        fields: ['blockId', 'start', 'end'],
      });
    }

    if (!hasBlockId) return request;

    // Defensive: reject incomplete range.
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

    // Construct clean canonical objects — no leftover friendly fields.
    if (request.kind === 'replace') {
      return { kind: 'replace', target, text: request.text };
    }
    return { kind: 'delete', target, text: '' };
  }

  return request;
}

function resolveWriteTarget(editor: Editor, request: WriteRequest): ResolvedWriteTarget | null {
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
    resolution: buildTextMutationResolution({
      requestedTarget,
      target,
      range,
      text,
    }),
  };
}

function applyDirectWrite(
  editor: Editor,
  request: WriteRequest,
  resolvedTarget: ResolvedWriteTarget,
): TextMutationReceipt {
  if (request.kind === 'delete') {
    const tr = applyDirectMutationMeta(editor.state.tr.delete(resolvedTarget.range.from, resolvedTarget.range.to));
    editor.dispatch(tr);
    return { success: true, resolution: resolvedTarget.resolution };
  }

  // text is guaranteed non-empty for insert/replace after validateWriteRequest
  const tr = applyDirectMutationMeta(
    editor.state.tr.insertText(request.text ?? '', resolvedTarget.range.from, resolvedTarget.range.to),
  );
  editor.dispatch(tr);
  return { success: true, resolution: resolvedTarget.resolution };
}

function applyTrackedWrite(
  editor: Editor,
  request: WriteRequest,
  resolvedTarget: ResolvedWriteTarget,
): TextMutationReceipt {
  ensureTrackedCapability(editor, { operation: 'write' });
  // insertTrackedChange is guaranteed to exist after ensureTrackedCapability.
  const insertTrackedChange = editor.commands!.insertTrackedChange!;
  const text = request.kind === 'delete' ? '' : (request.text ?? '');

  const changeId = uuidv4();
  const didApply = insertTrackedChange({
    from: resolvedTarget.range.from,
    to: request.kind === 'insert' ? resolvedTarget.range.from : resolvedTarget.range.to,
    text,
    id: changeId,
  });

  if (!didApply) {
    return {
      success: false,
      resolution: resolvedTarget.resolution,
      failure: {
        code: 'NO_OP',
        message: 'Tracked write command did not apply a change.',
      },
    };
  }
  const publicChangeId = toCanonicalTrackedChangeId(editor, changeId);

  return {
    success: true,
    resolution: resolvedTarget.resolution,
    ...(publicChangeId
      ? {
          inserted: [
            {
              kind: 'entity',
              entityType: 'trackedChange',
              entityId: publicChangeId,
            },
          ],
        }
      : {}),
  };
}

function toFailureReceipt(failure: ReceiptFailure, resolvedTarget: ResolvedWriteTarget): TextMutationReceipt {
  return {
    success: false,
    resolution: resolvedTarget.resolution,
    failure,
  };
}

export function writeAdapter(editor: Editor, request: WriteRequest, options?: MutationOptions): TextMutationReceipt {
  // Normalize friendly locator fields (blockId + offset) into canonical TextAddress
  // before resolution. This is the adapter-layer normalization per the contract.
  const normalizedRequest = normalizeWriteLocator(request);

  const resolvedTarget = resolveWriteTarget(editor, normalizedRequest);
  if (!resolvedTarget) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', 'Mutation target could not be resolved.', {
      target: normalizedRequest.target,
    });
  }

  const validationFailure = validateWriteRequest(normalizedRequest, resolvedTarget);
  if (validationFailure) {
    return toFailureReceipt(validationFailure, resolvedTarget);
  }

  const mode = options?.changeMode ?? 'direct';
  if (options?.dryRun) {
    if (mode === 'tracked') ensureTrackedCapability(editor, { operation: 'write' });
    return { success: true, resolution: resolvedTarget.resolution };
  }

  if (mode === 'tracked') {
    return applyTrackedWrite(editor, normalizedRequest, resolvedTarget);
  }

  return applyDirectWrite(editor, normalizedRequest, resolvedTarget);
}
