/**
 * Engine-specific adapter for `styles.apply`.
 *
 * Mutates `word/styles.xml` (docDefaults run properties) directly via the
 * converter's in-memory XML-JS representation. Does NOT use PM commands or
 * transactions — lifecycle is handled by `executeOutOfBandMutation`.
 */

import type {
  StylesApplyInput,
  StylesApplyReceipt,
  StylesBooleanState,
  StylesTargetResolution,
  NormalizedStylesApplyOptions,
} from '@superdoc/document-api';
import type { Editor } from '../core/Editor.js';
import { DocumentApiAdapterError } from './errors.js';
import { isCollaborationActive } from './collaboration-detection.js';
import { executeOutOfBandMutation } from './out-of-band-mutation.js';

// ---------------------------------------------------------------------------
// XML-JS element shape (subset used by this adapter)
// ---------------------------------------------------------------------------

interface XmlElement {
  name: string;
  elements?: XmlElement[];
  attributes?: Record<string, string>;
}

/** Converter shape accessed from the editor. */
interface ConverterForStyles {
  convertedXml: Record<string, XmlElement>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STYLES_PART = 'word/styles.xml';

const DOC_DEFAULTS_RESOLUTION: StylesTargetResolution = {
  scope: 'docDefaults',
  channel: 'run',
  xmlPart: STYLES_PART,
  xmlPath: 'w:styles/w:docDefaults/w:rPrDefault/w:rPr',
};

/**
 * OOXML boolean "truthy" values (element present with no val, or val = 1/true/on).
 * All other val values are treated as "off".
 */
const OOXML_BOOLEAN_ON_VALUES = new Set(['1', 'true', 'on']);

// ---------------------------------------------------------------------------
// OOXML boolean read/write helpers
// ---------------------------------------------------------------------------

/**
 * Reads the tri-state of a boolean OOXML element within `w:rPr`.
 *
 * Per § Malformed-XML Canonicalization, when duplicate elements exist the
 * **last** one wins (matching Word's behavior).
 */
function readBooleanState(rPr: XmlElement, elementName: string): StylesBooleanState {
  if (!rPr.elements) return 'inherit';

  // Find all matching elements; last one wins.
  let lastMatch: XmlElement | undefined;
  for (const el of rPr.elements) {
    if (el.name === elementName) lastMatch = el;
  }

  if (!lastMatch) return 'inherit';
  return normalizeBooleanElement(lastMatch);
}

/**
 * Normalizes a single OOXML boolean element to a `StylesBooleanState`.
 */
function normalizeBooleanElement(el: XmlElement): StylesBooleanState {
  const val = el.attributes?.['w:val'];
  // Bare element (no w:val attribute) means "on"
  if (val === undefined) return 'on';
  return OOXML_BOOLEAN_ON_VALUES.has(val) ? 'on' : 'off';
}

/**
 * Writes a boolean property to `w:rPr`, replacing any existing instances.
 *
 * - `true`  → single `<w:b/>` (removes duplicates, normalizes val)
 * - `false` → single `<w:b w:val="0"/>` (removes duplicates, normalizes val)
 *
 * Unknown sibling elements are preserved and not reordered.
 */
function writeBooleanProperty(rPr: XmlElement, elementName: string, value: boolean): void {
  if (!rPr.elements) rPr.elements = [];

  // Remove all existing instances of this element
  rPr.elements = rPr.elements.filter((el) => el.name !== elementName);

  // Build the canonical element
  const newElement: XmlElement = { name: elementName };
  if (!value) {
    newElement.attributes = { 'w:val': '0' };
  }

  // Insert at the beginning (deterministic position for repeated calls)
  rPr.elements.unshift(newElement);
}

// ---------------------------------------------------------------------------
// XML traversal helpers
// ---------------------------------------------------------------------------

/**
 * Finds a direct child element by name, optionally creating it if missing.
 */
function findOrCreateChild(parent: XmlElement, childName: string): XmlElement {
  if (!parent.elements) parent.elements = [];

  const existing = parent.elements.find((el) => el.name === childName);
  if (existing) return existing;

  const child: XmlElement = { name: childName };
  parent.elements.push(child);
  return child;
}

/**
 * Resolves the `w:rPr` element inside `w:styles/w:docDefaults/w:rPrDefault`,
 * creating intermediate nodes as needed within the existing styles part.
 */
function resolveDocDefaultsRunProperties(stylesRoot: XmlElement): XmlElement {
  const docDefaults = findOrCreateChild(stylesRoot, 'w:docDefaults');
  const rPrDefault = findOrCreateChild(docDefaults, 'w:rPrDefault');
  return findOrCreateChild(rPrDefault, 'w:rPr');
}

// ---------------------------------------------------------------------------
// Adapter entry point
// ---------------------------------------------------------------------------

/**
 * Adapter function for `styles.apply` bound to a specific editor instance.
 *
 * Called by the document-api dispatch layer after input validation.
 */
export function stylesApplyAdapter(
  editor: Editor,
  input: StylesApplyInput,
  options: NormalizedStylesApplyOptions,
): StylesApplyReceipt {
  // --- Capability gates (throw before mutation) ---
  const converter = (editor as unknown as { converter?: ConverterForStyles }).converter;
  if (!converter) {
    throw new DocumentApiAdapterError('CAPABILITY_UNAVAILABLE', 'styles.apply requires a document converter.', {
      reason: 'converter_missing',
    });
  }

  const stylesPart = converter.convertedXml[STYLES_PART];
  if (!stylesPart) {
    throw new DocumentApiAdapterError(
      'CAPABILITY_UNAVAILABLE',
      'styles.apply requires word/styles.xml to be present in the document package.',
      { reason: 'styles_part_missing' },
    );
  }

  if (isCollaborationActive(editor)) {
    throw new DocumentApiAdapterError(
      'CAPABILITY_UNAVAILABLE',
      'styles.apply is unavailable during active collaboration. Stylesheet mutations cannot be synced via Yjs.',
      { reason: 'collaboration_active' },
    );
  }

  // --- Resolve the XML target ---
  const stylesRoot = stylesPart.elements?.find((el: XmlElement) => el.name === 'w:styles');
  if (!stylesRoot) {
    throw new DocumentApiAdapterError(
      'CAPABILITY_UNAVAILABLE',
      'word/styles.xml does not contain a w:styles root element.',
      { reason: 'styles_root_missing' },
    );
  }

  // --- Execute via out-of-band lifecycle ---
  return executeOutOfBandMutation<StylesApplyReceipt>(
    editor,
    (dryRun) => {
      const rPr = resolveDocDefaultsRunProperties(stylesRoot);

      // Read before-state
      const beforeBold = readBooleanState(rPr, 'w:b');
      const before = { bold: beforeBold };

      // Compute after-state from patch
      const afterBold = computeAfterState(beforeBold, input.patch.bold);
      const after = { bold: afterBold };

      const changed = beforeBold !== afterBold;

      // Apply mutation (skip on dryRun or no-op)
      if (changed && !dryRun) {
        if (input.patch.bold !== undefined) {
          writeBooleanProperty(rPr, 'w:b', input.patch.bold);
        }
      }

      const receipt: StylesApplyReceipt = {
        success: true,
        changed,
        resolution: DOC_DEFAULTS_RESOLUTION,
        dryRun,
        before,
        after,
      };

      return { changed, payload: receipt };
    },
    options,
  );
}

/**
 * Computes the predicted after-state for a single boolean property.
 */
function computeAfterState(currentState: StylesBooleanState, patchValue: boolean | undefined): StylesBooleanState {
  if (patchValue === undefined) return currentState;
  return patchValue ? 'on' : 'off';
}
