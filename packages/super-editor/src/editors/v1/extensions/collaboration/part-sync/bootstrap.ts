/**
 * Part-sync bootstrap: setup and teardown of publisher + consumer.
 *
 * Manages the lifecycle of part synchronization, including:
 * - Room capability check (mixed-version protection)
 * - Migration from `meta.docx` when needed
 * - Seeding from local converter for new/empty rooms
 * - Initial hydration from Yjs `parts` map
 * - Publisher and consumer activation
 */

import * as Y from 'yjs';
import type { Editor } from '../../../core/Editor.js';
import type { PartId } from '../../../core/parts/types.js';
import type { PartsCapability } from './types.js';
import { createPartPublisher, type PartPublisher } from './publisher.js';
import { createPartConsumer, replacePartData, type PartConsumer } from './consumer.js';
import { decodeYjsToEnvelope } from './json-crdt.js';
import { isMigrationNeeded, migrateMetaDocxToParts } from './migration-from-meta-docx.js';
import { seedPartsFromEditor } from './seed-parts.js';
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
 * Bootstrap part-sync for a collaborative editor session.
 *
 * Decision tree:
 * 1. Parts + capability → hydrate
 * 2. Parts, no capability → backfill capability + hydrate
 * 3. No parts, meta.docx exists → migrate + hydrate
 * 4. No parts, no meta.docx → seed from local converter
 * 5. Hydration/seed succeeded → activate publisher + consumer
 * 6. Critical hydration failure → emit degraded event, return noop (document sync continues)
 */
export function bootstrapPartSync(editor: Editor, ydoc: Y.Doc): PartSyncHandle {
  const metaMap = ydoc.getMap(META_MAP_KEY);
  const partsMap = ydoc.getMap(PARTS_MAP_KEY) as Y.Map<unknown>;

  // Step 1: Check room capability
  const capability = metaMap.get(META_PARTS_CAPABILITY_KEY) as PartsCapability | undefined;
  let capabilityActive = capability != null && capability.version >= 1;

  // Step 2: Migration — meta.docx is authoritative for legacy rooms.
  // If migration was needed but failed, enter degraded mode rather than
  // falling through to local seeding (which would publish non-authoritative defaults).
  const migrationNeeded = !capabilityActive && isMigrationNeeded(ydoc);
  if (migrationNeeded) {
    const result = migrateMetaDocxToParts(ydoc);
    if (result.migrated) {
      capabilityActive = true;
    } else if (result.error) {
      metaMap.set(META_PARTS_FALLBACK_MODE_KEY, true);
      editor.safeEmit?.('parts:degraded', {
        reason: 'migration-failure',
        failures: [result.error],
      });
      editor.safeEmit?.('exception', {
        error: new Error(
          `[part-sync] Degraded: migration from meta.docx failed.` +
            ` Parts sync disabled to avoid publishing non-authoritative data.` +
            ` Error: ${result.error}`,
        ),
        editor,
      });
      console.error('[part-sync] Migration failed — entering degraded mode:', result.error);
      return createNoopHandle();
    }
  }

  // Step 3: Backfill — parts exist but no capability marker
  if (!capabilityActive && hasNonDocumentEntries(partsMap)) {
    backfillCapability(metaMap, ydoc);
    capabilityActive = true;
    console.info('[part-sync] Backfilled partsCapability marker for existing parts data');
  }

  // Step 4: No parts, no meta.docx — seed from local converter.
  // Guard: if the Y fragment has content AND the Yjs doc contains state from
  // remote clients, this is a late-joiner to a legacy room. Their converter
  // holds blank-template data (not the real shared document), so seeding
  // would overwrite authoritative shared state with local defaults.
  // When only the local client has written (first-client or replaceFile),
  // seeding is safe — the converter was loaded from the actual file.
  if (!capabilityActive) {
    const fragment = ydoc.getXmlFragment('supereditor');
    const hasRemoteState = Array.from(ydoc.store.clients.keys()).some((id) => id !== ydoc.clientID);

    if (fragment.length > 0 && hasRemoteState) {
      metaMap.set(META_PARTS_FALLBACK_MODE_KEY, true);
      editor.safeEmit?.('parts:degraded', {
        reason: 'existing-room-no-parts',
        failures: ['Room has shared document content from remote clients but no parts data — cannot seed safely'],
      });
      console.warn(
        '[part-sync] Degraded: room has Y fragment content with remote client state but no parts/meta.docx.' +
          ' Skipping local seed to avoid publishing non-authoritative data.',
      );
      return createNoopHandle();
    }

    seedPartsFromEditor(editor, ydoc);
    capabilityActive = true;
    console.info('[part-sync] Seeded parts from local converter');
  }

  // Step 5: Register header/footer descriptors before hydration
  registerExistingHeaderFooterDescriptors(editor);
  registerHeaderFooterDescriptorsFromPartsMap(partsMap, editor);

  // Step 6: Hydrate local state from parts map
  const hydration = hydrateFromPartsMap(editor, ydoc, partsMap);
  if (!hydration.ok) {
    // Degraded mode: document.xml sync continues via y-prosemirror, but parts
    // sync is disabled. Style/numbering/rels changes will NOT propagate.
    metaMap.set(META_PARTS_FALLBACK_MODE_KEY, true);
    editor.safeEmit?.('parts:degraded', {
      reason: 'critical-hydration-failure',
      failures: hydration.failures,
    });
    editor.safeEmit?.('exception', {
      error: new Error(
        `[part-sync] Degraded: parts sync disabled.` +
          ` Document sync continues but style/numbering changes will not propagate.` +
          ` Failed: ${hydration.failures.join(', ')}`,
      ),
      editor,
    });
    console.error('[part-sync] Degraded mode — publisher/consumer NOT activated:', hydration.failures);
    return createNoopHandle();
  }

  metaMap.set(META_PARTS_LAST_HYDRATED_AT_KEY, new Date().toISOString());

  // Step 7: Activate publisher + consumer
  return activateSync(editor, ydoc);
}

