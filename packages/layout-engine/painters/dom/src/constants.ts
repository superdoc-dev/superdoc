/**
 * DOM Painter Constants — Compatibility Re-exports
 *
 * The source of truth for these constants is now `@superdoc/dom-contract`.
 * These re-exports exist so that existing `painter-dom` consumers continue
 * to work without import changes. New code should import from
 * `@superdoc/dom-contract` directly.
 */

export { DOM_CLASS_NAMES } from '@superdoc/dom-contract';
export type { DomClassName } from '@superdoc/dom-contract';
