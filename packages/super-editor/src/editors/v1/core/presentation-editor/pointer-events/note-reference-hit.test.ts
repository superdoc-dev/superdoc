import { describe, it, expect } from 'vitest';
import { Schema, type Node as ProseMirrorNode } from 'prosemirror-model';
import { resolveNoteReferenceAtPointer } from './note-reference-hit.js';

// Mirrors the real document shape: note references are inline atoms wrapped in
// runs. Word's cross-reference bookmark (`_RefXXXX`) wraps the original note
// reference; the importer emits it as a FLAT bookmarkStart/bookmarkEnd marker
// pair (matched by id, both empty) with the reference between them — verified
// against the NVCA fixture. The schema also permits bookmarkStart to hold
// content, so the resolver supports both shapes.
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*' },
    run: { inline: true, group: 'inline', content: 'inline*' },
    bookmarkStart: {
      inline: true,
      group: 'inline',
      content: 'inline*',
      attrs: { name: { default: null }, id: { default: null } },
    },
    bookmarkEnd: {
      inline: true,
      group: 'inline',
      atom: true,
      attrs: { id: { default: null } },
    },
    footnoteReference: {
      inline: true,
      group: 'inline',
      atom: true,
      selectable: false,
      attrs: { id: { default: null } },
    },
    endnoteReference: {
      inline: true,
      group: 'inline',
      atom: true,
      selectable: false,
      attrs: { id: { default: null } },
    },
    crossReference: {
      inline: true,
      group: 'inline',
      atom: true,
      selectable: false,
      attrs: { target: { default: '' }, resolvedText: { default: '' } },
    },
    text: { group: 'inline' },
  },
  marks: {},
});

/**
 * Builds a doc shaped like the NVCA fixture's cross-reference pattern:
 *   p1: "See" + bookmarkStart(_Ref1)[ run[ <noteRef id=8> ] ] + "below"
 *   p2: "as noted in" + crossReference(target=_Ref1, "footnote 8")
 */
function makeDoc(
  noteRefType: 'footnoteReference' | 'endnoteReference' = 'footnoteReference',
  bookmarkContent?: ProseMirrorNode[],
) {
  const noteRef = schema.nodes[noteRefType].create({ id: '8' });
  const bookmark = schema.nodes.bookmarkStart.create(
    { name: '_Ref1', id: '1' },
    bookmarkContent ?? [schema.nodes.run.create(null, noteRef)],
  );
  const p1 = schema.node('paragraph', null, [
    schema.nodes.run.create(null, schema.text('See')),
    bookmark,
    schema.nodes.run.create(null, schema.text('below')),
  ]);
  const crossRef = schema.nodes.crossReference.create({ target: '_Ref1', resolvedText: 'footnote 8' });
  const p2 = schema.node('paragraph', null, [schema.nodes.run.create(null, schema.text('as noted in')), crossRef]);
  return schema.node('doc', null, [p1, p2]);
}

function findPos(doc: ProseMirrorNode, typeName: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found < 0 && node.type.name === typeName) {
      found = pos;
      return false;
    }
    return true;
  });
  return found;
}

function makeRefSpan(pmStart: number): HTMLElement {
  const el = document.createElement('span');
  el.setAttribute('data-pm-start', String(pmStart));
  document.body.appendChild(el);
  return el;
}

function resolveAt(doc: ProseMirrorNode, pmStart: number) {
  return resolveNoteReferenceAtPointer({
    target: makeRefSpan(pmStart),
    clientX: 5,
    clientY: 5,
    doc,
    ownerDocument: document,
  });
}

/**
 * The shape real imports produce (NVCA fixture):
 *   p1: "Dividends." + bookmarkStart(_Ref1, id=69) + run[<noteRef id=8>] + bookmarkEnd(id=69)
 *   p2: "as noted in" + crossReference(target=_Ref1)
 */
function makeFlatMarkerDoc(noteRefType: 'footnoteReference' | 'endnoteReference' = 'footnoteReference') {
  const noteRef = schema.nodes[noteRefType].create({ id: '8' });
  const p1 = schema.node('paragraph', null, [
    schema.nodes.run.create(null, schema.text('Dividends.')),
    schema.nodes.bookmarkStart.create({ name: '_Ref1', id: '69' }),
    schema.nodes.run.create(null, noteRef),
    schema.nodes.bookmarkEnd.create({ id: '69' }),
  ]);
  const crossRef = schema.nodes.crossReference.create({ target: '_Ref1', resolvedText: '1' });
  const p2 = schema.node('paragraph', null, [schema.nodes.run.create(null, schema.text('as noted in')), crossRef]);
  return schema.node('doc', null, [p1, p2]);
}

