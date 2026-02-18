import type { BaseNodeInfo, NodeKind } from './base.js';

export interface SdtNodeInfo extends BaseNodeInfo {
  nodeType: 'sdt';
  kind: NodeKind;
  properties: SdtProperties;
}

export interface SdtProperties {
  tag?: string;
  alias?: string;
  type?: string;
  appearance?: string;
  placeholder?: string;
}

export interface BookmarkNodeInfo extends BaseNodeInfo {
  nodeType: 'bookmark';
  kind: 'inline';
  properties: BookmarkProperties;
}

export interface HyperlinkNodeInfo extends BaseNodeInfo {
  nodeType: 'hyperlink';
  kind: 'inline';
  properties: HyperlinkProperties;
}

export interface BookmarkProperties {
  name?: string;
  bookmarkId?: string;
}

export interface HyperlinkProperties {
  href?: string;
  anchor?: string;
  tooltip?: string;
}
