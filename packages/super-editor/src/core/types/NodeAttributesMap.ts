/**
 * Node attributes type registry.
 *
 * This module provides type-safe access to node attributes through module augmentation.
 * Extensions should augment the `NodeAttributesMap` interface to register their node types.
 *
 * @example
 * ```ts
 * // In an extension types file:
 * declare module '@core/types/NodeAttributesMap.js' {
 *   interface NodeAttributesMap {
 *     paragraph: ParagraphAttrs;
 *     table: TableAttrs;
 *   }
 * }
 * ```
 *
 * @module NodeAttributesMap
 */

/**
 * Registry mapping node names to their attribute types.
 * Extensions should augment this interface to register their node attributes.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface NodeAttributesMap {}

/**
 * Get all registered node names.
 * Uses mapped type to force TypeScript to expand the union in hover tooltips.
 */
export type NodeName = { [K in keyof NodeAttributesMap]: K }[keyof NodeAttributesMap];

/**
 * Get the attribute type for a node by name.
 *
 * @example
 * ```ts
 * type ParagraphNodeAttrs = NodeAttrs<'paragraph'>;
 * ```
 */
export type NodeAttrs<N extends NodeName> = NodeAttributesMap[N];

/**
 * A ProseMirror node with typed attributes.
 *
 * @example
 * ```ts
 * function processParagraph(node: TypedNode<'paragraph'>) {
 *   console.log(node.attrs.paragraphProperties?.styleId);
 * }
 * ```
 */
export interface TypedNode<N extends NodeName> {
  type: { name: N };
  attrs: NodeAttributesMap[N];
}

/**
 * Type guard to check if a node has a specific type.
 * Narrows the node type to include typed attributes.
 *
 * @param node - The ProseMirror node to check
 * @param name - The expected node type name
 * @returns True if the node matches the expected type
 *
 * @example
 * ```ts
 * editor.state.doc.descendants((node) => {
 *   if (isNodeType(node, 'paragraph')) {
 *     // node.attrs is now typed as ParagraphAttrs
 *     const styleId = node.attrs.paragraphProperties?.styleId;
 *   }
 * });
 * ```
 */
export function isNodeType<N extends NodeName>(
  node: { type: { name: string }; attrs: unknown },
  name: N,
): node is TypedNode<N> {
  return node.type.name === name;
}

/**
 * Assert that a node has a specific type.
 * Throws an error if the node doesn't match.
 *
 * @param node - The ProseMirror node to check
 * @param name - The expected node type name
 * @throws Error if the node type doesn't match
 *
 * @example
 * ```ts
 * const node = state.doc.nodeAt(pos);
 * assertNodeType(node, 'paragraph');
 * // node.attrs is now typed as ParagraphAttrs
 * ```
 */
export function assertNodeType<N extends NodeName>(
  node: { type: { name: string }; attrs: unknown },
  name: N,
): asserts node is TypedNode<N> {
  if (node.type.name !== name) {
    throw new Error(`Expected node type "${name}", got "${node.type.name}"`);
  }
}
