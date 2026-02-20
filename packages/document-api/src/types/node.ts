/**
 * Full NodeInfo union — assembled from leaf node-info files.
 * Base types (NodeKind, NodeType, BaseNodeInfo, addresses) live in base.ts.
 */

import type { HeadingNodeInfo, ListItemNodeInfo, ParagraphNodeInfo } from './paragraph.types.js';
import type { LineBreakNodeInfo, RunNodeInfo, TabNodeInfo } from './inline.types.js';
import type { TableCellNodeInfo, TableNodeInfo, TableRowNodeInfo } from './tables.types.js';
import type { ImageNodeInfo } from './media.types.js';
import type { BookmarkNodeInfo, HyperlinkNodeInfo, SdtNodeInfo } from './structured.types.js';
import type { CommentNodeInfo } from './comments.types.js';
import type { FootnoteRefNodeInfo } from './references.types.js';

export type NodeInfo =
  | ParagraphNodeInfo
  | HeadingNodeInfo
  | ListItemNodeInfo
  | TableNodeInfo
  | TableRowNodeInfo
  | TableCellNodeInfo
  | ImageNodeInfo
  | SdtNodeInfo
  | RunNodeInfo
  | BookmarkNodeInfo
  | CommentNodeInfo
  | HyperlinkNodeInfo
  | FootnoteRefNodeInfo
  | TabNodeInfo
  | LineBreakNodeInfo;
