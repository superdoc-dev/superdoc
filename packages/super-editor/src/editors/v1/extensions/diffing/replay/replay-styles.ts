import { syncStylesDiffToConvertedXml } from '../../../core/helpers/styles-xml-helpers';
import { applyAttributesDiff } from './replay-style-utils';
import { ReplayResult } from './replay-types';

type ReplayStyleEditor = {
  emit?: (event: string, payload?: unknown) => void;
  converter?: {
    translatedLinkedStyles?: {
      docDefaults?: Record<string, unknown>;
      latentStyles?: Record<string, unknown>;
      styles?: Record<string, Record<string, unknown>>;
    } | null;
    convertedXml?: Record<string, unknown>;
    documentModified?: boolean;
    promoteToGuid?: () => string;
  } | null;
};

/**
 * Initializes the translated styles snapshot structure on the converter.
 *
 * @param editor Replay editor context.
 * @returns Initialized translated styles object, or `null` when no converter exists.
 */
function ensureTranslatedStyles(editor: ReplayStyleEditor) {
  const converter = editor.converter;
  if (!converter) {
    return null;
  }

  if (!converter.translatedLinkedStyles) {
    converter.translatedLinkedStyles = {};
  }
  if (!converter.translatedLinkedStyles.docDefaults) {
    converter.translatedLinkedStyles.docDefaults = {};
  }
  if (!converter.translatedLinkedStyles.latentStyles) {
    converter.translatedLinkedStyles.latentStyles = {};
  }
  if (!converter.translatedLinkedStyles.styles) {
    converter.translatedLinkedStyles.styles = {};
  }
  return converter.translatedLinkedStyles;
}

/**
 * Replays style metadata diffs directly into the converter's translated style snapshot.
 *
 * The resulting style snapshot is then synchronized back into `word/styles.xml`.
 *
 * @param params Replay parameters.
 * @param params.stylesDiff Style diff payload to apply.
 * @param params.editor Editor context containing converter and emitter.
 * @returns Replay summary with applied/skipped counts and warnings.
 */
export function replayStyles({
  stylesDiff,
  editor,
}: {
  stylesDiff: import('../algorithm/styles-diffing').StylesDiff | null;
  editor?: ReplayStyleEditor;
}): ReplayResult {
  const result: ReplayResult = {
    applied: 0,
    skipped: 0,
    warnings: [],
  };

  if (!stylesDiff) {
    return result;
  }

  if (!editor?.converter) {
    result.skipped += 1;
    result.warnings.push('Style replay skipped: editor converter is unavailable.');
    return result;
  }

  const translated = ensureTranslatedStyles(editor);
  if (!translated) {
    result.skipped += 1;
    result.warnings.push('Style replay skipped: translated style state is unavailable.');
    return result;
  }

  let changed = false;
  changed = applyAttributesDiff(translated.docDefaults!, stylesDiff.docDefaultsDiff) || changed;
  changed = applyAttributesDiff(translated.latentStyles!, stylesDiff.latentStylesDiff) || changed;

  for (const styleId of Object.keys(stylesDiff.removedStyles ?? {})) {
    if (Object.prototype.hasOwnProperty.call(translated.styles!, styleId)) {
      delete translated.styles![styleId];
      changed = true;
    }
  }

  for (const [styleId, styleDef] of Object.entries(stylesDiff.addedStyles ?? {})) {
    translated.styles![styleId] = structuredClone(styleDef as Record<string, unknown>);
    changed = true;
  }

  for (const [styleId, diff] of Object.entries(stylesDiff.modifiedStyles ?? {})) {
    const styleTarget = translated.styles?.[styleId];
    if (!styleTarget) {
      result.skipped += 1;
      result.warnings.push(`Style replay skipped for "${styleId}": style was not found in translated styles.`);
      continue;
    }
    changed = applyAttributesDiff(styleTarget, diff) || changed;
  }

  if (!changed) {
    return result;
  }

  syncStylesDiffToConvertedXml(editor.converter, stylesDiff);
  editor.converter.documentModified = true;
  if (typeof editor.converter.promoteToGuid === 'function') {
    editor.converter.promoteToGuid();
  }
  editor.emit?.('stylesDefaultsChanged');

  result.applied += 1;
  return result;
}
