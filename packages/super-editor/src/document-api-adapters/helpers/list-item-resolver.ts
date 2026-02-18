import { ListHelpers } from '@helpers/list-numbering-helpers.js';
import type { Editor } from '../../core/Editor.js';
import type { BlockNodeAddress, ListItemAddress, ListItemInfo, ListKind, ListsListQuery } from '@superdoc/document-api';
import { DocumentApiAdapterError } from '../errors.js';
import { getBlockIndex } from './index-cache.js';
import type { BlockCandidate, BlockIndex } from './node-address-resolver.js';
import { toFiniteNumber } from './value-utils.js';

export type ListItemProjection = {
  candidate: BlockCandidate;
  address: ListItemAddress;
  numId?: number;
  level?: number;
  marker?: string;
  path?: number[];
  ordinal?: number;
  kind?: ListKind;
  text?: string;
};

function toPath(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const parsed = value.map((entry) => toFiniteNumber(entry)).filter((entry): entry is number => entry != null);
  return parsed.length > 0 ? parsed : undefined;
}

function getNumberingProperties(node: BlockCandidate['node']): { numId?: number; level?: number } {
  const attrs = (node.attrs ?? {}) as {
    paragraphProperties?: { numberingProperties?: { numId?: unknown; ilvl?: unknown } | null } | null;
    numberingProperties?: { numId?: unknown; ilvl?: unknown } | null;
  };

  const paragraphNumbering = attrs.paragraphProperties?.numberingProperties ?? undefined;
  const fallbackNumbering = attrs.numberingProperties ?? undefined;
  const numId = toFiniteNumber(paragraphNumbering?.numId ?? fallbackNumbering?.numId);
  const level = toFiniteNumber(paragraphNumbering?.ilvl ?? fallbackNumbering?.ilvl);
  return { numId, level };
}

function deriveListKindFromDefinitions(editor: Editor, numId?: number, level?: number): ListKind | undefined {
  if (numId == null || level == null || !editor.converter) return undefined;
  try {
    const details = ListHelpers.getListDefinitionDetails({ numId, level, editor });
    const numberingType = typeof details?.listNumberingType === 'string' ? details.listNumberingType : undefined;
    if (numberingType === 'bullet') return 'bullet';
    if (typeof numberingType === 'string' && numberingType.length > 0) return 'ordered';
    return undefined;
  } catch {
    return undefined;
  }
}

function deriveListKind(
  editor: Editor,
  candidate: BlockCandidate,
  numId?: number,
  level?: number,
): ListKind | undefined {
  const listRendering = (candidate.node.attrs ?? {}) as {
    listRendering?: {
      numberingType?: unknown;
    } | null;
  };
  const numberingType = listRendering.listRendering?.numberingType;
  if (numberingType === 'bullet') return 'bullet';
  if (typeof numberingType === 'string' && numberingType.length > 0) return 'ordered';
  return deriveListKindFromDefinitions(editor, numId, level);
}

function getListText(candidate: BlockCandidate): string | undefined {
  const text = (candidate.node as { textContent?: unknown }).textContent;
  return typeof text === 'string' ? text : undefined;
}

export function projectListItemCandidate(editor: Editor, candidate: BlockCandidate): ListItemProjection {
  const attrs = (candidate.node.attrs ?? {}) as {
    listRendering?: {
      markerText?: unknown;
      path?: unknown;
    } | null;
  };

  const { numId, level } = getNumberingProperties(candidate.node);
  const path = toPath(attrs.listRendering?.path);
  const ordinal = path?.length ? path[path.length - 1] : undefined;
  const marker = typeof attrs.listRendering?.markerText === 'string' ? attrs.listRendering.markerText : undefined;

  return {
    candidate,
    address: {
      kind: 'block',
      nodeType: 'listItem',
      nodeId: candidate.nodeId,
    },
    numId,
    level,
    kind: deriveListKind(editor, candidate, numId, level),
    marker,
    path,
    ordinal,
    text: getListText(candidate),
  };
}

