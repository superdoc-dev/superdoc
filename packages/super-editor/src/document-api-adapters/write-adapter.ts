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
  const resolvedTarget = resolveWriteTarget(editor, request);
  if (!resolvedTarget) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', 'Mutation target could not be resolved.', {
      target: request.target,
    });
  }

  const validationFailure = validateWriteRequest(request, resolvedTarget);
  if (validationFailure) {
    return toFailureReceipt(validationFailure, resolvedTarget);
  }

  const mode = options?.changeMode ?? 'direct';
  if (options?.dryRun) {
    if (mode === 'tracked') ensureTrackedCapability(editor, { operation: 'write' });
    return { success: true, resolution: resolvedTarget.resolution };
  }

  if (mode === 'tracked') {
    return applyTrackedWrite(editor, request, resolvedTarget);
  }

  return applyDirectWrite(editor, request, resolvedTarget);
}
