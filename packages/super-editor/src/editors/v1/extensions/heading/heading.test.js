import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import { initTestEditor, loadTestDataForEditorTests } from '../../tests/helpers/helpers.js';

const keymaps = {};
vi.mock('prosemirror-keymap', async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    keymap: vi.fn((bindings) => {
      Object.assign(keymaps, bindings);
      return actual.keymap(bindings);
    }),
  };
});
describe('Heading Extension', () => {
  const filename = 'paragraph_spacing_missing.docx';
  let docx, media, mediaFiles, fonts, editor, tr;

  beforeAll(async () => {
    ({ docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(filename));
  });

  beforeEach(() => {
    ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));
    tr = editor.state.tr;
    vi.clearAllMocks();
  });

  describe('Commands', () => {
    describe('setHeading', () => {
      it('should set heading style for a valid level', () => {
        editor.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, 1, 16))); // Select "First paragraph"
        const result = editor.commands.setHeading({ level: 1 });

        expect(result).toBe(true);
        expect(editor.state.doc.content.content[0].attrs.paragraphProperties?.styleId).toBe('Heading1');
      });

      it('should not set heading style for an invalid level', () => {
        editor.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, 1, 16))); // Select "First paragraph"
        const result = editor.commands.setHeading({ level: 7 });

        expect(result).toBe(false);
        const styleId = editor.state.doc.content.content[0].attrs.paragraphProperties?.styleId ?? null;
        expect(styleId).toBeNull();
      });

      it('should set heading style for another valid level', () => {
        editor.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, 1, 16))); // Select "First paragraph"
        const result = editor.commands.setHeading({ level: 2 });

        expect(result).toBe(true);
        expect(editor.state.doc.content.content[0].attrs.paragraphProperties?.styleId).toBe('Heading2');
      });
    });

    describe('toggleHeading', () => {
      it('should apply heading with a cursor (empty) selection', () => {
        tr.setSelection(TextSelection.create(tr.doc, 1)); // Cursor selection
        const result = editor.commands.toggleHeading({ level: 1 });

        expect(result).toBe(true);
        expect(editor.state.doc.content.content[0].attrs.paragraphProperties?.styleId).toBe('Heading1');
      });

      it('should toggle heading on for a paragraph', () => {
        editor.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, 1, 16))); // Select "First paragraph"
        const result = editor.commands.toggleHeading({ level: 1 });

        expect(result).toBe(true);
        expect(editor.state.doc.content.content[0].attrs.paragraphProperties?.styleId).toBe('Heading1');
      });

      it('should toggle heading off for a heading', () => {
        // First, set it to a heading
        editor.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, 1, 16))); // Select "First paragraph"
        editor.commands.setHeading({ level: 1 });
        expect(editor.state.doc.content.content[0].attrs.paragraphProperties?.styleId).toBe('Heading1');

        // Then toggle it
        editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.tr.doc, 1, 16))); // Re-select
        const result = editor.commands.toggleHeading({ level: 1 });

        expect(result).toBe(true);
        const styleId = editor.state.doc.content.content[0].attrs.paragraphProperties?.styleId ?? null;
        expect(styleId).toBeNull();
      });

      it('should not toggle heading for an invalid level', () => {
        editor.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, 1, 16))); // Select "First paragraph"
        const result = editor.commands.toggleHeading({ level: 7 });

        expect(result).toBe(false);
        const styleId = editor.state.doc.content.content[0].attrs.paragraphProperties?.styleId ?? null;
        expect(styleId).toBeNull();
      });

      it('should switch to a different heading level when another heading is active', () => {
        // First, set it to a heading
        editor.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, 1, 16))); // Select "First paragraph"
        editor.commands.setHeading({ level: 1 });
        expect(editor.state.doc.content.content[0].attrs.paragraphProperties?.styleId).toBe('Heading1');

        // Then toggle to another heading level
        editor.view.dispatch(editor.view.state.tr.setSelection(TextSelection.create(editor.view.state.tr.doc, 1, 16))); // Re-select
        const result = editor.commands.toggleHeading({ level: 2 });

        expect(result).toBe(true);
        expect(editor.state.doc.content.content[0].attrs.paragraphProperties?.styleId).toBe('Heading2');
      });
    });
  });

  describe('Shortcuts', () => {
    it('should have default shortcuts for heading levels 1-6', () => {
      for (let i = 1; i <= 6; i++) {
        expect(keymaps).toHaveProperty(`Mod-Alt-${i}`);
      }
    });

    it('should toggle heading when shortcut is triggered', () => {
      editor.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, 1, 16))); // Select "First paragraph"
      keymaps['Mod-Alt-1']();
      expect(editor.state.doc.content.content[0].attrs.paragraphProperties?.styleId).toBe('Heading1');
    });
  });
});
