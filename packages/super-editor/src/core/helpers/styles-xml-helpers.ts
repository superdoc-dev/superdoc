import { translator as docDefaultsTranslator } from '../super-converter/v3/handlers/w/docDefaults/docDefaults-translator.js';
import { translator as latentStylesTranslator } from '../super-converter/v3/handlers/w/latentStyles/latentStyles-translator.js';
import { translator as styleTranslator } from '../super-converter/v3/handlers/w/style/style-translator.js';
import type { StylesDiff } from '../../extensions/diffing/algorithm/styles-diffing';
import type { XmlElement } from '../../document-api-adapters/helpers/sections-xml.js';

type ConverterWithStyles = {
  convertedXml?: Record<string, unknown>;
  translatedLinkedStyles?: {
    docDefaults?: Record<string, unknown>;
    latentStyles?: Record<string, unknown>;
    styles?: Record<string, unknown>;
  } | null;
};

/**
 * Resolves the `w:styles` root element from `word/styles.xml`.
 *
 * @param converter Converter state containing converted XML parts.
 * @returns Styles root element, or `null` when unavailable.
 */
function findStylesRoot(converter: ConverterWithStyles): XmlElement | null {
  const stylesPart = converter?.convertedXml?.['word/styles.xml'] as XmlElement | undefined;
  if (!stylesPart?.elements) {
    return null;
  }
  const root = stylesPart.elements.find((element) => element.name === 'w:styles');
  if (!root) {
    return null;
  }
  if (!root.elements) {
    root.elements = [];
  }
  return root;
}

/**
 * Replaces or inserts singleton style child nodes (for example docDefaults).
 *
 * @param root `w:styles` root element.
 * @param name XML node name to replace/insert.
 * @param nextNode Next node value, or `undefined` to remove it.
 */
function replaceSingletonElement(root: XmlElement, name: string, nextNode: XmlElement | undefined): void {
  if (!root.elements) {
    root.elements = [];
  }
  const existingIndex = root.elements.findIndex((element) => element.name === name);

  if (!nextNode) {
    if (existingIndex >= 0) {
      root.elements.splice(existingIndex, 1);
    }
    return;
  }

  if (existingIndex >= 0) {
    root.elements[existingIndex] = nextNode;
    return;
  }

  const docDefaultsIndex = root.elements.findIndex((element) => element.name === 'w:docDefaults');
  const latentStylesIndex = root.elements.findIndex((element) => element.name === 'w:latentStyles');
  if (name === 'w:docDefaults') {
    root.elements.unshift(nextNode);
    return;
  }
  if (name === 'w:latentStyles') {
    const insertIndex = docDefaultsIndex >= 0 ? docDefaultsIndex + 1 : 0;
    root.elements.splice(insertIndex, 0, nextNode);
    return;
  }
  const insertIndex = latentStylesIndex >= 0 ? latentStylesIndex + 1 : root.elements.length;
  root.elements.splice(insertIndex, 0, nextNode);
}

/**
 * Extracts the style ID from a `w:style` node.
 *
 * @param node XML style node.
 * @returns Style ID as string, or `null` when missing.
 */
function getStyleId(node: XmlElement): string | null {
  const value = node?.attributes?.['w:styleId'];
  return value == null ? null : String(value);
}

/**
 * Decodes a translated style definition back to a `w:style` XML node.
 *
 * @param styleDef Translated style definition object.
 * @returns Decoded XML node, or `undefined` when decode fails.
 */
function decodeStyleNode(styleDef: unknown): XmlElement | undefined {
  return styleTranslator.decode({
    node: {
      attrs: {
        style: styleDef,
      },
    } as any,
  }) as XmlElement | undefined;
}

/**
 * Synchronizes replayed style-diff mutations into `word/styles.xml`.
 *
 * This helper intentionally updates only style sections touched by the replay
 * diff to avoid rewriting unrelated XML nodes.
 *
 * @param converter Converter state to mutate.
 * @param stylesDiff Style diff payload used to determine XML updates.
 * @returns `true` when the styles part was found and updated.
 */
export function syncStylesDiffToConvertedXml(converter: ConverterWithStyles, stylesDiff: StylesDiff | null): boolean {
  if (!stylesDiff) {
    return false;
  }

  const root = findStylesRoot(converter);
  if (!root) {
    return false;
  }

  const translated = converter.translatedLinkedStyles ?? {};
  const translatedStyles = translated.styles ?? {};

  if (stylesDiff.docDefaultsDiff) {
    const docDefaultsNode = docDefaultsTranslator.decode({
      node: {
        attrs: {
          docDefaults: translated.docDefaults,
        },
      } as any,
    }) as XmlElement | undefined;
    replaceSingletonElement(root, 'w:docDefaults', docDefaultsNode);
  }

  if (stylesDiff.latentStylesDiff) {
    const latentStylesNode = latentStylesTranslator.decode({
      node: {
        attrs: {
          latentStyles: translated.latentStyles ?? {},
        },
      } as any,
    }) as XmlElement | undefined;
    replaceSingletonElement(root, 'w:latentStyles', latentStylesNode);
  }

  const removedStyleIds = new Set(Object.keys(stylesDiff.removedStyles ?? {}));
  if (removedStyleIds.size > 0 && root.elements) {
    root.elements = root.elements.filter((element) => {
      if (element.name !== 'w:style') {
        return true;
      }
      const styleId = getStyleId(element);
      return !styleId || !removedStyleIds.has(styleId);
    });
  }

  const upsertStyleIds = [
    ...Object.keys(stylesDiff.modifiedStyles ?? {}),
    ...Object.keys(stylesDiff.addedStyles ?? {}),
  ];
  const uniqueUpsertStyleIds = [...new Set(upsertStyleIds)];
  if (uniqueUpsertStyleIds.length === 0) {
    return true;
  }

  if (!root.elements) {
    root.elements = [];
  }

  for (const styleId of uniqueUpsertStyleIds) {
    const styleDef = translatedStyles[styleId];
    if (!styleDef) {
      continue;
    }

    const nextStyleNode = decodeStyleNode(styleDef);
    if (!nextStyleNode) {
      continue;
    }

    const existingIndex = root.elements.findIndex(
      (element) => element.name === 'w:style' && getStyleId(element) === String(styleId),
    );

    if (existingIndex >= 0) {
      root.elements[existingIndex] = nextStyleNode;
      continue;
    }

    root.elements.push(nextStyleNode);
  }

  return true;
}
