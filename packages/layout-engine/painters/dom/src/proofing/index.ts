/**
 * Proofing rendering — public API surface.
 *
 * Only the decoration pass entry points and constants are exported.
 * Span-split internals are consumed directly by the decoration pass.
 */

export { applyProofingDecorations, clearProofingDecorations } from './decoration-pass.js';
export { PROOFING_CSS } from './types.js';
export type { ProofingAnnotation } from './types.js';
