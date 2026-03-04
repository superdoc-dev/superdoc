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

/** Wrap type for OOXML image placement. */
export type ImageWrapType = 'Inline' | 'None' | 'Square' | 'Tight' | 'Through' | 'TopAndBottom';

/** Wrap side — controls which side(s) text flows around the image. */
export type ImageWrapSide = 'bothSides' | 'left' | 'right' | 'largest';

export interface ImageWrapAttrs {
  wrapText?: string;
  distTop?: number;
  distBottom?: number;
  distLeft?: number;
  distRight?: number;
}

export interface ImageWrapInfo {
  type: ImageWrapType;
  attrs?: ImageWrapAttrs;
}

export interface ImageAnchorData {
  hRelativeFrom?: string;
  vRelativeFrom?: string;
  alignH?: string;
  alignV?: string;
}

export interface ImageMarginOffset {
  horizontal?: number;
  top?: number;
}

export interface ImageProperties {
  src?: string;
  alt?: string;
  size?: ImageSize;
  placement: 'inline' | 'floating';
  wrap: ImageWrapInfo;
  anchorData?: ImageAnchorData | null;
  marginOffset?: ImageMarginOffset | null;
  relativeHeight?: number | null;
}
