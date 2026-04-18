/**
 * Seed non-document parts from the editor's converter into the Yjs parts map.
 *
 * Used for new-room initialization and file replacement. Writes all
 * non-document parts as versioned envelopes in a single Yjs transaction
 * alongside the capability marker and schema version.
 */

import * as Y from 'yjs';
import type { Editor } from '../../../core/Editor.js';
import type { PartsCapability } from './types.js';
import { encodeEnvelopeToYjs } from './json-crdt.js';
import {
  PARTS_MAP_KEY,
  META_MAP_KEY,
  META_PARTS_CAPABILITY_KEY,
  META_PARTS_SCHEMA_VERSION_KEY,
  EXCLUDED_PART_IDS,
  PARTS_SCHEMA_VERSION,
} from './constants.js';

interface SeedOptions {
  /** When true, delete stale keys from parts map not in the current snapshot. */
  replaceExisting?: boolean;
}

/**
 * Write non-document parts from `converter.convertedXml` into the Yjs `parts` map.
 *
 * - Filters out `word/document.xml` (owned by y-prosemirror).
 * - `replaceExisting: true` performs an authoritative replace: deletes any
 *   parts map key not present in the current converter snapshot.
 * - `replaceExisting: false` (default) skips keys that already exist.
 * - All writes happen in a single `ydoc.transact()`.
 */
export function seedPartsFromEditor(editor: Editor, ydoc: Y.Doc, options?: SeedOptions): void {
  const convertedXml = (editor as unknown as { converter?: { convertedXml?: Record<string, unknown> } }).converter
    ?.convertedXml;
  if (!convertedXml) return;

  const partsMap = ydoc.getMap(PARTS_MAP_KEY) as Y.Map<unknown>;
  const metaMap = ydoc.getMap(META_MAP_KEY);
  const replaceExisting = options?.replaceExisting ?? false;

  const snapshotKeys = new Set(Object.keys(convertedXml).filter((key) => !EXCLUDED_PART_IDS.has(key)));

  ydoc.transact(
    () => {
      // Prune stale keys when replacing (e.g., after file replacement)
      if (replaceExisting) {
        for (const key of [...partsMap.keys()]) {
          if (!EXCLUDED_PART_IDS.has(key) && !snapshotKeys.has(key)) {
            partsMap.delete(key);
          }
        }
      }

      // Upsert parts from converter snapshot
      for (const key of snapshotKeys) {
        if (!replaceExisting && partsMap.has(key)) continue;

        const envelope = encodeEnvelopeToYjs({
          v: 1,
          clientId: ydoc.clientID,
          data: convertedXml[key],
        });
        partsMap.set(key, envelope);
      }

      // Set capability marker and schema version
      const capability: PartsCapability = {
        version: PARTS_SCHEMA_VERSION,
        enabledAt: new Date().toISOString(),
        clientId: ydoc.clientID,
      };
      metaMap.set(META_PARTS_CAPABILITY_KEY, capability);
      metaMap.set(META_PARTS_SCHEMA_VERSION_KEY, PARTS_SCHEMA_VERSION);
    },
    { event: 'seed-parts' },
  );
}
