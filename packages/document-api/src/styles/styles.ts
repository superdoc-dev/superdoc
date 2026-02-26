/**
 * `styles.apply` — stylesheet mutation for document-level defaults.
 *
 * This module defines the contract types, validation, and execution for the
 * `styles.apply` operation. The operation mutates `word/styles.xml` (docDefaults)
 * rather than inline run formatting in `word/document.xml`.
 *
 * Engine-agnostic: no ProseMirror, Yjs, or converter imports.
 */

import type { ReceiptFailure } from '../types/receipt.js';
import { DocumentApiValidationError } from '../errors.js';
import { isRecord } from '../validation-primitives.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Tri-state for OOXML boolean style properties.
 *
 * - `'on'`      — property is explicitly enabled (e.g., `<w:b/>`)
 * - `'off'`     — property is explicitly disabled (e.g., `<w:b w:val="0"/>`)
 * - `'inherit'` — property element is absent; value inherited from cascade
 */
export type StylesBooleanState = 'on' | 'off' | 'inherit';

/**
 * Resolution metadata describing exactly where in the OOXML package the
 * mutation was (or would be) applied.
 */
export interface StylesTargetResolution {
  scope: 'docDefaults';
  channel: 'run';
  xmlPart: 'word/styles.xml';
  xmlPath: 'w:styles/w:docDefaults/w:rPrDefault/w:rPr';
}

/**
 * Input payload for `styles.apply`.
 *
 * `target` selects the stylesheet scope and channel.
 * `patch` declares the desired end-state for each property (set semantics, not toggle).
 */
export interface StylesApplyInput {
  target: {
    scope: 'docDefaults';
    channel: 'run';
  };
  patch: {
    bold?: boolean;
  };
}

/**
 * Options for `styles.apply`.
 *
 * Intentionally NOT `MutationOptions` — `changeMode` is structurally excluded
 * because tracked mode is invalid for stylesheet mutations.
 */
export interface StylesApplyOptions {
  dryRun?: boolean;
  expectedRevision?: string;
}

/** Success branch of the `styles.apply` receipt. */
export interface StylesApplyReceiptSuccess {
  success: true;
  changed: boolean;
  resolution: StylesTargetResolution;
  dryRun: boolean;
  before: { bold: StylesBooleanState };
  after: { bold: StylesBooleanState };
}

/** Failure branch of the `styles.apply` receipt. */
export interface StylesApplyReceiptFailure {
  success: false;
  resolution: StylesTargetResolution;
  failure: ReceiptFailure;
}

/**
 * Receipt returned by `styles.apply`.
 *
 * The `success: false` branch is forward-compatible for future operations
 * that may fail at runtime. For MVP, all validated calls succeed.
 */
export type StylesApplyReceipt = StylesApplyReceiptSuccess | StylesApplyReceiptFailure;

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

/** Engine-specific adapter for stylesheet mutations. */
export interface StylesAdapter {
  apply(input: StylesApplyInput, options: NormalizedStylesApplyOptions): StylesApplyReceipt;
}

/**
 * Normalized options passed to the adapter after defaults are resolved.
 *
 * Unlike {@link StylesApplyOptions}, all fields are required — callers
 * never see `undefined` for `dryRun`.
 */
export interface NormalizedStylesApplyOptions {
  dryRun: boolean;
  expectedRevision: string | undefined;
}

// ---------------------------------------------------------------------------
// Public API surface
// ---------------------------------------------------------------------------

