/**
 * ProseMirror to FlowBlock Adapter - Public API
 *
 * Converts ProseMirror documents into FlowBlock[] for the layout engine pipeline.
 *
 * Main exports:
 * - toFlowBlocks: Convert PM document to flow blocks with bookmark tracking
 * - toFlowBlocksMap: Batch convert multiple documents
 *
 * Type exports:
 * - PMNode, PMMark: ProseMirror node/mark shapes
 * - AdapterOptions: Configuration options
 * - SectionType, SectionRange: Section handling types
 * - FlowBlocksResult: Result type with blocks and bookmarks
 *
 * For implementation details, see internal.ts
 */

// Re-export public types
export type {
  PMNode,
  PMMark,
  AdapterOptions,
  SectPrElement,
  SectPrChildElement,
  ParagraphProperties,
  SectPrLikeObject,
  AdapterFeatureSnapshot,
  AdapterInstrumentation,
  SectionRange,
  PMDocumentMap,
  BatchAdapterOptions,
  FlowBlocksResult,
  ConverterContext,
} from './types.js';

// Re-export enum as value
export { SectionType } from './types.js';

// Re-export public API functions from internal implementation
export { toFlowBlocks } from './internal.js';
