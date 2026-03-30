/**
 * Mutation result envelope builders for content control operations.
 */

import type {
  ContentControlTarget,
  ContentControlMutationResult,
  ContentControlsListResult,
  ContentControlInfo,
  ReceiptFailureCode,
} from '@superdoc/document-api';

/** Build a successful mutation result, optionally with an updated reference. */
export function buildMutationSuccess(
  target: ContentControlTarget,
  updatedRef?: ContentControlTarget,
): ContentControlMutationResult {
  const result: ContentControlMutationResult = { success: true, contentControl: target };
  if (updatedRef) {
    result.updatedRef = updatedRef;
  }
  return result;
}

/** Build a failed mutation result. */
export function buildMutationFailure(code: ReceiptFailureCode, message: string): ContentControlMutationResult {
  return { success: false, failure: { code, message } };
}

/** Apply offset/limit pagination to a list of ContentControlInfo items. */
export function applyPagination(
  items: ContentControlInfo[],
  opts?: { offset?: number; limit?: number },
): ContentControlsListResult {
  const total = items.length;
  const offset = opts?.offset ?? 0;
  const limit = opts?.limit ?? total;
  return { items: items.slice(offset, offset + limit), total };
}
