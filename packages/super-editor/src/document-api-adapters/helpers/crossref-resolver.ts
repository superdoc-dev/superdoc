/**
 * Cross-reference resolver — finds, resolves, and extracts info from
 * crossReference nodes (REF, NOTEREF, STYLEREF fields).
 */

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Editor } from '../../core/Editor.js';
import type {
  CrossRefAddress,
  CrossRefDomain,
  CrossRefInfo,
  CrossRefTarget,
  CrossRefDisplay,
  DiscoveryItem,
  InlineAnchor,
} from '@superdoc/document-api';
import { buildDiscoveryItem, buildResolvedHandle } from '@superdoc/document-api';
import { DocumentApiAdapterError } from '../errors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResolvedCrossRef {
  node: ProseMirrorNode;
  pos: number;
  instruction: string;
  target: string;
  fieldType: string;
  display: string;
  resolvedText: string;
  blockId: string;
}

// ---------------------------------------------------------------------------
// Node resolution
// ---------------------------------------------------------------------------

export function findAllCrossRefs(doc: ProseMirrorNode): ResolvedCrossRef[] {
  const results: ResolvedCrossRef[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'crossReference') {
      results.push({
        node,
        pos,
        instruction: (node.attrs?.instruction as string) ?? '',
        target: (node.attrs?.target as string) ?? '',
        fieldType: (node.attrs?.fieldType as string) ?? 'REF',
        display: (node.attrs?.display as string) ?? 'content',
        resolvedText: (node.attrs?.resolvedText as string) ?? '',
        blockId: resolveParentBlockId(doc, pos),
      });
    }
    return true;
  });
  return results;
}

export function resolveCrossRefTarget(doc: ProseMirrorNode, target: CrossRefAddress): ResolvedCrossRef {
  const all = findAllCrossRefs(doc);
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
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', 'Cross-reference not found at the specified anchor.');
  }
  return found;
}

// ---------------------------------------------------------------------------
// Info extraction
// ---------------------------------------------------------------------------

export function extractCrossRefInfo(doc: ProseMirrorNode, resolved: ResolvedCrossRef): CrossRefInfo {
  return {
    address: buildCrossRefAddress(doc, resolved),
    instruction: resolved.instruction,
    target: parseTarget(resolved),
    display: parseDisplay(resolved.display),
    resolvedText: resolved.resolvedText,
  };
}

// ---------------------------------------------------------------------------
// Discovery item builder
// ---------------------------------------------------------------------------

export function buildCrossRefDiscoveryItem(
  doc: ProseMirrorNode,
  resolved: ResolvedCrossRef,
  evaluatedRevision: string,
): DiscoveryItem<CrossRefDomain> {
  const address = buildCrossRefAddress(doc, resolved);
  const domain: CrossRefDomain = {
    address,
    instruction: resolved.instruction,
    target: parseTarget(resolved),
    display: parseDisplay(resolved.display),
    resolvedText: resolved.resolvedText,
  };

  const ref = `${resolved.blockId}:${resolved.pos}`;
  const handle = buildResolvedHandle(ref, 'ephemeral', 'node');
  const id = `crossRef:${ref}:${evaluatedRevision}`;
  return buildDiscoveryItem(id, handle, domain);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_DISPLAYS: Set<string> = new Set([
  'content',
  'pageNumber',
  'noteNumber',
  'labelAndNumber',
  'aboveBelow',
  'numberOnly',
  'numberFullContext',
  'styledContent',
  'styledPageNumber',
]);

function parseTarget(resolved: ResolvedCrossRef): CrossRefTarget {
  // REF fields target a bookmark name by default
  if (resolved.fieldType === 'NOTEREF') {
    return { kind: 'note', noteId: resolved.target };
  }
  if (resolved.fieldType === 'STYLEREF') {
    return { kind: 'styledParagraph', styleName: resolved.target };
  }
  // Default: bookmark reference
  return { kind: 'bookmark', name: resolved.target };
}

function parseDisplay(raw: string): CrossRefDisplay {
  if (VALID_DISPLAYS.has(raw)) return raw as CrossRefDisplay;
  return 'content';
}

function resolveParentBlockId(doc: ProseMirrorNode, pos: number): string {
  const resolved = doc.resolve(pos);
  for (let depth = resolved.depth; depth >= 0; depth--) {
    const node = resolved.node(depth);
    const blockId = node.attrs?.sdBlockId as string | undefined;
    if (blockId) return blockId;
  }
  return '';
}

function buildCrossRefAddress(doc: ProseMirrorNode, resolved: ResolvedCrossRef): CrossRefAddress {
  const r = doc.resolve(resolved.pos);
  const offset = resolved.pos - r.start(r.depth);
  return {
    kind: 'inline',
    nodeType: 'crossRef',
    anchor: {
      start: { blockId: resolved.blockId, offset },
      end: { blockId: resolved.blockId, offset: offset + resolved.node.nodeSize },
    },
  };
}
