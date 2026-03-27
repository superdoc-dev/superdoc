import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { createDocxTestEditor } from '../../helpers/editor-test-utils.js';

describe('insertTrackedChange whitespace edge cases (docx)', () => {
  it('removes trailing space when search query includes trailing whitespace', () => {
    const editor = createDocxTestEditor();

    try {
      const { doc, paragraph, run } = editor.schema.nodes;
      const testDoc = doc.create(null, [
        paragraph.create(null, [run.create(null, [editor.schema.text('Dallas, Texas ')])]),
        paragraph.create(null, []),
        paragraph.create(null, [run.create(null, [editor.schema.text('Re: WR Investments')])]),
      ]);

      const baseState = EditorState.create({
        schema: editor.schema,
        doc: testDoc,
        plugins: editor.state.plugins,
      });
      editor.setState(baseState);

      const matches = editor.commands.search('Dallas, Texas ');
      expect(matches.length).toBeGreaterThan(0);

      const { from, to } = matches[0];
      const inserted = editor.commands.insertTrackedChange({
        from,
        to,
        text: 'Dallas, Texas',
        user: { name: 'Test', email: 'test@example.com' },
      });

      expect(inserted).toBe(true);
    } finally {
      editor.destroy();
    }
  });
});
