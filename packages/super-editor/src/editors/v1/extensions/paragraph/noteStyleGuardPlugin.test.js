/**
 * SD-3432: the note style guard is the net under every paragraph creator the
 * per-command wrappers miss (gap-selection createParagraphNear, WebKit DOM
 * reparses). Any top-level paragraph that ends a transaction without a
 * styleId in a note session is re-stamped from its nearest styled sibling.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { initTestEditor } from '../../tests/helpers/helpers.js';

const styledParagraph = (text, styleId = 'FootnoteText') => ({
  type: 'paragraph',
  attrs: { paragraphProperties: { styleId } },
  content: [{ type: 'run', content: [{ type: 'text', text }] }],
});

const NOTE_DOC = {
  type: 'doc',
  content: [styledParagraph('First note line'), styledParagraph('Second note line')],
};

function makeEditor({ noteSession = true } = {}) {
  const { editor } = initTestEditor({ loadFromSchema: true, content: NOTE_DOC });
  if (noteSession) {
    // What createStoryEditor sets up for footnote/endnote sessions.
    editor.options.parentEditor = {};
    editor.options.isHeaderOrFooter = false;
  }
  return editor;
}

function paragraphStyleIds(editor) {
  const ids = [];
  editor.state.doc.forEach((node) => {
    if (node.type.name === 'paragraph') ids.push(node.attrs?.paragraphProperties?.styleId ?? null);
  });
  return ids;
}

/** Insert a complete default-attrs paragraph (what createParagraphNear and
 * DOM reparses produce) at the given top-level child index. */
function insertDefaultParagraph(editor, childIndex) {
  let pos = 0;
  for (let i = 0; i < childIndex; i += 1) pos += editor.state.doc.child(i).nodeSize;
  const paragraph = editor.schema.nodes.paragraph.createAndFill();
  editor.dispatch(editor.state.tr.insert(pos, paragraph));
}

describe('note style guard plugin (SD-3432)', () => {
  let editor;

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it('re-stamps a default-attrs paragraph inserted between styled siblings', () => {
    editor = makeEditor();
    insertDefaultParagraph(editor, 1);
    expect(paragraphStyleIds(editor)).toEqual(['FootnoteText', 'FootnoteText', 'FootnoteText']);
  });

  it('re-stamps a default-attrs paragraph appended at the end (previous sibling wins)', () => {
    editor = makeEditor();
    insertDefaultParagraph(editor, 2);
    expect(paragraphStyleIds(editor)).toEqual(['FootnoteText', 'FootnoteText', 'FootnoteText']);
  });

  it('re-stamps a default-attrs paragraph at the start from the next sibling', () => {
    editor = makeEditor();
    insertDefaultParagraph(editor, 0);
    expect(paragraphStyleIds(editor)).toEqual(['FootnoteText', 'FootnoteText', 'FootnoteText']);
  });

  it('copies the full paragraphProperties of the styled sibling', () => {
    editor = makeEditor();
    insertDefaultParagraph(editor, 1);
    const stamped = editor.state.doc.child(1);
    expect(stamped.attrs.paragraphProperties).toEqual({ styleId: 'FootnoteText' });
  });

  it('leaves paragraphs with an explicit different style alone', () => {
    editor = makeEditor();
    const second = editor.state.doc.child(0).nodeSize;
    editor.dispatch(
      editor.state.tr.setNodeMarkup(second, undefined, {
        ...editor.state.doc.child(1).attrs,
        paragraphProperties: { styleId: 'Heading1' },
      }),
    );
    expect(paragraphStyleIds(editor)).toEqual(['FootnoteText', 'Heading1']);
  });

  it('does nothing outside note story sessions', () => {
    editor = makeEditor({ noteSession: false });
    insertDefaultParagraph(editor, 1);
    expect(paragraphStyleIds(editor)).toEqual(['FootnoteText', null, 'FootnoteText']);
  });

  it('does nothing when no paragraph carries a styleId to copy', () => {
    editor = makeEditor();
    // Strip both styles in one transaction, then insert a default paragraph.
    let tr = editor.state.tr;
    let pos = 0;
    editor.state.doc.forEach((node) => {
      tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, paragraphProperties: null });
      pos += node.nodeSize;
    });
    editor.dispatch(tr);
    insertDefaultParagraph(editor, 1);
    expect(paragraphStyleIds(editor)).toEqual([null, null, null]);
  });
});
