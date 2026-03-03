/**
 * Bootstrap content — immutable room seed for initial editor hydration.
 *
 * Written once by the first client when a collaboration room is created.
 * Never updated during ongoing collaboration. Subsequent joiners read
 * this to initialize their editor, then structured channels (stylesModel,
 * ooxmlPartModels, etc.) bring each part up to the latest state.
 *
 * Y.Map layout:
 *   bootstrapDocxParts → {
 *     _version: 1,
 *     _fonts: { ... },
 *     'word/document.xml': '<xml string>',
 *     'word/styles.xml': '<xml string>',
 *     ...
 *   }
 *
 * @module bootstrap-content
 */

const BOOTSTRAP_MAP = 'bootstrapDocxParts';
const VERSION_KEY = '_version';
const FONTS_KEY = '_fonts';
const CURRENT_VERSION = 1;

// Internal keys that are not part content
const RESERVED_KEYS = new Set([VERSION_KEY, FONTS_KEY]);

// ---------------------------------------------------------------------------
// Write (first client only)
// ---------------------------------------------------------------------------

/**
 * Seed the bootstrap map with the initial file content and fonts.
 * Idempotent — skips if the map already has a version sentinel.
 *
 * @param {import('yjs').Doc} ydoc
 * @param {Array<{ name: string, content: string }>} contentArray
 * @param {{ fonts?: Record<string, unknown>, user?: { id?: string } }} [context]
 */
export function writeBootstrapContent(ydoc, contentArray, context) {
  if (!ydoc || ydoc.isDestroyed) return;
  if (!contentArray || contentArray.length === 0) return;

  const map = ydoc.getMap(BOOTSTRAP_MAP);
  if (map.get(VERSION_KEY) === CURRENT_VERSION) return;

  ydoc.transact(
    () => {
      for (const { name, content } of contentArray) {
        if (name && content != null) {
          map.set(name, content);
        }
      }
      if (context?.fonts) {
        map.set(FONTS_KEY, context.fonts);
      }
      map.set(VERSION_KEY, CURRENT_VERSION);
    },
    { event: 'bootstrap-seed', user: context?.user },
  );
}

// ---------------------------------------------------------------------------
// Read (joining clients)
// ---------------------------------------------------------------------------

/**
 * Read bootstrap content from the room.
 *
 * @param {import('yjs').Doc} ydoc
 * @returns {{ content: Array<{ name: string, content: string }>, fonts: Record<string, unknown> } | null}
 */
export function readBootstrapContent(ydoc) {
  if (!ydoc || ydoc.isDestroyed || typeof ydoc.getMap !== 'function') return null;

  const map = ydoc.getMap(BOOTSTRAP_MAP);
  if (map.get(VERSION_KEY) !== CURRENT_VERSION) return null;

  const content = [];
  if (typeof map.forEach === 'function') {
    map.forEach((value, key) => {
      if (!RESERVED_KEYS.has(key) && value != null) {
        content.push({ name: key, content: value });
      }
    });
  }

  if (content.length === 0) return null;

  const fonts = map.get(FONTS_KEY) ?? {};
  return { content, fonts };
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * Check if this room has bootstrap content available.
 *
 * @param {import('yjs').Doc} ydoc
 * @returns {boolean}
 */
export function hasBootstrapContent(ydoc) {
  if (!ydoc || ydoc.isDestroyed || typeof ydoc.getMap !== 'function') return false;
  return ydoc.getMap(BOOTSTRAP_MAP).get(VERSION_KEY) === CURRENT_VERSION;
}
