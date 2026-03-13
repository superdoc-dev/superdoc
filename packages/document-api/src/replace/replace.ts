import { executeWrite, type MutationOptions, type WriteAdapter } from '../write/write.js';
import type { TextAddress, SDMutationReceipt } from '../types/index.js';
import type { SDReplaceInput } from '../types/structural-input.js';
import type { SDFragment } from '../types/fragment.js';
import { DocumentApiValidationError } from '../errors.js';
import {
  isRecord,
  isTextAddress,
  isValidTarget,
  assertNoUnknownFields,
  validateNestingPolicyValue,
} from '../validation-primitives.js';
import { validateDocumentFragment } from '../validation/fragment-validator.js';
import { textReceiptToSDReceipt } from '../receipt-bridge.js';

// ---------------------------------------------------------------------------
// Legacy string-based input shape
// ---------------------------------------------------------------------------

/** Legacy string-based input for the replace operation. */
export interface LegacyReplaceInput {
  target: TextAddress;
  text: string;
}

// ---------------------------------------------------------------------------
// Discriminated union: legacy string shape OR structural SDFragment shape
// ---------------------------------------------------------------------------

/**
 * Input payload for the `doc.replace` operation.
 *
 * Discrimination: presence of `content` (structural) vs `text` (legacy string).
 */
export type ReplaceInput = LegacyReplaceInput | SDReplaceInput;

// ---------------------------------------------------------------------------
// Allowlists
// ---------------------------------------------------------------------------

const LEGACY_REPLACE_ALLOWED_KEYS = new Set(['text', 'target']);
const STRUCTURAL_REPLACE_ALLOWED_KEYS = new Set(['content', 'target', 'nestingPolicy']);

// ---------------------------------------------------------------------------
// Shape discrimination
// ---------------------------------------------------------------------------

/** Returns true when the input uses the structural SDFragment shape. */
export function isStructuralReplaceInput(input: ReplaceInput): input is SDReplaceInput {
  return 'content' in input && input.content !== undefined;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validates ReplaceInput as either legacy or structural shape.
 *
 * Validation order:
 * 0. Input shape guard
 * 1. Union conflict detection
 * 2. Shape-specific validation
 */
function validateReplaceInput(input: unknown): asserts input is ReplaceInput {
  if (!isRecord(input)) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'Replace input must be a non-null object.');
  }

  const hasText = 'text' in input && input.text !== undefined;
  const hasContent = 'content' in input && input.content !== undefined;

  // Union conflict: both discriminants present
  if (hasText && hasContent) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      'Replace input must provide either "text" (legacy) or "content" (structural), not both.',
      { fields: ['text', 'content'] },
    );
  }

  // Union conflict: neither discriminant present
  if (!hasText && !hasContent) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      'Replace input must provide either "text" (legacy string) or "content" (SDFragment).',
      { fields: ['text', 'content'] },
    );
  }

  if (hasContent) {
    validateStructuralReplaceInput(input);
  } else {
    validateLegacyReplaceInput(input);
  }
}

/** Validates legacy string-based replace input. */
function validateLegacyReplaceInput(input: Record<string, unknown>): void {
  if ('nestingPolicy' in input && input.nestingPolicy !== undefined) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      '"nestingPolicy" is only valid with structural content input, not with "text".',
      { field: 'nestingPolicy' },
    );
  }

  assertNoUnknownFields(input, LEGACY_REPLACE_ALLOWED_KEYS, 'replace');

  const { target, text } = input;

  if (target === undefined) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'Replace requires a target.');
  }

  if (!isTextAddress(target)) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'target must be a text address object.', {
      field: 'target',
      value: target,
    });
  }

  if (typeof text !== 'string') {
    throw new DocumentApiValidationError('INVALID_TARGET', `text must be a string, got ${typeof text}.`, {
      field: 'text',
      value: text,
    });
  }
}

/** Validates structural SDFragment replace input. */
function validateStructuralReplaceInput(input: Record<string, unknown>): void {
  assertNoUnknownFields(input, STRUCTURAL_REPLACE_ALLOWED_KEYS, 'replace');

  const { target, content, nestingPolicy } = input;

  if (target === undefined) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'Replace requires a target.');
  }

  // Structural path accepts both SDAddress and TextAddress
  if (!isValidTarget(target)) {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      'target must be a valid address (SDAddress or TextAddress).',
      {
        field: 'target',
        value: target,
      },
    );
  }

  validateNestingPolicyValue(nestingPolicy);
  validateDocumentFragment(content as SDFragment);
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

export function executeReplace(
  adapter: WriteAdapter,
  input: ReplaceInput,
  options?: MutationOptions,
): SDMutationReceipt {
  validateReplaceInput(input);

  // Structural content path — returns SDMutationReceipt directly
  if (isStructuralReplaceInput(input)) {
    return adapter.replaceStructured(input as unknown as ReplaceInput, options);
  }

  // Legacy string path — wrap TextMutationReceipt → SDMutationReceipt
  const textReceipt = executeWrite(adapter, { kind: 'replace', target: input.target, text: input.text }, options);
  return textReceiptToSDReceipt(textReceipt);
}
