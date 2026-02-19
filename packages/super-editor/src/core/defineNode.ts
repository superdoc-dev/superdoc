/**
 * Type-safe factory for creating Node extensions.
 *
 * This helper enables gradual TypeScript adoption by allowing JavaScript extensions
 * to get type hints via JSDoc without full TypeScript conversion.
 *
 * @example
 * ```typescript
 * // In a TypeScript file:
 * import { defineNode } from '@core/defineNode.js';
 * import type { ParagraphAttrs } from '@extensions/types/node-attributes.js';
 *
 * interface ParagraphOptions {
 *   headingLevels: number[];
 *   htmlAttributes: Record<string, string>;
 * }
 *
 * export const Paragraph = defineNode<ParagraphOptions, {}, ParagraphAttrs>({
 *   name: 'paragraph',
 *   addAttributes() {
 *     return {
 *       paragraphProperties: { rendered: false },
 *       // TypeScript validates these keys match ParagraphAttrs
 *     };
 *   },
 * });
 * ```
 *
 * @example
 * ```javascript
 * // In a JavaScript file with JSDoc:
 * import { defineNode } from '@core/defineNode.js';
 *
 * /**
 *  * @typedef {import('@extensions/types/node-attributes.js').ParagraphAttrs} ParagraphAttrs
 *  *\/
 *
 * export const Paragraph = defineNode({
 *   name: 'paragraph',
 *   // ...
 * });
 * ```
 *
 * @module defineNode
 */

import { Node, type NodeConfig } from './Node.js';

/**
 * Type-safe factory for creating Node extensions.
 *
 * @template Options - Extension options type
 * @template Storage - Extension storage type
 * @template Attrs - Node attributes type
 * @param config - Node configuration object
 * @returns A new Node instance with the specified types
 */
export function defineNode<
  Options extends Record<string, unknown> = Record<string, never>,
  Storage extends Record<string, unknown> = Record<string, never>,
  Attrs extends Record<string, unknown> = Record<string, unknown>,
>(config: NodeConfig<Options, Storage, Attrs>): Node<Options, Storage, Attrs> {
  return Node.create(config);
}

export type { NodeConfig };
