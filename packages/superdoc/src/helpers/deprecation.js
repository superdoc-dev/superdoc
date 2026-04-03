/**
 * Deprecation utilities for steering consumers toward the Document API.
 *
 * ProseMirror will be removed in a future major version. These helpers emit
 * one-time console warnings when deprecated properties are accessed on an
 * editor instance handed to consumer callbacks (onEditorCreate, etc.).
 *
 * Internal code continues to use the raw Editor — only the consumer-facing
 * boundary wraps the editor with a Proxy.
 */

const MIGRATION_URL = 'https://docs.superdoc.dev/guides/migration/document-api';

/** @type {Set<string>} */
const _warned = new Set();

/**
 * Log a console.warn once per key. Subsequent calls with the same key are no-ops.
 * @param {string} key
 * @param {string} message
 */
export function warnOnce(key, message) {
  if (_warned.has(key)) return;
  _warned.add(key);
  console.warn(message);
}

/**
 * Map of deprecated property names to the human-readable access path shown
 * in the warning message.
 * @type {Record<string, string>}
 */
const DEPRECATED_PROPERTIES = {
  state: 'editor.state',
  view: 'editor.view',
  schema: 'editor.schema',
  commands: 'editor.commands',
  chain: 'editor.chain()',
  can: 'editor.can()',
  dispatch: 'editor.dispatch()',
};

/** @type {symbol} */
const RAW_EDITOR = Symbol.for('superdoc:rawEditor');

/** @type {WeakMap<object, Map<string|symbol, Function>>} */
const _boundFns = new WeakMap();

/**
 * Wrap an Editor instance in a Proxy that emits one-time deprecation
 * warnings when consumers access ProseMirror internals or editor commands.
 *
 * The proxy is fully transparent — all property access and method calls are
 * forwarded to the underlying editor. Only the warning side-effect is added.
 *
 * @param {import('@superdoc/super-editor').Editor} editor
 * @returns {import('@superdoc/super-editor').Editor} Proxied editor (or the
 *   original if null/already wrapped)
 */
export function createDeprecatedEditorProxy(editor) {
  if (!editor || editor[RAW_EDITOR]) return editor;

  return new Proxy(editor, {
    get(target, prop) {
      // Escape hatch for internal code that needs the unwrapped editor
      if (prop === RAW_EDITOR) return target;

      const deprecatedName = DEPRECATED_PROPERTIES[prop];
      if (deprecatedName) {
        warnOnce(
          `deprecated:${String(prop)}`,
          `[SuperDoc] ${deprecatedName} is deprecated and will be removed in a future version. ` +
            `Use the Document API (editor.doc) instead. See ${MIGRATION_URL}`,
        );
      }

      // Bind to target (not receiver/proxy) so private-field brand checks
      // on the Editor class work correctly. Cache the bound function so
      // repeated access returns the same reference (preserves identity).
      const value = Reflect.get(target, prop, target);
      if (typeof value === 'function') {
        let cache = _boundFns.get(target);
        if (!cache) {
          cache = new Map();
          _boundFns.set(target, cache);
        }
        if (!cache.has(prop)) {
          cache.set(prop, value.bind(target));
        }
        return cache.get(prop);
      }
      return value;
    },
  });
}

/**
 * Unwrap a potentially proxied editor back to the raw Editor instance.
 * Safe to call on an already-raw editor — returns it unchanged.
 *
 * @param {import('@superdoc/super-editor').Editor | null | undefined} editor
 * @returns {import('@superdoc/super-editor').Editor | null | undefined}
 */
export function unwrapEditor(editor) {
  return editor?.[RAW_EDITOR] ?? editor;
}
