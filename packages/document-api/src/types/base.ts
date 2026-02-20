/**
 * Base types for the Document API node model.
 *
 * This file is the foundation of the type hierarchy — leaf node-info files
 * (paragraph.types.ts, inline.types.ts, etc.) import from here, and node.ts
 * assembles the full NodeInfo union from those leaves.
 *
 * Nothing in this file imports from leaf node-info files.
 */

export type NodeKind = 'block' | 'inline';

export const NODE_KINDS = ['block', 'inline'] as const satisfies readonly NodeKind[];

export type NodeType =
  // Block-level
  | 'paragraph'
  | 'heading'
  | 'listItem'
  | 'table'
  | 'tableRow'
  | 'tableCell'
  // Inline-level
  | 'run'
  | 'bookmark'
  | 'comment'
  | 'hyperlink'
  | 'footnoteRef'
  | 'tab'
  | 'lineBreak'

  // Both block and inline
  | 'image'
  | 'sdt';

export const NODE_TYPES = [
  'paragraph',
  'heading',
  'listItem',
  'table',
  'tableRow',
  'tableCell',
  'image',
  'sdt',
  'run',
  'bookmark',
  'comment',
  'hyperlink',
  'footnoteRef',
  'tab',
  'lineBreak',
] as const satisfies readonly NodeType[];

/**
 * Node types that can appear in block context.
 * Note: 'sdt' and 'image' can appear in both block and inline contexts.
 */
export type BlockNodeType = Extract<
  NodeType,
  'paragraph' | 'heading' | 'listItem' | 'table' | 'tableRow' | 'tableCell' | 'image' | 'sdt'
>;

export const BLOCK_NODE_TYPES = [
  'paragraph',
  'heading',
  'listItem',
  'table',
  'tableRow',
  'tableCell',
  'image',
  'sdt',
] as const satisfies readonly BlockNodeType[];

/**
 * Node types that can appear in inline context.
 * Note: 'sdt' and 'image' can appear in both block and inline contexts.
 */
export type InlineNodeType = Extract<
  NodeType,
  'run' | 'bookmark' | 'comment' | 'hyperlink' | 'sdt' | 'image' | 'footnoteRef' | 'tab' | 'lineBreak'
>;

export const INLINE_NODE_TYPES = [
  'run',
  'bookmark',
  'comment',
  'hyperlink',
  'sdt',
  'image',
  'footnoteRef',
  'tab',
  'lineBreak',
] as const satisfies readonly InlineNodeType[];

export type Position = {
  blockId: string;
  /**
   * 0-based offset into the block's flattened text representation.
   *
   * - Text runs contribute their character length.
   * - Leaf inline nodes (images, tabs, etc.) contribute a single placeholder character.
   * - Transparent inline wrappers (hyperlinks, bookmarks, etc.) contribute only their inner text.
   */
  offset: number;
};

export type InlineAnchor = {
  start: Position;
  end: Position;
};

export type BlockNodeAddress = {
  kind: 'block';
  nodeType: BlockNodeType;
  nodeId: string;
};

export type InlineNodeAddress = {
  kind: 'inline';
  nodeType: InlineNodeType;
  anchor: InlineAnchor;
};

export type NodeAddress = BlockNodeAddress | InlineNodeAddress;

export type NodeSummary = {
  label?: string;
  text?: string;
};

export interface BaseNodeInfo {
  nodeType: NodeType;
  kind: NodeKind;
  summary?: NodeSummary;
  text?: string;
  /** Child nodes. Typed as BaseNodeInfo[] to avoid circular imports; narrow via `nodeType`. */
  nodes?: BaseNodeInfo[];
}
