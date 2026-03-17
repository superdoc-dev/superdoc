import { executeWrite, type MutationOptions, type WriteAdapter } from '../write/write.js';
import type { TextAddress, TextMutationReceipt, SDMutationReceipt } from '../types/index.js';
import type { SDInsertInput } from '../types/structural-input.js';
import type { SDFragment } from '../types/fragment.js';
import { PLACEMENT_VALUES } from '../types/placement.js';
import { DocumentApiValidationError } from '../errors.js';
import {
  isRecord,
  isTextAddress,
  isBlockNodeAddress,
  assertNoUnknownFields,
  validateNestingPolicyValue,
} from '../validation-primitives.js';
import { validateDocumentFragment } from '../validation/fragment-validator.js';
import { textReceiptToSDReceipt } from '../receipt-bridge.js';

// ---------------------------------------------------------------------------
// Legacy string-based input shape
// ---------------------------------------------------------------------------

/** Content format for the legacy insert operation payload. */
export type InsertContentType = 'text' | 'markdown' | 'html';

/** Legacy string-based input for the insert operation. */
export interface LegacyInsertInput {
  /** Optional insertion target. When omitted, inserts at the end of the document. */
  target?: TextAddress;
  /** The content to insert. Interpreted according to {@link LegacyInsertInput.type}. */
  value: string;
  /** Content format. Defaults to `'text'` when omitted. */
  type?: InsertContentType;
}

// ---------------------------------------------------------------------------
// Discriminated union: legacy string shape OR structural SDFragment shape
// ---------------------------------------------------------------------------

/**
 * Input payload for the `doc.insert` operation.
 *
 * Discrimination: presence of `content` (structural) vs `value` (legacy string).
 * These are mutually exclusive — providing both is an error.
 */
export type InsertInput = LegacyInsertInput | SDInsertInput;

// ---------------------------------------------------------------------------
// Allowlists for strict field validation
// ---------------------------------------------------------------------------

const LEGACY_INSERT_ALLOWED_KEYS = new Set(['value', 'type', 'target']);
const STRUCTURAL_INSERT_ALLOWED_KEYS = new Set(['content', 'target', 'placement', 'nestingPolicy']);
const VALID_INSERT_TYPES: ReadonlySet<string> = new Set(['text', 'markdown', 'html']);

// ---------------------------------------------------------------------------
// Shape discrimination
// ---------------------------------------------------------------------------

/** Returns true when the input uses the structural SDFragment shape. */
export function isStructuralInsertInput(input: InsertInput): input is SDInsertInput {
  return 'content' in input && input.content !== undefined;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validates InsertInput as either legacy or structural shape.
 *
 * Validation order:
 * 0. Input shape guard (must be non-null plain object)
 * 1. Union conflict detection (mutually exclusive discriminants)
 * 2. Shape-specific field and type validation
 */
function validateInsertInput(input: unknown): asserts input is InsertInput {
  if (!isRecord(input)) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'Insert input must be a non-null object.');
  }

  const hasValue = 'value' in input && input.value !== undefined;
  const hasContent = 'content' in input && input.content !== undefined;

  // Union conflict rule 1: both discriminants present
  if (hasValue && hasContent) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      'Insert input must provide either "value" (legacy) or "content" (structural), not both.',
      { fields: ['value', 'content'] },
    );
  }

  // Union conflict rule 2: neither discriminant present
  if (!hasValue && !hasContent) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      'Insert input must provide either "value" (legacy string) or "content" (SDFragment).',
      { fields: ['value', 'content'] },
    );
  }

  if (hasContent) {
    validateStructuralInsertInput(input);
  } else {
    validateLegacyInsertInput(input);
  }
}

/** Validates the legacy string-based insert input shape. */
function validateLegacyInsertInput(input: Record<string, unknown>): void {
  // Union conflict rule 4: structural-only fields with legacy shape
  if ('placement' in input && input.placement !== undefined) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      '"placement" is only valid with structural content input, not with "value".',
      { field: 'placement' },
    );
  }
  if ('nestingPolicy' in input && input.nestingPolicy !== undefined) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      '"nestingPolicy" is only valid with structural content input, not with "value".',
      { field: 'nestingPolicy' },
    );
  }

  assertNoUnknownFields(input, LEGACY_INSERT_ALLOWED_KEYS, 'insert');

  const { target, value, type } = input;

  if (target !== undefined && !isTextAddress(target)) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'target must be a text address object.', {
      field: 'target',
      value: target,
    });
  }

  if (typeof value !== 'string') {
    throw new DocumentApiValidationError('INVALID_TARGET', `value must be a string, got ${typeof value}.`, {
      field: 'value',
      value,
    });
  }

  if (type !== undefined && (typeof type !== 'string' || !VALID_INSERT_TYPES.has(type))) {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `type must be one of: text, markdown, html. Got "${type}".`,
      { field: 'type', value: type },
    );
  }
}

/** Validates the structural SDFragment insert input shape. */
function validateStructuralInsertInput(input: Record<string, unknown>): void {
  // Union conflict rule 3: legacy-only "type" field with structural content
  if ('type' in input && input.type !== undefined) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      '"type" field is only valid with legacy string input ("value"), not with structural "content".',
      { field: 'type' },
    );
  }

  assertNoUnknownFields(input, STRUCTURAL_INSERT_ALLOWED_KEYS, 'insert');

  const { target, content, placement, nestingPolicy } = input;

  if (target !== undefined && !isBlockNodeAddress(target)) {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      'target must be a BlockNodeAddress ({ kind: "block", nodeType, nodeId }).',
      {
        field: 'target',
        value: target,
      },
    );
  }

  if (placement !== undefined && (typeof placement !== 'string' || !PLACEMENT_VALUES.has(placement))) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      `placement must be one of: before, after, insideStart, insideEnd. Got "${String(placement)}".`,
      { field: 'placement', value: placement },
    );
  }

  validateNestingPolicyValue(nestingPolicy);
  validateDocumentFragment(content as SDFragment);
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

export function executeInsert(adapter: WriteAdapter, input: InsertInput, options?: MutationOptions): SDMutationReceipt {
  validateInsertInput(input);

  // Structural content path — returns SDMutationReceipt directly
  if (isStructuralInsertInput(input)) {
    return adapter.insertStructured(input as unknown as LegacyInsertInput, options);
  }

  // Legacy string path
  const { target, value } = input;
  const contentType = input.type ?? 'text';

  // For non-text content types, delegate to the adapter's structured insert path.
  if (contentType !== 'text') {
    return adapter.insertStructured(input, options);
  }

  // Text path: use the existing write pipeline, wrap TextMutationReceipt → SDMutationReceipt
  const request = target ? { kind: 'insert' as const, target, text: value } : { kind: 'insert' as const, text: value };
  const textReceipt = executeWrite(adapter, request, options);
  return textReceiptToSDReceipt(textReceipt);
}
