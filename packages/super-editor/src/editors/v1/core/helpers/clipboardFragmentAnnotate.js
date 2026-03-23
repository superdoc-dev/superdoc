import { DOMSerializer as PmDOMSerializer } from 'prosemirror-model';
import { ListHelpers } from '@helpers/list-numbering-helpers.js';

/**
 * Clipboard HTML helpers (browser):
 *
 * - {@link annotateFragmentDomWithClipboardData} — run on PM-serialized HTML (cut + copy fallback).
 *   Adds list/paragraph `data-*` from the document model; walks tables via `tbody`/`tr` so cells
 *   still match the fragment.
 *
 * - {@link mergeSerializedClipboardMetadataIntoDomContainer} — when copy uses the browser selection
 *   DOM (see `buildSelectionClipboardHtml`), structure can differ from the serializer mirror. We build
 *   a mirror, annotate it, then copy the same `data-*` onto matching `<p>` nodes in order.
 *
 * DOM shape must match `PmDOMSerializer` output (including table > tbody > tr).
 *
 * @param {HTMLElement} container
 * @param {import('prosemirror-model').Fragment} fragment
 * @param {import('../Editor').Editor} editor
 */
export function annotateFragmentDomWithClipboardData(container, fragment, editor) {
  if (!editor) return;
  const domChildren = Array.from(container.children);
  let domIndex = 0;

  fragment.forEach((pmNode) => {
    const domEl = domChildren[domIndex++];
    if (!domEl) return;
    annotatePmNodeOnClipboardDom(domEl, pmNode, editor);
  });
}

/**
 * Selection HTML from the browser differs from the serializer mirror; merge list-related attrs by stable order.
 *
 * @param {HTMLElement} container cloned selection HTML
 * @param {import('prosemirror-view').EditorView} view
 * @param {import('../Editor').Editor} editor
 */
export function mergeSerializedClipboardMetadataIntoDomContainer(container, view, editor) {
  if (!editor || !view || typeof document === 'undefined') return;
  const { from, to } = view.state.selection;
  if (from === to) return;

  const fragment = view.state.doc.slice(from, to).content;
  const mirror = document.createElement('div');
  mirror.appendChild(PmDOMSerializer.fromSchema(view.state.schema).serializeFragment(fragment));
  annotateFragmentDomWithClipboardData(mirror, fragment, editor);

  copyParagraphClipboardAttrsParallel(container, mirror);
}

const PARAGRAPH_CLIPBOARD_ATTRS = [
  'data-num-id',
  'data-level',
  'data-list-numbering-type',
  'data-indent',
  'data-spacing',
  'styleid',
  'data-justification',
  'data-marker-type',
  'data-list-level',
  'data-num-fmt',
  'data-lvl-text',
];

/**
 * @param {HTMLElement} target
 * @param {HTMLElement} source
 */
function copyParagraphClipboardAttrsParallel(target, source) {
  const src = source.querySelectorAll('p');
  const dst = target.querySelectorAll('p');
  const n = Math.min(src.length, dst.length);
  for (let i = 0; i < n; i += 1) {
    for (const attr of PARAGRAPH_CLIPBOARD_ATTRS) {
      if (src[i].hasAttribute(attr)) {
        dst[i].setAttribute(attr, src[i].getAttribute(attr) || '');
      }
    }
  }
}

/**
 * @param {HTMLElement} domEl
 * @param {import('prosemirror-model').Node} pmNode
 * @param {import('../Editor').Editor} editor
 */
function annotatePmNodeOnClipboardDom(domEl, pmNode, editor) {
  if (pmNode.type.name === 'paragraph') {
    const props = pmNode.attrs.paragraphProperties;
    if (props) {
      if (props.numberingProperties?.numId != null) {
        domEl.setAttribute('data-num-id', String(props.numberingProperties.numId));
      }
      if (props.numberingProperties?.ilvl != null) {
        domEl.setAttribute('data-level', String(props.numberingProperties.ilvl));
      }
      if (props.indent && Object.keys(props.indent).length) {
        domEl.setAttribute('data-indent', JSON.stringify(props.indent));
      }
      if (props.spacing && Object.keys(props.spacing).length) {
        domEl.setAttribute('data-spacing', JSON.stringify(props.spacing));
      }
      if (props.styleId) {
        domEl.setAttribute('styleid', props.styleId);
      }
      if (props.justification) {
        domEl.setAttribute('data-justification', props.justification);
      }
    }

    if (!domEl.hasAttribute('data-list-numbering-type') || !domEl.getAttribute('data-list-numbering-type')) {
      const numId = props?.numberingProperties?.numId;
      const level = props?.numberingProperties?.ilvl ?? 0;
      if (numId != null) {
        const lr = pmNode.attrs.listRendering;
        if (lr?.numberingType) {
          domEl.setAttribute('data-list-numbering-type', lr.numberingType);
        } else {
          try {
            const details = ListHelpers.getListDefinitionDetails({ numId, level, editor });
            if (details?.listNumberingType) {
              domEl.setAttribute('data-list-numbering-type', details.listNumberingType);
            }
          } catch {
            /* ignore */
          }
        }
      }
    }
    return;
  }

  if (pmNode.type.name === 'table') {
    const tbody = domEl.querySelector('tbody');
    const rowElements = tbody ? Array.from(tbody.children).filter((el) => el.tagName.toLowerCase() === 'tr') : [];
    let rowIndex = 0;
    pmNode.forEach((row) => {
      if (row.isInline) return;
      const rowDom = rowElements[rowIndex++];
      if (rowDom) {
        annotatePmNodeOnClipboardDom(rowDom, row, editor);
      }
    });
    return;
  }

  if (pmNode.isInline || !pmNode.childCount || !domEl.children.length) return;

  const childDoms = Array.from(domEl.children);
  let childIndex = 0;
  pmNode.forEach((child) => {
    if (child.isInline) return;
    const childDom = childDoms[childIndex++];
    if (childDom) {
      annotatePmNodeOnClipboardDom(childDom, child, editor);
    }
  });
}
