import { resolveOpcTargetPath } from '../../../core/super-converter/helpers.js';
import type { HeaderFooterKind, HeaderFooterState, HeaderFootersDiff } from './header-footer-diffing';

export interface PartSnapshot {
  kind: 'xml' | 'binary';
  content: unknown;
}

export interface HeaderFooterPartClosure {
  refId: string;
  kind: HeaderFooterKind;
  partPath: string;
  parts: Record<string, PartSnapshot>;
}

export interface PartsState {
  headerFooterClosures: Record<string, HeaderFooterPartClosure>;
}

/**
 * Generic part-level diff payload.
 *
 * This is intentionally coarse-grained: callers can upsert or delete
 * normalized parts without requiring OOXML tree diffs.
 */
export interface PartsDiff {
  upserts: Record<string, PartSnapshot>;
  deletes: string[];
}

/**
 * Minimal editor shape needed to capture part closures.
 *
 * Header/footer part fidelity currently depends on `convertedXml` for XML
 * parts and the editor media stores for binary targets.
 */
export type PartsStateEditor = {
  converter?: {
    convertedXml?: Record<string, unknown>;
  } | null;
  options?: {
    mediaFiles?: Record<string, unknown>;
  };
  storage?: {
    image?: {
      media?: Record<string, unknown>;
    };
  };
};

const DOCUMENT_RELS_PATH = 'word/_rels/document.xml.rels';

/**
 * Captures all package closures reachable from the editor's current
 * header/footer parts.
 */
export function capturePartsState(
  editor: PartsStateEditor,
  headerFooters: HeaderFooterState | null | undefined,
): PartsState {
  const convertedXml = editor.converter?.convertedXml ?? {};
  const mediaStore = getMediaStore(editor);
  const headerFooterClosures: Record<string, HeaderFooterPartClosure> = {};

  for (const part of headerFooters?.parts ?? []) {
    headerFooterClosures[part.refId] = {
      refId: part.refId,
      kind: part.kind,
      partPath: part.partPath,
      parts: collectPartClosure(part.partPath, convertedXml, mediaStore),
    };
  }

  return { headerFooterClosures };
}

/**
 * Computes a parts diff from changed header/footer parts.
 *
 * This first slice scopes parts replay to header/footer roots only.
 */
export function diffParts(
  headerFootersDiff: HeaderFootersDiff | null | undefined,
  previousPartsState: PartsState | null | undefined,
  nextPartsState: PartsState | null | undefined,
): PartsDiff | null {
  if (!headerFootersDiff) {
    return null;
  }

  const upserts: Record<string, PartSnapshot> = {};
  const deletes = new Set<string>();

  for (const part of [...headerFootersDiff.addedParts, ...headerFootersDiff.modifiedParts]) {
    const closure = nextPartsState?.headerFooterClosures?.[part.refId];
    if (!closure) continue;
    for (const [partPath, snapshot] of Object.entries(closure.parts)) {
      upserts[partPath] = structuredClone(snapshot);
      deletes.delete(partPath);
    }
  }

  for (const part of headerFootersDiff.removedParts) {
    const closure = previousPartsState?.headerFooterClosures?.[part.refId];
    if (closure) {
      for (const partPath of Object.keys(closure.parts)) {
        if (!(partPath in upserts)) {
          deletes.add(partPath);
        }
      }
      continue;
    }

    deletes.add(part.partPath);
    const relsPath = toRelsPathForPart(part.partPath);
    if (relsPath) {
      deletes.add(relsPath);
    }
  }

  if (Object.keys(upserts).length === 0 && deletes.size === 0) {
    return null;
  }

  return {
    upserts,
    deletes: [...deletes].sort(),
  };
}

function getMediaStore(editor: PartsStateEditor): Record<string, unknown> {
  return {
    ...(editor.options?.mediaFiles ?? {}),
    ...(editor.storage?.image?.media ?? {}),
  };
}

function collectPartClosure(
  partPath: string,
  convertedXml: Record<string, unknown>,
  mediaStore: Record<string, unknown>,
): Record<string, PartSnapshot> {
  const snapshots: Record<string, PartSnapshot> = {};
  const visited = new Set<string>();
  collectPartAndDependencies(partPath, convertedXml, mediaStore, snapshots, visited);
  return snapshots;
}

function collectPartAndDependencies(
  partPath: string,
  convertedXml: Record<string, unknown>,
  mediaStore: Record<string, unknown>,
  snapshots: Record<string, PartSnapshot>,
  visited: Set<string>,
): void {
  if (visited.has(partPath)) {
    return;
  }
  visited.add(partPath);

  const xmlPart = convertedXml[partPath];
  if (xmlPart && typeof xmlPart === 'object') {
    snapshots[partPath] = {
      kind: 'xml',
      content: structuredClone(xmlPart),
    };
  } else if (partPath in mediaStore) {
    snapshots[partPath] = {
      kind: 'binary',
      content: structuredClone(mediaStore[partPath]),
    };
    return;
  } else {
    return;
  }

  const relsPath = toRelsPathForPart(partPath);
  const relsPart = relsPath ? convertedXml[relsPath] : undefined;
  if (!relsPath || !relsPart || typeof relsPart !== 'object') {
    return;
  }

  snapshots[relsPath] = {
    kind: 'xml',
    content: structuredClone(relsPart),
  };

  const relationships = readRelationships(relsPart);
  const baseDir = getPartBaseDir(partPath);
  for (const relationship of relationships) {
    if (String(relationship.attributes?.TargetMode ?? '') === 'External') {
      continue;
    }
    const target = String(relationship.attributes?.Target ?? '');
    const targetPath = resolveOpcTargetPath(target, baseDir);
    if (!targetPath) {
      continue;
    }
    collectPartAndDependencies(targetPath, convertedXml, mediaStore, snapshots, visited);
  }
}

function readRelationships(relsPart: unknown): Array<{ attributes?: Record<string, string | number | boolean> }> {
  const root = (
    relsPart as { elements?: Array<{ name?: string; elements?: Array<{ attributes?: Record<string, string> }> }> }
  )?.elements?.find((entry) => entry.name === 'Relationships');
  return Array.isArray(root?.elements) ? root.elements : [];
}

function getPartBaseDir(partPath: string): string {
  const lastSlash = partPath.lastIndexOf('/');
  return lastSlash >= 0 ? partPath.slice(0, lastSlash) : '';
}

function toRelsPathForPart(partPath: string): string | null {
  if (partPath === DOCUMENT_RELS_PATH) {
    return null;
  }
  const fileName = partPath.split('/').pop();
  if (!fileName) {
    return null;
  }
  return `word/_rels/${fileName}.rels`;
}
