/**
 * `styles.getCatalog`: read-only style catalogue projection.
 *
 * The catalogue is the stable, normalized, editor-neutral view of the styles
 * available in a document. It is the SDK / CLI / MCP / custom-UI integration
 * point for style discovery, and the source the built-in toolbar and the
 * future Styles pane consume.
 *
 * This module owns only the public contract types, input validation, and the
 * execution entry point. The runtime projection is produced by the v2 adapter
 * (which compiles a Word style model from package parts and calls the shared
 * style-model projector); the raw style-engine shapes never reach this public
 * surface.
 *
 * `DocumentInfo.styles` is a usage summary and intentionally stays separate
 * from this available-style catalogue.
 *
 * Engine-agnostic: no ProseMirror, Yjs, or converter imports.
 */

import { DocumentApiValidationError } from '../errors.js';
import { isRecord } from '../validation-primitives.js';

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

/** Catalogue view selector. `inUse` lists styles referenced by document content. */
export type StyleCatalogView = 'quickGallery' | 'recommended' | 'currentDocument' | 'all' | 'inUse';

/** Normalized style kind. `linked` is a deduplicated paragraph/character pair. */
export type StyleCatalogItemType = 'paragraph' | 'character' | 'linked' | 'table' | 'numbering' | 'unknown';

/** Type filter values accepted on input (the concrete, requestable kinds). */
export type StyleCatalogFilterType = Exclude<StyleCatalogItemType, 'unknown'>;

/** Where a catalogue item originated. */
export type StyleProvenance = 'authored' | 'default-floor' | 'latent';

export type StyleCatalogDiagnosticSeverity = 'info' | 'warning' | 'error';

/** Status of a backing OOXML package part. */
export type StyleSourcePartStatus = 'present' | 'missing' | 'malformed';

/**
 * Usage-scan availability. `unsupported` when usage was not requested;
 * `complete` when the full document was scanned; `partial` when the body story
 * was scanned but secondary stories (headers/footers/comments/footnotes/endnotes)
 * were deferred; `failed` when the body story could not be scanned and usage is
 * unavailable.
 */
export type StyleCatalogUsageStatus = 'unsupported' | 'complete' | 'partial' | 'failed';

/** Preview-resolution availability. `available` once previews were requested and resolved. */
export type StyleCatalogPreviewStatus = 'unsupported' | 'available';

/** Whether the requested `view` is supported in this pass. */
export type StyleCatalogViewStatus = 'supported' | 'unsupported';

export const STYLE_CATALOG_VIEWS: readonly StyleCatalogView[] = [
  'quickGallery',
  'recommended',
  'currentDocument',
  'all',
  'inUse',
];

export const STYLE_CATALOG_FILTER_TYPES: readonly StyleCatalogFilterType[] = [
  'paragraph',
  'character',
  'linked',
  'table',
  'numbering',
];

// ---------------------------------------------------------------------------
// Item shape
// ---------------------------------------------------------------------------

export interface StyleCatalogItemVisibility {
  /** Belongs in the Word-style quick gallery (Home-tab Styles gallery). */
  quickGallery: boolean;
  /** Belongs in the pane "Recommended" view. */
  recommended: boolean;
  /** Belongs in the pane "All styles" view. */
  all: boolean;
  /** Hard-hidden or semi-hidden, so it should not surface in quick UI. */
  effectivelyHidden: boolean;
}

/** Optional usage rollup. Present when `includeUsage` (or the `inUse` view) is requested. */
export interface StyleCatalogItemUsage {
  used: boolean;
  paragraphCount?: number;
  runCount?: number;
  tableCount?: number;
  numberingCount?: number;
}

/** Optional resolved preview tokens. Present when `includePreview` is requested. */
export interface StyleCatalogItemPreview {
  available: boolean;
  css?: Record<string, string | number>;
  unsupportedReason?: string;
}

/** One normalized style. Linked paragraph/character pairs are deduplicated. */
export interface StyleCatalogItem {
  id: string;
  name: string;
  aliases: string[];
  type: StyleCatalogItemType;
  custom: boolean;
  builtin: boolean;
  default: boolean;
  basedOn: string | null;
  next: string | null;
  link: string | null;
  priority: number | null;
  qFormat: boolean;
  hidden: boolean;
  semiHidden: boolean;
  unhideWhenUsed: boolean;
  locked: boolean;
  provenance: StyleProvenance;
  visibility: StyleCatalogItemVisibility;
  usage?: StyleCatalogItemUsage;
  preview?: StyleCatalogItemPreview;
}

export interface StyleCatalogDefaults {
  paragraphStyleId: string | null;
  characterStyleId: string | null;
  tableStyleId: string | null;
}

export interface StyleCatalogDiagnostic {
  severity: StyleCatalogDiagnosticSeverity;
  code: string;
  part?: string;
  message: string;
}

/**
 * Per-source status so consumers can fail closed. A `missing` or `malformed`
 * styles part still yields a default-floor catalogue with provenance, rather
 * than guessing.
 */
