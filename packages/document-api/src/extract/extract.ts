import type { ExtractResult } from '../types/extract.types.js';

export type ExtractInput = Record<string, never>;

/**
 * Engine-specific adapter that provides document content extraction.
 */
export interface ExtractAdapter {
  /**
   * Extract all document content with stable IDs for RAG pipelines.
   */
  extract(input: ExtractInput): ExtractResult;
}

/**
 * Execute an extract operation through the provided adapter.
 */
export function executeExtract(adapter: ExtractAdapter, input: ExtractInput): ExtractResult {
  return adapter.extract(input);
}
