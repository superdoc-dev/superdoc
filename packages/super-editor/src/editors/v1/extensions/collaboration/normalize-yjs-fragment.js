import { XmlElement, XmlText } from 'yjs';

const CROSS_REFERENCE_NODE_NAME = 'crossReference';
const CITATION_NODE_NAME = 'citation';
const SCHEMA_ATOM_NODE_NAMES = new Set([CROSS_REFERENCE_NODE_NAME, CITATION_NODE_NAME]);
const NORMALIZE_YJS_FRAGMENT_ORIGIN = Symbol.for('superdoc/yjs-fragment-normalize');

/**
 * Imported Word field atoms can carry cached result runs in the shared
 * Yjs XML, but the ProseMirror node is intentionally a leaf atom. Strip only
 * those cached Yjs children before y-prosemirror hydrates the fragment, after
 * preserving their visible text in the canonical resolvedText attr.
 *
 * @param {import('yjs').XmlFragment | null | undefined} fragment
 * @returns {boolean}
 */
export function normalizeYjsFragmentForSchema(fragment) {
  if (!isTraversableYjsXml(fragment)) return false;

  let changed = false;
  const normalize = () => {
    changed = stripSchemaAtomChildren(fragment) || changed;
  };

  if (fragment.doc) {
    fragment.doc.transact(normalize, NORMALIZE_YJS_FRAGMENT_ORIGIN);
  } else {
    normalize();
  }

  return changed;
}

/**
 * @param {Array<{ target?: unknown }> | null | undefined} events
 * @param {import('yjs').XmlFragment | null | undefined} fallbackFragment
 * @returns {boolean}
 */
export function normalizeYjsFragmentEventsForSchema(events, fallbackFragment) {
  if (!Array.isArray(events) || events.length === 0) {
    return normalizeYjsFragmentForSchema(fallbackFragment);
  }

  if (events.some((event) => event?.transaction?.origin === NORMALIZE_YJS_FRAGMENT_ORIGIN)) {
    return false;
  }

  let changed = false;
  const normalize = () => {
    const visited = new Set();
    for (const event of events) {
      const target = findNormalizableEventTarget(event?.target);
      if (!isTraversableYjsXml(target) || visited.has(target)) continue;
      visited.add(target);
      changed = stripSchemaAtomChildren(target) || changed;
    }
  };

  const doc = fallbackFragment?.doc || findEventDoc(events);
  if (doc) {
    doc.transact(normalize, NORMALIZE_YJS_FRAGMENT_ORIGIN);
  } else {
    normalize();
  }

  return changed;
}

/**
 * @param {import('yjs').XmlFragment | import('yjs').XmlElement} parent
 * @returns {boolean}
 */
function stripSchemaAtomChildren(parent) {
  if (!isTraversableYjsXml(parent)) return false;

  if (parent instanceof XmlElement && SCHEMA_ATOM_NODE_NAMES.has(parent.nodeName)) {
    return normalizeSchemaAtomElement(parent);
  }

  let changed = false;

  for (const child of parent.toArray()) {
    if (!(child instanceof XmlElement)) continue;

    if (SCHEMA_ATOM_NODE_NAMES.has(child.nodeName)) {
      changed = normalizeSchemaAtomElement(child) || changed;
      continue;
    }

    changed = stripSchemaAtomChildren(child) || changed;
  }

  return changed;
}

/**
 * @param {import('yjs').XmlElement} element
 * @returns {boolean}
 */
function normalizeSchemaAtomElement(element) {
  let changed = false;

  if (isEmptyResolvedText(element.getAttribute('resolvedText'))) {
    const visibleText = extractVisibleXmlText(element);
    if (visibleText.length > 0) {
      element.setAttribute('resolvedText', visibleText);
      changed = true;
    }
  }

  if (element.length > 0) {
    element.delete(0, element.length);
    changed = true;
  }

  return changed;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isEmptyResolvedText(value) {
  return typeof value !== 'string' || value.length === 0;
}

/**
 * @param {import('yjs').XmlElement | import('yjs').XmlFragment} parent
 * @returns {string}
 */
function extractVisibleXmlText(parent) {
  let text = '';

  for (const child of parent.toArray()) {
    if (child instanceof XmlText) {
      text += extractVisibleTextFromXmlText(child);
    } else if (child instanceof XmlElement) {
      text += extractVisibleXmlText(child);
    }
  }

  return text;
}

/**
 * `XmlText#toString()` serializes formatting as XML-like tags; we only want the
 * visible string content when backfilling field result text.
 *
 * @param {import('yjs').XmlText} textNode
 * @returns {string}
 */
function extractVisibleTextFromXmlText(textNode) {
  return textNode.toDelta().reduce((visibleText, op) => {
    return typeof op.insert === 'string' ? visibleText + op.insert : visibleText;
  }, '');
}

function findNormalizableEventTarget(target) {
  let current = target;
  while (current) {
    if (current instanceof XmlElement && SCHEMA_ATOM_NODE_NAMES.has(current.nodeName)) {
      return current;
    }
    current = current.parent;
  }

  return target;
}

function findEventDoc(events) {
  for (const event of events) {
    const doc = event?.target?.doc;
    if (doc) return doc;
  }
  return null;
}

function isTraversableYjsXml(value) {
  return Boolean(value && typeof value.toArray === 'function');
}
