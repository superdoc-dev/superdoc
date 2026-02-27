/**
 * TOC node resolver — finds, resolves, and extracts info from tableOfContents nodes.
 */

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { TocAddress, TocDomain, DiscoveryItem, TocInfo } from '@superdoc/document-api';
import { buildDiscoveryItem, buildResolvedHandle } from '@superdoc/document-api';
import { parseTocInstruction } from '../../core/super-converter/field-references/shared/toc-switches.js';
import { DocumentApiAdapterError } from '../errors.js';

// ---------------------------------------------------------------------------
// Node resolution
// ---------------------------------------------------------------------------

export interface ResolvedTocNode {
  node: ProseMirrorNode;
  pos: number;
  /** Stable public node id used by doc-api addresses and discovery handles. */
  nodeId: string;
  /** Internal editor command id (sdBlockId) when available. */
  commandNodeId?: string;
}

function stableHash(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function fallbackTocNodeId(node: ProseMirrorNode, pos: number): string {
  const instruction = typeof node.attrs?.instruction === 'string' ? node.attrs.instruction : '';
  return `toc-auto-${stableHash(`${pos}:${instruction}`)}`;
}

/**
 * Finds all tableOfContents nodes in document order.
 */
export function findAllTocNodes(doc: ProseMirrorNode): ResolvedTocNode[] {
  const results: ResolvedTocNode[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'tableOfContents') {
      const sdBlockId = node.attrs?.sdBlockId as string | undefined;
      // Public TOC IDs must survive independent document loads in separate CLI
      // invocations. sdBlockId is regenerated for imported block nodes, so use a
      // deterministic fallback for the public address and keep sdBlockId as a
      // command-only alias.
      const nodeId = fallbackTocNodeId(node, pos);
      const commandNodeId = sdBlockId;
      results.push({ node, pos, nodeId, commandNodeId });
      return false; // don't descend into TOC children
    }
    return true;
  });
  return results;
}

/**
 * Resolves a TocAddress to its ProseMirror node and position.
 * @throws DocumentApiAdapterError with code TARGET_NOT_FOUND if not found.
 */
export function resolveTocTarget(doc: ProseMirrorNode, target: TocAddress): ResolvedTocNode {
  const all = findAllTocNodes(doc);
  const found = all.find((t) => t.nodeId === target.nodeId || t.commandNodeId === target.nodeId);
  if (!found) {
    throw new DocumentApiAdapterError(
      'TARGET_NOT_FOUND',
      `Table of contents with nodeId "${target.nodeId}" not found.`,
    );
  }
  return found;
}

// ---------------------------------------------------------------------------
// Info extraction
// ---------------------------------------------------------------------------

export function extractTocInfo(node: ProseMirrorNode): TocInfo {
  const instruction: string = node.attrs?.instruction ?? '';
  const config = parseTocInstruction(instruction);

  return {
    nodeType: 'tableOfContents',
    kind: 'block',
    properties: {
      instruction,
      sourceConfig: config.source,
      displayConfig: config.display,
      preservedSwitches: config.preserved,
      entryCount: node.childCount,
    },
  };
}

// ---------------------------------------------------------------------------
// Discovery item builder
// ---------------------------------------------------------------------------

export function buildTocDiscoveryItem(resolved: ResolvedTocNode, evaluatedRevision: string): DiscoveryItem<TocDomain> {
  const instruction: string = resolved.node.attrs?.instruction ?? '';
  const config = parseTocInstruction(instruction);

  const address: TocAddress = {
    kind: 'block',
    nodeType: 'tableOfContents',
    nodeId: resolved.nodeId,
  };

  const handle = buildResolvedHandle(resolved.nodeId, 'stable', 'tableOfContents');

  const domain: TocDomain = {
    address,
    instruction,
    sourceConfig: config.source,
    displayConfig: config.display,
    preserved: config.preserved,
    entryCount: resolved.node.childCount,
  };

  const id = `toc:${resolved.nodeId}:${evaluatedRevision}`;
  return buildDiscoveryItem(id, handle, domain);
}
