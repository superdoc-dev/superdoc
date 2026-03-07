/**
 * Part-sync bootstrap: setup and teardown of publisher + consumer.
 *
 * Manages the lifecycle of part synchronization, including:
 * - Feature flag gating
 * - Room capability check (mixed-version protection)
 * - Migration from `meta.docx` when needed
 * - Initial hydration from Yjs `parts` map
 * - Publisher and consumer activation
 */

import * as Y from 'yjs';
import type { Editor } from '../../../core/Editor.js';
import type { PartId } from '../../../core/parts/types.js';
import type { PartSyncMode, PartsCapability } from './types.js';
import { createPartPublisher, type PartPublisher } from './publisher.js';
import { createPartConsumer, replacePartData, type PartConsumer } from './consumer.js';
import { decodeYjsToEnvelope } from './json-crdt.js';
import { isMigrationNeeded, migrateMetaDocxToParts } from './migration-from-meta-docx.js';
import { mutateParts, hasPart } from '../../../core/parts/index.js';
import {
  PARTS_MAP_KEY,
  META_MAP_KEY,
  META_PARTS_CAPABILITY_KEY,
  META_PARTS_FALLBACK_MODE_KEY,
  META_PARTS_LAST_HYDRATED_AT_KEY,
  EXCLUDED_PART_IDS,
  CRITICAL_PART_IDS,
  PARTS_SCHEMA_VERSION,
  SOURCE_COLLAB_REMOTE_PARTS,
} from './constants.js';
import {
  registerExistingHeaderFooterDescriptors,
  resolveHeaderFooterRId,
} from '../../../core/parts/adapters/header-footer-sync.js';
import {
  ensureHeaderFooterDescriptor,
  isHeaderFooterPartId,
} from '../../../core/parts/adapters/header-footer-part-descriptor.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface PartSyncHandle {
  publisher: PartPublisher | null;
  consumer: PartConsumer | null;
  destroy(): void;
}

/**
 * Resolve the activation mode from editor options.
 *
 * - `collaborationPartsSync: false` (or absent) → `'off'`
 * - `collaborationPartsSync: 'passive'` → `'passive'` (publisher only)
 * - `collaborationPartsSync: true` → `'active'` (publisher + consumer)
 */
export function resolvePartSyncMode(editor: Editor): PartSyncMode {
  const flag = (editor.options as Record<string, unknown>).collaborationPartsSync;
  if (flag === 'passive') return 'passive';
  if (flag === true) return 'active';
  return 'off';
}

/**
 * Bootstrap part-sync for a collaborative editor session.
 *
 * Follows the room capability gate sequence from §4.4:
 * 1. Check capability marker
 * 2. Run migration if needed
 * 3. Backfill capability if parts exist but marker is missing
 * 4. Hydrate local state from `parts` map
 * 5. Activate publisher/consumer based on mode
 */
export function bootstrapPartSync(editor: Editor, ydoc: Y.Doc, mode: PartSyncMode): PartSyncHandle {
  if (mode === 'off') return createNoopHandle();

  const metaMap = ydoc.getMap(META_MAP_KEY);
  const partsMap = ydoc.getMap(PARTS_MAP_KEY) as Y.Map<unknown>;

  // Step 1: Check room capability
  const capability = metaMap.get(META_PARTS_CAPABILITY_KEY) as PartsCapability | undefined;
  let capabilityActive = capability != null && capability.version >= 1;

  // Step 2: Migration — pass converter's pre-parsed data so migration
  // doesn't fail on the XML strings that meta.docx stores after first export.
  if (!capabilityActive && isMigrationNeeded(ydoc)) {
    const localParts = (editor as unknown as { converter?: { convertedXml?: Record<string, unknown> } }).converter
      ?.convertedXml;
    const result = migrateMetaDocxToParts(ydoc, { localParts });
    if (result.migrated) {
      capabilityActive = true;
    }
  }

  // Step 3: Backfill — parts exist but no capability marker
  if (!capabilityActive && hasNonDocumentEntries(partsMap)) {
    backfillCapability(metaMap, ydoc);
    capabilityActive = true;
    console.info('[part-sync] Backfilled partsCapability marker for existing parts data');
  }

  // Step 4: If no capability and no parts, stay on legacy path
  if (!capabilityActive) {
    console.info('[part-sync] No parts capability — staying on legacy meta.docx path');
    return createNoopHandle();
  }

  // Step 5: Register header/footer descriptors before hydration
  registerExistingHeaderFooterDescriptors(editor);
  registerHeaderFooterDescriptorsFromPartsMap(partsMap, editor);

  // Step 6: Hydrate local state from parts map
  const hydrationOk = hydrateFromPartsMap(editor, ydoc, partsMap, metaMap);
  if (!hydrationOk) {
    // Critical failure — fall back to meta.docx
    metaMap.set(META_PARTS_FALLBACK_MODE_KEY, true);
    console.warn('[part-sync] Hydration failed — falling back to meta.docx');
    return createNoopHandle();
  }

  metaMap.set(META_PARTS_LAST_HYDRATED_AT_KEY, new Date().toISOString());

  // Step 7: Activate publisher/consumer
  const publisher = createPartPublisher(editor, ydoc);
  const partChangedHandler = (event: import('../../../core/parts/types.js').PartChangedEvent) => {
    publisher.handlePartChanged(event);
  };
  editor.on('partChanged', partChangedHandler);

  // Store publisher on editor for compound mutation coordination
  (editor as unknown as { _partPublisher?: PartPublisher })._partPublisher = publisher;

  let consumer: PartConsumer | null = null;
  if (mode === 'active') {
    consumer = createPartConsumer(editor, ydoc);
  }

  return {
    publisher,
    consumer,
    destroy() {
      editor.off('partChanged', partChangedHandler);
      publisher.destroy();
      consumer?.destroy();
      delete (editor as unknown as { _partPublisher?: PartPublisher })._partPublisher;
    },
  };
}

