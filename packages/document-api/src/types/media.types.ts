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

export interface ImageTransformInfo {
  rotation?: number;
  verticalFlip?: boolean;
  horizontalFlip?: boolean;
}

export interface ImageCropInfo {
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
}

export interface ImageHyperlinkInfo {
  url: string;
  tooltip?: string;
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
  /** Object name (maps to wp:docPr/@name). */
  name?: string;
  /** Accessibility description (maps to wp:docPr/@descr). */
  description?: string;
  transform?: ImageTransformInfo | null;
  crop?: ImageCropInfo | null;
  lockAspectRatio?: boolean;
  decorative?: boolean;
  hyperlink?: ImageHyperlinkInfo | null;
  /** True if an adjacent Caption paragraph exists. */
  hasCaption?: boolean;
}