describe('resolveNoteReferenceAtPointer — cross-reference navigation (SD-3400)', () => {
  it.each([
    ['footnoteReference', 'footnote'],
    ['endnoteReference', 'endnote'],
  ])('resolves a crossReference across a flat %s bookmark marker pair (real import shape)', (refType, storyType) => {
    const doc = makeFlatMarkerDoc(refType as 'footnoteReference' | 'endnoteReference');

    const target = resolveAt(doc, findPos(doc, 'crossReference'));

    expect(target).toEqual({ storyType, noteId: '8' });
  });

  it('does not resolve a note that sits OUTSIDE the flat marker pair', () => {
    // The footnote ref here precedes the bookmarkStart — the bookmark range
    // holds plain text only, so the cross-ref is not a note reference.
    const noteRef = schema.nodes.footnoteReference.create({ id: '8' });
    const p1 = schema.node('paragraph', null, [
      schema.nodes.run.create(null, noteRef),
      schema.nodes.bookmarkStart.create({ name: '_Ref1', id: '69' }),
      schema.nodes.run.create(null, schema.text('Section 2')),
      schema.nodes.bookmarkEnd.create({ id: '69' }),
    ]);
    const crossRef = schema.nodes.crossReference.create({ target: '_Ref1', resolvedText: 'Section 2' });
    const p2 = schema.node('paragraph', null, [crossRef]);
    const doc = schema.node('doc', null, [p1, p2]);

    const target = resolveAt(doc, findPos(doc, 'crossReference'));

    expect(target).toBeNull();
  });

  it('resolves a crossReference to the footnote wrapped by its target bookmark', () => {
    const doc = makeDoc('footnoteReference');

    const target = resolveAt(doc, findPos(doc, 'crossReference'));

    expect(target).toEqual({ storyType: 'footnote', noteId: '8' });
  });

  it('resolves a crossReference to an endnote wrapped by its target bookmark', () => {
    const doc = makeDoc('endnoteReference');

    const target = resolveAt(doc, findPos(doc, 'crossReference'));

    expect(target).toEqual({ storyType: 'endnote', noteId: '8' });
  });

  it('returns null when the target bookmark holds no note reference (plain bookmark cross-ref)', () => {
    const doc = makeDoc('footnoteReference', [schema.nodes.run.create(null, schema.text('Section 2'))]);

    const target = resolveAt(doc, findPos(doc, 'crossReference'));

    expect(target).toBeNull();
  });

  it('returns null for a crossReference with no target', () => {
    const crossRef = schema.nodes.crossReference.create({ target: '', resolvedText: 'dangling' });
    const doc = schema.node('doc', null, [schema.node('paragraph', null, [crossRef])]);

    const target = resolveAt(doc, findPos(doc, 'crossReference'));

    expect(target).toBeNull();
  });

  it('still resolves a plain body footnote reference (regression)', () => {
    const doc = makeDoc('footnoteReference');

    const target = resolveAt(doc, findPos(doc, 'footnoteReference'));

    expect(target).toEqual({ storyType: 'footnote', noteId: '8' });
  });
});

describe('resolveNoteReferenceAtPointer — story-space guards (footer dblclick regression)', () => {
  function resolveTarget(doc: ProseMirrorNode, target: HTMLElement) {
    return resolveNoteReferenceAtPointer({ target, clientX: 5, clientY: 5, doc, ownerDocument: document });
  }

  it.each(['superdoc-page-header', 'superdoc-page-footer'])(
    'ignores pm-start elements inside a %s container (header/footer story space)',
    (containerClass) => {
      const doc = makeDoc('footnoteReference');
      const container = document.createElement('div');
      container.className = containerClass;
      const span = document.createElement('span');
      // A footer-local position that HAPPENS to resolve to a body note ref.
      span.setAttribute('data-pm-start', String(findPos(doc, 'footnoteReference')));
      container.appendChild(span);
      document.body.appendChild(container);

      expect(resolveTarget(doc, span)).toBeNull();
    },
  );

  it('ignores pm-start elements inside a rendered-note fragment (note story space)', () => {
    const doc = makeDoc('footnoteReference');
    const fragment = document.createElement('div');
    fragment.setAttribute('data-block-id', 'footnote-8-p0');
    const span = document.createElement('span');
    span.setAttribute('data-pm-start', String(findPos(doc, 'footnoteReference')));
    fragment.appendChild(span);
    document.body.appendChild(fragment);

    expect(resolveTarget(doc, span)).toBeNull();
  });

  it('returns null instead of throwing for a pm-start beyond the body document', () => {
    const doc = makeDoc('footnoteReference');
    const span = document.createElement('span');
    // Story-local offsets can exceed the body size; nodeAt would throw.
    span.setAttribute('data-pm-start', String(doc.content.size + 50));
    document.body.appendChild(span);

    expect(resolveTarget(doc, span)).toBeNull();
  });
});
