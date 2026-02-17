import type { Editor } from '../core/Editor.js';
import type { FormatBoldInput, MutationOptions, TextMutationReceipt } from '@superdoc/document-api';
import { TrackFormatMarkName } from '../extensions/track-changes/constants.js';
import { DocumentApiAdapterError } from './errors.js';
import { resolveTextTarget } from './helpers/adapter-utils.js';
import { buildTextMutationResolution, readTextAtResolvedRange } from './helpers/text-mutation-resolution.js';

function assertTrackedFormatCapability(editor: Editor): void {
  const hasTrackedInsertCommand = typeof editor.commands?.insertTrackedChange === 'function';
  const hasTrackFormatMark = Boolean(editor.schema?.marks?.[TrackFormatMarkName]);

  if (hasTrackedInsertCommand && hasTrackFormatMark) return;

  throw new DocumentApiAdapterError(
    'TRACK_CHANGE_COMMAND_UNAVAILABLE',
    'Tracked bold formatting is not available on this editor instance.',
  );
}

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

  const boldMark = editor.schema?.marks?.bold;
  if (!boldMark) {
    throw new DocumentApiAdapterError('COMMAND_UNAVAILABLE', 'Bold mark is not available on this editor instance.');
  }

  const mode = options?.changeMode ?? 'direct';
  if (mode === 'tracked') assertTrackedFormatCapability(editor);

  if (options?.dryRun) {
    return { success: true, resolution };
  }

  const tr = editor.state.tr.addMark(range.from, range.to, boldMark.create()).setMeta('inputType', 'programmatic');
  if (mode === 'tracked') tr.setMeta('forceTrackChanges', true);

  editor.dispatch(tr);
  return { success: true, resolution };
}
