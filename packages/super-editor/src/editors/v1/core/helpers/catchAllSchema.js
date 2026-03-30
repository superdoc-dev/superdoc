//@ts-check
import { Schema } from 'prosemirror-model';

/**
 * @typedef {Object} UnsupportedContentItem
 * @property {string} tagName - e.g. "HR", "DETAILS"
 * @property {string} outerHTML - truncated to 200 chars max
 * @property {number} count - how many instances of this tagName were dropped
 */

const CATCH_ALL_NODE_NAME = '__supereditor__private__unknown__catch__all__node';
const MAX_OUTER_HTML_LENGTH = 200;

/** @type {WeakMap<Schema, Schema>} */
const catchAllSchemaCache = new WeakMap();

/**
 * Returns a cached copy of the given schema with a catch-all node appended.
 * The catch-all node matches any element not already handled by the real schema,
 * allowing detection of unsupported content.
 *
 * @param {Schema} baseSchema
 * @returns {Schema}
 */
export function getCatchAllSchema(baseSchema) {
  let cached = catchAllSchemaCache.get(baseSchema);
  if (cached) return cached;

  cached = new Schema({
    topNode: baseSchema.spec.topNode,
    marks: baseSchema.spec.marks,
    nodes: baseSchema.spec.nodes.append({
      [CATCH_ALL_NODE_NAME]: {
        content: 'inline*',
        group: 'block',
        parseDOM: [{ tag: '*' }],
      },
    }),
  });

  catchAllSchemaCache.set(baseSchema, cached);
  return cached;
}

/**
 * Parses an element with a catch-all schema to detect unsupported content.
 * Returns an aggregated list of unsupported items grouped by tagName.
 *
 * @param {Element} element - The DOM element to parse
 * @param {Schema} schema - The real editor schema
 * @returns {UnsupportedContentItem[]}
 */
export function detectUnsupportedContent(element, schema) {
  /** @type {Map<string, UnsupportedContentItem>} */
  const itemsByTag = new Map();

  const knownTags = collectKnownTags(schema);
  scanForUnsupported(element, knownTags, itemsByTag);

  return Array.from(itemsByTag.values());
}

/** @type {WeakMap<Schema, Set<string>>} */
const knownTagsCache = new WeakMap();

/**
 * Collect all tag names that the schema knows how to parse (cached per schema).
 * @param {Schema} schema
 * @returns {Set<string>}
 */
function collectKnownTags(schema) {
  const cached = knownTagsCache.get(schema);
  if (cached) return cached;

  const tags = new Set();

  // Collect from nodes
  // NOTE: parseDOM may be a function in super-editor extensions (non-standard),
  // so we cast to unknown to keep the runtime guard while satisfying TS.
  for (const nodeType of Object.values(schema.nodes)) {
    const raw = /** @type {unknown} */ (nodeType.spec.parseDOM);
    if (!raw) continue;
    const rules = typeof raw === 'function' ? raw() : /** @type {any[]} */ (raw);
    for (const rule of rules) {
      if (rule.tag) {
        const match = rule.tag.match(/^([a-zA-Z][a-zA-Z0-9-]*)/);
        if (match) tags.add(match[1].toUpperCase());
      }
    }
  }

  // Collect from marks
  for (const markType of Object.values(schema.marks)) {
    const raw = /** @type {unknown} */ (markType.spec.parseDOM);
    if (!raw) continue;
    const rules = typeof raw === 'function' ? raw() : /** @type {any[]} */ (raw);
    for (const rule of rules) {
      if (rule.tag) {
        const match = rule.tag.match(/^([a-zA-Z][a-zA-Z0-9-]*)/);
        if (match) tags.add(match[1].toUpperCase());
      }
    }
  }

  // Always consider basic structural tags as known (they wrap content, not dropped)
  for (const tag of ['HTML', 'HEAD', 'BODY', 'DIV', 'SPAN']) {
    tags.add(tag);
  }

  knownTagsCache.set(schema, tags);
  return tags;
}

/**
 * Recursively scan DOM for elements whose tag is not in the known set.
 *
 * When an unknown tag has descendants with known tags (e.g. `<thead>` wrapping
 * `<tr>`), ProseMirror "looks through" the wrapper and parses the children.
 * Those transparent wrappers are NOT reported — only elements whose entire
 * subtree is also unknown (truly dropped content) are reported.
 *
 * @param {Element} element
 * @param {Set<string>} knownTags
 * @param {Map<string, UnsupportedContentItem>} itemsByTag
 */
function scanForUnsupported(element, knownTags, itemsByTag) {
  for (let i = 0; i < element.children.length; i++) {
    const child = element.children[i];
    const tag = child.tagName.toUpperCase();

    if (!knownTags.has(tag)) {
      // ProseMirror "looks through" unknown wrappers and parses their
      // children — including text nodes and known elements. Only report
      // elements whose content is truly lost (no text, no known descendants).
      if (hasPreservableContent(child, knownTags)) {
        scanForUnsupported(child, knownTags, itemsByTag);
        continue;
      }

      const existing = itemsByTag.get(tag);
      if (existing) {
        existing.count++;
      } else {
        let outerHTML = child.outerHTML;
        if (outerHTML.length > MAX_OUTER_HTML_LENGTH) {
          outerHTML = outerHTML.slice(0, MAX_OUTER_HTML_LENGTH) + '…';
        }
        itemsByTag.set(tag, { tagName: tag, outerHTML, count: 1 });
      }
    } else {
      // Known tag — recurse into children to find nested unsupported elements
      scanForUnsupported(child, knownTags, itemsByTag);
    }
  }
}

/**
 * Returns true if ProseMirror will preserve content from this element —
 * either because it contains non-whitespace text or a known descendant element.
 * @param {Element} element
 * @param {Set<string>} knownTags
 * @returns {boolean}
 */
function hasPreservableContent(element, knownTags) {
  if (element.textContent && element.textContent.trim().length > 0) return true;
  for (let i = 0; i < element.children.length; i++) {
    const child = element.children[i];
    if (knownTags.has(child.tagName.toUpperCase())) return true;
    if (hasPreservableContent(child, knownTags)) return true;
  }
  return false;
}
