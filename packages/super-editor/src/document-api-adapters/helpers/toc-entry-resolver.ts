/**
 * TC entry resolver — finds, resolves, and extracts info from tableOfContentsEntry nodes.
 *
 * Mirrors the toc-resolver.ts pattern but operates on inline TC field nodes
 * rather than block-level TOC nodes.
 */

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Editor } from '../../core/Editor.js';
import type { TocEntryAddress, TocEntryDomain, DiscoveryItem, TocEntryInfo } from '@superdoc/document-api';
import { buildDiscoveryItem, buildResolvedHandle } from '@superdoc/document-api';
import { parseTcInstruction } from '../../core/super-converter/field-references/shared/tc-switches.js';
import { DocumentApiAdapterError } from '../errors.js';
import { resolvePublicTcEntryNodeId } from './toc-entry-node-id.js';
import { buildBlockIndex, findBlockByNodeIdOnly } from './node-address-resolver.js';

// ---------------------------------------------------------------------------
// Resolved TC entry node
// ---------------------------------------------------------------------------

export interface ResolvedTcEntryNode {
  node: ProseMirrorNode;
  pos: number;
  /** Deterministic public node ID (FNV-1a hash of position + instruction). */
  nodeId: string;
  /** sdBlockId of the paragraph containing this TC field. */
  containingParagraphSdBlockId?: string;
}

// ---------------------------------------------------------------------------
// Node discovery
// ---------------------------------------------------------------------------

/**
 * Finds all tableOfContentsEntry nodes in document order.
 *
 * Tracks the containing paragraph's sdBlockId for each TC field so that
 * callers can anchor page-number lookups to block-level IDs.
 */
export function findAllTcEntryNodes(doc: ProseMirrorNode): ResolvedTcEntryNode[] {
  const results: ResolvedTcEntryNode[] = [];
  let currentParagraphSdBlockId: string | undefined;

  doc.descendants((node, pos) => {
    // Skip TOC nodes — TC entries inside a TOC are materialized content, not source fields
    if (node.type.name === 'tableOfContents') return false;

    if (node.type.name === 'paragraph') {
      const attrs = node.attrs as Record<string, unknown> | undefined;
      currentParagraphSdBlockId = (attrs?.sdBlockId ?? attrs?.paraId) as string | undefined;
      return true;
    }

    if (node.type.name === 'tableOfContentsEntry') {
      const nodeId = resolvePublicTcEntryNodeId(node, pos);
      results.push({ node, pos, nodeId, containingParagraphSdBlockId: currentParagraphSdBlockId });
      return false;
    }

    return true;
  });

  return results;
}

// ---------------------------------------------------------------------------
// Target resolution
// ---------------------------------------------------------------------------

/**
 * Resolves a TocEntryAddress to its ProseMirror node and position.
 *
 * @throws DocumentApiAdapterError with code TARGET_NOT_FOUND if not found.
 */
export function resolveTcEntryTarget(doc: ProseMirrorNode, target: TocEntryAddress): ResolvedTcEntryNode {
  const all = findAllTcEntryNodes(doc);
  const found = all.find((entry) => entry.nodeId === target.nodeId);
  if (!found) {
    throw new DocumentApiAdapterError(
      'TARGET_NOT_FOUND',
      `Table of contents entry with nodeId "${target.nodeId}" not found.`,
    );
  }
  return found;
}

// ---------------------------------------------------------------------------
// Paragraph resolution (for toc.markEntry insertion target)
// ---------------------------------------------------------------------------

interface ResolvedParagraph {
  node: ProseMirrorNode;
  pos: number;
  sdBlockId: string;
}

/**
 * Finds a paragraph node by its sdBlockId.
 *
 * @throws DocumentApiAdapterError with code TARGET_NOT_FOUND if no paragraph matches.
 */
export function findParagraphBySdBlockId(doc: ProseMirrorNode, sdBlockId: string, editor?: Editor): ResolvedParagraph {
  let found: ResolvedParagraph | undefined;

  doc.descendants((node, pos) => {
    if (found) return false;

    // Skip TOC nodes — don't insert TC fields inside TOC materialized content
    if (node.type.name === 'tableOfContents') return false;

    if (node.type.name === 'paragraph') {
      const attrs = node.attrs as Record<string, unknown> | undefined;
      const nodeId = (attrs?.sdBlockId ?? attrs?.paraId) as string | undefined;
      if (nodeId === sdBlockId) {
        found = { node, pos, sdBlockId };
        return false;
      }
    }

    return true;
  });

  if (!found) {
    if (editor) {
      try {
        const block = findBlockByNodeIdOnly(buildBlockIndex(editor), sdBlockId);
        if (block.node.type.name === 'paragraph') {
          return { node: block.node, pos: block.pos, sdBlockId };
        }
      } catch {
        // Ignore and throw canonical TARGET_NOT_FOUND below.
      }
    }
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', `Paragraph with sdBlockId "${sdBlockId}" not found.`);
  }

  return found;
}

// ---------------------------------------------------------------------------
// Info extraction
// ---------------------------------------------------------------------------

/**
 * Extracts full TC entry metadata from a resolved node.
 */
export function extractTcEntryInfo(resolved: ResolvedTcEntryNode): TocEntryInfo {
  const instruction: string = resolved.node.attrs?.instruction ?? '';
  const config = parseTcInstruction(instruction);

  return {
    nodeType: 'tableOfContentsEntry',
    kind: 'inline',
    properties: {
      instruction,
      text: config.text,
      level: config.level,
      tableIdentifier: config.tableIdentifier,
      omitPageNumber: config.omitPageNumber,
    },
  };
}

// ---------------------------------------------------------------------------
// Discovery item builder
// ---------------------------------------------------------------------------

/**
 * Builds a discovery item for a single TC entry node.
 */
export function buildTcEntryDiscoveryItem(
  resolved: ResolvedTcEntryNode,
  evaluatedRevision: string,
): DiscoveryItem<TocEntryDomain> {
  const instruction: string = resolved.node.attrs?.instruction ?? '';
  const config = parseTcInstruction(instruction);

  const address: TocEntryAddress = {
    kind: 'inline',
    nodeType: 'tableOfContentsEntry',
    nodeId: resolved.nodeId,
  };

  const handle = buildResolvedHandle(resolved.nodeId, 'ephemeral', 'field');

  const domain: TocEntryDomain = {
    address,
    instruction,
    text: config.text,
    level: config.level,
    tableIdentifier: config.tableIdentifier,
    omitPageNumber: config.omitPageNumber,
  };

  const id = `tc-entry:${resolved.nodeId}:${evaluatedRevision}`;
  return buildDiscoveryItem(id, handle, domain);
}
