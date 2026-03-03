/**
 * Sync helpers for `translatedLinkedStyles` → `convertedXml['word/styles.xml']`.
 *
 * After any mutation to the translated style model, the export-facing XML-JS
 * tree must be updated. Each function targets a specific XML subtree, replacing
 * only the relevant element(s).
 *
 * Reused by:
 * - `styles-adapter.ts` (after local mutation)
 * - SD-2019 collaboration sync (after remote mutation received)
 */
import type { ConverterWithTranslatedLinkedStyles } from '../core/super-converter/translated-linked-styles-model.js';
import { ensureTranslatedLinkedStylesModel } from '../core/super-converter/translated-linked-styles-model.js';

// ---------------------------------------------------------------------------
// Local type shapes (avoids importing engine-specific modules)
// ---------------------------------------------------------------------------

interface XmlElement {
  name: string;
  type?: string;
  elements?: XmlElement[];
  attributes?: Record<string, string>;
}

export interface SubtreeTranslator {
  decode(params: { node: { attrs: Record<string, unknown> } }): XmlElement | undefined;
}

/** @deprecated Use `SubtreeTranslator` instead. */
export type DocDefaultsTranslator = SubtreeTranslator;

interface ConverterForSync {
  convertedXml: Record<string, XmlElement>;
  translatedLinkedStyles?: ConverterWithTranslatedLinkedStyles['translatedLinkedStyles'];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getStylesRoot(converter: ConverterForSync): XmlElement | undefined {
  const stylesPart = converter.convertedXml['word/styles.xml'];
  if (!stylesPart) return undefined;

  const stylesRoot = stylesPart.elements?.find((el) => el.name === 'w:styles');
  if (!stylesRoot) return undefined;
  if (!stylesRoot.elements) stylesRoot.elements = [];
  return stylesRoot;
}

function replaceOrInsertElement(
  parent: XmlElement,
  newNode: XmlElement | undefined,
  matchName: string,
  insertIndex?: number,
): void {
  const elements = parent.elements ?? [];
  const existingIndex = elements.findIndex((el) => el.name === matchName);

  if (newNode) {
    if (existingIndex >= 0) {
      elements[existingIndex] = newNode;
    } else {
      elements.splice(insertIndex ?? elements.length, 0, newNode);
    }
  } else if (existingIndex >= 0) {
    elements.splice(existingIndex, 1);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Syncs `translatedLinkedStyles.docDefaults` → `w:docDefaults` in the XML tree.
 */
export function syncDocDefaultsToConvertedXml(
  converter: ConverterForSync,
  docDefaultsTranslator: SubtreeTranslator,
): void {
  const model = ensureTranslatedLinkedStylesModel(converter);
  const stylesRoot = getStylesRoot(converter);
  if (!stylesRoot) return;

  const newNode = docDefaultsTranslator.decode({
    node: { attrs: { docDefaults: model.docDefaults } },
  });

  // w:docDefaults is always the first child of w:styles
  replaceOrInsertElement(stylesRoot, newNode, 'w:docDefaults', 0);
}

/**
 * Syncs `translatedLinkedStyles.latentStyles` → `w:latentStyles` in the XML tree.
 */
export function syncLatentStylesToConvertedXml(
  converter: ConverterForSync,
  latentStylesTranslator: SubtreeTranslator,
): void {
  const model = ensureTranslatedLinkedStylesModel(converter);
  const stylesRoot = getStylesRoot(converter);
  if (!stylesRoot) return;

  const newNode = latentStylesTranslator.decode({
    node: { attrs: { latentStyles: model.latentStyles } },
  });

  // OOXML ordering: w:docDefaults, w:latentStyles, w:style*.
  // Insert after w:docDefaults (if present), but always before w:style entries.
  const elements = stylesRoot.elements ?? [];
  const docDefaultsIdx = elements.findIndex((el) => el.name === 'w:docDefaults');
  const insertAfterDocDefaults = docDefaultsIdx >= 0 ? docDefaultsIdx + 1 : 0;
  replaceOrInsertElement(stylesRoot, newNode, 'w:latentStyles', insertAfterDocDefaults);
}

/**
 * Syncs a single style definition back to the XML tree by styleId.
 *
 * Finds the existing `w:style` with matching `w:styleId` and replaces it.
 * If no match is found, appends the new element at the end.
 */
export function syncStyleDefinitionToConvertedXml(
  converter: ConverterForSync,
  styleTranslator: SubtreeTranslator,
  styleId: string,
): void {
  const model = ensureTranslatedLinkedStylesModel(converter);
  const stylesRoot = getStylesRoot(converter);
  if (!stylesRoot) return;

  const styleDef = model.styles.find((s) => s.styleId === styleId);
  if (!styleDef) return;

  const newNode = styleTranslator.decode({
    node: { attrs: { style: styleDef } },
  });

  if (!newNode) return;

  const elements = stylesRoot.elements!;
  const existingIndex = elements.findIndex((el) => el.name === 'w:style' && el.attributes?.['w:styleId'] === styleId);

  if (existingIndex >= 0) {
    elements[existingIndex] = newNode;
  } else {
    elements.push(newNode);
  }
}

/**
 * Full rebuild: replaces all `w:style` elements in the XML tree from the model.
 *
 * Use sparingly — this is for structural changes (add/remove/reorder styles).
 * For single-style mutations, prefer `syncStyleDefinitionToConvertedXml`.
 */
export function syncAllStyleDefinitionsToConvertedXml(
  converter: ConverterForSync,
  styleTranslator: SubtreeTranslator,
): void {
  const model = ensureTranslatedLinkedStylesModel(converter);
  const stylesRoot = getStylesRoot(converter);
  if (!stylesRoot) return;

  // Remove all existing w:style elements
  const elements = stylesRoot.elements!;
  const nonStyleElements = elements.filter((el) => el.name !== 'w:style');

  // Decode each style definition and append
  const newStyleNodes: XmlElement[] = [];
  for (const styleDef of model.styles) {
    const node = styleTranslator.decode({
      node: { attrs: { style: styleDef } },
    });
    if (node) newStyleNodes.push(node);
  }

  // w:style elements go after docDefaults and latentStyles
  stylesRoot.elements = [...nonStyleElements, ...newStyleNodes];
}