export interface StyleCatalogSourceStatus {
  styles: StyleSourcePartStatus;
  settings: StyleSourcePartStatus;
  usage: StyleCatalogUsageStatus;
  preview: StyleCatalogPreviewStatus;
  view: StyleCatalogViewStatus;
}

// ---------------------------------------------------------------------------
// Input / Output
// ---------------------------------------------------------------------------

export interface StylesGetCatalogInput {
  /** Which list to return as `items`. Defaults to `all`. */
  view?: StyleCatalogView;
  /** Restrict items to these style kinds. */
  types?: StyleCatalogFilterType[];
  /** Include hard-hidden / semi-hidden styles. Defaults to false. */
  includeHidden?: boolean;
  /** Include latent-only style metadata as `provenance: 'latent'`. Defaults to false. */
  includeLatent?: boolean;
  /** Request per-style usage counts (body-story scan; secondary stories deferred). */
  includeUsage?: boolean;
  /** Request resolved style previews (small UI-safe CSS tokens). */
  includePreview?: boolean;
  /** Include diagnostics on the result. Defaults to true. */
  includeDiagnostics?: boolean;
}

export interface StylesGetCatalogResult {
  version: 'style-catalog/v1';
  /** Opaque catalogue revision token, or null when the runtime omits one. */
  revision: string | null;
  /** The view that `items` reflects (echoes the requested view). */
  view: StyleCatalogView;
  defaults: StyleCatalogDefaults;
  /** The list selected by `view`, after `types` / `includeHidden` filtering. */
  items: StyleCatalogItem[];
  /** The full available style set, after `types` / `includeHidden` filtering. */
  styles: StyleCatalogItem[];
  sourceStatus: StyleCatalogSourceStatus;
  diagnostics: StyleCatalogDiagnostic[];
}

// ---------------------------------------------------------------------------
// Adapter + execution
// ---------------------------------------------------------------------------

export interface StylesGetCatalogAdapter {
  getCatalog(input?: StylesGetCatalogInput): StylesGetCatalogResult;
}

const INPUT_ALLOWED_KEYS = new Set([
  'view',
  'types',
  'includeHidden',
  'includeLatent',
  'includeUsage',
  'includePreview',
  'includeDiagnostics',
]);

const BOOLEAN_KEYS = [
  'includeHidden',
  'includeLatent',
  'includeUsage',
  'includePreview',
  'includeDiagnostics',
] as const;

/** Validates `styles.getCatalog` input. `undefined` is a valid (default) call. */
export function validateStylesGetCatalogInput(input?: StylesGetCatalogInput): void {
  if (input === undefined) return;

  if (!isRecord(input)) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'styles.getCatalog input must be a non-null object.');
  }

  for (const key of Object.keys(input)) {
    if (!INPUT_ALLOWED_KEYS.has(key)) {
      throw new DocumentApiValidationError(
        'INVALID_INPUT',
        `Unknown field "${key}" on styles.getCatalog input. Allowed fields: ${[...INPUT_ALLOWED_KEYS].join(', ')}.`,
        { field: key },
      );
    }
  }

  if (input.view !== undefined && !(STYLE_CATALOG_VIEWS as readonly string[]).includes(input.view as string)) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      `view must be one of: ${STYLE_CATALOG_VIEWS.join(', ')}. Got ${JSON.stringify(input.view)}.`,
      { field: 'view', value: input.view },
    );
  }

  if (input.types !== undefined) {
    if (!Array.isArray(input.types)) {
      throw new DocumentApiValidationError('INVALID_INPUT', 'types must be an array.', {
        field: 'types',
        value: input.types,
      });
    }
    for (let i = 0; i < input.types.length; i++) {
      const value = input.types[i];
      if (!(STYLE_CATALOG_FILTER_TYPES as readonly string[]).includes(value as string)) {
        throw new DocumentApiValidationError(
          'INVALID_INPUT',
          `types[${i}] must be one of: ${STYLE_CATALOG_FILTER_TYPES.join(', ')}. Got ${JSON.stringify(value)}.`,
          { field: `types[${i}]`, value },
        );
      }
    }
  }

  for (const key of BOOLEAN_KEYS) {
    const value = input[key];
    if (value !== undefined && typeof value !== 'boolean') {
      throw new DocumentApiValidationError('INVALID_INPUT', `${key} must be a boolean.`, {
        field: key,
        value,
      });
    }
  }
}

/**
 * Executes `styles.getCatalog` using the provided adapter.
 * Validates input, then delegates to the adapter.
 */
export function executeStylesGetCatalog(
  adapter: Partial<StylesGetCatalogAdapter> | null | undefined,
  input?: StylesGetCatalogInput,
): StylesGetCatalogResult {
  validateStylesGetCatalogInput(input);
  if (typeof adapter?.getCatalog !== 'function') {
    throw new DocumentApiValidationError(
      'CAPABILITY_UNAVAILABLE',
      'styles.getCatalog is not available. The host engine has not provided an adapter for this capability.',
      { operation: 'styles.getCatalog' },
    );
  }
  return adapter.getCatalog(input);
}
