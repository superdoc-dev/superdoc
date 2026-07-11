import { afterEach, describe, expect, it } from 'vitest';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { NodeSelection, TextSelection } from 'prosemirror-state';
import type { SelectionTarget } from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';
import { resolveSelectionTarget } from '../helpers/selection-target-resolver.js';
import { metadataAttachWrapper, metadataListWrapper, metadataRemoveWrapper } from './anchored-metadata-wrappers.js';
import { registerBuiltInExecutors } from './register-executors.js';
import { initTestEditor } from '@tests/helpers/helpers.js';

registerBuiltInExecutors();

const BLOCK_ID = 'metadata-anchor-p1';
const NAMESPACE = 'urn:test:metadata';

type FoundAnchor = {
  node: ProseMirrorNode;
  pos: number;
};

function makeEditor(text = 'abcdefghij'): Editor {
  return initTestEditor({
    loadFromSchema: true,
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { paraId: BLOCK_ID, sdBlockId: BLOCK_ID },
          content: [{ type: 'run', attrs: {}, content: [{ type: 'text', text }] }],
        },
      ],
    },
    user: { name: 'Integration User', email: 'integration@example.com' },
  }).editor as Editor;
}

function textTarget(start: number, end: number): SelectionTarget {
  return {
    kind: 'selection',
    start: { kind: 'text', blockId: BLOCK_ID, offset: start },
    end: { kind: 'text', blockId: BLOCK_ID, offset: end },
  };
}

function findInlineAnchors(editor: Editor): FoundAnchor[] {
  const anchors: FoundAnchor[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'structuredContent') anchors.push({ node, pos });
    return true;
  });
  return anchors;
}

// Headless test editors have no mounted view; dispatch mirrors the
// adapter's own view-or-editor fallback.
function dispatchTr(editor: Editor, tr: ReturnType<Editor['state']['tr']['setSelection']>): void {
  if (editor.view?.dispatch) {
    editor.view.dispatch(tr);
    return;
  }
  editor.dispatch(tr);
}

function selectFormerAnchorRange(editor: Editor, target: SelectionTarget): void {
  const { absFrom, absTo } = resolveSelectionTarget(editor, target);
  dispatchTr(editor, editor.state.tr.setSelection(TextSelection.create(editor.state.doc, absFrom, absTo)));
}

