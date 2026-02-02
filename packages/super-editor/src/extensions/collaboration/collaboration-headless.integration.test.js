/**
 * Headless Y.js Collaboration Integration Test
 *
 * Tests that a headless Editor properly initializes Y.js binding.
 * The actual sync behavior depends on y-prosemirror internals and is better
 * tested end-to-end with a real collaboration server.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Doc as YDoc } from 'yjs';
import { Editor } from '@core/Editor.js';
import { getStarterExtensions } from '@extensions/index.js';
import { ySyncPluginKey } from 'y-prosemirror';

describe('Headless Y.js Collaboration Integration', () => {
  let ydoc;
  let editor;

  beforeEach(() => {
    ydoc = new YDoc({ gc: false });
  });

  afterEach(() => {
    if (editor) {
      editor.destroy();
      editor = null;
    }
    if (ydoc) {
      ydoc.destroy();
      ydoc = null;
    }
  });

  it('initializes Y.js binding in headless mode', () => {
    editor = new Editor({
      isHeadless: true,
      mode: 'docx',
      documentId: 'test-headless-binding',
      extensions: getStarterExtensions(),
      ydoc,
      content: [],
      mediaFiles: {},
      fonts: {},
    });

    // Get the sync plugin state
    const syncState = ySyncPluginKey.getState(editor.state);

    // Verify binding was initialized
    expect(syncState).toBeDefined();
    expect(syncState.binding).toBeDefined();
    expect(syncState.binding.prosemirrorView).toBeDefined();
  });

  it('does not create infinite sync loop when making edits', async () => {
    editor = new Editor({
      isHeadless: true,
      mode: 'docx',
      documentId: 'test-no-loop',
      extensions: getStarterExtensions(),
      ydoc,
      content: [],
      mediaFiles: {},
      fonts: {},
    });

    let transactionCount = 0;
    const originalDispatch = editor.dispatch.bind(editor);
    editor.dispatch = (tr) => {
      transactionCount++;
      return originalDispatch(tr);
    };

    // Make an edit
    editor.commands.insertContent({
      type: 'paragraph',
      content: [{ type: 'text', text: 'Test' }],
    });

    // Wait for any potential sync loops
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Should have very few transactions (1 for insert, maybe 1-2 for sync)
    // If there's a loop, this would be hundreds or thousands
    expect(transactionCount).toBeLessThan(10);
  });

  it('allows making edits in headless mode with Y.js', () => {
    editor = new Editor({
      isHeadless: true,
      mode: 'docx',
      documentId: 'test-headless-edits',
      extensions: getStarterExtensions(),
      ydoc,
      content: [],
      mediaFiles: {},
      fonts: {},
    });

    const initialContent = editor.state.doc.textContent;

    // Make edits - this should not throw
    editor.commands.insertContent({
      type: 'paragraph',
      content: [{ type: 'text', text: 'Hello from headless!' }],
    });

    // Verify edit was applied to editor
    expect(editor.state.doc.textContent).toContain('Hello from headless');
    expect(editor.state.doc.textContent).not.toBe(initialContent);
  });

  it('works without collaborationProvider (local-only Y.js)', () => {
    // This simulates the customer's use case where they manage their own provider
    editor = new Editor({
      isHeadless: true,
      mode: 'docx',
      documentId: 'test-local-ydoc',
      extensions: getStarterExtensions(),
      ydoc, // Y.js doc without provider
      // No collaborationProvider - user manages it externally
      content: [],
      mediaFiles: {},
      fonts: {},
    });

    const syncState = ySyncPluginKey.getState(editor.state);
    expect(syncState.binding).toBeDefined();
    expect(syncState.binding.prosemirrorView).toBeDefined();

    // Should still be able to make edits
    editor.commands.insertContent({
      type: 'paragraph',
      content: [{ type: 'text', text: 'Local Y.js test' }],
    });

    expect(editor.state.doc.textContent).toContain('Local Y.js test');
  });
});
