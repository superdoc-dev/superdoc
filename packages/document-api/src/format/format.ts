import { normalizeMutationOptions, type MutationOptions } from '../write/write.js';
import type { TextAddress, TextMutationReceipt, SetMarks } from '../types/index.js';
import { MARK_KEY_SET } from '../types/style-policy.types.js';
import { DocumentApiValidationError } from '../errors.js';
import { isRecord, isTextAddress, assertNoUnknownFields } from '../validation-primitives.js';

// ---------------------------------------------------------------------------
// Alignment enum
// ---------------------------------------------------------------------------

/** Valid paragraph alignment values. */
export const ALIGNMENTS = ['left', 'center', 'right', 'justify'] as const;
export type Alignment = (typeof ALIGNMENTS)[number];
const ALIGNMENT_SET: ReadonlySet<string> = new Set(ALIGNMENTS);

// ---------------------------------------------------------------------------
// Input types — boolean toggle marks (existing)
// ---------------------------------------------------------------------------

/**
 * Input payload for `format.bold`.
 */
export interface FormatBoldInput {
  target: TextAddress;
}

/**
 * Input payload for `format.italic`.
 */
export interface FormatItalicInput {
  target: TextAddress;
}

/**
 * Input payload for `format.underline`.
 */
export interface FormatUnderlineInput {
  target: TextAddress;
}

/**
 * Input payload for `format.strikethrough`.
 */
export interface FormatStrikethroughInput {
  target: TextAddress;
}

/**
 * Input payload for `format.apply`.
 *
 * `inline` uses boolean patch semantics: `true` sets, `false` removes, omitted leaves unchanged.
 */
export interface StyleApplyInput {
  target: TextAddress;
  /** Boolean inline-style patch — at least one known key required. */
  inline: SetMarks;
}

/** Options for `format.apply` — same shape as all other mutations. */
export type StyleApplyOptions = MutationOptions;

// ---------------------------------------------------------------------------
// Input types — value-based format operations (new)
// ---------------------------------------------------------------------------

/** Input payload for `format.fontSize`. Pass `null` to unset. */
export interface FormatFontSizeInput {
  target: TextAddress;
  value: string | number | null;
}

/** Input payload for `format.fontFamily`. Pass `null` to unset. */
export interface FormatFontFamilyInput {
  target: TextAddress;
  value: string | null;
}

/** Input payload for `format.color`. Pass `null` to unset. */
export interface FormatColorInput {
  target: TextAddress;
  value: string | null;
}

/** Input payload for `format.align`. Pass `null` to unset (reset to default). */
export interface FormatAlignInput {
  target: TextAddress;
  alignment: Alignment | null;
}

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

/**
 * Engine-specific adapter for format operations.
 *
 * `apply()` handles boolean toggle marks.
 * Value-based methods handle fontSize, fontFamily, color, and paragraph alignment.
 */
export interface FormatAdapter {
  apply(input: StyleApplyInput, options?: MutationOptions): TextMutationReceipt;
  fontSize(input: FormatFontSizeInput, options?: MutationOptions): TextMutationReceipt;
  fontFamily(input: FormatFontFamilyInput, options?: MutationOptions): TextMutationReceipt;
  color(input: FormatColorInput, options?: MutationOptions): TextMutationReceipt;
  align(input: FormatAlignInput, options?: MutationOptions): TextMutationReceipt;
}

// ---------------------------------------------------------------------------
// Public API surface
// ---------------------------------------------------------------------------

/**
 * Public helper surface exposed on `DocumentApi.format`.
 * Per-mark helpers route through `executeStyleApply` internally.
 */
export interface FormatApi {
  bold(input: FormatBoldInput, options?: MutationOptions): TextMutationReceipt;
  italic(input: FormatItalicInput, options?: MutationOptions): TextMutationReceipt;
  underline(input: FormatUnderlineInput, options?: MutationOptions): TextMutationReceipt;
  strikethrough(input: FormatStrikethroughInput, options?: MutationOptions): TextMutationReceipt;
  apply(input: StyleApplyInput, options?: MutationOptions): TextMutationReceipt;
  fontSize(input: FormatFontSizeInput, options?: MutationOptions): TextMutationReceipt;
  fontFamily(input: FormatFontFamilyInput, options?: MutationOptions): TextMutationReceipt;
  color(input: FormatColorInput, options?: MutationOptions): TextMutationReceipt;
  align(input: FormatAlignInput, options?: MutationOptions): TextMutationReceipt;
}

