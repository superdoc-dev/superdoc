/**
 * Citation resolver — handles three address types:
 * - CitationAddress (inline citation field)
 * - CitationSourceAddress (entity from converter bibliography state)
 * - BibliographyAddress (block bibliography node)
 */

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Editor } from '../../core/Editor.js';
import type {
  CitationAddress,
  CitationSourceAddress,
  BibliographyAddress,
  CitationDomain,
  CitationSourceDomain,
  CitationInfo,
  CitationSourceInfo,
  BibliographyInfo,
  DiscoveryItem,
} from '@superdoc/document-api';
import { buildDiscoveryItem, buildResolvedHandle } from '@superdoc/document-api';
import { DocumentApiAdapterError } from '../errors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResolvedCitation {
  node: ProseMirrorNode;
  pos: number;
  sourceIds: string[];
  locale: string | null;
  resolvedText: string;
  blockId: string;
}

export interface ResolvedBibliography {
  node: ProseMirrorNode;
  pos: number;
  nodeId: string;
}

// ---------------------------------------------------------------------------
// Citation (inline) resolution
// ---------------------------------------------------------------------------

export function findAllCitations(doc: ProseMirrorNode): ResolvedCitation[] {
  const results: ResolvedCitation[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'citation') {
      results.push({
        node,
        pos,
        sourceIds: (node.attrs?.sourceIds as string[]) ?? [],
        locale: (node.attrs?.locale as string) ?? null,
        resolvedText: (node.attrs?.resolvedText as string) ?? '',
        blockId: resolveParentBlockId(doc, pos),
      });
    }
    return true;
  });
  return results;
}

export function resolveCitationTarget(doc: ProseMirrorNode, target: CitationAddress): ResolvedCitation {
  const all = findAllCitations(doc);
  const found = all.find((c) => {
    if (target.anchor?.start?.blockId && c.blockId !== target.anchor.start.blockId) return false;
    if (target.anchor?.start?.offset !== undefined) {
      const resolved = doc.resolve(c.pos);
      const offset = c.pos - resolved.start(resolved.depth);
      if (offset !== target.anchor.start.offset) return false;
    }
    return true;
  });

  if (!found) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', 'Citation not found at the specified anchor.');
  }
  return found;
}

export function extractCitationInfo(doc: ProseMirrorNode, resolved: ResolvedCitation): CitationInfo {
  const instruction = (resolved.node.attrs?.instruction as string) ?? '';
  return {
    address: buildCitationAddress(doc, resolved),
    sourceIds: resolved.sourceIds,
    displayText: resolved.resolvedText,
    instruction,
  };
}

export function buildCitationDiscoveryItem(
  doc: ProseMirrorNode,
  resolved: ResolvedCitation,
  evaluatedRevision: string,
): DiscoveryItem<CitationDomain> {
  const address = buildCitationAddress(doc, resolved);
  const instruction = (resolved.node.attrs?.instruction as string) ?? '';
  const domain: CitationDomain = {
    address,
    sourceIds: resolved.sourceIds,
    displayText: resolved.resolvedText,
    instruction,
  };

  const ref = `${resolved.blockId}:${resolved.pos}`;
  const handle = buildResolvedHandle(ref, 'ephemeral', 'node');
  const id = `citation:${ref}:${evaluatedRevision}`;
  return buildDiscoveryItem(id, handle, domain);
}

// ---------------------------------------------------------------------------
// Bibliography (block) resolution
// ---------------------------------------------------------------------------

export function findAllBibliographies(doc: ProseMirrorNode): ResolvedBibliography[] {
  const results: ResolvedBibliography[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'bibliography') {
      const nodeId = (node.attrs?.sdBlockId as string) ?? `bibliography-${pos}`;
      results.push({ node, pos, nodeId });
      return false;
    }
    return true;
  });
  return results;
}

export function resolveBibliographyTarget(doc: ProseMirrorNode, target: BibliographyAddress): ResolvedBibliography {
  const all = findAllBibliographies(doc);
  const found = all.find((b) => b.nodeId === target.nodeId);
  if (!found) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', `Bibliography with nodeId "${target.nodeId}" not found.`);
  }
  return found;
}

export function extractBibliographyInfo(resolved: ResolvedBibliography): BibliographyInfo {
  const instruction = (resolved.node.attrs?.instruction as string) ?? '';
  const style = (resolved.node.attrs?.style as string) ?? '';
  return {
    address: { kind: 'block', nodeType: 'bibliography', nodeId: resolved.nodeId },
    style,
    sourceCount: resolved.node.childCount,
    instruction,
  };
}

export function buildBibliographyDiscoveryItem(
  resolved: ResolvedBibliography,
  evaluatedRevision: string,
): DiscoveryItem<BibliographyInfo> {
  const address: BibliographyAddress = {
    kind: 'block',
    nodeType: 'bibliography',
    nodeId: resolved.nodeId,
  };
  const instruction = (resolved.node.attrs?.instruction as string) ?? '';
  const style = (resolved.node.attrs?.style as string) ?? '';
  const domain: BibliographyInfo = {
    address,
    style,
    sourceCount: resolved.node.childCount,
    instruction,
  };

  const handle = buildResolvedHandle(resolved.nodeId, 'stable', 'node');
  const id = `bibliography:${resolved.nodeId}:${evaluatedRevision}`;
  return buildDiscoveryItem(id, handle, domain);
}

// ---------------------------------------------------------------------------
// Source resolution (from converter state)
// ---------------------------------------------------------------------------

export interface CitationSourceRecord {
  tag: string;
  type: string;
  fields: Record<string, unknown>;
}

interface BibliographyPartState {
  sources?: CitationSourceRecord[];
}

export function getSourcesFromConverter(editor: Editor): CitationSourceRecord[] {
  const converter = (editor as unknown as { converter?: { bibliographyPart?: BibliographyPartState } }).converter;
  if (!converter) return [];
  converter.bibliographyPart ??= {};
  converter.bibliographyPart.sources ??= [];
  return converter.bibliographyPart.sources;
}

export function resolveSourceTarget(editor: Editor, target: CitationSourceAddress): CitationSourceRecord {
  const sources = getSourcesFromConverter(editor);
  const found = sources.find((s) => s.tag === target.sourceId);
  if (!found) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', `Citation source with tag "${target.sourceId}" not found.`);
  }
  return found;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveParentBlockId(doc: ProseMirrorNode, pos: number): string {
  const resolved = doc.resolve(pos);
  for (let depth = resolved.depth; depth >= 0; depth--) {
    const node = resolved.node(depth);
    const blockId = node.attrs?.sdBlockId as string | undefined;
    if (blockId) return blockId;
  }
  return '';
}

function buildCitationAddress(doc: ProseMirrorNode, resolved: ResolvedCitation): CitationAddress {
  const r = doc.resolve(resolved.pos);
  const offset = resolved.pos - r.start(r.depth);
  return {
    kind: 'inline',
    nodeType: 'citation',
    anchor: {
      start: { blockId: resolved.blockId, offset },
      end: { blockId: resolved.blockId, offset: offset + resolved.node.nodeSize },
    },
  };
}
