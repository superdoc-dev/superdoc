// @ts-check
/**
 * Public surface of the review graph layer.
 *
 * Consumers (compiler, decision engine, document-api wrappers) should import
 * from this module rather than reaching into individual files, so the graph
 * layer's internal structure can evolve.
 */

export {
  normalizeEmail,
  getCurrentUserIdentity,
  getChangeAuthorIdentity,
  classifyOwnership,
  isSameUserHighConfidence,
} from './identity.js';

export {
  CanonicalChangeType,
  ChangeSubtype,
  SegmentSide,
  sideFromMarkName,
  subtypeFromChangeType,
  deterministicJson,
  canonicalizeSourceIds,
  readTrackedAttrs,
  normalizedAttrsEqual,
  serializeSourceIds,
} from './mark-metadata.js';

export { enumerateTrackedMarkSpans } from './segment-index.js';

export {
  buildReviewGraph,
  getOrBuildReviewGraph,
  invalidateReviewGraphCache,
  validateGraph,
  signatureOf,
} from './review-graph.js';

export { runGraphInvariants, graphHasErrors } from './graph-invariants.js';

export { BODY_STORY, buildStoryKey, storyLocatorsEqual } from './story-locator.js';

export {
  makeTextInsertIntent,
  makeTextDeleteIntent,
  makeTextReplaceIntent,
  makeFormatIntent,
  sliceFromText,
  toSliceContent,
} from './edit-intent.js';

export { compileTrackedEdit } from './overlap-compiler.js';

export { decideTrackedChanges, buildDecisionBubbleEvents } from './decision-engine.js';

export { planCommentEffects, enumerateCommentAnchors } from './comment-effects.js';

export { createWordIdAllocator, isDecimalWordId } from './word-id-allocator.js';

export { createImportTrackingContext, withParentFrame } from './import-context.js';

export { scanImportDiagnostics, scanTrackedElements } from './import-diagnostics.js';
