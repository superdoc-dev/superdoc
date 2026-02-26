/**
 * Engine-specific adapter for `styles.apply`.
 *
 * Reads and writes `translatedLinkedStyles.docDefaults` (the style-engine-facing
 * JS object), then syncs the mutation back to `convertedXml` via the docDefaults
 * translator's decode path. After a successful non-dry mutation, emits a
 * `'stylesDefaultsChanged'` event so the layout pipeline re-renders.
 *
 * Lifecycle is handled by `executeOutOfBandMutation`.
 */

import type {
  StylesApplyInput,
  StylesApplyReceipt,
  StylesTargetResolution,
  StylesStateMap,
  StylesChannel,
  NormalizedStylesApplyOptions,
  PropertyDefinition,
} from '@superdoc/document-api';
import { PROPERTY_REGISTRY } from '@superdoc/document-api';
import type { Editor } from '../core/Editor.js';
import { DocumentApiAdapterError } from './errors.js';
import { isCollaborationActive } from './collaboration-detection.js';
import { executeOutOfBandMutation } from './out-of-band-mutation.js';
import { syncDocDefaultsToConvertedXml, type DocDefaultsTranslator } from './styles-xml-sync.js';
import { translator as docDefaultsTranslator } from '../core/super-converter/v3/handlers/w/docDefaults/docDefaults-translator.js';

// ---------------------------------------------------------------------------
// Local type shapes (avoids importing engine-specific modules directly)
// ---------------------------------------------------------------------------

interface XmlElement {
  name: string;
  elements?: XmlElement[];
  attributes?: Record<string, string>;
}

