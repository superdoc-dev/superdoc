/**
 * SDT property mutation helpers — writes to sdtPr children and node attributes.
 *
 * sdtPr is stored in XML-JSON element form:
 *   { name: 'w:sdtPr', elements: [ { name: 'w:id', attributes: {...} }, ... ] }
 *
 * All helpers here operate on the `elements` array to stay consistent with
 * the importer (handle-structured-content-node.js) and exporter
 * (translate-structured-content.js).
 */

import type { Editor } from '../../../core/Editor.js';
import type { ContentControlTarget } from '@superdoc/document-api';
import { resolveSdtByTarget, SDT_NODE_NAMES } from './target-resolution.js';

// ---------------------------------------------------------------------------
// XML element helpers for sdtPr.elements
// ---------------------------------------------------------------------------

interface SdtPrElement {
  name: string;
  type?: string;
  attributes?: Record<string, unknown>;
  elements?: SdtPrElement[];
  [key: string]: unknown;
}

/** Find a child element by name within sdtPr.elements. */
export function findSdtPrChild(sdtPr: SdtPrElement | undefined, childName: string): SdtPrElement | undefined {
  return sdtPr?.elements?.find((el) => el.name === childName);
}

/** Get the attributes object of a named sdtPr child element. */
export function getSdtPrChildAttrs(
  sdtPr: SdtPrElement | undefined,
  childName: string,
): Record<string, unknown> | undefined {
  return findSdtPrChild(sdtPr, childName)?.attributes as Record<string, unknown> | undefined;
}

/**
 * Clone sdtPr and upsert a child element by name.
 * If a child with the given name exists, it is replaced. Otherwise it is appended.
 * Returns the new sdtPr object (immutable update).
 */
function upsertSdtPrChild(sdtPr: SdtPrElement, childName: string, replacement: SdtPrElement): SdtPrElement {
  const elements = sdtPr.elements ? [...sdtPr.elements] : [];
  const idx = elements.findIndex((el) => el.name === childName);
  if (idx >= 0) {
    elements[idx] = replacement;
  } else {
    elements.push(replacement);
  }
  return { ...sdtPr, elements };
}

/**
 * Clone sdtPr and remove a child element by name.
 * Returns the new sdtPr object (immutable update).
 */
function removeSdtPrChild(sdtPr: SdtPrElement, childName: string): SdtPrElement {
  if (!sdtPr.elements) return sdtPr;
  return { ...sdtPr, elements: sdtPr.elements.filter((el) => el.name !== childName) };
}

// ---------------------------------------------------------------------------
// Attribute update
// ---------------------------------------------------------------------------

/**
 * PM node-type names that carry a content-control SDT identity. Imported from
 * `target-resolution.ts` so the search here resolves the same nodes the
 * upstream `resolveSdtByTarget` would resolve. `documentSection` and
 * `documentPartObject` are intentionally not in `SDT_NODE_NAMES` — they have
 * their own write paths and could otherwise collide on `id` and cause this
 * loop to find and mutate the wrong node.
 */
const SDT_NODE_TYPES = new Set<string>(SDT_NODE_NAMES);

/**
 * Apply an attribute patch to an SDT node.
 *
 * Uses `tr.setNodeAttribute` per key, which emits PM AttrSteps. AttrSteps
 * have no `from`/`to` range and are explicitly skipped by the structured-
 * content lock plugin's `filterTransaction`, so this path can mutate
 * metadata (id, tag, alias, lockMode, controlType, sdtPr, appearance, ...)
 * on `sdtLocked` and `sdtContentLocked` controls without tripping the
 * wrapper-damage check.
 *
 * The previous implementation delegated to `editor.commands.updateStructuredContentById`,
 * which dispatches `tr.replaceWith(pos, pos + node.nodeSize, ...)`. That
 * step's range covered the entire SDT, which the lock plugin read as
 * wrapper damage and silently filtered for locked controls — producing
 * false-success mutations.
 *
 * Returns true if a matching SDT was found and the transaction dispatched,
 * false if no SDT matched the given id or the editor cannot dispatch.
 */
