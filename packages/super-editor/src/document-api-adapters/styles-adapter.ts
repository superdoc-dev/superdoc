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
  ValueSchema,
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
// Underline key mapping (API ↔ storage)
// ---------------------------------------------------------------------------

const UNDERLINE_API_TO_STORAGE: Record<string, string> = {
  val: 'w:val',
  color: 'w:color',
  themeColor: 'w:themeColor',
  themeTint: 'w:themeTint',
  themeShade: 'w:themeShade',
};

const UNDERLINE_STORAGE_TO_API = Object.fromEntries(Object.entries(UNDERLINE_API_TO_STORAGE).map(([k, v]) => [v, k]));

function mapUnderlineToStorage(apiObj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(apiObj)) {
    result[UNDERLINE_API_TO_STORAGE[k] ?? k] = v;
  }
  return result;
}

function mapUnderlineToApi(storageObj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(storageObj)) {
    result[UNDERLINE_STORAGE_TO_API[k] ?? k] = v;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Value normalization
// ---------------------------------------------------------------------------

/** Normalizes hex color strings: uppercase, strip leading '#'. */
function normalizeHexColor(val: string): string {
  return val.replace(/^#/, '').toUpperCase();
}

/**
 * Returns the set of sub-keys whose string values are hex colors for a given
 * property. `val` is hex only on `color`; on borders/shading/underline it is
 * an enum token and must NOT be uppercased.
 */
const HEX_SUBKEYS_BY_PROPERTY: Record<string, ReadonlySet<string>> = {
  color: new Set(['val']),
  shading: new Set(['color', 'fill']),
  underline: new Set(['color', 'w:color']),
  borders: new Set(['color']),
};

function normalizeObjectSubKeys(obj: Record<string, unknown>, key: string): Record<string, unknown> {
  const hexKeys = HEX_SUBKEYS_BY_PROPERTY[key];
  if (!hexKeys) return obj;

  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && hexKeys.has(k)) {
      result[k] = normalizeHexColor(v);
    } else {
      result[k] = v;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// JSON deep equality — single shared comparator
// ---------------------------------------------------------------------------

function jsonDeepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!jsonDeepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (typeof a === 'object') {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (!Object.prototype.hasOwnProperty.call(bObj, key)) return false;
      if (!jsonDeepEqual(aObj[key], bObj[key])) return false;
    }
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// State formatting helpers
// ---------------------------------------------------------------------------

type StateValue = string | number | Record<string, unknown> | unknown[] | 'inherit';

/**
 * Converts a raw storage value to its receipt state representation.
 * Uses schema.kind to determine the formatting strategy.
 */
function formatState(value: unknown, schema: ValueSchema, key: string): StateValue {
  if (value === undefined) return 'inherit';

  switch (schema.kind) {
    case 'boolean':
      return (value ? 'on' : 'off') as StateValue;
    case 'object':
      if (typeof value === 'object' && value !== null) {
        const obj = { ...(value as Record<string, unknown>) };
        // Map underline storage keys to API keys in receipts
        return key === 'underline' ? mapUnderlineToApi(obj) : obj;
      }
      return value as StateValue;
    case 'array':
      return Array.isArray(value) ? [...value.map((item) => structuredClone(item))] : (value as StateValue);
    default:
      return value as StateValue;
  }
}

// ---------------------------------------------------------------------------
// Merge strategy dispatch
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function cloneForStorage<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  return structuredClone(value);
}

function applyReplace(targetProps: Record<string, unknown>, key: string, value: unknown): void {
  targetProps[key] = cloneForStorage(value);
}

function applyShallowMerge(targetProps: Record<string, unknown>, key: string, value: unknown): void {
  const current = asRecord(targetProps[key]);
  const patch = value as Record<string, unknown>;

  // Handle underline key mapping: API keys → storage keys
  if (key === 'underline') {
    const storagePatch = cloneForStorage(mapUnderlineToStorage(normalizeObjectSubKeys(patch, key)));
    targetProps[key] = { ...current, ...storagePatch };
    return;
  }

  targetProps[key] = { ...current, ...cloneForStorage(normalizeObjectSubKeys(patch, key)) };
}

function applyEdgeMerge(targetProps: Record<string, unknown>, key: string, value: unknown): void {
  const current = asRecord(targetProps[key]);
  const patch = value as Record<string, Record<string, unknown>>;
  const result = { ...current };

  for (const [edge, edgeValue] of Object.entries(patch)) {
    const currentEdge = asRecord(result[edge]);
    result[edge] = { ...currentEdge, ...cloneForStorage(normalizeObjectSubKeys(edgeValue, key)) };
  }

  targetProps[key] = result;
}

// ---------------------------------------------------------------------------
// Patch application
// ---------------------------------------------------------------------------

function applyPatch(
  targetProps: Record<string, unknown>,
  patch: Record<string, unknown>,
  channel: StylesChannel,
): { before: StylesStateMap; after: StylesStateMap; changed: boolean } {
  const before: StylesStateMap = {};
  const after: StylesStateMap = {};

  // Iterate patch keys in PROPERTY_REGISTRY declaration order for deterministic receipts
  const patchKeys = new Set(Object.keys(patch));
  for (const def of PROPERTY_REGISTRY) {
    if (def.channel !== channel || !patchKeys.has(def.key)) continue;

    const key = def.key;
    const value = patch[key];

    before[key] = formatState(targetProps[key], def.schema, key);

    switch (def.mergeStrategy) {
      case 'replace':
        applyReplace(targetProps, key, value);
        break;
      case 'shallowMerge':
        applyShallowMerge(targetProps, key, value);
        break;
      case 'edgeMerge':
        applyEdgeMerge(targetProps, key, value);
        break;
    }

    after[key] = formatState(targetProps[key], def.schema, key);
  }

  const changed = !jsonDeepEqual(before, after);
  return { before, after, changed };
}

// ---------------------------------------------------------------------------
// Adapter entry point
// ---------------------------------------------------------------------------

/**
 * Adapter function for `styles.apply` bound to a specific editor instance.
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

      const existingProps = converter.translatedLinkedStyles?.docDefaults?.[propsKey] as
        | Record<string, unknown>
        | undefined;

      // Dry-run: structuredClone for full immutability guarantee.
      // Real mutation: ensure hierarchy exists and mutate in-place.
      let targetProps: Record<string, unknown>;
      if (dryRun) {
        targetProps = existingProps ? structuredClone(existingProps) : {};
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
