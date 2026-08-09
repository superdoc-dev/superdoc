import type { ReceiptFailure } from './receipt.js';

/**
 * Shared failure shape for optional adapter namespace mutation results.
 * Per-entity success types vary (different property names for entity addresses),
 * but all failure types share this identical shape.
 */
export interface AdapterMutationFailure {
  success: false;
  failure: ReceiptFailure;
}