// ---------------------------------------------------------------------------
// Hydration
// ---------------------------------------------------------------------------

/**
 * Hydrate local part store from the Yjs `parts` map.
 *
 * During initial hydration, critical parts must all succeed.
 * Non-critical parts are skipped on failure.
 */
function hydrateFromPartsMap(editor: Editor, ydoc: Y.Doc, partsMap: Y.Map<unknown>, metaMap: Y.Map<unknown>): boolean {
  const operations: import('../../../core/parts/types.js').PartOperation[] = [];
  const criticalFailures: string[] = [];

  // Decode rels from Yjs for header/footer sectionId resolution
  const relsEntry = partsMap.get('word/_rels/document.xml.rels');
  const relsData = relsEntry instanceof Y.Map ? (decodeYjsToEnvelope(relsEntry)?.data ?? null) : null;

  for (const [key, value] of partsMap.entries()) {
    if (EXCLUDED_PART_IDS.has(key)) continue;

    if (!(value instanceof Y.Map)) {
      if (CRITICAL_PART_IDS.has(key)) {
        criticalFailures.push(`${key}: entry is not a Y.Map (got ${typeof value})`);
      } else {
        console.warn(`[part-sync] Skipping non-Y.Map entry "${key}" during hydration`);
      }
      continue;
    }

    const partId = key as PartId;

    // Resolve sectionId (rId) for header/footer parts so afterCommit
    // writes PM JSON under the correct key in converter.headers/footers
    const sectionId = isHeaderFooterPartId(key) ? (resolveHeaderFooterRId(key, relsData, editor) ?? key) : undefined;

    try {
      const envelope = decodeYjsToEnvelope(value as Y.Map<unknown>);
      if (!envelope || envelope.data === undefined || envelope.data === null) {
        throw new Error(`Invalid envelope for "${key}"`);
      }

      const operation = hasPart(editor, partId) ? 'mutate' : 'create';
      if (operation === 'mutate') {
        operations.push({
          editor,
          partId,
          sectionId,
          operation: 'mutate',
          source: SOURCE_COLLAB_REMOTE_PARTS,
          mutate: createReplacer(envelope.data),
        });
      } else {
        operations.push({
          editor,
          partId,
          sectionId,
          operation: 'create',
          source: SOURCE_COLLAB_REMOTE_PARTS,
          initial: envelope.data,
        });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);

      if (CRITICAL_PART_IDS.has(key)) {
        criticalFailures.push(`${key}: ${errorMsg}`);
      } else {
        console.warn(`[part-sync] Skipping non-critical part "${key}" during hydration:`, errorMsg);
      }
    }
  }

  // Abort entirely if any critical part failed
  if (criticalFailures.length > 0) {
    console.error('[part-sync] Critical part hydration failures:', criticalFailures);
    return false;
  }

  if (operations.length === 0) return true;

  try {
    mutateParts({ editor, source: SOURCE_COLLAB_REMOTE_PARTS, operations });
    return true;
  } catch (err) {
    console.error('[part-sync] Hydration mutateParts failed:', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createNoopHandle(): PartSyncHandle {
  return {
    publisher: null,
    consumer: null,
    destroy() {},
  };
}

function hasNonDocumentEntries(partsMap: Y.Map<unknown>): boolean {
  for (const key of partsMap.keys()) {
    if (!EXCLUDED_PART_IDS.has(key)) return true;
  }
  return false;
}

/**
 * Register header/footer descriptors for any header/footer parts in the Yjs parts map.
 *
 * Resolves the relationship ID from the Yjs rels data (most current) or falls back
 * to the editor's local converter rels. This ensures descriptors capture the correct
 * rId so `afterCommit` writes PM JSON under the right key in `converter.headers/footers`.
 */
function registerHeaderFooterDescriptorsFromPartsMap(partsMap: Y.Map<unknown>, editor: Editor): void {
  // Decode rels from Yjs (most current source for rId resolution)
  const relsEntry = partsMap.get('word/_rels/document.xml.rels');
  const relsData = relsEntry instanceof Y.Map ? (decodeYjsToEnvelope(relsEntry)?.data ?? null) : null;

  for (const key of partsMap.keys()) {
    if (isHeaderFooterPartId(key)) {
      const rId = resolveHeaderFooterRId(key, relsData, editor);
      ensureHeaderFooterDescriptor(key as PartId, rId ?? key);
    }
  }
}

function backfillCapability(metaMap: Y.Map<unknown>, ydoc: Y.Doc): void {
  const capability: PartsCapability = {
    version: PARTS_SCHEMA_VERSION,
    enabledAt: new Date().toISOString(),
    clientId: ydoc.clientID,
  };
  metaMap.set(META_PARTS_CAPABILITY_KEY, capability);
}

function createReplacer(data: unknown): (ctx: { part: unknown; dryRun: boolean }) => void {
  return ({ part }) => replacePartData(part, data);
}
