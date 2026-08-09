import type { SuperDocExtension } from './types.js';

/**
 * Define a v2 SuperDoc extension.
 *
 * A narrow identity + validation helper: it asserts the two load-bearing
 * fields exist and returns the extension object unchanged (so the authored
 * object literal keeps its inferred storage type). Pass the result to
 * `new SuperDoc({ selector, document, extensions: [AcmeHighlights] })`.
 *
 * `superdoc@2` IS the v2 editor — there is no `editorVersion` /
 * `editorIntegration` selection. V2 extensions are not v1 ProseMirror
 * extensions; the legacy `editorExtensions` config key is a v1/ProseMirror
 * concept and is ignored in `superdoc@2`.
 *
 * @example
 * ```ts
 * import { SuperDoc, defineSuperDocExtension } from 'superdoc';
 *
 * const AcmeHighlights = defineSuperDocExtension({
 *   id: 'acme.highlights',
 *   storage: () => ({ searchText: 'ACME' }),
 *   activate(ctx) {
 *     const highlights = ctx.anchors.collection('acme.highlights');
 *     ctx.commands.register({
 *       id: 'acme.refreshHighlights',
 *       label: 'Refresh highlights',
 *       execute: async () => {
 *         const result = await ctx.doc.query.match({
 *           select: { type: 'text', pattern: ctx.storage.searchText },
 *         });
 *         highlights.replace(result.items.map((item) => ctx.anchors.from(item.target)));
 *         ctx.decorations.invalidate('acme.highlights');
 *       },
 *     });
 *     ctx.onMutation({ affects: ['text'] }, () => ctx.decorations.invalidate('acme.highlights'));
 *     ctx.decorations.register({
 *       id: 'acme.highlights',
 *       provide: ({ visible }) =>
 *         highlights.visibleIn(visible).map((anchor) => ({
 *           type: 'text',
 *           anchor,
 *           className: 'acme-highlight',
 *           data: { source: 'acme' },
 *         })),
 *     });
 *   },
 * });
 *
 * new SuperDoc({
 *   selector: '#editor',
 *   document,
 *   extensions: [AcmeHighlights],
 * });
 * ```
 */
export function defineSuperDocExtension<TStorage extends Record<string, unknown> = Record<string, unknown>>(
  extension: SuperDocExtension<TStorage>,
): SuperDocExtension<TStorage> {
  if (!extension || typeof extension !== 'object') {
    throw new Error('defineSuperDocExtension requires an extension object.');
  }
  if (typeof extension.id !== 'string' || extension.id.length === 0) {
    throw new Error('defineSuperDocExtension requires a non-empty string `id`.');
  }
  if (typeof extension.activate !== 'function') {
    throw new Error(`defineSuperDocExtension("${extension.id}") requires an \`activate(ctx)\` function.`);
  }
  if (extension.storage !== undefined && typeof extension.storage !== 'function') {
    throw new Error(
      `defineSuperDocExtension("${extension.id}") \`storage\` must be a function returning the initial storage object.`,
    );
  }
  return extension;
}
