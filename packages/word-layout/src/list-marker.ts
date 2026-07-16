/**
 * Editor-neutral list marker computation.
 *
 * Combines the editor-neutral numbering helpers from `@superdoc/common`
 * (`generateOrderedListIndex` / `normalizeLvlTextChar`) with the local
 * `createNumberingManager(...)` to produce a `ListRenderingAttrs` payload
 * that `computeWordParagraphLayout(...)` can consume.
 *
 * The function is pure given its inputs; counter state lives on the
 * `NumberingManager` instance passed in. Callers (the v2 adapter, the v1
 * NumberingPlugin) are responsible for scope.
 */
import { generateOrderedListIndex, normalizeLvlTextChar } from '@superdoc/common/list-numbering';
import type { NumberingManager } from './numbering-manager.js';
import type { ListRenderingAttrs, WordListJustification } from './types.js';

export interface WordListMarkerDefinition {
  /** Concrete numId. */
  numId: number | string;
  /** Abstract numbering id for shared counter scoping. */
  abstractId: number | string;
  /** Level index. */
  ilvl: number;
  /** Resolved level start value (override-aware). */
  start: number;
  /** True if the start value came from `w:lvlOverride/w:startOverride`. */
  startOverridden: boolean;
  /** `w:lvlRestart` value when defined. */
  restart?: number;
  /** Level text template. May be empty when none defined. */
  lvlText?: string;
  /** Effective `w:numFmt/@w:val`. */
  numFmt?: string;
  /** Custom format string when `numFmt === 'custom'`. */
  customFormat?: string;
  /** `w:suff`. Defaults to `tab` when absent. */
  suffix?: string;
  /** `w:lvlJc`. Defaults to `left`. */
  justification?: string;
}

export interface ComputeWordListMarkerInput {
  /** Resolved marker definition. */
  definition: WordListMarkerDefinition;
  /**
   * Numbering manager instance carrying counter state for this projection.
   * The caller must have already called `setStartSettings(...)` for the
   * paragraph's level (this is typically done up-front per (numId, level)
   * pair when paragraphs are first walked).
   */
  manager: NumberingManager;
  /**
   * Source-order key for this paragraph. Must be monotonically increasing
   * for paragraphs within a projection so the counter manager can detect
   * previous siblings.
   */
  paragraphOrdinal: number;
}

export interface ComputeWordListMarkerResult {
  listRenderingAttrs: ListRenderingAttrs;
  /** Computed numeric counter path. Useful for callers that want it directly. */
  path: number[];
  /** Effective counter value at the requested ilvl. */
  counter: number;
}

/**
 * Compute the marker text, list-rendering attributes, and counter path for
 * one numbered paragraph. Advances the manager state by recording the new
 * counter at the given paragraph ordinal.
 */
export function computeWordListMarker(input: ComputeWordListMarkerInput): ComputeWordListMarkerResult {
  const { definition, manager, paragraphOrdinal } = input;
  // Ensure start settings are recorded (idempotent).
  manager.setStartSettings(
    definition.numId,
    definition.ilvl,
    definition.start,
    definition.restart,
    definition.startOverridden,
  );

  const counter = manager.calculateCounter(definition.numId, definition.ilvl, paragraphOrdinal, definition.abstractId);
  manager.setCounter(definition.numId, definition.ilvl, paragraphOrdinal, counter, definition.abstractId);
  const path = manager.calculatePath(definition.numId, definition.ilvl, paragraphOrdinal);

  const numberingType = definition.numFmt ?? 'decimal';
  let markerText = '';
  if (numberingType === 'bullet') {
    markerText = normalizeLvlTextChar(definition.lvlText) ?? '';
  } else {
    markerText =
      generateOrderedListIndex({
        listLevel: path,
        lvlText: definition.lvlText ?? '',
        listNumberingType: numberingType,
        customFormat: definition.customFormat,
      }) ?? '';
  }

  return {
    listRenderingAttrs: {
      markerText,
      numberingType,
      path,
      suffix: normalizeSuffix(definition.suffix),
      justification: normalizeJustification(definition.justification),
    },
    path,
    counter,
  };
}

function normalizeSuffix(suffix: string | undefined): ListRenderingAttrs['suffix'] {
  if (suffix === 'tab' || suffix === 'space' || suffix === 'nothing') return suffix;
  return 'tab';
}

function normalizeJustification(jc: string | undefined): WordListJustification {
  if (jc === 'center') return 'center';
  if (jc === 'right' || jc === 'end') return 'right';
  return 'left';
}