describe('anchored metadata anchors', () => {
  let editor: Editor | undefined;

  afterEach(() => {
    editor?.destroy();
    editor = undefined;
  });

  it('preserves an unrelated selection when removing an anchor by id', () => {
    editor = makeEditor();

    const attached = metadataAttachWrapper(editor, {
      id: 'meta-a',
      target: textTarget(6, 9),
      namespace: NAMESPACE,
      payload: { label: 'A' },
    });
    expect(attached.success).toBe(true);

    // Park the user's selection well before the anchor.
    dispatchTr(editor, editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 2, 4)));
    const before = editor.state.selection;

    const removed = metadataRemoveWrapper(editor, { id: 'meta-a' });
    expect(removed.success).toBe(true);

    // Removal by id must not steal a selection that never touched the anchor.
    expect(editor.state.selection).toBeInstanceOf(TextSelection);
    expect(editor.state.selection.from).toBe(before.from);
    expect(editor.state.selection.to).toBe(before.to);
  });

  it('does not reject attach over a foreign content control whose tag collides with a metadata id', () => {
    editor = makeEditor();

    const attached = metadataAttachWrapper(editor, {
      id: 'meta-a',
      target: textTarget(1, 3),
      namespace: NAMESPACE,
      payload: { label: 'A' },
    });
    expect(attached.success).toBe(true);

    // Forge a foreign inline content control elsewhere whose w:tag equals the
    // stored metadata id but which was not created by metadata.attach (no
    // 'Anchored metadata' alias, no hidden appearance).
    const anchors = findInlineAnchors(editor);
    expect(anchors.length).toBe(1);
    const sdtType = anchors[0]!.node.type;
    const { absFrom, absTo } = resolveSelectionTarget(editor, textTarget(6, 7));
    const foreign = sdtType.create(
      { id: '999999', tag: 'meta-a', alias: 'Customer control', controlType: 'richText', type: 'richText' },
      editor.state.schema.text('x'),
    );
    dispatchTr(editor, editor.state.tr.replaceWith(absFrom, absTo, foreign));

    // Attaching over the foreign control must not be misclassified as an
    // overlap with our own anchor.
    const second = metadataAttachWrapper(editor, {
      id: 'meta-b',
      target: textTarget(5, 8),
      namespace: NAMESPACE,
      payload: { label: 'B' },
    });
    expect(second.success).toBe(true);
  });

  it('rejects a partially overlapping attach without duplicating the existing anchor', () => {
    editor = makeEditor();

    const first = metadataAttachWrapper(editor, {
      id: 'meta-a',
      target: textTarget(2, 6),
      namespace: NAMESPACE,
      payload: { label: 'A' },
    });
    expect(first.success).toBe(true);
    const before = editor.state.doc.toJSON();

    const crossing = metadataAttachWrapper(editor, {
      id: 'meta-b',
      target: textTarget(4, 8),
      namespace: NAMESPACE,
      payload: { label: 'B' },
    });

    expect(crossing).toMatchObject({ success: false, failure: { code: 'INVALID_TARGET' } });
    expect(editor.state.doc.toJSON()).toEqual(before);

    const anchors = findInlineAnchors(editor);
    expect(anchors).toHaveLength(1);
    expect(anchors[0].node.attrs.tag).toBe('meta-a');
    expect(anchors[0].node.textContent).toBe('cdef');
    expect(new Set(anchors.map((anchor) => anchor.node.attrs.tag)).size).toBe(anchors.length);
    expect(new Set(anchors.map((anchor) => anchor.node.attrs.id)).size).toBe(anchors.length);
    expect(metadataListWrapper(editor).items.map((item) => item.id)).toEqual(['meta-a']);
  });

  it.each([
    { label: 'inside an existing anchor', target: textTarget(3, 5) },
    { label: 'around an existing anchor', target: textTarget(1, 8) },
  ])('rejects an attach $label without mutating the existing anchor', ({ target }) => {
    editor = makeEditor();

    const first = metadataAttachWrapper(editor, {
      id: 'meta-a',
      target: textTarget(2, 6),
      namespace: NAMESPACE,
      payload: { label: 'A' },
    });
    expect(first.success).toBe(true);
    const before = editor.state.doc.toJSON();

    const overlapping = metadataAttachWrapper(editor, {
      id: 'meta-b',
      target,
      namespace: NAMESPACE,
      payload: { label: 'B' },
    });

    expect(overlapping).toMatchObject({ success: false, failure: { code: 'INVALID_TARGET' } });
    expect(editor.state.doc.toJSON()).toEqual(before);

    const anchors = findInlineAnchors(editor);
    expect(anchors).toHaveLength(1);
    expect(anchors[0].node.attrs.tag).toBe('meta-a');
    expect(anchors[0].node.textContent).toBe('cdef');
    expect(metadataListWrapper(editor).items.map((item) => item.id)).toEqual(['meta-a']);
  });

  it('attach dry-run does not mutate the document or metadata storage', () => {
    editor = makeEditor();
    const before = editor.state.doc.toJSON();

    const preview = metadataAttachWrapper(
      editor,
      {
        id: 'meta-dry',
        target: textTarget(2, 6),
        namespace: NAMESPACE,
        payload: { label: 'Preview' },
      },
      { changeMode: 'direct', dryRun: true },
    );

    expect(preview).toMatchObject({ success: true, id: 'meta-dry', partName: 'customXml/item1.xml' });
    expect(editor.state.doc.toJSON()).toEqual(before);
    expect(findInlineAnchors(editor)).toHaveLength(0);
    expect(metadataListWrapper(editor).total).toBe(0);
  });

  it('remove unwraps the anchor and leaves a collapsed TextSelection that can select the former range', () => {
    editor = makeEditor();
    const target = textTarget(2, 6);

    expect(
      metadataAttachWrapper(editor, {
        id: 'meta-remove',
        target,
        namespace: NAMESPACE,
        payload: { label: 'Remove' },
      }).success,
    ).toBe(true);

    const [anchor] = findInlineAnchors(editor);
    expect(anchor).toBeDefined();
    selectFormerAnchorRange(editor, target);

    const removed = metadataRemoveWrapper(editor, { id: 'meta-remove' }, { changeMode: 'direct' });

    expect(removed).toEqual({ success: true, id: 'meta-remove' });
    expect(findInlineAnchors(editor)).toHaveLength(0);
    expect(editor.state.selection).toBeInstanceOf(TextSelection);
    expect(editor.state.selection.from).toBe(anchor.pos);
    expect(editor.state.selection.to).toBe(anchor.pos);

    selectFormerAnchorRange(editor, target);
    expect(editor.state.selection).toBeInstanceOf(TextSelection);
    expect(editor.state.selection.from).toBeLessThan(editor.state.selection.to);
    expect(editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)).toBe('cdef');
  });

  it('remove normalizes a NodeSelection on the anchor before dispatching', () => {
    editor = makeEditor();

    expect(
      metadataAttachWrapper(editor, {
        id: 'meta-node-selection',
        target: textTarget(2, 6),
        namespace: NAMESPACE,
        payload: { label: 'NodeSelection' },
      }).success,
    ).toBe(true);

    const [anchor] = findInlineAnchors(editor);
    expect(anchor).toBeDefined();
    dispatchTr(editor, editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, anchor.pos)));
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);

    const removed = metadataRemoveWrapper(editor, { id: 'meta-node-selection' }, { changeMode: 'direct' });

    expect(removed).toEqual({ success: true, id: 'meta-node-selection' });
    expect(findInlineAnchors(editor)).toHaveLength(0);
    expect(editor.state.selection).toBeInstanceOf(TextSelection);
    expect(editor.state.selection.from).toBe(anchor.pos);
    expect(editor.state.selection.to).toBe(anchor.pos);

    selectFormerAnchorRange(editor, textTarget(2, 6));
    expect(editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)).toBe('cdef');
  });

  it('leaves a collapsed caret sitting exactly on the anchor end boundary untouched when removing by id', () => {
    editor = makeEditor();

    expect(
      metadataAttachWrapper(editor, {
        id: 'meta-end-boundary',
        target: textTarget(2, 6),
        namespace: NAMESPACE,
        payload: { label: 'End boundary' },
      }).success,
    ).toBe(true);

    const [anchor] = findInlineAnchors(editor);
    expect(anchor).toBeDefined();
    const from = anchor.pos;
    const endBoundary = anchor.pos + anchor.node.nodeSize;
    const contentSize = anchor.node.content.size;

    // Park a collapsed caret exactly on the wrapper's end boundary. It is
    // adjacent to the wrapper, not inside it, so removal must not move it.
    dispatchTr(editor, editor.state.tr.setSelection(TextSelection.create(editor.state.doc, endBoundary)));
    expect(editor.state.selection.empty).toBe(true);

    const removed = metadataRemoveWrapper(editor, { id: 'meta-end-boundary' }, { changeMode: 'direct' });

    expect(removed).toEqual({ success: true, id: 'meta-end-boundary' });
    expect(findInlineAnchors(editor)).toHaveLength(0);
    expect(editor.state.selection).toBeInstanceOf(TextSelection);
    expect(editor.state.selection.empty).toBe(true);

    // The caret maps to the end of the reinserted content (right after 'f'),
    // its original text location, and does NOT jump to the anchor start.
    expect(editor.state.selection.from).toBe(from + contentSize);
    expect(editor.state.selection.from).not.toBe(from);
    expect(editor.state.doc.textBetween(from, editor.state.selection.from)).toBe('cdef');
  });

  it('wraps same-run selected content in a run inside the metadata SDT', () => {
    editor = makeEditor();

    expect(
      metadataAttachWrapper(editor, {
        id: 'meta-run-shape',
        target: textTarget(2, 6),
        namespace: NAMESPACE,
        payload: { label: 'Run shape' },
      }).success,
    ).toBe(true);

    const [anchor] = findInlineAnchors(editor);
    expect(anchor).toBeDefined();
    expect(anchor.node.childCount).toBe(1);
    expect(anchor.node.firstChild?.type.name).toBe('run');
    expect(anchor.node.firstChild?.textContent).toBe('cdef');
  });
});
