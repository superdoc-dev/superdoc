/**
 * Centralized document parts system.
 *
 * All non-`word/document.xml` runtime mutations route through this module.
 */

// Types
export type {
  PartId,
  PartSectionId,
  PartDescriptor,
  CommitContext,
  DeleteContext,
  MutatePartRequest,
  CreatePartRequest,
  DeletePartRequest,
  PartOperation,
  MutatePartsRequest,
  MutatePartResult,
  MutatePartsResult,
  PartChangedEvent,
} from './types.js';

// Registry
export {
  registerPartDescriptor,
  getPartDescriptor,
  hasPartDescriptor,
  clearPartDescriptors,
} from './registry/part-registry.js';

// Store
export { getPart, hasPart, setPart, removePart, clonePart } from './store/part-store.js';

// Mutation
export { mutatePart, mutateParts } from './mutation/mutate-part.js';

// Invalidation
export {
  registerInvalidationHandler,
  removeInvalidationHandler,
  applyPartInvalidation,
  clearInvalidationHandlers,
} from './invalidation/part-invalidation-registry.js';
