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
import { invalidateConverterCachesForPath } from '../../../core/super-converter/custom-xml-parts.js';

const CUSTOM_XML_PROPS_RELATIONSHIP_TYPE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXmlProps';

// ---------------------------------------------------------------------------
// Consumer State
// ---------------------------------------------------------------------------

export interface PartConsumer {
  /** Tear down the Yjs observer. */
  destroy(): void;
}

export type ConverterWithCustomXmlTombstones = {
  convertedXml?: Record<string, unknown>;
  removedCustomXmlPaths?: Set<string>;
  bibliographyPart?: { partPath?: string | null } | null;
};

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
    const removedCustomXmlPaths = new Set<string>();
    const writtenCustomXmlPaths = new Set<string>();

    // Decode rels from Yjs for header/footer rId resolution
    const relsData = decodeYjsToEnvelope(partsMap.get('word/_rels/document.xml.rels'))?.data ?? null;

    event.changes.keys.forEach((change, key) => {
      if (EXCLUDED_PART_IDS.has(key)) return;

      const partId = key as PartId;

      // For header/footer parts, ensure descriptor is registered with correct rId
      const sectionId = ensureHeaderFooterSectionId(partId, relsData, editor);

      try {
        if (change.action === 'delete') {
          if (isCustomXmlTombstonePath(editor, key)) {
            removedCustomXmlPaths.add(key);
          }
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
        const envelope = decodeYjsToEnvelope(partsMap.get(key));
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
        if (isCustomXmlPartPath(key)) {
          writtenCustomXmlPaths.add(key);
        }

        // Clear from failed on successful build
        failedParts.delete(key);
      } catch (err) {
        console.error(`[part-sync] Error processing remote part "${key}":`, err);
        trackFailure(failedParts, key, partsMap);
      }
    });

    if (operations.length === 0) {
      applyCustomXmlTombstoneChanges(editor, removedCustomXmlPaths, writtenCustomXmlPaths);
      return;
    }

    isApplyingRemoteParts = true;
    try {
      mutateParts({ editor, source: SOURCE_COLLAB_REMOTE_PARTS, operations });
      applyCustomXmlTombstoneChanges(editor, removedCustomXmlPaths, writtenCustomXmlPaths);
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

export function getCustomXmlTombstoneConverter(editor: Editor): ConverterWithCustomXmlTombstones | undefined {
  return (editor as unknown as { converter?: ConverterWithCustomXmlTombstones }).converter;
}

export function isCustomXmlPartPath(path: string): boolean {
  // Case-insensitive to stay consistent with the tombstone predicates
  // (isCustomXmlTombstonePath) which already match /i.
  return /^customxml\//i.test(path);
}

export function isCustomXmlTombstonePath(editor: Editor, path: string): boolean {
  return (
    /^customXml\/item\d+\.xml$/i.test(path) ||
    /^customXml\/itemProps\d+\.xml$/i.test(path) ||
    /^customXml\/_rels\/item\d+\.xml\.rels$/i.test(path) ||
    isLinkedCustomXmlPropsPath(editor, path)
  );
}

function isLinkedCustomXmlPropsPath(editor: Editor, path: string): boolean {
  if (!isCustomXmlPartPath(path) || !/\.xml$/i.test(path)) return false;

  const convertedXml = getCustomXmlTombstoneConverter(editor)?.convertedXml;
  if (!convertedXml) return false;

  for (const [relsPath, relsDoc] of Object.entries(convertedXml)) {
    if (!/^customXml\/_rels\/item\d+\.xml\.rels$/i.test(relsPath)) continue;
    for (const target of getCustomXmlPropsTargets(relsDoc)) {
      if (target === path) return true;
    }
  }

  return false;
}

function getCustomXmlPropsTargets(relsDoc: unknown): string[] {
  const relationshipsRoot = getElements(relsDoc).find((element) => getLocalName(getName(element)) === 'Relationships');
  if (!relationshipsRoot) return [];

  return getElements(relationshipsRoot)
    .map((relationship) => {
      const attributes = getAttributes(relationship);
      if (attributes.Type !== CUSTOM_XML_PROPS_RELATIONSHIP_TYPE) return null;
      return resolveCustomXmlRelationshipTarget(attributes.Target);
    })
    .filter((target): target is string => typeof target === 'string');
}

function getElements(value: unknown): unknown[] {
  if (!value || typeof value !== 'object') return [];
  const elements = (value as { elements?: unknown }).elements;
  return Array.isArray(elements) ? elements : [];
}

function getName(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const name = (value as { name?: unknown }).name;
  return typeof name === 'string' ? name : '';
}

function getAttributes(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  const attributes = (value as { attributes?: unknown }).attributes;
  return attributes && typeof attributes === 'object' && !Array.isArray(attributes)
    ? (attributes as Record<string, unknown>)
    : {};
}

function getLocalName(name: string): string {
  const separatorIndex = name.indexOf(':');
  return separatorIndex >= 0 ? name.slice(separatorIndex + 1) : name;
}

function resolveCustomXmlRelationshipTarget(target: unknown): string | null {
  if (typeof target !== 'string' || target.length === 0 || target.includes('://')) return null;
  if (target.startsWith('/')) return target.slice(1);

  const resolved: string[] = [];
  for (const segment of `customXml/${target}`.split('/')) {
    if (segment === '..') {
      resolved.pop();
    } else if (segment !== '.' && segment !== '') {
      resolved.push(segment);
    }
  }

  return resolved.join('/');
}

function applyCustomXmlTombstoneChanges(editor: Editor, removedPaths: Set<string>, writtenPaths: Set<string>): void {
  const converter = getCustomXmlTombstoneConverter(editor);
  if (!converter) return;

  for (const path of writtenPaths) {
    // A remote write (create/update/recreate) supersedes any tombstone and also
    // makes the local bibliography cache stale: if the written part is the one
    // cached in converter.bibliographyPart, the next export would rebuild from
    // the stale cache and overwrite the received content. Invalidate so the
    // export reads the freshly received part instead.
    if (converter.removedCustomXmlPaths instanceof Set) {
      converter.removedCustomXmlPaths.delete(path);
    }
    invalidateConverterCachesForPath(converter, path);
  }

  if (removedPaths.size === 0) return;
  for (const path of removedPaths) {
    recordCustomXmlTombstone(converter, path);
  }
}

/**
 * Record a custom-XML tombstone on the converter and invalidate any converter
 * cache keyed on the removed part. Shared by the live-delete observer and the
 * late-joiner hydration prune so both paths tombstone identically and both
 * clear `converter.bibliographyPart` when the deleted part is the bibliography
 * storage part (otherwise `syncBibliographyPartToPackage` would resurrect it
 * from the stale cache on the next export).
 */
export function recordCustomXmlTombstone(converter: ConverterWithCustomXmlTombstones, path: string): void {
  if (!(converter.removedCustomXmlPaths instanceof Set)) {
    converter.removedCustomXmlPaths = new Set<string>();
  }
  converter.removedCustomXmlPaths.add(path);
  invalidateConverterCachesForPath(converter, path);
}

function trackFailure(failedParts: Map<string, FailedPartEntry>, key: string, partsMap: Y.Map<unknown>): void {
  const envelope = decodeYjsToEnvelope(partsMap.get(key));
  if (envelope) {
    failedParts.set(key, { v: envelope.v, clientId: envelope.clientId });
  }
}
