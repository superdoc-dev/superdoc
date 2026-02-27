import { normalizeMutationOptions, type MutationOptions } from '../write/write.js';
import type { TextAddress, TextMutationReceipt } from '../types/index.js';
import { DocumentApiValidationError } from '../errors.js';
import { isRecord, isTextAddress, assertNoUnknownFields } from '../validation-primitives.js';
import type { InlineRunPatch, InlineRunPatchKey } from './inline-run-patch.js';
import { INLINE_PROPERTY_BY_KEY, validateInlineRunPatch } from './inline-run-patch.js';

// ---------------------------------------------------------------------------
// Alignment enum
// ---------------------------------------------------------------------------

/** Valid paragraph alignment values. */
export const ALIGNMENTS = ['left', 'center', 'right', 'justify'] as const;
export type Alignment = (typeof ALIGNMENTS)[number];
const ALIGNMENT_SET: ReadonlySet<string> = new Set(ALIGNMENTS);

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Input payload for `format.bold`. */
export type FormatBoldInput = FormatInlineAliasInput<'bold'>;

/** Input payload for `format.italic`. */
export type FormatItalicInput = FormatInlineAliasInput<'italic'>;

/** Input payload for `format.underline`. */
export type FormatUnderlineInput = FormatInlineAliasInput<'underline'>;

/** Input payload for `format.strikethrough`. */
export interface FormatStrikethroughInput {
  target: TextAddress;
}

/**
 * Keys where `value` may be omitted — booleans (defaults to `true`) and
 * `underline` (defaults to `true` for simple on/off).
 */
type ImplicitTrueKey =
  | {
      [K in InlineRunPatchKey]: InlineRunPatch[K] extends boolean | null | undefined ? K : never;
    }[InlineRunPatchKey]
  | 'underline';

/**
 * Input payload for direct per-property aliases (`format.<inlineKey>`).
 *
 * `value` is optional only for boolean-like keys (including `underline`), where
 * omission defaults to `true` for ergonomic "turn on" calls.
 * For all other keys the caller must supply a value.
 */
export type FormatInlineAliasInput<K extends InlineRunPatchKey> = K extends ImplicitTrueKey
  ? { target: TextAddress; value?: InlineRunPatch[K] }
  : { target: TextAddress; value: InlineRunPatch[K] };

/**
 * Input payload for `format.apply`.
 *
 * `inline` uses explicit patch semantics:
 * - omitted key: unchanged
 * - concrete value: set
 * - `null`: clear
 */
export interface StyleApplyInput {
  target: TextAddress;
  inline: InlineRunPatch;
}

/** Options for `format.apply` — same shape as all other mutations. */
export type StyleApplyOptions = MutationOptions;

/** Input payload for `format.align`. Pass `null` to unset (reset to default). */
export interface FormatAlignInput {
  target: TextAddress;
  alignment: Alignment | null;
}

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

/** Engine-specific adapter for format operations. */
export interface FormatAdapter {
  apply(input: StyleApplyInput, options?: MutationOptions): TextMutationReceipt;
  align(input: FormatAlignInput, options?: MutationOptions): TextMutationReceipt;
}

// ---------------------------------------------------------------------------
// Public API surface
// ---------------------------------------------------------------------------

/** Direct alias methods (`format.<inlineKey>`) that route to `format.apply`. */
export type FormatInlineAliasApi = {
  [K in InlineRunPatchKey]: (input: FormatInlineAliasInput<K>, options?: MutationOptions) => TextMutationReceipt;
};

/** Public helper surface exposed on `DocumentApi.format`. */
export interface FormatApi extends FormatInlineAliasApi {
  strikethrough(input: FormatStrikethroughInput, options?: MutationOptions): TextMutationReceipt;
  apply(input: StyleApplyInput, options?: MutationOptions): TextMutationReceipt;
  align(input: FormatAlignInput, options?: MutationOptions): TextMutationReceipt;
}

// ---------------------------------------------------------------------------
// format.apply — validation and execution
// ---------------------------------------------------------------------------

const STYLE_APPLY_INPUT_ALLOWED_KEYS = new Set(['target', 'inline']);

function validateStyleApplyInput(input: unknown): asserts input is StyleApplyInput {
  if (!isRecord(input)) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'format.apply input must be a non-null object.');
  }

  assertNoUnknownFields(input, STYLE_APPLY_INPUT_ALLOWED_KEYS, 'format.apply');

  if (input.target === undefined) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'format.apply requires a target.');
  }

  if (!isTextAddress(input.target)) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'target must be a text address object.', {
      field: 'target',
      value: input.target,
    });
  }

  if (input.inline === undefined || input.inline === null) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'format.apply requires an inline object.');
  }

  validateInlineRunPatch(input.inline);
}

/**
 * Executes `format.apply` using the provided adapter.
 *
 * Validates the target and inline patch payload, then delegates to adapter `apply`.
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
// format.<inlineKey> aliases — normalize to format.apply payloads
// ---------------------------------------------------------------------------

const INLINE_ALIAS_INPUT_ALLOWED_KEYS = new Set(['target', 'value']);

function acceptsImplicitTrue(key: InlineRunPatchKey): boolean {
  return INLINE_PROPERTY_BY_KEY[key].type === 'boolean' || key === 'underline';
}

function normalizeInlineAliasValue<K extends InlineRunPatchKey>(
  key: K,
  value: InlineRunPatch[K] | undefined,
): InlineRunPatch[K] {
  if (value !== undefined) return value;
  if (acceptsImplicitTrue(key)) {
    return true as InlineRunPatch[K];
  }
  throw new DocumentApiValidationError('INVALID_INPUT', `format.${key} requires a value field.`);
}

function validateInlineAliasInput<K extends InlineRunPatchKey>(
  key: K,
  input: unknown,
): asserts input is FormatInlineAliasInput<K> {
  const operation = `format.${key}`;
  // Preserve historical input semantics for direct aliases:
  // - null / primitive input behaves like "{}" and fails with missing target.
  // - unknown top-level fields are reported before target validation.
  const candidate = isRecord(input) ? input : {};
  assertNoUnknownFields(candidate, INLINE_ALIAS_INPUT_ALLOWED_KEYS, operation);
  validateTarget(candidate, operation);
}

/**
 * Executes a direct alias operation (`format.<inlineKey>`) by translating it
 * into a single-key `format.apply` payload.
 */
export function executeInlineAlias<K extends InlineRunPatchKey>(
  adapter: FormatAdapter,
  key: K,
  input: FormatInlineAliasInput<K>,
  options?: MutationOptions,
): TextMutationReceipt {
  validateInlineAliasInput(key, input);
  // `input.value` is typed as required or optional depending on K; at runtime
  // `normalizeInlineAliasValue` handles both branches uniformly.
  const value = normalizeInlineAliasValue(key, (input as { value?: InlineRunPatch[K] }).value);
  const inline = { [key]: value } as InlineRunPatch;
  validateInlineRunPatch(inline);
  return adapter.apply({ target: input.target, inline }, normalizeMutationOptions(options));
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
