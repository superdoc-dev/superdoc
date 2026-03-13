/**
 * Transport interface contract for future part synchronization.
 *
 * Types only — no runtime behavior. Any future transport implementation
 * must call core mutation APIs (`mutatePart`/`mutateParts`) for apply,
 * never mutate converter directly.
 */

import type { PartId, PartSectionId, PartChangedEvent } from '../../../core/parts/types.js';

/** A serializable patch representing changes to a single part. */
export interface PartPatch {
  partId: PartId;
  sectionId?: PartSectionId;
  operation: 'mutate' | 'create' | 'delete';
  /** JSON-serializable payload. Shape TBD when transport is implemented. */
  payload: unknown;
}

/** Publishes local part changes to remote peers. */
export interface PartTransportPublisher {
  publish(event: PartChangedEvent): void;
}

/** Applies remote part changes locally via the parts mutation core. */
export interface PartTransportConsumer {
  apply(patches: PartPatch[]): void;
}

/** Hydrates part state from a remote source on initial sync. */
export interface PartTransportHydrator {
  hydrate(partId: PartId): unknown;
}
