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
 * `marks` uses boolean patch semantics: `true` sets, `false` removes, omitted leaves unchanged.
 */
export interface StyleApplyInput {
  target: TextAddress;
  /** Boolean mark patch — at least one known key required. */
  marks: SetMarks;
}

/** Options for `format.apply` — same shape as all other mutations. */
export type StyleApplyOptions = MutationOptions;

/**
 * Engine-specific adapter — only `apply()` is required.
 * Per-mark methods were removed in the Phase 2c contract simplification.
 */
export interface FormatAdapter {
  /** Apply explicit mark changes using boolean patch semantics. */
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

const STYLE_APPLY_INPUT_ALLOWED_KEYS = new Set(['target', 'marks']);

/**
 * Validates a `format.apply` input and throws on violations.
 *
 * Validation order:
 * 0. Input shape guard
 * 1. Unknown field rejection
 * 2. Locator validation (same rules as format operations)
 * 3. `marks` presence and type
 * 4. At least one known mark key
 * 5. No unknown mark keys
 * 6. All mark values are booleans
 */
function validateStyleApplyInput(input: unknown): asserts input is StyleApplyInput {
  if (!isRecord(input)) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'format.apply input must be a non-null object.');
  }

  assertNoUnknownFields(input, STYLE_APPLY_INPUT_ALLOWED_KEYS, 'format.apply');

  // --- Locator validation ---
  const { target, marks } = input;

  if (target === undefined) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'format.apply requires a target.');
  }

  if (!isTextAddress(target)) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'target must be a text address object.', {
      field: 'target',
      value: target,
    });
  }

  // --- Marks validation ---
  if (marks === undefined || marks === null) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'format.apply requires a marks object.');
  }

  if (!isRecord(marks)) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'marks must be a non-null object.', {
      field: 'marks',
      value: marks,
    });
  }

  const markKeys = Object.keys(marks);

  if (markKeys.length === 0) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'marks must include at least one known key.');
  }

  for (const key of markKeys) {
    if (!MARK_KEY_SET.has(key)) {
      throw new DocumentApiValidationError(
        'INVALID_INPUT',
        `Unknown mark key "${key}". Known keys: bold, italic, underline, strike.`,
        {
          field: 'marks',
          key,
        },
      );
    }
    const value = marks[key];
    if (typeof value !== 'boolean') {
      throw new DocumentApiValidationError('INVALID_INPUT', `Mark "${key}" must be a boolean, got ${typeof value}.`, {
        field: 'marks',
        key,
        value,
      });
    }
  }
}

/**
 * Executes `format.apply` using the provided adapter.
 *
 * Validates input (locator + marks), then delegates to the adapter's `apply()` method.
 * Marks use boolean patch semantics: `true` sets a mark, `false` removes it, omitted keys are unchanged.
 * All mark changes within one call are applied in a single ProseMirror transaction.
 */
export function executeStyleApply(
  adapter: FormatAdapter,
  input: StyleApplyInput,
  options?: MutationOptions,
): TextMutationReceipt {
  validateStyleApplyInput(input);
  return adapter.apply(input, normalizeMutationOptions(options));
}