// ---------------------------------------------------------------------------
// Sync Activation
// ---------------------------------------------------------------------------

function activateSync(editor: Editor, ydoc: Y.Doc): PartSyncHandle {
  const publisher = createPartPublisher(editor, ydoc);
  const partChangedHandler = (event: import('../../../core/parts/types.js').PartChangedEvent) => {
    publisher.handlePartChanged(event);
  };
  editor.on('partChanged', partChangedHandler);

  // Store publisher on editor for compound mutation coordination
  (editor as unknown as { _partPublisher?: PartPublisher })._partPublisher = publisher;

  const consumer = createPartConsumer(editor, ydoc);

  return {
    publisher,
    consumer,
    destroy() {
      editor.off('partChanged', partChangedHandler);
      publisher.destroy();
      consumer.destroy();
      delete (editor as unknown as { _partPublisher?: PartPublisher })._partPublisher;
    },
  };
}

// ---------------------------------------------------------------------------
// Hydration
// ---------------------------------------------------------------------------

interface HydrationResult {
  ok: boolean;
  /** Non-empty only when `ok` is false — per-part failure descriptions. */
  failures: string[];
}

/**
 * Hydrate local part store from the Yjs `parts` map.
 *
 * Critical parts must all succeed; non-critical parts are skipped on failure.
 */
function hydrateFromPartsMap(editor: Editor, ydoc: Y.Doc, partsMap: Y.Map<unknown>): HydrationResult {
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
    return { ok: false, failures: criticalFailures };
  }

  if (operations.length === 0) return { ok: true, failures: [] };

  try {
    mutateParts({ editor, source: SOURCE_COLLAB_REMOTE_PARTS, operations });
    return { ok: true, failures: [] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[part-sync] Hydration mutateParts failed:', err);
    return { ok: false, failures: [`mutateParts: ${msg}`] };
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
 */
function registerHeaderFooterDescriptorsFromPartsMap(partsMap: Y.Map<unknown>, editor: Editor): void {
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
