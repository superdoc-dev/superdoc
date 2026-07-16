/* @vitest-environment jsdom */
/**
 * Headless editors skip linked-style decoration generation (SD-3552 perf fix):
 * decorations are a view concern, and generateDecorations walks the whole
 * document on every transaction. The plugin must keep `styles` exposed (for
 * setStyleById / getStyles) while pinning `decorations` to the empty set,
 * both at init and across doc-changing transactions.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { DecorationSet } from 'prosemirror-view';
import { loadTestDataForEditorTests, initTestEditor } from '@tests/helpers/helpers.js';
import { LinkedStylesPluginKey } from './plugin.js';

const FIXTURE = 'docxbench-format-paragraph-001.docx';

describe('linked-styles plugin: headless skip', () => {
  let docData;
  let editor = null;

  beforeAll(async () => {
    docData = await loadTestDataForEditorTests(FIXTURE);
  });

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it('headless: decorations stay empty across transactions, styles remain exposed', () => {
    ({ editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      isHeadless: true,
      useImmediateSetTimeout: false,
    }));

    const initial = LinkedStylesPluginKey.getState(editor.state);
    expect(initial.decorations).toBe(DecorationSet.empty);
    expect(Array.isArray(initial.styles)).toBe(true);

    // A doc-changing transaction must NOT regenerate decorations headlessly.
    const next = editor.state.apply(editor.state.tr.insertText('x', 1));
    const after = LinkedStylesPluginKey.getState(next);
    expect(after.decorations).toBe(DecorationSet.empty);
    expect(Array.isArray(after.styles)).toBe(true);
  });

  it('mounted (non-headless): plugin state present and transactions apply cleanly', () => {
    ({ editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
    }));

    const state = LinkedStylesPluginKey.getState(editor.state);
    expect(state).toBeTruthy();
    expect(Array.isArray(state.styles)).toBe(true);
    // Mounted editors keep running generateDecorations without throwing.
    editor.view.dispatch(editor.state.tr.insertText('x', 1));
    expect(LinkedStylesPluginKey.getState(editor.state)).toBeTruthy();
  });
});
