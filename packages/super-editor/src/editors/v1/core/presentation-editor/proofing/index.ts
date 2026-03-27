/**
 * Proofing module — public API surface.
 *
 * Only ProofingSessionManager and types are exported here.
 * Internal helpers (store, extractor, hash, etc.) are implementation
 * details consumed directly by the session manager.
 */

export { ProofingSessionManager } from './ProofingSessionManager.js';

export type { VisibilitySource } from './visibility-source.js';
export type { PageResolver } from './segment-extractor.js';
export type * from './types.js';
