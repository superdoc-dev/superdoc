/**
 * Base attribute interfaces for semantic node hierarchies.
 *
 * These interfaces provide type layering without runtime changes:
 * - BlockNodeAttributes: Base for all block-level nodes
 * - OxmlNodeAttributes: Base for OOXML-derived nodes (extends Block)
 * - TableNodeAttributes: Base for table-related nodes (extends Oxml)
 * - TextContainerAttributes: Base for text containers like paragraphs (extends Oxml)
 * - InlineNodeAttributes: Base for inline nodes
 * - ShapeNodeAttributes: Base for shape/drawing nodes
 *
 * @example
 * ```ts
 * // Extend base interfaces in your node attribute types:
 * interface ParagraphAttrs extends TextContainerAttributes {
 *   listRendering: ListRendering | null;
 *   // ...paragraph-specific attrs
 * }
 *
 * interface TableCellAttrs extends TableNodeAttributes {
 *   colspan: number;
 *   rowspan: number;
 *   // ...cell-specific attrs
 * }
 * ```
 *
 * @module NodeCategories
 */

/**
 * Base attributes shared by all block-level nodes.
 */
export interface BlockNodeAttributes {
  /** SuperDoc block tracking ID */
  sdBlockId?: string | null;
  /** Additional HTML attributes */
  extraAttrs?: Record<string, string>;
}

/**
 * Base attributes for OOXML-derived nodes.
 * Extends BlockNodeAttributes with revision tracking IDs.
 */
export interface OxmlNodeAttributes extends BlockNodeAttributes {
  /** Revision save ID */
  rsidR?: string | null;
  /** Default revision save ID */
  rsidRDefault?: string | null;
  /** Paragraph revision save ID */
  rsidP?: string | null;
}

/**
 * Attributes for table-related nodes (table, tableRow, tableCell).
 * Extends OxmlNodeAttributes - specific table properties defined in node-attributes.ts.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface TableNodeAttributes extends OxmlNodeAttributes {}

/**
 * Attributes for text container nodes (paragraphs, headings, etc).
 * Extends OxmlNodeAttributes - specific text properties defined in node-attributes.ts.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface TextContainerAttributes extends OxmlNodeAttributes {}

/**
 * Attributes for inline nodes.
 * Inline nodes typically have minimal shared attributes.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface InlineNodeAttributes {}

/**
 * Attributes for shape/drawing nodes.
 */
export interface ShapeNodeAttributes extends BlockNodeAttributes {
  /** Shape ID */
  id?: string | null;
  /** Shape name/description */
  name?: string | null;
  /** Whether the shape should be hidden */
  hidden?: boolean;
}
