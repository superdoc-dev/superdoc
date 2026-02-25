import { normalizeMutationOptions, type MutationOptions } from '../write/write.js';
import type { TextAddress, TextMutationReceipt, SetMarks } from '../types/index.js';
import { MARK_KEY_SET } from '../types/style-policy.types.js';
import { DocumentApiValidationError } from '../errors.js';
import { isRecord, isTextAddress, assertNoUnknownFields } from '../validation-primitives.js';

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

/**
 * Engine-specific adapter — only `apply()` is required.
 * Per-mark methods were removed in the Phase 2c contract simplification.
 */
export interface FormatAdapter {
  /** Apply explicit inline-style changes using boolean patch semantics. */
  apply(input: StyleApplyInput, options?: MutationOptions): TextMutationReceipt;
}

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
