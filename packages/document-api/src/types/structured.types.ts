import type { BaseNodeInfo } from './base.js';

export type { ContentControlInfo } from '../content-controls/content-controls.types.js';

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