/** Public API surface for stylesheet operations (docDefaults, style definitions). */
export interface StylesApi {
  apply(input: StylesApplyInput, options?: StylesApplyOptions): StylesApplyReceipt;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const STYLES_APPLY_INPUT_ALLOWED_KEYS = new Set(['target', 'patch']);
const STYLES_APPLY_TARGET_ALLOWED_KEYS = new Set(['scope', 'channel']);
const STYLES_APPLY_PATCH_ALLOWED_KEYS = new Set(['bold']);
const STYLES_APPLY_OPTIONS_ALLOWED_KEYS = new Set(['dryRun', 'expectedRevision']);

function validateStylesApplyInput(input: unknown): asserts input is StylesApplyInput {
  if (!isRecord(input)) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'styles.apply input must be a non-null object.');
  }

  assertNoUnknownInputFields(input, STYLES_APPLY_INPUT_ALLOWED_KEYS);

  // --- Target validation ---
  const { target, patch } = input;

  if (target === undefined || target === null) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'styles.apply requires a target object.');
  }

  if (!isRecord(target)) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'target must be a non-null object.', {
      field: 'target',
      value: target,
    });
  }

  assertNoUnknownInputFields(target, STYLES_APPLY_TARGET_ALLOWED_KEYS, 'target');

  if (target.scope !== 'docDefaults') {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `target.scope must be "docDefaults", got ${JSON.stringify(target.scope)}.`,
      { field: 'target.scope', value: target.scope },
    );
  }

  if (target.channel !== 'run') {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `target.channel must be "run", got ${JSON.stringify(target.channel)}.`,
      { field: 'target.channel', value: target.channel },
    );
  }

  // --- Patch validation ---
  if (patch === undefined || patch === null) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'styles.apply requires a patch object.');
  }

  if (!isRecord(patch)) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'patch must be a non-null object.', {
      field: 'patch',
      value: patch,
    });
  }

  const patchKeys = Object.keys(patch);

  if (patchKeys.length === 0) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'patch must include at least one property.');
  }

  for (const key of patchKeys) {
    if (!STYLES_APPLY_PATCH_ALLOWED_KEYS.has(key)) {
      throw new DocumentApiValidationError(
        'INVALID_INPUT',
        `Unknown patch key "${key}". Allowed keys: ${[...STYLES_APPLY_PATCH_ALLOWED_KEYS].join(', ')}.`,
        { field: 'patch', key },
      );
    }
    if (typeof patch[key] !== 'boolean') {
      throw new DocumentApiValidationError(
        'INVALID_INPUT',
        `patch.${key} must be a boolean, got ${typeof patch[key]}.`,
        { field: 'patch', key, value: patch[key] },
      );
    }
  }
}

function validateStylesApplyOptions(options: unknown): void {
  if (options === undefined || options === null) return;

  if (!isRecord(options)) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'styles.apply options must be a non-null object.');
  }

  for (const key of Object.keys(options)) {
    if (!STYLES_APPLY_OPTIONS_ALLOWED_KEYS.has(key)) {
      throw new DocumentApiValidationError(
        'INVALID_INPUT',
        `Unknown options key "${key}". Allowed keys: ${[...STYLES_APPLY_OPTIONS_ALLOWED_KEYS].join(', ')}.`,
        { field: 'options', key },
      );
    }
  }

  if (options.dryRun !== undefined && typeof options.dryRun !== 'boolean') {
    throw new DocumentApiValidationError('INVALID_INPUT', 'options.dryRun must be a boolean.', {
      field: 'options.dryRun',
      value: options.dryRun,
    });
  }

  if (options.expectedRevision !== undefined && typeof options.expectedRevision !== 'string') {
    throw new DocumentApiValidationError('INVALID_INPUT', 'options.expectedRevision must be a string.', {
      field: 'options.expectedRevision',
      value: options.expectedRevision,
    });
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function assertNoUnknownInputFields(
  obj: Record<string, unknown>,
  allowlist: ReadonlySet<string>,
  prefix?: string,
): void {
  for (const key of Object.keys(obj)) {
    if (!allowlist.has(key)) {
      const location = prefix ? `${prefix}.${key}` : key;
      throw new DocumentApiValidationError(
        'INVALID_INPUT',
        `Unknown field "${location}" on styles.apply input. Allowed fields: ${[...allowlist].join(', ')}.`,
        { field: location },
      );
    }
  }
}

function normalizeStylesApplyOptions(options?: StylesApplyOptions): NormalizedStylesApplyOptions {
  return {
    dryRun: options?.dryRun ?? false,
    expectedRevision: options?.expectedRevision,
  };
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

/**
 * Executes `styles.apply` using the provided adapter.
 *
 * Validates input and options, then delegates to the adapter.
 */
export function executeStylesApply(
  adapter: StylesAdapter,
  input: StylesApplyInput,
  options?: StylesApplyOptions,
): StylesApplyReceipt {
  validateStylesApplyInput(input);
  validateStylesApplyOptions(options);
  return adapter.apply(input, normalizeStylesApplyOptions(options));
}
