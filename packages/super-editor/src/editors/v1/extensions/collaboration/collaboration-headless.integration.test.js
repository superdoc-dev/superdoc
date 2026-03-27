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
  let editors;

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const waitFor = async (predicate, { timeoutMs = 1000, intervalMs = 10 } = {}) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (predicate()) return;
      await wait(intervalMs);
    }
    throw new Error(`Timed out after ${timeoutMs}ms waiting for condition`);
  };

  const createHeadlessEditor = (overrides = {}) => {
    const nextEditor = new Editor({
      isHeadless: true,
      mode: 'docx',
      documentId: 'test-headless',
      extensions: getStarterExtensions(),
      ydoc,
      content: [],
      mediaFiles: {},
      fonts: {},
      ...overrides,
    });
    editors.push(nextEditor);
    return nextEditor;
  };

  const waitForEditorText = async (targetEditor, text, timeoutMs = 1000) => {
    await waitFor(() => targetEditor.state.doc.textContent.includes(text), { timeoutMs });
  };

  beforeEach(() => {
    ydoc = new YDoc({ gc: false });
    editors = [];
  });

  afterEach(() => {
    for (const currentEditor of editors.reverse()) {
      currentEditor.destroy();
    }
    editors = [];
    if (ydoc) {
      ydoc.destroy();
      ydoc = null;
    }
  });

  it('initializes Y.js binding in headless mode', () => {
    const editor = createHeadlessEditor({ documentId: 'test-headless-binding' });

    // Get the sync plugin state
    const syncState = ySyncPluginKey.getState(editor.state);

    // Verify binding was initialized
    expect(syncState).toBeDefined();
    expect(syncState.binding).toBeDefined();
    expect(syncState.binding.prosemirrorView).toBeDefined();
  });

  it('does not create infinite sync loop when making edits', async () => {
    const editor = createHeadlessEditor({ documentId: 'test-no-loop' });

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
    const editor = createHeadlessEditor({ documentId: 'test-headless-edits' });

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
    const editor = createHeadlessEditor({
      documentId: 'test-local-ydoc',
      // No collaborationProvider - user manages it externally
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

  it('rehydrates a headless editor from pre-populated Y.js content', async () => {
    const seedEditor = createHeadlessEditor({ documentId: 'test-rehydrate-seed' });
    seedEditor.commands.insertContent({
      type: 'paragraph',
      content: [{ type: 'text', text: 'Seeded collaborative content' }],
    });

    const reopenedEditor = createHeadlessEditor({ documentId: 'test-rehydrate-open' });
    await waitForEditorText(reopenedEditor, 'Seeded collaborative content');

    expect(reopenedEditor.state.doc.textContent).toContain('Seeded collaborative content');
  });

  it('preserves existing collaborative content on first local edit after headless reopen', async () => {
    const seedEditor = createHeadlessEditor({ documentId: 'test-preserve-seed' });
    seedEditor.commands.insertContent({
      type: 'paragraph',
      content: [{ type: 'text', text: 'Existing shared text' }],
    });

    const reopenedEditor = createHeadlessEditor({ documentId: 'test-preserve-reopen' });
    await waitForEditorText(reopenedEditor, 'Existing shared text');

    reopenedEditor.commands.insertContent({
      type: 'paragraph',
      content: [{ type: 'text', text: 'First local edit' }],
    });

    const observerEditor = createHeadlessEditor({ documentId: 'test-preserve-observer' });
    await waitForEditorText(observerEditor, 'Existing shared text');
    await waitForEditorText(observerEditor, 'First local edit');

    expect(observerEditor.state.doc.textContent).toContain('Existing shared text');
    expect(observerEditor.state.doc.textContent).toContain('First local edit');
  });

  it('syncs edits bidirectionally between two active headless editors', async () => {
    const editorA = createHeadlessEditor({ documentId: 'test-bidirectional-a' });
    const editorB = createHeadlessEditor({ documentId: 'test-bidirectional-b' });

    editorA.commands.insertContent({
      type: 'paragraph',
      content: [{ type: 'text', text: 'Edit from A' }],
    });
    await waitForEditorText(editorB, 'Edit from A');

    editorB.commands.insertContent({
      type: 'paragraph',
      content: [{ type: 'text', text: 'Edit from B' }],
    });
    await waitForEditorText(editorA, 'Edit from B');

    expect(editorA.state.doc.textContent).toContain('Edit from A');
    expect(editorA.state.doc.textContent).toContain('Edit from B');
    expect(editorB.state.doc.textContent).toContain('Edit from A');
    expect(editorB.state.doc.textContent).toContain('Edit from B');
  });

  it('syncs immediate edits dispatched right after construction', async () => {
    let createEventFired = false;
    const immediateEditor = createHeadlessEditor({
      documentId: 'test-immediate-edit-source',
      onCreate: () => {
        createEventFired = true;
      },
    });

    // The create event is async in headless mode; this edit happens in the same tick.
    expect(createEventFired).toBe(false);
    immediateEditor.commands.insertContent({
      type: 'paragraph',
      content: [{ type: 'text', text: 'Immediate headless edit' }],
    });

    const observerEditor = createHeadlessEditor({ documentId: 'test-immediate-edit-observer' });
    await waitForEditorText(observerEditor, 'Immediate headless edit');
    expect(observerEditor.state.doc.textContent).toContain('Immediate headless edit');
  });

  it('does not emit Y-origin bounce transactions for a local headless edit', async () => {
    const editor = createHeadlessEditor({ documentId: 'test-no-y-bounce' });
    let yOriginTransactionCount = 0;

    editor.on('transaction', ({ transaction }) => {
      if (transaction.getMeta(ySyncPluginKey)?.isChangeOrigin) {
        yOriginTransactionCount += 1;
      }
    });

    editor.commands.insertContent({
      type: 'paragraph',
      content: [{ type: 'text', text: 'No bounce expected' }],
    });

    await wait(50);
    expect(yOriginTransactionCount).toBe(0);
  });
});
