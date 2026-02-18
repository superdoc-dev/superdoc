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
type FormatOperationInput = { target: TextAddress };

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
  const range = resolveTextTarget(editor, input.target);
  if (!range) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', 'Format target could not be resolved.', {
      target: input.target,
    });
  }

  const resolution = buildTextMutationResolution({
    requestedTarget: input.target,
    target: input.target,
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