export function applyAttrsUpdate(editor: Editor, nodeId: string, attrsPatch: Record<string, unknown>): boolean {
  if (!editor?.state) return false;

  let foundPos: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (foundPos !== null) return false;
    if (SDT_NODE_TYPES.has(node.type.name) && String(node.attrs.id) === String(nodeId)) {
      foundPos = pos;
      return false;
    }
    return true;
  });

  if (foundPos === null) return false;

  const tr = editor.state.tr;
  for (const [key, value] of Object.entries(attrsPatch)) {
    tr.setNodeAttribute(foundPos, key, value);
  }

  if (tr.steps.length === 0) return true;

  if (editor.view?.dispatch) {
    editor.view.dispatch(tr);
  } else if (typeof editor.dispatch === 'function') {
    editor.dispatch(tr);
  } else {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// sdtPr child update (XML-element-form aware)
// ---------------------------------------------------------------------------

/**
 * Resolve the current sdtPr, apply an updater that mutates a named child
 * element, then write the entire sdtPr back via attrs update.
 *
 * The `updater` receives the current child element (or undefined) and returns
 * the replacement element. Return `null` to remove the child.
 */
export function updateSdtPrChild(
  editor: Editor,
  target: ContentControlTarget,
  childName: string,
  updater: (child: SdtPrElement | undefined) => SdtPrElement | null,
): boolean {
  const resolved = resolveSdtByTarget(editor.state.doc, target);
  const currentSdtPr = (resolved.node.attrs.sdtPr ?? { name: 'w:sdtPr', elements: [] }) as SdtPrElement;
  const existingChild = findSdtPrChild(currentSdtPr, childName);
  const replacement = updater(existingChild);

  let newSdtPr: SdtPrElement;
  if (replacement === null) {
    newSdtPr = removeSdtPrChild(currentSdtPr, childName);
  } else {
    newSdtPr = upsertSdtPrChild(currentSdtPr, childName, replacement);
  }

  return applyAttrsUpdate(editor, target.nodeId, { sdtPr: newSdtPr });
}

/**
 * Convenience: set an attribute on a named sdtPr child element.
 * Creates the child element if it doesn't exist.
 */
export function updateSdtPrChildAttr(
  editor: Editor,
  target: ContentControlTarget,
  childName: string,
  attrName: string,
  value: string,
): boolean {
  return updateSdtPrChild(editor, target, childName, (existing) => ({
    name: childName,
    type: 'element',
    ...existing,
    attributes: { ...(existing?.attributes ?? {}), [attrName]: value },
  }));
}

/**
 * Convenience: remove an attribute from a named sdtPr child element.
 */
export function removeSdtPrChildAttr(
  editor: Editor,
  target: ContentControlTarget,
  childName: string,
  attrName: string,
): boolean {
  return updateSdtPrChild(editor, target, childName, (existing) => {
    if (!existing) return null;
    const attrs = { ...(existing.attributes ?? {}) };
    delete attrs[attrName];
    return { ...existing, attributes: attrs };
  });
}

/**
 * Convenience: find or create a sub-element within a sdtPr child,
 * then set an attribute on it. Commonly used for nested structures like
 * w:date > w:dateFormat, w14:checkbox > w14:checked, etc.
 */
export function updateSdtPrSubElementAttr(
  editor: Editor,
  target: ContentControlTarget,
  childName: string,
  subName: string,
  attrName: string,
  value: string,
): boolean {
  return updateSdtPrChild(editor, target, childName, (existing) => {
    const el: SdtPrElement = existing ?? { name: childName, type: 'element', elements: [] };
    const elements = el.elements ? [...el.elements] : [];
    const idx = elements.findIndex((e) => e.name === subName);
    const subEl: SdtPrElement = { name: subName, type: 'element', attributes: { [attrName]: value } };
    if (idx >= 0) {
      elements[idx] = { ...elements[idx], attributes: { ...(elements[idx].attributes ?? {}), [attrName]: value } };
    } else {
      elements.push(subEl);
    }
    return { ...el, elements };
  });
}

/**
 * Convenience: remove a sub-element from a sdtPr child by name.
 */
export function removeSdtPrSubElement(
  editor: Editor,
  target: ContentControlTarget,
  childName: string,
  subName: string,
): boolean {
  return updateSdtPrChild(editor, target, childName, (existing) => {
    if (!existing?.elements) return existing ?? null;
    return { ...existing, elements: existing.elements.filter((e) => e.name !== subName) };
  });
}

/**
 * Convenience: replace all sub-elements within a sdtPr child.
 * Useful for updating choice list items or checkbox symbol pairs.
 */
export function replaceSdtPrSubElements(
  editor: Editor,
  target: ContentControlTarget,
  childName: string,
  elements: SdtPrElement[],
): boolean {
  return updateSdtPrChild(editor, target, childName, (existing) => ({
    name: childName,
    type: 'element',
    ...existing,
    elements,
  }));
}

// Re-export element helpers for use in patchRawProperties and resolvers
export { upsertSdtPrChild, removeSdtPrChild, type SdtPrElement };
