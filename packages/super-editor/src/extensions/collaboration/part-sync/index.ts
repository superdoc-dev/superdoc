/**
 * Part-sync collaboration module.
 *
 * Synchronizes non-document OOXML parts via Yjs CRDT state.
 * All remote applies route through the centralized mutation core.
 */

export { bootstrapPartSync } from './bootstrap.js';
export type { PartSyncHandle } from './bootstrap.js';
export { isApplyingRemotePartChanges } from './consumer.js';
export { isMigrationNeeded, migrateMetaDocxToParts } from './migration-from-meta-docx.js';
export { seedPartsFromEditor } from './seed-parts.js';
export type { PartEnvelope, PartsMigrationMeta, PartsCapability, PartSyncDegradedEvent } from './types.js';
export { PARTS_MAP_KEY, META_MAP_KEY, SOURCE_COLLAB_REMOTE_PREFIX } from './constants.js';
