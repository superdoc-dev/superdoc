import type { BaseNodeInfo, NodeKind } from './base.js';

export interface ImageNodeInfo extends BaseNodeInfo {
  nodeType: 'image';
  kind: NodeKind;
  properties: ImageProperties;
}

export interface ImageSize {
  width?: number;
  height?: number;
  unit?: 'px' | 'pt' | 'twip';
}

export interface ImageProperties {
  src?: string;
  alt?: string;
  size?: ImageSize;
  wrap?: string;
}
