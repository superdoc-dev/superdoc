import type { Editor } from '../core/Editor.js';
import type { FormatBoldInput, MutationOptions, TextMutationReceipt } from '@superdoc/document-api';
import { TrackFormatMarkName } from '../extensions/track-changes/constants.js';
import { DocumentApiAdapterError } from './errors.js';
import { requireSchemaMark, ensureTrackedCapability } from './helpers/mutation-helpers.js';
import { applyDirectMutationMeta, applyTrackedMutationMeta } from './helpers/transaction-meta.js';
import { resolveTextTarget } from './helpers/adapter-utils.js';
import { buildTextMutationResolution, readTextAtResolvedRange } from './helpers/text-mutation-resolution.js';

export function formatBoldAdapter(
  editor: Editor,
  input: FormatBoldInput,
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
    return {
      success: false,
      resolution,
      failure: {
        code: 'INVALID_TARGET',
        message: 'Bold formatting requires a non-collapsed target range.',
      },
    };
  }

  const boldMark = requireSchemaMark(editor, 'bold', 'format.bold');

  const mode = options?.changeMode ?? 'direct';
  if (mode === 'tracked')
    ensureTrackedCapability(editor, { operation: 'format.bold', requireMarks: [TrackFormatMarkName] });

  if (options?.dryRun) {
    return { success: true, resolution };
  }

  const tr = editor.state.tr.addMark(range.from, range.to, boldMark.create());
  if (mode === 'tracked') applyTrackedMutationMeta(tr);
  else applyDirectMutationMeta(tr);

  editor.dispatch(tr);
  return { success: true, resolution };
}
