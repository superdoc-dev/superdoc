/**
 * Shared helper to sync `translatedLinkedStyles.docDefaults` back to `convertedXml`.
 *
 * After any mutation to `translatedLinkedStyles.docDefaults`, the export-facing
 * XML-JS tree must be updated. This helper reconstructs the `w:docDefaults` node
 * from the translated data using the docDefaults translator's `decode()` path.
 *
 * Reused by:
 * - `styles-adapter.ts` (after local mutation)
 * - SD-2019 collaboration sync (after remote mutation received)
 */

// ---------------------------------------------------------------------------
// Local type shapes (avoids importing engine-specific modules)
// ---------------------------------------------------------------------------

interface XmlElement {
  name: string;
  type?: string;
  elements?: XmlElement[];
  attributes?: Record<string, string>;
}

export interface DocDefaultsTranslator {
  decode(params: { node: { attrs: Record<string, unknown> } }): XmlElement | undefined;
}

interface ConverterForSync {
  convertedXml: Record<string, XmlElement>;
  translatedLinkedStyles: {
    docDefaults?: Record<string, unknown>;
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Reconstructs the `w:docDefaults` node in `convertedXml['word/styles.xml']`
 * from `translatedLinkedStyles.docDefaults`.
 *
 * Call after any mutation to `translatedLinkedStyles.docDefaults` to keep
 * the export-facing XML in sync with the style-engine-facing JS object.
 */
export function syncDocDefaultsToConvertedXml(
  converter: ConverterForSync,
  docDefaultsTranslator: DocDefaultsTranslator,
): void {
  const docDefaults = converter.translatedLinkedStyles.docDefaults;

  // Decode the current JS representation back to an XML-JS node
  const newDocDefaultsNode = docDefaultsTranslator.decode({
    node: { attrs: { docDefaults } },
  });

  // Find the w:styles root in the export-facing XML
  const stylesPart = converter.convertedXml['word/styles.xml'];
  if (!stylesPart) return;

  const stylesRoot = stylesPart.elements?.find((el) => el.name === 'w:styles');
  if (!stylesRoot) return;
  if (!stylesRoot.elements) stylesRoot.elements = [];

  // Find existing w:docDefaults index
  const existingIndex = stylesRoot.elements.findIndex((el) => el.name === 'w:docDefaults');

  if (newDocDefaultsNode) {
    if (existingIndex >= 0) {
      // Replace in-place
      stylesRoot.elements[existingIndex] = newDocDefaultsNode;
    } else {
      // Insert at position 0 (w:docDefaults is always first child of w:styles)
      stylesRoot.elements.unshift(newDocDefaultsNode);
    }
  } else if (existingIndex >= 0) {
    // Translator returned undefined (empty docDefaults) — remove the node
    stylesRoot.elements.splice(existingIndex, 1);
  }
}
