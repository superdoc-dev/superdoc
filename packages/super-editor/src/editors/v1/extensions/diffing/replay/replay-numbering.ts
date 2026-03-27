import type { NumberingProperties } from '@superdoc/style-engine/ooxml';
import { rebuildRawNumberingFromTranslated } from '../../../core/helpers/list-numbering-helpers.js';
import { applyAttributesDiff } from './replay-style-utils';
import { ReplayResult } from './replay-types';

type ReplayNumberingEditor = {
  emit?: (event: string, payload: unknown) => void;
  converter?: {
    translatedNumbering?: NumberingProperties | null;
    numbering?: {
      abstracts?: Record<string, unknown>;
      definitions?: Record<string, unknown>;
    } | null;
    documentModified?: boolean;
    promoteToGuid?: () => string;
  } | null;
};

/**
 * Initializes translated numbering containers on the converter.
 *
 * @param editor Replay editor context.
 * @returns Initialized translated numbering object, or `null` when unavailable.
 */
function ensureTranslatedNumbering(editor: ReplayNumberingEditor): NumberingProperties | null {
  const converter = editor.converter;
  if (!converter) {
    return null;
  }

  if (!converter.translatedNumbering) {
    converter.translatedNumbering = {};
  }
  if (!converter.translatedNumbering.abstracts) {
    converter.translatedNumbering.abstracts = {};
  }
  if (!converter.translatedNumbering.definitions) {
    converter.translatedNumbering.definitions = {};
  }

  return converter.translatedNumbering;
}

/**
 * Replays numbering metadata diffs into translated numbering and then rebuilds
 * the legacy raw numbering model used by export.
 *
 * @param params Replay parameters.
 * @param params.numberingDiff Numbering diff payload to apply.
 * @param params.editor Editor context containing converter and emitter.
 * @returns Replay summary with applied/skipped counts and warnings.
 */
export function replayNumbering({
  numberingDiff,
  editor,
}: {
  numberingDiff: import('../algorithm/numbering-diffing').NumberingDiff | null;
  editor?: ReplayNumberingEditor;
}): ReplayResult {
  const result: ReplayResult = {
    applied: 0,
    skipped: 0,
    warnings: [],
  };

  if (!numberingDiff) {
    return result;
  }

  if (!editor?.converter) {
    result.skipped += 1;
    result.warnings.push('Numbering replay skipped: editor converter is unavailable.');
    return result;
  }

  const translated = ensureTranslatedNumbering(editor);
  if (!translated) {
    result.skipped += 1;
    result.warnings.push('Numbering replay skipped: translated numbering state is unavailable.');
    return result;
  }

  const changed = applyAttributesDiff(translated as unknown as Record<string, unknown>, numberingDiff);
  if (!changed) {
    return result;
  }

  const { skipped } = rebuildRawNumberingFromTranslated(editor as any);
  if (skipped > 0) {
    result.warnings.push(`Numbering replay rebuilt with ${skipped} skipped translated numbering entries.`);
  }

  editor.converter.documentModified = true;
  if (typeof editor.converter.promoteToGuid === 'function') {
    editor.converter.promoteToGuid();
  }

  editor.emit?.('list-definitions-change', {
    change: { type: 'replay-numbering' },
    numbering: editor.converter.numbering,
    editor,
  });

  result.applied += 1;
  return result;
}
