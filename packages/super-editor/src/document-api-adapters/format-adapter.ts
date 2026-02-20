import type { Editor } from '../core/Editor.js';
import type {
  FormatBoldInput,
  FormatItalicInput,
  FormatUnderlineInput,
  FormatStrikethroughInput,
  MutationOptions,
  TextAddress,
  TextMutationReceipt,
} from '@superdoc/document-api';
import { TrackFormatMarkName } from '../extensions/track-changes/constants.js';
import { DocumentApiAdapterError } from './errors.js';
import { requireSchemaMark, ensureTrackedCapability } from './helpers/mutation-helpers.js';
import { applyDirectMutationMeta, applyTrackedMutationMeta } from './helpers/transaction-meta.js';
import { resolveTextTarget } from './helpers/adapter-utils.js';
import { buildTextMutationResolution, readTextAtResolvedRange } from './helpers/text-mutation-resolution.js';

/** Maps each format operation to the display label used in failure messages. */
const FORMAT_OPERATION_LABEL = {
  'format.bold': 'Bold',
  'format.italic': 'Italic',
  'format.underline': 'Underline',
  'format.strikethrough': 'Strikethrough',
} as const;

type FormatOperationId = keyof typeof FORMAT_OPERATION_LABEL;
type FormatMarkName = 'bold' | 'italic' | 'underline' | 'strike';
type FormatOperationInput = { target?: TextAddress; blockId?: string; start?: number; end?: number };

/**
 * Normalize block-relative locator fields into a canonical TextAddress.
 *
 * blockId + start + end → TextAddress with range { start, end }.
 * Returns the original input unchanged when no friendly locator is present.
 */
function normalizeFormatLocator(input: FormatOperationInput): FormatOperationInput {
  const hasBlockId = input.blockId !== undefined;
  const hasStart = input.start !== undefined;
  const hasEnd = input.end !== undefined;

  // Defensive: reject range fields mixed with canonical target.
  if (input.target && (hasBlockId || hasStart || hasEnd)) {
    throw new DocumentApiAdapterError(
      'INVALID_TARGET',
      'Cannot combine target with blockId/start/end on format request.',
      { fields: ['target', 'blockId', 'start', 'end'] },
    );
  }

  // Defensive: reject orphaned start/end without blockId.
  if (!hasBlockId && (hasStart || hasEnd)) {
    throw new DocumentApiAdapterError('INVALID_TARGET', 'start/end require blockId on format request.', {
      fields: ['blockId', 'start', 'end'],
    });
  }

  if (!hasBlockId) return input;

  // Defensive: reject incomplete range.
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

/**
 * Shared adapter logic for toggle-mark format operations.
 *
 * Every format.* operation (bold, italic, underline, strikethrough) follows the
 * same sequence: resolve target, build resolution, validate non-collapsed range,
 * look up mark, check tracked capability, short-circuit on dryRun, dispatch.
 *
 * The only thing that varies is the editor mark name and the operation ID.
 */
function formatMarkAdapter(
  editor: Editor,
  markName: FormatMarkName,
  operationId: FormatOperationId,
  input: FormatOperationInput,
  options?: MutationOptions,
): TextMutationReceipt {
  const normalizedInput = normalizeFormatLocator(input);
  const range = resolveTextTarget(editor, normalizedInput.target!);
  if (!range) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', 'Format target could not be resolved.', {
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
    const label = FORMAT_OPERATION_LABEL[operationId];
    return {
      success: false,
      resolution,
      failure: {
        code: 'INVALID_TARGET',
        message: `${label} formatting requires a non-collapsed target range.`,
      },
    };
  }

  const mark = requireSchemaMark(editor, markName, operationId);

  const mode = options?.changeMode ?? 'direct';
  if (mode === 'tracked')
    ensureTrackedCapability(editor, { operation: operationId, requireMarks: [TrackFormatMarkName] });

  if (options?.dryRun) {
    return { success: true, resolution };
  }

  const tr = editor.state.tr.addMark(range.from, range.to, mark.create());
  if (mode === 'tracked') applyTrackedMutationMeta(tr);
  else applyDirectMutationMeta(tr);

  editor.dispatch(tr);
  return { success: true, resolution };
}

export function formatBoldAdapter(
  editor: Editor,
  input: FormatBoldInput,
  options?: MutationOptions,
): TextMutationReceipt {
  return formatMarkAdapter(editor, 'bold', 'format.bold', input, options);
}

export function formatItalicAdapter(
  editor: Editor,
  input: FormatItalicInput,
  options?: MutationOptions,
): TextMutationReceipt {
  return formatMarkAdapter(editor, 'italic', 'format.italic', input, options);
}

export function formatUnderlineAdapter(
  editor: Editor,
  input: FormatUnderlineInput,
  options?: MutationOptions,
): TextMutationReceipt {
  return formatMarkAdapter(editor, 'underline', 'format.underline', input, options);
}

export function formatStrikethroughAdapter(
  editor: Editor,
  input: FormatStrikethroughInput,
  options?: MutationOptions,
): TextMutationReceipt {
  return formatMarkAdapter(editor, 'strike', 'format.strikethrough', input, options);
}
