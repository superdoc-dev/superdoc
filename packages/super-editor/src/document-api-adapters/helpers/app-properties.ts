/**
 * docProps/app.xml writer — upserts document-statistic elements.
 *
 * Only touches the targeted statistic elements (`Pages`, `Words`, `Characters`,
 * `CharactersWithSpaces`). All other elements in app.xml are preserved.
 */

import type { WordStatistics } from './word-statistics.js';

interface XmlElement {
  type?: string;
  name?: string;
  attributes?: Record<string, unknown>;
  elements?: XmlElement[];
  text?: string;
}

const APP_XML_PATH = 'docProps/app.xml';

/**
 * The extended-properties namespace used by docProps/app.xml.
 */
const EP_NAMESPACE = 'http://schemas.openxmlformats.org/officeDocument/2006/extended-properties';

/**
 * Upserts word-statistic values into a parsed app.xml structure.
 *
 * If the given `convertedXml` does not contain an app.xml part, one is
 * created with a minimal `Properties` root. Existing elements not listed
 * here are left untouched.
 *
 * @param convertedXml - The mutable map of part paths → parsed XML trees.
 * @param stats - Fresh statistics from the Word-statistics helper.
 */
export function writeAppStatistics(convertedXml: Record<string, unknown>, stats: WordStatistics): void {
  const propertiesRoot = ensureAppPropertiesRoot(convertedXml);
  const elements = ensureElements(propertiesRoot);

  upsertSimpleElement(elements, 'Words', String(stats.words));
  upsertSimpleElement(elements, 'Characters', String(stats.characters));
  upsertSimpleElement(elements, 'CharactersWithSpaces', String(stats.charactersWithSpaces));

  // Only write Pages if a value is available (pagination may be inactive).
  if (stats.pages != null) {
    upsertSimpleElement(elements, 'Pages', String(stats.pages));
  }
}

/**
 * Reads a statistic value from docProps/app.xml.
 * Returns the text content of the named element, or null if not found.
 */
export function readAppStatistic(convertedXml: Record<string, unknown>, tagName: string): string | null {
  const part = convertedXml[APP_XML_PATH] as XmlElement | undefined;
  if (!part) return null;

  const root = findPropertiesRoot(part);
  if (!root?.elements) return null;

  const el = root.elements.find((e) => e.name === tagName);
  if (!el?.elements?.[0]) return null;

  return el.elements[0].text ?? null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function findPropertiesRoot(part: XmlElement): XmlElement | null {
  if (part.name === 'Properties') return part;
  if (!Array.isArray(part.elements)) return null;
  return part.elements.find((e) => e.name === 'Properties') ?? null;
}

function ensureAppPropertiesRoot(convertedXml: Record<string, unknown>): XmlElement {
  let part = convertedXml[APP_XML_PATH] as XmlElement | undefined;

  if (!part) {
    part = {
      elements: [
        {
          type: 'element',
          name: 'Properties',
          attributes: { xmlns: EP_NAMESPACE },
          elements: [],
        },
      ],
    };
    convertedXml[APP_XML_PATH] = part;
  }

  const root = findPropertiesRoot(part);
  if (root) return root;

  // Fallback: create root element
  const newRoot: XmlElement = {
    type: 'element',
    name: 'Properties',
    attributes: { xmlns: EP_NAMESPACE },
    elements: [],
  };
  if (!Array.isArray(part.elements)) part.elements = [];
  part.elements.push(newRoot);
  return newRoot;
}

function ensureElements(root: XmlElement): XmlElement[] {
  if (!Array.isArray(root.elements)) root.elements = [];
  return root.elements;
}

/**
 * Upserts a simple text element (`<TagName>value</TagName>`) in the given
 * elements array. If the element already exists, its text is updated in place.
 */
function upsertSimpleElement(elements: XmlElement[], tagName: string, value: string): void {
  const idx = elements.findIndex((e) => e.name === tagName);
  const newEl: XmlElement = {
    type: 'element',
    name: tagName,
    elements: [{ type: 'text', text: value }],
  };

  if (idx !== -1) {
    elements[idx] = newEl;
  } else {
    elements.push(newEl);
  }
}
