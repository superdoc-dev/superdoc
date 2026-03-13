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
import { applyDirectMutationMeta, applyTrackedMutationMeta } from './helpers/transaction-meta.js';
import { checkRevision } from './plan-engine/revision-tracker.js';
import { insertParagraphAtEnd, resolveWriteTarget, type ResolvedWrite } from './helpers/adapter-utils.js';
import { toCanonicalTrackedChangeId } from './helpers/tracked-change-resolver.js';

function validateWriteRequest(request: WriteRequest, resolvedTarget: ResolvedWrite): ReceiptFailure | null {
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

/**
 * Normalize block-relative locator fields into a canonical TextAddress.
 * This runs inside the adapter layer so that the resolution uses engine-specific block lookup.
 *
 * Insert: blockId + offset → collapsed TextAddress
 *
 * Returns the original request unchanged when no friendly locator is present.
 */
function normalizeWriteLocator(request: WriteRequest): WriteRequest {
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

function applyDirectWrite(editor: Editor, request: WriteRequest, resolvedTarget: ResolvedWrite): TextMutationReceipt {
  // Structural-end: create a paragraph at the document end, since raw
  // insertText cannot place text between block nodes.
  if (resolvedTarget.structuralEnd) {
    insertParagraphAtEnd(editor, resolvedTarget.range.from, request.text ?? '', applyDirectMutationMeta);
    return { success: true, resolution: resolvedTarget.resolution };
  }

  // text is guaranteed non-empty for insert after validateWriteRequest
  const tr = applyDirectMutationMeta(
    editor.state.tr.insertText(request.text ?? '', resolvedTarget.range.from, resolvedTarget.range.to),
  );
  editor.dispatch(tr);
  return { success: true, resolution: resolvedTarget.resolution };
}

function applyTrackedWrite(editor: Editor, request: WriteRequest, resolvedTarget: ResolvedWrite): TextMutationReceipt {
  ensureTrackedCapability(editor, { operation: 'write' });

  // Structural-end: create a tracked paragraph at the document end.
  // insertTrackedChange cannot operate between block nodes, so we use
  // a direct tr.insert with tracked mutation meta instead.
  if (resolvedTarget.structuralEnd) {
    insertParagraphAtEnd(editor, resolvedTarget.range.from, request.text ?? '', applyTrackedMutationMeta);
    return { success: true, resolution: resolvedTarget.resolution };
  }

  // insertTrackedChange is guaranteed to exist after ensureTrackedCapability.
  const insertTrackedChange = editor.commands!.insertTrackedChange!;

  const changeId = uuidv4();
  const didApply = insertTrackedChange({
    from: resolvedTarget.range.from,
    to: resolvedTarget.range.from,
    text: request.text ?? '',
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

function toFailureReceipt(failure: ReceiptFailure, resolvedTarget: ResolvedWrite): TextMutationReceipt {
  return {
    success: false,
    resolution: resolvedTarget.resolution,
    failure,
  };
}

export function writeAdapter(editor: Editor, request: WriteRequest, options?: MutationOptions): TextMutationReceipt {
  checkRevision(editor, options?.expectedRevision);

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
