/**
 * Replace operation — replaces content at a contiguous document selection.
 *
 * Two shapes:
 * - Text replacement (`text` field): routes through SelectionMutationAdapter.
 * - Structural replacement (`content` field): continues through WriteAdapter.replaceStructured.
 *
 * Text path accepts `SelectionTarget` or `ref`. Structural path accepts
 * `BlockNodeAddress`, `SelectionTarget`, or `ref`.
 */

import type { MutationOptions } from '../types/mutation-plan.types.js';
import type { SelectionTarget } from '../types/address.js';
import type { SDMutationReceipt } from '../types/sd-contract.js';
import type { SDReplaceInput } from '../types/structural-input.js';
import type { SDFragment } from '../types/fragment.js';
import type { SelectionMutationAdapter } from '../selection-mutation.js';
import type { WriteAdapter } from '../write/write.js';
import { normalizeMutationOptions } from '../write/write.js';
import { DocumentApiValidationError } from '../errors.js';
import {
  isRecord,
  isBlockNodeAddress,
  assertNoUnknownFields,
  validateNestingPolicyValue,
} from '../validation-primitives.js';
import { isSelectionTarget } from '../validation/selection-target-validator.js';
import { validateDocumentFragment } from '../validation/fragment-validator.js';
import { textReceiptToSDReceipt } from '../receipt-bridge.js';

// ---------------------------------------------------------------------------
// Text replacement input (new shape)
// ---------------------------------------------------------------------------

/** Text replacement input — uses SelectionTarget / ref. */
export interface TextReplaceInput {
  target?: SelectionTarget;
  ref?: string;
  text: string;
}

// ---------------------------------------------------------------------------
// Discriminated union: text shape OR structural SDFragment shape
// ---------------------------------------------------------------------------

/**
 * Input payload for the `doc.replace` operation.
 *
 * Discrimination: presence of `content` (structural) vs `text` (text replacement).
 */
export type ReplaceInput = TextReplaceInput | SDReplaceInput;

// ---------------------------------------------------------------------------
// Allowlists
// ---------------------------------------------------------------------------

const TEXT_REPLACE_ALLOWED_KEYS = new Set(['text', 'target', 'ref']);
const STRUCTURAL_REPLACE_ALLOWED_KEYS = new Set(['content', 'target', 'ref', 'nestingPolicy']);

// ---------------------------------------------------------------------------
// Shape discrimination
// ---------------------------------------------------------------------------

/** Returns true when the input uses the structural SDFragment shape. */
export function isStructuralReplaceInput(input: ReplaceInput): input is SDReplaceInput {
  return 'content' in input && input.content !== undefined;
}

// ---------------------------------------------------------------------------
// Shared target validation for text path
// ---------------------------------------------------------------------------

function validateTargetLocator(input: Record<string, unknown>, operation: string): void {
  const hasTarget = input.target !== undefined;
  const hasRef = input.ref !== undefined;

  if (hasTarget && hasRef) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      `${operation} input must provide either "target" or "ref", not both.`,
      { fields: ['target', 'ref'] },
    );
  }

  if (!hasTarget && !hasRef) {
    throw new DocumentApiValidationError('INVALID_INPUT', `${operation} requires a target or ref.`, {
      fields: ['target', 'ref'],
    });
  }

  if (hasTarget && !isSelectionTarget(input.target)) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'target must be a SelectionTarget object.', {
      field: 'target',
      value: input.target,
    });
  }

  if (hasRef && typeof input.ref !== 'string') {
    throw new DocumentApiValidationError('INVALID_TARGET', 'ref must be a string.', {
      field: 'ref',
      value: input.ref,
    });
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateReplaceInput(input: unknown): asserts input is ReplaceInput {
  if (!isRecord(input)) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'Replace input must be a non-null object.');
  }

  const hasText = 'text' in input && input.text !== undefined;
  const hasContent = 'content' in input && input.content !== undefined;

  if (hasText && hasContent) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      'Replace input must provide either "text" or "content", not both.',
      { fields: ['text', 'content'] },
    );
  }

  if (!hasText && !hasContent) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'Replace input must provide either "text" or "content".', {
      fields: ['text', 'content'],
    });
  }

  if (hasContent) {
    validateStructuralReplaceInput(input);
  } else {
    validateTextReplaceInput(input);
  }
}

/** Validates the text replacement path (SelectionTarget / ref + text). */
function validateTextReplaceInput(input: Record<string, unknown>): void {
  if ('nestingPolicy' in input && input.nestingPolicy !== undefined) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      '"nestingPolicy" is only valid with structural content input, not with "text".',
      { field: 'nestingPolicy' },
    );
  }

  assertNoUnknownFields(input, TEXT_REPLACE_ALLOWED_KEYS, 'replace');
  validateTargetLocator(input, 'replace');

  if (typeof input.text !== 'string') {
    throw new DocumentApiValidationError('INVALID_TARGET', `text must be a string, got ${typeof input.text}.`, {
      field: 'text',
      value: input.text,
    });
  }
}

/** Validates structural SDFragment replace input. */
function validateStructuralReplaceInput(input: Record<string, unknown>): void {
  assertNoUnknownFields(input, STRUCTURAL_REPLACE_ALLOWED_KEYS, 'replace');

  const { target, ref: refValue, content, nestingPolicy } = input;
  const hasTarget = target !== undefined;
  const hasRef = refValue !== undefined;

  if (hasTarget && hasRef) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      'Structural replace must provide either "target" or "ref", not both.',
      { fields: ['target', 'ref'] },
    );
  }

  if (!hasTarget && !hasRef) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'Structural replace requires a target or ref.', {
      fields: ['target', 'ref'],
    });
  }

  if (hasTarget && !isBlockNodeAddress(target) && !isSelectionTarget(target)) {
    throw new DocumentApiValidationError('INVALID_TARGET', 'target must be a BlockNodeAddress or SelectionTarget.', {
      field: 'target',
      value: target,
    });
  }

  if (hasRef && typeof refValue !== 'string') {
    throw new DocumentApiValidationError('INVALID_TARGET', 'ref must be a string.', {
      field: 'ref',
      value: refValue,
    });
  }

  validateNestingPolicyValue(nestingPolicy);
  validateDocumentFragment(content as SDFragment);
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

export function executeReplace(
  selectionAdapter: SelectionMutationAdapter,
  writeAdapter: WriteAdapter,
  input: ReplaceInput,
  options?: MutationOptions,
): SDMutationReceipt {
  validateReplaceInput(input);

  // Structural content path — returns SDMutationReceipt directly
  if (isStructuralReplaceInput(input)) {
    return writeAdapter.replaceStructured(input as unknown as ReplaceInput, options);
  }

  // Text replacement path — route through SelectionMutationAdapter
  const textInput = input as TextReplaceInput;
  const textReceipt = selectionAdapter.execute(
    {
      kind: 'replace',
      target: textInput.target,
      ref: textInput.ref,
      text: textInput.text,
    },
    normalizeMutationOptions(options),
  );
  return textReceiptToSDReceipt(textReceipt);
}
