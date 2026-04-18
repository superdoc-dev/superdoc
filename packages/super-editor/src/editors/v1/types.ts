/**
 * Main types entrypoint for @pdfme/super-editor.
 *
 * Importing this file (or the package) automatically loads all type augmentations
 * for commands and node/mark attributes.
 *
 * @example
 * ```typescript
 * import { Editor } from '@pdfme/super-editor';
 * import { isNodeType, type NodeAttrs, type ParagraphAttrs } from '@pdfme/super-editor';
 *
 * const editor = new Editor({ ... });
 *
 * // Commands are fully typed
 * editor.commands.toggleBold();           // ✅ Autocomplete
 * editor.commands.setFontSize('14pt');    // ✅ Type-checked
 *
 * // Node attributes are typed
 * editor.state.doc.descendants((node) => {
 *   if (isNodeType(node, 'paragraph')) {
 *     // node.attrs is typed as ParagraphAttrs
 *     const styleId = node.attrs.paragraphProperties?.styleId;
 *   }
 * });
 *
 * // Direct type usage
 * function processParagraph(attrs: NodeAttrs<'paragraph'>) {
 *   // attrs is ParagraphAttrs
 * }
 * ```
 *
 * @module Types
 */

// Load all augmentations (side-effect imports)
import './extensions/types/index.js';

// ============================================
// COMMAND TYPES
// ============================================

export type {
  EditorCommands,
  CommandProps,
  Command,
  ChainedCommand,
  ChainableCommandObject,
  CanCommand,
  CanObject,
  CoreCommands,
  ExtensionCommands,
  CoreCommandMap,
  ExtensionCommandMap,
} from './core/types/ChainedCommands.js';

// ============================================
// NODE ATTRIBUTE TYPES
// ============================================

export type { NodeAttributesMap, NodeName, NodeAttrs, TypedNode } from './core/types/NodeAttributesMap.js';

export { isNodeType, assertNodeType } from './core/types/NodeAttributesMap.js';

// ============================================
// MARK ATTRIBUTE TYPES
// ============================================

export type { MarkAttributesMap, MarkName, MarkAttrs, TypedMark } from './core/types/MarkAttributesMap.js';

export { isMarkType } from './core/types/MarkAttributesMap.js';

// ============================================
// NODE CATEGORY INTERFACES
// ============================================

export type {
  BlockNodeAttributes,
  OxmlNodeAttributes,
  TableNodeAttributes,
  TextContainerAttributes,
  InlineNodeAttributes,
  ShapeNodeAttributes,
} from './core/types/NodeCategories.js';

// ============================================
// COMMONLY USED ATTRIBUTE TYPES
// ============================================

// Paragraph types
export type {
  ParagraphAttrs,
  ParagraphProperties,
  NumberingProperties,
  IndentationProperties,
  SpacingProperties,
  ListRendering,
  SectionMargins,
} from './extensions/types/node-attributes.js';

// Table types
export type {
  TableAttrs,
  TableRowAttrs,
  TableCellAttrs,
  TableHeaderAttrs,
  TableProperties,
  TableRowProperties,
  TableCellProperties,
  TableMeasurement,
  TableBorders,
  TableLook,
  TableGrid,
  CellMargins,
  BorderSpec,
  ShadingProperties,
  ThemeColor,
} from './extensions/types/node-attributes.js';

// Image types
export type {
  ImageAttrs,
  ImageSize,
  ImagePadding,
  ImageWrap,
  ImageTransformData,
} from './extensions/types/node-attributes.js';

// Run types
export type { RunAttrs, RunProperties } from './extensions/types/node-attributes.js';

// Other node types
export type {
  DocumentAttrs,
  TextAttrs,
  LineBreakAttrs,
  HardBreakAttrs,
  StructuredContentAttrs,
  DocumentSectionAttrs,
} from './extensions/types/node-attributes.js';

// Tab and bookmark types
export type { TabAttrs, BookmarkStartAttrs, BookmarkEndAttrs } from './extensions/types/node-attributes.js';

// Shape types
export type {
  ShapeContainerAttrs,
  ShapeGroupAttrs,
  ShapeGroupSize,
  ShapeGroupPadding,
  ShapeGroupMarginOffset,
  ShapeTextboxAttrs,
  VectorShapeAttrs,
  VectorShapeTextInsets,
} from './extensions/types/node-attributes.js';

// Mention and page types
export type {
  MentionAttrs,
  PageReferenceAttrs,
  PageNumberAttrs,
  TotalPageCountAttrs,
} from './extensions/types/node-attributes.js';

// Field annotation types
export type { FieldAnnotationAttrs, FieldAnnotationSize } from './extensions/types/node-attributes.js';

// Content block types
export type {
  ContentBlockAttrs,
  ContentBlockSize,
  ContentBlockMarginOffset,
  TableOfContentsAttrs,
  StructuredContentBlockAttrs,
  DocumentPartObjectAttrs,
} from './extensions/types/node-attributes.js';

// Passthrough types
export type { PassthroughBlockAttrs, PassthroughInlineAttrs } from './extensions/types/node-attributes.js';

// Permission types
export type { PermStartAttrs, PermEndAttrs } from './extensions/types/node-attributes.js';

// Comment range types
export type {
  CommentRangeStartAttrs,
  CommentRangeEndAttrs,
  CommentReferenceAttrs,
} from './extensions/types/node-attributes.js';

// Mark types
export type {
  BoldAttrs,
  ItalicAttrs,
  UnderlineAttrs,
  UnderlineStyle,
  StrikeAttrs,
  LinkAttrs,
  TargetFrameOption,
  HighlightAttrs,
  HighlightColor,
  TextStyleAttrs,
  TrackInsertAttrs,
  TrackDeleteAttrs,
  TrackFormatEntry,
  TrackFormatAttrs,
  CommentMarkAttrs,
} from './extensions/types/mark-attributes.js';

// ============================================
// EXTENSION HELPERS
// ============================================

export { defineNode } from './core/defineNode.js';
export { defineMark } from './core/defineMark.js';

export type { NodeConfig } from './core/Node.js';
export type { MarkConfig } from './core/Mark.js';
export type { OxmlNodeConfig } from './core/OxmlNode.js';

// ============================================
// EDITOR TYPES
// ============================================

export type { ProseMirrorJSON, ProseMirrorJSONNode, ProseMirrorJSONMark } from './core/types/EditorTypes.js';
