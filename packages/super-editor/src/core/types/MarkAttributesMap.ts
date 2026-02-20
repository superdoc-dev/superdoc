/**
 * Mark attributes type registry.
 *
 * This module provides type-safe access to mark attributes through module augmentation.
 * Extensions should augment the `MarkAttributesMap` interface to register their mark types.
 *
 * @example
 * ```ts
 * // In an extension types file:
 * declare module '@core/types/MarkAttributesMap.js' {
 *   interface MarkAttributesMap {
 *     bold: BoldAttrs;
 *     link: LinkAttrs;
 *   }
 * }
 * ```
 *
 * @module MarkAttributesMap
 */

/**
 * Registry mapping mark names to their attribute types.
 * Extensions should augment this interface to register their mark attributes.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface MarkAttributesMap {}

/**
 * Get all registered mark names.
 * Uses mapped type to force TypeScript to expand the union in hover tooltips.
 */
export type MarkName = { [K in keyof MarkAttributesMap]: K }[keyof MarkAttributesMap];

/**
 * Get the attribute type for a mark by name.
 *
 * @example
 * ```ts
 * type LinkMarkAttrs = MarkAttrs<'link'>;
 * ```
 */
export type MarkAttrs<M extends MarkName> = MarkAttributesMap[M];

/**
 * A ProseMirror mark with typed attributes.
 */
export interface TypedMark<M extends MarkName> {
  type: { name: M };
  attrs: MarkAttributesMap[M];
}

/**
 * Type guard to check if a mark has a specific type.
 *
 * @param mark - The ProseMirror mark to check
 * @param name - The expected mark type name
 * @returns True if the mark matches the expected type
 *
 * @example
 * ```ts
 * node.marks.forEach((mark) => {
 *   if (isMarkType(mark, 'link')) {
 *     // mark.attrs is now typed as LinkAttrs
 *     console.log(mark.attrs.href);
 *   }
 * });
 * ```
 */
export function isMarkType<M extends MarkName>(
  mark: { type: { name: string }; attrs: unknown },
  name: M,
): mark is TypedMark<M> {
  return mark.type.name === name;
}
