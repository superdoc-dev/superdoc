import type { DocumentInfo } from '../types/info.types.js';

export type InfoInput = Record<string, never>;

/**
 * Engine-specific adapter that provides document summary information.
 */
export interface InfoAdapter {
  /**
   * Return summary info used by the `doc.info` operation.
   */
  info(input: InfoInput): DocumentInfo;
}

/**
 * Execute an info operation through the provided adapter.
 *
 * @param adapter - Engine-specific info adapter.
 * @param input - Canonical info input object.
 * @returns Structured document summary info.
 */
export function executeInfo(adapter: InfoAdapter, input: InfoInput): DocumentInfo {
  return adapter.info(input);
}