// ---------------------------------------------------------------------------
// format.apply — validation and execution
// ---------------------------------------------------------------------------

const STYLE_APPLY_INPUT_ALLOWED_KEYS = new Set(['target', 'inline']);

/**
 * Validates a `format.apply` input and throws on violations.
 *
 * Validation order:
 * 0. Input shape guard
 * 1. Unknown field rejection
 * 2. Locator validation (same rules as format operations)
 * 3. `inline` presence and type
 * 4. At least one known inline key
 * 5. No unknown inline keys
 * 6. All inline values are booleans
 */
function validateStyleApplyInput(input: unknown): asserts input is StyleApplyInput {
  if (!isRecord(input)) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'format.apply input must be a non-null object.');
  }

  assertNoUnknownFields(input, STYLE_APPLY_INPUT_ALLOWED_KEYS, 'format.apply');

  // --- Locator validation ---
  const { target, inline } = input;

  if (target === undefined) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'format.apply requires a target.');
  }

  if (!isTextAddress(target)) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'target must be a text address object.', {
      field: 'target',
      value: target,
    });
  }

  // --- Inline-style validation ---
  if (inline === undefined || inline === null) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'format.apply requires an inline object.');
  }

  if (!isRecord(inline)) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'inline must be a non-null object.', {
      field: 'inline',
      value: inline,
    });
  }

  const inlineKeys = Object.keys(inline);

  if (inlineKeys.length === 0) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'inline must include at least one known key.');
  }

  for (const key of inlineKeys) {
    if (!MARK_KEY_SET.has(key)) {
      throw new DocumentApiValidationError(
        'INVALID_INPUT',
        `Unknown inline style key "${key}". Known keys: bold, italic, underline, strike.`,
        {
          field: 'inline',
          key,
        },
      );
    }
    const value = inline[key];
    if (typeof value !== 'boolean') {
      throw new DocumentApiValidationError(
        'INVALID_INPUT',
        `Inline style "${key}" must be a boolean, got ${typeof value}.`,
        {
          field: 'inline',
          key,
          value,
        },
      );
    }
  }
}

/**
 * Executes `format.apply` using the provided adapter.
 *
 * Validates input (locator + inline), then delegates to the adapter's `apply()` method.
 * Inline styles use boolean patch semantics: `true` sets a style, `false` removes it, omitted keys are unchanged.
 * All inline changes within one call are applied in a single ProseMirror transaction.
 */
export function executeStyleApply(
  adapter: FormatAdapter,
  input: StyleApplyInput,
  options?: MutationOptions,
): TextMutationReceipt {
  validateStyleApplyInput(input);
  return adapter.apply(input, normalizeMutationOptions(options));
}

// ---------------------------------------------------------------------------
// Shared validation: target field
// ---------------------------------------------------------------------------

function validateTarget(input: unknown, operation: string): asserts input is { target: TextAddress } {
  if (!isRecord(input)) {
    throw new DocumentApiValidationError('INVALID_INPUT', `${operation} input must be a non-null object.`);
  }
  if (input.target === undefined) {
    throw new DocumentApiValidationError('INVALID_TARGET', `${operation} requires a target.`);
  }
  if (!isTextAddress(input.target)) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'target must be a text address object.', {
      field: 'target',
      value: input.target,
    });
  }
}

// ---------------------------------------------------------------------------
// format.fontSize — validation and execution
// ---------------------------------------------------------------------------

const FONT_SIZE_ALLOWED_KEYS = new Set(['target', 'value']);

