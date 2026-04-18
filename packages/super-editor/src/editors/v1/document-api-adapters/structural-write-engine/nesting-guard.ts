/**
 * Nesting guard — enforces the default non-nested-table policy.
 *
 * Prevents accidental table-inside-table insertion unless explicitly
 * opted in via nestingPolicy: { tables: 'allow' }.
 */

import type { NestingPolicy, SDFragment, SDContentNode } from '@superdoc/document-api';
import { DEFAULT_NESTING_POLICY } from '@superdoc/document-api';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { DocumentApiAdapterError } from '../errors.js';

/**
 * Returns true if the fragment contains any table nodes (at any depth).
 * Recurses into list items, table cells, sdt, and customXml content.
 */
function fragmentContainsTable(fragment: SDFragment): boolean {
  const nodes: SDContentNode[] = Array.isArray(fragment) ? fragment : [fragment];
  return nodes.some(nodeContainsTable);
}

function nodeContainsTable(node: SDContentNode): boolean {
  const kind = (node as any).kind ?? (node as any).type;
  if (kind === 'table') return true;

  const children = getChildContentNodes(node);
  return children.some(nodeContainsTable);
}

/** Extracts nested SDContentNode children from container nodes. */
function getChildContentNodes(node: SDContentNode): SDContentNode[] {
  const children: SDContentNode[] = [];
  if (node.kind === 'list') {
    for (const item of node.list.items) {
      children.push(...item.content);
    }
  } else if (node.kind === 'table') {
    for (const row of node.table.rows) {
      for (const cell of row.cells) {
        children.push(...cell.content);
      }
    }
  } else if (node.kind === 'sdt' && node.sdt.content) {
    children.push(...node.sdt.content);
  } else if (node.kind === 'customXml' && node.customXml.content) {
    children.push(...node.customXml.content);
  }
  return children;
}

/**
 * Returns true if the given ProseMirror position is inside a table cell.
 */
function isInsideTable(doc: ProseMirrorNode, pos: number): boolean {
  const $pos = doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth--) {
    const nodeType = $pos.node(depth).type.name;
    if (nodeType === 'tableCell' || nodeType === 'tableHeader') {
      return true;
    }
  }
  return false;
}

/**
 * Enforces nesting policy. Throws if fragment contains a table and the
 * insertion target is inside a table cell, unless explicitly allowed.
 *
 * @param fragment - The SDFragment being inserted
 * @param doc - Current ProseMirror document
 * @param insertPos - Absolute ProseMirror insertion position
 * @param policy - Nesting policy (defaults to { tables: 'forbid' })
 */
export function enforceNestingPolicy(
  fragment: SDFragment,
  doc: ProseMirrorNode,
  insertPos: number,
  policy?: NestingPolicy,
): void {
  const effectivePolicy = policy?.tables ?? DEFAULT_NESTING_POLICY.tables;

  if (effectivePolicy === 'allow') return;

  if (fragmentContainsTable(fragment) && isInsideTable(doc, insertPos)) {
    throw new DocumentApiAdapterError(
      'INVALID_NESTING',
      'Cannot insert a table inside another table. Pass nestingPolicy: { tables: "allow" } to override.',
    );
  }
}
