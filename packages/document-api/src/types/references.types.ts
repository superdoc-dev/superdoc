import type { BaseNodeInfo } from './base.js';

export interface FootnoteRefNodeInfo extends BaseNodeInfo {
  nodeType: 'footnoteRef';
  kind: 'inline';
  properties: FootnoteRefProperties;
}

export interface FootnoteRefProperties {
  noteId?: string;
}
