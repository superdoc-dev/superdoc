/**
 * Type definitions for ProseMirror to FlowBlock adapter
 */

import type { TrackedChangesMode, SectionMetadata, FlowBlock } from '@superdoc/contracts';
import type { StyleContext as StyleEngineContext, ComputedParagraphStyle } from '@superdoc/style-engine';
import type { SectionRange } from './sections/index.js';
import type { ConverterContext } from './converter-context.js';
import type { paragraphToFlowBlocks } from './converters/paragraph.js';
import type { tableNodeToBlock } from './converters/table.js';
import type { contentBlockNodeToDrawingBlock } from './converters/content-block.js';
import type { imageNodeToBlock } from './converters/image.js';
import type {
  shapeContainerNodeToDrawingBlock,
  shapeGroupNodeToDrawingBlock,
  shapeTextboxNodeToDrawingBlock,
  vectorShapeNodeToDrawingBlock,
} from './converters/shapes.js';
export type { ConverterContext } from './converter-context.js';

export type StyleContext = StyleEngineContext;
export type { ComputedParagraphStyle };

export type ThemeColorPalette = Record<string, string>;

/**
 * ProseMirror node shape (simplified interface for what we need)
 */
export interface PMNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  text?: string;
  marks?: PMMark[];
}

/**
 * ProseMirror mark shape
 */
export interface PMMark {
  type: string;
  attrs?: Record<string, unknown>;
}

/**
 * Tracked changes configuration for rendering modes
 */
export type TrackedChangesConfig = {
  mode: TrackedChangesMode;
  enabled: boolean;
};

/**
 * Hyperlink configuration for link rendering
 */
export type HyperlinkConfig = {
  enableRichHyperlinks: boolean;
};

export type FlowRunLinkMetadata = {
  version?: 1 | 2;
  href?: string;
  title?: string;
  target?: '_blank' | '_self' | '_parent' | '_top';
  rel?: string;
  tooltip?: string;
  anchor?: string;
  docLocation?: string;
  rId?: string;
  name?: string;
  history?: boolean;
};

/**
 * Adapter options for customizing conversion behavior
 */
export interface AdapterOptions {
  /**
   * Default font family for text without explicit styling
   * @default "Arial"
   */
  defaultFont?: string;

  /**
   * Default font size in pixels for text without explicit styling
   * @default 16
   */
  defaultSize?: number;

  /**
   * Optional prefix applied to every generated BlockId (e.g., `header-default-`).
   * Useful when converting multiple documents that share the same position space.
   */
  blockIdPrefix?: string;

  /**
   * Optional list of ProseMirror node type names that should be treated as atom/leaf nodes
   * for position mapping. Use this to keep PM positions correct when custom atom nodes exist.
   */
  atomNodeTypes?: Iterable<string>;

  /**
   * Optional precomputed position map keyed by the PM JSON nodes passed to toFlowBlocks.
   * When provided, this is used directly instead of building a new position map.
   */
  positions?: PositionMap;

  /**
   * Optional media files map for hydrating image blocks.
   * Key: normalized file path (e.g., "word/media/image1.jpeg")
   * Value: base64-encoded image data
   *
   * When provided, image blocks will have their `src` converted from file paths
   * to data URLs (e.g., "data:image/jpeg;base64,...")
   */
  mediaFiles?: Record<string, string>;

  /**
   * When true, emit a sectionBreak block after any paragraph that carries a sectPr
   * or normalized sectionMargins. Default: false (to avoid breaking existing pipelines
   * that don't yet handle section breaks).
   */
  emitSectionBreaks?: boolean;

  /**
   * Optional instrumentation hook for fidelity logging.
   */
  instrumentation?: AdapterInstrumentation;

  /**
   * Locale overrides (decimal separator, etc.).
   */
  locale?: {
    decimalSeparator?: string;
  };

  /**
   * Desired track-changes viewing mode for layout output.
   * When omitted, the adapter should assume `'review'`.
   */
  trackedChangesMode?: TrackedChangesMode;

  /**
   * Feature flag for propagating tracked-change metadata into FlowBlocks.
   * Disable when consumers are not ready to handle the additional payload.
   * Defaults to `true`.
   */
  enableTrackedChanges?: boolean;

  /**
   * Feature flag for emitting rich hyperlink metadata (FlowRunLink v2 schema).
   * When false, the adapter outputs the legacy `{ href, title }` shape.
   * Defaults to `false`.
   */
  enableRichHyperlinks?: boolean;

  /**
   * Feature flag for propagating comment annotations into FlowBlocks.
   * When false, comment marks are ignored and no comment highlights appear.
   * Defaults to `true`.
   */
  enableComments?: boolean;

  /**
   * Theme color palette extracted from the DOCX `word/theme/theme1.xml` part.
   * Used to resolve `w:themeColor` marks when `w:val` is missing.
   */
  themeColors?: ThemeColorPalette;

  /**
   * Optional container for section metadata extracted during conversion.
   * When provided, the adapter will populate it with SectionMetadata entries
   * describing each section's header/footer refs & numbering.
   */
  sectionMetadata?: SectionMetadata[];

  /**
   * Optional snapshot of the converter's DOCX context (styles.xml, numbering).
   * When provided, the adapter can hydrate style-linked attributes so layout
   * renders match the original Word document more closely.
   */
  converterContext?: ConverterContext;
}

/**
 * Section types re-exported from sections module
 */
export {
  SectionType,
  type SectPrElement,
  type SectPrChildElement,
  type ParagraphProperties,
  type SectPrLikeObject,
} from './sections/index.js';

