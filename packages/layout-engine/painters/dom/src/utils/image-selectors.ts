/**
 * Image Selector Helpers — Compatibility Re-exports
 *
 * The source of truth for these helpers is now `@superdoc/dom-contract`.
 * These re-exports exist so that existing `painter-dom` consumers continue
 * to work without import changes. New code should import from
 * `@superdoc/dom-contract` directly.
 */

export { buildImagePmSelector, buildInlineImagePmSelector } from '@superdoc/dom-contract';
