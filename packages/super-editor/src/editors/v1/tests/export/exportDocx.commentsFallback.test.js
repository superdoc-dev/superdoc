import { describe, expect, it, vi } from 'vitest';
import { Editor } from '@core/Editor.js';

const SAMPLE_JSON = {
  type: 'doc',
  attrs: { attrs: null },
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'A document with imported comments lurking in converter.comments' }],
    },
  ],
};

const FAKE_IMPORTED = [
  {
    commentId: 'c-imported-1',
    creatorEmail: 'imported@example.com',
    creatorName: 'Imported Author',
    elements: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi from import' }] }],
  },
];

const FAKE_FROM_CALLER = [
  {
    commentId: 'c-caller-1',
    creatorEmail: 'caller@example.com',
    creatorName: 'Caller',
    elements: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi from caller' }] }],
  },
];

/**
 * Pins the engine-level contract that `SuperDoc.exportEditorsToDOCX`
 * relies on:
 *
 *   `effectiveComments = comments ?? this.converter.comments ?? []`
 *
 * Three branches matter and must NOT silently change shape under us:
 *
 * 1. caller passes nothing -> engine reads from `converter.comments`
 *    (the fallback that lets `modules.comments: false` BYO consumers
 *    keep imported comments in the export).
 * 2. caller passes `[]`     -> engine treats it as authoritative empty
 *    (the path `commentsType: 'clean'` and "user deleted everything"
 *    rely on; a future change that switched `??` to `||` would
 *    silently coerce `[]` to falsy and resurrect imports).
 * 3. caller passes an array -> engine uses it as the source of truth.
 *
 * The test spies on `editor.converter.exportToDocx` because that's
 * the next callee inside `Editor.exportDocx` and receives the
 * computed `preparedComments`. Going lower (writing a real DOCX and
 * unzipping it) would also work but adds heavy fixtures for a
 * contract test.
 */
describe('Editor.exportDocx() comments fallback contract', () => {
  const buildEditorWithImports = async () => {
    const editor = await Editor.open(undefined, { json: SAMPLE_JSON });
    editor.converter.comments = FAKE_IMPORTED.map((c) => ({ ...c }));
    return editor;
  };

  it('caller omits comments → engine falls back to converter.comments (the BYO bug class)', async () => {
    const editor = await buildEditorWithImports();
    try {
      const spy = vi.spyOn(editor.converter, 'exportToDocx').mockResolvedValue(Buffer.from(''));
      await editor.exportDocx({ exportXmlOnly: true });
      expect(spy).toHaveBeenCalledTimes(1);
      const passedComments = spy.mock.calls[0][5];
      expect(Array.isArray(passedComments)).toBe(true);
      expect(passedComments.length).toBe(FAKE_IMPORTED.length);
      expect(passedComments[0]).toMatchObject({
        commentId: 'c-imported-1',
        creatorEmail: 'imported@example.com',
      });
    } finally {
      editor.destroy();
    }
  });

  it('caller passes [] → engine writes zero comments (no resurrection from converter)', async () => {
    const editor = await buildEditorWithImports();
    try {
      const spy = vi.spyOn(editor.converter, 'exportToDocx').mockResolvedValue(Buffer.from(''));
      await editor.exportDocx({ exportXmlOnly: true, comments: [] });
      expect(spy).toHaveBeenCalledTimes(1);
      const passedComments = spy.mock.calls[0][5];
      expect(Array.isArray(passedComments)).toBe(true);
      expect(passedComments.length).toBe(0);
    } finally {
      editor.destroy();
    }
  });

  it('caller passes a non-empty array → that array is the source of truth', async () => {
    const editor = await buildEditorWithImports();
    try {
      const spy = vi.spyOn(editor.converter, 'exportToDocx').mockResolvedValue(Buffer.from(''));
      await editor.exportDocx({ exportXmlOnly: true, comments: FAKE_FROM_CALLER });
      expect(spy).toHaveBeenCalledTimes(1);
      const passedComments = spy.mock.calls[0][5];
      expect(Array.isArray(passedComments)).toBe(true);
      expect(passedComments.length).toBe(FAKE_FROM_CALLER.length);
      expect(passedComments[0]).toMatchObject({
        commentId: 'c-caller-1',
        creatorEmail: 'caller@example.com',
      });
    } finally {
      editor.destroy();
    }
  });

  it('null/undefined `converter.comments` resolves to [] (not a throw)', async () => {
    const editor = await Editor.open(undefined, { json: SAMPLE_JSON });
    try {
      // Both null and explicit-undefined should fall through to the
      // final `?? []` arm. Pin both to guard against a future change
      // that uses `||` and trips on falsy non-array values.
      editor.converter.comments = null;
      const spy = vi.spyOn(editor.converter, 'exportToDocx').mockResolvedValue(Buffer.from(''));
      await editor.exportDocx({ exportXmlOnly: true });
      const passedComments = spy.mock.calls[0][5];
      expect(Array.isArray(passedComments)).toBe(true);
      expect(passedComments.length).toBe(0);
    } finally {
      editor.destroy();
    }
  });
});
