import { resolveOpcTargetPath } from '../../../core/super-converter/helpers.js';
import { toRelsPathForPart } from '../part-paths';
import type { HeaderFooterKind, HeaderFooterState } from './header-footer-diffing';

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
  bodyClosure: Record<string, PartSnapshot>;
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
 * Part fidelity currently depends on `convertedXml` for XML parts and the
 * editor media stores for binary targets.
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
 * Captures the body and header/footer part closures needed for coarse
 * parts-aware replay.
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

  return {
    bodyClosure: collectBodyClosure(convertedXml, mediaStore),
    headerFooterClosures,
  };
}

/**
 * Computes a coarse parts diff for body and header/footer changes.
 *
 * Body changes currently use a conservative strategy: any document diff
 * causes the captured body relationship closure to be compared and emitted.
 */
export function diffParts(
  previousPartsState: PartsState | null | undefined,
  nextPartsState: PartsState | null | undefined,
): PartsDiff | null {
  if (!previousPartsState || !nextPartsState) {
    return null;
  }

  const upserts: Record<string, PartSnapshot> = {};
  const deletes = new Set<string>();
  const nextReachablePartPaths = collectReachablePartPaths(nextPartsState);
  const previousOwnedParts = collectOwnedParts(previousPartsState);
  const nextOwnedParts = collectOwnedParts(nextPartsState);

  for (const [partPath, snapshot] of Object.entries(nextOwnedParts)) {
    const previous = previousOwnedParts[partPath];
    if (!previous || !partSnapshotsEqual(previous, snapshot)) {
      upserts[partPath] = structuredClone(snapshot);
    }
  }

  for (const partPath of Object.keys(previousOwnedParts)) {
    if (!(partPath in nextOwnedParts) && !(partPath in upserts) && !nextReachablePartPaths.has(partPath)) {
      deletes.add(partPath);
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

function collectOwnedParts(partsState: PartsState): Record<string, PartSnapshot> {
  const owned: Record<string, PartSnapshot> = {};

  addOwnedPartsFromClosure(owned, partsState.bodyClosure);

  for (const closure of Object.values(partsState.headerFooterClosures)) {
    addOwnedPartsFromClosure(owned, closure.parts, closure.partPath);
  }

  return owned;
}

function addOwnedPartsFromClosure(
  target: Record<string, PartSnapshot>,
  closure: Record<string, PartSnapshot>,
  semanticRootPath?: string,
): void {
  for (const [partPath, snapshot] of Object.entries(closure)) {
    if (isSemanticOwnedPart(partPath, semanticRootPath)) {
      continue;
    }
    target[partPath] = snapshot;
  }
}

function isSemanticOwnedPart(partPath: string, headerFooterRootPath?: string): boolean {
  if (partPath === 'word/document.xml' || partPath === 'word/styles.xml' || partPath === 'word/numbering.xml') {
    return true;
  }
  if (headerFooterRootPath && partPath === headerFooterRootPath) {
    return true;
  }
  return false;
}

function collectReachablePartPaths(partsState: PartsState | null | undefined): Set<string> {
  const reachable = new Set<string>();

  for (const partPath of Object.keys(partsState?.bodyClosure ?? {})) {
    reachable.add(partPath);
  }

  for (const closure of Object.values(partsState?.headerFooterClosures ?? {})) {
    for (const partPath of Object.keys(closure.parts)) {
      reachable.add(partPath);
    }
  }

  return reachable;
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

function collectBodyClosure(
  convertedXml: Record<string, unknown>,
  mediaStore: Record<string, unknown>,
): Record<string, PartSnapshot> {
  const relsPart = convertedXml[DOCUMENT_RELS_PATH];
  if (!relsPart || typeof relsPart !== 'object') {
    return {};
  }

  const snapshots: Record<string, PartSnapshot> = {
    [DOCUMENT_RELS_PATH]: {
      kind: 'xml',
      content: structuredClone(relsPart),
    },
  };
  const visited = new Set<string>([DOCUMENT_RELS_PATH]);

  for (const relationship of readRelationships(relsPart)) {
    const type = String(relationship.attributes?.Type ?? '');
    if (!shouldCaptureBodyRelationship(type)) {
      continue;
    }
    if (String(relationship.attributes?.TargetMode ?? '') === 'External') {
      continue;
    }
    const target = String(relationship.attributes?.Target ?? '');
    const targetPath = resolveOpcTargetPath(target, 'word');
    if (!targetPath) {
      continue;
    }
    collectPartAndDependencies(targetPath, convertedXml, mediaStore, snapshots, visited);
  }

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

function shouldCaptureBodyRelationship(type: string): boolean {
  return !BODY_RELATIONSHIP_EXCLUSIONS.has(type);
}

function partSnapshotsEqual(a: PartSnapshot, b: PartSnapshot): boolean {
  return a.kind === b.kind && JSON.stringify(a.content) === JSON.stringify(b.content);
}

const BODY_RELATIONSHIP_EXCLUSIONS = new Set([
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles',
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering',
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings',
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme',
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/webSettings',
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable',
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header',
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer',
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments',
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes',
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes',
  'http://schemas.microsoft.com/office/2011/relationships/commentsExtended',
  'http://schemas.microsoft.com/office/2016/09/relationships/commentsIds',
  'http://schemas.microsoft.com/office/2018/08/relationships/commentsExtensible',
]);