interface ConverterForStyles {
  convertedXml: Record<string, XmlElement>;
  translatedLinkedStyles: {
    docDefaults?: {
      runProperties?: Record<string, unknown>;
      paragraphProperties?: Record<string, unknown>;
    };
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STYLES_PART = 'word/styles.xml';

const PROPERTIES_KEY_BY_CHANNEL: Record<StylesChannel, 'runProperties' | 'paragraphProperties'> = {
  run: 'runProperties',
  paragraph: 'paragraphProperties',
};

const XML_PATH_BY_CHANNEL: Record<StylesChannel, string> = {
  run: 'w:styles/w:docDefaults/w:rPrDefault/w:rPr',
  paragraph: 'w:styles/w:docDefaults/w:pPrDefault/w:pPr',
};

// ---------------------------------------------------------------------------
// State formatting helpers
// ---------------------------------------------------------------------------

/** A single state value in a before/after receipt. */
type StateValue = string | number | Record<string, unknown> | 'inherit';

/**
 * Converts a raw property value to its receipt state representation.
 *
 * - `undefined`      → `'inherit'`
 * - `true`           → `'on'`, `false` → `'off'`
 * - numbers, strings → pass through as-is
 * - objects          → shallow copy (for object properties)
 */
function formatState(value: unknown, type: PropertyDefinition['type']): StateValue {
  if (value === undefined) return 'inherit';
  if (type === 'boolean') return (value ? 'on' : 'off') as StateValue;
  if (type === 'object' && typeof value === 'object' && value !== null)
    return { ...(value as Record<string, unknown>) };
  return value as StateValue;
}

/**
 * Shallow equality check for before/after state maps.
 */
function stateMapEquals(a: StylesStateMap, b: StylesStateMap): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) {
    const av = a[key];
    const bv = b[key];
    if (av === bv) continue;
    // Deep compare for object states
    if (typeof av === 'object' && av !== null && typeof bv === 'object' && bv !== null) {
      const aKeys = Object.keys(av);
      const bKeys = Object.keys(bv as Record<string, unknown>);
      if (aKeys.length !== bKeys.length) return false;
      for (const k of aKeys) {
        if ((av as Record<string, unknown>)[k] !== (bv as Record<string, unknown>)[k]) return false;
      }
      continue;
    }
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Registry lookup
// ---------------------------------------------------------------------------

function getPropertyDefinition(key: string, channel: StylesChannel): PropertyDefinition {
  const def = PROPERTY_REGISTRY.find((d) => d.key === key && d.channel === channel);
  if (!def) throw new Error(`No property definition for key "${key}" on channel "${channel}".`);
  return def;
}

// ---------------------------------------------------------------------------
// Patch application
// ---------------------------------------------------------------------------

/**
 * Applies a patch to the target properties object.
 *
 * - Boolean/number/enum: direct replacement
 * - Object: merge semantics (provided sub-keys updated, unspecified preserved)
 *
 * Returns before/after state maps and a changed flag.
 */
function applyPatch(
  targetProps: Record<string, unknown>,
  patch: Record<string, unknown>,
  channel: StylesChannel,
): { before: StylesStateMap; after: StylesStateMap; changed: boolean } {
  const before: StylesStateMap = {};
  const after: StylesStateMap = {};

  for (const [key, value] of Object.entries(patch)) {
    const def = getPropertyDefinition(key, channel);
    const currentValue = targetProps[key];

    before[key] = formatState(currentValue, def.type);

    if (def.type === 'object') {
      const current =
        typeof currentValue === 'object' && currentValue !== null ? (currentValue as Record<string, unknown>) : {};
      const merged = { ...current, ...(value as Record<string, unknown>) };
      targetProps[key] = merged;
      after[key] = formatState(merged, def.type);
    } else {
      targetProps[key] = value;
      after[key] = formatState(value, def.type);
    }
  }

  const changed = !stateMapEquals(before, after);
  return { before, after, changed };
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
  const channel = input.target.channel;

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

  const stylesRoot = stylesPart.elements?.find((el: XmlElement) => el.name === 'w:styles');
  if (!stylesRoot) {
    throw new DocumentApiAdapterError(
      'CAPABILITY_UNAVAILABLE',
      'word/styles.xml does not contain a w:styles root element.',
      { reason: 'styles_root_missing' },
    );
  }

  // --- Build resolution metadata ---
  const resolution: StylesTargetResolution = {
    scope: 'docDefaults',
    channel,
    xmlPart: STYLES_PART,
    xmlPath: XML_PATH_BY_CHANNEL[channel],
  };

  // --- Execute via out-of-band lifecycle ---
  return executeOutOfBandMutation<StylesApplyReceipt>(
    editor,
    (dryRun) => {
      const propsKey = PROPERTIES_KEY_BY_CHANNEL[channel];

      // Read the current target properties (non-mutating read)
      const existingProps = converter.translatedLinkedStyles?.docDefaults?.[propsKey] as
        | Record<string, unknown>
        | undefined;

      // For dry-run: work on a copy. For real mutation: ensure hierarchy exists.
      let targetProps: Record<string, unknown>;
      if (dryRun) {
        targetProps = existingProps ? { ...existingProps } : {};
      } else {
        if (!converter.translatedLinkedStyles) {
          (converter as unknown as Record<string, unknown>).translatedLinkedStyles = {};
        }
        if (!converter.translatedLinkedStyles.docDefaults) {
          converter.translatedLinkedStyles.docDefaults = {};
        }
        if (!converter.translatedLinkedStyles.docDefaults[propsKey]) {
          converter.translatedLinkedStyles.docDefaults[propsKey] = {};
        }
        targetProps = converter.translatedLinkedStyles.docDefaults[propsKey] as Record<string, unknown>;
      }

      // Apply patch and compute before/after
      const { before, after, changed } = applyPatch(targetProps, input.patch as Record<string, unknown>, channel);

      // Post-mutation side effects (only on real, changed mutations)
      if (changed && !dryRun) {
        syncDocDefaultsToConvertedXml(converter, docDefaultsTranslator as unknown as DocDefaultsTranslator);
        editor.emit('stylesDefaultsChanged');
      }

      const receipt: StylesApplyReceipt = {
        success: true,
        changed,
        resolution,
        dryRun,
        before,
        after,
      };

      return { changed, payload: receipt };
    },
    options,
  );
}
