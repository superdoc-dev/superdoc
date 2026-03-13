/**
 * Constants for the part-sync collaboration module.
 *
 * Yjs map key names, source identifiers, and configuration defaults.
 */

// ---------------------------------------------------------------------------
// Yjs Map Keys
// ---------------------------------------------------------------------------

/** Yjs map for non-document OOXML parts. */
export const PARTS_MAP_KEY = 'parts';

/** Yjs map for document metadata (docx, fonts, migration status, etc.). */
export const META_MAP_KEY = 'meta';

/** Yjs map for media files. */
export const MEDIA_MAP_KEY = 'media';

// ---------------------------------------------------------------------------
// Meta Map Keys
// ---------------------------------------------------------------------------

export const META_PARTS_SCHEMA_VERSION_KEY = 'partsSchemaVersion';
export const META_PARTS_MIGRATION_KEY = 'partsMigration';
export const META_PARTS_LAST_HYDRATED_AT_KEY = 'partsLastHydratedAt';
export const META_PARTS_FALLBACK_MODE_KEY = 'partsFallbackMode';
export const META_PARTS_CAPABILITY_KEY = 'partsCapability';

// ---------------------------------------------------------------------------
// Source Identifiers
// ---------------------------------------------------------------------------

/** Source prefix for all local part mutations originating from part-sync. */
export const SOURCE_COLLAB_REMOTE_PARTS = 'collab:remote:parts';

/** Source prefix for remote collaboration changes. Used in filtering. */
export const SOURCE_COLLAB_REMOTE_PREFIX = 'collab:remote:';

// ---------------------------------------------------------------------------
// Configuration Defaults
// ---------------------------------------------------------------------------

/** Default staleness window (ms) for concurrent-overwrite detection. */
export const DEFAULT_STALENESS_WINDOW_MS = 5000;

/** Current parts schema version. */
export const PARTS_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Part Classification
// ---------------------------------------------------------------------------

/** Parts excluded from sync (handled by y-prosemirror). */
export const EXCLUDED_PART_IDS = new Set(['word/document.xml']);

/** Critical parts that must succeed during initial hydration. */
export const CRITICAL_PART_IDS = new Set([
  'word/styles.xml',
  'word/numbering.xml',
  'word/_rels/document.xml.rels',
  '[Content_Types].xml',
]);
