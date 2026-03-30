import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { compoundMutation } from './compound-mutation.js';
import { mutatePart } from './mutate-part.js';
import { createTestEditor, withPart, cleanupParts } from '../testing/test-helpers.js';
import { registerPartDescriptor } from '../registry/part-registry.js';
import { initRevision, getRevision } from '../../../document-api-adapters/plan-engine/revision-tracker.js';
import type { Editor } from '../../Editor.js';

function asEditor(mock: ReturnType<typeof createTestEditor>): Editor {
  return mock as unknown as Editor;
}

describe('compoundMutation', () => {
  let editor: ReturnType<typeof createTestEditor>;

  beforeEach(() => {
    editor = createTestEditor();
    initRevision(asEditor(editor));
  });

  afterEach(() => {
    cleanupParts();
  });

  it('persists changes when execute returns true', () => {
    withPart(editor, 'word/numbering.xml', { elements: [{ name: 'w:numbering' }] });

    const result = compoundMutation({
      editor: asEditor(editor),
      source: 'test',
      affectedParts: ['word/numbering.xml'],
      execute() {
        mutatePart({
          editor: asEditor(editor),
          partId: 'word/numbering.xml',
          operation: 'mutate',
          source: 'test',
          mutate({ part }) {
            (part as any).modified = true;
          },
        });
        return true;
      },
    });

    expect(result.success).toBe(true);
    expect((editor.converter.convertedXml['word/numbering.xml'] as any).modified).toBe(true);
  });

  it('rolls back all state when execute returns false', () => {
    withPart(editor, 'word/numbering.xml', { elements: [{ name: 'w:numbering' }] });
    const revisionBefore = getRevision(asEditor(editor));
    const modifiedBefore = editor.converter.documentModified;

    const result = compoundMutation({
      editor: asEditor(editor),
      source: 'test',
      affectedParts: ['word/numbering.xml'],
      execute() {
        mutatePart({
          editor: asEditor(editor),
          partId: 'word/numbering.xml',
          operation: 'mutate',
          source: 'test',
          mutate({ part }) {
            (part as any).modified = true;
          },
        });
        // Simulate PM dispatch failure
        return false;
      },
    });

    expect(result.success).toBe(false);
    // Part should be restored to original state
    expect((editor.converter.convertedXml['word/numbering.xml'] as any).modified).toBeUndefined();
    // Revision and documentModified should be restored
    expect(getRevision(asEditor(editor))).toBe(revisionBefore);
    expect(editor.converter.documentModified).toBe(modifiedBefore);
  });

  it('rolls back all state when execute throws', () => {
    withPart(editor, 'word/numbering.xml', { elements: [{ name: 'w:numbering' }] });
    const revisionBefore = getRevision(asEditor(editor));

    expect(() =>
      compoundMutation({
        editor: asEditor(editor),
        source: 'test',
        affectedParts: ['word/numbering.xml'],
        execute() {
          mutatePart({
            editor: asEditor(editor),
            partId: 'word/numbering.xml',
            operation: 'mutate',
            source: 'test',
            mutate({ part }) {
              (part as any).modified = true;
            },
          });
          throw new Error('PM dispatch exploded');
        },
      }),
    ).toThrow('PM dispatch exploded');

    // State should be fully rolled back
    expect((editor.converter.convertedXml['word/numbering.xml'] as any).modified).toBeUndefined();
    expect(getRevision(asEditor(editor))).toBe(revisionBefore);
  });

  it('restores converter metadata (numbering, translatedNumbering)', () => {
    withPart(editor, 'word/numbering.xml', { elements: [{ name: 'w:numbering' }] });
    (editor.converter as any).numbering = { abstracts: {}, definitions: {} };
    (editor.converter as any).translatedNumbering = { abstracts: {}, definitions: {} };

    const result = compoundMutation({
      editor: asEditor(editor),
      source: 'test',
      affectedParts: ['word/numbering.xml'],
      execute() {
        (editor.converter as any).numbering = { abstracts: { 1: 'new' }, definitions: {} };
        (editor.converter as any).translatedNumbering = { abstracts: { 1: 'translated' }, definitions: {} };
        return false;
      },
    });

    expect(result.success).toBe(false);
    expect((editor.converter as any).numbering).toEqual({ abstracts: {}, definitions: {} });
    expect((editor.converter as any).translatedNumbering).toEqual({ abstracts: {}, definitions: {} });
  });

  it('removes parts that did not exist before when rolling back', () => {
    // word/numbering.xml does NOT exist initially
    expect(editor.converter.convertedXml['word/numbering.xml']).toBeUndefined();

    registerPartDescriptor({
      id: 'word/numbering.xml',
      ensurePart: () => ({ elements: [{ name: 'w:numbering', elements: [] }] }),
    });

    const result = compoundMutation({
      editor: asEditor(editor),
      source: 'test',
      affectedParts: ['word/numbering.xml'],
      execute() {
        mutatePart({
          editor: asEditor(editor),
          partId: 'word/numbering.xml',
          operation: 'mutate',
          source: 'test',
          mutate({ part }) {
            (part as any).modified = true;
          },
        });
        return false;
      },
    });

    expect(result.success).toBe(false);
    // Part should be removed (didn't exist before)
    expect(editor.converter.convertedXml['word/numbering.xml']).toBeUndefined();
  });

  it('works with empty affectedParts', () => {
    const result = compoundMutation({
      editor: asEditor(editor),
      source: 'test',
      execute() {
        return true;
      },
    });

    expect(result.success).toBe(true);
  });
});
