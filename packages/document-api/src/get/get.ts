import type { SDGetInput } from '../types/sd-envelope.js';
import type { SDDocument } from '../types/fragment.js';

/**
 * Engine-specific adapter that the get API delegates to.
 */
export interface GetAdapter {
  /**
   * Read the full document as an SDDocument structure.
   */
  get(input: SDGetInput): SDDocument;
}

/**
 * Execute a get operation via the provided adapter.
 *
 * @param adapter - Engine-specific get adapter.
 * @param input - Canonical get input object.
 * @returns An SDDocument with body content projected into SDM/1 canonical shapes.
 */
export function executeGet(adapter: GetAdapter, input: SDGetInput): SDDocument {
  return adapter.get(input);
}
