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
// Property State Types
// ---------------------------------------------------------------------------

/**
 * Tri-state for OOXML boolean style properties.
 *
 * - `'on'`      — property is explicitly enabled (e.g., `<w:b/>`)
 * - `'off'`     — property is explicitly disabled (e.g., `<w:b w:val="0"/>`)
 * - `'inherit'` — property element is absent; value inherited from cascade
 */
export type StylesBooleanState = 'on' | 'off' | 'inherit';

/** State representation for number properties in before/after receipts. */
export type StylesNumberState = number | 'inherit';

/** State representation for enum (string) properties in before/after receipts. */
export type StylesEnumState = string | 'inherit';

/** State representation for object properties in before/after receipts. */
export type StylesObjectState = Record<string, unknown> | 'inherit';

// ---------------------------------------------------------------------------
// Channels and Patch Types
// ---------------------------------------------------------------------------

export type StylesChannel = 'run' | 'paragraph';

/** Allowed justification values (JS-level vocabulary, not raw OOXML). */
export type StylesJustification = 'left' | 'center' | 'right' | 'justify' | 'distribute';

/** Patch for run-channel properties (docDefaults/w:rPrDefault/w:rPr). */
export interface StylesRunPatch {
  bold?: boolean;
  italic?: boolean;
  fontSize?: number;
  fontSizeCs?: number;
  fontFamily?: Record<string, unknown>;
  color?: Record<string, unknown>;
  letterSpacing?: number;
}

