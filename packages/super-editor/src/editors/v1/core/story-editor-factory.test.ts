import { afterEach, describe, expect, it } from 'vitest';
import type { Editor } from './Editor.js';
import { createStoryEditor } from './story-editor-factory.ts';
import { initTestEditor } from '../tests/helpers/helpers.js';

const createdEditors: Editor[] = [];

function trackEditor(editor: Editor): Editor {
  createdEditors.push(editor);
  return editor;
}

afterEach(() => {
  while (createdEditors.length > 0) {
    const editor = createdEditors.pop();
    try {
      editor?.destroy?.();
    } catch {
      // best-effort cleanup for test editors
    }
  }
});

describe('createStoryEditor', () => {
  it('inherits tracked changes configuration from the parent editor', () => {
    const parent = trackEditor(
      initTestEditor({
        mode: 'text',
        content: '<p>Hello world</p>',
        trackedChanges: {
          visible: true,
          mode: 'review',
          enabled: true,
          replacements: 'independent',
        },
      }).editor as Editor,
    );

    const child = trackEditor(
      createStoryEditor(
        parent,
        {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Header text' }] }],
        },
        {
          documentId: 'hf:part:rId9',
          isHeaderOrFooter: true,
          headless: true,
        },
      ),
    );

    expect(child.options.trackedChanges).toEqual({
      visible: true,
      mode: 'review',
      enabled: true,
      replacements: 'independent',
    });

    child.options.trackedChanges!.replacements = 'paired';
    expect(parent.options.trackedChanges?.replacements).toBe('independent');
  });

  it('inherits presentation editor references from the parent editor', () => {
    const parent = trackEditor(
      initTestEditor({
        mode: 'text',
        content: '<p>Hello world</p>',
      }).editor as Editor,
    );
    const presentationEditor = { element: document.createElement('div') } as unknown as Editor['presentationEditor'];
    parent.presentationEditor = presentationEditor;
    (parent as Editor & { _presentationEditor?: typeof presentationEditor })._presentationEditor = presentationEditor;

    const child = trackEditor(
      createStoryEditor(
        parent,
        {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Header text' }] }],
        },
        {
          documentId: 'hf:part:rId9',
          isHeaderOrFooter: true,
          headless: true,
        },
      ),
    );

    expect(child.presentationEditor).toBe(presentationEditor);
    expect((child as Editor & { _presentationEditor?: unknown })._presentationEditor).toBe(presentationEditor);
  });

  it('disables telemetry on story editors regardless of isHeaderOrFooter', () => {
    const parent = trackEditor(
      initTestEditor({
        mode: 'text',
        content: '<p>parent</p>',
      }).editor as Editor,
    );

    const headerFooter = trackEditor(
      createStoryEditor(
        parent,
        { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'h/f' }] }] },
        { documentId: 'hf:part:rId1', isHeaderOrFooter: true, headless: true },
      ),
    );
    const note = trackEditor(
      createStoryEditor(
        parent,
        { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'footnote' }] }] },
        { documentId: 'footnote:1', isHeaderOrFooter: false, headless: true },
      ),
    );

    expect(headerFooter.options.telemetry).toEqual({ enabled: false });
    expect(note.options.telemetry).toEqual({ enabled: false });
  });

  it('keeps telemetry disabled even when a caller passes telemetry overrides', () => {
    const parent = trackEditor(
      initTestEditor({
        mode: 'text',
        content: '<p>parent</p>',
      }).editor as Editor,
    );

    const child = trackEditor(
      createStoryEditor(
        parent,
        { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'h/f' }] }] },
        {
          documentId: 'hf:part:rId1',
          isHeaderOrFooter: true,
          headless: true,
          telemetry: { enabled: true, endpoint: 'https://ingest.example/v1/collect' },
        } as Parameters<typeof createStoryEditor>[2],
      ),
    );

    expect(child.options.telemetry).toEqual({ enabled: false });
  });
});
