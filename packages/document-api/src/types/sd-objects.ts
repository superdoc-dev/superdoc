/**
 * SDM/1 object layout, geometry, media, and compatibility types.
 *
 * These types describe the positioning, sizing, and source data for
 * visual objects (images, drawings) in the document model.
 */

// ---------------------------------------------------------------------------
// Object placement
// ---------------------------------------------------------------------------

export type SDObjectPlacement = 'inline' | 'block' | 'floating';

// ---------------------------------------------------------------------------
// Accessibility and hyperlink
// ---------------------------------------------------------------------------

export interface SDObjectHyperlinkTarget {
  href?: string;
  anchor?: string;
  tooltip?: string;
}

export interface SDAccessibilityInfo {
  /** Short alt text. */
  alt?: string;
  /** Object title (tooltip/name in some UIs). */
  title?: string;
  /** Long-form description. */
  description?: string;
  /** Object/UI name when present in source format. */
  name?: string;
  /** Mark decorative content with no semantic alt text. */
  decorative?: boolean;
  /** Source hidden flag for non-visual content. */
  hidden?: boolean;
  /** Optional click action hyperlink metadata. */
  clickHyperlink?: SDObjectHyperlinkTarget;
  /** Optional hover action hyperlink metadata. */
  hoverHyperlink?: SDObjectHyperlinkTarget;
}

// ---------------------------------------------------------------------------
// Anchor, wrap, layout
// ---------------------------------------------------------------------------

export interface SDObjectAnchor {
  relativeX?: 'column' | 'page' | 'margin';
  relativeY?: 'paragraph' | 'page' | 'margin';
  alignX?: 'left' | 'center' | 'right' | 'inside' | 'outside';
  alignY?: 'top' | 'center' | 'bottom' | 'inside' | 'outside' | 'inline';
  /** Horizontal offset in points. */
  offsetX?: number;
  /** Vertical offset in points. */
  offsetY?: number;
  behindText?: boolean;
  allowOverlap?: boolean;
  layoutInCell?: boolean;
  locked?: boolean;
  anchorId?: string;
  editId?: string;
}

export interface SDObjectWrap {
  type: 'inline' | 'none' | 'square' | 'tight' | 'through' | 'topBottom';
  side?: 'bothSides' | 'left' | 'right' | 'largest';
  /** Wrap distances in points. */
  distances?: { top?: number; right?: number; bottom?: number; left?: number };
  polygon?: Array<[number, number]>;
}

export interface SDObjectLayout {
  placement?: SDObjectPlacement;
  anchor?: SDObjectAnchor;
  wrap?: SDObjectWrap;
  zIndex?: number;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export interface SDObjectGeometry {
  /** Width in points. */
  width?: number;
  /** Height in points. */
  height?: number;
  relativeSize?: { widthPct?: number; heightPct?: number };
  transform?: { rotation?: number; flipH?: boolean; flipV?: boolean };
  /** Effect extent in points. */
  effectExtent?: { left?: number; top?: number; right?: number; bottom?: number };
  /** Crop percentages. */
  crop?: { leftPct?: number; topPct?: number; rightPct?: number; bottomPct?: number };
  fit?: 'contain' | 'cover' | 'fill' | 'scaleDown';
}

// ---------------------------------------------------------------------------
// Media reference
// ---------------------------------------------------------------------------

export interface SDObjectMediaRef {
  relationshipId?: string;
  embedId?: string;
  link?: string;
  src?: string;
  mimeType?: string;
  extension?: string;
}

// ---------------------------------------------------------------------------
// Compatibility / round-trip fidelity
// ---------------------------------------------------------------------------

export interface SDObjectCompat {
  /** Optional mc:AlternateContent payload preserved for round-trip fidelity. */
  alternateContent?: Record<string, unknown>;
  /** Optional VML/w:pict fallback payload preserved for round-trip fidelity. */
  legacyVml?: Record<string, unknown>;
  /** Unmodeled source payload preserved for lossless round-trip. */
  passthrough?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Drawing source discriminated union
// ---------------------------------------------------------------------------

export type SDDrawingSource =
  | {
      kind: 'image';
      media?: SDObjectMediaRef;
    }
  | {
      kind: 'vectorShape';
      shapeKind?: string;
      geometryData?: Record<string, unknown>;
      styleData?: Record<string, unknown>;
    }
  | {
      kind: 'shapeGroup';
      children?: Array<{ kind: 'vectorShape' | 'image' | 'unknown'; data?: Record<string, unknown> }>;
    }
  | {
      kind: 'externalObject';
      objectType: 'chart' | 'smartArt' | 'diagram' | 'ole' | 'table' | 'unknown';
      graphicDataUri?: string;
      relations?: Record<string, string>;
      data?: Record<string, unknown>;
    };

// ---------------------------------------------------------------------------
// Resolved provenance model
// ---------------------------------------------------------------------------

export interface SDResolvedProperty<T> {
  value: T;
  source: 'docDefaults' | 'style' | 'linkedStyle' | 'tableConditional' | 'direct';
  sourceRef?: string;
  chain?: string[];
}

export type SDResolvedProvenance<TProps> = Partial<Record<keyof TProps, SDResolvedProperty<unknown>>>;

// ---------------------------------------------------------------------------
// Resolved table layout
// ---------------------------------------------------------------------------

export interface SDResolvedTableLayout {
  /** Table width in points. */
  tableWidth?: number;
  /** Column widths in points. */
  columnWidths?: number[];
}