/** Patch for paragraph-channel properties (docDefaults/w:pPrDefault/w:pPr). */
export interface StylesParagraphPatch {
  spacing?: Record<string, unknown>;
  justification?: StylesJustification;
  indent?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Declarative Property Registry
// ---------------------------------------------------------------------------

/** Sub-key type descriptor for object property validation. */
type SubKeyType = 'string' | 'integer' | 'boolean' | `enum:${string}`;

/** Schema describing allowed sub-keys and their types for object properties. */
export type ObjectSchema = Record<string, SubKeyType>;

/** Discriminated union of property type definitions in the registry. */
export type PropertyDefinition =
  | { key: string; channel: StylesChannel; type: 'boolean' }
  | { key: string; channel: StylesChannel; type: 'integer' }
  | { key: string; channel: StylesChannel; type: 'enum'; values: string[] }
  | { key: string; channel: StylesChannel; type: 'object'; schema: ObjectSchema };

// --- Object sub-key schemas ---

const FONT_FAMILY_SCHEMA: ObjectSchema = {
  hint: 'string',
  ascii: 'string',
  hAnsi: 'string',
  eastAsia: 'string',
  cs: 'string',
  val: 'string',
  asciiTheme: 'string',
  hAnsiTheme: 'string',
  eastAsiaTheme: 'string',
  cstheme: 'string',
};

const COLOR_SCHEMA: ObjectSchema = {
  val: 'string',
  themeColor: 'string',
  themeTint: 'string',
  themeShade: 'string',
};

const SPACING_SCHEMA: ObjectSchema = {
  after: 'integer',
  afterAutospacing: 'boolean',
  afterLines: 'integer',
  before: 'integer',
  beforeAutospacing: 'boolean',
  beforeLines: 'integer',
  line: 'integer',
  lineRule: 'enum:auto,exact,atLeast',
};

const INDENT_SCHEMA: ObjectSchema = {
  end: 'integer',
  endChars: 'integer',
  firstLine: 'integer',
  firstLineChars: 'integer',
  hanging: 'integer',
  hangingChars: 'integer',
  left: 'integer',
  leftChars: 'integer',
  right: 'integer',
  rightChars: 'integer',
  start: 'integer',
  startChars: 'integer',
};

/**
 * Declarative registry of all supported style properties.
 *
 * Adding a property to wave 2/3 = one entry here + zero validation code.
 */
export const PROPERTY_REGISTRY: PropertyDefinition[] = [
  // Run channel — booleans
  { key: 'bold', channel: 'run', type: 'boolean' },
  { key: 'italic', channel: 'run', type: 'boolean' },

  // Run channel — numbers (finite integers, no ad-hoc ranges)
  { key: 'fontSize', channel: 'run', type: 'integer' },
  { key: 'fontSizeCs', channel: 'run', type: 'integer' },
  { key: 'letterSpacing', channel: 'run', type: 'integer' },

  // Run channel — objects
  { key: 'fontFamily', channel: 'run', type: 'object', schema: FONT_FAMILY_SCHEMA },
  { key: 'color', channel: 'run', type: 'object', schema: COLOR_SCHEMA },

  // Paragraph channel — enum
  {
    key: 'justification',
    channel: 'paragraph',
    type: 'enum',
    values: ['left', 'center', 'right', 'justify', 'distribute'],
  },

  // Paragraph channel — objects
  { key: 'spacing', channel: 'paragraph', type: 'object', schema: SPACING_SCHEMA },
  { key: 'indent', channel: 'paragraph', type: 'object', schema: INDENT_SCHEMA },
];

/** Allowed patch keys per channel, derived from the registry. */
const ALLOWED_KEYS_BY_CHANNEL: Record<StylesChannel, Set<string>> = {
  run: new Set(PROPERTY_REGISTRY.filter((d) => d.channel === 'run').map((d) => d.key)),
  paragraph: new Set(PROPERTY_REGISTRY.filter((d) => d.channel === 'paragraph').map((d) => d.key)),
};

/** Lookup a property definition by key and channel. */
function getPropertyDefinition(key: string, channel: StylesChannel): PropertyDefinition | undefined {
  return PROPERTY_REGISTRY.find((d) => d.key === key && d.channel === channel);
}

// ---------------------------------------------------------------------------
// Target Resolution
// ---------------------------------------------------------------------------

const XML_PATH_BY_CHANNEL: Record<StylesChannel, string> = {
  run: 'w:styles/w:docDefaults/w:rPrDefault/w:rPr',
  paragraph: 'w:styles/w:docDefaults/w:pPrDefault/w:pPr',
};

/**
 * Resolution metadata describing exactly where in the OOXML package the
 * mutation was (or would be) applied.
 */
export interface StylesTargetResolution {
  scope: 'docDefaults';
  channel: StylesChannel;
  xmlPart: 'word/styles.xml';
  xmlPath: string;
}

// ---------------------------------------------------------------------------
// Input / Output Types
// ---------------------------------------------------------------------------

/** Input for run-channel mutations. */
export interface StylesApplyRunInput {
  target: { scope: 'docDefaults'; channel: 'run' };
  patch: StylesRunPatch;
}

/** Input for paragraph-channel mutations. */
export interface StylesApplyParagraphInput {
  target: { scope: 'docDefaults'; channel: 'paragraph' };
  patch: StylesParagraphPatch;
}

/**
 * Input payload for `styles.apply`.
 *
 * Discriminated union: the `target.channel` value determines which patch type is valid.
 * `patch` declares the desired end-state for each property (set semantics, not toggle).
 */
export type StylesApplyInput = StylesApplyRunInput | StylesApplyParagraphInput;

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

/** Before/after state map — only keys addressed in the patch are present. */
export type StylesStateMap = Record<
  string,
  StylesBooleanState | StylesNumberState | StylesEnumState | StylesObjectState
>;

/** Success branch of the `styles.apply` receipt. */
export interface StylesApplyReceiptSuccess {
  success: true;
  changed: boolean;
  resolution: StylesTargetResolution;
  dryRun: boolean;
  before: StylesStateMap;
  after: StylesStateMap;
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
  apply(input: StylesApplyRunInput, options: NormalizedStylesApplyOptions): StylesApplyReceipt;
  apply(input: StylesApplyParagraphInput, options: NormalizedStylesApplyOptions): StylesApplyReceipt;
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
  apply(input: StylesApplyRunInput, options?: StylesApplyOptions): StylesApplyReceipt;
  apply(input: StylesApplyParagraphInput, options?: StylesApplyOptions): StylesApplyReceipt;
  apply(input: StylesApplyInput, options?: StylesApplyOptions): StylesApplyReceipt;
}

// ---------------------------------------------------------------------------
// Type-specific validators
// ---------------------------------------------------------------------------

function validateBooleanValue(key: string, value: unknown): void {
  if (typeof value !== 'boolean') {
    throw new DocumentApiValidationError('INVALID_INPUT', `patch.${key} must be a boolean, got ${typeof value}.`, {
      field: 'patch',
      key,
      value,
    });
  }
}

function validateIntegerValue(key: string, value: unknown): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      `patch.${key} must be a finite integer, got ${JSON.stringify(value)}.`,
      { field: 'patch', key, value },
    );
  }
}

function validateEnumValue(key: string, value: unknown, allowed: string[]): void {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      `patch.${key} must be one of: ${allowed.join(', ')}. Got ${JSON.stringify(value)}.`,
      { field: 'patch', key, value },
    );
  }
}

