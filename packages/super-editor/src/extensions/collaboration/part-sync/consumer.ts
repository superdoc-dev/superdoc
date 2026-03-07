/**
 * Part-sync consumer: Yjs `parts` map changes → local mutation core.
 *
 * Observes the Yjs `parts` map for remote changes and applies them locally
 * via `mutateParts`. Each part is validated individually — a single bad part
 * does not block the rest.
 */

import * as Y from 'yjs';
import type { Editor } from '../../../core/Editor.js';
import type { PartId, PartOperation } from '../../../core/parts/types.js';
import type { FailedPartEntry } from './types.js';
import { decodeYjsToEnvelope } from './json-crdt.js';
import { PARTS_MAP_KEY, EXCLUDED_PART_IDS, SOURCE_COLLAB_REMOTE_PARTS } from './constants.js';
import { hasPart, mutateParts } from '../../../core/parts/index.js';
import {
  isHeaderFooterPartId,
  ensureHeaderFooterDescriptor,
} from '../../../core/parts/adapters/header-footer-part-descriptor.js';
import { resolveHeaderFooterRId } from '../../../core/parts/adapters/header-footer-sync.js';

// ---------------------------------------------------------------------------
// Consumer State
// ---------------------------------------------------------------------------

export interface PartConsumer {
  /** Tear down the Yjs observer. */
  destroy(): void;
}

// ---------------------------------------------------------------------------
// Guard: prevents publisher from re-publishing remote applies
// ---------------------------------------------------------------------------

let isApplyingRemoteParts = false;

export function isApplyingRemotePartChanges(): boolean {
  return isApplyingRemoteParts;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createPartConsumer(editor: Editor, ydoc: Y.Doc): PartConsumer {
  const partsMap = ydoc.getMap(PARTS_MAP_KEY) as Y.Map<unknown>;
  const failedParts = new Map<string, FailedPartEntry>();

  const observer = (event: Y.YMapEvent<unknown>, transaction: Y.Transaction) => {
    // Only process remote changes
    if (transaction.local) return;

    const operations: PartOperation[] = [];

    // Decode rels from Yjs for header/footer rId resolution
    const relsYjsEntry = partsMap.get('word/_rels/document.xml.rels');
    const relsData = relsYjsEntry instanceof Y.Map ? (decodeYjsToEnvelope(relsYjsEntry)?.data ?? null) : null;

    event.changes.keys.forEach((change, key) => {
      if (EXCLUDED_PART_IDS.has(key)) return;

      const partId = key as PartId;

      // For header/footer parts, ensure descriptor is registered with correct rId
      const sectionId = ensureHeaderFooterSectionId(partId, relsData, editor);

      try {
        if (change.action === 'delete') {
          if (hasPart(editor, partId)) {
            operations.push({
              editor,
              partId,
              sectionId,
              operation: 'delete',
              source: SOURCE_COLLAB_REMOTE_PARTS,
            });
          }
          failedParts.delete(key);
          return;
        }

        // 'add' or 'update'
        const yValue = partsMap.get(key);
        if (!(yValue instanceof Y.Map)) return;

        const envelope = decodeYjsToEnvelope(yValue);
        if (!envelope || envelope.data === undefined || envelope.data === null) {
          console.warn(`[part-sync] Skipping invalid envelope for "${key}"`);
          return;
        }

        // Check if this exact (v, clientId) already failed — skip retry
        const prevFail = failedParts.get(key);
        if (prevFail && prevFail.v === envelope.v && prevFail.clientId === envelope.clientId) {
          return;
        }

        const operation = hasPart(editor, partId) ? 'mutate' : 'create';
        if (operation === 'mutate') {
          operations.push({
            editor,
            partId,
            sectionId,
            operation: 'mutate',
            source: SOURCE_COLLAB_REMOTE_PARTS,
            mutate: ({ part }) => {
              // Full-replace: copy all top-level keys from remote data
              replacePartData(part, envelope.data);
            },
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

        // Clear from failed on successful build
        failedParts.delete(key);
      } catch (err) {
        console.error(`[part-sync] Error processing remote part "${key}":`, err);
        trackFailure(failedParts, key, partsMap);
      }
    });

    if (operations.length === 0) return;

    isApplyingRemoteParts = true;
    try {
      mutateParts({ editor, source: SOURCE_COLLAB_REMOTE_PARTS, operations });
    } catch (err) {
      console.error('[part-sync] Failed to apply remote part changes:', err);
    } finally {
      isApplyingRemoteParts = false;
    }
  };

  partsMap.observe(observer);

  return {
    destroy() {
      partsMap.unobserve(observer);
      failedParts.clear();
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Full-replace a part's data with remote data.
 * Clears all existing keys, then copies from source.
 */
export function replacePartData(target: unknown, source: unknown): void {
  if (!target || typeof target !== 'object' || !source || typeof source !== 'object') return;

  const tgt = target as Record<string, unknown>;
  const src = source as Record<string, unknown>;

  // Remove keys not in source
  for (const key of Object.keys(tgt)) {
    if (!(key in src)) delete tgt[key];
  }
  // Copy all keys from source
  for (const [key, value] of Object.entries(src)) {
    tgt[key] = value;
  }
}

/**
 * For header/footer parts, resolve the relationship ID and ensure a descriptor
 * is registered so that `afterCommit` correctly populates `converter.headers/footers`.
 *
 * Returns the sectionId (rId) to set on the operation, or undefined for
 * non-header/footer parts.
 */
function ensureHeaderFooterSectionId(partId: PartId, relsData: unknown | null, editor: Editor): string | undefined {
  if (!isHeaderFooterPartId(partId)) return undefined;

  const rId = resolveHeaderFooterRId(partId, relsData, editor);
  const sectionId = rId ?? partId;
  ensureHeaderFooterDescriptor(partId, sectionId);
  return sectionId;
}

function trackFailure(failedParts: Map<string, FailedPartEntry>, key: string, partsMap: Y.Map<unknown>): void {
  const yValue = partsMap.get(key);
  if (yValue instanceof Y.Map) {
    const v = yValue.get('v');
    const clientId = yValue.get('clientId');
    if (typeof v === 'number' && typeof clientId === 'number') {
      failedParts.set(key, { v, clientId });
    }
  }
}