function validateFontSizeInput(input: unknown): asserts input is FormatFontSizeInput {
  validateTarget(input, 'format.fontSize');
  assertNoUnknownFields(input as Record<string, unknown>, FONT_SIZE_ALLOWED_KEYS, 'format.fontSize');

  const { value } = input as Record<string, unknown>;
  if (value === undefined) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'format.fontSize requires a value field.');
  }
  if (value !== null && typeof value !== 'string' && typeof value !== 'number') {
    throw new DocumentApiValidationError('INVALID_INPUT', `format.fontSize value must be a string, number, or null.`, {
      field: 'value',
      value,
    });
  }
  if (typeof value === 'string' && value.length === 0) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'format.fontSize value must not be an empty string.', {
      field: 'value',
    });
  }
}

export function executeFontSize(
  adapter: FormatAdapter,
  input: FormatFontSizeInput,
  options?: MutationOptions,
): TextMutationReceipt {
  validateFontSizeInput(input);
  return adapter.fontSize(input, normalizeMutationOptions(options));
}

// ---------------------------------------------------------------------------
// format.fontFamily — validation and execution
// ---------------------------------------------------------------------------

const FONT_FAMILY_ALLOWED_KEYS = new Set(['target', 'value']);

function validateFontFamilyInput(input: unknown): asserts input is FormatFontFamilyInput {
  validateTarget(input, 'format.fontFamily');
  assertNoUnknownFields(input as Record<string, unknown>, FONT_FAMILY_ALLOWED_KEYS, 'format.fontFamily');

  const { value } = input as Record<string, unknown>;
  if (value === undefined) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'format.fontFamily requires a value field.');
  }
  if (value !== null && typeof value !== 'string') {
    throw new DocumentApiValidationError('INVALID_INPUT', 'format.fontFamily value must be a string or null.', {
      field: 'value',
      value,
    });
  }
  if (typeof value === 'string' && value.length === 0) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'format.fontFamily value must not be an empty string.', {
      field: 'value',
    });
  }
}

export function executeFontFamily(
  adapter: FormatAdapter,
  input: FormatFontFamilyInput,
  options?: MutationOptions,
): TextMutationReceipt {
  validateFontFamilyInput(input);
  return adapter.fontFamily(input, normalizeMutationOptions(options));
}

// ---------------------------------------------------------------------------
// format.color — validation and execution
// ---------------------------------------------------------------------------

const COLOR_ALLOWED_KEYS = new Set(['target', 'value']);

function validateColorInput(input: unknown): asserts input is FormatColorInput {
  validateTarget(input, 'format.color');
  assertNoUnknownFields(input as Record<string, unknown>, COLOR_ALLOWED_KEYS, 'format.color');

  const { value } = input as Record<string, unknown>;
  if (value === undefined) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'format.color requires a value field.');
  }
  if (value !== null && typeof value !== 'string') {
    throw new DocumentApiValidationError('INVALID_INPUT', 'format.color value must be a string or null.', {
      field: 'value',
      value,
    });
  }
  if (typeof value === 'string' && value.length === 0) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'format.color value must not be an empty string.', {
      field: 'value',
    });
  }
}

export function executeColor(
  adapter: FormatAdapter,
  input: FormatColorInput,
  options?: MutationOptions,
): TextMutationReceipt {
  validateColorInput(input);
  return adapter.color(input, normalizeMutationOptions(options));
}

// ---------------------------------------------------------------------------
// format.align — validation and execution
// ---------------------------------------------------------------------------

const ALIGN_ALLOWED_KEYS = new Set(['target', 'alignment']);

function validateAlignInput(input: unknown): asserts input is FormatAlignInput {
  validateTarget(input, 'format.align');
  assertNoUnknownFields(input as Record<string, unknown>, ALIGN_ALLOWED_KEYS, 'format.align');

  const { alignment } = input as Record<string, unknown>;
  if (alignment === undefined) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'format.align requires an alignment field.');
  }
  if (alignment !== null && (typeof alignment !== 'string' || !ALIGNMENT_SET.has(alignment))) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      `format.align alignment must be one of ${ALIGNMENTS.join(', ')}, or null.`,
      { field: 'alignment', value: alignment },
    );
  }
}

export function executeAlign(
  adapter: FormatAdapter,
  input: FormatAlignInput,
  options?: MutationOptions,
): TextMutationReceipt {
  validateAlignInput(input);
  return adapter.align(input, normalizeMutationOptions(options));
}
