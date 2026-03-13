import type { BaseNodeInfo } from './base.js';

export interface RunNodeInfo extends BaseNodeInfo {
  nodeType: 'run';
  kind: 'inline';
  properties: RunProperties;
}

export interface TabNodeInfo extends BaseNodeInfo {
  nodeType: 'tab';
  kind: 'inline';
  properties: Record<string, never>;
}

export interface LineBreakNodeInfo extends BaseNodeInfo {
  nodeType: 'lineBreak';
  kind: 'inline';
  properties: Record<string, never>;
}

export interface RunProperties {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  font?: string;
  size?: number;
  color?: string;
  highlight?: string;
  styleId?: string;
  language?: string;
}
