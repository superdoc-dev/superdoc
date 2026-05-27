/**
 * Type-safe factory for creating Mark extensions.
 *
 * This helper enables gradual TypeScript adoption by allowing JavaScript extensions
 * to get type hints via JSDoc without full TypeScript conversion.
 *
 * @example
 * ```typescript
 * // In a TypeScript file:
 * import { defineMark } from '@core/defineMark.js';
 * import type { LinkAttrs } from '@extensions/types/mark-attributes.js';
 *
 * interface LinkOptions {
 *   autolink: boolean;
 *   openOnClick: boolean;
 * }
 *
 * export const Link = defineMark<LinkOptions, {}, LinkAttrs>({
 *   name: 'link',
 *   addAttributes() {
 *     return {
 *       href: { default: null },
 *       target: { default: null },
 *       // TypeScript validates these keys match LinkAttrs
 *     };
 *   },
 * });
 * ```
 *
 * @example
 * ```javascript
 * // In a JavaScript file with JSDoc: alias the BoldAttrs type at the top
 * // of the file via a standard `typedef` JSDoc block pointing at
 * // '@extensions/types/mark-attributes.js', then defineMark picks up the
 * // attribute shape from there.
 * import { defineMark } from '@core/defineMark.js';
 *
 * export const Bold = defineMark({
 *   name: 'bold',
 *   // ...
 * });
 * ```
 *
 * @module defineMark
 */

import { Mark, type MarkConfig } from './Mark.js';

/**
 * Type-safe factory for creating Mark extensions.
 *
 * @typeParam Options - Extension options type.
 * @typeParam Storage - Extension storage type.
 * @typeParam Attrs - Mark attributes type.
 * @param config - Mark configuration object.
 * @returns A new Mark instance with the specified types.
 */
export function defineMark<
  Options extends Record<string, unknown> = Record<string, never>,
  Storage extends Record<string, unknown> = Record<string, never>,
  Attrs extends Record<string, unknown> = Record<string, unknown>,
>(config: MarkConfig<Options, Storage, Attrs>): Mark<Options, Storage, Attrs> {
  return Mark.create(config);
}

export type { MarkConfig };
