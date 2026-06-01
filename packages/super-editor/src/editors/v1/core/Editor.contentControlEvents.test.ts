/* @vitest-environment jsdom */

/**
 * Behavior coverage for the public content-control interaction events
 * (`contentControlFocus` / `contentControlBlur` / `contentControlClick`).
 *
 * Unlike the SuperDoc.vue bridge tests (which replay mocked payloads), these
 * drive a real headless editor with real `structuredContent` /
 * `structuredContentBlock` nodes and exercise the actual extraction
 * (`#collectActiveSdtRefs` / `#toSdtRef`), the focus/switch/blur state
 * machine, the click path, and source detection.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';

// SDT phrases sit between non-SDT padding so there are positions outside every
// control (for the blur/baseline cases).
const HOST = 'Start Alpha gap Charlie end';

function resolveBlockId(receipt) {
  if (!receipt || typeof receipt !== 'object') return null;
  const v = receipt;
  if (typeof v.target?.blockId === 'string' && v.target.blockId) return v.target.blockId;
  if (typeof v.resolution?.target?.blockId === 'string' && v.resolution.target.blockId)
    return v.resolution.target.blockId;
  return null;
}

describe('Editor content-control events', () => {
  let docData;
  beforeAll(async () => {
    docData = await loadTestDataForEditorTests('blank-doc.docx');
  });

  function makeEditor() {
    const { editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      isHeadless: true,
      useImmediateSetTimeout: false,
      user: { name: 'Test', email: 'test@example.com' },
    });
    return editor;
  }

  // Seed HOST and wrap two inline SDTs. Wrap the later phrase first so the
  // earlier phrase's offsets stay valid as wraps accumulate.
  async function seedTwoInlineSdts(editor) {
    const seed = await Promise.resolve(editor.doc.insert({ value: HOST }));
    const blockId = resolveBlockId(seed);
    if (!blockId) throw new Error('no blockId');
    const wrap = async (phrase, tag, alias) => {
      const start = HOST.indexOf(phrase);
      const end = start + phrase.length;
      const r = await Promise.resolve(
        editor.doc.create.contentControl({
          kind: 'inline',
          controlType: 'text',
          at: {
            kind: 'selection',
            start: { kind: 'text', blockId, offset: start },
            end: { kind: 'text', blockId, offset: end },
          },
          tag,
          alias,
        }),
      );
      expect(r.success).toBe(true);
    };
    await wrap('Charlie', 'cc-b', 'Control B');
    await wrap('Alpha', 'cc-a', 'Control A');
  }

  // Collect inline SDTs in document order with a position inside each.
  function findInlineSdts(editor) {
    const sdts = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'structuredContent') {
        sdts.push({ id: node.attrs.id, tag: node.attrs.tag, alias: node.attrs.alias, pos, inside: pos + 1 });
      }
      return true;
    });
    sdts.sort((a, b) => a.pos - b.pos);
    return sdts;
  }

  const selectAt = (editor, pos, meta) => {
    let tr = editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos));
    if (meta) tr = tr.setMeta('uiEvent', meta);
    editor.dispatch(tr);
  };

  // A position guaranteed to be outside every SDT (inside the trailing " end").
  const outsidePos = (editor) => Math.max(1, editor.state.doc.content.size - 2);

  it('emits focus, switch, and blur with correct refs and keyboard source', async () => {
    const editor = makeEditor();
    await seedTwoInlineSdts(editor);
    const sdts = findInlineSdts(editor);
    expect(sdts).toHaveLength(2);
    const [a, b] = sdts;

    // Baseline to a non-SDT position so the first tracked focus has previous=null.
    selectAt(editor, outsidePos(editor));

    const focus = vi.fn();
    const blur = vi.fn();
    editor.on('contentControlFocus', focus);
    editor.on('contentControlBlur', blur);

    selectAt(editor, a.inside); // null -> A
    selectAt(editor, b.inside); // A -> B (switch)
    selectAt(editor, outsidePos(editor)); // B -> null (blur)

    expect(focus).toHaveBeenCalledTimes(2);
    expect(focus.mock.calls[0][0]).toMatchObject({
      active: { id: a.id, scope: 'inline' },
      previous: null,
      source: 'keyboard',
    });
    expect(focus.mock.calls[0][0].activePath.map((r) => r.id)).toEqual([a.id]);
    expect(focus.mock.calls[1][0]).toMatchObject({ active: { id: b.id }, previous: { id: a.id }, source: 'keyboard' });
    expect(focus.mock.calls[1][0].activePath.map((r) => r.id)).toEqual([b.id]);
    expect(blur).toHaveBeenCalledTimes(1);
    expect(blur.mock.calls[0][0]).toMatchObject({ active: null, previous: { id: b.id }, source: 'keyboard' });
    expect(blur.mock.calls[0][0].activePath).toEqual([]);

    editor.destroy();
  });

  it('emits click with pointer source when the selection transaction carries uiEvent:click', async () => {
    const editor = makeEditor();
    await seedTwoInlineSdts(editor);
    const sdts = findInlineSdts(editor);
    selectAt(editor, outsidePos(editor));

    const click = vi.fn();
    const focus = vi.fn();
    editor.on('contentControlClick', click);
    editor.on('contentControlFocus', focus);

    selectAt(editor, sdts[0].inside, 'click');

    expect(click).toHaveBeenCalledTimes(1);
    expect(click.mock.calls[0][0]).toMatchObject({ target: { id: sdts[0].id }, source: 'pointer' });
    // The same click also enters the control, so focus fires with pointer source.
    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus.mock.calls[0][0]).toMatchObject({ active: { id: sdts[0].id }, source: 'pointer' });

    editor.destroy();
  });

  it('does not emit content-control events for a mutation that does not change the active control', async () => {
    const editor = makeEditor();
    await seedTwoInlineSdts(editor);
    const sdts = findInlineSdts(editor);
    selectAt(editor, sdts[0].inside); // enter A

    const focus = vi.fn();
    const blur = vi.fn();
    const click = vi.fn();
    editor.on('contentControlFocus', focus);
    editor.on('contentControlBlur', blur);
    editor.on('contentControlClick', click);

    // Mutate text content while selection stays inside the same control.
    editor.dispatch(editor.state.tr.insertText('X', sdts[0].inside));

    expect(focus).not.toHaveBeenCalled();
    expect(blur).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();

    editor.destroy();
  });

  it('reports pointer source for a non-click selection following a recent pointerDown', async () => {
    // initTestEditor builds the editor without deferDocumentLoad, i.e. the
    // default #init path PresentationEditor uses. This guards that the pointer
    // timestamp listener is wired there (not only on #registerEventListeners),
    // so source is 'pointer' even when the selection carries no uiEvent:'click'.
    const editor = makeEditor();
    await seedTwoInlineSdts(editor);
    const sdts = findInlineSdts(editor);
    selectAt(editor, outsidePos(editor)); // baseline

    const focus = vi.fn();
    editor.on('contentControlFocus', focus);

    // Simulate a pointer interaction, then a selection change with NO click meta.
    editor.emit('pointerDown', { editor, event: {} as PointerEvent });
    selectAt(editor, sdts[0].inside);

    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus.mock.calls[0][0]).toMatchObject({ active: { id: sdts[0].id }, source: 'pointer' });

    editor.destroy();
  });

  it('emits focus for a block-scope SDT (structuredContentBlock)', async () => {
    const editor = makeEditor();
    await Promise.resolve(editor.doc.insert({ value: 'Block clause body text' }));
    // kind: 'block' wraps the block containing the current selection.
    const r = await Promise.resolve(
      editor.doc.create.contentControl({
        kind: 'block',
        controlType: 'richText',
        tag: 'cc-block',
        alias: 'Block Control',
      }),
    );
    expect(r.success).toBe(true);

    let block = null;
    editor.state.doc.descendants((node, pos) => {
      if (!block && node.type.name === 'structuredContentBlock') block = { id: node.attrs.id, inside: pos + 2 };
      return true;
    });
    expect(block).toBeTruthy();
    if (!block) return;

    const focus = vi.fn();
    editor.on('contentControlFocus', focus);
    selectAt(editor, 1); // out
    selectAt(editor, block.inside); // into the block control

    const blockFocus = focus.mock.calls.map((c) => c[0]).find((p) => p.active?.id === block.id);
    expect(blockFocus).toBeTruthy();
    expect(blockFocus.active).toMatchObject({ id: block.id, scope: 'block', controlType: 'richText' });
    expect(blockFocus.activePath.map((r) => r.id)).toEqual([block.id]);

    editor.destroy();
  });

  it('exposes the full activePath (innermost first) for a nested inline-in-block control', () => {
    const editor = makeEditor();
    const schema = editor.state.schema;
    // Build a deterministic nested doc: block control > paragraph > [text, inline control, text].
    const inner = schema.nodes.structuredContent.create(
      { id: 'cc-inner', tag: 'cc-inner', controlType: 'text' },
      schema.text('nested'),
    );
    const para = schema.nodes.paragraph.create(null, [schema.text('a '), inner, schema.text(' b')]);
    const outer = schema.nodes.structuredContentBlock.create(
      { id: 'cc-outer', tag: 'cc-outer', controlType: 'richText' },
      para,
    );
    editor.dispatch(editor.state.tr.replaceWith(0, editor.state.doc.content.size, outer));

    let innerInside = null;
    editor.state.doc.descendants((node, pos) => {
      if (innerInside === null && node.type.name === 'structuredContent') innerInside = pos + 1;
      return true;
    });
    expect(innerInside).not.toBeNull();

    // Baseline inside the outer block but before the inline (active = outer only).
    selectAt(editor, 2);
    const focus = vi.fn();
    editor.on('contentControlFocus', focus);
    selectAt(editor, innerInside); // caret inside the nested inline control

    const ev = focus.mock.calls.map((c) => c[0]).find((p) => p.active?.id === 'cc-inner');
    expect(ev).toBeTruthy();
    if (!ev) return;
    // `active` is the deepest control; activePath is the full stack innermost-first.
    expect(ev.active.id).toBe('cc-inner');
    expect(ev.active.scope).toBe('inline');
    expect(ev.activePath.map((r) => r.id)).toEqual(['cc-inner', 'cc-outer']);
    expect(ev.activePath.map((r) => r.scope)).toEqual(['inline', 'block']);

    editor.destroy();
  });
});
