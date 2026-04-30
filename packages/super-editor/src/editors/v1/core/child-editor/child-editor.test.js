import { afterEach, describe, expect, it } from 'vitest';
import { createLinkedChildEditor } from './child-editor.js';
import { initTestEditor } from '../../tests/helpers/helpers.js';

const createdEditors = [];

function trackEditor(editor) {
  if (editor) createdEditors.push(editor);
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

describe('createLinkedChildEditor', () => {
  it('marks linked child editors with isChildEditor so they skip document-open telemetry', () => {
    const parent = trackEditor(
      initTestEditor({
        mode: 'text',
        content: '<p>parent</p>',
        telemetry: { enabled: true },
      }).editor,
    );

    const child = trackEditor(createLinkedChildEditor(parent, { headless: true }));

    expect(child.options.isChildEditor).toBe(true);
    expect(child.options.parentEditor).toBe(parent);
  });

  it('returns null when called on an editor that is already a child editor', () => {
    const parent = trackEditor(
      initTestEditor({
        mode: 'text',
        content: '<p>parent</p>',
      }).editor,
    );
    const child = trackEditor(createLinkedChildEditor(parent, { headless: true }));

    const grandchild = createLinkedChildEditor(child, { headless: true });
    expect(grandchild).toBeNull();
  });
});