/**
 * Adapter feature snapshot for instrumentation
 */
export type AdapterFeatureSnapshot = {
  totalBlocks: number;
  blockCounts: Partial<Record<FlowBlock['kind'], number>>;
};

/**
 * Instrumentation callbacks for monitoring adapter behavior
 */
export interface AdapterInstrumentation {
  onBlocksConverted?: (snapshot: AdapterFeatureSnapshot) => void;
  log?: (payload: {
    totalBlocks: number;
    blockCounts: Partial<Record<FlowBlock['kind'], number>>;
    bookmarks: number;
  }) => void;
}

/**
 * Section range and signature re-exported from sections module
 */
export type { SectionRange, SectionSignature } from './sections/index.js';

/**
 * Block ID generator function
 */
export type BlockIdGenerator = (kind: string) => string;

/**
 * Position tracking for PM nodes
 */
export type Position = { start: number; end: number };

/**
 * Position map for tracking PM node positions
 */
export type PositionMap = WeakMap<PMNode, Position>;

/**
 * Bookmark pair tracking
 */
export type BookmarkPair = number;

/**
 * Block position data
 */
export type BlockPositionData = Position;

/**
 * PM document map for batch processing
 */
export type PMDocumentMap = Record<string, PMNode | object | null | undefined>;

/**
 * Batch adapter options with additional factory
 */
export type BatchAdapterOptions = AdapterOptions & {
  /**
   * Factory for generating per-document block ID prefixes
   */
  blockIdPrefixFactory?: (docKey: string) => string;
};

/**
 * Flow blocks result with bookmark tracking.
 * Bookmarks map bookmark names to their PM positions for cross-reference resolution.
 */
export type FlowBlocksResult = {
  blocks: FlowBlock[];
  bookmarks: Map<string, number>; // bookmark name → PM position
};

/**
 * Context object passed to all node handlers containing shared state and utilities.
 */
export interface NodeHandlerContext {
  // Block accumulation
  blocks: FlowBlock[];
  recordBlockKind: (kind: FlowBlock['kind']) => void;

  // ID generation & positions
  nextBlockId: BlockIdGenerator;
  positions: PositionMap;

  // Style & defaults
  defaultFont: string;
  defaultSize: number;
  styleContext: StyleContext;
  converterContext: ConverterContext;

  // Tracked changes & hyperlinks
  trackedChangesConfig: TrackedChangesConfig;
  hyperlinkConfig: HyperlinkConfig;

  // Comments
  enableComments: boolean;

  // Bookmarks
  bookmarks: Map<string, number>;

  // Section state (mutable)
  sectionState: {
    ranges: SectionRange[];
    currentSectionIndex: number;
    currentParagraphIndex: number;
  };

  // Converters for nested content
  converters: NestedConverters;
  themeColors?: ThemeColorPalette;
}

/**
 * Handler function signature for processing a specific node type.
 * Handlers mutate the context (add blocks, update counters, etc.).
 */
export type NodeHandler = (node: PMNode, context: NodeHandlerContext) => void;

export type ParagraphToFlowBlocksParams = {
  para: PMNode;
  nextBlockId: BlockIdGenerator;
  positions: PositionMap;
  defaultFont: string;
  defaultSize: number;
  styleContext: StyleContext;
  trackedChangesConfig?: TrackedChangesConfig;
  hyperlinkConfig: HyperlinkConfig;
  themeColors?: ThemeColorPalette;
  bookmarks?: Map<string, number>;
  converters: NestedConverters;
  enableComments: boolean;
  converterContext: ConverterContext;
};

export type TableNodeToBlockParams = {
  node: PMNode;
  nextBlockId: BlockIdGenerator;
  positions: PositionMap;
  defaultFont: string;
  defaultSize: number;
  styleContext: StyleContext;
  trackedChangesConfig?: TrackedChangesConfig;
  bookmarks?: Map<string, number>;
  hyperlinkConfig: HyperlinkConfig;
  themeColors?: ThemeColorPalette;
  converterContext: ConverterContext;
  converters: NestedConverters;
  enableComments: boolean;
};

export type NestedConverters = {
  paragraphToFlowBlocks: typeof paragraphToFlowBlocks;
  tableNodeToBlock: typeof tableNodeToBlock;
  contentBlockNodeToDrawingBlock: typeof contentBlockNodeToDrawingBlock;
  imageNodeToBlock: typeof imageNodeToBlock;
  vectorShapeNodeToDrawingBlock: typeof vectorShapeNodeToDrawingBlock;
  shapeGroupNodeToDrawingBlock: typeof shapeGroupNodeToDrawingBlock;
  shapeContainerNodeToDrawingBlock: typeof shapeContainerNodeToDrawingBlock;
  shapeTextboxNodeToDrawingBlock: typeof shapeTextboxNodeToDrawingBlock;
};

/**
 * List rendering attributes
 */
export type ListRenderingAttrs = {
  markerText: string;
  justification: 'left' | 'right' | 'center';
  path: number[];
  numberingType: string;
  suffix: 'tab' | 'space' | 'nothing';
};

/**
 * Marker parameters for list items
 */
export type MarkerParams = {
  listType: 'bullet' | 'ordered';
  listNode: PMNode;
  itemNode: PMNode;
  fallbackOrder: number;
};

/**
 * OOXML border specification
 */
export interface OoxmlBorder {
  val?: string;
  size?: number;
  color?: string;
}

/**
 * Underline style type derived from TextRun contract
 */
export type UnderlineStyle = NonNullable<import('@superdoc/contracts').TextRun['underline']>['style'];