function validateSubKeyValue(objectKey: string, subKey: string, value: unknown, subKeyType: SubKeyType): void {
  if (subKeyType === 'string') {
    if (typeof value !== 'string') {
      throw new DocumentApiValidationError(
        'INVALID_INPUT',
        `patch.${objectKey}.${subKey} must be a string, got ${typeof value}.`,
        { field: `patch.${objectKey}`, key: subKey, value },
      );
    }
    return;
  }
  if (subKeyType === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
      throw new DocumentApiValidationError(
        'INVALID_INPUT',
        `patch.${objectKey}.${subKey} must be a finite integer, got ${JSON.stringify(value)}.`,
        { field: `patch.${objectKey}`, key: subKey, value },
      );
    }
    return;
  }
  if (subKeyType === 'boolean') {
    if (typeof value !== 'boolean') {
      throw new DocumentApiValidationError(
        'INVALID_INPUT',
        `patch.${objectKey}.${subKey} must be a boolean, got ${typeof value}.`,
        { field: `patch.${objectKey}`, key: subKey, value },
      );
    }
    return;
  }
  // enum:val1,val2,val3
  if (subKeyType.startsWith('enum:')) {
    const allowed = subKeyType.slice(5).split(',');
    if (typeof value !== 'string' || !allowed.includes(value)) {
      throw new DocumentApiValidationError(
        'INVALID_INPUT',
        `patch.${objectKey}.${subKey} must be one of: ${allowed.join(', ')}. Got ${JSON.stringify(value)}.`,
        { field: `patch.${objectKey}`, key: subKey, value },
      );
    }
  }
}

function validateObjectValue(key: string, value: unknown, schema: ObjectSchema): void {
  if (!isRecord(value)) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      `patch.${key} must be a non-null object, got ${typeof value}.`,
      { field: 'patch', key, value },
    );
  }

  const allowedSubKeys = new Set(Object.keys(schema));
  const subKeys = Object.keys(value);

  if (subKeys.length === 0) {
    throw new DocumentApiValidationError('INVALID_INPUT', `patch.${key} must include at least one property.`, {
      field: `patch.${key}`,
    });
  }

  for (const subKey of subKeys) {
    if (!allowedSubKeys.has(subKey)) {
      throw new DocumentApiValidationError(
        'INVALID_INPUT',
        `Unknown key "${subKey}" on patch.${key}. Allowed keys: ${[...allowedSubKeys].join(', ')}.`,
        { field: `patch.${key}`, key: subKey },
      );
    }
    validateSubKeyValue(key, subKey, value[subKey], schema[subKey]);
  }
}

/**
 * Dispatches validation for a single patch key based on the registry definition.
 */
function validatePropertyValue(def: PropertyDefinition, value: unknown): void {
  switch (def.type) {
    case 'boolean':
      return validateBooleanValue(def.key, value);
    case 'integer':
      return validateIntegerValue(def.key, value);
    case 'enum':
      return validateEnumValue(def.key, value, def.values);
    case 'object':
      return validateObjectValue(def.key, value, def.schema);
  }
}

// ---------------------------------------------------------------------------
// Input / Options Validation
// ---------------------------------------------------------------------------

const STYLES_APPLY_INPUT_ALLOWED_KEYS = new Set(['target', 'patch']);
const STYLES_APPLY_TARGET_ALLOWED_KEYS = new Set(['scope', 'channel']);
const STYLES_APPLY_OPTIONS_ALLOWED_KEYS = new Set(['dryRun', 'expectedRevision']);
const VALID_CHANNELS = new Set<string>(['run', 'paragraph']);

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

  if (!VALID_CHANNELS.has(target.channel as string)) {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `target.channel must be "run" or "paragraph", got ${JSON.stringify(target.channel)}.`,
      { field: 'target.channel', value: target.channel },
    );
  }

  const channel = target.channel as StylesChannel;

  // --- Patch validation (registry-driven) ---
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
  const allowedKeys = ALLOWED_KEYS_BY_CHANNEL[channel];

  if (patchKeys.length === 0) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'patch must include at least one property.');
  }

  for (const key of patchKeys) {
    if (!allowedKeys.has(key)) {
      // Provide a helpful message if the key belongs to a different channel
      const otherChannel: StylesChannel = channel === 'run' ? 'paragraph' : 'run';
      const belongsToOther = ALLOWED_KEYS_BY_CHANNEL[otherChannel].has(key);
      const detail = belongsToOther ? ` "${key}" is a ${otherChannel}-channel property.` : '';
      throw new DocumentApiValidationError(
        'INVALID_INPUT',
        `Unknown patch key "${key}" for channel "${channel}".${detail} Allowed keys: ${[...allowedKeys].join(', ')}.`,
        { field: 'patch', key },
      );
    }

    const def = getPropertyDefinition(key, channel);
    if (def) validatePropertyValue(def, patch[key]);
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