export function listItemProjectionToInfo(projection: ListItemProjection): ListItemInfo {
  return {
    address: projection.address,
    marker: projection.marker,
    ordinal: projection.ordinal,
    path: projection.path,
    level: projection.level,
    kind: projection.kind,
    text: projection.text,
  };
}

function matchesListQuery(projection: ListItemProjection, query?: ListsListQuery): boolean {
  if (!query) return true;
  if (query.kind && projection.kind !== query.kind) return false;
  if (query.level != null && projection.level !== query.level) return false;
  if (query.ordinal != null && projection.ordinal !== query.ordinal) return false;
  return true;
}

export function resolveBlockScopeRange(
  index: BlockIndex,
  within?: BlockNodeAddress,
): { start: number; end: number } | undefined {
  if (!within) return undefined;

  const matches = index.candidates.filter(
    (candidate) => candidate.nodeType === within.nodeType && candidate.nodeId === within.nodeId,
  );
  if (matches.length === 0) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', 'List scope block was not found.', {
      within,
    });
  }
  if (matches.length > 1) {
    throw new DocumentApiAdapterError('INVALID_TARGET', 'List scope block id is ambiguous.', {
      within,
      count: matches.length,
    });
  }

  return {
    start: matches[0]!.pos,
    end: matches[0]!.end,
  };
}

function isWithinScope(candidate: BlockCandidate, scope: { start: number; end: number } | undefined): boolean {
  if (!scope) return true;
  return candidate.pos >= scope.start && candidate.end <= scope.end;
}

function listItemCandidatesInScope(
  index: BlockIndex,
  scope: { start: number; end: number } | undefined,
): BlockCandidate[] {
  return index.candidates.filter((candidate) => candidate.nodeType === 'listItem' && isWithinScope(candidate, scope));
}

export function buildListItemIndex(editor: Editor): { index: BlockIndex; items: ListItemProjection[] } {
  const index = getBlockIndex(editor);
  const items = index.candidates
    .filter((candidate) => candidate.nodeType === 'listItem')
    .map((candidate) => projectListItemCandidate(editor, candidate));
  return { index, items };
}

export function listListItems(
  editor: Editor,
  query?: ListsListQuery,
): { matches: ListItemAddress[]; total: number; items: ListItemInfo[] } {
  if (query?.within && query.within.kind !== 'block') {
    throw new DocumentApiAdapterError('INVALID_TARGET', 'lists.list only supports block within scopes.', {
      within: query.within,
    });
  }

  const index = getBlockIndex(editor);
  const scope = resolveBlockScopeRange(index, query?.within as BlockNodeAddress | undefined);
  const candidates = listItemCandidatesInScope(index, scope);
  const safeOffset = Math.max(0, query?.offset ?? 0);
  const safeLimit = Math.max(0, query?.limit ?? Number.POSITIVE_INFINITY);
  const pageEnd = safeOffset + safeLimit;

  let total = 0;
  const infos: ListItemInfo[] = [];
  const matches: ListItemAddress[] = [];

  for (const candidate of candidates) {
    const projection = projectListItemCandidate(editor, candidate);
    if (!matchesListQuery(projection, query)) continue;

    const currentIndex = total;
    total += 1;
    if (currentIndex < safeOffset || currentIndex >= pageEnd) continue;

    const info = listItemProjectionToInfo(projection);
    infos.push(info);
    matches.push(info.address);
  }

  return {
    matches,
    total,
    items: infos,
  };
}

export function resolveListItem(editor: Editor, address: ListItemAddress): ListItemProjection {
  const index = getBlockIndex(editor);
  const matches = index.candidates.filter(
    (candidate) => candidate.nodeType === 'listItem' && candidate.nodeId === address.nodeId,
  );

  if (matches.length === 0) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', 'List item target was not found.', {
      target: address,
    });
  }

  if (matches.length > 1) {
    throw new DocumentApiAdapterError('INVALID_TARGET', 'List item target id is ambiguous.', {
      target: address,
      count: matches.length,
    });
  }

  return projectListItemCandidate(editor, matches[0]!);
}
